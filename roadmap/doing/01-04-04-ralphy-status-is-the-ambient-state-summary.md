---
id: 01.04.04
status: doing
v1_0: yes
category: 01-cli
topic: "01.04 Setup, status, doctor"
title: "ralphy status is the ambient-state summary"
---

# 01.04.04 — `ralphy status` is the ambient-state summary

**v1.0:** yes

**Acceptance criteria:**
- Returns `{ project: { id, dir, last_activity_ts }, keys: { openrouter: bool, elevenlabs: bool }, daemon: { running, pid }, queue: { pending, in_flight } }`.
- Pretty mode highlights anomalies (no project linked, daemon down with jobs queued).
- Read-only — no side effects.
