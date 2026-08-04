// Quality flywheel orchestrator (#457).
//
// The flywheel runs the relevant gates for a Unit, merges their persisted
// reports through `buildScorecard()` (the #427 aggregator), and emits ONE
// readiness verdict (ship | repair | needs-user-decision | blocked) that drives
// the repair (#409) + lesson-routing (#425) handoffs.
//
// This suite proves the two #457 deltas end-to-end with NO ffmpeg, NO network,
// NO model calls — pure file reads + a pure predicate:
//   • acceptance #1 — `gatesForContext(mode, format, platform)` names the gate
//     registry: which gates apply for a context, composed from the existing
//     predicates (no parallel logic).
//   • acceptance #7 — three fixtures driven through `buildScorecard()`:
//       1. a PASSING Unit  → `ship`
//       2. a REPAIRABLE Unit → `repair`
//       3. a BLOCKED Unit  → `blocked`
//     each with multiple gate reports merged into the verdict.
//
// The fixture harness mirrors tests/unit/scorecard.test.ts verbatim (same
// seed/evalReport injection) so the two stay in lockstep.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  ensureDomainContractProject,
  setDomainContractDocumentStage,
  setDomainContractStage,
} from "../helpers/domain-contract";
import { projectDir } from "../../cli/lib/paths";
import { root } from "../../cli/lib/paths";
import { buildScorecard } from "../../cli/lib/scorecard";
import { gatesForContext, QUALITY_GATES } from "../../cli/lib/eval/gate";

// ─── Fixture harness (mirrors scorecard.test.ts) ────────────────────────────────

function seed(project: string, rel: string, body: string) {
  ensureDomainContractProject(root(), project);
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  if (rel === "eval.json" || rel === "production-plan.json") {
    setDomainContractDocumentStage(root(), project, rel === "eval.json" ? "eval" : "production-plan", JSON.parse(body));
  } else if (rel === "render/final.mp4") {
    setDomainContractStage(root(), project, "render");
  }
}

function seedJson(project: string, rel: string, obj: unknown) {
  seed(project, rel, JSON.stringify(obj, null, 2));
}

function seedRender(project: string) {
  seed(project, "render/final.mp4", "fake-mp4");
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
      evaluatedAt: "2026-06-23T00:00:00Z",
      durationSec: 15,
      resolution: { w: 1080, h: 1920 },
      fps: 30,
      codec: { video: "h264", audio: "aac" },
      bitrateKbps: 6000,
    },
    declared: null,
    structure: {
      scenes: [],
      sceneCount: 6,
      avgSceneDurationSec: 2.5,
      minSceneDurationSec: 2,
      maxSceneDurationSec: 4,
      hookZone: { durationSec: 3, sceneCount: 2, transcript: "stop scrolling and watch this now", wordCount: 6 },
    },
    audio: { integratedLufs: -15, truePeakDb: -1.2, loudnessRangeLu: 7, deadAirSegments: [], voicePresentPct: 82 },
    captions: { available: true, wordCount: 42, wordsPerSecond: 2.8, densityWarn: false },
    vision: { sceneFindings: [] },
    findings,
    scoring: { weights: {}, penalties: {}, score: 91, verdict: opts.verdict ?? "pass" },
  };
}

let tmp: TmpRoot;
beforeEach(() => {
  tmp = makeTmpRoot("quality-flywheel-test");
});
afterEach(() => {
  tmp.cleanup();
});

// ─── Acceptance #1 — the gate registry (gatesForContext) ────────────────────────

describe("quality flywheel — gatesForContext is the gate registry (#457 acceptance #1)", () => {
  test("a commercial video mode pulls in fidelity, claims, hook, captions, native + platform", () => {
    const reg = gatesForContext({ mode: "ugc-review", format: "video", platforms: ["tiktok"] });
    expect(reg.applicable).toEqual(
      expect.arrayContaining([
        "native-video",
        "structure",
        "first-frame-hook",
        "captions",
        "product-fidelity",
        "claims",
        "platform-spec",
      ]),
    );
    // ugc-review ships no baked copy → OCR is NOT selected.
    expect(reg.applicable).not.toContain("ocr");
    // every gate has a one-line reason; the registry is self-explaining.
    expect(reg.gates.length).toBe(QUALITY_GATES.length);
    expect(reg.gates.every((g) => g.reason.length > 0)).toBe(true);
  });

  test("a still / baked-text mode drops the temporal gates and pulls in OCR", () => {
    const reg = gatesForContext({ mode: "social-carousel", format: "carousel" });
    // a still format has no opener arc or caption track.
    expect(reg.applicable).not.toContain("first-frame-hook");
    expect(reg.applicable).not.toContain("captions");
    // carousel bakes copy → OCR applies.
    expect(reg.applicable).toContain("ocr");
    // social-carousel is non-commercial → no fidelity / claims.
    expect(reg.applicable).not.toContain("product-fidelity");
    expect(reg.applicable).not.toContain("claims");
    // no platform declared → no platform-spec.
    expect(reg.applicable).not.toContain("platform-spec");
  });

  test("a lock-required mode threads the style-lock requirement into the registry reason", () => {
    const reg = gatesForContext({ mode: "product-shot", format: "image" });
    const nv = reg.gates.find((g) => g.gate === "native-video")!;
    expect(nv.reason).toContain("requires a style lock");
  });

  test("an unknown platform is dropped from the spec set", () => {
    const reg = gatesForContext({ mode: "ugc-review", format: "video", platforms: ["myspace"] });
    expect(reg.platforms).toEqual([]);
    expect(reg.applicable).not.toContain("platform-spec");
  });
});

// ─── Acceptance #7 — three fixtures → ship / repair / blocked ────────────────────

describe("quality flywheel — PASSING Unit → ship (#457 acceptance #7)", () => {
  test("a clean native eval + passing fidelity + ship council → ship", () => {
    const id = "flywheel-pass-001";
    seedRender(id);
    // Commercial mode → the registry pulls fidelity + claims into the run.
    seedJson(id, "production-plan.json", { contentMode: { mode: "ugc-review" } });
    seedJson(id, "eval.json", evalReport({ verdict: "pass", shipReady: true }));
    seedJson(id, "fidelity.json", { applicable: true, verdict: "pass", blocksShip: false, reason: "product identity correct" });
    seedJson(id, "claims.json", { applicable: true, verdict: "pass", blocksShip: false, reason: "no unsupported claims" });
    seedJson(id, "hook.json", { applicable: true, verdict: "pass", blocksShip: false, hookScore: 84, reason: "strong opener" });
    seedJson(id, "council-polish.json", { verdict: "ship", recommendation: "ready" });

    const card = buildScorecard({ projectId: id });
    expect(card.verdict).toBe("ship");
    expect(card.polished).toBe(true);
    // the commercial fidelity gate is in the required set and passes.
    expect(card.requiredDimensions).toContain("productFidelity");
    const byDim = Object.fromEntries(card.dimensions.map((d) => [d.dimension, d]));
    expect(byDim.productFidelity!.status).toBe("pass");
    expect(byDim.hook!.status).toBe("pass");
  });
});

describe("quality flywheel — REPAIRABLE Unit → repair (#457 acceptance #7)", () => {
  test("a caption-density warn + a soft-hook warn + council revise merge to repair", () => {
    const id = "flywheel-repair-001";
    seedRender(id);
    seedJson(id, "production-plan.json", { contentMode: { mode: "ugc-review" } });
    seedJson(id, "eval.json", evalReport({ findings: [{ category: "captions.dense", severity: "warn" }], verdict: "warn", shipReady: true }));
    seedJson(id, "fidelity.json", { applicable: true, verdict: "pass", blocksShip: false, reason: "product ok" });
    // a non-blocking soft opener (warn, blocksShip=false) enriches the hook dimension.
    seedJson(id, "hook.json", { applicable: true, verdict: "warn", blocksShip: false, hookScore: 56, reason: "soft opener" });
    // a non-blocking market-fit nudge.
    seedJson(id, "council-polish.json", { verdict: "revise", recommendation: "tighten the CTA" });

    const card = buildScorecard({ projectId: id });
    expect(card.verdict).toBe("repair");
    // no hard blocker fired (no fail / blocksShip / council block).
    const byDim = Object.fromEntries(card.dimensions.map((d) => [d.dimension, d]));
    expect(byDim.captions!.status).toBe("warn");
    expect(byDim.hook!.status).toBe("warn");
    expect(byDim.originality!.status).toBe("warn");
    expect(byDim.productFidelity!.status).toBe("pass");
  });
});

describe("quality flywheel — BLOCKED Unit → blocked (#457 acceptance #7)", () => {
  test("a fidelity blocksShip + a claims blocksShip + an eval fail all merge to blocked", () => {
    const id = "flywheel-blocked-001";
    seedRender(id);
    seedJson(id, "production-plan.json", { contentMode: { mode: "ugc-review" } });
    // multiple gate findings, several blocking.
    seedJson(id, "eval.json", evalReport({ findings: [{ category: "audio.true-peak", severity: "fail" }], verdict: "fail", shipReady: false }));
    seedJson(id, "fidelity.json", { applicable: true, verdict: "fail", blocksShip: true, reason: "wrong product label" });
    seedJson(id, "claims.json", { applicable: true, verdict: "fail", blocksShip: true, reason: "unsupported health claim" });
    seedJson(id, "hook.json", { applicable: true, verdict: "fail", blocksShip: true, hookScore: 22, reason: "no scroll-stop" });
    seedJson(id, "council-polish.json", { verdict: "block", recommendation: "off-brand, do not ship" });

    const card = buildScorecard({ projectId: id });
    expect(card.verdict).toBe("blocked");
    expect(card.polished).toBe(false);
    const byDim = Object.fromEntries(card.dimensions.map((d) => [d.dimension, d]));
    // the hard blockers are all surfaced as fail readings.
    expect(byDim.productFidelity!.status).toBe("fail");
    expect(byDim.claimsCompliance!.status).toBe("fail");
    expect(byDim.hook!.status).toBe("fail");
    expect(byDim.originality!.status).toBe("fail");
    expect(byDim.technicalPolish!.status).toBe("fail");
  });
});
