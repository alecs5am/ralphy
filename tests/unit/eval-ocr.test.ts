// Text-legibility / OCR gate (#439).
//
// Fixtures use a STUBBED analyzer — NO paid generation, NO network, NO ffmpeg
// (the frame extractor is injected too). Each flow the issue calls out is
// exercised:
//   1. good text → pass, blocksShip:false.
//   2. garbled text / typo → fail + blocksShip:true (refuse, not warn).
//   3. clipped text → fail + blocksShip:true.
//   4. literal markdown artifacts in baked copy → fail (deterministic, model-free).
//   5. expected-copy mismatch → fail.
//   6. unreadable small text → fail.
//   7. non-baked-text mode → applicable:false pass-through.
//   8. sampled video frames are read via the injected extractor.
//
// Plus the registry-derived `hasBakedText` partition. English-only.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import {
  checkTextLegibility,
  type OcrAnalyzer,
  type TextRegion,
} from "../../cli/lib/eval/ocr";
import { hasBakedText } from "../../cli/lib/content-modes";
import type { Scene } from "../../cli/lib/eval/types";

function seed(project: string, rel: string, body = "x") {
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

/** A clean region with all flags false. */
function region(text: string, over: Partial<TextRegion> = {}): TextRegion {
  return { text, location: null, unreadable: false, clipped: false, garbled: false, wrongEmphasis: false, ...over };
}

/** Build an analyzer that returns a fixed result for every image. */
function analyzerOf(result: Awaited<ReturnType<OcrAnalyzer>>): OcrAnalyzer {
  return async () => result;
}

const cleanAnalyzer: OcrAnalyzer = analyzerOf({
  regions: [region("Save 30% today"), region("Tap to learn more")],
  mismatchVsExpected: false,
  issues: [],
});

describe("hasBakedText — registry-derived baked-text partition (#439)", () => {
  test("baked-text modes are gated", () => {
    for (const m of [
      "pinterest-pin", "hero-banner", "social-carousel", "ad-creative-pack",
      "amazon-listing", "motion-design", "typography-animation",
      "infographic-animation", "podcast-video",
    ]) {
      expect(hasBakedText(m)).toBe(true);
    }
  });
  test("text-free / pure-still modes are NOT gated", () => {
    for (const m of [
      "product-shot", "lifestyle-scene", "closeup-product-with-person",
      "conceptual-product", "restyle", "virtual-model-tryout",
      "ugc-review", "tutorial-ugc", "unboxing-ugc", "tv-ad", "cartoon-animation",
    ]) {
      expect(hasBakedText(m)).toBe(false);
    }
  });
  test("unknown mode → not gated", () => {
    expect(hasBakedText("not-a-mode")).toBe(false);
  });
});

describe("checkTextLegibility — non-applicable pass-through", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-ocr-na"); });
  afterEach(() => tmp.cleanup());

  test("a text-free mode returns applicable:false, pass, blocksShip:false", async () => {
    const P = "shot-001";
    seed(P, "artifacts/images/hero-01.png");
    const r = await checkTextLegibility({ projectId: P, mode: "product-shot", analyze: cleanAnalyzer });
    expect(r.applicable).toBe(false);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
  });

  test("no mode resolved → not applicable", async () => {
    const r = await checkTextLegibility({ projectId: "x-001", mode: null, analyze: cleanAnalyzer });
    expect(r.applicable).toBe(false);
    expect(r.blocksShip).toBe(false);
  });

  test("--no-text skips the gate even on a baked-text mode", async () => {
    const P = "carousel-001";
    seed(P, "artifacts/images/slide-01.png");
    const r = await checkTextLegibility({ projectId: P, mode: "social-carousel", noText: true, analyze: cleanAnalyzer });
    expect(r.applicable).toBe(false);
    expect(r.findings).toEqual([]);
  });
});

describe("checkTextLegibility — good text passes", () => {
  let tmp: TmpRoot;
  const P = "carousel-good-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-ocr-pass");
    seed(P, "artifacts/images/slide-01.png");
    seed(P, "artifacts/images/slide-02.png");
  });
  afterEach(() => tmp.cleanup());

  test("all regions clean → pass, blocksShip:false, both assets recorded", async () => {
    const r = await checkTextLegibility({ projectId: P, mode: "social-carousel", analyze: cleanAnalyzer });
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.assets).toHaveLength(2);
    expect(r.findings).toEqual([]);
    expect(r.assets.every((a) => a.fromVideoFrame === false)).toBe(true);
  });
});

describe("checkTextLegibility — defect flows fail + block ship", () => {
  let tmp: TmpRoot;
  const P = "carousel-bad-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-ocr-fail");
    seed(P, "artifacts/images/slide-01.png");
  });
  afterEach(() => tmp.cleanup());

  test("garbled text / typo → fail + blocksShip", async () => {
    const a = analyzerOf({ regions: [region("Limted Tme Ofer", { garbled: true })], mismatchVsExpected: false, issues: [] });
    const r = await checkTextLegibility({ projectId: P, mode: "social-carousel", analyze: a });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("text.garbled-text");
    expect(r.findings.every((f) => f.id.startsWith("TXT"))).toBe(true);
  });

  test("clipped text → fail + blocksShip", async () => {
    const a = analyzerOf({ regions: [region("Get 50% off your first", { clipped: true })], mismatchVsExpected: false, issues: [] });
    const r = await checkTextLegibility({ projectId: P, mode: "amazon-listing", analyze: a });
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("text.clipped-text");
  });

  test("unreadable small text → fail + blocksShip", async () => {
    const a = analyzerOf({ regions: [region("terms apply", { unreadable: true })], mismatchVsExpected: false, issues: [] });
    const r = await checkTextLegibility({ projectId: P, mode: "social-carousel", analyze: a });
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("text.unreadable-small-text");
  });

  test("literal markdown artifacts in baked copy → fail (deterministic)", async () => {
    // The analyzer transcribes the literal markdown — the gate flags it model-free.
    const a = analyzerOf({ regions: [region("**Save big** today")], mismatchVsExpected: false, issues: [] });
    const r = await checkTextLegibility({ projectId: P, mode: "social-carousel", analyze: a });
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("text.markdown-artifact");
  });

  test("a heading-style markdown artifact is caught too", async () => {
    const a = analyzerOf({ regions: [region("# Big Headline")], mismatchVsExpected: false, issues: [] });
    const r = await checkTextLegibility({ projectId: P, mode: "hero-banner", analyze: a });
    expect(r.findings.map((f) => f.category)).toContain("text.markdown-artifact");
  });

  test("wrong emphasis alone is a warn, not a ship-block", async () => {
    const a = analyzerOf({ regions: [region("save BIG today", { wrongEmphasis: true })], mismatchVsExpected: false, issues: [] });
    const r = await checkTextLegibility({ projectId: P, mode: "social-carousel", analyze: a });
    expect(r.blocksShip).toBe(false);
    const emphasis = r.findings.find((f) => f.category === "text.wrong-emphasis");
    expect(emphasis?.severity).toBe("warn");
  });
});

describe("checkTextLegibility — expected-copy mismatch", () => {
  let tmp: TmpRoot;
  const P = "carousel-expected-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-ocr-expected");
    seed(P, "artifacts/images/slide-01.png");
  });
  afterEach(() => tmp.cleanup());

  test("detected copy diverging from expected copy → fail + blocksShip", async () => {
    const a = analyzerOf({ regions: [region("Save 25% today")], mismatchVsExpected: true, issues: [] });
    const r = await checkTextLegibility({
      projectId: P,
      mode: "social-carousel",
      expectedCopy: "Save 30% today",
      analyze: a,
    });
    expect(r.expectedCopyProvided).toBe(true);
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("text.mismatch-vs-expected");
  });

  test("no expected copy supplied → mismatch is never raised", async () => {
    const a = analyzerOf({ regions: [region("Save 25% today")], mismatchVsExpected: true, issues: [] });
    const r = await checkTextLegibility({ projectId: P, mode: "social-carousel", analyze: a });
    expect(r.expectedCopyProvided).toBe(false);
    expect(r.findings.map((f) => f.category)).not.toContain("text.mismatch-vs-expected");
  });
});

describe("checkTextLegibility — sampled video frames (injected extractor)", () => {
  let tmp: TmpRoot;
  const P = "motion-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-ocr-frames");
    seed(P, "render/final.mp4", "fake-mp4");
  });
  afterEach(() => tmp.cleanup());

  test("frames from the render are read, garbled frame fails", async () => {
    // Injected extractor — no ffmpeg. Returns two fake frame paths.
    const fakeExtract = async (_file: string, scenes: Scene[]): Promise<Scene[]> =>
      scenes.slice(0, 2).map((s, i) => ({ ...s, firstFramePath: `/tmp/frame-${i}.jpg` }));
    const a: OcrAnalyzer = async ({ image }) =>
      image.endsWith("frame-0.jpg")
        ? { regions: [region("Glitchd Txt", { garbled: true })], mismatchVsExpected: false, issues: [] }
        : { regions: [region("Clean overlay")], mismatchVsExpected: false, issues: [] };
    const r = await checkTextLegibility({ projectId: P, mode: "motion-design", analyze: a, extractFrames: fakeExtract });
    expect(r.assets.some((x) => x.fromVideoFrame)).toBe(true);
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("text.garbled-text");
  });
});
