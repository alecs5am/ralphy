---
id: 10.02.04
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.02 Cost-from-OpenRouter"
title: "ElevenLabs cost"
---

# 10.02.04 — ElevenLabs cost

**v1.0:** yes

**Acceptance criteria:**
- ElevenLabs API returns character usage; we map to USD via subscription tier in `cli/lib/pricing/elevenlabs.ts`.
- User configures their tier in `~/.ralphy/config.json`; default "starter".
- Documented limitations (subscription-based, not per-call).
