// Track JSON schema + verb helpers (issue #559).

import { describe, expect, test } from "bun:test";
import {
  computeTrackStats,
  parseBox,
  parseQuad,
  parseTrackTime,
  TRACK_SCHEMA_ID,
  TrackDocumentSchema,
  type TrackDocument,
} from "../../cli/lib/track/schema.js";
import { defaultTrackOut, nextFreeFile, trackLoaderScript } from "../../cli/commands/track.js";

function pointDoc(overrides: Partial<TrackDocument> = {}): TrackDocument {
  const keyframes = [
    { t: 0, frame: 0, x: 10, y: 20, box: [5, 15, 10, 10] as [number, number, number, number], confidence: 1, lost: false },
    { t: 1 / 30, frame: 1, x: 11, y: 21, box: [6, 16, 10, 10] as [number, number, number, number], confidence: 0.9, lost: false },
    { t: 2 / 30, frame: 2, x: 11, y: 21, box: [6, 16, 10, 10] as [number, number, number, number], confidence: 0.1, lost: true },
  ];
  return {
    schema: TRACK_SCHEMA_ID,
    kind: "point",
    method: "klt",
    createdAt: "2026-10-30T00:00:00.000Z",
    source: { path: "/tmp/clip.mp4", width: 640, height: 360, fps: 30, frames: 3, duration: 0.1, procScale: 1 },
    seed: { at: 0, to: null, box: [5, 15, 10, 10], quad: null },
    engine: { name: "opencv-local", stack: "py3.12-test", python: "3.12.13", opencv: "5.0.0", numpy: "2.5.4", mediapipe: null, providerCalls: 0 },
    stats: computeTrackStats(keyframes),
    keyframes,
    ...overrides,
  };
}

describe("track schema", () => {
  test("a well-formed point document validates", () => {
    const r = TrackDocumentSchema.safeParse(pointDoc());
    expect(r.success).toBe(true);
  });

  test("stats summarize lost frames and the first lost time", () => {
    const s = pointDoc().stats;
    expect(s).toEqual({ keyframes: 3, tracked: 2, lost: 1, meanConfidence: 0.6667, firstLostAt: 2 / 30 });
  });

  test("planar keyframes must carry four corners", () => {
    const doc = pointDoc({ kind: "planar", method: "hybrid" });
    const r = TrackDocumentSchema.safeParse(doc);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("planar keyframes need corners");
  });

  test("a planar document with corners validates", () => {
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const keyframes = [
      { t: 0, frame: 0, x: 5, y: 5, corners, inliers: 40, confidence: 1, lost: false },
      { t: 0.5, frame: 15, x: 6, y: 5, corners, inliers: 38, confidence: 0.95, lost: false },
    ];
    const doc = pointDoc({ kind: "planar", method: "hybrid", keyframes, stats: computeTrackStats(keyframes), seed: { at: 0, to: null, box: null, quad: corners } });
    expect(TrackDocumentSchema.safeParse(doc).success).toBe(true);
  });

  test("keyframe times must be strictly increasing", () => {
    const doc = pointDoc();
    doc.keyframes[2]!.t = doc.keyframes[1]!.t;
    const r = TrackDocumentSchema.safeParse(doc);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("strictly increasing");
  });

  test("method must belong to the kind", () => {
    expect(TrackDocumentSchema.safeParse(pointDoc({ method: "mediapipe" })).success).toBe(false);
  });

  test("confidence is bounded to 0..1 and providerCalls is pinned to 0", () => {
    const doc = pointDoc();
    doc.keyframes[0]!.confidence = 1.5;
    expect(TrackDocumentSchema.safeParse(doc).success).toBe(false);
    const doc2 = pointDoc();
    (doc2.engine as { providerCalls: number }).providerCalls = 1;
    expect(TrackDocumentSchema.safeParse(doc2).success).toBe(false);
  });

  test("unknown keys are rejected (strict)", () => {
    const doc = pointDoc() as TrackDocument & { extra?: number };
    doc.extra = 1;
    expect(TrackDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

describe("track flag parsing", () => {
  test("parseBox", () => {
    expect(parseBox("10,20,30,40")).toEqual([10, 20, 30, 40]);
    expect(parseBox("10, 20, 30.5, 40")).toEqual([10, 20, 30.5, 40]);
    expect(parseBox("10,20,0,40")).toBeNull();
    expect(parseBox("10,20,30")).toBeNull();
    expect(parseBox("a,b,c,d")).toBeNull();
  });

  test("parseQuad", () => {
    expect(parseQuad("0,0,10,0,10,10,0,10")).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(parseQuad("0,0,10,0,10,10")).toBeNull();
  });

  test("parseTrackTime", () => {
    expect(parseTrackTime("1.5")).toBe(1.5);
    expect(parseTrackTime("1:30")).toBe(90);
    expect(parseTrackTime("1:02:03.5")).toBe(3723.5);
    expect(Number.isNaN(parseTrackTime(""))).toBe(true);
    expect(Number.isNaN(parseTrackTime("-1"))).toBe(true);
    expect(Number.isNaN(parseTrackTime("1::2"))).toBe(true);
  });
});

describe("append-only outputs", () => {
  test("nextFreeFile keeps the name when free and versions it otherwise", () => {
    const taken = new Set(["/a/clip.track-point.json", "/a/clip.track-point.v2.json"]);
    const exists = (p: string) => taken.has(p);
    expect(nextFreeFile("/a/other.json", exists)).toBe("/a/other.json");
    expect(nextFreeFile("/a/clip.track-point.json", exists)).toBe("/a/clip.track-point.v3.json");
  });

  test("defaultTrackOut sits next to the video", () => {
    expect(defaultTrackOut("/v/shot.mp4", "planar")).toBe("/v/shot.track-planar.json");
  });

  test("trackLoaderScript registers the document on window.__tracks", () => {
    const fakeWindow: { __tracks?: Record<string, unknown> } = {};
    const src = trackLoaderScript("bowl.point", { kind: "point", keyframes: [] });
    new Function("window", src)(fakeWindow);
    expect(fakeWindow.__tracks?.["bowl.point"]).toEqual({ kind: "point", keyframes: [] });
  });
});
