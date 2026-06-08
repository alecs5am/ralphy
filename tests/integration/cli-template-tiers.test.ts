// Integration test for the two-tier `ralphy template` sourcing (workspace +
// public library), after the repo-public templates/ folder was retired.
//
// These tests must NOT touch the network: the public library tier is pointed at
// an unreachable host so it degrades to an empty list + a warning, and the
// suggest ranker is forced keyword-only via `--no-llm`. Both prove the
// workspace tier works standalone:
//   1. `template suggest` ranks a workspace template with no network.
//   2. `template use` of a workspace template scaffolds the project skeleton.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;

// A workspace dir template the ranker can score on tags alone.
function setupWorkspaceTemplate(): void {
  const dir = path.join(tmp, "workspace", "templates", "deadpan-couch-rant");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "template.json"),
    JSON.stringify({
      version: 1,
      id: "deadpan-couch-rant",
      name: "Deadpan Couch Rant",
      description: "A deadpan two-hander rant delivered from a couch, straight to camera.",
      tags: ["deadpan", "couch", "rant", "talking-head"],
      kind: "vibe-style",
      category: "creator-lifestyle",
      format: "video",
      createdAt: new Date().toISOString(),
    }),
  );
  fs.writeFileSync(
    path.join(dir, "TEMPLATE.md"),
    "# Deadpan Couch Rant\n\nVibe reference for a deadpan couch rant.\n",
  );
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-tmpl-tiers-"));
  fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
  setupWorkspaceTemplate();
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmp, ...args], {
    cwd: tmp,
    encoding: "utf8",
    env: {
      ...process.env,
      // Point the public library at an unreachable host so the public tier
      // degrades gracefully (empty + warning) instead of hitting Bunny CDN.
      RALPHY_LIBRARY_URL: "http://127.0.0.1:1/library.json",
    },
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe("ralphy template — two-tier sourcing (no network)", () => {
  test("suggest ranks a workspace template with no network (keyword-only)", () => {
    const r = ralphy([
      "template",
      "suggest",
      "deadpan couch rant",
      "--no-llm",
    ]);
    expect(r.exitCode).toBe(0);
    const payload = JSON.parse(r.stdout) as {
      source: string;
      results: Array<{ id: string; score: number; source: string }>;
      warnings?: string[];
    };
    // Keyword scorer matched the workspace template — no LLM, no library.
    expect(payload.source).toBe("keyword");
    expect(payload.results[0].id).toBe("deadpan-couch-rant");
    expect(payload.results[0].score).toBeGreaterThan(0);
    // The public tier was unreachable — a warning surfaced, command still ran.
    expect(payload.warnings && payload.warnings.length).toBeGreaterThan(0);
  });

  test("list shows the workspace template even when the public tier is down", () => {
    const r = ralphy(["template", "list"]);
    expect(r.exitCode).toBe(0);
    const payload = JSON.parse(r.stdout) as
      | Array<{ id: string; source: string }>
      | { templates: Array<{ id: string; source: string }>; warnings: string[] };
    const rows = Array.isArray(payload) ? payload : payload.templates;
    const slugs = rows.map((t) => t.id);
    expect(slugs).toContain("deadpan-couch-rant");
    const ws = rows.find((t) => t.id === "deadpan-couch-rant")!;
    expect(ws.source).toBe("workspace");
  });

  test("use of a workspace template scaffolds the project skeleton", () => {
    const r = ralphy([
      "template",
      "use",
      "deadpan-couch-rant",
      "--project",
      "tiers-demo-001",
      "--brief",
      "A rant about missed deadlines.",
    ]);
    if (r.exitCode !== 0) {
      console.error("STDOUT", r.stdout);
      console.error("STDERR", r.stderr);
    }
    expect(r.exitCode).toBe(0);

    const projDir = path.join(tmp, "workspace", "projects", "tiers-demo-001");
    expect(fs.existsSync(path.join(projDir, "assets", "images"))).toBe(true);
    expect(fs.existsSync(path.join(projDir, "render"))).toBe(true);
    expect(fs.existsSync(path.join(projDir, "TEMPLATE_ORIGIN.md"))).toBe(true);
    expect(fs.existsSync(path.join(projDir, "BRIEF.md"))).toBe(true);
    // Intentionally does NOT write scenario.json — the agent authors that fresh.
    expect(fs.existsSync(path.join(projDir, "scenario.json"))).toBe(false);

    const origin = fs.readFileSync(path.join(projDir, "TEMPLATE_ORIGIN.md"), "utf-8");
    expect(origin).toContain("deadpan-couch-rant");
  });
});
