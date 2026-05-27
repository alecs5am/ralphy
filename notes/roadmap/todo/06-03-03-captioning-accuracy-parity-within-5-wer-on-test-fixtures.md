---
id: 06.03.03
status: todo
v1_0: yes
category: 06-utilities
topic: "06.03 Captions: cloud + local"
title: "Captioning accuracy parity within ±5% WER on test fixtures"
---

# 06.03.03 — Captioning accuracy parity within ±5% WER on test fixtures

**v1.0:** yes

**Acceptance criteria:**
- Test fixture: 10 clips with hand-labeled captions.
- Cloud whisper-1 WER and local whisper.cpp WER both within ±5% of the gold transcript.
- Test runs in CI on a runner with the local model installed.
