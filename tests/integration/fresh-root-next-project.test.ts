// Fresh-root render must not hide the next Project (#589).
//
// Found in #559: on a fresh data root holding only Project trees (no
// `ralphy.db`), `ralphy render <A>` ran the legacy render path, and its
// advisory post-render next step (`renderNextStep` -> `evaluateContract`)
// opened the ambient domain store, which CREATES and migrates `ralphy.db`.
// From then on the root was a store root without a single user Project, so
// every Project-scoped command (`render <B>`, even `render <A>` again) failed
// in scope resolution with "Project not found". The step-0 status call (bare
// `ralphy`) did the same through its memory digest.
//
// The Projects here are created the way the #559 demo builder and the
// render-from-clip fixture create them: a Project tree under the default
// Workspace. HOME is isolated so no global link or profile leaks in.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-fresh-root-589-")));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function ffmpegAvailable(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, "--json", ...args], {
    cwd: tmp,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: tmp,
      RALPHY_PROJECT_DIR: "",
      RALPHY_SKIP_LEGACY_HINT: "1",
      NO_COLOR: "1",
    },
    timeout: 60_000,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function projectTree(id: string): string {
  return path.join(tmp, ".ralphy", "workspaces", "default", "projects", id);
}

/** Create a Project tree, as the #559 demo builder does. */
function createProjectTree(id: string): string {
  const dir = projectTree(id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storePath(): string {
  return path.join(tmp, ".ralphy", "ralphy.db");
}

function makeClip(dst: string): void {
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=blue:s=160x120:d=1",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1",
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "1",
      dst,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg fixture build failed: ${r.stderr}`);
}

function summary(stdout: string): { project: string; path: string; next?: { phase: string } } {
  const lines = stdout.trim().split("\n").filter(Boolean);
  return JSON.parse(lines.at(-1)!);
}

describe("fresh root: a render does not hide the next Project (#589)", () => {
  test.skipIf(!ffmpegAvailable())(
    "create A, render A, create B, render B (and A again)",
    () => {
      const clip = path.join(tmp, "clip.mp4");
      makeClip(clip);

      createProjectTree("alpha-001");
      const first = ralphy(["render", "alpha-001", "--from-clip", clip, "--no-compress"]);
      expect(first.exitCode, first.stderr).toBe(0);
      expect(summary(first.stdout).project).toBe("alpha-001");
      expect(fs.existsSync(path.join(projectTree("alpha-001"), "render", "final.mp4"))).toBe(true);
      // The advisory next step still names the next phase.
      expect(summary(first.stdout).next?.phase).toBe("eval");

      createProjectTree("beta-001");
      const second = ralphy(["render", "beta-001", "--from-clip", clip, "--no-compress"]);
      expect(second.exitCode, second.stderr).toBe(0);
      expect(summary(second.stdout).project).toBe("beta-001");
      expect(fs.existsSync(path.join(projectTree("beta-001"), "render", "final.mp4"))).toBe(true);

      const again = ralphy(["render", "alpha-001", "--dry-run"]);
      expect(again.exitCode, again.stderr).toBe(0);
      // No empty store was initialized over the Project trees.
      expect(fs.existsSync(storePath())).toBe(false);
    },
    120_000,
  );

  test("the step-0 status call leaves Project trees reachable", () => {
    createProjectTree("alpha-001");
    const status = ralphy([]);
    expect(status.exitCode, status.stderr).toBe(0);

    createProjectTree("beta-001");
    for (const id of ["alpha-001", "beta-001"]) {
      const plan = ralphy(["render", id, "--dry-run"]);
      expect(plan.exitCode, plan.stderr).toBe(0);
      expect(JSON.parse(plan.stdout).dryRun).toBe(true);
    }
    expect(fs.existsSync(storePath())).toBe(false);
  });

  test("the step-0 status call still initializes an empty fresh root", () => {
    // A root with no Project trees is a new library: the status call keeps
    // creating the store there, so `ralphy setup` afterwards still accepts it.
    const status = ralphy([]);
    expect(status.exitCode, status.stderr).toBe(0);
    expect(fs.existsSync(storePath())).toBe(true);
  });
});
