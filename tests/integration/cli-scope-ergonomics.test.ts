// #573: scope and required-flag ergonomics for agents.
//
// The #562 baseline counted 42 `ralphy` usage errors: 23 Workspace / Project
// scope errors (slug passed for an id, several Workspaces and no scope, a
// conflict with the immutable Session) and 19 missing required flags. These
// tests pin the fixes:
//   - Workspace and Project slugs resolve to exactly one id, else the error
//     lists the candidates (id + slug + name); there is still no implicit
//     current Workspace.
//   - Scope errors list the valid choices; a Session conflict names the
//     Session's scope and the conflicting value.
//   - Compatibility verbs that address a Project by slug no longer conflict
//     with the resolved scope.
//   - `ralphy models ...` needs no Workspace scope.
//   - A missing required flag prints one example invocation.

import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveCommandContext, resolveCommandScope } from "../../cli/lib/context.js";
import {
  assertCommandProject,
  assertCommandWorkspace,
  clearCommandContext,
  setCommandContext,
} from "../../cli/lib/context-state.js";
import { setRoot } from "../../cli/lib/paths.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { startAgentSession } from "../../cli/lib/store/sessions.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

const roots: string[] = [];

afterEach(() => {
  clearCommandContext();
  closeDomainDb();
  setRoot(REPO);
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-scope-573-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, ".ralphy"));
  setRoot(root);
  const alpha = createWorkspace({ slug: "alpha", name: "Alpha Brand" });
  const beta = createWorkspace({ slug: "beta", name: "Beta Brand" });
  const promoA = createProject({ workspaceId: alpha.id, slug: "promo", name: "Promo A" });
  const promoB = createProject({ workspaceId: beta.id, slug: "promo", name: "Promo B" });
  const solo = createProject({ workspaceId: alpha.id, slug: "solo", name: "Solo" });
  const session = startAgentSession({ workspaceId: alpha.id, projectId: solo.id, agent: "test" });
  closeDomainDb();
  return { root, dataRoot: path.join(root, ".ralphy"), alpha, beta, promoA, promoB, solo, session };
}

function inputErrorDetail(run: () => unknown): { field: string; detail: string } {
  try {
    run();
  } catch (error) {
    const details = (error as { code?: string; details?: { field: string; detail: string } }).details;
    expect((error as { code?: string }).code).toBe("E_INPUT_INVALID");
    return details!;
  }
  throw new Error("expected E_INPUT_INVALID");
}

async function cli(args: string[], cwd = REPO) {
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
    // Error cases have no stdout payload.
  }
  return { exitCode, stdout, stderr, json };
}

describe("slug resolution (#573)", () => {
  test("a Workspace slug resolves to its id; the id still works", () => {
    const f = fixture();
    expect(resolveCommandContext({ dataRoot: f.dataRoot, workspaceId: "alpha" })).toEqual({
      kind: "scope",
      workspaceId: f.alpha.id,
    });
    expect(resolveCommandContext({ dataRoot: f.dataRoot, workspaceId: f.beta.id })).toEqual({
      kind: "scope",
      workspaceId: f.beta.id,
    });
    expect(resolveCommandScope({ dataRoot: f.dataRoot, workspaceId: "alpha" }).labels).toEqual({
      workspaceSlug: "alpha",
    });
  });

  test("a Project slug resolves within the explicit Workspace (slug or id)", () => {
    const f = fixture();
    for (const workspaceId of ["alpha", f.alpha.id]) {
      expect(
        resolveCommandContext({ dataRoot: f.dataRoot, workspaceId, projectId: "promo" }),
      ).toEqual({ kind: "scope", workspaceId: f.alpha.id, projectId: f.promoA.id });
    }
    expect(
      resolveCommandScope({ dataRoot: f.dataRoot, workspaceId: "beta", positionalProjectId: "promo" }),
    ).toEqual({
      context: { kind: "scope", workspaceId: f.beta.id, projectId: f.promoB.id },
      labels: { workspaceSlug: "beta", projectSlug: "promo" },
    });
    // A unique slug needs no Workspace at all.
    expect(resolveCommandContext({ dataRoot: f.dataRoot, projectId: "solo" })).toEqual({
      kind: "scope",
      workspaceId: f.alpha.id,
      projectId: f.solo.id,
    });
  });

  test("an ambiguous Project slug lists every candidate with id, slug, name and Workspace", () => {
    const f = fixture();
    const { field, detail } = inputErrorDetail(() =>
      resolveCommandContext({ dataRoot: f.dataRoot, projectId: "promo" }),
    );
    expect(field).toBe("--project");
    expect(detail).toContain('Project "promo" is ambiguous: it matches 2 Projects');
    expect(detail).toContain(`promo (${f.promoA.id}, "Promo A", Workspace alpha)`);
    expect(detail).toContain(`promo (${f.promoB.id}, "Promo B", Workspace beta)`);
    expect(detail).toContain("--workspace <id|slug>");
  });

  test("a Project outside the explicit Workspace names the Workspace that owns it", () => {
    const f = fixture();
    const bySlug = inputErrorDetail(() =>
      resolveCommandContext({ dataRoot: f.dataRoot, workspaceId: "beta", projectId: "solo" }),
    );
    expect(bySlug.field).toBe("--workspace");
    expect(bySlug.detail).toContain(`it exists as solo (${f.solo.id}, "Solo", Workspace alpha)`);
    expect(bySlug.detail).toContain(`Example: --workspace ${f.alpha.id}`);

    const byId = inputErrorDetail(() =>
      resolveCommandContext({ dataRoot: f.dataRoot, workspaceId: "beta", projectId: f.solo.id }),
    );
    expect(byId.detail).toContain(`is not in Workspace beta (${f.beta.id}, "Beta Brand")`);
  });

  test("unknown references list the valid choices", () => {
    const f = fixture();
    const workspace = inputErrorDetail(() =>
      resolveCommandContext({ dataRoot: f.dataRoot, workspaceId: "alph" }),
    );
    expect(workspace.field).toBe("--workspace");
    expect(workspace.detail).toContain('Workspace not found: "alph"');
    expect(workspace.detail).toContain(`alpha (${f.alpha.id}, "Alpha Brand")`);
    expect(workspace.detail).toContain(`beta (${f.beta.id}, "Beta Brand")`);
    expect(workspace.detail).toContain(`Example: --workspace ${f.alpha.id}`);

    const project = inputErrorDetail(() =>
      resolveCommandContext({ dataRoot: f.dataRoot, workspaceId: "alpha", projectId: "nope" }),
    );
    expect(project.field).toBe("--project");
    expect(project.detail).toContain('Project not found: "nope"');
    expect(project.detail).toContain("Recent Projects in Workspace alpha");
    expect(project.detail).toContain(`solo (${f.solo.id}`);
    expect(project.detail).not.toContain(f.promoB.id);
  });

  test("several Workspaces and no scope: refuse, list them, show an example --workspace <id>", () => {
    const f = fixture();
    const { field, detail } = inputErrorDetail(() =>
      resolveCommandContext({ dataRoot: f.dataRoot }),
    );
    expect(field).toBe("--workspace");
    // The leading phrase is what scripts/lib/session-report classifies on.
    expect(detail.startsWith("more than one Workspace exists")).toBe(true);
    expect(detail).toContain(`alpha (${f.alpha.id}, "Alpha Brand")`);
    expect(detail).toContain(`beta (${f.beta.id}, "Beta Brand")`);
    expect(detail).toContain(`Example: --workspace ${f.alpha.id}`);
  });

  test("hostile reference text is flattened into a single bounded line", () => {
    const f = fixture();
    const { detail } = inputErrorDetail(() =>
      resolveCommandContext({ dataRoot: f.dataRoot, workspaceId: `x\n"y"${"z".repeat(500)}` }),
    );
    expect(detail).not.toMatch(/[\n\r]/);
    expect(Buffer.byteLength(detail, "utf8")).toBeLessThan(2_048);
  });
});

describe("immutable Session scope (#573)", () => {
  test("a Session conflict names the Session's scope and the conflicting value", () => {
    const f = fixture();
    const project = inputErrorDetail(() =>
      resolveCommandContext({ dataRoot: f.dataRoot, sessionId: f.session.id, positionalProjectId: "promo" }),
    );
    expect(project.field).toBe("--project");
    expect(project.detail).toContain(`Project "promo" (${f.promoA.id}) conflicts with the immutable Agent Session scope`);
    expect(project.detail).toContain(
      `Session ${f.session.id} is bound to Workspace alpha (${f.alpha.id}, "Alpha Brand") and Project solo (${f.solo.id})`,
    );
    expect(project.detail).toContain(`Pass solo or ${f.solo.id}`);

    const workspace = inputErrorDetail(() =>
      resolveCommandContext({ dataRoot: f.dataRoot, sessionId: f.session.id, workspaceId: "beta" }),
    );
    expect(workspace.field).toBe("--workspace");
    expect(workspace.detail).toContain(`Workspace "beta" (${f.beta.id}) conflicts with the immutable Agent Session scope`);
    expect(workspace.detail).toContain(`Session ${f.session.id} is bound to Workspace alpha`);
  });

  test("the Session's own Project and Workspace slugs do not conflict", () => {
    const f = fixture();
    expect(
      resolveCommandScope({
        dataRoot: f.dataRoot,
        sessionId: f.session.id,
        workspaceId: "alpha",
        positionalProjectId: "solo",
      }),
    ).toEqual({
      context: { kind: "session", sessionId: f.session.id, workspaceId: f.alpha.id, projectId: f.solo.id },
      labels: { workspaceSlug: "alpha", projectSlug: "solo" },
    });
  });

  test("compatibility verbs may name the resolved scope by slug", () => {
    const f = fixture();
    setCommandContext(
      { kind: "session", sessionId: f.session.id, workspaceId: f.alpha.id, projectId: f.solo.id },
      { workspaceSlug: "alpha", projectSlug: "solo" },
    );
    expect(() => assertCommandProject("solo", "alpha")).not.toThrow();
    expect(() => assertCommandProject(f.solo.id, f.alpha.id)).not.toThrow();
    expect(() => assertCommandWorkspace("alpha")).not.toThrow();

    const project = inputErrorDetail(() => assertCommandProject("promo"));
    expect(project.field).toBe("project");
    // "conflicts with the immutable command scope" is the session-report category.
    expect(project.detail).toContain('Project "promo" conflicts with the immutable command scope');
    expect(project.detail).toContain(
      `Session ${f.session.id}: Workspace alpha (${f.alpha.id}), Project solo (${f.solo.id})`,
    );
    expect(project.detail).toContain(`pass solo or ${f.solo.id}`);
    const workspace = inputErrorDetail(() => assertCommandWorkspace("beta"));
    expect(workspace.detail).toContain('Workspace "beta" conflicts with the immutable command scope');
  });
});

describe("CLI surface (#573)", () => {
  test("--workspace <slug> works end to end and the scope error lists choices", async () => {
    const f = fixture();
    const bySlug = await cli(["--root", f.dataRoot, "--workspace", "alpha", "session", "list"]);
    expect(bySlug.exitCode, bySlug.stderr).toBe(0);
    expect(bySlug.json.items.map((item: { id: string }) => item.id)).toEqual([f.session.id]);

    const scopeless = await cli(["--root", f.dataRoot, "session", "list"]);
    expect(scopeless.exitCode).toBe(2);
    const message = JSON.parse(scopeless.stderr.trim().split("\n").at(-1)!).error.message as string;
    expect(message).toContain("more than one Workspace exists");
    expect(message).toContain(`Example: --workspace ${f.alpha.id}`);

    const project = await cli(["--root", f.dataRoot, "--workspace", "beta", "project", "status", "promo"]);
    expect(project.exitCode, project.stderr).toBe(0);
    expect(project.json.project.id).toBe(f.promoB.id);
  });

  test("a compatibility verb under a Session accepts the Session Project's slug", async () => {
    const f = fixture();
    const registry = {
      projects: { solo: { id: "solo", name: "Solo", workspace: "alpha", kind: "video" } },
    };
    fs.writeFileSync(path.join(f.dataRoot, "registry.json"), JSON.stringify(registry));
    fs.mkdirSync(path.join(f.dataRoot, "workspaces", "alpha", "projects", "solo", "logs"), {
      recursive: true,
    });
    const result = await cli([
      "--root",
      f.dataRoot,
      "--session",
      f.session.id,
      "project",
      "log-prompt",
      "solo",
      "--text",
      "make it brighter",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.json).toEqual({ project: "solo", logged: "user-prompt" });
  });

  test("models is scope-free: no --workspace needed on a library with several Workspaces", async () => {
    const f = fixture();
    const list = await cli(["--root", f.dataRoot, "models", "list", "--registry"]);
    expect(list.exitCode, list.stderr).toBe(0);
    expect(list.json.source).toBe("MODELS.md");
    const show = await cli(["--root", f.dataRoot, "models", "show", "google/gemini-3-pro-image-preview"]);
    expect(show.exitCode, show.stderr).toBe(0);
    expect(show.json.id).toBe("google/gemini-3-pro-image-preview");
  });

  test("a missing required flag prints one example invocation", async () => {
    const f = fixture();
    const migrate = await cli(["migrate", "status", "--source", f.dataRoot]);
    expect(migrate.exitCode).toBe(1);
    expect(migrate.stderr).toContain("error: required option '--run-id <id>' not specified");
    expect(migrate.stderr).toContain("Example:\n  ralphy migrate status --run-id <run-id from migrate run> --source .ralphy");

    const activity = await cli(["--root", f.dataRoot, "--workspace", "alpha", "activity", "list"]);
    expect(activity.exitCode).toBe(1);
    expect(activity.stderr).toContain("error: required option '--since <event-id>' not specified");
    expect(activity.stderr).toContain("ralphy activity list --workspace <workspace> --since 0");
    expect(activity.stderr.match(/Example:/g)).toHaveLength(1);
  });
});
