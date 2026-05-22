---
id: 08.01.04
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.01 `cli/lib/eval/` refactor"
title: "Module layout"
---

# 08.01.04 — Module layout

**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/eval/index.ts` — public API
- `cli/lib/eval/config.ts` — YAML loader + Zod
- `cli/lib/eval/rubrics/*.yaml` — default rubrics
- `cli/lib/eval/assertions/{deterministic,clip,aesthetic,llm-rubric}.ts` — assertion handlers
- `cli/lib/eval/judge/{schema,sample,swap}.ts` — judge wrapper
- `cli/lib/eval/golden/{scenarios,renders}/` — calibration set
- `cli/lib/eval/calibrate.ts` — κ computation
- `cli/lib/eval/report.ts` — markdown writer
