---
id: 01.09.08
status: todo
v1_0: stretch
category: 01-cli
topic: "01.09 Standalone operation & global config"
title: "Migration from repo-clone workspace to standalone"
---

# 01.09.08 — Migration from repo-clone workspace to standalone

**v1.0:** stretch

**Acceptance criteria:**
- `ralphy workspace migrate-to-home` copies an existing repo-resident `workspace/` to `~/.ralphy/projects/` (additive).
- Idempotent; logs every move.
