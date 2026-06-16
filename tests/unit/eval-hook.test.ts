// First-frame / hook gate (#440).
//
// Fixtures use a STUBBED analyzer + a STUBBED frame extractor — NO paid
// generation, NO network, NO ffmpeg. Every flow the issue calls out is
// exercised:
//   1. STRONG hook → pass, blocksShip:false.
//   2. WEAK hook   → fail + blocksShip:true (refuse, not warn).
//   3. MISLEADING hook → fail + blocksShip:true (opener over-promises).
//   4. mode-threshold variation — the SAME mid scores pass a soft mode and warn
//      a strict mode.
//   5. text-hook legibility sub-check reuses the #439 OCR analyzer.
//   6. no-video project → applicable:false pass-through.
//   7. the hook SCORE (0-100) is exposed for the variant tournament (#421).
//
// Plus the registry-derived `hookThresholdsForMode` partition. English-only.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import {
  checkFirstFrameHook,
  hookThresholdsForMode,
  type HookAnalyzer,
  type HookDimensionScores,
} from "../../cli/lib/eval/hook";
import type { OcrAnalyzer } from "../../cli/lib/eval/ocr";
import type { Scene } from "../../cli/lib/eval/types";

function seed(project: string, rel: string, body = "x") {
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

/** A frame extractor that returns two fake frame paths — NO ffmpeg. */
const fakeExtract = async (_file: string, scenes: Scene[]): Promise<Scene[]> =>
  scenes.map((s, i) => ({ ...s, firstFramePath: `/tmp/hook-frame-${i}.jpg` }));

/** A frame extractor that yields NO first frame (extraction failure). */
const emptyExtract = async (_file: string, scenes: Scene[]): Promise<Scene[]> =>
  scenes.map((s) => ({ ...s, firstFramePath: null }));

/** Build an analyzer returning fixed scores + misleading flag for every frame. */
function analyzerOf(
  scores: HookDimensionScores,
  over: { misleading?: boolean; issues?: Awaited<ReturnType<HookAnalyzer>>["issues"] } = {},
): HookAnalyzer {
  return async () => ({ scores, misleading: over.misleading ?? false, issues: over.issues ?? [] });
}

function scoresOf(v: number): HookDimensionScores {
  return {
    subjectClarity: v,
    visualContrast: v,
    subjectVisibility: v,
    textHookLegibility: v,
    curiosityGap: v,
    scrollStop: v,
  };
}

const STRONG = analyzerOf(scoresOf(9));
const WEAK = analyzerOf(scoresOf(2));

describe("hookThresholdsForMode — registry-derived mode partition (#440)", () => {
  test("scroll-first feed modes get the strict bar", () => {
    for (const m of ["ad-creative-pack", "social-carousel", "pinterest-pin", "hero-banner", "amazon-listing"]) {
      expect(hookThresholdsForMode(m).meanWarn).toBe(7);
    }
  });
  test("already-engaged UGC / long-form modes get the soft bar", () => {
    for (const m of ["ugc-review", "tutorial-ugc", "unboxing-ugc", "podcast-video"]) {
      expect(hookThresholdsForMode(m).meanWarn).toBe(5);
    }
  });
  test("unknown / null mode → default bar", () => {
    expect(hookThresholdsForMode(null).meanWarn).toBe(6);
    expect(hookThresholdsForMode("not-a-mode").meanWarn).toBe(6);
  });
});

describe("checkFirstFrameHook — non-applicable pass-through", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-hook-na"); });
  afterEach(() => tmp.cleanup());

  test("a stills-only project (no video) returns applicable:false, pass, blocksShip:false", async () => {
    const P = "shot-001";
    seed(P, "artifacts/images/hero-01.png");
    const r = await checkFirstFrameHook({ projectId: P, mode: "product-shot", analyze: STRONG, extractFrames: fakeExtract });
    expect(r.applicable).toBe(false);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.hookScore).toBeNull();
  });

  test("a render that yields no first frame → inconclusive warn, not a fail", async () => {
    const P = "noframe-001";
    seed(P, "render/final.mp4", "fake-mp4");
    const r = await checkFirstFrameHook({ projectId: P, mode: "ugc-review", analyze: STRONG, extractFrames: emptyExtract });
    expect(r.applicable).toBe(false);
    expect(r.blocksShip).toBe(false);
    expect(r.findings.map((f) => f.category)).toContain("hook.frame-extraction-failed");
  });
});

describe("checkFirstFrameHook — STRONG hook passes (issue fixture 1)", () => {
  let tmp: TmpRoot;
  const P = "hook-strong-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-hook-strong");
    seed(P, "render/final.mp4", "fake-mp4");
  });
  afterEach(() => tmp.cleanup());

  test("high scores → pass, blocksShip:false, hook score exposed for the tournament", async () => {
    const r = await checkFirstFrameHook({ projectId: P, mode: "ad-creative-pack", analyze: STRONG, extractFrames: fakeExtract });
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.hookScore).toBe(90); // mean 9/10 → 90/100
    expect(r.dimensions?.scrollStop).toBe(9);
    expect(r.frames.firstFrame).toBe("/tmp/hook-frame-0.jpg");
    expect(r.frames.firstSecond).toBe("/tmp/hook-frame-1.jpg");
  });
});

describe("checkFirstFrameHook — WEAK hook fails + blocks ship (issue fixture 2)", () => {
  let tmp: TmpRoot;
  const P = "hook-weak-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-hook-weak");
    seed(P, "render/final.mp4", "fake-mp4");
  });
  afterEach(() => tmp.cleanup());

  test("low scores → fail + blocksShip, per-dimension findings raised, HOOK-prefixed ids", async () => {
    const r = await checkFirstFrameHook({ projectId: P, mode: "social-carousel", analyze: WEAK, extractFrames: fakeExtract });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    const cats = r.findings.map((f) => f.category);
    expect(cats).toContain("hook.unclear-subject");
    expect(cats).toContain("hook.low-contrast");
    expect(cats).toContain("hook.subject-not-visible");
    expect(cats).toContain("hook.no-curiosity-gap");
    expect(cats).toContain("hook.weak-scroll-stop");
    expect(r.findings.every((f) => f.id.startsWith("HOOK"))).toBe(true);
    expect(r.hookScore).toBe(20);
  });
});

describe("checkFirstFrameHook — MISLEADING hook fails (issue fixture 3)", () => {
  let tmp: TmpRoot;
  const P = "hook-misleading-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-hook-misleading");
    seed(P, "render/final.mp4", "fake-mp4");
  });
  afterEach(() => tmp.cleanup());

  test("strong-looking scores but misleading:true → fail + blocksShip with hook.misleading", async () => {
    // The frame scores well on raw pull but over-promises vs the clip.
    const a = analyzerOf(scoresOf(8), { misleading: true });
    const r = await checkFirstFrameHook({ projectId: P, mode: "ugc-review", analyze: a, extractFrames: fakeExtract });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("hook.misleading");
  });
});

describe("checkFirstFrameHook — mode-threshold variation", () => {
  let tmp: TmpRoot;
  const P = "hook-thresh-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-hook-thresh");
    seed(P, "render/final.mp4", "fake-mp4");
  });
  afterEach(() => tmp.cleanup());

  // A mid hook (mean 5.5/10): clears the soft bar, warns under the default bar,
  // warns under the strict bar — the SAME frame, different verdict per mode.
  const MID = analyzerOf({
    subjectClarity: 6,
    visualContrast: 6,
    subjectVisibility: 6,
    textHookLegibility: 6,
    curiosityGap: 5,
    scrollStop: 5,
  });

  test("a mid opener PASSES the soft UGC bar but WARNS the strict scroll-first bar", async () => {
    const soft = await checkFirstFrameHook({ projectId: P, mode: "podcast-video", analyze: MID, extractFrames: fakeExtract });
    expect(soft.verdict).toBe("pass");
    expect(soft.blocksShip).toBe(false);

    const strict = await checkFirstFrameHook({ projectId: P, mode: "ad-creative-pack", analyze: MID, extractFrames: fakeExtract });
    expect(strict.verdict).toBe("warn");
    expect(strict.blocksShip).toBe(false);
    expect(strict.findings.some((f) => f.category === "hook.weak-scroll-stop" && f.severity === "warn")).toBe(true);
  });
});

describe("checkFirstFrameHook — text-hook OCR sub-check reuses #439", () => {
  let tmp: TmpRoot;
  const P = "hook-text-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-hook-text");
    seed(P, "render/final.mp4", "fake-mp4");
  });
  afterEach(() => tmp.cleanup());

  test("an unreadable baked text-hook (via the OCR analyzer) → hook.weak-text-hook fail", async () => {
    // Otherwise-strong frame, but the baked hook text is unreadable per the OCR pass.
    const textAnalyze: OcrAnalyzer = async () => ({
      regions: [{ text: "swipe up now", location: "top", unreadable: true, clipped: false, garbled: false, wrongEmphasis: false }],
      mismatchVsExpected: false,
      issues: [],
    });
    const r = await checkFirstFrameHook({
      projectId: P,
      mode: "social-carousel",
      analyze: STRONG,
      extractFrames: fakeExtract,
      textAnalyze,
    });
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("hook.weak-text-hook");
  });
});

describe("checkFirstFrameHook — model free-text issues carry through", () => {
  let tmp: TmpRoot;
  const P = "hook-issues-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-hook-issues");
    seed(P, "render/final.mp4", "fake-mp4");
  });
  afterEach(() => tmp.cleanup());

  test("an analyzer-raised warn issue is namespaced under hook. and surfaced", async () => {
    const a = analyzerOf(scoresOf(8), {
      issues: [{ category: "letterbox-bars", severity: "warn", message: "thick black bars eat the opener" }],
    });
    const r = await checkFirstFrameHook({ projectId: P, mode: "ugc-review", analyze: a, extractFrames: fakeExtract });
    expect(r.findings.map((f) => f.category)).toContain("hook.letterbox-bars");
  });
});
