---
id: 02.01.01
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.01 Per-model prompt formula (secondary shaping layer)"
title: "Adapter module cli/lib/providers/prompt-adapter/"
---

# 02.01.01 — Adapter module `cli/lib/providers/prompt-adapter/`

**v1.0:** yes

**Implementation (2026-05-20):** Module at `cli/lib/providers/prompt-adapter/`. `types.ts` defines `NormalizedPrompt` + `AdapterOutput` + `Adapter`. Per-model adapters: `kling.ts`, `veo.ts`, `luma.ts`, `runway.ts`, `pika.ts`, `sora.ts`, `seedance.ts`, `hailuo.ts`. `index.ts` exports `adapterFor(modelId)` + `shapePrompt(modelId, input)` dispatcher; unknown models fall back to the Pika shape. Tests at `tests/unit/prompt-adapter.test.ts` (24 cases, including a frozen exact-string assertion for the canonical Kling prompt).

**Acceptance criteria:**
- One file per model family: `kling.ts`, `veo.ts`, `luma.ts`, `pika.ts`, `runway.ts`, `sora.ts`, `openai-image.ts`, `gemini-image.ts`.
- Each exports `shape(promptInput: NormalizedPrompt): ProviderRequest`.
- `NormalizedPrompt` is our internal shape: `{ subject, action, setting, camera, lighting, style, dialogue?, motion?, refs?, duration_s? }`.
- `ProviderRequest` is what the provider's media.ts call expects.
- Pure functions; unit-tested with 5+ examples per model.
