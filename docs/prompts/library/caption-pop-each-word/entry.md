---
goal: Karaoke-style word-by-word caption fill where each word "pops" in sync with the spoken syllable.
applies_to: [caption]
tags: [captions, karaoke, word-by-word, animated, scroll-stop]
models_known_good: [elevenlabs-scribe-v1, whisper-1]
models_known_bad: []
references:
  - https://www.tiktok.com/@hormozi/video/7234567890
---

# Caption — pop each word (karaoke fill)

Word-by-word animated captions. Each word fills with the brand color exactly as the syllable lands in the VO. Used by `KaraokeCaptions` / `HormoziCaptions` in `src/lib/components/captions/`.

## Bad

> "Full sentence captions appearing all at once."

**Why it fails:** Defeats the dwell-pull. Viewer reads the whole sentence in 0.3s and scrolls.

## OK

> "Captions appearing one word at a time."

**Why it's just OK:** One-word-per-frame is too jittery without color fill — looks broken.

## Ideal

- Word-level timestamps from **ElevenLabs Scribe v1** (preferred — cleaner boundaries than whisper-1).
- Each word renders gray, then **fills with the brand color** exactly at its word-start timestamp.
- Inter Black at 96-108px, centered vertically in the lower third.
- Emoji injected at ~1 per 5 seconds, on emphasis words only.

## Notes for the implementer

- Always use `KaraokeCaptions` (or `HormoziCaptions`) — both already implement the per-word color fill in Remotion.
- Pass the raw Scribe v1 JSON; do NOT re-time by hand.
- Brand color must come from the project's `brand.json`; never hardcode.
