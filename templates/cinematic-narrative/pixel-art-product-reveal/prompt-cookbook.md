# Prompt cookbook — pixel-art-product-reveal

Paste-into-ralphy prompts. Every prompt below uses `{{slot}}` placeholders. Fill them from the template's "Required inputs" table in `TEMPLATE.md` before running `ralphy generate`.

Slot map quick-reference (full table in `TEMPLATE.md`):

| Slot | Example (Playdate) |
|---|---|
| `{{product_name}}` | Playdate |
| `{{product_brand}}` | Panic |
| `{{product_brand_color_hex}}` | `#FFD400` |
| `{{product_brand_color_name}}` | bright yellow |
| `{{product_physical_form_factor}}` | small handheld game system, ~76×74×9 mm, rounded corners, four flat-head screws, black bezel surrounding a 1-bit Sharp Memory LCD, yellow plus-shaped D-pad on left, yellow B/A buttons on right |
| `{{product_gimmick}}` | silver/aluminum crank handle flipped out from the right edge |
| `{{product_gimmick_verb}}` | cranks |
| `{{duotone_dark_hex}}` | `#3D3A30` |
| `{{duotone_light_hex}}` | `#B0AB94` |
| `{{duotone_palette_words}}` | warm charcoal-olive newspaper-ink on light putty-cream newsprint |
| `{{style_ref_corpus_names}}` | Casual Birder, Crankin's Time Travel Adventure, Demon Quest '85, Forrest Byrnes Up In Smoke, Sasquatchers, Pick Pack Pup, Inventory Hero, Hyper Meteor |
| `{{ensemble_cast_4}}` | Casual Birder (twee binoculars character), Pick Pack Pup (cartoon dog), Whitewater Wipeout (surfer dude), Inventory Hero (overloaded RPG knight) |
| `{{wordmark_text}}` | playdate |
| `{{tagline_text}}` | Just for fun. |

---

## 0. Shared aesthetic anchor (paste verbatim at the top of EVERY image prompt)

Save this as `.prompts/_aesthetic.txt` in the consuming project. Every scene prompt is `cat _aesthetic.txt scene-XX.txt` at gen time.

```
{{PRODUCT_BRAND_UPPER}} AESTHETIC — DUOTONE SHARP-MEMORY-LCD-CLASS ILLUSTRATION:

The entire visual world is rendered in a STRICT TWO-TONE DUOTONE palette: dark {{duotone_dark_hex}} ({{duotone_palette_words}} dark side) and light {{duotone_light_hex}} ({{duotone_palette_words}} light side). NO pure black, NO pure white, NO color of any kind in the environment. This is the authentic {{product_name}} screen look — like ink-on-paper / reflective e-ink / vintage Mac System 1.

ALL SHADING is rendered with HEAVY HALFTONE / ORDERED BAYER DITHERING — every grey transition uses cross-hatch dot patterns, never flat shades. Highlights, midtones, shadows: all dithered. Even open sky areas have a subtle dither pattern. NO flat fills (except solid silhouettes), NO soft gradients, NO Gaussian blur — only crisp halftone dot stipple.

ART STYLE is SMOOTH HAND-ILLUSTRATED line art with confident dark-{{duotone_dark_hex}} outlines, NOT chunky 8-bit pixel art. Characters and props have organic curves, well-drawn anatomy, distinct line weight — like an indie zine or risograph print. Custom illustrated typography (bold, often with serifs, italics, or drop-shadow) — NOT bitmap fonts.

THE ONLY COLOR IN THE FRAME is the {{product_brand_color_name}} {{product_name}} device itself ({{product_brand_color_hex}} saturated plastic). The device is rendered PHOTOREAL — glossy plastic, real specular shading on its own surface — and sits as a HARD CUTOUT against the duotone halftoned world. Hard layer-split, no painterly blend.

REFERENCE FEEL: {{style_ref_corpus_names}} — those works are the EXACT target.
```

The phrase **"NOT chunky 8-bit pixel art"** is load-bearing. Drop it and the model defaults to Game Boy-style sprite blocks (the wrong reading of "pixel art" that burned $3 on `playdate-pixel-001` v1 stills).

## 0b. Product DNA fragment (paste verbatim in every prompt that shows the device)

```
DEVICE — render PHOTOREAL against the duotone halftoned world (HARD LAYER SPLIT, no painterly blend). The {{product_name}} by {{product_brand}} — {{product_physical_form_factor}}. {{product_gimmick}}. Glossy {{product_brand_color_name}} plastic ({{product_brand_color_hex}}) with realistic specular shading. THIS IS THE ONLY COLOR / NON-DUOTONE OBJECT IN THE WHOLE FRAME.
```

---

## Image generation

`gpt-5.4-image-2` for product fidelity + typography (10/14 stills on the source). `gemini-3-pro-image-preview` for hybrid photoreal-subject + illustrated-world scenes (4/14). See `model-stack.md` for the exact per-slot mapping.

Every call passes 3-4 ATOMIC refs (one work per file). NEVER pass a whole-page screenshot.

### scene-01-first — HOOK / entrance frame 1 (gpt-5.4-image-2)

```
Hyper-energetic vertical 9:16 product-ad keyframe — Scene 01 FIRST, the entrance moment.

[paste shared aesthetic anchor]

[paste Product DNA fragment]

POSE — the {{product_name}} is MID-FLIGHT, ENTERING THE FRAME FROM THE FAR RIGHT EDGE. Only the LEFT HALF of the device is visible — its right half is CROPPED OFF the frame on the right. Tilted ~20 degrees clockwise like it's been hurled sideways. Behind it, trailing toward the LEFT, a JAGGED {{duotone_dark_hex}} INK-TRAIL motion-blur rendered in heavy halftone dot stipple — like overlapping cross-hatched ghosts of the device. The trail is in the duotone palette (NOT solid black, but {{duotone_dark_hex}}-halftone stipple on the {{duotone_light_hex}} background). The screen of the {{product_name}} is dark (off). No speech bubble yet.

ENVIRONMENT — flat-perspective duotone illustration filling the rest of the frame: a halftone-dithered ground plane ({{duotone_light_hex}} below {{duotone_dark_hex}} sky) with smooth-illustrated hills, hand-drawn pine trees, a distant illustrated landmark, scattered illustrated stars in the sky. Every surface heavily dithered with halftone patterns. NO checker floor.

COMPOSITION — 9:16 portrait. {{product_name}} occupies the RIGHT 30 percent of frame, half-cropped by the right edge. Halftoned duotone illustrated world fills the rest.

STYLE — glossy photoreal CGI {{product_brand_color_name}} {{product_name}} device + flat duotone halftone hand-illustrated world (HARD layer split). Premium ad-quality keyframe, vertical 9:16 portrait, 8K detail on the device, dense halftone dither everywhere else.
```

Pass refs: canonical product photo + 2-3 style-corpus refs.

### scene-01-last — HOOK / entrance frame 2 (gpt-5.4-image-2)

Same scaffold as scene-01-first, but `POSE` rewritten:

```
POSE — the {{product_name}} has SLAMMED to a dead-stop dead-center, frozen mid-air. Tiny rotation wobble visible (3 degrees off horizontal). The motion-trail behind it is FADING. An illustrated speech bubble with a chunky illustrated word "HELLO." (or a brand-appropriate greeting) PUNCHES into frame on the right side — the same speech bubble style as the device's boot screen. Custom-illustrated halftone bubble outline, dithered fill.

COMPOSITION — 9:16 portrait. Device dead-center, occupying ~35 percent of frame width. Speech bubble at upper-right. Duotone halftoned illustrated world fills the rest.
```

### scene-02-first / scene-02-last — MACRO tease (gpt-5.4-image-2)

```
Extreme macro vertical 9:16 keyframe — Scene 02 {{FIRST|LAST}}.

[paste shared aesthetic anchor]
[paste Product DNA fragment]

POSE — EXTREME MACRO on the {{product_name}}'s screen. The black bezel and {{product_brand_color_name}} body are visible around the edges in soft DOF blur. Camera fills 90% of frame with the screen.

SCREEN CONTENT ({{FIRST}}) — the screen is blank, just the duotone halftone-dithered "wallpaper" texture of the {{product_name}} OS — small dot stipple background.

SCREEN CONTENT ({{LAST}}) — a smooth hand-illustrated halftone cartoon character (one of {{style_ref_corpus_names}}) has fully drawn itself onto the screen — line by line, halftone shading complete, character winks at camera. Pixel-illustrated text "PRESS A" (or brand-appropriate CTA) has typed in beside the character.

COMPOSITION — 9:16 portrait. Screen fills 90% of frame, slight tilt for energy.
```

### scene-03-first / scene-03-last — HERO + gimmick orbit (gemini-3-pro-image-preview)

This is the hybrid photoreal-element + illustrated-world scene. Gemini is the only model that lands the HARD layer-split cleanly.

```
Smooth hybrid keyframe — Scene 03 {{FIRST|LAST}}.

A {{HERO}} holds the {{product_brand_color_name}} {{product_name}}. The thumb and forefinger {{product_gimmick_verb}} the {{product_gimmick}}.

Where {{HERO}} is one of:
 - "photorealistic human RIGHT HAND, well-lit, neutral skin, age-neutral 20s-30s, no jewelry, 50mm prime lens look, shallow DOF" (the original Playdate scene-03 v1)
 - "charming smooth-illustrated halftone cartoon character with confident dark outlines, mid-twenties cool, gender-neutral, wearing comfortable clothing, three-quarter angle, knees-up framing" (the Playdate scene-03 v3 layer-cross variant)

[paste shared aesthetic anchor]
[paste Product DNA fragment]

CAMERA / SCENE PROGRESSION:
 - {{FIRST}}: LEFT profile of the device. {{HERO}} grips the {{product_gimmick}} mid-gesture. The illustrated world behind is paused — tiny illustrated character on screen frozen.
 - {{LAST}}: 180-degree camera rotation later, RIGHT profile of the device. {{product_gimmick}} rotated 270 degrees. Illustrated character on screen now mid-stride.

ENVIRONMENT — flat duotone illustrated background fills the rest of the frame: halftone-dithered cumulus clouds above, dithered hills behind, hand-drawn pine trees on either side, scattered illustrated stars in the sky. EVERY SURFACE heavily halftoned. NO color anywhere except the device.

LIGHTING — soft photoreal documentary lighting on hand/character and device (if HERO is photoreal) OR flat 2D illustration lighting (if HERO is illustrated). The device always has real specular shading.

COMPOSITION — 9:16 portrait. HERO + device fills the middle 70% of the frame. Camera tight on the gesture.

STYLE — HARD LAYER SPLIT: {{HERO}} + photoreal device on top of flat duotone halftone illustrated world (clouds, hills, trees). NO PAINTERLY BLEND. The duotone world is a 2D illustration layer. The device is the only color.
```

**Key tokens** (from `playdate-pixel-001` postmortem rule #7): the phrase `HARD layer split — photoreal ... + flat ... — no painterly blend` and the explicit `2D illustration layer` wording prevent gemini from blending the photoreal hand into a painterly background.

### scene-03b-first — gimmick macro insert (gpt-5.4-image-2)

```
Extreme macro vertical 9:16 keyframe — Scene 03b, insert macro of the {{product_gimmick}}.

[paste shared aesthetic anchor]
[paste Product DNA fragment]

POSE — EXTREME MACRO on the {{product_gimmick}} alone. The texture (knurled grip / dial markings / slider channel) is in razor-sharp focus. The {{product_brand_color_name}} body of the device is in soft DOF blur around the gimmick. A first illustrated halftone sparkle-star is just BLOOMING beside the gimmick (4-pixel sparkle pop, like Zelda rupee glints) — telegraphing the rotation that's about to happen.

COMPOSITION — 9:16 portrait. Gimmick centered. Yellow body out of focus on the periphery.

STYLE — photoreal macro material precision on the gimmick + illustrated halftone sparkle. HARD layer split.
```

### scene-04-first / scene-04-last — ensemble runway (gemini-3-pro-image-preview)

```
Top-down 75-degree-angle vertical 9:16 keyframe — Scene 04 {{FIRST|LAST}}.

TOP-DOWN 75-DEGREE ANGLE looking DOWN onto a {{product_name}} device lying FACE-UP on a flat duotone halftone hand-illustrated floor.

[paste Product DNA fragment]

FLOOR — a FLAT DUOTONE HAND-ILLUSTRATED FLOOR extending in every direction, in the duotone palette ({{duotone_dark_hex}} on {{duotone_light_hex}}). Hand-drawn dotted/halftone GRID or DITHER ARRANGEMENT — like a {{product_name}}-style menu background or zine-print floor: small repeating halftone shapes, cross-hatch, ordered Bayer dither. NOT a checker floor. NO color, only the duotone palette.

CHARACTERS — four smooth hand-illustrated cartoon characters drawn in the EXACT {{product_brand}} brand illustration style ({{style_ref_corpus_names}} register): smooth {{duotone_dark_hex}} outlines on {{duotone_light_hex}} fills, halftone-dithered shading. The four characters are:

{{ensemble_cast_4}}

Each character ~120 pixels tall, drawn with confident smooth lines and dense halftone shading. NO color on characters — pure duotone. They cast NO shadow on the floor (the joke = illustrated layer breaks photoreal lighting).

CHARACTER PROGRESSION:
 - {{FIRST}}: characters at LEFT EDGE entering the frame mid-stride, running rightward toward the device.
 - {{LAST}}: all four mid-stride on the {{product_name}} body, sparkle pixels in air, motion lines behind them.

COMPOSITION — 9:16 portrait. Device centered, occupies ~35% of frame height. Characters fill the rest.

STYLE — photoreal top-down product photography on the device + smooth hand-illustrated duotone halftone characters and floor (HARD layer split). Characters/floor sit behind+around the device like sticker layers.
```

### scene-05-first / scene-05-last — grid explode (gpt-5.4-image-2)

Tile-grid scenes need gpt-5.4-image-2 for the typography on each tile.

```
Vertical 9:16 grid-explode keyframe — Scene 05 {{FIRST|LAST}}.

[paste shared aesthetic anchor]
[paste Product DNA fragment]

POSE — the {{product_name}} centered. From the screen, a MULTI-COLUMN grid of {{product_brand}}'s content tiles (game covers / labels / icons — pick whichever the brand has a public catalog of) EXPLODES upward, each tile rotating slowly, forming a wall in front of camera.

TILES — each tile is a {{product_brand_color_name}}-framed rectangle ({{product_brand_color_hex}} solid frame around a duotone halftone illustrated cover inside). The interior art matches the {{style_ref_corpus_names}} register. 3 columns × 8 rows visible (or however many fit the brand's catalog).

CAMERA PROGRESSION:
 - {{FIRST}}: assembled {{product_name}} on the duotone floor, first few tiles just beginning to emerge from the screen with halftone pixel-burst trails.
 - {{LAST}}: full grid of 24 (or N) {{product_brand_color_name}}-framed tiles floating in space, {{product_name}} small at bottom-center.

COMPOSITION — 9:16 portrait. Tiles fill most of frame.

STYLE — photoreal {{product_name}} + flat duotone halftone tiles. The {{product_brand_color_hex}} frames are the ONLY color (other than the device). HARD layer split between photoreal device and 2D illustrated tile layer.
```

### scene-05b-first — tile glint insert (gpt-5.4-image-2)

```
Extreme macro vertical 9:16 keyframe — Scene 05b, insert glint on ONE tile.

[paste shared aesthetic anchor]

POSE — EXTREME MACRO on ONE specific tile (the one with the strongest typography in the catalog). The chunky illustrated lettering reads clearly. A halftone shimmer-band is just STARTING to sweep across the tile from the upper-left edge — the band is rendered as a stripe of {{duotone_light_hex}}-cross-hatch on top of the {{duotone_dark_hex}} interior. The illustrated character on the cover is mid-blink. {{product_brand_color_name}} tile frame out of focus around.

COMPOSITION — 9:16 portrait. Tile fills 80% of frame.

STYLE — flat duotone halftone tile interior + {{product_brand_color_name}}-frame in soft DOF. Razor focus on the typography.
```

### scene-06-first / scene-06-last — snap-back + wordmark outro (gpt-5.4-image-2)

```
Vertical 9:16 outro keyframe — Scene 06 {{FIRST|LAST}}.

CAMERA / SCENE:
 - {{FIRST}}: mid-snap-back. All N tiles half-merged into the {{product_name}}'s screen, motion-blur of streaking halftone pixels everywhere.
 - {{LAST}}: clean hero pose. Device dead-center on a small flat smooth-illustrated halftone-dithered platform.

[paste Product DNA fragment]

WORDMARK ABOVE — directly ABOVE the {{product_name}}, the iconic "{{wordmark_text}}" wordmark: SMOOTH CUSTOM ILLUSTRATED LETTERFORMS (matching the actual brand wordmark from the brand's site — bold, blocky, rounded modular letters all same height) rendered in the duotone palette ({{duotone_light_hex}} letters with {{duotone_dark_hex}} halftone-dithered drop-shadow, OR {{duotone_dark_hex}} solid letters — choose whichever reads stronger). The whole word reads cleanly, centered above the device. NOT a bitmap pixel font — smooth illustrated letterforms.

TAGLINE BELOW — directly BELOW the {{product_name}}, the tagline "{{tagline_text}}" in SMOOTH CUSTOM ILLUSTRATED LETTERING smaller than the wordmark (~half the height), centered.

BACKGROUND — pure {{duotone_light_hex}} background (or full-bleed {{product_brand_color_hex}} chroma slab if the brand uses solid color outros) with scattered smooth-illustrated halftone-dithered star sparkles around the edges. Subtle halftone Bayer-dither cross-hatch texture across the whole background like a worn newspaper page. NO pure black, NO pure white, NO color anywhere except the {{product_brand_color_name}} device.

COMPOSITION — 9:16 portrait. Wordmark in upper third. Device dead-center ~35% of frame height. Tagline in lower-third. Symmetric, calm.

STYLE — photoreal CGI device + smooth-illustrated duotone halftone wordmark, tagline, platform, BG. HARD layer split. Premium ad-quality vertical 9:16, calm confident final hero lockup. NO chunky 8-bit pixels. NO pure black/white. NO color except {{product_brand_color_name}} plastic.
```

---

## Video generation (i2v)

Default `bytedance/seedance-2.0` multi-frame (first + last image as anchors). 5-second clips. `generate_audio: false`. Single-frame for the 2 macro inserts (scene-03b, scene-05b).

**AVOID `kwaivgi/kling-v3.0-pro` multi-frame** — `400 File is not in a valid base64 format` (broken on OpenRouter, confirmed ≥6 days).

### scene-01 — entrance slam

```
EXPLOSIVE entrance: the {{product_brand_color_name}} {{product_name}} device WHIPS in violently from the far right with a massive halftone-dithered {{duotone_dark_hex}} ink-trail streaking across the entire frame, then SLAMS to a violent dead-stop dead center with subtle screen-shake and rotation wobble. The halftone-dithered illustrated world background STAYS STATIC. As the device locks center, smooth-illustrated halftone burst rays radiate outward and an illustrated speech bubble with the word HELLO. PUNCHES into the frame on the right side. Camera: snap-zoom from wide to medium-close on impact, then holds. Vertical 9:16.
```

Key tokens (`02-lessons.md` Section 3): ALL-CAPS action verbs (WHIPS, SLAMS, PUNCHES) + `the halftone-dithered illustrated world background stays static` — without that line, seedance starts animating the dither pattern, which looks like a glitch.

### scene-02 — macro screen draw-in

```
Extreme macro on the {{product_name}}'s screen. A smooth hand-illustrated halftone cartoon character APPEARS on the screen as if drawing himself in — line by line, halftone shading fills in. Then he winks at camera. Illustrated text "PRESS A" types itself in beside him pixel-by-pixel. Camera holds static, slight 5% punch-in over the last 10 frames. The {{product_brand_color_name}} body around the screen stays in soft DOF blur. Vertical 9:16.
```

### scene-03 — photoreal hand 180° orbit (the source's winning take)

```
Smooth cinematic 180-degree camera ORBIT around a photoreal human hand holding the {{product_brand_color_name}} {{product_name}}, starting from the LEFT profile and sweeping to the RIGHT profile over 5 seconds. The thumb and forefinger continuously {{product_gimmick_verb}} the {{product_gimmick}} — the gimmick visibly progresses 270 degrees (or completes its motion arc) over the shot. On the device's screen, the smooth hand-illustrated runner character begins standing still, then progressively accelerates as the gimmick advances — illustrated motion-lines streak behind him. The duotone halftone illustrated background (clouds, hills, trees) shifts in parallax with the camera move. The photoreal hand and device remain in razor-sharp focus throughout. Vertical 9:16, real-world cinematic photography of hand + flat halftone illustrated background, hard layer split.
```

Key tokens (`02-lessons.md` rule #7): explicit `180-degree camera ORBIT ... over 5 seconds` (time-mapped camera path) + the gimmick motion progress + the screen-internal motion progress. Multi-frame with first+last as anchors makes the orbit endpoints precise.

### scene-03b — gimmick macro spin (seedance single-frame; first frame only)

```
Extreme macro on the {{product_gimmick}}. The gimmick ROTATES rapidly and continuously clockwise — the knurled-grip / dial-marking texture BLURS slightly with motion while still readable. With each rotation, smooth-illustrated halftone-dithered 4-pixel sparkle-stars POP into existence around the gimmick (like Zelda rupee glints). The {{product_brand_color_name}} body of the device stays in soft DOF blur. Vertical 9:16.
```

### scene-04 — ensemble runway

```
Top-down view of the photoreal {{product_brand_color_name}} {{product_name}}. Four smooth hand-illustrated halftone cartoon characters — {{ensemble_cast_4}} — RUN ACROSS the device left-to-right in a runway-style procession. Each character mid-stride, sparkle-trails of illustrated halftone dots behind them. They cast NO shadow on the device (illustrated layer breaks photoreal lighting). Slight 15-degree orbit on the camera over 5 seconds. Vertical 9:16, HARD layer split: photoreal device + flat illustrated characters & floor.
```

### scene-05 — grid explode reveal

```
From the {{product_brand_color_name}} {{product_name}} device centered, a massive smooth-illustrated halftone radial starburst EXPLODES outward from the screen. {{product_brand_color_name}}-framed content tiles BURST forward from the screen one after another, each tile rotating slowly in 3D space, forming a wall of tiles in front of camera. Camera pulls back slowly to fit the whole grid. Vertical 9:16, HARD layer split, illustrated tiles are flat duotone, ONLY the {{product_brand_color_hex}} tile frames have color.
```

### scene-05b — tile glint shimmer (seedance single-frame)

```
Static macro of one {{product_brand_color_name}}-framed content tile. A smooth-illustrated halftone-dithered SHIMMER band SWEEPS diagonally across the tile from upper-left to lower-right at moderate speed, illuminating the illustrated character inside the tile. The character on the cover BLINKS once. {{product_brand_color_name}} frame stays out of focus around. Vertical 9:16.
```

### scene-06 — snap-back outro

```
All N {{product_brand_color_name}}-framed tiles SNAP back inward toward the {{product_name}}'s screen with smooth halftone-dithered ink-ribbon motion trails, condensing into a single point of light. A brief WHITE FLASH impact at the moment of impact. The device lands dead-center in 3/4 hero pose on a small flat illustrated halftone platform. The "{{wordmark_text}}" wordmark types itself in pixel-by-pixel ABOVE the device. The tagline "{{tagline_text}}" types in BELOW the device. Slow dolly-in over the last 60 frames, freeze on the last 15 frames. Vertical 9:16.
```

---

## Music generation (ElevenLabs Music)

Generate 5 variants in parallel on different chiptune / lo-fi / indie-cinematic axes AFTER the visual cut + total `DURATION_SEC` are locked. Pass `--duration <total + 2s>` so there's tail-trim safety on the freeze.

**STRIP ALL BRAND NAMES.** Game Boy / NES / SNES / Tetris / Mario Kart / Disasterpeace / Anamanaguchi all 400 with `bad_prompt`. The error response includes a `prompt_suggestion` field with a brand-stripped version you can resubmit directly.

The 5 variants from the source project (all worked after brand-strip):

### music-a — chiptune-orchestral (winner-style)

```
Vintage chiptune-orchestral instrumental, 128 BPM, warm square-wave synth lead with hand-claps, plucky arpeggios, soft orchestral pad underneath, occasional mechanical clicking percussion, indie handheld game soundtrack vibe, halftone-zine energy, no vocals, {{duration}} seconds, ends on a confident upward resolution with a longer outro hold for a final freeze-frame
```

### music-b — lo-fi pixel

```
Mellow lo-fi pixel instrumental, 92 BPM, dusty Rhodes piano chords, gentle 8-bit synth bell, vinyl crackle, soft brushed-snare swing groove, indie zine soundtrack feel, like a quiet afternoon with a handheld console, no vocals, {{duration}} seconds, calm and contemplative with a longer reflective outro
```

### music-c — arcade-pop chiptune

```
Energetic 8-bit arcade pop instrumental, 140 BPM, bright square-wave melody, punchy chiptune drums with kick and clap on every beat, ascending arpeggio fills on every measure, retro arcade theme energy, upbeat handheld game intro feel, no vocals, {{duration}} seconds, builds to a triumphant finale with a final hold note
```

### music-d — pure vintage 4-channel chiptune

```
Pure vintage 4-channel chiptune instrumental, 120 BPM, classic retro handheld game melody with pulse-wave lead, triangle bass, square-wave harmony, white-noise hi-hats, no modern processing, authentic late-80s handheld game soundtrack feel, no vocals, {{duration}} seconds, ends on a chiptune flourish with a long final note
```

### music-e — indie-cinematic

```
Modern indie game soundtrack instrumental, 110 BPM, cinematic, layered acoustic guitar arpeggios over warm analog synth pad, soft piano melody on top, gentle hi-hat and rim-click percussion that builds, subtle 8-bit synth twinkle as garnish, feels like the trailer of an award-winning indie game, no vocals, {{duration}} seconds, builds to a hopeful resolved final chord with a long sustained final note
```

User picks 1 of 5 as the winner. Source's pick was music-c (arcade-pop) for `playdate-pixel-001`.

---

## Captions / Voiceover

**None.** This template is wordless. Adding a human VO over a duotone-halftone print-zine world breaks the register.

If a future variant absolutely needs VO (rare), use ElevenLabs `eleven_multilingual_v2` with a calm narrator timbre, never UGC peer-voice. Keep total VO under 8 words across all 8 scenes — a single tagline at the outro is the maximum.
