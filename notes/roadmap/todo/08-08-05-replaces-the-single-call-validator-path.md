---
id: 08.08.05
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.08 `ralphy council` — multi-agent evaluation"
title: "Replaces the single-call validator path"
---

# 08.08.05 — Replaces the single-call validator path

**v1.0:** yes

**Acceptance criteria:**
- The current `cli/lib/score.ts` single-LLM-judge path is migrated to call `council` with `--agents 1` for fast pre-flight gates, `--agents 3` for ship-time evaluation, `--agents 5+` for stretch / audit work.
- Default mid-flow gate: 1 agent (fast). Default ship-time gate: 3 agents.
