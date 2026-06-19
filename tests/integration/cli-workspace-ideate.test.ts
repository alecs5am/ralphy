// Integration smoke for `ralphy workspace ideate <slug>`.
//
// Covers the NON-LLM guard paths only (the verb's model call goes through
// callLLM() and is not exercised in tests — no network in CI):
//   1. unknown workspace            → E_NOT_FOUND
//   2. workspace with no bible files → E_INTERNAL ("No bible files found")
//
// The happy path (a real Gemini pitch) is validated manually; here we only
// prove the verb registers, validates its input, and refuses cleanly.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ws-ideate-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, "--json", ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function stderrErrorCode(stderr: string): string | null {
  const line = stderr
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .pop();
  if (!line) return null;
  try {
    return JSON.parse(line)?.error?.code ?? null;
  } catch {
    return null;
  }
}

describe("ralphy workspace ideate", () => {
  test("refuses an unknown workspace with E_NOT_FOUND", () => {
    const r = ralphy(["workspace", "ideate", "no-such-universe"]);
    expect(r.exitCode).not.toBe(0);
    expect(stderrErrorCode(r.stderr)).toBe("E_NOT_FOUND");
  });

  test("refuses a workspace with no bible files (before any model call)", () => {
    const create = ralphy(["workspace", "create", "emptyverse"]);
    expect(create.exitCode).toBe(0);
    const r = ralphy(["workspace", "ideate", "emptyverse"]);
    expect(r.exitCode).not.toBe(0);
    expect(stderrErrorCode(r.stderr)).toBe("E_INTERNAL");
    expect(r.stderr).toContain("No bible files found");
  });
});
