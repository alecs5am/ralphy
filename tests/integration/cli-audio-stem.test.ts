// Integration test for `ralphy audio stem` (#599).
//
// Seeds three synthetic SFX one-shots as Project audio Artifacts (through
// `audio concat`, so they land in the store the way a generated SFX does), then
// spawns the verb and asserts:
//  1. exit 0 — the multi-cue filter_complex actually parses (the #011
//     single-letter-label bug class exits 234 on a bad graph)
//  2. the stem is one new audio Artifact Revision, pinned to --duration
//  3. the two-pass loudnorm honours --target-lufs within 1 LU (single-pass
//     loudnorm missed a -20 target by 4 LU on transient-dense material)
//  4. a re-run adds a Revision to the same Artifact (append-only, AGENTS.md #14)
//  5. a missing cue slot fails loudly instead of silently dropping the cue
//
// Hosts without ffmpeg / ffprobe skip with a warning.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  artifactRevisionObjectPath,
  seedDomainProject,
  type DomainProjectFixture,
} from "../helpers/domain-media.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const SLOTS = ["click-01", "thud-02", "riser-03"];

function hasFfmpeg(): boolean {
  return (
    spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0 &&
    spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0
  );
}

const HAS_FFMPEG = hasFfmpeg();

let tmpRoot: string;
let cuesPath: string;
let domain: DomainProjectFixture;

function cli(args: string[]) {
  return spawnSync("bun", ["run", CLI, ...args], {
    encoding: "utf8",
    cwd: tmpRoot,
    env: { ...process.env, RALPHY_HOME: tmpRoot },
  });
}

function synthTone(file: string, frequency: number) {
  spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=0.4`,
      "-ac", "1", "-ar", "44100",
      file,
    ],
    { stdio: "ignore" },
  );
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-stem-"));
  domain = seedDomainProject(tmpRoot, "stem-smoke");
  cuesPath = path.join(tmpRoot, "cues.json");
  // Frame-authored cue sheet: the composition timeline is in frames, which is
  // where the accuracy comes from. 160 @30fps = 5.333s. The last cue reads a
  // file next to the sheet instead of a Project Artifact.
  fs.writeFileSync(
    cuesPath,
    JSON.stringify({
      fps: 30,
      cues: [
        { frame: 0, slot: "click-01", gainDb: -9 },
        { frame: 160, slot: "thud-02" },
        { frame: 300, slot: "riser-03", gainDb: -3 },
        { frame: 301, slot: "click-01", gainDb: -12 },
        { frame: 330, path: "local/whoosh.mp3", gainDb: -6 },
      ],
    }),
  );
  if (!HAS_FFMPEG) return;
  fs.mkdirSync(path.join(tmpRoot, "local"));
  synthTone(path.join(tmpRoot, "local", "whoosh.mp3"), 330);
  SLOTS.forEach((slot, i) => {
    const raw = path.join(tmpRoot, `${slot}-raw.mp3`);
    synthTone(raw, 440 * (i + 1));
    const r = cli(["audio", "concat", "--files", raw, "--out", `${slot}.mp3`, "--project", domain.projectId]);
    if (r.status !== 0) throw new Error(`seeding ${slot} failed: ${r.stderr}`);
  });
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function runStem(args: string[]) {
  return cli(["audio", "stem", "--project", domain.projectId, "--cues", cuesPath, ...args]);
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

describe("ralphy audio stem (#599)", () => {
  test("5 cues over 3 slots and a file → one stem pinned to --duration at the LUFS target", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe not on PATH — skipping audio stem integration");
      return;
    }
    const r = runStem(["--out", "sfx-stem.mp3", "--duration", "14", "--target-lufs", "-20"]);
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.cues).toBe(5);
    expect(r.stdout).not.toContain(tmpRoot);
    const stored = artifactRevisionObjectPath(tmpRoot, domain, result.revisionId);
    // mp3 frame granularity adds up to ~40ms.
    expect(probeDurationSec(stored)).toBeCloseTo(14, 1);
    // Two-pass loudnorm: single-pass lands ~4 LU high on sparse SFX.
    expect(Math.abs(integratedLufs(stored) - -20)).toBeLessThan(1);
    // The lossless intermediate is cleaned up.
    const runTmp = path.join(tmpRoot, ".ralphy", "tmp", result.runId);
    const leftovers = fs.existsSync(runTmp) ? fs.readdirSync(runTmp).filter((f) => f.endsWith(".wav")) : [];
    expect(leftovers).toEqual([]);
  }, 90_000);

  test("re-running the same output adds a Revision to the same Artifact", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe not on PATH — skipping audio stem revision test");
      return;
    }
    const first = runStem(["--out", "sfx-stem.mp3", "--duration", "6", "--no-loudnorm"]);
    const second = runStem(["--out", "sfx-stem.mp3", "--duration", "6", "--no-loudnorm"]);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    const a = JSON.parse(first.stdout);
    const b = JSON.parse(second.stdout);
    expect(b.artifactId).toBe(a.artifactId);
    expect(b.revisionId).not.toBe(a.revisionId);
    expect(a.targetLufs).toBeNull();
  }, 90_000);

  test("a cue slot with no Artifact fails loudly and names it", () => {
    const bad = path.join(tmpRoot, "bad.json");
    fs.writeFileSync(bad, JSON.stringify([{ at: 1, slot: "not-a-slot" }, { at: 2, path: "nope.wav" }]));
    cuesPath = bad;
    const r = runStem(["--out", "sfx-stem.mp3"]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("not-a-slot");
    expect(r.stdout + r.stderr).toContain("nope.wav");
  }, 60_000);
});
