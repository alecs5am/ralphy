// Integration: `ralphy hyperframes <verb>` namespace (#028).
//
// Covers:
//   - `ralphy hyperframes lint`        exits 1 when the wrapper-on-video pattern fires.
//   - `ralphy hyperframes render --require-snapshot-review` refuses when snapshots are stale.

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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-hf-ns-"));
  fs.mkdirSync(path.join(tmp, ".ralphy"), { recursive: true });
  projectDir = path.join(tmp, ".ralphy", "workspaces", "default", "projects", "hf-001");
  fs.mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function run(args: string[]): { exitCode: number; stderr: string; stdout: string } {
  // Stub `bunx` so we don't fan out to a real `bunx hyperframes` download
  // during integration testing. The verbs we exercise here either don't
  // shell out (lint, save-version) or are intercepted by the staleness gate
  // BEFORE the spawn (`render --require-snapshot-review`).
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const stub = path.join(binDir, "bunx");
  fs.writeFileSync(stub, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(stub, 0o755);

  const r = spawnSync("bun", ["run", CLI, "--cwd", tmp, ...args], {
    cwd: tmp,
    encoding: "utf8",
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
    timeout: 30_000,
  });
  return { exitCode: r.status ?? -1, stderr: r.stderr, stdout: r.stdout };
}

describe("ralphy hyperframes lint", () => {
  test("returns exit 1 when the wrapper-on-video pattern fires", () => {
    fs.writeFileSync(
      path.join(projectDir, "index.html"),
      `<!doctype html><html><body>
        <div data-composition-id="root" data-width="1920" data-height="1080">
          <div data-start="0" data-track-index="0" data-duration="6">
            <video src="clip.mp4" muted playsinline></video>
          </div>
        </div>
      </body></html>`,
    );

    const r = run(["hyperframes", "lint", "hf-001"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/media_attrs_on_wrapper/);
  });

  test("returns exit 0 on a clean composition (no <video> at all)", () => {
    fs.writeFileSync(
      path.join(projectDir, "index.html"),
      `<!doctype html><html><body>
        <div data-composition-id="root" data-width="1920" data-height="1080"></div>
      </body></html>`,
    );

    const r = run(["hyperframes", "lint", "hf-001"]);
    expect(r.exitCode).toBe(0);
  });
});

describe("ralphy hyperframes render --require-snapshot-review", () => {
  test("refuses when compositions/snapshots/ is missing", () => {
    fs.writeFileSync(
      path.join(projectDir, "index.html"),
      `<!doctype html><html><body>
        <div data-composition-id="root" data-width="1920" data-height="1080"></div>
      </body></html>`,
    );

    const r = run(["hyperframes", "render", "hf-001", "--require-snapshot-review"]);
    expect(r.exitCode).not.toBe(0);
    expect(`${r.stderr}\n${r.stdout}`).toMatch(/snapshot/i);
  });

  test("refuses when snapshots/ is older than index.html", () => {
    const snapshotsDir = path.join(projectDir, "compositions", "snapshots");
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const oldSnap = path.join(snapshotsDir, "scene-01.png");
    fs.writeFileSync(oldSnap, "old");
    // Backdate the snapshot two minutes; index.html will be brand-new.
    const past = (Date.now() - 120_000) / 1000;
    fs.utimesSync(oldSnap, past, past);

    fs.writeFileSync(
      path.join(projectDir, "index.html"),
      `<!doctype html><html><body><div data-composition-id="root"></div></body></html>`,
    );

    const r = run(["hyperframes", "render", "hf-001", "--require-snapshot-review"]);
    expect(r.exitCode).not.toBe(0);
    expect(`${r.stderr}\n${r.stdout}`).toMatch(/snapshot/i);
  });
});

describe("ralphy hyperframes save-version", () => {
  test("deprecates path snapshots without writing compositions/vN.html", () => {
    fs.writeFileSync(path.join(projectDir, "index.html"), "<!doctype html>v1");
    const result = run(["hyperframes", "save-version", "hf-001"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Deprecated: use `ralphy composition revise");
    expect(fs.existsSync(path.join(projectDir, "compositions", "v1.html"))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, "compositions", "v2.html"))).toBe(false);
  });
});
