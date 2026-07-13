// Blueprint Zod schema (#074). A Blueprint is the per-unit, reproduction-grade
// recipe: a self-contained guide to reproduce ONE Unit end-to-end (from an empty
// project to the final deliverable), leaving zero open questions for a human or
// an agent. It mirrors the library-v2 `Blueprint` interface
// (`ralphy-web/lib/library-v2/types.ts`) member-for-member.
//
// SETTLED DECISIONS (do not redesign):
//   - LAYERS on top of the four block kinds (Template / Style / Recipe / Asset),
//     it does NOT replace them. Blocks stay the generic discovery vocabulary; a
//     Blueprint references the unit's blocks (via the unit's provenance) and adds
//     the full reproduction payload.
//   - Cardinality: Unit 1→1 Blueprint. Carries `unitId` (= `Unit.id`).
//
// The CLI keeps its own copy of the shared enums (no cross-package import), but
// the members MUST stay in lockstep with `ralphy-web/lib/library-v2/types.ts` — the
// same discipline `cli/lib/schemas/unit.ts` follows for `UNIT_FORMATS`.
//
// The shape is flat / JSON-serializable (no functions / symbols) so it can seed a
// `blueprints` DB table later. The DB table + the publish path are #077 — NOT
// implemented here.

import { z } from "zod";

/**
 * Pipeline stages a prompt or model-stack entry can target. Mirrors
 * `BlueprintStage` in `ralphy-web/lib/library-v2/types.ts` member-for-member.
 */
export const BLUEPRINT_STAGES = [
  "image",
  "i2v",
  "video",
  "vo",
  "music",
  "captions",
  "sfx",
] as const;
export type BlueprintStage = (typeof BLUEPRINT_STAGES)[number];

/**
 * Hard-asset kinds a Blueprint pins by file ref. Mirrors `BlueprintAssetKind`
 * in `ralphy-web/lib/library-v2/types.ts` member-for-member.
 */
export const BLUEPRINT_ASSET_KINDS = [
  "character",
  "location",
  "prop",
  "music",
  "ref",
  "master",
] as const;
export type BlueprintAssetKind = (typeof BLUEPRINT_ASSET_KINDS)[number];

/**
 * Concrete recipe / effect kinds. Mirrors `BlueprintRecipeKind` in
 * `ralphy-web/lib/library-v2/types.ts` member-for-member.
 */
export const BLUEPRINT_RECIPE_KINDS = [
  "ffmpeg",
  "encode",
  "overlay",
  "bake",
] as const;
export type BlueprintRecipeKind = (typeof BLUEPRINT_RECIPE_KINDS)[number];

/** Axis 1 — one row of the scenario / scene table. */
export const BlueprintSceneSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  durationSec: z.number().optional(),
  vo: z.string().optional(),
  sfx: z.array(z.string()).optional(),
  fork: z
    .object({
      label: z.string(),
      options: z.array(z.string()).optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

/** Axis 1 — scenario / scene table. `null` for scenario-less still projects. */
export const BlueprintScenarioSchema = z.object({
  scenes: z.array(BlueprintSceneSchema),
  storyboardMd: z.string().optional(),
});

/** Axis 2 — one per-stage prompt, VERBATIM, with `{{slots}}` noted. */
export const BlueprintPromptSchema = z.object({
  stage: z.enum(BLUEPRINT_STAGES),
  slot: z.string().optional(),
  model: z.string().optional(),
  text: z.string(),
  slots: z.array(z.string()).optional(),
});

/** Axis 3 — composition. `null` for non-HyperFrames outputs. */
export const BlueprintCompositionSchema = z.object({
  file: z.string().optional(),
  timing: z
    .object({
      A: z.array(z.number()).optional(),
      SEG: z.array(z.number()).optional(),
    })
    .optional(),
  components: z.array(z.string()).optional(),
  /**
   * Publish-time annotation (#077): a public Storage URL for the composition's
   * index.html, so `blueprint use` (#079) can pull it offline-less. Set by the
   * landing publish path, never by `ralphy blueprint create`.
   */
  storageUrl: z.string().optional(),
  /**
   * Publish-time annotation (#077): the composition's index.html inlined into
   * the mirror when it is small enough to commit. Lets `blueprint use` (#079)
   * write a real index.html with zero network. Set by the publish path.
   */
  html: z.string().optional(),
});

/** Axis 4 — one hard asset, pinned by file ref. */
export const BlueprintAssetSchema = z.object({
  slot: z.string().optional(),
  path: z.string(),
  kind: z.enum(BLUEPRINT_ASSET_KINDS),
  bytes: z.number().optional(),
  storageUrl: z.string().optional(),
});

/** Axis 5 — one model-stack entry: model + params + cost for a stage. */
export const BlueprintModelStackEntrySchema = z.object({
  stage: z.string(),
  model: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  voiceId: z.string().optional(),
  costUsd: z.number().optional(),
});

/** Axis 6 — one concrete recipe / effect with VALUES. */
export const BlueprintRecipeSchema = z.object({
  name: z.string(),
  kind: z.enum(BLUEPRINT_RECIPE_KINDS),
  command: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Blueprint — the per-unit, reproduction-grade recipe (#074). Optional / additive
 * fields are `.optional()` so older payloads still validate (mirrors unit.ts's
 * additive discipline). `scenario` and `composition` are nullable (scenario-less
 * still projects / non-HyperFrames outputs, #062).
 */
export const BlueprintSchema = z.object({
  unitId: z.string(),
  schemaVersion: z.number(),
  scenario: BlueprintScenarioSchema.nullable(),
  prompts: z.array(BlueprintPromptSchema),
  composition: BlueprintCompositionSchema.nullable(),
  assets: z.array(BlueprintAssetSchema),
  modelStack: z.array(BlueprintModelStackEntrySchema),
  recipes: z.array(BlueprintRecipeSchema),
  costRollupUsd: z.number().optional(),
  createdAt: z.string().optional(),
  notes: z.string().optional(),
  /**
   * Publish-time annotation (#077): hard-asset payload files that exceeded the
   * Storage size cap and were recorded by-ref instead of uploaded. Set by the
   * landing publish path, never by `ralphy blueprint create`. Kept here so the
   * CLI schema stays in lockstep with the library-v2 `Blueprint` type.
   */
  oversizeSkipped: z.array(z.string()).optional(),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;
