---
id: 08.03.02
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.03 Deterministic assertions"
title: "Dead-air via ffmpeg silencedetect"
---

# 08.03.02 — Dead-air via ffmpeg silencedetect

**v1.0:** yes

**Acceptance criteria:**
- `assertDeadAir(path, maxPct)` returns total silence > threshold (e.g., -40 dBFS for > 0.5s segments).
- Default max 5% of total duration.
