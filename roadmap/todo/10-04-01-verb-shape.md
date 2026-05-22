---
id: 10.04.01
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.04 `ralphy cost report`"
title: "Verb shape"
---

# 10.04.01 — Verb shape

**v1.0:** yes

**Acceptance criteria:**
- `ralphy cost report [--project <id>] [--since 7d] [--group-by template|brand|model|day]`.
- Output: `{ total_usd, by_group: [{ key, usd, count }], window }`.
- Pretty: bar chart in terminal (`-p`).
- < 200ms on a workspace with 100 projects.
