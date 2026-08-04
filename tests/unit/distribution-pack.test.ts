// `ralphy unit package` + the distribution-pack lib (#423).
//
// In-process `buildDistributionPack` tests with an INJECTED caption draft fn —
//      no live LLM, no paid gen. Asserts per-platform sections match the unit
//      format, the existing caption is REUSED (not re-drafted), the draft
// fallback fires only when absent, and the thumbnail pick + override work.
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
  platformsForFormat,
} from "../../cli/lib/schemas/distribution-pack";

const PROJECT = "dist-fixture-423";

const CANNED_COPY = {
  tiktok: "POV: the deliverable packs itself for every platform",
  reels:
    "One render, five platforms. The distribution pack shapes the copy + bundles the media. Watch till the end.",
  shorts: "Pack it once, post everywhere",
};

const EXISTING_CAPTION = {
  platform: { tiktok: "EXISTING tiktok hook", reels: "EXISTING reels caption", shorts: "EXISTING title" },
  hashtags: ["#existing", "#fyp"],
  language: "English",
  niche: "demo",
  created: new Date().toISOString(),
};

let tmp: TmpRoot;
beforeEach(() => {
  tmp = makeTmpRoot("ralphy-dist-423");
});
afterEach(() => {
  tmp.cleanup();
});
/** Seed a project registry + a unit dir with the given manifest + media files. */
function seedUnit(rootDir: string, slug: string, manifest: Record<string, unknown>): string {
  const regPath = path.join(rootDir, ".ralphy", "registry.json");
  fs.writeFileSync(
    regPath,
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
  return { slug, format, media, tags: ["demo"], created: new Date().toISOString(), ...over };
}

// ─── buildDistributionPack — injected draft fn, deterministic ────────────────

describe("buildDistributionPack (in-process)", () => {
  const draftFn = async () => CANNED_COPY;

  test("video unit → tiktok/reels/shorts sections, drafted caption", async () => {
    seedUnit(tmp.dir, "vid", baseManifest("vid", "video", ["clip.mp4", "cover.png"]));
    const { pack, draftedCaption } = await buildDistributionPack({
      projectId: PROJECT,
      slug: "vid",
      draftFn,
    });
    expect(() => DistributionPackSchema.parse(pack)).not.toThrow();
    expect(draftedCaption).toBe(true);
    expect(Object.keys(pack.platforms).sort()).toEqual(["reels", "shorts", "tiktok"]);
    expect(pack.platforms.tiktok?.caption).toBe(CANNED_COPY.tiktok);
    expect(pack.platforms.shorts?.title).toBe(CANNED_COPY.shorts);
    // selectedMedia mirrors the unit media, ordered.
    expect(pack.selectedMedia).toEqual(["clip.mp4", "cover.png"]);
  });

  test("carousel unit → tiktok + reels only (no Shorts title)", async () => {
    seedUnit(tmp.dir, "car", baseManifest("car", "carousel", ["01.png", "02.png", "03.png"]));
    const { pack } = await buildDistributionPack({ projectId: PROJECT, slug: "car", draftFn });
    expect(Object.keys(pack.platforms).sort()).toEqual(["reels", "tiktok"]);
    expect(pack.platforms.shorts).toBeUndefined();
    expect(platformsForFormat("carousel")).toEqual(["tiktok", "reels"]);
  });

  test("image-pack unit → reels + meta + app-store; meta carries ad text + CTAs", async () => {
    seedUnit(tmp.dir, "img", baseManifest("img", "image", ["a.png", "b.png"]));
    const { pack } = await buildDistributionPack({ projectId: PROJECT, slug: "img", draftFn });
    expect(Object.keys(pack.platforms).sort()).toEqual(["app-store", "meta", "reels"]);
    expect(pack.platforms.meta?.primaryText).toBe(CANNED_COPY.reels);
    expect(pack.platforms.meta?.ctaVariants?.length).toBeGreaterThan(0);
    expect(pack.platforms["app-store"]?.title).toBe(CANNED_COPY.shorts);
  });

  test("REUSES an existing unit caption (does NOT re-draft)", async () => {
    seedUnit(
      tmp.dir,
      "reuse",
      baseManifest("reuse", "video", ["clip.mp4"], { caption: EXISTING_CAPTION }),
    );
    // A draftFn that throws would surface if it were (wrongly) called.
    const boom = async () => {
      throw new Error("draft fn must NOT be called when a caption exists");
    };
    const { pack, draftedCaption } = await buildDistributionPack({
      projectId: PROJECT,
      slug: "reuse",
      draftFn: boom,
    });
    expect(draftedCaption).toBe(false);
    expect(pack.platforms.tiktok?.caption).toBe(EXISTING_CAPTION.platform.tiktok);
    expect(pack.platforms.shorts?.title).toBe(EXISTING_CAPTION.platform.shorts);
    expect(pack.platforms.tiktok?.hashtags).toEqual(EXISTING_CAPTION.hashtags);
  });

  test("thumbnail defaults to the first image; null when none", async () => {
    seedUnit(tmp.dir, "thumb", baseManifest("thumb", "video", ["clip.mp4", "still.png"]));
    const { pack } = await buildDistributionPack({ projectId: PROJECT, slug: "thumb", draftFn });
    expect(pack.thumbnail).toBe("still.png");

    seedUnit(tmp.dir, "novid", baseManifest("novid", "video", ["clip.mp4"]));
    const { pack: p2 } = await buildDistributionPack({ projectId: PROJECT, slug: "novid", draftFn });
    expect(p2.thumbnail).toBeNull();
    expect(p2.publishNote).toContain("--thumbnail");
  });

  test("--thumbnail override is honored when it resolves", async () => {
    seedUnit(tmp.dir, "ovr", baseManifest("ovr", "video", ["clip.mp4", "a.png", "b.png"]));
    const { pack } = await buildDistributionPack({
      projectId: PROJECT,
      slug: "ovr",
      draftFn,
      thumbnail: "b.png",
    });
    expect(pack.thumbnail).toBe("b.png");
  });

  test("throws on an unknown unit", async () => {
    seedUnit(tmp.dir, "exists", baseManifest("exists", "video", ["clip.mp4"]));
    await expect(
      buildDistributionPack({ projectId: PROJECT, slug: "ghost", draftFn }),
    ).rejects.toThrow();
  });
});
