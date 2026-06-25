// Safe Studio config-patch schema + field allowlist (#491).
//
// Studio lets the user propose a bounded set of run/workflow config changes
// (batch size, variant count, budget cap, destination on/off, template choice,
// model preference, gate strictness, approval mode, publish target). A proposal
// is written as an append-only event under the run (config-events.jsonl); the
// agent (or `ralphy studio patch`) validates + applies it through this schema.
//
// SAFE by construction: there is NO arbitrary field. A value must parse against
// the field's schema before a patch can be marked applicable — so Studio can
// never propose an invalid or out-of-allowlist change. Patches are metadata,
// never media. Schema style mirrors cli/lib/schemas/run.ts.

import { z } from "zod";

/** Per-field value schema + metadata. The map IS the allowlist — no field here,
 *  no patch. Validators reuse the same constraints the rest of the CLI enforces
 *  (non-negative cap like `run approve`, 1..10 variants like a workflow step). */
export const CONFIG_PATCH_FIELDS = {
  batchSize: { label: "Batch size", requiresTarget: false, schema: z.number().int().min(1).max(200) },
  variantCount: { label: "Variant count", requiresTarget: false, schema: z.number().int().min(1).max(10) },
  budgetCapUsd: { label: "Budget cap (USD)", requiresTarget: false, schema: z.number().min(0) },
  destinationEnabled: { label: "Destination enabled", requiresTarget: true, schema: z.boolean() },
  templateChoice: { label: "Template choice", requiresTarget: false, schema: z.string().min(1) },
  modelPreference: { label: "Model preference", requiresTarget: false, schema: z.string().min(1) },
  gateStrictness: { label: "Gate strictness", requiresTarget: false, schema: z.enum(["strict", "normal", "lenient", "off"]) },
  approvalMode: { label: "Approval mode", requiresTarget: false, schema: z.enum(["auto", "approve"]) },
  publishTarget: { label: "Publish target", requiresTarget: false, schema: z.string().min(1) },
} as const;

export type ConfigPatchField = keyof typeof CONFIG_PATCH_FIELDS;
export const CONFIG_PATCH_FIELD_NAMES = Object.keys(CONFIG_PATCH_FIELDS) as ConfigPatchField[];

/** Validate a field + value (+ target where required) against the allowlist. */
export function validateConfigPatchValue(
  field: string,
  value: unknown,
  target?: string | null,
): { ok: true } | { ok: false; error: string } {
  if (!(field in CONFIG_PATCH_FIELDS)) return { ok: false, error: `unknown field: ${field} (not in the allowlist)` };
  const def = CONFIG_PATCH_FIELDS[field as ConfigPatchField];
  if (def.requiresTarget && (typeof target !== "string" || !target)) {
    return { ok: false, error: `field "${field}" requires a target` };
  }
  const parsed = def.schema.safeParse(value);
  if (!parsed.success) return { ok: false, error: `invalid value for "${field}": ${parsed.error.issues[0]?.message ?? "validation failed"}` };
  return { ok: true };
}

/** The persisted "propose" event (carries the full patch). */
export const ConfigPatchSchema = z.object({
  version: z.literal(1).default(1),
  kind: z.literal("config-patch").default("config-patch"),
  /** Patch id == the basename in config-events ("propose" line). */
  id: z.string(),
  /** An allowlisted field name. */
  field: z.string(),
  /** The proposed value (type depends on the field). */
  value: z.unknown(),
  /** A target when the field needs one (e.g. which destination). */
  target: z.string().nullable().default(null),
  /** Optional free-text rationale. */
  note: z.string().default(""),
  /** ISO timestamp the patch was proposed. */
  proposedAt: z.string().default(() => new Date().toISOString()),
});
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>;

/** The lifecycle state of a folded patch. */
export type ConfigPatchState = "pending" | "applied" | "rejected";

/** Append-only event filename under a run dir. */
export const CONFIG_EVENTS_ARTIFACT = "config-events.jsonl" as const;

export function parseConfigPatch(raw: unknown): ConfigPatch {
  return ConfigPatchSchema.parse(raw);
}
