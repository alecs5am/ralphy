// Integration tests for `ralphy video compress` and `ralphy audio mix-music`
// (#036). Spawns real ffmpeg against a synthetic mp4 and asserts:
//
//   * `ralphy video compress --in <m> --out <m2>` produces an mp4 whose
//     ffprobe metadata reports a libx264-encoded video stream + the `+faststart`
//     moov atom landed at the head of the file (offset 32 bytes; required by
//     every web player for progressive playback).
//   * `ralphy audio mix-music --in <video> --music <mp3> --volume 0.18 --out <m2>`
//     produces a playable mp4 with positive duration.
//
// Hosts without ffmpeg / ffprobe skip with a warning so CI lanes that don't
// pre-install ffmpeg don't go red.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

function hasFfmpeg(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  const p = spawnSync("ffprobe", ["-version"], { stdio: "ignore" });
  return r.status === 0 && p.status === 0;
}

const HAS_FFMPEG = hasFfmpeg();

let tmpRoot: string;
let videoPath: string;
let musicPath: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-036-"));
  videoPath = path.join(tmpRoot, "in.mp4");
  musicPath = path.join(tmpRoot, "music.wav");
  if (!HAS_FFMPEG) return;

  // 1-second 256x256 colorbar video with a 440Hz sine audio track.
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=256x256:duration=1:rate=24",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k",
      "-shortest",
      videoPath,
    ],
    { stdio: "ignore" },
  );
  // 1-second music bed at 880 Hz.
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

function probeVideoCodec(file: string): string {
  const r = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name",
      "-of", "csv=p=0",
      file,
    ],
    { encoding: "utf8" },
  );
  return ((r.stdout as string | undefined) ?? "").trim();
}

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
  return Number(((r.stdout as string | undefined) ?? "").trim());
}

/**
 * `+faststart` re-orders an mp4 so the moov atom appears before mdat. Locating
 * an `moov` ASCII tag in the leading 1 KB of the file is a strict-enough proxy
 * for "moov-at-front" — without faststart the moov atom lands at the tail.
 */
function hasFaststartHead(file: string): boolean {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(1024);
    fs.readSync(fd, buf, 0, 1024, 0);
    return buf.includes(Buffer.from("moov"));
  } finally {
    fs.closeSync(fd);
  }
}

describe("ralphy video compress (#036)", () => {
  test("synthetic mp4 → libx264 + moov-at-front + non-zero duration", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe not on PATH — skipping compress integration");
      return;
    }
    const out = path.join(tmpRoot, "compressed.mp4");
    const r = spawnSync(
      "bun",
      [
        "run",
        CLI,
        "video", "compress",
        "--in", videoPath,
        "--out", out,
      ],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    expect(probeVideoCodec(out)).toBe("h264");
    expect(probeDurationSec(out)).toBeGreaterThan(0);
    expect(hasFaststartHead(out)).toBe(true);
  }, 30_000);
});

describe("ralphy audio mix-music (#036)", () => {
  test("video + music + --volume 0.18 → playable mp4 with positive duration", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe not on PATH — skipping mix-music integration");
      return;
    }
    const out = path.join(tmpRoot, "mixed.mp4");
    const r = spawnSync(
      "bun",
      [
        "run",
        CLI,
        "audio", "mix-music",
        "--in", videoPath,
        "--music", musicPath,
        "--volume", "0.18",
        "--out", out,
      ],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    const stat = fs.statSync(out);
    expect(stat.size).toBeGreaterThan(0);
    expect(probeDurationSec(out)).toBeGreaterThan(0);
  }, 30_000);
});
