// Per-endpoint concurrency self-throttle (#007).
//
// Background: every provider/endpoint has its own concurrent-call cap. The CLI
// used to fire unthrottled, which trips 429 / 403 on the over-cap calls and
// pollutes `generations.jsonl` with hard-failure rows. The OR 403 wording even
// reads as a $ balance issue ("Key limit exceeded (total limit)") which sent
// agents on wrong fixes (analog-horror-fridge: $271 credits remaining, 9/10
// queued 403'd → agent assumed out-of-credits).
//
// Strategy: an in-process semaphore keyed by `<provider>:<model>`. Every
// connector call wraps the network submit in `withConcurrency(...)`. When the
// cap is full, the caller awaits a release slot — no 429 round-trip, no
// pollution.
//
// Compose with the #005 retry helper as: retry-OUTSIDE-semaphore. The retry
// helper wraps `withConcurrency` so that on a transient blip the retry can
// re-acquire a slot freshly (instead of holding the same slot through the
// entire backoff sleep, which would block other callers from progressing).
//
// Scope: in-process only. The queue daemon's worker count already gates
// cross-process — a follow-up could share state via a file lock, but is not
// needed for the current single-process / single-daemon usage.
//
// Source: notes/issues/007.

/** Per-endpoint concurrency cap registry. Keyed by `<provider>:<model>`. */
const CAPS: Record<string, number> = {
  // ── ElevenLabs ──────────────────────────────────────────────────────────
  // Voice TTS: free/starter cap is 3 concurrent (choose-your-guide hit this
  // with 9 parallel — 6 hard-failed 429 `concurrent_limit_exceeded`).
  "elevenlabs:tts": 3,
  // Music: 2 concurrent per subscription (tokyo-y2k 3 parallel → 1 failed
  // 429). Documented in MODELS.md failure-mode table.
  "elevenlabs:music_v1": 2,
  // Voice clone (Instant Voice Cloning): cap = 2. /v1/voices/add kicks off a
  // server-side fingerprint job that's heavier than a TTS call; 3+ in
  // parallel has been observed to 429 occasionally (issue #030). Shared with
  // /v1/audio-isolation since the clone flow chains them.
  "elevenlabs:voice-clone": 2,

  // ── OpenRouter image models ─────────────────────────────────────────────
  // gpt-5.4-image-2: NOT hard-capped to 1 (per MEMORY
  // feedback_openrouter_parallel_gpt_image, validated 2026-05-29 with 2×
  // parallel probes — both succeeded). Cap at 2 — appstore-takeaminute hit
  // 73/73 403 on uncapped fan-out; 2-in-flight stays under the OR per-key
  // limit while leaving room for the retry-outside-semaphore re-acquire.
  "openrouter:openai/gpt-5.4-image-2": 2,
  // gemini-3-pro-image-preview: nano-banana lineage tolerates ≥4 in practice;
  // keep a conservative 2 to match the gpt-image neighbour and avoid the OR
  // "total limit" 403 class on shared-key accounts.
  "openrouter:google/gemini-3-pro-image-preview": 2,

  // ── OpenRouter video models ─────────────────────────────────────────────
  // seedance-2.0: 1 concurrent. Multi-block extend pipelines are inherently
  // sequential (anchor from last frame of N to N+1), and seedance's privacy
  // filter + queue depth occasionally backs up under 2 in-flight (per issue
  // 026 follow-up).
  "openrouter:bytedance/seedance-2.0": 1,
  // kling-v3.0-pro: 2 concurrent. Recent batches (analog-horror-fridge,
  // tokyo-y2k post-fix) confirm 2 parallel kling submits clear with no 403;
  // 3+ has tripped OR's per-key cap on a couple of accounts. Conservative 2.
  "openrouter:kwaivgi/kling-v3.0-pro": 2,
};

/**
 * Per-connector default cap (#522) — the max-in-flight budget for a connector
 * when the exact `<provider>:<model>` endpoint isn't in `CAPS`. Declared here
 * (the one place the sourced concurrency facts already live) so the farm's
 * shared dispatch semaphore and the per-call self-throttle read ONE registry.
 * Each is seeded from the documented facts with a `source` citation:
 *   • openrouter — MEMORY feedback_openrouter_parallel_gpt_image: gpt-image is
 *     NOT hard-capped to 1 (2× parallel validated 2026-05-29). Keep the media
 *     default at 2 to stay under OR's per-key burst-cap ("total limit" 403).
 *   • fal        — third-party video connector (#402); conservative 2.
 *   • elevenlabs — free/starter tier caps concurrency at 3 (voice TTS); use it
 *     as the connector floor.
 * source: cli/lib/providers/concurrency.ts CAPS comments + MEMORY
 * feedback_openrouter_parallel_gpt_image / feedback_seedance_i2v_parallel.
 */
export const CONNECTOR_DEFAULT_CAPS: Record<string, number> = {
  openrouter: 2,
  fal: 2,
  elevenlabs: 3,
};

/**
 * Default fallback cap when an endpoint isn't in `CAPS` and the connector has
 * no CONNECTOR_DEFAULT_CAPS entry. Two concurrent is the safe-everywhere
 * default — most OR endpoints tolerate ≥4, but a stale cap on a new model is
 * the failure mode this module exists to prevent. Unknown = this conservative
 * default, logged once (see `logUnknownCapOnce`).
 */
export const DEFAULT_CONCURRENCY_CAP = 2;

/**
 * Default cap for OpenRouter LLM chat-completions. Wider than the media
 * default because text endpoints (gemini-2.5-flash, claude-haiku, …) tolerate
 * much higher fan-out — researcher / scenarist passes run 4-8 in parallel
 * routinely without hitting OR's per-key limit.
 */
export const DEFAULT_LLM_CONCURRENCY_CAP = 4;

type Semaphore = {
  /** The hard budget (never exceeded). */
  cap: number;
  /**
   * The EFFECTIVE budget in force right now (#522 adaptive rule). Starts at
   * `cap`; a provider 429/rate-limit temporarily halves it, and it recovers
   * one slot per successful release back up to `cap`. `active` is gated on
   * `effectiveCap`, never `cap`.
   */
  effectiveCap: number;
  active: number;
  waiters: Array<() => void>;
  /** Cumulative time (ms) callers spent BLOCKED waiting for a slot — the #518 queue-wait rollup. */
  totalWaitMs: number;
  /** How many acquisitions had to wait (denominator for an average). */
  waitedCount: number;
};

const SEMAPHORES = new Map<string, Semaphore>();

function key(provider: string, model: string): string {
  return `${provider}:${model}`;
}

/**
 * Reset the in-process semaphore state. Tests use this to start from a clean
 * slate; production code never calls it.
 */
export function _resetConcurrency(): void {
  SEMAPHORES.clear();
  _loggedUnknown.clear();
}

/** Capability hint to pick a default cap when the model isn't in the registry. */
export type EndpointKind = "image" | "video" | "voice" | "music" | "sfx" | "text";

/** Endpoints we've already logged an unknown-cap fallback for (once each). */
const _loggedUnknown = new Set<string>();

/**
 * Look up the configured cap for a `<provider>:<model>` endpoint. Resolution
 * order (#522): the exact endpoint in `CAPS` → the text-kind wide default →
 * the connector default (CONNECTOR_DEFAULT_CAPS) → the safe-everywhere floor.
 * An endpoint that resolves to a bare fallback (no CAPS row, no connector
 * default) is logged ONCE to stderr so a stale cap on a new model surfaces
 * without spamming — the failure mode this module exists to prevent.
 */
export function capFor(provider: string, model: string, kind?: EndpointKind): number {
  const k = key(provider, model);
  if (k in CAPS) return CAPS[k]!;
  if (kind === "text") return DEFAULT_LLM_CONCURRENCY_CAP;
  if (provider in CONNECTOR_DEFAULT_CAPS) return CONNECTOR_DEFAULT_CAPS[provider]!;
  if (!_loggedUnknown.has(k)) {
    _loggedUnknown.add(k);
    console.warn(
      `[concurrency] no in-flight budget declared for "${k}" — using the conservative default (${DEFAULT_CONCURRENCY_CAP}). Add a CAPS entry in cli/lib/providers/concurrency.ts if this endpoint tolerates more.`,
    );
  }
  return DEFAULT_CONCURRENCY_CAP;
}

function getSemaphore(provider: string, model: string, kind?: EndpointKind): Semaphore {
  const k = key(provider, model);
  let sem = SEMAPHORES.get(k);
  if (!sem) {
    const cap = capFor(provider, model, kind);
    sem = { cap, effectiveCap: cap, active: 0, waiters: [], totalWaitMs: 0, waitedCount: 0 };
    SEMAPHORES.set(k, sem);
  }
  return sem;
}

async function acquire(sem: Semaphore): Promise<void> {
  if (sem.active < sem.effectiveCap) {
    sem.active += 1;
    return;
  }
  await new Promise<void>((resolve) => sem.waiters.push(resolve));
  // resolver bumps `active` for us so the waiter wakes up holding a slot.
}

function release(sem: Semaphore): void {
  // Adaptive recovery (#522): a successful release nudges the effective cap
  // back one slot toward the hard cap (a rate-limit halved it earlier).
  if (sem.effectiveCap < sem.cap) sem.effectiveCap = Math.min(sem.cap, sem.effectiveCap + 1);
  // Only wake a waiter if the effective cap still has room — a mid-run halving
  // can leave `active` at/above `effectiveCap`, in which case a released slot
  // simply retires and the waiter waits for the next one.
  if (sem.active <= sem.effectiveCap) {
    const next = sem.waiters.shift();
    if (next) {
      // Hand the slot directly to the next waiter — `active` stays the same.
      next();
      return;
    }
  }
  sem.active = Math.max(0, sem.active - 1);
}

/**
 * Adaptive backoff (#522): a provider 429 / rate-limit halves the endpoint's
 * EFFECTIVE in-flight budget (floor 1). It recovers one slot per successful
 * release, so a single 429 briefly narrows the endpoint then it climbs back —
 * a simple, documented rule that turns a rate-limit into a self-healing
 * queueing concern instead of a failure. Idempotent-safe: repeated calls keep
 * halving down to the floor. The runner calls this on a `transient`/429-class
 * node failure (classifyError → provider-transient).
 */
export function noteRateLimit(provider: string, model: string, kind?: EndpointKind): void {
  const sem = getSemaphore(provider, model, kind);
  sem.effectiveCap = Math.max(1, Math.floor(sem.effectiveCap / 2));
}

/**
 * Run `fn` while holding a concurrency slot for the given endpoint. Awaits a
 * slot when the cap is full; never throws on its own (errors from `fn` pass
 * through). Always releases on both success and failure paths.
 *
 * Compose with `retryTransient` as retry-OUTSIDE-semaphore so a backoff sleep
 * doesn't pin a slot for other callers:
 *
 *   await retryTransient(async () => {
 *     return withConcurrency(provider, model, kind, async () => doNetworkCall());
 *   });
 */
export async function withConcurrency<T>(
  provider: string,
  model: string,
  kind: EndpointKind,
  fn: () => Promise<T>,
): Promise<T> {
  const sem = getSemaphore(provider, model, kind);
  // Resolver pattern: when a waiter is woken we want it to wake up already
  // "holding" the slot — otherwise two waiters could race and both increment
  // active past the effective cap. Gate on effectiveCap (#522 adaptive rule).
  if (sem.active < sem.effectiveCap) {
    sem.active += 1;
  } else {
    const t0 = Date.now();
    sem.waitedCount += 1;
    await new Promise<void>((resolve) => sem.waiters.push(resolve));
    sem.totalWaitMs += Date.now() - t0;
  }
  try {
    return await fn();
  } finally {
    release(sem);
  }
}

void acquire; // keep acquire reachable for future symmetric callers / tests.

/** One endpoint's live in-flight / queue state, for `farm status` + tests. */
export interface ConcurrencySnapshot {
  endpoint: string;
  provider: string;
  model: string;
  /** The hard budget. */
  cap: number;
  /** The budget in force now (< cap after a 429 halving). */
  effectiveCap: number;
  /** Calls in flight. */
  active: number;
  /** Calls parked waiting for a slot. */
  queued: number;
  /** Cumulative queue-wait across this endpoint (ms) — the #518 rollup input. */
  totalWaitMs: number;
  waitedCount: number;
}

/**
 * Returns a snapshot of the live semaphore state. `farm status` groups this
 * per provider (in-flight / queued); the #518 report rolls up `totalWaitMs`.
 * Read-only.
 */
export function snapshot(): ConcurrencySnapshot[] {
  return Array.from(SEMAPHORES.entries()).map(([endpoint, sem]) => {
    const i = endpoint.indexOf(":");
    return {
      endpoint,
      provider: i > 0 ? endpoint.slice(0, i) : endpoint,
      model: i > 0 ? endpoint.slice(i + 1) : "",
      cap: sem.cap,
      effectiveCap: sem.effectiveCap,
      active: sem.active,
      queued: sem.waiters.length,
      totalWaitMs: sem.totalWaitMs,
      waitedCount: sem.waitedCount,
    };
  });
}

/** Per-provider rollup of the endpoint snapshots (for `farm status`). */
export function providerConcurrency(): Array<{
  provider: string;
  inFlight: number;
  queued: number;
  totalWaitMs: number;
  endpoints: ConcurrencySnapshot[];
}> {
  const byProvider = new Map<string, ConcurrencySnapshot[]>();
  for (const s of snapshot()) {
    byProvider.set(s.provider, [...(byProvider.get(s.provider) ?? []), s]);
  }
  return [...byProvider.entries()]
    .map(([provider, endpoints]) => ({
      provider,
      inFlight: endpoints.reduce((a, e) => a + e.active, 0),
      queued: endpoints.reduce((a, e) => a + e.queued, 0),
      totalWaitMs: endpoints.reduce((a, e) => a + e.totalWaitMs, 0),
      endpoints: endpoints.sort((a, b) => a.endpoint.localeCompare(b.endpoint)),
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}
