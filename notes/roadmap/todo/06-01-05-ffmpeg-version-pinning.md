---
id: 06.01.05
status: todo
v1_0: yes
category: 06-utilities
topic: "06.01 ffmpeg recipe library"
title: "ffmpeg version pinning"
---

# 06.01.05 — ffmpeg version pinning

**v1.0:** yes

**Acceptance criteria:**
- `ralphy doctor` checks for ffmpeg >= a known good version (initial floor: 7.0).
- Recipes use only flags supported in that version (lint test).
- `install.sh` recommends/prompts the right install path per OS.
