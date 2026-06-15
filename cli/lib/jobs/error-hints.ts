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
// Pure + dependency-free: takes a string, returns a string | null. Fully unit
// testable. Unknown strings pass through as `null` (no hint).

/**
 * Classify a failed-job error message and return an actionable hint, or null
 * when nothing is recognized. The hint is additive — never a replacement for
 * the original `error_message`.
 */
export function burstCapHint(errorMessage: string | null | undefined): string | null {
  if (!errorMessage) return null;
  const lower = errorMessage.toLowerCase();

  // OpenRouter per-key concurrent-call cap. Surfaces as a 403 with "Key limit
  // exceeded" / "total limit", OR our own rewritten "concurrent-call limit"
  // message from rewriteUpstreamError.
  if (
    lower.includes("key limit exceeded") ||
    lower.includes("total limit") ||
    lower.includes("concurrent-call limit")
  ) {
    return (
      "OpenRouter burst-cap hit (per-key concurrent-call limit, NOT a $ balance issue). " +
      "Reduce image concurrency (queue retry --tag <tag> --state failed after lowering it) " +
      "or add a per-kind min-interval throttle. Check credits with `ralphy doctor`."
    );
  }

  // Generic 429 / rate-limit / concurrent-limit family (ElevenLabs Music,
  // upstream gateway throttles). HTTP 429 or the literal phrases.
  if (
    lower.includes("concurrent_limit_exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("rate-limit") ||
    lower.includes("too many requests") ||
    /\b429\b/.test(errorMessage)
  ) {
    return (
      "Rate/concurrent-limit hit (HTTP 429). Serialize this endpoint or reduce concurrency, " +
      "then retry the failed set (`ralphy queue retry --tag <tag> --state failed`)."
    );
  }

  return null;
}
