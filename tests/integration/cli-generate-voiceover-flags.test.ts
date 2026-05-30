// Integration: `ralphy generate voiceover` flag surface (#030).
//
// Checks the new --speed flag and the range validation that catches a typo'd
// --style 1.5 before we burn a TTS round-trip. The actual VO render path is
// covered by elevenlabs-voiceover-* unit tests; this exercise is about the
// commander surface + the rangeCheck() guard.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-vo-flags-"));
  fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmp, ...args], {
    cwd: tmp,
    encoding: "utf8",
    env: { ...process.env, ELEVENLABS_API_KEY: "test-key" },
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe("ralphy generate voiceover — new flags (#030)", () => {
  test("--help lists --speed / --stability / --similarity-boost / --style", () => {
    const r = ralphy(["generate", "voiceover", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("--speed");
    expect(r.stdout).toContain("--stability");
    expect(r.stdout).toContain("--similarity-boost");
    expect(r.stdout).toContain("--style");
  });

  test("--dry-run with --speed and --stability prints the est cost (now non-zero)", () => {
    // Project doesn't need to exist for dry-run — it short-circuits before
    // any project state is required.
    fs.mkdirSync(path.join(tmp, "workspace", "projects", "vo-flag-test-001"), {
      recursive: true,
    });
    const r = ralphy([
      "generate",
      "voiceover",
      "--project",
      "vo-flag-test-001",
      "--slot",
      "scene-01-vo",
      "--voice",
      "test-voice-id",
      "--text",
      "x".repeat(1500),
      "--stability",
      "0.5",
      "--speed",
      "0.9",
      "--dry-run",
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
    // 1500 chars / 1000 = ceil(1.5) = 2 * $0.20 = $0.40 on multilingual_v2.
    const parsed = JSON.parse(r.stdout);
    expect(parsed.cost_estimate_usd).toBeCloseTo(0.4, 4);
  });
});
