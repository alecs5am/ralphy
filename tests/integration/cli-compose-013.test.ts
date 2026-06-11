// Integration test for `ralphy compose <project>` (#013).
//
// Same fixture pattern as cli-editor-034.test.ts:
//   1. mkdtemp HOME + create project via CLI
//   2. synth 3 short test clips (testsrc + sine) into artifacts/videos/
//   3. one short music bed into artifacts/music/
//   4. `ralphy compose <id>` → exits 0, produces a single mp4
//   5. duration ≈ sum of segment durations (within ffmpeg rounding)
//   6. `ralphy compose <id> --remove-segment scene-02-vid` → produces a
//      shorter mp4, doesn't clobber the first (AGENTS invariant #14)
//
// No LLM, no network. Just ffmpeg + the CLI.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

const ffmpegPresent = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const ffprobePresent = spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

let tmpHome: string;
let projectDir: string;
const PROJECT_ID = "compose-013-test-001";

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: unknown } {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: tmpHome,
    encoding: "utf8",
    env: { ...process.env, HOME: tmpHome, RALPHY_HOME: tmpHome, NO_COLOR: "1" },
  });
  let json: unknown = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function synthMp4(dst: string, durationSec: number) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "lavfi",
      "-i", `testsrc=duration=${durationSec}:size=320x240:rate=24`,
      "-f", "lavfi",
      "-i", `sine=frequency=440:duration=${durationSec}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-shortest",
      dst,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg synth failed: ${r.stderr}`);
}

function synthMp3(dst: string, durationSec: number) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "lavfi",
      "-i", `sine=frequency=220:duration=${durationSec}`,
      dst,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg mp3 synth failed: ${r.stderr}`);
}

function probeDurationSec(src: string): number {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", src],
    { encoding: "utf8" },
  );
  const v = parseFloat((r.stdout || "").trim());
  return Number.isFinite(v) ? v : 0;
}

beforeAll(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-compose-013-"));
  if (!ffmpegPresent || !ffprobePresent) return;

  const r = ralphy(["project", "create", "--name", "compose 013", "--id", PROJECT_ID]);
  if (r.exitCode !== 0) throw new Error(`project create failed: ${r.stderr}\n${r.stdout}`);
  projectDir = path.join(tmpHome, ".ralphy", "workspaces", "default", "projects", PROJECT_ID);
  if (!fs.existsSync(projectDir)) throw new Error(`project dir not found at ${projectDir}`);

  // 3 clips: 2s / 2s / 2s = 6s total.
  synthMp4(path.join(projectDir, "artifacts", "videos", "scene-01-vid.mp4"), 2.0);
  synthMp4(path.join(projectDir, "artifacts", "videos", "scene-02-vid.mp4"), 2.0);
  synthMp4(path.join(projectDir, "artifacts", "videos", "scene-03-vid.mp4"), 2.0);
  // 8s music bed (longer than clips — confirms fade-out anchors against
  // timeline duration, not music duration).
  synthMp3(path.join(projectDir, "artifacts", "music", "bed.mp3"), 8.0);
});

afterAll(() => {
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("ralphy compose <id> (#013)", () => {
  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "dry-run prints timeline + filter graph without spawning ffmpeg",
    () => {
      const r = ralphy(["compose", PROJECT_ID, "--dry-run"]);
      expect(r.exitCode).toBe(0);
      const j = r.json as any;
      expect(j.dryRun).toBe(true);
      expect(j.timeline.segments.length).toBe(3);
      expect(j.timeline.music).toBe(true);
      expect(j.filter_graph.valid).toBe(true);
      expect(j.filter_graph.filter).toContain("[vout]");
      expect(j.filter_graph.filter).toContain("[aout]");
      // No render written.
      const renderDir = path.join(projectDir, "render");
      if (fs.existsSync(renderDir)) {
        expect(fs.readdirSync(renderDir)).not.toContain("compose.mp4");
      }
    },
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "produces a single mp4 with duration ≈ sum of segments",
    () => {
      const r = ralphy(["compose", PROJECT_ID]);
      expect(r.exitCode).toBe(0);
      const j = r.json as any;
      const written = j.written as string;
      expect(written).toBeTruthy();
      expect(fs.existsSync(written)).toBe(true);
      // Total = 3 * 2s = 6s. Allow loose tolerance — ffmpeg concat + faststart
      // can shave / pad a few frames.
      const dur = probeDurationSec(written);
      expect(dur).toBeGreaterThan(5.5);
      expect(dur).toBeLessThan(6.5);
    },
    60000,
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "--remove-segment drops the slot and re-flows; output does NOT clobber prior render",
    () => {
      const r = ralphy(["compose", PROJECT_ID, "--remove-segment", "scene-02-vid"]);
      expect(r.exitCode).toBe(0);
      const j = r.json as any;
      expect(j.removed_segments).toEqual(["scene-02-vid"]);
      expect(j.timeline.segments.length).toBe(2);
      const written = j.written as string;
      expect(fs.existsSync(written)).toBe(true);
      // Auto-bumped filename (NOT compose.mp4 — the original from the
      // previous test is preserved per AGENTS invariant #14).
      expect(path.basename(written)).not.toBe("compose.mp4");
      expect(path.basename(written)).toMatch(/^compose-v\d+\.mp4$/);
      const dur = probeDurationSec(written);
      // 2 * 2s = 4s. Same generous tolerance.
      expect(dur).toBeGreaterThan(3.5);
      expect(dur).toBeLessThan(4.5);
      // Prior render still on disk.
      expect(fs.existsSync(path.join(projectDir, "render", "compose.mp4"))).toBe(true);
    },
    60000,
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "unknown segment slot is reported as not-found (compose still runs)",
    () => {
      const r = ralphy(["compose", PROJECT_ID, "--remove-segment", "scene-99-doesnotexist", "--dry-run"]);
      expect(r.exitCode).toBe(0);
      const j = r.json as any;
      expect(j.not_found_segments).toEqual(["scene-99-doesnotexist"]);
      expect(j.removed_segments).toEqual([]);
      // Timeline unchanged.
      expect(j.timeline.segments.length).toBe(3);
    },
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "writes a gen-log row tagged ffmpeg/compose-timeline",
    () => {
      const logPath = path.join(projectDir, "logs", "generations.jsonl");
      expect(fs.existsSync(logPath)).toBe(true);
      const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
      const rows = lines.map((l) => JSON.parse(l));
      const composeRows = rows.filter((r: any) => r.endpoint === "ffmpeg/compose-timeline");
      expect(composeRows.length).toBeGreaterThanOrEqual(1);
      const ok = composeRows.find((r: any) => r.status === "ok");
      expect(ok).toBeTruthy();
      expect(ok.kind).toBe("video");
      expect(ok.provider).toBe("ffmpeg");
      expect(ok.cost_usd).toBe(0);
      expect(ok.input.project).toBe(PROJECT_ID);
      expect(ok.input.slot).toBe("compose");
    },
  );
});
