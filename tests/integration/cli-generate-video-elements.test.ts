// #592 — `ralphy generate video --element` (Kling O3 on fal), dry-run only.
//
// The dry run prints the resolved fal request body (local paths stand in for
// the fal CDN URLs a live run uploads). No API key, no network, no paid call.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const KLING_O3 = "fal-ai/kling-video/o3/pro/reference-to-video";

let tmpRoot: string;
let refs: string;

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env, HOME: tmpRoot, RALPHY_PROJECT_DIR: "" },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function videoArgs(extra: string[]): string[] {
  return [
    "generate", "video", "--project", "elements-001", "--slot", "cast-walk",
    "--prompt", "@Element1 walks past @Element2", "--duration", "5", "--dry-run", ...extra,
  ];
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-cli-592-"));
  const projDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "elements-001");
  refs = path.join(projDir, "artifacts", "refs");
  fs.mkdirSync(refs, { recursive: true });
  for (const f of ["hero-front.png", "hero-left.png", "hero-back.png", "dog-front.png", "dog-side.png", "style.png"]) {
    fs.writeFileSync(path.join(refs, f), "png");
  }
  fs.writeFileSync(path.join(projDir, "BRIEF.md"), "test\n");
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("ralphy generate video --element (#592)", () => {
  test("dry-run prints the resolved Kling O3 body with one element per flag", () => {
    const r = ralphy(videoArgs([
      "--provider", "fal", "--model", KLING_O3,
      "--element", `${path.join(refs, "hero-front.png")},${path.join(refs, "hero-left.png")},${path.join(refs, "hero-back.png")}`,
      "--element", `${path.join(refs, "dog-front.png")},${path.join(refs, "dog-side.png")}`,
      "--ref", path.join(refs, "style.png"),
    ]));
    expect(r.exitCode).toBe(0);
    expect(r.json?.dryRun).toBe(true);
    expect(r.json.requestBody.elements).toEqual([
      {
        frontal_image_url: path.join(refs, "hero-front.png"),
        reference_image_urls: [path.join(refs, "hero-left.png"), path.join(refs, "hero-back.png")],
      },
      {
        frontal_image_url: path.join(refs, "dog-front.png"),
        reference_image_urls: [path.join(refs, "dog-side.png")],
      },
    ]);
    expect(r.json.requestBody.image_urls).toEqual([path.join(refs, "style.png")]);
    expect(r.json.requestBody.duration).toBe("5");
    expect(r.json.elements).toHaveLength(2);
    expect(r.json.estimatedCostUsd).toBeCloseTo(0.56, 4);
  });

  test("an element with one image is refused", () => {
    const r = ralphy(videoArgs(["--provider", "fal", "--model", KLING_O3, "--element", path.join(refs, "hero-front.png")]));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toContain("--element takes 2-4");
  });

  test("--element on a model without Kling elements is refused", () => {
    const r = ralphy(videoArgs([
      "--model", "kwaivgi/kling-v3.0-pro",
      "--element", `${path.join(refs, "hero-front.png")},${path.join(refs, "hero-left.png")}`,
    ]));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toContain("--element needs --provider fal");
  });
});
