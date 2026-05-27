---
id: 08.08.04
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.08 `ralphy council` — multi-agent evaluation"
title: "Council cost-bounded"
---

# 08.08.04 — Council cost-bounded

**v1.0:** yes

**Acceptance criteria:**
- `ralphy council --agents 3` for a 15s video costs ≤ $0.30 total.
- `--dry-run` returns the cost estimate without running.
- Budget enforcement via `10.03` — refuses if council would breach project budget.
