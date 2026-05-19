# Model stack — pixel-art-product-reveal

Order of operations + exact models. Two-key stack: `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. No FAL, no direct OpenAI.

Source-project rollup (`playdate-pixel-001`): **~$12.70 total** across 31 image calls + 13 video calls + 13 music calls (music = subscription, free per-call).

## Cost ballpark for a fresh run (no v1 rework)

| Stage | Calls | Unit cost | Stage total |
|---|---|---|---|
| Stills v1 (14 keyframes) | 14 | $0.15–$0.20 | ~$2.50–$2.80 |
| C2PA strip | 1 ffmpeg loop | $0 | $0 |
| i2v (8 clips) | 8 | $0.56–$0.70 | ~$4.80–$5.60 |
| Music (5 variants in parallel) | 5 | subscription | $0 (in-plan) |
| Remotion renders (5 variants) | 5 | local | $0 |
| **Total cold-run** | | | **~$7.50–$8.50** |

Add ~$3 if v1 stills miss aesthetic (the `playdate-pixel-001` v1→v2 case) and an extra 14-call regen is needed. Cap the ralphy gen budget at **~$15** before stopping for user re-scope.

## Stage 1 — Keyframes (14 stills)

Two-model split per slot. Don't use one model for everything — they're good at different things.

### gpt-5.4-image-2 — product fidelity + typography (10/14 slots)

**Model:** `openai/gpt-5.4-image-2` via OpenRouter
**Cost:** ~$0.20/image
**Why:** product fidelity (the photoreal hero device) + custom illustrated typography (wordmark, tagline, "PRESS A", tile lettering) all land cleanly. The brand color stays bounded, never bleeds.

Slot assignment (from source):
- scene-01-first / scene-01-last (entrance + speech bubble typography)
- scene-02-first / scene-02-last (macro screen + typed text)
- scene-03b-first (gimmick macro material precision)
- scene-05-first / scene-05-last (tile-grid + typography on 24 tiles)
- scene-05b-first (HYPER METEOR equivalent — chunky cover typography at macro)
- scene-06-first / scene-06-last (wordmark + tagline lockup)

```bash
ralphy generate image \
  --project <id> --slot scene-01-first \
  --prompt-file .prompts/scene-01-first.txt \
  --model openai/gpt-5.4-image-2 \
  --size 1080x1920 \
  --ref refs/product-master-front.png \
  --ref refs/style-ref-1.png \
  --ref refs/style-ref-2.png \
  --ref refs/style-ref-3.png
```

### gemini-3-pro-image-preview — hybrid photoreal + duotone-world (4/14 slots)

**Model:** `google/gemini-3-pro-image-preview` via OpenRouter
**Cost:** ~$0.15/image
**Why:** the HARD layer-split between a photoreal element (hand or character) and a flat duotone illustrated background is gemini's sweet spot. gpt-5.4-image-2 tends to softly blend the photoreal into a painterly background here.

Slot assignment (from source):
- scene-03-first / scene-03-last (photoreal hand + 180° orbit + illustrated world)
- scene-04-first / scene-04-last (top-down device + 4 illustrated runway characters, multi-character continuity)

```bash
ralphy generate image \
  --project <id> --slot scene-03-first \
  --prompt-file .prompts/scene-03-first.txt \
  --model google/gemini-3-pro-image-preview \
  --size 1080x1920 \
  --ref refs/product-master-front.png \
  --ref refs/product-master-three-view.png \
  --ref refs/style-ref-character-1.png
```

### Key tokens that made the difference (paste verbatim where applicable)

1. **"NOT chunky 8-bit pixel art"** — the load-bearing phrase. Without it, the model lands on Game Boy-style sprite blocks (the most common mental model of "pixel art"). The Playdate's actual aesthetic is duotone-halftone smooth illustration.
2. **"halftone / ordered Bayer dithering"** — instructs the model on the exact shading technique.
3. **"HARD layer split — photoreal ... + flat duotone world — no painterly blend"** — magic phrase for gemini hybrid scenes (`02-lessons.md` Section 3).
4. **"2D illustration layer"** — reinforces the hard layer split.
5. **Named style-corpus references** ("Casual Birder, Demon Quest 85, Forrest Byrnes Up In Smoke" for Playdate) — gpt-5.4-image-2 recognizes named gamecards in its training corpus and matches the actual cover style. For your `{{product_brand}}`, swap in the 4-6 actual named works your brand has shipped.
6. **Pass 3-4 atomic refs per call** (NOT one composite screenshot). One canonical product photo + 2-3 scene-relevant style refs.

### What we tried and dropped

- **gpt-5.4-image-2 for scene-03 (photoreal hand + illustrated world):** softly blended the photoreal hand into a painterly background. Gemini-3-pro is the win.
- **gemini-3-pro for typography (scene-05 tile-grid):** the lettering on individual tiles was mushy. gpt-5.4-image-2 wins for any typography-heavy shot.
- **Single Playwright screenshot of the brand's whole landing grid as style ref:** signal-mixed. Use 8-15 atomic refs.

## Stage 1.5 — C2PA strip (mandatory before i2v)

```bash
mkdir -p workspace/projects/<id>/assets/images/stripped
for f in workspace/projects/<id>/assets/images/scene-*.png; do
  ffmpeg -y -i "$f" -map_metadata -1 \
    workspace/projects/<id>/assets/images/stripped/$(basename "$f")
done
```

No `ralphy` verb for this yet. Raw ffmpeg, ~30 seconds. Without it, some i2v providers refuse the upload with "AI-generated metadata detected" — burned across two postmortems (flipper + playdate).

## Stage 2 — i2v (8 clips)

**Model:** `bytedance/seedance-2.0` via OpenRouter
**Cost:** ~$0.56–$0.70 per 5s clip
**Mode:** Multi-frame for 6/8 scenes (`--first-frame X --last-frame Y`). Single-frame for the 2 macro inserts (scene-03b, scene-05b).
**Audio:** `generate_audio: false` (always — music is added separately).

```bash
ralphy generate video \
  --project <id> --slot scene-01-vid \
  --first-frame assets/images/stripped/scene-01-first.png \
  --last-frame  assets/images/stripped/scene-01-last.png \
  --prompt-file .prompts/video-scene-01.txt \
  --duration 5 \
  --model bytedance/seedance-2.0
```

### Why seedance over kling-pro (refined rule from playdate-pixel-001 #7)

For PHOTOREAL HAND + camera motion (scene-03 180° orbit), the user explicitly compared the two takes: kling-pro single-frame "сделал ещё хуже". Seedance multi-frame produced the cleaner orbit. The flipper postmortem rule "real human faces → kling-pro" applies to **expression-only animation on a tight portrait**, not bodies-in-motion + camera moves.

**Refined rule:** seedance is the default for everything in this template. Kling-pro single-frame is reserved for tight-portrait expression-only acting — which this template has zero of.

### AVOID — `kwaivgi/kling-v3.0-pro` multi-frame

Confirmed broken on OpenRouter for ≥6 days (2026-05-12 documented in flipper postmortem → 2026-05-18 reconfirmed in playdate postmortem). Error: `400 "File is not in a valid base64 format"`. Don't even try — pre-flight rejection should happen in `cli/lib/providers/media.ts` (see `03-cli-issues.md#3`).

## Stage 3 — Voiceover

**None.** This template is wordless. Skip.

## Stage 4 — Captions

**None in the body.** The wordmark + tagline at scene-06 are hand-illustrated typography baked into the keyframe by gpt-5.4-image-2, NOT a Remotion caption overlay. Captions added on top break the duotone register.

## Stage 5 — Music (5 variants)

**Model:** ElevenLabs Music
**Cost:** subscription (in-plan, no per-call cost)
**Duration:** `<total visual cut> + 2s` (extra tail for the freeze)

```bash
ralphy generate music \
  --project <id> --slot music-a \
  --prompt-file .prompts/music-a-chiptune-orchestral.txt \
  --duration 17
```

Fire all 5 variants in parallel. The source ran 5 in parallel with no throttling observed.

### Brand-name strip is mandatory

ElevenLabs ToS filter 400s on: **Game Boy / NES / SNES / Tetris / Mario Kart / Disasterpeace / Anamanaguchi / and any other major retro-gaming brand or artist**. The 400 response carries a `prompt_suggestion` field with a brand-stripped retry that works. Strip preemptively to save the 30s × 3 retries the source burned.

Replacement vocabulary:
- "Game Boy" → "late-80s handheld"
- "NES" → "8-bit pulse-wave"
- "Mario Kart" → "retro arcade theme energy"
- "Disasterpeace" → "indie game soundtrack"
- "Anamanaguchi" → "punchy 8-bit drums and bright square-wave melody"

## Stage 6 — Remotion render (5× final, A/B compare)

`src/videos/<id>/{scenes.ts, index.tsx}`, registered in `src/Root.tsx`. Clone the `playdate-pixel-001` structure — same scene-timing skeleton, just different `videoFile` slugs.

Single-axis A/B compare on the music: edit `MUSIC_FILE` constant in `scenes.ts` between renders, render 5×. Faster than parameterizing via `inputProps` for a single-axis compare.

```bash
for VARIANT in a b c d e; do
  sd 'MUSIC_FILE = ".*"' "MUSIC_FILE = \"music-$VARIANT.mp3\"" src/videos/<id>/scenes.ts
  bun run render -- <CompositionId> --output workspace/projects/<id>/render/final-music-$VARIANT.mp4
done
```

Stage backdrop in `AbsoluteFill` should be `{{duotone_light_hex}}` (the cream-putty side of the palette) — any aspect-ratio mismatch between i2v output and 1080×1920 stage looks intentional, not like black letterboxing.

## Total wall-time budget

Source session was ~3.5 hours from "go" to 5 rendered finals. Cold-start budget breakdown:

| Phase | Wall time |
|---|---|
| Research + storyboard | ~25 min |
| Stills v1 (14 parallel) | ~10 min |
| (If aesthetic miss) Stills v2 | +10 min |
| C2PA strip | ~1 min |
| i2v (8 parallel) | ~20 min |
| Composition + smoke render | ~15 min |
| Music (5 parallel) | ~5 min |
| Render 5× | ~10 min |
| **Total cold-run** | **~85 min** (vs 8-min target for a single-variant cold-start — this template is intentionally heavy because the 5-variant music A/B is the deliverable, not 1) |
