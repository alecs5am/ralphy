// Built-in evaluator criteria for the per-workspace evaluator framework (#470).
//
// Six generic, config-driven check types any workspace can reference from its
// `evaluators.json` rubric (#468). THREE are deterministic code validators
// (registered via `registerWorkspaceValidator`); THREE are canonical deep-vision
// rubric fragments (registered via `registerWorkspaceVisionRubric`, resolved by
// `validatorId` in the engine's vision pass — an inline `rubricPrompt` still wins).
//
// HARD RULE: every numeric bar comes from `criterion.threshold` with a DOCUMENTED
// default fallback. NO universe-specific (Silent-Hill) literals live here.
//
// The deterministic validators parse the HyperFrames `<project>/index.html`
// (audio tags + technique markers) ROBUSTLY with linear string scans and DEGRADE
// GRACEFULLY: a missing index.html / metrics file / signal yields an `info` (or a
// criterion-level `na` via a single info finding), never a throw.
//
// English-only-on-disk.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  registerWorkspaceValidator,
  registerWorkspaceVisionRubric,
  type WorkspaceValidatorContext,
} from "./workspace-evaluators.js";
import { workspaceDir } from "../paths.js";
import type { Finding, Severity } from "./types.js";

// ─── Threshold reading (config-driven, with documented defaults) ─────────────────

/** A criterion threshold is `number | string | boolean | object` (#468 schema). */
type ThresholdObj = Record<string, unknown>;

function thresholdObj(t: WorkspaceValidatorContext["criterion"]["threshold"]): ThresholdObj {
  return t && typeof t === "object" && !Array.isArray(t) ? (t as ThresholdObj) : {};
}

function num(o: ThresholdObj, key: string, def: number): number {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

function bool(o: ThresholdObj, key: string, def: boolean): boolean {
  const v = o[key];
  return typeof v === "boolean" ? v : def;
}

function strArr(o: ThresholdObj, key: string, def: string[]): string[] {
  const v = o[key];
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : def;
}

function str(o: ThresholdObj, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ─── Finding helper ──────────────────────────────────────────────────────────────

let _fid = 0;
function mkFinding(
  category: string,
  severity: Severity,
  message: string,
  fixHint: string,
): Finding {
  _fid += 1;
  return {
    id: `WC${_fid}`,
    category,
    severity,
    sceneIndex: null,
    timestampSec: null,
    message,
    fixHint,
    fixCommand: null,
  };
}

// ─── index.html signal parsing (robust, linear) ─────────────────────────────────

interface AudioTag {
  raw: string;
  id: string | null;
  src: string | null;
  startSec: number | null;
  durationSec: number | null;
  trackIndex: number | null;
}

interface CompositionSignals {
  found: boolean;
  audio: AudioTag[];
  distinctTracks: number;
  sfxCount: number;
  voiceClips: AudioTag[];
  captionCount: number;
  /** Presence of each editing technique by keyword family. */
  techniques: Record<string, boolean>;
}

const EMPTY_SIGNALS: CompositionSignals = {
  found: false,
  audio: [],
  distinctTracks: 0,
  sfxCount: 0,
  voiceClips: [],
  captionCount: 0,
  techniques: {},
};

/** Canonical editing-technique families, each matched by an OR-list of markers. */
const TECHNIQUE_MARKERS: Record<string, string[]> = {
  countdown: ["countdown", "timer"],
  "freeze-or-boomerang": ["freeze", "boomerang"],
  "death-screen": ["death", "game-over", "you-died"],
  flashes: ["flash"],
  selector: ["selector", "choice", "fork"],
  "title-card": ["title-card", "title card", "titlecard", "hook-title"],
};

function attrNum(raw: string, attr: string): number | null {
  const m = raw.match(new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i"));
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function attrStr(raw: string, attr: string): string | null {
  const m = raw.match(new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

/** True when an audio tag is an SFX clip (id or src path contains "sfx"). */
function isSfx(a: AudioTag): boolean {
  const hay = `${a.id ?? ""} ${a.src ?? ""}`.toLowerCase();
  return /sfx/.test(hay);
}

/** True when an audio tag is a voice/VO clip (id starting a/c/n and not SFX/bgm/music). */
function isVoice(a: AudioTag): boolean {
  if (isSfx(a)) return false;
  const id = (a.id ?? "").toLowerCase();
  const src = (a.src ?? "").toLowerCase();
  if (/bgm|music|soundtrack/.test(`${id} ${src}`)) return false;
  return /^[acn]\d/.test(id) || /^[acn]hub/.test(id) || /\b(voice|vo|narrat)/.test(src);
}

/** Parse the composition HTML for the signals the deterministic validators read. */
function parseComposition(html: string): CompositionSignals {
  const audio: AudioTag[] = [];
  const tagRe = /<audio\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const raw = m[0];
    audio.push({
      raw,
      id: attrStr(raw, "id"),
      src: attrStr(raw, "src"),
      startSec: attrNum(raw, "data-start"),
      durationSec: attrNum(raw, "data-duration"),
      trackIndex: attrNum(raw, "data-track-index"),
    });
  }

  const tracks = new Set<number>();
  for (const a of audio) if (a.trackIndex !== null) tracks.add(a.trackIndex);

  const sfxCount = audio.filter(isSfx).length;
  const voiceClips = audio.filter(isVoice);

  // Caption presence: count distinct caption markers (class / id / comment).
  const lower = html.toLowerCase();
  const captionCount = (lower.match(/caption/g) ?? []).length;

  const techniques: Record<string, boolean> = {};
  for (const [family, markers] of Object.entries(TECHNIQUE_MARKERS)) {
    techniques[family] = markers.some((kw) => lower.includes(kw.toLowerCase()));
  }

  return {
    found: true,
    audio,
    distinctTracks: tracks.size,
    sfxCount,
    voiceClips,
    captionCount,
    techniques,
  };
}

/** Read + parse `<project>/index.html`, or EMPTY_SIGNALS when absent/unreadable. */
function readComposition(projectDir: string): CompositionSignals {
  const p = path.join(projectDir, "index.html");
  if (!existsSync(p)) return EMPTY_SIGNALS;
  try {
    return parseComposition(readFileSync(p, "utf8"));
  } catch {
    return EMPTY_SIGNALS;
  }
}

const NO_COMPOSITION_HINT =
  "Author the HyperFrames composition at <project>/index.html (the deterministic density/edit checks parse it).";

// ─── 1. material-density (deterministic) ─────────────────────────────────────────
//
// THRESHOLD KEYS (all from criterion.threshold, with defaults):
//   • minAudioTracks      (number,   default 4)  — distinct data-track-index count.
//   • minSfx              (number,   default 8)  — audio clips whose id/src match "sfx".
//   • requireCaptions     (boolean,  default true) — at least one caption marker present.
//   • minCaptions         (number,   default 2)  — caption-marker count when required.
//   • requiredTechniques  (string[], default the 6 families) — editing-technique coverage:
//       countdown | freeze-or-boomerang | death-screen | flashes | selector | title-card.
// DEGRADES: no index.html → single info finding (the criterion verdict is then
// pass/info-only, never a crash). Every sub-check is ACTIVE when the file exists.
function materialDensity(ctx: WorkspaceValidatorContext): Finding[] {
  const t = thresholdObj(ctx.criterion.threshold);
  const sig = readComposition(ctx.projectDir);
  if (!sig.found) {
    return [
      mkFinding(
        "workspace.material-density.no-composition",
        "info",
        "No index.html found — cannot measure material density (audio tracks / SFX / captions / techniques).",
        NO_COMPOSITION_HINT,
      ),
    ];
  }

  const findings: Finding[] = [];
  const minTracks = num(t, "minAudioTracks", 4);
  const minSfx = num(t, "minSfx", 8);
  const requireCaptions = bool(t, "requireCaptions", true);
  const minCaptions = num(t, "minCaptions", 2);
  const requiredTechniques = strArr(t, "requiredTechniques", Object.keys(TECHNIQUE_MARKERS));

  if (sig.distinctTracks < minTracks) {
    findings.push(
      mkFinding(
        "workspace.material-density.audio-tracks",
        "warn",
        `Only ${sig.distinctTracks} distinct audio track(s); the bar is ${minTracks}. A sparse mix reads as under-produced.`,
        "Layer more audio tracks (ambient bed, diegetic SFX, VO, music) — see the benchmark episode's density.",
      ),
    );
  }
  if (sig.sfxCount < minSfx) {
    findings.push(
      mkFinding(
        "workspace.material-density.sfx",
        "warn",
        `Only ${sig.sfxCount} SFX clip(s); the bar is ${minSfx}. A continuous diegetic SFX bed is part of the register.`,
        "Add a diegetic SFX hit on (nearly) every beat plus a continuous ambient bed.",
      ),
    );
  }
  if (requireCaptions && sig.captionCount < minCaptions) {
    findings.push(
      mkFinding(
        "workspace.material-density.captions",
        "warn",
        `Caption markers present: ${sig.captionCount}; the bar is ${minCaptions}. Captions are missing or too thin.`,
        "Add the caption band layer (narrator/diegetic captions) to the composition.",
      ),
    );
  }
  const missing = requiredTechniques.filter((fam) => !sig.techniques[fam]);
  if (missing.length > 0) {
    findings.push(
      mkFinding(
        "workspace.material-density.techniques",
        "warn",
        `Missing editing technique(s): ${missing.join(", ")}. The benchmark register uses all of: ${requiredTechniques.join(", ")}.`,
        "Add the missing technique beats (countdown / freeze-or-boomerang / death-screen / flashes / selector / title-card) to the cut.",
      ),
    );
  }
  return findings;
}

// ─── 2. edit-correctness (deterministic) ─────────────────────────────────────────
//
// THRESHOLD KEYS:
//   • sfxToleranceSec     (number,  default 0.15) — max |SFX start − nearest technique beat|.
//       NOTE: technique BEAT timestamps are NOT carried in the composition data we
//       parse (techniques are keyword markers, not timestamped beats). This sub-check
//       is therefore DEGRADED-TO-INFO unless a timestamped beat source is present.
//   • requireForkHoldsBothChoices (boolean, default true) — fork/selector technique present.
//   • requireDeathBeats           (boolean, default true) — a death-screen beat present.
//   • requireCountdownOnFreeze    (boolean, default true) — countdown co-present with a
//       baked freeze/boomerang it can sit on.
// ACTIVE sub-checks (derivable from the parsed composition):
//   ✓ VO no-overlap   — no two VOICE clips overlap in [start, start+dur) on the SAME track.
//   ✓ fork-holds-both — selector/choice/fork technique marker present (idle-hold proxy).
//   ✓ death-beats     — death-screen technique marker present.
//   ✓ countdown-on-freeze — countdown present ⇒ a freeze/boomerang must also be present.
// DEGRADED-TO-INFO (signal genuinely not in the data — no fabricated pass/fail):
//   ~ SFX timing sanity — no per-technique beat timestamps to compare against.
function editCorrectness(ctx: WorkspaceValidatorContext): Finding[] {
  const t = thresholdObj(ctx.criterion.threshold);
  const sig = readComposition(ctx.projectDir);
  if (!sig.found) {
    return [
      mkFinding(
        "workspace.edit-correctness.no-composition",
        "info",
        "No index.html found — cannot check edit correctness (VO overlap, fork holds, death beats, countdown gating).",
        NO_COMPOSITION_HINT,
      ),
    ];
  }

  const findings: Finding[] = [];
  const tolSec = num(t, "sfxToleranceSec", 0.15);
  const requireFork = bool(t, "requireForkHoldsBothChoices", true);
  const requireDeath = bool(t, "requireDeathBeats", true);
  const requireCountdownOnFreeze = bool(t, "requireCountdownOnFreeze", true);

  // ✓ VO no-overlap — group voice clips by track, sort by start, flag overlaps.
  const byTrack = new Map<number, AudioTag[]>();
  for (const v of sig.voiceClips) {
    if (v.startSec === null || v.durationSec === null) continue;
    const key = v.trackIndex ?? -1;
    let bucket = byTrack.get(key);
    if (!bucket) byTrack.set(key, (bucket = []));
    bucket.push(v);
  }
  for (const [track, clips] of byTrack) {
    const sorted = [...clips].sort((a, b) => (a.startSec! - b.startSec!));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const prevEnd = prev.startSec! + prev.durationSec!;
      if (cur.startSec! < prevEnd - 1e-6) {
        findings.push(
          mkFinding(
            "workspace.edit-correctness.vo-overlap",
            "warn",
            `VO clips overlap on track ${track === -1 ? "(unspecified)" : track}: "${prev.id ?? "?"}" ends at ${prevEnd.toFixed(2)}s but "${cur.id ?? "?"}" starts at ${cur.startSec!.toFixed(2)}s.`,
            "Two VO lines must not overlap in time; push the later clip past the prior clip's end or trim the lead-out silence.",
          ),
        );
      }
    }
  }

  // ✓ fork holds both choices (idle-hold) — selector/choice/fork marker present.
  if (requireFork && !sig.techniques.selector) {
    findings.push(
      mkFinding(
        "workspace.edit-correctness.fork-hold",
        "warn",
        "No selector/choice/fork beat detected — the fork should hold BOTH choices on a baked idle-hold.",
        "Add the choice selector overlay and ensure the fork holds long enough to read both options.",
      ),
    );
  }

  // ✓ death beats present.
  if (requireDeath && !sig.techniques["death-screen"]) {
    findings.push(
      mkFinding(
        "workspace.edit-correctness.death-beats",
        "warn",
        "No death-screen beat detected — the format expects death beats on the losing branches.",
        "Add the death-screen beat (flash + chroma) to each losing branch.",
      ),
    );
  }

  // ✓ countdown sits on a baked freeze/boomerang.
  if (requireCountdownOnFreeze && sig.techniques.countdown && !sig.techniques["freeze-or-boomerang"]) {
    findings.push(
      mkFinding(
        "workspace.edit-correctness.countdown-freeze",
        "warn",
        "A countdown/timer is present but no baked freeze/boomerang was detected for it to sit on — the timer must overlay a baked freeze.",
        "Bake a freeze (or boomerang) at the choice moment so the countdown overlay sits on a held frame, not a moving shot.",
      ),
    );
  }

  // ~ SFX timing sanity — DEGRADED: the composition carries technique markers, not
  //   timestamped technique beats, so there is no beat timeline to diff SFX against.
  findings.push(
    mkFinding(
      "workspace.edit-correctness.sfx-timing-unavailable",
      "info",
      `SFX-to-beat timing sanity (±${tolSec.toFixed(2)}s) was not checked: the composition does not carry timestamped technique beats to diff SFX start times against.`,
      "Emit per-technique beat timestamps (a beat-timeline) alongside the composition to enable the SFX-timing check.",
    ),
  );

  return findings;
}

// ─── 3. insta-metric-fit (deterministic) ─────────────────────────────────────────
//
// THRESHOLD KEYS:
//   • metricsFile         (string,  default "<project>/metrics.json") — recorded metrics path.
//       Relative paths resolve under the project dir. When absent, falls back to the
//       workspace `metrics-benchmarks.json` (#471 authors that). No file → `na` + info.
//   • maxTimeToFirstChoiceSec (number, default 3)  — time-to-first-choice ceiling.
//   • maxFirstBeatSec         (number, default 5)  — first beat length without a cut ceiling.
//   • minAvgWatchPct          (number, default 30) — avg-watch ÷ duration floor (percent).
// METRICS FILE KEYS (read, all optional): timeToFirstChoiceSec, firstBeatSec,
//   avgWatchSec, durationSec, avgWatchPct (used directly if present).
// DEGRADES: missing metrics file → single info finding (criterion `na`, NOT a fail) —
// the project simply has not recorded metrics yet.
function instaMetricFit(ctx: WorkspaceValidatorContext): Finding[] {
  const t = thresholdObj(ctx.criterion.threshold);
  const metricsRel = str(t, "metricsFile") ?? "metrics.json";
  const primary = path.isAbsolute(metricsRel)
    ? metricsRel
    : path.join(ctx.projectDir, metricsRel);

  let metricsPath: string | null = null;
  if (existsSync(primary)) {
    metricsPath = primary;
  } else {
    // Fallback: the workspace-level benchmark metrics (#471).
    const wsFallback = path.join(workspaceDir(resolveWorkspaceSlug(ctx)), "metrics-benchmarks.json");
    if (existsSync(wsFallback)) metricsPath = wsFallback;
  }

  if (!metricsPath) {
    return [
      mkFinding(
        "workspace.insta-metric-fit.no-metrics",
        "info",
        "No recorded metrics file found (project metrics.json or workspace metrics-benchmarks.json) — the project has not recorded Instagram metrics yet.",
        "Record metrics to <project>/metrics.json (or the workspace metrics-benchmarks.json) to enable the metric-fit check.",
      ),
    ];
  }

  let metrics: Record<string, unknown>;
  try {
    metrics = JSON.parse(readFileSync(metricsPath, "utf8")) as Record<string, unknown>;
  } catch {
    return [
      mkFinding(
        "workspace.insta-metric-fit.bad-metrics",
        "info",
        `Metrics file at ${metricsPath} could not be parsed as JSON — skipping the metric-fit check.`,
        "Fix the metrics JSON so it parses (object with numeric metric fields).",
      ),
    ];
  }

  const findings: Finding[] = [];
  const maxTTFC = num(t, "maxTimeToFirstChoiceSec", 3);
  const maxFirstBeat = num(t, "maxFirstBeatSec", 5);
  const minAvgWatchPct = num(t, "minAvgWatchPct", 30);

  const mNum = (k: string): number | null => {
    const v = metrics[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const ttfc = mNum("timeToFirstChoiceSec");
  if (ttfc !== null && ttfc >= maxTTFC) {
    findings.push(
      mkFinding(
        "workspace.insta-metric-fit.time-to-first-choice",
        "warn",
        `Time-to-first-choice ${ttfc.toFixed(2)}s ≥ the ${maxTTFC}s ceiling — the first decision arrives too late.`,
        "Move the first fork earlier; open closer to the choice to stop the scroll.",
      ),
    );
  }

  const firstBeat = mNum("firstBeatSec");
  if (firstBeat !== null && firstBeat >= maxFirstBeat) {
    findings.push(
      mkFinding(
        "workspace.insta-metric-fit.first-beat-length",
        "warn",
        `First beat runs ${firstBeat.toFixed(2)}s without a cut ≥ the ${maxFirstBeat}s ceiling — a long static opener leaks the hook.`,
        "Add a cut/pattern-interrupt inside the first beat so it never holds longer than the ceiling.",
      ),
    );
  }

  // avg-watch percentage: use a recorded percentage, else derive from avgWatch/duration.
  let avgWatchPct = mNum("avgWatchPct");
  const avgWatch = mNum("avgWatchSec");
  const duration = mNum("durationSec");
  if (avgWatchPct === null && avgWatch !== null && duration !== null && duration > 0) {
    avgWatchPct = (avgWatch / duration) * 100;
  }
  if (avgWatchPct !== null && avgWatchPct <= minAvgWatchPct) {
    findings.push(
      mkFinding(
        "workspace.insta-metric-fit.avg-watch",
        "warn",
        `Average watch ${avgWatchPct.toFixed(1)}% of duration ≤ the ${minAvgWatchPct}% floor — retention is below the bar.`,
        "Tighten pacing, cut dead beats, and front-load the payoff to lift average watch percentage.",
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      mkFinding(
        "workspace.insta-metric-fit.ok",
        "info",
        "Recorded metrics clear all configured Instagram-fit bars (time-to-first-choice, first-beat length, avg-watch %).",
        "No action needed.",
      ),
    );
  }
  return findings;
}

/** Resolve the workspace slug for the metrics fallback path. */
function resolveWorkspaceSlug(ctx: WorkspaceValidatorContext): string {
  // The config does not carry the slug; derive it from the project dir layout
  // (.ralphy/workspaces/<ws>/projects/<id>). Fall back to "default".
  const parts = ctx.projectDir.split(path.sep);
  const wi = parts.lastIndexOf("workspaces");
  return wi >= 0 && parts[wi + 1] ? parts[wi + 1] : "default";
}

// ─── Vision rubric fragments (#470) — generic, harsh, reusable instructions ──────

const SCENARIO_FIDELITY_RUBRIC = [
  "SCENARIO FIDELITY — judge the branching-narrative STRUCTURE, not the look.",
  "Score against the configured thresholds and the workspace STYLE LOCK; do not assume any specific universe's numbers.",
  "Check, harshly and specifically:",
  "1. Consequence-narration coverage: nearly every choice's outcome (win AND loss branches) is explicitly narrated/shown. The bar is the configured `minConsequenceCoveragePct` (default 90%). Cite any choice whose consequence is silent or ambiguous, with its timestamp.",
  "2. 50/50 choices: each fork presents two options that read as genuinely balanced (no obviously-correct option, no telegraphed trap leaking the other branch's tell). Flag any lopsided fork.",
  "3. Binary-funnel structure: the piece is a clean binary decision funnel (choose → consequence → next choice), not a linear monologue or a branch that dead-ends without resolution.",
  "4. Target duration: total runtime sits within the configured target band. Flag an over-long tail or a rushed/under-length cut.",
  "Be specific with timestamps. Generic praise is forbidden.",
].join("\n  ");

const CHARACTER_DESIGN_COHESION_RUBRIC = [
  "CHARACTER-DESIGN COHESION — judge the character RENDER register and cross-scene identity.",
  "Score against the workspace STYLE LOCK (it defines the exact register) and the configured thresholds.",
  "Check, harshly and specifically:",
  "1. On-spec rendering register: characters match the STYLE LOCK's stated 3D/poly register (e.g. crude low-poly) and are NOT drifting toward a cinematic/AAA render OR toward a blocky voxel/Minecraft look. Flag any frame that breaks the register, with a timestamp.",
  "2. Identity stability across scenes: a recurring character keeps the same face, build, outfit, and silhouette from scene to scene. Flag any scene where the character morphs, swaps outfit, or reads as a different person.",
  "Cite the offending scene + timestamp for every flag. Do not pass on a clean first scene if later scenes drift.",
].join("\n  ");

const LOCATION_CONSISTENCY_RUBRIC = [
  "LOCATION CONSISTENCY — judge environment continuity across the cut.",
  "Score against the workspace STYLE LOCK and the configured thresholds.",
  "Check, harshly and specifically:",
  "1. Previous-scene continuity: each scene's environment is consistent with the adjacent scene it continues (same room/world geometry, lighting, palette) — no jarring location swap mid-branch.",
  "2. No hallucination drift: the model has not invented off-spec set pieces, signage, or geometry that contradict the established location.",
  "3. Persistent world-state: state established earlier (weather, fog/ash, damage, time-of-day, props placed) persists and does not silently reset between scenes.",
  "Cite the scene + timestamp for every continuity break. A dead-still / lifeless world that never carries its established state forward is a fail, not a pass.",
].join("\n  ");

// ─── Registration ────────────────────────────────────────────────────────────────

let _registered = false;

/**
 * Register all six builtin criteria — 3 deterministic validators + 3 vision
 * rubric fragments. Idempotent: the runner calls this once per `runWorkspaceEval`.
 */
export function registerBuiltinWorkspaceValidators(): void {
  if (_registered) return;
  _registered = true;

  // Deterministic validators (code-only, no model).
  registerWorkspaceValidator("material-density", materialDensity);
  registerWorkspaceValidator("edit-correctness", editCorrectness);
  registerWorkspaceValidator("insta-metric-fit", instaMetricFit);

  // Vision rubric fragments (resolved by validatorId in the engine's vision pass;
  // an inline rubricPrompt on the criterion still wins).
  registerWorkspaceVisionRubric("scenario-fidelity", SCENARIO_FIDELITY_RUBRIC);
  registerWorkspaceVisionRubric("character-design-cohesion", CHARACTER_DESIGN_COHESION_RUBRIC);
  registerWorkspaceVisionRubric("location-consistency", LOCATION_CONSISTENCY_RUBRIC);
}

/** Test-only handles for the deterministic validators (exercised in isolation). */
export const __testHooks = {
  materialDensity,
  editCorrectness,
  instaMetricFit,
} as const;
