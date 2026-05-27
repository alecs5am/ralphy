---
id: 08.06.01
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.06 Refuse-not-warn enforcement"
title: "Gate refuses on passed: false"
---

# 08.06.01 — Gate refuses on `passed: false`

**v1.0:** yes

**Acceptance criteria:**
- `ralphy generate` / `ralphy render` / `ralphy ship` paths check the gate; on `passed: false`, exit with code 5 (`E_QUALITY_GATE`).
- Error message names the failing dimension(s) and threshold.
- `--allow-failed-eval` flag overrides; logged as `stage: "eval-override"` in gen-log.
