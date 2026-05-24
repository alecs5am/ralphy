# CGI product renders

> **For the LLM writing the next image prompt.** When the brief asks for a
> premium product hero spot — Nothing-Phone-style launch stills,
> Flipper-style hardware reveal, tech-porn macro hero — the rules below
> codify the reusable shot grammar. The look is built from five composition
> archetypes and two palettes that ride on top.

## When to apply

Any product render that wants the **"this object is in a museum vitrine"**
register: glossy specular highlights, atmospheric haze, coloured rim-light
pair, dramatic dark or bright studio. Phones, devices, hardware, packaged
goods, accessories — anything you'd put on a /launch landing page.

Do **not** apply to: human portraits ([`photoreal-studio-portraits`](../photoreal-studio-portraits/)),
cinematic narrative stills ([`cinematic-90s-film`](../cinematic-90s-film/)),
in-the-wild UGC ("on my desk", "in someone's hand") — those need a
different register entirely.

## Model picks

| Goal | Model | Why |
|---|---|---|
| Hero anchor + clean compositions | `google/gemini-3-pro-image-preview` | Best at rendering precise device geometry from a textual product DNA description. |
| Series continuation, alt palettes, kawaii-pink variant | `openai/gpt-5.4-image-2` | Stronger at preserving exact device geometry across multiple shots once the hero is locked. |

Always pass the hero anchor as `--ref` on every downstream shot. Device
proportions drift after 2–3 unrefed regens.

## The two palettes

Same composition grammar, two flavours of light + background:

### A. Dark-cinematic-tech (default for tech, premium, B2B)

```
Dark cinematic studio environment, polished black acrylic floor with subtle
device reflection. Electric-blue rim light from camera-left. Neon-magenta
kicker from camera-right. Light atmospheric haze. Dramatic specular
highlights on the casing edges. Glossy plastic finish. Premium tech product
photography. 8K detail. Tech-porn aesthetic.
```

### B. Sunny-kawaii-yellow-pink (for hyper-energetic, consumer, brand)

```
Hyper-energetic Japanese-kawaii product ad aesthetic. Background: sunny
cadmium-yellow base with pale tiled checkerboard floor pattern, pink
atmospheric haze and gradient wash at frame edges. Warm sunny key light +
hot-magenta-pink neon rim light from camera-right + soft white halo behind
product. Decorative floating graphic elements: white sparkle stars, tiny
pink dot-bursts, light streaks, anime-style speed-line bursts radiating
from product, scattered cyan-and-white confetti dots. Glossy specular
highlights. Premium hyper-real CGI product render. 8K detail.
```

Pick one palette per project and stay consistent. The palette is brand-driven
— the composition grammar below stays identical either way.

## The product-DNA paragraph (mandatory)

Every shot in a series carries the **same product-DNA paragraph** verbatim.
This is the device's fingerprint and it has to be word-for-word identical
across the front-hero, 3/4, top-down, and macro shots — otherwise geometry
drifts.

Template (substitute device specifics):

```
Subject: [DEVICE NAME] — [form-factor description], roughly [dimensions].
[COLOUR / MATERIAL] body. [ACCENT COLOUR] accents ONLY: [list of accent
elements with locations]. [Distinctive UI / screen / port details — every
visible element, named with location].
```

Worked example (verbatim from a recurring spot):

```
Subject: The Flipper Zero device — a landscape-orientation handheld
multi-tool, roughly 100mm by 40mm by 25mm thick. WHITE plastic body (BOTH
top and bottom cases are white plastic). Orange accents ONLY: bright
orange D-pad cluster (5-way circular navigation pad with directional
arrows and a center select button) located on the right half of the front
face; bright orange rectangular bezel framing the rectangular OLED screen
on the left half of the front face; bold orange embossed text reading
"FLIPPER" along the lower front below the screen and D-pad. Small black
round BACK button just to the right of the D-pad. The 1.4-inch monochrome
OLED screen displays a pixel-art dolphin face with the katakana text
フリッパー next to it. Tiny green LED indicator below screen. MicroSD card
slot on the bottom edge near the right corner. USB-C port and rocker
button on the right edge. iButton contact pad and small dolphin logo on
the back.
```

The DNA paragraph + the palette + a pose line = a single shot prompt. The
DNA never changes, only the pose.

## The five reusable shot archetypes

### 1. Front hero

The opening shot. Sets the device's identity.

```
Pose: shown perfectly straight-on facing camera, eye-level, slight
5-degree forward tilt so the top edge angles toward the viewer, perfectly
centered in frame. Full front face fully visible. Device occupies central
55% of frame height.
```

### 2. 3/4 low-angle heroic

The "premium / weight / quality" shot.

```
Pose: LOW-ANGLE HEROIC SHOT — camera positioned 25 degrees below the
device looking upward, device rotated 45 degrees so both the front face
AND the right side profile are visible simultaneously. USB-C / side ports
on the right edge clearly visible. Device floating slightly above polished
black surface. Specular highlights along the side profile edge.
```

### 3. 90° top-down back

The "minimalist / tactile / packaging" shot.

```
Pose: shot DIRECTLY FROM ABOVE at 90-degree top-down flat-lay angle.
Device perfectly horizontal, centered in vertical 9:16 frame. View shows
the BACK of the device. Subtle ambient rim glow from camera-left edge,
soft haze in the surrounding air, gentle falloff lighting so the device
pops cleanly against the floor.
```

### 4. Macro screen (or any UI element)

The "tech-porn / detail / craftsmanship" shot.

```
Extreme macro closeup of the device front face. Frame dominated by the
[SCREEN / UI ELEMENT]. Individual screen pixels clearly visible as sharp
little rectangles, faint cyan-blue screen glow. Surrounding: micro-texture
of the [BEZEL MATERIAL] — visible grain, internal tint, subtle thumbprint
smudge. Just the edge of [ADJACENT UI ELEMENT] enters the frame on the
right. Ultra-shallow depth of field with the screen in razor focus and the
bezel falling into soft bokeh at frame edges. Tightly framed.
```

### 5. Macro PCB / internals

The "made for builders / open / honest hardware" shot.

```
Extreme macro closeup of the bare [DEVICE NAME] printed circuit board — no
plastic case. Sharp focus on [list of named components: GPIO pins / radio
chips / connectors / ribbon cables]. Shot at a slight 15-degree tilt so
the [HERO COMPONENT — usually gold pins or a metal-can chip] catches the
rim light. Multiple tiny surface-mount resistors and capacitors. Micro-text
white silkscreen labels. Ultra-shallow depth of field, razor focus on the
hero component, dreamy bokeh falloff toward edges.
```

## Universal closing block

Every shot ends with this block — adjust the framing line per shot:

```
[PALETTE A or B paragraph]
Vertical 9:16 portrait composition.
8K detail.
[Framing line — e.g. "device occupies central 55% of frame height" or
"tightly framed macro" or "device fills 80% of frame"]
```

## The two rim lights (don't skip)

The **coloured rim-light pair** is the single highest-leverage token. One
warm + one cool, from opposite sides, with light atmospheric haze between
them and the camera. Drop it and the render flattens to catalogue-style:

- Palette A: `electric-blue rim light from camera-left, neon-magenta
  kicker from camera-right`
- Palette B: `warm sunny key from camera-left, hot-magenta-pink neon rim
  from camera-right`

Pin both colour and direction. Vague "studio lighting" yields a single
soft key and kills the cinematic register.

## Negative-prompt cluster (mandatory)

```
no scratches, no dust, no fingerprints (unless macro-screen explicitly
calls for one), no wear marks, no random reflections, no unintended
shadow, no busy background, no clutter, no human hand, no human in frame,
no text overlays, no captions, no logos other than the named device logo,
no oversaturation, no flat key-light look, no ring-light catch on the
casing, no chromatic aberration artifact, no banding on the gradient
background
```

`no flat key-light look` and `no ring-light catch on the casing` are the
two load-bearing tokens — they suppress the cheap-stock-photo default.

## Pacing the series — order of shots matters

When you build a product spot from these archetypes, the order materially
affects retention:

```
1. front-hero            (hook — what is it?)
2. 3/4-low-angle         (premium — feels expensive)
3. macro-screen          (UI / brain — what does it do?)
4. macro-PCB             (honesty — under the hood)
5. top-down-back         (minimalism — punctuation, breathing room)
```

The first two are 5–6s, the macros are 3–4s, the top-down closes the loop.
Don't shuffle randomly — the dramatic logic above is what makes a Nothing /
Apple / Teenage Engineering reveal feel like a *reveal*.

## Worked example — front hero (Palette A)

Model: `google/gemini-3-pro-image-preview`.

```
Ultra-realistic CGI product render of the Flipper Zero device. Product
DNA: orange-translucent top case (semi-transparent tinted plastic), white
plastic bottom case, monochrome 128x64 OLED screen showing a pixel-art
dolphin face, 5-way circular D-pad on the right of the front face, small
black BACK button below the D-pad, USB-C port on top edge, microSD slot
on left edge, small dolphin logo on back.

Pose: shown STRAIGHT-ON facing camera, eye-level, slightly tilted forward
5 degrees so the top edge angles toward viewer, perfectly centered in
frame. Full front face fully visible with OLED display, D-pad, back
button.

Dark cinematic studio environment, polished black acrylic floor with
subtle device reflection, electric-blue rim light from camera-left,
neon-magenta kicker from camera-right, light atmospheric haze, dramatic
specular highlights on the translucent orange casing edges, glossy plastic
finish, premium tech product photography, 8K detail, professional product
advertising aesthetic, vertical 9:16 portrait composition, device occupies
central 55% of frame height.
```

## Worked example — macro screen (Palette B)

Model: `openai/gpt-5.4-image-2`.

```
Extreme MACRO closeup of the Flipper Zero device front face. The frame is
dominated by the orange-bezel monochrome OLED screen displaying a clean
high-contrast pixel-art DOLPHIN FACE on the left of the screen and the
katakana text フリッパー (FU-RI-PPA) on the right side of the screen,
individual screen pixels sharply visible as little rectangles. The screen
has a subtle cyan-blue glow.

Surrounding the screen: the bright ORANGE rectangular bezel, transitioning
to the WHITE plastic body of the device. Just the edge of the orange D-pad
button enters the frame on the right.

Ultra-shallow depth of field with razor focus on the pixel dolphin and the
bezel falling into soft bokeh at frame edges.

Background: pale sunny yellow with pink atmospheric haze and floating
white sparkle-stars + cyan confetti dots out of focus. Soft warm sunny key
light, hot-magenta-pink rim from camera-right edge. Glossy specular on the
orange bezel.

Hyper-real CGI product render, 8K detail, vertical 9:16 portrait
composition tightly framed.
```

## Known traps

- **"Realistic photo" instead of "CGI product render"** moves the model
  toward stock-photo register. The CGI framing is what unlocks the rim-light
  + haze + specular combo.
- **Forgetting the product-DNA paragraph on macro shots.** Even a tight
  crop benefits from the full DNA — the model uses it to render correct
  bezel materials, button shapes, and edge translucency.
- **Mixing palettes within one series.** The palette is a brand decision
  — switching from dark-cinematic to kawaii-pink mid-series breaks visual
  coherence. Pick one and lock it.
- **Asking for "soft lighting"** kills the dramatic rim pair. Always pin
  the rims by colour + direction.
- **`8K detail`** is a useful invocation even though the model doesn't
  literally render at 8K — it triggers the model's "premium render" branch
  versus its "casual photo" branch.
- **The katakana / kanji rendering is unreliable.** If your DNA includes
  Japanese text on the screen, expect it to be illegible or wrong. Either
  accept it as decorative or compose the text in editor.

## Validation

Output should satisfy: visible specular highlight along at least one
casing edge; both rim lights distinguishable in the result (cool side +
warm side); device geometry matches the DNA paragraph (count the buttons,
verify port locations); atmospheric haze present (a sample of the
background between device and corner should be slightly luminous, not
flat); no human elements, no random clutter. If any fails, the
two-rim-light line or the DNA paragraph is being undermined — usually by
an accidental "soft lighting" or by truncating the DNA list.
