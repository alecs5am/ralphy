---
id: 06.04.01
status: todo
v1_0: yes
category: 06-utilities
topic: "06.04 Probe verbs"
title: "ralphy video probe <path>"
---

# 06.04.01 — `ralphy video probe <path>`

**v1.0:** yes

**Acceptance criteria:**
- Output: `{ duration_s, width, height, fps, codec, has_audio, audio_channels, bitrate, container }`.
- Works on any container ffprobe supports.
- Fails with code `E_PROBE_INVALID` on corrupt input.
