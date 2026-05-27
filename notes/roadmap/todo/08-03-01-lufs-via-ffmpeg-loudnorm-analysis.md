---
id: 08.03.01
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.03 Deterministic assertions"
title: "LUFS via ffmpeg loudnorm analysis"
---

# 08.03.01 — LUFS via ffmpeg loudnorm analysis

**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/eval/assertions/deterministic.ts` exposes `assertLufs(path, target, tolerance)`.
- Uses ffmpeg's loudnorm pass-1 to get integrated LUFS.
- Default target -14 LUFS (TikTok/Reels), tolerance ±2.
