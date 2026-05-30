// Unit tests for the contact-sheet ffmpeg filter builder + audio-stats
// stderr parser added in issue #049. No ffmpeg spawn — all assertions are
// on the pure helpers.

import { describe, test, expect } from "bun:test";
import {
  buildContactSheetFilter,
  parseAudioStats,
} from "../../cli/lib/ffmpeg-recipes.js";

describe("buildContactSheetFilter — xstack layout grammar (#049)", () => {
  test("4 tiles, 2 cols → 2×2 grid", () => {
    const { filter, rows } = buildContactSheetFilter({
      count: 4,
      cols: 2,
      tileW: 480,
      tileH: 270,
    });
    expect(rows).toBe(2);
    // Each input gets scaled + padded into [tN].
    expect(filter).toContain("[0:v]scale=480:270:force_original_aspect_ratio=decrease");
    expect(filter).toContain("[t0]");
    expect(filter).toContain("[t1]");
    expect(filter).toContain("[t2]");
    expect(filter).toContain("[t3]");
    // xstack receives 4 inputs and emits [grid].
    expect(filter).toContain("xstack=inputs=4");
    expect(filter).toContain("[grid]");
    // 2×2 layout map: 0_0|w0_0|0_h0|w0_h0
    expect(filter).toContain("layout=0_0|w0_0|0_h0|w0_h0");
  });

  test("5 tiles, 5 cols → 1 row, no padding tiles", () => {
    const { filter, rows } = buildContactSheetFilter({
      count: 5,
      cols: 5,
      tileW: 320,
      tileH: 180,
    });
    expect(rows).toBe(1);
    expect(filter).toContain("xstack=inputs=5");
    // Row 0 → all y=0. Cols stack as 0, w0, w0+w0, w0+w0+w0, w0+w0+w0+w0.
    expect(filter).toContain("layout=0_0|w0_0|w0+w0_0|w0+w0+w0_0|w0+w0+w0+w0_0");
    // No `color=black:size=` padding tiles needed.
    expect(filter).not.toContain("color=black:size=");
  });

  test("3 tiles in 2 cols → pads to 2×2 with a virtual black tile", () => {
    const { filter, rows } = buildContactSheetFilter({
      count: 3,
      cols: 2,
      tileW: 200,
      tileH: 200,
    });
    expect(rows).toBe(2);
    // One padding tile injected to fill the ragged grid.
    expect(filter).toContain("color=black:size=200x200:duration=0.1[t3]");
    expect(filter).toContain("xstack=inputs=4");
  });

  test("count=0 throws", () => {
    expect(() =>
      buildContactSheetFilter({ count: 0, cols: 5, tileW: 480, tileH: 270 }),
    ).toThrow();
  });

  test("cols=1 column-stack equivalent (each row = single tile)", () => {
    const { filter, rows } = buildContactSheetFilter({
      count: 3,
      cols: 1,
      tileW: 480,
      tileH: 270,
    });
    expect(rows).toBe(3);
    // All x=0; y stacks as 0, h0, h0+h0.
    expect(filter).toContain("layout=0_0|0_h0|0_h0+h0");
  });
});

describe("parseAudioStats — volumedetect + ebur128 stderr (#049)", () => {
  test("extracts mean / max volume from volumedetect block", () => {
    const stderr = `
[Parsed_volumedetect_0 @ 0x600000d40000] mean_volume: -23.4 dB
[Parsed_volumedetect_0 @ 0x600000d40000] max_volume: -1.5 dB
[Parsed_volumedetect_0 @ 0x600000d40000] histogram_0db: 12
`;
    const s = parseAudioStats("/tmp/a.mp3", stderr);
    expect(s.path).toBe("/tmp/a.mp3");
    expect(s.mean_volume_db).toBe(-23.4);
    expect(s.max_volume_db).toBe(-1.5);
  });

  test("extracts integrated LUFS, true peak, LRA from ebur128 summary", () => {
    const stderr = `
[Parsed_ebur128_0 @ ...] Summary:
    Integrated loudness:
        I:         -16.2 LUFS
        Threshold: -26.3 LUFS
    Loudness range:
        LRA:         8.3 LU
    True peak:
        Peak:       -1.4 dBFS
`;
    const s = parseAudioStats("/tmp/b.wav", stderr);
    expect(s.integrated_lufs).toBe(-16.2);
    expect(s.true_peak_db).toBe(-1.4);
    expect(s.loudness_range_lu).toBe(8.3);
  });

  test("missing fields surface as null, not NaN / undefined", () => {
    const s = parseAudioStats("/tmp/c.m4a", "garbage with no recognizable lines");
    expect(s.mean_volume_db).toBeNull();
    expect(s.max_volume_db).toBeNull();
    expect(s.integrated_lufs).toBeNull();
    expect(s.true_peak_db).toBeNull();
    expect(s.loudness_range_lu).toBeNull();
  });
});
