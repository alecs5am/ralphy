---
id: 06.02.01
status: doing
v1_0: yes
category: 06-utilities
topic: "06.02 Smart-crop"
title: "ralphy video smart-crop uses face + saliency"
---

# 06.02.01 — `ralphy video smart-crop` uses face + saliency

**v1.0:** yes

**Acceptance criteria:**
- Default backend: ffmpeg `cropdetect` + a face-tracker (`vidstab` + a lightweight face model bundled, see Q-01).
- `--aspect <ratio>` (`9:16` default).
- `--track face|saliency|center` chooses the strategy.
- Output passes the green-zone check on the TOP-5 templates ([`08.02.x`](../08-quality-and-evaluation/)).
