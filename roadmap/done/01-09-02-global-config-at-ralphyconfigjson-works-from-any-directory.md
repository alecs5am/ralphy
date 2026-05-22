---
id: 01.09.02
status: done
v1_0: yes
category: 01-cli
topic: "01.09 Standalone operation & global config"
title: "Global config at ~/.ralphy/config.json works from any directory"
---

# 01.09.02 — Global config at `~/.ralphy/config.json` works from any directory

**v1.0:** yes

**Implementation:** [`cli/lib/global-config.ts`](../../cli/lib/global-config.ts) — `readGlobalConfig() / writeGlobalConfig() / configGet() / configSet() / configList()` with dot-path nesting. File written with `0600` perms (never logged) and parent dir created with `0700`. Tests: [`tests/unit/global-config.test.ts`](../../tests/unit/global-config.test.ts) (10 cases, including permissions assertion). The legacy workspace-scoped `workspace/.ralph/config.json` still loads via the older `cli/lib/config.ts` for dev mode; new flow goes through this module.

**Acceptance criteria:**
- API keys (`openrouter`, `elevenlabs`), defaults (`default_template`, `budgets.*`), and `active_project_id` live in `~/.ralphy/config.json`.
- Every CLI invocation reads this file regardless of CWD.
- `ralphy config set <key> <value>` / `ralphy config get <key>` / `ralphy config list` manage it.
- API keys persisted with `0600` permissions; never logged.
