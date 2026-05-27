---
id: 02.08.01
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.08 Hook / Body / CTA primitive"
title: "Schema field in Scene + Scenario"
---

# 02.08.01 — Schema field in Scene + Scenario

**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/schemas/scene.ts` `ScenarioSchema` carries the typed `hook: SceneRef` + `body: SceneRef[]` + `cta: SceneRef` triple. `cli/lib/schemas/hook-body-cta.ts` exports the standalone `HookBodyCtaSchema` + `VARY_AXES` + `fieldsForAxis()` helper consumed by the batch-variation engine. Cross-validation in `parseScenario()` rejects scenarios that name a SceneRef pointing at an unknown scene id. Tests at `tests/unit/schemas-hook-body-cta.test.ts` + `tests/unit/schemas-scene.test.ts`.

**Acceptance criteria:**
- Scenario top-level: `hook: { scene_id, vo, duration_s }`, `cta: { scene_id, vo, duration_s }`, `body: SceneRef[]`.
- Validated at `ralphy project validate`.
