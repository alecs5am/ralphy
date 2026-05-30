// Unit tests for the `sidechainCompress` filter-graph fix (#011).
//
// Failure mode being asserted: ffmpeg parses single-letter labels like `[v]` /
// `[m]` against its stream-specifier grammar BEFORE the filtergraph parser
// gets a turn, producing `Stream specifier 'v' matches no streams` (exit 234).
// The fix replaces the labels with multi-char tokens: `[voice]`, `[music]`,
// `[mducked]`, `[mixed]`.
//
// This file's job is the *string* contract — what does the helper emit into
// the -filter_complex argument. The integration counterpart actually spawns
// ffmpeg against synthetic VO + music and asserts the mp4/wav lands on disk.

import { describe, test, expect } from "bun:test";
import { buildSidechainFilter } from "../../cli/lib/ffmpeg-recipes.js";

describe("buildSidechainFilter — multi-char labels (#011)", () => {
  test("emits [voice] / [music] / [mducked] / [mixed] — never single-letter labels", () => {
    const filter = buildSidechainFilter({
      threshold: 0.05,
      ratio: 8,
      mix: [1, 0.6],
    });

    // Hard guarantee: no `[v]` or `[m]` as labels. We match the literal
    // bracket-wrapped single-char form so we do not false-positive on `[voice]`.
    expect(filter).not.toMatch(/\[v\]/);
    expect(filter).not.toMatch(/\[m\]/);

    // And the canonical labels are present in the expected positions.
    expect(filter).toContain("[voice]");
    expect(filter).toContain("[music]");
    expect(filter).toContain("[mducked]");
    expect(filter).toContain("[mixed]");
  });

  test("preserves the sidechain chain order: music keyed by voice, then amix", () => {
    const filter = buildSidechainFilter({
      threshold: 0.05,
      ratio: 8,
      mix: [1, 0.6],
    });
    const steps = filter.split(";");
    expect(steps[0]).toBe("[0:a]volume=1[voice]");
    expect(steps[1]).toBe("[1:a]volume=0.6[music]");
    expect(steps[2]).toBe(
      "[music][voice]sidechaincompress=threshold=0.05:ratio=8:attack=10:release=250[mducked]",
    );
    expect(steps[3]).toBe(
      "[voice][mducked]amix=inputs=2:duration=longest:dropout_transition=2[mixed]",
    );
  });

  test("threshold + ratio + mix volumes flow into the chain verbatim", () => {
    const filter = buildSidechainFilter({
      threshold: 0.1,
      ratio: 4,
      mix: [0.9, 0.4],
    });
    expect(filter).toContain("volume=0.9[voice]");
    expect(filter).toContain("volume=0.4[music]");
    expect(filter).toContain("threshold=0.1:ratio=4");
  });

  test("--loudnorm chains a loudnorm step on the mixed output", () => {
    const filter = buildSidechainFilter({
      threshold: 0.05,
      ratio: 8,
      mix: [1, 0.6],
      loudnorm: -16,
    });
    const steps = filter.split(";");
    // amix now lands on [premix], loudnorm lifts it to [mixed].
    expect(steps).toHaveLength(5);
    expect(steps[3]).toContain("amix=inputs=2:duration=longest");
    expect(steps[3]).toContain("[premix]");
    expect(steps[4]).toBe("[premix]loudnorm=I=-16:TP=-1.5:LRA=11[mixed]");
    // [mixed] is still the final label so `-map [mixed]` keeps working.
    expect(filter).toMatch(/\[mixed\]$/);
  });

  test("--loudnorm respects custom LUFS target", () => {
    const filter = buildSidechainFilter({
      threshold: 0.05,
      ratio: 8,
      mix: [1, 0.6],
      loudnorm: -23,
    });
    expect(filter).toContain("loudnorm=I=-23:TP=-1.5:LRA=11");
  });

  test("no --loudnorm → 4-step chain ending on [mixed] (legacy path stays cheap)", () => {
    const filter = buildSidechainFilter({
      threshold: 0.05,
      ratio: 8,
      mix: [1, 0.6],
    });
    const steps = filter.split(";");
    expect(steps).toHaveLength(4);
    expect(filter).not.toContain("loudnorm");
    expect(filter).not.toContain("[premix]");
  });
});
