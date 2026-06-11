// Integration tests for `ralphy editor preflight` + `ralphy editor trim-analyze`
// (#034). Same fixture pattern as cli-project-assets-verify.test.ts (#029) —
// synthesize a real 2-second mp4 via ffmpeg under a temp HOME, then exercise
// the verbs through the CLI surface. No LLM call: trim-analyze is tested via
// `--dry-run` which prints the plan + cache table without invoking the model.

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
const PROJECT_ID = "editor-preflight-test-001";

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: unknown } {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: tmpHome,
    encoding: "utf8",
    env: { ...process.env, HOME: tmpHome, RALPHY_HOME: tmpHome, NO_COLOR: "1" },
  });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function synthMp4(dst: string, durationSec: number, width = 1080, height = 1920, fps = 30) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "lavfi",
      "-i", `testsrc=duration=${durationSec}:size=${width}x${height}:rate=${fps}`,
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

beforeAll(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-editor-034-"));
  if (!ffmpegPresent || !ffprobePresent) return;

  const r = ralphy(["project", "create", "--name", "editor 034", "--id", PROJECT_ID]);
  if (r.exitCode !== 0) throw new Error(`project create failed: ${r.stderr}\n${r.stdout}`);
  projectDir = path.join(tmpHome, ".ralphy", "workspaces", "default", "projects", PROJECT_ID);
  if (!fs.existsSync(projectDir)) throw new Error(`project dir not found at ${projectDir}`);

  // Two 2-second clips (matching scenario scenes) + one 4-second music bed.
  synthMp4(path.join(projectDir, "artifacts", "videos", "scene-01-vid.mp4"), 2.0);
  synthMp4(path.join(projectDir, "artifacts", "videos", "scene-02-vid.mp4"), 2.0);
  synthMp3(path.join(projectDir, "artifacts", "music", "bed.mp3"), 4.0);

  // Scenario covers scene-01 + scene-02 + scene-03. scene-03 has NO clip on
  // disk → completeness check must flag it as missing.
  const scenario = {
    scenes: {
      "scene-01": { id: "scene-01", durationSec: 2.0 },
      "scene-02": { id: "scene-02", durationSec: 2.0 },
      "scene-03": { id: "scene-03", durationSec: 2.0 },
    },
  };
  fs.writeFileSync(path.join(projectDir, "scenario.json"), JSON.stringify(scenario, null, 2));
});

afterAll(() => {
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("ralphy editor preflight (#034)", () => {
  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "returns JSON with all slots, scenes, music-gap, completeness",
    () => {
      const r = ralphy(["editor", "preflight", PROJECT_ID]);
      // scene-03 is missing on disk → exit 1
      expect(r.exitCode).toBe(1);
      const j = r.json as any;
      expect(j.project).toBe(PROJECT_ID);
      expect(j.verdict).toBe("fail");
      expect(j.totals.clips).toBe(2);
      expect(j.totals.musicTracks).toBe(1);

      // Per-clip rows have the canonical shape
      expect(Array.isArray(j.clips)).toBe(true);
      expect(j.clips.length).toBe(2);
      const c1 = j.clips.find((x: any) => x.slot === "scene-01-vid");
      expect(c1).toBeTruthy();
      expect(c1.exists).toBe(true);
      expect(c1.hasVideo).toBe(true);
      expect(c1.hasAudio).toBe(true);
      expect(typeof c1.durationSec).toBe("number");
      expect(typeof c1.fps).toBe("number");
      expect(typeof c1.codec).toBe("string");
      expect(typeof c1.sizeBytes).toBe("number");
      expect(c1.aspect).toBe("9:16");

      // Music gap surfaces — 4s total clips vs 4s music = delta 0
      expect(j.musicGap).toBeTruthy();
      expect(j.musicGap.exceedsTolerance).toBe(false);

      // Completeness: scene-03 missing
      expect(j.completeness.ok).toBe(false);
      expect(j.completeness.missingScenes).toContain("scene-03");
      expect(j.completeness.totalScenes).toBe(3);

      // Issues array includes a SCENE-MISSING line
      const sceneMissing = (j.issues as string[]).find((i) => i.includes("SCENE-MISSING"));
      expect(sceneMissing).toBeTruthy();
    },
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "music-tolerance-sec flag is respected",
    () => {
      // Force a tiny tolerance — current delta is 0s so still passes for music
      // gap; this just confirms the flag plumbs through.
      const r = ralphy(["editor", "preflight", PROJECT_ID, "--music-tolerance-sec", "0.1"]);
      const j = r.json as any;
      expect(j.musicGap.toleranceSec).toBe(0.1);
    },
  );
});

describe("ralphy editor trim-analyze --dry-run (#034)", () => {
  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "prints the plan without calling the LLM",
    () => {
      const r = ralphy(["editor", "trim-analyze", PROJECT_ID, "--dry-run"]);
      expect(r.exitCode).toBe(0);
      const j = r.json as any;
      expect(j.dryRun).toBe(true);
      expect(j.clipCount).toBe(2);
      // Fresh project, no summary.json yet → all clips toRun
      expect(j.toRun).toBe(2);
      expect(j.cached).toBe(0);
      expect(Array.isArray(j.plan)).toBe(true);
      expect(j.plan.length).toBe(2);
      for (const p of j.plan) {
        expect(typeof p.slot).toBe("string");
        expect(typeof p.clip).toBe("string");
        expect(typeof p.clipMtimeMs).toBe("number");
        expect(p.cached).toBe(false);
      }
      expect(j.summaryPath).toMatch(/artifacts[\\/]+analysis[\\/]+summary\.json$/);

      // No actual call: the analysis dir is created lazily on real run, and
      // no per-clip JSON exists yet. #105: writes go to artifacts/analysis/.
      const analysisDir = path.join(projectDir, "artifacts", "analysis");
      if (fs.existsSync(analysisDir)) {
        const files = fs.readdirSync(analysisDir);
        expect(files).not.toContain("scene-01-vid.json");
      }
    },
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "dry-run with a seeded summary marks matching mtimes as cached",
    () => {
      // Seed summary.json with rows whose mtimes >= clip mtimes at the
      // canonical artifacts/analysis/ location (#106: single-path — the old
      // assets/analysis/ fallback is gone, migrated trees only).
      const analysisDir = path.join(projectDir, "artifacts", "analysis");
      fs.mkdirSync(analysisDir, { recursive: true });
      const clip1 = path.join(projectDir, "artifacts", "videos", "scene-01-vid.mp4");
      const clip2 = path.join(projectDir, "artifacts", "videos", "scene-02-vid.mp4");
      const m1 = fs.statSync(clip1).mtimeMs;
      const m2 = fs.statSync(clip2).mtimeMs;
      const seeded = {
        schemaVersion: 1,
        project: PROJECT_ID,
        generatedAt: "2026-05-30T00:00:00Z",
        model: "google/gemini-3.1-pro-preview",
        clips: [
          { slot: "scene-01-vid", clipPath: clip1, clipMtimeMs: m1, analysisPath: path.join(analysisDir, "scene-01-vid.json"), analyzedAt: "x", model: "m" },
          { slot: "scene-02-vid", clipPath: clip2, clipMtimeMs: m2, analysisPath: path.join(analysisDir, "scene-02-vid.json"), analyzedAt: "x", model: "m" },
        ],
      };
      fs.writeFileSync(path.join(analysisDir, "summary.json"), JSON.stringify(seeded, null, 2));

      const r = ralphy(["editor", "trim-analyze", PROJECT_ID, "--dry-run"]);
      const j = r.json as any;
      expect(j.dryRun).toBe(true);
      expect(j.toRun).toBe(0);
      expect(j.cached).toBe(2);
      for (const p of j.plan) expect(p.cached).toBe(true);
    },
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "--force re-runs even cached clips (dry-run reports them as toRun)",
    () => {
      // Seeded summary still exists from prior test.
      const r = ralphy(["editor", "trim-analyze", PROJECT_ID, "--dry-run", "--force"]);
      const j = r.json as any;
      expect(j.dryRun).toBe(true);
      expect(j.toRun).toBe(2);
      expect(j.cached).toBe(0);
    },
  );
});
