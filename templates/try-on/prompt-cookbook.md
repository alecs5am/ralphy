# Try-On — prompt cookbook

How to actually generate a try-on reel that converts. The single biggest failure mode of this format is **model drift between variants** — same brief, same prompt skeleton, but the AI gives you a slightly different face / pose / lighting on each variant. The viewer's brain registers "different person each time" and projection collapses. Solve drift first, everything else is tuning.

---

## Master prompt template

Every try-on reel is built from ONE consistent base + N variant frames that swap only the product. The skeleton:

**Base seed (frame 0):**
```
[model archetype or reference], [framing — mirror selfie / front-cam], [environment], [lighting],
neutral pose, [base outfit / no-makeup base / hair-natural], looking at camera (or mirror),
9:16 vertical, photorealistic, hyperdetailed, natural skin texture
```

**Variant frame N (uses base seed as ref-image):**
```
[SAME model from reference image], [SAME framing], [SAME environment], [SAME lighting],
[SAME pose family — small variation OK], wearing [VARIANT PRODUCT — full description from user reference],
looking at camera (or mirror), 9:16 vertical, photorealistic, hyperdetailed
```

The discipline: every word that controls identity / framing / environment / lighting MUST be identical across N variant prompts. Only the product clause changes. Use the seed image as ref for every variant call so gemini-3 anchors the identity.

---

## Character-consistency discipline (the #1 thing)

Drift sources, in order of impact:

1. **No ref-image on variant calls.** Generating variants from text-only prompts will drift faces every time, no matter how detailed the prompt. **Always pass the seed frame as `image` to the gemini-3 call** so it has a visual anchor.
2. **Different lighting language across prompts.** "Soft window light" on V1 and "natural daylight" on V2 = different lighting even though they sound similar. Pick ONE phrase and copy-paste.
3. **Camera-angle words drifting.** "Mirror selfie" vs "selfie in mirror" vs "phone-mirror shot" — gemini-3 reads these as slightly different framings. Pick ONE.
4. **Pose language too loose.** "Confident pose" lets gemini-3 freelance. Specify: "right hand on hip, left hand holding phone at chest height, weight on left leg." Identical pose words across all variants.
5. **Product clause bleeding into identity.** "Wearing a red leather mini dress" can pull the model toward "young woman, edgy" archetype. If the user's reference model is older / softer, the dress will subtly age her down. Anchor identity FIRST in the prompt, product LAST.

**ralphy commands.** `ralphy generate image --model gemini-3-pro --ref <seed-frame> --prompt "<variant prompt>"` for every variant. Never call without `--ref`.

---

## Per-category variant vocabulary

### Fashion (outfits)

**Base seed clause.** `full-body mirror selfie, bedroom mirror with neutral wall behind, soft natural window light from camera-left, bare feet, hands relaxed, neutral expression`.

**Variant clause vocab.**
- Tops: `wearing a [color] [silhouette — fitted / oversized / cropped] [fabric — knit / silk / cotton] [garment — tee / blouse / sweater]`
- Dresses: `wearing a [length — mini / midi / maxi] [color] [fabric] [silhouette — slip / a-line / fitted] dress`
- Outerwear: `wearing a [color] [length — cropped / mid / long] [fabric — wool / leather / denim] [garment — jacket / coat / blazer], same [pants / skirt] underneath`

**Lock identity.** Same hair (don't swap to updo on V3 if V1-V2 were down), same jewelry baseline, same makeup level. Only the garment changes.

### Glasses (sunglasses / optical / readers)

**Base seed clause.** `head-and-shoulders front-cam selfie, neutral indoor background (white or off-white wall), soft daylight from camera-front, hair pulled back from face, neutral expression, no makeup or minimal natural makeup`.

**Variant clause vocab.**
- `wearing [shape — aviator / round / wayfarer / cat-eye / square / oversized] [frame material — black acetate / tortoiseshell / gold metal / clear plastic] [lens — dark / mirrored / clear / amber] sunglasses`
- For optical: `wearing [shape] [frame material] eyeglasses with clear lenses`

**Lock identity.** Same hair position (pulled back, exact same way). Same head tilt. Same expression. The face must be a constant — frames are the only variable.

### Makeup (lipstick / eyeshadow / blush)

**Base seed clause.** `head-and-shoulders front-cam selfie, neutral background (white or soft beige), soft even daylight from camera-front (no shadows), hair pulled back, neutral expression, base makeup applied (clean skin, mascara, brows done), [BARE LIPS / BARE LIDS / BARE CHEEKS] for swap-in`.

**Variant clause vocab.**
- Lipstick: `wearing [finish — matte / satin / glossy / metallic] [color — specific shade name from user reference, e.g. 'brick red', 'mauve nude', 'fuchsia pink'] lipstick, lips slightly parted`
- Eyeshadow: `wearing [finish — matte / shimmer] [color] eyeshadow on lids, eyes half-open looking at camera`
- Blush: `wearing [finish — powder / cream] [color] blush on cheeks`

**Lock identity.** Identical face position, identical lighting, identical hair. Specifically: do NOT vary the head tilt — even 5° tilt change reads as "different photo session" and breaks the swatch comparison.

### Jewelry (earrings / necklaces / rings)

**Base seed clause.** `head-and-shoulders selfie or close framing depending on jewelry — earrings need ear visible (hair pulled back on one side), necklaces need collarbone visible (open-neck top), rings need hand-near-face composition`.

**Variant clause vocab.**
- Earrings: `wearing [style — stud / hoop / drop / chandelier] [material — gold / silver / pearl / gemstone] earrings, [size — small / medium / statement]`
- Necklaces: `wearing a [length — choker / collar / princess / matinee] [material] necklace with [pendant / chain detail]`

**Lock identity.** Same head tilt. Same hair management. For earrings: hair pulled back identically across all variants — even slight hair drift over the ear breaks the comparison.

---

## Transition design (frame counts at 30fps)

| Transition | Frames | When to use | Implementation |
|---|---|---|---|
| **Snap-cut** | 1 frame | 7-variant tier-list, fast pacing, hard beats | Hard cut on beat. No motion blur. Remotion: butt-cut two clips. |
| **Mirror-flash** | 8 frames (~0.27s) | 3-5 variant glasses / makeup / jewelry | White-frame flash overlay 8 frames at the cut, then reveal next variant. Remotion: `<AbsoluteFill backgroundColor="white" />` for 8 frames, opacity ramp 0→1→0. |
| **Spin** | 24 frames (~0.8s) | 3-variant fashion outfits | Last 12 frames of clip A and first 12 frames of clip B both motion-blurred + rotation. Generated in kling with prompt "model spins quickly clockwise" at clip end. |
| **Walk-into-camera** | 30 frames (~1.0s) | GRWM-style, premium / "Same X, N ways" | kling clip: model walks toward camera, fills frame, then next clip starts with the new outfit on. The walk IS the transition. |

**Rule of thumb.** All transitions land on the music's beat (or downbeat for emphasis). Off-beat transitions kill the format more than any other defect. If you don't have music BPM yet, render at 120 BPM target — every variant is exactly 60 frames (2s) apart.

---

## Price / SKU overlay design

**Style.** Large bold sans-serif (Inter Black, Helvetica Bold, Druk). Bottom-third, anchored ~85% from top of frame. Two lines:
```
Line 1: PRODUCT NAME (smaller, ~60px)
Line 2: $XX.XX  ·  SKU-1234 (larger, ~96px, bold)
```

**Animation.** Fade in over 6 frames as the variant lands. Hold throughout the variant's clip. Fade out over 6 frames as the transition starts. Remotion: `interpolate(frame, [0, 6, clipDuration - 6, clipDuration], [0, 1, 1, 0])`.

**Color.** White on dark scenes, black on light scenes. Add a 4-6px text shadow / outline if the variant's background is mid-tone (gray, beige) for legibility. Do not use brand-color text — readability beats brand polish.

**Don't do.** Animated price counters. Sliding text. Glow effects. Anything that draws the eye away from the product. Overlay is a label, not a feature.

---

## Music

- **Trend pick.** TikTok-licensed audio matching the niche. Fashion → upbeat pop / hip-hop. Beauty → softer pop / R&B / hyperpop. Eyewear / accessories → electronic / hip-hop. Use `ralphy generate music --provider trend --niche fashion` to fetch a license-cleared trend bed.
- **ElevenLabs Music.** If trend audio isn't licensed in user's region, generate with ElevenLabs Music: `ralphy generate music --provider elevenlabs --prompt "upbeat pop instrumental, 120 BPM, energetic, modern, clean drum and synth, no vocals, fashion-reel ready" --duration 25`.
- **BPM target.** 110-130 for fashion / shoes. 90-110 for makeup / jewelry. 130-140 for hyperpop / Y2K aesthetics.
- **Drop alignment.** If the music has a drop, time it to land on the WINNER variant — V5 of 5, or V7 of 7. The viewer's body responds to the drop and they associate the feeling with the winner pick.

---

## 8 mistakes (in order of frequency / impact)

1. **Model drifts between variants.** The format-killer. Fix: always pass seed frame as ref-image; lock identity / framing / lighting / pose words verbatim across prompts.
2. **Transitions not on beat.** Cuts feel "off" without the viewer being able to articulate why. Fix: snap every transition to the nearest beat; if BPM unknown, render at constant 2s per variant.
3. **Price illegible.** Too small, too thin, or low-contrast on the scene. Fix: bottom-third, large bold sans, white on dark / black on light, 4-6px shadow.
4. **Too many variants for time.** 7 variants in 12s = 1.7s per variant — the viewer can't read or evaluate any of them. Fix: 3 variants → 8-12s, 5 → 15-20s, 7 → 20-25s. Don't compress.
5. **No "winner" pose at end.** The reel just stops. Conversion drops by half because there's no implicit recommendation. Fix: hold final variant 2-3s longer with a confident pose + extended overlay.
6. **Mixing framings within one reel.** V1 mirror-selfie, V2 front-cam, V3 full-body wide. Reads as a slideshow. Fix: pick ONE framing for the whole reel.
7. **Caption-heavy / VO-heavy.** Try-on is visual. VO + spoken-line captions clutter and slow pacing. Fix: text overlay only (product / price), VO max one line at the winner beat.
8. **Hallucinated branding instead of references.** AI-generated "Ray-Ban-style frames" or "Sephora-style lipstick" never match the SKU. The viewer clicks through, sees a different product, bounces. Fix: enforce reference-required gate, refuse without uploaded photos.

---

## Worked examples

### Example 1 — Sunglasses try-on, 5 frames

**Brief.** "5 sunglasses under $30 try-on, mirror-flash transitions, my reference photo attached, 5 frames from the brand catalogue uploaded."

**Stack.**
- Seed frame: gemini-3-pro, ref = user-photo, prompt = `head-and-shoulders front-cam selfie, white wall background, soft daylight from camera-front, hair pulled back, neutral expression, no sunglasses, looking at camera, 9:16 vertical, photorealistic`.
- 5 variant frames: gemini-3-pro, ref = seed frame + brand-catalogue-frame N, prompt = `[same description as seed] wearing [shape from catalogue N] [frame material from catalogue N] [lens from catalogue N] sunglasses, looking at camera`.
- 5 video clips: kling-v3.0-pro, 2s each, prompt = `model holds pose, slight head tilt left to right, sunglasses in focus, no body motion`.
- Transitions: 8-frame mirror-flash between every clip.
- Music: ElevenLabs Music, "upbeat hip-hop, 120 BPM, energetic, no vocals", 16s.
- Overlay: per-variant `[Frame Name] / $XX.XX / SKU` bottom-third.

**Total length.** ~14s (2s establishing + 5 × 2s + 4 × 0.27s flash + 2s winner hold).

### Example 2 — Outfit try-on under $50, 4 looks (walk-into-camera)

**Brief.** "Trying on every outfit under $50 from [store], 4 looks, walk-into-camera transitions."

**Stack.**
- Seed frame: full-body mirror selfie, bedroom mirror, neutral wall, base = white tee + jeans (unbranded base, can be hallucinated). User uploads 4 outfit photos.
- 4 variant frames: gemini-3-pro, ref = seed + outfit-photo N. Prompt anchors identity, swaps outfit.
- 4 video clips: kling-v3.0-pro, 3s each — model walks toward camera, last 30 frames are the approach. Each clip ends with the model close to camera.
- Transitions: walk-into-camera, hard cut from "fills frame" to next clip "fills frame in new outfit."
- Music: trend pop, 110-120 BPM.
- Overlay: outfit name + total price (sum of items) per variant.

**Total length.** ~14-16s.

### Example 3 — Lipstick shade test, 6 shades

**Brief.** "Testing 6 lipstick shades, color-test framing, snap-cut, my face reference + 6 swatch photos."

**Stack.**
- Seed frame: gemini-3-pro, head-and-shoulders front-cam, white background, soft front daylight, hair pulled back, neutral makeup base, BARE LIPS, neutral expression.
- 6 variant frames: ref = seed + swatch N. Prompt: `[same identity / framing / lighting] wearing [finish] [shade-name] lipstick, lips slightly parted, looking at camera`.
- 6 video clips: 2s each, kling-v3.0-pro, prompt = `subtle micro-expression, tiny smile beat at frame 30, no head motion`.
- Transitions: snap-cut on beat. No motion blur.
- Music: ElevenLabs Music, "soft pop / hyperpop, 130 BPM, light, energetic".
- Overlay: shade name + price per variant; final variant shows ★ winner tag.

**Total length.** ~14s (6 × 2s + 2s winner hold).

### Example 4 — Earring try-on, 4 styles

**Brief.** "4 earring styles try-on, mirror-flash, my face reference + 4 product photos."

**Stack.**
- Seed frame: head-and-shoulders, hair pulled back behind both ears, white wall, soft daylight, neutral expression, no earrings.
- 4 variant frames: ref = seed + earring-photo N. Prompt: `[same identity] wearing [style] [material] earrings, head tilted slightly to camera-right to show right ear`.
- 4 video clips: 2.5s each, kling-v3.0-pro, prompt = `slow head turn 15° camera-right then back to center, earring catches light at midpoint, hair stays back`.
- Transitions: 8-frame mirror-flash.
- Music: soft pop / R&B, 100 BPM.
- Overlay: style name + price + SKU.

**Total length.** ~12s.
