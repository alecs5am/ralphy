// Shorthand → canonical OpenRouter model-id mapping.
//
// kbo postmortem flagged this as a recurring friction: the agent (and users)
// reach for casual shorthand like "gpt image 2", "nano banana pro", "kling",
// "seedance" — none of which match OR catalog slugs, so requests 404 or
// surface confusing errors. `resolveModelAlias()` returns the canonical slug
// (with a stderr breadcrumb when a substitution happened) so callers don't
// have to memorize the slugs from MODELS.md.
//
// Add a row whenever a postmortem surfaces a new shorthand the agent reaches
// for. Keep the mapping pure-string — no regex matching, no fuzzy logic —
// so the behavior stays predictable.

/**
 * Canonical OR slugs are the values. Keys are the shorthand the agent / user
 * reaches for. Lookup is case-insensitive + space-stripped.
 */
const ALIASES: Record<string, string> = {
  // ── Image models ────────────────────────────────────────────────────
  "gpt-image": "openai/gpt-5.4-image-2",
  "gpt-image-2": "openai/gpt-5.4-image-2",
  "gpt image 2": "openai/gpt-5.4-image-2",
  "gpt-5-image-2": "openai/gpt-5.4-image-2",
  "gpt5image": "openai/gpt-5.4-image-2",
  "gpt5-image2": "openai/gpt-5.4-image-2",
  "gpt-image-mini": "openai/gpt-5-image-mini",
  "gpt5-mini-image": "openai/gpt-5-image-mini",

  "banana": "google/gemini-3-pro-image-preview",
  "nano-banana": "google/gemini-3-pro-image-preview",
  "nano banana": "google/gemini-3-pro-image-preview",
  "nano-banana-pro": "google/gemini-3-pro-image-preview",
  "nano banana pro": "google/gemini-3-pro-image-preview",
  "gemini-image": "google/gemini-3-pro-image-preview",
  "gemini-3-pro-image": "google/gemini-3-pro-image-preview",
  "gemini-3-image": "google/gemini-3-pro-image-preview",
  "gemini-flash-image": "google/gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-image": "google/gemini-2.5-flash-image",

  "recraft": "recraft/recraft-v4.1-pro",
  "recraft-pro": "recraft/recraft-v4.1-pro",
  "recraft-vector": "recraft/recraft-v4.1-pro-vector",

  // ── Video models ────────────────────────────────────────────────────
  "kling": "kwaivgi/kling-v3.0-pro",
  "kling-pro": "kwaivgi/kling-v3.0-pro",
  "kling-v3": "kwaivgi/kling-v3.0-pro",
  "kling-3": "kwaivgi/kling-v3.0-pro",
  "kling-std": "kwaivgi/kling-v3.0-std",
  "kling-o1": "kwaivgi/kling-video-o1",

  "seedance": "bytedance/seedance-2.0",
  "seedance-2": "bytedance/seedance-2.0",
  "seedance-pro": "bytedance/seedance-2.0",
  "seedance-fast": "bytedance/seedance-2.0-fast",

  "veo": "google/veo-3.1",
  "veo-3": "google/veo-3.1",
  "veo3": "google/veo-3.1",
  "veo-3.1": "google/veo-3.1",
  "veo-fast": "google/veo-3.1-fast",
  "veo-lite": "google/veo-3.1-lite",

  "wan": "alibaba/wan-2.7",
  "wan-2.6": "alibaba/wan-2.6",
  "wan-2.7": "alibaba/wan-2.7",

  "hailuo": "minimax/hailuo-2.3",

  // ── Vision / LLM models (for ralphy ref / synthesis) ───────────────
  "gemini-flash": "google/gemini-2.5-flash",
  "gemini-3-pro": "google/gemini-3-pro-preview",
  "gemini-3.1-pro": "google/gemini-3.1-pro-preview",
};

/**
 * Normalize a user-supplied model string by stripping whitespace and lowercasing,
 * then look up against the alias table. Canonical OR slugs (containing a `/`) pass
 * through unchanged. Unknown bare strings (no `/`) also pass through — the caller
 * gets the upstream 404 with the original input preserved in the message.
 *
 * Returns the canonical slug; emits a stderr breadcrumb when a substitution
 * happened so the user / agent learns the canonical form.
 */
export function resolveModelAlias(input: string | undefined): string | undefined {
  if (!input) return input;
  // Pass through canonical OR slugs (provider/model form) untouched.
  if (input.includes("/")) return input;

  const key = input.trim().toLowerCase();
  const canonical = ALIASES[key];
  if (!canonical) return input;
  if (canonical === input) return input;
  // eslint-disable-next-line no-console
  console.error(
    `ralphy: model alias resolved: "${input}" → "${canonical}"`,
  );
  return canonical;
}

/**
 * Lookup all aliases for a canonical slug — useful for `ralphy models alias`
 * to show the user what shorthand they can use.
 */
export function aliasesFor(canonical: string): string[] {
  return Object.entries(ALIASES)
    .filter(([, v]) => v === canonical)
    .map(([k]) => k)
    .sort();
}

/**
 * Reverse lookup — given an arbitrary input, return the canonical form and the
 * matched shorthand (if any). Used by `ralphy models alias <input>` CLI verb.
 */
export function lookupAlias(input: string): { canonical: string | undefined; matched: boolean } {
  const resolved = resolveModelAlias(input);
  return {
    canonical: resolved,
    matched: resolved !== input && resolved !== undefined,
  };
}

/**
 * All canonical models reachable via at least one alias.
 */
export function canonicalSlugs(): string[] {
  return Array.from(new Set(Object.values(ALIASES))).sort();
}
