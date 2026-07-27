// Unit tests for the cue-sheet SFX stem recipe (#554) and the two-pass
// loudnorm measurement parser. All assertions target the pure helpers —
// no ffmpeg spawn here.

import { describe, test, expect } from "bun:test";
import {
  resolveCueSheet,
  buildStemFilter,
  parseLoudnormMeasurement,
} from "../../cli/lib/ffmpeg-recipes.js";

const SFX = "/tmp/proj/artifacts/sfx";

describe("resolveCueSheet — timing + slot resolution (#554)", () => {
  test("frame + sheet fps resolves to seconds (160 @30fps = 5.333s)", () => {
    const cues = resolveCueSheet({ fps: 30, cues: [{ frame: 160, slot: "click-01" }] }, SFX);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.atSec).toBeCloseTo(5.3333, 4);
    expect(cues[0]!.src).toBe(`${SFX}/click-01.mp3`);
    expect(cues[0]!.gainDb).toBe(0);
  });

  test("bare cue array with `at` seconds needs no fps", () => {
    const cues = resolveCueSheet([{ at: 5.333, slot: "click-01", gainDb: -9 }], SFX);
    expect(cues[0]!.atSec).toBe(5.333);
    expect(cues[0]!.gainDb).toBe(-9);
  });

  test("a slot carrying an extension is honoured verbatim", () => {
    const cues = resolveCueSheet([{ at: 0, slot: "riser.wav" }], SFX);
    expect(cues[0]!.src).toBe(`${SFX}/riser.wav`);
  });

  test("empty sheet errors — both the array and the { cues } form", () => {
    expect(() => resolveCueSheet([], SFX)).toThrow(/empty/);
    expect(() => resolveCueSheet({ fps: 30, cues: [] }, SFX)).toThrow(/empty/);
  });

  test("frame without a sheet fps errors instead of guessing 30", () => {
    expect(() => resolveCueSheet([{ frame: 160, slot: "click-01" }], SFX)).toThrow(/fps/);
  });

  test("a cue with neither at nor frame errors", () => {
    expect(() => resolveCueSheet([{ slot: "click-01" }], SFX)).toThrow(/"at".*"frame"/);
  });

  test("a cue with no slot errors", () => {
    expect(() => resolveCueSheet([{ at: 1 } as any], SFX)).toThrow(/slot/);
  });

  test("a negative cue time errors", () => {
    expect(() => resolveCueSheet([{ at: -0.5, slot: "click-01" }], SFX)).toThrow(/>= 0/);
  });
});

describe("buildStemFilter — filtergraph shape (#554)", () => {
  test("cue at frame 160 @30fps produces adelay=5333|5333", () => {
    const cues = resolveCueSheet({ fps: 30, cues: [{ frame: 160, slot: "click-01" }] }, SFX);
    const f = buildStemFilter(cues);
    expect(f).toContain("adelay=5333|5333");
  });

  test("per-cue gain lands as volume=<g>dB on that cue's chain only", () => {
    const f = buildStemFilter(
      resolveCueSheet(
        [
          { at: 0, slot: "a", gainDb: -9 },
          { at: 1, slot: "b" },
        ],
        SFX,
      ),
    );
    expect(f).toContain("adelay=0|0,volume=-9dB[c0]");
    expect(f).toContain("adelay=1000|1000,volume=0dB[c1]");
  });

  test("N cues produce amix=inputs=N with normalize disabled", () => {
    const cues = resolveCueSheet(
      Array.from({ length: 7 }, (_, i) => ({ at: i * 0.5, slot: `sfx-${i}` })),
      SFX,
    );
    const f = buildStemFilter(cues);
    expect(f).toContain("amix=inputs=7:normalize=0:dropout_transition=0[mix]");
    // one chain per cue, indices match the -i order the recipe uses
    expect(f).toContain("[0:a]aformat=");
    expect(f).toContain("[6:a]aformat=");
    expect(f).toContain("[c0][c1][c2][c3][c4][c5][c6]amix=");
  });

  test("a single cue skips amix entirely (amix=inputs=1 is degenerate)", () => {
    const f = buildStemFilter(resolveCueSheet([{ at: 0, slot: "a" }], SFX));
    expect(f).not.toContain("amix=");
    expect(f).toContain("[c0]anull[mix]");
  });

  test("limiter ceiling is applied with auto-level disabled", () => {
    const cues = resolveCueSheet([{ at: 0, slot: "a" }], SFX);
    expect(buildStemFilter(cues)).toContain("alimiter=limit=0.89:level=disabled");
    expect(buildStemFilter(cues, { limit: 0.7 })).toContain("alimiter=limit=0.7");
  });

  test("--duration pins the tail with apad + atrim; omitted leaves it free", () => {
    const cues = resolveCueSheet([{ at: 0, slot: "a" }], SFX);
    expect(buildStemFilter(cues, { durationSec: 30.5 })).toContain("apad,atrim=0:30.5[out]");
    expect(buildStemFilter(cues)).not.toContain("atrim");
    expect(buildStemFilter(cues)).toContain("[out]");
  });

  test("an empty cue list errors rather than emitting a degenerate graph", () => {
    expect(() => buildStemFilter([])).toThrow(/empty/);
  });
});

describe("parseLoudnormMeasurement — two-pass loudnorm (#554)", () => {
  const JSON_BLOCK = `
[Parsed_loudnorm_0 @ 0x14f704080]
{
	"input_i" : "-27.09",
	"input_tp" : "-4.51",
	"input_lra" : "8.20",
	"input_thresh" : "-37.32",
	"output_i" : "-19.98",
	"output_tp" : "-1.50",
	"target_offset" : "-0.02"
}
`;

  test("extracts the five values pass 2 needs", () => {
    const m = parseLoudnormMeasurement(JSON_BLOCK);
    expect(m).toEqual({
      input_i: -27.09,
      input_tp: -4.51,
      input_lra: 8.2,
      input_thresh: -37.32,
      target_offset: -0.02,
    });
  });

  test("no JSON block → null (caller degrades to single pass)", () => {
    expect(parseLoudnormMeasurement("ffmpeg version 7.1\nsome error")).toBeNull();
  });

  test("silent input reports -inf → null rather than an unusable filter arg", () => {
    const silent = JSON_BLOCK.replace('"-27.09"', '"-inf"');
    expect(parseLoudnormMeasurement(silent)).toBeNull();
  });
});
