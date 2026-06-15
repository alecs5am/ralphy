// Production-mode compiler (#418) — the COMPOSITION layer that joins the
// already-built pieces into one forward-looking deterministic execution
// contract. It does NOT re-derive classification / model stack / cost (that is
// `buildProductionPlan`, #407) and it does NOT inspect the filesystem (that is
// `evaluateContract`, the on-disk phase ledger). It REFERENCES the plan + the
// content-mode registry + `CONTRACT_PHASES` and re-states the route-relevant
// slices in one machine-readable object.
//
// What this module actually adds:
//   • the support classification (the #413 refusal: unsupported / unclassified →
//     `supported: false` with the CLOSEST supported mode + a reason, never a
//     generic fallback disguised as support),
//   • the requiredArtifacts projection from `CONTRACT_PHASES` (with the
//     image-pack-has-no-scenario nuance), and the council-gate phase ids,
//   • the composition function that folds the plan + the registry entry into a
//     `ProductionContract`.
//
// Pure + test-stubbable: `opts` are forwarded to `buildProductionPlan`, so a
// test injects `enrich` (no live network) exactly as the plan tests do.

import { buildProductionPlan, type BuildPlanInput, type BuildPlanOptions } from "../plan/build.js";
import {
  getContentMode,
  isModeSupported,
  supportedContentModes,
  type ContentModeEntry,
} from "../content-modes.js";
import { CONTRACT_PHASES } from "../contract.js";
import type { ProductionPlan } from "../schemas/production-plan.js";
import { ProductionContractSchema, type ProductionContract } from "../schemas/production-contract.js";
import type { TemplateFormat } from "../schemas/template.js";

/** The council review phase ids, in order — derived from `CONTRACT_PHASES`. */
const COUNCIL_GATE_IDS = CONTRACT_PHASES.filter((p) => p.id.startsWith("council-")).map((p) => p.id);

/** Video formats (used for the image-pack-has-no-scenario relaxation). */
function isVideoFormat(format: TemplateFormat): boolean {
  return format === "video" || format === "motion-design";
}

/**
 * The required-or-mode-relevant artifacts the route WILL produce, in phase
 * order, single-sourced from `CONTRACT_PHASES`. Non-video (image-pack) formats
 * drop the scenario artifact — mirroring `evaluateContract`'s `kind ===
 * "image-pack"` relaxation, so the forward projection matches the on-disk
 * ledger.
 */
function requiredArtifactsFor(format: TemplateFormat): string[] {
  const videoFmt = isVideoFormat(format);
  return CONTRACT_PHASES.filter((p) => {
    if (!p.required || !p.artifact) return false;
    if (p.id === "scenario" && !videoFmt) return false; // image-pack has no scenario
    return true;
  }).map((p) => p.artifact as string);
}

/**
 * Resolve the CLOSEST supported mode for an unsupported / unclassified contract
 * — the #413 refusal target. Deterministic, registry-only:
 *   1. a supported mode whose primary format equals the resolved format (the
 *      tightest neighbour: same deliverable container), then
 *   2. any supported mode listing the resolved format in `supportedFormats`,
 *      then
 *   3. the unsupported entry's own `recommendedUnit`-adjacent fallback: the
 *      first supported mode (stable registry order).
 * Returns null only when there are no supported modes at all (never in practice).
 */
function closestSupportedMode(
  unsupportedEntry: ContentModeEntry | undefined,
  format: TemplateFormat,
): string | null {
  const supported = supportedContentModes();
  if (supported.length === 0) return null;

  // Prefer a same-primary-format neighbour, then a format-capable one.
  const samePrimary = supported.find((e) => e.templateLookup.primaryFormat === format);
  if (samePrimary) return samePrimary.mode;
  const formatCapable = supported.find((e) => e.supportedFormats.includes(format));
  if (formatCapable) return formatCapable.mode;

  // Last resort: a same-primary-format neighbour of the unsupported entry's own
  // primary format (covers the unclassified case where `format` came from the
  // template match, not the mode).
  if (unsupportedEntry) {
    const byEntryFormat = supported.find(
      (e) => e.templateLookup.primaryFormat === unsupportedEntry.templateLookup.primaryFormat,
    );
    if (byEntryFormat) return byEntryFormat.mode;
  }
  return supported[0]!.mode;
}

export interface CompileContractResult {
  contract: ProductionContract;
  /** The plan the contract was composed from (so the verb can write it too). */
  plan: ProductionPlan;
}

/**
 * Compile a brief into a complete production contract. PURE — builds the plan via
 * `buildProductionPlan` (forwarding `opts` so the LLM enrichment + template
 * catalog stay injected/stubbable), classifies support, and folds the plan + the
 * content-mode registry entry into a schema-valid `ProductionContract`.
 *
 * Does NOT duplicate `buildProductionPlan` (it calls it) and does NOT touch the
 * filesystem (no `evaluateContract`).
 */
export async function compileProductionContract(
  input: BuildPlanInput,
  opts: BuildPlanOptions = {},
): Promise<CompileContractResult> {
  const { plan } = await buildProductionPlan(input, opts);

  const mode = plan.contentMode.mode; // null when unclassified
  const modeEntry = mode ? getContentMode(mode) : undefined;
  const format = plan.formatTemplate.format;

  // ── Support classification (#413) — the refusal, not a fake fallback ──
  const supported = !!mode && isModeSupported(mode);
  let support;
  if (supported) {
    support = { supported: true, closestSupportedMode: null, reason: `"${mode}" is a first-class route.` };
  } else {
    const closest = closestSupportedMode(modeEntry, format);
    const reason = mode
      ? `content mode "${mode}" is not a first-class route (isModeSupported=false). Route to the closest supported mode${closest ? ` ("${closest}")` : ""} or tell the user it is not yet supported — do not promise it as a deliverable.`
      : `the brief did not classify into a content mode. Ask one disambiguating question${closest ? ` or route to the closest supported mode ("${closest}")` : ""} before promising a deliverable.`;
    support = { supported: false, closestSupportedMode: closest, reason };
  }

  const contract = ProductionContractSchema.parse({
    version: 1,
    projectId: input.projectId,
    generatedAt: new Date().toISOString(),

    mode,
    support,

    format,
    // Role chain / gates / Unit shape come straight off the registry entry; for
    // an unclassified mode they are empty (no route to declare).
    roleChain: modeEntry ? [...modeEntry.roleChain] : [],
    requiredArtifacts: requiredArtifactsFor(format),
    firstCheckpoint: plan.firstCheckpoint,

    modelStack: plan.modelStack,
    estimate: plan.estimate,

    evalGates: modeEntry ? [...modeEntry.qualityGates] : [],
    councilGates: COUNCIL_GATE_IDS,

    unitShape: modeEntry
      ? {
          format: modeEntry.expectedUnitShape.format,
          minMedia: modeEntry.expectedUnitShape.minMedia,
          maxMedia: modeEntry.expectedUnitShape.maxMedia,
          note: modeEntry.expectedUnitShape.note,
        }
      : null,

    requiredRefTypes: modeEntry?.requiredRefTypes ?? [],
    benchmarkSet: modeEntry?.benchmarkSet ?? null,
    researchDepth: modeEntry?.defaultResearchDepth ?? "none",
    guidelinesUsed: plan.guidelinesUsed,
  });

  return { contract, plan };
}
