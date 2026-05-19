# prompt-cookbook — analog-horror-psa

Per-stage prompts extracted from `workspace/projects/analog-horror-fridge-001/` and generalized with `{{slots}}`. Every prompt below is keyed to a stage in the workflow. Replace `{{slots}}` per `TEMPLATE.md` Required Inputs.

## Stage: Image — style prototype (run ONCE first; lock the style before batching)

### Style-anchor prompt (use for scene-02 setup icon — the entity in its calm/ordinary pose)

```
Generate a pictogram icon that EXACTLY MATCHES the style of the reference image
(the yellow sitting-{{subject_warning}} pictogram on pure black).

REQUIREMENTS:
- PURE BLACK BACKGROUND hex 000000 (perfectly flat solid black, NO texture,
  NO grain, NO scanlines, NO noise on the background).
- FLAT SOLID YELLOW SHAPES hex FFD400 (completely uniform yellow fill, NO
  internal texture, NO grain, NO gradient, NO highlights — just flat yellow).
- Slightly imperfect / hand-traced outer edges (subtle wobble like a stencil),
  NO separate outline color — just flat yellow shapes directly on flat black.
- Style: simplified primitive pictogram, like a 1970s civil-defense PSA icon
  or a road-safety warning sign — bold readable shapes, no fine detail,
  no anatomical realism.
- Composition: subject occupies about 55 percent of frame, perfectly centered,
  large solid-black margin all sides. Vertical 9:16.
- No text, no logos, no watermarks, no noise.

Subject for THIS icon: A side-view {{subject_warning}} in its calm,
ordinary, recognizable pose. Simple flat pictogram, with one defining
silhouette feature so the viewer immediately recognizes the entity.
The subject looks ordinary, almost friendly. No expression beyond the
basic silhouette.
```

Negative prompt (REUSE on every image gen):

```
textured background, dark gray background, scanlines on bg, noise on bg,
paper-grain, internal texture in shape, grain inside, spray paint inside,
dotted fill, halftone fill, gradient fill, highlights inside, shadows inside,
dark outline, black border, double outline, pixel art, 8-bit, blocky voxel,
smooth perfect vector curves, 3d render, photorealism, depth of field, glow,
neon, watermark, logo, signature, fur detail, eyes detail, mouth detail,
realistic anatomy
```

Model: `google/gemini-3-pro-image-preview` with `--ref <reference-frame.jpg>` from the analyzed source video. If the reference is unavailable, prototype with `openai/gpt-5.4-image-2` first (stronger single-shot match), then style-lock and switch to gemini-3-pro-image-preview for the batch (better consistency across 9 outputs).

Key tokens that made the difference (POSTMORTEM lesson #1): "pure black background hex 000000 ... NO texture NO grain on background", "FLAT SOLID YELLOW ... NO internal texture", "slightly imperfect / hand-traced outer edges (subtle wobble like a stencil), NO separate outline color", "1970s civil-defense PSA icon". Without these specific clauses, gemini-3-pro defaults to pixel-art or spray-grain.

## Stage: Image — batch the other 9 siblings (sequential, NOT --queue)

Reuse the locked style-anchor as `--ref`. Same STYLE_BASE clause as above. Swap only the "Subject for THIS icon:" line.

### scene-01 — hook (red EBS-style title card)

```
Match the visual style of the reference image. Subject: instead of yellow,
use bold bright RED hex DD2020 for THIS icon ONLY. Show an emergency-broadcast
title-card with the bold characters '{{subject_warning_id}}' (just the
{{subject_warning_id}} characters — no other text), with thick horizontal
red bars above and below the characters. Like a 1980s Emergency Broadcast
System title card. The bars and the {{subject_warning_id}} characters all
have the same flat solid fill (no internal texture) and slightly imperfect
edges. Composition centered.
```

Append to negative: `complex letters, multiple words, paragraphs`.

### scene-03 — if-1 (entity-watches-sleeper class)

```
[STYLE_BASE — same as style prototype]

Subject for THIS icon: A horizontal bed silhouette with a sleeping
person under a blanket on the left, and {{subject_warning}} sitting
upright next to the bed on the right, head turned to face the sleeper.
The entity's eyes are two small bright dots, slightly larger than
natural. The composition reads as "watcher at the bedside." Flat
pictogram, no fine detail.
```

### scene-04 — if-2 (reflection / mirror class)

```
[STYLE_BASE]

Subject for THIS icon: A split-frame composition. Left side: {{subject_warning}}'s
head/upper-body facing right, eyes open in a normal recognizable form.
Right side: a vertical thin mirror frame, and inside the mirror the
SAME {{subject_warning}} facing left, BUT its eyes are X-shaped or
completely solid blocks instead of normal dots. The left version
reads as "real"; the mirror version reads as "wrong."
```

### scene-05 — if-3 (entity-whispers / scrambled speech class)

```
[STYLE_BASE]

Subject for THIS icon: {{subject_warning}}'s head in profile with the
mouth slightly open, and a pictogram speech bubble above it filled
with three short scrambled symbols (not real letters — like ╳ ▒ ╳).
The speech bubble reads as "wrong-speech" — the entity is saying
something the symbols cannot represent.
```

### scene-06 — do-not-1 (visual: subject + red prohibition slash)

```
[STYLE_BASE]

Subject for THIS icon: A large stylized {{subject_warning}} face
front-view with two prominent eyes, and a thick RED hex FF1A1A
diagonal prohibition slash across the eyes. Below the slash:
a tiny pictogram element marking the time-context of the
prohibition ({{do_not_1_time_context}} — e.g. a half-set sun behind
a horizon line for "after sunset", a clock for "at night", a moon
for "after midnight"). The red slash overrides the yellow.
```

### scene-07 — do-not-2 (identity-object + slash)

```
[STYLE_BASE]

Subject for THIS icon: A small pictogram of an identity object
({{do_not_2_object}} — e.g. an ID tag dangling from a chain, a
photo frame, a name plate) with three illegible pictogram glyphs
representing letters or a name, and a RED hex FF1A1A diagonal
prohibition slash across the whole object.
```

### scene-08 — do-not-3 (setup-callback + entity-mid-action + slash)

```
[STYLE_BASE]

Subject for THIS icon: A horizontal pictogram of the setup-location
({{setup_location}} — bed in source, can be couch / doorway / kitchen
floor for variants) with {{subject_warning}} mid-action toward it
(jumping / approaching / climbing), two pictogram motion lines behind
it, and a large RED hex FF1A1A prohibition slash across the entity.
```

### scene-09 — but-reversal (mark-of-absence)

```
[STYLE_BASE]

Subject for THIS icon: A pictogram of {{but_reveal_object}} — a
mark of the entity's absence. Source used a small pet headstone /
grave marker with a tiny bone carved on it, an empty collar lying
coiled on the ground in front, and below the headstone two pictogram
digits indicating a past year ({{but_reveal_year}}, e.g. "2 0 2 2").
Variants: an empty crib for a missing child, an empty doorframe for
a missing person, a vacant chair at a table. The composition must
read as "this is where it was."
```

### scene-10 — climax-sting (entity-face-goes-wrong)

```
[STYLE_BASE]

Subject for THIS icon: A {{subject_warning}} face front-view where
something has gone violently wrong. The mouth has split open too
wide, showing a row of pictogram-block teeth. The eyes are pure
black voids — completely solid black, no detail. The expression
reads as "the disguise is falling off." Flat pictogram on dark
background. This icon will only be visible for first 0.8s of
the climax scene before HARD CUT to color-bar static.
```

Note: per POSTMORTEM lesson #11, the post-cut climax is NOT this icon — it's a separately-rendered SMPTE blurred color-bar pattern in Remotion. See `composition.md` (TODO: generalize from `src/videos/analog-horror-fridge-001/index.tsx`).

## Stage: Voiceover (10 lines)

Input text format — ALL CAPS to bias ElevenLabs toward broadcast-monotone:

```
COMPLIANCE BULLETIN {{BULLETIN_ID_CAPS}}.
THIS IS A RESIDENTIAL BEHAVIORAL ALERT.
IF {{SUBJECT_WARNING_CAPS}} {{TELL_1_CAPS}}.
IF {{SUBJECT_WARNING_CAPS}} {{TELL_2_CAPS}}.
IF {{SUBJECT_WARNING_CAPS}} {{TELL_3_CAPS}}.
DO NOT {{DO_NOT_1_CAPS}}.
DO NOT {{DO_NOT_2_CAPS}}.
DO NOT {{DO_NOT_3_CAPS}}.
BUT {{BUT_REVEAL_CAPS}}.
AND {{AND_STING_CAPS}}.
```

Model: ElevenLabs `eleven_multilingual_v2` or `eleven_v3`.
Voice: `{{vo_voice_id}}`. Source winner was the "Alerter" community voice generated manually in the 11Labs UI; API-callable fallback `weA4Q36twV5kwSaTEL0Q` (Ava) reads with too much inflection — switch voices before fighting prompts.
Settings: `stability: 0.5`, `similarity_boost: 0.75`, `style: 0.10-0.15`, `use_speaker_boost: true`.
Pause: ~250ms between sentences. Generate one mp3 per scene, sequenced in Remotion against `startSec`.
Run sequentially — ElevenLabs 429s on >3 concurrent.
Verify voice exists FIRST: `xh GET /v1/voices/{{vo_voice_id}}` — community voice IDs can 404 between sessions.

## Stage: SFX (13-17 clips via `ralphy generate sfx`)

Endpoint: ElevenLabs `sound_generation_v2`. Each prompt below is a single call.

### Bed layers (long, loop under whole video)

```
deep low VHS tape hiss with subtle CRT 50Hz hum bed, steady, no transient peaks, dark atmosphere
```
→ `vhs-hiss-bed`, mixed at 0.22, full-length.

```
deep ominous low sub-bass drone, dread atmosphere, no rhythm no melody
```
→ `low-drone-bed`, mixed at 0.12, full-length.

### Per-scene starts (~120ms each)

```
very short sharp analog TV static pop, single transient burst, no music
```
→ `static-pop`, fired on every scene start, mixed at 0.55.

### Scene-specific accents

```
emergency broadcast system EBS attention signal, harsh three-tone sting, government PSA alert
```
→ `ebs-alert-tone`, scene-01 only.

```
slow heavy {{subject_warning}} panting and breathing in dark quiet room, slightly unsettling
```
→ `subject-breath-slow`, scene-03 (if-1 watcher class).

```
glass-shimmer wind chime tonal swell with reverse-air-suck, brief 1.5 seconds, eerie
```
→ `mirror-shimmer`, scene-04 (if-2 mirror class).

```
extremely distorted unintelligible whisper, slightly pitched-up, faint and buried, like a child saying something through static
```
→ `child-whisper-buried`, scene-05 (if-3 whisper class). Bury 12dB under VO.

```
deep slow {{subject_warning}} growl rising in pitch, threatening, building tension
```
→ `low-growl-rise`, scene-06 (do-not-1 prohibition).

```
single {{subject_warning}} bark heavily slowed and reverbed, distant and ominous
```
→ `distant-bark-slowed`, scene-07 (do-not-2 identity object). Adapt the verb for non-dog entities: "distant footstep slowed", "distant child-voice slowed", etc.

```
metal pet collar tag jingle that cuts off abruptly in silence
```
→ `collar-jingle-stops`, scene-09 (but-reversal, mark-of-absence). Adapt the object: door-creak-stops, music-box-stops, breath-stops.

```
cold lonely wind blowing through bare trees at night, distant rustling
```
→ `wind-through-trees`, scene-09 ambient.

```
harsh full-spectrum analog TV static burst, white noise crash, no signal screen
```
→ `rgb-static-burst`, scene-10 climax (0.8s mark).

```
monotone 1000 Hz pure sine wave tone signal-lost test pattern, holds steady, no variation
```
→ `signal-lost-tone`, scene-10 last 1.5s.

### Climax growl variants (LAYER all 4 — single growl reads as chihuahua yipping)

```
deep terrifying monstrous predator growl, low sub-bass roar like a massive bear or wolf, threatening guttural snarl, building tension, no music
```
→ `climax-growl-v1`, scene-10 at +1.5s offset, volume 0.55.

```
demonic bone-rattling guttural snarl, very deep pitch-shifted-down predator roar, slow build with subsonic frequencies, horror movie monster reveal
```
→ `climax-growl-v2`, +1.8s, vol 0.55.

```
huge feral wolf growl pitched 8 semitones down, layered with rumbling sub-bass, eerie, slow inhale-exhale snarl, no melody
```
→ `climax-growl-v3`, +1.9s, vol 0.60.

```
inhuman beast guttural roar building from quiet to loud, distorted analog tape, low-frequency rumble, body-shaking dread
```
→ `climax-growl-v4`, +2.1s, vol 0.60.

## Stage: Music (OPTIONAL — default is OFF)

Default: no music. Pure SFX bed. Skip this stage.

If a dread-build bed is needed, the 2-min path is:

```bash
ralphy ref pull <yt-music-url> --audio-only
cp workspace/references/<slug>/audio.mp3 assets/music/bed.mp3
```

Source used: "Sound Production Gin - Creepy scary horror synth tension" via yt-dlp. Mix at volume 0.35-0.40 (POSTMORTEM lesson #10 — anything under 0.30 is inaudible against the VHS-hiss bed).

ElevenLabs Music was not attempted on this format. The yt-dlp path was faster and the result already matched. If you do try ElevenLabs Music, the slop prevention rule applies — no artist / producer names (see MEMORY note `feedback_elevenlabs_music_no_artist_names`).

## Stage: Captions (Remotion, no LLM)

Captions are derived from the VO text — same content, uppercase, word-by-word. Style spec is in `template.json:captionsStyle`. No prompt needed; this is a Remotion render decision.

Style cheatsheet:
- Font: VT323 (Google Fonts)
- Fill: `#FFD400`, stroke: `#000000` 6px
- Size: 112px, anchor: bottom-center, y=1500 on 1080×1920
- Per-word fire, 350ms hold, 60ms fade
- Glitch offset: 4px in `#ff0033` (red), as a second offset layer behind
- SAME 5-layer chromatic split as the icons (red −12px hue −40° blur 4, green +12px hue +60° blur 4, blue ±random hue 180° flicker, white halo blur 22 opacity 0.55, sharp core blur 0.9 — all `mixBlendMode: "screen"` except core)
- SAME jitter beat as the icons (`frame % 18 <= 1 ? 16 : 0` for +X jump, `frame % 18 >= 9 && <= 10 ? -16 : 0` for −X jump)

## Fragment library (reuse across all icon prompts)

### STYLE_BASE (paste into every sibling-icon prompt after the prototype is locked)

```
Generate a pictogram icon that EXACTLY MATCHES the style of the reference image.

REQUIREMENTS:
- PURE BLACK BACKGROUND hex 000000 (perfectly flat solid black, NO texture,
  NO grain, NO scanlines, NO noise on the background).
- FLAT SOLID YELLOW SHAPES hex FFD400 (completely uniform yellow fill, NO
  internal texture, NO grain, NO gradient, NO highlights — just flat yellow).
- Slightly imperfect / hand-traced outer edges (subtle wobble like a stencil),
  NO separate outline color — just flat yellow shapes directly on flat black.
- Style: simplified primitive pictogram, like a 1970s civil-defense PSA icon
  or a road-safety warning sign — bold readable shapes, no fine detail,
  no anatomical realism.
- Composition: subject occupies about 55-60 percent of frame, perfectly centered,
  large solid-black margin all sides. Vertical 9:16.
- No text, no logos, no watermarks, no noise.
```

### NEGATIVE_BASE (every image gen)

```
textured background, dark gray background, scanlines on bg, noise on bg,
paper-grain, internal texture in shape, grain inside, spray paint inside,
dotted fill, halftone fill, gradient fill, highlights inside, shadows inside,
dark outline, black border, double outline, pixel art, 8-bit, blocky voxel,
smooth perfect vector curves, 3d render, photorealism, depth of field, glow,
neon, watermark, logo, signature, fur detail, eyes detail, mouth detail,
realistic anatomy
```

### PROHIBITION_SLASH_CLAUSE (use in any do-not icon)

```
A thick RED hex FF1A1A diagonal prohibition slash across the subject.
The red slash overrides the yellow, reads as the universal NO sign.
```
