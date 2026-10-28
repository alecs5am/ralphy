// Gate usefulness audit (#569): the relaxed / advisory defaults and the
// RALPHY_EVAL_STRICT_RUBRIC opt-in that restores the pre-audit severities.
// Evidence for every change lives in docs/research/gate-audit-2026-10.md.
// Pure fixtures: no ffmpeg, no ffprobe, no model calls.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import { buildFindings, isNineBySixteen } from "../../cli/lib/eval/findings";
import { buildCaptionStats } from "../../cli/lib/eval/orchestrator";
import { checkCaptions, isWordLevelTrack } from "../../cli/lib/eval/captions-gate";
import { validatePlatformSpec, type MediaFacts } from "../../cli/lib/eval/platform";
import { strictRubricEnabled, STRICT_RUBRIC_ENV } from "../../cli/lib/eval/strict-rubric";
import { scoreScenario, type Scenario } from "../../cli/lib/score";
import type { AudioStats, CaptionStats, Scene, SceneVision, VideoMeta } from "../../cli/lib/eval/types";
import type { Caption } from "../../cli/lib/captions/types";

// ─── fixtures ──────────────────────────────────────────────────────────────────

function meta(w: number, h: number): VideoMeta {
  return {
    video: "/tmp/final.mp4",
    projectId: null,
    template: null,
    evaluatedAt: "2026-10-28T00:00:00.000Z",
    durationSec: 30,
    resolution: { w, h },
    fps: 30,
    codec: { video: "h264", audio: "aac" },
    bitrateKbps: 8000,
  };
}

const QUIET_AUDIO: AudioStats = {
  integratedLufs: -16,
  truePeakDb: -2,
  loudnessRangeLu: 6,
  deadAirSegments: [],
  voicePresentPct: 1,
};

const NO_CAPTIONS: CaptionStats = { available: false, wordCount: null, wordsPerSecond: null, densityWarn: null };

/** One continuous 30 s shot: the cut-based hook-zone proxy fires on it. */
const ONE_SHOT: Scene[] = [{ index: 0, startSec: 0, endSec: 30, durationSec: 30, firstFramePath: null }];

function findingsFor(over: {
  w?: number;
  h?: number;
  scenes?: Scene[];
  vision?: SceneVision[];
  strictRubric?: boolean;
} = {}) {
  return buildFindings({
    meta: meta(over.w ?? 1080, over.h ?? 1920),
    declared: null,
    scenes: over.scenes ?? ONE_SHOT,
    audio: QUIET_AUDIO,
    captions: NO_CAPTIONS,
    vision: over.vision ?? [],
    hookTranscript: "",
    strictRubric: over.strictRubric ?? false,
  });
}

const byCat = (fs: Array<{ category: string; severity: string }>, cat: string) => fs.filter((f) => f.category === cat);

// ─── strict-rubric switch ──────────────────────────────────────────────────────

describe("strictRubricEnabled", () => {
  test("off by default and for falsy spellings", () => {
    expect(strictRubricEnabled({})).toBe(false);
    for (const v of ["", "0", "false", "no", " FALSE "]) {
      expect(strictRubricEnabled({ [STRICT_RUBRIC_ENV]: v })).toBe(false);
    }
  });
  test("on for 1 / true / yes", () => {
    for (const v of ["1", "true", "yes"]) expect(strictRubricEnabled({ [STRICT_RUBRIC_ENV]: v })).toBe(true);
  });
});

// ─── eval structure findings ───────────────────────────────────────────────────

describe("buildFindings — hook-zone-static is advisory (#569)", () => {
  test("a long first shot is reported as info, not warn", () => {
    const hz = byCat(findingsFor(), "structure.hook-zone-static");
    expect(hz).toHaveLength(1);
    expect(hz[0]!.severity).toBe("info");
    expect(hz[0]!.message).toContain("hard cuts only");
  });
  test("strict rubric restores the warn", () => {
    const hz = byCat(findingsFor({ strictRubric: true }), "structure.hook-zone-static");
    expect(hz[0]!.severity).toBe("warn");
  });
});

describe("buildFindings — resolution rule (#569)", () => {
  test("9:16 at 2x (2160x3840) raises nothing", () => {
    const f = findingsFor({ w: 2160, h: 3840 });
    expect(byCat(f, "format.resolution")).toHaveLength(0);
    expect(byCat(f, "format.aspect-ratio")).toHaveLength(0);
    expect(isNineBySixteen(2160, 3840)).toBe(true);
  });
  test("9:16 below 1080 wide warns on resolution", () => {
    const f = byCat(findingsFor({ w: 720, h: 1280 }), "format.resolution");
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("warn");
  });
  test("a portrait frame that is not 9:16 warns on aspect ratio", () => {
    const f = byCat(findingsFor({ w: 1180, h: 2560 }), "format.aspect-ratio");
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("warn");
  });
  test("landscape stays a hard fail", () => {
    const f = byCat(findingsFor({ w: 1920, h: 1080 }), "format.aspect-ratio");
    expect(f[0]!.severity).toBe("fail");
  });
  test("strict rubric warns on any size other than 1080x1920", () => {
    const f = byCat(findingsFor({ w: 2160, h: 3840, strictRubric: true }), "format.resolution");
    expect(f).toHaveLength(1);
  });
});

describe("buildFindings — keyframe vision is capped at warn (#569)", () => {
  const vision: SceneVision[] = [{
    sceneIndex: 0,
    timestampSec: 1,
    framePath: "/tmp/scene-00.jpg",
    summary: "",
    issues: [{ category: "text", severity: "fail", message: "Headline cut off on the left." }],
  }];
  test("a keyframe fail lands as warn with a confirm-first hint", () => {
    const f = byCat(findingsFor({ vision }), "vision.text");
    expect(f[0]!.severity).toBe("warn");
    expect((f[0] as { fixHint: string }).fixHint).toContain("confirm on the full video");
  });
  test("strict rubric keeps the keyframe fail", () => {
    const f = byCat(findingsFor({ vision, strictRubric: true }), "vision.text");
    expect(f[0]!.severity).toBe("fail");
  });
});

describe("buildCaptionStats — counts words, not caption entries (#569)", () => {
  test("a phrase track reads at its real words per second", () => {
    const phrases = [
      { text: "Small dog lump.", startMs: 0, endMs: 1500 },
      { text: "Three very different possibilities.", startMs: 1500, endMs: 4000 },
    ];
    const stats = buildCaptionStats(phrases, 3);
    expect(stats.wordCount).toBe(7);
    expect(stats.wordsPerSecond).toBeCloseTo(7 / 3, 3);
  });
});

// ─── captions gate ─────────────────────────────────────────────────────────────

/** A word-by-word scribe track: one word per entry, ~150 ms each. */
function wordTrack(n: number): Caption[] {
  return Array.from({ length: n }, (_, i) => ({
    text: `word${i}`,
    startMs: i * 200,
    endMs: i * 200 + 150,
    timestampMs: i * 200 + 75,
    confidence: 0.99,
  }));
}

describe("checkCaptions — word-level tracks skip the too-short window check (#569)", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-cap-wordlevel"); });
  afterEach(() => tmp.cleanup());

  test("a 20-entry word-level track passes", async () => {
    const caps = wordTrack(20);
    expect(isWordLevelTrack(caps)).toBe(true);
    const r = await checkCaptions({ projectId: "cap-wl-001", mode: "ugc-review", captions: caps, noPlacement: true, strictRubric: false });
    expect(r.findings.filter((f) => f.category === "captions.too-short")).toHaveLength(0);
    expect(r.wordLevelTrack).toBe(true);
    expect(r.blocksShip).toBe(false);
  });

  test("strict rubric restores the too-short fail on the same track", async () => {
    const r = await checkCaptions({ projectId: "cap-wl-002", mode: "ugc-review", captions: wordTrack(20), noPlacement: true, strictRubric: true });
    expect(r.findings.some((f) => f.category === "captions.too-short" && f.severity === "fail")).toBe(true);
  });

  test("a short phrase track is not word-level", () => {
    expect(isWordLevelTrack(wordTrack(3))).toBe(false);
    expect(isWordLevelTrack(Array.from({ length: 10 }, () => ({ text: "a phrase window" })))).toBe(false);
  });
});

// ─── platform-spec gate ────────────────────────────────────────────────────────

function video(over: Partial<MediaFacts> = {}): MediaFacts {
  return { kind: "video", width: 1080, height: 1920, durationSec: 30, fileSizeBytes: 20 * 1024 * 1024, videoCodec: "h264", audioCodec: "aac", ...over };
}
function still(): MediaFacts {
  return { kind: "image", width: 1024, height: 1024, durationSec: null, fileSizeBytes: 1024 * 1024, videoCodec: null, audioCodec: null };
}

describe("validatePlatformSpec — intermediates and over-size frames (#569)", () => {
  test("source stills beside a render are not failed uploads to a video platform", () => {
    const r = validatePlatformSpec({
      projectId: "plat-569-001",
      platforms: ["reels", "shorts"],
      media: ["render/final.mp4", "artifacts/images/dog.png"],
      probe: (abs) => (abs.endsWith(".png") ? still() : video()),
      strictRubric: false,
    });
    expect(r.findings.filter((f) => f.category === "format.media-kind")).toHaveLength(0);
    expect(r.blocksShip).toBe(false);
  });

  test("with no file of the right kind, the mismatch still fails", () => {
    const r = validatePlatformSpec({
      projectId: "plat-569-002",
      platforms: ["tiktok"],
      media: ["artifacts/images/dog.png"],
      probe: () => still(),
    });
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toEqual(["format.media-kind"]);
  });

  test("a 2160x3840 render is a downscale warn, not a block", () => {
    const r = validatePlatformSpec({
      projectId: "plat-569-003",
      platforms: ["reels"],
      media: ["render/final.mp4"],
      probe: () => video({ width: 2160, height: 3840 }),
      strictRubric: false,
    });
    const res = r.findings.filter((f) => f.category === "format.resolution");
    expect(res).toHaveLength(1);
    expect(res[0]!.severity).toBe("warn");
    expect(r.blocksShip).toBe(false);
  });

  test("strict rubric restores the over-size fail", () => {
    const r = validatePlatformSpec({
      projectId: "plat-569-004",
      platforms: ["reels"],
      media: ["render/final.mp4"],
      probe: () => video({ width: 2160, height: 3840 }),
      strictRubric: true,
    });
    expect(r.blocksShip).toBe(true);
  });

  describe("auto-discovery", () => {
    let tmp: TmpRoot;
    beforeEach(() => { tmp = makeTmpRoot("ralphy-plat-569"); });
    afterEach(() => tmp.cleanup());

    function seed(project: string, rel: string) {
      const abs = path.join(projectDir(project), rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "x");
    }

    test("with a render, intermediate clips under artifacts/videos are not validated", () => {
      const P = "plat-569-disk";
      seed(P, "render/final.mp4");
      seed(P, "artifacts/videos/raw-take.mp4");
      const r = validatePlatformSpec({
        projectId: P,
        platforms: ["reels"],
        probe: (abs) => (abs.includes("raw-take") ? video({ width: 1280, height: 720 }) : video()),
      });
      expect(r.results.map((x) => x.media)).toEqual([path.join("render", "final.mp4")]);
      expect(r.blocksShip).toBe(false);
    });

    test("without a render, artifacts/videos are the deliverables", () => {
      const P = "plat-569-norender";
      seed(P, "artifacts/videos/clip.mp4");
      const r = validatePlatformSpec({ projectId: P, platforms: ["reels"], probe: () => video() });
      expect(r.results.map((x) => x.media)).toEqual([path.join("artifacts", "videos", "clip.mp4")]);
    });
  });
});

// ─── scenario gate ─────────────────────────────────────────────────────────────

function scenario(over: Partial<Scenario> & Record<string, unknown> = {}): Scenario {
  return {
    target_duration_s: 60,
    angle: "tutorial",
    hook: "here is exactly how the three rules work together in one recipe you can copy",
    scenes: { "scene-01": { id: "scene-01", target_duration_s: 8 }, "scene-02": { id: "scene-02", target_duration_s: 50 } },
    ...over,
  } as Scenario;
}

describe("scoreScenario — format-aware hard fails (#569)", () => {
  test("a long hook is a warning above the short-ad tier", () => {
    const r = scoreScenario(scenario(), { strictRubric: false });
    expect(r.tier).toBe("long-form");
    expect(r.failures.some((f) => /Hook is \d+ words/.test(f))).toBe(false);
    expect(r.warnings.some((w) => /short-ad default/.test(w))).toBe(true);
    expect(r.passed).toBe(true);
  });

  test("the short-ad tier keeps the 10-word hook cap hard", () => {
    const r = scoreScenario(
      scenario({ target_duration_s: 15, scenes: { "scene-01": { id: "scene-01", target_duration_s: 3 } } as any }),
      { strictRubric: false },
    );
    expect(r.failures.some((f) => /Hook is \d+ words; max 10/.test(f))).toBe(true);
  });

  test("strict rubric restores the universal hook cap", () => {
    const r = scoreScenario(scenario(), { strictRubric: true });
    expect(r.failures.some((f) => /Hook is \d+ words; max 10/.test(f))).toBe(true);
  });

  test("an undeclared duration follows the scene total, not a 15 s default", () => {
    const r = scoreScenario(scenario({ target_duration_s: undefined, hook: "watch this" }), { strictRubric: false });
    expect(r.tier).toBe("long-form");
    expect(r.failures).toEqual([]);
  });

  test("durationSec is read as a declared duration alias", () => {
    const r = scoreScenario(scenario({ target_duration_s: undefined, durationSec: 30, hook: "watch this" } as any), { strictRubric: false });
    expect(r.tier).toBe("mid-form");
    expect(r.failures.some((f) => /exceeds target 30s/.test(f))).toBe(true);
  });

  test("a mode that does not declare scoreScenario gets warnings, not a refusal", () => {
    const r = scoreScenario({ content_mode: "personal-clipper", scenes: [] } as unknown as Scenario, { strictRubric: false });
    expect(r.passed).toBe(true);
    expect(r.advisory).toContain("personal-clipper");
    expect(r.warnings.some((w) => w.includes("Scenario has no scenes[]"))).toBe(true);
  });

  test("a mode that declares scoreScenario stays hard", () => {
    const r = scoreScenario({ content_mode: "ugc-review", scenes: [] } as unknown as Scenario, { strictRubric: false });
    expect(r.passed).toBe(false);
    expect(r.advisory).toBeNull();
  });

  test("green-zone overlays stay hard even for a non-declaring mode", () => {
    const r = scoreScenario(
      {
        content_mode: "motion-design",
        target_duration_s: 20,
        hook: "watch this",
        scenes: { "scene-01": { id: "scene-01", target_duration_s: 4, text_overlays: [{ x: 100, y: 1700, width: 400, height: 80, text: "caption" }] } },
      } as unknown as Scenario,
      { strictRubric: false },
    );
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("Green Zone"))).toBe(true);
  });

  test("an explicit mode option overrides the scenario's content_mode", () => {
    const r = scoreScenario({ content_mode: "ugc-review", scenes: [] } as unknown as Scenario, { mode: "podcast-video", strictRubric: false });
    expect(r.passed).toBe(true);
  });
});
