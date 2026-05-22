---
id: 02.04.01
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.04 Structured `scenes[]` in scenario.json"
title: "Scenario schema"
---

# 02.04.01 — Scenario schema

**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/schemas/scene.ts` exports `SceneSchema` + `SceneRefSchema` + `ScenarioSchema` (Zod) + `parseScenario()` which cross-validates that every SceneRef points at a key in the scenes{} map. Scene shape matches D-01 (`id`, `role`, `vo_text`, `target_duration_s`, `camera`, `lighting?`, `gesture?`, `broll?`, `refs: string[]`, `notes?`). Tests at `tests/unit/schemas-scene.test.ts`.

**Acceptance criteria:**
- `scenario.json` schema: `{ project_id, brand_slug, persona_slug, target_duration_s, hook: SceneRef, body: SceneRef[], cta: SceneRef, scenes: { [id]: Scene } }`.
- `Scene` = `{ id, role: "hook"|"body"|"cta", vo_text, target_duration_s, camera, lighting?, gesture?, broll?, refs: string[], notes?: string }` per [D-01](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log). `notes` is a free-text catch-all for nuance the schema can't express; the art-director appends it as a "director intent" paragraph to the model-specific prompt body.
- Zod schema in `cli/lib/schemas/scenario.ts`; validated by `ralphy project validate`.
- `refs` is a flat `string[]` for v1.0 per [D-02](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log); the 3-slot `{ cref, sref, pref }` shape lands post-launch (`02.09.05`).
