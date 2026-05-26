---
name: storyboard-cheatcode
description: |
  Turn a one-line concept into a multi-panel previs storyboard image, then optionally a cheap-preview video and a hero video render. Uses the Higgsfield MCP server (image and video tools). Asks the user before every render and never assumes budget tolerance. Use when the user asks to build a storyboard, plan AI video shots, generate a previs sheet, or wants an AI video from a concept.
license: MIT
---

# Storyboard Cheatcode

name: storyboard-cheatcode description: Turn a one-line concept into a multi-panel previs storyboard image, then optionally a cheap-preview video and a hero video render. Uses the Higgsfield MCP server (image and video tools). Asks the user before every render and never assumes budget tolerance. Use when the user asks to build a storyboard, plan AI video shots, generate a previs sheet, or wants an AI video from a concept.
storyboard-cheatcode
A previs-first AI-video pipeline. You generate a multi-panel storyboard image, then offer escalating render tiers — cheap preview first, hero render only on confirmation. All generation runs through the Higgsfield MCP server.

Operating principle — always ask, never guess
Every step begins by asking the user. Do not pre-fill creative choices, do not infer budget tolerance, do not chain steps without explicit confirmation.

Renders cost real credits (~7 per storyboard image, ~50–70 per 12s 720p Seedance clip).
The user is the creative director; you are the operator.
Iterating cheaply on the storyboard image before any video render is the single biggest cost saver.
Prerequisite
The user must have the Higgsfield MCP connector added to Claude. If the Higgsfield tools (e.g. higgsfield_generate_image, higgsfield_generate_video) are not available in this session, stop and tell the user:

Add the Higgsfield connector first: Settings → Connectors → Add custom MCP → URL: https://mcp.higgsfield.ai/mcp. Sign in with your Higgsfield account when prompted.

Then re-run the skill.

Step 1 — Collect inputs (one batched ask)
Ask the user for all of these in a single message. Do not ask one at a time. Mark each clearly:

1. CONCEPT — one sentence describing the scene or sequence
2. ASPECT RATIO — 16:9 (default), 9:16, or 1:1
3. NUMBER OF PANELS — 4, 6 (default), or 9
4. PANEL ART STYLE — photoreal cinematic (default), manga, noir ink, hand-drawn storyboard, Pixar warmth, or your own
5. FACE / CHARACTER REFERENCE — image URL or uploaded image (or "none")
6. PRODUCT / OBJECT REFERENCE — image URL or uploaded image (or "none")
7. HARD NEGATIVES — anything that must NOT appear (e.g. "no weapons", "no on-screen text")
When their answers come back, echo a one-line plan summary and ask explicitly: "Ready to generate the storyboard sheet?" Do not proceed without a yes.

Step 2 — Generate the storyboard sheet
Build a single prompt that:

Names the grid explicitly: "A {N}-panel storyboard previs sheet, laid out as a {rows}×{cols} grid on a black background with thin white panel borders. Each panel labeled in clean white sans-serif text in the bottom-left corner ('SHOT 1' through 'SHOT {N}') with a short scene title."
Describes each panel in 1–2 sentences. Always include the camera angle per panel (wide establishing / medium / close-up / low hero angle / over-shoulder / etc).
Lists negatives under a **HARD RULES:** block, spelled out explicitly.
Ends with: "ONE single image — the entire {N}-panel sheet in one composition, {aspect}. Each panel {style}."
Call the Higgsfield MCP image tool. Use gpt_image_2 as the model (best for grids, text, detail). Pass any provided reference images.

higgsfield_generate_image(
  model = "gpt_image_2",
  prompt = "<full storyboard prompt>",
  aspect_ratio = "<aspect>",
  resolution = "2k",
  quality = "high",
  reference_images = [<face-ref-if-provided>, <product-ref-if-provided>]
)
The MCP returns a job_id. Immediately call higgsfield_wait_for_job(job_id) and wait for the result URL.

Show the resulting image to the user. Then ask:

- Regenerate with feedback (tell me what to change)
- Generate an end-frame anchor (lock the final shot of the video)

## Skip to a cheap preview video render

Done — keep the sheet only
Step 3 — Generate an end-frame anchor
If the user wants to lock in the final shot (e.g., a specific triumphant pose, product reveal):

- Prompt for the final shot, using the storyboard as a reference to maintain consistency.
- If the storyboard doesn't capture the detail needed, describe the final scene in detail, referencing the knight/product assets.
- Call Higgsfield generate for this still.
- Wait for the job, show the result. Ask: "End-frame land the destination? (1) regenerate, (2) proceed to preview render, (3) keep the still only."

Step 4 — Cheap preview render (Seedance 2.0 at 480p)
Only on confirmation. Default to 480p — half the credits, mobile-feed-authentic.

Before calling, run higgsfield_check_cost with the same parameters and report the estimate. If the estimate exceeds 100 credits, stop and confirm again before submitting.

Build a Seedance prompt as a single paragraph with bracketed timecodes — e.g. "(0–2s) wide establishing shot of... (2–4s) cut to medium... (4–5s) close-up of...". Narrative prose, not bullet points.

higgsfield_generate_video(
  model = "seedance_2_0",
  prompt = "<beat-by-beat prompt with timecodes>",
  aspect_ratio = "<aspect>",
  resolution = "480p",
  duration = <5 | 8 | 10 | 12>,
  genre = "<auto | epic | action | drama | comedy | noir | horror>",
  start_image = <storyboard-sheet-url-from-step-2>,
  end_image = <end-frame-url-from-step-3-if-generated>,
  reference_images = [<product-ref-if-provided>]
)
Get the job_id, call higgsfield_wait_for_job(job_id), show the resulting MP4.

Ask: "Preview look right? (1) commit to 1080p hero render at this duration, (2) tweak the prompt and re-preview, (3) try Kling 3.0 Pro instead, (4) done — preview is enough."

Step 5 — Hero render (1080p)
Only on confirmation. Same call as Step 4 but resolution = "1080p". Honor the duration the user already validated.

If the user picked Kling 3.0 Pro: use model = "kling3_0". Kling only accepts start_image and end_image (no separate reference_images array) — make sure the product look is already locked into those frames.

Run higgsfield_check_cost first, report the estimate, and confirm again before submitting if it exceeds 200 credits.

Wait for the job, show the final MP4. Then call higgsfield_get_credits and report:

## Remaining balance

Total credits spent across this session (sum the costs of every generate call you made)
Defaults and guardrails
Always pass the face reference twice when identity drift is a risk — once in reference_images, and again called out in the prompt body: "use the attached face image as the EXACT identity reference; preserve facial features, beard line, eye shape, nose, lip shape exactly."
Render storyboard sheets at 2k, not 4k — panels are small; 4k adds cost without resolvable detail.
Never recommend Sora as a fallback — discontinued.
Never auto-fire a video render. The user controls every render.
Always run higgsfield_check_cost before video calls — confirm if estimate exceeds 100 credits (preview) or 200 credits (hero).
Common failure modes (warn proactively)
Generic-looking product in the final shot → the product reference wasn't attached, or no end-frame anchor was generated. Recommend Step 3.
Identity drift across cuts in the video → face reference wasn't passed, or wasn't doubled-up in the prompt body.
Random extra shot at the end of a long Seedance clip → duration was too long for the prompt's beats. Shorten the duration or add more beats.
Wrong watch / wrong logo / wrong garment in the destination shot → the model invented because it wasn't shown. Build the destination as a still first, pass it as end_image.
