// `ralphy unit` smoke + invariant tests (#069).
//
// Exercises the project-local `units/` layer via the live CLI (spawn `bun run
// cli/index.ts unit ...`) against a throwaway workspace. Locks the three
// load-bearing behaviors from issue #069:
//   1. COPY, never move — the source `assets/` file survives the create.
//   2. Append-only — a re-`create` on an existing slug lands in `<slug>.v2/`,
//      never overwriting the first unit. `add` appends to `media`.
//   3. The `unit.json` manifest round-trips through list/show.
//
// English-only-on-disk discipline: all fixture slugs/filenames are plain
// English kebab strings — no Cyrillic, no real-creator tokens.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROJECT = "unit-fixture-069";

let tmpRoot: string;

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, "--json", ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function projDir(): string {
  return path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", PROJECT);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-unit-069-"));
  const imagesDir = path.join(projDir(), "assets", "images");
  fs.mkdirSync(imagesDir, { recursive: true });
  // Three fixture media files with distinct content so we can prove copy-not-move.
  fs.writeFileSync(path.join(imagesDir, "outline-01.png"), "alpha-bytes");
  fs.writeFileSync(path.join(imagesDir, "outline-02.png"), "beta-bytes");
  fs.writeFileSync(path.join(imagesDir, "filled-01.png"), "gamma-bytes");
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("ralphy unit (#069)", () => {
  test("create copies matched assets into units/<slug>/ + writes a valid unit.json", () => {
    const r = ralphy([
      "unit",
      "create",
      PROJECT,
      "--slug",
      "stickers-outline",
      "--format",
      "sticker-pack",
      "--from",
      "assets/images/outline-*.png",
      "--template",
      "sticker-set",
      "--style",
      "risograph",
      "--recipe",
      "bloom",
      "--asset",
      "vpn-mascot",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.slug).toBe("stickers-outline");
    expect(r.json?.dir).toBe("stickers-outline");
    expect(r.json?.media_count).toBe(2);
    expect(r.json?.versioned).toBe(false);

    // Manifest shape mirrors library-v2.
    const m = r.json.manifest;
    expect(m.format).toBe("sticker-pack");
    expect(m.media).toEqual(["outline-01.png", "outline-02.png"]);
    expect(m.source_assets).toEqual([
      "assets/images/outline-01.png",
      "assets/images/outline-02.png",
    ]);
    expect(m.provenance).toEqual({
      template: "sticker-set",
      style: "risograph",
      recipes: ["bloom"],
      assets: ["vpn-mascot"],
    });
    expect(typeof m.created).toBe("string");

    // unit.json is on disk and the copied media are present.
    const unitDir = path.join(projDir(), "units", "stickers-outline");
    expect(fs.existsSync(path.join(unitDir, "unit.json"))).toBe(true);
    expect(fs.readFileSync(path.join(unitDir, "outline-01.png"), "utf8")).toBe("alpha-bytes");
  });

  test("COPY not move — source assets survive untouched", () => {
    ralphy([
      "unit",
      "create",
      PROJECT,
      "--slug",
      "stickers-outline",
      "--format",
      "sticker-pack",
      "--from",
      "assets/images/outline-01.png",
    ]);
    const src = path.join(projDir(), "assets", "images", "outline-01.png");
    expect(fs.existsSync(src)).toBe(true);
    expect(fs.readFileSync(src, "utf8")).toBe("alpha-bytes");
  });

  test("append-only — re-create on an existing slug lands in <slug>.v2/, never overwrites v1", () => {
    const first = ralphy([
      "unit", "create", PROJECT,
      "--slug", "pack", "--format", "sticker-pack",
      "--from", "assets/images/outline-01.png",
    ]);
    expect(first.json?.dir).toBe("pack");

    const second = ralphy([
      "unit", "create", PROJECT,
      "--slug", "pack", "--format", "sticker-pack",
      "--from", "assets/images/filled-01.png",
    ]);
    expect(second.exitCode).toBe(0);
    expect(second.json?.dir).toBe("pack.v2");
    expect(second.json?.versioned).toBe(true);

    // v1 untouched; v2 holds the new pick.
    const v1Media = path.join(projDir(), "units", "pack", "outline-01.png");
    const v2Media = path.join(projDir(), "units", "pack.v2", "filled-01.png");
    expect(fs.readFileSync(v1Media, "utf8")).toBe("alpha-bytes");
    expect(fs.readFileSync(v2Media, "utf8")).toBe("gamma-bytes");
  });

  test("add appends to media without dropping existing entries", () => {
    ralphy([
      "unit", "create", PROJECT,
      "--slug", "pack", "--format", "sticker-pack",
      "--from", "assets/images/outline-01.png",
    ]);
    const r = ralphy([
      "unit", "add", PROJECT, "pack",
      "--from", "assets/images/filled-01.png",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.added).toEqual(["filled-01.png"]);
    expect(r.json?.media_count).toBe(2);
    expect(r.json?.manifest.media).toEqual(["outline-01.png", "filled-01.png"]);
  });

  test("list + show round-trip the manifest", () => {
    ralphy([
      "unit", "create", PROJECT,
      "--slug", "stickers-outline", "--format", "sticker-pack",
      "--from", "assets/images/outline-*.png",
    ]);
    const list = ralphy(["unit", "list", PROJECT]);
    expect(list.exitCode).toBe(0);
    expect(Array.isArray(list.json)).toBe(true);
    expect(list.json[0].slug).toBe("stickers-outline");
    expect(list.json[0].media_count).toBe(2);

    const show = ralphy(["unit", "show", PROJECT, "stickers-outline"]);
    expect(show.exitCode).toBe(0);
    expect(show.json.media).toEqual(["outline-01.png", "outline-02.png"]);
    expect(show.json.resolved_media).toEqual([
      "units/stickers-outline/outline-01.png",
      "units/stickers-outline/outline-02.png",
    ]);
  });

  test("create refuses an empty glob match", () => {
    const r = ralphy([
      "unit", "create", PROJECT,
      "--slug", "empty", "--format", "sticker-pack",
      "--from", "assets/images/no-such-*.png",
    ]);
    expect(r.exitCode).not.toBe(0);
  });

  test("create refuses an unknown format", () => {
    const r = ralphy([
      "unit", "create", PROJECT,
      "--slug", "bad-fmt", "--format", "hologram",
      "--from", "assets/images/outline-01.png",
    ]);
    expect(r.exitCode).not.toBe(0);
  });

  test("media_meta records detected aspect + kind for a created unit", () => {
    // Use a real repo image fixture with known intrinsic dimensions (3840x1200).
    // Copied into the throwaway project's assets so
    // the unit-create header-read has a genuine file to probe.
    const REAL_IMG = path.join(
      REPO,
      "docs",
      "branding",
      "banner.png",
    );
    expect(fs.existsSync(REAL_IMG)).toBe(true);
    const destDir = path.join(projDir(), "assets", "images");
    fs.copyFileSync(REAL_IMG, path.join(destDir, "banner.png"));

    const r = ralphy([
      "unit", "create", PROJECT,
      "--slug", "portrait-pack", "--format", "image",
      "--from", "assets/images/banner.png",
    ]);
    expect(r.exitCode).toBe(0);

    const m = r.json.manifest;
    expect(m.media).toEqual(["banner.png"]);
    // media_meta is written, keyed by filename, with the detected ratio + kind.
    expect(m.media_meta).toBeDefined();
    expect(m.media_meta["banner.png"]).toEqual({
      aspect: "3840 / 1200",
      kind: "image",
    });

    // Round-trips through `show` (manifest re-parsed from disk).
    const show = ralphy(["unit", "show", PROJECT, "portrait-pack"]);
    expect(show.exitCode).toBe(0);
    expect(show.json.media_meta["banner.png"].aspect).toBe("3840 / 1200");
  });

  test("delete removes the unit dir", () => {
    ralphy([
      "unit", "create", PROJECT,
      "--slug", "pack", "--format", "sticker-pack",
      "--from", "assets/images/outline-01.png",
    ]);
    const r = ralphy(["unit", "delete", PROJECT, "pack"]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.deleted).toBe("pack");
    expect(fs.existsSync(path.join(projDir(), "units", "pack"))).toBe(false);
  });
});
