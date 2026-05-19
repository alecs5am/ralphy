# Prompt Cookbook — Japanese Hyper-Motion Product Ad

Every prompt below has `{{slot}}` placeholders that the consumer fills from the new project's brief.

**The product-DNA paragraph is repeated VERBATIM across every image prompt.** That repetition is the identity-lock that keeps the product looking like itself across 14 stills. Do not summarize, paraphrase, or "tighten" it between scenes.

All image generations should pass 2-3 refs:
1. Canonical product reference (from brand site or user-supplied)
2. `assets/style-3d-floor-walls.png` (or `style-hyperpop-tilegrid.png`) for the 3D-stage palette
3. Scene-specific ref if applicable (e.g. `style-arcade-japanese.png` for the use-case scene)

After every gen-image: `ffmpeg -y -i in.png -map_metadata -1 -compression_level 100 stripped/out.png` to strip C2PA before i2v.

---

## Image generation

### Universal product-DNA paragraph (repeat verbatim every prompt)

```
Subject: The {{product_name}} device — {{product_dna_paragraph}}.
```

### Universal aesthetic block (prepend to every still prompt)

```
Hyper-energetic Japanese hyperpop product-ad aesthetic.
Saturated kawaii palette — cadmium-yellow base + hot-pink + cyan accents.
Glossy 3D scene with depth: tiled pink-and-cyan checkerboard floor + tiled back wall,
atmospheric pink haze, hot-pink rim light + cyan accent + warm sunny key.
Premium hyper-real CGI render with anime-product crossover overlays, 8K detail,
vertical 9:16 portrait composition.
```

### scene-01-first — entrance hook (gpt-5.4-image-2)

```
[universal aesthetic block]

[product-DNA paragraph]

Pose: the device flying in from the RIGHT EDGE of the frame at a 30-degree forward tilt,
captured mid-motion with a hot-pink motion-blur trail streaking diagonally behind it
from screen-right toward the device. Device is positioned in the right third of the frame,
about to slam toward the center. Background: pink-and-cyan tile-grid checkered floor lower
third, vertical pink tile wall behind, the moment just before a yellow sunburst flash
explodes. A few tiny anime starburst particles trailing the device. Vertical 9:16 composition.
```

### scene-01-last — slammed centered with katakana impact (gpt-5.4-image-2)

```
[universal aesthetic block]

[product-DNA paragraph]

Pose: device centered dead-center in the frame, frozen mid-air with a slight rotation wobble,
massive yellow sunburst flash exploded outward behind it on impact, anime starburst particles
BURST outward in all directions. Bold white katakana impact text 「バーン！」 (BAANN!) with
hot-pink outline punches in on the right beside the device. Vertical 9:16.
```

### scene-02-first / scene-02-last — macro tease, mascot reveal on screen (gpt-5.4-image-2)

```
[universal aesthetic block]

Extreme MACRO closeup of the {{product_name}} front face. The orange-bezel monochrome OLED screen
displays a clean high-contrast PIXEL-ART [mascot] FACE on the left side of the screen with the
katakana text [brand-kana-short] fully visible on the right side of the screen — all individual
screen pixels sharp and visible. Screen has cyan-blue glow. Surrounding the screen: the bright
orange rectangular bezel transitioning to WHITE plastic body. Just the edge of the orange 5-way
D-pad enters the frame on the right side. Ultra-shallow DoF razor focus on the [mascot] pixels.
Background: pink atmospheric haze with scattered floating cyan and white sparkle particles out
of focus. Soft warm sunny key + hot-magenta-pink rim from camera-right. Hyper-real CGI, 8K detail,
vertical 9:16 portrait.
```

`scene-02-first` = blank OLED (bezel only). `scene-02-last` = fully-lit mascot + kana revealed.

### scene-03-first / scene-03-last — human use-case (gpt-5.4-image-2 stylized variant)

```
Cinematic 3D anime-realistic scene in {{use_case_location}}. Subject: {{hero_archetype}}.
Anime-realistic CGI character matching the surrounding hyperpop scene style. Pose:
[scene-specific — first frame = entering the interaction; last frame = payoff moment with
visible result, e.g. coin-stream, particle-flow, spark contact]. The hero holds the {{product_name}}
in their hand. Background: {{use_case_location}} blurred behind, neon-pink + cyan lighting,
scattered confetti falling, pink tile-grid floor visible. Hyperpop kawaii palette saturation,
anime energy. Vertical 9:16.

[product-DNA paragraph — describe the device in hero's hand]
```

### scene-03-first / scene-03-last — PHOTOREAL human (banana, when realism > stylization)

```
PHOTOREALISTIC DOCUMENTARY PHOTOGRAPHY of {{hero_archetype}} (rephrase as a real young
[demographic] person, not an anime character). [scene-specific pose — first = pre-payoff,
last = payoff with visible reaction].
Shot on 50mm prime lens, shallow depth of field, natural skin texture, subtle ISO 1600 film
grain. Ambient neon-pink and cyan {{use_case_location}} lighting catches the face naturally.
Vertical 9:16, candid cinematic photography.

Negative: anime, manga, CGI render, 3D cartoon, kawaii stylization, plastic skin, exaggerated
facial features, sticker overlay, hyperpop palette, 2D flat illustration, comic-book lines,
glossy CGI, animated character.
```

### scene-03b-first — macro insert A (gpt-5.4-image-2)

Pattern: extreme macro of the use-case payoff. Object-pressing-object with particle flow.

```
[universal aesthetic block]

EXTREME MACRO closeup of the [edge / surface] of the {{product_name}}
([product-DNA short description]). A stream of glowing [particles — gold coins / pink
data-bits / cyan electricity] streaks toward the device — the leading particle arcs in
the air, compresses, and dissolves into [matching-color] particles as it touches the
white body edge, being absorbed INTO the casing. Other particles in the stream trail
behind, mid-flight. Hot-pink and cyan ambient glow surrounding everything. Background:
dreamy bokeh of blurred {{use_case_location}} neon lights pink and cyan, far out of focus.
Ultra-shallow depth of field, razor focus on the [particle]-body contact point.
Hyper-real CGI, 8K detail, vertical 9:16 portrait.
```

### scene-04-first / scene-04-last — chibi runway (gpt-5.4-image-2)

```
Top-down 75-degree elevated angle 3D scene. The {{product_name}} device ([product-DNA short])
lies FLAT and CENTERED on a pink-and-cyan tiled checkerboard floor with subtle reflection.
Pink tile wall visible at top of frame. Four 2D flat-anime sticker-style chibi mascot characters
with thick black outlines, drawn as flat 2D anime stickers overlaid on the 3D scene:
(1) [chibi-a — pigtailed girl / mascot-A], (2) [chibi-b — cat-eared chibi / mascot-B],
(3) [chibi-c — goggles-boy / mascot-C], (4) [chibi-d — product-on-screen mascot in chibi form].
Contrast between 2D flat stickers and 3D rendered {{product_name}} + scene.

[scene-04-first]: The four chibi characters are ENTERING the frame from the LEFT edge, the
front-most chibi mid-step (one foot raised) about to start running across the device, the
other 3 lined up behind in motion. Empty space on the right side of the device. A few sparkle
particles in the air. Vertical 9:16.

[scene-04-last]: The four chibi characters are MID-STRIDE RUNNING ACROSS the {{product_name}}
as if it's a fashion runway: [chibi-a action — jumping over the D-pad], [chibi-b action —
sliding on the screen], [chibi-c action — mid-flip in the air ABOVE the device],
[chibi-d action — at the far end leaving sparkle-trails behind]. Comic-style anime sparkle
trails follow each character. Two large katakana speech bubbles 「すごい！」 (sugoi!) and
「カワイイ！」 (kawaii!) in WHITE-with-pink-outline anime bubble lettering floating above
the scene. Vertical 9:16.
```

### scene-05-first / scene-05-last — vertical exploded reveal (gpt-5.4-image-2)

```
Wide angle 3D scene VERTICAL EXPLODED VIEW of the {{product_name}} device — frozen
mid-explosion broken into [N] distinct vertically-stacked floating layers with ~2cm
gaps between each, from TOP to BOTTOM:
1) [layer-1 description]
2) [layer-2 description]
...
N) [layer-N description]
Each layer slowly rotating, tiny motion-blur trails between layers. Small katakana
labels 「[label-1]」「[label-2]」「[label-3]」 floating beside select layers in
WHITE-with-pink-outline anime bubble text. The four chibi characters stand at the bottom
of frame looking UP with anime 「！？」 exclamation marks above their heads. Background:
pink-and-cyan tile-grid floor below the chibis, pink tile wall behind, scattered cyan +
white sparkle particles between layers. Hyper-real CGI product render with 2D anime
overlay style. Vertical 9:16.
```

`scene-05-first` = assembled device on floor with chibis around. `scene-05-last` = full exploded N-layer view.

For simple products, N=3 (top case / interior board / bottom case). For tech-density spike, N=10.

### scene-05b-first — macro insert B / internals glint (gpt-5.4-image-2)

```
[universal aesthetic block]

EXTREME MACRO closeup of [one internal detail — gold pin row / PCB trace / antenna /
display module]. [Detail-specific motion — a hot-pink rim-light glint races left-to-right
across the row, the leftmost N pins are SPARKLING with bright white anime-style starburst
gleams]. [Surrounding material] out of focus around. Background: dreamy bokeh of pink
hyperpop environment with scattered cyan sparkle dots. Ultra-shallow depth of field, razor
focus on the glinting [subject]. Hyper-real CGI tech-porn aesthetic, 8K detail, vertical
9:16 portrait.
```

### scene-06-first — mid-snap-back blur (gpt-5.4-image-2)

```
[universal aesthetic block]

Wide 3D scene of all [N] component layers of the {{product_name}} mid-SNAP-BACK collision —
layers half-merged with extreme motion-blur radial streaks pulling toward the center, a
nascent anime impact-flash starburst beginning to explode outward from the center of frame
in white and hot-pink. Pink-and-cyan tiled checkerboard floor below. Hyper-energetic
mid-impact frame. Vertical 9:16.
```

### scene-06-last — outro logo + slogan slam (gpt-5.4-image-2)

```
[universal aesthetic block]

[product-DNA paragraph]

Pose: device in classic 3/4 hero-pose centered in frame, slight forward tilt 5 degrees,
glossy specular highlights catching the accent color. ABOVE the device, a LARGE BOLD
katakana logo 「{{brand_kana_logo}}」 in WHITE color with hot-pink shadow-outline anime-style
block typography, fully readable. BELOW the device, a smaller katakana slogan
「{{japanese_slogan}}」 in cyan color with white outline. Background: pink-and-cyan
tile-grid checkerboard floor with subtle reflection of device, vertical pink tile wall,
intense yellow sunburst rays radiating from directly behind the device, scattered white
sparkle stars and cyan confetti dots in the air. Hyper-real CGI product render with anime
overlay typography. Vertical 9:16 final brand-stamp freeze frame.
```

---

## Video generation (i2v)

All i2v calls use ALL-CAPS action verbs (WHIPS, SLAMS, BURSTS, EXPLODES, VIOLENT, AGGRESSIVE). Explicit camera-move language is required.

### scene-01 — explosive entrance slam (seedance-2.0, 2s)

```
EXPLOSIVE high-velocity entrance: the {{product_name}} device WHIPS in from the far right
side of the frame at extreme speed with a massive hot-pink motion-blur trail streaking
behind it across the entire frame, then SLAMS to a violent dead-stop in the dead center
with subtle screen-shake and rotation wobble. A MASSIVE yellow sunburst flash explodes
outward behind it on impact, anime starburst particles BURST outward in all directions,
bold white katakana impact text 「バーン！」 with hot-pink outline PUNCHES into the frame
on the right beside the device. Camera: snap-zoom from wide to medium-close on impact,
then holds. Hyper-energetic hyperpop product-ad style, pink tile-grid floor and pink tile
wall, vertical 9:16.
```

### scene-02 — macro OLED reveal (seedance-2.0, 2s)

```
RAPID macro reveal: pixel-by-pixel typewriter animation lights up the OLED screen from
blank to fully revealed [mascot] face on the left and katakana [brand-kana-short] on the
right. Each pixel illuminates with a soft cyan-blue glow. Subtle kawaii sparkle-ping
particles appear with each new pixel. Camera: static macro with 5% punch-in over the
last 10 frames. Pink atmospheric haze background. Vertical 9:16.
```

### scene-03 — human 180° orbit + payoff (kling-v3.0-pro single-frame, 5s)

```
Cinematic candid documentary photography of {{hero_archetype}} at {{use_case_location}}.
Camera does a smooth dynamic 180-degree orbit around them over 5 seconds, starting from
their left profile, sweeping behind them, ending on their right profile. As the camera
reaches their right side, their expression transforms into a wide confident smile.
Mid-orbit, [secondary action — coin-arc / particle-flow / spark contact toward the
{{product_name}} in their hand]. Realistic confetti continues falling. Ambient neon-pink
and cyan {{use_case_location}} lighting catches their face naturally. Photorealistic
real-world capture, no anime stylization, real human movement and facial expressions,
50mm prime lens look. Vertical 9:16 portrait.
```

### scene-03b — macro magnet-pull (seedance-2.0, 2s)

```
VIOLENT magnet-pull macro: a stream of [glowing gold coins / pink data-particles / cyan
sparks] AGGRESSIVELY ARC through the air toward the right edge of the {{product_name}},
the leading particle COMPRESSES and DISSOLVES into the white body on contact, other
particles SLAM in sequence behind it. Hot-pink and cyan ambient glow pulses with each
contact. Camera: static macro with subtle screen-shake on each particle absorption.
Vertical 9:16.
```

### scene-04 — chibi BURST runway (seedance-2.0, 2s)

```
Top-down 75-degree elevated 3D scene. The {{product_name}} device lies flat on a
pink-and-cyan tiled checkerboard floor. Four cute 2D flat anime chibi mascot characters
([chibi-a], [chibi-b], [chibi-c], [chibi-d]) BURST in from the far left edge of the
frame and BLAST across the {{product_name}} at extreme high speed like a fashion runway
sequence — each chibi leaves a BRIGHT sparkle-comet trail and anime SPEED-LINES streak
across the device. [chibi-a action], [chibi-b action], [chibi-c action], [chibi-d action].
Two katakana speech bubbles 「すごい！」 and 「カワイイ！」 SLAM into the scene mid-action
with comic-impact-stars. Camera: rapid 20-degree orbit with subtle shake. Hyper-energetic
anime motion. Vertical 9:16.
```

### scene-05 — VIOLENT vertical explode (seedance-2.0, 2.4s)

```
The assembled {{product_name}} device on a pink tile floor VIOLENTLY EXPLODES UPWARD into
[N] distinct vertically-stacked floating layers ([layer-1], [layer-2], ..., [layer-N]).
Each layer BLASTS apart with massive motion-blur trails, AGGRESSIVELY rotates while
floating, with a 2cm gap between each. Anime impact-burst particles fly outward on the
explosion moment. Small katakana labels 「[label-1]」「[label-2]」「[label-3]」「[label-4]」
SLAM in beside select layers with comic-stars. The four chibi characters at the bottom
RECOIL BACKWARD with shocked anime 「！？」 marks above their heads, motion-blurred recoil.
Camera: rapid pull-back to fit all layers, with subtle screen-shake on explosion.
Hyper-energetic tech reveal. Vertical 9:16.
```

### scene-05b — internals glint cascade (seedance-2.0, 0.8s)

```
EXTREME MACRO of [internal detail]. A hot-pink rim-light glint SWEEPS rapidly
left-to-right across [the row / surface], individual [pins / traces / cells] SPARKLE in
rapid sequence with bright white anime-style starburst gleams cascading one after another.
[Surrounding material] out of focus around. Camera: static macro with subtle pulse.
Vertical 9:16.
```

### scene-06 — SLAM snap-back outro (seedance-2.0, 3.6s)

```
VIOLENT slam-back collision: all [N] separated component layers of the {{product_name}}
RAM together with extreme motion-blur radial streaks pulling toward the center, a MASSIVE
anime impact-flash starburst EXPLODES outward from the center of frame in white and
hot-pink. The assembled {{product_name}} SLAMS into place centered in a clean 3/4 hero
pose on a pink-and-cyan tiled checkerboard floor with subtle reflection — screen-shake on
impact. Bold white katakana logo 「{{brand_kana_logo}}」 SLAMS in pixel-by-pixel above the
device with comic-burst stars. Smaller cyan katakana slogan 「{{japanese_slogan}}」 PUNCHES
in below the device. Yellow sunburst rays radiate from behind the device. Camera: aggressive
dolly-in toward the device, freezes at the end. Hyper-energetic outro. Vertical 9:16.
```

### Optional — face-only expression escalation (kling-v3.0-pro single-frame, 2s)

Use when the use-case scene gets split into micro-shots (see split-instead-of-regen rule). This is the kling sweet spot — face-only motion, no body movement, no camera rotation.

```
Photoreal closeup portrait of {{hero_archetype}} in {{use_case_location}}. Their face
transitions through an escalating wave of [emotion-trope — overwhelming gambling-ecstasy /
hyped excitement / focused intensity]: their open-mouthed grin widens further showing all
teeth, head tilts slightly back, eyebrows arch up dramatically. Their [optional anime-trope
overlay — ¥-yen-symbol golden pupils GLOW brighter and slowly spin in place like rolling
coins, the gold gets more vivid and the symbol becomes more defined]. Confetti falls
slowly around them. Ambient neon-pink and cyan {{use_case_location}} lighting pulses on
their face. Photorealistic skin, real hair movement from head tilt. Subtle camera handheld
shake adds energy. 50mm prime lens shallow depth of field. Vertical 9:16 portrait.
```

---

## Music generation (ElevenLabs music_v1)

Generate 3 variants in parallel. Slot names lowercase-kebab only (`music-a-...`, never `music-A-...`).

### Variant A — orchestral hyperpop

```
Uplifting orchestral hyperpop instrumental, 130 BPM, big cinematic drum-fill stings on
every downbeat, soaring brass and strings, anime-arcade opening-theme energy, dramatic
crescendo, hyper-energetic with explosive hits on each beat-drop, 15 seconds instrumental
```

### Variant B — japanese electronic glitch / sakura-trap

```
Japanese hyperpop arcade instrumental, 140 BPM, glitchy electronic synth stabs,
drum-and-bass meets orchestral hits, sakura-trap energy, neon-pink urban tokyo aesthetic,
hyper-energetic punchy bass and tight snare, 15 seconds instrumental
```

### Variant C — kawaii anime j-pop crossover

```
Bright kawaii anime opening theme instrumental, 128 BPM, energetic synth lead with
orchestral hits and 8-bit chiptune accents, J-pop crossover, uplifting magical-girl-anime
energy, sparkly bells and crystal hits, 15 seconds instrumental
```

**Empirical finding from source project:** Variant A (orchestral) drops energy mid-track; Variants B (electronic-glitch) and C (j-pop) hold tension through the full 15s. B was the winner.

---

## SFX layer (per cut)

Layered via `<Audio>` in `scenes.ts → sfx[]`. Use Remotion library where available, generate via ElevenLabs SFX otherwise.

| Cut | SFX |
|---|---|
| 01 | whoosh + impact-bass (on the slam) |
| 02 | kawaii sparkle-ping × N (pixel-typewriter reveal) |
| 03 | location-specific (e.g. arcade-coin chime) |
| 03b | magnet-suck whoosh |
| 04 | chibi cartoon SFX (jump, slide, mid-flip woosh) |
| 05 | vertical-explode whoosh + screen-shake bass |
| 05b | glint ding × N (one per pin/cell sparkle) |
| 06 | brand-stamp typewriter beep + final impact-flash bass |
