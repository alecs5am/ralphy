---
id: 03.02.05
status: done
v1_0: yes
category: 03-skills
topic: "03.02 Cross-agent installer"
title: "Uninstall path"
---

# 03.02.05 — Uninstall path

**v1.0:** yes

**Implementation:** `cli/lib/skill/installer.ts → uninstallSkill()` per agent. Strips sentinel blocks via `stripSentinelBlock()`, deletes adapter-owned dirs/files, and tidies empty parent dirs. Round-trip (install → uninstall → re-install) verified in `tests/unit/skill-installer.test.ts`.

**Acceptance criteria:**
- `ralphy skill uninstall [--agent <id>]` removes everything the installer placed.
- For files written under sentinels (per [D-02](../03-skills/OPEN-QUESTIONS.md#decision-log)), uninstall strips the block and leaves the surrounding file content untouched.
- Re-running install after uninstall produces identical state to a first-install.
