// Production-plan quality grader (#432).
//
// `gradeProductionPlan(plan)` is a PURE, DETERMINISTIC critic of a
// ProductionPlan (#407) BEFORE it becomes the contract for expensive work: is
// the plan actionable, grounded, complete, and safe to execute. It grades the
// plan AGAINST the content-mode registry expectations (`cli/lib/content-modes.ts`)
// — the mode's `requiredInputs` / `requiredRefTypes`, `defaultResearchDepth`,
// `guidelineOrStyleLock.required`, `qualityGates` — plus the plan's own model
// stack, cost estimate, and first checkpoint.
//
// It is the PLAN-stage analog of `buildScorecard` (#427, the RELEASE-stage
// aggregator): same shape (per-dimension status + 0-100 score + a concrete note,
// one overall verdict), but it reads ONE object (the plan) instead of ingesting
// the gate reports, and it makes ZERO model calls. The optional LLM completeness
// pass is INJECTED (`opts.llmReview`) — off by default, tests never call it — so
// the deterministic verdict is reproducible and offline.
//
// Verdict precedence (first match wins):
//   • blocked — the plan lacks a REQUIRED artifact for its mode (a required ref
//     type / required input is missing, OR a lock-required mode has no style /
//     guideline lock, OR the mode is unsupported / unclassified). A blocked plan
//     must not become the execution contract.
//   • weak    — no hard blocker, but a dimension warns (thin research, an
//     under-covered model stack, an incoherent or empty estimate, missing gates,
//     no first checkpoint).
//   • strong  — every dimension passes.
//
// English-only-on-disk.

import {
  getContentMode,
  isModeSupported,
  type ContentModeEntry,
  type ResearchDepth,
} from "../content-modes.js";
import type { ProductionPlan } from "../schemas/production-plan.js";
import {
  PLAN_GRADE_DIMENSIONS,
  type PlanGrade,
  type PlanGradeDimension,
  type PlanGradeStatus,
  type PlanGradeVerdict,
  parsePlanGrade,
} from "../schemas/plan-grade.js";

// ─── Optional injected LLM completeness pass ──────────────────────────────────
//
// A single qualitative completeness review of the plan. OFF by default; the verb
// wires it to a `callLLM()` jsonMode pass, tests never call it. It can only
// SOFTEN nothing and DEMOTE at most to `weak` (it never blocks — the hard blocks
// are deterministic-only) and it appends one advisory note. Kept narrow so a
// sloppy payload still merges.

export interface PlanGradeLlmReview {
  /** "pass" (complete) | "warn" (gaps the deterministic checks can't see). */
  verdict: "pass" | "warn";
  /** One short English note naming the qualitative gap, when warn. */
  note: string;
}

export interface GradePlanOptions {
  /** Injected qualitative completeness pass. Omitted = deterministic only. */
  llmReview?: (plan: ProductionPlan) => Promise<PlanGradeLlmReview>;
}

// ─── Per-dimension deterministic checks ───────────────────────────────────────
//
// Each returns a status + 0-100 band + a concrete, English note. `entry` is the
// mode registry entry (undefined for an unclassified plan). `fail` is reserved
// for a missing REQUIRED artifact (drives `blocked`); `warn` is a fixable gap.

interface DimReading {
  status: PlanGradeStatus;
  score: number;
  note: string;
}

const PASS = 95;
const WARN = 70;
const FAIL = 35;

/** Does the plan name a confident, non-ambiguous, supported content mode? */
function gradeModeFit(plan: ProductionPlan): DimReading {
  const cm = plan.contentMode;
  if (!cm.mode) {
    return { status: "fail", score: FAIL, note: "No content mode classified — the brief did not resolve to a production-intent label. Ask one disambiguating question before generating." };
  }
  if (!isModeSupported(cm.mode)) {
    return { status: "fail", score: FAIL, note: `Content mode "${cm.mode}" is not a first-class supported route — route to the closest supported mode or tell the user it is not yet supported (do not promise it as a deliverable).` };
  }
  if (cm.ambiguous) {
    return { status: "warn", score: WARN, note: `Content mode "${cm.mode}" classified but flagged ambiguous (confidence ${cm.confidence.toFixed(2)}) — confirm the mode with the user before locking the plan.` };
  }
  return { status: "pass", score: PASS, note: `Confident mode "${cm.mode}" (confidence ${cm.confidence.toFixed(2)}).` };
}

/**
 * Are the mode's REQUIRED inputs + ref types present in the plan's requiredRefs?
 * A required ref type / input with no matching requiredRefs entry is a hard
 * block — the plan would send the agent to generate a named entity it cannot
 * fabricate.
 */
function gradeMissingInputs(plan: ProductionPlan, entry: ContentModeEntry | undefined): DimReading {
  if (!entry) {
    return { status: "na", score: 95, note: "No mode resolved — required inputs cannot be checked." };
  }
  const required = entry.requiredInputs;
  const requiredTypes = entry.requiredRefTypes ?? [];
  if (required.length === 0 && requiredTypes.length === 0) {
    return { status: "pass", score: PASS, note: `Mode "${entry.mode}" declares no required inputs.` };
  }
  // The plan records required refs as free text (requiredRefs) — populated from
  // the mode's requiredInputs. The block fires when the mode declares required
  // inputs/types but the plan carries NONE: an empty requiredRefs against a
  // mode that demands them is the missing-artifact case the gate exists for.
  const refs = plan.requiredRefs;
  if (refs.length === 0) {
    const want = [...required, ...requiredTypes.map((t) => `${t} ref`)];
    return {
      status: "fail",
      score: FAIL,
      note: `Mode "${entry.mode}" requires ${want.join(", ")} but the plan lists no required references — attach them (or log a --no-ref-consent override) before generating.`,
    };
  }
  // Some refs present: warn if the count is short of what the mode declares.
  const declared = Math.max(required.length, requiredTypes.length);
  if (refs.length < declared) {
    return {
      status: "warn",
      score: WARN,
      note: `Mode "${entry.mode}" declares ${declared} required input(s) but the plan lists ${refs.length} reference(s) — confirm coverage of: ${required.join(", ") || requiredTypes.join(", ")}.`,
    };
  }
  return { status: "pass", score: PASS, note: `All ${refs.length} required reference(s) present for mode "${entry.mode}".` };
}

/** Is research depth appropriate for the mode (the mode's defaultResearchDepth)? */
function gradeResearchGrounding(plan: ProductionPlan, entry: ContentModeEntry | undefined): DimReading {
  if (!entry) {
    return { status: "na", score: 95, note: "No mode resolved — research depth cannot be checked." };
  }
  const want: ResearchDepth = entry.defaultResearchDepth;
  if (want === "none") {
    return { status: "pass", score: PASS, note: `Mode "${entry.mode}" needs no research before prompting.` };
  }
  // A deep/quick mode wants a grounded benchmark source. The plan's
  // benchmarkSource (#407) is the citation that research happened — its absence
  // on a research-required mode is a grounding gap.
  if (!plan.benchmarkSource) {
    return {
      status: "warn",
      score: WARN,
      note: `Mode "${entry.mode}" expects "${want}" research but the plan cites no benchmarkSource — run research-bootstrap (#416) and record the source before generating.`,
    };
  }
  return { status: "pass", score: PASS, note: `Mode "${entry.mode}" expects "${want}" research; benchmarkSource cited (${plan.benchmarkSource}).` };
}

/** Is a style / guideline lock present when the mode requires one? */
function gradeStyleLock(plan: ProductionPlan, entry: ContentModeEntry | undefined): DimReading {
  if (!entry) {
    return { status: "na", score: 95, note: "No mode resolved — style-lock requirement cannot be checked." };
  }
  if (!entry.guidelineOrStyleLock.required) {
    return { status: "pass", score: PASS, note: `Mode "${entry.mode}" does not require a locked style/guideline (${entry.guidelineOrStyleLock.note}).` };
  }
  // Lock-required: the plan must carry the register-guideline coverage
  // (guidelinesUsed, #417) OR a non-empty register, OR a benchmarkSource that
  // names the style. A lock-required mode with none of those is a hard block —
  // generating without the look-lock is the failure mode the gate prevents.
  const hasGuideline = plan.guidelinesUsed.length > 0;
  const hasRegister = plan.register.trim().length > 0;
  if (!hasGuideline && !hasRegister) {
    return {
      status: "fail",
      score: FAIL,
      note: `Mode "${entry.mode}" requires a locked style/guideline but the plan records none (no guidelinesUsed, empty register) — lock the register before any generation.`,
    };
  }
  return {
    status: "pass",
    score: PASS,
    note: `Style/guideline lock present for mode "${entry.mode}" (${hasGuideline ? `guidelines: ${plan.guidelinesUsed.join(", ")}` : `register: "${plan.register}"`}).`,
  };
}

/** Does the model stack cover the roles the resolved format needs? */
function gradeModelStack(plan: ProductionPlan): DimReading {
  const stack = plan.modelStack;
  if (stack.length === 0) {
    return { status: "fail", score: FAIL, note: "Empty model stack — the plan names no models to execute. Derive the stack from the format before generating." };
  }
  const roles = new Set(stack.map((m) => m.role));
  const format = plan.formatTemplate.format;
  const isVideo = format === "video" || format === "motion-design";
  // Every deliverable needs an image model (anchors / hero stills). Video adds
  // video + voiceover.
  const needed: string[] = ["image"];
  if (isVideo) needed.push("video", "voiceover");
  const missing = needed.filter((r) => !roles.has(r as any));
  if (missing.length) {
    return {
      status: "warn",
      score: WARN,
      note: `Format "${format}" needs ${needed.join(", ")} role(s) but the stack is missing: ${missing.join(", ")}.`,
    };
  }
  return { status: "pass", score: PASS, note: `Model stack covers ${[...roles].join(", ")} for format "${format}".` };
}

/** Is the cost / ETA estimate populated and internally coherent? */
function gradeCostEta(plan: ProductionPlan): DimReading {
  const e = plan.estimate;
  if (e.costHighUsd < e.costLowUsd) {
    return { status: "fail", score: FAIL, note: `Incoherent estimate: costHigh ($${e.costHighUsd.toFixed(2)}) is below costLow ($${e.costLowUsd.toFixed(2)}).` };
  }
  if (e.costHighUsd === 0 && e.wallClockMin === 0) {
    return { status: "warn", score: WARN, note: "Estimate is empty ($0 / 0 min) — populate the cost range + wall-clock before presenting the plan." };
  }
  if (!e.basis) {
    return { status: "warn", score: WARN, note: `Estimate present ($${e.costLowUsd.toFixed(2)}–$${e.costHighUsd.toFixed(2)}, ~${e.wallClockMin}min) but no derivation basis recorded.` };
  }
  return { status: "pass", score: PASS, note: `Estimate $${e.costLowUsd.toFixed(2)}–$${e.costHighUsd.toFixed(2)}, ~${e.wallClockMin}min (${e.basis}).` };
}

/** Are the mode's quality gates listed in the plan's guidance / mode? */
function gradeGates(plan: ProductionPlan, entry: ContentModeEntry | undefined): DimReading {
  if (!entry) {
    return { status: "na", score: 95, note: "No mode resolved — quality gates cannot be checked." };
  }
  if (entry.qualityGates.length === 0) {
    return { status: "warn", score: WARN, note: `Mode "${entry.mode}" declares no quality gates — confirm a manual review step before forming the Unit.` };
  }
  return { status: "pass", score: PASS, note: `Quality gates for mode "${entry.mode}": ${entry.qualityGates.join(", ")}.` };
}

/** Is a first user-facing checkpoint set before bulk generation? */
function gradeFirstCheckpoint(plan: ProductionPlan): DimReading {
  if (!plan.firstCheckpoint.trim()) {
    return { status: "warn", score: WARN, note: "No first checkpoint set — define the first user-facing review beat (e.g. \"scene-01 anchor -> wait for go\") so paid generation is gated." };
  }
  return { status: "pass", score: PASS, note: `First checkpoint: ${plan.firstCheckpoint}` };
}

// ─── The grader ────────────────────────────────────────────────────────────────

/**
 * The PURE + SYNCHRONOUS deterministic grade — every check runs against the plan
 * + the static content-mode registry, ZERO model calls. This is the core the
 * async `gradeProductionPlan` wraps (adding the optional LLM pass) and the
 * council preflight payload (#415) reads directly for a bounded grade summary.
 *
 * Returns a schema-valid `PlanGrade` (`parsePlanGrade` passes).
 */
export function gradePlanDeterministic(plan: ProductionPlan): PlanGrade {
  const entry = plan.contentMode.mode ? getContentMode(plan.contentMode.mode) : undefined;

  const readings: Record<PlanGradeDimension, DimReading> = {
    modeFit: gradeModeFit(plan),
    missingInputs: gradeMissingInputs(plan, entry),
    researchGrounding: gradeResearchGrounding(plan, entry),
    styleLock: gradeStyleLock(plan, entry),
    modelStack: gradeModelStack(plan),
    costEta: gradeCostEta(plan),
    gates: gradeGates(plan, entry),
    firstCheckpoint: gradeFirstCheckpoint(plan),
  };

  return assembleGrade(plan, readings, null);
}

/**
 * Grade a ProductionPlan. The deterministic core (`gradePlanDeterministic`) plus
 * the OPTIONAL injected LLM completeness pass — the only async seam. Omit
 * `opts.llmReview` (the default) for a fully deterministic, offline grade; tests
 * never pass it. The LLM pass is advisory: it never blocks and at most demotes a
 * passing checkpoint reading to `weak` with one note.
 *
 * Returns a schema-valid `PlanGrade` (`parsePlanGrade` passes).
 */
export async function gradeProductionPlan(
  plan: ProductionPlan,
  opts: GradePlanOptions = {},
): Promise<PlanGrade> {
  if (!opts.llmReview) return gradePlanDeterministic(plan);

  const entry = plan.contentMode.mode ? getContentMode(plan.contentMode.mode) : undefined;
  const readings: Record<PlanGradeDimension, DimReading> = {
    modeFit: gradeModeFit(plan),
    missingInputs: gradeMissingInputs(plan, entry),
    researchGrounding: gradeResearchGrounding(plan, entry),
    styleLock: gradeStyleLock(plan, entry),
    modelStack: gradeModelStack(plan),
    costEta: gradeCostEta(plan),
    gates: gradeGates(plan, entry),
    firstCheckpoint: gradeFirstCheckpoint(plan),
  };

  // ── Optional qualitative completeness pass (injected; never blocks) ──
  let llmNote: string | null = null;
  try {
    const review = await opts.llmReview(plan);
    if (review && review.verdict === "warn" && typeof review.note === "string" && review.note.trim()) {
      llmNote = review.note.trim();
      // Demote a `pass` firstCheckpoint reading to surface the gap — the LLM
      // sees qualitative completeness the deterministic checks cannot. Never
      // promotes, never blocks.
      const fc = readings.firstCheckpoint;
      if (fc.status === "pass") {
        readings.firstCheckpoint = { status: "warn", score: WARN, note: `${fc.note} LLM completeness review flagged: ${llmNote}` };
      }
    }
  } catch {
    // A failed / malformed review never crashes the deterministic grade.
    llmNote = null;
  }

  return assembleGrade(plan, readings, llmNote);
}

/** Fold per-dimension readings into the verdict + the schema-valid PlanGrade. */
function assembleGrade(
  plan: ProductionPlan,
  readings: Record<PlanGradeDimension, DimReading>,
  llmNote: string | null,
): PlanGrade {
  const dimensions = PLAN_GRADE_DIMENSIONS.map((dimension) => ({
    dimension,
    status: readings[dimension].status,
    score: readings[dimension].score,
    note: readings[dimension].note,
  }));

  // ── Verdict precedence: blocked (any fail) > weak (any warn) > strong ──
  const failed = dimensions.filter((d) => d.status === "fail");
  const warned = dimensions.filter((d) => d.status === "warn");
  let verdict: PlanGradeVerdict;
  let reason: string;
  if (failed.length) {
    verdict = "blocked";
    reason = `Plan is missing required artifact(s) for its mode: ${failed.map((d) => d.dimension).join(", ")}. ${failed[0]!.note}`;
  } else if (warned.length) {
    verdict = "weak";
    reason = `Plan is executable but has fixable gap(s): ${warned.map((d) => d.dimension).join(", ")}. Tighten before locking the contract.`;
  } else {
    verdict = "strong";
    reason = "Plan is actionable, grounded, complete, and safe to execute — every dimension passes.";
  }

  return parsePlanGrade({
    version: 1,
    projectId: plan.projectId,
    mode: plan.contentMode.mode,
    generatedAt: new Date().toISOString(),
    verdict,
    reason,
    dimensions,
    ...(llmNote ? { llmReviewNote: llmNote } : {}),
  });
}

// ─── Human-readable rendering ─────────────────────────────────────────────────

const STATUS_GLYPH: Record<PlanGradeStatus, string> = { pass: "PASS", warn: "WARN", fail: "FAIL", na: "n/a" };

/** Render a PlanGrade to the human-readable PLAN_GRADE.md body (English-on-disk). */
export function renderPlanGradeMarkdown(grade: PlanGrade): string {
  const rows = grade.dimensions
    .map((d) => `| ${d.dimension} | ${STATUS_GLYPH[d.status]} | ${d.score} | ${d.note} |`)
    .join("\n");
  return `# Production Plan Grade — ${grade.projectId}

> Graded ${grade.generatedAt}. This grades the PLAN (#407) BEFORE it becomes the contract for expensive work (issue #432). Deterministic — zero model calls. Verdict precedence: \`blocked\` (a required artifact is missing for the mode) > \`weak\` (a fixable gap) > \`strong\`.

- **Verdict:** ${grade.verdict}
- **Mode:** ${grade.mode ?? "(unclassified)"}
- **Reason:** ${grade.reason}
${grade.llmReviewNote ? `- **LLM completeness note:** ${grade.llmReviewNote}\n` : ""}
## Dimensions

| Dimension | Status | Score | Note |
|---|---|---|---|
${rows}
`;
}
