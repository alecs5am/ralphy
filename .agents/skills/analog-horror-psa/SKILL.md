---
name: analog-horror-psa
namespace: user
description: >-
  How to make an analog-horror PSA short — the stenciled-pictogram / robo-broadcast / VHS-overlay format (faceless, 10 scenes × ~3s, 9:16, ~30s total). A domain overlay on the standard pipeline that supplies the IF / DO-NOT / BUT / AND scenario structure, the locked yellow-on-black 1970s-civil-defense pictogram visual STYLE, the chroma-key-to-alpha rule (icons must be transparent PNGs before composition), the robo-PSA voice profile (ElevenLabs "Alerter" community voice + ALL CAPS input + stability ~0.5 + style 0), the layered VHS-noise overlay stack (SnowCanvas + VcrTrackingCanvas + MobiusScanlines + MobiusWobble), the 5-layer RGB chromatic-split for icons + captions, the SMPTE colour-bars climax (3 wide vertical bars + filter blur(2.5px) mandatory), and the `-tune grain` CRF 30 final-encode rule for noise-heavy renders. Works for ANY PSA topic — "your fridge is not your fridge", "your phone is not your phone".
  USE WHEN the user asks for an analog horror PSA / "creepy PSA-style short" / fake-emergency-broadcast video / VHS-aesthetic warning / stenciled-pictogram horror short for TikTok / Reels / Shorts, with no specific existing video to reproduce.
  This is a niche SKILL (generalized), not a remix TEMPLATE. For "remix this exact PSA but swap the subject", use the remix path in docs/skills-vs-templates.md.
---

## Trigger

**FIRES** on a generic analog-horror PSA brief: "make an analog-horror PSA about <X>", "creepy emergency broadcast short", "VHS-style warning video", "PSA where <X> is actually <Y>", "fake civil-defense alert for <topic>", "your <thing> is not your <thing>", "stenciled-pictogram horror short". Any subject — the skill is subject-agnostic.

**DO NOT FIRE** when:
- The user points at one specific PSA video to reproduce → that is the **remix path**. See [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).
- The user wants a different horror register (cosmic-horror, found-footage, jumpscare reaction) → match a different niche skill or run freeform via scenarist.
- The user wants a still poster of the same vibe → use [`/poster`](../poster/SKILL.md) with an analog-horror aesthetic.

## What this skill is

A generalized format overlay, not a finished PSA. It does not name a subject, a topic, or a voice line — it tells the pipeline HOW the stenciled-pictogram analog-horror PSA is built so a strong one comes out for whatever the user is warning about. It runs **through** the normal pipeline (scenarist → art-director → editor); it does not bypass intake gates or the quality gates.

## Hard invariants

- All generation routes through `ralphy generate` (image / sfx / voiceover) — no raw API. Read `MODELS.md` before naming any model id.
- **Lock the visual STYLE on a single prototype icon BEFORE generating the other nine.** The 10 pictograms must be siblings of one approved master. Iterating mid-batch costs $1.00+ on prototype gens (analog-horror-fridge-001 burned $1.00 of v3 → v10 iterations). Pass `--ref <approved-master>` on every sibling gen.
- **Icons must be chroma-keyed to alpha BEFORE composition.** Otherwise the near-black icon bg shows as a visible rectangle on the `#1a1a1a` Remotion / HyperFrames underlay. Two-pass ffmpeg colorkey: `colorkey=0x000000:0.20:0.08,colorkey=0xFFFFFF:0.20:0.05` — second pass catches any icon that generates on a white outer panel.
- **Verify ElevenLabs voice exists before bulk regen.** Voice IDs (especially community / "Alerter" library voices) can disappear between sessions. `xh GET /v1/voices/<id> | jq .voice_id` as a pre-flight.
- **Sequential VO + SFX generation.** ElevenLabs 429s on ≥3 concurrent. Always serial.
- **`ralphy queue` daemon trips an OpenRouter burst-cap on image gen.** Use a sequential bash for-loop for the 10 sibling icons, not `--queue`.
- **Loudnorm AFTER all clips are final**, never in the same loop as gen. A failed regen mid-loop double-norms the surviving clips.
- **`-tune grain` CRF 30 on the final encode.** Default x264 CRF 18 produces 190 MB / 30s renders because canvas-snow is max-entropy noise. `ralphy video optimize --crf 30 --tune grain` drops it ~12.8× with zero perceived loss.
- **Append-only on regen.** Re-rolling a voiceover saves the previous take as `<slot>-pre-<change>.mp3`. Never overwrite.

## The niche, in one paragraph

An analog-horror PSA lives or dies on **broadcast-monotone voice + locked stencil pictogram visuals + the layered analog-tape decay overlay**. The format mimics a 1970s-80s civil-defense emergency broadcast: flat yellow stenciled icons on pure black, a robotic announcer reading short directive lines, VHS hiss + scanlines + tracking glitches as the bed, and an SMPTE-colour-bars "signal lost" climax. The horror is in the *register* (cold, official, repeating) more than in the content of any single line.

## The fixed 10-scene structure (do not restructure — only fill the slots)

Each scene is ~3 seconds, 9:16 portrait, total ~30s. The IF / DO-NOT / BUT / AND template gives the format its hypnotic cadence:

| Scene | Beat role | VO shape (ALL CAPS) |
|---|---|---|
| 1 | Title-card hook | "COMPLIANCE BULLETIN <NUMBER>." (EBS-style red `<digit>-D` icon) |
| 2 | Authority frame | "THIS IS A RESIDENTIAL BEHAVIORAL ALERT." |
| 3 | IF — observation | "IF YOUR <SUBJECT> <OBSERVED BEHAVIOR>." |
| 4 | IF — escalation | "IF YOUR <SUBJECT> <SECOND OBSERVED BEHAVIOR>." |
| 5 | DO-NOT — directive | "DO NOT LOOK IN ITS EYES." / "DO NOT <ACTION>." |
| 6 | BUT — contradiction | "BUT IT WILL <COUNTER-BEHAVIOR>." |
| 7 | AND — confirmation | "AND YOU WILL <CONSEQUENCE>." |
| 8 | Specifics | "YOUR <SUBJECT> IS NOT YOUR <SUBJECT>." (the format's signature line) |
| 9 | Direct address | "<DIRECT ORDER OR WARNING>." |
| 10 | Signal-lost climax | (no VO — SMPTE colour-bars + layered growl SFX) |

The IF / DO-NOT / BUT / AND structure is the format's recognizable cadence; deviating breaks the genre.

## The locked pictogram visual STYLE

Every icon is a **flat solid yellow `#FFD400` shape on a pure black `#000000` background**, primitive / civil-defense register, no internal texture, no outline. Generate ONE prototype with `--ref` against the genre reference, get user approval, then batch all 9 siblings with the prototype as `--ref`.

Prompt scaffold (verbatim — drop in the subject):

```
Generate a pictogram icon that EXACTLY MATCHES the style of the reference image
(the yellow sitting-dog pictogram on pure black).

REQUIREMENTS:
- PURE BLACK BACKGROUND hex 000000 (perfectly flat solid black, NO texture,
  NO grain, NO scanlines, NO noise on the background).
- FLAT SOLID YELLOW SHAPES hex FFD400 (completely uniform yellow fill, NO
  internal texture, NO grain, NO gradient, NO highlights — just flat yellow).
- Slightly imperfect / hand-traced outer edges (subtle wobble like a stencil),
  NO separate outline color — just flat yellow shapes directly on flat black.
- Style: simplified primitive pictogram, like a 1970s civil-defense PSA icon
  or a road-safety warning sign — bold readable shapes, no fine detail,
  no anatomical realism.
- Composition: subject occupies about 55 percent of frame, perfectly centered,
  large solid-black margin all sides. Vertical 9:16.
- No text, no logos, no watermarks, no noise.

Subject for THIS icon: <SUBJECT SPECIFIC TO SCENE>
```

Negative: `textured background, dark gray background, scanlines on bg, noise on bg, paper-grain, internal texture in shape, grain inside, spray paint inside, dotted fill, halftone fill, gradient fill, highlights inside, shadows inside, dark outline, black border, double outline, pixel art, 8-bit, blocky voxel, smooth perfect vector curves, 3d render, photorealism, depth of field, glow, neon, watermark, logo, signature, fur detail, eyes detail, mouth detail, realistic anatomy`.

For scene-01, swap yellow for red `#DD2020` to render an EBS-style `<digit>-D` title-card.

## The robo-PSA voice profile

The voice carries the whole horror layer. Defaults that worked on `analog-horror-fridge-001`:

- **Voice:** ElevenLabs "Alerter" (community library, user-saved) is the validated winner. Default-library voices (Ava, Marcus) read too human even on a flat prompt. Verify the voice exists in the user's library via `xh GET /v1/voices/<id>` BEFORE bulk regen — community voices disappear between sessions.
- **Settings:** `stability ~0.5`, `style 0`. Strict broadcaster cadence with minimal inflection. The CLI does not yet expose these flags — fall back to the ElevenLabs UI when the keeper take is on the line.
- **Input text:** ALL CAPS. Forces flatter ElevenLabs delivery. Not a guarantee (the model still adds some emotion) but shifts the prior toward broadcast-monotone.
- **Per-scene clips:** Sequential generation. ElevenLabs 429s on ≥3 concurrent.
- **Loudnorm:** `ralphy audio loudnorm --target -16` on each clip **AFTER all 10 are final**. Never in the same loop as gen.

## The VHS-noise overlay stack

Composed in HyperFrames (or Remotion). Four cooperating canvas / wrapper layers:

1. **`MobiusWobble`** — parent wrapper, applies tiny per-frame `translate(${x}px, ${y}px)` jitter (1px alternating every 2-3 frames) to the entire content tree. Cheap, dramatic, no per-component instrumentation.
2. **`SnowCanvas`** — pure white noise canvas (`Uint32Array(255*Math.random())` per pixel per frame) at opacity 0.2 on `#aaa` background underneath the icon layer.
3. **`VcrTrackingCanvas`** — Mobius1-port algorithm: 20 noise points per frame, each spawns a tail of `getRandomInt(1, 50)` 2×2 white rects walking ±1-4px horizontally. `filter: blur(1px)`. Mounts as `<canvas>` with `useRef` + `useEffect([frame])` so it redraws every frame.
4. **`MobiusScanlines`** — repeating-linear-gradient scanline overlay on `mixBlendMode: "multiply"`.

The reusable components belong at `src/lib/components/overlays/AnalogTV.tsx` (move + document them when the matching `templates/entertainment-viral/analog-horror-psa/` scaffold gets extracted).

## The 5-layer RGB chromatic split (icons + captions)

What sells "analog horror" in 2026, applied to both icon and caption on the same beat:

| Layer | Shift | Hue rotate | Blur | Opacity |
|---|---|---|---|---|
| Red ghost | -12px X | -40° | 4 | 1.0 |
| Green ghost | +12px X | +60° | 4 | 1.0 |
| Blue ghost (glitch) | random ±16px every 0.6s | 180° | 4 | 0.15-1.0 flicker (4-frame seed) |
| Wide soft white-halo | 0 | 0 | 22 | 0.55 |
| Sharp core | 0 | 0 | 0.9 | 1.0 |

All on `mixBlendMode: "screen"` except the sharp core. The blue ghost flickering down to 15% opacity on a 4-frame seed reads as "lost color channel" dropout.

**Glitch beat synchronized across icon + caption** — both use `frame % 18 <= 1 ? 16 : 0` for the +X jump and `frame % 18 >= 9 && <= 10 ? -16 : 0` for the −X jump. When the icon jerks, the caption jerks the same way — sells the "this is one analog signal" illusion.

## The SMPTE colour-bars climax (scene-10)

Confetti dots look CSS-generated. The reference is real SMPTE bars:

- 3 wide vertical bars (cyan / green / magenta) top 78% + 5 narrower bars (multi-color) bottom 22%.
- `filter: blur(2.5px)` — **non-negotiable**. Without the blur it reads as clean CSS, not a degraded analog channel.
- Horizontal sync-jitter offset (±9px X, ±4px Y).
- Rolling tracking band sweeping down.
- Chromatic-aberration ghost layer with hue-rotate.
- Scanline `multiply` overlay.
- 28 dust specks + 5 white scratch lines.

No VO. Layer 4 climax-growl SFX variants at staggered offsets (1.5s, 1.8s, 1.9s, 2.1s) with volumes 0.55-0.60 — single growl sounds like "chihuahua yipping", layered 4 reads as "monster".

## Audio bed levels

Validated on `analog-horror-fridge-001`:

- VHS-hiss bed: 0.22 (constant under everything)
- Low-drone bed: 0.12 (constant)
- Music bed (synth-tension track, yt-dlp from a YouTube reference): **0.35-0.40** — sits ABOVE the static-noise bed, just under the VO. Initial 0.16 was inaudible; the music has to *do its dread-building job*, not whisper underneath.
- Per-scene VO: 1.0
- Per-scene static-pop: 0.55
- Per-scene extra SFX: 0.4-0.7

## Default model stack (verify against MODELS.md)

- **Style-discovery prototype:** `openai/gpt-5.4-image-2` with `--ref <genre-frame>`. Best at "match a reference image exactly" with verbose style prompts. One prototype, one yes/no, iterate ONLY this slot.
- **Style-locked batch (after prototype approved):** `google/gemini-3-pro-image-preview` (nano-banana). With `--ref <approved-prototype>` + per-icon subject prompt, holds the locked style across all 9 siblings reliably. Cheaper + faster than gpt-5.4 for consistency-across-batch.
- **VO:** ElevenLabs `eleven_multilingual_v2`, voice "Alerter" (or equivalent broadcaster-style community voice). Verify voice exists first.
- **SFX:** ElevenLabs `sound_generation_v2` via `ralphy generate sfx`. 4 variants per climax growl, layered.
- **Music:** `ralphy ref pull <yt-music-url> --audio-only` for a synth-tension bed. Generated music (ElevenLabs Music) wasn't tried on the reference project; yt-dlp pull from a user-supplied YouTube reference is the validated 2-minute path.
- **Render:** HyperFrames composition → `ralphy render <id>` → `ralphy video optimize --crf 30 --tune grain --preset veryslow` (mandatory for noise-heavy comps).

## Failure modes

- **Iterating prototypes without `--ref`** → 4-5 wrong styles burned ($0.80-$1.00). Prevention: pass a genre reference frame as `--ref` from the FIRST prototype.
- **Forgetting the chroma-key step** → visible rectangle around every icon on the dark Remotion bg. Prevention: two-pass `colorkey=0x000000:0.20:0.08,colorkey=0xFFFFFF:0.20:0.05` to `artifacts/images-keyed/` before composition.
- **Single-growl climax** → reads as "chihuahua yipping". Prevention: 4 variants layered at staggered offsets.
- **Confetti-dot climax** → CSS-generated, not analog. Prevention: SMPTE bars + `filter: blur(2.5px)` (non-negotiable).
- **Loudnorm inside the gen loop** → double-norms if any regen fails. Prevention: gen all → verify durations → loudnorm pass as a separate step.
- **Default Remotion CRF 18 on noise-heavy comp** → 190 MB / 30s output (unsharable to social). Prevention: `ralphy video optimize --crf 30 --tune grain` post-render.
- **Picking too-emotional default-library voice and iterating regens** → wasted ~30 calls. Prevention: switch voice (community "Alerter") instead of fighting; fall back to ElevenLabs UI when CLI doesn't expose `stability` / `style`.
- **`ralphy queue` for image batches** → 9/10 jobs hit `403 Key limit exceeded`. Prevention: sequential bash for-loop on the 10 sibling icons.

## Workflow

1. **Intake.** Run the standard intake (target language EN by default for PSA register, aspect 9:16 fixed, duration ~30s fixed, hard no's).
2. **Reference pull.** `ralphy ref pull <reference-shorts-url>` → frames → transcribe → analyze-video → blueprint. Save one canonical pictogram frame as the prototype `--ref`.
3. **Scenario lock.** Write `scenario.json` with 10 scenes × ~3s, IF / DO-NOT / BUT / AND structure, angle `"storytime"` (passes the virality rubric — `"analog-horror-psa"` doesn't). `ralphy project score <id> --strict`. Get explicit user "go" on the VO lines BEFORE any generation.
4. **Style lock.** ONE prototype icon on `gpt-5.4-image-2 --ref <genre-frame>`. Show user; get yes/no; iterate ONLY this slot until yes.
5. **Batch the 9 sibling icons** via sequential bash for-loop on `gemini-3-pro-image-preview --ref <approved-prototype>`.
6. **Chroma-key** the 10 icons to `artifacts/images-keyed/`.
7. **Voiceover.** Verify voice exists. Sequential generation. ALL CAPS input. Loudnorm pass AFTER.
8. **SFX.** Sequential. 4 climax-growl variants for layering.
9. **Music.** yt-dlp pull from user-supplied YouTube synth-tension reference.
10. **Composition.** HyperFrames comp with: keyed icons (transparency), MobiusWobble parent, SnowCanvas + VcrTrackingCanvas + MobiusScanlines bed, GlitchCaption (5-layer RGB-split), GlitchXIcon (5-layer RGB ghost), SignalLostColorBars climax.
11. **Render + optimize.** `ralphy render <id>` → `ralphy video optimize --crf 30 --tune grain --preset veryslow`.
12. **Hand off** to `/evaluator` for the post-render quality gate.

## CLI cookbook

```bash
# 4. Prototype the locked style — gpt-image with genre-ref
ralphy generate image --project <id> --slot scene-02-PROTO \
  --model openai/gpt-5.4-image-2 --size 1080x1920 \
  --ref artifacts/refs/genre-frame.jpg \
  --prompt "$(cat prompts/style-lock.txt)"
# User says "go". Save winner as artifacts/refs/icon-master.png.

# 5. Batch 9 siblings — sequential, nano-banana, ref the approved master
for slot in scene-01 scene-03 scene-04 scene-05 scene-06 scene-07 scene-08 scene-09 scene-10; do
  ralphy generate image --project <id> --slot "$slot" \
    --model google/gemini-3-pro-image-preview --size 1080x1920 \
    --ref artifacts/refs/icon-master.png \
    --prompt "$(cat prompts/$slot.txt)"
  sleep 2
done

# 6. Chroma-key to alpha
mkdir -p artifacts/images-keyed
for f in artifacts/images/*.png; do
  ffmpeg -y -i "$f" -vf "colorkey=0x000000:0.20:0.08,colorkey=0xFFFFFF:0.20:0.05,format=rgba" \
    "artifacts/images-keyed/$(basename "$f")"
done

# 7. Voice pre-flight + sequential VO
xh GET "https://api.elevenlabs.io/v1/voices/<voice-id>" \
  "xi-api-key:$ELEVENLABS_API_KEY" | jq .voice_id  # must not 404
for slot in scene-01 scene-02 ... scene-09; do
  ralphy generate voiceover --project <id> --slot "$slot" \
    --voice <voice-id> --text "$(cat prompts/vo-$slot.txt)"
done
# AFTER all VO files exist, separate loudnorm pass:
for f in artifacts/voiceover/*.mp3; do
  ralphy audio loudnorm --target -16 "$f"
done

# 8. SFX (sequential, 4 climax-growl variants for layering)
for s in vhs-hiss-bed static-pop ebs-alert-tone low-drone-bed mirror-shimmer \
         signal-lost-tone rgb-static-burst climax-growl-v1 climax-growl-v2 \
         climax-growl-v3 climax-growl-v4; do
  ralphy generate sfx --project <id> --slot "$s" --prompt "$(cat prompts/sfx-$s.txt)"
done

# 11. Render + optimize (mandatory -tune grain for noise-heavy comps)
ralphy render <id>
ralphy video optimize --project <id> --crf 30 --tune grain --preset veryslow
```

**Minimum-viable budget:** ~$1.65-2.50 / ~45-60 min (the `analog-horror-fridge-001` reference ran $4.45 / 2.7× over because the style was iterated without `--ref` from prototype 1).

## See also

- [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md) — why this is a skill and not a template.
- [`.agents/skills/scenarist/SKILL.md`](../../../.agents/skills/scenarist/SKILL.md) — angle / virality-rubric notes (use `"storytime"`, not `"analog-horror-psa"`).
- [`.agents/skills/art-director/SKILL.md`](../../../.agents/skills/art-director/SKILL.md) — model picks + ref-anchor flow.
- [`.agents/skills/editor/SKILL.md`](../../../.agents/skills/editor/SKILL.md) — HyperFrames composition for noise stacks.
- `MEMORY.md` — append-only-on-generations, Kling no-music post-mix, 11labs geoblock fallback.
- Reference postmortem: `.ralphy/workspaces/<ws>/projects/analog-horror-fridge-001/POSTMORTEM.md` — the 12 rules and full $ accounting this skill codifies.
- Follow-up: scaffold `templates/entertainment-viral/analog-horror-psa/` via `ralphy template extract` once the format is run end-to-end again. Move the noise-overlay components to `src/lib/components/overlays/AnalogTV.tsx`.
