# Prompt Cookbook — Comic to Video

Pattern library for the i2v step (Kling v3 Pro). Covers: master prompt template, reading-order rules, camera vocabulary, lighting/mood, style preservation, speech-bubble-to-sound mapping, transitions, common mistakes, and 3 fully worked examples.

For keyframes (Gemini 3 Pro multi-ref), the rule is simpler: feed the source panel + a description of the target moment ("hero mid-punch, same line weight and halftone as source") and let multi-ref do the heavy lifting. The prompts below target the i2v call, where prompt quality dominates output quality.

---

## 1. Master prompt template

Every panel-beat i2v call should follow this structure. Skip sections that don't apply, but don't reorder — the model is sensitive to where reading order and style anchors fall.

```
[READING ORDER: Western LTR | Manga RTL | Webtoon Vertical | 4-Koma | European]

PANEL: [one-line description: who, where, what's happening]

ART STYLE PRESERVE:
- Line: [thick black ink | fine pen | sketchy charcoal | digital flat]
- Tone: [CMYK halftone | screentone | watercolor | flat color | duotone]
- Palette: [primary saturated | muted earth | cool noir | etc.]
- Visual grammar: [speed lines | sweat drops | sparkles | none]

HOOK (first 1.5-2s if this is panel 1): [one of 12 from hooks.md, expanded]

CHARACTER MOTION:
- [Subject 1]: [start pose] → [end pose], [emotional arc]
- [Subject 2]: [if applicable]

CAMERA:
- Direction: [static | pan LTR | pan RTL | push-in | pull-back | vertical scroll | rotate]
- Speed: [slow contemplative | medium | fast urgent]
- Framing: [wide | medium | close-up | extreme close-up]

ENVIRONMENT MOTION:
- [element 1]: [motion]
- [element 2]: [motion]
(Or: "Character static, environment animates" / "Environment static, character animates")

PACING: [duration in seconds, justified by emotional weight]

DIALOGUE / SFX (sync timing):
- [t=Xs] [Speaker]: "[line]" — [emotion, intensity 1-10]
- [t=Ys] SFX: [POW / WHOOSH / etc.]

TRANSITION OUT (if not final panel): [dissolve | crack | wipe | morph | page-turn | ink-splash | hard cut]
```

---

## 2. Reading order — the load-bearing rule

The model's default is Western LTR. If your source is anything else, state it explicitly or the camera will pan the wrong way and spoil reveals.

| Order | Camera default | When to use |
|---|---|---|
| Western LTR | Pan left → right; push-in lands at panel-right focal point | American superhero, DC/Marvel, Western indie |
| Manga RTL | Pan right → left; reverse all directional bias | Japanese manga, manhwa, RTL webtoons |
| Webtoon Vertical | Pan top → bottom with parallax depth | Korean webtoons, mobile-first vertical comics |
| 4-Koma | Hard cuts between 4 panels in a 2x2 or 1x4 grid; comedic timing emphasis | Newspaper comedy strips, gag sequences |
| European | Mixed; prioritize composition over directional pan | BD, ligne claire, graphic novels |

**Failure mode.** "Manga panel: villain reveal on the right, protagonist shocked on the left" without RTL annotation → model pans LTR → animates protagonist's shock first, then villain reveal. Punchline destroyed. Always annotate.

---

## 3. Camera vocabulary

Phrases that map to specific motion the model understands well. Mix and match.

**Pans.** "Pan camera left-to-right at constant speed" / "Pan right-to-left following character gaze" / "Vertical downward pan with parallax".

**Push / pull.** "Slow push-in toward the face at 1% per frame" / "Sharp push-in over 0.4s for impact emphasis" / "Pull back from close-up to wide to reveal scale".

**Rotation / dutch.** "Slight 5-degree dutch tilt during the impact" / "Rotate camera 30 degrees clockwise as the character spins" — use sparingly, dutch tilts read amateur if overused.

**Static.** "Camera locked, no movement" — strongest choice for emotional beats and 4-koma punchlines. The model wants to add motion; explicit lock prevents drift.

**Parallax.** "Foreground elements move at 1.0x camera speed, background at 0.3x" — only mention when it actually matters (webtoon drops, depth reveals). Otherwise the model invents weird parallax.

---

## 4. Lighting & mood keywords

Match source art's lighting; do not "improve" it.

- **High contrast B&W manga.** "Preserve heavy black inks and sharp light/dark cuts; do not introduce midtones."
- **Watercolor / soft.** "Soft directional light, watercolor color blending, no hard shadows."
- **Noir storyboard.** "Single-source hard light, deep blacks, narrow highlight band on character's face."
- **Webtoon digital flat.** "Even ambient light, digital flat colors, soft drop shadows only."
- **Shonen action.** "Dramatic backlight, rim light on character silhouette, saturated primary color palette."
- **Twilight / golden hour.** "Warm orange-pink sky, long shadows, soft volumetric haze."

---

## 5. Style-preservation keywords (the crown jewels)

These are the keywords that keep motion frames looking like the source instead of like generic AI animation. Include 3-5 in every prompt.

**Line.**
- `thick black ink outlines, no anti-aliasing softening`
- `fine consistent pen strokes, line weight 1-2px equivalent`
- `variable line weight (heavy at silhouette, fine at interior detail)`
- `crosshatched shading preserved during motion`
- `sketchy multi-pass pencil lines retained`

**Tone & color.**
- `CMYK halftone dot pattern in shaded areas — preserve dot grid through motion`
- `manga screentone (40% gray dot pattern) in shadow regions — pattern moves WITH the surface, not as a static overlay`
- `digital flat colors, hard color boundaries, no gradient interpolation`
- `watercolor edge bleed at color boundaries, preserved during motion`
- `duotone palette (e.g., black + single accent color), no third color introduced`
- `oil painting visible brushstroke texture, preserved during motion`

**Visual grammar.**
- `manga speed lines as environmental motion, streaming opposite to character travel`
- `sweat drop above character's brow, animates with the character's motion`
- `sparkle/star effects (shoujo) twinkle subtly, do not migrate`
- `Western comic emphasis lines radiating from impact point, fade over 0.3s`

**Failure mode.** Skipping these → motion frames drift to "smooth modern digital" rendering. The animated output looks like a different artist took over. Always preserve.

---

## 6. Sound design — speech bubbles & SFX

Bubble shape encodes emotion. Map it to VO direction:

| Bubble shape | Meaning | VO style |
|---|---|---|
| Round / rectangular | Calm speech | Neutral delivery, natural pace |
| Cloud / wispy | Internal thought | Softer, slightly reverbed, slower |
| Jagged / spiky | Yelling, anger | Loud, sharp, possibly distorted |
| Wavy | Fear, weakness | Trembling, breathy, slower |
| Small / dotted | Whisper | Quiet, close-mic'd, conspiratorial |
| Broadcast / electric | Radio, phone, TV | Filtered (band-pass EQ), slight static |

**SFX onomatopoeia → audio + secondary motion.**

| SFX text | Audio | Visual sync |
|---|---|---|
| POW / BANG / CRASH | Hard impact, sharp transient | Character recoil, environment debris |
| WHOOSH / SWISH / ZOOM | Air movement, swooping | Speed lines → motion blur, hair/cape blow |
| THUD / THUMP | Low-frequency body sound | Body sag, ground tremor |
| RUMBLE / CRACKLE | Sustained low texture | Background environmental motion (ground shake, fire) |
| SOB / GASP / SIGH | Vocal, body-sourced | Chest heave, throat catch, micro-expression |
| BEEP / CLICK | Mechanical, brief | UI/device focus shot |

Mark SFX timing in the prompt: `[t=1.3s] SFX: KRAAASSH (impact frame; environment shockwave begins this frame)`.

---

## 7. Transitions between panels

Six standard techniques. Pick by tone, not by reflex.

| Transition | Feel | Best for | Duration |
|---|---|---|---|
| Dissolve / cross-fade | Gentle, contemplative, time-passing | Dialogue scenes, emotional beats | 0.4-0.8s |
| Crack / shatter | Violent, impactful | Action climaxes, shocking reveals | 0.2-0.5s |
| Wipe (directional) | Active, momentum | Action sequences, reading-order-aligned | 0.3-0.7s |
| Morph | Surreal, transformative | Magic, dreams, internal change | 0.6-1.5s |
| Page turn / flip | Tactile, book-like | Webtoons, multi-page sequences | 0.5-1.0s |
| Ink splash / FX | Stylistic flourish | Climactic moments, scene changes with emphasis | 0.3-0.7s |
| Hard cut | Crisp, comedic, storyboard-native | 4-koma punchlines, raw storyboards, jump-scares | 0s |

**Rule.** Transition direction must align with reading order. Wipe LTR for Western, RTL for manga, vertical for webtoon. Otherwise, the eye fights the cut.

---

## 8. Common mistakes & fixes

**1. No reading order specified.** Default is LTR; manga reveals fire backwards. → Always annotate `READING ORDER:` at the top of every prompt.

**2. Style drift to generic digital.** No preservation keywords → output looks like a different animator. → Include 3-5 preserve keywords from §5 in every prompt.

**3. Trying to animate too many panels at once.** 8-panel sequence in 4 seconds = blur. → 0.5-2.5s per panel, weighted by emotion. Action 0.5-0.8s, dialogue 1.5-2.5s, comedic pause 1.0-1.5s.

**4. Vague dialogue interpretation.** "Character speaks line X" → generic mouth movement. → Specify speaker, emotion (1-10), gesture, head movement, eye direction. See §1 dialogue block.

**5. Bubble tail direction ignored.** Bubble points to character A, model animates character B speaking. → Always state `Speaker: [name], bubble tail points to [position in frame]`.

**6. Equal timing per panel.** Every panel 0.5s = comedic timing dies. → Weight by narrative role.

**7. Camera does too much.** Push-in + pan + rotate in one beat = nausea. → One primary camera move per panel; others static or a single subtle layer.

**8. Environment over-described, character under-described.** Model spends tokens on rain when it should be on the protagonist's expression. → Always lead with character motion; environment is secondary.

**9. Forgetting to mark SFX timing.** Audio and motion drift apart. → `[t=Xs]` annotations on every audio cue.

**10. Single-prompt for 12 panels.** Model can't hold 12 beats. → One i2v call per panel beat. Stitch in composition.

---

## 9. Worked example — Western LTR action (3 panels, 12s)

**Source.** Three-panel Western superhero strip: hero mid-punch (P1), villain absorbing impact (P2), villain recoiling with hero in follow-through (P3).

**Panel 1 i2v prompt:**
```
READING ORDER: Western LTR

PANEL: Hero in mid-air, fist cocked back, cape streaming, twilight Metropolis skyline behind.

ART STYLE PRESERVE:
- Heavy black ink outlines, no anti-aliasing softening
- CMYK halftone dot pattern in skin and shadow areas
- Saturated primary palette (red, blue, yellow)
- Western comic emphasis lines radiating from cocked fist

HOOK: Open frozen as static panel art for 0.4s. At 0.5s, the black panel border fractures from the upper-right and shatters outward in 10 ink-shard pieces; shards continue traveling for 0.3s as the hero begins forward motion.

CHARACTER MOTION:
- Hero: cape billowing, fist begins forward travel, body tilts into the punch direction. End frame: arm 70% extended, body fully committed forward.

CAMERA:
- Direction: subtle push-in (1.0% per frame, LTR-biased)
- Framing: medium-wide → medium

ENVIRONMENT MOTION:
- Skyline buildings: slight blur intensifies as camera pushes in
- Cape and hair: stream backward against forward motion
- Speed lines: appear faintly behind the cocked fist, intensify into full motion blur

PACING: 3.5s

DIALOGUE / SFX:
- [t=0.6s] Hero: "For Earth!" — determined, intensity 8

TRANSITION OUT: Crack/shatter into Panel 2 (0.4s, originating from where the fist will land)
```

**Panel 2 i2v prompt** (abbreviated, same style anchors):
```
READING ORDER: Western LTR
PANEL: Villain bracing for impact, hero's fist about to connect at frame center.
HOOK: (none — continues from P1's transition)
CHARACTER MOTION: Villain's arms cross defensively at t=0; impact lands at t=0.3s; villain's body absorbs force, head whips back, expression goes from defiance to shock.
CAMERA: locked, no pan; 5-degree dutch at moment of impact, returns to level by t=0.7s.
ENVIRONMENT: Shockwave radiates from impact point in concentric ink-line rings; rubble and dust kick up.
PACING: 2.5s
SFX: [t=0.3s] KRAAAASSHH (full-frame text appears, screen-shakes 4 frames)
TRANSITION OUT: Smoke/dust wipe LTR (0.5s)
```

**Panel 3.** (similar shape — villain recoiling backward, hero in follow-through stance, "You can't win, Superman..." defiant-but-hurt VO at t=1.0s, hold final frame 1.0s).

---

## 10. Worked example — Manga RTL emotional (3 panels, 11s)

**Source.** Manga shoujo confession scene: female protagonist on the right page (P1), male character profile center (P2), male turning to face her with realization on the left (P3).

**Panel 1 i2v prompt:**
```
READING ORDER: Manga RTL

PANEL: Female protagonist standing in moonlight, hand at her chest, back partially turned, looking toward the right edge of frame.

ART STYLE PRESERVE:
- Fine consistent pen strokes, manga line weight 1-2px
- 40% gray screentone in shadow regions; pattern moves with surface
- Sparkle effects around the protagonist (shoujo grammar)
- Large expressive eyes preserved at exact source proportion
- Mostly white space, selective dark areas for mood

HOOK: Speech bubble pops to life. Static panel held 0.6s. Cloud-shaped thought bubble at upper-right trembles 2 frames at t=0.7s, then pops forward with slight scale-up. Protagonist's hand at chest tightens fractionally as the thought "speaks."

CHARACTER MOTION:
- Protagonist: hand trembles slightly at chest, breathing visibly quickens, hair stirs in faint breeze. No major pose change.

CAMERA:
- Direction: slow pan right-to-left (RTL convention), starting at 0% and reaching 8% offset at end. Critical: do not pan LTR.
- Speed: very slow contemplative
- Framing: medium

ENVIRONMENT MOTION:
- Moonlight steady
- Curtains stir faintly in breeze
- Hair lifts slightly

PACING: 3.5s — emotional beat needs space

DIALOGUE / SFX:
- [t=0.8-3.0s] Thought bubble: "I have to tell him... before it's too late." — internal, near-whisper, vulnerable, intensity 4

TRANSITION OUT: Soft dissolve RTL (0.6s)
```

**Panels 2-3** follow same pattern with RTL pan, ending on male character's realization with `mouth: "I... I didn't know you felt this way..."` at intensity 6, slow eyebrow rise as the camera lands. Total runtime ~11s. No music swell — let silence carry it. Single ElevenLabs music bed of soft piano underneath.

---

## 11. Worked example — Webtoon vertical drop (4 panels, 18s)

**Source.** Vertical webtoon: character at cliff edge (P1), close on feet (P2), close on terrified face (P3), wide reveal of the drop below (P4).

**Panel 1 i2v prompt:**
```
READING ORDER: Webtoon Vertical

PANEL: Character standing at the edge of a cliff, viewed from behind/slightly above, sunny landscape behind, cliff edge in foreground.

ART STYLE PRESERVE:
- Digital flat colors, hard color boundaries, no gradient interpolation
- Soft rounded character design
- Minimal ink lines (modern webtoon digital)
- High color saturation in environmental details

HOOK: Vertical parallax drop. Camera starts above the panel composition at 0% and scrolls downward at 12%/sec for 2.0s. Distant background scrolls at 0.3x speed, middle ground 0.7x, character at 1.0x. Lock on character at t=2.0s.

CHARACTER MOTION:
- Character: takes one slow step toward the edge during 2.0-3.5s. Weight visibly shifts to forward foot.

CAMERA:
- Direction: vertical downward pan continues at 4%/sec after hook lock-in
- Framing: wide

ENVIRONMENT MOTION:
- Wind picks up: hair and clothing flutter increasingly
- Distant landscape parallax continues at 0.3x

PACING: 3.5s

DIALOGUE:
- [t=0.5-2.5s] Character: "Just one more step... I can do this." — self-motivating, slightly shaky, intensity 5

TRANSITION OUT: Vertical wipe downward into Panel 2 (0.5s)
```

**Panels 2-4.** Continue vertical scroll. P2: extreme close on feet at edge, pebbles tumble (1.5s, no dialogue, building wind). P3: extreme close on face, eyes close, deep breath, thought-bubble "What am I doing...?" at intensity 6 (4.0s). P4: full pull-back over 6.0s revealing the vast drop below — character leans forward as parallax accelerates, wind howls, no dialogue, single sustained string-music note. Sound design carries the climax.

---

## 12. Quick reference checklist

Before submitting any i2v call:

- [ ] Reading order annotated (LTR / RTL / Vertical / 4-Koma / European)
- [ ] 3-5 style preservation keywords included
- [ ] Hook described in detail (panel 1 only)
- [ ] Character motion specified per subject (start pose → end pose, emotional arc)
- [ ] Camera direction + speed + framing
- [ ] Environment motion (or "static")
- [ ] Pacing in seconds, justified by emotional weight
- [ ] Dialogue with `[t=Xs]`, speaker, emotion, intensity
- [ ] SFX with timing
- [ ] Transition out specified (or "final panel, hold")
