// publish-entity.ts --blueprint dry-run smoke (#077).
//
// Exercises the third mode of landing/scripts/publish-entity.ts by spawning
// the script the way it is actually invoked (from the `landing/` dir) against a
// throwaway blueprint fixture dir, with NO --push and NO Bunny creds.
//
// Locks the load-bearing dry-run behavior:
//   1. The output names the blueprints/<unitId>/... Storage object keys for the
//      composition file, the prompt file, and the hard-asset file.
//   2. The output describes the library.json blueprints edit plan.
//   3. NOTHING is written: library.json is byte-for-byte unchanged, and no remote
//      call is attempted (no creds set → a --push would have thrown on makeUploader).
//
// English-only-on-disk discipline: every fixture slug / filename / prompt /
// scenario line is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const LANDING = path.join(REPO, "landing");
const SCRIPT = path.join(LANDING, "scripts", "publish-entity.ts");
const LIBRARY_JSON = path.join(LANDING, "lib", "library-v2", "library.json");
const UNIT_ID = "test-fog-blueprint";

let tmpDir: string;
let blueprintDir: string;

function run(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  // Run from the landing/ dir, exactly how the script is invoked. Scrub every
  // Supabase/Bunny secret so a stray --push could not touch anything remote.
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (
      k.startsWith("SUPABASE_") ||
      k.startsWith("NEXT_PUBLIC_SUPABASE_") ||
      k.startsWith("BUNNY_")
    ) {
      delete env[k];
    }
  }
  const r = spawnSync("bun", ["run", "scripts/publish-entity.ts", ...args], {
    cwd: LANDING,
    encoding: "utf8",
    env,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-blueprint-077-"));
  blueprintDir = path.join(tmpDir, "units", "fog", "blueprint");
  fs.mkdirSync(path.join(blueprintDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(blueprintDir, "assets"), { recursive: true });

  // A tiny composition file.
  fs.writeFileSync(
    path.join(blueprintDir, "index.html"),
    "<div id=\"root\" data-duration=\"6.0\"></div>\n",
  );
  // One prompt file.
  fs.writeFileSync(
    path.join(blueprintDir, "prompts", "char-guide.txt"),
    "PS1 fog-horror guide reference, low-poly, dithered textures.\n",
  );
  // One small hard-asset file.
  fs.writeFileSync(
    path.join(blueprintDir, "assets", "char-guide.png"),
    "not-a-real-png-just-bytes",
  );

  // The #074 Blueprint object: unitId + the six axes. assets[].path is
  // blueprint-relative (matches the #076 capture convention).
  const blueprint = {
    unitId: UNIT_ID,
    schemaVersion: 1,
    scenario: {
      scenes: [{ id: "scene-01", label: "Foggy hub", vo: "Pick your guide." }],
    },
    prompts: [
      { stage: "image", slot: "char-guide", text: "PS1 fog-horror guide, {{guide_name}}.", slots: ["guide_name"] },
    ],
    composition: { file: "index.html", timing: { A: [0, 3.9], SEG: [3.9, 2.0] } },
    assets: [{ slot: "char-guide", path: "assets/char-guide.png", kind: "character" }],
    modelStack: [{ stage: "image", model: "openai/gpt-5.4-image-2", costUsd: 0.2 }],
    recipes: [{ name: "film-grain", kind: "encode", command: "ffmpeg -i in -tune grain out" }],
    costRollupUsd: 0.2,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(blueprintDir, "blueprint.json"),
    JSON.stringify(blueprint, null, 2) + "\n",
  );
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("publish-entity --blueprint dry-run (#077)", () => {
  test("names the blueprints/<unitId>/... object keys + the library.json edit plan, writes nothing", () => {
    const before = fs.readFileSync(LIBRARY_JSON, "utf8");

    const r = run(["--blueprint", blueprintDir]);
    expect(r.exitCode).toBe(0);

    const out = r.stdout;
    // Dry-run banner.
    expect(out).toContain("mode=dry-run");
    expect(out).toContain(`DRY-RUN publish-blueprint ${UNIT_ID}`);

    // Storage object keys for every payload file, under blueprints/<unitId>/.
    expect(out).toContain(`blueprints/${UNIT_ID}/index.html`);
    expect(out).toContain(`blueprints/${UNIT_ID}/prompts/char-guide.txt`);
    expect(out).toContain(`blueprints/${UNIT_ID}/assets/char-guide.png`);

    // library.json edit plan.
    expect(out).toContain("blueprints");
    expect(out).toContain(`blueprints[unitId=${UNIT_ID}]`);
    expect(out).toContain("nothing uploaded, library.json untouched");

    // NOTHING written: library.json is byte-for-byte unchanged.
    const after = fs.readFileSync(LIBRARY_JSON, "utf8");
    expect(after).toBe(before);
  });

  test("fails loudly when blueprint.json is missing unitId", () => {
    fs.writeFileSync(
      path.join(blueprintDir, "blueprint.json"),
      JSON.stringify({ schemaVersion: 1, prompts: [], assets: [], modelStack: [], recipes: [], scenario: null, composition: null }) + "\n",
    );
    const r = run(["--blueprint", blueprintDir]);
    expect(r.exitCode).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain("unitId is required");
  });

  test("errors when more than one mode is given", () => {
    const r = run(["--blueprint", blueprintDir, "--unit", tmpDir]);
    expect(r.exitCode).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain("exactly one mode required");
  });
});
