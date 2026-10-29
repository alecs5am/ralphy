// Track document schema (issue #559).
//
// `ralphy track point|planar|face` writes one JSON document per run. Times
// are source-video seconds; coordinates are source-video pixels. The
// HyperFrames runtime (`ralphy-track.js`) consumes the same shape.
//
// Keyframe shapes by kind:
//   point   { t, frame, x, y, box, confidence, lost }
//   face    { t, frame, x, y, box, confidence, lost }         (x, y = box center)
//   planar  { t, frame, x, y, corners, inliers, confidence, lost }
//           corners are [top-left, top-right, bottom-right, bottom-left]

import { z } from "zod";

export const TRACK_SCHEMA_ID = "ralphy.track/v1" as const;
export const TRACK_KINDS = ["point", "planar", "face"] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

export const TRACK_METHODS: Record<TrackKind, readonly string[]> = {
  point: ["klt", "csrt", "kcf"],
  planar: ["hybrid", "klt", "sift"],
  face: ["mediapipe", "yunet"],
};

export const DEFAULT_TRACK_METHOD: Record<TrackKind, string> = {
  point: "klt",
  planar: "hybrid",
  face: "mediapipe",
};

const finite = z.number().finite();
const Vec2 = z.tuple([finite, finite]);
const Box = z.tuple([finite, finite, finite.nonnegative(), finite.nonnegative()]);
const Quad = z.tuple([Vec2, Vec2, Vec2, Vec2]);

export const TrackKeyframeSchema = z
  .object({
    t: finite.nonnegative(),
    frame: z.number().int().nonnegative(),
    x: finite,
    y: finite,
    confidence: finite.min(0).max(1),
    lost: z.boolean(),
    box: Box.optional(),
    corners: Quad.optional(),
    inliers: z.number().int().nonnegative().optional(),
  })
  .strict();

export type TrackKeyframe = z.infer<typeof TrackKeyframeSchema>;

export const TrackDocumentSchema = z
  .object({
    schema: z.literal(TRACK_SCHEMA_ID),
    kind: z.enum(TRACK_KINDS),
    method: z.string().min(1),
    createdAt: z.string().min(1),
    source: z
      .object({
        path: z.string().min(1),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fps: finite.positive(),
        frames: z.number().int().nonnegative(),
        duration: finite.nonnegative().nullable(),
        procScale: finite.positive().max(1),
      })
      .strict(),
    seed: z
      .object({
        at: finite.nonnegative(),
        to: finite.nonnegative().nullable(),
        box: Box.nullable(),
        quad: Quad.nullable(),
      })
      .strict(),
    engine: z
      .object({
        name: z.literal("opencv-local"),
        stack: z.string().min(1),
        python: z.string(),
        opencv: z.string(),
        numpy: z.string(),
        mediapipe: z.string().nullable(),
        providerCalls: z.literal(0),
      })
      .strict(),
    stats: z
      .object({
        keyframes: z.number().int().positive(),
        tracked: z.number().int().nonnegative(),
        lost: z.number().int().nonnegative(),
        meanConfidence: finite.min(0).max(1),
        firstLostAt: finite.nonnegative().nullable(),
      })
      .strict(),
    keyframes: z.array(TrackKeyframeSchema).min(1),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if (!TRACK_METHODS[doc.kind].includes(doc.method)) {
      ctx.addIssue({ code: "custom", path: ["method"], message: `method ${doc.method} is not valid for ${doc.kind}` });
    }
    let prev = -Infinity;
    doc.keyframes.forEach((k, i) => {
      if (!(k.t > prev)) {
        ctx.addIssue({ code: "custom", path: ["keyframes", i, "t"], message: "keyframe times must be strictly increasing" });
      }
      prev = k.t;
      if (doc.kind === "planar" && !k.corners) {
        ctx.addIssue({ code: "custom", path: ["keyframes", i, "corners"], message: "planar keyframes need corners" });
      }
      if (doc.kind !== "planar" && !k.box) {
        ctx.addIssue({ code: "custom", path: ["keyframes", i, "box"], message: `${doc.kind} keyframes need box` });
      }
    });
    if (doc.stats.keyframes !== doc.keyframes.length) {
      ctx.addIssue({ code: "custom", path: ["stats", "keyframes"], message: "stats.keyframes must equal keyframes.length" });
    }
  });

export type TrackDocument = z.infer<typeof TrackDocumentSchema>;

export function computeTrackStats(keyframes: TrackKeyframe[]): TrackDocument["stats"] {
  const lostKeys = keyframes.filter((k) => k.lost);
  const mean = keyframes.reduce((sum, k) => sum + k.confidence, 0) / Math.max(1, keyframes.length);
  return {
    keyframes: keyframes.length,
    tracked: keyframes.length - lostKeys.length,
    lost: lostKeys.length,
    meanConfidence: Math.round(mean * 10_000) / 10_000,
    firstLostAt: lostKeys.length > 0 ? lostKeys[0]!.t : null,
  };
}

/** Parse `x,y,w,h` (source pixels). Returns null on any malformed input. */
export function parseBox(raw: string): [number, number, number, number] | null {
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts as [number, number, number, number];
  if (w <= 0 || h <= 0) return null;
  return [x, y, w, h];
}

/** Parse `x1,y1,x2,y2,x3,y3,x4,y4` (TL, TR, BR, BL). Returns null when malformed. */
export function parseQuad(raw: string): [[number, number], [number, number], [number, number], [number, number]] | null {
  const n = raw.split(",").map((p) => Number(p.trim()));
  if (n.length !== 8 || n.some((v) => !Number.isFinite(v))) return null;
  return [
    [n[0]!, n[1]!],
    [n[2]!, n[3]!],
    [n[4]!, n[5]!],
    [n[6]!, n[7]!],
  ];
}

/** Parse seconds, `MM:SS`, or `HH:MM:SS` (fractional last field). NaN when invalid. */
export function parseTrackTime(raw: string): number {
  const s = String(raw).trim();
  if (s === "") return NaN;
  const parts = s.split(":");
  if (parts.length > 3) return NaN;
  let total = 0;
  for (const part of parts) {
    const v = Number(part);
    if (part.trim() === "" || !Number.isFinite(v) || v < 0) return NaN;
    total = total * 60 + v;
  }
  return total;
}
