// Workspace-scoped Run (campaign) manifest schema (#480).
//
// A Run is the user's mental object for ONE content-farm campaign: a single
// strategic brief that may spawn many projects and many Units across a
// workspace. It binds those member projects under one roof so a fresh agent can
// answer "what is this farm producing, what shipped, what's blocked, what cost
// money, what's next" without reconstructing state from scattered projects.
//
// EVERYTHING here is a REFERENCE, never a copy — workflow name, project ids,
// batch id, strategy/intelligence-pack paths, Unit ids. The manifest holds
// pointers; the artifacts stay where the per-project pipeline already wrote
// them. Storage: `.ralphy/workspaces/<ws>/runs/<run-id>/run.json` (the manifest)
// + an append-only `run-events.jsonl` in the same dir (the history).
//
// Schema style mirrors cli/lib/schemas/{workflow,scorecard}.ts: a Zod object
// with inline-doc comments, exported z.infer types, sane .default()s, and a
// parseRun(). Paths are stored as opaque strings — the schema does NOT read or
// validate their on-disk existence (a run may reference a path that hasn't
// landed yet). English-only-on-disk.

import { z } from "zod";

/**
 * Run status:
 *   • active   — the campaign is in flight (the default).
 *   • complete — every intended Unit has shipped.
 *   • archived — wound down / retired, kept for the record.
 */
export const RunStatusSchema = z.enum(["active", "complete", "archived"]);
export type RunStatusValue = z.infer<typeof RunStatusSchema>;

export const RunManifestSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** Stable run id (the runs/<run-id>/ dir basename). */
  id: z.string(),
  /** The workspace this run lives under. */
  workspace: z.string(),
  /** Human-readable campaign title. */
  title: z.string(),
  /** The one strategic brief that drives the campaign (optional). */
  brief: z.string().optional(),
  /** Lifecycle status. */
  status: RunStatusSchema.default("active"),
  /** ISO timestamp the run was created. */
  createdAt: z.string().default(() => new Date().toISOString()),

  // ── References (pointers, never copies) ──────────────────────────────────
  /** The workspace workflow (cli/lib/workflow.ts) the run executes, by name. */
  workflow: z.string().optional(),
  /** Member project ids — the projects this campaign spawned. */
  projectIds: z.array(z.string()).default([]),
  /** A bound batch id (the `ralphy batch` that fanned the campaign out). */
  batchId: z.string().optional(),
  /** Project- or workspace-relative path to the creative-strategy doc (opaque string). */
  strategyPath: z.string().optional(),
  /** Project- or workspace-relative path to the intelligence pack / research distillate (opaque string). */
  intelligencePackPath: z.string().optional(),
  /** Packaged Unit ids the campaign produced. */
  unitIds: z.array(z.string()).optional(),
});
export type RunManifest = z.infer<typeof RunManifestSchema>;

/** The manifest filename inside a run dir. */
export const RUN_MANIFEST_ARTIFACT = "run.json" as const;
/** The append-only event-log filename inside a run dir. */
export const RUN_EVENTS_ARTIFACT = "run-events.jsonl" as const;

/**
 * Parse + validate an unknown value into a RunManifest. Throws a ZodError on a
 * malformed object. Callers mapping onto `E_FILE_MALFORMED` / `E_VALIDATION_FAILED`
 * should catch and pass `error.message` as `detail`.
 */
export function parseRun(raw: unknown): RunManifest {
  return RunManifestSchema.parse(raw);
}
