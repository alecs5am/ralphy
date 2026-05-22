---
id: 08.03.04
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.03 Deterministic assertions"
title: "Cost cap"
---

# 08.03.04 — Cost cap

**v1.0:** yes

**Acceptance criteria:**
- `assertCostCap(projectId, maxUsd)` reads `generations.jsonl` cost rollup, fails if exceeded.
- Default $1.50 per video (configurable per template).
