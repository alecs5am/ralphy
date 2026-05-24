---
id: 04.05.01
status: todo
v1_0: no
category: 04-user-flow-and-autonomy
topic: "04.05 Producer mode"
title: "ralphy producer \"<brief>\" --batch N"
---

# 04.05.01 — `ralphy producer "<brief>" --batch N`

**v1.0:** no — deferred per [D-02](../04-user-flow-and-autonomy/OPEN-QUESTIONS.md#decision-log). Reopens post-launch once concrete demand surfaces.

**Acceptance criteria:** (post-launch)
- One-verb batch: spawn N projects from the brief, run end-to-end pipeline on each, respect concurrency cap 3.
- Stops only on quality-gate refusal or explicit interrupt.
- Final summary: `{ projects: [...], renders: [...], total_cost_usd, wall_time_s, failures: [...] }`.
