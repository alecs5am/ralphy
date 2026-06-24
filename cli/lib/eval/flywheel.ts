// Quality flywheel runner (#484).
//
// A THIN ORCHESTRATION layer over the EXISTING quality gates. It does NOT add a
// new evaluator and it does NOT re-decide ship/repair/blocked — that is
// `buildScorecard()`'s job (cli/lib/scorecard.ts). The runner:
//
//   1. resolves the (mode, format, platforms) context,
//   2. asks `gatesForContext()` which gates apply,
//   3. runs the applicable RUNNABLE gates — cheap-deterministic first, then the
//      model-graded ones — through the SAME check fns + report-file persistence
//      the per-gate `ralphy eval <gate>` subcommands use,
//   4. then calls `buildScorecard()` and surfaces its verdict + a recommended
//      (never executed) next action.
//
// The advisory gates (`distribution-pack`, `council`) are NEVER run here — they
// are produced by `ralphy unit package` / `ralphy project council`. The runner
// records them as `advisory` so the plan is honest about the full registry.
//
// native-video final-gate semantics are preserved: the single `evaluateVideo`
// pass that produces eval.json runs in its DEFAULT (native) mode unless the user
// asks for `--cheap` (structure-only) or `--no-vision` (alias for structure).
// The runner never marks a Unit polished — it only orchestrates + reports.

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { projectDir } from "../paths.js";
import { protectExistingAsset } from "../providers/shared.js";
import { gatesForContext, type QualityGate } from "./gate.js";
import { evaluateVideo } from "./orchestrator.js";
import { checkFidelity, FIDELITY_ARTIFACT } from "./fidelity.js";
import { checkTextLegibility, TEXT_LEGIBILITY_ARTIFACT } from "./ocr.js";
import { checkFirstFrameHook, HOOK_ARTIFACT } from "./hook.js";
import { checkCaptions, CAPTIONS_GATE_ARTIFACT } from "./captions-gate.js";
import { checkClaims, CLAIMS_ARTIFACT } from "./claims.js";
import { validatePlatformSpec, PLATFORM_SPEC_ARTIFACT, isPlatformKey } from "./platform.js";
import { buildScorecard } from "../scorecard.js";
import { getContentMode } from "../content-modes.js";
import type { TemplateFormat } from "../schemas/template.js";
import type { ScorecardVerdict } from "../schemas/scorecard.js";

/** Per-gate run status. */
export type GateRunStatus = "ran" | "skipped" | "advisory";

/** What the runner did (or would do, in dry-run) for one applicable gate. */
export interface GateRun {
  gate: QualityGate;
  status: GateRunStatus;
  /** The report file this gate owns (relative to the project dir), if any. */
  report: string | null;
  /** Whether running this gate may incur a paid model call. */
  costBearing: boolean;
  /** The gate's verdict, when it ran. */
  verdict?: string;
  /** Whether the gate's report blocks ship, when it ran. */
  blocksShip?: boolean;
  /** Why a gate was skipped / is advisory (English-on-disk). */
  reason?: string;
}

/** A dry-run plan entry — what WOULD happen, with zero model calls. */
export interface PlannedGate {
  gate: QualityGate;
  /** Whether this gate would actually run (vs. be skipped / advisory). */
  willRun: boolean;
  /** The report file it would write, if any. */
  wouldWrite: string | null;
  /** Whether running it may incur a paid model call. */
  costBearing: boolean;
  /** Skip / advisory reason, when it would not run. */
  reason?: string;
}

export interface FlywheelOptions {
  /** Content-mode override (default: production-plan.json contentMode.mode). */
  mode?: string | null;
  /** Media-format override (default: the mode's expectedUnitShape.format). */
  format?: TemplateFormat | null;
  /** Declared target platforms (filtered by isPlatformKey). */
  platforms?: string[];
  /** Print the plan and make ZERO model calls. */
  dryRun?: boolean;
  /** Skip every vision/model pass where the gate supports it (deterministic-only). */
  noVision?: boolean;
  /** Cheap pass: run only the deterministic gates (structure + platform-spec),
   *  skip every model-graded gate. Implies --no-vision on the gates that run. */
  cheap?: boolean;
}

export interface FlywheelResult {
  projectId: string;
  mode: string | null;
  format: TemplateFormat | null;
  platforms: string[];
  /** Whether this was a dry-run (no gates executed, no scorecard built). */
  dryRun: boolean;
  /** The full applicable-gate plan (always present; the only output in dry-run). */
  plan: PlannedGate[];
  /** Gates the runner ran (empty in dry-run). */
  gatesAttempted: GateRun[];
  /** Gates that were applicable but skipped, with reasons. */
  gatesSkipped: GateRun[];
  /** Gate ids that may have incurred a paid model call this run. */
  costBearingGates: QualityGate[];
  /** Gates whose report blocks ship (verdict fail / blocksShip). */
  failures: GateRun[];
  /** The scorecard verdict (null in dry-run). */
  scorecardVerdict: ScorecardVerdict | null;
  /** The scorecard reason (null in dry-run). */
  scorecardReason: string | null;
  /** Recommended next action — NEVER executed by the runner. */
  nextAction: string;
}

/** Read the project's resolved content mode from production-plan.json, or null. */
function readProjectMode(projectId: string): string | null {
  try {
    const abs = path.join(projectDir(projectId), "production-plan.json");
    if (!existsSync(abs)) return null;
    const plan = JSON.parse(readFileSync(abs, "utf8")) as { contentMode?: { mode?: unknown } };
    const m = plan.contentMode?.mode;
    return typeof m === "string" ? m : null;
  } catch {
    return null;
  }
}

/** True when the render exists (the video gates' required artifact). */
function hasRender(projectId: string): boolean {
  return existsSync(path.join(projectDir(projectId), "render/final.mp4"));
}

/** True when at least one still exists under artifacts/images (the ocr gate's input). */
function hasImages(projectId: string): boolean {
  try {
    const dir = path.join(projectDir(projectId), "artifacts/images");
    if (!existsSync(dir)) return false;
    return readdirSync(dir).some((f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f));
  } catch {
    return false;
  }
}

/** Persist a gate report the SAME way the per-gate eval subcommands do. */
async function persistReport(projectId: string, rel: string, report: unknown): Promise<void> {
  const dest = path.join(projectDir(projectId), rel);
  await protectExistingAsset(dest, false);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, JSON.stringify(report, null, 2));
}

/**
 * Whether a runnable gate is cost-bearing (may hit a paid model). The
 * deterministic gates (`structure`, `platform-spec`) are free; the rest run a
 * vision/LLM pass. `--cheap`/`--no-vision` can downgrade a cost-bearing gate to
 * free, but the registry-level flag here is the gate's DEFAULT cost.
 */
const COST_BEARING_GATES: ReadonlySet<QualityGate> = new Set<QualityGate>([
  "native-video",
  "first-frame-hook",
  "captions",
  "ocr",
  "product-fidelity",
  "claims",
]);

/** The report file each runnable gate owns, relative to the project dir. */
const GATE_REPORT: Partial<Record<QualityGate, string>> = {
  "native-video": "eval.json",
  structure: "eval.json",
  "first-frame-hook": HOOK_ARTIFACT,
  captions: CAPTIONS_GATE_ARTIFACT,
  ocr: TEXT_LEGIBILITY_ARTIFACT,
  "product-fidelity": FIDELITY_ARTIFACT,
  claims: CLAIMS_ARTIFACT,
  "platform-spec": PLATFORM_SPEC_ARTIFACT,
};

/**
 * The deterministic RUN ORDER: cheap gates first, then model-graded. Only the
 * gates that are actually runnable appear here; advisory gates are handled
 * separately. `native-video`/`structure` share the single `evaluateVideo` pass,
 * so `structure` leads (the cheap face of that pass) and `native-video` follows.
 */
const RUN_ORDER: QualityGate[] = [
  "structure", // deterministic structure pass (eval.json, cheap)
  "platform-spec", // deterministic upload-spec validator (free)
  "native-video", // full-mp4 final gate (eval.json, model)
  "first-frame-hook",
  "captions",
  "ocr",
  "product-fidelity",
  "claims",
];

/** The advisory gates the runner never executes. */
const ADVISORY_GATES: ReadonlySet<QualityGate> = new Set<QualityGate>(["distribution-pack", "council"]);

/**
 * Decide whether an applicable gate can run given the available artifacts.
 * Returns a skip reason string when the gate's required input is missing, else
 * null (the gate may run).
 */
function skipReason(gate: QualityGate, projectId: string, cheap: boolean): string | null {
  // --cheap: skip every model-graded gate (run only the deterministic ones).
  if (cheap && COST_BEARING_GATES.has(gate) && gate !== "native-video") {
    return "skipped by --cheap (model-graded gate)";
  }
  if (cheap && gate === "native-video") {
    return "native model pass skipped by --cheap — the structure pass still ran (deterministic only).";
  }
  switch (gate) {
    case "native-video":
    case "structure":
    case "first-frame-hook":
    case "captions":
      return hasRender(projectId) ? null : "no render/final.mp4 — render the project before the video gates.";
    case "platform-spec":
      return hasRender(projectId) ? null : "no render/final.mp4 — render before validating the platform spec.";
    case "ocr":
      return hasImages(projectId) ? null : "no stills under artifacts/images — generate images before the OCR gate.";
    default:
      return null;
  }
}

/**
 * Run the quality flywheel for a project. Orchestration only — runs the
 * applicable existing gates (cheap-deterministic first), persists their reports
 * the same way the per-gate subcommands do, then hands off to `buildScorecard`.
 */
export async function runQualityFlywheel(
  projectId: string,
  opts: FlywheelOptions = {},
): Promise<FlywheelResult> {
  // ── resolve context ──
  const mode = opts.mode ?? readProjectMode(projectId);
  const format: TemplateFormat | null =
    opts.format ?? (mode ? getContentMode(mode)?.expectedUnitShape.format ?? null : null);
  const platforms = (opts.platforms ?? []).filter(isPlatformKey);

  const { applicable } = gatesForContext({ mode, format, platforms });
  const applicableSet = new Set(applicable);
  const cheap = !!opts.cheap;
  const noVision = !!opts.noVision || cheap;

  // ── build the plan (the only output in dry-run) ──
  const plan: PlannedGate[] = [];
  // Runnable gates in deterministic order.
  for (const gate of RUN_ORDER) {
    if (!applicableSet.has(gate)) continue;
    const reason = skipReason(gate, projectId, cheap);
    plan.push({
      gate,
      willRun: reason === null,
      wouldWrite: GATE_REPORT[gate] ?? null,
      costBearing: COST_BEARING_GATES.has(gate) && !(cheap || (noVision && gate !== "native-video")),
      ...(reason ? { reason } : {}),
    });
  }
  // Advisory gates (always applicable per the registry) — never run.
  for (const gate of applicable) {
    if (!ADVISORY_GATES.has(gate)) continue;
    plan.push({
      gate,
      willRun: false,
      wouldWrite: null,
      costBearing: false,
      reason:
        gate === "distribution-pack"
          ? "advisory — produced by `ralphy unit package`, not the flywheel."
          : "advisory — produced by `ralphy project council`, not the flywheel.",
    });
  }

  if (opts.dryRun) {
    return {
      projectId,
      mode,
      format,
      platforms,
      dryRun: true,
      plan,
      gatesAttempted: [],
      gatesSkipped: [],
      costBearingGates: plan.filter((p) => p.willRun && p.costBearing).map((p) => p.gate),
      failures: [],
      scorecardVerdict: null,
      scorecardReason: null,
      nextAction: "dry-run — no gates executed. Re-run without --dry-run to run the plan.",
    };
  }

  // ── execute the runnable gates in order ──
  const attempted: GateRun[] = [];
  const skipped: GateRun[] = [];
  // `evaluateVideo` produces eval.json and covers BOTH structure + native-video.
  // Run it ONCE; the second of the two gates is folded into the first's run.
  let evalRan = false;

  for (const gate of RUN_ORDER) {
    if (!applicableSet.has(gate)) continue;
    const report = GATE_REPORT[gate] ?? null;
    const reason = skipReason(gate, projectId, cheap);
    if (reason) {
      skipped.push({ gate, status: "skipped", report, costBearing: COST_BEARING_GATES.has(gate), reason });
      continue;
    }

    try {
      if (gate === "structure" || gate === "native-video") {
        if (evalRan) continue; // the single eval pass already covered this gate.
        evalRan = true;
        const videoPath = path.join(projectDir(projectId), "render/final.mp4");
        // --cheap / --no-vision → structure mode (deterministic, no model).
        // Otherwise the default native-video final gate fires.
        const result = await evaluateVideo({
          videoPath,
          projectId,
          mode: cheap || noVision ? "structure" : null,
          noVision: cheap || noVision,
        });
        const v = result.report.scoring.verdict;
        attempted.push({
          gate,
          status: "ran",
          report,
          costBearing: gate === "native-video" && !(cheap || noVision),
          verdict: v,
          blocksShip: !result.report.gate.shipReady,
        });
        continue;
      }

      if (gate === "first-frame-hook") {
        const r = await checkFirstFrameHook({ projectId, mode });
        await persistReport(projectId, HOOK_ARTIFACT, r);
        attempted.push({ gate, status: "ran", report, costBearing: !noVision, verdict: r.verdict, blocksShip: r.blocksShip });
        continue;
      }
      if (gate === "captions") {
        const r = await checkCaptions({ projectId, mode, noPlacement: noVision });
        await persistReport(projectId, CAPTIONS_GATE_ARTIFACT, r);
        attempted.push({ gate, status: "ran", report, costBearing: !noVision, verdict: r.verdict, blocksShip: r.blocksShip });
        continue;
      }
      if (gate === "ocr") {
        const r = await checkTextLegibility({ projectId, mode });
        await persistReport(projectId, TEXT_LEGIBILITY_ARTIFACT, r);
        attempted.push({ gate, status: "ran", report, costBearing: true, verdict: r.verdict, blocksShip: r.blocksShip });
        continue;
      }
      if (gate === "product-fidelity") {
        const r = await checkFidelity({ projectId, mode });
        await persistReport(projectId, FIDELITY_ARTIFACT, r);
        attempted.push({ gate, status: "ran", report, costBearing: true, verdict: r.verdict, blocksShip: r.blocksShip });
        continue;
      }
      if (gate === "claims") {
        const r = await checkClaims({ projectId, mode });
        await persistReport(projectId, CLAIMS_ARTIFACT, r);
        attempted.push({ gate, status: "ran", report, costBearing: true, verdict: r.verdict, blocksShip: r.blocksShip });
        continue;
      }
      if (gate === "platform-spec") {
        const r = validatePlatformSpec({ projectId, platforms });
        await persistReport(projectId, PLATFORM_SPEC_ARTIFACT, r);
        attempted.push({ gate, status: "ran", report, costBearing: false, verdict: r.verdict, blocksShip: r.blocksShip });
        continue;
      }
    } catch (e) {
      // A gate that throws (e.g. a transient probe failure) is recorded as a
      // skip with the error, never crashing the whole run.
      skipped.push({
        gate,
        status: "skipped",
        report,
        costBearing: COST_BEARING_GATES.has(gate),
        reason: `gate errored: ${(e as Error).message}`,
      });
    }
  }

  // Advisory gates recorded (never run).
  const advisory: GateRun[] = [];
  for (const gate of applicable) {
    if (!ADVISORY_GATES.has(gate)) continue;
    advisory.push({
      gate,
      status: "advisory",
      report: null,
      costBearing: false,
      reason:
        gate === "distribution-pack"
          ? "advisory — produced by `ralphy unit package`, not the flywheel."
          : "advisory — produced by `ralphy project council`, not the flywheel.",
    });
  }

  // ── hand off to buildScorecard (it re-runs NOTHING; reads the persisted reports) ──
  const card = buildScorecard({ projectId, mode });

  const failures = attempted.filter((a) => a.verdict === "fail" || a.blocksShip === true);
  const nextAction =
    card.verdict === "repair" || card.verdict === "blocked"
      ? `Run \`ralphy project repair-plan ${projectId}\` to plan the fixes (the runner does not repair or spend).`
      : card.verdict === "needs-user-decision"
        ? "Some required dimensions are unverifiable — run the missing gate(s) or confirm a bypass before shipping."
        : "All required dimensions pass — form a polished Unit (`ralphy unit create`) and distribute.";

  return {
    projectId,
    mode,
    format,
    platforms,
    dryRun: false,
    plan,
    gatesAttempted: [...attempted, ...advisory],
    gatesSkipped: skipped,
    costBearingGates: attempted.filter((a) => a.costBearing).map((a) => a.gate),
    failures,
    scorecardVerdict: card.verdict,
    scorecardReason: card.reason,
    nextAction,
  };
}
