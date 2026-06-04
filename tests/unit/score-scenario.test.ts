// Locks the scenario score gate against schema drift between the canonical
// record-shaped `scenes` (per cli/lib/schemas/scene.ts → ScenarioSchema) and
// the legacy array shape that older fixtures still use.
//
// Origin: notes/issues/done/046-project-score-schema-drift.md — `ralphy project
// score` used to crash with "(scenario.scenes ?? []).reduce is not a function"
// on every scenario that conforms to the actual schema.

import { describe, test, expect } from "bun:test";
import { scoreScenario, type Scenario } from "../../cli/lib/score.ts";

const CANONICAL_RECORD_SCENARIO = {
  project_id: "demo-001",
  target_duration_s: 15,
  angle: "testimonial",
  hook: { scene_id: "scene-01", vo: "watch this", duration_s: 3 },
  body: [{ scene_id: "scene-02", vo: "see how it works", duration_s: 9 }],
  cta: { scene_id: "scene-03", vo: "buy now", duration_s: 3 },
  scenes: {
    "scene-01": {
      id: "scene-01",
      role: "hook",
      vo_text: "watch this",
      target_duration_s: 3,
      camera: "selfie 35mm, eye-level",
      refs: [],
    },
    "scene-02": {
      id: "scene-02",
      role: "body",
      vo_text: "see how it works",
      target_duration_s: 9,
      camera: "selfie 35mm",
      refs: [],
    },
    "scene-03": {
      id: "scene-03",
      role: "cta",
      vo_text: "buy now",
      target_duration_s: 3,
      camera: "selfie 35mm",
      refs: [],
    },
  },
} as unknown as Scenario;

const LEGACY_ARRAY_SCENARIO: Scenario = {
  duration: 15,
  angle: "testimonial",
  hook: "watch this",
  scenes: [
    { id: "scene-01", durationSec: 3 },
    { id: "scene-02", durationSec: 9 },
    { id: "scene-03", durationSec: 3 },
  ],
};

describe("scoreScenario — scenes shape (#046)", () => {
  test("accepts canonical record-shaped scenes without crashing", () => {
    // Regression: pre-fix this threw "(scenario.scenes ?? []).reduce is not a function".
    const result = scoreScenario(CANONICAL_RECORD_SCENARIO);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("still accepts legacy array-shaped scenes", () => {
    const result = scoreScenario(LEGACY_ARRAY_SCENARIO);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("emits a deprecation warning on legacy array-shaped scenes", () => {
    const result = scoreScenario(LEGACY_ARRAY_SCENARIO);
    expect(
      result.warnings.some((w) => /legacy shape|array.*scene/iu.test(w)),
    ).toBe(true);
  });

  test("does NOT warn about shape when scenes is a record", () => {
    const result = scoreScenario(CANONICAL_RECORD_SCENARIO);
    expect(
      result.warnings.some((w) => /legacy shape|array.*scene/iu.test(w)),
    ).toBe(false);
  });

  test("derives duration from canonical target_duration_s on each scene", () => {
    // Caps + hook-window logic must read target_duration_s, not durationSec,
    // when scenes are record-shaped per ScenarioSchema.
    const overlong: any = {
      ...CANONICAL_RECORD_SCENARIO,
      target_duration_s: 6,
      scenes: {
        "scene-01": {
          id: "scene-01",
          role: "hook",
          vo_text: "x",
          target_duration_s: 5, // > short-ad firstSceneMax (3)
          camera: "selfie",
          refs: [],
        },
      },
    };
    const result = scoreScenario(overlong);
    expect(result.passed).toBe(false);
    expect(
      result.failures.some((f) => /first scene is 5s/iu.test(f)),
    ).toBe(true);
  });

  test("accepts canonical SceneRef-shaped hook (no .primary key)", () => {
    // Canonical hook is a SceneRef {scene_id, vo, duration_s}. Legacy code
    // expected scenario.hook.primary; pre-fix this would mis-report "Missing
    // hook.primary" even though the canonical hook line is present.
    const result = scoreScenario(CANONICAL_RECORD_SCENARIO);
    expect(
      result.failures.some((f) => /missing hook\.primary/iu.test(f)),
    ).toBe(false);
  });

  test("handles missing scenes gracefully on both shapes", () => {
    const noScenes: any = { target_duration_s: 15, hook: "x" };
    const result = scoreScenario(noScenes);
    expect(result.failures).toContain("Scenario has no scenes[]");
  });
});
