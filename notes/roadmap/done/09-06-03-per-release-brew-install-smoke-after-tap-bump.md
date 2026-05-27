---
id: 09.06.03
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.06 Clean-machine smoke (CI)"
title: "Per-release: brew install smoke after tap bump"
---

# 09.06.03 — Per-release: `brew install` smoke after tap bump

**v1.0:** yes

**Acceptance criteria:**
- Workflow polls brew tap PR merge → runs `brew install alecs5am/tap/ralphy` on a fresh runner.
- Asserts version + doctor.
