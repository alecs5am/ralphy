// Integration: `ralphy prompts library lookup` + `ralphy prompts modes`
// (02.0L.03 + 02.03.04 stretch).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
  let json: any = null;
  try { json = JSON.parse(r.stdout); } catch {}
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

beforeEach(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-prompts-")); });
afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

describe("`ralphy prompts library lookup` (02.0L.03)", () => {
  test("returns matches for a SaaS-hook goal", () => {
    const r = ralphy(["prompts", "library", "lookup", "--goal", "saas hook 3s scroll-stop"]);
    expect(r.exitCode).toBe(0);
    expect(Array.isArray(r.json?.matches)).toBe(true);
    // The hook-saas-3s entry should top the ranking.
    expect(r.json?.matches?.[0]?.slug).toBe("hook-saas-3s");
    expect(r.json?.matches?.[0]?.score).toBeGreaterThan(0);
  });

  test("respects --limit", () => {
    const r = ralphy(["prompts", "library", "lookup", "--goal", "video reveal", "--limit", "2"]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.matches?.length).toBeLessThanOrEqual(2);
  });
});

describe("`ralphy prompts modes` (02.03.04 stretch)", () => {
  test("lists video modes", () => {
    const r = ralphy(["prompts", "modes", "--kind", "video"]);
    expect(r.exitCode).toBe(0);
    const modes = r.json?.modes?.map((m: any) => m.mode) ?? [];
    expect(modes).toContain("kling");
    expect(modes).toContain("veo");
    expect(modes).toContain("luma");
  });

  test("lists voice modes", () => {
    const r = ralphy(["prompts", "modes", "--kind", "voice"]);
    expect(r.exitCode).toBe(0);
    const modes = r.json?.modes?.map((m: any) => m.mode) ?? [];
    expect(modes).toContain("deadpan-rant");
    expect(modes.length).toBeGreaterThanOrEqual(5);
  });

  test("lists music modes", () => {
    const r = ralphy(["prompts", "modes", "--kind", "music"]);
    expect(r.exitCode).toBe(0);
    const modes = r.json?.modes?.map((m: any) => m.mode) ?? [];
    expect(modes).toContain("tension-build");
    expect(modes.length).toBeGreaterThanOrEqual(5);
  });
});
