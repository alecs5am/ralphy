---
id: 09.06.04
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.06 Clean-machine smoke (CI)"
title: "Per-release: npm i -g smoke after publish"
---

# 09.06.04 — Per-release: `npm i -g` smoke after publish

**v1.0:** yes

**Acceptance criteria:**
- Workflow polls npm registry visibility → runs `npm i -g @alecs5am/ralphy@<version>` on a fresh runner.
- Asserts version + doctor.
