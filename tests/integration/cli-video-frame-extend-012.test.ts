// Integration tests for `ralphy video frame` + `ralphy video extend` (#012).
// Spawns real ffmpeg against a synthetic fixture and asserts:
//
//   * `video frame <clip> --at 0.5 --out <png>` writes a PNG that ffprobe
//     reports as a 1x1+ image (proves the extract actually decoded a frame).
//   * `video extend <clip> --project <id> --slot scene-02 --duration 5
//      --prompt "..." --dry-run` prints the planned chain announcing
//      `extends: <clip>` and writes the anchor PNG into the project's refs/.
//
// Hosts without ffmpeg / ffprobe skip with a warning so CI lanes that don't
// pre-install ffmpeg don't go red.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-012-"));
  videoPath = path.join(tmpRoot, "scene-01.mp4");
  if (!HAS_FFMPEG) return;
  // 2-second 128x128 testsrc — enough frames for both --at 1.5 and --at last.
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=128x128:duration=2:rate=24",
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      videoPath,
    ],
    { stdio: "ignore" },
  );
  expect(r.status).toBe(0);
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function probePngSize(file: string): { width: number; height: number } {
  const r = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      file,
    ],
    { encoding: "utf8" },
  );
  const [w, h] = ((r.stdout as string | undefined) ?? "").trim().split(",");
  return { width: Number(w ?? 0), height: Number(h ?? 0) };
}

describe("ralphy video frame (#012)", () => {
  test("--at 1.5 --out <png> writes a decoded still PNG", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe missing — skipping `video frame --at 1.5` test");
      return;
    }
    const outPng = path.join(tmpRoot, "frame.png");
    const r = spawnSync(
      "bun",
      [
        "run", CLI,
        "video", "frame", videoPath,
        "--at", "1.5",
        "--out", outPng,
      ],
      { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
    );
    expect(r.status).toBe(0);
    expect(fs.existsSync(outPng)).toBe(true);
    const { width, height } = probePngSize(outPng);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  }, 30_000);

  test("--at last writes a decoded PNG via the `-sseof -1` path", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg/ffprobe missing — skipping `video frame --at last` test");
      return;
    }
    const outPng = path.join(tmpRoot, "last.png");
    const r = spawnSync(
      "bun",
      [
        "run", CLI,
        "video", "frame", videoPath,
        "--at", "last",
        "--out", outPng,
      ],
      { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
    );
    expect(r.status).toBe(0);
    expect(fs.existsSync(outPng)).toBe(true);
    const { width, height } = probePngSize(outPng);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  }, 30_000);

  test("missing --out without --project errors out cleanly", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping `video frame` no-out error test");
      return;
    }
    const r = spawnSync(
      "bun",
      [
        "run", CLI,
        "video", "frame", videoPath,
        "--at", "0.5",
      ],
      { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/--out|--project/);
  }, 15_000);
});

describe("ralphy video extend --dry-run (#012)", () => {
  test("extracts the anchor + plans the extension without submitting", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping `video extend --dry-run` test");
      return;
    }
    // Scaffold a project under <tmpRoot>/workspace/projects/<id>/ to match the
    // `--cwd <tmpRoot>` env scoping used by the rest of the integration suite.
    const projectId = "extend-012-test";
    const projectDir = path.join(tmpRoot, "workspace", "projects", projectId);
    fs.mkdirSync(path.join(projectDir, "refs"), { recursive: true });

    // Move the fixture into the project so the resolution is unambiguous.
    const projClip = path.join(projectDir, "scene-01.mp4");
    fs.copyFileSync(videoPath, projClip);

    const r = spawnSync(
      "bun",
      [
        "run", CLI, "--cwd", tmpRoot,
        "video", "extend", projClip,
        "--project", projectId,
        "--slot", "scene-02",
        "--prompt", "continue the motion",
        "--duration", "5",
        "--dry-run",
      ],
      {
        cwd: tmpRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: tmpRoot,
          RALPHY_HOME: tmpRoot,
          NO_COLOR: "1",
        },
      },
    );
    expect(r.status).toBe(0);

    // Anchor PNG landed under the project's refs/.
    const anchor = path.join(projectDir, "refs", "scene-01-last-frame.png");
    expect(fs.existsSync(anchor)).toBe(true);

    // dry-run output announces the extends lineage + tags itself.
    const stdout = r.stdout ?? "";
    expect(stdout).toContain("\"dryRun\": true");
    expect(stdout).toContain("\"extends\"");
    expect(stdout).toContain("scene-01.mp4");
  }, 60_000);
});
