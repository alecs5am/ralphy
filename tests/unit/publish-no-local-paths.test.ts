// publish-entity.ts — SECURITY guard: no absolute local filesystem path may leak
// into a published entity (#056 leak root-cause).
//
// The fixed bug: publishing leaked absolute local paths
// (`/Users/<user>/.../workspace/projects/...`) into the published library via
// blueprint `assets[].path` / `composition.file` (no Storage upload) and via
// publishBlock writing raw local `refs`. These expose the maintainer's filesystem
// and never resolve for other users.
//
// This test spawns the script the way it is actually invoked (from `landing/`)
// in DRY-RUN with NO --push and NO Bunny creds, against fixtures whose path-like
// fields carry an absolute `/Users/.../workspace/projects/...` path. It locks:
//   1. Blueprint, no storageUrl  -> the planned published object carries NO
//      absolute-path / `workspace/projects` substring; the value is reduced to a
//      basename.
//   2. Block refs, no storageUrl -> same: no local path reaches the library.json
//      value.
//   3. Positive case: an absolute path WITH a storageUrl publishes the storageUrl
//      (or a curated relative form), never the local path.
//
// English-only-on-disk discipline: every fixture slug / filename / prompt is
// plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const LANDING = path.join(REPO, "landing");
const LIBRARY_JSON = path.join(LANDING, "lib", "library-v2", "library.json");

// An absolute local path that mimics the leaked shape: an absolute /Users path
// AND a workspace/projects segment. Either alone must be refused.
const LEAKY_ABS =
  "/Users/maintainer/github/ugc-cli/workspace/projects/test-leak-001/assets/images/char-guide.png";

let tmpDir: string;

/**
 * Extract the `library.json value: <json>` line of the dry-run plan — the EXACT
 * compact-JSON object that WOULD be written to library.json. The sanitizer
 * guarantee is about that PUBLISHED value, NOT the operator-facing diagnostics
 * (the WARN that echoes the offending path so the maintainer can locate it, and
 * the "[missing local!]" upload-source lines that legitimately name the local
 * file an upload would read FROM).
 */
function libraryValue(stdout: string): string {
  const marker = "library.json value: ";
  const start = stdout.indexOf(marker);
  if (start < 0) return "";
  const after = stdout.slice(start + marker.length);
  const nl = after.indexOf("\n");
  return nl < 0 ? after : after.slice(0, nl);
}

/** Run publish-entity.ts from landing/, scrubbing every Supabase/Bunny secret so
 *  a stray --push could not touch anything remote. Optionally inject a fake
 *  BUNNY_CDN_BASE so publicUrlFor() returns a CDN URL (positive case). */
function run(
  args: string[],
  extraEnv: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of Object.keys(env)) {
    if (
      k.startsWith("SUPABASE_") ||
      k.startsWith("NEXT_PUBLIC_SUPABASE_") ||
      k.startsWith("BUNNY_")
    ) {
      delete env[k];
    }
  }
  Object.assign(env, extraEnv);
  const r = spawnSync("bun", ["run", "scripts/publish-entity.ts", ...args], {
    cwd: LANDING,
    encoding: "utf8",
    env: env as NodeJS.ProcessEnv,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-no-local-paths-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/** Write a blueprint fixture dir whose asset.path + composition.file are the
 *  leaky absolute path (no local payload files exist -> no upload possible). */
function writeLeakyBlueprint(unitId: string): string {
  const blueprintDir = path.join(tmpDir, "units", "leak", "blueprint");
  fs.mkdirSync(blueprintDir, { recursive: true });
  const blueprint = {
    unitId,
    schemaVersion: 1,
    scenario: { scenes: [{ id: "scene-01", label: "Foggy hub", vo: "Pick your guide." }] },
    prompts: [{ stage: "image", slot: "char-guide", text: "PS1 fog-horror guide." }],
    // composition.file is the leaky absolute path, and the file does NOT exist
    // under the blueprint dir (so there is no uploadable plan / storageUrl).
    composition: { file: LEAKY_ABS, timing: { A: [0, 3.9], SEG: [3.9, 2.0] } },
    // asset.path is the leaky absolute path with NO storageUrl.
    assets: [{ slot: "char-guide", path: LEAKY_ABS, kind: "character" }],
    modelStack: [{ stage: "image", model: "openai/gpt-5.4-image-2", costUsd: 0.2 }],
    recipes: [],
    costRollupUsd: 0.2,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(blueprintDir, "blueprint.json"),
    JSON.stringify(blueprint, null, 2) + "\n",
  );
  return blueprintDir;
}

describe("publish-entity SECURITY: no local filesystem path leaks (#056)", () => {
  test("blueprint with leaky asset.path / composition.file (no storageUrl): no abs path in plan, reduced to basename, library.json untouched", () => {
    const before = fs.readFileSync(LIBRARY_JSON, "utf8");
    const dir = writeLeakyBlueprint("test-leak-blueprint");

    const r = run(["--blueprint", dir]);
    // Exit 0 proves the backstop assertion PASSED — i.e. the serialized published
    // Blueprint (built via buildPublished, asserted before the dry-run print)
    // carried no local path. A surviving leak would have thrown -> exit 1.
    expect(r.exitCode).toBe(0);

    const combined = `${r.stdout}\n${r.stderr}`;
    // The sanitizer LOUD-warns and reduces both asset.path and composition.file
    // to the basename. The WARN intentionally echoes the offending path so the
    // maintainer can locate it — that echo is the ONLY place /Users/ may appear,
    // and only on stderr (never in a published value).
    expect(combined.toLowerCase()).toContain("sanitized local path");
    expect(combined).toContain('-> "char-guide.png"');

    // Nothing written.
    expect(fs.readFileSync(LIBRARY_JSON, "utf8")).toBe(before);
    expect(r.stdout).toContain("nothing uploaded, library.json untouched");
  });

  test("block refs with a leaky local path (no storageUrl): refs reduced to basename, no abs path, library.json untouched", () => {
    const before = fs.readFileSync(LIBRARY_JSON, "utf8");
    const block = {
      kind: "asset",
      id: "test-leak-block",
      name: "Leaky asset block",
      blurb: "A block whose ref is an absolute local path.",
      refs: [LEAKY_ABS],
    };
    const blockFile = path.join(tmpDir, "block.json");
    fs.writeFileSync(blockFile, JSON.stringify(block));

    const r = run(["--block-file", blockFile]);
    // Exit 0 proves the backstop passed (the published Block value was asserted
    // clean before the dry-run print).
    expect(r.exitCode).toBe(0);

    // The library.json value (the EXACT object that would be written) must carry
    // the sanitized refs — basename only, NO absolute path, NO workspace/projects.
    const value = libraryValue(r.stdout);
    expect(value).toContain('"refs":["char-guide.png"]');
    expect(value).not.toContain("/Users/");
    expect(value).not.toContain("workspace/projects");
    // And the sanitizer announced the rewrite.
    expect(`${r.stdout}\n${r.stderr}`.toLowerCase()).toContain("sanitized local path");

    expect(fs.readFileSync(LIBRARY_JSON, "utf8")).toBe(before);
  });

  test("positive: an absolute asset.path WITH a resolvable storageUrl publishes the storageUrl form, not the local path", () => {
    // Provide a fake CDN base so publicUrlFor() resolves. Also drop the
    // referenced payload file under the blueprint dir so the upload is planned
    // (exists + not oversize) -> a storageUrl is derivable for it.
    const unitId = "test-leak-storage";
    const blueprintDir = path.join(tmpDir, "units", "leak", "blueprint");
    fs.mkdirSync(path.join(blueprintDir, "assets"), { recursive: true });
    // The asset path is blueprint-relative here (the #076 capture convention),
    // and the file exists -> uploadable -> a storageUrl is derivable.
    fs.writeFileSync(path.join(blueprintDir, "assets", "char-guide.png"), "bytes");
    fs.writeFileSync(path.join(blueprintDir, "index.html"), "<div id=\"root\"></div>\n");

    const blueprint = {
      unitId,
      schemaVersion: 1,
      scenario: { scenes: [{ id: "scene-01", label: "Hub" }] },
      prompts: [{ stage: "image", slot: "char-guide", text: "PS1 fog-horror guide." }],
      composition: { file: "index.html", timing: { A: [0], SEG: [3.9] } },
      assets: [{ slot: "char-guide", path: "assets/char-guide.png", kind: "character" }],
      modelStack: [{ stage: "image", model: "openai/gpt-5.4-image-2", costUsd: 0.2 }],
      recipes: [],
      costRollupUsd: 0.2,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(blueprintDir, "blueprint.json"),
      JSON.stringify(blueprint, null, 2) + "\n",
    );

    const r = run(["--blueprint", blueprintDir], {
      BUNNY_CDN_BASE: "https://ralphy.b-cdn.net",
    });
    expect(r.exitCode).toBe(0);

    // The Storage object key for the asset is named (it would upload + carry a
    // storageUrl on --push). The asset.path stays the relative `assets/...` form,
    // so the sanitizer never fires (no WARN) — the published value is already safe.
    expect(r.stdout).toContain(`blueprints/${unitId}/assets/char-guide.png`);
    // No sanitize-WARN here: nothing was a local path to begin with.
    expect(`${r.stdout}\n${r.stderr}`.toLowerCase()).not.toContain("sanitized local path");
    // The library.json edit-plan line names the unit, not a local path.
    expect(r.stdout).toContain(`blueprints[unitId=${unitId}]`);
  });

  test("positive: a block ref that is an ABSOLUTE local path WITH a resolvable storageUrl publishes the storageUrl, not the local path", () => {
    // The ref is an absolute local path; with BUNNY_CDN_BASE set,
    // publicUrlFor() resolves to a CDN public URL. The sanitizer must prefer
    // that URL over the basename — and the absolute path must never reach the
    // published library value.
    const id = "test-leak-block-storage";
    const block = {
      kind: "asset",
      id,
      name: "Leaky-but-uploadable asset block",
      blurb: "Ref is absolute-local but a storageUrl resolves.",
      refs: [LEAKY_ABS],
    };
    const blockFile = path.join(tmpDir, "block.json");
    fs.writeFileSync(blockFile, JSON.stringify(block));

    const r = run(["--block-file", blockFile], {
      BUNNY_CDN_BASE: "https://ralphy.b-cdn.net",
    });
    expect(r.exitCode).toBe(0);

    const value = libraryValue(r.stdout);
    // The published ref is the CDN public URL, NOT the local path.
    expect(value).toContain(
      `https://ralphy.b-cdn.net/blocks/asset/${id}/char-guide.png`,
    );
    expect(value).not.toContain("/Users/");
    expect(value).not.toContain("workspace/projects");
  });
});
