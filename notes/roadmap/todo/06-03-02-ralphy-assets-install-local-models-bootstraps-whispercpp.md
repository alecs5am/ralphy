---
id: 06.03.02
status: todo
v1_0: yes
category: 06-utilities
topic: "06.03 Captions: cloud + local"
title: "ralphy assets install-local-models bootstraps whisper.cpp"
---

# 06.03.02 — `ralphy assets install-local-models` bootstraps whisper.cpp

**v1.0:** yes

**Acceptance criteria:**
- Verb downloads a configured whisper.cpp binary + the `large-v3-turbo` model (configurable via `--model`).
- Installs into `~/.ralphy/local-models/`.
- Idempotent.
- Sha256-verified.
