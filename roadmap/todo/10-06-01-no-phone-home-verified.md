---
id: 10.06.01
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.06 Privacy posture"
title: "\"No phone home\" verified"
---

# 10.06.01 — "No phone home" verified

**v1.0:** yes

**Acceptance criteria:**
- Audit: `grep -r 'fetch\|http' cli/lib/` returns only calls to OpenRouter, ElevenLabs, GitHub (for `ralphy assets`), and explicit user-set OTLP targets.
- Documented in `docs/privacy.md` and `README.md`.
