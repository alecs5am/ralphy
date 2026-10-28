// Full-video ship verdict calibration (#583).
//
// The #569 audit found the full-video pass marked ship-ready on 0 of 29 stored
// runs. #583 labeled the 29 renders (cli/lib/eval/calibration-datasets/
// full-video-pass-569.json, metadata + labels + stored sub-results, no media)
// and picked the aggregation in full-video-verdict.ts. These tests re-run that
// aggregation over the stored sub-results offline and pin:
//   • agreement with the labels before (0 ship-ready) and after,
//   • the audit's true catches stay blocked,
//   • RALPHY_EVAL_STRICT_RUBRIC reproduces every stored verdict,
//   • the orchestrator applies the rule on native modes only.
// Pure fixtures: no ffmpeg, no model call.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { parseCalibrationDataset } from "../../cli/lib/schemas/calibration";
import { computeCalibrationMetrics } from "../../cli/lib/eval/calibration";
import { score } from "../../cli/lib/eval/findings";
import {
  calibrateFullVideoFindings,
  fullVideoVerdict,
  guardInconclusive,
  FULL_VIDEO_AGGREGATION,
  SCORE_AGGREGATION,
} from "../../cli/lib/eval/full-video-verdict";
import { evaluateVideo, type EvaluateDeps } from "../../cli/lib/eval/orchestrator";
import type { DeepVisionResult } from "../../cli/lib/eval/deep-vision";
import type { Finding, Severity, Verdict } from "../../cli/lib/eval/types";

const DATASET = path.resolve(import.meta.dir, "..", "..", "cli", "lib", "eval", "calibration-datasets", "full-video-pass-569.json");

interface Run {
  id: string;
  expectedLabel: "pass" | "fail";
  storedVerdict: Verdict;
  modelOverallVerdict: Verdict | null;
  fullVideoParsed: boolean;
  findings: { deterministic: string[]; fullVideo: string[]; other: string[]; stored: string[] };
}

const raw = JSON.parse(fs.readFileSync(DATASET, "utf8")) as { examples: Run[] };
const runs = raw.examples;

let n = 0;
function f(spec: string): Finding {
  const i = spec.lastIndexOf(":");
  return {
    id: `X${++n}`,
    category: spec.slice(0, i),
    severity: spec.slice(i + 1) as Severity,
    sceneIndex: null,
    timestampSec: null,
    message: "",
    fixHint: "",
    fixCommand: null,
  };
}
const fs_ = (specs: string[]) => specs.map(f);

/** The shipped (calibrated) aggregation over one stored run. */
function calibratedShipReady(r: Run): boolean {
  const full = calibrateFullVideoFindings(fs_(r.findings.fullVideo), r.modelOverallVerdict);
  const v = fullVideoVerdict({
    findings: [...fs_(r.findings.deterministic), ...full, ...fs_(r.findings.other)],
    fullVideoParsed: r.fullVideoParsed,
    overallVerdict: r.modelOverallVerdict,
  });
  return v.verdict === "pass";
}

/** The previous (post-#569) aggregation: `score()` over every finding. */
function previousShipReady(r: Run): boolean {
  return score(fs_([...r.findings.deterministic, ...r.findings.fullVideo, ...r.findings.other])).verdict === "pass";
}

const labelYes = (r: Run) => r.expectedLabel === "pass";

describe("calibration dataset", () => {
  test("is a valid calibration dataset for the native-video gate", () => {
    const ds = parseCalibrationDataset(raw);
    expect(ds.gate).toBe("native-video");
    expect(ds.examples).toHaveLength(29);
    expect(ds.examples.filter((e) => e.expectedLabel === "pass")).toHaveLength(9);
  });
  test("carries metadata and labels only, no media payloads", () => {
    const text = fs.readFileSync(DATASET, "utf8");
    expect(text).not.toContain("base64");
    expect(text.length).toBeLessThan(100_000);
    for (const r of runs) expect(r.findings.stored.length).toBeGreaterThan(0);
  });
});

describe("agreement with the labels", () => {
  test("before: the previous aggregation ships nothing (0 of 29, 20 of 29 agree)", () => {
    expect(runs.filter(previousShipReady)).toHaveLength(0);
    expect(runs.filter((r) => previousShipReady(r) === labelYes(r))).toHaveLength(20);
  });

  test("after: 28 of 29 agree; the only miss is the run whose full-video pass hit HTTP 413", () => {
    const misses = runs.filter((r) => calibratedShipReady(r) !== labelYes(r)).map((r) => r.id);
    expect(misses).toEqual(["avatar-free-edit"]);
    const parsed = runs.filter((r) => r.fullVideoParsed);
    expect(parsed).toHaveLength(26);
    expect(parsed.every((r) => calibratedShipReady(r) === labelYes(r))).toBe(true);
    expect(runs.filter(calibratedShipReady)).toHaveLength(8);
  });

  test("no false pass: every render labeled not-ship-ready stays blocked", () => {
    expect(runs.filter((r) => !labelYes(r) && calibratedShipReady(r))).toHaveLength(0);
  });

  test("the audit's true catches stay blocked", () => {
    // undelivered payoff mechanism, missing brief pose, register mismatch
    for (const id of ["shibuya-hat-reveal", "gamgee-lump", "astons-alex-demo"]) {
      expect(calibratedShipReady(runs.find((r) => r.id === id)!)).toBe(false);
    }
  });

  test("chance-corrected agreement clears the promotion bar", () => {
    const m = computeCalibrationMetrics(runs.map((r) => ({ expected: !labelYes(r), predicted: !calibratedShipReady(r) })));
    expect(m.confusion).toEqual({ tp: 20, fp: 1, tn: 8, fn: 0 });
    expect(m.cohensKappa!).toBeGreaterThan(0.9);
    const before = computeCalibrationMetrics(runs.map((r) => ({ expected: !labelYes(r), predicted: !previousShipReady(r) })));
    expect(before.cohensKappa).toBe(0);
  });

  test("strict rubric: the stored findings reproduce every stored verdict", () => {
    for (const r of runs) {
      expect(guardInconclusive(score(fs_(r.findings.stored)).verdict, r.fullVideoParsed)).toBe(r.storedVerdict);
    }
  });
});

describe("calibrateFullVideoFindings", () => {
  const sample = () => [
    f("style.timing-hook-first-3s:fail"),
    f("style.rule-violation:fail"),
    f("vision.ai-artifacts:fail"),
    f("brief.intent-drift:fail"),
    f("style.register-mismatch:fail"),
    f("style.timing-body-arc:warn"),
  ];
  test("caps the hook window and unconfirmed detail fails at warn; keeps structural fails", () => {
    const out = calibrateFullVideoFindings(sample(), "warn");
    expect(out.map((x) => x.severity)).toEqual(["warn", "warn", "warn", "fail", "fail", "warn"]);
    expect(out[1]!.fixHint).toContain("not confirmed");
  });
  test("a holistic fail confirms detail fails; the hook window stays capped", () => {
    const out = calibrateFullVideoFindings(sample(), "fail");
    expect(out.map((x) => x.severity)).toEqual(["warn", "fail", "fail", "fail", "fail", "warn"]);
  });
  test("never mutates its input", () => {
    const input = sample();
    calibrateFullVideoFindings(input, null);
    expect(input[0]!.severity).toBe("fail");
  });
});

describe("fullVideoVerdict", () => {
  test("warns alone do not block", () => {
    const v = fullVideoVerdict({ findings: fs_(["vision.text:warn", "audio.loudness:warn", "style.rule-violation:warn"]), fullVideoParsed: true, overallVerdict: "warn" });
    expect(v.verdict).toBe("pass");
  });
  test("any fail blocks, deterministic or full-video", () => {
    expect(fullVideoVerdict({ findings: fs_(["audio.dead-air:fail"]), fullVideoParsed: true, overallVerdict: "pass" }).verdict).toBe("fail");
    expect(fullVideoVerdict({ findings: fs_(["brief.intent-drift:fail"]), fullVideoParsed: true, overallVerdict: "warn" }).verdict).toBe("fail");
  });
  test("the model's holistic fail blocks even without a fail finding", () => {
    expect(fullVideoVerdict({ findings: [], fullVideoParsed: true, overallVerdict: "fail" }).verdict).toBe("fail");
  });
  test("a missing full-video result is inconclusive, never pass", () => {
    expect(fullVideoVerdict({ findings: fs_(["eval.deep-vision-error:warn"]), fullVideoParsed: false, overallVerdict: null }).verdict).toBe("warn");
    expect(guardInconclusive("pass", false)).toBe("warn");
    expect(guardInconclusive("fail", false)).toBe("fail");
  });
});

// ─── orchestrator wiring ──────────────────────────────────────────────────────

let tmp: TmpRoot;
beforeEach(() => {
  tmp = makeTmpRoot("ralphy-full-video-583");
});
afterEach(() => {
  tmp.cleanup();
});

function deps(deep: { overall: Verdict | null; findings: string[]; throws?: boolean }): EvaluateDeps {
  return {
    probeVideo: () => ({ durationSec: 20, resolution: { w: 1080, h: 1920 }, fps: 30, codec: { video: "h264", audio: "aac" }, bitrateKbps: 5000 }),
    detectScenes: async () => [
      { index: 0, startSec: 0, endSec: 1.2, durationSec: 1.2, firstFramePath: null },
      { index: 1, startSec: 1.2, endSec: 20, durationSec: 18.8, firstFramePath: null },
    ],
    analyzeAudio: async () => ({ integratedLufs: -16, truePeakDb: -1.5, loudnessRangeLu: 7, deadAirSegments: [], voicePresentPct: 0.9 }),
    extractKeyframes: async (_v, scenes) => scenes,
    analyzeScenes: async () => [],
    hasModelCredentials: () => true,
    async deepVisionEvaluate(): Promise<DeepVisionResult> {
      if (deep.throws) throw new Error("openrouter 413: Request body exceeds the provider maximum size");
      return {
        raw: "{}",
        parsed: deep.overall ? ({ overall_verdict: deep.overall } as DeepVisionResult["parsed"]) : null,
        findings: fs_(deep.findings).map((x, i) => ({ ...x, id: `D${1001 + i}` })),
        modelUsed: "test-model",
      };
    },
  };
}

function video(): string {
  const p = path.join(tmp.dir, "final.mp4");
  fs.writeFileSync(p, "fake");
  return p;
}

describe("orchestrator applies the calibrated rule on native modes", () => {
  const WARN_ONLY = { overall: "warn" as Verdict, findings: ["style.rule-violation:fail", "style.timing-hook-first-3s:fail", "style.timing-body-arc:warn", "vision.ai-artifacts:warn"] };

  test("a render the model calls warn with unconfirmed detail fails is ship-ready", async () => {
    const r = await evaluateVideo({ videoPath: video(), mode: "deep-style", projectId: null, outDir: tmp.dir, deps: deps(WARN_ONLY), strictRubric: false });
    expect(r.report.scoring.aggregation).toBe(FULL_VIDEO_AGGREGATION);
    expect(r.report.scoring.verdict).toBe("pass");
    expect(r.report.gate.shipReady).toBe(true);
    expect(r.report.findings.filter((x) => x.severity === "fail")).toHaveLength(0);
    // The capped findings stay visible for the repair plan.
    expect(r.report.findings.filter((x) => x.id.startsWith("D"))).toHaveLength(4);
    expect(fs.readFileSync(r.mdPath, "utf8")).toContain(FULL_VIDEO_AGGREGATION);
  });

  test("the strict rubric restores the previous aggregation", async () => {
    const r = await evaluateVideo({ videoPath: video(), mode: "deep-style", projectId: null, outDir: tmp.dir, deps: deps(WARN_ONLY), strictRubric: true });
    expect(r.report.scoring.aggregation).toBe(SCORE_AGGREGATION);
    expect(r.report.scoring.verdict).toBe("fail");
    expect(r.report.gate.shipReady).toBe(false);
  });

  test("a brief miss still blocks", async () => {
    const r = await evaluateVideo({
      videoPath: video(), mode: "native-video", projectId: null, outDir: tmp.dir, strictRubric: false,
      deps: deps({ overall: "warn", findings: ["brief.intent-drift:fail"] }),
    });
    expect(r.report.scoring.verdict).toBe("fail");
    expect(r.report.gate.shipReady).toBe(false);
  });

  test("an errored full-video pass is never ship-ready, in either rubric", async () => {
    for (const strictRubric of [false, true]) {
      const r = await evaluateVideo({ videoPath: video(), mode: "native-video", projectId: null, outDir: tmp.dir, strictRubric, deps: deps({ overall: null, findings: [], throws: true }) });
      expect(r.report.findings.some((x) => x.category === "eval.deep-vision-error")).toBe(true);
      expect(r.report.gate.shipReady).toBe(false);
    }
  });

  test("an unparseable full-video answer is inconclusive", async () => {
    const r = await evaluateVideo({ videoPath: video(), mode: "native-video", projectId: null, outDir: tmp.dir, strictRubric: false, deps: deps({ overall: null, findings: [] }) });
    expect(r.report.findings.some((x) => x.category === "eval.deep-vision-unparsed")).toBe(true);
    expect(r.report.scoring.verdict).toBe("warn");
    expect(r.report.gate.shipReady).toBe(false);
  });

  test("non-native modes keep the generic score() verdict", async () => {
    const r = await evaluateVideo({ videoPath: video(), mode: "keyframe", projectId: null, outDir: tmp.dir, strictRubric: false, deps: deps(WARN_ONLY) });
    expect(r.report.scoring.aggregation).toBeUndefined();
    expect(r.report.gate.shipReady).toBe(false);
  });
});
