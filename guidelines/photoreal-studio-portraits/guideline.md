# Photoreal studio portraits

> **For the LLM writing the next image prompt.** Read this whole file before
> drafting a prompt for any photoreal human portrait. The rules below are
> tokens that materially change the output — skip one, the photo reads as AI.

## When to apply

Any image where a **named or recurring human character** has to look like a
photograph of a real person — UGC master-portraits, talking-head anchors,
lifestyle close-ups, two-hander scene plates, product-with-human shots.

Do **not** apply to: anthropomorphic / stylized characters, illustration,
cartoon, 3D-render, or anything where you _want_ the polished-AI look.

## Model picks

| Goal | Model | Why |
|---|---|---|
| Master-portrait of a new character (no ref) | `openai/gpt-5.4-image-2` | Strongest at "real person, plain backdrop" from text alone. |
| Scene anchor / close-up that must match an existing character | `google/gemini-3-pro-image-preview` | Best at honouring `--ref` for identity lock; lower drift across angles. |
| Location-master-plate (room + characters together) | `google/gemini-3-pro-image-preview` | Multi-ref reconciliation (characters + composition) is its strength. |

Pass every recurring character or location as `--ref` on every downstream
generate call. The model will not magically remember faces between turns.

## The six-token spine

Every photoreal portrait prompt must carry these six clusters. Missing any
one of them is the difference between "photograph" and "AI render":

1. **Real camera + lens, named.** Not "professional photo", not "DSLR".
   ```
   Shot on Sony A7 IV with Sigma 85mm f/1.4 at f/2.0, eye-level.
   ```
   Substitute 35mm for medium-wide, 50mm for portraits, 85mm for tight head-and-shoulders. Always pin the aperture too (f/1.8–f/2.8 for portraits, f/3.5–f/5.6 for two-people scenes).

2. **Film stock + grade.** Kills the digital-gloss default.
   ```
   Natural Kodak Portra 400 film-grain emulation, slightly desaturated cool-warm grade.
   ```
   Alternatives: Kodak Gold 200 (warmer, snapshot), Fuji 400H (cooler, neutral), Cinestill 800T (low-light, tungsten cast).

3. **Asymmetry + imperfection, named on the body.** The single highest-leverage anti-slop token.
   ```
   Slight facial asymmetry — left eye opens marginally wider than right.
   A small mole on the right cheekbone. Faint razor stubble along the jawline. One or two flyaway hairs near the temple.
   ```
   Always name 2–3 specific imperfections per character. Generic "imperfect" or "natural" does not move the needle.

4. **Skin texture, explicit.** Models default to airbrush — undo it.
   ```
   Natural skin texture with visible pores. No styling product gloss. No makeup.
   ```

5. **Light source, single + soft.** Studio strobe + ring light = AI tell.
   ```
   Soft north-facing window light from camera-left, no fill on the right side, gentle fall-off.
   ```
   For night / interior: "single tungsten bulb camera-right, warm 3200K, no ambient bounce."

6. **Closing register clause.** A blunt sentence that names what to oppose.
   ```
   Hyperreal, photoreal, NOT glossy. Naturalistic, candid, not staged.
   ```
   The capitalised `NOT glossy` and the explicit "not staged" each pull the output a measurable step away from the commercial default.

## The negative-prompt cluster (mandatory)

Pass this verbatim as the negative prompt on every photoreal portrait. Order
matters less than coverage:

```
beauty filter, enlarged eyes, jawline reshape, plastic skin, airbrushed pores,
exaggerated symmetry, instagram filter, oversharpened, HDR, AI-generated look,
perfect teeth, frozen expression, model-pose, fashion-editorial, studio strobe,
ring light catch in eyes
```

The two most load-bearing tokens are `beauty filter` and `enlarged eyes` —
they suppress the specific "anime-leaning Disney-eye" default both Gemini
and GPT image models drift toward on female faces.

## Composition rules that compound the photoreal effect

- **Look-past-the-camera, not into.** Eye-contact with the lens reads as
  staged. `looking just past the camera to the right of the lens` or
  `looking down at hands` reads as candid.
- **Mouth closed, neutral.** "Smiling" or "open mouth" defaults to
  toothpaste-ad register. If the brief needs a smile, specify
  `mouth gently closed in a slight neutral smile, no visible teeth`.
- **Vertical 9:16 for any UGC use.** Name the aspect ratio in the prompt —
  otherwise the model picks 1:1 or 4:5 at random.
- **Head-and-upper-chest framing** is the safest portrait crop. Full body
  reveals hand-rendering failure modes; extreme close-up reveals pore
  inconsistency.

## Anatomy gate (run before accepting any output)

Before sending the output to the next stage, eyeball this checklist. If
anything fails, regenerate, don't paper over with editing:

- Hips on the seat? Back against the back-cushion? Knees forward at a real angle?
- Both eyes visible if the brief required eyes-open? Pupils distinguishable from irises?
- Head connects to body at a plausible neck angle?
- No body part sticking out of furniture or merging with background?
- Hands rendered? Fingers count out to 5 per side?

The "torso into back-cushion" and "fingers fused with chair-arm" failure
modes appear at ~30% rate even on Gemini-3-pro. Catch them at gate, not at render.

## Identity lock across multiple shots (super-original refs)

When the same character appears in multiple shots:

1. **Generate master-portrait first.** Plain warm cream backdrop, no scene
   context, neutral expression. This is the identity anchor.
2. **Generate location-master-plate next.** Wide front of the full set _with
   the characters in it_, multi-ref (each character's portrait). This anchors
   the room geometry alongside the characters.
3. **Every subsequent scene anchor** passes both the character master AND the
   location master as `--ref`. Drift drops to near zero.

Skipping step 2 is the #1 failure mode for multi-shot consistency — without a
location-master-plate the model invents a different "cream boucle couch" per
scene. See `feedback_super_original_refs` for the full reasoning.

## Worked example — master-portrait

```
Three-quarter portrait photograph of a Black man in his late 20s, soft warm
features, slim build, shoulder-length thin natural locs falling around his face
with one or two flyaways near the temple, no styling product gloss. Thin gold
wire-rim eyeglasses sitting low on his nose. Soft chocolate-brown merino
turtleneck. Natural skin texture with visible pores, faint razor stubble along
the jawline, a small mole on the right cheekbone. Slight facial asymmetry —
left eye opens marginally wider than right. Small silver pinky ring on the
right hand resting at chest level. Calm neutral expression, mouth gently
closed, eyes looking just past the camera to the right of the lens. Soft
north-facing window light from camera-left, no fill on the right side, gentle
fall-off. Shot on Sony A7 IV with Sigma 85mm f/1.4 at f/2.0, eye-level,
head-and-upper-chest framing. Plain warm cream backdrop, out of focus, no
props. Natural Kodak Portra 400 film-grain emulation, slightly desaturated
cool-warm grade. Vertical 9:16 portrait composition. Hyperreal, photoreal,
NOT glossy. Naturalistic, candid, not staged.
```

Negative (verbatim):

```
beauty filter, enlarged eyes, jawline reshape, plastic skin, airbrushed pores,
exaggerated symmetry, instagram filter, oversharpened, HDR, AI-generated look,
perfect teeth, frozen expression, model-pose, fashion-editorial, studio strobe,
ring light catch in eyes
```

## Worked example — top-down close-up (matching existing character)

Requires two refs: `master-{name}-portrait.png` + `location-master-plate.png`.

```
Same exact living room and same cream boucle couch as the FIRST reference
image. Same boucle cushion-back fabric.

SHOT: strict TOP-DOWN photograph (camera positioned directly above the seated
subject, looking straight DOWN at her face). The freckled red-haired young
woman from the SECOND reference image (face match exactly — dense freckles
across cheeks/nose/eyelids, copper-red hair with lavender tips, slight
overbite, no makeup) lies with her head against the cream boucle cushion-back
ridge of the couch (she is seated, head tipped fully back, but the camera
angle is straight down so we see her face from above like a portrait shot
taken from the ceiling).

Her face fills approximately 70% of frame, oriented vertically (chin at bottom
of frame, forehead at top). Her EYES ARE WIDE OPEN AND LOOKING DIRECTLY UP AT
THE CAMERA LENS — irises blue-grey, pupils centered as she looks straight up.
Eyelashes radiating outward. Mouth gently closed in neutral expression. Her
copper-red hair with lavender tips fans out radially around her head against
the cream boucle cushion. Freckles densely visible across her face. A few
flyaway hairs.

CAMERA: strict 90-degree top-down (lens parallel to floor, looking straight
down). Static. Vertical 9:16 portrait composition.

Lens: Sony A7 IV, Sigma 50mm f/1.4 at f/2.0. Soft natural light from one side
(camera-frame-left). Kodak Portra 400 grain. Slightly desaturated warm-cool
palette. Hyperreal, photoreal, NOT glossy. Natural skin pores, individual eyelashes.
```

## Known traps

- **Three-quarter-front + head-tipped-back is contradictory.** The model
  resolves it by giving up on one constraint. Use strict side-profile or
  strict top-down when the brief calls for head-back.
- **`mid-blink` and `half-closed eyes` are unreliable.** Both Gemini and GPT
  often interpret either as fully-closed. If you need eyes-open with an
  unusual angle, say `EYES WIDE OPEN, irises visible, pupils centered`.
- **`AI-generated look` in the negative does not prevent the AI-generated
  look** by itself. It only helps in combination with the positive
  `hyperreal, photoreal, NOT glossy` and the cluster of imperfection tokens.
- **Negative-prompt token order matters less than presence.** Don't agonize
  over the order — just make sure all 16 tokens from the cluster are there.

## Validation

To confirm a prompt drafted from this guideline is working, the output should
satisfy at minimum: visible skin pores at 100% zoom; at least one named
imperfection actually present (mole, asymmetry, stubble, flyaway); no
ring-light catch in the eyes; no symmetry-perfect face. If any of these fail,
the closing register clause or the negative cluster is being undermined by
another token in the body — re-read the six-token spine and find the missing
one.
