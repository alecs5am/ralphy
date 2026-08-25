---
name: ugc-unboxing
namespace: user
description: >-
  How to make a generic UGC unboxing video for socials — generalized niche know-how, not a single video. A domain overlay on the standard pipeline (intake → scenarist → art-director → editor): supplies the beat structure (cold-open hook → reveal → detail macro → reaction → CTA), hands-only framing and lens vocabulary, the ASMR-leaning SFX register, the default model stack, and the niche's common failure modes. Works for ANY product the user names — their coffee grinder, a no-name skincare set, a gadget — the skill supplies the know-how, the user supplies the subject.
  USE WHEN the user asks for an unboxing / "open the box" / "first look" / haul / "what's inside" video for TikTok / Reels / Shorts, with no specific existing video to reproduce.
  This is a niche SKILL (generalized), not a remix TEMPLATE (one specific video). For "remix this exact unboxing but swap X", that is the remix path in docs/skills-vs-templates.md, not this skill.
---

## Trigger

**FIRES** on a generic unboxing brief: "make an unboxing of <product>", "open-the-box video", "first look at <X>", "haul video", "what's inside <package>". Any subject — the skill is subject-agnostic.

**DO NOT FIRE** when:
- The user points at one specific unboxing video to reproduce (`@template:<slug>`, "remix this one", names a slug) → that is the **remix path** (`ralphy template use <slug>`), not this skill. See [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).
- The request is a different niche (talking-head, tier-list, before/after) → match that niche's skill.

## What this skill is

A generalized overlay, not a finished video. It does not name a product, a script, or a cast — it tells the pipeline HOW unboxing videos work so the scenarist and art-director produce a strong one for whatever the user is unboxing. It runs **through** the normal pipeline; it does not replace intake gates, the reference-required gate, or the quality gates.

## Hard invariants

- This skill never bypasses AGENTS.md invariants. The reference-required gate still fires for a **named real brand product** (an "iPhone 16", a "Dyson Airwrap") — refuse without a ref or logged `--no-ref-consent`. A no-name / generic product proceeds without a ref.
- All generation routes through `ralphy generate` (no raw API). Renders go through `ralphy render <id>`.
- Read `MODELS.md` before naming any model id — the stack below is a default, not a hardcode.

## The niche, in one paragraph

Unboxing lives or dies on the **reveal moment** and on **tactile credibility**. The viewer must believe a real human hand is touching a real object. Hands-only or over-shoulder framing (face optional), macro detail on textures/seams, and crisp ASMR-register SFX (cardboard, tape peel, plastic crinkle, the product's own click/snap) do more for retention than any VO line. Hook in the first ~1.5s with the still-sealed box and a tension line ("I cannot believe what's inside this").

## Beat structure (default ~15-25s, 9:16)

| Beat | Role | ~Duration | What it does |
|---|---|---|---|
| 1. Sealed-box hook | hook | 1.5-3s | Box still closed, hands entering frame, tension line. Scroll-stopper. |
| 2. The open | body | 2-4s | The peel / cut / lid-lift. SFX carries this beat — VO optional. |
| 3. Reveal | body | 2-4s | First full look at the product, lifted toward camera. The payoff. |
| 4. Detail macro | body | 3-6s | Close textures, materials, the one feature worth buying for. |
| 5. Reaction / verdict | body | 2-4s | Genuine reaction beat; the one honest opinion line. |
| 6. CTA | cta | 1.5-3s | Where to get it / "should I keep it?" engagement bait. |

Scale beats up/down with the user's duration. Keep the hook ≤3s regardless.

## Framing + lens vocabulary

- **Default framing:** hands-only, top-down or over-shoulder onto a clean surface. Face is optional — many top unboxing creators never show one.
- **Lens:** 35-50mm look for the wide; push to a macro register (85-100mm, shallow DOF) for the detail beat.
- **Lighting:** soft key + fill, slight specular highlight on the product to read material. Avoid flat phone-flash look.
- **Surface:** one consistent surface across beats — generate a surface/location master plate first (per intake step 3) so every beat matches.
- **Anti-AI-slop:** real-camera credibility on hands (skin texture, slight asymmetry, natural nail/knuckle detail). See `MEMORY.md` anti-ai-slop notes; fold the photoreal-hands guideline in if available (`ralphy guideline list`).

## Audio register

- **SFX is the star.** Tape peel, cardboard, plastic crinkle, the product's own click/snap. Crisp, close, ASMR-leaning.
- **VO is sparse** — 1-2 honest lines max (hook + verdict). Don't narrate the open; let SFX carry it.
- **Music:** low instrumental bed under the SFX, or none. Per AGENTS invariant, Kling auto-music is banned in-prompt; music is a separate ElevenLabs Music post-mix in the editor stage.

## Default model stack (verify against MODELS.md)

- **Keyframes:** `google/gemini-3-pro-image-preview` (nano-banana-pro) for the product + hands anchors.
- **i2v:** `kwaivgi/kling-v3.0-pro` — the hand-on-object motion and tactile micro-gestures are its strength. Each beat needs a distinct physical action (peel, lift, rotate) — start/end frames must show a real motion delta (see `MEMORY.md` start-end-frame note), or clips read static.
- **VO:** Kling `--audio` for EN; ElevenLabs for non-EN (confirm target language at intake).
- **Captions:** per-slot on the locked VO.

## Workflow

1. **Intake.** Run the normal intake (target language, aspect, duration, hard "no"s). Announce: "This is an unboxing — using the unboxing skill." Aspect defaults 9:16.
2. **Reference gate.** If the product is a named real brand item, the reference-required gate fires — get a ref photo or a logged `--no-ref-consent`. No-name product → proceed.
3. **Scenario.** Hand the beat structure above to the scenarist; produce `STORYBOARD.md` and get the user's "go".
4. **Surface master plate first**, then product anchor, then per-beat anchors — one beat at a time with checkpoints (intake step 3 cadence).
5. **i2v per beat**, then VO + SFX, then captions, then `ralphy render <id>`.
6. **Hand off** to `/evaluator` for the post-render quality gate.

## Cookbook

- "Make an unboxing of my new coffee grinder" → no-name product, no ref needed. 9:16, ~20s, hands-only, SFX-forward. Match this skill, run the pipeline.
- "First look at the iPhone 16" → named real product → reference gate fires; ask for a ref photo before any generation.
- "Remix the `gadget-unboxing-asmr` video but use my product" → NOT this skill; this is the remix path → `ralphy template use gadget-unboxing-asmr`.

## See also

- [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md) — why this is a skill and not a template.
- [`.agents/skills/intake/SKILL.md`](../../../.agents/skills/intake/SKILL.md) — the gates this skill runs through.
- `MEMORY.md` — anti-ai-slop, start↔end frame motion delta, Kling no-music post-mix.
