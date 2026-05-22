---
id: 02.01.06
status: doing
v1_0: yes
category: 02-prompts-and-templates
topic: "02.01 Per-model prompt formula (secondary shaping layer)"
title: "Image adapters (OpenAI gpt-5.4-image-2, Gemini nano-banana)"
---

# 02.01.06 — Image adapters (OpenAI gpt-5.4-image-2, Gemini nano-banana)

**v1.0:** yes

**Implementation status (2026-05-20):** The shaped-prompt video adapter pipeline in `cli/lib/providers/prompt-adapter/` is the natural home for image adapters but image-side dispatch lives on the existing image cookbook flow (`docs/prompts/image/`). The image cookbook entries already pattern-match against the user's mode (product-shot / lifestyle-scene / closeup-with-person / …) — adding a typed adapter on top is a follow-up that would consolidate the current "agent reads markdown, fills slots" path. Leaving as `[~]` rather than `[x]`: the cookbook works; the typed shim doesn't exist.

**Acceptance criteria:**
- Image adapter merges 9-mode cookbook (already in `docs/prompts/image/`) into the `NormalizedPrompt` flow.
- Multi-ref vs single-ref behavior matches `MODELS.md` (Gemini wins on multi-ref consistency).
