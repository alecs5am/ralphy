// Release-readiness scorecard aggregator (#427).
//
// The scorecard re-runs NOTHING — these fixtures build the persisted gate
// reports (eval.json, fidelity.json, council-polish.json, STYLE_LOCK.md,
// distribution-pack.json) in a temp project dir and assert the deterministic
// merge. NO paid generation, NO network, NO model calls — pure file reads.
//
// Coverage:
//   1. PASSING unit  → every required dimension passes → `ship`.
//   2. REPAIRABLE    → eval warn / council `revise`     → `repair`.
//   3. BLOCKED       → fidelity blocksShip / council `block` / eval fail → `blocked`.
//   + the dimension mapping, the verdict precedence, `na` for missing artifacts,
//     and mode-awareness (styleFit / productFidelity required per mode).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import { buildScorecard } from "../../cli/lib/scorecard";
import { parseScorecard, type ScorecardDimension } from "../../cli/lib/schemas/scorecard";

function seed(project: string, rel: string, body: string) {
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

function seedJson(project: string, rel: string, obj: unknown) {
  seed(project, rel, JSON.stringify(obj, null, 2));
}

/** A minimal native-video eval report with the given findings + verdict + shipReady. */
function evalReport(opts: {
  findings?: Array<{ category: string; severity: "info" | "warn" | "fail" }>;
  verdict?: "pass" | "warn" | "fail";
  shipReady?: boolean;
  mode?: string;
}) {
  const findings = (opts.findings ?? []).map((f, i) => ({
    id: `F${i + 1}`,
    category: f.category,
    severity: f.severity,
    sceneIndex: null,
    timestampSec: null,
    message: `${f.category} finding`,
    fixHint: "fix it",
    fixCommand: null,
  }));
  return {
    schemaVersion: "1.0",
    gate: {
      mode: opts.mode ?? "native-video",
      nativeVideo: true,
      explicitCheapMode: false,
      shipReady: opts.shipReady ?? true,
      reason: "native pass",
    },
    meta: {
      video: "render/final.mp4",
      projectId: null,
      template: null,
      evaluatedAt: "2026-06-15T00:00:00Z",
      durationSec: 15,
      resolution: { w: 1080, h: 1920 },
      fps: 30,
      codec: { video: "h264", audio: "aac" },
      bitrateKbps: 6000,
    },
    declared: null,
    structure: {
      scenes: [],
      sceneCount: 5,
      avgSceneDurationSec: 3,
      minSceneDurationSec: 2,
      maxSceneDurationSec: 4,
      hookZone: { durationSec: 3, sceneCount: 2, transcript: "stop scrolling right now watch this", wordCount: 6 },
    },
    audio: { integratedLufs: -16, truePeakDb: -1.5, loudnessRangeLu: 8, deadAirSegments: [], voicePresentPct: 80 },
    captions: { available: true, wordCount: 40, wordsPerSecond: 2.6, densityWarn: false },
    vision: { sceneFindings: [] },
    findings,
    scoring: { weights: {}, penalties: {}, score: 90, verdict: opts.verdict ?? "pass" },
  };
}

function seedRender(project: string) {
  seed(project, "render/final.mp4", "fake-mp4");
}

let tmp: TmpRoot;
beforeEach(() => {
  tmp = makeTmpRoot("scorecard-test");
});
afterEach(() => {
  tmp.cleanup();
});

describe("buildScorecard — PASSING unit → ship (#427)", () => {
  test("all required dimensions pass for a non-commercial mode", () => {
    const id = "pass-001";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    // motion-design: no style lock required, not commercial — base required set
    // is hook/clarity/pacing/technicalPolish, all from a clean native eval.
    seedJson(id, "production-plan.json", { contentMode: { mode: "motion-design" } });

    const card = buildScorecard({ projectId: id });
    expect(card.verdict).toBe("ship");
    expect(card.polished).toBe(true);
    expect(parseScorecard(card).verdict).toBe("ship");

    const byDim = Object.fromEntries(card.dimensions.map((d) => [d.dimension, d]));
    expect(byDim.hook!.status).toBe("pass");
    expect(byDim.technicalPolish!.status).toBe("pass");
    expect(byDim.technicalPolish!.source).toBe("eval.json");
    // styleFit is `na` for a mode that doesn't require a lock.
    expect(byDim.styleFit!.status).toBe("na");
    // required set never includes styleFit here.
    expect(card.requiredDimensions).not.toContain("styleFit" as ScorecardDimension);
  });
});

describe("buildScorecard — REPAIRABLE unit → repair (#427)", () => {
  test("an eval warn (caption density) → repair, not blocked", () => {
    const id = "repair-001";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ findings: [{ category: "captions.dense", severity: "warn" }], verdict: "warn", shipReady: true }));
    seedJson(id, "production-plan.json", { contentMode: { mode: "motion-design" } });

    const card = buildScorecard({ projectId: id });
    expect(card.verdict).toBe("repair");
    const byDim = Object.fromEntries(card.dimensions.map((d) => [d.dimension, d]));
    expect(byDim.captions!.status).toBe("warn");
    expect(byDim.captions!.source).toBe("eval.json");
  });

  test("a council `revise` verdict → repair", () => {
    const id = "repair-002";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    seedJson(id, "council-polish.json", { verdict: "revise", recommendation: "tighten the CTA" });
    seedJson(id, "production-plan.json", { contentMode: { mode: "motion-design" } });

    const card = buildScorecard({ projectId: id });
    expect(card.verdict).toBe("repair");
    const orig = card.dimensions.find((d) => d.dimension === "originality")!;
    expect(orig.status).toBe("warn");
    expect(orig.source).toBe("council-polish.json");
  });
});

describe("buildScorecard — BLOCKED unit → blocked (#427)", () => {
  test("fidelity blocksShip → blocked (precedence beats everything)", () => {
    const id = "blocked-001";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    seedJson(id, "fidelity.json", { applicable: true, verdict: "fail", blocksShip: true, reason: "product identity wrong" });
    seedJson(id, "production-plan.json", { contentMode: { mode: "ugc-review" } });

    const card = buildScorecard({ projectId: id });
    expect(card.verdict).toBe("blocked");
    const pf = card.dimensions.find((d) => d.dimension === "productFidelity")!;
    expect(pf.status).toBe("fail");
    expect(pf.source).toBe("fidelity.json");
    // commercial mode → productFidelity is in the required set.
    expect(card.requiredDimensions).toContain("productFidelity" as ScorecardDimension);
  });

  test("council `block` → blocked", () => {
    const id = "blocked-002";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    seedJson(id, "council-polish.json", { verdict: "block", recommendation: "off-brand, do not ship" });
    seedJson(id, "production-plan.json", { contentMode: { mode: "motion-design" } });

    const card = buildScorecard({ projectId: id });
    expect(card.verdict).toBe("blocked");
  });

  test("eval scoring verdict fail → blocked (failed quality gate refuses)", () => {
    const id = "blocked-003";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ findings: [{ category: "audio.true-peak", severity: "fail" }], verdict: "fail", shipReady: false }));
    seedJson(id, "production-plan.json", { contentMode: { mode: "motion-design" } });

    const card = buildScorecard({ projectId: id });
    expect(card.verdict).toBe("blocked");
    // technicalPolish fails because the native gate didn't return shipReady.
    const tp = card.dimensions.find((d) => d.dimension === "technicalPolish")!;
    expect(tp.status).toBe("fail");
  });
});

describe("buildScorecard — na / missing artifacts + mode-awareness (#427)", () => {
  test("an empty project → all dimensions na, verdict needs-user-decision", () => {
    const id = "empty-001";
    fs.mkdirSync(projectDir(id), { recursive: true });

    const card = buildScorecard({ projectId: id });
    expect(card.dimensions.every((d) => d.status === "na")).toBe(true);
    expect(card.polished).toBeNull();
    // required dimensions are all `na` → no blocker, no warn → needs-user-decision.
    expect(card.verdict).toBe("needs-user-decision");
  });

  test("a mode requiring a style lock without STYLE_LOCK.md fails styleFit → blocked", () => {
    const id = "style-001";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    // product-shot requires a style lock (cgi-product-renders guideline).
    const card = buildScorecard({ projectId: id, mode: "product-shot" });
    const sf = card.dimensions.find((d) => d.dimension === "styleFit")!;
    expect(sf.status).toBe("fail");
    expect(card.requiredDimensions).toContain("styleFit" as ScorecardDimension);
    expect(card.verdict).toBe("blocked");
  });

  test("the same mode WITH a style lock present → styleFit pass", () => {
    const id = "style-002";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    seed(id, "STYLE_LOCK.md", "# Style Lock\n");
    const card = buildScorecard({ projectId: id, mode: "product-shot" });
    const sf = card.dimensions.find((d) => d.dimension === "styleFit")!;
    expect(sf.status).toBe("pass");
    expect(sf.source).toBe("STYLE_LOCK.md");
  });

  test("explicit --mode arg overrides the production-plan mode", () => {
    const id = "mode-001";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    seedJson(id, "production-plan.json", { contentMode: { mode: "motion-design" } });
    const card = buildScorecard({ projectId: id, mode: "product-shot" });
    expect(card.mode).toBe("product-shot");
  });

  test("distribution-pack presence → distributionReadiness pass, else na", () => {
    const id = "dist-001";
    seedRender(id);
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    let card = buildScorecard({ projectId: id });
    expect(card.dimensions.find((d) => d.dimension === "distributionReadiness")!.status).toBe("na");

    seedJson(id, "distribution-pack.json", { version: 1, slug: "s", format: "video" });
    card = buildScorecard({ projectId: id });
    expect(card.dimensions.find((d) => d.dimension === "distributionReadiness")!.status).toBe("pass");
  });
});
