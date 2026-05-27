---
id: 11.02.01
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.02 Golden renders"
title: "Golden fixture per template"
---

# 11.02.01 — Golden fixture per template

**v1.0:** yes

**Acceptance criteria:**
- For each template in `templates/TOP.md`:
  - A canonical project fixture (committed to `tests/golden/<template>/`).
  - Cached gen outputs (committed images + videos + VO + music) so no API calls happen at test time.
  - Expected mp4 properties: duration ±0.1s, resolution exact, audio LUFS within ±1.0, video bitrate within ±10%.
  - Expected first-frame perceptual hash within ε.
