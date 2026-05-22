---
id: 08.06.02
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.06 Refuse-not-warn enforcement"
title: "No silent warnings"
---

# 08.06.02 — No silent warnings

**v1.0:** yes

**Acceptance criteria:**
- Audit pass: every call to `scoreScenario` / `scoreImage` / `scoreVideo` either acts on `passed` or is in a documented "diagnostic-only" code path.
- Lint test.
