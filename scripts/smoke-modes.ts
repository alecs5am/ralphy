#!/usr/bin/env bun
// scripts/smoke-modes.ts — #446 (mode fixture smoke suite)
//
// #412 defined the content-mode taxonomy, #413 the supported/gap split, #417 the
// guideline-coverage bar, and #418 the production contract. Each of those checks
// ONE axis. #446 is the CONSOLIDATING completeness smoke: for EVERY supported
// mode it ties the whole contract together — routing + production planning +
// required artifacts + gates + Unit shape + doc/guideline — and FAILS when any
// piece is missing. A mode does not count as "supported" unless ALL of them work
// together. It is runnable as ONE maintainer command (`bun run smoke:modes`) to
// run before changing mode routing.
//
// COMPOSE, don't duplicate: the per-mode ROUTING + PRODUCTION-PLAN fixtures live
// in tests/unit/mode-coverage.test.ts and the DOC/GUIDELINE coverage logic lives
// in scripts/lint-mode-guidelines.ts. This smoke imports the coverage primitives
// (`scoreModeCoverage`) and reuses the existing classifier + #418 compiler — it
// does NOT re-define a per-mode fixture map or re-implement coverage logic.
//
// NO PAID GENERATION / NO NETWORK: the brief for each mode is DERIVED from the
// mode's own registry keywords (no hand-maintained fixture map → future modes
// are auto-covered), and the #418 contract is compiled with a STUBBED LLM
// enrichment (the same `enrich` shape the plan/contract tests inject). Nothing
// hits a model provider.
//
// FAIL is exit 1 with a JSON `{ ok, scanned, offenders }` report (mirrors
// lint-mode-guidelines.ts) so CI and the test suite can consume it.

import path from "node:path";
import {
  supportedContentModes,
  classifyContentMode,
  TEMPLATE_FORMATS,
  type ContentModeEntry,
  type ResearchDepth,
} from "../cli/lib/content-modes.js";
import { compileProductionContract } from "../cli/lib/production/compiler.js";
import {
  parseProductionContract,
  type ProductionContract,
} from "../cli/lib/schemas/production-contract.js";
import type { LlmEnrichment } from "../cli/lib/schemas/production-plan.js";
import { scoreModeCoverage } from "./lint-mode-guidelines.js";

// ─── Known quality gates ──────────────────────────────────────────────────────
//
// The canonical refuse-not-warn gate functions (AGENTS.md #4): `scoreScenario`
// (cli/lib/score.ts), `scoreImage` + `scoreVideo` (cli/lib/quality.ts). These are
// the only identifiers a mode's `qualityGates[]` may name; the newer mode-gated
// eval gates (fidelity/ocr/hook/claims/platform under cli/lib/eval/) are DERIVED
// from registry predicates (`requiresFidelityGate`, `hasBakedText`, …), not
// listed in `qualityGates`. An unrecognized gate name is a real offender — it
// means a mode declares a gate the pipeline can't run.
export const KNOWN_QUALITY_GATES: ReadonlySet<string> = new Set([
  "scoreScenario",
  "scoreImage",
  "scoreVideo",
]);

const VALID_RESEARCH_DEPTHS: ReadonlySet<ResearchDepth> = new Set(["none", "quick", "deep"]);

/** Canned LLM enrichment — what a stubbed LLM returns. No network. Mirrors the
 *  `cannedEnrichment()` helper in the mode tests so scene/duration stay fixed. */
function cannedEnrichment(): LlmEnrichment {
  return {
    targetAudienceLanguage: "English",
    register: "",
    sceneCount: 5,
    durationSec: 25,
    firstCheckpoint: "scene-01 anchor -> wait for go",
    vibe: "",
  };
}

/**
 * Derive a routing/plan brief for a mode from its OWN registry keywords — no
 * hand-maintained fixture map, so a new supported mode is auto-covered the moment
 * it lands. The classifier scores multi-word keyword phrases 2× single tokens, so
 * a brief built from the mode's strongest 2-3 phrases classifies confidently and
 * non-ambiguously. Modes with <2 phrases fall back to padding with single-token
 * keywords (a STRONGER phrase set, per the issue's "fall back to a stronger
 * keyword phrase" rule). Validated for every current supported mode by the smoke.
 */
export function deriveBriefForMode(entry: ContentModeEntry): string {
  const phrases = entry.keywords.filter((k) => k.includes(" "));
  const singles = entry.keywords.filter((k) => !k.includes(" "));
  const picks = phrases.length >= 2 ? phrases.slice(0, 3) : [...phrases, ...singles].slice(0, 4);
  return picks.join(" ");
}

// ─── Per-mode scorer (pure, on a passed contract) ─────────────────────────────
//
// Split out so the teeth test can exercise the registry-data axes on a SYNTHETIC
// supported-mode-shaped object + a synthetic contract WITHOUT compiling a real
// plan (mirroring how lint-mode-guidelines.ts's scoreModeCoverage runs on a
// stripped entry). `smokeModes` is the only caller that compiles a real contract.

export interface ModeSmokeMissing {
  mode: string;
  /** The specific completeness pieces that are missing (each a human reason). */
  missing: string[];
}

/**
 * Score one mode's completeness against its registry entry, a compiled contract,
 * and its derived brief's classification. Returns the list of MISSING pieces
 * (empty = complete). Pure — no filesystem access except the doc/guideline axis,
 * which is delegated to `scoreModeCoverage` (so the caller passes its result).
 */
export function scoreModeSmoke(args: {
  entry: ContentModeEntry;
  /** The classification of the derived brief (routability axis). */
  classification: ReturnType<typeof classifyContentMode>;
  /** The compiled #418 contract (or null if it threw — a hard offender). */
  contract: ProductionContract | null;
  /** Whether the contract parsed against the schema. */
  schemaValid: boolean;
  /** Doc/guideline coverage (from scoreModeCoverage). */
  coverageOk: boolean;
}): string[] {
  const { entry, classification, contract, schemaValid, coverageOk } = args;
  const missing: string[] = [];
  const expectedFormat = entry.templateLookup.primaryFormat;

  // ── routable: the derived brief classifies to THIS mode, non-ambiguous ──
  if (classification.mode !== entry.mode) {
    missing.push(`not routable — derived brief classifies to "${classification.mode}" not "${entry.mode}"`);
  } else if (classification.ambiguous) {
    missing.push(`routing is ambiguous (confidence ${classification.confidence}, alternatives ${JSON.stringify(classification.alternatives.slice(0, 3))})`);
  }

  // ── contract compiles: schema-valid, supported, right format + artifacts ──
  if (!contract) {
    missing.push("production contract failed to compile");
  } else {
    if (!schemaValid) missing.push("production contract is not schema-valid");
    if (contract.mode !== entry.mode) missing.push(`contract mode "${contract.mode}" != "${entry.mode}"`);
    if (!contract.support.supported) missing.push("contract support.supported is false");
    if (contract.format !== expectedFormat) missing.push(`contract format "${contract.format}" != primary format "${expectedFormat}"`);
    if (contract.requiredArtifacts.length === 0) missing.push("contract carries no required artifacts");
    // PRODUCTION_PLAN.md is the always-required spine artifact of every route.
    if (!contract.requiredArtifacts.includes("PRODUCTION_PLAN.md")) {
      missing.push("contract required artifacts omit PRODUCTION_PLAN.md");
    }
  }

  // ── research depth: present + valid ──
  if (!VALID_RESEARCH_DEPTHS.has(entry.defaultResearchDepth)) {
    missing.push(`invalid defaultResearchDepth "${entry.defaultResearchDepth}"`);
  }

  // ── ref requirements: requiredInputs present (+ requiredRefTypes consistent) ──
  if (!Array.isArray(entry.requiredInputs) || entry.requiredInputs.length === 0) {
    missing.push("no requiredInputs declared");
  }
  if (entry.requiredRefTypes !== undefined && entry.requiredRefTypes.length === 0) {
    missing.push("requiredRefTypes declared but empty (drop the field or list a type)");
  }

  // ── quality gates: non-empty AND every entry a KNOWN gate ──
  if (entry.qualityGates.length === 0) {
    missing.push("no quality gates");
  } else {
    const unknown = entry.qualityGates.filter((g) => !KNOWN_QUALITY_GATES.has(g));
    if (unknown.length > 0) missing.push(`unknown quality gate(s): ${JSON.stringify(unknown)} — not in {${[...KNOWN_QUALITY_GATES].join(", ")}}`);
  }

  // ── Unit shape: valid format + minMedia >= 1 ──
  const shape = entry.expectedUnitShape;
  if (!shape || !(TEMPLATE_FORMATS as readonly string[]).includes(shape.format)) {
    missing.push(`expectedUnitShape.format "${shape?.format}" is not a known media format`);
  }
  if (!shape || shape.minMedia < 1) {
    missing.push(`expectedUnitShape.minMedia (${shape?.minMedia}) must be >= 1`);
  }
  if (shape && shape.maxMedia !== null && shape.maxMedia < shape.minMedia) {
    missing.push(`expectedUnitShape.maxMedia (${shape.maxMedia}) < minMedia (${shape.minMedia})`);
  }

  // ── doc/guideline: a linked guideline OR a mode-level quality playbook ──
  if (!coverageOk) {
    missing.push("no quality guidance — link a guidelines/<slug>/ or add docs/playbooks/modes/<mode>.md");
  }

  return missing;
}

export interface ModeSmokeReport {
  ok: boolean;
  /** Supported modes scanned (= supportedContentModes().length). */
  scanned: number;
  offenders: ModeSmokeMissing[];
}

/**
 * Run the full mode-completeness smoke over every SUPPORTED mode. For each mode:
 * derive a brief from its registry keywords, classify it, compile the #418
 * contract (stubbed enrichment — no network), score the doc/guideline coverage,
 * and assert every completeness axis. A mode with any missing piece is an
 * offender with the specific reasons. ASYNC because the #418 contract compile is
 * async (it builds the plan first).
 */
export async function smokeModes(repo: string): Promise<ModeSmokeReport> {
  const enrich = async (): Promise<LlmEnrichment> => cannedEnrichment();
  const supported = supportedContentModes();
  const offenders: ModeSmokeMissing[] = [];

  for (const entry of supported) {
    const brief = deriveBriefForMode(entry);
    const classification = classifyContentMode(brief);

    let contract: ProductionContract | null = null;
    let schemaValid = false;
    try {
      const compiled = await compileProductionContract(
        { projectId: `smoke-${entry.mode}`, brief },
        { candidates: [], enrich },
      );
      contract = compiled.contract;
      try {
        parseProductionContract(contract);
        schemaValid = true;
      } catch {
        schemaValid = false;
      }
    } catch {
      contract = null;
    }

    const coverageOk = scoreModeCoverage(repo, entry).ok;

    const missing = scoreModeSmoke({ entry, classification, contract, schemaValid, coverageOk });
    if (missing.length > 0) offenders.push({ mode: entry.mode, missing });
  }

  return { ok: offenders.length === 0, scanned: supported.length, offenders };
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const report = await smokeModes(repo);
  if (report.ok) {
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exit(0);
  }
  process.stderr.write(JSON.stringify(report, null, 2) + "\n");
  for (const o of report.offenders) {
    process.stderr.write(`content-mode "${o.mode}" is incomplete:\n`);
    for (const m of o.missing) process.stderr.write(`  ✖ ${m}\n`);
  }
  process.stderr.write(
    `\n${report.offenders.length} incomplete supported mode(s) across ${report.scanned} scanned.\n`,
  );
  process.exit(1);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("smoke-modes.ts") || process.argv[1].endsWith("smoke-modes.js"));
if (isDirect) {
  void main();
}
