---
id: 06.01.04
status: todo
v1_0: yes
category: 06-utilities
topic: "06.01 ffmpeg recipe library"
title: "Recipe tests use a 1-second fixture"
---

# 06.01.04 — Recipe tests use a 1-second fixture

**v1.0:** yes

**Acceptance criteria:**
- `tests/fixtures/utilities/1s-portrait.mp4` (a deterministic 1s 9:16 1080×1920 clip with audio) is the input for every recipe test.
- Tests assert duration, codec, resolution, channel count of the output.
- Test wall-time per recipe < 2s.
