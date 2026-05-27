---
id: 03.02.03
status: done
v1_0: yes
category: 03-skills
topic: "03.02 Cross-agent installer"
title: "Copilot adapter"
---

# 03.02.03 — Copilot adapter

**v1.0:** yes

**Implementation:** `cli/lib/skill/installer.ts → installCopilot()`. Writes `.github/copilot-instructions.md` (sentinel-merged) + one `.github/instructions/ralphy-<playbook>.instructions.md` per playbook with `applyTo: '**'`. Uninstall strips the block + removes per-playbook files + tidies the empty `.github/instructions/` dir when empty.

**Acceptance criteria:**
- Writes `.github/copilot-instructions.md` (the router) OR adds Ralphy section to existing one (idempotent). **[x]**
- Writes one `.github/instructions/ralphy-<playbook>.instructions.md` per playbook with `applyTo: '**'`. **[x]**
