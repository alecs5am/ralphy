---
id: 02.01.04
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.01 Per-model prompt formula (secondary shaping layer)"
title: "Veo adapter applies its 7-part skeleton"
---

# 02.01.04 — Veo adapter applies its 7-part skeleton

**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/providers/prompt-adapter/veo.ts` emits Shot → Style → Lighting → Character → Location → Action → Dialogue in order. Documented at `docs/prompts/video/veo.md`.

**Acceptance criteria:**
- Order: `Shot framing & motion → Style → Lighting → Character → Location → Action → Dialogue`.
- Documented in `docs/prompts/video/veo.md`.
