# Product 360 — Prompt Cookbook

Prompts for the keyframe (Gemini 3 Pro) and i2v (Kling v3.0 Pro) calls. Reference-required: every keyframe call MUST include the user-supplied product photo as a multi-ref input. The model never hallucinates branding.

---

## Master template

Build every keyframe prompt by filling these slots in order. Keyframe prompts are dense; i2v prompts are short and motion-focused.

### Keyframe (Gemini 3 Pro Image)

```
[ANGLE] of [product noun, very specific, materials], on [surface], against [background].
Camera: [lens / framing — full body, three-quarter, macro, top-down, low angle].
Lighting: [key light angle + temperature K] + [fill light intensity + temp] + [rim light strength + position].
Surface treatment: [reflective / matte / shadow under / diffuse base].
Material rendering: [reflections, refraction, grain, weave, texture details to emphasize].
Mood: [luxury / clinical / warm-editorial / dramatic-performance / soft-aspirational].
Photorealistic, commercial product photography, [resolution + aspect ratio].
NEGATIVE: no logos other than product's own, no text overlays, no people unless requested, no environmental clutter, no AI artifacts on edges.
```

### i2v motion (Kling v3.0 Pro)

```
[Motion type: turntable / orbital / push-in / pull-back / lift / static-with-light-shift].
[Speed: slow / medium / fast — with seconds-per-360 if rotation].
[Camera state: locked-center / orbiting / tilting].
[Product state: rotating / floating / static].
Smooth, jitter-free, no shake, no warping, no morphing of product geometry.
Lighting holds steady throughout. Maintain product proportions exactly.
generate_audio: false.
```

---

## Rotation pattern recipes

### Slow turntable (luxury, 10-15s/360°)

**Use for:** jewelry, watches, premium leather, fragrance.

**i2v prompt:**
```
Slow 360° turntable rotation, locked-center camera, product spins counter-clockwise on
invisible base. Full rotation across the clip duration. Camera does not move. Lighting
fixed. Specular highlights move naturally across surfaces as product rotates through the
key light. No shake, no jitter, no morphing. Cinematic, deliberate pacing.
```

### Medium turntable (fashion, 6-8s/360°)

**Use for:** bags, shoes, sunglasses, mid-tier electronics.

**i2v prompt:**
```
Smooth 360° turntable rotation at medium pace, completing roughly one full rotation across
the clip. Locked-center camera, product on neutral platform. Lighting from upper-left
holds steady. Subtle natural specular movement on materials. No camera drift.
```

### Fast spin (tech, 2-4s/360°)

**Use for:** earbuds, gadgets, dynamic-positioned products.

**i2v prompt:**
```
Fast smooth 360° spin, product rotates 1.5-2 full revolutions in clip. Locked-center
camera, no shake. Cool clinical lighting holds steady. Crisp specular highlights. Modern,
energetic feel. No motion blur on the product itself.
```

### Orbital camera (camera moves, product still)

**Use for:** large products (furniture, appliances), products that should look "discovered".

**i2v prompt:**
```
Camera orbits 90-180° around the static product at a fixed 35° elevation. Product
remains perfectly still in the center of frame. Smooth circular dolly arc. Background
parallax shows depth. Lighting setup is fixed in world space — as camera moves, product
catches different specular highlights. No shake, no wobble.
```

### Push-in macro

**Use for:** beat 3 (detail progression).

**i2v prompt:**
```
Camera pushes in slowly toward [specific detail — stitching / dial / engraving / texture].
Product holds position, no rotation. Smooth dolly forward, ending in macro framing on
the named detail. Shallow depth of field. Detail remains crisp; surrounding area falls
into soft focus.
```

### Pendulum swing (45° ↔ 45°)

**Use for:** frontal-focused products where back/profile aren't interesting.

**i2v prompt:**
```
Product rotates from 45° left through center to 45° right, then back to center. Smooth,
metronome-like cadence across the clip. Locked camera, fixed lighting. Front of product
stays the dominant view throughout.
```

---

## Lighting setup recipes

### Dramatic single-key + strong rim (luxury)

For: jewelry, watches, fragrance, premium leather.

```
Single hard key light at 30-45° above-left, daylight-balanced (5400K) or warm (3200K)
depending on metal tone. Minimal fill — shadows are part of the drama. Strong rim
light from behind-right at 60% key intensity, creating a clean halo edge. Background
black or deep navy. Product surface catches sharp specular highlights; shadows fall
deep and clean.
```

### 3-point soft diffuse (cosmetics / beauty)

For: skincare, perfume bottles, beauty palettes, wellness.

```
Soft key light at 60° above, large diffused source, 3200K warm. Fill light at 80%
key intensity from opposite side, same warmth — minimizes shadow harshness. Subtle
rim from behind, just enough to separate product from background. White or pale
gradient background. Surface: white or frosted, reflects light diffusely. Aspirational,
"dewy" aesthetic.
```

### Cool 3-point clinical (tech)

For: electronics, gadgets, premium hardware.

```
Key light 45° above-front, cool 5600K daylight. Fill at 55% intensity opposite, slightly
warmer (4000K) for depth without losing precision feel. Moderate rim light emphasizes
sleek edges and thinness. Background: dark gray to white gradient, or solid mid-gray.
Surface: matte dark or reflective black. Sharp specular highlights communicate
precision and modernity.
```

### Grazing warm key (leather / wood / textile)

For: leather goods, wooden objects, fabric products.

```
Key light at low 25° above-side, warm 3200-3500K, angled to graze across product
surface — reveals grain, weave, stitching, patina. Fill at 60% from opposite side,
matching warmth. Subtle rim. Background: warm neutral, lifestyle-suggestive (linen,
wood, stone). Light should "raked" across textures so every fiber registers.
```

### High-contrast performance (athletic / automotive)

For: sneakers, automotive parts, performance gear.

```
Key light 45° above, dramatic angle, neutral-cool 4800K. Fill 40% — maintains shadow
detail without softening drama. Strong rim light separates product from background.
Background: dark gradient or polished reflective surface. Surface: black polished or
dark matte. Multiple light sources to create reflective dynamism. Communicates speed
and engineering.
```

---

## Background recipes

| Background | Prompt fragment | Best for |
|---|---|---|
| Seamless white | `pure white seamless cyclorama background and surface, soft shadow directly under product, no gradient, maximum separation` | electronics, cosmetics, clean aesthetic |
| Seamless black | `pure black seamless background and surface, deep negative space, product gleams in isolation` | jewelry, watches, luxury, dramatic |
| Gradient neutral | `subtle gradient background fading from light gray top to darker mid-gray bottom, no banding` | versatile default for any category |
| Reflective surface | `polished black mirror surface beneath product, soft reflection extends downward, background dark gradient` | watches, luxury, automotive, premium |
| Marble / stone | `polished white-and-gray Carrara marble surface, soft warm light, neutral wall behind` | jewelry, watches, fragrance, beauty |
| Wood grain | `natural light oak wood surface, visible grain pattern, warm neutral background` | watches, jewelry, home goods |
| Lifestyle desk | `clean wood desk, minimal props (notebook corner, coffee out of focus), soft natural window light` | tech accessories, daily-carry, cosmetics |

---

## Common mistakes (refuse + redo)

1. **Asking for both product rotation AND camera orbit at once.** Pick one. The viewer's brain can track one motion vector at a time; two reads as a glitch.
2. **Hard cuts in the middle of a rotation beat.** Beat 2 is one continuous clip — never stitch two short rotations. Either generate the full beat as one i2v call, or cut to a macro at the end of beat 2.
3. **Improvising packaging or branding.** Hard refusal — the reference-required gate exists for this. If the user's product photo doesn't show the back / a side, generate that view from the multi-ref input or ask the user for an additional photo. Never make up a logo.
4. **Wrong color temperature for the category.** Luxury watch under 6500K daylight reads as a stock photo. Cosmetics under 5600K cool reads as clinical / pharmacy. Match temp to category (luxury / leather / wood = warm 3200-3500K; tech / metal / glass = cool 5400K+; cosmetics = warm-soft 3200K diffuse).
5. **Camera shake on the rotation.** Negative-prompt it explicitly: `no camera shake, no handheld feel, locked-center static camera`.
6. **Macro detail with the wrong focus plane.** Always specify the EXACT detail in the macro prompt (`extreme macro on the diagonal saddle-stitching at the bag handle base`), not just "close-up of the product".
7. **Spec overlay text rendered by the i2v model.** Don't. Generate clean clips with no text, then add Remotion text overlays in composition. AI-rendered text always misspells the brand.
8. **Adding VO when the user didn't ask for it.** This template is no-VO by default. Resist the urge.

---

## Worked examples

### Example A — Luxury wristwatch, vertical 9:16, 12s

**Beat 1 (Hook, 0-2s) — Spotlight Snap.**

Keyframe (Gemini): `Vertical 9:16 frame. Pure black. Single hard spotlight from upper-left at 35° above subject illuminates a luxury Swiss mechanical watch (stainless steel case, black leather strap, white dial with Roman numerals, sapphire crystal) at front-facing hero angle, slight 35° tilt. Watch positioned center-frame, lower third. Hard shadow falls right. Specular highlight glints sharply on polished steel bezel. Background pure black, reflective black surface beneath product showing subtle reflection. Cool 5400K key. Cinematic, high-contrast, photorealistic commercial product photography. No text. NEGATIVE: no other brand marks, no shake, no AI edge artifacts.`

i2v: `Static product, locked camera. Subtle increase in spotlight intensity over 2 seconds — light brightens 20%, specular on bezel intensifies. Watch does not rotate. No camera movement.`

**Beat 2 (Hero rotation, 2-7s) — Slow turntable.**

Keyframe end: same scene, watch rotated 180°, side profile visible (case thickness, lugs, crown, exhibition caseback if applicable).

i2v: `Slow 360° turntable rotation, locked-center camera. Watch completes one full rotation across 5 seconds. Spotlight fixed in space — as watch rotates through the key light, specular highlights sweep cleanly across the case. No shake, no jitter, no warping. Background and surface remain static. Cinematic, deliberate.`

**Beat 3 (Macro, 7-10s) — Push-in on dial face.**

Keyframe: `Extreme macro on the watch dial face. Roman numerals, hour hand, minute hand, second hand, sub-dial, date window all crisp. Fine concentric circle texture on dial visible. Specular highlight on sapphire crystal at top edge. Shallow depth of field — far edge of dial slightly soft. Cool key light. 9:16 vertical crop centered on dial.`

i2v: `Slow push-in toward dial face, no rotation. Camera dollies forward smoothly, ending in extreme macro. Lighting holds. Sapphire crystal specular intensifies as camera approaches.`

**Beat 4 (Finale, 10-12s) — Hero lock + CTA.**

Keyframe: same as Beat 1 hero shot, with very subtle warm shift (3500K hint adds gold tone to dial markers).

i2v: `Static. Subtle final 5° rotation back toward dead-center hero angle. Final spotlight intensity bump for hero presentation. Camera locked.`

Remotion overlays: `Heritage Automatic` fades in at 10.0s, `Swiss-Made · 38 Jewels` at 10.7s, `From $8,500` at 11.3s. All bottom-third, white sans-serif, fade-out at 11.9s.

Music: Cinematic strings sustain throughout, single bell chime sonic signature on final fade.

---

### Example B — Premium wireless earbuds, vertical 9:16, 10s

**Beat 1 (0-2s) — Particle Materialization.**

Keyframe: `Empty dark frame, fine golden particles drifting in soft volumetric haze.`

Keyframe end of beat 1: `Premium wireless charging case (matte black with subtle metallic accents) materializes center-frame, particles still settling around base. Cool 5600K rim light from behind-right.`

i2v: `Particles converge inward over 1.5s, accelerate, coalesce into the case. Final 0.5s: residual particles drift down and fade.`

**Beat 2 (2-6s) — Medium fast rotation.**

Keyframe end: case rotated 180°, charging port visible.

i2v: `Smooth fast 360° turntable rotation, ~3.5 seconds for full revolution. Locked camera, cool clinical lighting holds steady, crisp specular highlights on glossy case finish.`

**Beat 3 (6-9s) — Lid-open macro reveal.**

Keyframe: case lid open, earbuds nested inside, magnetic positioning visible.

i2v: `Case lid hinges open smoothly, lid pivots back 100°, revealing earbuds inside. Slow push-in to medium macro on earbuds.`

**Beat 4 (9-10s) — Lid-closed hero + CTA.**

Remotion overlays: `40hr battery · Active ANC · From $199`. Fade through final mechanical click + sonic chime.

Music: Ambient electronic pulse, harmonic chime at finale.

---

### Example C — Premium leather tote, vertical 9:16, 14s (multi-angle uploaded)

User uploaded 5 product photos (front, right side, back, left side, macro of stitching). Use them as multi-ref for keyframes — i2v interpolates rotation between adjacent angles.

**Beat 1 (0-2s) — Macro-to-wide pull.**

Keyframe: `Extreme macro on diagonal saddle-stitching, waxed thread, tan full-grain leather. Warm grazing light at 25° above-side, 3300K. Visible thread tension, slight wax sheen.`

i2v: `Camera pulls back smoothly over 2 seconds, surface widens, ending on full leather tote bag at three-quarter front hero angle on warm wood surface, neutral background.`

**Beat 2 (2-9s) — Slow turntable with multi-ref keyframes.**

Generate 4 keyframes from the 5 user photos: front (0°), right side (90°), back (180°), left side (270°). i2v call interpolates a continuous slow rotation across them.

i2v: `Slow 360° turntable rotation, ~7 seconds. Bag rotates counter-clockwise on warm wood surface. Locked-center camera. Warm key light at 25° above-left holds steady — light grazes leather, revealing grain and patina across all sides. Stitching catches highlight at every quarter turn. No shake.`

**Beat 3 (9-12s) — Macro on hardware + handle base.**

Keyframe: extreme macro on brass D-ring + reinforced handle base stitching.

i2v: `Slow push-in on the brass hardware, then quick dissolve to macro on handle-base stitching. Hold each ~1.5s.`

**Beat 4 (12-14s) — Hero lock + CTA.**

Return to three-quarter front. Remotion overlays: `Full-grain Italian leather`, `Heritage saddle-stitched`, `From $480`.

Music: Warm orchestral underscore, soft leather creak foley, final warm chime.
