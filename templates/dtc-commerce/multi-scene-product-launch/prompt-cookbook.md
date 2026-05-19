# prompt-cookbook — multi-scene-product-launch

Every prompt below has `{{slots}}` substituted. Replace per your project before submitting via `ralphy generate`.

Reconstructed from `workspace/projects/nothing-hp1-001/logs/generations.jsonl` (270 entries, $50.69 total spend) — the BEST-PRACTICES.md "Locked prompt template" section + representative live prompts from the gen-log.

---

## Stage 0 — Character identity master

**Model:** `google/gemini-3-pro-image-preview`
**Refs:** the user-supplied base photo of {{model_a}}.
**Size:** 1024x1024 (square OK for hero portrait).
**Cost:** ~$0.15 / variant. Run 4 variants in parallel.

```
Editorial product-ad portrait of the SAME {{model_a}} shown in the reference photo:
keep their exact facial identity, [paste the identity tags from {{model_a}}: e.g.
"soft pale features, large eyes, delicate nose, gentle expression, and short
shaggy pink hair"]. Re-style them for a high-end {{brand_name}} tech commercial:
clean studio lighting, cool desaturated blue-tinted color grade, futuristic
minimalist white setting, slight tech-couture wardrobe in white/silver, subtle
wind in hair, neutral lips, fresh skin. Three-quarter portrait, shoulders up,
looking just past camera, calm confident gaze. Cinematic 50mm, soft top light +
cool fill, shallow depth of field, sharp focus on face. Sci-fi-trailer mood.
No text, no logos.
```

Pick the cleanest variant -> `assets/refs/characters/{{model_a}}-base.png`. This is `--ref #2` on every subsequent gen.

Repeat for `{{model_b}}` (if a second cast member exists).

---

## Stage 1 — Product hero masters

**Model:** `openai/gpt-5.4-image-2` (1:1 OK here) OR `google/gemini-3-pro-image-preview` if you want consistency with keyframes.
**Refs:** 4 multi-angle user-supplied product photos.
**Size:** 1024x1024.
**Cost:** ~$0.20 / variant (gpt-5.4) or ~$0.15 (gemini-3-pro).

Generate 5-8 angle masters once. Each becomes a `--ref` for any scene where that angle is visible.

### product-01 — three-quarter hero

```
Hero product shot of the EXACT same {{product_name}} shown in the references:
{{brand_name}} {{product_name}} — {{product_descriptor}}. Three-quarter angle from
slightly above, full pair floating, clean seamless off-white background, soft top
key + cool blue rim, gentle cast shadow. Studio photography, 85mm, sharp focus
across product, photoreal, no people, no logos other than the product's own.
```

### product-02 — pure side profile

```
Pure side-profile product shot of the EXACT {{product_name}} shown in references —
{{product_descriptor}}. Centered, locked-off camera, parallel to product axis,
plain off-white seamless. Soft single key light from above-left, gentle shadow.
Studio photography, 100mm macro-equivalent, full edge-to-edge sharp focus.
Photoreal, no people, no extra logos.
```

### product-04 — top-down flat-lay

```
Top-down flat-lay of the EXACT {{product_name}} from references — {{product_descriptor}}.
Centered on a clean off-white seamless surface. Perfectly perpendicular camera,
balanced lighting from two soft sources at 45 degrees. Studio photography,
50mm-equivalent for flat-lay rectification, gentle ambient shadow. No people,
no extra logos.
```

### product-07 — extreme macro driver

```
Extreme macro of one earcup of the EXACT {{product_name}} from references —
{{product_descriptor}}. Focus on the most distinctive visible internal detail (the
"signature mechanism" — the driver vent / dial / port / membrane that defines the
product). Single soft top key + cool rim, shallow DOF with the signature mechanism
tack-sharp. 100mm macro, studio photography. Photoreal, no people, no extra logos.
```

(Add product-03 front-on, product-05 back-detail, product-06 floating-tilt, product-08 low-angle-stand as needed.)

---

## Stage 2 — Scene keyframes (the workhorse stage)

**Model:** `google/gemini-3-pro-image-preview`. (DO NOT use gpt-5.4-image-2 — it returns 1024x1024 squares regardless of `--size`.)
**Refs (in order):**
  1. `scenes/NN/original-scene-img.jpg` — the source mid-shot frame, called the "locked storyboard frame"
  2. `assets/refs/characters/{{model_a}}-base.png` — character identity
  3. `assets/refs/characters/{{model_a}}-wardrobe-reference.png` — canonical wardrobe (established AFTER the first pilot)
  4. `assets/refs/product/product-XX.webp` — product hero matching the scene's framing
**Size:** `1080x1920` (gemini delivers 768x1376 native — lanczos-upscale post).
**Cost:** ~$0.15 / variant. 4 variants per scene in parallel.

### Locked template (paste, fill in scene-specific brackets, submit)

```
OUTPUT FORMAT: tall vertical 9:16 portrait frame (1080x1920), composed for
vertical mobile / TikTok screen. NEVER square, NEVER landscape — frame is taller
than wide.

CAMERA LOCK — STRICT: the camera angle, lens focal length, framing, subject
placement in frame, foreground/midground/background composition, and shot crop
MUST EXACTLY MATCH reference image #1. Treat reference #1 as a locked storyboard
frame: do NOT change camera position, do NOT zoom, do NOT re-frame, do NOT change
angle of view. You may ONLY swap the actor identity (reference #2) and apply the
wardrobe shown in reference #3 — everything else is locked to reference #1.

Scene-specific: [composition details from scenes/NN/meta.json — describe set,
props, crew, location as if writing for a shot list. e.g. "Industrial commercial-
studio location, raw cold-grey polished concrete floor. Background centre-right:
large freestanding {{set_backdrop_a}}. Foreground centre: black industrial
treadmill with raised handrail, the main subject is walking on it. Overhead
light: cool soft top fluorescent / softbox key. Vibe: behind-the-scenes
commercial set, premium tech-ad feel."]

Replace the model with the SAME {{model_a}} from reference #2 — preserve their
exact [distinctive identity tags from the slot value: e.g. "pink hair, pale soft
features, large eyes"] and identity.

Hair / identity lock — CRITICAL: [if source actor has different hair from {{model_a}},
spell it out here. e.g. "the male subject has SHORT TWISTED DREADLOCKS from
reference #2 — NOT short close-cropped hair, NOT shaved, NOT a buzz cut, NOT
an afro. Replace the source actor's haircut with our character's dreadlocks."]

Wardrobe — KEEP IDENTICAL to reference #3 (canonical wardrobe-lock photo):
{{model_a_wardrobe}}. Do not invent any other top, do not change sleeve colour.

They wear {{brand_name}} {{product_name}} from reference #4 ({{product_descriptor}}).

[If a backdrop is visible: "Backdrop is a PRINTED FABRIC BANNER (clearly a
banner with visible fabric texture and seams), NOT a real {{set_backdrop_a}}
environment."]

Photoreal, vertical 9:16, no text, no logos.
```

### Example — scene-02 (treadmill BTS wide, from the source project)

```
OUTPUT FORMAT: tall vertical 9:16 portrait frame, 1024x1792, NEVER square.

Recreate the EXACT set, lighting and mood of reference frame #1 in a vertical-
portrait crop. Every set element from the reference must be preserved:
- Industrial commercial-studio location, raw cold-grey polished concrete floor
- Background centre-right: large freestanding {{set_backdrop_a}} made of tall
  vertical wood-panel sections, depicting a misty pine forest in cool desaturated
  colors
- Background left: a translucent plastic-strip curtain doorway hanging from
  ceiling, with a crew member sitting on a low stool behind it on the left
- Mid-ground left: another crew member in a long translucent plastic raincoat
  standing near a small wheeled equipment cart
- Right side: a crew member walking in profile wearing a long translucent
  plastic raincoat over dark base layer
- Foreground centre: black industrial treadmill with raised handrail, the main
  subject is walking on it
- Overhead light: cool soft top fluorescent / softbox key, cool desaturated
  blue-grey color grade, slight haze
- Vibe: behind-the-scenes commercial set, premium tech-ad feel

REPLACE ONLY the central walking model with the SAME {{model_a}} from reference
#2 — preserve their exact pink hair, pale soft features, and identity. They walk
confidently on the treadmill, side-three-quarter toward camera, wearing the EXACT
{{brand_name}} {{product_name}} from reference #3 ({{product_descriptor}}). Wardrobe:
{{model_a_wardrobe}}.

DO NOT simplify. DO NOT make it pristine or minimalist. Keep the industrial messy
crew-visible production-set look. Photoreal, vertical 9:16, no readable text, no
extra logos.
```

---

## Stage 3 — Image-to-video (Kling v3.0 pro)

**Model:** `kwaivgi/kling-v3.0-pro`. (DO NOT use `bytedance/seedance-2.0` — content-moderation filter blocks photoreal AI faces.)
**Image ref:** `scenes/NN/picked.png` (the chosen keyframe variant).
**Duration:** `max(3, ceil(scene.durationSec))` — Kling minimum is 3s.
**Aspect:** `9:16`, resolution `720p` (only one Kling supports — Remotion upscales).
**Cost:** ~$0.42 / 3s clip.

### Walking / dancing / floating clip — the locked block stack

```
STATIC LOCKED-OFF CAMERA — camera fixed throughout, no pan/track/tilt/zoom.

CONTINUOUS MID-MOTION CLIP — the reference image (first frame) is NOT a starting
pose. It is a snapshot captured DURING an already-in-progress [walking/dancing/
floating] sequence. The subject has been [walking/dancing/floating] for many
seconds BEFORE the clip begins and continues AFTER it ends. From frame ZERO the
[motion] is already at full uniform pace: NO acceleration, NO warm-up, NO ramp
from standstill, NO transition from posed/static into [motion]. Every single
frame shows active [motion] at the same intensity — the first frame is already
mid-stride / mid-dance / mid-float.

[Scene-specific action description — what each subject is doing throughout the
clip. e.g. "The {{model_a}} walks confidently on the treadmill, full body
visible, rhythmic subtle bob of head and shoulders with each step. The lab-coat
crew member in the background continues their static observation pose."]

NEGATIVE — no camera move, no zoom, no deep breath, no exaggerated chest
inflation, no heavy sigh, no static frozen pose, no looking at camera with
frozen stare, no starting pose, no ramp-up motion, no standing still, no new
characters appear, no character disappears.
```

### Idle / portrait clip — the locked block stack

```
STATIC LOCKED-OFF CAMERA — camera fixed throughout, no pan/track/tilt/zoom.

The {{model_a}} [stands listening / looks off-camera / gazes upward]. Tiny
natural micro-movements only: a slow blink, almost imperceptible head sway,
hair gently shifting from ambient air. Background stays still. Cool desaturated
grade steady.

NEGATIVE — no camera move, no zoom, no deep breath, no exaggerated chest
inflation, no heavy sigh, no walking, no head turning toward camera, no starting
pose change, no posed stance shift.
```

### Multi-subject scene — add COMPOSITION LOCK block

```
CRITICAL COMPOSITION LOCK — from frame ZERO the scene contains EXACTLY THESE two
subjects already in position, both visible in every single frame:
  (A) on frame-LEFT-CENTRE, the {{model_a}} ALREADY [walking/sitting/dancing]
      at full pace (NOT [walking-from-still/standing-up/starting]).
  (B) on frame-RIGHT, the {{model_b}} ALREADY [running/standing/observing] at
      full pace.
NO new characters appear, NO character disappears, NO subject changes pose or
activity.
```

### Macro product-detail clip (e.g. fingers rotate dial)

```
STATIC LOCKED-OFF CAMERA — camera fixed throughout, no pan/track/tilt/zoom.

CONTINUOUS MID-MOTION CLIP — fingers are ALREADY rotating the [signature
control] of the {{product_name}} from frame ZERO. The hand was rotating before
the clip and continues after. No frame shows the fingers stationary or
beginning a new gesture. The rotation is smooth and continuous throughout.

Tactile macro detail: skin texture, fingernail edges, finger pressure on the
[control surface] visible.

NEGATIVE — no camera move, no zoom, no static frozen hand, no second hand
appearing, no fingertip lifting off.
```

---

## Stage 4 — Title cards (NO model call — Remotion-rendered)

Title cards are pure Remotion typography on black. Each `<TitleCard>` is a 1-state component; the cycling endcard is a `<TitleCardCycle>` that swaps strings every `duration / N_states`.

Strings to wire (from the source project's pattern):

| Card | String |
|---|---|
| Opening | `{{brand_name}}` |
| Mid | `{{product_name}}` (lowercase: e.g. `headphone (1)`) |
| Slogan | `{{brand_slogan}}` |
| Endcard (cycle 4 states) | `{{brand_slogan}}` -> `{{brand_name}}` -> `{{brand_url}}` -> blank |

Use the brand's display typeface (e.g. Nothing kit uses `Ndot55` + `NType82`). Inject via `@font-face` once at composition mount — see the `ensureNothingFonts()` pattern in the source project's `fonts.ts`.

---

## Remotion composition patterns

```tsx
// Per scene
<Sequence
  from={SEC_TO_FRAMES(scene.startSec)}
  durationInFrames={SEC_TO_FRAMES(scene.durationSec)}
  name={`scene-${scene.id}`}
>
  <OffthreadVideo
    src={staticFile(`${PROJECT_ID}/${scene.videoFile}`)}
    style={{ width: "100%", height: "100%", objectFit: "cover" }}
    muted
  />
</Sequence>

// Master audio (root, NOT per-scene)
<Audio src={staticFile(`${PROJECT_ID}/source-audio.mp3`)} />
```

`muted` on every `<OffthreadVideo>` so Kling's silent track doesn't fight with the master audio. `objectFit: "cover"` upscales Kling's 720x1280 inside the 1080x1920 composition.

A 3s Kling clip in a 0.8s scene plays only the first ~24 frames — and because frame 0 is already mid-motion (per the MID-MOTION block), those 24 frames are usable as-is.
