// CLI integration tests — spawn `bun run cli/index.ts ...` as a child
// and assert on the JSON output. We use the frozen OR catalog fixture
// (tests/fixtures/or-catalog.json) so the daemon doesn't reach out to
// openrouter.ai during tests.
//
// Tests in this file never submit a real job and never start the daemon
// — only --dry-run paths and read-only commands.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const FIXTURE_CATALOG = path.join(REPO, "tests", "fixtures", "or-catalog.json");

let tmpRoot: string;

function ralphy(args: string[], opts: { env?: Record<string, string> } = {}): {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: any;
} {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // Not JSON — fine for some commands or error cases.
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-cli-"));
  fs.mkdirSync(path.join(tmpRoot, "workspace", ".ralph"), { recursive: true });
  // Pre-populate the OR catalog cache from the frozen fixture so commands
  // don't reach the network.
  fs.copyFileSync(
    FIXTURE_CATALOG,
    path.join(tmpRoot, "workspace", ".ralph", "or-catalog.json"),
  );
  // A minimal project so `--project <id>` checks pass.
  const projDir = path.join(tmpRoot, "workspace", "projects", "test-001");
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(
    path.join(projDir, "BRIEF.md"),
    "test project for CLI integration tests\n",
  );
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("ralphy models list", () => {
  test("returns the 13-model 2026-05-08 catalog snapshot", () => {
    const r = ralphy(["models", "list"]);
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeTruthy();
    expect(r.json.count).toBeGreaterThanOrEqual(13);
    const ids = r.json.models.map((m: any) => m.id);
    expect(ids).toContain("kwaivgi/kling-v3.0-pro");
    expect(ids).toContain("google/veo-3.1");
    expect(ids).toContain("bytedance/seedance-2.0");
    expect(ids).toContain("minimax/hailuo-2.3");
  });

  test("each row carries durations / resolutions / aspects / frames", () => {
    const r = ralphy(["models", "list"]);
    const kling = r.json.models.find(
      (m: any) => m.id === "kwaivgi/kling-v3.0-pro",
    );
    expect(kling).toBeTruthy();
    expect(kling.durations).toContain("5");
    expect(kling.aspects).toContain("9:16");
    expect(kling.frames).toContain("first_frame");
    expect(kling.priceUsd5s).toBeCloseTo(0.7, 4);
  });
});

describe("ralphy models show", () => {
  test("returns full schema for a known model", () => {
    const r = ralphy(["models", "show", "minimax/hailuo-2.3"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.id).toBe("minimax/hailuo-2.3");
    expect(r.json.supported_durations).toEqual([6, 10]);
    expect(r.json.supported_aspect_ratios).toEqual(["16:9"]);
    expect(r.json.supported_frame_images).toEqual(["first_frame"]);
  });

  test("exits non-zero on unknown model id", () => {
    const r = ralphy(["models", "show", "fake/no-such-model"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.includes("not found") || r.stdout.includes("not found")).toBe(true);
  });
});

describe("ralphy generate video --dry-run", () => {
  const baseArgs = [
    "generate",
    "video",
    "--project",
    "test-001",
    "--slot",
    "scene-01",
    "--prompt",
    "test",
    "--duration",
    "5",
    "--dry-run",
  ];

  test("rejects unsupported aspect_ratio for kling (4:3)", () => {
    const r = ralphy([...baseArgs, "--model", "kwaivgi/kling-v3.0-pro", "--aspect-ratio", "4:3"]);
    expect(r.exitCode).not.toBe(0);
    const msg = r.stderr + r.stdout;
    expect(msg).toContain("aspect_ratio");
    expect(msg).toContain("4:3");
    expect(msg).toMatch(/16:9|9:16|1:1/); // suggestion list
  });

  test("rejects unsupported duration for hailuo (5 not in [6,10])", () => {
    const r = ralphy([
      ...baseArgs,
      "--model",
      "minimax/hailuo-2.3",
      "--aspect-ratio",
      "16:9",
      "--resolution",
      "1080p",
    ]);
    expect(r.exitCode).not.toBe(0);
    const msg = r.stderr + r.stdout;
    expect(msg).toContain("duration");
    expect(msg).toContain("6");
  });

  test("passes for valid kling 9:16 / 720p / 5s and prints cost estimate", () => {
    const r = ralphy([...baseArgs, "--model", "kwaivgi/kling-v3.0-pro"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.dryRun).toBe(true);
    expect(r.json.estimatedCostUsd).toBeCloseTo(0.7, 4);
  });

  test("--no-validate bypasses rejection", () => {
    const r = ralphy([
      ...baseArgs,
      "--model",
      "kwaivgi/kling-v3.0-pro",
      "--aspect-ratio",
      "4:3",
      "--no-validate",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json.dryRun).toBe(true);
    expect(r.json.aspectRatio).toBe("4:3");
  });

  test("seedance-2.0 accepts 21:9 cinema aspect", () => {
    const r = ralphy([
      ...baseArgs,
      "--model",
      "bytedance/seedance-2.0",
      "--aspect-ratio",
      "21:9",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json.dryRun).toBe(true);
    expect(r.json.aspectRatio).toBe("21:9");
  });
});

describe("ralphy queue list (empty DB)", () => {
  test("returns zero counts on a fresh tmp root", () => {
    const r = ralphy(["queue", "list"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.counts).toEqual({
      pending: 0,
      blocked: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    });
    expect(r.json.jobs).toEqual([]);
  });
});
