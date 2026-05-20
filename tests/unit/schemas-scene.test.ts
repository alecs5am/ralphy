import { describe, test, expect } from "bun:test";
import { ScenarioSchema, SceneSchema, parseScenario } from "../../cli/lib/schemas/scene.ts";
import { GESTURES, isGesture, gestureToProse } from "../../cli/lib/schemas/gestures.ts";

describe("Scene + Scenario schemas (02.04.01)", () => {
  test("accepts a valid scene", () => {
    const ok = SceneSchema.safeParse({
      id: "scene-01",
      role: "hook",
      vo_text: "watch this",
      target_duration_s: 3,
      camera: "selfie 35mm, eye-level",
      gesture: "lean-in",
      refs: ["master/character.png"],
    });
    expect(ok.success).toBe(true);
  });

  test("rejects a scene with malformed id", () => {
    const bad = SceneSchema.safeParse({
      id: "scene1",
      role: "hook",
      target_duration_s: 3,
      camera: "selfie",
    });
    expect(bad.success).toBe(false);
  });

  test("rejects a scene with unknown gesture (Zod-level)", () => {
    const bad = SceneSchema.safeParse({
      id: "scene-01",
      role: "hook",
      target_duration_s: 3,
      camera: "selfie",
      gesture: "moonwalk",
    });
    expect(bad.success).toBe(false);
  });

  test("rejects scene with non-positive duration", () => {
    const bad = SceneSchema.safeParse({
      id: "scene-01",
      role: "hook",
      target_duration_s: 0,
      camera: "selfie",
    });
    expect(bad.success).toBe(false);
  });

  test("parseScenario passes with consistent refs", () => {
    const sc = parseScenario({
      project_id: "demo-001",
      target_duration_s: 15,
      hook: { scene_id: "scene-01", vo: "hi", duration_s: 3 },
      body: [{ scene_id: "scene-02", vo: "watch", duration_s: 9 }],
      cta: { scene_id: "scene-03", vo: "buy", duration_s: 3 },
      scenes: {
        "scene-01": { id: "scene-01", role: "hook", target_duration_s: 3, camera: "x", refs: [] },
        "scene-02": { id: "scene-02", role: "body", target_duration_s: 9, camera: "x", refs: [] },
        "scene-03": { id: "scene-03", role: "cta", target_duration_s: 3, camera: "x", refs: [] },
      },
    });
    expect(Object.keys(sc.scenes)).toHaveLength(3);
  });

  test("parseScenario throws on dangling SceneRef", () => {
    expect(() =>
      parseScenario({
        project_id: "demo-001",
        target_duration_s: 6,
        hook: { scene_id: "scene-99", vo: "hi", duration_s: 3 },
        body: [],
        cta: { scene_id: "scene-01", vo: "buy", duration_s: 3 },
        scenes: {
          "scene-01": { id: "scene-01", role: "cta", target_duration_s: 3, camera: "x", refs: [] },
        },
      }),
    ).toThrow(/unknown scene ids/u);
  });
});

describe("Gesture vocabulary (02.04.03)", () => {
  test("enum has at least 10 entries with definitions", () => {
    expect(GESTURES.length).toBeGreaterThanOrEqual(10);
    expect(GESTURES.length).toBeLessThanOrEqual(15);
  });

  test("isGesture recognizes canon, rejects junk", () => {
    expect(isGesture("nod")).toBe(true);
    expect(isGesture("moonwalk")).toBe(false);
    expect(isGesture(null)).toBe(false);
  });

  test("gestureToProse returns null for unknown values (D-06 silent omit)", () => {
    expect(gestureToProse("moonwalk")).toBeNull();
    expect(gestureToProse(undefined)).toBeNull();
    expect(gestureToProse("nod")).toContain("downward head tilt");
  });
});
