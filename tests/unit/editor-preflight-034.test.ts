// Unit tests for the preflight aggregation helpers (#034).
// Pure functions over synthetic ProbeResult / ScenarioLike inputs — no
// ffprobe spawn, no filesystem.

import { describe, test, expect } from "bun:test";
import {
  buildPreflightRow,
  computeMusicGap,
  checkCompleteness,
} from "../../cli/lib/editor/preflight.js";
import type { ProbeResult } from "../../cli/lib/ffprobe.js";

const baseProbe = (over: Partial<ProbeResult> = {}): ProbeResult => ({
  path: "/p/scene-01-vid.mp4",
  exists: true,
  size_bytes: 1024,
  duration_s: 5.0,
  width: 1080,
  height: 1920,
  fps: 30,
  codecs: ["h264", "aac"],
  has_video: true,
  has_audio: true,
  ...over,
});

describe("buildPreflightRow (#034)", () => {
  test("normal video probe → reduced aspect + first codec + audio flag", () => {
    const row = buildPreflightRow("scene-01-vid", baseProbe());
    expect(row.slot).toBe("scene-01-vid");
    expect(row.exists).toBe(true);
    expect(row.durationSec).toBe(5.0);
    expect(row.fps).toBe(30);
    expect(row.codec).toBe("h264");
    expect(row.hasAudio).toBe(true);
    expect(row.hasVideo).toBe(true);
    expect(row.aspect).toBe("9:16");
    expect(row.width).toBe(1080);
    expect(row.height).toBe(1920);
  });

  test("16:9 + 1:1 aspects reduce via GCD", () => {
    expect(buildPreflightRow("a", baseProbe({ width: 1920, height: 1080 })).aspect).toBe("16:9");
    expect(buildPreflightRow("a", baseProbe({ width: 1080, height: 1080 })).aspect).toBe("1:1");
  });

  test("missing file surfaces exists=false + error pass-through", () => {
    const row = buildPreflightRow("scene-02", baseProbe({ exists: false, error: "file missing on disk" }));
    expect(row.exists).toBe(false);
    expect(row.error).toBe("file missing on disk");
  });

  test("audio-less clip (kling-mute) flagged via hasAudio=false", () => {
    const row = buildPreflightRow("scene-03", baseProbe({ has_audio: false, codecs: ["h264"] }));
    expect(row.hasAudio).toBe(false);
    expect(row.hasVideo).toBe(true);
    expect(row.codec).toBe("h264");
  });
});

describe("computeMusicGap (#034)", () => {
  test("clips sum to within tolerance of music → exceedsTolerance=false", () => {
    const r = computeMusicGap([5, 6, 9], [20.5], 2.0);
    expect(r).not.toBeNull();
    expect(r!.totalClipSec).toBe(20);
    expect(r!.musicSec).toBe(20.5);
    expect(r!.deltaSec).toBe(-0.5);
    expect(r!.exceedsTolerance).toBe(false);
  });

  test("clips significantly longer than music → exceedsTolerance=true", () => {
    const r = computeMusicGap([10, 10, 10], [15], 2.0);
    expect(r!.deltaSec).toBe(15);
    expect(r!.exceedsTolerance).toBe(true);
  });

  test("uses MAX music duration, not sum — alternates not stems", () => {
    const r = computeMusicGap([10], [10, 20, 5], 2.0);
    expect(r!.musicSec).toBe(20);
  });

  test("empty arrays → null", () => {
    expect(computeMusicGap([], [10], 2.0)).toBeNull();
    expect(computeMusicGap([10], [], 2.0)).toBeNull();
  });
});

describe("checkCompleteness (#034)", () => {
  test("scenario record with all scenes matched → ok=true", () => {
    const scenario = { scenes: { "scene-01": {}, "scene-02": {} } };
    const r = checkCompleteness(scenario, ["scene-01-vid", "scene-02-vid"]);
    expect(r.ok).toBe(true);
    expect(r.missingScenes).toEqual([]);
    expect(r.totalScenes).toBe(2);
  });

  test("missing clip for scene → missingScenes flagged", () => {
    const scenario = { scenes: { "scene-01": {}, "scene-02": {}, "scene-03": {} } };
    const r = checkCompleteness(scenario, ["scene-01-vid", "scene-02-anchor"]);
    expect(r.ok).toBe(false);
    expect(r.missingScenes).toEqual(["scene-03"]);
  });

  test("array scenario shape supported", () => {
    const scenario = { scenes: [{ id: "intro" }, { id: "outro" }] };
    const r = checkCompleteness(scenario, ["intro-vid", "outro"]);
    expect(r.ok).toBe(true);
    expect(r.totalScenes).toBe(2);
  });

  test("clip with no matching scene → unmatchedClips (informational)", () => {
    const scenario = { scenes: { "scene-01": {} } };
    const r = checkCompleteness(scenario, ["scene-01-vid", "bonus-blooper"]);
    expect(r.ok).toBe(true);
    expect(r.unmatchedClips).toEqual(["bonus-blooper"]);
  });

  test("null / missing scenario → ok=true with 0 scenes", () => {
    const r = checkCompleteness(null, ["any"]);
    expect(r.ok).toBe(true);
    expect(r.totalScenes).toBe(0);
  });
});
