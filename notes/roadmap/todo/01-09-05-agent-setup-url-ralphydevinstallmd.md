---
id: 01.09.05
status: todo
v1_0: yes
category: 01-cli
topic: "01.09 Standalone operation & global config"
title: "Agent-setup URL (ralphy.dev/install.md)"
---

# 01.09.05 — Agent-setup URL (`ralphy.dev/install.md`)

**v1.0:** yes

**Acceptance criteria:**
- A stable URL `https://ralphy.dev/install.md` returns a clean markdown document with: install command (`brew install ralphy` / `curl install.sh | sh`), `ralphy setup` walkthrough, `ralphy new "<brief>"` first-project, link to skill install.
- AI agents that fetch this URL can execute every command in order and end at a green `ralphy doctor`.
- Tested with Claude Code, Cursor, ChatGPT, Gemini, Codex (manual run per release).
- Cross-link to documentation owners in [`07.02`](../07-socials-and-docs/PRD.md).
