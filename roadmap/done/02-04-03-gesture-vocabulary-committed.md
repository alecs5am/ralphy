---
id: 02.04.03
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.04 Structured `scenes[]` in scenario.json"
title: "Gesture vocabulary committed"
---

# 02.04.03 — Gesture vocabulary committed

**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/schemas/gestures.ts` exports a 12-entry `GESTURES` const (`point-camera`, `nod`, `head-shake`, `laugh`, `shrug`, `lean-in`, `hand-product-reveal`, `eye-roll`, `facepalm`, `thumbs-up`, `palm-open`, `pause-still`) with one-line semantic definitions in `GESTURE_DEFS`. `gestureToProse()` is consumed by the per-model adapters; unknown values return `null` so adapters silently omit the directive per D-06. Tests at `tests/unit/schemas-scene.test.ts`.

**Acceptance criteria:**
- `cli/lib/schemas/gestures.ts` exports an enum of 10-12 named gestures per [D-06](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log) — starting set: `["point-camera", "nod", "laugh", "shrug", "lean-in", "hand-product-reveal", "eye-roll", "facepalm", "thumbs-up", "head-shake", "palm-open", "pause-still"]`. Each has a one-line semantic definition in the source file.
- Scene `gesture` field constrained to this enum.
- Niche / one-off gesture intent goes into `Scene.notes` (per [D-01](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log)) — adapters read both.
- Per-model adapter translates the enum gesture into the model's natural language ("a slow lean-in toward the camera" for Veo, "[Speaker, leaning in]:" for Kling); unknown enum values are silently omitted, never error.
