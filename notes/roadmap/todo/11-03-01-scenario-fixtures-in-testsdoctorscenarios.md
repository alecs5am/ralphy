---
id: 11.03.01
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.03 Doctor scenarios"
title: "Scenario fixtures in tests/doctor/scenarios/"
---

# 11.03.01 — Scenario fixtures in `tests/doctor/scenarios/`

**v1.0:** yes

**Acceptance criteria:**
- Fixtures: missing `OPENROUTER_API_KEY`, expired key (mocked 401), missing ffmpeg (PATH manipulation), wrong ffmpeg version, missing yt-dlp, missing bun (skipped — we ARE bun), read-only workspace, no internet (mocked), low disk (mocked), broken project link, stale registry.
- Each scenario asserts: exit code, the specific check that flagged red, and the hint string.
