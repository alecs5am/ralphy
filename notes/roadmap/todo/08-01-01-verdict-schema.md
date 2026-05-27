---
id: 08.01.01
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.01 `cli/lib/eval/` refactor"
title: "Verdict schema"
---

# 08.01.01 — `Verdict` schema

**v1.0:** yes

**Acceptance criteria:**
- Zod schema in `cli/lib/eval/schema.ts`:
  ```ts
  type Verdict = {
    rubric: string;          // "scenario@v3"
    passed: boolean;
    score: number;            // 0-1 weighted
    threshold: number;
    dimensions: Array<{
      id: string;
      weight: number;
      kind: "deterministic" | "llm-rubric" | "clip-similarity" | "aesthetic";
      score: number;          // 0-5 Likert OR pass/fail
      pass: boolean;          // for hard-fail dims
      reason: string;
      evidence?: string;      // quoted span / frame / timestamp range
      samples?: number[];     // raw judge samples if LLM-judged
      variance?: number;
    }>;
    cost: { tokens?: number; usd: number; durationMs: number };
  };
  ```
- All four scorers (`scoreScenario`, `scoreImage`, `scoreVideo`, new `scoreHook`) return this shape.
