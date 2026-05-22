---
id: 01.04.02
status: doing
v1_0: yes
category: 01-cli
topic: "01.04 Setup, status, doctor"
title: "ralphy setup interactive wizard verifies each step"
---

# 01.04.02 — `ralphy setup` interactive wizard verifies each step

**v1.0:** yes

**Acceptance criteria:**
- TUI wizard validates each API key with a real call (cheap probe — image-list for OpenRouter, voice-list for ElevenLabs) before saving.
- On failure, shows the actual error and offers retry / skip / abort.
- Wizard never silently accepts an unverified key — `--allow-unverified` must be explicit.
- Ends with a `ralphy doctor` run inline.
