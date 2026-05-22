---
id: 02.03.02
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.03 Cookbook expansion"
title: "Voice cookbook"
---

# 02.03.02 — Voice cookbook

**v1.0:** yes

**Implementation (2026-05-20):** `docs/prompts/voice/{deadpan-rant,hype-hook,intimate-reveal,sarcastic-aside,calm-narration}.md`. Each has ElevenLabs voice_settings (stability / similarity_boost / style / use_speaker_boost) tuned per mode + 3-sentence sample VO + pacing target. Index at `docs/prompts/voice/README.md`. Discoverable via `ralphy prompts modes --kind voice`.

**Acceptance criteria:**
- `docs/prompts/voice/` with modes: deadpan-rant, hype-hook, intimate-reveal, sarcastic-aside, calm-narration.
- ElevenLabs voice_settings (stability, similarity_boost, style) tuned per mode.
- Each mode has a 3-sentence sample VO + ElevenLabs param table.
