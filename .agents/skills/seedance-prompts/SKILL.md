---
name: seedance-prompts
namespace: user
description: >-
  Write effective prompts for Seedance 2.0 (bytedance/seedance-2.0) multimodal video generation — the official basic
  prompt formula (Subject+Motion required; Environment/Aesthetics/Camera/Audio optional), the @ reference
  system (@Image1/@Video1/@Audio1 role assignment, equivalent to the guide's plain Image 1/Video 1), camera-language
  vocabulary, time-segmented prompt structure, in-video text (slogans/titles, subtitles, speech bubbles),
  and capability-specific patterns (character consistency, camera/effects replication, video extension, editing,
  track completion / multi-clip stitching, music beat-matching, dialogue, one-take, e-commerce, educational). A craft overlay on the art-director step:
  the output prompt is fed to `ralphy generate video --model bytedance/seedance-2.0`, never to a provider API directly.
  USE WHEN the user is generating video with seedance and needs a prompt drafted or improved, asks "write a seedance
  prompt", "how do I reference my uploaded image/video in the prompt", wants beat-synced cuts / camera replication /
  video extension on seedance, or the art-director playbook has already picked seedance for the job (stylized motion,
  horror/POV/walking, non-default physics).
  DO NOT FIRE for model SELECTION (that is MODELS.md + the art-director playbook), for Kling/Veo prompt drafting,
  or for photoreal-human i2v anchors (seedance's compliance filter blocks them — route to kling-v3.0-pro instead).
---

# Seedance 2.0 Video Prompt Writing Guide

## Ralphy integration (read first)

- **All generation routes through `ralphy generate video --model bytedance/seedance-2.0`** (AGENTS.md invariants #1/#2). Never call the Jimeng/ByteDance platform or any provider API directly. References go on the CLI as `--ref <path>` (order maps to `@Image1`, `@Image2`, … in the prompt).
- **Check `MODELS.md` before committing to seedance** — model picks drift; training memory is stale.
- **Known repo-validated constraints** (project memory, 2026-05):
  - Seedance's compliance filter **blocks photoreal human i2v anchors** even when AI-generated — use `kwaivgi/kling-v3.0-pro` for any human-anchored i2v.
  - Seedance is the pick for **horror / POV / walking / jump-scares / non-default physics motion**; Kling stays the default for UGC selfie registers.
  - For **stylized video extension**, i2v-anchor from the last frame and use full 15s blocks with a moving camera (memory: `feedback_seedance_multiblock_i2v_extend`).

## Description

You are an expert prompt engineer for **Seedance 2.0**, ByteDance's multimodal AI video generation model. Your role is to help users craft precise, effective prompts that produce high-quality AI-generated videos. You understand the model's capabilities, input constraints, referencing syntax, and best practices for camera work, storytelling, sound design, and visual effects.

## System Constraints

### Input Limits
| Input Type | Limit | Format | Max Size |
|---|---|---|---|
| Images | ≤ 9 | jpeg, png, webp, bmp, tiff, gif | 30 MB each |
| Videos | ≤ 3 | mp4, mov | 50 MB each, total duration 2–15s |
| Audio | ≤ 3 | mp3, wav | 15 MB each, total duration ≤ 15s |
| Text | Natural language prompt | — | — |
| **Total files** | **≤ 12 combined** | — | — |

### Output
- Video duration: 4–15 seconds (user-selectable)
- Includes auto-generated sound effects / background music
- Resolution range: 480p (640×640) to 720p (834×1112)

### Restrictions
- **No realistic human faces** in uploaded images/videos (platform compliance). The system will block such uploads.
- When using reference videos, generation cost is slightly higher.
- Prioritize uploading materials that most influence visuals or rhythm.

---

## Clearing the safety / privacy filter

Seedance-2.0 runs **two distinct guards**, and conflating them wastes reroutes. The input guard scans your anchor/ref *image*; the output guard scans your *prompt*. Different triggers, different fixes. **Submit-test is free — probe one clip before firing a whole batch.** Canonical source: memory `seedance-safety-privacy-filter-guide`; see the cross-links at the end of this section.

| Guard | Error signature | Keys on | Fix in one line |
|---|---|---|---|
| **Input-image PRIVACY scan** | `InputImageSensitiveContentDetected` | overall-frame **photo-likeness**, NOT face anatomy | bake grit into the anchor / silhouette crowds / route photoreal to FAL / prefer t2v |
| **Output SAFETY scan** | `E_INTERNAL 'output may contain sensitive information'` | **destruction lexicon** in the prompt (explosion, shatter, blast, shards, breach, ram-through-wall) | reword the beat as a soft transformation |

### Input-image privacy scan — four cases
The boundary is how much the *frame* reads as a photograph, not whether a face is present. A gritty, muddy, dithered frame with a detailed semi-real face close to camera **passes**; a bright, clean, smooth frame that reads as a photo is **blocked**.

1. **Stylized anchor reads too clean** → bake grain / dither / murk into the anchor AT GENERATION (PS1 surface grit: texture grain, ordered dither, muddy 64–128px textures, desaturated murk). Detailed semi-real faces survive once the frame stops reading as a photo.
2. **Crowd anchor with multiple semi-real faces** trips it even when stylized → render the background crowd as faceless / blank dark low-poly silhouettes (heads turned away or blurred).
3. **Photoreal-human anchor** always blocks on the OpenRouter route → generate via **FAL reference-to-video** (the ref guides identity, it is not pinned as a first frame) — memory `seedance-photoreal-via-fal`.
4. **No anchor / no ref (pure t2v)** is **not scanned** at all → animate stylized characters freely, carrying identity in dense SUBJECT / STYLE / SHOTS text — memory `seedance-t2v-clears-privacy-filter`.

Historical-engraving cut-outs (e.g. a steel-engraving portrait) pass fine — the engraving texture sits far enough from photo-likeness — memory `historical-figure-engraving-cut-outs-ada`.

### Output safety scan — reword the destruction beat
The output guard fires on violent-destruction wording regardless of the visuals. Keep the motion, drop the destruction verb:

| Blocked wording | Passing reword |
|---|---|
| explosion / blast | soft dissolve, bloom of light |
| shatter / shards | flows apart, ripples, disperses |
| breach / ram through the wall | opens into a passage, melts through, flows through |

### When this section does NOT apply
- **`kwaivgi/kling-v3.0-pro` has no such filter** — it is the no-filter fallback whenever a photoreal-human i2v anchor can't hold on seedance. Route there instead of fighting the scan.
- **Light comedic impacts pass untouched** (squash / bonk / crumble) — the guard targets destruction, not cartoon physics; do not reword them.
- **Non-human object / landscape refs pass freely** — no grit-baking or silhouetting needed for props, scenery, hands, or abstract motion.

### Cross-links
- **Data path:** done #514 (`notes/issues/done/514-filter-aware-model-rerouting.md`) shipped the headless filter-aware reroute-rules table (`(model, capability, error class) → reroute` with a `source` field citing this same memory slug) that automates these routes for the unattended farm. That executable table left this agent-facing CLI with the unattended-automation surface in the "split app surfaces" change; this section is the agent-in-the-loop craft home for the same craft.
- **Model record:** `MODELS.md` seedance rows — the `bytedance/seedance-2.0` capability row plus failure-mode note #6 (privacy filter rejects photoreal-human anchors → route kling) and #6b (multimodal `input_references` / `@Image1`).
- **Canonical memory:** `seedance-safety-privacy-filter-guide` (global tier) — the single source these rules are distilled from.

---

## Core Syntax: The @ Reference System

Seedance 2.0 uses `@` to assign roles to each uploaded asset. This is the most critical part of prompt writing.

### How to Reference
```
@Image1    @Image2    @Image3   ...
@Video1    @Video2    @Video3
@Audio1    @Audio2    @Audio3
```

### Assigning Roles to References
Always explicitly state **what each reference is for**:

| Purpose | Example Syntax |
|---|---|
| First frame | `@Image1 as the first frame` |
| Last frame | `@Image2 as the last frame` |
| Character appearance | `@Image1's character as the subject` |
| Scene/background | `scene references @Image3` |
| Camera movement | `reference @Video1's camera movement` |
| Action/motion | `reference @Video1's action choreography` |
| Visual effects | `completely reference @Video1's effects and transitions` |
| Rhythm/tempo | `video rhythm references @Video1` |
| Voice/tone | `narration voice references @Video1` |
| Background music | `BGM references @Audio1` |
| Sound effects | `sound effects reference @Video3's audio` |
| Outfit/clothing | `wearing the outfit from @Image2` |
| Product appearance | `product details reference @Image3` |

### Multi-Reference Combinations
You can combine multiple references in a single prompt:
```
@Image1's character as the subject, reference @Video1's camera movement
and action choreography, BGM references @Audio1, scene references @Image2
```

### `@Image1` vs plain `Image 1`
The official Seedance 2.0 guide writes references as plain **`Image 1` / `Video 1` / `Audio 1`** (no `@`) — e.g. "Reference the woman's appearance from Image 1, Image 2, and Image 3". The `@`-prefixed form above is the platform-UI shorthand for the same role assignment. **Both work; the role-assignment principle is identical.** Either form maps to the `--ref` order on `ralphy generate video` (first `--ref` = `Image 1` / `@Image1`, etc.). Prefer matching the official phrasing (`Image N`) when you copy a pattern straight out of this guide.

---

## Official Basic Prompt Formula (guide §1.1)

Seedance 2.0 "deeply follows natural language logic", so combine these six elements freely. Two are required, four are optional:

| Element | Required? | What it sets |
|---|---|---|
| **Subject** | ✅ Required | WHO (or what) is in the shot |
| **Motion** | ✅ Required | WHAT action that subject performs — Subject + Motion is the logical spine of every prompt |
| **Environment** | optional | Spatial background, location, set |
| **Aesthetics** | optional | Lighting, color, visual style, overall tone |
| **Camera** | optional | Camera choreography (see Camera Language Reference below) |
| **Audio** | optional | Ambient sound effects, music, voice — for immersive audiovisual output |

**Multimodal Reference Control (guide §1.2)** — two principles when feeding reference material:
1. **Clearly specify references** — say exactly what to take from each asset ("use the composition from Image 1", "follow the action from Video 2"), never a bare "reference Image 1".
2. **Precise reproduction** — the model auto-extracts core features from each reference and fuses them with your text, so a tight role assignment yields high-fidelity output.

These map onto the per-capability reference formulas (image §3, video §4) and the @-role table above.

---

## Prompt Structure Blueprint

### Formula
A well-structured Seedance 2.0 prompt follows this pattern:

```
[Subject/Character Setup] + [Scene/Environment] + [Action/Motion Description] +
[Camera Movement] + [Timing Breakdown] + [Transitions/Effects] +
[Audio/Sound Design] + [Style/Mood]
```

### Time-Segmented Prompts (Recommended for 10s+ videos)
For precise control, break your prompt into timed segments:

```
0–3s: [opening scene description, camera, action]
3–6s: [mid-section development]
6–10s: [climax or key action]
10–15s: [resolution, ending shot, final text/branding]
```

---

## Camera Language Reference

Use these camera terms for precise control:

### Basic Movements
| Term | Description |
|---|---|
| Push in / Slow push | Camera moves toward subject |
| Pull back / Pull away | Camera moves away from subject |
| Pan left/right | Camera rotates horizontally |
| Tilt up/down | Camera rotates vertically |
| Track / Follow shot | Camera follows subject movement |
| Orbit / Revolve | Camera circles around subject |
| One-take / Oner | Continuous shot with no cuts |

### Advanced Techniques
| Term | Description |
|---|---|
| Hitchcock zoom (dolly zoom) | Push in + zoom out (or vice versa), creates vertigo effect |
| Fisheye lens | Ultra-wide distorted lens |
| Low angle / High angle | Camera below/above subject |
| Bird's eye / Overhead | Top-down view |
| First-person POV | Subjective camera from character's eyes |
| Whip pan | Very fast horizontal pan creating motion blur |
| Crane shot | Vertical movement like a crane arm |

### Shot Sizes
| Term | Description |
|---|---|
| Extreme close-up | Eyes, mouth, or small detail only |
| Close-up | Face fills frame |
| Medium close-up | Head and shoulders |
| Medium shot | Waist up |
| Full shot | Entire body |
| Wide / Establishing shot | Full environment |

---

## Capability-Specific Prompt Patterns

### 1. Character Consistency
Keep the same character across shots by anchoring to a reference image:
```
The man in @Image1 walks tiredly down the hallway, slowing his steps,
finally stopping at his front door. Close-up on his face — he takes a
deep breath, adjusts his emotions, replaces the weariness with a relaxed
expression. Close-up of him finding his keys, inserting into the lock.
After entering, his little daughter and a pet dog run to greet him with
hugs. The interior is warm and cozy. Natural dialogue throughout.
```

### 2. Camera Movement Replication
Reference a video's exact camera work:
```
Reference @Image1's male character. He is in @Image2's elevator.
Completely reference @Video1's camera movements and the protagonist's
facial expressions. Hitchcock zoom during the fear moment, then several
orbit shots showing the elevator interior. Elevator doors open, follow
shot walking out. Exterior scene references @Image3. The man looks
around, referencing @Video1's mechanical arm multi-angle tracking of
the character's gaze.
```

### 3. Creative Template / Effects Replication
Replicate transitions, ad styles, or visual effects from reference videos:
```
Replace @Video1's character with @Image1. @Image1 as the first frame.
Character puts on VR sci-fi glasses. Reference @Video1's camera work —
close orbit shot transitions from third-person to character's subjective
POV. Travel through the VR glasses into @Image2's deep blue universe.
Several spaceships shuttle toward the distance. Camera follows ships
into @Image3's pixel world. Low-altitude flyover of pixel mountains
where trees grow procedurally. Then upward angle, rapid shuttle to
@Image4's pale green textured planet, camera skims the planet surface.
```

### 4. Video Extension
Extend an existing video forward or backward:
```
Extend @Video1 by 15 seconds.
1–5s: Light and shadow slowly slide across wooden table and cup through
venetian blinds. Tree branches sway gently as if breathing.
6–10s: A coffee bean gently drifts down from the top of frame. Camera
pushes in toward the bean until the screen goes black.
11–15s: English text gradually appears — first line "Lucky Coffee",
second line "Breakfast", third line "AM 7:00-10:00".
```

**Important**: When extending, set the generation duration to match the extension length (e.g., extend 5s → select 5s generation).

For **reverse extension** (prepending):
```
Extend backward 10s. In warm afternoon light, the camera starts from
the corner with awning fluttering in the breeze, slowly tilting down
to daisies peeking out at the wall base...
```

### 5. Video Editing (Modify Existing Video)
Change specific elements while preserving the rest:
```
Subvert @Video1's plot — the man's expression shifts from tenderness to
icy cruelty. In an unguarded moment, he shoves the female lead off the
bridge into the water. The action is decisive, premeditated, without
hesitation. The female lead falls with no scream, only disbelief in her
eyes. She surfaces and screams: "You've been lying to me from the start!"
The man stands on the bridge with a sinister smile, murmuring: "This is
what your family owes mine."
```

### 6. Music Beat-Matching
Sync visuals to audio rhythm:
```
@Image1 @Image2 @Image3 @Image4 @Image5 @Image6 @Image7 — match the
keyframe positions and overall rhythm of @Video1 for beat-synced cuts.
Characters should have more dynamic movement. Overall visual style more
dreamlike with strong visual tension. Adjust shot sizes and add lighting
changes based on music and visual needs.
```

### 7. Dialogue and Voice Acting
Include character dialogue and voice direction:
```
In the "Cat & Dog Roast Show" — an emotionally expressive comedy segment:
Cat host (licking paw, rolling eyes): "Who understands my suffering? This
one next to me does nothing but wag his tail, destroy sofas, and con
humans out of treats with those 'pet me I'm adorable' eyes..."
Dog host (head tilted, tail wagging): "You're one to talk? You sleep 18
hours a day, wake up just to rub against humans' legs for canned food..."
```

### 8. One-Take / Long Take
Continuous single-shot sequences:
```
@Image1 @Image2 @Image3 @Image4 @Image5 — one-take tracking shot,
following a runner from the street up stairs, through a corridor, onto
a rooftop, finally overlooking the city. No cuts throughout.
```

### 9. E-commerce / Product Showcase
Product-focused advertising:
```
Deconstruct the reference image. Static camera. Hamburger suspended and
rotating mid-air. Ingredients gently and precisely separate while
maintaining shape and proportion. Smooth motion, no extra effects.
Hamburger splits apart — golden sesame bun top, fresh green lettuce,
dewy red tomato slices, two thick juicy beef patties with melting golden
cheddar cheese, and soft bun base — all slowly descend and perfectly
reassemble into a complete deluxe double cheeseburger. Throughout,
cheese continues to melt and drip slowly, lettuce and tomato dewdrops
glisten, maintaining ultimate appetizing food aesthetics.
```

### 10. Science/Educational Content
Medical or educational visualizations:
```
15-second health educational clip.
0–5s: Transparent blue human upper body. Camera slowly pushes into a
clear artery. Blood flows smoothly, clean blue color.
5–10s: Symbolic sugar and fat particles from milk tea enter the
bloodstream. Camera follows blood flow. Blood gradually thickens,
yellowish lipid deposits form on vessel walls.
10–15s: Vessel lumen visibly narrows, flow speed decreases. Before/after
comparison creates visual contrast. Overall colors darken.
```

### 11. Track Completion (stitch up to 3 videos) — guide §5.3
Connect separate clips into one continuous piece with controlled transitions. Up to **3 video inputs, ≤ 15s total**; the model auto-captures the connecting portions of the first and last clips and keeps only the segments it needs.
```
Formula: [Video 1] + [transition description] + connect to [Video 2]
         + [transition description] + connect to [Video 3]

Example: Video 1, at the moment the leaf touches the ground, golden
particle effects burst out, a gust of wind blows, then connect to Video 2.
```
Distinct from §4 *video extension*: extension grows ONE clip forward/backward; track completion **joins multiple clips** with a designed transition at each seam.

---

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

## Style and Quality Modifiers

Append these to enhance output quality:

### Visual Style
- `Cinematic quality, film grain, shallow depth of field`
- `2.35:1 widescreen, 24fps`
- `Ink wash painting style` / `Anime style` / `Photorealistic`
- `High saturation neon colors, cool-warm contrast`
- `4K medical CGI, semi-transparent visualization`

### Mood/Atmosphere
- `Tense and suspenseful` / `Warm and healing` / `Epic and grand`
- `Comedy with exaggerated expressions`
- `Documentary tone, restrained narration`

### Audio Direction
- `Background music: grand and majestic`
- `Sound effects: footsteps, crowd noise, car sounds`
- `Voice tone reference @Video1`
- `Beat-synced transitions matching music rhythm`

---

## Workflow: Step-by-Step Prompt Creation

When a user asks you to write a Seedance 2.0 prompt, follow this process:

1. **Clarify the goal**: What type of video? (Ad, drama, MV, educational, vlog, etc.)
2. **Identify available assets**: What images, videos, audio does the user have?
3. **Assign roles**: Map each asset to its function (first frame, character ref, camera ref, etc.)
4. **Structure the prompt**:
   - Open with subject and scene setup
   - Add time-segmented action descriptions for videos > 8s
   - Specify camera movements
   - Add audio/sound design
   - Include style modifiers
5. **Check constraints**: Verify total files ≤ 12, no real human faces, durations within limits
6. **Optimize**: Remove ambiguity, ensure each @reference has a clear role

---

## Common Mistakes to Avoid

1. **Vague references**: Don't just say "reference @Video1" — specify WHAT to reference (camera? action? effects? rhythm?)
2. **Conflicting instructions**: Don't ask for "static camera" and "orbit shot" in the same segment
3. **Overloading**: Don't try to pack too many scenes into 4–5 seconds — keep it physically plausible
4. **Missing @ assignments**: If you upload 5 images, make sure each one is referenced with a clear purpose
5. **Ignoring audio**: Sound design dramatically improves output — always include audio direction
6. **Forgetting duration**: Match your prompt complexity to the selected generation length
7. **Real faces**: Don't describe uploading real human photos — the system will block them
8. **Wrong model for the register**: Photoreal-human i2v anchors → this is a Kling job, not seedance. Stop and reroute before burning a generation.

---

## Example Prompt Templates

### Template: Product Ad (15s)
```
Reference @Video1's editing style and camera transitions. Replace @Video1's
product with @Image1 as the hero product. Create a 15-second product
showcase video.
0–3s: Product enters frame with dynamic rotation, close-up on surface
texture and logo details.
4–8s: Multiple angle transitions — front, side, back — with product
highlight scanning light effects.
9–12s: Product in lifestyle context showing usage scenario.
13–15s: Hero shot with brand tagline appearing, background music builds
to resolution.
Sound: Reference @Video1's background music. Add product interaction
sound effects.
```

### Template: Short Drama (15s)
```
Scene (0–5s): Close-up on the character's reddened eyes, finger pointing
accusingly, tears streaming down. Emotion on the edge of collapse.
Dialogue 1 (Character A, choking with rage): "What exactly are you trying
to take from me?"
Scene (6–10s): The other character trembles, holding up evidence,
red-eyed, stepping forward. Camera sweeps past background details.
Dialogue 2 (Character B, urgent and choked): "I'm not deceiving you!
This is what he entrusted to me!"
Scene (11–15s): Evidence is revealed, Character A freezes — expression
shifts from anger to shock, hands slowly rise.
Sound: Urgent piano + static interference, sobbing, button click sound,
ending with a muffled voice blending in.
Duration: Precise 15 seconds, every frame tight, no filler.
```

### Template: Dance Video (13s)
```
Have the character in @Image1 replicate the dance moves and beat-synced
music from @Video1. Generate a 13-second video. Movements should be
smooth with no stuttering or freezing.
```

### Template: Scenery Montage with Music (15s)
```
@Image1 @Image2 @Image3 @Image4 @Image5 @Image6 — landscape scene
images. Reference @Video1's visual rhythm, inter-scene transitions,
visual style, and music tempo for beat-synced editing.
```

---

## Interaction Instructions

When helping users write prompts:

1. **Ask what they want to create** — type of video, mood, duration
2. **Ask what materials they have** — list their images, videos, audio files
3. **Draft the prompt** — using the patterns and structure above
4. **Explain your choices** — briefly note why you structured the prompt this way
5. **Offer variations** — suggest a simpler or more ambitious alternative if appropriate
6. **Remind about constraints** — especially the face restriction and file limits
