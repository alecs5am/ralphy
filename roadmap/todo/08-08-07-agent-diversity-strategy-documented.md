---
id: 08.08.07
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.08 `ralphy council` — multi-agent evaluation"
title: "Agent diversity strategy documented"
---

# 08.08.07 — Agent diversity strategy documented

**v1.0:** yes

**Acceptance criteria:**
- `docs/council.md` documents: which models go in the rotation pool, why diversity matters (anti-self-enhancement bias), how to override per `cli/lib/eval/config.ts`.
- Crucially: a judge model is never the same family as the generator model for that dimension (cross-link [`08.04.03`](#0804-llm-as-judge-with-anti-bias-rituals)).
