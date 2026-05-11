# Prompt Cookbook — CGI Hardware

The vocabulary pack. Use it to write prompts an i2v model can actually act on, not the vague "make it look premium" mush that produces vague premium mush. Hardware-cinema lives or dies on **specificity of light, material, and motion** — quantify all three.

---

## Master prompt template

Paste, fill in, ship. Use one of these per beat (3-6 beats per spot).

```
[HOOK — 1-2 sentences. The first frame and what changes by the second frame.
Lift one of the 12 techniques from hooks.md.]

Camera: [movement type] — [speed e.g. "30°/sec"], [arc shape], [lens e.g. "85mm equivalent"],
[depth of field — sharp on subject, [bokeh / sharp] on background],
[easing — ease-in/ease-out], [frame rate, default 24fps cinematic or 30fps for tech].

Render Style: Photorealistic 3D rendering, indistinguishable from product photography
shot on [Phase One / Hasselblad / Leica], 8K detail. Octane / Redshift quality.

Lighting: [Key light: direction + Kelvin + hard/soft], [Fill light: direction + ratio,
typically 1/8 of key intensity], [Rim light: direction + Kelvin], [Background light or HDRI],
[Special: gobo for falloff, volumetric for atmosphere].

Subject: [Hardware product description — refer to user-supplied references for industrial-design
accuracy. Form factor, dimensions, key surfaces. NEVER invent ports, buttons, or finishes
that don't exist on the real product.]

Materials: [Each surface with PBR / SSS / Fresnel / anisotropic terminology.]
- [Surface 1, e.g. "CNC-machined aluminum chassis with anodized finish in [color],
  micro-scratches following machining grain, anisotropic specular response, 10% roughness"]
- [Surface 2, e.g. "Tempered glass back with sharp Fresnel reflections, faint chromatic
  dispersion at chamfered edges, 0% roughness"]
- [Surface 3 if relevant]

Motion / Animation: [What moves and how — speed, easing, duration of each sub-beat.
Mechanism actuations explicit: "button presses 0.8mm over 0.4s, returns over 0.3s".]

Background: [Deep black / studio grey #1a1a1a / brand-color gradient / brutalist concrete /
marble pedestal. No environmental clutter.]

Color Palette: [Subject colors + background. Always specify the Kelvin temperature target
for the lighting on the chassis — e.g. "neutral 6500K reading, no warm cast".]

Composition: [Rule-of-thirds anchor for hero pose. What's sharp, what's bokeh.
Negative space ratio (typically 50-70% in hardware cinema).]

Duration: [Total seconds. Beat-by-beat pacing.]
```

**Length sweet spot:** 14-20 lines. Hardware prompts are denser than character/environment prompts because materiality and lighting must be explicit.

---

## Hardware prompt vocabulary (industrial-design language)

The right term unlocks the right look. Channel the ID-magazine voice — Dieter Rams via Jony Ive via Teenage Engineering.

| Concept | Prompt phrase |
|---|---|
| Precision-machined | "CNC-machined aluminum, sharp 0.3mm chamfer, micro-tool-marks following the milling grain" |
| Soft-touch finish | "Soft-touch elastomer coating, matte finish, 60% roughness, slight rubber sheen" |
| Anodized finish | "Type-II anodized aluminum in [graphite / champagne / blue / red], micro-pore texture, anisotropic response" |
| Brushed metal | "Brushed steel with directional micro-scratches, anisotropic specular, 30% roughness, cool 6500K reflection" |
| Glass back | "Tempered glass back, sharp Fresnel, faint chromatic dispersion at edges, internal subtle reflection of subject above" |
| OLED display | "OLED display, deep blacks (true zero emission), high-contrast pixel grid visible at macro distance, sub-pixel RGB stripe" |
| E-ink display | "E-ink display, paper-like matte diffuse, no specularity, slight off-white substrate, sharp 1-bit contrast" |
| Mechanical key feel | "Mechanical key under finger pressure, 0.8mm travel, return spring action visible, slight wobble at top of stroke" |
| Knurled control | "Knurled aluminum dial, diamond-pattern texture, hard side-light catching micro-edges, anisotropic" |
| Chamfered edge | "Polished chamfer at 45°, mirror-finish, 0.5mm width, contrasting against matte main surface" |
| Antenna stub | "Polycarbonate antenna window, slight color difference vs metal chassis, parting line visible at macro" |
| Transparent polycarbonate | "Transparent polycarbonate housing showing internal components, faint blue-grey tint, refraction at edges" |
| Magnetic dock | "MagSafe-style magnetic ring, recessed 0.2mm into chassis, alignment dots visible at macro" |
| Leather strap | "Full-grain leather strap, visible pore texture, warm-grazing light revealing grain, subtle SSS in thin areas" |

**Don't say "nice metal".** Say "Type-II anodized aluminum, graphite, anisotropic, 20% roughness, 6500K reflection bias". The model latches onto every keyword.

---

## Lighting recipes (Kelvin-quantified)

Pick **one** per beat. Mixing setups muddies the result.

### 1. High-contrast noir (default for premium hardware)

"Single hard key (3200K, narrow beam) from extreme upper-left at 80° azimuth and 30° elevation, raking across the chassis. Fill at 1/8 key intensity (7000K) from lower-right, barely lifting shadows. Rim light (5600K) from rear-30° behind subject, separating silhouette from black background. Deep black void background. 2:1 contrast minimum."

**Use for:** flagship-tier hardware, audio devices, watches, cinematic Apple-keynote tone.

### 2. Soft studio 3-point (neutral, controlled)

"Soft diffuse key (5600K) from 45° upper-left through a 60×60cm softbox. Fill (5600K) from opposite side at 50% intensity, also softboxed. Rim (5600K) hard light from upper-rear at 30° creating crisp separation. Studio grey #1a1a1a seamless background. Low contrast 1.5:1, perfectly clean."

**Use for:** dev-boards, peripherals, neutral product reveals where the design speaks for itself.

### 3. Clinical bright (medical / laboratory positioning)

"Cool key (6500K) overhead through diffusion. Cool fill (6500K) from front at 80% intensity — almost shadowless. Mild rim (6500K) for separation. Pure white seamless. 1.2:1 contrast, almost flat. Crisp, surgical."

**Use for:** medical devices, scientific instruments, clean-tech, white-good appliances.

### 4. Dramatic spotlight (single beam from above)

"Single hard top-down spot (3000K) with circular gobo, edge falloff sharp at 30° beam angle. No fill. Rim from rear-30° (5600K) traces silhouette. Subject in pool of light, surroundings absolute black. Theatrical."

**Use for:** singular hero-pose finale beats, statement products, drama.

### 5. Brand-color wash

"Key tinted to brand color [#hex] from upper-left at 70°. Complementary-color fill at 1/4 intensity from opposite side. Rim in brand-color from rear. Background gradient from [brand-color at 20% saturation] to black. Stylized but readable."

**Use for:** brand-launch beats, color-launch SKU reveals, themed campaigns.

### 6. Window light (hand-held / lifestyle bridge)

"Warm 3000K window-source key from upper-left, slight diffusion. Cool 7500K sky-reflected fill from upper-right at 1/3 intensity. Subtle rim from environment. Brushed-concrete or marble surface, neutral grey environment with faint depth haze."

**Use for:** the hand-pickup beat (Hook #6), context bridge between studio and lifestyle.

**Always specify Kelvin.** "Warm light" is ambiguous. "3200K key with 7000K fill, 1:8 contrast ratio" is not.

---

## Camera move vocabulary (premium cinema = slow + confident)

| Move | When | Prompt phrase |
|---|---|---|
| Slow orbit | Default for hero reveal | "Slow orbital rotation around subject at 30°/sec, constant 25cm distance, ease-in/ease-out, 50mm equivalent lens, 24fps." |
| Dolly push-in | Detail emphasis | "Camera dollies forward 0.2 m/sec over 3s, total 0.6m travel. Depth of field tightens from f/4 wide to f/2 shallow. Focus locks on chamfer at the 2s mark. Ease-in/ease-out, 24fps." |
| Pull-back reveal | Scale / context resolution | "Camera pulls back 0.4-0.6m over 2.5s, ease-out. Focus stays sharp throughout. Reveals product in context as the frame widens." |
| Detail explore (rack-focus) | Multi-target macro | "Camera locked. Focus racks: 0-1.2s sharp on chamfer (everything else bokeh), 1.2s rack-focus to port (chamfer drops to bokeh), 2.4s rack-focus to button macro. Each rack-focus takes 0.4s with subtle easing." |
| Hand-pickup | Tactile bridge | "Locked camera. Hand enters from frame-right at 1.0s, fingers wrap chassis at 1.4s, lifts toward camera over 1.5s rotating to three-quarter, settles at hero pose at 3.0s." |
| Exploded-view fly-through | Mechanism reveal | "Camera glides through the gap between separating components at 0.3 m/sec, slight downward tilt, 35mm equivalent lens. Components hold position relative to camera." |
| Rack-focus only (locked) | Quiet hero hold | "Camera locked at hero angle. Focus shifts foreground (chamfer) → mid (logo) → background (rim) over 3s, each transition 1s with ease-in/ease-out." |
| Dolly-zoom (vertigo) | Statement beat (rare) | "Dolly forward while zoom narrows — matched mathematical inversion. Subject scale stays constant; perspective compresses dramatically over 2s. Use sparingly — once per spot maximum." |

**Pro tips.**
- **Linear motion looks robotic.** Easing curves look filmic. Always ease-in/ease-out unless explicitly stylized.
- **Premium = slow.** 30°/sec is the ceiling for orbits in this template. 0.2 m/sec is the ceiling for dollies.
- **Lens choice matters.** 50-85mm equivalent for product hero (compresses, flattens, "expensive"). 35mm for context. 100mm macro for detail beats. Avoid wide angles (24mm and below) — they distort and read as cheap.

---

## Material physics references

Get these right and the product reads as real. Get them wrong and the entire spot reads as fake.

| Phenomenon | What to specify |
|---|---|
| Subsurface scattering (SSS) | "Light penetrates the surface, scatters internally, exits diffusely." Use on: soft-touch elastomer thin-walls, leather, translucent polycarbonate, frosted glass. |
| Anisotropic specular | "Specular highlight stretches along the grain direction." Use on: brushed metal, knurled controls, machined aluminum. |
| Fresnel falloff | "Reflectivity increases at glancing angles." Use on: glass, polished metal, glossy plastic. Always mention for any reflective surface. |
| Chromatic dispersion | "Wavelengths separate at sharp edges, faint rainbow at chamfers." Use on: glass edges, crystal, sapphire crystal. |
| Caustics | "Refracted light projecting bright patterns on adjacent surfaces." Use when glass / clear plastic is near a lit surface. |
| Micro-roughness | "Surface roughness 5-30%, breaking specular into matte highlight." Quantify roughness. PBR workflow. |
| GI (global illumination) color bleed | "Subject color bleeds onto adjacent neutral surface in shadow." Use to ground the product in its environment. |
| Rim physics | "Rim light grazes the silhouette edge at 5-10% of the chassis depth, color-tinted to [Kelvin]." |

**Cheat code.** Every prompt should contain at least three of these terms across its surfaces. Without them, the renderer falls back to plastic-looking generic.

---

## Background recipes

| Recipe | Prompt phrase |
|---|---|
| Deep-black studio | "Pure black void background (#000000), no horizon line, infinite depth. Subject floats in negative space." |
| Studio-grey seamless | "Seamless studio grey #1a1a1a sweep, soft horizon transition from floor to wall, faint shadow grading." |
| Brand-color gradient | "Gradient from [brand-color at 30% saturation] at top to black at bottom, smooth radial vignette toward subject." |
| Brutalist concrete | "Brutalist polished-concrete surface, micro-pitting visible at macro distance, cool 6500K bias, faint depth haze receding." |
| Marble pedestal | "Carrara marble pedestal, polished surface, subtle veining, neutral 5600K reflection, soft shadow grading on the pedestal top." |
| Contextual environment | "Walnut wood desk surface, soft window light from upper-left, warm 3000K bias, shallow DOF on background. Subject hero-lit, environment recedes." |

**Restraint rule.** Never combine two backgrounds in one beat. Background changes between Act 1 and Act 3 are okay (e.g. void → contextual) but each beat is one environment.

---

## Music selection

Hardware cinema runs music-only by default. Match the music to the hardware category and brand positioning.

| Category | Recommended bed |
|---|---|
| Flagship phone / wearable / luxury watch | Cinematic-electronic with rising tension. Trent Reznor / Jeremy Zuckerman style. Sub-bass pulse, sparse synth pads, single piano accent at hero-pose frame. |
| Dev-board / SBC / hacker tool | Lo-fi electronic with mechanical percussion. Plaid / Boards of Canada style. Granular synth textures, playful but precise. |
| Audio device (synth / DAC / headphones) | Self-referential — use the device's own sound family. Synth-arpeggio that builds, OR cinematic-orchestral that ironically frames a tiny instrument as huge. |
| Appliance / power-tool | Industrial-electronic with metallic percussion. Rhythmic, confident, mid-tempo (90-110 BPM). |
| Keynote-launch positioning | Keynote-piano-arpeggio. Single-instrument piano sequence, rising third intervals, building chord every 4 bars. The Apple-launch trope, used unironically. |

**Music timing.** Build during Act 2. Swell peaks at the hero-pose frame in Act 3 (typically 75-85% through the spot). Fade-out under brand-mark hold.

**VO if used.** Single-line outro tag only ("Available now." / "[Product]. From [Brand]."). Calm narrator timbre. Never UGC peer voice. English / Russian / Spanish / Japanese — visual carries regardless.

---

## Sound design (mandatory foley layer)

Hardware cinema converts on **tactile** more than visual. Foley is non-negotiable.

| Element | Foley cue |
|---|---|
| Button press | Short tactile "thock" — 80-200Hz body, 2-4kHz click transient, 80ms total |
| Snap-fit (component reseating) | Two-stage: brief friction slide (50ms) into hard click (10ms transient) |
| Magnet-snap (dock / strap) | Soft pneumatic-pull whoosh into low-bass thud, total 200ms |
| Vibrate-feel (haptic) | Mid-frequency buzz 80-150Hz, 100-150ms duration |
| Fan-spin (cooling reveal) | Rising whoosh 200ms, settling into steady airy hiss |
| Dial detent | Spring-loaded click — sharp 4-6kHz transient, 30ms total |
| Boot chime / glow-on | Single rising tone, 0.6-1.0s, low-saturation timbre, ends on the resolved chord |
| Switch flip | Two-stage spring sound: tension-build (50ms) into release-snap (15ms) |

**Layer the foley under the music swell at -12dB to -18dB.** It registers without dominating. Without foley, the spot reads as "stock render"; with foley, it reads as "real product".

---

## Common mistakes

### 1. Lighting too flat = not premium
Wrong: "Even soft lighting from all sides."
Right: "Hard 3200K key from upper-left at 80° azimuth, 1:8 fill ratio, deep shadows on opposite side. Single rim from rear-30°."
Premium hardware demands contrast. Flat = catalog filler, not cinema.

### 2. Missing brand-mark / product name
Wrong: Spot ends on a hero pose with no overlay.
Right: Brand-mark + product name fade in over 0.8s on a single line at the hero-pose frame, hold 1.5s.
Without the outro overlay, the spot is brand-anonymous and the conversion path is broken.

### 3. Hardware looks plastic when it should be metal
Wrong: "Aluminum chassis." (vague)
Right: "Type-II anodized aluminum, graphite, anisotropic specular, 20% roughness, 6500K reflection bias, micro-tool-marks following CNC grain."
The model needs the material physics keywords or it falls back to generic plastic.

### 4. Motion too fast for "luxury" pacing
Wrong: 60°/sec orbit, 0.5 m/sec dolly.
Right: 30°/sec orbit, 0.2 m/sec dolly, ease-in/ease-out.
Speed reads as urgency. Premium reads as confidence. Slow down.

### 5. Surface details lost in shadow
Wrong: 4:1 contrast with no fill.
Right: 2:1 to 3:1 contrast, fill at 1/8 key, ensures texture stays legible in the shadow side.
If the chamfer / port / engraving disappears into black, the macro beat fails.

### 6. AI-improvised ports / buttons / colorways
Wrong: Letting the model invent a USB-C port count or anodizing color.
Right: Multi-ref keyframe with the actual product photos at workspace/projects/<id>/assets/uploaded/. Reference-required gate is hard rule #3.
Without refs, the model hallucinates ports that don't exist and the audience clocks it instantly.

### 7. Background clutter
Wrong: "Modern office desk with coffee cup, plant, notebook, lamp."
Right: "Brushed-concrete surface, soft window light, faint depth haze. No props."
Hardware is the entire subject. Props read as e-commerce-adjacent, not premium.

### 8. Hard cuts between detail beats
Wrong: Macro 1 hard-cuts to Macro 2 hard-cuts to Macro 3.
Right: Macro 1 → rack-focus → Macro 2 → smooth match-cut on shape continuity → Macro 3.
Premium pacing favors continuous focus pulls and shape-matched dissolves. Hard cuts read as social-feed, not keynote.

---

## Four worked examples

### A. Flipper-Zero-style devboard reveal (12s, 9:16)

```
Beat 1 — Establishing render (0-2.5s):

HOOK: Pure black frame. A faint cyan rim traces the silhouette of an orange-cased dev-board. At 1.0s, a hard warm key strikes from the upper-left.

Camera: Locked center. Subtle 0.05 m/sec dolly-in over 2.5s.
Render Style: Photorealistic 3D, indistinguishable from product photography on Phase One. 8K detail.
Lighting: Rim light (5600K, hard) from rear-30° fades up 0-1s. Key light (3200K, hard, narrow beam) snaps on at 1.0s from upper-left at 80° azimuth, raking across the chassis. Fill (7000K) from lower-right at 1/8 key intensity.
Subject: Compact pocket-form-factor multi-tool dev-board (refer to user references). Bright orange polycarbonate top case, dark grey base, monochrome dot-matrix display in the upper third, directional pad and discrete buttons in the lower two-thirds, antenna stub at top-left.
Materials: Top case orange polycarbonate, slightly satin-matte (15% roughness), faint SSS at thin edges. Buttons soft-touch elastomer (60% roughness, rubber sheen). Display matte (no specularity). Antenna stub black polycarbonate, slight texture differential vs main case.
Motion: Subject locked. Lighting animates as described. At 2.0s, display glows on with a single boot-icon (matrix-pixel render).
Background: Pure black void.
Color Palette: Hi-vis orange chassis (#FF6F1E), dark grey base, cyan rim, warm key, deep black background.
Composition: Subject centered, occupying 60% of vertical frame. Negative space dominant.
Duration: 2.5 seconds. Foley: low rumble building, soft tactile thock at boot-on.

Beat 2 — Port detail orbit (2.5-5s):

[similar dense prompt — orbit 90° around the side-edge revealing GPIO header pins, USB-C port,
microSD slot, in raking 80° side-light, 30°/sec, ease-in/ease-out, 100mm macro lens]

Beat 3 — Button macro with actuation (5-8s):

[similar — extreme macro on the directional pad, hard side-light, slow rack-focus from D-pad to
discrete buttons, single button-press actuation at 6.5s with foley thock]

Beat 4 — Hero pose finale (8-12s):

[similar — pull back to three-quarter hero composition, display showing brand boot-screen,
lighting holds, brand-mark + product name fade in over 0.8s at 9.5s, hold to 12s]
```

### B. Nothing-Phone-style transparent-back reveal (10s, 9:16)

```
Beat 1 — Profile silhouette to three-quarter (0-3s):

HOOK: Pure black frame. Device shows in pure side-profile silhouette, rim-lit by a single back light tracing only the curved edge. Over 2 seconds it rotates to three-quarter front, key light blooming as it turns to reveal full materiality.

Camera: Locked center. Subject rotates on invisible vertical axis from side-profile to 35° three-quarter over 2s, ease-in/ease-out.
Render Style: Photorealistic 3D, Hasselblad-equivalent quality, 8K detail.
Lighting: Rim light (6500K, hard) from rear-30° throughout. Key light (5600K, soft) fades up 1.0-2.0s from upper-left at 60° azimuth. Fill (7000K) at 1/8 from opposite side. No environment light — pure black void.
Subject: Slim flagship phone (refer to user references). Transparent rear panel revealing internal LED glyph patterns and component layout, aluminum frame, OLED display front (off in this beat).
Materials: Rear panel transparent polycarbonate with sharp Fresnel, faint blue-grey internal tint, internal components visible: copper coils, ribbon cables in white, screw-points in silver, perimeter LED light-pipes (off / glass-clear in this beat). Aluminum mid-frame with chamfered edge polished mirror, side surface matte 30% roughness. Glass front with sharp Fresnel.
Motion: 2s rotation. Lighting bloom synced with rotation completion.
Background: Pure black void.
Color Palette: Cool neutrals — silver, white, glass-clear, cyan rim, warm key bloom. Deep black.
Composition: Subject occupying 50% of vertical frame, centered.
Duration: 3 seconds. Foley: low pad rising, soft "settle" thud at rotation completion.

Beat 2 — LED glyph pattern glow-on (3-6s):

[macro on the rear panel, glyph LEDs ignite in a programmed sequence over 2s, white glow at
3500K, 100mm macro lens, locked camera, foley: single rising boot-tone resolving]

Beat 3 — Camera-glint hero (6-10s):

[pull to three-quarter hero, hard side-light catching specular highlight on camera bezel,
brand-mark + product name fade in over 0.8s at 7.5s, hold to 10s]
```

### C. Teenage-Engineering OP-1-style synth (15s, 9:16)

```
Beat 1 — Texture pull-back (0-3s):

HOOK: Extreme macro of brushed-aluminum micro-scratches in raking 80° light. Camera pulls back smoothly over 2.5 seconds, revealing the full top surface of a compact synth.

Camera: Dolly back 0.4m over 2.5s, ease-out. Lens 100mm macro to 50mm equivalent (zoom-out simulating dolly). Sharp focus throughout.
Render Style: Photorealistic 3D, Leica-equivalent quality, 8K detail.
Lighting: Single hard key (3000K) from upper-left at 80° azimuth — extreme raking. Fill (7500K) at 1/8 from opposite. Rim from rear-30° (5600K). Studio-grey #1a1a1a seamless background.
Subject: Pocket-format synth/sampler with brushed-aluminum top, white-key array on left third, color-coded discrete buttons across the top edge, multi-color rotary encoders on the right third, small OLED display center-top.
Materials: Aluminum top brushed (anisotropic, 25% roughness, 6500K reflection bias), white plastic keys (matte, 40% roughness, slight off-white), buttons each in different colors (matte plastic), encoders aluminum knurled (anisotropic, hard side-light catching micro-edges).
Motion: Camera dolly only.
Background: Studio grey seamless.
Color Palette: Neutral aluminum, white keys, primary-color button accents (red, yellow, blue, green).
Composition: Frame opens at extreme texture, resolves to top-down view of full instrument.
Duration: 3 seconds. Foley: brushy low pad, soft "reveal" swell.

Beat 2 — Color-key buttons macro (3-6s):
[macro slide along the button row, each button color resolving in turn, hard side-light,
single button press at 5s with foley thock]

Beat 3 — Encoder dial detent (6-9s):
[extreme macro on knurled encoder, single detent click rotation over 1.5s, foley: spring-loaded
detent click at 7s, anisotropic specular travel along the knurling]

Beat 4 — Key-press hero (9-12s):
[macro on white-key array, single key depresses 0.8mm over 0.4s, returns over 0.3s, OLED display
shows note value, foley: soft mechanical key-feel thock]

Beat 5 — Three-quarter hero finale (12-15s):
[pull to three-quarter hero composition, lighting subtly warms, brand-mark + product name
fade in over 0.8s at 13s, hold to 15s, music swells, final piano-arpeggio resolving chord]
```

### D. Apple-Watch-style wearable (10s, 9:16)

```
Beat 1 — Hand-pickup reveal (0-3s):

HOOK: Watch rests on a brushed-concrete surface in soft window light. A hand enters from frame-right, fingers settle around the case, and lifts the watch toward the lens, rotating to three-quarter at the apex.

Camera: Locked initially, slight push-in (0.1 m/sec) over 3s. 50mm equivalent lens.
Render Style: Photorealistic 3D, Phase One-equivalent quality, 8K detail.
Lighting: Window-light recipe — warm 3000K key from upper-left, slight diffusion. Cool 7500K sky-fill from upper-right at 1/3. Subtle rim from environment. Brushed-concrete surface, faint depth haze background.
Subject: Compact rectangular smartwatch with rounded chamfered case, OLED display showing watch-face, leather strap with stitching detail, digital crown on right edge.
Materials: Case Type-II anodized aluminum graphite (anisotropic, 20% roughness), display glass with sharp Fresnel and faint chromatic dispersion at chamfered edges, OLED showing watch-face content (deep blacks, sharp pixel grid at macro distance), leather strap full-grain (visible pore texture, warm-grazing-light grain detail, subtle SSS in thin areas), digital crown knurled aluminum.
Motion: Hand enters at 1.0s, fingers wrap case at 1.4s, lifts toward camera over 1.5s rotating to three-quarter, settles at hero pose at 3.0s.
Background: Brushed-concrete surface in shallow DOF, faint depth haze receding.
Color Palette: Warm neutrals — graphite case, cognac leather, warm window light, cool fill, neutral concrete.
Composition: Subject moves from lower-frame third to centered hero at 3s. Hand realistically lit and integrated.
Duration: 3 seconds. Foley: soft fabric rustle, gentle "lift" whoosh, settle at hero.

Beat 2 — Heart-rate sensor close-up (3-6s):
[macro on the back-case heart-rate sensor array, hard side-light revealing optical-sensor
geometry, slow 30°/sec orbit, 100mm macro lens, foley: subtle glass-clean tone]

Beat 3 — Screen-tap glance (6-10s):
[return to three-quarter hero composition, finger taps display at 7s, watch-face responds with
brief animation, brand-mark + product name fade in over 0.8s at 8s, hold to 10s, foley: soft
tap thock + UI-confirm chime, music swells to resolved chord]
```

---

## Iteration workflow

If the first generation misses, fix in this order:

1. **Hook lands?** If not, strengthen sentence one. More specific first-frame visual + explicit lighting animation.
2. **Hardware looks accurate?** If not, check that user-supplied references are passed in the multi-ref keyframe call. AI-invented ports / buttons / colorways are the #1 fail. Add more reference photos (3 → 5).
3. **Material reads premium?** If not, add SSS / Fresnel / anisotropic / PBR vocabulary. Specify Kelvin reflection bias. Quantify roughness percentage.
4. **Lighting flat?** If not, add Kelvin temperatures, fill ratio (1:8 default), rim direction, hard/soft qualifier. Move toward 2:1 contrast minimum.
5. **Camera too fast / too jittery?** If not, drop orbit speed to ≤30°/sec, dolly to ≤0.2 m/sec, add ease-in/ease-out explicitly.
6. **Foley missing?** If sound design wasn't layered, add it in composition. Without foley, the spot reads as stock render.

Two failed gens in a row → stop and report concrete options. Do not render mp4 over a failed quality gate (AGENTS.md hard rule #4).
