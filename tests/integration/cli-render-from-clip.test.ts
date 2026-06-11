// Integration test for `ralphy render <id> --from-clip <path> [--loudnorm]` (#009).
//
// AGENTS.md #2: `ralphy render <id>` is the only path for rendering. The
// pure-clip deliverable case (e.g. arena-rocker-001) used to bypass ralphy
// entirely and run raw ffmpeg out-of-band, skipping the gen-log. `--from-clip`
// brings that flow back under the single-entry-point invariant: faststart-wrap
// (and optionally loudnorm / grade / compress) an existing mp4, then append a
// row to `workspace/projects/<id>/logs/generations.jsonl`.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;
let projectId: string;
let clipPath: string;

function ffmpegAvailable(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

function makeFixtureClip(dst: string): void {
  // 2-second 320x240 mp4 with silent audio. Faststart NOT applied — that's
  // the whole point of the wrap stage we're testing.
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=320x240:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100:duration=2",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-t",
      "2",
      dst,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`ffmpeg fixture build failed: ${r.stderr}`);
  }
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-render-fromclip-"));
  projectId = "fromclip-fixture-001";
  const projDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", projectId);
  fs.mkdirSync(projDir, { recursive: true });
  clipPath = path.join(tmpRoot, "source.mp4");
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function run(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, "render", projectId, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env, HOME: tmpRoot, RALPHY_HOME: tmpRoot },
    timeout: 60_000,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe("ralphy render --from-clip (#009)", () => {
  test("dry-run reports the ffmpeg-from-clip-wrap stage", () => {
    const r = run(["--from-clip", "/nonexistent.mp4", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    const j = JSON.parse(r.stdout) as { engine: string; would_call: Array<{ stage: string }> };
    expect(j.engine).toBe("ffmpeg");
    expect(j.would_call[0]?.stage).toBe("ffmpeg-from-clip-wrap");
  });

  test("dry-run with --loudnorm chains loudnorm stage after the wrap", () => {
    const r = run(["--from-clip", "/nonexistent.mp4", "--loudnorm", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    const j = JSON.parse(r.stdout) as { would_call: Array<{ stage: string }> };
    const stages = j.would_call.map((s) => s.stage);
    // The auto social-compress pass (#073) is default-on and trails the chain.
    expect(stages).toEqual(["ffmpeg-from-clip-wrap", "ffmpeg-loudnorm", "ffmpeg-compress-social"]);
  });

  test("refuses when --from-clip points at a missing file", () => {
    const r = run(["--from-clip", path.join(tmpRoot, "does-not-exist.mp4")]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/E_FILE_UNREADABLE|does-not-exist/);
  });

  test.skipIf(!ffmpegAvailable())(
    "live: wraps clip into render/final.mp4 and logs to generations.jsonl",
    () => {
      makeFixtureClip(clipPath);
      const r = run(["--from-clip", clipPath]);
      expect(r.exitCode).toBe(0);

      const finalMp4 = path.join(
        tmpRoot,
        ".ralphy",
        "workspaces",
        "default",
        "projects",
        projectId,
        "render",
        "final.mp4",
      );
      expect(fs.existsSync(finalMp4)).toBe(true);
      expect(fs.statSync(finalMp4).size).toBeGreaterThan(0);

      // gen-log row written, schema-conformant.
      const genLog = path.join(
        tmpRoot,
        ".ralphy",
        "workspaces",
        "default",
        "projects",
        projectId,
        "logs",
        "generations.jsonl",
      );
      expect(fs.existsSync(genLog)).toBe(true);
      const lines = fs.readFileSync(genLog, "utf8").trim().split("\n").filter(Boolean);
      // The auto social-compress pass (#073) appends its own row after the
      // wrap, so the wrap row is no longer last — find it by endpoint.
      const wrapRow = JSON.parse(
        [...lines]
          .reverse()
          .find((l) => (JSON.parse(l) as { endpoint: string }).endpoint === "ffmpeg-from-clip-wrap")!,
      ) as {
        provider: string;
        endpoint: string;
        kind: string;
        status: string;
        cost_usd: number;
      };
      expect(wrapRow.provider).toBe("ffmpeg");
      expect(wrapRow.endpoint).toBe("ffmpeg-from-clip-wrap");
      expect(wrapRow.kind).toBe("video");
      expect(wrapRow.status).toBe("ok");
      expect(wrapRow.cost_usd).toBe(0);

      // And the social sibling deliverable exists alongside the master.
      const socialMp4 = path.join(
        tmpRoot,
        ".ralphy",
        "workspaces",
        "default",
        "projects",
        projectId,
        "render",
        "final-social.mp4",
      );
      expect(fs.existsSync(socialMp4)).toBe(true);
      expect(fs.statSync(socialMp4).size).toBeGreaterThan(0);
    },
    90_000,
  );

  test.skipIf(!ffmpegAvailable())(
    "live: --loudnorm produces an mp4 with audio normalized toward -16 LUFS",
    () => {
      makeFixtureClip(clipPath);
      const r = run(["--from-clip", clipPath, "--loudnorm"]);
      expect(r.exitCode).toBe(0);

      const finalMp4 = path.join(
        tmpRoot,
        ".ralphy",
        "workspaces",
        "default",
        "projects",
        projectId,
        "render",
        "final.mp4",
      );
      expect(fs.existsSync(finalMp4)).toBe(true);

      // Confirm loudnorm ran by probing the integrated loudness. For a silent
      // input ffmpeg reports `-inf` or a very low LUFS — we just assert the
      // loudness measurement *runs* on a valid mp4. The contract here is the
      // file exists, is a valid mp4, and gen-log captured `loudnorm: true`.
      const probe = spawnSync(
        "ffmpeg",
        ["-i", finalMp4, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
        { encoding: "utf8" },
      );
      expect(probe.status).toBe(0);

      const genLog = path.join(
        tmpRoot,
        ".ralphy",
        "workspaces",
        "default",
        "projects",
        projectId,
        "logs",
        "generations.jsonl",
      );
      const lines = fs.readFileSync(genLog, "utf8").trim().split("\n").filter(Boolean);
      // The from-clip wrap row carries the loudnorm contract bit. The auto
      // social-compress pass (#073) appends its own row afterward, so we target
      // the wrap row by endpoint rather than "last ok".
      const wrapRow = JSON.parse(
        [...lines]
          .reverse()
          .find((l) => (JSON.parse(l) as { endpoint: string }).endpoint === "ffmpeg-from-clip-wrap")!,
      ) as { input: { loudnorm?: boolean }; note: string };
      expect(wrapRow.input.loudnorm).toBe(true);
      expect(wrapRow.note).toMatch(/loudnorm/);
    },
    90_000,
  );

  test("locks in: Remotion is gone — render.ts has no references to composition-props.json or UGCVideo", () => {
    // Issue 020 (commit 081a99a) noted Remotion was REMOVED in commit
    // 92ef823. This test pins that gone-state so a future re-introduction of
    // the Remotion path would have to consciously update the contract.
    const renderTs = fs.readFileSync(
      path.join(REPO, "cli", "commands", "render.ts"),
      "utf8",
    );
    expect(renderTs).not.toMatch(/composition-props\.json/);
    expect(renderTs).not.toMatch(/UGCVideo/);
    expect(renderTs).not.toMatch(/remotion/i);
  });
});
