---
id: 08.04.02
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.04 LLM-as-judge with anti-bias rituals"
title: "Position swap for pairwise comparisons"
---

# 08.04.02 — Position swap for pairwise comparisons

**v1.0:** yes

**Acceptance criteria:**
- `judge/swap.ts` exposes `pairwise(rubric, dimension, a, b)` that runs both orderings, discards if disagreement.
- Returns `{ winner: "a"|"b"|"tie"|"uncertain", swap_agreement: bool }`.
