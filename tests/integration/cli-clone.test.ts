// Integration smoke for `ralphy clone` (01.01.03).
//
// We can't run the full URL → blueprint chain in unit tests (needs yt-dlp +
// OpenRouter creds), so we only check:
//   • --help works and lists Examples
//   • Invoking with an unknown slug returns E_NOT_FOUND

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-clone-"));
  fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmp, ...args], {
    cwd: tmp,
    encoding: "utf8",
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe("ralphy clone", () => {
  test("--help shows Examples block", () => {
    const r = ralphy(["clone", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Examples:");
    expect(r.stdout).toContain("tiktok.com");
  });

  test("unknown slug → structured E_NOT_FOUND on stderr", () => {
    const r = ralphy(["clone", "definitely-not-a-real-slug-xyz"]);
    expect(r.exitCode).not.toBe(0);
    const last = r.stderr
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    expect(last).toBeTruthy();
    const payload = JSON.parse(last!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_NOT_FOUND");
  });
});
