// `ralphy library` registration smoke test.
//
// Asserts the new verb is registered and its --help lists the entity
// subcommands. Runs `--help` only — NO network is hit (Commander prints help
// and exits before any action / fetch runs).

import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

function run(args: string[]): { code: number; out: string } {
  const r = spawnSync("bun", ["run", CLI, ...args], { cwd: REPO, encoding: "utf8" });
  return { code: r.status ?? -1, out: `${r.stdout}\n${r.stderr}` };
}

describe("ralphy library --help", () => {
  test("exits 0 and lists the entity subcommands", () => {
    const { code, out } = run(["library", "--help"]);
    expect(code).toBe(0);
    for (const sub of ["units", "templates", "recipes", "assets", "blueprints", "formats"]) {
      expect(out).toContain(sub);
    }
  });

  test("library units --help exits 0 and shows list + show", () => {
    const { code, out } = run(["library", "units", "--help"]);
    expect(code).toBe(0);
    expect(out).toContain("list");
    expect(out).toContain("show");
  });
});
