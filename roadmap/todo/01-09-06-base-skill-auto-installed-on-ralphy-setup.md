---
id: 01.09.06
status: todo
v1_0: yes
category: 01-cli
topic: "01.09 Standalone operation & global config"
title: "Base skill auto-installed on ralphy setup"
---

# 01.09.06 — Base skill auto-installed on `ralphy setup`

**v1.0:** yes

**Acceptance criteria:**
- `ralphy setup` ends by detecting installed agents (Claude Code, Cursor, Copilot, Codex via `AGENTS.md` support) and offers to install the base skill bundle (cross-link [`03.02`](../03-skills/PRD.md)).
- Default: yes, install. Opt-out via `--no-skill-install` or interactive "n".
- Idempotent — re-running setup re-uses the install.
