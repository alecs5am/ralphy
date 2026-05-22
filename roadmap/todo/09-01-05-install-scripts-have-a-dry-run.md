---
id: 09.01.05
status: todo
v1_0: stretch
category: 09-distribution-and-release
topic: "09.01 Install scripts"
title: "Install scripts have a --dry-run"
---

# 09.01.05 — Install scripts have a `--dry-run`

**v1.0:** stretch

**Acceptance criteria:**
- `curl install.sh | sh -s -- --dry-run` prints what would happen without writing.
- Same for `install.ps1`.
