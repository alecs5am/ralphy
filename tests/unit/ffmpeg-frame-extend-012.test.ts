// Unit tests for the `buildLastFrameArgs` helper added with the `video frame`
// / `video extend` verbs (issue #012). Pure argv-shape assertions, no spawn.
// Integration counterpart lives in
// tests/integration/cli-video-frame-extend-012.test.ts.

import { describe, test, expect } from "bun:test";
import { buildLastFrameArgs } from "../../cli/lib/ffmpeg-recipes.js";

describe("buildLastFrameArgs — `-sseof -1` argv shape (#012)", () => {
  test("emits the exact ffmpeg argv expected for last-frame extract", () => {
    const args = buildLastFrameArgs("in.mp4", "out.png");
    expect(args).toEqual([
      "-sseof", "-1",
      "-i", "in.mp4",
      "-update", "1",
      "-frames:v", "1",
      "-q:v", "2",
      "out.png",
    ]);
  });

  test("`-sseof` precedes `-i` (input-seek required for EOF-relative)", () => {
    const args = buildLastFrameArgs("a.mp4", "b.png");
    const ssEof = args.indexOf("-sseof");
    const inIdx = args.indexOf("-i");
    expect(ssEof).toBeGreaterThanOrEqual(0);
    expect(inIdx).toBeGreaterThan(ssEof);
  });

  test("`-update 1` is present so ffmpeg overwrites a single image (not a sequence)", () => {
    const args = buildLastFrameArgs("a.mp4", "b.png");
    const updateIdx = args.indexOf("-update");
    expect(updateIdx).toBeGreaterThan(0);
    expect(args[updateIdx + 1]).toBe("1");
  });

  test("preserves caller-supplied paths verbatim (no shell-escape mangling)", () => {
    const args = buildLastFrameArgs("/tmp/with space/clip.mp4", "/tmp/out frame.png");
    expect(args).toContain("/tmp/with space/clip.mp4");
    expect(args).toContain("/tmp/out frame.png");
  });
});
