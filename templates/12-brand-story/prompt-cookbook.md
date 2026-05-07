# Brand Story — prompt-cookbook.md

> Practical prompt patterns for building a 30-60s cinematic brand film with `ralphy generate` (gemini-3-pro keyframes → kling-v3.0-pro i2v → ElevenLabs VO + music).
> Read `TEMPLATE.md` first for the structural arc; this file is operational.

---

## Master prompt template

Every brand-story i2v prompt should describe one beat (5-second clip) with these slots filled. Build 6-12 of these, one per beat, sharing the same protagonist, location vocabulary, and color palette.

```
[BEAT NAME — e.g. "inciting moment, beat 3 of 7"]
[1 line: who is in frame, doing what]
[1 line: light + texture — golden-hour window light, warm practicals,
  weathered wood, soft fabric, steam off a cup]
[1 line: emotion in the face — restrained, specific. "quiet recognition,"
  not "joy." "tired but determined," not "happy"]
[1 line: camera — held framing, slow push, locked-off, handheld breath.
  Avoid frantic motion. Cinematic register favors stillness]
[1 line: what happens across the 5 seconds — the small change.
  A hand reaches. A breath is taken. Eyes refocus]
[1 line: continuity flag — "matches color and wardrobe of beat 2,"
  "same kitchen, later light"]
[authenticity flags — "real wear on the apron," "messy whiteboard,"
  "imperfect spill on the counter"]
```

Keep each beat self-contained but visually continuous with its neighbors. The keyframe model (gemini-3-pro) reads the *first frame* — describe the still you want it to draw.

---

## The seven narrative beats — prompt fragments

### Beat 1 — Hook (0-2s)
Pick one of the 12 patterns from `hooks.md`. Prompt the *single still frame* that opens the film. Examples:

- *"Tight macro of a 60-year-old woman's hands on a wooden countertop, flour-dusted, mid-motion of pressing dough. Window light from screen left. Worn apron edge visible at frame top. No face yet. Quiet, intimate, reverent. Locked-off camera."*
- *"Black frame. White serif typography appears: '2 billion people. We changed it for 10,000.' Hold."*

### Beat 2 — Setup / world (2-8s)
Establish the protagonist and the world. Pull back, show the room. Prompt the keyframe to describe the environment as much as the person.

- *"Wide of the same kitchen from beat 1. Late afternoon light through three windows, olive trees visible outside. The woman is now centered in frame, working calmly. Warm earth-tone palette. Wooden ceiling beams, copper pots on the wall, a child's drawing taped to the fridge — lived-in, decades-old space. Color: amber, terracotta, soft white."*

### Beat 3 — Inciting moment (8-15s)
The friction, the realization, the moment something had to change. Prompt for emotional specificity, not drama.

- *"Mid-shot of the founder at a laptop in her apartment, evening, a single lamp lit. Her face shows the exact expression of someone seeing the same error for the fifth time tonight — not theatrical frustration, just tired recognition. Books and coffee cups in the background. Camera slow push toward her face."*

### Beat 4 — Emergence montage (15-30s)
Three to five quick beats inside this 15s window. Hands, faces, iteration, small wins. This is where rhythm picks up slightly.

Prompt each sub-beat as its own clip:
- *"Whiteboard close-up: equations and arrows in different handwriting, half-erased, smudged. A hand adds a new arrow."*
- *"Two co-founders mid-conversation at a small table, leaning in, both talking at once. Real animated dialogue, not posed. Coffee shop window light."*
- *"First user, mid-30s, skeptical face shifting to surprise as she scrolls. We see her face, not her screen."*

### Beat 5 — Transformation (30-45s)
Concrete change shown in authentic context. Avoid montage here — slow down, hold one or two moments long.

- *"Same founder, six months later, in a small but real office (not glossy, not staged — real). She is touching the screen of her product gently, looking at her co-founder beside her. The smile that crosses her face is small and earned. No voiceover. Hold the shot 4 seconds."*

### Beat 6 — Closing reflection (45-55s)
Return to the protagonist or to a visual rhyme with the hook. One last line of voiceover or one final image that lands the meaning.

- *"Tight on the founder's face, same lighting as beat 1 if possible. She looks just past camera, not into it. Voiceover ends: 'It wasn't about the product. It was about being trusted with the work.'"*

### Beat 7 — Brand signature (55-60s)
Logo and tagline on a calm background — ideally pulled from the film's own world (the kitchen wall, the workshop bench), not a separate end-card.

- *"Slow fade to a 2-second hold of the brand mark, simple typography, on a softly out-of-focus version of the opening environment. No motion graphics. No swoosh."*

---

## Lighting & cinematography defaults

- **Interview / talking-head beats.** Soft key from a window or large diffused source at 45°. Practical lights warm the background. Subject 6-8 feet from a soft background. Avoid hard ring-light look — that's UGC, not brand film.
- **B-roll / process beats.** Available light wherever possible. If the workshop is dim, let it be dim — overheads and bounce should *recover* shape, not flatten the room. The shadows are the budget you spend on credibility.
- **Hero / transformation beat.** Slightly more shaped: a stronger key, a kicker, a deeper background fall-off. This is where you can spend a touch of cinematic polish.
- **Aspect ratio.** Default 16:9 for the master. If the deliverable is also vertical, frame all subjects center-third so a 9:16 crop survives without re-shooting.

Color palette: pick three. Two anchors (warm or cool, depending on register) and one accent. Bleed the accent through — one prop, one piece of wardrobe, one wall — so the film feels color-disciplined without being monochrome.

---

## Voiceover prompts (ElevenLabs)

Two reliable modes:

**Founder mode.** `eleven_multilingual_v2`, voice cloned from a founder reference take. Stability 0.4-0.55 (let the breath in), similarity 0.75, style 0.15-0.25 (warm but restrained). Cap line length at ~14 words. Insert ellipses for natural pauses. Specify in the brief: *"conversational, reflective, no broadcast voice."*

**Customer-testimony mode.** Same model, slightly higher style (0.3-0.4) for emotional honesty. Pick a slightly less-perfected delivery — a take with a small stumble lands more honestly than a clean one.

**Pure visual / no-VO mode.** Skip TTS. Score and ambient sound carry the arc. Hardest mode, often strongest for manifesto register.

Universal rule: cut the script in half before recording, then again before mixing.

---

## Music guidance (ElevenLabs Music)

One track, four phases:

1. **Sparse** — beat 1-2. A single instrument or pad. Almost not there.
2. **Build** — beat 3-4. Add a second voice, a low pulse. Don't introduce melody yet.
3. **Swell** — beat 5 (transformation). Melody arrives. This is the only place the music is allowed to lead the emotion.
4. **Resolve** — beat 6-7. Pull back to one or two instruments. Hold a sustained note under the closing line and the brand mark.

Prompt example: *"Cinematic score, 60 seconds, warm strings and piano, sparse intro, slow build to a single emotional swell at 0:32, resolves to a held note at 0:50. No percussion until 0:25. No EDM, no trailer drops. Reference texture: 'restrained, contemplative, neither sad nor triumphant.'"*

Ambient layer: optionally add live source audio captured from the brand environment — looms, kitchen, keyboard, factory floor — mixed low under the score. This is the cheapest, highest-impact authenticity move available in the genre.

---

## Eight common mistakes and how to fix them

1. **Leading with the product instead of the problem.** Open on the human gap, not the SKU. The product appears in beat 4 or 5, never beat 1.
2. **Over-narration.** Every line of VO that explains a visual is a line that should be cut. Trust the picture.
3. **Cast actors instead of real people.** Audience BS-detector triggers immediately. Use real founders, real customers, real workers — even if they're shy or imperfect on camera. Imperfection is the point.
4. **Beautiful footage that doesn't serve the story.** Cinematography for its own sake reads as a music video, not a brand film. Every shot must answer: *what does this reveal about character, challenge, or transformation?* If it's only pretty, cut it.
5. **Manufactured emotion.** Performed tears, scripted hugs, on-cue smiles. Replace with situation that *generates* the feeling and then capture what actually happens.
6. **Pacing too fast.** Brand story is the cinematic register — held shots, breath room, silence before the line. If your instinct is to cut, hold one beat longer.
7. **Corporate jargon in voiceover.** "Innovative solutions," "leveraging synergies," "best-in-class." Replace with how a real person describes the work to a friend. Specific over abstract, every time.
8. **Ending on the logo instead of the emotion.** Climax → emotional hold → *then* logo as quiet coda. Reversing this collapses everything you spent 50 seconds building.

---

## Worked examples — three short briefs and their prompt skeleton

### Example A — Tech startup origin (60s, founder mode, 16:9)

> **Brief.** Two-co-founder SaaS company. Founder Anna kept losing client data on legacy tools, met co-founder Mike at a coffee shop, they built the alternative. 18 months in. Goal: investor / press use.

- **Hook (beat 1).** Macro of Anna's hands on a laptop at night, single lamp, the same error message reflected in her glasses. Frustration that is tired, not theatrical.
- **Setup (beat 2).** Pull back. Apartment. Sticky notes on the wall. Cold coffee. The viewer recognizes the feeling.
- **Inciting (beat 3).** Coffee shop, Anna and Mike leaning in mid-conversation. They are finishing each other's sentences about the same problem. The recognition crosses both faces.
- **Emergence (beat 4).** Whiteboard close-up. Two laptops at midnight. A failed test, then a working one. First skeptical user. Quick cuts but each held 1.2-1.5s.
- **Transformation (beat 5).** Six months later. Real (small) office. Anna touches the product on the screen. Co-founder beside her. Small earned smile. Hold 4s, no VO.
- **Closing (beat 6).** Anna alone at the same window. Voiceover: *"We didn't build a product. We built the thing that was missing."*
- **Signature (beat 7).** Logo, tagline, on the out-of-focus office background.
- **Music.** Sparse piano build to one swell at the office reveal, holds.

### Example B — Artisan food, three generations (60s, warm-nostalgic, 16:9)

> **Brief.** Family pasta brand "Since 1967." Grandmother, daughter, granddaughter still make it the same way. Goal: website hero + holiday campaign.

- **Hook.** 78-year-old hands rolling pasta on a wooden counter. No face. Window light. Sound of the wood and the dough.
- **Setup.** Pull back to the small Italian kitchen. Olive trees outside. Decades-old apron.
- **Inciting.** Cut to the daughter, 50s, in a different kitchen, same exact movement. Then to the granddaughter, 20s, hands overlapping with grandmother's, learning.
- **Emergence.** Sourcing journey: visiting the wheat farmer, selecting eggs, tasting salt. Each ingredient, each relationship.
- **Transformation.** Three generations at one table, eating. A small child joins.
- **Closing.** Granddaughter's face mid-bite, recognizing what she just made. Grandmother's voiceover (Italian, subtitled): *"This is not pasta. This is memory."*
- **Signature.** "Since 1967." Plain serif on a soft background of the kitchen wall.
- **Music.** Acoustic, gentle, no drums. Builds at the shared table.

### Example C — Mission-driven nonprofit (45s, manifesto register, 9:16 vertical)

> **Brief.** Clean-water nonprofit. 10,000 lives changed in three target regions. Goal: LinkedIn + donor email.

- **Hook.** Black screen. Type: *"2 billion people. We changed it for 10,000."* Hold 1.5s.
- **Setup.** Cut to a child filling a clean bucket at a new community well. Morning light. Real, not staged.
- **Inciting.** Quick context: a previous shot of the same village without the well — dust, distance, the daily walk.
- **Emergence.** Build crew, local engineers, the day the pump first ran. Faces, not infrastructure.
- **Transformation.** Mother and child drinking the water. The mother looks at the camera, briefly, then away.
- **Closing.** Wide of the village at golden hour. Type: *"10,000 is not enough. Help us get to the next 10,000."*
- **Signature.** Logo, donate URL.
- **Music.** Minimal, builds late. Live ambient: water, footsteps, a children's choir caught faintly from a school down the road.

---

## CLI cookbook — what to actually run

```bash
# 1. New project, brand reference required
ralphy project create "<brand-name> brand story" --template 12-brand-story

# 2. Drop reference assets (logo, founder photo, archive, brand colors)
ralphy project log-asset <id> --kind logo --path ./assets/logo.svg
ralphy project log-asset <id> --kind founder-photo --path ./assets/founder.jpg

# 3. Scenario from brief (writes scenario.json with 6-12 beats)
ralphy generate scenario <id> --brief ./brief.md

# 4. Keyframes (gemini-3-pro, multi-ref with founder/logo)
ralphy generate image <id> --beat all

# 5. Clips (kling-v3.0-pro, 5s each, audio off)
ralphy generate video <id> --beat all

# 6. Voiceover (founder voice or scripted)
ralphy generate voiceover <id> --voice <voice-id>

# 7. Music (one sparse-build-swell-resolve track)
ralphy generate music <id> --duration 60 --shape sparse-build-swell-resolve

# 8. Render
ralphy render <id>
```

If a beat fails the quality gate twice, stop. Do not bake an mp4 over a failed scoreVideo — see AGENTS.md hard rule #4.
