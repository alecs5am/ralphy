// Integration smoke: `ralphy voice clone --help` shows the new verb (#030).
//
// We don't drive a live clone here — that needs an ElevenLabs key + a real
// audio sample. This is the surface-area check: the verb is registered, --help
// works, and the help body mentions the load-bearing defaults (denoise on by
// default, --isolate is opt-in).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-voice-clone-help-"));
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

describe("ralphy voice clone — surface check (#030)", () => {
  test("`voice --help` lists the clone subcommand", () => {
    const r = ralphy(["voice", "--help"]);
    expect(r.exitCode).toBe(0);
    // The subcommand description gets word-wrapped by Commander; assert on
    // tokens that survive the wrap rather than the full sentence.
    expect(r.stdout).toContain("clone");
    expect(r.stdout).toContain("Cloning");
  });

  test("`voice clone --help` shows required flags + examples", () => {
    const r = ralphy(["voice", "clone", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("--from");
    expect(r.stdout).toContain("--name");
    expect(r.stdout).toContain("--isolate");
    expect(r.stdout).toContain("Instant Voice Cloning");
    expect(r.stdout).toContain("Examples:");
  });

  test("`template clone --help` shows the renamed style-lift verb", () => {
    const r = ralphy(["template", "clone", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("vibe-style template");
    expect(r.stdout).toContain("--strict-look");
  });

  test("`ralphy clone --help` still works as a deprecation alias", () => {
    const r = ralphy(["clone", "--help"]);
    // The deprecated alias still resolves so a one-release grace window is honored.
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("vibe-style template");
  });
});
