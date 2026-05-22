---
id: 02.01.03
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.01 Per-model prompt formula (secondary shaping layer)"
title: "Luma adapter appends reinforcer"
---

# 02.01.03 — Luma adapter appends reinforcer

**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/providers/prompt-adapter/luma.ts` emits comma-delimited prose then appends `"The <subject> stays the focus, <styleNoun> register held throughout."`. Documented at `docs/prompts/video/luma.md`.

**Acceptance criteria:**
- When the model is `luma/ray-*`, the adapter appends a trailing reinforcer sentence that repeats the most important visual element.
- Reinforcer source: `NormalizedPrompt.subject` + first noun in `style`.
- Documented in `docs/prompts/video/luma.md`.
