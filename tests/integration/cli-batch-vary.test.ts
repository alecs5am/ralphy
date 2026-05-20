// Integration: `ralphy batch vary` end-to-end (02.08.02).
//
// Creates a base project with a scenario.json, then runs `batch vary` in
// both dry-run and write modes and asserts the variant projects are created
// with the expected scenario contents.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
  let json: any = null;
  try { json = JSON.parse(r.stdout); } catch {}
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function makeBaseProject(): void {
  const projDir = path.join(tmpRoot, "workspace", "projects", "demo-001");
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(
    path.join(projDir, "scenario.json"),
    JSON.stringify({
      project_id: "demo-001",
      target_duration_s: 15,
      hook: { scene_id: "scene-01", vo: "watch this", duration_s: 3 },
      body: [{ scene_id: "scene-02", vo: "the proof", duration_s: 9 }],
      cta: { scene_id: "scene-03", vo: "tap link", duration_s: 3 },
      scenes: {},
    }) + "\n",
  );
  // Register the project so registry-aware tooling doesn't trip.
  fs.mkdirSync(path.join(tmpRoot, "workspace"), { recursive: true });
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-batch-vary-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("batch vary (02.08.02)", () => {
  test("--dry-run previews variants without writing", () => {
    makeBaseProject();
    const r = ralphy(["batch", "vary", "--base", "demo-001", "--axis", "hook", "--variants", "3", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.dryRun).toBe(true);
    expect(r.json?.axis).toBe("hook");
    expect(r.json?.would_create).toHaveLength(3);
    expect(r.json?.would_create?.[0]?.id).toBe("demo-001-h1");
    // No project dirs should be created.
    expect(fs.existsSync(path.join(tmpRoot, "workspace", "projects", "demo-001-h1"))).toBe(false);
  });

  test("unknown axis errors with E_FLAG_UNKNOWN", () => {
    makeBaseProject();
    const r = ralphy(["batch", "vary", "--base", "demo-001", "--axis", "bogus", "--variants", "2"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/E_FLAG_UNKNOWN/u);
  });

  test("missing base scenario.json errors with E_FILE_UNREADABLE", () => {
    const r = ralphy(["batch", "vary", "--base", "missing", "--axis", "hook", "--variants", "2"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/E_FILE_UNREADABLE/u);
  });

  test("writes N variant scenarios with axis suffix", () => {
    makeBaseProject();
    const swapFile = path.join(tmpRoot, "swaps.json");
    fs.writeFileSync(
      swapFile,
      JSON.stringify([
        { hook: { scene_id: "scene-01", vo: "variant 1 hook", duration_s: 3 } },
        { hook: { scene_id: "scene-01", vo: "variant 2 hook", duration_s: 3 } },
      ]),
    );
    const r = ralphy([
      "batch", "vary",
      "--base", "demo-001",
      "--axis", "hook",
      "--variants", "2",
      "--variants-file", swapFile,
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.created).toEqual(["demo-001-h1", "demo-001-h2"]);
    const variantScenario = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, "workspace", "projects", "demo-001-h1", "scenario.json"), "utf-8"),
    );
    expect(variantScenario.variant_of).toBe("demo-001");
    expect(variantScenario.variant_axis).toBe("hook");
    expect(variantScenario.hook.vo).toBe("variant 1 hook");
    expect(variantScenario.body).toHaveLength(1);
  });
});
