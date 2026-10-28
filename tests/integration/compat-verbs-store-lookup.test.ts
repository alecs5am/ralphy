// #585: compatibility Project verbs find store-only Projects.
//
// Domain state is authoritative in SQLite. A Project that exists only in the
// store (no registry.json entry) used to resolve its scope (#573) and then fail
// with E_NOT_FOUND, because `project log-asset`, `log-prompt`, `timeline` and
// the other compatibility verbs looked the Project up in the legacy registry.
// These tests pin the store-backed lookup:
//   - log-prompt, log-asset, timeline, log, ref attach / check work for a
//     store-only Project, by slug and by store id, and write into the tree the
//     store record names: workspaces/<workspace slug>/projects/<project slug>/.
//   - A tree named by the store id (written before #585) is still found.
//   - A stale registry entry never moves the scoped Project out of the
//     Workspace the store resolved; a matching one still lends its legacy
//     descriptive fields (refs).
//   - Verbs that still write the registry (project move) refuse a store
//     Project instead of desynchronizing it.
//
// Registry-backed Projects on a root without a store keep their behavior; the
// existing suites (cli-log-asset, cli-ref-check, cli-project-049, ...) cover
// that read-only fallback.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setRoot } from "../../cli/lib/paths.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;
let dataRoot: string;
let projectId: string;
let projectTree: string;

function ralphy(args: string[]) {
  const r = spawnSync("bun", ["run", CLI, "--json", "--cwd", tmp, ...args], {
    cwd: tmp,
    encoding: "utf8",
    // HOME isolation: the machine's global config (default_project_dir) and
    // RALPHY_PROJECT_DIR must not point the CLI at a real data root.
    env: { ...process.env, HOME: tmp, RALPHY_PROJECT_DIR: "", NO_COLOR: "1" },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // Error cases have no stdout payload.
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function readJsonl(file: string): any[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeRegistry(registry: Record<string, unknown>) {
  fs.writeFileSync(path.join(dataRoot, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-585-")));
  dataRoot = path.join(tmp, ".ralphy");
  fs.mkdirSync(dataRoot);
  setRoot(tmp);
  const alpha = createWorkspace({ slug: "alpha", name: "Alpha" });
  const beta = createWorkspace({ slug: "beta", name: "Beta" });
  const project = createProject({
    workspaceId: alpha.id,
    slug: "store-only",
    name: "Store Only",
    metadata: { kind: "video" },
  });
  createProject({ workspaceId: beta.id, slug: "other", name: "Other" });
  closeDomainDb();
  setRoot(REPO);
  projectId = project.id;
  projectTree = path.join(dataRoot, "workspaces", "alpha", "projects", "store-only");
});

afterEach(() => {
  closeDomainDb();
  setRoot(REPO);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("store-only Project with compatibility verbs (#585)", () => {
  test("log-prompt, log-asset and timeline resolve the store record", () => {
    expect(fs.existsSync(path.join(dataRoot, "registry.json"))).toBe(false);

    const prompt = ralphy(["project", "log-prompt", "store-only", "--text", "make it brighter"]);
    expect(prompt.exitCode, prompt.stderr).toBe(0);
    expect(prompt.json).toEqual({ project: "store-only", logged: "user-prompt" });
    const prompts = readJsonl(path.join(projectTree, "logs", "user-prompts.jsonl"));
    expect(prompts.map((row) => row.text)).toEqual(["make it brighter"]);

    // By store id: the tree is still named by the Project slug.
    const src = path.join(tmp, "ref.png");
    fs.writeFileSync(src, "ref-bytes");
    const asset = ralphy([
      "project",
      "log-asset",
      projectId,
      "--kind",
      "screenshot",
      "--copy-from",
      src,
    ]);
    expect(asset.exitCode, asset.stderr).toBe(0);
    const dest = path.join(projectTree, "artifacts", "refs", "ref.png");
    expect(asset.json.project).toBe("store-only");
    expect(asset.json.dest).toBe(dest);
    expect(asset.json.sourceFrom).toBe("--copy-from");
    expect(fs.readFileSync(dest, "utf8")).toBe("ref-bytes");
    const assets = readJsonl(path.join(projectTree, "logs", "user-assets.jsonl"));
    expect(assets).toHaveLength(1);
    expect(assets[0].localPath).toBe(dest);
    expect(fs.existsSync(path.join(dataRoot, "workspaces", "alpha", "projects", projectId))).toBe(false);

    const timeline = ralphy(["project", "timeline", "store-only"]);
    expect(timeline.exitCode, timeline.stderr).toBe(0);
    expect(timeline.json.map((row: { kind: string }) => row.kind)).toEqual([
      "user:prompt",
      "user:asset[screenshot]",
    ]);

    const log = ralphy(["project", "log", projectId, "--type", "all"]);
    expect(log.exitCode, log.stderr).toBe(0);
    expect(log.json.map((row: { _type: string }) => row._type)).toEqual([
      "user-prompts",
      "user-assets",
    ]);

    // Still no registry: nothing fell back to (or wrote) the legacy pointer.
    expect(fs.existsSync(path.join(dataRoot, "registry.json"))).toBe(false);
  });

  test("ref attach keeps refs in the store record and ref check reads them back", () => {
    // The ref itself is a legacy registry entity; the Project stays store-only.
    writeRegistry({ refs: { "ref-001": { id: "ref-001", url: "https://example.com/a" } } });

    const attach = ralphy(["--workspace", "alpha", "ref", "attach", "ref-001", "--to", "store-only"]);
    expect(attach.exitCode, attach.stderr).toBe(0);

    const check = ralphy(["--workspace", "alpha", "ref", "check", "store-only"]);
    expect(check.exitCode, check.stderr).toBe(0);
    expect(check.json.mode).toBe("project");
    expect(check.json.project).toBe("store-only");
    expect(check.json.attachedRefs).toEqual(["ref-001"]);

    const registry = JSON.parse(fs.readFileSync(path.join(dataRoot, "registry.json"), "utf8"));
    expect(registry.projects).toBeUndefined();

    // A Project outside the scope's Workspace is not found there.
    const miss = ralphy(["--workspace", "alpha", "ref", "check", "other"]);
    expect(miss.exitCode).not.toBe(0);
    expect(miss.stderr).toContain("Project not found: other");
  });

  test("a stale registry entry does not move the scoped Project to another Workspace", () => {
    writeRegistry({
      projects: { "store-only": { id: "store-only", name: "Store Only", workspace: "default" } },
    });

    const prompt = ralphy(["project", "log-prompt", "store-only", "--text", "store wins"]);
    expect(prompt.exitCode, prompt.stderr).toBe(0);
    expect(readJsonl(path.join(projectTree, "logs", "user-prompts.jsonl")).map((row) => row.text))
      .toEqual(["store wins"]);
    expect(fs.existsSync(path.join(dataRoot, "workspaces", "default", "projects", "store-only"))).toBe(false);
  });

  test("a tree named by the store id is found by the slug", () => {
    const idTree = path.join(dataRoot, "workspaces", "alpha", "projects", projectId);
    fs.mkdirSync(path.join(idTree, "logs"), { recursive: true });

    const prompt = ralphy(["project", "log-prompt", "store-only", "--text", "same tree"]);
    expect(prompt.exitCode, prompt.stderr).toBe(0);
    expect(prompt.json.project).toBe(projectId);
    expect(readJsonl(path.join(idTree, "logs", "user-prompts.jsonl")).map((row) => row.text))
      .toEqual(["same tree"]);
    expect(fs.existsSync(projectTree)).toBe(false);
  });

  test("legacy descriptive fields of the same Project still reach ref check", () => {
    writeRegistry({
      projects: {
        "store-only": { id: "store-only", name: "Store Only", workspace: "alpha", refs: ["ref-legacy"] },
      },
    });

    const refCheck = ralphy(["--workspace", "alpha", "ref", "check", "store-only"]);
    expect(refCheck.exitCode, refCheck.stderr).toBe(0);
    expect(refCheck.json.attachedRefs).toEqual(["ref-legacy"]);
  });

  test("project move refuses a store Project instead of desynchronizing it", () => {
    fs.mkdirSync(path.join(projectTree, "logs"), { recursive: true });
    fs.mkdirSync(path.join(dataRoot, "workspaces", "beta", "projects"), { recursive: true });

    const move = ralphy(["project", "move", "store-only", "beta"]);
    expect(move.exitCode).not.toBe(0);
    expect(move.stderr).toContain("is owned by the store");
    expect(move.stderr).toContain("ralphy project transfer");
    expect(fs.existsSync(projectTree)).toBe(true);
    expect(fs.existsSync(path.join(dataRoot, "workspaces", "beta", "projects", "store-only"))).toBe(false);
  });
});
