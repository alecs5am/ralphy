// Scene + Scenario Zod schemas — the structured contract the scenarist
// emits and the art-director / editor consume. Per [02-D-01]:
//   • Scene is a struct with a free-text `notes` escape hatch for the 5% the
//     enum/struct can't capture.
//   • `refs: string[]` (flat list) for v1.0 per [02-D-02]; the 3-slot
//     `{cref,sref,pref}` shape lands post-launch (02.09.05).
//   • `gesture?` constrained to the finite enum in `gestures.ts` per [02-D-06];
//     niche moves go in `notes`.
//
// References:
//   roadmap/02-prompts-and-templates/SPEC.md#02-04
//   roadmap/02-prompts-and-templates/OPEN-QUESTIONS.md#d-01
//   roadmap/02-prompts-and-templates/OPEN-QUESTIONS.md#d-06

import { z } from "zod";
import { GESTURES } from "./gestures.js";

export const SCENE_ROLES = ["hook", "body", "cta"] as const;
export type SceneRole = (typeof SCENE_ROLES)[number];

/** A single scene as authored by the scenarist LLM. */
export const SceneSchema = z.object({
  /** Scene id — `scene-NN` convention (two-digit zero-padded). */
  id: z
    .string()
    .regex(/^scene-\d{2,3}$/u, "scene id must look like `scene-01`, `scene-02`, …"),
  /** Narrative role; drives downstream tooling (hook/CTA renderers, A/B variation). */
  role: z.enum(SCENE_ROLES),
  /** Spoken line for this scene. Empty string is legal for B-roll / silent inserts. */
  vo_text: z.string().default(""),
  /** Target on-screen duration in seconds. */
  target_duration_s: z.number().positive().max(120),
  /** One-line camera direction (e.g. "selfie 35mm, eye-level, hand-held"). */
  camera: z.string().min(1, "camera direction is required"),
  /** Optional lighting note. */
  lighting: z.string().optional(),
  /** Optional gesture from the canonical enum. Adapters silently omit unknown values. */
  gesture: z.enum(GESTURES).optional(),
  /** Optional B-roll cue ("hand reaches for the bottle on shelf"). */
  broll: z.string().optional(),
  /** Reference asset slugs / paths. Flat string list for v1.0. */
  refs: z.array(z.string()).default([]),
  /**
   * Free-text catch-all for nuance the schema can't express. Per [D-01], this
   * is the controlled escape hatch — not a dumping ground. Adapters append it
   * as a "director intent" paragraph to the model-specific prompt body.
   */
  notes: z.string().optional(),
});

export type Scene = z.infer<typeof SceneSchema>;

/** Lightweight pointer to a Scene id with the canonical fields denormalized. */
export const SceneRefSchema = z.object({
  scene_id: z.string().regex(/^scene-\d{2,3}$/u),
  vo: z.string().default(""),
  duration_s: z.number().positive().max(120),
});

export type SceneRef = z.infer<typeof SceneRefSchema>;

/** Top-level scenario shape consumed by the art-director and editor. */
export const ScenarioSchema = z.object({
  project_id: z.string().min(1),
  brand_slug: z.string().optional(),
  persona_slug: z.string().optional(),
  target_duration_s: z.number().positive().max(600),
  /** Hook scene pointer (scene-01 by convention). */
  hook: SceneRefSchema,
  /** Body scenes in playback order. */
  body: z.array(SceneRefSchema),
  /** CTA scene pointer (last scene by convention). */
  cta: SceneRefSchema,
  /** Map keyed by Scene.id. The CLI validator cross-checks that every ref points to a real key. */
  scenes: z.record(z.string(), SceneSchema),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

/**
 * Parse + cross-validate a scenario. Returns the parsed value or throws a
 * ZodError. Callers that want to map this onto `E_VALIDATION_FAILED` should
 * catch and pass `error.message` as `detail`.
 */
export function parseScenario(input: unknown): Scenario {
  const parsed = ScenarioSchema.parse(input);
  // Cross-check: every SceneRef.scene_id must exist in scenes{}.
  const known = new Set(Object.keys(parsed.scenes));
  const missing: string[] = [];
  if (!known.has(parsed.hook.scene_id)) missing.push(`hook → ${parsed.hook.scene_id}`);
  for (const b of parsed.body) {
    if (!known.has(b.scene_id)) missing.push(`body → ${b.scene_id}`);
  }
  if (!known.has(parsed.cta.scene_id)) missing.push(`cta → ${parsed.cta.scene_id}`);
  if (missing.length > 0) {
    throw new Error(`scenario references unknown scene ids: ${missing.join(", ")}`);
  }
  return parsed;
}
