import { describe, test, expect } from "bun:test";
import {
  HookBodyCtaSchema,
  fieldsForAxis,
  isVaryAxis,
  VARY_AXES,
} from "../../cli/lib/schemas/hook-body-cta.ts";

describe("Hook/Body/CTA primitive (02.08.01)", () => {
  test("accepts a typical triple", () => {
    const ok = HookBodyCtaSchema.safeParse({
      hook: { scene_id: "scene-01", vo: "watch this", duration_s: 3 },
      body: [{ scene_id: "scene-02", vo: "here's the proof", duration_s: 9 }],
      cta: { scene_id: "scene-03", vo: "tap the link", duration_s: 3 },
    });
    expect(ok.success).toBe(true);
  });

  test("rejects missing body array", () => {
    const bad = HookBodyCtaSchema.safeParse({
      hook: { scene_id: "scene-01", vo: "x", duration_s: 3 },
      cta: { scene_id: "scene-03", vo: "x", duration_s: 3 },
    });
    expect(bad.success).toBe(false);
  });

  test("VARY_AXES covers hook + body + cta + persona", () => {
    expect(VARY_AXES).toContain("hook");
    expect(VARY_AXES).toContain("body");
    expect(VARY_AXES).toContain("cta");
    expect(VARY_AXES).toContain("persona");
  });

  test("fieldsForAxis returns the field name for each axis", () => {
    expect(fieldsForAxis("hook")).toContain("hook");
    expect(fieldsForAxis("cta")).toContain("cta");
    expect(fieldsForAxis("body")).toContain("body");
    expect(fieldsForAxis("persona")).toContain("persona_slug");
  });

  test("isVaryAxis recognizes canon", () => {
    expect(isVaryAxis("hook")).toBe(true);
    expect(isVaryAxis("nope")).toBe(false);
  });
});
