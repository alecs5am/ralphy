---
id: 09.01.03
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.01 Install scripts"
title: "install scripts source from a known tag, not \"latest\""
---

# 09.01.03 — install scripts source from a known tag, not "latest"

**v1.0:** yes

**Acceptance criteria:**
- `install.sh` and `install.ps1` accept `RALPHY_VERSION` env var to pin install to a specific release.
- Default: latest stable (not pre-release).
- Documented in script help.
