// Distribution + publishing factory (#458) — the delta on top of `unit package`
// (#423): the additive schema fields (#1), channel-profile spec/safe-area
// validation wired in (#2), the packaged ZIP (#3), and the readiness gate (#5).
//
// Mirrors the #423 harness (distribution-pack.test.ts): in-process
// `buildDistributionPack` with an INJECTED media probe + caption draft fn — no
// live LLM, no ffprobe, and no paid generation.
//
// English-only-on-disk: every fixture string is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import { buildDistributionPack } from "../../cli/lib/distribution";
import {
  DistributionPackSchema,
  profileKeyFor,
} from "../../cli/lib/schemas/distribution-pack";
import type { MediaFacts } from "../../cli/lib/eval/platform";

const PROJECT = "dist-fixture-458";

const draftFn = async () => ({
  tiktok: "POV: the bundle packs itself",
  reels: "One render, every platform — the factory zips it for you.",
  shorts: "Pack once, post everywhere",
});
const EXISTING_CAPTION = {
  platform: { tiktok: "tiktok hook", reels: "reels caption", shorts: "title" },
  hashtags: ["#fyp", "#demo"],
  language: "English",
  niche: "demo",
  created: new Date().toISOString(),
};

let tmp: TmpRoot;
beforeEach(() => {
  tmp = makeTmpRoot("ralphy-dist-458");
});
afterEach(() => {
  tmp.cleanup();
});

/** Seed a project registry + a unit dir with the given manifest + media files. */
function seedUnit(rootDir: string, slug: string, manifest: Record<string, unknown>): string {
  fs.writeFileSync(
    path.join(rootDir, ".ralphy", "registry.json"),
    JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Dist", workspace: "default" } } }),
  );
  const unitDir = path.join(projectDir(PROJECT), "units", slug);
  fs.mkdirSync(unitDir, { recursive: true });
  for (const m of manifest.media as string[]) {
    fs.writeFileSync(path.join(unitDir, m), `bytes-of-${m}`);
  }
  fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify(manifest, null, 2));
  return unitDir;
}

function baseManifest(slug: string, format: string, media: string[], over: Record<string, unknown> = {}) {
  return { slug, format, media, tags: ["demo"], created: new Date().toISOString(), caption: EXISTING_CAPTION, ...over };
}

/**
 * A fake media probe: spec-conformant 9:16 1080x1920 H.264 video for .mp4, and a
 * spec-conformant 1080x1080 H.264-irrelevant still for images. Keyed on
 * extension so a unit can mix kinds. No ffprobe / image-size touches disk.
 */
const okProbe = (abs: string): MediaFacts => {
  const ext = path.extname(abs).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(ext)) {
    return { kind: "video", width: 1080, height: 1920, durationSec: 12, fileSizeBytes: 2_000_000, videoCodec: "h264", audioCodec: "aac" };
  }
  return { kind: "image", width: 1080, height: 1080, durationSec: null, fileSizeBytes: 200_000, videoCodec: null, audioCodec: null };
};

/** A fake probe that returns a WRONG aspect (16:9) video → a hard spec fail. */
const badAspectProbe = (abs: string): MediaFacts => {
  const ext = path.extname(abs).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(ext)) {
    return { kind: "video", width: 1920, height: 1080, durationSec: 12, fileSizeBytes: 2_000_000, videoCodec: "h264", audioCodec: "aac" };
  }
  return { kind: "image", width: 1080, height: 1080, durationSec: null, fileSizeBytes: 200_000, videoCodec: null, audioCodec: null };
};

// ─── #1 schema + #2 channel profiles — across formats ────────────────────────

describe("buildDistributionPack — channel profiles wired in (#458 #1 #2)", () => {
  test("short video → per-platform specStatus + exportRequirements + outputFilenames", async () => {
    seedUnit(tmp.dir, "vid", baseManifest("vid", "video", ["clip.mp4", "cover.png"]));
    const { pack, specReport } = await buildDistributionPack({ projectId: PROJECT, slug: "vid", draftFn, probe: okProbe });
    expect(() => DistributionPackSchema.parse(pack)).not.toThrow();
    expect(Object.keys(pack.platforms).sort()).toEqual(["reels", "shorts", "tiktok"]);
    // Every section carries the additive #1 fields. The video platforms post the
    // VIDEO only — the still cover is a thumbnail, not an upload, so it is not in
    // outputFilenames and does not fail the video spec.
    for (const p of ["tiktok", "reels", "shorts"] as const) {
      const s = pack.platforms[p]!;
      expect(s.specStatus).toBe("pass");
      expect(s.outputFilenames).toEqual(["clip.mp4"]);
      expect((s.exportRequirements ?? []).join(" ")).toContain("9:16");
    }
    expect(specReport.applicable).toBe(true);
    expect(specReport.verdict).toBe("pass");
  });

  test("image pack → reels + meta + app-store sections all carry a spec status", async () => {
    seedUnit(tmp.dir, "img", baseManifest("img", "image", ["a.png", "b.png"]));
    const { pack } = await buildDistributionPack({ projectId: PROJECT, slug: "img", draftFn, probe: okProbe });
    expect(Object.keys(pack.platforms).sort()).toEqual(["app-store", "meta", "reels"]);
    // app-store profile wants 1290x2796 portrait → our 1080x1080 fails its aspect.
    expect(pack.platforms["app-store"]!.specStatus).toBe("fail");
    expect((pack.platforms["app-store"]!.specNotes ?? []).join(" ")).toMatch(/aspect|resolution/i);
    // meta (1:1 allowed) passes on a 1080x1080 still.
    expect(pack.platforms.meta!.specStatus).toBe("pass");
  });

  test("carousel → tiktok + reels only; stills are not video-spec'd (na)", async () => {
    seedUnit(tmp.dir, "car", baseManifest("car", "carousel", ["01.png", "02.png", "03.png"]));
    const { pack } = await buildDistributionPack({ projectId: PROJECT, slug: "car", draftFn, probe: okProbe });
    expect(Object.keys(pack.platforms).sort()).toEqual(["reels", "tiktok"]);
    // tiktok/reels are VIDEO profiles; a carousel posts stills, so there is no
    // video upload to spec-check → na (the copy still ships).
    expect(pack.platforms.reels!.specStatus).toBe("na");
    expect(pack.platforms.tiktok!.caption).toBeTruthy();
  });

  test("Meta ad pack (fb-creative) → meta only, profile key mapped to meta-ad", async () => {
    seedUnit(tmp.dir, "fb", baseManifest("fb", "fb-creative", ["ad-01.png"]));
    const { pack, specReport } = await buildDistributionPack({ projectId: PROJECT, slug: "fb", draftFn, probe: okProbe });
    expect(Object.keys(pack.platforms)).toEqual(["meta"]);
    expect(profileKeyFor("meta")).toBe("meta-ad");
    expect(pack.platforms.meta!.specStatus).toBe("pass");
    expect(pack.platforms.meta!.primaryText).toBeTruthy();
    expect(specReport.platforms).toContain("meta-ad");
  });

  test("a wrong-aspect video → specStatus fail + concrete notes", async () => {
    seedUnit(tmp.dir, "wrong", baseManifest("wrong", "video", ["clip.mp4"]));
    const { pack } = await buildDistributionPack({ projectId: PROJECT, slug: "wrong", draftFn, probe: badAspectProbe });
    expect(pack.platforms.tiktok!.specStatus).toBe("fail");
    expect((pack.platforms.tiktok!.specNotes ?? []).join(" ")).toContain("9:16");
  });
});

// ─── #5 readiness gate ────────────────────────────────────────────────────────

describe("buildDistributionPack — readiness gate (#458 #5)", () => {
  test("an un-evaluated project is NOT shippable; the verdict + reason are surfaced", async () => {
    seedUnit(tmp.dir, "raw", baseManifest("raw", "video", ["clip.mp4"]));
    const { pack } = await buildDistributionPack({ projectId: PROJECT, slug: "raw", draftFn, probe: okProbe });
    expect(pack.shippable).toBe(false);
    expect(pack.readiness).not.toBeNull();
    expect(pack.readiness!.verdict).not.toBe("ship");
    expect(pack.readiness!.bypassed).toBe(false);
    expect(pack.readiness!.reason.length).toBeGreaterThan(0);
  });

  test("--bypass-readiness marks it shippable + records the reason", async () => {
    seedUnit(tmp.dir, "ship", baseManifest("ship", "video", ["clip.mp4"]));
    const { pack } = await buildDistributionPack({
      projectId: PROJECT,
      slug: "ship",
      draftFn,
      probe: okProbe,
      bypassReadiness: "client signed off manually",
    });
    expect(pack.shippable).toBe(true);
    expect(pack.readiness!.bypassed).toBe(true);
    expect(pack.readiness!.bypassReason).toBe("client signed off manually");
  });
});
