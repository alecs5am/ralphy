// #073 — `ralphy render` auto-emits a compressed social sibling deliverable.
//
// Real render needs ffmpeg + puppeteer, so we assert the DRY-RUN plan only:
// the social pass is default-on, --no-compress drops it, and --social-crf
// flows through to the planned stage. All spawns are --dry-run (no engine run,
// no network, no daemon).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

function ralphy(args: string[]): { exitCode: number; stdout: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* non-JSON output is fine for error cases */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, json };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-render-social-"));
  const projDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "social-001");
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(path.join(projDir, "BRIEF.md"), "fixture project for the social-compress test\n");
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("render --dry-run social compress (#073)", () => {
  test("default-on: includes ffmpeg-compress-social stage + final-social.mp4 in would_write", () => {
    const r = ralphy(["render", "social-001", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as {
      would_call: Array<{ stage: string; crf?: number }>;
      would_write: string[];
    };
    const social = j.would_call.find((s) => s.stage === "ffmpeg-compress-social");
    expect(social).toBeTruthy();
    expect(social!.crf).toBe(20); // default CRF
    expect(j.would_write.some((p) => p.endsWith("final-social.mp4"))).toBe(true);
  });

  test("--no-compress omits the social stage and the social file", () => {
    const r = ralphy(["render", "social-001", "--dry-run", "--no-compress"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as {
      would_call: Array<{ stage: string }>;
      would_write: string[];
    };
    expect(j.would_call.some((s) => s.stage === "ffmpeg-compress-social")).toBe(false);
    expect(j.would_write.some((p) => p.includes("final-social.mp4"))).toBe(false);
  });

  test("--social-crf 18 shows crf 18 on the social stage", () => {
    const r = ralphy(["render", "social-001", "--dry-run", "--social-crf", "18"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { would_call: Array<{ stage: string; crf?: number }> };
    const social = j.would_call.find((s) => s.stage === "ffmpeg-compress-social");
    expect(social).toBeTruthy();
    expect(social!.crf).toBe(18);
  });

  test("--summary rollup carries the social stage with its crf", () => {
    const r = ralphy(["render", "social-001", "--dry-run", "--summary", "--social-crf", "22"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { stages: Record<string, { count: number; crf?: number }> };
    expect(j.stages["ffmpeg-compress-social"]).toBeTruthy();
    expect(j.stages["ffmpeg-compress-social"]!.crf).toBe(22);
  });
});
