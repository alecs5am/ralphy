---
id: 08.01.03
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.01 `cli/lib/eval/` refactor"
title: "Per-template overlay"
---

# 08.01.03 — Per-template overlay

**v1.0:** yes

**Acceptance criteria:**
- If `templates/<slug>/rubric.yaml` exists, it overlays the default (merges, dimensions added/modified, thresholds adjusted).
- Validation: overlay must not change a dimension's `kind`, only weight/threshold/criteria.
