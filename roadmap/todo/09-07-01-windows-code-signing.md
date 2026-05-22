---
id: 09.07.01
status: todo
v1_0: no
category: 09-distribution-and-release
topic: "09.07 Post-launch hardening"
title: "Windows code signing"
---

# 09.07.01 — Windows code signing

**v1.0:** no — low priority while PS1 stays the only Windows install path per [D-02](../09-distribution-and-release/OPEN-QUESTIONS.md#decision-log). PS1 isn't subject to SmartScreen the same way an unsigned `.exe` is; signing unblocks only if a future v2.x ships a clickable installer.

**Acceptance criteria:**
- EV cert obtained or community-cert path documented.
- CI step signs the .exe / signed binary in the distributed archive.
- Trigger condition: a `.exe` installer or signed-binary distribution path is proposed for a post-launch milestone.
