---
id: 10.03.02
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.03 Budget caps"
title: "Pre-call check in cli/lib/providers/media.ts and llm.ts"
---

# 10.03.02 — Pre-call check in `cli/lib/providers/media.ts` and `llm.ts`

**v1.0:** yes

**Acceptance criteria:**
- Every provider call queries the gen-log to compute current spend (cached in-memory per session).
- If adding the estimated cost would exceed a cap, refuse with `E_BUDGET_EXCEEDED`.
- Error message names the cap, current spend, projected.
