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
 * Default fallback cap when an endpoint isn't in `CAPS`. Two concurrent is the
 * safe-everywhere default — most OR endpoints tolerate ≥4, but a stale cap on
 * a new model is the failure mode this module exists to prevent.
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
  cap: number;
  active: number;
  waiters: Array<() => void>;
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
}

/** Capability hint to pick a default cap when the model isn't in the registry. */
export type EndpointKind = "image" | "video" | "voice" | "music" | "sfx" | "text";

/**
 * Look up the configured cap for a `<provider>:<model>` endpoint. Falls back
 * to the kind-default when the exact endpoint isn't registered. Exposed for
 * tests + the `ralphy provider` introspection surface.
 */
export function capFor(provider: string, model: string, kind?: EndpointKind): number {
  const k = key(provider, model);
  if (k in CAPS) return CAPS[k]!;
  if (kind === "text") return DEFAULT_LLM_CONCURRENCY_CAP;
  return DEFAULT_CONCURRENCY_CAP;
}

function getSemaphore(provider: string, model: string, kind?: EndpointKind): Semaphore {
  const k = key(provider, model);
  let sem = SEMAPHORES.get(k);
  if (!sem) {
    sem = { cap: capFor(provider, model, kind), active: 0, waiters: [] };
    SEMAPHORES.set(k, sem);
  }
  return sem;
}

async function acquire(sem: Semaphore): Promise<void> {
  if (sem.active < sem.cap) {
    sem.active += 1;
    return;
  }
  await new Promise<void>((resolve) => sem.waiters.push(resolve));
  // resolver bumps `active` for us so the waiter wakes up holding a slot.
}

function release(sem: Semaphore): void {
  const next = sem.waiters.shift();
  if (next) {
    // Hand the slot directly to the next waiter — `active` stays the same.
    next();
    return;
  }
  sem.active = Math.max(0, sem.active - 1);
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
  // active past cap. acquire() therefore returns to the caller with the slot
  // either freshly acquired (active was < cap) or handed off from release().
  if (sem.active < sem.cap) {
    sem.active += 1;
  } else {
    await new Promise<void>((resolve) => sem.waiters.push(resolve));
  }
  try {
    return await fn();
  } finally {
    release(sem);
  }
}

void acquire; // keep acquire reachable for future symmetric callers / tests.

/**
 * Returns a snapshot of the live semaphore state. Useful for tests + an
 * eventual `ralphy provider concurrency` introspection verb. Read-only.
 */
export function snapshot(): Array<{ endpoint: string; cap: number; active: number; waiters: number }> {
  return Array.from(SEMAPHORES.entries()).map(([endpoint, sem]) => ({
    endpoint,
    cap: sem.cap,
    active: sem.active,
    waiters: sem.waiters.length,
  }));
}
