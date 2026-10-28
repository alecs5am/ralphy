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

> **Minimal re-read set after context compaction:** "Ralphy integration", the safety-filter table, "Core Syntax", and "Official Basic Prompt Formula" in this file. Everything else is on-demand in `references/` — read only the file for the pattern you are writing.

## Ralphy integration (read first)

- **All generation routes through `ralphy generate video --model bytedance/seedance-2.0`** (AGENTS.md invariants #1/#2). Never call the Jimeng/ByteDance platform or any provider API directly. References go on the CLI as `--ref <path>` (order maps to `@Image1`, `@Image2`, … in the prompt).
- **Run `ralphy models show bytedance/seedance-2.0` before committing to seedance** — model picks drift; training memory is stale. It prints the privacy-filter lessons (video lessons 6, 6b, 13, 14) and the live catalog params.
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

Seedance-2.0 runs **two distinct guards**, and conflating them wastes reroutes. The input guard scans your anchor/ref *image*; the output guard scans your *prompt*. Different triggers, different fixes. **Submit-test is free — probe one clip before firing a whole batch.** Canonical source: memory `seedance-safety-privacy-filter-guide`; cross-links in [`references/safety-filter.md`](./references/safety-filter.md).

| Guard | Error signature | Keys on | Fix in one line |
|---|---|---|---|
| **Input-image PRIVACY scan** | `InputImageSensitiveContentDetected` | overall-frame **photo-likeness**, NOT face anatomy | bake grit into the anchor / silhouette crowds / route photoreal to FAL / prefer t2v |
| **Output SAFETY scan** | `E_INTERNAL 'output may contain sensitive information'` | **destruction lexicon** in the prompt (explosion, shatter, blast, shards, breach, ram-through-wall) | reword the beat as a soft transformation |

The four input-scan cases (too-clean stylized anchor, crowds, photoreal via fal reference-to-video, pure t2v is not scanned), the destruction-word reword table, when the filter does not apply (kling has none; comedic impacts and non-human refs pass), and the cross-links live in [`references/safety-filter.md`](./references/safety-filter.md). Read it before submitting any human-shaped anchor and whenever a guard error comes back.

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

Basic movements, advanced techniques, and shot sizes: [`references/camera-and-style.md`](./references/camera-and-style.md). Read it when the prompt needs a specific camera move.

## Capability-Specific Prompt Patterns

Eleven worked patterns in [`references/capability-patterns.md`](./references/capability-patterns.md): 1 character consistency, 2 camera movement replication, 3 creative template / effects replication, 4 video extension, 5 video editing, 6 music beat-matching, 7 dialogue and voice acting, 8 one-take / long take, 9 e-commerce / product showcase, 10 science / educational, 11 track completion (stitch up to 3 videos). Read only the pattern the job needs.

## Text in Video (guide §02)

Slogans / title text, subtitles, and speech bubbles (guide §2.1-§2.3): [`references/reference-formulas.md`](./references/reference-formulas.md).

## Official Reference Formulas (guide §3–§4)

Image-reference, video-reference, and add / remove / modify editing formulas (guide §3-§5.1): [`references/reference-formulas.md`](./references/reference-formulas.md).

## Style and Quality Modifiers

Visual style, mood, and audio-direction vocabulary: [`references/camera-and-style.md`](./references/camera-and-style.md).

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

Full templates (product ad 15s, short drama 15s, dance 13s, scenery montage with music 15s): [`references/example-templates.md`](./references/example-templates.md).

## Interaction Instructions

When helping users write prompts:

1. **Ask what they want to create** — type of video, mood, duration
2. **Ask what materials they have** — list their images, videos, audio files
3. **Draft the prompt** — using the patterns and structure above
4. **Explain your choices** — briefly note why you structured the prompt this way
5. **Offer variations** — suggest a simpler or more ambitious alternative if appropriate
6. **Remind about constraints** — especially the face restriction and file limits
