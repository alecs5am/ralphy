// Burst-cap / rate-limit error → actionable hint mapper (#428 part C).
//
// A failed queue job's `error_message` is whatever the child wrote to stderr
// before exiting. The worst class to debug is the OpenRouter burst-cap / 403
// "Key limit exceeded" family: it reads like a $ balance problem but the real
// cause is a per-endpoint concurrent-call cap (see cli/lib/providers/shared.ts
// rewriteUpstreamError + concurrency.ts). This mapper recognizes those strings
// and returns a short, actionable hint WITHOUT swallowing the original error —
// the caller surfaces `{ lastError, hint }` so the raw text always survives.
//
// #450: the canonical classifier now lives in cli/lib/errors/taxonomy.ts.
// `burstCapHint` DELEGATES to it instead of running a parallel string-match
// table — it keeps its narrow, stable contract (a hint string ONLY for the
// rate / burst-cap family, `null` for everything else, including paths /
// moderation / constraints) by gating on the matched taxonomy rule id. The
// hint TEXT is the rule's first nextAction, so the two never drift.
//
// Pure + dependency-light: takes a string, returns a string | null. Fully unit
// testable. Strings outside the rate/burst-cap family pass through as `null`.

import { classifyError } from "../errors/taxonomy.js";

/** Taxonomy rule ids whose hint `burstCapHint` is responsible for surfacing. */
const RATE_RULE_IDS = new Set(["burst-cap", "rate-limit"]);

/**
 * Classify a failed-job error message and return an actionable hint, or null
 * when the message is not in the rate / burst-cap family. The hint is additive
 * — never a replacement for the original `error_message`. Delegates to the
 * #450 taxonomy classifier (single source of truth) and only surfaces a hint
 * for the rate / concurrency-limit rules, preserving the original #428 scope.
 */
export function burstCapHint(errorMessage: string | null | undefined): string | null {
  if (!errorMessage) return null;
  const c = classifyError({ message: errorMessage });
  if (c.matched && RATE_RULE_IDS.has(c.matched)) {
    return c.nextActions[0] ?? null;
  }
  return null;
}
