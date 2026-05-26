---
name: ugc-ad-production
description: |
  Full end-to-end workflow for generating a realistic AI UGC ad for a product. 15-second format. Looks real. Doesn't feel AI.
license: MIT
---

# UGC Ad Production Pipeline

## Required Inputs (ask the user for ALL of these before starting)

Before generating anything, collect:

- Product — what is being advertised (name, URL, or image)
- Reference UGC video — a real UGC video in the same niche/style (Pinterest, TikTok, YouTube link). Used for script style, creator personality, and shot reference.
- Creator face references — 2+ images of real people (attractive, matching the brand vibe). These get face-mixed in Nano Banana Pro to create a new, non-existent creator.
- Target audience — who the ad is for (e.g. women 18-35 with acne-prone skin)
- Hook type — problem/solution, before/after, testimonial, transformation, or let the agent decide based on the product
- NEVER ask
- Which editing tool to use (always Canva)
- Video length (always 15 seconds)
- Aspect ratio (always 9:16 vertical)
- Which video model (always Kling 3.0)
- Which image model (always Nano Banana Pro)
- Step 1 — Script Writing (Claude 4.6)
- Tool: Claude claude-sonnet-4-6 (strong reasoning + creative writing — feed it as much context as possible)

Prompt template:

Make a UGC script for a 15-second video like [REFERENCE VIDEO] but for [PRODUCT].
Use [CREATOR DESCRIPTION from face references] as the UGC creator/speaker.
Include:
- Hook (first 3-5 seconds): show the problem visually + audio hook
- Voiceover lines with exact words
- Cut descriptions: what the camera shows at each moment (creator face, product, before/after, etc.)
- Actions and mannerisms: make the creator feel like a real character — nervous laugh, hair tuck, direct eye contact, pointing at product, etc.
- Call to action (last 2-3 seconds)
- Timestamps for each cut/action
Output as a shooting script with columns: Timestamp | Voiceover | Visual/Shot | Action/Mannerism
Notes:

Give Claude maximum context: the reference video URL, product details, target audience pain points, other viral UGC videos in the niche, storytelling frameworks (problem-agitate-solve, before/after, etc.)
The more context, the better the script. Claude's reasoning capability is the advantage here.
Virality principles to bake in: pattern interrupt hook, social proof, transformation moment, urgency CTA
Output: A timestamped shooting script with voiceover, visuals, and creator mannerisms.

Step 2 — Generate the Creator Face (Nano Banana Pro)
Tool: Nano Banana Pro (4K — required for realistic skin texture, pores, detail)

Prompt template:

Mix these two faces to create a new attractive face that does not belong to any real person.
Use the result as the face of a UGC beauty/lifestyle content creator.
Generate at 4K resolution. Hyperrealistic skin texture, natural lighting, creator holding a ring-light mic.
Notes:

- Use 2+ Pinterest/stock face references that match the brand personality (relatable, aspirational, niche-appropriate)
- Generate with product in hand or near face for the first-frame reference
- You want skin pores, micro-detail, natural imperfections — this is what makes it not look AI
- Platform options (cheapest to best):
- Higgsfield (creator plan) — freemium, works
- Fal.ai — use coupon pixelriot20hackathon-fal for $20 free credits
- Google AI Studio — paid, most control
- Generate 3-5 variants, pick the most realistic one
- Output: A 4K portrait image of the AI creator holding the product.

Step 3 — Generate the Video (Kling 3.0)
Tool: Kling 3.0 (15-second multi-shot model)

Why Kling 3.0:

## 15-second native output length

Multi-shot: can cut between creator speaking → product closeup → skin transformation → back to creator
Expressive: understands creator mannerisms, gestures, personality
Has contextual understanding of content platforms (UGC native)
Setup:

## Input: creator image (Step 2) as the start frame

Input: product image as a reference image (not necessarily start frame — can be mid-video reference)
Input: shooting script (Step 1) as the motion/shot prompt
Prompt structure:

[First frame: creator holding product, looking at camera, natural lighting]
Cut 1 (0-3s): Creator speaks directly to camera with [mannerism], says "[hook line]"
Cut 2 (3-7s): Close-up of product being applied / used on skin
Cut 3 (7-12s): Creator reaction shot — [emotion/mannerism from script]
Cut 4 (12-15s): Creator faces camera, delivers CTA, [mannerism]
Notes:

- Control shots = telling Kling exactly what each cut shows. This is not just prompting — it's directing.
- Multi-shot = you describe the cuts like a director, not a prompter
- If confused: watch a Kling 3.0 multi-shot tutorial before attempting
- Cost: ~$4-5 per 15s clip. Free testing: Fal.ai with coupon pixelriot20hackathon-fal
- Platforms: Higgsfield, official Kling AI website, Fal.ai
- Output: A 15-second raw video clip.

## Virality Principles (Bake Into Every Step)

Hook = Problem Mirror: Show the audience their own problem in the first 3 seconds. They stop scrolling because they see themselves.
Before/After = Hope Loop: After the problem hook, show the transformation. This creates desire.
Audio Hook: The whoosh SFX at the cut is a pattern interrupt — keeps watch time up.
Creator Mannerisms = Trust: A creator that feels like a real person (laughs nervously, tucks hair, sighs) builds subconscious trust faster than a perfect delivery.
Reverb = Room Presence: 10% reverb makes the voice feel like it was recorded in a real space, not a studio. Removes the "AI radio voice" feel.
CTA Urgency: Last 2-3 seconds. Direct, specific, low-friction ("link in bio", "tap the link", "DM me").

## Branding Note

If this is for a real account/brand (not testing):

- The creator face should match the brand's target audience persona
- The creator's style/vibe should be consistent across all UGC videos

Don't mix aesthetics between videos — pick one and lock it
Platform / Cost Summary
Tool	Purpose	Cost
Gemini 2.5 Pro	Script writing	Free (AI Studio)
Nano Banana Pro	Creator face + product images	Higgsfield creator plan / Fal.ai ($20 coupon: pixelriot20hackathon-fal)
Kling 3.0	Video generation	~$4-5/clip — Higgsfield / Kling AI / Fal.ai
ElevenLabs	Voice cloning + swap	Paid (voice training feature)
Play.ht	Voice cloning (alt)	Freemium
Canva	Video editing + text	Free / Pro
Artlist	Sound effects	Paid (free alternatives exist)
