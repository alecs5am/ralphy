---
id: 08.05.01
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.05 Calibration golden set"
title: "Golden set committed"
---

# 08.05.01 — Golden set committed

**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/eval/golden/scenarios/` — ≥ 30 hand-labeled scenarios with per-dimension scores.
- `cli/lib/eval/golden/renders/` — ≥ 30 rendered mp4s + label JSON.
- Each label: `{ rubric_version, dimensions: { [id]: { score, pass } }, labeler, labeled_at }`.
