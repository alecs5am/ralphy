import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveCommandContext,
  resolveDataRoot,
} from "../../cli/lib/context.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { finishRun, startRun } from "../../cli/lib/store/runs.js";
import {
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import {
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import { setRoot } from "../../cli/lib/paths.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: any;
};

const fixtureRoots: string[] = [];

afterEach(() => {
  closeDomainDb();
  setRoot(REPO);
  for (const root of fixtureRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("explicit CLI data root and command context", () => {
  test("discovers the nearest nested root and lets explicit root take precedence", () => {
    const outer = createFixture("outer-root");
    closeDomainDb();
    const nestedHost = path.join(outer.root, "nested");
    fs.mkdirSync(nestedHost);
    const innerRoot = path.join(nestedHost, ".ralphy");
    fs.mkdirSync(innerRoot);
    setRoot(nestedHost);
    const innerWorkspace = createWorkspace({ slug: "inner", name: "Inner" });
    closeDomainDb();
    const cwd = path.join(nestedHost, "deep", "directory");
    fs.mkdirSync(cwd, { recursive: true });

    expect(resolveDataRoot({ cwd }).dataRoot).toBe(
      fs.realpathSync.native(innerRoot),
    );
    expect(resolveDataRoot({ root: outer.dataRoot, cwd }).dataRoot).toBe(
      fs.realpathSync.native(outer.dataRoot),
    );
    expect(innerWorkspace.id).not.toBe(outer.firstWorkspace.id);
  });

  test("keeps store identity across a move while filesystem identity changes", () => {
    const fixture = createFixture("move-root");
    closeDomainDb();
    const before = resolveDataRoot({ root: fixture.dataRoot });
    const movedParent = temporaryDirectory("moved-parent");
    const movedRoot = path.join(movedParent, "domain-data");
    fs.renameSync(fixture.dataRoot, movedRoot);

    const after = resolveDataRoot({ root: movedRoot });

    expect(after.storeId).toBe(before.storeId);
    expect(after.rootId).not.toBe(before.rootId);
  });

  test("canonicalizes a symlink alias to the same data root identity", () => {
    const fixture = createFixture("symlink-root");
    closeDomainDb();
    const aliasParent = temporaryDirectory("symlink-alias");
    const alias = path.join(aliasParent, "alias");
    fs.symlinkSync(fixture.dataRoot, alias, "dir");

    const identity = resolveDataRoot({ root: fixture.dataRoot });
    expect(resolveDataRoot({ root: alias })).toEqual(identity);
    expect(identity.rootId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("rejects a repository path passed as the explicit data root", () => {
    const fixture = createFixture("repository-root");
    closeDomainDb();

    try {
      resolveDataRoot({ root: fixture.root });
      throw new Error("expected explicit repository root rejection");
    } catch (error) {
      expect(error).toMatchObject({
        code: "E_INPUT_INVALID",
        details: {
          field: "--root",
          detail: "expected the data directory itself, not a repository containing .ralphy",
        },
      });
    }
  });

  test("parallel Workspace scopes stay isolated and never write an active pointer", async () => {
    const fixture = createFixture("parallel");
    const firstSession = startAgentSession({
      workspaceId: fixture.firstWorkspace.id,
      agent: "first",
    });
    const secondSession = startAgentSession({
      workspaceId: fixture.secondWorkspace.id,
      agent: "second",
    });
    closeDomainDb();

    const [first, second] = await Promise.all([
      runCli([
        "--root",
        fixture.dataRoot,
        "--workspace",
        fixture.firstWorkspace.id,
        "session",
        "list",
      ]),
      runCli([
        "--root",
        fixture.dataRoot,
        "--workspace",
        fixture.secondWorkspace.id,
        "session",
        "list",
      ]),
    ]);

    expect({
      first: { exitCode: first.exitCode, stderr: first.stderr },
      second: { exitCode: second.exitCode, stderr: second.stderr },
    }).toEqual({
      first: { exitCode: 0, stderr: "" },
      second: { exitCode: 0, stderr: "" },
    });
    expect(first.json.items.map((item: { id: string }) => item.id)).toEqual([
      firstSession.id,
    ]);
    expect(second.json.items.map((item: { id: string }) => item.id)).toEqual([
      secondSession.id,
    ]);
    expect(fs.existsSync(path.join(fixture.dataRoot, "config.json"))).toBe(false);
  });

  test("rejects an explicit root and Workspace mismatch", async () => {
    const first = createFixture("root-first");
    const second = createFixture("root-second");
    closeDomainDb();

    const result = await runCli([
      "--root",
      first.dataRoot,
      "--workspace",
      second.firstWorkspace.id,
      "session",
      "list",
    ]);

    expect(result.exitCode).toBe(2);
    expect(errorCode(result.stderr)).toBe("E_INPUT_INVALID");
  });

  test("resolves context from the declared data root instead of global path state", () => {
    const first = createFixture("context-root-first");
    closeDomainDb();
    const second = createFixture("context-root-second");
    closeDomainDb();
    setRoot(first.root);

    expect(
      resolveCommandContext({
        dataRoot: second.dataRoot,
        workspaceId: second.firstWorkspace.id,
      }),
    ).toEqual({ kind: "scope", workspaceId: second.firstWorkspace.id });
  });

  test("rejects a legacy-only discovered data root", async () => {
    const root = temporaryDirectory("legacy-only");
    fs.mkdirSync(path.join(root, ".ralphy"));

    const result = await runCli(["--cwd", root, "session", "list"], root);

    expect(result.exitCode).toBe(2);
    expect(errorCode(result.stderr)).toBe("E_MIGRATION_INCOMPLETE");
    expect(fs.readdirSync(path.join(root, ".ralphy"))).toEqual([]);

    const explicit = await runCli(
      ["--root", path.join(root, ".ralphy"), "session", "list"],
      root,
    );
    expect(explicit.exitCode).toBe(2);
    expect(errorCode(explicit.stderr)).toBe("E_MIGRATION_INCOMPLETE");
  });

  test("rejects config writes to the retired active-Workspace pointer", async () => {
    const root = temporaryDirectory("config-pointer");
    fs.mkdirSync(path.join(root, ".ralphy"));

    const result = await runCli(
      ["--cwd", root, "config", "set", "activeWorkspace", "first"],
      root,
    );

    expect(result.exitCode).toBe(2);
    expect(errorCode(result.stderr)).toBe("E_INPUT_INVALID");
    expect(fs.existsSync(path.join(root, ".ralphy", "config.json"))).toBe(false);
  });

  test("exposes immutable Session scope and lifecycle through JSON", async () => {
    const fixture = createFixture("session-lifecycle");
    const project = createProject({
      workspaceId: fixture.firstWorkspace.id,
      slug: "project",
      name: "Project",
    });
    const sibling = createProject({
      workspaceId: fixture.firstWorkspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    closeDomainDb();

    const started = await runCli([
      "--root",
      fixture.dataRoot,
      "--workspace",
      fixture.firstWorkspace.id,
      "--project",
      project.id,
      "session",
      "start",
      "--agent",
      "codex",
    ]);
    expect(started.exitCode).toBe(0);
    expect(started.json).toMatchObject({
      workspaceId: fixture.firstWorkspace.id,
      projectId: project.id,
      agent: "codex",
      endedAt: null,
    });

    const conflict = await runCli([
      "--root",
      fixture.dataRoot,
      "--session",
      started.json.id,
      "--project",
      sibling.id,
      "session",
      "show",
      started.json.id,
    ]);
    expect(conflict.exitCode).toBe(2);
    expect(errorCode(conflict.stderr)).toBe("E_INPUT_INVALID");

    const normalCommandConflict = await runCli([
      "--root",
      fixture.dataRoot,
      "--session",
      started.json.id,
      "project",
      "show",
      sibling.id,
    ]);
    expect(normalCommandConflict.exitCode).toBe(2);
    expect(errorCode(normalCommandConflict.stderr)).toBe("E_INPUT_INVALID");

    const shown = await runCli([
      "--root",
      fixture.dataRoot,
      "--session",
      started.json.id,
      "session",
      "show",
      started.json.id,
    ]);
    expect(shown.exitCode).toBe(0);
    expect(shown.json).toEqual(started.json);

    setRoot(fixture.root);
    const pendingRun = startRun({
      workspaceId: fixture.firstWorkspace.id,
      projectId: project.id,
      agentSessionId: started.json.id,
      kind: "generation",
    });
    closeDomainDb();

    const blocked = await runCli([
      "--root",
      fixture.dataRoot,
      "--session",
      started.json.id,
      "session",
      "end",
      started.json.id,
    ]);
    expect(blocked.exitCode).toBe(2);
    expect(errorCode(blocked.stderr)).toBe("E_CONFLICT");

    setRoot(fixture.root);
    finishRun(pendingRun.id, { state: "cancelled" });
    closeDomainDb();

    const ended = await runCli([
      "--root",
      fixture.dataRoot,
      "--session",
      started.json.id,
      "session",
      "end",
      started.json.id,
    ]);
    expect(ended.exitCode).toBe(0);
    expect(ended.json.endedAt).toBeNumber();

    const endedAuthority = await runCli([
      "--root",
      fixture.dataRoot,
      "--session",
      started.json.id,
      "session",
      "list",
    ]);
    expect(endedAuthority.exitCode).toBe(2);
    expect(errorCode(endedAuthority.stderr)).toBe("E_INPUT_INVALID");

    const history = await runCli([
      "--root",
      fixture.dataRoot,
      "--workspace",
      fixture.firstWorkspace.id,
      "session",
      "show",
      started.json.id,
    ]);
    expect(history.exitCode).toBe(0);
    expect(history.json).toEqual(ended.json);

    const foreignHistory = await runCli([
      "--root",
      fixture.dataRoot,
      "--workspace",
      fixture.secondWorkspace.id,
      "session",
      "show",
      started.json.id,
    ]);
    expect(foreignHistory.exitCode).toBe(2);
    expect(errorCode(foreignHistory.stderr)).toBe("E_INPUT_INVALID");

    const endedAgain = await runCli([
      "--root",
      fixture.dataRoot,
      "--workspace",
      fixture.firstWorkspace.id,
      "session",
      "end",
      started.json.id,
    ]);
    expect(endedAgain.exitCode).toBe(2);
    expect(errorCode(endedAgain.stderr)).toBe("E_CONFLICT");
  });

  test("rejects Workspace show and update outside the Session scope", async () => {
    const fixture = createFixture("workspace-session-scope");
    seedWorkspaceLayout(
      fixture.dataRoot,
      fixture.firstWorkspace.id,
      fixture.firstWorkspace.slug,
    );
    seedWorkspaceLayout(
      fixture.dataRoot,
      fixture.secondWorkspace.id,
      fixture.secondWorkspace.slug,
    );
    const session = startAgentSession({
      workspaceId: fixture.firstWorkspace.id,
      agent: "workspace-scope",
    });
    closeDomainDb();

    for (const args of [
      ["workspace", "show", fixture.secondWorkspace.id],
      ["workspace", "update", fixture.secondWorkspace.id, "--name", "Changed"],
    ]) {
      const result = await runCli([
        "--root",
        fixture.dataRoot,
        "--session",
        session.id,
        ...args,
      ]);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(errorCode(result.stderr)).toBe("E_INPUT_INVALID");
    }
  });

  test("resolved Workspace overrides a conflicting legacy active pointer", async () => {
    const fixture = createFixture("workspace-pointer-conflict");
    seedWorkspaceLayout(
      fixture.dataRoot,
      fixture.firstWorkspace.id,
      fixture.firstWorkspace.slug,
    );
    seedWorkspaceLayout(
      fixture.dataRoot,
      fixture.secondWorkspace.id,
      fixture.secondWorkspace.slug,
    );
    fs.writeFileSync(
      path.join(fixture.dataRoot, "config.json"),
      JSON.stringify({ activeWorkspace: fixture.secondWorkspace.id }),
    );
    closeDomainDb();

    const stats = await runCli([
      "--root",
      fixture.dataRoot,
      "--workspace",
      fixture.firstWorkspace.id,
      "workspace",
      "stats",
    ]);
    const brand = await runCli([
      "--root",
      fixture.dataRoot,
      "--workspace",
      fixture.firstWorkspace.id,
      "brand",
      "create",
      "--name",
      "Scoped Brand",
    ]);

    expect(stats.exitCode, stats.stderr).toBe(0);
    expect(stats.json.workspace).toBe(fixture.firstWorkspace.id);
    expect(brand.exitCode, brand.stderr).toBe(0);
    expect(
      fs.existsSync(
        path.join(
          fixture.dataRoot,
          "workspaces",
          fixture.firstWorkspace.id,
          "shared",
          "brands",
          "scoped-brand.json",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          fixture.dataRoot,
          "workspaces",
          fixture.secondWorkspace.id,
          "shared",
          "brands",
          "scoped-brand.json",
        ),
      ),
    ).toBe(false);
  });

  test("creates a new Workspace while an existing Workspace supplies implicit context", async () => {
    const root = temporaryDirectory("workspace-create-context");
    const dataRoot = path.join(root, ".ralphy");
    fs.mkdirSync(dataRoot);
    setRoot(root);
    createWorkspace({ slug: "existing", name: "Existing" });
    closeDomainDb();

    const result = await runCli([
      "--root",
      dataRoot,
      "workspace",
      "create",
      "new-workspace",
    ]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.json.slug).toBe("new-workspace");
    expect(
      fs.existsSync(
        path.join(dataRoot, "workspaces", "new-workspace", "workspace.json"),
      ),
    ).toBe(true);
  });

  test("lists only the resolved Workspace without rejecting other directories", async () => {
    const fixture = createFixture("workspace-list-context");
    seedWorkspaceLayout(
      fixture.dataRoot,
      fixture.firstWorkspace.id,
      fixture.firstWorkspace.slug,
    );
    seedWorkspaceLayout(
      fixture.dataRoot,
      fixture.secondWorkspace.id,
      fixture.secondWorkspace.slug,
    );
    closeDomainDb();

    const result = await runCli([
      "--root",
      fixture.dataRoot,
      "--workspace",
      fixture.firstWorkspace.id,
      "workspace",
      "list",
    ]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.json.map((item: { slug: string }) => item.slug)).toEqual([
      fixture.firstWorkspace.id,
    ]);
  });

  test("Session derives Project scope from process cwd and never from root-discovery --cwd", async () => {
    const fixture = createFixture("bucket-context");
    const project = createProject({
      workspaceId: fixture.firstWorkspace.id,
      slug: "owned",
      name: "Owned",
    });
    const sibling = createProject({
      workspaceId: fixture.firstWorkspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const session = startAgentSession({
      workspaceId: fixture.firstWorkspace.id,
      projectId: project.id,
      agent: "bucket",
    });
    const siblingSession = startAgentSession({
      workspaceId: fixture.firstWorkspace.id,
      projectId: sibling.id,
      agent: "sibling",
    });
    const cwd = path.join(
      fixture.dataRoot,
      "buckets",
      fixture.firstWorkspace.id,
      "projects",
      project.id,
      "artifacts",
    );
    const siblingCwd = path.join(
      fixture.dataRoot,
      "buckets",
      fixture.firstWorkspace.id,
      "projects",
      sibling.id,
      "artifacts",
    );
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(siblingCwd, { recursive: true });
    closeDomainDb();

    const inferred = await runCli(
      ["--cwd", fixture.root, "session", "list"],
      cwd,
    );
    expect(inferred.exitCode, inferred.stderr).toBe(0);
    expect(inferred.json.items.map((item: { id: string }) => item.id)).toEqual([
      session.id,
    ]);

    const syntheticProject = await runCli(
      ["--cwd", siblingCwd, "session", "list"],
      cwd,
    );
    expect(syntheticProject.exitCode).toBe(0);
    expect(
      syntheticProject.json.items.map((item: { id: string }) => item.id),
    ).toEqual([session.id]);
    expect(syntheticProject.json.items).not.toContainEqual(
      expect.objectContaining({ id: siblingSession.id }),
    );

    const conflict = await runCli(
      ["--cwd", fixture.root, "--project", sibling.id, "session", "list"],
      cwd,
    );
    expect(conflict.exitCode).toBe(2);
    expect(errorCode(conflict.stderr)).toBe("E_INPUT_INVALID");
  });

  test("normal commands derive Project scope from process cwd, not root-discovery --cwd", async () => {
    const fixture = createFixture("normal-bucket-context");
    const project = createProject({
      workspaceId: fixture.firstWorkspace.id,
      slug: "owned",
      name: "Owned",
    });
    const sibling = createProject({
      workspaceId: fixture.firstWorkspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    seedWorkspaceLayout(
      fixture.dataRoot,
      fixture.firstWorkspace.id,
      fixture.firstWorkspace.slug,
    );
    seedProjectRegistry(fixture.dataRoot, fixture.firstWorkspace.id, [
      { id: project.id, name: project.name },
      { id: sibling.id, name: sibling.name },
    ]);
    const cwd = path.join(
      fixture.dataRoot,
      "buckets",
      fixture.firstWorkspace.id,
      "projects",
      project.id,
      "artifacts",
    );
    const siblingCwd = path.join(
      fixture.dataRoot,
      "buckets",
      fixture.firstWorkspace.id,
      "projects",
      sibling.id,
      "artifacts",
    );
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(siblingCwd, { recursive: true });
    closeDomainDb();

    const actualScope = await runCli(
      ["--cwd", fixture.root, "project", "show", sibling.id],
      cwd,
    );
    const syntheticScope = await runCli(
      ["--cwd", siblingCwd, "project", "show", project.id],
      cwd,
    );

    expect(actualScope.exitCode).toBe(2);
    expect(errorCode(actualScope.stderr)).toBe("E_INPUT_INVALID");
    expect(syntheticScope.exitCode, syntheticScope.stderr).toBe(0);
    expect(syntheticScope.json.id).toBe(project.id);
  });

  test("infers only one Workspace and requires scope when more than one exists", async () => {
    const root = temporaryDirectory("workspace-inference");
    fs.mkdirSync(path.join(root, ".ralphy"));
    setRoot(root);
    const workspace = createWorkspace({ slug: "only", name: "Only" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "project",
      name: "Project",
    });
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace",
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "project",
    });
    closeDomainDb();
    const dataRoot = path.join(root, ".ralphy");

    const inferred = await runCli(["--root", dataRoot, "session", "list"]);
    expect(inferred.exitCode).toBe(0);
    expect(
      new Set(inferred.json.items.map((item: { id: string }) => item.id)),
    ).toEqual(new Set([workspaceSession.id, projectSession.id]));

    const projectScoped = await runCli([
      "--root",
      dataRoot,
      "--project",
      project.id,
      "session",
      "list",
    ]);
    expect(projectScoped.exitCode).toBe(0);
    expect(
      projectScoped.json.items.map((item: { id: string }) => item.id),
    ).toEqual([projectSession.id]);

    setRoot(root);
    createWorkspace({ slug: "second", name: "Second" });
    closeDomainDb();
    const ambiguous = await runCli(["--root", dataRoot, "session", "list"]);
    expect(ambiguous.exitCode).toBe(2);
    expect(errorCode(ambiguous.stderr)).toBe("E_INPUT_INVALID");
  });
});

function createFixture(name: string) {
  const root = temporaryDirectory(name);
  fs.mkdirSync(path.join(root, ".ralphy"));
  setRoot(root);
  const firstWorkspace = createWorkspace({ slug: "first", name: "First" });
  const secondWorkspace = createWorkspace({ slug: "second", name: "Second" });
  return {
    root,
    dataRoot: path.join(root, ".ralphy"),
    firstWorkspace,
    secondWorkspace,
  };
}

function temporaryDirectory(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ralphy-context-${name}-`));
  fixtureRoots.push(root);
  return root;
}

function seedWorkspaceLayout(
  dataRoot: string,
  workspaceId: string,
  slug: string,
): void {
  const workspace = path.join(dataRoot, "workspaces", workspaceId);
  fs.mkdirSync(path.join(workspace, "projects"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "units"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "shared", "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "workspace.json"),
    JSON.stringify({ slug, name: slug }),
  );
}

function seedProjectRegistry(
  dataRoot: string,
  workspaceId: string,
  projects: Array<{ id: string; name: string }>,
): void {
  fs.writeFileSync(
    path.join(dataRoot, "registry.json"),
    JSON.stringify({
      projects: Object.fromEntries(
        projects.map((project) => [
          project.id,
          { ...project, workspace: workspaceId },
        ]),
      ),
    }),
  );
  for (const project of projects) {
    fs.mkdirSync(
      path.join(dataRoot, "workspaces", workspaceId, "projects", project.id),
      { recursive: true },
    );
  }
}

async function runCli(args: string[], cwd = REPO): Promise<CliResult> {
  const child = Bun.spawn(["bun", "run", CLI, "--json", ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  let json: any = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    // Error cases intentionally have no stdout payload.
  }
  return { exitCode, stdout, stderr, json };
}

function errorCode(stderr: string): string | null {
  for (const line of stderr.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (parsed?.error?.code) return parsed.error.code;
    } catch {
      // Diagnostics may precede the machine error payload.
    }
  }
  return null;
}
