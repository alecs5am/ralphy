// Production-contract Zod schema (#418). The forward-looking, deterministic
// EXECUTION CONTRACT a brief compiles into — content mode, format, role chain,
// required artifacts, first checkpoint, model stack, cost/ETA estimate, eval +
// council gates, Unit shape, ref types, benchmark set, research depth, and the
// guidelines the agent will load.
//
// It is the COMPOSITION layer over the existing pieces, NOT a fork of them:
//   • the plan (`production-plan.json`, #407) holds the same content-mode /
//     format / model-stack / estimate data — the contract REFERENCES it and
//     re-states the route-relevant slices in one machine-readable object.
//   • `requiredArtifacts` is single-sourced from `CONTRACT_PHASES`
//     (`cli/lib/contract.ts`) — the compiler reads that constant, the schema
//     just stores the resolved list.
//   • the on-disk phase LEDGER (`evaluateContract`, `project status --contract`)
//     is a different thing: it inspects the filesystem to report what HAS
//     landed. This contract is the projection of what the route WILL be, before
//     anything is on disk.
//
// Where the JSON lands:
//   • <project>/production-contract.json   (beside PRODUCTION_PLAN.md +
//                                           production-plan.json; auto-versioned,
//                                           append-only — AGENTS.md #14)
//
// Schema style mirrors `cli/lib/schemas/{production-plan,ref-pack,benchmark}.ts`:
// a Zod object with inline-doc comments, exported `z.infer` types, sane defaults
// so a partial / best-effort contract still parses, and a
// `parseProductionContract()`. English-only-on-disk.

import { z } from "zod";
import { CONTENT_MODES_LIST } from "../content-modes.js";
import { REF_TYPES } from "./ref-pack.js";
import { TEMPLATE_FORMATS } from "./template.js";
import { PlanEstimateSchema, PlanModelSchema } from "./production-plan.js";

// ─── Support classification ───────────────────────────────────────────────────

/**
 * Whether the compiled mode is a FIRST-CLASS route (#413). When `false`, the
 * contract is a REFUSAL, not a generic fallback disguised as support: it carries
 * the closest supported mode + a reason, and the agent must not promise the
 * requested mode as a deliverable.
 */
export const ContractSupportSchema = z.object({
  /** True only when the resolved mode is a supported first-class route. */
  supported: z.boolean(),
  /**
   * For an unsupported / unclassified contract: the closest SUPPORTED mode the
   * agent should route to instead (null only when no supported mode is a
   * reasonable neighbour — should not happen in practice). Null for a supported
   * contract.
   */
  closestSupportedMode: z.enum(CONTENT_MODES_LIST).nullable().default(null),
  /** One-line, agent-actionable reason for the support decision (English-on-disk). */
  reason: z.string().default(""),
});
export type ContractSupport = z.infer<typeof ContractSupportSchema>;

// ─── The production contract ──────────────────────────────────────────────────

export const ProductionContractSchema = z.object({
  /** Schema version — bump when a field gains a required member. */
  version: z.literal(1).default(1),
  /** The project this contract belongs to. */
  projectId: z.string().min(1),
  /** ISO timestamp the contract was compiled. */
  generatedAt: z.string().default(() => new Date().toISOString()),

  /** The content mode the brief classified into (null = unclassified). */
  mode: z.enum(CONTENT_MODES_LIST).nullable(),
  /** Support classification — the #413 refusal lives here. */
  support: ContractSupportSchema,

  /** Media format the deliverable ships as (∈ the template format taxonomy). */
  format: z.enum(TEMPLATE_FORMATS),
  /** Ordered role chain (playbook order) the request flows through. */
  roleChain: z.array(z.string()).default([]),

  /**
   * The required-or-mode-relevant artifacts the route will produce, in phase
   * order, single-sourced from `CONTRACT_PHASES`. Image-pack (non-video) formats
   * drop the scenario artifact (the image-pack-has-no-scenario nuance, mirrored
   * from `evaluateContract`).
   */
  requiredArtifacts: z.array(z.string()).default([]),
  /** The first user-facing checkpoint before bulk/paid generation. */
  firstCheckpoint: z.string().default(""),

  /** The model stack: which model fills which role (from the plan). */
  modelStack: z.array(PlanModelSchema).default([]),
  /** Cost + wall-clock estimate (from the plan). */
  estimate: PlanEstimateSchema,

  /** Quality gates that must pass before the Unit is formed (mode.qualityGates). */
  evalGates: z.array(z.string()).default([]),
  /** Council review phase ids (preflight + polish) the route may convene. */
  councilGates: z.array(z.string()).default([]),

  /** What the finished Unit looks like (mode.expectedUnitShape). */
  unitShape: z
    .object({
      format: z.enum(TEMPLATE_FORMATS),
      minMedia: z.number().int().nonnegative().default(1),
      maxMedia: z.number().int().nonnegative().nullable().default(null),
      note: z.string().default(""),
    })
    .nullable()
    .default(null),

  /** OPTIONAL ref-pack types the mode declares it needs before fan-out (#426). */
  requiredRefTypes: z.array(z.enum(REF_TYPES)).default([]),
  /** OPTIONAL golden-benchmark-set slug the mode is measured against (#419). */
  benchmarkSet: z.string().nullable().default(null),
  /** Research depth before drafting prompts (mode.defaultResearchDepth). */
  researchDepth: z.enum(["none", "quick", "deep"]).default("none"),
  /** The quality guidance the agent loads for the mode (#417). */
  guidelinesUsed: z.array(z.string()).default([]),
});

export type ProductionContract = z.infer<typeof ProductionContractSchema>;

/** The project-relative location the contract JSON is persisted to. */
export const PRODUCTION_CONTRACT_ARTIFACT = "production-contract.json" as const;

/**
 * Parse + validate an unknown value into a ProductionContract. Throws a ZodError
 * on a malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch
 * and pass `error.message` as `detail`.
 */
export function parseProductionContract(input: unknown): ProductionContract {
  return ProductionContractSchema.parse(input);
}
