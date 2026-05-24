# Cinematic 35mm film register

> **For the LLM writing the next image prompt.** When the brief says "Iwai",
> "Hana and Alice", "Lily Chou-Chou", "late-90s Japanese cinema", "Tokyo y2k",
> "honeybee-style", "Wong Kar-wai pastoral", or anything that needs to *read
> as a scanned film print, not as a modern HD photograph* — the rules below
> are mandatory. Each token has a measurable effect. Skip one and the output
> drifts back to default "professional photo".

## When to apply

Cinematic still-life and landscape work where the brand of the image is
**the film stock itself**. Letterboxed verticals, pastoral wides, night
exterior atmospheres, contemplative narrative moments, sibling pieces to
known 35mm references.

Do **not** apply to: photoreal human portraits (use
[`photoreal-studio-portraits`](../photoreal-studio-portraits/) instead),
product renders, CGI hypermotion, anything that wants a digital register.

## Model picks

| Goal | Model | Why |
|---|---|---|
| Hero anchor / opener (the visual that sets the grade) | `google/gemini-3-pro-image-preview` | Handles the "scanned print" instruction without resorting to literal film perforations / gate weave at the edges. |
| Repeat scene anchors that must match a hero | `openai/gpt-5.4-image-2` | More consistent palette + grade across a series once the hero is locked. |

Either way: pin the aspect (`16:9 widescreen cinematic` or letterboxed-into-9:16)
and pass the hero image as `--ref` on every downstream call so the grade and
the milky-black floor stay constant.

## The seven film-stock tokens (mandatory)

The whole point of this guideline is the **film-stock cluster**. Every token
below is doing work — drop one and the image flips back to "modern digital".

1. **Stock + format, named.** Not "film look".
   ```
   Shot on Kodak Vision3 250D film stock, NOT digital. 35mm film print, scanned via telecine to NTSC.
   ```
   Alternatives: `Kodak Portra 400 emulation` (warmer skin tones, narrative interior), `Kodak 5219 500T` (tungsten-balanced night). `Vision3 250D` is the daylight default.

2. **Grain — heavy and explicit.**
   ```
   HEAVY visible 35mm Kodak Vision3 250D film grain, not subtle — visible grain structure across the entire frame, especially the sky.
   ```
   The word "heavy" matters. "Subtle grain" reads as digital noise reduction.

3. **Halation around bright edges.**
   ```
   Strong halation glow around every bright edge — cumulonimbus edges glow milky-white, grass tops glow pale-yellow at noon.
   ```
   Name the bright objects explicitly. "Halation" alone is too abstract.

4. **Lifted, milky blacks.**
   ```
   Lifted, milky black levels — there are NO pure blacks in this frame, even shadows are pale grey-green.
   ```
   This is the single highest-leverage anti-digital token. Modern models default to crushed blacks; you have to override.

5. **Magenta + cyan telecine bias.**
   ```
   Slight magenta cast in midtones and shadows (a common 1990s film print bias). Slight cyan tint in the high parts of the sky (NTSC telecine bias).
   ```
   These are two distinct biases — keep them separate. The magenta-in-shadow tells the model "this is a print", the cyan-in-sky tells it "this is a telecine pass".

6. **Soft everywhere — kill HD sharpness.**
   ```
   Soft edges everywhere — NOT razor-sharp like modern digital, NOT clean. Slight chromatic softness on bright edges (lens character, not artifact).
   ```
   Distinguish "soft" (lens character) from "chromatic aberration artifact" — the second is in the negative cluster.

7. **Faded, generation-degraded grade.**
   ```
   Low overall contrast — like a print that has been through several generations of duplication. Faded, washed-out color register — this is a print, not an RGB master.
   ```
   The "generations of duplication" phrasing reliably suppresses the "Instagram-vibrant" default.

## Camera + lens (still important — register is built on top of this)

Use a real camera + lens token even though you want film. Models still hook
into "Sony A7 IV + Sigma 35mm" to honour composition:

```
Shot on Sony A7 IV with Sigma 35mm f/1.4 at f/4.0, eye-level — Kodak Portra 400 emulation post-process.
```

For pastoral wides: 24mm or 35mm, deep DOF (`f/5.6–f/8`, "everything in
focus"). For interior night: 35mm, f/2.8–f/4.0. For close-ups inside the
film register: 50mm f/2.0.

## Composition rules that compound the film register

- **Letterbox the deliverable.** "16:9 widescreen cinematic letterbox"
  belongs in the prompt even if you'll later composite into a 9:16. The
  letterboxed framing changes how the model lights and grades the image.
- **Small figure in landscape > portrait close-up.** The film register reads
  strongest when the human is at 1/5 frame height inside a contemplative
  wide. Close-ups break the register.
- **Vanishing-point symmetry for interiors.** Tokyo platforms, train cars,
  arcade arcades — `wide static symmetrical composition with vanishing-point
  perspective`. The static-tripod register is part of the fiction.
- **Soft horizon at the lower third.** Anchors the landscape compositions
  even when the subject is offset to the right or left third.

## Multi-source isolated lighting (the night-exterior trick)

The hardest cinematic look to fake from text is the **multi-source isolated
lighting** of a Wong Kar-wai / Iwai night exterior. Name every light source
with its colour temperature and direction:

```
Mix of cold cyan-white (vending machine), warm tungsten (overhead
fluorescents at intervals along the platform), soft pink (illuminated ad
panel on far wall), distant city neon haze in the upper-third sky. Multiple
isolated sources — no ambient bounce. Deep crushed-but-lifted blacks
between sources.
```

The phrase **"isolated sources, no ambient bounce"** is doing most of the
work — it stops the model from softening into a single-key-light interior.

## The negative cluster (mandatory)

Pass verbatim on every cinematic film-stills prompt:

```
no modern digital sharpness, no HD clarity, no razor-sharp edges, no pure
black levels, no vivid saturated greens or blues, no Instagram-vibrant
grade, no portrait close-up, no large foreground subject, no readable face
on figures at distance, no modern Sony-A7-IV digital register (this is
film, not digital), no VHS lines, no date stamp, no chromatic aberration
artifact, no scan-lines visible, no captions, no logos, no readable text
anywhere, no anime, no oversaturation, no vertical orientation
```

The two most load-bearing tokens are `no HD clarity` and `no Instagram-vibrant
grade` — they kill the dominant modern defaults.

## Anchor-first, then series

Cinematic series live or die on the **first anchor**. The grade locked
in image #1 propagates through `--ref` to every subsequent frame. Workflow:

1. Generate the **hero anchor** with the strongest prompt — include the full
   seven-token film cluster + camera + composition + negative cluster. Treat
   this image as throwaway-budget: regen until the grade is right.
2. Once the anchor is locked, every downstream scene anchor passes it as
   `--ref` and **simplifies** its own film cluster to just `Same Kodak
   Vision3 250D grade as the FIRST reference image. Same lifted blacks,
   same halation, same magenta cast.` The hero carries the rest.
3. **Never** drop the negative cluster on downstream frames — even with a
   strong ref, models drift toward "modern digital" when re-prompted.

## Letterboxed-in-9:16 (when the deliverable is vertical)

For TikTok / Reels / Shorts you want cinematic 16:9 inside a 9:16 frame
with black bars top and bottom. Two approaches:

- **Generate native 16:9** and composite later. Cleanest grade, but you
  composite the bars in the editor.
- **Prompt the bars explicitly into a 9:16 generation.** `Letterboxed 1.85:1
  cinematic inside a 9:16 portrait frame — pure-black bars top and bottom,
  inner image is 1080×584 at vertical center.` Faster, but bars get film
  grain over them (sometimes desirable, sometimes not).

The bars sell the film-print fiction. Worth using.

## Worked example — pastoral wide (hero anchor)

Model: `google/gemini-3-pro-image-preview`. Aspect: 16:9 widescreen.

```
A 1999 Japanese 35mm film print frame, scanned via telecine to NTSC, faded
archive footage feel. Shot on Kodak Vision3 250D film stock, NOT digital.
This image must read as "scanned 35mm release print from 1999", NOT as a
modern HD photograph. 16:9 widescreen cinematic letterbox. Reference
register: Shunji Iwai's "Hana and Alice" / "All About Lily Chou-Chou",
late-1990s Japanese art-cinema summer pastoral.

SUBJECT: an enormous vertical bank of summer cumulonimbus clouds
(nyūdōgumo) towers up from the horizon and fills 65 percent of the upper
frame. Below the clouds, a wide flat sea of tall summer grass fills the
lower third of the frame. The grass is a faded yellow-green, NOT vibrant
— slightly desaturated, slightly hazy. The sky above the clouds is a soft
pale powder-blue, NOT a vivid blue.

THE PERSON: a young woman in her early twenties stands in the
middle-distance grass on the right third of the frame. She is SMALL in the
frame — about 1/5 frame height, NOT a portrait, NOT a close-up. She wears
a simple white short-sleeve summer blouse and a dark navy knee-length
pleated skirt. Shoulder-length straight black hair with curtain bangs over
eyebrows. She faces slightly away from camera, looking up at the
cumulonimbus, head tilted up. We CANNOT clearly read her face — she is a
figure in a landscape.

FRAMING: static wide symmetrical-ish composition with the horizon line at
the lower-third intersection. Cumulonimbus dominates. Deep depth of field,
everything in focus.

LIGHT: top-down hard summer sun above the clouds, soft diffused fill from
the cloud bank itself. Slight summer haze across the entire scene.

FILM-STOCK CRAFT (mandatory):
- HEAVY visible 35mm Kodak Vision3 250D film grain across the entire frame
- Strong halation glow around every bright edge — cumulonimbus edges glow
  milky-white, grass tops glow pale-yellow
- Lifted, milky black levels — NO pure blacks anywhere
- Low overall contrast — like a print through several generations of duplication
- Slight magenta cast in midtones and shadows (1990s film print bias)
- Slight cyan tint in the high parts of the sky (NTSC telecine bias)
- Soft edges everywhere — NOT razor-sharp digital
- Slight chromatic softness on bright edges (lens character)
- Faded, washed-out color register — this is a print, not an RGB master

NEGATIVES: no modern digital sharpness, no HD clarity, no razor-sharp
edges, no pure black levels, no vivid saturated greens or blues, no
Instagram-vibrant grade, no portrait close-up, no large foreground
subject, no readable face on the woman, no modern Sony-A7-IV digital
register, no VHS lines, no date stamp, no chromatic aberration artifact,
no scan-lines visible, no captions, no logos, no readable text, no
vertical orientation.

Aspect: 16:9 widescreen cinematic.
```

## Worked example — night platform (multi-source lighting)

Model: `openai/gpt-5.4-image-2`. Aspect: 16:9 cinematic.

```
Photoreal 35mm film still, 16:9 cinematic wide, late 1990s Japanese
art-cinema register. Shot on Sony A7 IV with Sigma 35mm f/1.4 at f/4.0,
Kodak Portra 400 emulation, subtle grain, mild halation. NOT vertical, NO
people.

SUBJECT: an empty Tokyo elevated train platform at night. Soft pink glow
from a single illuminated fluorescent advertising panel on the far wall
(the ad is abstract — washes of pink and cream, NO readable text). A
solitary vending machine glows cold cyan-white. Overhead fluorescents
create soft warm puddles of light at intervals along the platform. The
light-green Yamanote-line stripe on the platform edge is barely visible in
the cool dark. Distant city neon haze in the upper-third sky.

FRAMING: wide static symmetrical composition with vanishing-point
perspective. Vending machine on the right third intersection. Ad panel on
the left mid-third. Deep depth of field.

LIGHT: mix of cold cyan-white (vending machine), warm tungsten (overhead
fluorescents), soft pink (ad panel), distant neon haze (sky). Multiple
isolated sources — no ambient bounce.

GRADE: deep crushed-but-lifted blacks, isolated pink + cyan + amber pops,
mostly dark frame. The Yamanote green stripe barely registers. Cinematic.
Film grain visible.

NEGATIVES: no people, no human silhouettes, no VHS lines, no date stamp,
no chromatic aberration, no readable text on the ad panel, no logos, no
specific brand on the vending machine, no kanji legible, no captions, no
anime, no oversaturation, no vertical orientation.

Aspect: 16:9 cinematic.
```

## Known traps

- **`vivid colour`, `saturated`, `vibrant`** anywhere in the positive prompt
  collapses the entire film register. Use `faded`, `desaturated`, `washed-out`.
- **`HDR` is in the negative cluster for a reason.** Models trained on stock
  photography default to HDR; even strong negatives sometimes don't suppress
  it. If you see crushed-shadow + glowing-highlight contrast, regen with
  `low contrast` doubled into the positive.
- **`film noir`** drifts the model toward chiaroscuro and crushed blacks —
  the opposite of what you want for milky-print register. Don't use it as a
  shorthand.
- **`vintage`** is a trap word. It activates "sepia + heavy vignette +
  cracked-emulsion" Instagram filter overlays. Use "1999 Japanese 35mm film
  print" explicitly.
- **Readable text shows up as gibberish.** The negative cluster bans
  captions / logos / kanji — but Gemini sometimes ignores and renders broken
  text on signage. If the brief allows it, prompt `signs are intentionally
  blurred / out of focus / illegible`.
- **`scan lines visible`** in the positive looks period-correct but reads
  as VHS rather than 35mm print. Keep it in the negative; the grain + halation
  do the period work alone.

## Validation

Output should satisfy: visible grain across the entire frame including the
sky (not just shadows); no pure-black pixels (sample the darkest region —
should be desaturated grey-green or grey-magenta); at least one bright edge
with visible halation glow; faded mid-tones with low contrast; if there's a
human, they're small in the frame and the face is unreadable. If any of
these fails, the seven-token cluster is being undermined — usually by a
sharper-than-intended `Sony A7 IV` instruction or an accidental `vibrant` /
`saturated`.
