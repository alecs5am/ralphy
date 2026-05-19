# Prompt cookbook — Noski Deadpan 2-Hander

Verbatim prompt patterns from `workspace/projects/noski-people-001/logs/generations.jsonl`, with project-specific proper nouns replaced by `{{slots}}`. Aesthetic descriptors (Sony A7 IV, Kodak Portra 400, "deadpan philosophical") stay literal — they're the template's DNA.

Use these as scaffolds, not as copy-paste literals. The `{{slots}}` substitution leaves the template's vibe intact while letting the cast / topic / location vary.

## Slot legend

| Slot | Source-project value (for orientation) |
|---|---|
| `{{character_a}}` | Black man, late 20s, shoulder-length thin natural locs, thin gold wire-rim eyeglasses, chocolate-brown merino turtleneck |
| `{{character_a_voice}}` | soft warm baritone with slight gravel, deadpan philosophical delivery, neutral American accent, quiet contemplative volume, almost-whispered register |
| `{{character_b}}` | freckled red-haired young woman, mid-20s, lavender-tipped copper hair, slight overbite, cream-and-mustard cable-knit cardigan over white t-shirt |
| `{{character_b_voice}}` | soft contralto, slight breathy quality, deadpan philosophical delivery, neutral American accent, slight overbite affecting sibilants, quiet contemplative volume |
| `{{location_master_plate}}` | cream boucle three-seat couch with one continuous low back-cushion ridge, dusty-pink matte wall, vintage Persian rug, dark walnut mid-century sideboard, opal-glass pendant lamp, soft north-window daylight |
| `{{target_language}}` | English |
| `{{topic_seed}}` | Socks or people — what gets lost more often? |

---

## Stage 1 — Master character portrait

Model: `openai/gpt-5.4-image-2`. No `--ref` (these ARE the references). Neutral background, no scene context. Verbatim from `master-boy-portrait` gen-log entry (substituted to `{{character_a}}`):

```
Three-quarter portrait photograph of {{character_a}}, soft warm features, slim build, no styling product gloss. Natural skin texture with visible pores, faint razor stubble along the jawline, a small mole on the right cheekbone. Slight facial asymmetry — left eye opens marginally wider than right. Small silver pinky ring on the right hand resting at chest level. Calm neutral expression, mouth gently closed, eyes looking just past the camera to the right of the lens. Soft north-facing window light from camera-left, no fill on the right side, gentle fall-off. Shot on Sony A7 IV with Sigma 85mm f/1.4 at f/2.0, eye-level, head-and-upper-chest framing. Plain warm cream backdrop, out of focus, no props. Natural Kodak Portra 400 film-grain emulation, slightly desaturated cool-warm grade. Vertical 9:16 portrait composition. Hyperreal, photoreal, not glossy.
```

Negative prompt (verbatim, do not omit):

```
beauty filter, enlarged eyes, jawline reshape, plastic skin, airbrushed pores, exaggerated symmetry, instagram filter, oversharpened, HDR, AI-generated look, perfect teeth, frozen expression, model-pose, fashion-editorial, studio strobe, ring light catch in eyes
```

**Key tokens that carry the photoreal register:**
- `Shot on Sony A7 IV with Sigma 85mm f/1.4 at f/2.0` — real camera + lens model unlocks photoreal mode
- `Kodak Portra 400 film-grain emulation, slightly desaturated cool-warm grade` — kills the glossy commercial look
- `Slight facial asymmetry — left eye opens marginally wider than right` + `small mole on the right cheekbone` — specific imperfections that anchor identity across regens
- `Hyperreal, photoreal, not glossy` — explicit opposition to the model's default "professional photo" instinct
- The full negative-prompt block — see memory `feedback_anti_ai_slop_image.md`

Repeat for `{{character_b}}` with the matching descriptor.

---

## Stage 2 — Location-master-plate (RULE 1 — anchor #1)

Model: `google/gemini-3-pro-image-preview`. Refs: `master-character-a.png`, `master-character-b.png`. Verbatim pattern with slots:

```
Wide front establishing photograph of a quiet sunlit living room. Composition: {{location_master_plate}}.

SEATED ON THE COUCH (both clearly visible, BOTH 30 CENTIMETERS APART AT THE HIP, NOT TOUCHING):

- LEFT-OF-CENTER on the couch: {{character_b}} from the FIRST reference image (face must match exactly — same freckle density across cheeks/nose/eyelids, same lavender tips, same overbite, no makeup, same wardrobe). She is seated NORMALLY: her HIPS on the seat cushion, her BACK against the back-cushion, her KNEES bent forward with feet on the floor. Then she tips her HEAD BACK so the back of her skull rests on top of the soft back-cushion ridge of the couch. Her chin points UP. She looks UP at the ceiling. Her arms relaxed at her sides or in her lap.

- RIGHT-OF-CENTER on the couch: {{character_a}} from the SECOND reference image (face must match exactly — same hair, glasses, wardrobe). He is seated NORMALLY: HIPS on the seat cushion, BACK against the back-cushion, KNEES bent forward with feet on the floor. Then he tips his HEAD BACK so the back of his skull rests on top of the back-cushion ridge. His chin points UP. He looks UP at the ceiling. Hands loose on his thighs.

Their hips are about 30 centimeters apart — they do not touch. Their shoulders, arms, and hands do NOT touch. They are simply seated next to each other in identical relaxed posture.

CAMERA: medium-wide front, eye-level (camera positioned about 2 meters in front of the couch, at couch-back height). Both subjects centered in frame. The full couch visible from armrest to armrest. Static composition. Vertical 9:16. Lens: Sony A7 IV, Sigma 35mm f/1.4 at f/3.5. Ambient north-window light only, no fill. Kodak Portra 400 grain. Slightly desaturated warm-cool palette. Hyperreal, photoreal, NOT glossy. Naturalistic, candid, not staged.
```

Negative (verbatim):

```
lying down, lying flat, prone, sleeping pose, body sticking out of couch, stomach pressed into back-cushion, sitting backwards, facing the back of the couch, body floating, broken anatomy, impossible body geometry, two different couches, mismatched furniture, beauty filter, plastic skin, oversharpened, HDR, AI-generated look, makeup, glamour, intimacy, hugging, touching shoulders, holding hands, head on partner shoulder, head on lap, romantic pose, dramatic
```

**Key tokens:**
- `{{location_master_plate}}` must explicitly call out *"one continuous low back-cushion forming a soft ridge along its top"* (or equivalent) — forces single-couch geometry, kills "sectional sofa" interpretation
- `BOTH 30 CENTIMETERS APART AT THE HIP, NOT TOUCHING` — caps-locked distance reads as a hard constraint
- Full anatomy chain (`hips on seat → back against back-cushion → knees forward → head tipped back`) — prevents broken bodies (rule 3)

---

## Stage 3 — Canonical close-ups (side-profile + top-down)

Model: `google/gemini-3-pro-image-preview`. Refs: `location-master-plate.png`, `master-character-X.png`.

### 3a — Top-down close-up (RULE 4 — strongest angle for head-back)

Verbatim from `cu-girl-topdown` with `{{character_b}}` substituted:

```
Same exact living room and same couch as the FIRST reference image. Same boucle cushion-back fabric.

SHOT: strict TOP-DOWN photograph (the camera is positioned directly above the seated subject, looking straight DOWN at her face). {{character_b}} from the SECOND reference image (face match exactly) lies with her head against the cushion-back ridge of the couch (she is seated, head tipped fully back, but the camera angle is straight down so we see her face from above like a portrait shot taken from the ceiling).

Her face fills approximately 70% of frame, oriented vertically (chin at bottom of frame, forehead at top). Her EYES ARE WIDE OPEN AND LOOKING DIRECTLY UP AT THE CAMERA LENS — irises clearly visible, pupils centered as she looks straight up. Eyelashes radiating outward. Mouth gently closed in neutral expression. Her hair fans out radially around her head against the cushion. A few flyaway hairs.

CAMERA: strict 90-degree top-down (camera lens parallel to floor, looking straight down). Static. Vertical 9:16 portrait composition.

Lens: Sony A7 IV, Sigma 50mm f/1.4 at f/2.0. Soft natural light from one side (camera-frame-left). Kodak Portra 400 grain. Slightly desaturated warm-cool palette. Hyperreal, photoreal, NOT glossy. Natural skin pores, individual eyelashes.
```

Negative:

```
side angle, three-quarter angle, low angle, eye-contact-from-side, eyes closed, sleeping, meditating, mouth open dramatic, beauty filter, plastic skin, makeup, mascara, two people in frame, partner visible, lying flat horizontal
```

**Key tokens:**
- `strict 90-degree top-down (camera lens parallel to floor, looking straight down)` — explicit angle definition; model otherwise defaults to "side-three-quarter from above"
- `Her face fills approximately 70% of frame, oriented vertically (chin at bottom of frame, forehead at top)` — frame orientation directive
- `EYES ARE WIDE OPEN AND LOOKING DIRECTLY UP AT THE CAMERA LENS — irises clearly visible, pupils centered as she looks straight up` — positive eye cues that beat the negative-ban approach
- The meta-explanation `she is seated, head tipped fully back, but the camera angle is straight down...` helps Gemini reconcile the unusual angle

### 3b — Side-profile close-up

Same shape, replace `TOP-DOWN` with `strict side-profile from camera-left (camera positioned at couch-back-cushion height, perpendicular to the subject's body axis)` and adjust framing notes. The cushion-back ridge should read clearly behind the head — this is the angle's whole point.

---

## Stage 4 — Story-driven detail cutaway

Model: `google/gemini-3-pro-image-preview`. Ref: `location-master-plate.png`. Verbatim from `detail-photo-sideboard`:

```
Close-up photograph of a small framed BLACK-AND-WHITE PHOTOGRAPH standing upright on the dark walnut mid-century sideboard from the FIRST reference image. The framed photo depicts a CHILD of indeterminate gender at school age (approximately 10-12 years old) BUT THE CHILD'S FACE IS INTENTIONALLY BLURRED / OUT OF FOCUS / SOFT — only the silhouette of head and shoulders and a hint of a school uniform collar are recognizable. The face has no recognizable features — it is a gentle photographic blur as if the photo itself is slightly out of focus. The frame is a simple thin matte-black wooden frame. On either side of the frame, the matte stoneware ceramic vessels (faintly out of focus) from the FIRST reference image are partially visible. Behind on the dusty-pink wall, soft window light gently illuminates the surface. The whole shot has the quiet melancholy of an old memento.

Framing: the framed photo fills approximately 50% of the frame, the surrounding sideboard surface and faintly visible ceramics provide context. Eye-level. Static. Vertical 9:16. Lens: 50mm at f/2.8 (the SIDEBOARD scene is in focus, but THE CHILD'S FACE in the photograph itself is intentionally blurry — this is in-photo softness, NOT lens defocus). Kodak Portra 400 grain. Slightly desaturated warm-cool palette. Hyperreal, photoreal.
```

**Key tokens:**
- `BUT THE CHILD'S FACE IS INTENTIONALLY BLURRED / OUT OF FOCUS / SOFT` (caps-locked) — overrides the model's default to render sharp faces
- `this is in-photo softness, NOT lens defocus` — distinguishes intentional photographic blur from optical defocus
- `from the FIRST reference image` — pins the sideboard / wall / ceramics to the location plate
- `the quiet melancholy of an old memento` — mood prompt that controls light + texture

For other details (sock-rug, hand-ring, foot-rug, brass-clock, dust-motes, curtain-light, boucle-macro): same skeleton, swap the subject and keep the mood phrase.

---

## Stage 5 — Kling EN dialog clip (single speaker)

Model: `kwaivgi/kling-v3.0-pro --audio`. First-frame: a single-character close-up (top-down or side-profile). Duration 3-5s. Verbatim pattern with slots:

```
Static camera, no zoom, no pan, no dolly, no movement. {{character_b}} from the first-frame anchor remains exactly in her seated position with her head tipped back resting on the cushion-back ridge, eyes open looking up at the ceiling.

Her lips part naturally and she speaks one line quietly. Subtle micro-motion only: lips move with the words, eyelids blink once, otherwise body is still. She does NOT smile, does NOT turn her head, does NOT change posture. Calm philosophical delivery, deadpan tone.

[VOICE PROFILE — Speaker B: {{character_b_voice}}. Same voice as earlier scenes.]

Speaker B says: '{{vo_line}}'

Background: very quiet room tone, faint window-side daylight ambient. ABSOLUTELY NO MUSIC. NO instrumental score. NO melodic background. NO piano. NO drums. NO ambient pad. NO underscore.
```

**Key tokens:**
- `Static camera, no zoom, no pan, no dolly, no movement` — quadruple ban; single "static" sometimes ignored
- `remains exactly in her seated position with her head tipped back resting on the cushion-back ridge` — anchor pose continuity (Kling otherwise drifts pose mid-clip)
- `[VOICE PROFILE — Speaker B: ...]` 7-tag block + `Same voice as earlier scenes.` — cross-clip voice consistency anchor
- `Speaker B says: '<line>'` — explicit speaker-attribution syntax; useful in two-subject scenes (only one speaker's lips animate)
- Sevenfold music ban — single "no music" gets ignored on slow-tempo clips

Repeat for Speaker A, swap descriptors and voice profile.

---

## Stage 6 — Kling two-speaker merged finale (RULE 9)

Model: `kwaivgi/kling-v3.0-pro --audio`. First-frame: `top-down-tight.png` (the supplied template asset). Duration 5s. Verbatim with slots:

```
Static camera, no zoom, no pan, no dolly, no movement. Strict top-down view of BOTH people on the cushion-back ridge, exactly as in the first-frame anchor.

LEFT side of frame: {{character_a}} (Speaker A), looking up at camera, hair/locs fanned out radially against the cushion.
RIGHT side of frame: {{character_b}} (Speaker B), looking up at camera, hair fanned out radially against the cushion.

Their heads are about 30 CM APART on the cushion ridge, NOT touching. Both remain in this head-back posture throughout the entire clip — they DO NOT sit up, DO NOT change posture, DO NOT turn heads. They just lie back and exchange final quiet words.

Dialog sequence over the 5 seconds:
- (0.0-0.8s) Both silent and still, looking up at camera, holding the contemplative beat.
- (0.8-1.7s) {{character_b}} on the RIGHT (Speaker B) speaks: '{{vo_line_b}}' — only HER lips move briefly. {{character_a}}'s mouth stays closed and still throughout her line.
- (1.7-2.4s) Brief silent beat — both still, both looking up at camera.
- (2.4-3.6s) {{character_a}} on the LEFT (Speaker A) speaks slowly: '{{vo_line_a}}' — only HIS lips move. {{character_b}}'s mouth stays closed and still throughout his line.
- (3.6-5.0s) Final silent beat held — both still, both looking up at camera, hair fanned, no movement, contemplative.

Subtle natural micro-motion only — one slow blink each across the duration. NO body movement. NO posture change. Only the speaking person's lips move at each moment.

[VOICE PROFILE — Speaker A: {{character_a_voice}}. Same voice as earlier scenes.]
[VOICE PROFILE — Speaker B: {{character_b_voice}}. Same voice as earlier scenes.]

ABSOLUTELY NO MUSIC. NO instrumental score. NO melodic background. NO ambient pad. NO piano. NO drums. NO underscore. Only quiet room tone between the lines.
```

**Key tokens:**
- `Dialog sequence over the 5 seconds: - (0.0-0.8s) ... - (0.8-1.7s) ...` — explicit timed segments parsed by Kling for VO timing. Source-project Scribe confirmed Speaker B words at 899-1659ms, Speaker A words at 3720-4779ms — both within the prompted windows.
- `LEFT side of frame: [Speaker A character] ... RIGHT side of frame: [Speaker B character]` — spatial speaker mapping
- `only HER lips move briefly. {{character_a}}'s mouth stays closed and still throughout her line` — explicit non-speaking-subject mute instruction, critical for two-subject frames
- Two `[VOICE PROFILE]` blocks back-to-back — voice anchors for two distinct cross-clip identities

Limit: do not push past 2 alternating speakers per clip — Kling's lip-sync gets fuzzy.

---

## Stage 7 — Lofi cafe music bed

Model: `elevenlabs/music_v1`. Duration `<total_video_sec + 5>` (so the bed extends past the last clip for fade-out). `--force-instrumental` true. Verbatim:

```
Chill cafe lofi instrumental for a contemplative indie short film. Slow muted hip-hop drums (very soft brushed kick + soft snare on 2 and 4, dusty tape texture, no hi-hat sparkle). Warm low-fi jazz piano chords drifting in occasional voicings — sparse, not melodic, just harmonic backdrop. Subtle warm upright bass anchoring the bottom. Slightly nostalgic mood like a quiet rainy afternoon in a wood-floor cafe. 65 BPM, deeply chill, never picks up energy. NO vocals. NO bright synths. NO upbeat tempo, NO drop. NO climax. Should feel like an unobtrusive background bed under spoken dialog. -22 LUFS reference (very quiet, mix-friendly). Loopable.
```

**Key tokens:**
- `Chill cafe lofi instrumental for a contemplative indie short film` — first sentence sets the entire register; "cafe" is the magic word that pulls in jazz piano + tape texture
- `Slow muted hip-hop drums (very soft brushed kick + soft snare on 2 and 4, dusty tape texture, no hi-hat sparkle)` — drum spec down to which beats are hit + texture; suppresses default trap-style hat patterns
- `chords drifting in occasional voicings — sparse, not melodic, just harmonic backdrop` — explicit "no melody" prevents foreground earworms
- `65 BPM, deeply chill, never picks up energy. NO vocals. NO bright synths. NO upbeat tempo, NO drop. NO climax.` — tempo + 5 explicit bans
- `-22 LUFS reference (very quiet, mix-friendly)` — explicit loudness ceiling
- **AVOID:** named-artist references. First attempt with "Like Brian Eno 'Ambient 1'" got TOS-rejected. See `feedback_elevenlabs_music_no_artist_names.md`.

For variations (acoustic indie at 70 BPM, quiet ambient pad at 60 BPM), keep the structure: register sentence + instrumentation spec + tempo + 5-ban list + LUFS.

---

## Worked example — single-line dialog clip (verbatim from source project)

This is `scene-03-vid` from `noski-people-001/logs/generations.jsonl`, kept literal so you can see what the substituted prompt actually reads like end-to-end. Speaker B (red-haired young woman) on a side-profile close-up anchor:

```
Static camera, no zoom, no pan, no dolly, no movement. The young freckled red-haired woman with lavender-tipped hair from the first-frame anchor remains exactly in her seated position with her head tipped back resting on the cream boucle cushion-back ridge, eyes open looking up at the ceiling.

Her lips part naturally and she speaks one line quietly. Subtle micro-motion only: lips move with the words, eyelids blink once, otherwise body is still. She does NOT smile, does NOT turn her head, does NOT change posture. Calm philosophical delivery, deadpan tone.

[VOICE PROFILE — Speaker B: young woman, mid-20s, soft contralto voice, slight breathy quality, deadpan delivery with no theatrical inflection, slow contemplative pacing, neutral American accent (no regional tilt), slight overbite affecting sibilants. Quiet volume. NOT cheerful, NOT dramatic, NOT seductive. Almost-whispered philosophical register.]

Speaker B says: 'Socks or people — what gets lost more often?'

Background: very quiet room tone, faint window-side daylight ambient. ABSOLUTELY NO MUSIC. NO instrumental score. NO melodic background. NO piano. NO drums. NO ambient pad. NO underscore.
```

Note the verbose voice profile block (with explicit "NOT cheerful, NOT dramatic, NOT seductive" anti-tones) — keep this verbosity; it's what makes the voice land consistent across 12+ separated dialog clips.
