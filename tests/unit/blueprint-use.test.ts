// `ralphy blueprint use` smoke + invariant tests (#079).
//
// Exercises the OFFLINE scaffold path: `blueprint use <unit-id> --project <id>`
// resolves a PUBLISHED Blueprint from the committed mirror
// (landing/lib/library-v2/published.ts), then lays down a ready-to-run project.
//
// Offline-without-network strategy: the loader resolves the mirror relative to
// root() (== the --cwd we pass). So each test writes a FIXTURE published.ts
// inside the temp root's landing/lib/library-v2/ dir. The fixture blueprint uses
// NO storageUrl on its asset (→ recorded for manual fetch, no download) and an
// INLINE composition (→ index.html written from memory, no download). Nothing
// hits the network, and the REAL repo published.ts is never touched.
//
// English-only-on-disk discipline: every fixture slug / filename / prompt /
// scenario line is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const UNIT_ID = "fog-horror-repro";

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

/** Write a fixture committed-mirror published.ts into the temp root. */
function writeFixtureMirror(blueprints: unknown[]): void {
  const dir = path.join(tmpRoot, "landing", "lib", "library-v2");
  fs.mkdirSync(dir, { recursive: true });
  // A self-contained mirror: declares + exports PUBLISHED_BLUEPRINTS. We avoid
  // importing ./types so the fixture needs no sibling files (Bun runs the TS).
  fs.writeFileSync(
    path.join(dir, "published.ts"),
    `export const PUBLISHED_BLUEPRINTS = ${JSON.stringify(blueprints, null, 2)};\n`,
  );
}

function fixtureBlueprint(): Record<string, unknown> {
  return {
    unitId: UNIT_ID,
    schemaVersion: 1,
    scenario: {
      scenes: [
        { id: "scene-01", label: "Foggy hub", durationSec: 4, vo: "Pick your guide." },
      ],
      storyboardMd: "# Storyboard\n\nFoggy hub, pick a guide, survive the forks.\n",
    },
    prompts: [
      {
        stage: "image",
        slot: "char-guide",
        text: "PS1 fog-horror guide reference, low-poly, dithered textures.",
        slots: ["guide_name"],
      },
      {
        stage: "vo",
        slot: "scene-01-vo",
        text: "Pick your guide.",
      },
    ],
    // Inline composition (no storageUrl) → index.html written from memory.
    composition: {
      file: "index.html",
      html: "<!doctype html><html><body><div id=\"root\"></div></body></html>",
      timing: { A: [0, 3.9], SEG: [3.9, 2.0] },
      components: ["tint", "grain"],
    },
    // No storageUrl → recorded for manual fetch, NO download attempted.
    assets: [
      { slot: "char-guide", path: "assets/images/char-guide.png", kind: "character" },
    ],
    modelStack: [
      { stage: "image", model: "openai/gpt-5.4-image-2", costUsd: 0.2, params: { size: "1024x1024" } },
    ],
    recipes: [{ name: "ffmpeg-xfade-master", kind: "bake" }],
    costRollupUsd: 0.2,
    createdAt: new Date().toISOString(),
  };
}

function projDir(projectId: string): string {
  return path.join(tmpRoot, "workspace", "projects", projectId);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-blueprint-use-079-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("ralphy blueprint use (#079)", () => {
  test("scaffolds the project tree, prompts, scenario, and origin doc offline", () => {
    writeFixtureMirror([fixtureBlueprint()]);
    const projectId = "fog-horror-repro-001";
    const r = ralphy(["blueprint", "use", UNIT_ID, "--project", projectId]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.unitId).toBe(UNIT_ID);
    expect(r.json?.project).toBe(projectId);

    const d = projDir(projectId);
    // Standard tree.
    expect(fs.existsSync(path.join(d, "assets", "images"))).toBe(true);
    expect(fs.existsSync(path.join(d, "assets", "music"))).toBe(true);
    expect(fs.existsSync(path.join(d, "render"))).toBe(true);
    expect(fs.existsSync(path.join(d, "logs"))).toBe(true);
    expect(fs.existsSync(path.join(d, "scripts"))).toBe(true);

    // Prompts written verbatim, one file per prompt.
    const guidePrompt = path.join(d, "prompts", "char-guide.txt");
    expect(fs.existsSync(guidePrompt)).toBe(true);
    expect(fs.readFileSync(guidePrompt, "utf8")).toContain("PS1 fog-horror guide reference");
    expect(fs.existsSync(path.join(d, "prompts", "scene-01-vo.txt"))).toBe(true);

    // Scenario.
    expect(fs.existsSync(path.join(d, "STORYBOARD.md"))).toBe(true);
    expect(fs.existsSync(path.join(d, "scenario.json"))).toBe(true);
    const scenario = JSON.parse(fs.readFileSync(path.join(d, "scenario.json"), "utf8"));
    expect(scenario.scenes[0].id).toBe("scene-01");

    // Inline composition → real index.html (not a placeholder).
    expect(fs.existsSync(path.join(d, "index.html"))).toBe(true);
    expect(fs.readFileSync(path.join(d, "index.html"), "utf8")).toContain('id="root"');
    expect(r.json?.composition).toBe("inline");

    // Origin doc with model stack + recipes + next steps.
    const originPath = path.join(d, "BLUEPRINT_ORIGIN.md");
    expect(fs.existsSync(originPath)).toBe(true);
    const origin = fs.readFileSync(originPath, "utf8");
    expect(origin).toContain("openai/gpt-5.4-image-2");
    expect(origin).toContain("ffmpeg-xfade-master");
    expect(origin).toContain("Next steps");
    expect(origin).toContain(`ralphy render ${projectId}`);
  });

  test("records assets-needing-manual-fetch when there is no storageUrl", () => {
    writeFixtureMirror([fixtureBlueprint()]);
    const projectId = "fog-horror-repro-002";
    const r = ralphy(["blueprint", "use", UNIT_ID, "--project", projectId]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.assetsDownloaded).toBe(0);
    expect(r.json?.assetsNeedingManualFetch).toBe(1);

    const origin = fs.readFileSync(path.join(projDir(projectId), "BLUEPRINT_ORIGIN.md"), "utf8");
    expect(origin).toContain("fetch manually");
    expect(origin).toContain("char-guide");
    // The asset must NOT have been downloaded (no network).
    expect(fs.existsSync(path.join(projDir(projectId), "assets", "images", "char-guide.png"))).toBe(false);
  });

  test("refuses (no clobber) when the project dir already exists and is non-empty", () => {
    writeFixtureMirror([fixtureBlueprint()]);
    const projectId = "fog-horror-repro-003";
    // Pre-create a non-empty project dir.
    fs.mkdirSync(projDir(projectId), { recursive: true });
    fs.writeFileSync(path.join(projDir(projectId), "keep.txt"), "do not clobber me");

    const r = ralphy(["blueprint", "use", UNIT_ID, "--project", projectId]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("already exists");
    // The pre-existing file is untouched.
    expect(fs.readFileSync(path.join(projDir(projectId), "keep.txt"), "utf8")).toBe("do not clobber me");
  });

  test("graceful error when the unitId is not in the mirror", () => {
    writeFixtureMirror([fixtureBlueprint()]);
    const r = ralphy(["blueprint", "use", "no-such-unit", "--project", "x-001"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("not found");
    expect(r.stderr.toLowerCase()).toContain("no published blueprint");
  });

  test("graceful error when the committed mirror is absent (global binary)", () => {
    // No writeFixtureMirror() call → no landing/lib/library-v2/published.ts.
    const r = ralphy(["blueprint", "use", UNIT_ID, "--project", "x-001"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("not found");
    expect(r.stderr).toContain("committed mirror");
  });
});
