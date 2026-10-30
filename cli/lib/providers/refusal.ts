// Refusal rows in generations.jsonl (#592).
//
// A refusal is a provider safety / policy / IP block: the seedance privacy
// filter (a submit-time HTTP 400), an output copyright or "sensitive" filter, a
// Gemini `IMAGE_SAFETY` finish, an ElevenLabs Music ToS rejection. Before #592
// most of them never reached `generations.jsonl` (submit-time 400s threw before
// any log call, and Run-backed generation skips the gen-log), and the rows that
// did land carried `cost_usd: 0` even when the provider may have billed.
//
// Contract: every refusal appends ONE row with `status: "blocked"`,
// `error: "blocked:<reason>: <provider message>"` and `failureClass:
// "moderation"`. The cost is the provider-reported `cost_usd`
// (`cost_source: "provider"`), or no `cost_usd` at all with
// `cost_source: "unknown"` — never a made-up 0. A failed Run Attempt keeps no
// cost in SQLite, so this row is the only place a billed refusal lands; spend
// rollups never count it twice.
//
// Detection: an error a connector marked with `markRefusal()` (it knows the
// provider said "refused"), else the #450 taxonomy's moderation rules over the
// raw message (`classifyFilterError`). Transient errors are never refusals.

import { logGeneration, type GenerationEntry } from "../gen-log.js";
import { destinationInputFields, type GenerationDestination } from "../generation-destination.js";
import { classifyFilterError } from "../errors/taxonomy.js";

const REFUSAL_REASON = Symbol.for("ralphy.refusalReason");
const PROVIDER_COST = Symbol.for("ralphy.providerCostUsd");

/** Longest provider message kept on a blocked row. */
const MAX_REASON_CHARS = 500;

function validCost(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Attach the cost the provider reported for a failed call (no-op when it reported none). */
export function attachProviderCost<E>(err: E, cost: unknown): E {
  const usd = validCost(cost);
  if (usd !== undefined && err && typeof err === "object") {
    Object.defineProperty(err, PROVIDER_COST, { value: usd, configurable: true });
  }
  return err;
}

/** The provider-reported cost carried by an error, or undefined when unknown. */
export function providerCostOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  return validCost((err as Record<symbol, unknown>)[PROVIDER_COST]);
}

/**
 * Mark an error as a provider refusal. `reason` is a short label
 * (`safety-input`, `safety-output`, `copyright`, `tos-content`, …); when omitted
 * the taxonomy derives it from the message.
 */
export function markRefusal<E>(err: E, facts: { reason?: string; costUsd?: unknown } = {}): E {
  if (err && typeof err === "object") {
    Object.defineProperty(err, REFUSAL_REASON, { value: facts.reason ?? "", configurable: true });
  }
  return attachProviderCost(err, facts.costUsd);
}

/**
 * Keep a request body loggable: scalars stay, inline `data:` payloads are
 * dropped, arrays and objects shrink to a `<key>_count`. A blocked row must not
 * carry base64 reference bytes.
 */
export function compactRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      if (!value.startsWith("data:")) out[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[`${key}_count`] = value.length;
    } else if (value && typeof value === "object") {
      out[`${key}_count`] = Object.keys(value).length;
    }
  }
  return out;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Classify an error as a refusal. Returns the reason label, or null when the
 * error is not a refusal (transient blips, constraint violations, auth, paths).
 */
export function refusalOf(err: unknown, ctx: { model?: string } = {}): { reason: string } | null {
  const marked = err && typeof err === "object"
    ? (err as Record<symbol, unknown>)[REFUSAL_REASON]
    : undefined;
  const message = errorMessage(err);
  const filter = classifyFilterError({ message, modelId: ctx.model });
  if (typeof marked === "string") {
    return { reason: marked || (filter && filter.filterClass !== "transient" ? filter.filterClass : "policy") };
  }
  if (!filter || filter.filterClass === "transient" || filter.class !== "moderation") return null;
  return { reason: filter.filterClass };
}

export interface RefusalContext {
  provider: string;
  model: string;
  /** Defaults to `model`. */
  endpoint?: string;
  kind: GenerationEntry["kind"];
  slot?: string;
  /** Call input for the row (prompt + parameters). Never raw ref bytes. */
  input?: Record<string, unknown>;
  err: unknown;
  latencyMs?: number;
  attempt?: number;
  note?: string;
}

type BlockedRow = Parameters<typeof logGeneration>[1];

/**
 * Build the blocked row for a refusal, or null when `err` is not a refusal.
 * Pure, so the row shape is unit-testable without touching disk.
 */
export function refusalRow(destination: GenerationDestination, ctx: RefusalContext): BlockedRow | null {
  const refusal = refusalOf(ctx.err, { model: ctx.model });
  if (!refusal) return null;
  const cost = providerCostOf(ctx.err);
  return {
    slot: ctx.slot,
    provider: ctx.provider,
    model: ctx.model,
    endpoint: ctx.endpoint ?? ctx.model,
    kind: ctx.kind,
    input: { ...(ctx.input ?? {}), slot: ctx.slot, ...destinationInputFields(destination) },
    status: "blocked",
    error: `blocked:${refusal.reason}: ${errorMessage(ctx.err).slice(0, MAX_REASON_CHARS)}`,
    failureClass: "moderation",
    ...(cost !== undefined ? { cost_usd: cost, cost_source: "provider" as const } : { cost_source: "unknown" as const }),
    latency_ms: ctx.latencyMs,
    attempt: ctx.attempt ?? 1,
    note: ctx.note ?? ctx.slot,
  };
}

/**
 * Append the blocked row for a refusal. Returns true when a row was written.
 * Best-effort: a logging failure never masks the provider error.
 */
export async function logRefusal(destination: GenerationDestination, ctx: RefusalContext): Promise<boolean> {
  const row = refusalRow(destination, ctx);
  if (!row) return false;
  try {
    await logGeneration(destination, row);
    return true;
  } catch {
    return false;
  }
}
