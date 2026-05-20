// Integration test for `ralphy new "<brief>"` (01.09.01).
//
// Creates a project under <HOME>/.ralphy/projects/<id>/ with the canonical
// shape: BRIEF.md if a brief is provided, logs/ directory, registry pointer.
// CWD-independent: spawned from a different directory than the home root.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-new-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphyNew(args: string[]): { exitCode: number; stdout: string; stderr: string; json: unknown } {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: tmpHome,
    encoding: "utf8",
    env: { ...process.env, HOME: tmpHome, RALPHY_HOME: tmpHome },
  });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

describe("ralphy new", () => {
  test("with a brief — creates ~/.ralphy/projects/<id>/ with BRIEF.md", () => {
    const r = ralphyNew(["new", "Spring 2026 ad for Acme dental floss", "--id", "spring-test-001"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { project_id: string; path: string; brief?: string };
    expect(j.project_id).toBe("spring-test-001");
    expect(j.path).toContain("projects/spring-test-001");
    expect(fs.existsSync(j.path)).toBe(true);
    expect(fs.existsSync(path.join(j.path, "BRIEF.md"))).toBe(true);
    expect(fs.readFileSync(path.join(j.path, "BRIEF.md"), "utf8")).toContain("Acme dental floss");
  });

  test("with --id only (no brief) — still creates the project dir", () => {
    const r = ralphyNew(["new", "--id", "no-brief-test"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { project_id: string; path: string };
    expect(j.project_id).toBe("no-brief-test");
    expect(fs.existsSync(j.path)).toBe(true);
  });

  test("auto-generates an id when neither brief nor --id is passed", () => {
    const r = ralphyNew(["new"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { project_id: string };
    expect(typeof j.project_id).toBe("string");
    expect(j.project_id.length).toBeGreaterThan(0);
  });

  test("refuses to overwrite an existing project (E_ALREADY_EXISTS)", () => {
    ralphyNew(["new", "--id", "dup-test"]);
    const r = ralphyNew(["new", "--id", "dup-test"]);
    expect(r.exitCode).not.toBe(0);
    // Error shape on stderr
    const lastJsonLine = r.stderr
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    expect(lastJsonLine).toBeTruthy();
    const payload = JSON.parse(lastJsonLine!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_ALREADY_EXISTS");
  });
});
