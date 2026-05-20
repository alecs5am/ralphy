// CLI integration tests for the stable error shape (01.02.04).
//
// We spawn `bun run cli/index.ts ...` with stdout/stderr piped (no TTY) so
// the JSON-mode path triggers, then assert:
//   • non-zero exit
//   • stderr is parseable JSON
//   • shape matches { error: { code, message, hint? } }

import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: REPO,
    encoding: "utf8",
    // No `stdio: "inherit"` — we want piped so isTTY === false on stdout/stderr.
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function parseStderrJson(stderr: string): unknown {
  // The error formatter writes a single JSON object followed by '\n'.
  // Strip trailing whitespace and parse.
  const trimmed = stderr.trim();
  // If multiple lines (warnings from bun, etc.), find the last `{...}` line.
  const lines = trimmed.split("\n").filter((l) => l.startsWith("{"));
  if (lines.length === 0) {
    throw new Error(`stderr has no JSON line: ${stderr}`);
  }
  return JSON.parse(lines[lines.length - 1]!);
}

describe("stable error shape (01.02.04)", () => {
  test("unknown model id → structured error on stderr", () => {
    const r = ralphy(["models", "show", "fake/no-such-model"]);
    expect(r.exitCode).not.toBe(0);
    const payload = parseStderrJson(r.stderr) as {
      error: { code: string; message: string; hint?: string };
    };
    expect(payload.error).toBeTruthy();
    expect(typeof payload.error.code).toBe("string");
    expect(payload.error.code).toMatch(/^E_[A-Z_]+$/);
    expect(typeof payload.error.message).toBe("string");
    expect(payload.error.message.length).toBeGreaterThan(0);
  });

  test("not-found project lookup → structured error on stderr", () => {
    // `config get` on a missing key hits err() in cli/commands/config.ts.
    const r = ralphy(["config", "get", "no_such_key_xyz_zzz_nonexistent"]);
    expect(r.exitCode).not.toBe(0);
    const payload = parseStderrJson(r.stderr) as { error: { code: string; message: string } };
    expect(payload.error.code).toMatch(/^E_[A-Z_]+$/);
    expect(payload.error.message.toLowerCase()).toContain("not found");
  });

  test("--json flag forces JSON on stderr even on TTY-ish env", () => {
    // We can't fake a TTY here, but --json should never produce a non-JSON
    // error line either way.
    const r = ralphy(["models", "show", "fake/no-such-model", "--json"]);
    expect(r.exitCode).not.toBe(0);
    expect(() => parseStderrJson(r.stderr)).not.toThrow();
  });
});
