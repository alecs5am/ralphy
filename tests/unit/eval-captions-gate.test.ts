// Caption sync + readability gate (#441).
//
// Fixtures use a STUBBED placement analyzer + a STUBBED frame extractor +
// synthetic caption / word-timing data — NO paid generation, NO network, NO
// ffmpeg. The four issue fixtures are exercised:
//   1. on-time, glanceable, clear track → pass, blocksShip:false.
//   2. late/drift vs the word-level timing → fail + blocksShip:true.
//   3. overcrowded windows → fail + blocksShip:true.
//   4. occluding (caption over a face/product/CTA) → fail + blocksShip:true.
// Plus: too-short windows, the no-caption pass-through, the placement skip, and
// that the new categories DO NOT collide with the eval density findings.
// English-only.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import {
  checkCaptions,
  type CaptionPlacementAnalyzer,
} from "../../cli/lib/eval/captions-gate";
import type { Caption } from "../../cli/lib/captions/types";
import type { Scene } from "../../cli/lib/eval/types";

function seed(project: string, rel: string, body = "x") {
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

/** A frame extractor that returns N fake frame paths — NO ffmpeg. */
const fakeExtract = async (_file: string, scenes: Scene[]): Promise<Scene[]> =>
  scenes.map((s) => ({ ...s, firstFramePath: `/tmp/cap-frame-${s.index}.jpg` }));

/** Placement analyzer that never flags anything (clean placement). */
const CLEAN: CaptionPlacementAnalyzer = async () => ({
  occludesSubject: false,
  occludedElement: null,
  inUnsafeZone: false,
  issues: [],
});

/** Placement analyzer that flags occlusion of the speaker's face on every frame. */
const OCCLUDING: CaptionPlacementAnalyzer = async () => ({
  occludesSubject: true,
  occludedElement: "speaker's face",
  inUnsafeZone: false,
  issues: [],
});

/** A word-level scribe track from explicit start times (ms). */
function wordsAt(...startsMs: number[]): Caption[] {
  return startsMs.map((s, i) => ({
    text: `w${i}`,
    startMs: s,
    endMs: s + 200,
    timestampMs: s + 100,
    confidence: 0.99,
  }));
}

/** An on-time, well-paced caption track: 3-word chunks, ~1.2s each, snapped to word starts. */
function onTimeCaptions(): Caption[] {
  return [
    { text: "the new", startMs: 0, endMs: 1200, timestampMs: 600, confidence: 0.99 },
    { text: "cream is", startMs: 1200, endMs: 2400, timestampMs: 1800, confidence: 0.99 },
    { text: "here now", startMs: 2400, endMs: 3600, timestampMs: 3000, confidence: 0.99 },
  ];
}

describe("checkCaptions — non-applicable pass-through", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-cap-na"); });
  afterEach(() => tmp.cleanup());

  test("a project with no caption track returns applicable:false, pass, blocksShip:false", async () => {
    const P = "shot-001";
    seed(P, "render/final.mp4", "fake-mp4");
    const r = await checkCaptions({ projectId: P, mode: "ugc-review", analyze: CLEAN, extractFrames: fakeExtract });
    expect(r.applicable).toBe(false);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.captionCount).toBe(0);
  });
});

describe("checkCaptions — ON-TIME track passes (issue fixture 1)", () => {
  let tmp: TmpRoot;
  const P = "cap-ontime-001";
  beforeEach(() => { tmp = makeTmpRoot("ralphy-cap-ontime"); });
  afterEach(() => tmp.cleanup());

  test("on-time, glanceable, clean placement → pass, blocksShip:false, CAP-prefixed ids", async () => {
    const r = await checkCaptions({
      projectId: P,
      mode: "ugc-review",
      captions: onTimeCaptions(),
      captionSource: "captions.json",
      // Word starts snapped to the caption starts → zero drift.
      wordTimings: wordsAt(0, 600, 1200, 1800, 2400, 3000),
      frames: ["/tmp/cap-frame-0.jpg", "/tmp/cap-frame-1.jpg"],
      analyze: CLEAN,
    });
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.captionCount).toBe(3);
    expect(r.wordTimingsProvided).toBe(true);
    expect(r.frames.length).toBe(2);
  });
});

describe("checkCaptions — LATE/DRIFT track fails (issue fixture 2)", () => {
  let tmp: TmpRoot;
  const P = "cap-late-001";
  beforeEach(() => { tmp = makeTmpRoot("ralphy-cap-late"); });
  afterEach(() => tmp.cleanup());

  test("captions firing ~1s after their words → fail + blocksShip with captions.late", async () => {
    // The voice speaks early (words at 0/200/400ms); both captions fire ≥600ms
    // after the nearest word start — a visible lag past the fail floor.
    const late: Caption[] = [
      { text: "the new", startMs: 1000, endMs: 2200, timestampMs: 1600, confidence: 0.99 },
      { text: "cream is", startMs: 2200, endMs: 3400, timestampMs: 2800, confidence: 0.99 },
    ];
    const r = await checkCaptions({
      projectId: P,
      mode: "ugc-review",
      captions: late,
      wordTimings: wordsAt(0, 200, 400),
      noPlacement: true,
      analyze: CLEAN,
    });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    const cats = r.findings.map((f) => f.category);
    expect(cats).toContain("captions.late");
    expect(r.findings.every((f) => f.id.startsWith("CAP"))).toBe(true);
  });
});

describe("checkCaptions — OVERCROWDED track fails (issue fixture 3)", () => {
  let tmp: TmpRoot;
  const P = "cap-crowded-001";
  beforeEach(() => { tmp = makeTmpRoot("ralphy-cap-crowded"); });
  afterEach(() => tmp.cleanup());

  test("a 12-word window → fail + blocksShip with captions.overcrowded", async () => {
    const crowded: Caption[] = [
      {
        text: "this is a really long caption with far too many words to read",
        startMs: 0,
        endMs: 4000,
        timestampMs: 2000,
        confidence: 0.99,
      },
    ];
    const r = await checkCaptions({ projectId: P, mode: "ugc-review", captions: crowded, noPlacement: true, analyze: CLEAN });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("captions.overcrowded");
  });
});

describe("checkCaptions — OCCLUDING placement fails (issue fixture 4)", () => {
  let tmp: TmpRoot;
  const P = "cap-occlude-001";
  beforeEach(() => { tmp = makeTmpRoot("ralphy-cap-occlude"); });
  afterEach(() => tmp.cleanup());

  test("caption box over the speaker's face → fail + blocksShip with captions.occluding", async () => {
    const r = await checkCaptions({
      projectId: P,
      mode: "ugc-review",
      captions: onTimeCaptions(),
      frames: ["/tmp/cap-frame-0.jpg"],
      analyze: OCCLUDING,
    });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("captions.occluding");
  });
});

describe("checkCaptions — too-short windows + density non-collision", () => {
  let tmp: TmpRoot;
  const P = "cap-short-001";
  beforeEach(() => { tmp = makeTmpRoot("ralphy-cap-short"); });
  afterEach(() => tmp.cleanup());

  test("a sub-350ms window → captions.too-short fail", async () => {
    const flash: Caption[] = [
      { text: "blink", startMs: 0, endMs: 200, timestampMs: 100, confidence: 0.99 },
    ];
    const r = await checkCaptions({ projectId: P, mode: "ugc-review", captions: flash, noPlacement: true, analyze: CLEAN });
    expect(r.findings.map((f) => f.category)).toContain("captions.too-short");
    expect(r.blocksShip).toBe(true);
  });

  test("the gate NEVER emits the density categories owned by findings.ts", async () => {
    const r = await checkCaptions({
      projectId: P,
      mode: "ugc-review",
      captions: onTimeCaptions(),
      wordTimings: wordsAt(0, 600, 1200, 1800, 2400, 3000),
      noPlacement: true,
      analyze: CLEAN,
    });
    const cats = r.findings.map((f) => f.category);
    expect(cats).not.toContain("captions.thin");
    expect(cats).not.toContain("captions.dense");
    expect(cats).not.toContain("captions.missing");
  });
});

describe("checkCaptions — disk caption resolution", () => {
  let tmp: TmpRoot;
  const P = "cap-disk-001";
  beforeEach(() => { tmp = makeTmpRoot("ralphy-cap-disk"); });
  afterEach(() => tmp.cleanup());

  test("reads the legacy project-root captions.json (bare Caption[])", async () => {
    seed(P, "captions.json", JSON.stringify([
      { text: "hello there", startMs: 0, endMs: 1200, timestampMs: 600, confidence: 0.9 },
    ]));
    const r = await checkCaptions({ projectId: P, mode: "ugc-review", noPlacement: true, analyze: CLEAN });
    expect(r.applicable).toBe(true);
    expect(r.captionSource).toBe("captions.json");
    expect(r.captionCount).toBe(1);
  });

  test("reads a per-slot artifacts/captions/<slot>.json ({ captions: [...] })", async () => {
    seed(P, "artifacts/captions/scene-01.json", JSON.stringify({
      captions: [{ text: "hello there", startMs: 0, endMs: 1200, timestampMs: 600, confidence: 0.9 }],
      language: "eng",
    }));
    const r = await checkCaptions({ projectId: P, mode: "ugc-review", noPlacement: true, analyze: CLEAN });
    expect(r.applicable).toBe(true);
    expect(r.captionSource).toBe(path.join("artifacts/captions", "scene-01.json"));
    expect(r.captionCount).toBe(1);
  });
});
