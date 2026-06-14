// RepairPlan Zod schema — the deterministic eval-to-repair ledger (#409).
//
// `ralphy eval video` produces `eval.json` (findings[] + scoring.verdict) and,
// with deep vision, `eval-deep-vision.json` (parsed.what_to_redo). The fixer
// agent reads those, but needs a single ORDERED, OWNER-CLASSIFIED plan it can
// present and gate on before any paid regeneration. That plan is this schema.
//
// This is the machine-readable half of the contract's phase-12 "repair" step
// (`docs/playbooks/agent-production-contract.md` + `cli/lib/contract.ts →
// CONTRACT_PHASES`). `ralphy project repair-plan <id>` writes both:
//   • `<project>/REPAIR_PLAN.md`   — human-readable (what the user reviews).
//   • `<project>/repair-plan.json` — the validated object (this schema).
//
// Design notes:
//  - DETERMINISTIC: every field is derived from the eval output with NO LLM
//    call. Owner classification (`classifyFindingOwner`), priority ranking, and
//    cost/risk heuristics all live in `cli/lib/repair.ts` and are pure.
//  - APPROVAL is never auto-granted: every item ships `approvalState: "pending"`
//    so the fixer's hard gate (no paid call before user 'go') is structural, not
//    just prose in the skill.
//  - Schema style mirrors `cli/lib/schemas/{production-plan,scene,unit}.ts`: Zod
//    object, exported type via `z.infer`, sane defaults so a partial source
//    still parses.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Which role owns the fix. Deterministic map in `classifyFindingOwner`. */
export const RepairOwnerSchema = z.enum(["art-director", "scenarist", "editor"]);
export type RepairOwner = z.infer<typeof RepairOwnerSchema>;

/** Finding severity, mirrored from the eval `Severity` ladder. */
export const RepairSeveritySchema = z.enum(["info", "warn", "fail"]);
export type RepairSeverity = z.infer<typeof RepairSeveritySchema>;

/** Approval lifecycle. Plans are born "pending" — never auto-approved. */
export const RepairApprovalStateSchema = z.enum(["pending", "approved", "skipped"]);
export type RepairApprovalState = z.infer<typeof RepairApprovalStateSchema>;

/** Provenance of the repair item: a deterministic finding or a deep-vision redo. */
export const RepairSourceSchema = z.enum(["findings", "deep-vision"]);
export type RepairSource = z.infer<typeof RepairSourceSchema>;

/** Coarse risk of applying the fix — drives the order in which the user reviews. */
export const RepairRiskSchema = z.enum(["low", "medium", "high"]);
export type RepairRisk = z.infer<typeof RepairRiskSchema>;

// ─── Repair item ──────────────────────────────────────────────────────────────

export const RepairItemSchema = z.object({
  /** The originating finding id (F1.. for findings, D10xx for deep-vision). */
  findingId: z.string().min(1),
  /** Eval taxonomy category (e.g. `audio.loudness`, `style.register-mismatch`). */
  category: z.string().min(1),
  /** Severity carried from the source finding (info | warn | fail). */
  severity: RepairSeveritySchema,
  /** Owning role per the deterministic map. */
  owner: RepairOwnerSchema,
  /** Where the source finding came from. */
  source: RepairSourceSchema,
  /**
   * The slot / file / scene the fix targets, when one can be derived
   * (e.g. `scene-03`, `render/final.mp4`, `start-frame`). Null when the
   * finding is global (loudness, resolution).
   */
  targetSlotOrFile: z.string().nullable().default(null),
  /**
   * A copy-pasteable command or a concrete edit instruction. Prefers the
   * finding's own `fixCommand`; falls back to the `fixHint` / deep-vision
   * `action`. NEVER a paid call the fixer runs without approval.
   */
  proposedCommandOrEdit: z.string().min(1),
  /** Best-effort USD cost of applying this fix (0 for free / edit-only fixes). */
  costEstimate: z.number().nonnegative().default(0),
  /** Coarse risk of the fix (re-rolls drift; edits are low-risk). */
  risk: RepairRiskSchema.default("low"),
  /** Approval lifecycle — born "pending", flipped only on explicit user 'go'. */
  approvalState: RepairApprovalStateSchema.default("pending"),
  /**
   * Deterministic priority rank (1 = highest). Lower number = act first.
   * fail > warn > info, with deep-vision priority-1 redos floated to the top.
   */
  priority: z.number().int().positive(),
  /** The verbatim finding message — context for the user / fixer. */
  message: z.string().default(""),
});
export type RepairItem = z.infer<typeof RepairItemSchema>;

// ─── The full RepairPlan ────────────────────────────────────────────────────

export const RepairPlanSchema = z.object({
  /** Schema version — bump when an item field becomes required. */
  version: z.literal(1).default(1),
  /** The project this plan belongs to. */
  projectId: z.string().min(1),
  /** ISO timestamp the plan was generated. */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /** The eval verdict the plan was built from (pass | warn | fail). */
  sourceVerdict: z.enum(["pass", "warn", "fail"]).nullable().default(null),
  /** Whether the plan was built from deep-vision `what_to_redo` or raw findings. */
  sourcePreferred: RepairSourceSchema,
  /** The ordered repair items (already sorted by `priority`). */
  items: z.array(RepairItemSchema).default([]),
  /** Per-owner item-id index, for grouped presentation. */
  byOwner: z.record(RepairOwnerSchema, z.array(z.string())).default({}),
  /** Sum of every item's costEstimate — the worst-case full-repair spend. */
  totalCostEstimate: z.number().nonnegative().default(0),
  /**
   * The single most important line the fixer must honor: NO paid model call
   * runs until the user approves this plan (or previously opted into batch
   * repair). Carried in the artifact so the gate is visible, not just in prose.
   */
  approvalGate: z.string().default(
    "No paid model regeneration runs until the user approves this plan (or previously opted into batch repair). Every item starts approvalState=pending.",
  ),
});

export type RepairPlan = z.infer<typeof RepairPlanSchema>;

/**
 * Parse + validate an unknown value into a RepairPlan. Throws a ZodError on a
 * malformed plan. Callers mapping onto `E_VALIDATION_FAILED` should catch and
 * pass `error.message` as `detail`.
 */
export function parseRepairPlan(input: unknown): RepairPlan {
  return RepairPlanSchema.parse(input);
}
