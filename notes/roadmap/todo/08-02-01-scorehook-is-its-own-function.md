---
id: 08.02.01
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.02 Hook scorer"
title: "scoreHook is its own function"
---

# 08.02.01 — `scoreHook` is its own function

**v1.0:** yes

**Acceptance criteria:**
- Scope: first 90 frames + first VO line.
- Dimensions: `hook_clarity` (who/what/why in 3s), `pattern_interrupt` (unexpected element in 0-30 frames), `cta_or_loop` (last 2s only, but this is the *opening* sibling).
- Hard fail on `hook_clarity < 3`.
- Documented in `cli/lib/eval/rubrics/hook.yaml`.
