---
id: 06.03.01
status: todo
v1_0: yes
category: 06-utilities
topic: "06.03 Captions: cloud + local"
title: "RALPHY_CAPTION_BACKEND=cloud|local switch"
---

# 06.03.01 — `RALPHY_CAPTION_BACKEND=cloud|local` switch

**v1.0:** yes

**Acceptance criteria:**
- Env var (or `--backend` flag) routes captioning. Default `cloud`.
- `local` requires whisper.cpp + a model checkpoint installed; `ralphy doctor` reports presence.
- Both backends produce identical output schema (`captions.json` → `Caption[]`).
