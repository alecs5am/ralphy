// The 6 builtin workspace-evaluator criteria (#470).
//
// Covers:
//   (a) material-density   — dense/captioned/short-hook fixture passes; a
//       low-density/no-caption fixture flags low density + missing captions;
//       SAME fixture + two thresholds → two verdicts (proves config-driven).
//   (b) edit-correctness   — VO overlap, fork-hold, death-beats, countdown-on-
//       freeze active checks; SFX-timing degraded to an info finding.
//   (c) insta-metric-fit   — a long-hook metrics fixture flags; missing metrics
//       → na + info (NOT a fail); thresholds are config-driven.
//   (d) registration       — all 3 deterministic ids + 3 vision rubric ids are
//       registered; runWorkspaceEval over a fixture yields non-`na` deterministic
//       results. NO LLM (deterministic + registry only).
//
// Fixtures are SMALL SYNTHETIC English-only compositions — NOT the real 130 KB+
// 002/003 files. English-only-on-disk.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  hasWorkspaceValidator,
  hasWorkspaceVisionRubric,
  runWorkspaceEval,
  type WorkspaceValidator,
  type WorkspaceValidatorContext,
} from "../../cli/lib/eval/workspace-evaluators";
import {
  registerBuiltinWorkspaceValidators,
  __testHooks,
} from "../../cli/lib/eval/workspace-criteria";
import { workspaceDir } from "../../cli/lib/paths";
import type { WorkspaceCriterion } from "../../cli/lib/schemas/workspace-evaluators";
import type { Finding } from "../../cli/lib/eval/types";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-ws-criteria-470");
  registerBuiltinWorkspaceValidators();
});

afterEach(() => {
  tmp.cleanup();
});

// ─── Synthetic compositions ─────────────────────────────────────────────────────

// A DENSE, captioned, short-hook composition (002-like): many audio tracks, lots
// of SFX, caption bands, all six editing techniques, two non-overlapping VO lines,
// a countdown sitting on a freeze, a selector fork, and death beats.
const DENSE_COMPOSITION = `<!doctype html>
<html><body>
  <audio id="bgm" class="clip" src="artifacts/audio/soundtrack.mp3" data-start="0" data-duration="60" data-track-index="9" data-volume="0.16"></audio>
  <audio id="n01" class="clip" src="artifacts/audio/lean/n01.mp3" data-start="0.1" data-duration="2.5" data-track-index="10" data-volume="1"></audio>
  <audio id="n02" class="clip" src="artifacts/audio/lean/n02.mp3" data-start="4.0" data-duration="2.4" data-track-index="10" data-volume="1"></audio>
  <audio id="sfx-amb" class="clip" src="artifacts/sfx/ambA.mp3" data-start="0" data-duration="60" data-track-index="11" data-volume="0.4"></audio>
  <audio id="sfx-drip" class="clip" src="artifacts/sfx/drip.mp3" data-start="3" data-duration="1" data-track-index="12"></audio>
  <audio id="sfx-step" class="clip" src="artifacts/sfx/chest-step.mp3" data-start="6" data-duration="1" data-track-index="13"></audio>
  <audio id="sfx-blade" class="clip" src="artifacts/sfx/blade-scrape.mp3" data-start="9" data-duration="1" data-track-index="14"></audio>
  <audio id="sfx-beep" class="clip" src="artifacts/sfx/beep-soft.mp3" data-start="12" data-duration="1" data-track-index="15"></audio>
  <audio id="sfx-flash" class="clip" src="artifacts/sfx/flash-hit.mp3" data-start="15" data-duration="1" data-track-index="16"></audio>
  <audio id="sfx-door" class="clip" src="artifacts/sfx/door.mp3" data-start="18" data-duration="1" data-track-index="17"></audio>
  <audio id="sfx-thud" class="clip" src="artifacts/sfx/thud.mp3" data-start="21" data-duration="1" data-track-index="18"></audio>
  <!-- NARRATOR CAPTIONS (white) -->
  <div class="caption narrator-caption">choice + consequence</div>
  <!-- DIEGETIC CAPTIONS -->
  <div class="caption diegetic-caption">colored line</div>
  <div id="countdown" class="timer">3</div>
  <div id="freeze-plate" class="freeze">held frame</div>
  <div id="boomerang-1" class="boomerang">slow-mo</div>
  <div class="death-screen">YOU DIED</div>
  <div class="flash"></div>
  <div class="selector choice-fork">A or B</div>
  <div class="title-card hook-title">EPISODE</div>
</body></html>`;

// A LOW-density, NO-caption, LONG-hook composition (003-like): one bgm track, no
// SFX clips, no caption markers, only a couple of techniques, no selector fork,
// no death-screen, a countdown with NO freeze/boomerang (so countdown-on-freeze
// flags), and two OVERLAPPING VO lines on the same track.
const SPARSE_COMPOSITION = `<!doctype html>
<html><body>
  <audio id="bgm" class="clip" src="artifacts/audio/music.mp3" data-start="0" data-duration="90" data-track-index="0" data-volume="0.2"></audio>
  <audio id="n01" class="clip" src="artifacts/audio/n01.mp3" data-start="0" data-duration="4" data-track-index="1" data-volume="1"></audio>
  <audio id="n02" class="clip" src="artifacts/audio/n02.mp3" data-start="3" data-duration="4" data-track-index="1" data-volume="1"></audio>
  <div id="countdown" class="timer">3</div>
  <div class="flash"></div>
</body></html>`;

function seedProject(opts: {
  workspace: string;
  projectId: string;
  evaluators: Record<string, unknown>;
  indexHtml?: string;
  metrics?: Record<string, unknown>;
}) {
  const wsDir = workspaceDir(opts.workspace);
  const projDir = path.join(wsDir, "projects", opts.projectId);
  fs.mkdirSync(path.join(projDir, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(wsDir, "workspace.json"), JSON.stringify({ slug: opts.workspace }));
  fs.writeFileSync(path.join(wsDir, "evaluators.json"), JSON.stringify(opts.evaluators));
  fs.writeFileSync(path.join(projDir, "BRIEF.md"), "# brief\n");
  if (opts.indexHtml !== undefined) {
    fs.writeFileSync(path.join(projDir, "index.html"), opts.indexHtml);
  }
  if (opts.metrics !== undefined) {
    fs.writeFileSync(path.join(projDir, "metrics.json"), JSON.stringify(opts.metrics));
  }
  fs.writeFileSync(
    path.join(tmp.dir, ".ralphy", "registry.json"),
    JSON.stringify({
      brands: {},
      personas: {},
      refs: {},
      templates: {},
      batches: {},
      projects: { [opts.projectId]: { id: opts.projectId, workspace: opts.workspace } },
    }),
  );
  return { wsDir, projDir };
}

// Build a validator context pointing at a written index.html, to exercise a
// validator in isolation without the full runner.
function ctxFor(
  projDir: string,
  criterion: Partial<WorkspaceCriterion>,
): WorkspaceValidatorContext {
  return {
    criterion: {
      id: "c",
      label: "C",
      category: "x",
      check: "deterministic",
      severity: "warn",
      threshold: {},
      ...criterion,
    } as WorkspaceCriterion,
    projectId: "p",
    projectDir: projDir,
    videoPath: null,
    config: { version: "1.0", criteria: [] },
  };
}

function verdictOf(findings: Finding[]): "pass" | "warn" | "fail" {
  if (findings.some((f) => f.severity === "fail")) return "fail";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  return "pass";
}

function writeIndex(dir: string, html: string): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

// Run each deterministic validator in isolation via its exported test hook with a
// constructed context. All three are synchronous.
function asSync(
  fn: WorkspaceValidator,
  dir: string,
  threshold: Record<string, unknown>,
): Finding[] {
  const out = fn(ctxFor(dir, { threshold }));
  if (out instanceof Promise) throw new Error("validator unexpectedly async");
  return out;
}

const materialDensitySync = (dir: string, threshold: Record<string, unknown>) =>
  asSync(__testHooks.materialDensity, dir, threshold);
const editCorrectnessSync = (dir: string, threshold: Record<string, unknown>) =>
  asSync(__testHooks.editCorrectness, dir, threshold);
const instaMetricFitSync = (dir: string, threshold: Record<string, unknown>) =>
  asSync(__testHooks.instaMetricFit, dir, threshold);

// ─── (d) registration ────────────────────────────────────────────────────────────

describe("registerBuiltinWorkspaceValidators — registry", () => {
  test("registers all 3 deterministic validator ids", () => {
    expect(hasWorkspaceValidator("material-density")).toBe(true);
    expect(hasWorkspaceValidator("edit-correctness")).toBe(true);
    expect(hasWorkspaceValidator("insta-metric-fit")).toBe(true);
  });

  test("registers all 3 vision rubric ids", () => {
    expect(hasWorkspaceVisionRubric("scenario-fidelity")).toBe(true);
    expect(hasWorkspaceVisionRubric("character-design-cohesion")).toBe(true);
    expect(hasWorkspaceVisionRubric("location-consistency")).toBe(true);
  });
});

// ─── (a) material-density ─────────────────────────────────────────────────────────

describe("material-density", () => {
  test("dense/captioned fixture passes with the default thresholds", () => {
    const dir = writeIndex(path.join(tmp.dir, "dense"), DENSE_COMPOSITION);
    const findings = materialDensitySync(dir, {});
    expect(verdictOf(findings)).toBe("pass");
    expect(findings.some((f) => f.category.includes("captions"))).toBe(false);
  });

  test("sparse/no-caption fixture flags low density AND missing captions", () => {
    const dir = writeIndex(path.join(tmp.dir, "sparse"), SPARSE_COMPOSITION);
    const findings = materialDensitySync(dir, {});
    expect(verdictOf(findings)).toBe("warn");
    expect(findings.some((f) => f.category.endsWith("material-density.audio-tracks"))).toBe(true);
    expect(findings.some((f) => f.category.endsWith("material-density.sfx"))).toBe(true);
    expect(findings.some((f) => f.category.endsWith("material-density.captions"))).toBe(true);
    expect(findings.some((f) => f.category.endsWith("material-density.techniques"))).toBe(true);
  });

  test("config-driven: same dense fixture, two thresholds → two verdicts", () => {
    const dir = writeIndex(path.join(tmp.dir, "dense2"), DENSE_COMPOSITION);
    // Lenient bars → pass.
    const lenient = materialDensitySync(dir, { minAudioTracks: 2, minSfx: 2, requireCaptions: false });
    expect(verdictOf(lenient)).toBe("pass");
    // Impossible bars on the SAME fixture → warn.
    const strict = materialDensitySync(dir, { minAudioTracks: 99, minSfx: 99 });
    expect(verdictOf(strict)).toBe("warn");
  });

  test("requiredTechniques is config-driven (subset → pass)", () => {
    const dir = writeIndex(path.join(tmp.dir, "sparse-tech"), SPARSE_COMPOSITION);
    // Sparse has countdown + flashes only. Require just those + relax density → pass.
    const findings = materialDensitySync(dir, {
      minAudioTracks: 1,
      minSfx: 0,
      requireCaptions: false,
      requiredTechniques: ["countdown", "flashes"],
    });
    expect(verdictOf(findings)).toBe("pass");
  });

  test("missing index.html degrades to a single info finding (no crash)", () => {
    const dir = path.join(tmp.dir, "empty");
    fs.mkdirSync(dir, { recursive: true });
    const findings = materialDensitySync(dir, {});
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].category).toContain("no-composition");
  });
});

// ─── (b) edit-correctness ─────────────────────────────────────────────────────────

describe("edit-correctness", () => {
  test("dense fixture: clean (no VO overlap, fork+death+countdown-on-freeze present)", () => {
    const dir = writeIndex(path.join(tmp.dir, "ec-dense"), DENSE_COMPOSITION);
    const findings = editCorrectnessSync(dir, {});
    // No warn/fail expected; the only finding is the degraded SFX-timing info.
    expect(verdictOf(findings)).toBe("pass");
    expect(findings.some((f) => f.category.endsWith("vo-overlap"))).toBe(false);
    expect(findings.some((f) => f.category.endsWith("fork-hold"))).toBe(false);
    expect(findings.some((f) => f.category.endsWith("death-beats"))).toBe(false);
    expect(findings.some((f) => f.category.endsWith("countdown-freeze"))).toBe(false);
  });

  test("sparse fixture: flags VO overlap, missing fork, missing death, countdown-no-freeze", () => {
    const dir = writeIndex(path.join(tmp.dir, "ec-sparse"), SPARSE_COMPOSITION);
    const findings = editCorrectnessSync(dir, {});
    expect(verdictOf(findings)).toBe("warn");
    expect(findings.some((f) => f.category.endsWith("vo-overlap"))).toBe(true);
    expect(findings.some((f) => f.category.endsWith("fork-hold"))).toBe(true);
    expect(findings.some((f) => f.category.endsWith("death-beats"))).toBe(true);
    expect(findings.some((f) => f.category.endsWith("countdown-freeze"))).toBe(true);
  });

  test("SFX-timing sub-check degrades to an info finding (signal unavailable)", () => {
    const dir = writeIndex(path.join(tmp.dir, "ec-info"), DENSE_COMPOSITION);
    const findings = editCorrectnessSync(dir, {});
    const info = findings.find((f) => f.category.endsWith("sfx-timing-unavailable"));
    expect(info).toBeDefined();
    expect(info!.severity).toBe("info");
  });

  test("config-driven: disabling the sparse checks suppresses the flags", () => {
    const dir = writeIndex(path.join(tmp.dir, "ec-off"), SPARSE_COMPOSITION);
    const findings = editCorrectnessSync(dir, {
      requireForkHoldsBothChoices: false,
      requireDeathBeats: false,
      requireCountdownOnFreeze: false,
    });
    // VO overlap still flags (not gated by a toggle) — but the structural ones are off.
    expect(findings.some((f) => f.category.endsWith("fork-hold"))).toBe(false);
    expect(findings.some((f) => f.category.endsWith("death-beats"))).toBe(false);
    expect(findings.some((f) => f.category.endsWith("countdown-freeze"))).toBe(false);
  });
});

// ─── (c) insta-metric-fit ─────────────────────────────────────────────────────────

describe("insta-metric-fit", () => {
  test("missing metrics → single info finding (na, NOT a fail)", () => {
    const dir = path.join(tmp.dir, "im-none");
    fs.mkdirSync(dir, { recursive: true });
    const findings = instaMetricFitSync(dir, {});
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].category).toContain("no-metrics");
    expect(verdictOf(findings)).toBe("pass"); // info-only → not a fail
  });

  test("003-like long-hook metrics flag the long first beat + late first choice", () => {
    const dir = path.join(tmp.dir, "im-bad");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "metrics.json"),
      JSON.stringify({
        timeToFirstChoiceSec: 6.5,
        firstBeatSec: 7.2,
        avgWatchSec: 25,
        durationSec: 105,
      }),
    );
    const findings = instaMetricFitSync(dir, {});
    expect(verdictOf(findings)).toBe("warn");
    expect(findings.some((f) => f.category.endsWith("time-to-first-choice"))).toBe(true);
    expect(findings.some((f) => f.category.endsWith("first-beat-length"))).toBe(true);
    expect(findings.some((f) => f.category.endsWith("avg-watch"))).toBe(true);
  });

  test("002-like good metrics clear all bars (info-only)", () => {
    const dir = path.join(tmp.dir, "im-good");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "metrics.json"),
      JSON.stringify({
        timeToFirstChoiceSec: 2.1,
        firstBeatSec: 1.8,
        avgWatchSec: 45,
        durationSec: 65,
      }),
    );
    const findings = instaMetricFitSync(dir, {});
    expect(verdictOf(findings)).toBe("pass");
    expect(findings.some((f) => f.category.endsWith(".ok"))).toBe(true);
  });

  test("config-driven: same metrics, two thresholds → two verdicts", () => {
    const dir = path.join(tmp.dir, "im-cfg");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "metrics.json"),
      JSON.stringify({ timeToFirstChoiceSec: 4, firstBeatSec: 4, avgWatchSec: 40, durationSec: 100 }),
    );
    // Default ceiling 3s → flags. Relaxed ceiling 10s → clears.
    expect(verdictOf(instaMetricFitSync(dir, {}))).toBe("warn");
    expect(
      verdictOf(instaMetricFitSync(dir, { maxTimeToFirstChoiceSec: 10, maxFirstBeatSec: 10, minAvgWatchPct: 5 })),
    ).toBe("pass");
  });

  test("custom metricsFile path is honored", () => {
    const dir = path.join(tmp.dir, "im-path");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "perf.json"), JSON.stringify({ avgWatchPct: 12 }));
    const findings = instaMetricFitSync(dir, { metricsFile: "perf.json" });
    expect(findings.some((f) => f.category.endsWith("avg-watch"))).toBe(true);
  });
});

// ─── runWorkspaceEval end-to-end (deterministic, no LLM) ──────────────────────────

describe("runWorkspaceEval — deterministic criteria produce real results", () => {
  test("the 003-like project flags low density + missing captions + long hook", async () => {
    seedProject({
      workspace: "fog",
      projectId: "fog-003",
      indexHtml: SPARSE_COMPOSITION,
      metrics: { timeToFirstChoiceSec: 6.5, firstBeatSec: 7.2, avgWatchSec: 25, durationSec: 105 },
      evaluators: {
        criteria: [
          { id: "md", label: "Material density", category: "density", check: "deterministic", severity: "warn", validatorId: "material-density", threshold: {} },
          { id: "ec", label: "Edit correctness", category: "edit", check: "deterministic", severity: "warn", validatorId: "edit-correctness", threshold: {} },
          { id: "im", label: "Insta metric fit", category: "metrics", check: "deterministic", severity: "warn", validatorId: "insta-metric-fit", threshold: {} },
        ],
      },
    });

    const result = await runWorkspaceEval("fog-003", { noVision: true });
    const md = result.criteria.find((c) => c.id === "md")!;
    const ec = result.criteria.find((c) => c.id === "ec")!;
    const im = result.criteria.find((c) => c.id === "im")!;

    // Real, non-na deterministic results.
    expect(md.verdict).not.toBe("na");
    expect(md.score).not.toBeNull();
    expect(md.verdict).toBe("warn");
    expect(md.findings.some((f) => f.category.endsWith("captions"))).toBe(true);

    expect(ec.verdict).toBe("warn");
    expect(im.verdict).toBe("warn");
    expect(im.findings.some((f) => f.category.endsWith("first-beat-length"))).toBe(true);

    // All-warn (advisory) → repair in the #427 vocab.
    expect(result.overall.verdict).toBe("repair");
  });

  test("the 002-like dense project clears the deterministic bars", async () => {
    seedProject({
      workspace: "fog2",
      projectId: "fog2-002",
      indexHtml: DENSE_COMPOSITION,
      metrics: { timeToFirstChoiceSec: 2.1, firstBeatSec: 1.8, avgWatchSec: 45, durationSec: 65 },
      evaluators: {
        criteria: [
          { id: "md", label: "Material density", category: "density", check: "deterministic", severity: "warn", validatorId: "material-density", threshold: {} },
          { id: "ec", label: "Edit correctness", category: "edit", check: "deterministic", severity: "warn", validatorId: "edit-correctness", threshold: {} },
          { id: "im", label: "Insta metric fit", category: "metrics", check: "deterministic", severity: "warn", validatorId: "insta-metric-fit", threshold: {} },
        ],
      },
    });

    const result = await runWorkspaceEval("fog2-002", { noVision: true });
    for (const c of result.criteria) {
      expect(c.verdict).not.toBe("na");
      expect(c.verdict).not.toBe("fail");
    }
    // No warns from deterministic checks → ship.
    expect(result.overall.verdict).toBe("ship");
  });
});

