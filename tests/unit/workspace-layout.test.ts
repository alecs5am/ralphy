// Unit tests for the #108 workspaces layer + `.ralphy/` root in cli/lib/paths.ts.
//
// The contract:
//   - Layout mode: `.ralphy/` present → "ralphy"; only legacy `workspace/`
//     present → "legacy"; neither → "ralphy" (fresh install).
//   - New scheme: engine state (registry.json / config.json) at `.ralphy/` top
//     level, caches under `.ralphy/cache/{assets,library,svg}`, workspaces
//     under `.ralphy/workspaces/<slug>/{shared,projects,templates,batches}`.
//   - `projectDir(id)` resolves through the registry (`workspace` field on the
//     project entry); legacy roots resolve exactly as before #108.
//   - Ref intake resolves project artifacts/ first, then the project's
//     workspace shared/ tier (explicit `shared/<path>` form + bare fallback).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assetCacheDir,
  batchesDir,
  brandsDir,
  configPath,
  currentWorkspace,
  DEFAULT_WORKSPACE,
  layoutMode,
  libraryCacheDir,
  projectDir,
  projectsDir,
  projectWorkspace,
  ralphDir,
  referencesDir,
  refsDir,
  registryPath,
  researchDir,
  researchJobsDir,
  root,
  setRoot,
  sharedDir,
  svgCacheDir,
  templatesDir,
  workspace,
  workspaceDir,
  workspaceManifestPath,
  workspacesDir,
} from "../../cli/lib/paths.js";
import { getActiveWorkspace, setActiveWorkspace } from "../../cli/lib/registry.js";
import { resolveProjectPath } from "../../cli/lib/path-resolution.js";

let tmp: string;
let prevRoot: string;

beforeEach(() => {
  prevRoot = root();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ws-layout-"));
  setRoot(tmp);
});

afterEach(() => {
  setRoot(prevRoot);
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeRegistry(projects: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(registryPath()), { recursive: true });
  fs.writeFileSync(registryPath(), JSON.stringify({ projects }, null, 2));
}

describe("#108 layout mode detection", () => {
  test("fresh (empty) root → ralphy mode", () => {
    expect(layoutMode()).toBe("ralphy");
  });

  test("only legacy workspace/ present → legacy mode", () => {
    fs.mkdirSync(path.join(tmp, "workspace"), { recursive: true });
    setRoot(tmp); // reset detection cache
    expect(layoutMode()).toBe("legacy");
  });

  test(".ralphy/ wins even when workspace/ also exists", () => {
    fs.mkdirSync(path.join(tmp, "workspace"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".ralphy"), { recursive: true });
    setRoot(tmp);
    expect(layoutMode()).toBe("ralphy");
  });
});

describe("#108 new-scheme path resolution", () => {
  test("data root + engine state at .ralphy/ top level", () => {
    expect(workspace()).toBe(path.join(tmp, ".ralphy"));
    expect(ralphDir()).toBe(path.join(tmp, ".ralphy"));
    expect(registryPath()).toBe(path.join(tmp, ".ralphy", "registry.json"));
    expect(configPath()).toBe(path.join(tmp, ".ralphy", "config.json"));
  });

  test("caches under .ralphy/cache/{assets,library,svg}", () => {
    expect(assetCacheDir()).toBe(path.join(tmp, ".ralphy", "cache", "assets"));
    expect(libraryCacheDir()).toBe(path.join(tmp, ".ralphy", "cache", "library"));
    expect(svgCacheDir()).toBe(path.join(tmp, ".ralphy", "cache", "svg"));
  });

  test("research/references stay global at .ralphy/ root; job state nests under research/jobs", () => {
    expect(researchDir()).toBe(path.join(tmp, ".ralphy", "research"));
    expect(referencesDir()).toBe(path.join(tmp, ".ralphy", "references"));
    expect(researchJobsDir()).toBe(path.join(tmp, ".ralphy", "research", "jobs"));
  });

  test("workspacesDir / workspaceDir / sharedDir / manifest compose", () => {
    expect(workspacesDir()).toBe(path.join(tmp, ".ralphy", "workspaces"));
    expect(workspaceDir("fogtown")).toBe(path.join(tmp, ".ralphy", "workspaces", "fogtown"));
    expect(sharedDir("fogtown")).toBe(path.join(tmp, ".ralphy", "workspaces", "fogtown", "shared"));
    expect(workspaceManifestPath("fogtown")).toBe(
      path.join(tmp, ".ralphy", "workspaces", "fogtown", "workspace.json"),
    );
  });

  test("currentWorkspace defaults to 'default' with no pointer", () => {
    expect(currentWorkspace()).toBe(DEFAULT_WORKSPACE);
  });

  test("projectsDir / batchesDir / templatesDir are scoped to the active workspace", () => {
    expect(projectsDir()).toBe(path.join(workspaceDir(DEFAULT_WORKSPACE), "projects"));
    expect(batchesDir()).toBe(path.join(workspaceDir(DEFAULT_WORKSPACE), "batches"));
    expect(templatesDir()).toBe(path.join(workspaceDir(DEFAULT_WORKSPACE), "templates"));
  });

  test("registry entity dirs live in the active workspace's shared/", () => {
    expect(brandsDir()).toBe(path.join(sharedDir(DEFAULT_WORKSPACE), "brands"));
    expect(refsDir()).toBe(path.join(sharedDir(DEFAULT_WORKSPACE), "refs"));
  });

  test("projectDir resolves through the registry workspace field", () => {
    writeRegistry({
      "reel-001": { id: "reel-001", workspace: "fogtown" },
      "old-001": { id: "old-001" }, // pre-#108 entry without workspace field
    });
    expect(projectWorkspace("reel-001")).toBe("fogtown");
    expect(projectDir("reel-001")).toBe(
      path.join(tmp, ".ralphy", "workspaces", "fogtown", "projects", "reel-001"),
    );
    // Entry without a workspace field → default workspace.
    expect(projectWorkspace("old-001")).toBe(DEFAULT_WORKSPACE);
    expect(projectDir("old-001")).toBe(
      path.join(tmp, ".ralphy", "workspaces", "default", "projects", "old-001"),
    );
  });

  test("unknown id falls back to an existing dir in any workspace, else the active workspace", () => {
    // Existing dir in a non-active workspace wins (registry drift).
    const strayDir = path.join(workspaceDir("other"), "projects", "stray-001");
    fs.mkdirSync(strayDir, { recursive: true });
    expect(projectDir("stray-001")).toBe(strayDir);
    // Truly unknown id → active workspace (the creation path).
    expect(projectDir("brand-new-001")).toBe(
      path.join(workspaceDir(DEFAULT_WORKSPACE), "projects", "brand-new-001"),
    );
  });

  test("registry write within the same process is picked up (mtime cache)", () => {
    writeRegistry({ "p-001": { id: "p-001", workspace: "a" } });
    expect(projectWorkspace("p-001")).toBe("a");
    // Rewrite with a different workspace + bump mtime.
    writeRegistry({ "p-001": { id: "p-001", workspace: "b" } });
    const now = new Date();
    fs.utimesSync(registryPath(), now, new Date(now.getTime() + 1000));
    expect(projectWorkspace("p-001")).toBe("b");
  });
});

describe("#108 active-workspace pointer (config.json)", () => {
  test("set/get round-trip + currentWorkspace() sync read agree", async () => {
    expect(await getActiveWorkspace()).toBe(DEFAULT_WORKSPACE);
    await setActiveWorkspace("fogtown");
    expect(await getActiveWorkspace()).toBe("fogtown");
    expect(currentWorkspace()).toBe("fogtown");
    // The pointer landed in config.json under the .ralphy/ root.
    const cfg = JSON.parse(fs.readFileSync(configPath(), "utf-8"));
    expect(cfg.activeWorkspace).toBe("fogtown");
    // Workspace-scoped dirs follow the pointer.
    expect(projectsDir()).toBe(path.join(workspaceDir("fogtown"), "projects"));
  });
});

describe("#108 legacy fallback (removed by #106)", () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
    setRoot(tmp); // reset detection cache against the legacy fixture
  });

  test("all paths resolve exactly as before #108", () => {
    expect(layoutMode()).toBe("legacy");
    expect(workspace()).toBe(path.join(tmp, "workspace"));
    expect(ralphDir()).toBe(path.join(tmp, "workspace", ".ralph"));
    expect(registryPath()).toBe(path.join(tmp, "workspace", ".ralph", "registry.json"));
    expect(configPath()).toBe(path.join(tmp, "workspace", ".ralph", "config.json"));
    expect(brandsDir()).toBe(path.join(tmp, "workspace", ".ralph", "brands"));
    expect(refsDir()).toBe(path.join(tmp, "workspace", ".ralph", "refs"));
    expect(assetCacheDir()).toBe(path.join(tmp, "workspace", ".ralph", "asset-cache"));
    expect(libraryCacheDir()).toBe(path.join(tmp, "workspace", ".ralph", "library-cache"));
    expect(svgCacheDir()).toBe(path.join(tmp, "workspace", ".ralph", "svg-cache"));
    expect(researchJobsDir()).toBe(path.join(tmp, "workspace", ".ralph", "research"));
    expect(projectsDir()).toBe(path.join(tmp, "workspace", "projects"));
    expect(batchesDir()).toBe(path.join(tmp, "workspace", "batches"));
    expect(templatesDir()).toBe(path.join(tmp, "workspace", "templates"));
    expect(referencesDir()).toBe(path.join(tmp, "workspace", "references"));
    expect(researchDir()).toBe(path.join(tmp, "workspace", "research"));
    expect(projectDir("p-001")).toBe(path.join(tmp, "workspace", "projects", "p-001"));
  });

  test("currentWorkspace is the implicit default", () => {
    expect(currentWorkspace()).toBe(DEFAULT_WORKSPACE);
    expect(projectWorkspace("anything")).toBe(DEFAULT_WORKSPACE);
  });
});

describe("#108 shared/ ref resolution order", () => {
  const PROJECT = "reel-001";

  function setup() {
    writeRegistry({ [PROJECT]: { id: PROJECT, workspace: "fogtown" } });
    fs.mkdirSync(path.join(projectDir(PROJECT), "artifacts", "refs"), { recursive: true });
    fs.mkdirSync(path.join(sharedDir("fogtown"), "cast"), { recursive: true });
  }

  test("explicit shared/<path> form resolves against the project's workspace shared/", () => {
    setup();
    const target = path.join(sharedDir("fogtown"), "cast", "nurse.png");
    fs.writeFileSync(target, "png");
    expect(resolveProjectPath("shared/cast/nurse.png", PROJECT)).toBe(target);
  });

  test("project artifacts/refs/ wins over workspace shared/ for a bare name", () => {
    setup();
    const inProject = path.join(projectDir(PROJECT), "artifacts", "refs", "nurse.png");
    const inShared = path.join(sharedDir("fogtown"), "nurse.png");
    fs.writeFileSync(inProject, "project copy");
    fs.writeFileSync(inShared, "shared copy");
    expect(resolveProjectPath("nurse.png", PROJECT)).toBe(inProject);
  });

  test("bare name falls back to workspace shared/ when not in the project", () => {
    setup();
    const inShared = path.join(sharedDir("fogtown"), "cast", "nurse.png");
    fs.writeFileSync(inShared, "shared copy");
    expect(resolveProjectPath("cast/nurse.png", PROJECT)).toBe(inShared);
  });

  test("no hit anywhere → cwd-relative absolute (existing ENOENT contract)", () => {
    setup();
    expect(resolveProjectPath("missing.png", PROJECT)).toBe(path.resolve("missing.png"));
  });
});
