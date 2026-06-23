// tests/unit/personal-clipper.test.ts — #436 (personal-clipper mode + `ralphy clip`)
//
// Pins the three pieces #436 delivers:
//   (1) the classifier routes clip-extraction briefs (over podcast / talking-head /
//       tutorial SOURCES) to `personal-clipper`, non-ambiguous;
//   (2) `isModeSupported("personal-clipper")` is true and the registry entry is a
//       first-class route (kind !== "none", gates + Unit shape present);
//   (3) the `ralphy clip` ffmpeg recipe BUILDER emits the expected argv — no real
//       ffmpeg run (mirrors tests/unit/ffmpeg-frame-extend-012.test.ts).
//
// English-only on disk: every fixture brief is plain English.

import { describe, test, expect } from "bun:test";
import {
  classifyContentMode,
  isModeSupported,
  getContentMode,
} from "../../cli/lib/content-modes.js";
import {
  buildClipArgs,
  parseTimestampSec,
  VERTICAL_916_VF,
} from "../../cli/lib/ffmpeg-recipes.js";

// ─── (1) routing: clip-extraction briefs over long-form sources ──────────────

describe("personal-clipper routing (#436)", () => {
  // Each brief names a long-form SOURCE (podcast / talking-head / tutorial /
  // stream) but asks to CUT it into short clips — the clip-extraction intent.
  const clipBriefs: Array<[label: string, brief: string]> = [
    ["podcast source", "cut my podcast into shorts and extract the best moments clips"],
    ["talking-head source", "clip the highlights out of this talking head interview into shorts"],
    ["tutorial source", "turn my long tutorial video into short clips, cut up the best moments"],
    ["stream source", "clip my stream into shorts, extract the best moments"],
  ];

  for (const [label, brief] of clipBriefs) {
    test(`routes the ${label} brief to personal-clipper, non-ambiguous`, () => {
      const r = classifyContentMode(brief);
      expect(r.mode).toBe("personal-clipper");
      expect(r.ambiguous).toBe(false);
      expect(r.confidence).toBeGreaterThan(0);
    });
  }
});

// ─── (2) the mode is a first-class supported route ───────────────────────────

describe("personal-clipper is supported (#436)", () => {
  test("isModeSupported('personal-clipper') is true", () => {
    expect(isModeSupported("personal-clipper")).toBe(true);
  });

  test("the registry entry is a complete first-class route", () => {
    const entry = getContentMode("personal-clipper")!;
    expect(entry.supported).toBe(true);
    expect(entry.implementationUnit.kind).not.toBe("none");
    // No recommendedUnit on a supported entry (that field is gap-only).
    expect(entry.implementationUnit.recommendedUnit).toBeUndefined();
    // The route names the clip-cut verb chain.
    expect(entry.implementationUnit.cliVerbs).toContain("clip");
    expect(entry.implementationUnit.cliVerbs).toContain("ref transcribe");
    // Gates + Unit shape present.
    expect(entry.qualityGates).toContain("scoreVideo");
    expect(entry.expectedUnitShape.format).toBe("video");
    expect(entry.expectedUnitShape.minMedia).toBeGreaterThanOrEqual(1);
  });
});

// ─── (3) the clip ffmpeg recipe builder argv ─────────────────────────────────

describe("buildClipArgs — clip-cut argv shape (#436)", () => {
  test("emits a pre-seek, re-encoded cut with no vertical crop by default", () => {
    const args = buildClipArgs({ src: "in.mp4", startSec: 12, endSec: 45, dst: "out.mp4", vertical: false });
    expect(args).toEqual([
      "-ss", "12",
      "-to", "45",
      "-i", "in.mp4",
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      "out.mp4",
    ]);
  });

  test("`-ss`/`-to` precede `-i` (pre-seek for speed)", () => {
    const args = buildClipArgs({ src: "a.mp4", startSec: 1, endSec: 2, dst: "b.mp4", vertical: false });
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args.indexOf("-to")).toBeLessThan(args.indexOf("-i"));
  });

  test("--vertical injects the 9:16 centre-crop vf chain after -i", () => {
    const args = buildClipArgs({ src: "in.mp4", startSec: 0, endSec: 30, dst: "out.mp4", vertical: true });
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThan(args.indexOf("-i"));
    expect(args[vfIdx + 1]).toBe(VERTICAL_916_VF);
    // The vertical chain crops + scales to 1080x1920.
    expect(VERTICAL_916_VF).toContain("1080:1920");
  });

  test("preserves caller-supplied paths verbatim", () => {
    const args = buildClipArgs({ src: "/tmp/with space/clip.mp4", startSec: 0, endSec: 5, dst: "/tmp/out clip.mp4", vertical: false });
    expect(args).toContain("/tmp/with space/clip.mp4");
    expect(args).toContain("/tmp/out clip.mp4");
  });
});

// ─── timestamp parsing (the agent feeds seconds / MM:SS / HH:MM:SS) ──────────

describe("parseTimestampSec (#436)", () => {
  test("parses bare seconds (float ok)", () => {
    expect(parseTimestampSec("12")).toBe(12);
    expect(parseTimestampSec("12.5")).toBe(12.5);
  });

  test("parses MM:SS", () => {
    expect(parseTimestampSec("1:30")).toBe(90);
    expect(parseTimestampSec("0:05")).toBe(5);
  });

  test("parses HH:MM:SS (with fractional seconds)", () => {
    expect(parseTimestampSec("1:02:03")).toBe(3723);
    expect(parseTimestampSec("0:01:30.5")).toBe(90.5);
  });

  test("returns NaN for unparseable input", () => {
    expect(Number.isNaN(parseTimestampSec(""))).toBe(true);
    expect(Number.isNaN(parseTimestampSec("abc"))).toBe(true);
    expect(Number.isNaN(parseTimestampSec("1:2:3:4"))).toBe(true);
  });
});
