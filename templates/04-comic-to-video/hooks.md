# Hooks — Comic to Video openers

Twelve 2-second openers that turn a static panel into "I have to keep watching." Pick by tone (action / dialogue / emotional / environmental / comedic / webtoon) — every hook below has a "best for" line and a concrete example phrasing usable in the i2v prompt.

The hook is the first ~1.5-2.5s of the first clip. It is not a separate clip; it lives inside the prompt for the panel-1 generation.

---

## 1. Panel Crack / Shatter Reveal

**Setup.** The drawn panel border (the black rectangle around the art) cracks like glass and shatters outward at the moment of impact, revealing the animated scene within.
**Why it works.** Maps the comic's literal panel grammar onto motion. Reads as "the page is breaking open." Pure dopamine for action sequences.
**Best for.** Action climaxes, fight scenes, shocking reveals, Western superhero, shonen.
**Prompt fragment.** `Open frame frozen as static panel art for 0.4s. At 0.5s, the black panel border fractures from the impact point and shatters outward in 8-12 ink-shard pieces; shards continue traveling for 0.3s as motion begins inside the revealed scene. Treat the crack as the motion onset cue.`

---

## 2. Speech Bubble Pops to Life

**Setup.** A drawn speech bubble visibly trembles, then pops from flat-on-page into 3D, pulling viewer attention to the speaker as their mouth begins to animate.
**Why it works.** Diegetic — the bubble is already on the page; we're just making it act. Forces eye to the speaker before the line lands.
**Best for.** Dialogue-driven scenes, comedic punchlines, dramatic declarations, manga shoujo.
**Prompt fragment.** `Static panel held for 0.6s. Speech bubble at [position] trembles 2 frames, then pops forward with a slight scale-up (1.0→1.08) and the speaker's mouth begins to shape the line. Bubble tail anchors to speaker's mouth throughout.`

---

## 3. Ink Splash Transition (Internal)

**Setup.** Ink or paint erupts from the character's core (or from the panel's focal point), briefly obscures the frame, then clears to reveal the panel mid-motion.
**Why it works.** Stylistic flourish that feels native to comic ink. Hides the static-to-motion seam — the viewer never sees the art "start moving."
**Best for.** Single-panel illustrations, transformation moments, magical scenes, climactic single beats.
**Prompt fragment.** `Static panel at t=0. At 0.4s, black ink (or character-themed color) splashes outward from the character's chest, expanding to fill 80% of frame by 0.9s. Splash recedes 0.9-1.4s, revealing the panel now in motion. Splash uses the source art's ink texture, not generic CG.`

---

## 4. Page Turn / Parallax Drop

**Setup.** The current view curls or scrolls away (page turn for Western, vertical scroll for webtoon), revealing the panel beneath, with parallax depth as it lands.
**Why it works.** Tactile, book-like, native to the medium. Especially strong on webtoons where the audience already knows the scroll feel.
**Best for.** Webtoons, multi-page sequences, any "let me show you what comes next" beat.
**Prompt fragment.** `Open with prior-page edge curling from upper-right (Western LTR) or scrolling from below (webtoon vertical). At 0.6s the current panel is fully revealed, with a subtle parallax: foreground elements lag background by 1-2 frames as the page settles. Hold settled at 1.2s, then panel motion begins.`

---

## 5. Speed Lines → Motion Blur Activation

**Setup.** The panel's drawn speed lines (manga stress lines, motion lines) animate from static graphic into actual directional motion blur as the character begins to move.
**Why it works.** Converts 2D visual code (speed lines) into 3D motion the viewer feels. Honors manga grammar literally.
**Best for.** Manga action, anime-style fight scenes, sports manga, anything with drawn speed lines in the source.
**Prompt fragment.** `Static panel for 0.4s. Drawn speed lines remain frozen. At 0.5s, lines begin to streak in the direction they indicate, and the character starts the motion the lines were anticipating. By 1.0s, lines have transitioned into trailing motion blur behind the now-moving character.`

---

## 6. Spotlight / Light Flare Sweep

**Setup.** A single light element (lens flare, lamp swing, sun ray, magical glow) sweeps across the panel and triggers character motion where it lands.
**Why it works.** Guides the eye exactly where you need it, then releases tension into action. Perfect for noir, stealth, spotlight reveals.
**Best for.** Noir sequences, stealth/heist storyboards, dramatic reveals, horror beats.
**Prompt fragment.** `Frame opens dim, panel held static. A directional light (spotlight / lamp / flare) sweeps across the frame from [start point] to [end point] over 1.0-1.5s. At the moment light reaches the character, they animate (gasp / turn / freeze). Cast shadows update with the light direction.`

---

## 7. Character Steps Out of Frame

**Setup.** A foreground character takes a step or gesture that breaks the panel border — they move from inside the rectangle to partially outside it, into 3D space.
**Why it works.** Visceral "she's coming through the page" effect. Strong depth cue. Best on close-up character panels.
**Best for.** Character introductions, hero shots, "the protagonist sees you" moments, web/print crossover ads.
**Prompt fragment.** `Static panel border visible. Character moves forward and slightly off-axis; their forward shoulder, hand, or weapon crosses the panel border at 0.8s. The crossing element rounds into 3D (slight perspective gain) while the rest of the character remains inside the panel. Border stays drawn around the not-crossing portions.`

---

## 8. Background Comes Alive

**Setup.** Character holds the original drawn pose perfectly still while environmental elements (fire, water, wind, crowds, machinery, smoke) begin to animate around them.
**Why it works.** Lets the source art keep its hero pose intact while still feeling alive. Subtle, contemplative — opposite of crack-and-shatter energy.
**Best for.** Emotional beats, contemplative moments, single illustrations, scenic establishing shots.
**Prompt fragment.** `Character remains static in their drawn pose for the full 2s. Environmental elements animate independently: [fire flickers / smoke drifts upward / leaves blow / water flows / crowd shifts]. The character's static-ness is intentional — they are the still center of a moving world.`

---

## 9. Thought Bubble Unfolds Into Background

**Setup.** A character's thought or imagination bubble (cloud-shaped, wispy edges) expands from a small bubble in-frame to fill the entire background, dissolving the original setting into the imagined one.
**Why it works.** Externalizes interiority. Maps the comic convention (thoughts = cloud bubble) into a transition device. Surreal but readable.
**Best for.** Internal-monologue sequences, daydream beats, flashbacks, character-realization moments.
**Prompt fragment.** `Cloud-edged thought bubble at [position], small (15% of frame). Bubble expands organically over 1.2s, its wispy edges swallowing the original background until at 1.5s the imagined scene fills the frame. Original character remains at original scale in foreground, now standing inside their own imagination.`

---

## 10. Microexpression Zoom-In

**Setup.** Slow camera push toward the character's face while a tiny shift happens — a single eyebrow twitch, a swallow, a hand tighten. The hook is the held breath, not the motion.
**Why it works.** Deeply intimate. Honors source art that prioritizes facial nuance (shoujo manga, ligne claire, character-driven indie).
**Best for.** Emotional beats, dramatic reveals where the punch is internal, ligne claire, shoujo, character study.
**Prompt fragment.** `Open at medium framing on character's upper body. Camera pushes in toward the face at constant slow speed (1.0% scale per frame, 24fps) for 2.0s. During the push, exactly ONE micro-shift occurs — [eyebrow twitch / pupil dilate / lip tighten / single blink]. No other motion. Final framing is tight on the eyes.`

---

## 11. SFX Onomatopoeia Materializes

**Setup.** A drawn comic SFX (POW! / CRASH / WHOOSH / BANG, the bold lettered onomatopoeia) appears on-frame at the moment of action, lettering animated in with impact distortion. Audio SFX hits in sync.
**Why it works.** Keeps the comic-page feel inside the video. Particularly strong for action and comedic timing — viewers register the SFX visually before audio lands.
**Best for.** Action panels with drawn SFX in source, comedic comic strips, 4-koma punchlines, Western superhero impact frames.
**Prompt fragment.** `At impact moment (calculate from action timing), bold lettered SFX text "[WORD]" zooms in from infinity to fill 30% of frame in 0.15s, with screen-shake distortion at apex. Lettering uses the source comic's typography. Holds 2 frames at full size, then begins to fade and scatter as next motion takes over. Audio SFX sync at zoom-in apex.`

---

## 12. Vertical Parallax Drop (Webtoon-Native)

**Setup.** Camera scrolls downward through stacked layers (sky → middle ground → foreground → character → ground) at different speeds, creating dizzying 3D depth before settling on the panel's intended composition.
**Why it works.** Webtoon audiences scroll-read; this hook IS that reading motion, accelerated and given depth. Vertigo + reveal in one move.
**Best for.** Webtoons, vertical-scroll formats, height/falling/drop-related panels, atmospheric establishing shots.
**Prompt fragment.** `Open at top of source panel composition. Camera scrolls downward at constant 12% per second over 2.0s. Layers move at parallax-correct speeds: distant background at 0.3x scroll speed, middle ground at 0.7x, foreground at 1.0x, near-foreground (if any) at 1.3x. At end of scroll, camera locks on the panel's intended primary subject.`

---

## Picking the right hook

| If the panel is... | Try hook |
|---|---|
| Action, impact, fight | 1 (Crack), 5 (Speed lines), 11 (SFX) |
| Dialogue, conversation | 2 (Bubble pop), 10 (Microexpression) |
| Emotional, intimate, reveal | 3 (Ink splash), 8 (Background alive), 10 (Microexpression) |
| Environmental, atmospheric | 6 (Spotlight), 8 (Background alive) |
| Webtoon, vertical, drop | 4 (Page turn), 12 (Parallax drop) |
| Comedy, 4-koma, surprise | 2 (Bubble pop), 11 (SFX), 7 (Steps out) |
| Single illustration brought to life | 3 (Ink splash), 8 (Background alive), 10 (Microexpression) |
| Magical, transformation, surreal | 3 (Ink splash), 9 (Thought bubble unfolds) |
