---
id: 08.04.01
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.04 LLM-as-judge with anti-bias rituals"
title: "Judge wrapper at judge/sample.ts"
---

# 08.04.01 — Judge wrapper at `judge/sample.ts`

**v1.0:** yes

**Acceptance criteria:**
- `judgeDimension(rubric, dimension, input)` calls `cli/lib/providers/llm.ts → callLLM()` with `temperature: 0`, JSON-schema response_format, `n: 3` (configurable).
- Returns `{ samples: number[], median: number, variance: number, reason: string, evidence: string }`.
- Flags `uncertain: true` when variance > 1.0 on a 0-5 scale.
