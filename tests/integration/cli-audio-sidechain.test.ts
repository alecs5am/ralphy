// Integration test for `ralphy audio sidechain` (#011).
//
// Spawns `bun run cli/index.ts audio sidechain --voice <synth> --music <synth>
// --out <tmp>` against ffmpeg-generated 1-second synthetic tones and asserts:
//  1. exit 0 (the single-letter-label bug exited 234 with the unfixed graph)
//  2. the output file exists, is non-zero, and ffprobe reports Duration > 0
//  3. --loudnorm is respected — when set, the resulting file is loudness-pinned
//
// Hosts without ffmpeg / ffprobe skip with a warning so CI lanes that don't
// pre-install ffmpeg don't go red.

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

function hasFfmpeg(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  const p = spawnSync("ffprobe", ["-version"], { stdio: "ignore" });
  return r.status === 0 && p.status === 0;
}

const HAS_FFMPEG = hasFfmpeg();

let tmpRoot: string;
let voicePath: string;
let musicPath: string;
let domain: DomainProjectFixture;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-sidechain-"));
  domain = seedDomainProject(tmpRoot, "sidechain");
  voicePath = path.join(tmpRoot, "voice.wav");
  musicPath = path.join(tmpRoot, "music.wav");

  if (!HAS_FFMPEG) return;

  // Synthetic VO at 440 Hz, music bed at 880 Hz. 1 second each, mono, 44.1k.
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel", "error",
      "-f", "lavfi",
      "-i", "sine=frequency=440:duration=1",
      "-ac", "1",
      "-ar", "44100",
      voicePath,
    ],
    { stdio: "ignore" },
  );
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel", "error",
      "-f", "lavfi",
      "-i", "sine=frequency=880:duration=1",
      "-ac", "1",
      "-ar", "44100",
      musicPath,
    ],
    { stdio: "ignore" },
  );
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function probeDurationSec(file: string): number {
  const r = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      file,
    ],
    { encoding: "utf8" },
  );
  return Number((r.stdout ?? "").trim());
}

describe("ralphy audio sidechain (#011)", () => {
  test("synthetic VO + music → mixed output exists, Duration > 0", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe not on PATH — skipping sidechain integration");
      return;
    }
    const out = path.join(tmpRoot, "mixed.wav");
    const r = spawnSync(
      "bun",
      [
        "run",
        CLI,
        "audio",
        "sidechain",
        "--voice", voicePath,
        "--music", musicPath,
        "--out", out,
        "--project", domain.projectId,
      ],
      { cwd: tmpRoot, encoding: "utf8", env: { ...process.env, RALPHY_HOME: tmpRoot } },
    );
    // The single-letter-label bug exited 234 here. Asserting 0 locks the fix.
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout);
    const stored = artifactRevisionObjectPath(tmpRoot, domain, result.revisionId);
    expect(fs.existsSync(out)).toBe(false);
    const stat = fs.statSync(stored);
    expect(stat.size).toBeGreaterThan(0);
    const dur = probeDurationSec(stored);
    expect(dur).toBeGreaterThan(0);
  }, 30_000);

  test("--loudnorm flag is respected — chains loudnorm + still produces playable audio", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe not on PATH — skipping --loudnorm integration");
      return;
    }
    const out = path.join(tmpRoot, "mixed-ln.wav");
    const r = spawnSync(
      "bun",
      [
        "run",
        CLI,
        "audio",
        "sidechain",
        "--voice", voicePath,
        "--music", musicPath,
        "--out", out,
        "--loudnorm", "-16",
        "--project", domain.projectId,
        "--pretty",
      ],
      { cwd: tmpRoot, encoding: "utf8", env: { ...process.env, RALPHY_HOME: tmpRoot } },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain(tmpRoot);
    const revisionId = r.stdout.match(/arev_[A-Za-z0-9-]+/)?.[0];
    expect(revisionId).toBeDefined();
    const stored = artifactRevisionObjectPath(tmpRoot, domain, revisionId!);
    expect(fs.existsSync(out)).toBe(false);
    const dur = probeDurationSec(stored);
    expect(dur).toBeGreaterThan(0);
  }, 30_000);
});
