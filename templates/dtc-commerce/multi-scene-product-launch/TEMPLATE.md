# Multi-Scene Product Launch

> **Postmortem status: structured postmortem/ directory absent in source project.**
>
> TEMPLATE.md is structural-only by the skill's degradation rules. The "Key rules" + "Workflow" sections below were reconstructed from `WORKFLOW.md` + `BEST-PRACTICES.md` in the source project root — they are not part of the canonical 6-file `/postmortem` split.
>
> **Run `/postmortem` on the next project that uses this template** to produce the canonical chronological / lessons / bugs / cost / workflow rollup. That feeds the "lived-experience" section of this TEMPLATE.md on the next iteration.

---

## Vibe

A 27-shot, 50-60 second branded-hardware product launch in 9:16 — built as a behind-the-scenes commercial-set montage, NOT a clean product page. The signature look: lab-coat crew in the frame, printed-fabric backdrops (forest, city, moon — visibly printed, NOT real), industrial treadmill props, foam-panel sound rooms, cool desaturated blue-tinted grade. Two identity-locked AI cast members rotate through the vignettes, each shot showing the product in a different relation: worn, held, adjusted, macro-detail, floating reveal. Title cards bookend the spot (brand wordmark on black, then slogan, then URL).

What this template is FOR: any consumer-electronics or hardware launch where the product needs 20+ short evocative shots to establish ritual / spec / lifestyle in under a minute, and where identity drift across that many shots is the dominant production risk. Headphones, smartwatch, smart speaker, fitness tracker, camera, phone, drone — the SHAPE is portable.

What this template is NOT: a single-hero-shot product reveal (use `product-360` instead). Not a creator-talking-head testimonial (use `life-changing-testimonial`). Not a fashion lookbook (use `fashion-lookbook` — the wardrobe drives the shape there, not the product).

## Required inputs (slots)

| Slot | What it is | Source-project example |
|---|---|---|
| `{{brand_name}}` | The brand wordmark — appears on title cards and in product callouts | `Nothing (R)` |
| `{{product_name}}` | The product's commercial name — appears on the second title card | `Headphone (1)` |
| `{{product_descriptor}}` | A reusable one-sentence visual spec of the product, dropped into every scene's prompt verbatim so the product reads 1:1 across all 27 frames | `silver/white over-ear, transparent acrylic outer plate, two grey driver-vents, tiny red square accent, white padded headband` |
| `{{model_a}}` | Primary cast member — name + distinctive identity tags (hair, skin tone, face) | `young woman, pale soft features, short shaggy pink hair` |
| `{{model_a_wardrobe}}` | Canonical wardrobe spec for {{model_a}} — text + a visual ref image after pilot | `olive green vest over white long-sleeve crewneck, dark trousers` |
| `{{model_b}}` | Secondary cast member (optional — set to "none" for single-cast spots) | `young man, deep skin tone, defined cheekbones, short twisted dreadlocks` |
| `{{model_b_wardrobe}}` | Wardrobe for {{model_b}} | `white zip-up jacket, white pants` |
| `{{set_backdrop_a}}` | Primary printed-banner backdrop, called out as "printed banner NOT real environment" | `printed pine-forest fabric banner (visible fabric texture, NOT a real forest)` |
| `{{set_backdrop_b}}` | Secondary printed backdrop (city / moon / sky) | `printed moon-surface backdrop, foam-panel sound room, city-skyline banner` |
| `{{brand_slogan}}` | The closing slogan title card | `control your sound` |
| `{{brand_url}}` | The closing URL title card | `nothing.tech` |
| `{{scene_count}}` | Detected by `ralphy ref analyze-video --shots <N>` — drives the folder scaffold | `27` |
| `{{target_language}}` | Audio strategy — `source-1:1` (recreation), `en-elevenlabs`, `ru-elevenlabs`, etc. | `source-1:1` |

User must also supply (NOT slots, but required files):

- **Product reference set** — 4+ multi-angle product photos. AI-improvised packaging on a named brand reads as fake every time.
- **Base portrait per cast member** — one identity-anchor photo for each model.
- **Source mp4 URL** (if recreating an existing commercial) — pulled via `ralphy ref pull`.

## Beat structure (reconstructed from source `scenes-27.json`)

| Range | Function | Typical shot pattern |
|---|---|---|
| 0.0 - 1.2s | Title card #1 — brand wordmark on black | Static `<TitleCard>` |
| 1.2 - 11.7s | Act 1: {{model_a}} introduction on treadmill BTS set, walking + putting on product | 4 shots: wide tracking, close-up product-don, medium portrait push-in, wide BTS |
| 11.7 - 18.0s | Cast handoff to {{model_b}} on a foam-panel sound room + treadmill | 3 shots: medium push-in, wide BTS, close-up product adjustment |
| 18.0 - 27.7s | Act 2: surreal-physics beat (feet lift, body floats horizontally) — visualizes the product's emotional claim | 5 shots: foot-level close-up, low-angle float, wide BTS float, tracking monitor reveal |
| 27.7 - 32.4s | Product macro detail — fingers on dial, extreme close-ups | 2 shots: side-profile portrait + ECU dial rotation |
| 32.4 - 37.3s | {{model_a}} returns against a different printed backdrop (city) | 3 shots: low-angle look-up, hand-on-earcup, direct lens gaze |
| 37.3 - 45.3s | Dance climax — {{model_a}} dances freely in neutral studio + BTS | 5 shots: medium tracking, lateral tracking, low-angle arms-up, close-up backward, wide BTS dance |
| 45.3 - 47.3s | Title card #2 — product name (lowercase) | Static `<TitleCard>` |
| 47.3 - 49.0s | Coda — side-profile dance + extreme-close-up dial adjustment | 2 shots: handheld portrait + handheld ECU |
| 49.0 - 50.0s | Title card #3 — slogan ({{brand_slogan}}) | Static `<TitleCard>` |
| 50.0 - 54.0s | Title card #4 — cycling endcard ({{brand_slogan}} -> {{brand_name}} -> {{brand_url}} -> blank) | `<TitleCardCycle states={4}>` |

The shape is **dense (avg ~2s per shot), rhythm-driven, no VO** — the source-audio music carries the cuts. Even title cards inherit the music's beat.

## Key rules

> Reconstructed from source-project `BEST-PRACTICES.md` (22 pitfalls). These are NOT canonical /postmortem rules but they are the durable lessons.

1. **Identity-lock pipeline is non-negotiable for 20+ scenes.** Pilot one keyframe per character, pick the cleanest, copy to `assets/refs/characters/{{model_a}}-wardrobe-reference.png`, pass as `--ref` on every subsequent gen. Text-only wardrobe drifts catastrophically across 27 frames (cost ~$4 in regens on the source project alone).

2. **Use `google/gemini-3-pro-image-preview` for every 9:16 keyframe — never `openai/gpt-5.4-image-2`.** gpt-5.4 ignores the `--size` flag and returns 1024x1024 squares. Reserve gpt-5.4 for square product hero masters only.

3. **Use `kwaivgi/kling-v3.0-pro` for every i2v with photoreal faces — never `bytedance/seedance-2.0`.** Seedance's `InputImageSensitiveContentDetected` filter blocks ~80% of AI-generated faces independent of the prompt.

4. **Every Kling i2v prompt needs three blocks: STATIC LOCKED-OFF CAMERA + CONTINUOUS MID-MOTION + a NEGATIVE that names the deep-breath tic.** Kling defaults to (a) drifting the camera, (b) ramping motion from frame-0 standstill, (c) inflating idle chests. All three are fightable with the locked prompt blocks in `prompt-cookbook.md`.

5. **Every keyframe prompt passes 3-4 refs, in order: locked storyboard frame (source mid-shot) + character base + wardrobe-reference + product hero.** Call ref #1 a "locked storyboard frame" in text — that phrase is what stops gemini from re-framing.

6. **Default to STATIC camera unless you watched the source and confirmed motion.** Gemini's `camera_motion: tracking` annotation in `scenes-<N>.json` is unreliable — it confuses subject-in-frame motion with camera motion.

7. **Generate 4 variants per scene in PARALLEL, in one shell script with `&` + `wait`.** 28 generations finish in ~80s parallel; sequential is ~25min. $0.60/scene buys statistical insurance against bad RNG.

8. **Hard motion transitions don't survive a single Kling clip — cut in Remotion.** If a beat requires the body to rotate >45° or change action class (walk -> float, sit -> run), split it across two scenes with a hard cut. Don't burn $5 trying to make Kling do a transition.

9. **Kling minimum clip is 3s. Trim in Remotion via `<Sequence durationInFrames>` — never in Kling.** Because frame-0 is already mid-motion (per rule #4), the first 24 frames of a 3s clip are usable for any 0.8-1s source shot.

10. **For brand recreations, audio is source-1:1. No VO regen, no music regen.** The brand audio IS the point.

## Anti-patterns

- **DO NOT** use `openai/gpt-5.4-image-2` for 9:16 keyframes — it silently downgrades to 1024x1024.
- **DO NOT** use `bytedance/seedance-2.0` for character-heavy i2v — the content filter blocks the majority of photoreal AI faces.
- **DO NOT** describe wardrobe in text only — establish a visual wardrobe-reference image after the first pilot and pass it as `--ref` on every gen.
- **DO NOT** describe a printed backdrop as the actual environment ("misty pine forest") — always say "printed fabric banner with visible texture, NOT a real forest".
- **DO NOT** trust `camera_motion: tracking` from gemini's auto-shot-detection — default to STATIC and override only with eyes-on-source evidence.
- **DO NOT** ask Kling for a >45° body rotation mid-clip — use a Remotion hard cut between two static-pose clips instead.
- **DO NOT** generate a single variant per scene on first pass — 4 variants per scene is the minimum (parallel, $0.60 budget).
- **DO NOT** rely on `$?` after a `( ... ) &` bash subshell — capture `rc=$?` immediately. Silent API failures (key-limit 403, content-filter 400) otherwise look like exit 0.
- **DO NOT** flat-pack 80+ generated PNGs into one directory — scaffold `scenes/01/`, `scenes/02/`, ... `scenes/NN/` with `meta.json` + `original-scene-img.jpg` per folder before any image gen, so human review is feasible.
- **DO NOT** forget to `ln -s ../workspace/projects/<id> public/<id>` — Remotion `staticFile()` only sees `public/`, and every Remotion path in this template assumes the symlink.

## Workflow

> Reconstructed from source-project `WORKFLOW.md`. The canonical /postmortem workflow ordering is absent.

1. **Pull source + detect shots.** `ralphy ref pull <url>` -> `ralphy ref analyze-video <slug> --shots <N> --out workspace/projects/<id>/scenes-<N>.json`. Use Google AI Studio (`gemini-pro-latest`) with the full mp4 attached — frame-based `ralphy ref analyze` undercounts fast-cut commercials.

2. **Scaffold folders + extract mid-shot frames.** One shell script that mkdirs `scenes/01/` ... `scenes/NN/`, writes a `meta.json` per scene, and ffmpeg-extracts the source mp4 at each scene's midpoint into `scenes/NN/original-scene-img.jpg`.

3. **Symlink for Remotion.** `ln -s ../workspace/projects/<id> public/<id>`.

4. **Generate product hero masters** (5-8 angles). `openai/gpt-5.4-image-2` works fine here since they're 1:1. Three-quarter, side, front, flat-lay, macro, back-detail. These become the product `--ref` pool.

5. **Generate character identity masters.** `google/gemini-3-pro-image-preview`, one editorial portrait per cast member, passing the user-supplied base photo as ref. 4 variants -> pick the cleanest -> `assets/refs/characters/{{model_a}}-base.png`.

6. **Pilot one keyframe** (scene-02 or first content shot). Full locked prompt template, refs: locked storyboard frame + character base + product hero. Confirm 9:16 lands at 768x1376, wardrobe matches, identity is preserved.

7. **Establish canonical wardrobe-reference.** Copy the cleanest pilot to `assets/refs/characters/{{model_a}}-wardrobe-reference.png` — this is now `--ref #3` on every subsequent gen.

8. **Batch all remaining keyframes in parallel.** 4 variants per scene, all `&` + `wait`. ~$0.60/scene, ~$15-20 for a 27-shot batch. Pick `scenes/NN/picked.png` per scene.

9. **Pilot one i2v** (scene-02 again). Kling v3.0 pro with the locked STATIC + MID-MOTION + NEGATIVE block stack. Confirm no deep-breath tic, no ramp-up.

10. **Batch all remaining i2v in parallel.** 5 concurrent Kling submits ≈ time of 1. ~$0.42 per 3s clip, ~$10-15 for 22-25 clips.

11. **Compose in Remotion.** `src/videos/<id>/{fonts,scenes,TitleCard,index}.tsx`. Per scene: `<Sequence from durationInFrames><OffthreadVideo src muted style="objectFit: cover"></Sequence>`. Master audio: one `<Audio src="source-audio.mp3">` at composition root.

12. **Render.** `ralphy render <id>` -> `render/final.mp4` (1080x1920, 30fps).

## Custom Remotion composition (heads-up)

This template is `vibe-style`, not `vibe-reference`. There is NO generic `src/lib/templates/<slug>/` Remotion composition you can wire up via `composition-props.json`. The source project's composition lives at `src/videos/nothing-hp1-001/` and is hand-authored against its specific 27-scene timeline.

Consumers of this template will hand-author their own `src/videos/<new-id>/` composition. The template gives you:

- The beat structure (above) — copy the durations + functions, swap the visuals.
- The Remotion patterns (see `prompt-cookbook.md` "Remotion composition patterns").
- The font-injection helper (`ensureNothingFonts()` pattern in source project's `fonts.ts`).

If you build a generic version of this composition (parameterized title cards + scene-array driven `<Sequence>` loop), promote this template to `vibe-reference` and add `compositionTemplate.id` to `template.json`.

## What's still TODO on this template

- **Canonical /postmortem split** — run `/postmortem` on the next project that uses this template to materialize the 6-file rollup.
- **Generalized Remotion composition** in `src/lib/templates/multi-scene-product-launch/` — would promote this to `vibe-reference`.
- **Pool migration** — the locked-ref assets in `assets/refs/` are local-only for now. Phase 2 of this skill will migrate them to `ralphy-assets/pool/master-shots/` so they survive `ralphy template use` cleanly.
