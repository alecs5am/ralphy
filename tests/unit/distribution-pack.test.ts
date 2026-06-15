// `ralphy unit package` + the distribution-pack lib (#423).
//
// Two layers, mirroring unit-caption.test.ts (#403):
//   1. In-process `buildDistributionPack` with an INJECTED caption draft fn —
//      no live LLM, no paid gen. Asserts per-platform sections match the unit
//      format, the existing caption is REUSED (not re-drafted), the draft
//      fallback fires only when absent, and the thumbnail pick + override work.
//   2. CLI smoke of `ralphy unit package` — proves the deliverables are COPIED
//      (originals survive) and re-package auto-versions (append-only).
//
// English-only-on-disk: every fixture string is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import { buildDistributionPack } from "../../cli/lib/distribution";
import {
  DistributionPackSchema,
  platformsForFormat,
} from "../../cli/lib/schemas/distribution-pack";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
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

// ─── CLI smoke — COPY + append-only ──────────────────────────────────────────

describe("ralphy unit package (CLI smoke)", () => {
  function run(rootDir: string, args: string[]) {
    return spawnSync("bun", ["run", CLI, "--cwd", rootDir, "--json", "unit", "package", ...args], {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...process.env },
    });
  }

  test("COPIES selected media into distribution/ (originals survive) + writes pack + handoff", () => {
    const slug = "ship";
    // Caption pre-set so the CLI smoke needs no LLM / env hook.
    const unitDir = seedUnit(
      tmp.dir,
      slug,
      baseManifest(slug, "video", ["clip.mp4", "cover.png"], { caption: EXISTING_CAPTION }),
    );
    const r = run(tmp.dir, [PROJECT, slug]);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.drafted_caption).toBe(false);
    expect(json.platforms.sort()).toEqual(["reels", "shorts", "tiktok"]);

    // Originals untouched.
    expect(fs.readFileSync(path.join(unitDir, "clip.mp4"), "utf8")).toBe("bytes-of-clip.mp4");
    // Copies present in distribution/.
    const copyDir = path.join(unitDir, "distribution");
    expect(fs.readFileSync(path.join(copyDir, "clip.mp4"), "utf8")).toBe("bytes-of-clip.mp4");
    expect(fs.readFileSync(path.join(copyDir, "cover.png"), "utf8")).toBe("bytes-of-cover.png");
    // Pack JSON + handoff written + schema-valid.
    const pack = JSON.parse(fs.readFileSync(path.join(unitDir, "distribution-pack.json"), "utf8"));
    expect(() => DistributionPackSchema.parse(pack)).not.toThrow();
    expect(fs.existsSync(path.join(unitDir, "DISTRIBUTION.md"))).toBe(true);
  });

  test("re-package without --force is skipped; --force auto-versions the prior", () => {
    const slug = "again";
    const unitDir = seedUnit(
      tmp.dir,
      slug,
      baseManifest(slug, "video", ["clip.mp4"], { caption: EXISTING_CAPTION }),
    );
    expect(run(tmp.dir, [PROJECT, slug]).status).toBe(0);

    // Second run, no --force → skipped, no second pack.
    const r2 = run(tmp.dir, [PROJECT, slug]);
    expect(r2.status).toBe(0);
    expect(JSON.parse(r2.stdout).skipped).toBeTruthy();
    expect(fs.existsSync(path.join(unitDir, "distribution-pack.v2.json"))).toBe(false);

    // Third run with --force → prior auto-versioned, original survives.
    const r3 = run(tmp.dir, [PROJECT, slug, "--force"]);
    expect(r3.status).toBe(0);
    expect(JSON.parse(r3.stdout).versioned).toBe(true);
    expect(fs.existsSync(path.join(unitDir, "distribution-pack.json"))).toBe(true);
    expect(fs.existsSync(path.join(unitDir, "distribution-pack.v2.json"))).toBe(true);
  });
});
