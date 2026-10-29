// `ralphy matte` end to end (issue #560).
//
// `matte key` needs only ffmpeg: a synthetic clip (a skin-coloured box moving
// over a flat chroma green) gives exact expectations: the box is opaque, the
// screen is transparent, and a second run writes `.v2` instead of
// overwriting. `matte subject` needs the local engine (`ralphy matte setup`)
// and its live case skips when the engine is not installed; argument
// validation and the missing-engine error always run. Provider keys are
// stripped from the child environment: matting must not need them.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { matteEngineStatus } from "../../cli/lib/matte/engine.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROVIDER_KEYS = ["OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "FAL_KEY", "FIRECRAWL_API_KEY", "APIFY_TOKEN"];

let tmp: string;
let green: string;
let still: string;
let plain: string;

function ffmpegOk(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}
const haveFfmpeg = ffmpegOk();
const engineReady = haveFfmpeg && matteEngineStatus().installed && matteEngineStatus().models.rvm;

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const k of PROVIDER_KEYS) delete env[k];
  return env;
}

function ralphy(args: string[], extra: Record<string, string> = {}) {
  // --cwd pins the root: without it the CLI falls back to the user's linked project.
  const r = spawnSync("bun", ["run", CLI, "--json", "--cwd", tmp, ...args], { cwd: tmp, encoding: "utf8", env: childEnv(extra), timeout: 240_000 });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function json(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

/** RGBA pixel of frame 0 at (x, y), decoding VP9 with libvpx so alpha survives. */
function pixel(file: string, x: number, y: number): number[] {
  const dec = file.endsWith(".webm") ? ["-c:v", "libvpx-vp9"] : [];
  const r = spawnSync("ffmpeg", ["-v", "error", ...dec, "-i", file, "-frames:v", "1", "-vf", `format=rgba,crop=1:1:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
  return [...r.stdout];
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-matte-"));
  green = path.join(tmp, "greenscreen.mp4");
  still = path.join(tmp, "character.png");
  plain = path.join(tmp, "plain.mp4");
  if (!haveFfmpeg) return;
  const run = (args: string[]) => {
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
    if (r.status !== 0) throw new Error(`fixture build failed: ${r.stderr}`);
  };
  // 320x480 chroma green with a 120x200 skin-coloured box moving right.
  run([
    "-f", "lavfi", "-i", "color=c=0x02af3a:s=320x480:r=30:d=1",
    "-f", "lavfi", "-i", "color=c=0xd2a08c:s=120x200:r=30:d=1",
    "-filter_complex", "[0][1]overlay=x='60+t*40':y=140:shortest=1,format=yuv420p",
    "-t", "1", "-c:v", "libx264", "-crf", "12", green,
  ]);
  run(["-f", "lavfi", "-i", "color=c=0x02af3a:s=200x300", "-f", "lavfi", "-i", "color=c=0xd2a08c:s=80x120",
    "-filter_complex", "[0][1]overlay=60:90", "-frames:v", "1", still]);
  run(["-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", plain]);
});

afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("ralphy matte argument validation (#560)", () => {
  test("missing input is E_FILE_UNREADABLE", () => {
    const r = ralphy(["matte", "key", path.join(tmp, "nope.mp4")]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("E_FILE_UNREADABLE");
  });

  test("unknown --despill, --screen, --format and --model are E_FLAG_UNKNOWN", () => {
    for (const args of [
      ["matte", "key", green, "--despill", "hard"],
      ["matte", "key", green, "--screen", "red"],
      ["matte", "key", green, "--format", "mp4"],
      ["matte", "subject", green, "--model", "sam"],
    ]) {
      const r = ralphy(args);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("E_FLAG_UNKNOWN");
    }
  });

  test("bad numbers and contradictory outputs are E_INPUT_INVALID", () => {
    for (const args of [
      ["matte", "key", green, "--low", "90", "--high", "40"],
      ["matte", "key", green, "--low", "-1"],
      ["matte", "key", green, "--choke", "20"],
      ["matte", "key", green, "--soften", "abc"],
      ["matte", "key", green, "--out", path.join(tmp, "x.mp4")],
      ["matte", "key", green, "--out", path.join(tmp, "x.png")],
      ["matte", "key", still, "--format", "webm"],
      ["matte", "key", green, "--format", "mov", "--out", path.join(tmp, "x.webm")],
      ["matte", "subject", green, "--model", "birefnet", "--downsample", "0.5"],
    ]) {
      const r = ralphy(args);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("E_INPUT_INVALID");
    }
  });

  test("subject without the engine fails with E_DEP_MISSING and points at `ralphy matte setup`", () => {
    const r = ralphy(["matte", "subject", green], { RALPHY_HOME: path.join(tmp, "empty-home"), RALPHY_MATTE_PYTHON: "" });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("E_DEP_MISSING");
    expect(r.stderr).toContain("ralphy matte setup");
  });

  test.skipIf(!haveFfmpeg)("footage without a chroma screen is refused with a pointer to `matte subject`", () => {
    const r = ralphy(["matte", "key", plain]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("E_INPUT_INVALID");
    expect(r.stderr).toContain("matte subject");
  });
});

describe.skipIf(!haveFfmpeg)("ralphy matte key (#560)", () => {
  test("keys the screen to alpha, keeps the subject, despills, and never overwrites", () => {
    const first = ralphy(["matte", "key", green]);
    expect(first.code).toBe(0);
    const a = json(first.stdout);
    expect(a.out).toBe(path.join(tmp, "greenscreen.matte-key.webm"));
    expect(a.versioned).toBe(false);
    expect(a.screen).toBe("green");
    expect(a.providerCalls).toBe(0);
    expect(a.frames).toBe(30);
    const out = a.out as string;
    // Screen corner: transparent. Box centre at t=0 (x 60..180, y 140..340): opaque, not green.
    expect(pixel(out, 5, 5)[3]).toBeLessThan(10);
    const inside = pixel(out, 120, 240);
    expect(inside[3]).toBeGreaterThan(245);
    expect(inside[1]!).toBeLessThanOrEqual(Math.max(inside[0]!, inside[2]!) + 6);

    const before = fs.statSync(out).mtimeMs;
    const second = ralphy(["matte", "key", green, "--despill", "avg", "--format", "mov"]);
    expect(second.code).toBe(0);
    expect(json(second.stdout).out).toBe(path.join(tmp, "greenscreen.matte-key.mov"));
    const third = ralphy(["matte", "key", green]);
    expect(third.code).toBe(0);
    const c = json(third.stdout);
    expect(c.out).toBe(path.join(tmp, "greenscreen.matte-key.v2.webm"));
    expect(c.versioned).toBe(true);
    expect(fs.statSync(out).mtimeMs).toBe(before);
  });

  test("a still in gives a PNG cutout", () => {
    const r = ralphy(["matte", "key", still]);
    expect(r.code).toBe(0);
    const o = json(r.stdout);
    expect(o.format).toBe("png");
    expect(pixel(o.out as string, 2, 2)[3]).toBe(0);
    expect(pixel(o.out as string, 100, 150)[3]).toBe(255);
  });
});

describe.skipIf(!engineReady)("ralphy matte subject (#560, local engine)", () => {
  test("writes alpha video with zero provider calls and versions on rerun", () => {
    const first = ralphy(["matte", "subject", plain]);
    expect(first.code).toBe(0);
    const a = json(first.stdout);
    expect(a.model).toBe("rvm");
    expect(a.providerCalls).toBe(0);
    expect(a.frames).toBe(30);
    expect(fs.existsSync(a.out as string)).toBe(true);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream_tags=alpha_mode", "-of", "csv=p=0", a.out as string], { encoding: "utf8" });
    expect(probe.stdout.trim()).toBe("1");
    const second = ralphy(["matte", "subject", plain]);
    expect(second.code).toBe(0);
    expect(json(second.stdout).out).toBe(path.join(tmp, "plain.matte-subject.v2.webm"));
  });
});
