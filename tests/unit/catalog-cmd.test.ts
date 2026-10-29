// #563 — `ralphy catalog list` / `catalog show` through the real CLI entry,
// against a temp root that holds only a copy of the repo `catalog/` tree.
// No data root, no workspace, no renders: the catalog verbs are scope-free.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
let tmpRoot = "";

function run(args: string[], extraEnv: Record<string, string> = {}) {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    encoding: "utf-8",
    env: { ...process.env, ...extraEnv },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-catalog-563-"));
  fs.cpSync(path.join(REPO, "catalog"), path.join(tmpRoot, "catalog"), { recursive: true });
});

afterAll(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("ralphy catalog list (#563)", () => {
  test("--kind transition --mood energetic returns only energetic transitions as JSON", () => {
    const r = run(["--json", "catalog", "list", "--kind", "transition", "--mood", "energetic"]);
    expect(r.status).toBe(0);
    const rows = JSON.parse(r.stdout) as Array<{ id: string; kind: string; moods: string[]; preview: string; sfx: string | null }>;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.kind).toBe("transition");
      expect(row.moods).toContain("energetic");
      expect(row.preview).toBe(`previews/${row.id}.mp4`);
    }
    expect(rows.map((x) => x.id)).toContain("zoom-punch");
  });

  test("no filters lists all 35 checkpoint items", () => {
    const r = run(["--json", "catalog", "list"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).length).toBe(35);
  });

  test("--energy calm --kind element narrows with AND semantics", () => {
    const r = run(["--json", "catalog", "list", "--kind", "element", "--energy", "calm"]);
    expect(r.status).toBe(0);
    const rows = JSON.parse(r.stdout) as Array<{ kind: string; energy: string }>;
    expect(rows.every((x) => x.kind === "element" && x.energy === "calm")).toBe(true);
  });

  test("an unknown --kind fails with E_FLAG_UNKNOWN and lists the allowed values", () => {
    const r = run(["--json", "catalog", "list", "--kind", "bogus"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain("E_FLAG_UNKNOWN");
    expect(r.stderr + r.stdout).toContain("transition");
  });

  test("pretty mode renders a table without [object Object] or literal null", () => {
    const r = run(["--pretty", "catalog", "list", "--kind", "element"], { NO_COLOR: "1" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("lower-third");
    expect(r.stdout).not.toContain("[object Object]");
    expect(r.stdout).not.toMatch(/\bundefined\b/);
  });
});

describe("ralphy catalog show (#563)", () => {
  test("returns params, guidance, fragment path and preview status", () => {
    const r = run(["--json", "catalog", "show", "whip-pan"]);
    expect(r.status).toBe(0);
    const item = JSON.parse(r.stdout);
    expect(item.id).toBe("whip-pan");
    expect(item.fn).toBe("catalog_whip_pan");
    expect(item.params.map((p: { id: string }) => p.id)).toContain("direction");
    expect(item.fragment).toBe(path.join(tmpRoot, "catalog", "items", "transition", "whip-pan.html"));
    expect(item.previewExists).toBe(false);
    expect(item.timing.at).toBe(1.1);
  });

  test("an unknown id fails with E_NOT_FOUND", () => {
    const r = run(["--json", "catalog", "show", "no-such-item"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain("E_NOT_FOUND");
  });
});
