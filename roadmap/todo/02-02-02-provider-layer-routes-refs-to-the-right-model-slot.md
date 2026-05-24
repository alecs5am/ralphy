---
id: 02.02.02
status: todo
v1_0: stretch
category: 02-prompts-and-templates
topic: "02.02 Reference grammar"
title: "Provider layer routes refs to the right model slot"
---

# 02.02.02 — Provider layer routes refs to the right model slot

**v1.0:** stretch — not in v1.0 scope. Provider-internal optimization. The single `--ref` may already be split internally by the adapter when the model benefits (Runway Gen-4 cref/sref split is the most likely first beneficiary). Deferred behind the broader `02.02.01` 3-slot grammar work.

**Acceptance criteria:**
- Runway: refs categorized into `subjectReference[]` / `styleReference[]` by heuristic (filename hint OR provider-internal classifier).
- Gemini image: all refs merged into multi-ref input; first ref is the identity anchor.
- Kling: first-frame / last-frame anchored via `--first-frame` / `--last-frame` (separate flags); refs are hints inside the prompt formula.
- OpenAI image: refs appended to message in the multimodal call.
- Each routing rule documented in `docs/prompts/refs.md`.
