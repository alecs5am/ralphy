// Per-workspace declarative workflow schema (#478).
//
// A workflow is the configurable, ComfyUI-style staged pipeline a workspace runs
// to turn an idea into a finished video: an ordered list of steps, each PINNED to
// a production-contract phase (cli/lib/contract.ts) and carrying an engine, an
// optional model (or models[] for variant fan-out), a variant count, an eval gate
// (criterion ids from the workspace evaluators.json, #468), an auto|approve mode,
// and a bounded repair config. It GENERALIZES the workspace `stageGates` (#472):
// stageGates says "this phase is gated by these criteria"; a workflow step says
// the same PLUS how the step is produced and whether it stops for approval.
//
// Linear-pipeline-with-fan-out, NOT a free-form node graph (D-1): steps run in
// list order, branching only at variant fan-out. Studio renders it as a node
// chain; the runner stays a simple ordered walk over these steps.
//
// Schema style mirrors cli/lib/schemas/workspace-evaluators.ts: a Zod object with
// inline-doc comments, exported z.infer types, sane .default()s, a parseWorkflow().
// The phase pin validates LAZILY against CONTRACT_PHASE_IDS via .refine() — the
// same circular-import guard documented on StageGate.phase. English-only-on-disk.

import { z } from "zod";
import { CONTRACT_PHASE_IDS } from "../contract.js";

/**
 * How a step is produced:
 *   • agent              — the orchestrating agent does it, no mechanical call
 *                          (load context, intake). The v1 driver is Claude Code
 *                          in chat; a callLLM() driver can take over later (D-3).
 *   • llm                — a text-model call (scenario, prompt drafting).
 *   • generate.{kind}    — a `ralphy generate <kind>` media call. variants>1 fans
 *                          out (across models[] when set).
 *   • render             — `ralphy render`.
 *   • eval               — `ralphy workspace eval` filtered to this step's gate.
 */
export const WorkflowEngineSchema = z.enum([
  "agent",
  "llm",
  "generate.image",
  "generate.video",
  "generate.voiceover",
  "generate.music",
  "render",
  "eval",
]);
export type WorkflowEngine = z.infer<typeof WorkflowEngineSchema>;

/** auto = advance on a clear gate; approve = always stop and present. */
export const WorkflowStepModeSchema = z.enum(["auto", "approve"]);
export type WorkflowStepMode = z.infer<typeof WorkflowStepModeSchema>;

/** Bounded repair config for a gated step (mirrors the #473 stage loop). */
export const WorkflowRepairSchema = z
  .object({
    /** Max assemble→eval→repair iterations before stopping (0 = no repair loop). */
    retryBudget: z.number().int().min(0).default(2),
    /** Pre-approve paid regen inside the loop ("just fix it, don't ask"). */
    batchApproved: z.boolean().default(false),
  })
  .default({});
export type WorkflowRepair = z.infer<typeof WorkflowRepairSchema>;

/** One workflow step. */
export const WorkflowStepSchema = z.object({
  /** Stable step id, unique within the workflow. */
  id: z.string(),
  /** Human-readable label for reports / studio (falls back to id when empty). */
  label: z.string().default(""),
  /**
   * The contract phase this step maps to — MUST be a real `CONTRACT_PHASES[].id`.
   * Validated LAZILY against `CONTRACT_PHASE_IDS` via `.refine()` (read at PARSE
   * time, not module-eval time) to dodge the contract↔schema circular-import
   * load-order trap — same guard as `StageGate.phase`.
   */
  phase: z.string().refine((p) => CONTRACT_PHASE_IDS.includes(p), {
    message: "phase must be a CONTRACT_PHASES id (see cli/lib/contract.ts)",
  }),
  /** Optional owning playbook role (scenarist | art-director | editor | researcher). */
  owner: z.string().optional(),
  /** How the step is produced. */
  engine: WorkflowEngineSchema,
  /** Single model id (else the engine's run-time default). */
  model: z.string().optional(),
  /** Multiple model ids — one variant per model (overrides `model` for fan-out). */
  models: z.array(z.string()).optional(),
  /** Variants to produce (>1 fans out; with models[], one per model). */
  variants: z.number().int().min(1).default(1),
  /** Criterion ids (from evaluators.json) that gate advancing past this step. */
  gate: z.array(z.string()).default([]),
  /** auto | approve. Defaults to approve — a step stops for the user unless opted down. */
  mode: WorkflowStepModeSchema.default("approve"),
  /** Bounded repair loop for the gate. */
  repair: WorkflowRepairSchema,
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.string().default("1.0"),
  /** Workflow name (the file basename under workflows/). */
  name: z.string(),
  /** Ordered steps; run in list order, branching only at variant fan-out. */
  steps: z.array(WorkflowStepSchema).default([]),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

/** Parse + validate an unknown value into a Workflow (throws ZodError when malformed). */
export function parseWorkflow(raw: unknown): Workflow {
  return WorkflowSchema.parse(raw);
}
