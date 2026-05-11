# Cartoon prompt cookbook

Concrete prompt language for `gemini-3-pro-image-preview` keyframes and `kling-v3.0-pro` i2v motion briefs. Pair with `TEMPLATE.md` (vibe, when-to-use) and `hooks.md` (the 2-second opener).

The model parses cartoon prompts in *layers*. Lead with style, then narrative, then technical specs, then effects/audio. Out-of-order layers reduce style coherence — keyframes drift toward generic illustration.

---

## Master prompt template

Fill each layer with selections from the vocabulary sections below. Don't skip layers — empty layers leak generic defaults into the frame.

```
[1. STYLE DECLARATION]
"Animation style: <primary cartoon style>. Line work: <line treatment>. Color palette:
<palette type with hexes or named colors>. Background approach: <background style>."

[2. CHARACTER / SUBJECT]
"<Subject> with <distinctive design features>. Proportions: <head-body ratio, limb style>.
Expression conveys <emotion>. <Distinctive accessory or detail>."

[3. ACTION / NARRATIVE]
"<Subject> performs <primary action>. <Hook from hooks.md>. <Reaction or follow-up beat>.
Closure: <held end-pose / freeze frame / snap-cut>."

[4. ANIMATION PRINCIPLES]
"Apply <2-3 named principles>: anticipation, squash-stretch, follow-through, arc motion,
exaggeration. Specific application: <which body part, which beat>."

[5. TECHNICAL]
"<framerate>, <duration>, <resolution>. Motion timing: <snappy / smooth / rhythmic>.
Easing: <slow-in/slow-out / linear / bounce>."

[6. EFFECTS + AUDIO]
"<Particle effects, motion lines, screen treatments>. Sound design: <named SFX from
the sound vocabulary section>."

[7. EMOTIONAL TONE]
"Overall tone: <comedic / whimsical / dramatic / contemplative>. Audience should feel
<target emotion>."
```

---

## Style vocabulary (pick exactly one primary)

| Style | Line work | Palette cue | Best for |
|---|---|---|---|
| Classic Disney | Soft 2-3px anti-aliased | Warm gradients, eye-shine | Fairy tale, magic, character emotion |
| Cartoon Network rubber hose | Bold 4-6px black | Primaries + bold accents | Slapstick, action, comedy |
| Flat vector minimalist | Thin 1-2px or none | 3-5 solid colors, no gradients | Explainers, motion graphics, B2B |
| 1920s rubber hose | Medium 2-3px black | Sepia + gold, art deco | Period whimsy, vintage charm |
| Pencil sketch | Variable gestural | Hatching, no fills | Personal narrative, storybook |
| Watercolor | None, edges feathered | Translucent layers, color bleed | Dreamy, emotional, fairy tale |
| Paper cutout | Hard paper edges | Layered flat colors | Children's stories, holiday |
| Pixel art (8/16-bit) | Hard pixel edges | 8-32 color limited palette | Retro, gaming, chiptune |
| Neon line / glow | Glowing strokes | Electric magenta/cyan on black | Cyberpunk, modern, surreal |
| Manga / anime | Sharp 2-4px black | Halftone shadow blocks | Drama, intensity, action |
| Claymation | Subtle organic | Realistic with material texture | Tactile, handmade, holiday |
| Oil painting | None, painterly | Modulated color, no outline | Gallery feel, art-house |
| Silhouette | Pure black character | Detailed colorful background | Stylish, dramatic, minimal-budget |
| Doodle / comic | Rough variable, shaky | Highlighter / watercolor wash | Casual, energetic, sketchbook |
| 3D toon-shaded | Cel outline, solid blocks | Hard shadow lines | Modern hybrid, brand mascots |

---

## Camera vocabulary

Cartoon i2v handles camera language differently from photoreal — the "camera" is closer to a notional drawing viewport. Use these terms:

- **Smash-zoom-in / smash-zoom-out** — single-frame scale change with motion blur. Hook-strength.
- **Slow pan** — works best for Ghibli, watercolor, claymation. Adds breathing room.
- **Whip-pan** — fast horizontal blur transition. Pairs with action sequences and quick cuts.
- **Push-in / dolly-in** — gradual camera approach. Good for emotional beats or product reveals.
- **Static lock-off** — camera holds, character moves. Default for slapstick / comedic timing.
- **Orbit / parallax** — for 3D toon-shaded and complex paper-cutout layers.
- **Rack focus** — works in painterly and watercolor styles; mostly fails in flat-vector.
- **Frame-shake** — single-axis shake on impact frame. Use sparingly — 1 per clip max.

Avoid handheld jitter language — cartoons read as "drawn", which presupposes a steady viewport. "Handheld" terms produce ugly oscillation in i2v output.

---

## Lighting vocabulary

Cartoon lighting is *graphic*, not physical. The model understands these terms:

- **Soft directional warm sunlight** — Ghibli, Disney, watercolor. Produces translucent colored shadows.
- **High-contrast hard shadow** — Cartoon Network, manga, silhouette. Sharp shape edges, single light direction.
- **Flat unlit / no shadows** — flat vector, doodle. Pure color reads form.
- **Bloom / glow** — neon line, pixel art, magic moments. Makes bright elements halo.
- **Rim light** — manga, 3D cel-shaded. Outline-edge highlight to lift character from background.
- **Cast shadow defining depth** — paper cutout, claymation. Hard shadows from layered geometry.
- **Atmospheric perspective with mist** — Ghibli, watercolor. Distance fades to lighter color, not just blur.
- **God-ray light shafts** — magic moments, dramatic reveals. Volumetric light through dust or mist.

Specify color of shadows, not just direction. "Translucent blue-green shadows" reads as Ghibli; "pure black hard shadows" reads as Cartoon Network.

---

## Sound design vocabulary

Cartoon SFX are *part of the prompt*. Name them. The composition stage will layer real audio, but the model uses sound cues to inform motion timing.

**Impact / collision**
- **Boing** — bouncy resonant ascending-descending pitch. Use on bounce, rebound, comedic elasticity.
- **Thud** — short low percussive bump. Heavy landing, comedic fall.
- **Glass shatter** — bright tinkling chord. Breaking, dramatic chaos.
- **Metal clang** — sustained ringing. Cartoon head-bonk.
- **Slide whistle (descending)** — pitch drop. Skid, slide, momentum loss.

**Movement / transition**
- **Whoosh / swish** — quick ascending tone. Rapid motion, object-flies-past.
- **Pop / bubble burst** — bright short percussive. Surprise appearance.
- **Zip** — rapid retract. Punch withdrawal, fast closing motion.
- **Stretching rubber** — slow ascending wobble. Limb stretching, taffy pull.

**Comedic / musical**
- **Comedic stab** — short orchestral sting. Reaction punctuation.
- **Twinkle / harp glissando** — magical sparkle moment.
- **Dramatic chord swell** — villain reveal, tension build.
- **Cartoon horn honk** — comedic emphasis, vintage cartoon feel.
- **Slide whistle (ascending)** — character launching upward, hopeful beat.

---

## Animation principles (cite by name)

Cartoon i2v models have been trained on terminology — citing principles by name produces stronger motion than describing the motion abstractly. Always name 2-3 per clip.

1. **Anticipation** — "Character crouches deeply (0.3s wind-up) before the jump."
2. **Squash and stretch** — "Compress 40% vertically on landing impact, then stretch-rebound to 110% height before settling."
3. **Follow-through and overlapping action** — "Hair lags 0.2s behind head movement; cape continues swaying after body stops."
4. **Arc motion** — "Hand traces curved arc from rest to gesture position, not straight-line path."
5. **Timing and spacing** — "Snappy 24fps with 2-frame holds on extreme poses."
6. **Exaggeration** — "Push the shock expression beyond realistic — eyes 3x normal size, mouth dropped to chin."
7. **Secondary action** — "Eyes blink independently while head tracks the moving target."
8. **Solid drawing / model consistency** — "Maintain proportions throughout — exaggerate via motion, not redraw."
9. **Appeal** — "Charming, likeable proportions — character has personality in every pose."

---

## Common mistakes (and the fix)

### 1. Mixed art styles in one frame
**Wrong.** "Disney-style smooth curves with Cartoon Network bold outlines."
**Fix.** Pick ONE primary style. If you want a flavor mix, use the primary at 100% and a single named accent ("…with subtle art-deco background patterns"). Never blend two character-design schools.

### 2. Vague color descriptions
**Wrong.** "Use bright colors."
**Fix.** "Hot magenta (#FF1493), electric cyan (#00FFFF), golden yellow (#FFD60A) at 100% saturation." Hex codes or precise named colors. Always.

### 3. Motion described as verbs only
**Wrong.** "Character jumps."
**Fix.** Cite animation principles by name. "Character crouches (0.3s anticipation), launches in arc trajectory, lands with 40% squash, rebounds with stretch overshoot, settles over 0.4s."

### 4. Detailed background competes with character
**Wrong.** "Character in lush detailed forest with hundreds of leaves and birds."
**Fix.** When the character drives the scene, simplify the background to flat color blocks or a soft gradient. Detailed background only when the *style itself* (Ghibli, watercolor) demands it.

### 5. Missing 2-second hook
**Wrong.** Opening that starts the action without a visual pop.
**Fix.** Start every clip with one hook from `hooks.md` — smash-zoom, color explosion, extreme expression, particle cascade, or fourth-wall break. Make 0.5-1.5s demand attention.

### 6. Inconsistent character proportions across keyframes
**Wrong.** Different keyframes with different head-body ratios — model loses identity.
**Fix.** Lock proportions in a "model sheet" snippet you paste into every keyframe prompt: "head 1.5x torso width, arms reach mid-thigh, 3-finger gloves, large oval eyes with white pupils."

### 7. Generic "cartoon" without sub-style commitment
**Wrong.** "Cartoon style."
**Fix.** "Classic Cartoon Network rubber hose, bold 5px black outlines, comedic timing." Always name the sub-style. Generic "cartoon" produces muddy default-illustration look.

### 8. Conflicting framerates
**Wrong.** "Smooth 60fps Cartoon Network rubber hose."
**Fix.** Match framerate to style. Rubber hose wants 12-24fps. Flat vector wants 30-60fps. See the FPS table in `template.json` constants and the style table above.

---

## Example prompt 1 — Cartoon Network rubber-hose comedy beat

Use case: 5-second slapstick comedy clip for a brand reel.

```
Animation style: Classic Cartoon Network rubber hose with bold 5px black outlines.
Line work: heavy uniform outlines, comedic exaggeration. Color palette: warm pastels
with bright magenta accent on gloves and nose, golden yellow background hills, soft
sky blue sky. Background: simplified graphic, flat color blocks, low detail.

Character: lanky anthropomorphic rabbit with oversized ears (2x head height), round
nose, simplified 3-finger gloves. Body: simple tube limbs, exaggerated rubber-hose
proportions, large oval eyes with white pupils.

Action: 2-second hook is rabbit SMASH-ZOOMING into camera with eyes bulging to
basketball size and motion blur trails. Then rabbit winds up for punch (anticipation
crouch), shoulder draws back, fist grows to massive size in squash-stretch
exaggeration. Punch launches forward, follow-through trail on sleeve. Lands in
victorious pose with speed lines radiating outward.

Animation principles: anticipation (0.4s wind-up before punch), squash-stretch (fist
inflates 200% during wind-up, stretches along motion vector during punch), follow-
through (trailing sleeve continues 2 frames after fist stops). Snappy 24fps with
2-frame holds on extreme poses.

Technical: 24fps, 5 seconds, 1080x1920 vertical, motion blur on fast movements.

Effects: Speed lines radiate outward during punch. Single white-flash impact frame.
Sound design: ascending whistle during wind-up, comedic boing on impact, brief
musical sting on victory pose.

Tone: high-energy slapstick comedy, exaggerated physics, audience should laugh and
feel motion excitement.
```

---

## Example prompt 2 — Ghibli-inspired peaceful scene

Use case: 8-second contemplative opener for a personal-essay video.

```
Animation style: Studio Ghibli 1990s aesthetic, soft anti-aliased 2px lines, hand-
painted feel. Line work: gentle gestural variable weight. Color palette: warm
naturalistic with sage greens (#9CAF88), golden yellows (#F4D03F), atmospheric
sky blues (#A8C8E0). Background: fully rendered painterly forest with impressionist
watercolor texture quality.

Character: young girl (8 years old appearance) wearing simple flowered dress, sitting
on weathered wooden bench. Soft wavy hair frames gentle face. Naturalistic
proportions, expressive eyes, gentle curves throughout.

Action: 2-second hook is gentle slow camera pan across misty forest revealing
character silhouette in shafts of golden sunlight. Girl sits stationary, slight head
tilt suggests listening to forest sounds. Hair moves gently with almost-imperceptible
breeze. Eyes blink slowly every 2-3 seconds, gaze stays distant. Closure: held
contemplative pose with dust particles drifting through light shafts.

Animation principles: secondary action (hair and dress micro-movement independent of
body stillness), follow-through (dust particles continue drifting after camera
settles), solid drawing (proportions held perfectly throughout — no model drift).

Technical: 24fps, 8 seconds, 1080x1920 vertical. Motion timing: slow, comfortable
pacing. Easing: slow-in / slow-out over 20-40 frames.

Effects: god-ray light shafts through mist, drifting dust particles, atmospheric
perspective. Sound design: ambient forest birdsong, gentle breeze, distant water,
sustained light piano chord underneath.

Tone: peaceful, contemplative, safe. Audience should feel quiet stillness and
connection to nature.
```

---

## Example prompt 3 — Flat-vector explainer beat

Use case: 6-second motion-graphics segment for a B2B explainer.

```
Animation style: Flat vector / modern minimalist, geometric shapes, solid color
fills, no gradients, no textures. Line work: thin uniform 1.5px white outlines or
none — color distinction defines form. Color palette: hot yellow (#FFD60A), electric
teal (#20B2AA), vibrant orange (#FF8C00), lime green (#00FF00), all at 100%
saturation against pure black (#000000). Background: pure black, no detail.

Character: no character — geometric icon shapes representing renewable energy
concepts. Sun (yellow circle), wind turbine (teal triangle from clean lines), solar
panel (orange rectangle), battery (lime green rounded rectangle).

Action: 2-second hook is bold primary-colored geometric shapes materializing rapidly
from black, synchronized to upbeat musical beat. Sun drops in from top-of-frame with
snappy 0.3s ease. Wind turbine slides in from left over 0.3s. Battery expands from
center over 0.3s. Each entrance holds 0.5s before next element appears. Closure:
all shapes settle into clean information layout.

Animation principles: timing (mathematical mechanical interpolation, not organic
follow-through), staging (clear focal hierarchy, each shape gets its own 0.3s window
of attention).

Technical: 30fps for smooth mathematical motion, 6 seconds, 1080x1920 vertical.
Motion timing: snappy 0.3-second per element. Easing: precise mathematical ease-out,
no overshoot wobble.

Effects: brief white flash on each entrance frame, no particles, no motion blur.
Sound design: upbeat electro beat synchronized to shape entrances, brief musical
ping on each settle.

Tone: modern, clear, educational. Audience should feel informed and confident about
the concept.
```
