---
id: 02.01.02
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.01 Per-model prompt formula (secondary shaping layer)"
title: "Kling adapter injects bracketed dialogue"
---

# 02.01.02 — Kling adapter injects bracketed dialogue

**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/providers/prompt-adapter/kling.ts` emits Scene → Character → Shot → Motion → Dialogue → Progression in order, formats dialogue as `[<Speaker>, <tone>]: "<line>"` (defaults tone to neutral), always appends `"no background music, SFX only"` to the Progression block per `feedback_kling_no_music_eleven_music_postmix`. Documented at `docs/prompts/video/kling.md`. Exact-string test in `tests/unit/prompt-adapter.test.ts`.

**Acceptance criteria:**
- When the model is `kwaivgi/kling-v3.0-pro` / `-std` / `-o1` and `dialogue` is set, the adapter formats as `[<Speaker>, <tone>]: "<line>"`.
- Tone defaults to `neutral` if persona doesn't specify.
- Output assembled in Kling's `Scene → Character → Shot → Motion → Dialogue → Progression` order.
- Documented in `docs/prompts/video/kling.md`.
