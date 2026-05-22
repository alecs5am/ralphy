---
id: 10.03.01
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.03 Budget caps"
title: "Config layer"
---

# 10.03.01 — Config layer

**v1.0:** yes

**Acceptance criteria:**
- `ralphy config set budget.daily <usd>`, `budget.project <usd>`, `budget.session <usd>`.
- Persisted to `~/.ralphy/config.json` (daily, session) and `workspace/projects/<id>/budget.json` (project-scoped overlay).
- `ralphy config get budget` returns current caps.
