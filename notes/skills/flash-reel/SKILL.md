---
name: flash-reel
description: |
  Generates a 30-second 9 16 cinematic reel from a user prompt (setting + vibe + rough storyline). Flash Reel — 30s Cinematic Reel Skill When to use User provides: a setting, a vibe/mood, and optionally a rough storyline. They want a ~30 second 9:16 reel with hard cuts every 3-4 seconds, anchored by one or more characters with reference photos, in a 35mm flash-photography aesthetic.
license: MIT
---

# Flash Reel

GOLDEN RULE — References over text
Never describe a character's physical appearance in the prompt text. All identity comes EXCLUSIVELY from reference images. In prompts, refer to characters only as "the man from reference images" or "the woman from the girl reference image". For outfits: normally, just say "wearing the outfit from the outfit reference image." HOWEVER, if the user's setting requires a genre shift (e.g., adapting a modern shirt into a torn ancient Greek chiton or cyberpunk armor), you MUST describe the structural stylization in the text prompt while still passing the outfit reference. The text prompt handles: scene/environment, mood/vibe, camera/film aesthetic, and genre-adapted clothing changes. If you catch yourself writing hair color, facial features, or body type in a prompt — delete it and let the images do the work.

## Outfit references

The main character's outfit is NOT hardcoded — it is collected from the user in STEP 1 (clothing description + outfit reference photo). Upload the user's outfit photo via higgsfield_upload to get a media_input id, then include it in images[] alongside all identity references for every scene that character appears in. The outfit ref must be the LAST image in the array (after all identity refs). Use the user's clothing description in prompts to reinforce the look. If the user says the previous outfit "looks terrible" or similar — ask for a new outfit photo and regenerate all affected scenes with the new outfit ref immediately, no questions asked.

## Virality engineering for Scene 1

Scene 1 must be genuinely disorienting and scroll-stopping — NOT just a clean portrait with flash. Strong virality signals:

- Face half-swallowed by shadow, only one eye/cheekbone caught by flash
- Demonic hand/fingers reaching from void behind or around subject
- Extremely low angle looking up with cruel half-smile

Half-face lit, other half dissolved to absolute black with single supernatural element (glowing eye, etc.)
Imminent fatal danger: a weapon mid-swing inches from the subject's neck while they remain oblivious and calm. Tension of "something terrible is about to happen." Avoid: clean symmetrical portraits, fully lit faces, standard headshots — these read as generic even with good aesthetics.

## Reference Photos

These 5 media IDs are the reference photos of the man. They are always available:

MAN OUTFIT (always use in all man-present scenes):

- Dark ruffled jacket mostly closed over a dark shirt, collar only slightly open at top — not
- revealing. A wide thick black leather belt with a large prominent metal buckle cinching the
- waist, worn over wide-leg distressed dark jeans and leather boots. Never bare chest, never
- fully open jacket.

## REF_1: 7461f3be-64d7-487c-81cb-43cecf87fa23

  url: https://d8j0ntlcm91z4.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/hf_20260424_095838_ba492fc4-8f40-462d-86c0-784d23cc076f.png
  description: Extreme close-up portrait, cobwebs on face, dark open shirt, dark background

## REF_2: 7ed8db2e-5b01-4721-a3c8-2e5b0c170abd

  url: https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/7ed8db2e-5b01-4721-a3c8-2e5b0c170abd.png
  description: Full body, leather jacket, standing by a dead tree near dark lake, stormy sky

## REF_3: 0b9bddff-87b8-400d-a93c-0f3c44d525ff

  url: https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/0b9bddff-87b8-400d-a93c-0f3c44d525ff.png
  description: Full body leaning on tree, open black shirt, dark lake background, holding lighter

## REF_4: 9d0651a1-31cd-4e40-bc5a-0213ae21509c

  url: https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/9d0651a1-31cd-4e40-bc5a-0213ae21509c.png
  description: Walking in dark lake water, black satin shirt, flared dark jeans, forest behind

## REF_5: 57ccde2b-68a2-43a1-b534-9adc38c4b214

  url: https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/57ccde2b-68a2-43a1-b534-9adc38c4b214.png
  description: Smoking by abandoned railway, leather jacket, teal-lit night, train headlights behind
ask_user_question rules
DO ask
Setting (where do the scenes take place — e.g. "abandoned warehouse", "rainy city street at night", "pine forest in fog")
Vibe / mood (e.g. "dark romantic", "gothic thriller", "melancholic indie", "raw street energy")
Storyline hint (optional — e.g. "guy leaving something behind", "wandering through darkness", "just vibes, no story")
Clothing / look for the main character (what outfit or style should he be in — e.g. "all black suit", "shirtless with chains", "white linen shirt rolled sleeves")
Outfit reference photo (file upload — a photo showing the outfit/look to match)
NEVER ask
Aspect ratio (always 9:16)
Model (always imagegen_2_0 for images, kling3_0 for video)
Resolution (always 1080p output)
Number of clips (always 8 clips → ~30s at 3-4s each)
Whether to include the man (always yes — at least 5 of 8 scenes)
Style string (always the 35mm flash aesthetic for character scenes)
Pipeline
STEP 1 — Collect user inputs (if not already provided)
Ask in a single ask_user_question call with 5 questions:

- Setting (freeform text)
- Vibe/mood (freeform text)

Storyline hint (freeform text, optional — user can write "no story, just vibes")
Clothing / look for the main character (freeform text — describe the outfit or style, e.g. "all black suit", "shirtless with chains", "white linen shirt rolled sleeves")
Outfit reference photo (kind=files, accept image/*, min=1, max=1 — a photo showing the outfit/look to match)
STEP 2 — Write the scene breakdown
Generate exactly 8 scene descriptions. Rules:

Scene 1 MUST be virality-engineered: extreme close-up of the man, direct camera gaze or shocking detail, harsh flash, maximum visual contrast. Think: something that stops the scroll instantly. Use REF_1 (cobweb close-up) as the reference image for this scene.
Scenes 2-8: all must contain at least one character (man, girl, or both). Environment-only scenes are forbidden.
All 8 scenes must share the same vibe/aesthetic — NOT a linear story, just thematically consistent.
Each scene description should be ~2 sentences: what's in the frame + the mood/detail.
Assign each scene: character_present (true/false) and which REF image to use (for character scenes).
Scene distribution rules:

ALL 8 scenes must contain at least one MAIN subject — man, girl, or both. NO environment-only scenes. NO scenes with only background characters, soldiers, or non-main-character figures. Every single frame must feature the man, the girl, or both.
Scene 1: man only, REF_1 (virality hook — extreme close-up, direct stare)
Scene 2: man only, REF_2 or REF_3 — half-human demon figures visible but blurred in background
Scene 3: girl only — introduced alone, flash-isolated, demonic creatures barely visible at her feet
Scene 4: attractive half-human demons only — beautiful but wrong, no main characters
Scene 5: girl only — walking through corridor flanked by purely grotesque demonic creatures
Scene 6: purely demonic grotesque creatures only — fused bodies, rotting formalwear, wrong faces
Scene 7: both characters together — surrounded by attractive demons orbiting them in shadow
Scene 8: man only, REF_5 or REF_1 — strong closing image, back to camera or held stare
Creature design guidelines: ATTRACTIVE HALF-HUMAN DEMONS: beautiful humanoid faces, split or solid-black pupils, iridescent or pale skin with subtle scales or veining, elegant horns curving from temples, fingers elongated by one joint too many, dressed in decayed formal wear, smiling with too much warmth. Unsettling only on second look.

PURELY GROTESQUE DEMONIC CREATURES: bodies that shouldn't be upright, fused or melting flesh, slack jaws with too many teeth or no jaw at all, wet glistening skin, eyes in wrong places, wearing tattered ballroom attire as if they once attended something grand. Viscerally repulsive but still present at the Ball as guests.

If there is no girl reference provided by the user, replace girl-only scenes with additional man scenes using unused REF images, or creature-only scenes.

Distribute REF images across character scenes without repeating the same one consecutively.

STEP 2.5 — Story verification gate (MANDATORY — do not skip)
Before generating any images, present the full scene breakdown to the user in a readable format. Show each scene numbered 1-8 with:

- Scene number and whether the man appears
- Which reference photo will be used (for character scenes)
- The scene description (2 sentences)
- The planned camera motion for the video

Then ask via ask_user_question:

"Here's the full scene breakdown for your reel. Does this look right, or do you want to change any scenes before I start generating?"

Options:

- Looks good — run the full pipeline
- Change specific scenes (user describes which ones and what to change)
- Rewrite the whole breakdown
- If the user picks option 2: apply their changes to the affected scenes only, then re-present the full updated breakdown and ask again. Repeat until they confirm option 1.

If the user picks option 3: go back to STEP 2 with updated inputs and rewrite all 8 scenes.

Only proceed to STEP 3 after explicit user confirmation (option 1 or equivalent "yes, go ahead").

STEP 3 — Generate the 8 starting frames
Model: imagegen_2_0 (GPT Image 2) Aspect ratio: 9:16 Batch: Submit all 8 in a single higgsfield_generate call (up to the plan cap of 8 concurrent).

Prompt construction per scene:

For CHARACTER scenes (scenes where character_present = true):

CRITICAL: Do NOT describe the man's physical features or clothing in text. The model must derive ALL appearance and outfit information from the reference images alone. Never write things like "curly dark hair, sharp features, lean build" or "dark ruffled jacket, leather belt" in the prompt. Instead, refer to references generically:

[scene-specific description adapted to the user's setting and vibe].
The man from reference images 1-5, wearing the outfit from the outfit reference image.
Shot on 35mm film camera Kodak Portra 400 pushed to 800, ISO 800, f/5.6, 1/60s shutter speed.
Harsh on-camera flash, creating flat frontal illumination with a sharp shadow behind and specular
highlights on skin and fabric. Teal-cyan shadows, slightly warm midtones, desaturated green-blue
color grade, visible film grain, mild halation around bright points. Amateur flash photography
aesthetic, 2000s snapshot style, raw unretouched look. Not digital, not illustration, not CGI.
9:16 vertical frame.
The prompt describes ONLY: the scene/environment, the mood, and the camera/film aesthetic. Character identity = reference images 1-5. Outfit = outfit reference image (last in array). The text prompt must NEVER duplicate what the images already show.

Pass ALL FIVE man reference images together in images for every character scene that includes the man, plus the outfit reference as the LAST image. This gives the model maximum identity signal and produces the most accurate likeness. Always include all 5 + outfit ref, regardless of which scene it is:

json

images: [
  {"id": "7461f3be-64d7-487c-81cb-43cecf87fa23", "type": "media_input", "url": "https://d8j0ntlcm91z4.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/hf_20260424_095838_ba492fc4-8f40-462d-86c0-784d23cc076f.png"},
  {"id": "7ed8db2e-5b01-4721-a3c8-2e5b0c170abd", "type": "media_input", "url": "https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/7ed8db2e-5b01-4721-a3c8-2e5b0c170abd.png"},
  {"id": "0b9bddff-87b8-400d-a93c-0f3c44d525ff", "type": "media_input", "url": "https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/0b9bddff-87b8-400d-a93c-0f3c44d525ff.png"},
  {"id": "9d0651a1-31cd-4e40-bc5a-0213ae21509c", "type": "media_input", "url": "https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/9d0651a1-31cd-4e40-bc5a-0213ae21509c.png"},
  {"id": "57ccde2b-68a2-43a1-b534-9adc38c4b214", "type": "media_input", "url": "https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/57ccde2b-68a2-43a1-b534-9adc38c4b214.png"}
]
GIRL REFERENCE (always use this single ref for all girl-present scenes): {"id": "5ad69522-365b-4744-be45-23595f90e28c", "type": "media_input", "url": "https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/5ad69522-365b-4744-be45-23595f90e28c.jpg"}

Girl description: blonde hair, lean athletic build, black dress, black heels. Feral, dangerous grace. Pass this ref in images[] for every scene containing the girl.

NSFW WARNING: The girl ref image triggers imagegen_2_0 NSFW filter ~75% of the time. Workaround: describe her in a black dress (not bodysuit/stockings). Run 4 variants — typically 1-2 will pass. If all fail, run again. Do not change the ref image.

For outfit reference scenes (man dressed in a specific style), also append the outfit ref:

json

  {"id": "465771b5-f4d8-4086-bc24-b81e5627b53c", "type": "media_input", "url": "https://d2ol7oe51mr4n9.cloudfront.net/user_2xgYjXDcQcR398ugDnXe1Lh4Zg5/465771b5-f4d8-4086-bc24-b81e5627b53c.jpg"}
For GIRL-ONLY scenes (when a girl reference is provided by the user):

[scene-specific description adapted to the user's setting and vibe].
The woman from the girl reference image.
Shot on 35mm film camera Kodak Portra 400 pushed to 800, ISO 800, f/5.6, 1/60s shutter speed.
Harsh on-camera flash, creating flat frontal illumination with a sharp shadow behind and specular
highlights on skin and fabric. Teal-cyan shadows, slightly warm midtones, desaturated green-blue
color grade, visible film grain, mild halation around bright points. Amateur flash photography
aesthetic, 2000s snapshot style, raw unretouched look. Not digital, not illustration, not CGI.
9:16 vertical frame.
Do NOT describe the girl's physical features or clothing in the prompt — the reference image carries all appearance information. The text prompt describes ONLY the scene and mood.

Pass the girl reference image in images: [{id: "<GIRL_REF_ID>", type: "media_input", url: "<GIRL_REF_URL>"}]

For BOTH-CHARACTERS scenes:

[scene-specific description with both subjects].
The man from reference images 1-5 wearing the outfit from the outfit reference, and the woman
from the girl reference image.
Shot on 35mm film camera Kodak Portra 400 pushed to 800, ISO 800, f/5.6, 1/60s shutter speed.
Harsh on-camera flash, creating flat frontal illumination with a sharp shadow behind and specular
highlights on skin and fabric. Teal-cyan shadows, slightly warm midtones, desaturated green-blue
color grade, visible film grain, mild halation around bright points. Amateur flash photography
aesthetic, 2000s snapshot style, raw unretouched look. Not digital, not illustration, not CGI.
9:16 vertical frame.
Do NOT describe either character's appearance in text. Both are defined entirely by their reference images. The prompt describes ONLY the scene, mood, and interaction.

Pass both references in images: man's 5 REFs first, outfit ref next, girl's REF last.

For CREATURE-ONLY scenes (attractive half-human demons or purely grotesque demons, no main characters):

[scene-specific description of the creatures adapted to the setting and vibe].
[Creature design: either (a) beautiful humanoid faces with split pupils, elegant horns, fingers
one joint too long, iridescent skin, decayed formal wear — attractive yet deeply wrong; or
(b) fused melting flesh, slack jaws with too many teeth, wet glistening skin, eyes in wrong
positions, tattered ballroom attire — viscerally grotesque yet still attending the Ball as guests.]
Shot on 35mm film camera Kodak Portra 400 pushed to 800, ISO 800, f/5.6, 1/60s shutter speed.
Harsh on-camera flash, creating flat frontal illumination with a sharp shadow behind and specular
highlights on skin and flesh. Teal-cyan shadows, slightly warm midtones, desaturated green-blue
color grade, visible film grain, mild halation around bright points. Amateur flash photography
aesthetic, 2000s snapshot style, raw unretouched look. Not digital, not illustration, not CGI.
9:16 vertical frame.
No reference image for creature-only scenes (no main character REF passed).

Generation order: ALL FRAMES FIRST, then user selects from chronological batches.

Generate all 32 images (4 variants x 8 scenes) before asking the user to choose anything. Process in waves of 4 jobs (user preference — not 8, even if the plan cap allows it). Within each wave, all 4 jobs belong to the SAME scene. Scenes are generated in chronological order: Scene 1 wave, then Scene 2 wave, etc.

all_results = {}
for scene_number in 1..8:
  1. Generate 4 variants for scene_number (single wave of 4 jobs, same prompt, same refs)
  2. Poll until all 4 complete
  3. Upload all 4 completed images via higgsfield_upload (so they render inline in chat)
  4. Store results: all_results[scene_number] = [uploaded URLs + job IDs]
  5. Move to scene_number + 1 (do NOT ask user yet)
After ALL 8 scenes are generated (32 images total), present them to the user in a single message organized as chronological batches:

## Scene 1 — [short description]
1A: [link]  1B: [link]  1C: [link]  1D: [link]

## Scene 2 — [short description]
2A: [link]  2B: [link]  2C: [link]  2D: [link]

... (through Scene 8)
Label variants A/B/C/D within each scene so the user can reference them easily (e.g. "1B, 2A, 3D, 4C, 5A, 6B, 7C, 8A").

Ask the user to pick one variant per scene in a single response. Example prompt:

"All 32 frames are ready. Pick one per scene (e.g. 1B, 2A, 3D...) and I'll animate them."

Why this order matters: the user sees all options at once, organized chronologically by scene. Batches of 4 per scene make comparison easy. One selection pass covers all 8 scenes instead of 8 separate interruptions.

Batch size: always 4 jobs per wave (user preference — not 8, even if the plan cap allows it).

Showing images to the user: local MEDIA: paths do NOT render in the web client. You MUST upload each variant via higgsfield_upload first, then present the returned CDN URLs as clickable markdown links: [View full size](https://cdn-url...). Include a one-line description per variant so the user can differentiate without opening all 4.

Never ask the user to choose from text descriptions alone. Always provide viewable images. Do NOT overcomplicate the presentation by writing Python/Pillow code to build image grids. Simply upload the individual files and present them in a vertical list within each scene's batch.

Only proceed to STEP 4 after the user has selected one image per scene (8 selections total). Use the selected image's job ID as the input to the corresponding Kling 3.0 animation job.

STEP 4 — Animate each frame via Kling 3.0
Model: kling3_0 Duration: 5 seconds each Aspect ratio: 9:16 Resolution: ALWAYS mode: "pro" (1080p). Never omit this — default is 720p which is unacceptable.

## Video animation model: Kling 3.0 (most photorealistic)

Lessons learned the hard way:

- Kling 3.0 with medias role: "image" IGNORES the input and generates random people. Do NOT use role "image".
- Kling 3.0 with kling_element_ids also ignores the element. Do NOT use.
- Kling 2.6 with role: "start_image" also ignores the input. Do NOT use Kling 2.6.
- Kling 3.0 with role: "start_image" WORKS PERFECTLY. The image is used as the actual starting frame.
- Seedance 2.0 with role: "image" also works but is less photorealistic than Kling 3.0.

Correct Kling 3.0 format:

json

{
  "model": "kling3_0",
  "params": {
    "aspect_ratio": "9:16",
    "duration": 5,
    "mode": "pro",
    "generate_audio": false,
    "medias": [{"role": "start_image", "data": {"id": "<image_job_id>", "type": "image_job"}}],
    "prompt": "..."
  }
}
Image prep: Pass the selected image job ID directly with type: "image_job". No need to download and re-upload.

Motion prompt rules:

- Keep prompts SHORT — 1 sentence describing only the camera move and subject action.
- Choose one motion per clip: slow zoom in, slow zoom out, very slow pan, or slow dolly.
- Avoid overly complex multi-action prompts — one motion, one direction.

NEVER use "frozen moment" or "static shot" or "no movement" prompts. Kling 3.0 produces worse artifacts with completely still bodies — subtle movement (breathing, walking slowly, hair blowing) looks far more natural than forced stillness. Always give the subject something small to do.
For scenes where you want minimal motion, use: "Subject stands still, barely breathing. Very slow subtle zoom in. Wind in hair." — NOT "no movement, frozen, static."
Animation quality rules (MANDATORY — never skip):

- ALL motion must be extremely slow, smooth, and cinematic. Think slow-motion documentary, not music video.
- Always prefix motion prompts with "Extremely slow and smooth" — never just "slow".
- Keep subject movement minimal: breathing, subtle wind in hair/fabric, gentle waves. No fast actions.
- Generate 2 video variants per scene (not 1). The user picks the better one. This doubles the chance of getting a usable clip and avoids single-shot failures blocking the pipeline.

Per-scene motion prompts (use exactly as written — do not expand):

- Scene 1: Extremely slow and smooth zoom in toward the subject's face.
- Scene 2: Extremely slow and smooth zoom in toward the subject.
- Scene 3: Extremely slow and smooth zoom out revealing the surroundings.
- Scene 4: Extremely slow and smooth pan left across the scene.
- Scene 5: Extremely slow and smooth tilt upward from low to high.
- Scene 6: Extremely slow and smooth zoom out.
- Scene 7: Extremely slow and smooth zoom in toward the subjects.
- Scene 8: Extremely slow and smooth pan right across the scene.

Pass the completed image job result into each video generation via:

json

medias: [{"role": "start_image", "data": {"id": "<image_job_id>", "type": "image_job"}}]
No audio: ALWAYS pass generate_audio: false for every Kling 3.0 job. Never generate sound. This is a hard rule — the user adds their own music in post. No exceptions, no asking.

Submit all 8 video jobs in a single higgsfield_generate call. Poll higgsfield_job_status(job_ids=[...], poll=true) until all 8 complete.

Save all 8 video result URLs.

STEP 5 — Deliver individual clips
Do NOT stitch clips together. The user handles final assembly themselves.

Present all completed video clips to the user as individual CDN links (one per scene). Format:

- Scene 1 (Hook): [link]
- Scene 2 (Man street): [link]

...
Ask: "Here are all the clips. Flag any you want redone and I'll regenerate them."

## Credit optimization notes

imagegen_2_0 (GPT Image 2) is used for images — strong reference adherence, good quality at default settings
kling3_0 is used for video — most photorealistic image-to-video model, uses role: "start_image"
No audio generation — generate_audio: false on all clips (user adds their own music)
kling3_0 duration: 5s per clip (minimum viable for 3.75s trim with headroom)
8 clips total — matches the 8 concurrent job cap, so everything runs in one batch wave
STEP 4.5 — Quick QC pass on each animated clip (mandatory)
After all video jobs complete, do a lightweight sanity check. No Gemini, no heavy video analysis.

Duration check: ffprobe each clip to confirm it's ~5s. If significantly shorter, redo.

Frame extraction spot-check: Pull 3 frames (start, middle, end) from each clip:

bash

ffmpeg -i clip.mp4 -vf "select='eq(n\,5)+eq(n\,75)+eq(n\,145)'" -vsync vfn -frames:v 3 frame_%d.png
Eyeball the 3 frames yourself (as the agent). If a face is clearly melted, dissolved, or has wrong geometry compared to the starting image -- flag it for redo.

Auto-redo rule: Redo flagged clips ONCE with a simplified prompt: "Extremely subtle barely perceptible slow zoom. Locked tripod. No camera shake. Photographic stillness." If the redo also looks bad, keep whichever is less bad. One redo max per clip.

User is the final QC gate. Present all clips as CDN links. The user flags anything they want redone -- their eye overrides any automated check.

## Error handling

If a imagegen_2_0 generation fails or produces a glitched result, regenerate that single scene with a slightly adjusted prompt (add "clean, no artifacts" to the prompt suffix)
If a kling3_0 video has visible shake/glitch, regenerate with a simpler motion prompt (e.g. just "Very slow zoom in." with no other detail)
If kling3_0 fails or produces a content moderation error (422), retry once with a simplified prompt. If it fails again, STOP and inform the user — do not fall back to another model.
If ffmpeg concat fails due to codec mismatch, re-encode all clips first: ffmpeg -i clip_<i>.mp4 -c:v libx264 -crf 18 clip_<i>_enc.mp4 then concat
Output spec
Format: MP4, H.264
Resolution: 1080×1920 (9:16)
Duration: ~30 seconds
Frame rate: 30fps
Audio: none (user adds their own music)
Cuts: hard cuts every ~3.75 seconds
