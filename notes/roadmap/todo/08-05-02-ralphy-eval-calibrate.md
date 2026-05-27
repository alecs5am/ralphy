---
id: 08.05.02
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.05 Calibration golden set"
title: "ralphy eval calibrate"
---

# 08.05.02 — `ralphy eval calibrate`

**v1.0:** yes

**Acceptance criteria:**
- Runs every scorer over the golden set; computes per-dimension Cohen's κ vs human labels.
- Writes `cli/lib/eval/CALIBRATION.md` with the latest results.
- CI check: any dimension's κ < 0.6 fails the build.
