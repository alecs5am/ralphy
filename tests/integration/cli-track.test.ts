// `ralphy track` end to end (issue #559).
//
// The ground-truth test builds a synthetic clip with ffmpeg: a textured
// 96x96 patch moving at a known velocity over a flat background, so the
// expected position at every frame is exact. The live cases need the local
// engine (`ralphy track setup`) and skip when it is not installed; the
// missing-engine case always runs. Provider keys are stripped from the child
// environment: tracking must not need them.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { trackEngineStatus } from "../../cli/lib/track/engine.js";
import { TrackDocumentSchema } from "../../cli/lib/track/schema.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROVIDER_KEYS = ["OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "FAL_KEY", "FIRECRAWL_API_KEY", "APIFY_TOKEN"];

let tmp: string;
let clip: string;

function ffmpegOk(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}
const engineInstalled = ffmpegOk() && trackEngineStatus().installed;

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const k of PROVIDER_KEYS) delete env[k];
  return env;
}

function ralphy(args: string[], extra: Record<string, string> = {}) {
  // --cwd pins the root: without it the CLI falls back to the user's linked
  // project, which this test must not depend on.
  const r = spawnSync("bun", ["run", CLI, "--json", "--cwd", tmp, ...args], { cwd: tmp, encoding: "utf8", env: childEnv(extra), timeout: 180_000 });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

// Patch top-left = (60 + 100 t, 120 + 20 t); centre = (108 + 100 t, 168 + 20 t).
const expectedCenter = (t: number) => [108 + 100 * t, 168 + 20 * t] as const;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-track-"));
  clip = path.join(tmp, "moving-patch.mp4");
  if (!ffmpegOk()) return;
  const patch = path.join(tmp, "patch.png");
  const a = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=96x96:r=1:d=1", "-frames:v", "1", patch]);
  if (a.status !== 0) throw new Error(`patch build failed: ${a.stderr}`);
  const b = spawnSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0x404040:s=640x360:r=30:d=2",
    "-loop", "1", "-i", patch,
    "-filter_complex", "[0][1]overlay=x='60+t*100':y='120+t*20':shortest=1",
    "-t", "2", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", clip,
  ]);
  if (b.status !== 0) throw new Error(`clip build failed: ${b.stderr}`);
});

afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("ralphy track (#559)", () => {
  test("missing engine fails with E_DEP_MISSING and points at `ralphy track setup`", () => {
    if (!fs.existsSync(clip)) fs.writeFileSync(clip, "");
    const r = ralphy(["track", "point", clip, "--at", "0", "--box", "60,120,96,96"], {
      RALPHY_HOME: path.join(tmp, "empty-home"),
      RALPHY_TRACK_PYTHON: "",
    });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("E_DEP_MISSING");
    expect(r.stderr).toContain("ralphy track setup");
  });

  test("bad flags are rejected before the engine runs", () => {
    const r = ralphy(["track", "point", clip, "--at", "0", "--box", "1,2,3"]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("E_INPUT_INVALID");
    const m = ralphy(["track", "planar", clip, "--at", "0", "--box", "1,2,3,4", "--method", "csrt"]);
    expect(m.stderr).toContain("E_FLAG_UNKNOWN");
  });

  test.skipIf(!engineInstalled)("point track follows the patch within 2 px of ground truth", () => {
    const out = path.join(tmp, "patch.point.json");
    const r = ralphy(["track", "point", clip, "--at", "0", "--box", "60,120,96,96", "--out", out, "--js"]);
    expect(r.code).toBe(0);
    const summary = JSON.parse(r.stdout);
    expect(summary).toMatchObject({ kind: "point", method: "klt", out, versioned: false, providerCalls: 0, lost: 0 });
    const doc = TrackDocumentSchema.parse(JSON.parse(fs.readFileSync(out, "utf8")));
    expect(doc.engine.providerCalls).toBe(0);
    for (const k of doc.keyframes.filter((_, i) => i % 10 === 0)) {
      const [ex, ey] = expectedCenter(k.t);
      expect(Math.abs(k.x - ex)).toBeLessThan(2);
      expect(Math.abs(k.y - ey)).toBeLessThan(2);
    }
    expect(fs.readFileSync(summary.loader, "utf8")).toContain('window.__tracks = window.__tracks || {})["patch.point"]');

    // Append-only: a second run never overwrites, it versions.
    const again = JSON.parse(ralphy(["track", "point", clip, "--at", "0", "--box", "60,120,96,96", "--out", out]).stdout);
    expect(again.out).toBe(path.join(tmp, "patch.point.v2.json"));
    expect(again.versioned).toBe(true);
  });

  test.skipIf(!engineInstalled)("planar track corner-pins the patch within 2 px per corner", () => {
    const out = path.join(tmp, "patch.planar.json");
    const r = ralphy(["track", "planar", clip, "--at", "0.5", "--to", "1.5", "--box", "110,130,96,96", "--out", out]);
    expect(r.code).toBe(0);
    const doc = TrackDocumentSchema.parse(JSON.parse(fs.readFileSync(out, "utf8")));
    expect(doc.kind).toBe("planar");
    expect(doc.keyframes[0]!.t).toBeCloseTo(0.5, 6);
    expect(doc.keyframes.at(-1)!.t).toBeCloseTo(1.5, 6);
    for (const k of doc.keyframes) {
      const x0 = 60 + 100 * k.t;
      const y0 = 120 + 20 * k.t;
      const truth = [[x0, y0], [x0 + 96, y0], [x0 + 96, y0 + 96], [x0, y0 + 96]];
      k.corners!.forEach((c, i) => {
        expect(Math.abs(c[0] - truth[i]![0]!)).toBeLessThan(2);
        expect(Math.abs(c[1] - truth[i]![1]!)).toBeLessThan(2);
      });
    }
  });
});
