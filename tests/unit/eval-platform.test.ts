// Platform spec validator (#443).
//
// Fixtures INJECT fake probe facts — NO ffprobe, NO image-size header read, NO
// network. The deterministic spec checks (aspect / resolution / duration / codec
// / file-size / safe-area / metadata) run for real since they ARE the gate. The
// issue's four hard-fail examples are exercised plus a spec-compliant pass, and
// every assertion confirms the fix text is CONCRETE. English-only.

import { describe, test, expect } from "bun:test";
import {
  validatePlatformSpec,
  PLATFORM_PROFILES,
  PLATFORM_KEYS,
  isPlatformKey,
  type MediaFacts,
  type MediaProbe,
} from "../../cli/lib/eval/platform";

/** A clean 1080x1920 9:16 H.264/AAC video well under any cap. */
function goodVideo(over: Partial<MediaFacts> = {}): MediaFacts {
  return {
    kind: "video",
    width: 1080,
    height: 1920,
    durationSec: 30,
    fileSizeBytes: 20 * 1024 * 1024, // 20MB
    videoCodec: "h264",
    audioCodec: "aac",
    ...over,
  };
}

/** A clean 1080x1080 square image under any cap. */
function goodImage(over: Partial<MediaFacts> = {}): MediaFacts {
  return {
    kind: "image",
    width: 1080,
    height: 1080,
    durationSec: null,
    fileSizeBytes: 1 * 1024 * 1024, // 1MB
    videoCodec: null,
    audioCodec: null,
    ...over,
  };
}

/** A probe that returns the given facts for any path (single-media fixtures). */
function probeOf(facts: MediaFacts): MediaProbe {
  return () => facts;
}

const cats = (r: { findings: Array<{ category: string }> }) => r.findings.map((f) => f.category);
const failCats = (r: { findings: Array<{ category: string; severity: string }> }) =>
  r.findings.filter((f) => f.severity === "fail").map((f) => f.category);

describe("PLATFORM_PROFILES — the spec table", () => {
  test("covers the seven issue platforms", () => {
    for (const p of ["tiktok", "reels", "shorts", "meta-ad", "app-store-screenshot", "amazon-listing-image", "web"]) {
      expect(PLATFORM_KEYS).toContain(p);
      expect(PLATFORM_PROFILES[p]).toBeDefined();
    }
  });
  test("isPlatformKey gates unknown names", () => {
    expect(isPlatformKey("tiktok")).toBe(true);
    expect(isPlatformKey("myspace")).toBe(false);
  });
});

describe("validatePlatformSpec — PASS (spec-compliant)", () => {
  test("a clean 9:16 H.264 video passes TikTok + Reels", () => {
    const r = validatePlatformSpec({
      projectId: "plat-pass-001",
      platforms: ["tiktok", "reels"],
      media: ["render/final.mp4"],
      probe: probeOf(goodVideo()),
    });
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
  });

  test("a clean 1:1 image passes amazon-listing-image (1080x1080 ≥ 1000)", () => {
    const r = validatePlatformSpec({
      projectId: "plat-pass-002",
      platforms: ["amazon-listing-image"],
      media: ["artifacts/images/hero.png"],
      probe: probeOf(goodImage()),
    });
    expect(r.verdict).toBe("pass");
    expect(r.findings).toEqual([]);
  });
});

describe("validatePlatformSpec — FAIL examples (issue scope)", () => {
  test("wrong aspect (landscape on TikTok) → fail + concrete crop/scale fix", () => {
    const r = validatePlatformSpec({
      projectId: "plat-aspect-001",
      platforms: ["tiktok"],
      media: ["render/final.mp4"],
      probe: probeOf(goodVideo({ width: 1920, height: 1080 })),
    });
    expect(r.blocksShip).toBe(true);
    expect(r.verdict).toBe("fail");
    expect(failCats(r)).toContain("format.aspect-ratio");
    const f = r.findings.find((x) => x.category === "format.aspect-ratio")!;
    expect(f.message).toContain("1920x1080");
    expect(f.fixHint).toContain("9:16"); // concrete target ratio
    expect(f.fixHint.toLowerCase()).toContain("crop");
  });

  test("over-duration (120s on a 90s Reels) → fail + trim fix", () => {
    const r = validatePlatformSpec({
      projectId: "plat-dur-001",
      platforms: ["reels"],
      media: ["render/final.mp4"],
      probe: probeOf(goodVideo({ durationSec: 120 })),
    });
    expect(r.blocksShip).toBe(true);
    expect(failCats(r)).toContain("format.duration");
    const f = r.findings.find((x) => x.category === "format.duration")!;
    expect(f.message).toContain("120.0s");
    expect(f.message).toContain("90s"); // the cap is named
    expect(f.fixHint).toMatch(/≤\s*90s/);
  });

  test("unsupported codec (vp9 on TikTok) → fail + concrete re-encode fix", () => {
    const r = validatePlatformSpec({
      projectId: "plat-codec-001",
      platforms: ["tiktok"],
      media: ["render/final.mp4"],
      probe: probeOf(goodVideo({ videoCodec: "vp9" })),
    });
    expect(r.blocksShip).toBe(true);
    expect(failCats(r)).toContain("format.codec");
    const f = r.findings.find((x) => x.category === "format.codec")!;
    // "H.264 required; got vp9 — re-encode (ffmpeg -c:v libx264 ...)"
    expect(f.fixHint).toContain("H264");
    expect(f.fixHint).toContain("vp9");
    expect(f.fixHint).toContain("libx264");
  });

  test("over-filesize (400MB on a 287MB TikTok cap) → fail + re-encode fix", () => {
    const r = validatePlatformSpec({
      projectId: "plat-size-001",
      platforms: ["tiktok"],
      media: ["render/final.mp4"],
      probe: probeOf(goodVideo({ fileSizeBytes: 400 * 1024 * 1024 })),
    });
    expect(r.blocksShip).toBe(true);
    expect(failCats(r)).toContain("format.file-size");
    const f = r.findings.find((x) => x.category === "format.file-size")!;
    expect(f.message).toContain("400.0MB");
    expect(f.message).toContain("287MB");
    expect(f.fixHint.toLowerCase()).toContain("re-encode");
  });

  test("resolution below the floor (480x854 on Shorts 720x1280 min) → fail", () => {
    const r = validatePlatformSpec({
      projectId: "plat-res-001",
      platforms: ["shorts"],
      media: ["render/final.mp4"],
      probe: probeOf(goodVideo({ width: 480, height: 854 })),
    });
    expect(r.blocksShip).toBe(true);
    expect(failCats(r)).toContain("format.resolution");
  });

  test("media-kind mismatch (an image targeted at TikTok video) → fail, other checks skip", () => {
    const r = validatePlatformSpec({
      projectId: "plat-kind-001",
      platforms: ["tiktok"],
      media: ["artifacts/images/hero.png"],
      probe: probeOf(goodImage()),
    });
    expect(r.blocksShip).toBe(true);
    expect(cats(r)).toEqual(["format.media-kind"]);
  });
});

describe("validatePlatformSpec — WARN signals (soft, no block)", () => {
  test("declared safe inset tighter than the platform chrome → warn", () => {
    const r = validatePlatformSpec({
      projectId: "plat-safe-001",
      platforms: ["tiktok"],
      media: ["render/final.mp4"],
      declaredSafeArea: { bottom: 0.05 }, // TikTok needs ≥ 0.16 bottom
      probe: probeOf(goodVideo()),
    });
    expect(r.blocksShip).toBe(false);
    expect(cats(r)).toContain("format.safe-area");
    const f = r.findings.find((x) => x.category === "format.safe-area")!;
    expect(f.severity).toBe("warn");
    expect(f.fixHint.toLowerCase()).toContain("safe band");
  });

  test("missing required metadata → warn (only when presentMetadata is supplied)", () => {
    const r = validatePlatformSpec({
      projectId: "plat-meta-001",
      platforms: ["tiktok"],
      media: ["render/final.mp4"],
      presentMetadata: { tiktok: [] }, // caption absent
      probe: probeOf(goodVideo()),
    });
    expect(r.blocksShip).toBe(false);
    expect(cats(r)).toContain("format.metadata");
  });
});

describe("validatePlatformSpec — non-applicable + finding-id prefix", () => {
  test("no valid platform → applicable:false pass", () => {
    const r = validatePlatformSpec({
      projectId: "plat-na-001",
      platforms: ["myspace"],
      media: ["render/final.mp4"],
      probe: probeOf(goodVideo()),
    });
    expect(r.applicable).toBe(false);
    expect(r.blocksShip).toBe(false);
    // the unknown-platform warn still surfaces
    expect(cats(r)).toContain("format.unknown-platform");
  });

  test("no media → applicable:false pass", () => {
    const r = validatePlatformSpec({
      projectId: "plat-na-002",
      platforms: ["tiktok"],
      media: [],
      probe: probeOf(goodVideo()),
    });
    expect(r.applicable).toBe(false);
    expect(r.verdict).toBe("pass");
  });

  test("findings use the PLT prefix and the format.* category family", () => {
    const r = validatePlatformSpec({
      projectId: "plat-prefix-001",
      platforms: ["tiktok"],
      media: ["render/final.mp4"],
      probe: probeOf(goodVideo({ width: 1920, height: 1080, videoCodec: "vp9" })),
    });
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings.every((f) => f.id.startsWith("PLT"))).toBe(true);
    // format.* so it folds into the scorecard platformFit dimension + editor repair.
    expect(r.findings.every((f) => f.category.startsWith("format."))).toBe(true);
  });
});
