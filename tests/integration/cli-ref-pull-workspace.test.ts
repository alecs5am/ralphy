// Integration test for #401 — `ralphy ref pull` stores the slug dir inside the
// ACTIVE workspace's shared tier (`.ralphy/workspaces/<ws>/shared/refs/<slug>/`)
// when a non-default workspace is active, in the global tree otherwise, and the
// `--global` flag forces global regardless. Read verbs (here `ref paths`)
// resolve workspace-local before a same-slug global entry.
//
// No live network — every pull uses `--local <mp4>` against a tiny ffmpeg-built
// fixture so the import copies a real (sub-3KB) mp4 and the audio-extract step
// succeeds offline.

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { spawnCli, type CliResult } from "../helpers/spawn-cli.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;
let fixtureMp4: string;
let fixtureDir: string;

// A single tiny mp4 fixture shared by every test (silent black 64x64, ~0.5s).
beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ref-ws-fixture-"));
  fixtureMp4 = path.join(fixtureDir, "tiny.mp4");
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.5",
      "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono",
      "-shortest", "-t", "0.5", "-pix_fmt", "yuv420p",
      fixtureMp4,
    ],
    { stdio: "ignore" },
  );
  if (r.status !== 0 || !fs.existsSync(fixtureMp4)) {
    throw new Error("failed to build tiny mp4 fixture (ffmpeg required)");
  }
});

afterAll(() => {
  try {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function ralphy(args: string[]): Promise<CliResult> {
  return spawnCli([CLI, "--cwd", tmpRoot, ...args], { cwd: tmpRoot, timeoutMs: 30_000 });
}

/** Seed a `.ralphy/` root. When `activeWorkspace` is given, also create that
 * workspace dir and point config.json at it. */
function seedRoot(activeWorkspace?: string) {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ref-ws-"));
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
  const registry = {
    projects: {}, refs: {}, brands: {}, personas: {}, templates: {}, batches: {},
  };
  fs.writeFileSync(
    path.join(tmpRoot, ".ralphy", "registry.json"),
    JSON.stringify(registry, null, 2),
  );
  if (activeWorkspace) {
    fs.mkdirSync(
      path.join(tmpRoot, ".ralphy", "workspaces", activeWorkspace, "shared"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(tmpRoot, ".ralphy", "config.json"),
      JSON.stringify({ activeWorkspace }, null, 2),
    );
  }
}

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("`ralphy ref pull` workspace-local storage (#401)", () => {
  test("non-default active workspace → slug lands in shared/refs/, NOT global", async () => {
    seedRoot("trafalgar");
    const r = await ralphy([
      "ref", "pull", "https://example.com/clip", "--local", fixtureMp4, "--slug", "reel-001",
    ]);
    if (r.exitCode !== 0) {
      console.error("stderr:", r.stderr);
      console.error("stdout:", r.stdout);
    }
    expect(r.exitCode).toBe(0);

    const wsDir = path.join(tmpRoot, ".ralphy", "workspaces", "trafalgar", "shared", "refs", "reel-001");
    const globalDir = path.join(tmpRoot, ".ralphy", "references", "reel-001");
    expect(fs.existsSync(path.join(wsDir, "source.mp4"))).toBe(true);
    expect(fs.existsSync(globalDir)).toBe(false);
    // The CLI reports the workspace-local dir.
    expect(r.json.dir).toBe(wsDir);
  });

  test("--global forces the global tree even with a non-default workspace active", async () => {
    seedRoot("trafalgar");
    const r = await ralphy([
      "ref", "pull", "https://example.com/clip", "--local", fixtureMp4, "--slug", "reel-002", "--global",
    ]);
    expect(r.exitCode).toBe(0);

    const wsDir = path.join(tmpRoot, ".ralphy", "workspaces", "trafalgar", "shared", "refs", "reel-002");
    const globalDir = path.join(tmpRoot, ".ralphy", "references", "reel-002");
    expect(fs.existsSync(path.join(globalDir, "source.mp4"))).toBe(true);
    expect(fs.existsSync(wsDir)).toBe(false);
    expect(r.json.dir).toBe(globalDir);
  });

  test("DEFAULT workspace (no explicit active) → slug stays global (back-compat)", async () => {
    seedRoot(); // no config.json → currentWorkspace() === "default"
    const r = await ralphy([
      "ref", "pull", "https://example.com/clip", "--local", fixtureMp4, "--slug", "reel-003",
    ]);
    expect(r.exitCode).toBe(0);

    const globalDir = path.join(tmpRoot, ".ralphy", "references", "reel-003");
    expect(fs.existsSync(path.join(globalDir, "source.mp4"))).toBe(true);
    expect(r.json.dir).toBe(globalDir);
  });

  test("read resolution: workspace-local shadows a same-slug global entry", async () => {
    // First, write a GLOBAL ref of slug `shared-slug` (default workspace).
    seedRoot();
    const g = await ralphy([
      "ref", "pull", "https://example.com/clip", "--local", fixtureMp4, "--slug", "shared-slug",
    ]);
    expect(g.exitCode).toBe(0);
    const globalDir = path.join(tmpRoot, ".ralphy", "references", "shared-slug");
    expect(fs.existsSync(path.join(globalDir, "source.mp4"))).toBe(true);

    // Now switch the SAME root to a non-default workspace and pull the same slug.
    fs.mkdirSync(
      path.join(tmpRoot, ".ralphy", "workspaces", "trafalgar", "shared"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(tmpRoot, ".ralphy", "config.json"),
      JSON.stringify({ activeWorkspace: "trafalgar" }, null, 2),
    );
    const w = await ralphy([
      "ref", "pull", "https://example.com/clip", "--local", fixtureMp4, "--slug", "shared-slug",
    ]);
    expect(w.exitCode).toBe(0);
    const wsDir = path.join(tmpRoot, ".ralphy", "workspaces", "trafalgar", "shared", "refs", "shared-slug");
    expect(fs.existsSync(path.join(wsDir, "source.mp4"))).toBe(true);

    // Read verb (`ref paths`) with the non-default workspace active resolves to
    // the workspace-local dir, shadowing the global one.
    const p = await ralphy(["ref", "paths", "shared-slug"]);
    expect(p.exitCode).toBe(0);
    expect(p.json.dir).toBe(wsDir);

    // `--global` on the read verb forces the global entry.
    const pg = await ralphy(["ref", "paths", "shared-slug", "--global"]);
    expect(pg.exitCode).toBe(0);
    expect(pg.json.dir).toBe(globalDir);
  });

  test("read resolution: a global-only slug still resolves under a non-default workspace", async () => {
    seedRoot();
    const g = await ralphy([
      "ref", "pull", "https://example.com/clip", "--local", fixtureMp4, "--slug", "global-only",
    ]);
    expect(g.exitCode).toBe(0);
    const globalDir = path.join(tmpRoot, ".ralphy", "references", "global-only");

    // Switch to a non-default workspace that has NO local copy of this slug.
    fs.mkdirSync(
      path.join(tmpRoot, ".ralphy", "workspaces", "trafalgar", "shared"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(tmpRoot, ".ralphy", "config.json"),
      JSON.stringify({ activeWorkspace: "trafalgar" }, null, 2),
    );
    // Read resolution falls back to global since no workspace-local exists.
    const p = await ralphy(["ref", "paths", "global-only"]);
    expect(p.exitCode).toBe(0);
    expect(p.json.dir).toBe(globalDir);
  });
});
