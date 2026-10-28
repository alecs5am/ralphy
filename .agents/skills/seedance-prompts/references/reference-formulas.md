# Seedance 2.0 official reference formulas and in-video text

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Text in Video (guide §02)

Seedance 2.0 can bake text overlays in **T2V, I2V, R2V, and V2V** scenarios. It auto-matches style and color to context, and you can also specify color, font, appearance method, timing, and position. **Use common characters — avoid rare glyphs or special symbols** for reliable rendering. For strict logo/wordmark fidelity, drive it from a reference image instead (see Logo Reference below).

### Slogans / Title text — guide §2.1
```
Formula: [Text Content] + [Appearance Timing] + [Position]
         + [Appearance Method], [Text Style (color, font)]

Example: Hand-drawn comic style, three people sitting together eating
the fried chicken from Image 1, the atmosphere friendly and joyful, then
the scene gradually blurs and the text "Joy is in Seedance" appears in
the center of the screen.
```

### Subtitles — guide §2.2
Bottom-of-screen text synchronized to the audio/narration rhythm. Describe the spoken line, then say subtitles follow it.
```
Pattern: ...subtitles appear at the bottom of the screen with the content
"...", synchronized with the audio rhythm.

Example: Generate a video with voiceover narration. A deep, calm male
voice says: "In the grand universe, our world is but a fleeting moment..."
The scene slowly transitions from night to dawn. Subtitles appear at the
bottom of the screen following the narration.
```
Works for dialogue too: give each speaker's line and add "subtitles appear at the bottom matching each line."

### Speech bubbles — guide §2.3
Dialogue rendered in a bubble anchored to the speaking character.
```
Pattern: [Character] says: "...", speech bubbles appear around the
character with the dialogue text.

Example: The two people from Image 1 run on a school track. The girl
smiles and says: "We can definitely do it!" The camera cuts to the boy,
who hesitates: "Are you sure?" Speech bubbles appear around each speaking
character with the corresponding dialogue.
```

---

## Official Reference Formulas (guide §3–§4)

The capability patterns above show worked examples; these are the bare formula templates straight from the guide. Fill the brackets, keep references explicit.

### Image reference
```
§3.1 Multi-angle subject:
  Reference / Extract / Combine + [Image N]'s [Subject], generate
  [Scene Description], maintaining consistent [Subject] features.

§3.2 Multi-image (logo / multi-subject / multi-element / storyboard):
  Reference / Extract / Combine / Follow / Generate + [Image N]'s
  [Referenced Element], generate [Scene Description], maintaining
  consistent [Referenced Element] features.
```
Multi-image sub-patterns the guide calls out explicitly:
- **Logo** — "...the scene gradually blurs, then the Logo from Image 1 appears" (timed reveal), or "the logo from Image 5 is always displayed in the bottom-right corner."
- **Multi-element** — assign every asset a slot in one sentence: "scene set inside the restaurant from Image 4; the girl from Image 1 wearing the outfit from Image 2; the boy from Image 3 walks up; the logo from Image 5 in the bottom-right."
- **Multi-panel storyboard** — "Reference the storyboard in the image; each panel's composition should appear in order," optionally binding character refs to panels (girl = Image 1, dad = Image 2) and panning between panel scenes.

### Video reference
```
§4.1 Action:   Reference [Video N]'s [Action], generate [Scene],
               maintaining consistent action details.
§4.2 Camera:   Reference [Video N]'s [Camera Movement], generate [Scene],
               maintaining consistent camera movement.
§4.3 Effects:  Reference [Video N]'s [Effects], generate [Scene],
               maintaining consistent effects.
```

### Video editing — Add / Remove / Modify (guide §5.1)
```
Add:    At [Time Position] + [Spatial Position] of [Video N], add
        [Desired Element].
Remove: Remove [Element] from [Video N], keep everything else unchanged.
Modify: Replace [Original Element] in [Video N] with [Desired Element]
        (keep motion and camera unchanged).
```

---
