---
name: ugc-ad
namespace: user
description: >-
  How to make a realistic AI UGC ad for a product — generalized niche know-how that looks real and doesn't feel AI. A domain overlay on the standard pipeline: supplies the shooting-script shape (timestamp | VO | shot | mannerism), the creator-persona build, the problem-mirror hook, the trust-through-mannerisms rule, and the 9:16 ~15s UGC format defaults. Works for ANY product the user names — their skincare line, a no-name app, a gadget. The skill supplies the know-how; the user supplies the product.
  USE WHEN the user asks for a UGC ad / creator-style product ad / "make an ad that looks like a real person reviewing my product" / testimonial-style or problem-solution short for TikTok / Reels / Shorts, with no specific existing video to reproduce.
  This is a niche SKILL (generalized), not a remix TEMPLATE. For "remix this exact ad but swap the product/person", use the remix path (docs/skills-vs-templates.md). For swapping the creator in an existing clip, see /ugc-model-swap.
---

## Trigger

**FIRES** on a generic UGC-ad brief: "make a UGC ad for <product>", "creator reviewing my <product>", "testimonial ad", "problem/solution short for <app>", "before/after for <product>" (when the emphasis is a talking creator, not a pure product montage).

**DO NOT FIRE** when:
- The user points at one specific ad to reproduce → **remix path** (`ralphy template use <slug>`). See [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).
- The user wants to swap only the creator/person in an existing clip → `/ugc-model-swap`.
- The brief is a static image ad, not video → that is a different niche.

## What this skill is

A generalized overlay, not a finished ad. It tells the pipeline HOW believable UGC ads work so the scenarist and art-director produce a strong one for whatever the user is selling. It runs **through** the normal pipeline and never bypasses the intake gates, the reference-required gate, or the quality gates.

## Hard invariants

- **Provider invariants stand.** All generation via `ralphy generate` (OpenRouter media + ElevenLabs only — no FAL, no Higgsfield, no Canva, no raw API). Renders via `ralphy render <id>`. Read `MODELS.md` before naming any model id.
- **Reference gate.** A **named real brand product** ("iPhone 16", "CeraVe cleanser") fires the reference-required gate — refuse without a ref photo or logged `--no-ref-consent`. A no-name / generic product proceeds without a ref.
- **AI-creator faces are synthetic personas, not real people.** Build a consistent non-existent creator (see workflow). Do not face-mix toward a recognizable real person.
- **Music is a separate ElevenLabs pass.** Kling `--audio` is for the VO/lipsync only; ban music in the Kling prompt and overlay an instrumental bed in the editor stage (per `MEMORY.md` Kling-no-music note).

## The niche, in one paragraph

A UGC ad lives or dies on **believability** and the **first 3 seconds**. The viewer must feel a real person is talking to them, not a brand. The hook is a *problem mirror* — show the viewer their own problem so they stop scrolling because they see themselves. Then a transformation/hope beat, then a real verdict, then a low-friction CTA. Trust comes from **mannerisms** (a nervous laugh, a hair tuck, direct eye contact, pointing at the product) far more than from polished delivery. The single biggest AI tell is a too-perfect, too-symmetrical creator and a studio-clean voice — fight both.

## Beat / script shape (default ~15s, 9:16)

Author a shooting script as a table the art-director can fan out from:

| Timestamp | Voiceover (exact words) | Visual / shot | Action / mannerism |
|---|---|---|---|
| 0-3s | the hook line | problem shown visually, creator to camera | pattern-interrupt gesture |
| 3-7s | the turn | product applied / used / demoed | hands on product |
| 7-12s | the verdict | reaction / before-after | genuine reaction (laugh, raised brows) |
| 12-15s | the CTA | creator to camera | point / "link in bio" |

Virality principles to bake in: **problem-mirror hook**, **hope loop** (transformation after the problem), **audio pattern-interrupt** (a whoosh SFX on the cut), **mannerisms = trust**, **room presence** (a touch of reverb on the VO so it reads recorded-in-a-room, not studio), **CTA urgency** (specific, low-friction).

## Framing + realism

- Handheld smartphone-UGC feel, eye-level, 9:16. Natural indoor light, not flat phone-flash.
- **Photoreal creator.** Skin pores, micro-detail, slight asymmetry — fold the anti-AI-slop / photoreal-still register in (`ralphy guideline list`; see `MEMORY.md` anti-ai-slop + photoreal-still notes). A flawless face is the giveaway.
- Generate the creator anchor with the product in hand or near the face for the first-frame reference.

## Default model stack (verify against MODELS.md)

- **Script:** the scenarist LLM (`callLLM`) — feed it max context (product, target pains, the niche's viral patterns, the chosen hook framework).
- **Creator + product keyframes:** `google/gemini-3-pro-image-preview` (nano-banana-pro). Generate 3-5 variants, pick the most realistic.
- **i2v (multi-shot talking creator):** `kwaivgi/kling-v3.0-pro` — direct it shot-by-shot (each cut = creator speaks → product close-up → reaction → CTA). Kling `--audio` carries the EN VO + lipsync; for non-EN, VO via ElevenLabs (confirm target language at intake — see `MEMORY.md` Kling-no-RU-audio).
- **Music:** separate ElevenLabs Music pass, instrumental, post-mixed in the editor (no artist names — `MEMORY.md`).
- **Captions:** per-slot on the locked VO.

## Workflow

1. **Intake.** Collect: product (name / URL / image), target audience + their pain, hook type (problem-solution / before-after / testimonial / transformation — or let the agent pick), target language, hard "no"s. Announce: "This is a UGC ad — using the UGC-ad skill." Defaults: 9:16, ~15s.
2. **Reference gate.** Named real brand product → get a ref or logged `--no-ref-consent`. No-name → proceed.
3. **Script.** Produce the timestamped shooting-script table; get the user's "go".
4. **Creator persona anchor** (with product), then per-beat anchors — one beat at a time with checkpoints.
5. **i2v per beat** (Kling, directed shot list), then VO/SFX, then music post-mix, then captions, then `ralphy render <id>`.
6. **Hand off** to `/evaluator` for the post-render quality gate.

## Cookbook

- "Make a UGC ad for my no-name vitamin-C serum" → no ref needed; problem-mirror hook (dull skin), creator persona, ~15s 9:16. Match this skill, run the pipeline.
- "Creator ad for the Dyson Airwrap" → named real product → reference gate fires; ask for a ref photo first.
- "Same ad but with a different creator" → NOT this skill → `/ugc-model-swap`.

## See also

- [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md) — skill vs remix template.
- [`.agents/skills/intake/SKILL.md`](../../../.agents/skills/intake/SKILL.md) — the gates this runs through.
- `MEMORY.md` — anti-ai-slop, photoreal-still register, Kling no-music post-mix, Kling no-RU-audio.
