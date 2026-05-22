---
id: 06.04.02
status: todo
v1_0: yes
category: 06-utilities
topic: "06.04 Probe verbs"
title: "ralphy audio probe <path>"
---

# 06.04.02 — `ralphy audio probe <path>`

**v1.0:** yes

**Acceptance criteria:**
- Output: `{ duration_s, sample_rate, channels, codec, lufs_integrated, peak_dbfs }`.
- LUFS measured via ffmpeg `loudnorm` analysis pass.
