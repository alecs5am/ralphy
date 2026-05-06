# Reference example — before-after-product

**Status: PLACEHOLDER** — fills in after the first real run.

## What should live here after the first run

- Source project ID + product category.
- Pain point + reveal text + outro CTA — full VO transcripts (before + after).
- Reference image used (path + a cropped screenshot to show what the gemini multi-ref actually saw).
- Reveal frame final result + score.
- Cost actuals.
- Notes:
  - How many regens the reveal frame needed before the logo stayed accurate.
  - Whether the music cross-fade sounded smooth.
  - Whether the caption-style switch (Hormozi → Minimal) felt organic or harsh.
  - Whether ElevenLabs delivered distinctly different tones for the two VO halves.

## How to fill it

```bash
ralphy template extract --slug before-after-product --from-project <id>
```

Or fill it by hand from `scenario.json`, `prompts.json`, `asset-manifest.json`, and the project's `logs/`.

## Why this is empty for now

The structure ships ready-to-use; the reference fills in once a real product gets shipped through the template (~$3.70 + 8 minutes wall time).
