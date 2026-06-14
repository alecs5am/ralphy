# Mode quality playbook — `tutorial-ugc`

> A how-to / step-by-step UGC video showing a product or task in use. Backing skill: [`/ugc-ad`](../../../.agents/skills/ugc-ad/SKILL.md). Route: `intake → scenarist → art-director → editor → ralphy render`.

## Creative objective

Teach one thing cleanly and make the creator believable. A tutorial UGC wins on **clarity of steps + a real-person demonstrator**. The viewer must feel a real human is showing them, not a brand — and must be able to follow the steps without rewinding. The hook promises the payoff ("here's how to X in 20 seconds"); each step shows the hands doing the action; the verdict closes the loop.

## Required inputs

- Product or task to demo.

## Reference requirements

No reference for a no-name / generic product or task. The reference-required gate fires for a **named real brand product** ("iPhone 16", "CeraVe cleanser") — refuse without a ref photo or a logged `--no-ref-consent`. AI creators are synthetic personas — build a consistent non-existent creator; do not face-mix toward a recognizable real person.

## Prompt spine

Author a timestamped shooting script the art-director fans out from (default ~15-30s, 9:16):

| Timestamp | Voiceover | Visual / shot | Action / mannerism |
|---|---|---|---|
| 0-3s | hook ("here's how to X") | creator to camera + the end result teased | pattern-interrupt gesture |
| step beats | one instruction per step | hands doing the step, product in frame | clear, deliberate hand motion |
| verdict | the payoff line | the finished result | genuine reaction |
| CTA | low-friction ask | creator to camera | point / "link in bio" |

- One step per beat — never two instructions in one shot.
- Each i2v beat needs a distinct physical action (a real start→end motion delta) or clips read static.
- Photoreal creator: skin pores, slight asymmetry, natural light — fold the anti-AI-slop / photoreal-still register in.

## Model recommendations

Verify against `MODELS.md` every run.
- **Script:** the scenarist LLM (`callLLM`) — feed it the product, the steps, the target pains.
- **Creator + step keyframes:** `google/gemini-3-pro-image-preview` (multi-ref consistency); generate 3-5 creator variants, pick the most realistic.
- **i2v:** `kwaivgi/kling-v3.0-pro` — direct each step shot-by-shot. Kling `--audio` carries EN VO + lipsync; non-EN VO via ElevenLabs (confirm target language — `MEMORY.md` Kling-no-RU-audio).
- **Music:** separate ElevenLabs Music pass, instrumental, post-mixed in the editor — banned inside the Kling prompt; no artist names.
- **Captions:** per-step on the locked VO (step labels help comprehension).

## Style / visual constraints

- Handheld smartphone-UGC feel, eye-level, 9:16, natural indoor light (not flat phone-flash).
- Mannerisms = trust; a too-perfect creator + studio-clean voice is the giveaway. A touch of room reverb on the VO.
- One consistent surface / setting across steps — generate a master plate first.

## Common failure modes

- **Two instructions crammed into one shot** → one step per beat.
- **Static clips** → each step is a distinct hand action with a real motion delta.
- **Beauty-filter creator face** → real-camera spec + named imperfection + anti-AI-slop negatives.
- **Kling auto-music muddying the VO** → ban music in-prompt, post-mix a separate bed.

## Evaluation criteria

`scoreScenario` → `scoreImage` → `scoreVideo` gates (each refuses, not warns — two fails → stop). Beyond the gates: steps are followable without rewinding, the creator reads real, hook lands in ≤3s, captions match the locked VO. Optional `/evaluator` post-render pass.

## Does NOT apply to:

- A talking-head review / testimonial of a product → that is `ugc-review` (also backed by `/ugc-ad`).
- An unboxing / first-impressions reveal → use [`unboxing-ugc.md`](unboxing-ugc.md).
- A long-form audio-driven faceless explainer → use [`podcast-video.md`](podcast-video.md).
- A polished broadcast commercial → that is `tv-ad`.
- A static how-to graphic / infographic → match an image mode.
