// Integration test for per-model whitelist in `generate video --help` (01.03.03).
//
// Acceptance:
//   • `ralphy generate video --help` includes a block listing per-model
//     supported_durations / supported_resolutions / supported_aspect_ratios /
//     supported_frame_images for each model in the registry.
//   • `--help --model <id>` narrows to a single model.

import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const FIXTURE = path.join(REPO, "tests", "fixtures", "or-catalog.json");

function withTmpCatalog(): { tmp: string; cleanup: () => void } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-help-"));
  fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(tmp, "workspace", ".ralph", "or-catalog.json"));
  return {
    tmp,
    cleanup: () => {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch { /* best effort */ }
    },
  };
}

function ralphy(tmp: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmp, ...args], { cwd: tmp, encoding: "utf8" });
  return { stdout: r.stdout, stderr: r.stderr, exitCode: r.status ?? -1 };
}

describe("generate video --help (per-model whitelist)", () => {
  test("includes the per-model section with kling + veo + hailuo rows", () => {
    const { tmp, cleanup } = withTmpCatalog();
    try {
      const r = ralphy(tmp, ["generate", "video", "--help"]);
      expect(r.exitCode).toBe(0);
      const out = r.stdout;
      expect(out).toContain("Per-model whitelist");
      expect(out).toContain("kwaivgi/kling-v3.0-pro");
      expect(out).toContain("google/veo-3.1");
      expect(out).toContain("minimax/hailuo-2.3");
      // Spot-check the constraint columns are present
      expect(out).toMatch(/durations.*5|5s|\b5\b/);
      expect(out).toMatch(/9:16/);
    } finally {
      cleanup();
    }
  });

  test("--model <id> filters to a single model", () => {
    const { tmp, cleanup } = withTmpCatalog();
    try {
      const r = ralphy(tmp, ["generate", "video", "--help", "--model", "kwaivgi/kling-v3.0-pro"]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("kwaivgi/kling-v3.0-pro");
      expect(r.stdout).not.toContain("google/veo-3.1");
    } finally {
      cleanup();
    }
  });
});
