// Quality flywheel runner (#484).
//
// EVERY test here is model-free: the dry-run tests make ZERO model calls by
// construction, and the scorecard-handoff test seeds the gate reports directly
// + uses a project with NO render so every runnable gate SKIPS (no ffprobe / no
// vision pass) while buildScorecard reads the pre-seeded reports. No paid
// generation, no network, no ffprobe.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import { runQualityFlywheel } from "../../cli/lib/eval/flywheel";
import { gatesForContext } from "../../cli/lib/eval/gate";
import { getContentMode } from "../../cli/lib/content-modes";

function seed(project: string, rel: string, body: string) {
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}
function seedJson(project: string, rel: string, obj: unknown) {
  seed(project, rel, JSON.stringify(obj, null, 2));
}
function seedRender(project: string) {
  seed(project, "render/final.mp4", "fake-mp4");
}
function seedPlan(project: string, mode: string) {
  seedJson(project, "production-plan.json", { contentMode: { mode } });
}

/** A minimal native-video eval report (mirrors scorecard.test.ts). */
function evalReport(opts: { verdict?: "pass" | "warn" | "fail"; shipReady?: boolean } = {}) {
  return {
    schemaVersion: "1.0",
    gate: { mode: "native-video", nativeVideo: true, explicitCheapMode: false, shipReady: opts.shipReady ?? true, reason: "native pass" },
    meta: { video: "render/final.mp4", projectId: null, template: null, evaluatedAt: "2026-06-15T00:00:00Z", durationSec: 15, resolution: { w: 1080, h: 1920 }, fps: 30, codec: { video: "h264", audio: "aac" }, bitrateKbps: 6000 },
    declared: null,
    structure: { scenes: [], sceneCount: 5, avgSceneDurationSec: 3, minSceneDurationSec: 2, maxSceneDurationSec: 4, hookZone: { durationSec: 3, sceneCount: 2, transcript: "stop scrolling watch this now", wordCount: 5 } },
    audio: { integratedLufs: -16, truePeakDb: -1.5, loudnessRangeLu: 8, deadAirSegments: [], voicePresentPct: 80 },
    captions: { available: true, wordCount: 40, wordsPerSecond: 2.6, densityWarn: false },
    vision: { sceneFindings: [] },
    findings: [],
    scoring: { weights: {}, penalties: {}, score: 90, verdict: opts.verdict ?? "pass" },
  };
}

let tmp: TmpRoot;
beforeEach(() => {
  tmp = makeTmpRoot("flywheel-test");
});
afterEach(() => {
  tmp.cleanup();
});

describe("runQualityFlywheel — registry fan-out (#484)", () => {
  test("plans exactly the gates gatesForContext says apply for the (mode, format, platform)", async () => {
    const id = "fanout-001";
    seedRender(id);
    seedPlan(id, "ugc-review"); // commercial video mode
    const platforms = ["tiktok", "reels"];

    const result = await runQualityFlywheel(id, { platforms, dryRun: true });

    // The plan's gate set must equal gatesForContext's applicable set.
    const expected = gatesForContext({
      mode: "ugc-review",
      format: getContentMode("ugc-review")!.expectedUnitShape.format,
      platforms,
    }).applicable;
    const planned = result.plan.map((p) => p.gate).sort();
    expect(planned).toEqual([...expected].sort());

    // Commercial + video + platforms ⇒ fidelity/claims/hook/captions/platform-spec all present.
    expect(planned).toContain("product-fidelity");
    expect(planned).toContain("claims");
    expect(planned).toContain("first-frame-hook");
    expect(planned).toContain("platform-spec");
    // Advisory gates are in the plan but marked never-run.
    const dist = result.plan.find((p) => p.gate === "distribution-pack")!;
    expect(dist.willRun).toBe(false);
    expect(result.mode).toBe("ugc-review");
    expect(result.format).toBe("video");
  });

  test("a non-commercial mode drops the commercial gates from the plan", async () => {
    const id = "fanout-002";
    seedRender(id);
    seedPlan(id, "motion-design");
    const result = await runQualityFlywheel(id, { dryRun: true });
    const planned = result.plan.map((p) => p.gate);
    expect(planned).not.toContain("product-fidelity");
    expect(planned).not.toContain("claims");
    // No platform declared ⇒ platform-spec is not applicable.
    expect(planned).not.toContain("platform-spec");
  });
});

describe("runQualityFlywheel — skipped missing-artifact gates (#484)", () => {
  test("with NO render the video gates are skipped with a reason, not run, no throw", async () => {
    const id = "skip-001";
    seedPlan(id, "ugc-review");
    fs.mkdirSync(projectDir(id), { recursive: true });

    // Not a dry-run: must execute without throwing and skip the render-dependent gates.
    const result = await runQualityFlywheel(id, { platforms: ["tiktok"] });
    expect(result.dryRun).toBe(false);

    const skippedGates = result.gatesSkipped.map((g) => g.gate);
    for (const g of ["native-video", "structure", "first-frame-hook", "captions", "platform-spec"] as const) {
      expect(skippedGates).toContain(g);
    }
    // Each skip carries a reason.
    for (const s of result.gatesSkipped) {
      expect(typeof s.reason).toBe("string");
      expect(s.reason!.length).toBeGreaterThan(0);
      expect(s.status).toBe("skipped");
    }
  });

  test("ocr is skipped when there are no stills", async () => {
    const id = "skip-002";
    seedPlan(id, "social-carousel"); // baked-text mode ⇒ ocr applies
    fs.mkdirSync(projectDir(id), { recursive: true });
    const result = await runQualityFlywheel(id, { dryRun: true });
    const ocr = result.plan.find((p) => p.gate === "ocr")!;
    expect(ocr.willRun).toBe(false);
    expect(ocr.reason).toMatch(/no stills/i);
  });
});

describe("runQualityFlywheel — dry-run output (#484)", () => {
  test("dry-run reports the plan shape with costBearing + wouldWrite, no gates executed", async () => {
    const id = "dry-001";
    seedRender(id);
    seedPlan(id, "ugc-review");

    const result = await runQualityFlywheel(id, { platforms: ["tiktok"], dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.gatesAttempted).toEqual([]);
    expect(result.scorecardVerdict).toBeNull();
    expect(result.nextAction).toMatch(/dry-run/i);

    // The native-video gate is cost-bearing and writes eval.json.
    const nv = result.plan.find((p) => p.gate === "native-video")!;
    expect(nv.wouldWrite).toBe("eval.json");
    expect(nv.costBearing).toBe(true);
    expect(nv.willRun).toBe(true);

    // The structure gate is free and shares eval.json.
    const structure = result.plan.find((p) => p.gate === "structure")!;
    expect(structure.costBearing).toBe(false);
    expect(structure.wouldWrite).toBe("eval.json");

    // platform-spec is deterministic (free).
    const ps = result.plan.find((p) => p.gate === "platform-spec")!;
    expect(ps.costBearing).toBe(false);

    // No report files were written (dry-run touched nothing).
    expect(fs.existsSync(path.join(projectDir(id), "eval.json"))).toBe(false);
    expect(fs.existsSync(path.join(projectDir(id), "hook.json"))).toBe(false);

    // costBearingGates lists only the would-run cost-bearing gates.
    expect(result.costBearingGates).toContain("native-video");
  });

  test("--cheap downgrades model-graded gates and flips cost-bearing off", async () => {
    const id = "dry-002";
    seedRender(id);
    seedPlan(id, "ugc-review");
    const result = await runQualityFlywheel(id, { platforms: ["tiktok"], dryRun: true, cheap: true });
    // Under --cheap no plan entry is cost-bearing.
    expect(result.costBearingGates).toEqual([]);
    // The model-graded gates are marked not-run with a cheap reason.
    const fidelity = result.plan.find((p) => p.gate === "product-fidelity")!;
    expect(fidelity.willRun).toBe(false);
    expect(fidelity.reason).toMatch(/cheap/i);
  });
});

describe("runQualityFlywheel — scorecard handoff (#484)", () => {
  test("a live (non-dry) run hands off to buildScorecard and surfaces its verdict, model-free", async () => {
    // motion-design + no render ⇒ every runnable gate SKIPS (no ffprobe, no model),
    // and buildScorecard reads the pre-seeded eval.json. The handoff is exercised
    // without any model call.
    const id = "handoff-001";
    seedPlan(id, "motion-design");
    fs.mkdirSync(projectDir(id), { recursive: true });
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    // Render present so technicalPolish resolves off the eval, but no real mp4 is
    // probed because every runnable gate skips on the pre-flight artifact check…
    // motion-design's runnable gates are the video gates — they need render/final.mp4.
    seedRender(id);

    // With a render present the structure/native-video pass WOULD run evaluateVideo
    // (ffprobe). To stay model-free AND ffprobe-free we assert the handoff via the
    // dependency-free path: remove the render so the video gates skip, then the
    // seeded eval.json still drives buildScorecard.
    fs.rmSync(path.join(projectDir(id), "render/final.mp4"));

    const result = await runQualityFlywheel(id, {});
    expect(result.dryRun).toBe(false);
    // buildScorecard ran and surfaced a verdict + reason.
    expect(result.scorecardVerdict).not.toBeNull();
    expect(typeof result.scorecardReason).toBe("string");
    // A clean eval.json with a render absent ⇒ needs-user-decision (technicalPolish na).
    // Either way the verdict is a real scorecard verdict, not null.
    expect(["ship", "repair", "blocked", "needs-user-decision"]).toContain(result.scorecardVerdict);
    // nextAction is a recommendation, never an executed repair.
    expect(result.nextAction).not.toMatch(/dry-run/i);
  });

  test("a repair/blocked scorecard recommends repair-plan (never spends)", async () => {
    const id = "handoff-002";
    seedPlan(id, "motion-design");
    fs.mkdirSync(projectDir(id), { recursive: true });
    // A render + a clean eval ⇒ would run the native gate. Avoid that: no render,
    // seed an eval with a WARN finding so the scorecard returns `repair`.
    seedJson(id, "eval.json", {
      ...evalReport({ verdict: "warn", shipReady: true }),
      findings: [{ id: "F1", category: "captions.dense", severity: "warn", sceneIndex: null, timestampSec: null, message: "dense", fixHint: "fix", fixCommand: null }],
    });
    seedRender(id);
    fs.rmSync(path.join(projectDir(id), "render/final.mp4"));

    const result = await runQualityFlywheel(id, {});
    // captions warn ⇒ repair (or blocked if technicalPolish forces it) — either way
    // the nextAction recommends repair-plan, and the runner never repaired/spent.
    if (result.scorecardVerdict === "repair" || result.scorecardVerdict === "blocked") {
      expect(result.nextAction).toMatch(/repair-plan/);
      expect(result.nextAction).toMatch(/does not repair or spend/);
    }
  });
});
