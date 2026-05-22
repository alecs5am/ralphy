---
id: 09.01.04
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.01 Install scripts"
title: "Install scripts respect a --prefix / RALPHY_INSTALL_DIR"
---

# 09.01.04 — Install scripts respect a `--prefix` / `RALPHY_INSTALL_DIR`

**v1.0:** yes

**Acceptance criteria:**
- Default: `~/.local/bin/` (sh) / `%USERPROFILE%\.ralphy\bin` (ps1).
- Override via env var.
- Auto-PATH detection prefers existing rc files; appends idempotently.
