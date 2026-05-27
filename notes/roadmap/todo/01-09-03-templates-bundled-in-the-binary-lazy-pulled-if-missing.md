---
id: 01.09.03
status: todo
v1_0: yes
category: 01-cli
topic: "01.09 Standalone operation & global config"
title: "Templates bundled in the binary, lazy-pulled if missing"
---

# 01.09.03 — Templates bundled in the binary, lazy-pulled if missing

**v1.0:** yes

**Acceptance criteria:**
- The 42 built-in templates (`templates/`) are embedded in the binary at build time (markdown + yaml, ~5 MB).
- Custom templates (workspace overrides, user-authored) pull from the companion repo via `ralphy template install <slug>`.
- `ralphy template list` shows bundled + locally-installed templates with a `source: "bundled"|"installed"|"workspace"` field.
- A repo-clone install (developer mode) takes precedence over bundled on collision.
