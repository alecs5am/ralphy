// CLI integration tests for --dry-run coverage on the verbs that gained it
// in 01.02.05: generate image, generate voiceover, generate music, render.
//
// Per acceptance: dry-run output shape is
//   { dryRun: true, would_call: [...], cost_estimate_usd, would_write: [...] }
// and `--summary` collapses `would_call` to a per-stage rollup.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const FIXTURE = path.join(REPO, "tests", "fixtures", "or-catalog.json");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-dry-"));
  fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(tmp, "workspace", ".ralph", "or-catalog.json"));
  const proj = path.join(tmp, "workspace", "projects", "dryrun-001");
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, "BRIEF.md"), "dry-run test project\n");
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; json: unknown } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmp, ...args], { cwd: tmp, encoding: "utf8" });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* ok */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, json };
}

describe("generate image --dry-run", () => {
  test("emits full would_call shape", () => {
    const r = ralphy([
      "generate",
      "image",
      "--project",
      "dryrun-001",
      "--slot",
      "scene-01-bg",
      "--prompt",
      "test",
      "--dry-run",
    ]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { dryRun: boolean; would_call: unknown[]; cost_estimate_usd: number };
    expect(j.dryRun).toBe(true);
    expect(Array.isArray(j.would_call)).toBe(true);
    expect(j.would_call.length).toBe(1);
    expect(j.cost_estimate_usd).toBeGreaterThan(0);
  });
});

describe("generate voiceover --dry-run", () => {
  test("emits cost estimate scaled by character count", () => {
    const r = ralphy([
      "generate",
      "voiceover",
      "--project",
      "dryrun-001",
      "--slot",
      "scene-01-vo",
      "--voice",
      "fake-voice-id",
      "--text",
      "x".repeat(1000),
      "--dry-run",
    ]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { dryRun: boolean; cost_estimate_usd: number };
    expect(j.dryRun).toBe(true);
    // 1000 chars on eleven_multilingual_v2 → ceil(1000/1000) * $0.20 = $0.20
    // (rate sourced from cli/lib/providers/voice-pricing.ts as of #030).
    expect(j.cost_estimate_usd).toBeCloseTo(0.2, 3);
  });
});

describe("generate music --dry-run", () => {
  test("emits cost estimate scaled by duration", () => {
    const r = ralphy([
      "generate",
      "music",
      "--project",
      "dryrun-001",
      "--slot",
      "bed-01",
      "--prompt",
      "synthwave bed",
      "--duration",
      "60",
      "--dry-run",
    ]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { dryRun: boolean; cost_estimate_usd: number };
    expect(j.dryRun).toBe(true);
    expect(j.cost_estimate_usd).toBeCloseTo(0.3, 3);  // 60s * $0.005/s
  });
});

describe("render --dry-run", () => {
  test("emits full plan with would_write (master + auto social cut)", () => {
    const r = ralphy(["render", "dryrun-001", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { dryRun: boolean; would_call: Array<{ stage: string }>; would_write: string[] };
    expect(j.dryRun).toBe(true);
    // Engine render + the default-on social compress pass (#073).
    expect(j.would_call.length).toBe(2);
    expect(j.would_call.map((s) => s.stage)).toContain("ffmpeg-compress-social");
    expect(j.would_write.length).toBe(2);
    expect(j.would_write[0]).toContain("final.mp4");
    expect(j.would_write[1]).toContain("final-social.mp4");
  });

  test("--no-compress drops the social stage and the social file (#073)", () => {
    const r = ralphy(["render", "dryrun-001", "--dry-run", "--no-compress"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { would_call: Array<{ stage: string }>; would_write: string[] };
    expect(j.would_call.map((s) => s.stage)).not.toContain("ffmpeg-compress-social");
    expect(j.would_write.length).toBe(1);
    expect(j.would_write.some((p) => p.includes("final-social.mp4"))).toBe(false);
  });

  test("--summary collapses to per-stage rollup", () => {
    // Default engine is HyperFrames; project has no composition-props.json and
    // no index.html, so the resolver falls back to the hyperframes-render stage.
    const r = ralphy(["render", "dryrun-001", "--dry-run", "--summary", "--loudnorm"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as {
      dryRun: boolean;
      engine: string;
      stages: Record<string, unknown>;
      cost_estimate_usd: number;
    };
    expect(j.dryRun).toBe(true);
    expect(j.engine).toBe("hyperframes");
    expect(j.stages["hyperframes-render"]).toBeTruthy();
    expect(j.stages["ffmpeg-loudnorm"]).toBeTruthy();
  });

});

describe("generate video --dry-run --summary", () => {
  test("--summary is accepted as a no-op for single-step verbs", () => {
    const r = ralphy([
      "generate",
      "video",
      "--project",
      "dryrun-001",
      "--slot",
      "scene-01-vid",
      "--prompt",
      "test",
      "--duration",
      "5",
      "--dry-run",
      "--summary",
      "--model",
      "kwaivgi/kling-v3.0-pro",
    ]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { dryRun: boolean };
    expect(j.dryRun).toBe(true);
  });
});
