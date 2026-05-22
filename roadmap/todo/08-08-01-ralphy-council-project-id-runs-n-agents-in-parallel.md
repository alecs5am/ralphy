---
id: 08.08.01
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.08 `ralphy council` — multi-agent evaluation"
title: "ralphy council <project-id> runs N agents in parallel"
---

# 08.08.01 — `ralphy council <project-id>` runs N agents in parallel

**v1.0:** yes

**Acceptance criteria:**
- `ralphy council <project-id> --agents N` (default 3, range 1..7) launches N independent agents, each scoring the project against the active rubric.
- Each agent runs the full `Verdict` pipeline of `08.01`-`08.05`.
- Models per agent are selected from a configurable pool (see Q-08, default: rotate through Claude / GPT / Gemini for diversity).
- The actual model behind each agent is **hidden from the user** in reports and CLI output. Agents are labeled `Agent 1`, `Agent 2`, … only.
- Output per project: `workspace/projects/<id>/eval/council-<timestamp>/report-from-agent-<N>.md` + `verdict-agent-<N>.json`.
- Summary report at `workspace/projects/<id>/eval/council-<timestamp>/SUMMARY.md` consolidating per-dimension consensus + dissent.
