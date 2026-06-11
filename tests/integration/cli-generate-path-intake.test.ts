// Integration coverage for issue #025 — project-relative ref resolution,
// NBSP normalization, and symmetric --prompt-file on the generate verbs.
//
// We exercise these via the live CLI (spawnSync `bun run cli/index.ts ...`)
// against a temp ralphy root, using --dry-run so no API key is required.
//
// The path-intake logic resolves at the action() boundary BEFORE the
// dry-run branch fires; the canonical observable signal is:
//   - NBSP normalization → stderr warning emitted
//   - --prompt-file picked up → dry-run exits 0 (otherwise hard-reject)
//   - --prompt + --prompt-file both omitted → exit non-zero (#025 spec)

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const FIXTURE_CATALOG = path.join(REPO, "tests", "fixtures", "or-catalog.json");

const NBSP_NARROW = String.fromCharCode(0x202f);

let tmpRoot: string;
let externalCwd: string;

function ralphy(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: any;
} {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
    cwd: opts.cwd ?? tmpRoot,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-cli-025-"));
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
  fs.copyFileSync(
    FIXTURE_CATALOG,
    path.join(tmpRoot, ".ralphy", "or-catalog.json"),
  );
  // Minimal project with a refs/ dir + one master image file.
  const projDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "test-001");
  fs.mkdirSync(path.join(projDir, "refs"), { recursive: true });
  fs.writeFileSync(path.join(projDir, "refs", "scene-01-master.png"), "x");
  fs.writeFileSync(path.join(projDir, "BRIEF.md"), "test\n");

  // Pick a cwd OUTSIDE of the project so cwd-relative ref resolution misses
  // and the project-relative fallback has to fire.
  externalCwd = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-cli-025-cwd-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  try {
    fs.rmSync(externalCwd, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("ralphy generate image — issue #025 path intake", () => {
  test("--prompt-file is accepted as a symmetric alternative to --prompt", () => {
    const promptFile = path.join(externalCwd, "prompt.txt");
    fs.writeFileSync(promptFile, "a beautifully lit hero portrait");
    const r = ralphy(
      [
        "generate",
        "image",
        "--project",
        "test-001",
        "--slot",
        "scene-01-bg",
        "--prompt-file",
        promptFile,
        "--dry-run",
      ],
      { cwd: externalCwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json?.dryRun).toBe(true);
  });

  test("neither --prompt nor --prompt-file → hard refuse with E_INPUT_INVALID", () => {
    const r = ralphy(
      [
        "generate",
        "image",
        "--project",
        "test-001",
        "--slot",
        "scene-01-bg",
        "--dry-run",
      ],
      { cwd: externalCwd },
    );
    expect(r.exitCode).not.toBe(0);
    const msg = r.stderr + r.stdout;
    expect(msg).toContain("prompt");
  });

  test(
    "cwd outside project + --project + bare-name --ref → resolves into the project's refs/ (no ENOENT)",
    () => {
      // The integration smoke is: do we exit 0 in dry-run, and not surface
      // an ENOENT-style error? The full read-into-data: URI happens in the
      // live branch (which we can't hit without an API key), but the intake
      // resolver runs unconditionally before the dry-run check.
      const r = ralphy(
        [
          "generate",
          "image",
          "--project",
          "test-001",
          "--slot",
          "scene-01-bg",
          "--prompt",
          "test",
          "--ref",
          "scene-01-master.png",
          "--dry-run",
        ],
        { cwd: externalCwd },
      );
      expect(r.exitCode).toBe(0);
      expect(r.json?.dryRun).toBe(true);
      // Negative-assert: no ENOENT in stderr.
      expect(r.stderr).not.toContain("ENOENT");
    },
  );

  test("NBSP in --ref path is normalized and a stderr warning is emitted", () => {
    // Write a file that has an ASCII space in its name; we'll request it
    // with NBSP at the same position and expect the intake helper to
    // normalize before the (eventual) lookup.
    const projRefs = path.join(
      tmpRoot,
      ".ralphy",
      "workspaces",
      "default",
      "projects",
      "test-001",
      "refs",
    );
    fs.writeFileSync(path.join(projRefs, "Screenshot 2026-05-29.png"), "x");

    const nbspRef = `Screenshot${NBSP_NARROW}2026-05-29.png`;
    const r = ralphy(
      [
        "generate",
        "image",
        "--project",
        "test-001",
        "--slot",
        "scene-01-bg",
        "--prompt",
        "test",
        "--ref",
        nbspRef,
        "--dry-run",
      ],
      { cwd: externalCwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("invisible whitespace");
  });
});

describe("ralphy generate video — issue #025 --prompt-file", () => {
  test("--prompt-file is accepted as a symmetric alternative to --prompt", () => {
    const promptFile = path.join(externalCwd, "video-prompt.txt");
    fs.writeFileSync(promptFile, "slow push-in on a moving subject");
    const r = ralphy(
      [
        "generate",
        "video",
        "--project",
        "test-001",
        "--slot",
        "scene-01",
        "--prompt-file",
        promptFile,
        "--duration",
        "5",
        "--model",
        "kwaivgi/kling-v3.0-pro",
        "--dry-run",
      ],
      { cwd: externalCwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json?.dryRun).toBe(true);
  });
});

describe("ralphy generate music — issue #025 --prompt-file", () => {
  test("--prompt-file is accepted as a symmetric alternative to --prompt", () => {
    const promptFile = path.join(externalCwd, "music-prompt.txt");
    fs.writeFileSync(promptFile, "lo-fi hip hop, 80 bpm, dusty piano");
    const r = ralphy(
      [
        "generate",
        "music",
        "--project",
        "test-001",
        "--slot",
        "bed-01",
        "--prompt-file",
        promptFile,
        "--duration",
        "10",
        "--dry-run",
      ],
      { cwd: externalCwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json?.dryRun).toBe(true);
  });
});
