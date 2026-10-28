// #557 — reference digest: sheet layout math, cut-adaptive sampling, the
// tile -> timestamp map, append-only bundle versioning, and one end-to-end
// build on a synthetic two-shot video (skipped when ffmpeg is missing).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CLAUDE_VISION_BUDGET,
  DIGEST_DEFAULTS,
  buildDigest,
  buildFrameMap,
  composeSheet,
  createVersionedDir,
  ctaCandidate,
  cutAdaptiveFrames,
  evenSubsample,
  fitTileWidth,
  fixedCadenceTimes,
  formatTileLabel,
  labelTextWidth,
  metricsFromYtDlpMeta,
  nextVersionedPath,
  normalizeTranscript,
  planFixedFrames,
  planSheetLayout,
  sheetDims,
  visionImageCost,
  type PlannedFrame,
} from "../../cli/lib/ref-digest.js";
import { cutsFromProfile, parseSceneScoreProfile, scenesFromCuts } from "../../cli/lib/eval/scenes.js";

const VERTICAL = 16 / 9;

function withinBudget(w: number, h: number): boolean {
  return Math.max(w, h) <= CLAUDE_VISION_BUDGET.maxLongEdge && w * h <= CLAUDE_VISION_BUDGET.maxPixels;
}

describe("visionImageCost — Claude image token rule", () => {
  test("an image inside the budget is not scaled; tokens = ceil(w*h/750)", () => {
    const c = visionImageCost(800, 600);
    expect(c.downscaled).toBe(false);
    expect(c.width).toBe(800);
    expect(c.tokens).toBe(Math.ceil((800 * 600) / 750));
  });

  test("a large sheet is downscaled under both caps", () => {
    const c = visionImageCost(2160, 3840);
    expect(c.downscaled).toBe(true);
    expect(withinBudget(c.width, c.height)).toBe(true);
    expect(c.tokens).toBeLessThanOrEqual(Math.ceil(CLAUDE_VISION_BUDGET.maxPixels / 750));
  });

  test("a skinny strip is limited by the long edge, not the area", () => {
    const c = visionImageCost(4000, 200);
    expect(c.width).toBe(1568);
    expect(c.height).toBe(78);
  });

  test("zero-size input costs nothing", () => {
    expect(visionImageCost(0, 100).tokens).toBe(0);
  });
});

describe("sheet layout math", () => {
  test("sheetDims adds gutters around and between cells plus the label band", () => {
    const d = sheetDims(3, 2, 100, VERTICAL, 2);
    expect(d.tileHeight).toBe(178);
    expect(d.cellHeight).toBe(d.tileHeight + d.labelHeight);
    expect(d.width).toBe(3 * 100 + 4 * 2);
    expect(d.height).toBe(2 * d.cellHeight + 3 * 2);
  });

  test("fitTileWidth returns the largest even width that still fits", () => {
    const w = fitTileWidth(9, 4, VERTICAL);
    expect(w % 2).toBe(0);
    const ok = sheetDims(9, 4, w, VERTICAL);
    const over = sheetDims(9, 4, w + 2, VERTICAL);
    expect(withinBudget(ok.width, ok.height)).toBe(true);
    expect(withinBudget(over.width, over.height)).toBe(false);
  });

  test.each([16, 36, 64, 120])("%d tiles: grid holds every tile and the fitted sheet is under budget", (tiles) => {
    const L = planSheetLayout({ tiles, aspect: VERTICAL });
    expect(L.cols * L.rows).toBeGreaterThanOrEqual(tiles);
    expect(L.rows).toBe(Math.ceil(tiles / L.cols));
    expect(withinBudget(L.width, L.height)).toBe(true);
    expect(L.clamped).toBe(false);
    expect(L.effectiveTileWidth).toBe(L.tileWidth);
  });

  test("more tiles per sheet means smaller tiles at the same budget", () => {
    const widths = [16, 36, 64, 120].map((t) => planSheetLayout({ tiles: t, aspect: VERTICAL }).tileWidth);
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeLessThan(widths[i - 1]!);
  });

  test("a requested width above the fit is clamped; --no-fit keeps it and the API downscales", () => {
    const fitted = planSheetLayout({ tiles: 36, aspect: VERTICAL, tileWidth: 320 });
    expect(fitted.clamped).toBe(true);
    expect(fitted.tileWidth).toBe(fitted.fitWidth);
    const raw = planSheetLayout({ tiles: 36, aspect: VERTICAL, tileWidth: 320, fit: false });
    expect(raw.tileWidth).toBe(320);
    expect(raw.effectiveTileWidth).toBeLessThan(320);
    expect(withinBudget(raw.width, raw.height)).toBe(false);
  });

  test("a requested width below the fit is honored and costs fewer tokens", () => {
    const small = planSheetLayout({ tiles: 36, aspect: VERTICAL, tileWidth: 96 });
    const fit = planSheetLayout({ tiles: 36, aspect: VERTICAL });
    expect(small.tileWidth).toBe(96);
    expect(small.visionTokens).toBeLessThan(fit.visionTokens);
  });

  test("tiles never upscale past the source width; cols can be forced", () => {
    expect(planSheetLayout({ tiles: 4, aspect: VERTICAL, maxTileWidth: 120 }).tileWidth).toBe(120);
    expect(planSheetLayout({ tiles: 20, aspect: VERTICAL, cols: 4 }).cols).toBe(4);
  });

  test("the shipped default is the eval's chosen setting", () => {
    expect(DIGEST_DEFAULTS.mode).toBe("fixed");
    expect(DIGEST_DEFAULTS.everySec).toBe(0.5);
    expect(DIGEST_DEFAULTS.tilesPerSheet).toBe(36);
    expect(DIGEST_DEFAULTS.maxSheets).toBe(4);
  });
});

describe("fixed cadence", () => {
  test("starts at 0 and stops before the end", () => {
    expect(fixedCadenceTimes(2, 0.5)).toEqual([0, 0.5, 1, 1.5]);
    expect(fixedCadenceTimes(2.05, 0.5, 30)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(fixedCadenceTimes(2.01, 0.5, 30)).toEqual([0, 0.5, 1, 1.5]); // 2.0 is inside the last half frame
    expect(fixedCadenceTimes(0, 0.5)).toEqual([]);
  });

  test("the frame cap subsamples evenly and keeps the first and last", () => {
    expect(evenSubsample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([0, 3, 6, 9]);
    const r = planFixedFrames(60, 0.5, [{ startSec: 0, endSec: 60 }], 50);
    expect(r.capped).toBe(true);
    expect(r.frames).toHaveLength(50);
    expect(r.frames[0]!.t).toBe(0);
  });
});

describe("cut-adaptive sampling", () => {
  const shots = [
    { startSec: 0, endSec: 0.6 },
    { startSec: 0.6, endSec: 4.6 },
    { startSec: 4.6, endSec: 6.6, motion: 0.2 },
  ];

  test("at least one frame per shot; the first shot starts at t = 0", () => {
    const r = cutAdaptiveFrames({ shots, everySec: 1, maxFrames: 100 });
    for (let i = 0; i < shots.length; i++) expect(r.frames.some((f) => f.shot === i)).toBe(true);
    expect(r.frames[0]!.t).toBe(0);
    expect(r.frames.filter((f) => f.role === "shot-start")).toHaveLength(3);
    expect(r.capped).toBe(false);
  });

  test("long shots get one extra frame per `everySec`; fast shots get half the interval", () => {
    const r = cutAdaptiveFrames({ shots, everySec: 1, maxFrames: 100, fastMotion: 0.06 });
    expect(r.frames.filter((f) => f.shot === 1)).toHaveLength(4); // 4 s shot at 1 s
    expect(r.frames.filter((f) => f.shot === 2)).toHaveLength(4); // 2 s fast shot at 0.5 s
    expect(r.frames.filter((f) => f.shot === 0)).toHaveLength(1);
  });

  test("shot-start frames sit just after the cut, inside the shot", () => {
    const r = cutAdaptiveFrames({ shots, everySec: 1, maxFrames: 100 });
    const start1 = r.frames.find((f) => f.shot === 1 && f.role === "shot-start")!;
    expect(start1.t).toBeGreaterThan(0.6);
    expect(start1.t).toBeLessThanOrEqual(0.85);
  });

  test("under the cap, extras shrink but every shot start survives", () => {
    const r = cutAdaptiveFrames({ shots, everySec: 0.25, maxFrames: 6 });
    expect(r.capped).toBe(true);
    expect(r.frames.length).toBeLessThanOrEqual(6);
    expect(r.frames.filter((f) => f.role === "shot-start")).toHaveLength(3);
  });

  test("when shots alone exceed the cap, shots are kept evenly and the rest reported", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ startSec: i, endSec: i + 1 }));
    const r = cutAdaptiveFrames({ shots: many, everySec: 1, maxFrames: 4 });
    expect(r.frames.map((f) => f.shot)).toEqual([0, 3, 6, 9]);
    expect(r.droppedShots).toBe(6);
  });

  test("frames are sorted and never closer than the minimum gap", () => {
    const r = cutAdaptiveFrames({ shots, everySec: 0.1, maxFrames: 200, minGapSec: 0.2 });
    for (let i = 1; i < r.frames.length; i++) {
      expect(r.frames[i]!.t - r.frames[i - 1]!.t).toBeGreaterThanOrEqual(0.2 - 1e-9);
    }
  });
});

describe("tile -> timestamp map", () => {
  const frames: PlannedFrame[] = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => ({ t, shot: 0, role: "cadence" }));

  test("tiles are row-major per sheet and sheets split at tilesPerSheet", () => {
    const sheets = buildFrameMap(frames, 3, 30, 3.2);
    expect(sheets.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(sheets.map((s) => s.frames.map((f) => f.tile))).toEqual([[0, 1, 2], [0, 1, 2], [0]]);
    expect(sheets[1]!.frames.map((f) => f.t)).toEqual([1.5, 2, 2.5]);
  });

  test("each tile resolves to the nearest CFR frame and its exact time", () => {
    const sheets = buildFrameMap([{ t: 1.01, shot: 0, role: "cadence" }], 4, 24, 5);
    expect(sheets[0]!.frames[0]!.frameIndex).toBe(24);
    expect(sheets[0]!.frames[0]!.frameTime).toBe(1);
  });

  test("a target past the last frame clamps to the last decodable frame", () => {
    const sheets = buildFrameMap([{ t: 9.99, shot: 0, role: "cadence" }], 4, 30, 2);
    expect(sheets[0]!.frames[0]!.frameIndex).toBe(59);
  });

  test("labels read as seconds with two decimals", () => {
    expect(formatTileLabel(0)).toBe("0.00s");
    expect(formatTileLabel(12.75)).toBe("12.75s");
  });
});

describe("compositor", () => {
  test("composes a labeled grid of the planned size", () => {
    const L = planSheetLayout({ tiles: 4, aspect: 1, tileWidth: 40, cols: 2 });
    const tile = Buffer.alloc(L.tileWidth * L.tileHeight * 3, 128);
    const sheet = composeSheet(
      [0, 1, 2].map((i) => ({ rgb: tile, label: formatTileLabel(i) })),
      L,
    );
    expect(sheet.width).toBe(L.width);
    expect(sheet.height).toBe(L.height);
    // The label band under tile 0 holds white glyph pixels.
    const bandY = L.gutter + L.tileHeight;
    let white = 0;
    for (let y = bandY; y < bandY + L.labelHeight; y++) {
      for (let x = L.gutter; x < L.gutter + L.tileWidth; x++) {
        if (sheet.rgb[(y * sheet.width + x) * 3] === 255) white++;
      }
    }
    expect(white).toBeGreaterThan(0);
    expect(labelTextWidth("0.00s", 1)).toBe(29);
  });
});

describe("append-only bundle dirs", () => {
  test("nextVersionedPath walks base, base.v2, base.v3", () => {
    const taken = new Set(["/x/digest", "/x/digest.v2"]);
    expect(nextVersionedPath("/x/other", (p) => taken.has(p))).toBe("/x/other");
    expect(nextVersionedPath("/x/digest", (p) => taken.has(p))).toBe("/x/digest.v3");
  });

  test("createVersionedDir never reuses an existing bundle", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-digest-ver-"));
    try {
      const base = path.join(tmp, "refs", "clip", "digest");
      const a = await createVersionedDir(base);
      fs.writeFileSync(path.join(a, "digest.json"), "{}");
      const b = await createVersionedDir(base);
      const c = await createVersionedDir(base);
      expect([a, b, c]).toEqual([base, `${base}.v2`, `${base}.v3`]);
      expect(fs.readFileSync(path.join(a, "digest.json"), "utf8")).toBe("{}");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("scene profile helpers", () => {
  test("parses metadata=print output and thresholds cuts", () => {
    const text = [
      "frame:0    pts:0       pts_time:0",
      "lavfi.scene_score=0.000000",
      "frame:1    pts:512     pts_time:0.5",
      "lavfi.scene_score=0.820000",
      "frame:2    pts:1024    pts_time:1.0",
      "lavfi.scene_score=0.100000",
    ].join("\n");
    const profile = parseSceneScoreProfile(text);
    expect(profile).toEqual([
      { t: 0, score: 0 },
      { t: 0.5, score: 0.82 },
      { t: 1, score: 0.1 },
    ]);
    expect(cutsFromProfile(profile, 0.4)).toEqual([0.5]);
  });

  test("scenesFromCuts merges a sub-minimum scene into the next", () => {
    const scenes = scenesFromCuts([1, 1.2, 3], 4, 0.4);
    expect(scenes.map((s) => [s.startSec, s.endSec])).toEqual([[0, 1], [1, 3], [3, 4]]);
  });
});

describe("transcript, metrics, CTA helpers", () => {
  test("normalizeTranscript accepts Caption[], { captions }, and { words } in seconds", () => {
    const caption = [{ text: " hi ", startMs: 0, endMs: 200, timestampMs: null, confidence: null }];
    expect(normalizeTranscript(caption)).toEqual([{ text: "hi", startMs: 0, endMs: 200 }]);
    expect(normalizeTranscript({ captions: caption })).toEqual([{ text: "hi", startMs: 0, endMs: 200 }]);
    expect(normalizeTranscript({ words: [{ word: "yo", start: 1.5, end: 1.75 }] })).toEqual([
      { text: "yo", startMs: 1500, endMs: 1750 },
    ]);
    expect(normalizeTranscript({ nope: true })).toBeNull();
    expect(normalizeTranscript([{ text: "x" }])).toBeNull();
  });

  test("metricsFromYtDlpMeta keeps known numeric and string fields", () => {
    expect(metricsFromYtDlpMeta({ view_count: 10, like_count: 2, formats: [] })).toEqual({ view_count: 10, like_count: 2 });
    expect(metricsFromYtDlpMeta({ formats: [] })).toBeNull();
  });

  test("ctaCandidate looks only at the last 40% of the transcript", () => {
    const words = [
      { text: "follow", startMs: 1000, endMs: 1200 },
      { text: "Comment", startMs: 9000, endMs: 9300 },
    ];
    expect(ctaCandidate(words, 10)).toEqual({ t: 9, word: "comment" });
  });
});

function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

describe.skipIf(!hasFfmpeg())("buildDigest end to end (synthetic two-shot video)", () => {
  let tmp: string;
  let video: string;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-digest-e2e-"));
    video = path.join(tmp, "two-shot.mp4");
    const r = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=s=180x320:r=30:d=1.5",
      "-f", "lavfi", "-i", "smptebars=s=180x320:r=30:d=1.5",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map", "[v]", "-pix_fmt", "yuv420p", video,
    ]);
    if (r.status !== 0) throw new Error(`fixture encode failed: ${r.stderr?.toString()}`);
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("writes digest.json + sheets, detects the cut, maps tiles to times, versions on rerun", async () => {
    const base = path.join(tmp, "bundle");
    const first = await buildDigest({
      videoPath: video,
      bundleDir: base,
      input: video,
      mode: "fixed",
      everySec: 0.5,
      tilesPerSheet: 4,
      transcript: { skipped: "test" },
      metrics: { views: 5 },
    });
    const d = first.digest;
    expect(first.bundleDir).toBe(base);
    expect(d.video.durationSec).toBeCloseTo(3, 1);
    expect(d.scenes.cuts).toHaveLength(1);
    expect(d.scenes.cuts[0]!).toBeCloseTo(1.5, 1);
    expect(d.sampling.frameCount).toBe(6);
    expect(d.sheets).toHaveLength(2);
    expect(d.sheets[0]!.frames.map((f) => f.t)).toEqual([0, 0.5, 1, 1.5]);
    expect(d.sheets[1]!.frames.map((f) => [f.tile, f.t])).toEqual([[0, 2], [1, 2.5]]);
    expect(d.sheets[1]!.frames.every((f) => f.shot === 1)).toBe(true);
    expect(d.transcript.status).toBe("skipped");
    expect(d.metrics).toEqual({ views: 5 });
    expect(d.cost.visionTokens).toBe(d.sheets.reduce((a, s) => a + s.visionTokens, 0));
    for (const s of d.sheets) expect(fs.existsSync(path.join(base, s.file))).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(first.digestPath, "utf8"));
    expect(onDisk.sheets[0].frames[2].t).toBe(1);

    const second = await buildDigest({ videoPath: video, bundleDir: base, input: video, mode: "cut-adaptive", everySec: 1 });
    expect(second.bundleDir).toBe(`${base}.v2`);
    expect(second.digest.sheets[0]!.frames[0]!.t).toBe(0);
    expect(JSON.parse(fs.readFileSync(first.digestPath, "utf8")).sampling.mode).toBe("fixed");
  }, 30_000);
});
