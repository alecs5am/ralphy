// Validation-mode selection + ship-ready gate for `ralphy eval` (#411).
//
// Drives the orchestrator with EVERY heavy step injected (probe / scenes /
// audio / keyframes / per-scene vision / full-mp4 deep-vision) so the test runs
// with NO ffmpeg and NO live model call — no `mock.module` on a shared lib
// (forbidden per #072). The injected steps record which passes fired, and the
// returned report carries the resolved mode + gate.
//
// Coverage:
//   • each --mode value triggers the right passes:
//       structure    → no keyframe vision, no full-mp4 pass
//       keyframe      → keyframe vision, no full-mp4 pass
//       native-video  → no style sheet, full-mp4 pass in native-video mode
//       deep-style    → full-mp4 pass in deep-style mode (style sheet loaded)
//   • default final gate with credentials → native-video (or deep-style w/ style ctx)
//   • default with NO credentials → structure (downgraded, NOT ship-ready)
//   • ship-ready gate: keyframe/structure NEVER ship-ready; native-video CAN be.
//
// Also unit-tests the pure resolveMode / resolveGate directly.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { evaluateVideo, type EvaluateDeps } from "../../cli/lib/eval/orchestrator";
import { resolveMode, resolveGate } from "../../cli/lib/eval/gate";
import type { Scene, SceneVision } from "../../cli/lib/eval/types";
import type { DeepVisionResult } from "../../cli/lib/eval/deep-vision";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-eval-modes-411");
});
afterEach(() => {
  tmp.cleanup();
});

// ─── Injected pipeline steps ──────────────────────────────────────────────────

interface Calls {
  probe: number;
  scenes: number;
  audio: number;
  keyframes: number;
  vision: number;
  deepVision: number;
  deepVisionMode: string | null;
  hadStyleSheet: boolean | null;
}

function makeDeps(opts: { credentials: boolean; deepVerdict?: "pass" | "warn" | "fail" }): {
  deps: EvaluateDeps;
  calls: Calls;
} {
  const calls: Calls = {
    probe: 0,
    scenes: 0,
    audio: 0,
    keyframes: 0,
    vision: 0,
    deepVision: 0,
    deepVisionMode: null,
    hadStyleSheet: null,
  };

  const rawScenes: Scene[] = [
    { index: 0, startSec: 0, endSec: 1.5, durationSec: 1.5, firstFramePath: null },
    { index: 1, startSec: 1.5, endSec: 3, durationSec: 1.5, firstFramePath: null },
  ];

  const deps: EvaluateDeps = {
    probeVideo() {
      calls.probe += 1;
      return {
        durationSec: 30,
        resolution: { w: 1080, h: 1920 },
        fps: 30,
        codec: { video: "h264", audio: "aac" },
        bitrateKbps: 5000,
      };
    },
    async detectScenes() {
      calls.scenes += 1;
      return rawScenes;
    },
    async analyzeAudio() {
      calls.audio += 1;
      return {
        integratedLufs: -16,
        truePeakDb: -1.5,
        loudnessRangeLu: 8,
        deadAirSegments: [],
        voicePresentPct: 0.8,
      };
    },
    async extractKeyframes(_video, scenes) {
      calls.keyframes += 1;
      return scenes.map((s) => ({ ...s, firstFramePath: `/frame-${s.index}.jpg` }));
    },
    async analyzeScenes(scenes): Promise<SceneVision[]> {
      calls.vision += 1;
      return scenes.map((s) => ({
        sceneIndex: s.index,
        timestampSec: s.startSec,
        framePath: s.firstFramePath ?? "",
        summary: "clean frame",
        issues: [],
      }));
    },
    async deepVisionEvaluate(_video, ctx): Promise<DeepVisionResult> {
      calls.deepVision += 1;
      calls.deepVisionMode = ctx.mode ?? null;
      calls.hadStyleSheet = !!ctx.styleSheetPath;
      const verdict = opts.deepVerdict ?? "pass";
      return {
        raw: "{}",
        parsed: {
          overall_verdict: verdict,
          what_to_redo: verdict === "pass" ? [] : [{ priority: 1, target: "audio", action: "fix mix" }],
        } as DeepVisionResult["parsed"],
        // No deep findings → keep the deterministic verdict from `score()` clean
        // for the pass case; a fail case injects one fail finding below.
        findings:
          verdict === "fail"
            ? [
                {
                  id: "DTEST",
                  category: "style.rule-violation",
                  severity: "fail",
                  sceneIndex: null,
                  timestampSec: null,
                  message: "injected fail",
                  fixHint: "fix",
                  fixCommand: null,
                },
              ]
            : [],
        modelUsed: "test-model",
      };
    },
    hasModelCredentials() {
      return opts.credentials;
    },
  };

  return { deps, calls };
}

function fakeVideo(): string {
  const p = path.join(tmp.dir, "clip.mp4");
  fs.writeFileSync(p, "fakevideo-bytes");
  return p;
}

// ─── Mode → passes ─────────────────────────────────────────────────────────────

describe("mode selection drives which passes run", () => {
  test("--mode structure → no keyframe vision, no full-mp4 pass", async () => {
    const { deps, calls } = makeDeps({ credentials: true });
    const r = await evaluateVideo({ videoPath: fakeVideo(), mode: "structure", projectId: null, outDir: tmp.dir, deps });
    expect(r.report.gate.mode).toBe("structure");
    expect(calls.keyframes).toBe(0);
    expect(calls.vision).toBe(0);
    expect(calls.deepVision).toBe(0);
  });

  test("--mode keyframe → keyframe vision runs, no full-mp4 pass", async () => {
    const { deps, calls } = makeDeps({ credentials: true });
    const r = await evaluateVideo({ videoPath: fakeVideo(), mode: "keyframe", projectId: null, outDir: tmp.dir, deps });
    expect(r.report.gate.mode).toBe("keyframe");
    expect(calls.keyframes).toBe(1);
    expect(calls.vision).toBe(1);
    expect(calls.deepVision).toBe(0);
  });

  test("--mode native-video → full-mp4 pass in native-video mode, NO style sheet", async () => {
    const { deps, calls } = makeDeps({ credentials: true });
    const r = await evaluateVideo({
      videoPath: fakeVideo(),
      mode: "native-video",
      // Even if a style sheet is passed, native-video must NOT load it.
      styleSheetPath: path.join(tmp.dir, "style.md"),
      projectId: null,
      outDir: tmp.dir,
      deps,
    });
    expect(r.report.gate.mode).toBe("native-video");
    expect(calls.deepVision).toBe(1);
    expect(calls.deepVisionMode).toBe("native-video");
    expect(calls.hadStyleSheet).toBe(false);
  });

  test("--mode deep-style → full-mp4 pass in deep-style mode with style sheet loaded", async () => {
    const { deps, calls } = makeDeps({ credentials: true });
    const styleSheet = path.join(tmp.dir, "STYLE_LOCK.md");
    fs.writeFileSync(styleSheet, "# rules\n");
    const r = await evaluateVideo({
      videoPath: fakeVideo(),
      mode: "deep-style",
      styleSheetPath: styleSheet,
      projectId: null,
      outDir: tmp.dir,
      deps,
    });
    expect(r.report.gate.mode).toBe("deep-style");
    expect(calls.deepVision).toBe(1);
    expect(calls.deepVisionMode).toBe("deep-style");
    expect(calls.hadStyleSheet).toBe(true);
  });
});

// ─── Default final gate (no explicit mode) ──────────────────────────────────────

describe("default final gate (no --mode)", () => {
  test("credentials present, no style context → native-video", async () => {
    const { deps, calls } = makeDeps({ credentials: true });
    const r = await evaluateVideo({ videoPath: fakeVideo(), projectId: null, outDir: tmp.dir, deps });
    expect(r.report.gate.mode).toBe("native-video");
    expect(calls.deepVisionMode).toBe("native-video");
  });

  test("credentials present + style sheet discoverable → deep-style", async () => {
    const { deps, calls } = makeDeps({ credentials: true });
    const styleSheet = path.join(tmp.dir, "STYLE_LOCK.md");
    fs.writeFileSync(styleSheet, "# rules\n");
    const r = await evaluateVideo({
      videoPath: fakeVideo(),
      styleSheetPath: styleSheet,
      projectId: null,
      outDir: tmp.dir,
      deps,
    });
    expect(r.report.gate.mode).toBe("deep-style");
    expect(calls.deepVisionMode).toBe("deep-style");
  });

  test("NO credentials → structure (downgraded, never a ship gate)", async () => {
    const { deps, calls } = makeDeps({ credentials: false });
    const r = await evaluateVideo({ videoPath: fakeVideo(), projectId: null, outDir: tmp.dir, deps });
    expect(r.report.gate.mode).toBe("structure");
    expect(calls.deepVision).toBe(0);
    expect(r.report.gate.shipReady).toBe(false);
    // A downgrade note is surfaced as an info finding.
    expect(r.report.findings.some((f) => f.category === "eval.mode-downgrade")).toBe(true);
  });
});

// ─── Ship-ready gate ─────────────────────────────────────────────────────────

describe("ship-ready gate", () => {
  test("keyframe-only is NEVER ship-ready (even with a clean score)", async () => {
    const { deps } = makeDeps({ credentials: true });
    const r = await evaluateVideo({ videoPath: fakeVideo(), mode: "keyframe", projectId: null, outDir: tmp.dir, deps });
    expect(r.report.scoring.verdict).toBe("pass"); // clean structural score
    expect(r.report.gate.shipReady).toBe(false);
    expect(r.report.gate.nativeVideo).toBe(false);
    expect(r.report.gate.explicitCheapMode).toBe(true);
  });

  test("structure-only is NEVER ship-ready", async () => {
    const { deps } = makeDeps({ credentials: true });
    const r = await evaluateVideo({ videoPath: fakeVideo(), mode: "structure", projectId: null, outDir: tmp.dir, deps });
    expect(r.report.gate.shipReady).toBe(false);
  });

  test("native-video CAN be ship-ready when the verdict passes", async () => {
    const { deps } = makeDeps({ credentials: true, deepVerdict: "pass" });
    const r = await evaluateVideo({ videoPath: fakeVideo(), mode: "native-video", projectId: null, outDir: tmp.dir, deps });
    expect(r.report.scoring.verdict).toBe("pass");
    expect(r.report.gate.nativeVideo).toBe(true);
    expect(r.report.gate.shipReady).toBe(true);
  });

  test("native-video is NOT ship-ready when a fail finding lands", async () => {
    const { deps } = makeDeps({ credentials: true, deepVerdict: "fail" });
    const r = await evaluateVideo({ videoPath: fakeVideo(), mode: "native-video", projectId: null, outDir: tmp.dir, deps });
    expect(r.report.scoring.verdict).toBe("fail");
    expect(r.report.gate.nativeVideo).toBe(true);
    expect(r.report.gate.shipReady).toBe(false);
  });
});

// ─── eval-deep-vision.json persisted (repair-loop compatibility, #409) ──────────

describe("eval-deep-vision.json persisted with what_to_redo intact (#409 compat)", () => {
  test("native-video writes the deep-vision JSON with parsed.what_to_redo", async () => {
    const { deps } = makeDeps({ credentials: true, deepVerdict: "fail" });
    await evaluateVideo({ videoPath: fakeVideo(), mode: "native-video", projectId: null, outDir: tmp.dir, deps });
    const p = path.join(tmp.dir, "eval-deep-vision.json");
    expect(fs.existsSync(p)).toBe(true);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(j.parsed.what_to_redo[0].target).toBe("audio");
    expect(j.parsed.overall_verdict).toBe("fail");
    expect(j.mode).toBe("native-video");
  });
});

// ─── Pure resolveMode / resolveGate ─────────────────────────────────────────────

describe("resolveMode (pure)", () => {
  test("explicit native-video with no credentials downgrades to structure + note", () => {
    const r = resolveMode({ requested: "native-video", modelCredentials: false, styleContextAvailable: false });
    expect(r.mode).toBe("structure");
    expect(r.explicit).toBe(true);
    expect(r.downgradeNote).toBeTruthy();
  });

  test("explicit structure with no credentials runs structure (no downgrade)", () => {
    const r = resolveMode({ requested: "structure", modelCredentials: false, styleContextAvailable: false });
    expect(r.mode).toBe("structure");
    expect(r.downgradeNote).toBeNull();
  });

  test("no request + credentials + style ctx → deep-style", () => {
    expect(resolveMode({ requested: null, modelCredentials: true, styleContextAvailable: true }).mode).toBe("deep-style");
  });

  test("no request + credentials + no style ctx → native-video", () => {
    expect(resolveMode({ requested: null, modelCredentials: true, styleContextAvailable: false }).mode).toBe("native-video");
  });
});

describe("resolveGate (pure)", () => {
  test("keyframe never ship-ready", () => {
    const g = resolveGate({ mode: "keyframe", explicit: true, verdict: "pass" });
    expect(g.shipReady).toBe(false);
    expect(g.nativeVideo).toBe(false);
  });

  test("native-video pass → ship-ready", () => {
    expect(resolveGate({ mode: "native-video", explicit: false, verdict: "pass" }).shipReady).toBe(true);
  });

  test("native-video warn/fail → not ship-ready", () => {
    expect(resolveGate({ mode: "native-video", explicit: false, verdict: "warn" }).shipReady).toBe(false);
    expect(resolveGate({ mode: "deep-style", explicit: false, verdict: "fail" }).shipReady).toBe(false);
  });
});
