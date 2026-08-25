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

// The routing pack: the router and its playbooks, out of the package and into a
// place an agent can actually reach. The old block pointed at repo-relative
// paths, so on a machine with no checkout the routing existed only on paper.
describe("`ralphy prompts install` / `status` / `export`", () => {
  test("installs the router and its playbooks under the library, idempotently", () => {
    const first = ralphy(["prompts", "install", "--json"]);
    expect(first.exitCode).toBe(0);
    expect(first.json.files).toBeGreaterThan(50);
    expect(first.json.written).toBe(first.json.files);
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "prompts", "AGENTS.md"))).toBe(true);
    /* A skill is what the router routes to now, and a skill is a directory:
       its body, its references, and its scripts all have to have travelled. */
    const skill = path.join(tmpRoot, ".ralphy", "prompts", ".agents", "skills");
    expect(fs.existsSync(path.join(skill, "troubleshooting", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skill, "editor", "references", "captions.md"))).toBe(true);
    expect(fs.existsSync(path.join(skill, "researcher", "scripts", "analyze-video.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "prompts", "docs", "playbooks", "agent-production-contract.md"))).toBe(true);

    // A reinstall writes nothing: the digests already match.
    const again = ralphy(["prompts", "install", "--json"]);
    expect(again.json.written).toBe(0);
    expect(again.json.removed).toBe(0);
  });

  test("every path the installed router names resolves inside the pack", () => {
    ralphy(["prompts", "install", "--json"]);
    const root = path.join(tmpRoot, ".ralphy", "prompts");
    const router = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    const named = new Set(
      router
        .split(/[\s`'"()[\],;]+/u)
        .map((t) => t.replace(/[.,;:]+$/u, ""))
        .filter((t) => (t.startsWith("docs/") || t.startsWith(".agents/skills/"))
          && t.endsWith(".md") && !/[<>*{}]/.test(t)),
    );
    expect(named.size).toBeGreaterThan(30);
    const missing = [...named].filter((rel) => !fs.existsSync(path.join(root, rel)));
    expect(missing).toEqual([]);
  });

  test("the catalog indexes the pack by category and every entry opens", () => {
    ralphy(["prompts", "install", "--json"]);
    const root = path.join(tmpRoot, ".ralphy", "prompts");
    const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8"));
    const byCategory = new Map<string, number>();
    for (const entry of catalog.entries) {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1);
    }
    /* Every category the desktop marketplace renders has to be populated, or
       the app shows an empty shelf it cannot explain. */
    for (const category of ["skill", "prompt", "template", "recipe", "component"]) {
      expect(byCategory.get(category) ?? 0).toBeGreaterThan(0);
    }
    expect(byCategory.get("skill")).toBeGreaterThan(40);
    /* An entry naming a document that did not travel is a dead marketplace row. */
    const dead = catalog.entries
      .filter((entry: any) => entry.path !== null && !fs.existsSync(path.join(root, entry.path)))
      .map((entry: any) => entry.id);
    expect(dead).toEqual([]);
    const thin = catalog.entries
      .filter((entry: any) => entry.summary.length < 5 || entry.title.length === 0)
      .map((entry: any) => entry.id);
    expect(thin).toEqual([]);
  });

  test("status reports the pack before and after the install", () => {
    const before = ralphy(["prompts", "status", "--json"]);
    expect(before.json.installed).toBe(false);
    expect(before.json.available).toBeGreaterThan(50);
    ralphy(["prompts", "install", "--json"]);
    const after = ralphy(["prompts", "status", "--json"]);
    expect(after.json.installed).toBe(true);
    expect(after.json.stale).toBe(false);
    expect(after.json.files).toBe(after.json.available);
  });

  test("export writes the same pack anywhere, for bundling into another app", () => {
    const out = path.join(tmpRoot, "vendored");
    const r = ralphy(["prompts", "export", "--out", out, "--json"]);
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(path.join(out, "AGENTS.md"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")).files.length).toBe(r.json.files);
  });
});
