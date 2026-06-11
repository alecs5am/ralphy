// Integration test for `ralphy project assets` + `ralphy project verify`
// (issue #029). Both verbs probe truth via ffprobe and either emit it raw
// (assets) or diff it against asset-manifest.json claims (verify).
//
// We use ffmpeg to synthesize a 2-second 320x240 test mp4 in a temp HOME so
// the test is self-contained — no dependency on `workspace/` real projects.

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
const PROJECT_ID = "ffprobe-test-001";

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: unknown } {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: tmpHome,
    encoding: "utf8",
    env: { ...process.env, HOME: tmpHome, RALPHY_HOME: tmpHome },
  });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function synthMp4(dst: string, durationSec: number, width = 320, height = 240, fps = 30) {
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

function synthPng(dst: string, w = 100, h = 100) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "lavfi",
      "-i", `color=c=red:size=${w}x${h}:d=1`,
      "-frames:v", "1",
      dst,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg png synth failed: ${r.stderr}`);
}

beforeAll(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ffprobe-"));
  if (!ffmpegPresent || !ffprobePresent) return;

  // Create the project via the CLI so it lands in the registry properly.
  // projectsDir() = <cwd>/workspace/projects/<id> — cwd is tmpHome.
  const r = ralphy(["project", "create", "--name", "ffprobe test", "--id", PROJECT_ID]);
  if (r.exitCode !== 0) throw new Error(`project create failed: ${r.stderr}\n${r.stdout}`);
  projectDir = path.join(tmpHome, ".ralphy", "workspaces", "default", "projects", PROJECT_ID);
  if (!fs.existsSync(projectDir)) {
    throw new Error(`project dir not found at ${projectDir}`);
  }

  // Synthesize one 2-second mp4 and one PNG.
  const mp4 = path.join(projectDir, "artifacts", "videos", "scene-01-vid.mp4");
  const png = path.join(projectDir, "artifacts", "images", "scene-01-bg.png");
  synthMp4(mp4, 2.0, 320, 240, 30);
  synthPng(png, 200, 100);

  // Write an asset-manifest.json. scene-01-vid: claims match reality.
  // scene-01-bg: width claim WRONG (999 vs real 200) → expect divergence.
  const manifest = {
    slots: {
      "scene-01-vid": {
        kind: "video",
        path: mp4,
        durationSec: 2.0,
        width: 320,
        height: 240,
      },
      "scene-01-bg": {
        kind: "image",
        path: png,
        width: 999, // intentional lie
        height: 100,
      },
      "scene-missing": {
        kind: "video",
        path: path.join(projectDir, "artifacts", "videos", "ghost.mp4"),
      },
    },
  };
  fs.writeFileSync(
    path.join(projectDir, "asset-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
});

afterAll(() => {
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("ralphy project assets / verify (#029)", () => {
  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "project assets <id> — returns ffprobe truth array",
    () => {
      const r = ralphy(["project", "assets", PROJECT_ID]);
      expect(r.exitCode).toBe(0);
      const rows = r.json as Array<Record<string, any>>;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(2); // 1 mp4 + 1 png (missing slot doesn't show — it's not on disk)

      const vid = rows.find((x) => x.kind === "video");
      expect(vid).toBeTruthy();
      expect(vid!.width).toBe(320);
      expect(vid!.height).toBe(240);
      expect(Math.abs(vid!.duration_s - 2.0)).toBeLessThan(0.15);
      expect(Array.isArray(vid!.codecs)).toBe(true);
      expect(vid!.codecs).toContain("h264");
      expect(typeof vid!.size_bytes).toBe("number");
      expect(vid!.slot).toBe("scene-01-vid");

      const img = rows.find((x) => x.kind === "image");
      expect(img).toBeTruthy();
      expect(img!.width).toBe(200);
      expect(img!.height).toBe(100);
    },
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "project assets <id> --kind video — filters by kind",
    () => {
      const r = ralphy(["project", "assets", PROJECT_ID, "--kind", "video"]);
      expect(r.exitCode).toBe(0);
      const rows = r.json as Array<Record<string, any>>;
      expect(rows.length).toBe(1);
      expect(rows[0].kind).toBe("video");
    },
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "project verify <id> — flags divergence + missing file, exits non-zero",
    () => {
      const r = ralphy(["project", "verify", PROJECT_ID]);
      // 2 red: scene-01-bg width mismatch + scene-missing absent
      expect(r.exitCode).not.toBe(0);
      const j = r.json as { verdict: string; slotCount: number; redCount: number; slots: any[] };
      expect(j.verdict).toBe("fail");
      expect(j.slotCount).toBe(3);
      expect(j.redCount).toBeGreaterThanOrEqual(2);

      const vid = j.slots.find((s) => s.slot === "scene-01-vid");
      expect(vid.divergences).toEqual([]);

      const bg = j.slots.find((s) => s.slot === "scene-01-bg");
      const widthDiv = bg.divergences.find((d: any) => d.field === "width");
      expect(widthDiv).toBeTruthy();
      expect(widthDiv.manifest).toBe(999);
      expect(widthDiv.ffprobe).toBe(200);

      const missing = j.slots.find((s) => s.slot === "scene-missing");
      expect(missing.exists).toBe(false);
      expect(missing.issues.some((i: string) => i.includes("missing"))).toBe(true);
    },
  );

  test.skipIf(!ffmpegPresent || !ffprobePresent)(
    "project verify <id> — logs a row to generations.jsonl",
    () => {
      // run again to ensure a log row lands
      ralphy(["project", "verify", PROJECT_ID]);
      const logPath = path.join(projectDir, "logs", "generations.jsonl");
      expect(fs.existsSync(logPath)).toBe(true);
      const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
      const verifyRows = lines
        .map((l) => JSON.parse(l))
        .filter((r) => r.endpoint === "ffprobe/project-verify");
      expect(verifyRows.length).toBeGreaterThan(0);
      expect(verifyRows[verifyRows.length - 1].provider).toBe("ffmpeg");
    },
  );
});
