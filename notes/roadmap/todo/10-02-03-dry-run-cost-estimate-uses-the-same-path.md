---
id: 10.02.03
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.02 Cost-from-OpenRouter"
title: "--dry-run cost estimate uses the same path"
---

# 10.02.03 — `--dry-run` cost estimate uses the same path

**v1.0:** yes

**Acceptance criteria:**
- `ralphy generate ... --dry-run` returns the local estimate (since there's no id to fetch yet).
- Audit verifies estimates are within ±15% of actuals on a 50-call sample.
