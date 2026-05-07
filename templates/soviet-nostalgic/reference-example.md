# Reference example — `solutions-metal-001`

This is the concrete project that this template was extracted from. Read it to understand what a finished video in this vibe looks like. **Don't copy it literally** — the point is to absorb the tone, pacing, visual language, and structural choices, then write your own scenario through `/ralph-scenarist` based on the new product's story.

## The video

- **Product:** COTTON METAL — matte-black bucket hat made of cotton-aluminum composite fabric that holds any shape you give it
- **Brand:** `.solutions` / `nobody.solutions`
- **Length:** 65 seconds + 2s outro
- **Structure:** 8 clips — 5 in Soviet era (grandfather, 1974) + 3 in modern era (grandson Gleb, present day)
- **Music split:** Lyria2 Soviet-nostalgic bed on clips 1–5 → DJ-drop → dark trap instrumental on clips 6–8

## The reference VO (full, as aired)

Eight deadpan Russian lines delivered off-screen by a young male voice (`m0OQuJtWCw1V23P0pQmG` on ElevenLabs). Read them as a whole — the arc is setup → mechanism → rejection → hibernation → revival → product → tagline. Below is an English gloss for documentation purposes; the VO itself is delivered in Russian (translate when generating).

1. "My grandfather was a materials engineer. In nineteen-seventy-four, in a closed research institute outside Moscow, he came up with a fabric that remembers its shape."
2. "Cotton on the outside, the thinnest aluminum foil in the middle. The fabric behaves like metal, but stays soft. It takes any shape — and holds it."
3. "On the third attempt he managed to stabilize the layers. The first two were rejects. The third — it worked."
4. "That same year the development was shown to a commission. They said: out of profile. Aluminum was going to defense, cotton to towels. Shut down."
5. "Grandfather's notebook sat in a desk drawer for more than half a century."
6. "We pulled it out last winter. Worked the formulas out again and put together a small production line from scratch."
7. "The same composite. Cotton on the outside, metal on the inside. A fabric that doesn't follow a shape. It creates one."
8. "One idea. Two eras. Between them — half a century, one drawer, and one name. COTTON METAL."

(VO is delivered in Russian; English shown here for documentation. ~127 words total in Russian, ~60s at deadpan pace.)

## What to notice

- **Line length varies 10–30 words.** Short sentences land harder — line 3's "The first two were rejects. The third — it worked." is three sentences in one beat.
- **Pauses carry weight.** A single-word Russian sentence (English gloss: "Shut down.") ends the Soviet arc; another single-word sentence (English gloss: "It worked.") ends the triumph moment.
- **Concreteness beats abstraction.** "Aluminum was going to defense, cotton to towels" is worth more than "state priorities rejected consumer applications" — it gives you the visual.
- **The tagline on clip 8 is structural, not poetic.** English gloss "One idea. Two eras. …" — the structure echoes the video's own two-era shape. The brand name lands as the final word.
- **No selling language.** No "revolutionary", "unique", "best", "first ever". The narrator tells a family story; viewers sell themselves.
- **Dates are specific.** A fully spelled-out Russian year ("In nineteen-seventy-four") is stronger than a vague "In the 70s". If you know the institute, name it.
- **Objects carry the story.** The notebook, the drawer, the samples, the hat. Each is visible and referenced in VO. No generic B-roll.

## Visual arc

Clips 1–5: warm amber, Svema 35mm grain, tungsten desk lamps, green felt table, wood panels, wire-frame glasses, hand-drawn diagrams, Cyrillic handwriting. **Note:** the original `solutions-metal-001` render used a printed Cyrillic "SVEMA 35 / PHOTOGRAPH" archival matte border around each frame. That decision has since been reversed — it reads kitschy on video and shrinks the usable image area. Keep the Svema *grain and palette* but render full-bleed 9:16. See `NO_FRAME` in [fragments.md](fragments.md).

Clips 6–8: cold neutral editorial studio, grey polished concrete, matte black, sharp focus, no grain, full-bleed.

The contrast itself tells the story — era 1 is documentary and contained; era 2 is editorial and exposed.

## Per-clip motion sketch (as actually shot)

Not a rule, just the actuals for reference:

| # | Sec | What happens on-screen |
|---|---|---|
| 1 | 9 | Overhead locked-off: grandfather's hands on open 1974 notebook, finger traces diagram to a Cyrillic-handwritten date line ("11/III – 1974"). |
| 2 | 11 | Medium static: grandfather at brass microscope, adjusts focus, glances at fabric strip, returns to eyepiece |
| 3 | 7 | Top-down: three fabric samples on concrete; a hand enters, grasps the middle one, crumples it, withdraws — fabric holds the new crumpled shape |
| 4 | 10 | Very slow dolly-in over engineer's shoulder toward three commissioners behind green felt; middle one writes a single line, right one adjusts glasses, formal silence |
| 5 | 5 | Close-up on drawer: grandfather's hand releases notebook, withdraws, drawer slides two-thirds closed |
| 6 | 7 | Locked-off portrait: Gleb at concrete table, initially looking down at open notebook, slowly lifts gaze to camera, one natural blink |
| 7 | 8 | Gleb presents the hat — rotates showing texture, presses crown inward, raises it above head and places on, one confident head-tilt |
| 8 | 8 | Direct-to-camera portrait of Gleb wearing the hat, natural breathing, one blink, title `COTTON METAL` fades in last 0.8s |

## Timing numbers worth borrowing

- **Clip durations match `Math.ceil(VO_duration_seconds)`** — VO fits inside clip with 0.3–1s breathing room.
- **TransitionSeries fade crossfades = 12 frames (0.4s)** between all clip cuts.
- **DJ-drop music split:** Soviet bed volume 0.14, ducks over 5 frames at end of clip 5. Hip-hop bed volume 0.28, 2-frame attack at start of clip 6.
- **Title reveal:** opacity interpolates 0→1 over last 0.8s of clip 8.
- **Outro:** 2s black card, fade in 0.5s / fade out 0.33s.

See `composition.md` for the full Remotion pattern.

## What varies between videos in this vibe

Things that will change project-to-project:
- Product (obviously) and therefore the invention, the material, the technical payoff
- Inventor character (could be grandfather, father, uncle, aunt, older engineer from the family)
- Modern heir (brand owner or designer or whoever)
- Institute / setting (Soviet research institute, factory, university lab, regional design bureau)
- Era (1960s–1980s all work; avoid post-1989 for "Soviet" feel)
- Rejection reason (profile mismatch, military reallocation, budget cut, ministry politics)
- Exact clip count (6–10 clips fine) and durations
- Tagline word pattern

Things that should stay constant to keep the vibe:
- Two-era structure (old → shelved → revived)
- Off-screen deadpan young narrator, Russian, no talking heads
- Visual contrast Soviet documentary ↔ modern editorial
- Concrete objects carrying narrative (artifact in each era)
- ElevenLabs VO overlaid on silent Kling v3 Pro i2v (never native TTS)
- Ending on brand/product name as structural payoff
