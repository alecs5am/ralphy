// Typed Hook / Body / CTA primitive (02.08.01). Re-exports the `SceneRef`
// pointer + provides the `HookBodyCta` triple used by `ralphy batch --vary
// <axis>` so variation engines can swap one axis cleanly without dragging the
// rest of the scenario.
//
// References:
//   roadmap/02-prompts-and-templates/SPEC.md#02-08

import { z } from "zod";
import { SceneRefSchema } from "./scene.js";

export const VARY_AXES = ["hook", "body", "cta", "persona"] as const;
export type VaryAxis = (typeof VARY_AXES)[number];

/**
 * Hook + body + CTA as a self-contained triple. Used by the batch variation
 * engine to express "keep body + CTA, swap N hooks" without touching the
 * surrounding scenario fields.
 */
export const HookBodyCtaSchema = z.object({
  hook: SceneRefSchema,
  body: z.array(SceneRefSchema),
  cta: SceneRefSchema,
});

export type HookBodyCta = z.infer<typeof HookBodyCtaSchema>;

/**
 * Returns the subset of fields that should change when varying a single axis.
 * Helper used by `ralphy batch --vary <axis>` so callers don't have to
 * hard-code axis → field mappings.
 */
export function fieldsForAxis(axis: VaryAxis): readonly string[] {
  switch (axis) {
    case "hook":
      return ["hook"];
    case "cta":
      return ["cta"];
    case "body":
      return ["body"];
    case "persona":
      return ["persona_slug"];
  }
}

export function isVaryAxis(value: unknown): value is VaryAxis {
  return typeof value === "string" && (VARY_AXES as readonly string[]).includes(value);
}
