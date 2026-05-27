---
id: 03.02.02
status: done
v1_0: yes
category: 03-skills
topic: "03.02 Cross-agent installer"
title: "Cursor adapter"
---

# 03.02.02 — Cursor adapter

**v1.0:** yes

**Implementation:** `cli/lib/skill/installer.ts → installCursor()`. Writes `.cursor/rules/ralphy-router.mdc` (`alwaysApply: true`, full routing block) plus one `.cursor/rules/ralphy-<playbook>.mdc` per canonical playbook (intake, researcher, scenarist, art-director, editor, producer, core) in Agent-Requested mode (description set, alwaysApply unset). Uninstall sweeps every `ralphy-*.mdc` file and tidies the empty dir.

**Acceptance criteria:**
- Writes `.cursor/rules/ralphy-router.mdc` with `alwaysApply: true` and the AGENTS.md routing table.
- Writes one `.cursor/rules/ralphy-<playbook>.mdc` per playbook with `description` set for Agent-Requested mode.
- Scope `user` writes to `~/.cursor/rules/`; scope `project` writes to `<cwd>/.cursor/rules/`.
