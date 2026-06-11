// Integration tests for `ralphy migrate` (#106) — the one-pass migration of a
// legacy `workspace/` root to the final layout (`.ralphy/` root + workspaces
// (#108) + per-project `artifacts/` (#105)).
//
// Covers:
//   1. Fixture round-trip: dry-run (plan only, disk untouched) → run (full
//      .ralphy tree, .vN siblings survive, manifest/log/html/unit strings
//      rewritten, JSONL line counts identical, empty assets/refs gone,
//      registry workspace fields + activeWorkspace + workspace.json) → run
//      again ({already_migrated: true} no-op).
//   2. Fail-fast: a normal verb on a legacy root → E_LEGACY_LAYOUT.
//   3. --project scoping: inner artifacts/ move only, on an already-migrated
//      root with one project still holding assets/ (mid-migration).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-migrate-106-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, "--json", ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function stderrErrorCode(stderr: string): string | null {
  const line = stderr
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .pop();
  if (!line) return null;
  try {
    return JSON.parse(line)?.error?.code ?? null;
  } catch {
    return null;
  }
}

function write(rel: string, content: string) {
  const p = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

/** Build the legacy fixture root: 2 projects + .ralph state + templates/references. */
function buildLegacyFixture() {
  write(
    "workspace/.ralph/registry.json",
    JSON.stringify(
      { projects: { p1: { id: "p1", name: "P One" }, p2: { id: "p2", name: "P Two" } } },
      null,
      2,
    ) + "\n",
  );
  write("workspace/.ralph/config.json", "{}\n");
  write("workspace/.ralph/brands/x.json", JSON.stringify({ id: "x" }) + "\n");
  write("workspace/.ralph/asset-cache/file.bin", "binary-ish");

  // p1 — the heavy project: media + .v2 sibling + unknown analysis subdir +
  // refs + manifest + 3-line gen log + index.html + a formed unit.
  write("workspace/projects/p1/assets/images/a.png", "png-v1");
  write("workspace/projects/p1/assets/images/a.v2.png", "png-v2");
  write("workspace/projects/p1/assets/analysis/sum.json", JSON.stringify({ ok: true }));
  write("workspace/projects/p1/refs/r.png", "ref-bytes");
  write(
    "workspace/projects/p1/asset-manifest.json",
    JSON.stringify(
      {
        slots: {
          a: { file: "assets/images/a.png", versions: ["assets/images/a.png", "assets/images/a.v2.png"] },
          r: { file: "refs/r.png" },
        },
      },
      null,
      2,
    ),
  );
  write(
    "workspace/projects/p1/logs/generations.jsonl",
    [
      JSON.stringify({ slot: "a", output: "assets/images/a.png", costUsd: 0.01 }),
      JSON.stringify({ slot: "a", output: "assets/images/a.v2.png", note: "re-roll" }),
      JSON.stringify({ slot: "vo", note: "no path-valued strings on this line" }),
    ].join("\n") + "\n",
  );
  write(
    "workspace/projects/p1/index.html",
    '<html><video src="assets/videos/v.mp4"></video><img src="refs/r.png"></html>',
  );
  write(
    "workspace/projects/p1/units/u1/unit.json",
    JSON.stringify({ slug: "u1", media: [{ src: "assets/images/a.png" }], ref: "refs/r.png" }, null, 2),
  );

  // p2 — minimal (no media tree at all).
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", "p2"), { recursive: true });

  // workspace-tier template + global reference.
  write("workspace/templates/t1/template.json", JSON.stringify({ id: "t1" }));
  write("workspace/references/refx/notes.md", "# ref");

  // Unknown entries — must route to .ralphy/<basename> and be reported as
  // unclassified, never dropped.
  write("workspace/.ralph/mystery-cache/blob.bin", "mystery");
  write("workspace/strange-dir/keep.txt", "keep me");
}

describe("ralphy migrate (#106) — fixture round-trip", () => {
  test("dry-run plans everything and touches nothing; run migrates; re-run is a no-op", () => {
    buildLegacyFixture();

    // ── dry-run ──────────────────────────────────────────────────────────
    const dry = ralphy(["migrate", "--dry-run"]);
    expect(dry.exitCode).toBe(0);
    expect(dry.json.mode).toBe("dry-run");
    const plannedFrom = dry.json.root_moves.map((m: any) => m.from);
    expect(plannedFrom).toContain(path.join("workspace", ".ralph", "registry.json"));
    expect(plannedFrom).toContain(path.join("workspace", ".ralph", "brands"));
    expect(plannedFrom).toContain(path.join("workspace", ".ralph", "asset-cache"));
    expect(plannedFrom).toContain(path.join("workspace", "templates"));
    expect(plannedFrom).toContain(path.join("workspace", "references"));
    expect(plannedFrom).toContain(path.join("workspace", "projects", "p1"));
    expect(plannedFrom).toContain(path.join("workspace", "projects", "p2"));
    const p1Plan = dry.json.projects.find((p: any) => p.id === "p1");
    expect(p1Plan.files_moved).toBe(4); // a.png + a.v2.png + sum.json + r.png
    expect(p1Plan.manifest_rewrites).toBeGreaterThan(0);
    expect(p1Plan.log_line_rewrites).toBe(2); // line 3 carries no paths
    expect(p1Plan.html_rewrites).toBe(2);
    expect(p1Plan.unit_rewrites).toBe(2);
    const p2Plan = dry.json.projects.find((p: any) => p.id === "p2");
    expect(p2Plan.skipped).toContain("no media tree");
    // Unknown entries are planned (to .ralphy/<basename>) + flagged unclassified.
    expect(dry.json.unclassified).toContain(path.join("workspace", ".ralph", "mystery-cache"));
    expect(dry.json.unclassified).toContain(path.join("workspace", "strange-dir"));
    // Disk untouched.
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy"))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, "workspace", "projects", "p1", "assets"))).toBe(true);

    // ── run ──────────────────────────────────────────────────────────────
    const run = ralphy(["migrate"]);
    expect(run.exitCode).toBe(0);
    expect(run.json.mode).toBe("run");
    expect(run.json.already_migrated).toBeUndefined();

    const ws = path.join(tmpRoot, ".ralphy");
    const p1 = path.join(ws, "workspaces", "default", "projects", "p1");
    // Root tree.
    expect(fs.existsSync(path.join(ws, "registry.json"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "cache", "assets", "file.bin"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "workspaces", "default", "shared", "brands", "x.json"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "workspaces", "default", "templates", "t1", "template.json"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "references", "refx", "notes.md"))).toBe(true);
    // Unclassified leftovers moved to .ralphy/<basename> — never dropped.
    expect(fs.existsSync(path.join(ws, "mystery-cache", "blob.bin"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "strange-dir", "keep.txt"))).toBe(true);
    expect(run.json.unclassified).toContain(path.join("workspace", "strange-dir"));
    // Legacy tree fully consumed.
    expect(fs.existsSync(path.join(tmpRoot, "workspace"))).toBe(false);

    // Project p1: artifacts tree, .v2 sibling + unknown analysis subdir survived.
    expect(fs.readFileSync(path.join(p1, "artifacts", "images", "a.png"), "utf8")).toBe("png-v1");
    expect(fs.readFileSync(path.join(p1, "artifacts", "images", "a.v2.png"), "utf8")).toBe("png-v2");
    expect(fs.existsSync(path.join(p1, "artifacts", "analysis", "sum.json"))).toBe(true);
    expect(fs.readFileSync(path.join(p1, "artifacts", "refs", "r.png"), "utf8")).toBe("ref-bytes");
    // Empty legacy dirs removed.
    expect(fs.existsSync(path.join(p1, "assets"))).toBe(false);
    expect(fs.existsSync(path.join(p1, "refs"))).toBe(false);

    // Manifest rewritten.
    const manifest = JSON.parse(fs.readFileSync(path.join(p1, "asset-manifest.json"), "utf8"));
    expect(manifest.slots.a.file).toBe("artifacts/images/a.png");
    expect(manifest.slots.a.versions).toEqual([
      "artifacts/images/a.png",
      "artifacts/images/a.v2.png",
    ]);
    expect(manifest.slots.r.file).toBe("artifacts/refs/r.png");

    // Gen log: line count identical, order preserved, only path strings changed.
    const logLines = fs
      .readFileSync(path.join(p1, "logs", "generations.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(logLines.length).toBe(3);
    expect(JSON.parse(logLines[0]!).output).toBe("artifacts/images/a.png");
    expect(JSON.parse(logLines[1]!).output).toBe("artifacts/images/a.v2.png");
    expect(JSON.parse(logLines[2]!)).toEqual({ slot: "vo", note: "no path-valued strings on this line" });

    // HTML srcs rewritten.
    const html = fs.readFileSync(path.join(p1, "index.html"), "utf8");
    expect(html).toContain('src="artifacts/videos/v.mp4"');
    expect(html).toContain('src="artifacts/refs/r.png"');
    expect(html).not.toContain('src="assets/');

    // Unit provenance rewritten.
    const unit = JSON.parse(fs.readFileSync(path.join(p1, "units", "u1", "unit.json"), "utf8"));
    expect(unit.media[0].src).toBe("artifacts/images/a.png");
    expect(unit.ref).toBe("artifacts/refs/r.png");

    // Registry + config + workspace manifest.
    const reg = JSON.parse(fs.readFileSync(path.join(ws, "registry.json"), "utf8"));
    expect(reg.projects.p1.workspace).toBe("default");
    expect(reg.projects.p2.workspace).toBe("default");
    const cfg = JSON.parse(fs.readFileSync(path.join(ws, "config.json"), "utf8"));
    expect(cfg.activeWorkspace).toBe("default");
    const wsManifest = JSON.parse(
      fs.readFileSync(path.join(ws, "workspaces", "default", "workspace.json"), "utf8"),
    );
    expect(wsManifest).toMatchObject({ name: "Default", slug: "default" });
    expect(typeof wsManifest.created).toBe("string");
    expect(wsManifest.description).toContain("#106");

    // The migrated root works end-to-end with a normal verb.
    const ps = ralphy(["project", "show", "p1"]);
    expect(ps.exitCode).toBe(0);
    expect(ps.json.id).toBe("p1");

    // ── re-run: idempotent no-op ─────────────────────────────────────────
    const again = ralphy(["migrate"]);
    expect(again.exitCode).toBe(0);
    expect(again.json.already_migrated).toBe(true);
    expect(again.json.root_moves).toEqual([]);
    expect(again.json.projects).toEqual([]);
  });

  test("a root with neither workspace/ nor .ralphy/ refuses with nothing-to-migrate", () => {
    const r = ralphy(["migrate"]);
    expect(r.exitCode).not.toBe(0);
    expect(stderrErrorCode(r.stderr)).toBe("E_INPUT_INVALID");
    expect(r.stderr).toContain("nothing to migrate");
  });
});

describe("legacy root fail-fast (#106)", () => {
  test("a normal verb on a legacy root → E_LEGACY_LAYOUT error JSON", () => {
    buildLegacyFixture();
    const r = ralphy(["project", "list"]);
    expect(r.exitCode).not.toBe(0);
    expect(stderrErrorCode(r.stderr)).toBe("E_LEGACY_LAYOUT");
    expect(r.stderr).toContain("ralphy migrate");
  });

  test("doctor still works on a legacy root and warns about it", () => {
    buildLegacyFixture();
    const r = ralphy(["doctor"]);
    expect(r.exitCode).toBe(0);
    const warning = (r.json.warnings as string[]).find((w) => w.includes("ralphy migrate"));
    expect(warning).toBeTruthy();
    // Diagnosing must not flip the layout: no .ralphy/ side-effects.
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy"))).toBe(false);
  });
});

describe("ralphy migrate --project <id> (#106 inner-move scoping)", () => {
  test("refuses when the root move has not run yet", () => {
    buildLegacyFixture();
    const r = ralphy(["migrate", "--project", "p1"]);
    expect(r.exitCode).not.toBe(0);
    expect(stderrErrorCode(r.stderr)).toBe("E_VALIDATION_FAILED");
  });

  test("moves only the named project's inner tree on a migrated root", () => {
    buildLegacyFixture();
    expect(ralphy(["migrate"]).exitCode).toBe(0);

    // Simulate two mid-migration projects that still hold legacy media
    // (e.g. restored from a backup after the root move).
    const wsProjects = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects");
    write(
      path.relative(tmpRoot, path.join(wsProjects, "p2", "assets", "videos", "clip.mp4")),
      "mp4-bytes",
    );
    write(
      path.relative(tmpRoot, path.join(wsProjects, "p3", "assets", "images", "z.png")),
      "z-bytes",
    );

    const r = ralphy(["migrate", "--project", "p2"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.projects.length).toBe(1);
    expect(r.json.projects[0].id).toBe("p2");
    expect(r.json.projects[0].files_moved).toBe(1);
    expect(r.json.root_moves).toEqual([]);

    // p2 moved...
    expect(fs.existsSync(path.join(wsProjects, "p2", "artifacts", "videos", "clip.mp4"))).toBe(true);
    expect(fs.existsSync(path.join(wsProjects, "p2", "assets"))).toBe(false);
    // ...p3 untouched (scoping).
    expect(fs.existsSync(path.join(wsProjects, "p3", "assets", "images", "z.png"))).toBe(true);
    expect(fs.existsSync(path.join(wsProjects, "p3", "artifacts"))).toBe(false);
  });

  test("an unknown project id refuses with E_NOT_FOUND", () => {
    buildLegacyFixture();
    expect(ralphy(["migrate"]).exitCode).toBe(0);
    const r = ralphy(["migrate", "--project", "nope"]);
    expect(r.exitCode).not.toBe(0);
    expect(stderrErrorCode(r.stderr)).toBe("E_NOT_FOUND");
  });

  test("an already-migrated project skips with a reason", () => {
    buildLegacyFixture();
    expect(ralphy(["migrate"]).exitCode).toBe(0);
    const r = ralphy(["migrate", "--project", "p1"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.projects[0].skipped).toContain("already migrated");
  });
});
