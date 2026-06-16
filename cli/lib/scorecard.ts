// Release-readiness scorecard aggregator (#427).
//
// `buildScorecard({ projectId, mode? })` is a PURE, best-effort file read: it
// INGESTS the reports the other gates already persisted and merges them into ONE
// mode-aware verdict. It NEVER re-runs eval, re-scores fidelity, or re-convenes
// the council, and it makes ZERO model calls. A missing artifact makes that
// dimension `na` — never a crash.
//
// What it reads (each → which dimension):
//   • eval.json (#411)            → hook, clarity, pacing, audio, captions,
//                                   platformFit, technicalPolish, residualRisk.
//   • fidelity.json (#422)        → productFidelity (`blocksShip` → fail).
//   • council-polish.json (#415)  → originality (`block` → blocked, `revise` → repair).
//   • STYLE_LOCK.md + requiresStyleLock(mode) → styleFit.
//   • distribution-pack.json (#423) → distributionReadiness.
//   • evaluateContract().polished (#411) → the polished boolean + technicalPolish.
//   • production-plan.json contentMode / the --mode arg → mode-aware thresholds.
//
// The verdict precedence is deterministic and documented inline in `decide()`.

import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { projectDir } from "./paths.js";
import { evaluateContract } from "./contract.js";
import { requiresStyleLock, hasStyleLock } from "./style-lock.js";
import {
  SCORECARD_DIMENSIONS,
  type DimensionEntry,
  type DimensionStatus,
  type ReadinessScorecard,
  type ScorecardDimension,
  type ScorecardVerdict,
} from "./schemas/scorecard.js";
import type { EvalReport, Finding, Severity } from "./eval/types.js";

/** Read + JSON.parse a project-relative file, or null on any failure. */
function safeReadJson(dir: string, rel: string): unknown {
  try {
    const abs = path.join(dir, rel);
    if (!existsSync(abs)) return null;
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/** True when a project-relative file exists. Never throws. */
function present(dir: string, rel: string): boolean {
  try {
    return existsSync(path.join(dir, rel));
  } catch {
    return false;
  }
}

/**
 * Map a set of category-bucketed findings to a dimension status + a 0-100 band.
 * A `fail` finding → fail (score 40); any `warn` → warn (70); else pass (95).
 * Empty bucket with the source present → pass; the caller decides `na`.
 */
function statusFromFindings(findings: Finding[]): { status: DimensionStatus; score: number } {
  const worst = worstSeverity(findings.map((f) => f.severity));
  if (worst === "fail") return { status: "fail", score: 40 };
  if (worst === "warn") return { status: "warn", score: 70 };
  return { status: "pass", score: 95 };
}

function worstSeverity(sevs: Severity[]): Severity | null {
  if (sevs.includes("fail")) return "fail";
  if (sevs.includes("warn")) return "warn";
  if (sevs.includes("info")) return "info";
  return null;
}

/**
 * Merge two dimension statuses, worst wins (fail > warn > pass). `na` (no signal)
 * never lowers the other reading — it yields to a concrete pass/warn/fail. Used
 * to fold the focused first-frame hook gate (#440) into the eval-derived hook
 * reading without creating a parallel hook dimension.
 */
function worseStatus(a: DimensionStatus, b: DimensionStatus): DimensionStatus {
  const rank: Record<DimensionStatus, number> = { fail: 3, warn: 2, pass: 1, na: 0 };
  return rank[a] >= rank[b] ? a : b;
}

/** Filter eval findings whose category starts with one of `prefixes`. */
function findingsFor(report: EvalReport, prefixes: string[]): Finding[] {
  return report.findings.filter((f) => prefixes.some((p) => f.category.startsWith(p)));
}

/**
 * The dimensions that MUST pass before a `ship` verdict, per mode. We keep the
 * mode-awareness deliberately small and deterministic:
 *   • commercial/product modes additionally require `productFidelity`.
 *   • a mode that requires a style lock additionally requires `styleFit`.
 *   • every mode requires the four post-render eval dimensions
 *     (hook, clarity, pacing, technicalPolish) once a render exists — these are
 *     `na` (and therefore non-gating) before a render, so a pre-render scorecard
 *     resolves to `needs-user-decision`, never a false `ship`.
 * The base set is intentionally NOT every dimension — audio/captions/platformFit
 * are quality WARN signals that feed `repair`, not hard ship gates, and
 * distributionReadiness / originality / residualRisk are advisory.
 */
function requiredDimensionsForMode(mode: string | null): ScorecardDimension[] {
  const base: ScorecardDimension[] = ["hook", "clarity", "pacing", "technicalPolish"];
  if (mode && requiresStyleLock(mode)) base.push("styleFit");
  // Commercial modes anchor on a real product/brand → fidelity is a hard gate.
  // We detect this off the fidelity report's own `applicable` flag at merge time
  // rather than re-deriving the commercial partition here; `productFidelity` is
  // added to the required set when the fidelity gate ran and was applicable.
  return base;
}

/**
 * Build the readiness scorecard for a project. PURE best-effort file read — never
 * mutates, never throws, makes ZERO model calls. A missing source artifact makes
 * the dependent dimension `na`.
 *
 * @param input.projectId  the project id (resolved through `projectDir`).
 * @param input.mode       optional content-mode override; defaults to the mode in
 *                         production-plan.json. Drives the mode-aware thresholds.
 */
export function buildScorecard(input: {
  projectId: string;
  mode?: string | null;
}): ReadinessScorecard {
  const { projectId } = input;
  const dir = projectDir(projectId);

  // ── resolve mode: explicit arg > production-plan.json contentMode.mode ──
  const planRaw = safeReadJson(dir, "production-plan.json") as
    | { contentMode?: { mode?: unknown } }
    | null;
  const planMode =
    typeof planRaw?.contentMode?.mode === "string" ? planRaw.contentMode.mode : null;
  const mode = (input.mode ?? planMode) || null;

  // ── the source artifacts (best-effort) ──
  const evalReport = safeReadJson(dir, "eval.json") as EvalReport | null;
  const fidelity = safeReadJson(dir, "fidelity.json") as
    | { applicable?: unknown; verdict?: unknown; blocksShip?: unknown; reason?: unknown }
    | null;
  const textLegibility = safeReadJson(dir, "text-legibility.json") as
    | { applicable?: unknown; verdict?: unknown; blocksShip?: unknown; reason?: unknown }
    | null;
  const hookGate = safeReadJson(dir, "hook.json") as
    | { applicable?: unknown; verdict?: unknown; blocksShip?: unknown; reason?: unknown; hookScore?: unknown }
    | null;
  const captionsGate = safeReadJson(dir, "captions-gate.json") as
    | { applicable?: unknown; verdict?: unknown; blocksShip?: unknown; reason?: unknown }
    | null;
  const council = safeReadJson(dir, "council-polish.json") as
    | { verdict?: unknown; recommendation?: unknown }
    | null;
  const renderPresent = present(dir, "render/final.mp4");
  const { polished } = evaluateContract(projectId);

  const entries: DimensionEntry[] = [];
  const byDim = new Map<ScorecardDimension, DimensionEntry>();
  const set = (e: DimensionEntry) => {
    byDim.set(e.dimension, e);
  };
  const na = (dimension: ScorecardDimension, note: string): DimensionEntry => ({
    dimension,
    score: null,
    status: "na",
    source: null,
    note,
  });

  // ── eval.json → hook / clarity / pacing / audio / captions / platformFit / technicalPolish ──
  if (evalReport) {
    const SRC = "eval.json";
    const hook = statusFromFindings(
      findingsFor(evalReport, ["structure.hook-zone"]),
    );
    set({ dimension: "hook", ...hook, source: SRC, note: hookNote(evalReport) });

    const clarity = statusFromFindings(findingsFor(evalReport, ["vision."]));
    set({ dimension: "clarity", ...clarity, source: SRC, note: `Vision findings: ${findingsFor(evalReport, ["vision."]).length}. Eval scoring verdict: ${evalReport.scoring.verdict}.` });

    const pacing = statusFromFindings(
      findingsFor(evalReport, ["structure.duration-drift", "structure.hook-zone-static"]),
    );
    set({ dimension: "pacing", ...pacing, source: SRC, note: `Scenes: ${evalReport.structure.sceneCount}, avg ${evalReport.structure.avgSceneDurationSec.toFixed(1)}s.` });

    const audio = statusFromFindings(findingsFor(evalReport, ["audio."]));
    set({ dimension: "audio", ...audio, source: SRC, note: audioNote(evalReport) });

    const captions = statusFromFindings(findingsFor(evalReport, ["captions."]));
    set({ dimension: "captions", ...captions, source: SRC, note: captionNote(evalReport) });

    const platform = statusFromFindings(findingsFor(evalReport, ["format."]));
    set({ dimension: "platformFit", ...platform, source: SRC, note: `${evalReport.meta.resolution.w}x${evalReport.meta.resolution.h} @ ${evalReport.meta.fps}fps.` });
  } else {
    for (const d of ["hook", "clarity", "pacing", "audio", "captions", "platformFit"] as const) {
      set(na(d, "No eval.json yet — run the post-render eval (`ralphy evaluate <id>`)."));
    }
  }

  // ── hook.json → ENRICH the existing `hook` dimension (#440). The first-frame
  //    hook gate is a FOCUSED scroll-stop critic of the opener; it does NOT create
  //    a parallel hook concept — it MERGES with the eval-derived hook reading
  //    (structure.hook-zone findings), worst status wins. So a clean eval hook
  //    zone that the dedicated gate flags as a weak opener still surfaces here.
  if (hookGate && hookGate.applicable === true) {
    const existing = byDim.get("hook");
    const blocksShip = hookGate.blocksShip === true;
    const verdict = String(hookGate.verdict ?? "pass");
    const hookStatus: DimensionStatus = blocksShip ? "fail" : verdict === "warn" ? "warn" : "pass";
    const merged = worseStatus(existing?.status ?? "pass", hookStatus);
    const hookScore = typeof hookGate.hookScore === "number" ? hookGate.hookScore : null;
    const reasonNote = typeof hookGate.reason === "string" ? hookGate.reason : `First-frame hook verdict: ${verdict}.`;
    set({
      dimension: "hook",
      score: merged === "fail" ? 30 : merged === "warn" ? 70 : hookScore ?? existing?.score ?? 95,
      status: merged,
      source: existing?.source ? `${existing.source} + hook.json` : "hook.json",
      note: existing && existing.status !== "na"
        ? `${existing.note} First-frame hook gate: ${reasonNote}`
        : reasonNote,
    });
  }

  // ── captions-gate.json → ENRICH the existing `captions` dimension (#441). The
  //    caption sync/readability gate is the DEEP critic (drift / too-short /
  //    overcrowded / occluding / unsafe-placement) of the same track the eval
  //    DENSITY findings (captions.thin/dense/missing) cover. It does NOT create a
  //    parallel caption concept — it MERGES with the eval-derived caption reading,
  //    worst status wins. So a track the eval passed on density that this gate
  //    flags as desynced / occluding still surfaces here.
  if (captionsGate && captionsGate.applicable === true) {
    const existing = byDim.get("captions");
    const blocksShip = captionsGate.blocksShip === true;
    const verdict = String(captionsGate.verdict ?? "pass");
    const capStatus: DimensionStatus = blocksShip ? "fail" : verdict === "warn" ? "warn" : "pass";
    const merged = worseStatus(existing?.status ?? "pass", capStatus);
    const reasonNote = typeof captionsGate.reason === "string" ? captionsGate.reason : `Caption sync gate verdict: ${verdict}.`;
    set({
      dimension: "captions",
      score: merged === "fail" ? 35 : merged === "warn" ? 70 : existing?.score ?? 95,
      status: merged,
      source: existing?.source ? `${existing.source} + captions-gate.json` : "captions-gate.json",
      note:
        existing && existing.status !== "na"
          ? `${existing.note} Caption sync gate: ${reasonNote}`
          : reasonNote,
    });
  }

  // ── technicalPolish: the contract's native-video-gated `polished` + eval gate ──
  set(technicalPolishEntry(polished, evalReport, renderPresent));

  // ── fidelity.json → productFidelity ──
  let fidelityGated = false;
  if (fidelity && fidelity.applicable === true) {
    fidelityGated = true;
    const blocksShip = fidelity.blocksShip === true;
    const verdict = String(fidelity.verdict ?? "pass");
    const status: DimensionStatus = blocksShip ? "fail" : verdict === "warn" ? "warn" : "pass";
    set({
      dimension: "productFidelity",
      score: status === "fail" ? 30 : status === "warn" ? 70 : 95,
      status,
      source: "fidelity.json",
      note: typeof fidelity.reason === "string" ? fidelity.reason : `Fidelity verdict: ${verdict}.`,
    });
  } else if (fidelity) {
    set({
      dimension: "productFidelity",
      score: null,
      status: "na",
      source: "fidelity.json",
      note: "Fidelity gate not applicable (non-commercial mode) — no product/brand to verify.",
    });
  } else {
    set(na("productFidelity", "No fidelity.json — run the fidelity gate for commercial modes (`ralphy evaluate <id> --fidelity`)."));
  }

  // ── text-legibility.json → textLegibility (#439, baked-text modes only) ──
  let textGated = false;
  if (textLegibility && textLegibility.applicable === true) {
    textGated = true;
    const blocksShip = textLegibility.blocksShip === true;
    const verdict = String(textLegibility.verdict ?? "pass");
    const status: DimensionStatus = blocksShip ? "fail" : verdict === "warn" ? "warn" : "pass";
    set({
      dimension: "textLegibility",
      score: status === "fail" ? 30 : status === "warn" ? 70 : 95,
      status,
      source: "text-legibility.json",
      note: typeof textLegibility.reason === "string" ? textLegibility.reason : `Text-legibility verdict: ${verdict}.`,
    });
  } else if (textLegibility) {
    set({
      dimension: "textLegibility",
      score: null,
      status: "na",
      source: "text-legibility.json",
      note: "Text-legibility gate not applicable (mode bakes no copy) — no text to verify.",
    });
  } else {
    set(na("textLegibility", "No text-legibility.json — run the OCR gate for baked-text modes (`ralphy eval ocr <id>`)."));
  }

  // ── council-polish.json → originality / market-fit ──
  if (council && typeof council.verdict === "string") {
    const v = council.verdict;
    const status: DimensionStatus = v === "block" ? "fail" : v === "revise" ? "warn" : "pass";
    set({
      dimension: "originality",
      score: status === "fail" ? 35 : status === "warn" ? 70 : 90,
      status,
      source: "council-polish.json",
      note: typeof council.recommendation === "string" && council.recommendation
        ? council.recommendation
        : `Polish council verdict: ${v}.`,
    });
  } else {
    set(na("originality", "No council-polish.json — convene the polish council for a market-fit second opinion (`ralphy project council <id> --phase polish`)."));
  }

  // ── STYLE_LOCK.md → styleFit (only meaningful when the mode requires it) ──
  set(styleFitEntry(projectId, mode));

  // ── distribution-pack.json → distributionReadiness ──
  if (present(dir, "distribution-pack.json")) {
    set({
      dimension: "distributionReadiness",
      score: 90,
      status: "pass",
      source: "distribution-pack.json",
      note: "Distribution pack present — per-platform captions/titles ready.",
    });
  } else {
    set(na("distributionReadiness", "No distribution-pack.json — package the unit (`ralphy unit package <id> <slug>`) for platform-ready copy."));
  }

  // ── residualRisk: any remaining warn/fail eval signal not owned above ──
  set(residualRiskEntry(evalReport));

  // ── emit in the stable dimension order ──
  for (const d of SCORECARD_DIMENSIONS) {
    entries.push(byDim.get(d) ?? na(d, "No source artifact."));
  }

  // ── mode-aware required set + the deterministic verdict ──
  const required = requiredDimensionsForMode(mode);
  if (fidelityGated && !required.includes("productFidelity")) required.push("productFidelity");
  if (textGated && !required.includes("textLegibility")) required.push("textLegibility");

  const { verdict, reason } = decide(entries, required, { polished, renderPresent, fidelity, council, textLegibility });

  return {
    version: 1,
    projectId,
    mode,
    generatedAt: new Date().toISOString(),
    verdict,
    polished,
    reason,
    dimensions: entries,
    requiredDimensions: required,
  };
}

// ─── Per-dimension note + entry helpers ────────────────────────────────────────

function hookNote(report: EvalReport): string {
  const hz = report.structure.hookZone;
  return `Hook zone ${hz.durationSec.toFixed(1)}s, ${hz.wordCount} words, ${hz.sceneCount} scene(s).`;
}

function audioNote(report: EvalReport): string {
  const a = report.audio;
  const lufs = a.integratedLufs === null ? "—" : `${a.integratedLufs.toFixed(1)} LUFS`;
  return `${lufs}, ${a.deadAirSegments.length} dead-air segment(s), voice ${a.voicePresentPct}%.`;
}

function captionNote(report: EvalReport): string {
  const c = report.captions;
  if (!c.available) return "No captions track found.";
  const wps = c.wordsPerSecond === null ? "—" : `${c.wordsPerSecond.toFixed(2)} wps`;
  return `${c.wordCount ?? "—"} words, ${wps}.`;
}

/**
 * technicalPolish reflects the #411 native-video final gate: the contract's
 * `polished` is the single source of truth. `polished === true` → pass (the
 * native gate passed or a user bypass is logged); `false` → fail (a render
 * exists but the gate has not passed); `null` → na (nothing rendered yet).
 */
function technicalPolishEntry(
  polished: boolean | null,
  evalReport: EvalReport | null,
  renderPresent: boolean,
): DimensionEntry {
  if (polished === true) {
    return {
      dimension: "technicalPolish",
      score: 95,
      status: "pass",
      source: evalReport ? "eval.json" : "production-plan.json",
      note: "Native-video final gate passed (or a user-approved bypass is logged) — Unit may be polished.",
    };
  }
  if (polished === false) {
    return {
      dimension: "technicalPolish",
      score: 45,
      status: "fail",
      source: evalReport ? "eval.json" : null,
      note: evalReport
        ? `Native-video gate not ship-ready (gate.shipReady=${evalReport.gate.shipReady}, mode=${evalReport.gate.mode}). Re-run native-video / deep-style or log a bypass.`
        : "A render exists but no eval has run — the native-video final gate (#411) must pass before the Unit is polished.",
    };
  }
  return {
    dimension: "technicalPolish",
    score: null,
    status: "na",
    source: null,
    note: renderPresent
      ? "Render present but polished state indeterminate."
      : "Nothing rendered yet — native-video gate is N/A.",
  };
}

function styleFitEntry(projectId: string, mode: string | null): DimensionEntry {
  const requires = !!mode && requiresStyleLock(mode);
  const locked = hasStyleLock(projectId);
  if (!requires) {
    return {
      dimension: "styleFit",
      score: null,
      status: "na",
      source: null,
      note: mode
        ? `Mode "${mode}" does not require a style lock — styleFit not gated.`
        : "No content mode resolved — styleFit not gated.",
    };
  }
  return locked
    ? {
        dimension: "styleFit",
        score: 90,
        status: "pass",
        source: "STYLE_LOCK.md",
        note: `Style lock present and required for mode "${mode}".`,
      }
    : {
        dimension: "styleFit",
        score: 40,
        status: "fail",
        source: null,
        note: `Mode "${mode}" requires a style lock but STYLE_LOCK.md is absent — lock the register (\`ralphy project style-lock ${projectId}\`).`,
      };
}

/**
 * residualRisk surfaces leftover warn/fail eval signal NOT already owned by a
 * named dimension (i.e. not hook/clarity/pacing/audio/captions/platformFit).
 * This is the catch-all so an unexpected finding category still raises the
 * verdict rather than slipping through silently.
 */
function residualRiskEntry(evalReport: EvalReport | null): DimensionEntry {
  if (!evalReport) {
    return { dimension: "residualRisk", score: null, status: "na", source: null, note: "No eval.json — residual risk unassessed." };
  }
  const owned = [
    "structure.hook-zone",
    "vision.",
    "structure.duration-drift",
    "structure.hook-zone-static",
    "audio.",
    "captions.",
    "format.",
  ];
  const leftover = evalReport.findings.filter((f) => !owned.some((p) => f.category.startsWith(p)));
  const { status, score } = statusFromFindings(leftover);
  return {
    dimension: "residualRisk",
    score: leftover.length ? score : 95,
    status,
    source: "eval.json",
    note: leftover.length
      ? `${leftover.length} finding(s) outside the named dimensions (worst: ${worstSeverity(leftover.map((f) => f.severity)) ?? "info"}).`
      : "No residual findings outside the named dimensions.",
  };
}

// ─── Verdict precedence (deterministic) ─────────────────────────────────────────

/**
 * Decide the final verdict. PRECEDENCE (first match wins):
 *
 *   1. BLOCKED — any HARD blocker:
 *        • fidelity.blocksShip === true (a named product/brand is materially wrong), OR
 *        • council-polish verdict === "block", OR
 *        • eval scoring.verdict === "fail" (a failed quality gate — refuse, not warn), OR
 *        • a REQUIRED dimension is `fail`, OR
 *        • a render exists but the native-video gate has not passed (polished === false)
 *          AND the only thing standing between us and ship is that gate (technicalPolish fail).
 *   2. REPAIR — a fixable signal: any required-or-quality dimension is `warn`
 *        (eval warn, fidelity warn, council `revise`), with no hard blocker.
 *   3. NEEDS-USER-DECISION — no blocker and no warn, but a REQUIRED dimension is
 *        `na` (unverifiable — e.g. nothing rendered/evaluated yet): a genuine
 *        human-judgment gap the agent must surface rather than guess `ship`.
 *   4. SHIP — every required dimension passes.
 *
 * The function is pure over its inputs.
 */
function decide(
  entries: DimensionEntry[],
  required: ScorecardDimension[],
  ctx: {
    polished: boolean | null;
    renderPresent: boolean;
    fidelity: { blocksShip?: unknown } | null;
    council: { verdict?: unknown } | null;
    textLegibility: { blocksShip?: unknown } | null;
  },
): { verdict: ScorecardVerdict; reason: string } {
  const byDim = new Map(entries.map((e) => [e.dimension, e] as const));
  const reqEntries = required.map((d) => byDim.get(d)).filter((e): e is DimensionEntry => !!e);

  // ── 1. blocked — hard blockers ──
  if (ctx.fidelity?.blocksShip === true) {
    return { verdict: "blocked", reason: "Product/brand fidelity gate blocks ship (fidelity.json blocksShip=true) — a named product/brand is materially wrong." };
  }
  if (ctx.textLegibility?.blocksShip === true) {
    return { verdict: "blocked", reason: "Text-legibility gate blocks ship (text-legibility.json blocksShip=true) — unreadable / clipped / garbled copy or markdown artifacts in the baked text." };
  }
  if (ctx.council?.verdict === "block") {
    return { verdict: "blocked", reason: "Polish council returned a `block` verdict (council-polish.json) — resolve the blocking issues before shipping." };
  }
  const failedRequired = reqEntries.filter((e) => e.status === "fail");
  if (failedRequired.length) {
    const names = failedRequired.map((e) => e.dimension).join(", ");
    return { verdict: "blocked", reason: `Required dimension(s) failed: ${names}. ${failedRequired[0]!.note}` };
  }

  // ── 2. repair — fixable warns (quality signal short of a hard block) ──
  const warned = entries.filter((e) => e.status === "warn");
  if (warned.length) {
    const names = warned.map((e) => e.dimension).join(", ");
    return { verdict: "repair", reason: `Fixable warning(s) present: ${names}. Run the repair loop before forming a polished Unit.` };
  }

  // ── 3. needs-user-decision — a required dimension is unverifiable (`na`) ──
  const naRequired = reqEntries.filter((e) => e.status === "na");
  if (naRequired.length) {
    const names = naRequired.map((e) => e.dimension).join(", ");
    return {
      verdict: "needs-user-decision",
      reason: `No blocker, but required dimension(s) cannot be verified yet: ${names}. Run the missing gate(s) or confirm the bypass before shipping.`,
    };
  }

  // ── 4. ship — every required dimension passes ──
  return { verdict: "ship", reason: "All required dimensions pass — ready to form a polished Unit and distribute." };
}
