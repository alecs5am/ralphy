# Anime Action — Prompt Cookbook

> Master prompt template, anime camera vocabulary, per-genre visual language, sound design, common mistakes, and worked examples — adapted to our `gemini-3-pro` (keyframe) + `kling-v3.0-pro` (i2v) + ElevenLabs (VO + Music) stack.

Read in order:
1. **Master template** — drop your scene into the slots.
2. **Camera vocab** — reach in here when you need a specific motion.
3. **Per-genre visual language** — pick one register and commit.
4. **Sound design** — what to ask ElevenLabs Music for.
5. **Common mistakes** — what to fix on the second pass.
6. **Worked examples** — three complete prompt blocks.

---

## 1. Master template

```
[VISUAL STYLE]
Anime-style video. Aesthetic: {shounen action | seinen drama | mecha | magical girl |
isekai | slice-of-life | sports | horror | romance-comedy | cyberpunk | OP montage}.
Art style: cel-shaded 2D anime. Limited animation with strategic key impact frames.
Color palette: {palette description, with saturation %}.

[OPENING 2-SECOND HOOK — 0:00–0:02]
Hook type: {one of 12 from hooks.md}.
Visual: {position, framing, what fills the frame, what's blurred}.
Timing: {what happens at 0.0, 0.3, 0.5, 1.0, 1.5, 2.0 s}.
Lighting: {direction + color of key light, rim color, shadow color (NOT black, named)}.
Sound: {what plays during the hook — silence, ambient, ascending tone, sting}.

[MAIN BEAT — 0:02–0:05 to 0:08]
Setting: {location, time of day, sky color, atmospheric particulars}.
Character: {gender, age range, anime proportions — large eyes (tsurime/tareme),
hair style + physics behavior, outfit register, pose}.
Action: {what happens — kept simple; one main beat, not three}.
Animation style: limited animation. {Which parts are static, which are
animated effects (aura pulse, hair float, petals drift, electricity crackle,
breathing, blink rate). Two-key-frame motion bridged by speed lines for any
fast move.}
Lighting: {rim direction + color, fill light (or absence), shadow color}.
Color: {primary palette, accent colors, saturation %}.
SFX: {speed lines, particles, sparkles, dust, sakura, screen-tone overlay flashes,
onomatopoeia text, screen shake amplitude}.

[IMPACT / RESOLUTION — last 2–3 s]
{White-flash impact frame with cross-highlight + pre-impact silence + sting}
OR
{Screen-tone overlay flash + held silence (drama)}
OR
{Costume-reveal twirl + sparkle expansion (magical girl)}
OR
{Shockwave ripple + debris burst + screen shake (mecha)}
OR
{Gentle pull-back + held breath (slice-of-life)}.

[AUDIO LAYER — for ElevenLabs Music + foley]
Music profile: {orchestral brass+strings | J-rock guitar+drums | piano+strings |
synth+arpeggios | acoustic guitar+light percussion | minor-key cello}.
Pacing: {tempo BPM, when it builds, when it ducks to silence}.
Foley / SFX: {whoosh, blade ring, body thump, transformation chime,
power-up charge, screen-shake bass, ambient rain/wind}.
Pre-impact silence: {duration of dropout before the climactic sting, typically
0.5–1.0 s}.

[OUTPUT]
Aspect ratio: 9:16 (default), or 16:9 if briefed.
Frame rate: 24fps base. Internal motion may use 12fps (2-frame) for aura
pulse / limited-animation feel.
Resolution: 1080×1920.
Color grade: {warm | cool | neutral | neon} with saturation {%}.
Cel-shading enforced — never photorealistic.
```

For the **keyframe call** (`gemini-3-pro`), strip everything except `[VISUAL STYLE]` + the apex pose description from `[MAIN BEAT]` + the `[OUTPUT]` cel-shading constraint. Give the i2v call the full block.

---

## 2. Anime camera vocabulary

| Move | What it is | Use for | Duration |
|---|---|---|---|
| **Static frame + character motion** | Locked camera, character moves through it | Slice-of-life, drama, seinen — the most under-used default | — |
| **Dramatic zoom / dolly** | Fast push toward a face or detail, stops before reaction; speed lines from corners | Incoming threat, emotional spike, power awakening | 0.4–0.8 s |
| **Rotating / orbit** | 180° or 360° around a static character | Transformation reveal, power buildup, hero introduction | 1.5–3 s |
| **Dutch angle** | Frame tilted 15–30° | Psychological tension, danger, comedic confusion (seinen, horror) | hold |
| **Parallax pan** | Lateral pan, foreground faster than background | Painterly establishing, OP transitions, slice-of-life walk | 1–3 s |
| **POV slash** | Camera at character eye level performing the action | Shounen / mecha first-person attack | 1–2 s |
| **Whip-pan** | Rapid lateral blur between subjects + *whoosh* SFX | Comedic / chaotic transition. Use 1× per video | 0.3 s |
| **Slow tracking** | Smooth follow at walking pace | Slice-of-life, drama, ED outro | 2–4 s |
| **Overhead / top-down** | Establishes scale or layout | Opening / aftermath of battle | hold |
| **Low-angle hero** | Looking up; subject imposing | Mecha framing, villain reveal | hold |
| **Smear / two-key-frame** | Pacing: hold → one stretched in-between → arrival pose. The heart of "limited animation." | All fast motion | 0.2–0.4 s |

---

## 3. Per-genre visual language (cheat sheet)

| Subgenre | Saturation | Palette | Motion / FX | Camera | Music |
|---|---|---|---|---|---|
| Shounen action | 130–150% | Red, gold, electric blue, white flash | Heavy speed lines, impact frames every 1–2 s, aura explosions, hair lifted | Dramatic zoom, low-angle hero, rotating on power-up | Orchestral brass + strings + percussion |
| Seinen drama | 60–70% | Cool grays, deep blues, muted purples | Long static shots, sparse speed lines, subtle eye animation, screen-tone flashes | Slow pan, Dutch angle, locked-off | Minor-key cello + sparse piano |
| Mecha | 110–130% | Steel grays + hot neons (cyan, magenta) | Rigid mechanical motion, pulsing core, sparks, screen shake | Low-angle hero, tight cockpit | Industrial orchestral + electronic pulse |
| Magical girl | 110% | Pastels (pink, lavender, gold) + bright accents | Transformation twirls, sparkles, light flashes, symmetrical framing | Rotating, soft tracking, gentle zoom | Crystalline chimes + harp + J-pop synth |
| Isekai | 120% | Vibrant greens, purples, warm golds | Glowing runes, spell circles, god-rays, volumetric light | Wide establishing, slow vista pan | Orchestral fantasy + woodwinds + choral |
| Slice-of-life | 75–85% | Warm pastels, golden hour | Long static, gentle motion, dust motes, sakura | Locked-off + character motion, parallax | Solo acoustic guitar / piano |
| Sports | 110–130% | Bright primaries | Heavy speed lines, slow-mo at apex, determined-face close-ups | Fast cuts, dynamic angle tracking | J-rock / driving electronic + brass |
| Horror / dark | 30–50% | Sickly green / purple / gray, heavy shadow | Disorienting speed lines, grainy texture, sudden distortion | Dutch angle, harsh low / overhead | Dissonant strings + sub-bass drone |
| Romance-comedy | 90–100% | Warm pastel + blush pink | Exaggerated expressions, chibi pops, sparkles, sweat drops | Quick comic cuts, sudden reaction zooms | Light J-pop, ukulele, piano |
| Cyberpunk | 140–160% on neons | Black + hot cyan/magenta/yellow | Holographic UI, rain, wet reflections, glitches | Low-angle alley, parallax | Synthwave: synth + sub-bass + drum machine |
| OP montage | 120–140% | Most polished version of show palette | Heavy effects stack, fast cuts, character spotlights, title slams | Cuts every 0.4–1.0 s, all motion types | J-rock-orchestral fusion + vocal lead |

---

## 4. Sound design (what to ask ElevenLabs Music for)

ElevenLabs Music is one cue per video. Pick the profile, give the duration, name the *moment of crescendo*. Foley + sting layer is mixed in composition over the music.

| Subgenre | Music profile request | Duck / silence |
|---|---|---|
| Shounen action | "Orchestral action: full brass section + driving strings + percussion. Tempo 120–140 BPM. Build to climax at {N}s." | 0.5–1.0 s of full silence right before the impact frame, then orchestral crash. |
| Seinen drama | "Solo cello + soft strings, minor key, melancholic, 60 BPM, sustained notes." | Silence at the screen-tone flash; let the music breathe. |
| Mecha | "Industrial orchestral: low brass + electronic pulse + percussion. 100 BPM. Crescendo on impact." | 0.8 s silence before the clash; then full orchestra + bass crash. |
| Magical girl | "Crystalline chimes + harp + J-pop synth, ascending arpeggios, bright 110 BPM, climax at the transformation reveal." | Brief 0.3 s silence at the white-flash peak. |
| Isekai | "Orchestral fantasy: woodwinds + harp + choral pad, 90 BPM, swelling on the establishing shot." | Optional — silence on the spell-cast moment. |
| Slice-of-life | "Solo acoustic guitar, fingerpicked, simple melody, 70 BPM, ambient throughout." | None — keep it ambient; volume low. |
| Sports | "J-rock: electric guitar + driving drums + brass stabs, 130 BPM, build to scoring moment." | 0.5 s silence on the slow-mo apex. |
| Horror | "Dissonant strings + sub-bass drone + sparse piano, atonal, slow." | Heavy silence drops; the silence *is* the score. |
| Romance-comedy | "Light J-pop: ukulele + piano + bell synth, 100 BPM, bright and bouncy." | Comedic stops on chibi pops. |
| Cyberpunk | "Synthwave: arpeggiated synth + sub-bass + drum machine, 110 BPM." | 0.3 s glitch-silence before any neon-impact moment. |
| OP montage | "J-rock-orchestral fusion: electric guitar + brass + drums + vocal-style synth lead, 130 BPM, full crescendo at the title slam." | 0.5 s silence before each major cut. |

**Foley layer** (separate, mixed in composition): blade ring (*shing*), body thump, whoosh, transformation chime, power-up charge (ascending tone), explosion bass, screen-shake rumble. Onomatopoeia *text* on screen often replaces a sound — BOOM, CRASH, WHOOSH in bold rotated katakana or English.

---

## 5. Common mistakes (and the fix)

1. **"Anime girl with big eyes."** Underspecified. Write: *anime character with large tsurime eyes, four-pointed star highlight in iris, long flowing hair with defined strands, cel-shaded peach skin, blue rim-lit, dynamic action pose, speed lines radiating from center.*
2. **Mixing anime with "cartoon."** Drop the word "cartoon." Anime has sharp lines, defined edges, specific color psychology — Western cartoon has rounder shapes and pastel softness.
3. **Describing internal states.** The model only sees visuals. Don't write *"feels sad."* Write *"shoulders slumped, head tilted down, single tear forming at inner eye corner with glossy reflection, eyebrows tilted inward-upward."*
4. **Forgetting audio.** Anime is half sound. Always specify the music profile + the silence before the sting.
5. **Static characters with no micro-animation.** Even peaceful scenes have hair drift, blink (one every 2 s), breathing rise-fall, eyebrow micro-relax. Name these.
6. **Saturation drift.** Pick the genre's saturation band and write it as a percent. Don't leave it implicit.
7. **Smooth motion request.** Don't ask for "smooth movement" — that's not anime. Ask for *two key frames bridged by speed lines, 0.3 s motion burst.*
8. **Vague hooks.** Always pick one from `hooks.md` by name and write its full timing.
9. **Asking for lip-synced dialogue.** Our i2v stack handles silence + impact stings; full dialogue lip-sync is fragile. Use VO over a static pose, or skip dialogue entirely.
10. **Mixing aesthetic styles in one scene.** Don't put magical-girl pastels into a mecha scene. Commit per scene.

---

## 6. Worked examples

> Each example is a complete prompt block, distilled to fit our 9:16 social cuts at 24fps. Treat as starting points; tune saturation / hook / music per brief.

### Example A — Shounen climax (8 s, 9:16)

```
[VISUAL STYLE]
Anime-style video. Aesthetic: shounen action climax. Cel-shaded 2D, limited animation
with impact frames. Color palette: deep blues + electric cyan + golden-orange sunset
sky + black silhouettes + warm peach skin. Saturation 140%.

[HOOK — 0:00–0:02]
Hook 1 (Eye Close-Up) + Hook 5 (Aura) hybrid: extreme close-up of male anime character's
eye fills 60% of frame. Iris golden-amber, four-pointed star highlight. 0.0 s static.
0.3 s pupil contracts, electric-blue aura ignites at frame edges. 1.0 s camera pulls
back over 1 s, revealing his determined face, dark spiky hair lifting upward in
impossible wind. Speed lines radiate outward.
Lighting: rim from electric aura (cyan on left). Shadows deep navy, not black.
Sound: 0.0–0.3 s ambient; 0.3 s ascending electronic charge tone; 1.0 s orchestral
brass sting.

[MAIN BEAT — 0:02–0:06]
Setting: open valley at sunset. Sky 70% of frame, golden-orange. Rocky ground, sparse
grass, deep blue shadows.
Character: power stance — legs shoulder-width, fists clenched. Cyan aura in 1m radius
pulses on a 0.3 s rhythm (expand → retract). Hair and clothing flutter.
Animation: limited — body static, only aura + hair + sparks animated. 12fps internal
motion for aura pulse.
SFX: aura ring expansion, white/yellow sparks drift upward, sub-radial speed lines,
brief 0.2 s screen-tone diagonal-line overlay at 0:03.5.

[IMPACT — 0:06–0:08]
0:06.0–0:06.2 — coil pose, speed lines radiate backward.
0:06.2–0:06.5 — launch forward, smear-frame elongation, blue aura motion-trail.
0:06.5 — white flash covers center 60% of frame (0.3 s). Cross-shaped highlight on
contact point.
0:06.8–0:08.0 — opponent reaction silhouette: head back, sweat-drop falling, speed
lines trail behind him.

[AUDIO]
Music: orchestral action, brass + strings + percussion, 130 BPM, crescendo at 0:06.0.
0.5 s pre-impact silence at 0:05.5–0:06.0. Orchestral CRASH + bass thump at 0:06.0.

[OUTPUT]
9:16, 1080×1920, 24fps. Saturation 140%. Cel-shaded enforced.
```

### Example B — Slice-of-life morning (6 s, 9:16)

```
[VISUAL STYLE]
Anime-style video. Aesthetic: slice-of-life morning. Cel-shaded 2D. Warm nostalgic
palette: golden-yellow sunlight, cream interior, peach skin, white pajamas.
Saturation 75%.

[HOOK — 0:00–0:02]
Hook 6 (Sakura Wind). Fade from black to close-up of pink sakura petals drifting
across frame, semi-translucent, on invisible wind. Behind petals: blurred golden
window. 0.8 s camera pulls back slowly.
Lighting: warm diffuse golden sunlight. Shadows soft warm-brown, not black.
Sound: held solo piano chord. Subtle wind. No percussion.

[MAIN BEAT — 0:02–0:06]
Setting: Japanese-style bedroom, futon on tatami, shoji screen at right casts soft
grid shadow on futon. Paper lantern in background.
Character: female, large tareme eyes (rounded, gentle), peach skin, brown hair,
white pajamas. Lying on side, eyes closed, peaceful expression.
Animation: minimal. 0:02–0:03 still. 0:03–0:03.4 eyes slowly open. 0:03.4–0:04
arm stretches lazily above head. 0:04–0:05 sits up, brushes hair. 0:05–0:06 soft
smile emerges over 0.8 s.
Lighting: warm sun from right side. Left in soft golden-brown shadow. Hair has
single bright highlight streak.
SFX: dust motes drifting in sunlight beam, subtle chest-rise breathing, blink at
0:04.6.

[OUTRO — 0:06]
Hold final frame: character looking toward window, content. Petals still drifting.

[AUDIO]
Music: solo acoustic guitar, fingerpicked, 70 BPM, ambient throughout. No percussion.

[OUTPUT]
9:16, 1080×1920, 24fps. Saturation 75%. Cel-shaded, soft-focus background.
```

### Example C — Anime OP montage (15 s, 9:16)

```
[VISUAL STYLE]
Anime OP. Cel-shaded 2D, polished, hyper-saturated, fast cuts. Saturation 130%.

[HOOK — 0:00–0:03]
Hook 7 (Title Slam). Black fades to golden sunset sky 70% of frame. Dark silhouettes
of 4 characters posed at frame bottom, golden rim. 0:01 bold anime title (white-fill
+ gold/cyan gradient, thick black outline) rotates into frame center from off-screen
with perspective + speed lines trailing. 0:02 subtitle / kanji-mark drops below.
0:02.5 orchestral brass sting + cymbal crash.

[CUT 1 — 0:03–0:06] Protagonist
Character: male, fierce tsurime eyes, electricity crackling around fists, blue aura
pulsing. Camera slow zoom on face over 0.3 s; eyes flash with cross-highlights.
Name card pops in stylized katakana.

[CUT 2 — 0:06–0:09] Action montage (4 quick cuts, 0.6–0.7 s each)
- Punch with speed-line burst + cross-highlight impact frame.
- White-flash transformation reveal — red aura instead of blue.
- Slow-mo blade unsheath, gleam flashing across blade.
- Mid-air weapons clash, white impact flash + speed lines.

[CUT 3 — 0:09–0:12] Supporting characters
0:09–0:10 magical-girl ally: pink aura, sparkles, transformation twirl.
0:10–0:11 cool male ally: dark blue aura, minimal motion.
0:11–0:12 chibi-pop comic relief, sparkle effect, name card.

[CUT 4 — 0:12–0:15] Final pose
All four characters together in heroic pose, combined auras expanding, speed lines
radiating from center. Title re-appears at 0:14. Screen-tone diagonal-line flash
at 0:14.2. Final cross-highlight impact frame at 0:14.5.

[AUDIO]
Music: J-rock-orchestral fusion — electric guitar + driving drums + brass + vocal
synth lead, 130 BPM. 0.5 s silence before each major cut. Action stings on each
key impact (0:06.4, 0:07.2, 0:08.0). Crescendo into final pose at 0:14.5.

[OUTPUT]
9:16, 1080×1920, 24fps. Saturation 130%. Cel-shaded.
```

---

## Quick checklist before submitting any anime prompt

- [ ] Subgenre named (one of ten).
- [ ] Hook chosen by name + full timing block.
- [ ] Cel-shading explicit; "no photorealism."
- [ ] Color palette + saturation % stated.
- [ ] Limited-animation pacing named (which parts static, which animated).
- [ ] One climactic beat (impact frame OR screen-tone OR transformation OR shockwave OR pull-back) — not two.
- [ ] Music profile + pre-impact silence duration.
- [ ] 9:16 + 1080×1920 + 24fps explicit.
- [ ] If a real character / franchise is named: reference uploaded, otherwise refuse per AGENTS.md rule #3.
