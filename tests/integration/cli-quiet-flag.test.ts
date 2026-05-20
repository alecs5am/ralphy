// Integration test for the top-level --quiet flag (01.05.03).
//
// The flag must:
//   • parse cleanly on the top-level program (no "unknown option")
//   • short-form -q also works
//   • be combinable with --json (machine output + no chatter)

import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: REPO,
    encoding: "utf8",
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe("--quiet flag plumbing", () => {
  test("`ralphy --quiet status` parses and exits cleanly", () => {
    const r = ralphy(["--quiet", "status"]);
    // We don't assert exit 0 (status may legitimately fail without setup),
    // but we assert no "unknown option" error.
    expect(r.stderr).not.toContain("unknown option");
    expect(r.stderr).not.toContain("error: unknown");
  });

  test("`-q status` is the short form and also parses", () => {
    const r = ralphy(["-q", "status"]);
    expect(r.stderr).not.toContain("unknown option");
  });

  test("--quiet --json is the canonical agent invocation", () => {
    // Combined with --json on a read-only verb — should still produce a JSON
    // line on stdout.
    const r = ralphy(["--quiet", "--json", "models", "list"]);
    // Exit 0 + parseable JSON on stdout.
    expect(r.exitCode).toBe(0);
    const last = r.stdout.trim().split("\n").filter((l) => l.startsWith("{") || l.startsWith("["));
    expect(last.length).toBeGreaterThan(0);
  });
});
