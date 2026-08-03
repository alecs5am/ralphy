// Unit tests for the #108 workspaces layer + `.ralphy/` root in cli/lib/paths.ts.
//
// The contract:
//   - Layout mode: `.ralphy/` present → "ralphy"; only legacy `workspace/`
//     present → "legacy"; neither → "ralphy" (fresh install).
//   - New scheme: engine state (registry.json / config.json) at `.ralphy/` top
//     level, caches under `.ralphy/cache/{assets,library,svg}`, workspaces
//     under `.ralphy/workspaces/<slug>/{shared,projects,templates,batches}`.
//   - `projectDir(id)` resolves through the registry (`workspace` field on the
//     project entry); legacy roots FAIL FAST with LegacyLayoutError (#106 —
//     run `ralphy migrate`), they no longer resolve.
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
  LegacyLayoutError,
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
  setLegacyAllowed,
  setRoot,
  sharedDir,
  svgCacheDir,
  templatesDir,
  workspace,
  workspaceDir,
  workspaceManifestPath,
  workspacesDir,
} from "../../cli/lib/paths.js";
import { getActiveWorkspace } from "../../cli/lib/registry.js";
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

  test("legacy engine markers (workspace/.ralph or workspace/projects) → legacy mode", () => {
    fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
    setRoot(tmp); // reset detection cache
    expect(layoutMode()).toBe("legacy");
  });

  test("a bare workspace/ dir WITHOUT engine markers is NOT legacy (repo doc folders)", () => {
    fs.mkdirSync(path.join(tmp, "workspace", "scenes"), { recursive: true });
    setRoot(tmp);
    expect(layoutMode()).toBe("ralphy");
  });

  test(".ralphy/ wins even when a legacy workspace/ tree also exists", () => {
    fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
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

describe("#108 read-only active-workspace compatibility", () => {
  test("legacy config remains readable without a production writer", async () => {
    expect(await getActiveWorkspace()).toBe(DEFAULT_WORKSPACE);
    fs.mkdirSync(ralphDir(), { recursive: true });
    fs.writeFileSync(
      configPath(),
      JSON.stringify({ activeWorkspace: "fogtown" }),
      "utf8",
    );
    expect(await getActiveWorkspace()).toBe("fogtown");
    expect(currentWorkspace()).toBe("fogtown");
    // Staged compatibility paths may still read an existing legacy pointer.
    expect(projectsDir()).toBe(path.join(workspaceDir("fogtown"), "projects"));
  });
});

describe("#106 legacy root fail-fast (the back-compat window is closed)", () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
    setRoot(tmp); // reset detection cache against the legacy fixture
  });

  afterEach(() => {
    setLegacyAllowed(false);
  });

  test("layoutMode still DETECTS the legacy tree (migrate/doctor need it)", () => {
    expect(layoutMode()).toBe("legacy");
  });

  test("path helpers throw LegacyLayoutError instead of resolving legacy paths", () => {
    expect(() => workspace()).toThrow(LegacyLayoutError);
    expect(() => ralphDir()).toThrow(LegacyLayoutError);
    expect(() => registryPath()).toThrow(LegacyLayoutError);
    expect(() => configPath()).toThrow(LegacyLayoutError);
    expect(() => brandsDir()).toThrow(LegacyLayoutError);
    expect(() => refsDir()).toThrow(LegacyLayoutError);
    expect(() => assetCacheDir()).toThrow(LegacyLayoutError);
    expect(() => libraryCacheDir()).toThrow(LegacyLayoutError);
    expect(() => svgCacheDir()).toThrow(LegacyLayoutError);
    expect(() => researchJobsDir()).toThrow(LegacyLayoutError);
    expect(() => projectsDir()).toThrow(LegacyLayoutError);
    expect(() => batchesDir()).toThrow(LegacyLayoutError);
    expect(() => templatesDir()).toThrow(LegacyLayoutError);
    expect(() => referencesDir()).toThrow(LegacyLayoutError);
    expect(() => researchDir()).toThrow(LegacyLayoutError);
    expect(() => projectDir("p-001")).toThrow(LegacyLayoutError);
  });

  test("the error carries the E_LEGACY_LAYOUT code for the command boundary", () => {
    try {
      workspace();
      throw new Error("expected LegacyLayoutError");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("E_LEGACY_LAYOUT");
      expect((e as Error).message).toContain("ralphy migrate");
    }
  });

  test("setLegacyAllowed(true) (migrate/doctor opt-out) resolves to the NEW scheme paths", () => {
    setLegacyAllowed(true);
    // Helpers never resolve legacy paths anymore — even opted-in callers get
    // the .ralphy/ targets; `ralphy migrate` does its own legacy path math.
    expect(workspace()).toBe(path.join(tmp, ".ralphy"));
    expect(ralphDir()).toBe(path.join(tmp, ".ralphy"));
    expect(registryPath()).toBe(path.join(tmp, ".ralphy", "registry.json"));
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
