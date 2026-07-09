// `ralphy unit create --format article` round-trip (#526).
//
// Locks the article unit format end to end via the live CLI (spawn `bun run
// cli/index.ts unit ...`) against a throwaway workspace:
//   1. `--format article` is accepted (article is in UNIT_FORMATS).
//   2. The markdown body is COPIED into units/<slug>/ (source survives).
//   3. The article frontmatter (title/description/slug/tags/canonicalUrl/hero)
//      lands on unit.json under `article`, with `body` derived from the .md.
//   4. show round-trips the manifest.
//
// tmp-root + env/cwd hygiene per #545: an isolated mkdtemp root, `--cwd` scoping
// the CLI to it, and `env: { ...process.env }` on the spawn so inherited keys
// are not cleared. English-only on disk: all fixture strings are plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROJECT = "article-fixture-526";

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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-unit-article-"));
  const artDir = path.join(projDir(), "artifacts");
  fs.mkdirSync(artDir, { recursive: true });
  fs.writeFileSync(
    path.join(artDir, "draft.md"),
    "# Ralphy is a video studio for AI agents\n\nA long-form article body.\n\n## FAQ\n\n### Q\n\nA.\n",
  );
  fs.writeFileSync(path.join(artDir, "hero.png"), "hero-bytes");
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("ralphy unit create --format article (#526)", () => {
  test("accepts --format article, copies the body, writes article frontmatter", () => {
    const r = ralphy([
      "unit",
      "create",
      PROJECT,
      "--slug",
      "ralphy-intro",
      "--format",
      "article",
      "--from",
      "artifacts/draft.md",
      "--title",
      "Ralphy is a video studio for AI agents",
      "--description",
      "Turn your coding agent into a content farm.",
      "--tags",
      "ralphy, ai agents, content farm",
      "--canonical-url",
      "https://example.com/ralphy-intro",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.format).toBe("article");

    // The source .md survives (COPY, never move).
    expect(fs.existsSync(path.join(projDir(), "artifacts", "draft.md"))).toBe(true);

    // The manifest carries the article frontmatter + derived body.
    const manifest = r.json.manifest;
    expect(manifest.format).toBe("article");
    expect(manifest.media).toContain("draft.md");
    expect(manifest.article).toBeDefined();
    expect(manifest.article.title).toBe("Ralphy is a video studio for AI agents");
    expect(manifest.article.description).toBe("Turn your coding agent into a content farm.");
    expect(manifest.article.slug).toBe("ralphy-intro");
    expect(manifest.article.tags).toEqual(["ralphy", "ai agents", "content farm"]);
    expect(manifest.article.canonicalUrl).toBe("https://example.com/ralphy-intro");
    expect(manifest.article.body).toBe("draft.md");

    // The body was copied into the unit dir.
    const unitDir = path.join(projDir(), "units", "ralphy-intro");
    expect(fs.existsSync(path.join(unitDir, "draft.md"))).toBe(true);
    expect(fs.existsSync(path.join(unitDir, "unit.json"))).toBe(true);
  });

  test("carries an optional hero image + inline body when both are in --from", () => {
    const r = ralphy([
      "unit",
      "create",
      PROJECT,
      "--slug",
      "with-hero",
      "--format",
      "article",
      "--from",
      "artifacts/*",
      "--title",
      "Hero article",
      "--hero",
      "hero.png",
      "--body",
      "draft.md",
    ]);
    expect(r.exitCode).toBe(0);
    const manifest = r.json.manifest;
    expect(manifest.article.body).toBe("draft.md");
    expect(manifest.article.hero).toBe("hero.png");
    expect(manifest.media).toContain("hero.png");
    expect(manifest.media).toContain("draft.md");
  });

  test("show round-trips the article manifest", () => {
    ralphy([
      "unit",
      "create",
      PROJECT,
      "--slug",
      "round-trip",
      "--format",
      "article",
      "--from",
      "artifacts/draft.md",
      "--title",
      "Round trip",
    ]);
    const show = ralphy(["unit", "show", PROJECT, "round-trip"]);
    expect(show.exitCode).toBe(0);
    expect(show.json.format).toBe("article");
    expect(show.json.article.body).toBe("draft.md");
    expect(show.json.article.slug).toBe("round-trip");
  });
});
