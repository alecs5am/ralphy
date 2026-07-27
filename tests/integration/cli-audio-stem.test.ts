// Integration test for `ralphy audio stem` (#554).
//
// Spawns the verb against a fixture project tree with three synthetic SFX
// one-shots and asserts:
//  1. exit 0 — the multi-cue filter_complex actually parses (the #011
//     single-letter-label bug class exits 234 on a bad graph)
//  2. the stem lands at artifacts/sfx/<slot>.mp3, pinned to --duration
//  3. the two-pass loudnorm honours --target-lufs within 1 LU (single-pass
//     loudnorm missed a -20 target by 4 LU on transient-dense material)
//  4. a re-run auto-versions instead of overwriting (append-only, AGENTS.md #14)
//  5. a missing cue slot fails loudly instead of silently dropping the cue
//
// Hosts without ffmpeg / ffprobe skip with a warning.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROJECT = "stem-smoke-001";
const SLOTS = ["click-01", "thud-02", "riser-03"];

function hasFfmpeg(): boolean {
  return (
    spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0 &&
    spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0
  );
}

const HAS_FFMPEG = hasFfmpeg();

let tmpRoot: string;
let sfxDir: string;
let cuesPath: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-stem-"));
  sfxDir = path.join(
    tmpRoot, ".ralphy", "workspaces", "default", "projects", PROJECT, "artifacts", "sfx",
  );
  fs.mkdirSync(sfxDir, { recursive: true });
  cuesPath = path.join(tmpRoot, "cues.json");
  // Frame-authored cue sheet: the composition timeline is in frames, which is
  // where the accuracy comes from. 160 @30fps = 5.333s.
  fs.writeFileSync(
    cuesPath,
    JSON.stringify({
      fps: 30,
      cues: [
        { frame: 0, slot: "click-01", gainDb: -9 },
        { frame: 160, slot: "thud-02" },
        { frame: 300, slot: "riser-03", gainDb: -3 },
        { frame: 301, slot: "click-01", gainDb: -12 },
      ],
    }),
  );
  if (!HAS_FFMPEG) return;
  for (const slot of SLOTS) {
    spawnSync(
      "ffmpeg",
      [
        "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "sine=frequency=880:duration=0.4",
        "-ac", "1", "-ar", "44100",
        path.join(sfxDir, `${slot}.mp3`),
      ],
      { stdio: "ignore" },
    );
  }
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function runStem(args: string[]) {
  return spawnSync(
    "bun",
    ["run", CLI, "audio", "stem", "--project", PROJECT, "--cues", cuesPath, ...args],
    { encoding: "utf8", cwd: tmpRoot },
  );
}

function probeDurationSec(file: string): number {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Number((r.stdout ?? "").trim());
}

function integratedLufs(file: string): number {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const m = (r.stderr ?? "").match(/I:\s*(-?[\d.]+)\s*LUFS/g) ?? [];
  const last = m[m.length - 1] ?? "";
  return Number(last.match(/(-?[\d.]+)/)?.[1]);
}

describe("ralphy audio stem (#554)", () => {
  test("4 cues over 3 slots → one stem pinned to --duration at the LUFS target", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe not on PATH — skipping audio stem integration");
      return;
    }
    const r = runStem(["--out", "sfx-stem", "--duration", "14", "--target-lufs", "-20"]);
    expect(r.status).toBe(0);
    const dst = path.join(sfxDir, "sfx-stem.mp3");
    expect(fs.existsSync(dst)).toBe(true);
    expect(JSON.parse(r.stdout).cues).toBe(4);
    // mp3 frame granularity adds up to ~40ms.
    expect(probeDurationSec(dst)).toBeCloseTo(14, 1);
    // Two-pass loudnorm: single-pass lands ~4 LU high on sparse SFX.
    expect(Math.abs(integratedLufs(dst) - -20)).toBeLessThan(1);
    // The lossless intermediate is cleaned up.
    expect(fs.readdirSync(sfxDir).filter((f) => f.endsWith(".wav"))).toEqual([]);
    // The graph the recipe actually ran is on the gen-log line.
    const log = fs.readFileSync(
      path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", PROJECT,
        "logs", "generations.jsonl"),
      "utf8",
    );
    expect(log).toContain("ffmpeg/audio-stem");
    expect(log).toContain("adelay=5333|5333");
  }, 60_000);

  test("re-running the same slot auto-versions instead of overwriting", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe not on PATH — skipping audio stem version test");
      return;
    }
    expect(runStem(["--out", "sfx-stem", "--duration", "6", "--no-loudnorm"]).status).toBe(0);
    expect(runStem(["--out", "sfx-stem", "--duration", "6", "--no-loudnorm"]).status).toBe(0);
    expect(fs.existsSync(path.join(sfxDir, "sfx-stem.mp3"))).toBe(true);
    expect(fs.existsSync(path.join(sfxDir, "sfx-stem.v1.mp3"))).toBe(true);
  }, 60_000);

  test("a cue slot with no file on disk fails loudly", () => {
    const bad = path.join(tmpRoot, "bad.json");
    fs.writeFileSync(bad, JSON.stringify([{ at: 1, slot: "not-a-slot" }]));
    cuesPath = bad;
    const r = runStem(["--out", "sfx-stem"]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("not-a-slot.mp3");
    expect(fs.existsSync(path.join(sfxDir, "sfx-stem.mp3"))).toBe(false);
  }, 30_000);
});
