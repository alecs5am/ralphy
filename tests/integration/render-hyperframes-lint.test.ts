// Integration test for the pre-render HyperFrames lint (#047).
//
// `ralphy render <id>` invokes `cli/lib/render/hyperframes-lint.ts` BEFORE
// shelling out to upstream `hyperframes render`. We assert the lint:
//   - blocks the render when `<video>` carries timing attrs on a wrapper div,
//   - blocks when the `<video>` itself is missing `id` / `data-start`,
//   - lets the render proceed (and surfaces a warning on stderr) when the
//     many-short-same-track heuristic fires,
//   - respects the `data-allow-short-stack="true"` override.
//
// We never actually run upstream HyperFrames (no bun executable for the
// upstream tool is required in CI). For the error cases we assert non-zero
// exit + stderr signal; for the warning cases we assert the warning lands
// on stderr regardless of whether upstream render is reachable.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;
let projectDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-hf-lint-"));
  fs.mkdirSync(path.join(tmp, ".ralphy"), { recursive: true });
  projectDir = path.join(tmp, ".ralphy", "workspaces", "default", "projects", "lint-001");
  fs.mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function writeIndex(html: string): void {
  fs.writeFileSync(path.join(projectDir, "index.html"), html);
}

function render(): { exitCode: number; stderr: string; stdout: string } {
  // Stub `bunx` (the upstream hyperframes shellout) with a no-op that exits 0
  // so warning-only tests don't hang on a real `bunx hyperframes` download.
  // The lint runs BEFORE the shellout — error cases exit before this stub is
  // ever reached.
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const stub = path.join(binDir, "bunx");
  fs.writeFileSync(stub, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(stub, 0o755);

  const r = spawnSync("bun", ["run", CLI, "--cwd", tmp, "render", "lint-001"], {
    cwd: tmp,
    encoding: "utf8",
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
    timeout: 20_000,
  });
  return { exitCode: r.status ?? -1, stderr: r.stderr, stdout: r.stdout };
}

describe("ralphy render — pre-render HyperFrames lint (#047)", () => {
  test("BLOCKS when <video> has timing attrs on a wrapper div", () => {
    writeIndex(`
      <!doctype html><html><body>
      <div data-composition-id="root" data-width="1920" data-height="1080">
        <div data-start="0" data-track-index="0" data-duration="6">
          <video src="clip.mp4" muted playsinline></video>
        </div>
      </div>
      </body></html>
    `);
    const r = render();
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/media_attrs_on_wrapper/);
  });

  test("BLOCKS when <video> is missing id and data-start", () => {
    writeIndex(`
      <!doctype html><html><body>
      <div data-composition-id="root" data-width="1920" data-height="1080">
        <video data-track-index="0" src="clip.mp4" muted playsinline></video>
      </div>
      </body></html>
    `);
    const r = render();
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/media_missing_(id|data_start)/);
  });

  test("WARNS but does not block on many-short-same-track montage; concat suggestion lands on stderr", () => {
    const clips = Array.from(
      { length: 6 },
      (_, i) =>
        `<video id="el-${i}" data-start="${i * 2}" data-duration="2" data-track-index="0" src="c${i}.mp4" muted playsinline></video>`,
    ).join("\n");
    writeIndex(`
      <!doctype html><html><body>
      <div data-composition-id="root" data-width="1920" data-height="1080">
        ${clips}
      </div>
      </body></html>
    `);
    const r = render();
    // The lint passes (warning only), so the CLI proceeds to upstream
    // hyperframes render — which may itself fail in this test env. We only
    // assert the warning text reached stderr; upstream exit code is not the
    // contract of this test.
    expect(r.stderr).toMatch(/many_short_same_track_video/);
    expect(r.stderr).toMatch(/concat/i);
  });

  test("data-allow-short-stack='true' suppresses the short-stack warning", () => {
    const clips = Array.from(
      { length: 6 },
      (_, i) =>
        `<video id="el-${i}" data-start="${i * 2}" data-duration="2" data-track-index="0" data-allow-short-stack="true" src="c${i}.mp4" muted playsinline></video>`,
    ).join("\n");
    writeIndex(`
      <!doctype html><html><body>
      <div data-composition-id="root" data-width="1920" data-height="1080">
        ${clips}
      </div>
      </body></html>
    `);
    const r = render();
    expect(r.stderr).not.toMatch(/many_short_same_track_video/);
  });
});
