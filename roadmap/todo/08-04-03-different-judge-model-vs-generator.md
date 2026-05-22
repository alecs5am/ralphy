---
id: 08.04.03
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.04 LLM-as-judge with anti-bias rituals"
title: "Different judge model vs generator"
---

# 08.04.03 — Different judge model vs generator

**v1.0:** yes

**Acceptance criteria:**
- Config: `judge_model: claude` if `generator_model: openai`, and vice versa.
- Documented in `cli/lib/eval/config.ts`.
- Cross-link `MODELS.md` for which judge models we trust.
