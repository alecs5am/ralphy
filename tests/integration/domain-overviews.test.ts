import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import {
  createComposition,
  reviseComposition,
} from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { replaceProjectDocumentBinding } from "../../cli/lib/store/document-content.js";
import {
  createDocument,
  reviseDocument,
} from "../../cli/lib/store/documents.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import {
  getProjectOverview,
  getWorkspaceOverview,
} from "../../cli/lib/store/overviews.js";
import { startRun } from "../../cli/lib/store/runs.js";
import {
  addFeedback,
  createIteration,
  createProject,
  createWorkspace,
  upsertSocialAccount,
} from "../../cli/lib/store/scopes.js";
import { createUnit } from "../../cli/lib/store/units.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-domain-overviews");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

async function fixture(root: TmpRoot) {
  const workspace = createWorkspace({ slug: "acme", name: "Acme" });
  const project = createProject({
    workspaceId: workspace.id,
    slug: "launch",
    name: "Launch",
  });
  const sibling = createProject({
    workspaceId: workspace.id,
    slug: "sibling",
    name: "Sibling",
  });
  upsertSocialAccount({
    workspaceId: workspace.id,
    platform: "tiktok",
    externalId: "acme",
    displayName: "Acme",
  });
  const document = createDocument({
    projectId: project.id,
    kind: "brief",
    slug: "brief",
    title: "Brief",
  });
  const first = reviseDocument({
    documentId: document.id,
    expectedHeadId: null,
    format: "text",
    body: "one",
  });
  replaceProjectDocumentBinding({
    context: { workspaceId: workspace.id, projectId: project.id },
    projectId: project.id,
    revisionId: first.id,
    role: "brief",
    expectedRevisionId: null,
  });
  const second = reviseDocument({
    documentId: document.id,
    expectedHeadId: first.id,
    format: "text",
    body: "two",
  });
  const iteration = createIteration({ projectId: project.id, title: "v1" });
  addFeedback({ iterationId: iteration.id, body: "tighten the hook" });
  const composition = createComposition({
    projectId: project.id,
    slug: "cut",
    kind: "video",
  });
  const revision = reviseComposition({
    compositionId: composition.id,
    expectedLatestRevisionId: null,
    engine: "remotion",
  });
  createUnit({ projectId: project.id, slug: "post", format: "video" });
  createUnit({ workspaceId: workspace.id, slug: "shared", format: "post" });
  startRun({ projectId: project.id, kind: "generation" });

  const filePath = path.join(root.dir, "media.png");
  fs.writeFileSync(filePath, "media");
  const object = await ingestObject({
    scope: { workspaceId: workspace.id, projectId: project.id },
    sourcePath: filePath,
    originalName: "media.png",
    mime: "image/png",
    storageClass: "durable",
  });
  const artifact = createArtifact({
    projectId: project.id,
    slug: "hero",
    kind: "image",
  });
  addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
  });
  return {
    workspace,
    project,
    sibling,
    document,
    first,
    second,
    composition,
    revision,
    iteration,
  };
}

describe("workspace overview", () => {
  test("returns one root summary and only the requested sections", async () => {
    const root = makeRoot();
    const { workspace } = await fixture(root);
    const bare = getWorkspaceOverview({
      context: { workspaceId: workspace.id },
      workspaceId: workspace.id,
    });
    expect(Object.keys(bare)).toEqual(["workspace"]);
    expect(Object.keys(bare.workspace).sort()).toEqual([
      "createdAt",
      "id",
      "name",
      "rowVersion",
      "slug",
      "updatedAt",
    ]);

    const withSections = getWorkspaceOverview({
      context: { workspaceId: workspace.id },
      workspaceId: workspace.id,
      sections: {
        accounts: { limit: 10 },
        projects: { limit: 10 },
        units: { limit: 10 },
        activity: { afterSequence: 0, limit: 10 },
      },
    });
    expect(Object.keys(withSections).sort()).toEqual([
      "accounts",
      "activity",
      "projects",
      "units",
      "workspace",
    ]);
    expect(withSections.documents).toBeUndefined();
    expect(Object.keys(withSections.accounts!.items[0]!).sort()).toEqual([
      "createdAt",
      "displayName",
      "externalId",
      "id",
      "platform",
      "updatedAt",
      "username",
      "workspaceId",
    ]);
    // Workspace-scoped sections never leak Project-owned rows.
    expect(withSections.units!.items.map((unit) => unit.slug)).toEqual(["shared"]);
    // Same-millisecond rows tie-break by id, so compare the set.
    expect(
      withSections.projects!.items.map((project) => project.slug).sort(),
    ).toEqual(["launch", "sibling"]);
    expect(
      withSections.activity!.items.every(
        (event) => event.workspaceId === workspace.id,
      ),
    ).toBe(true);
  });

  test("rejects a Workspace the context does not hold", async () => {
    const root = makeRoot();
    const { workspace } = await fixture(root);
    const other = createWorkspace({ slug: "other", name: "Other" });
    expect(() =>
      getWorkspaceOverview({
        context: { workspaceId: other.id },
        workspaceId: workspace.id,
      }),
    ).toThrow(/not found/i);
  });
});

describe("project overview", () => {
  test("returns every section with its exact DTO allowlist", async () => {
    const root = makeRoot();
    const { workspace, project, document, first, second, revision } =
      await fixture(root);
    const overview = getProjectOverview({
      context: { workspaceId: workspace.id, projectId: project.id },
      projectId: project.id,
      sections: {
        documents: { limit: 10 },
        iterations: { limit: 10 },
        feedback: { limit: 10 },
        stages: { limit: 10 },
        compositions: { limit: 10 },
        builds: { limit: 10 },
        units: { limit: 10 },
        runs: { limit: 10 },
        activity: { afterSequence: 0, limit: 50 },
        mediaCounts: true,
      },
    });
    expect(overview.project.id).toBe(project.id);

    const overviewDocument = overview.documents!.items[0]!;
    expect(Object.keys(overviewDocument).sort()).toEqual([
      "binding",
      "createdAt",
      "currentRevisionId",
      "id",
      "kind",
      "projectId",
      "rowVersion",
      "slug",
      "title",
      "updatedAt",
      "workspaceId",
    ]);
    // The binding still points at revision one while the head moved to two.
    expect(overviewDocument.binding).toEqual({
      ownerType: "project",
      ownerId: project.id,
      role: "brief",
      documentId: document.id,
      boundRevisionId: first.id,
      currentHeadRevisionId: second.id,
      hasNewerHead: true,
    });

    expect(Object.keys(overview.iterations!.items[0]!).sort()).toEqual([
      "closedAt",
      "createdAt",
      "id",
      "number",
      "projectId",
      "state",
      "title",
    ]);
    expect(Object.keys(overview.feedback!.items[0]!).sort()).toEqual([
      "createdAt",
      "id",
      "iterationId",
      "projectId",
      "resolvedAt",
      "status",
      "targetId",
      "targetType",
    ]);
    const composition = overview.compositions!.items[0]!;
    expect(Object.keys(composition).sort()).toEqual([
      "createdAt",
      "id",
      "kind",
      "latestRevisionId",
      "projectId",
      "selectedRevisionId",
      "slug",
      "updatedAt",
    ]);
    // Compositions store no latest pointer, so it is derived by revision number.
    expect(composition.latestRevisionId).toBe(revision.id);
    expect(composition.selectedRevisionId).toBeNull();
    expect(Object.keys(overview.runs!.items[0]!).sort()).toEqual([
      "createdAt",
      "endedAt",
      "id",
      "kind",
      "label",
      "projectId",
      "startedAt",
      "state",
      "workspaceId",
    ]);
    expect(overview.units!.items.map((unit) => unit.slug)).toEqual(["post"]);
    expect(overview.mediaCounts).toEqual({
      artifacts: 1,
      objects: 1,
      runObjects: 0,
    });
    expect(overview.builds!.items).toEqual([]);
    expect(overview.stages!.items).toEqual([]);
    expect(
      overview.activity!.items.every((event) => event.projectId === project.id),
    ).toBe(true);
    // No section carries a payload, body, locator, or hash.
    expect(JSON.stringify(overview)).not.toMatch(
      /"(payload|body|bucket|key|sha256|path|metadata|report)"/,
    );
  });

  test("pages each section independently with its own cursor", async () => {
    const root = makeRoot();
    const { workspace, project } = await fixture(root);
    for (let index = 0; index < 4; index += 1) {
      createIteration({ projectId: project.id, title: `extra-${index}` });
    }
    const seen: string[] = [];
    let after: string | null = null;
    for (;;) {
      const page = getProjectOverview({
        context: { workspaceId: workspace.id, projectId: project.id },
        projectId: project.id,
        sections: { iterations: { after, limit: 2 } },
      }).iterations!;
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor === null) break;
      expect(page.nextCursor.startsWith("c1.")).toBe(true);
      after = page.nextCursor;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  test("bounds every section limit to fifty and rejects a foreign cursor family", async () => {
    const root = makeRoot();
    const { workspace, project } = await fixture(root);
    const request = (sections: Record<string, unknown>) =>
      getProjectOverview({
        context: { workspaceId: workspace.id, projectId: project.id },
        projectId: project.id,
        sections: sections as never,
      });
    expect(() => request({ iterations: { limit: 51 } })).toThrow(/limit/i);
    expect(() => request({ iterations: { limit: 0 } })).toThrow(/limit/i);
    expect(() => request({ activity: { afterSequence: 0, limit: 51 } })).toThrow(
      /limit/i,
    );
    expect(() =>
      request({ iterations: { after: "p1.W1sxLCJhIl0", limit: 5 } }),
    ).toThrow(/cursor/i);
    expect(() => request({ iterations: { limit: 50 } })).not.toThrow();
  });

  test("refuses a sibling Project and a Project outside the context Workspace", async () => {
    const root = makeRoot();
    const { workspace, project, sibling } = await fixture(root);
    const other = createWorkspace({ slug: "outside", name: "Outside" });
    expect(() =>
      getProjectOverview({
        context: { workspaceId: workspace.id, projectId: sibling.id },
        projectId: project.id,
      }),
    ).toThrow(/not found/i);
    expect(() =>
      getProjectOverview({
        context: { workspaceId: other.id },
        projectId: project.id,
      }),
    ).toThrow(/not found/i);
  });

  test("is unchanged by a poison farm tree and touches no farm descendant", async () => {
    const root = makeRoot();
    const { workspace, project } = await fixture(root);
    const sections = {
      documents: { limit: 10 },
      compositions: { limit: 10 },
      runs: { limit: 10 },
      activity: { afterSequence: 0, limit: 50 },
      mediaCounts: true,
    } as const;
    const before = getProjectOverview({
      context: { workspaceId: workspace.id, projectId: project.id },
      projectId: project.id,
      sections,
    });

    const farm = path.join(root.dir, ".ralphy", "farm");
    fs.mkdirSync(path.join(farm, "buckets", "poison"), { recursive: true });
    fs.writeFileSync(path.join(farm, "identity.json"), "{}");
    fs.writeFileSync(path.join(farm, "buckets", "poison", "object.bin"), "x");

    const mutableFs = fs as unknown as {
      openSync: typeof fs.openSync;
      readdirSync: typeof fs.readdirSync;
      lstatSync: typeof fs.lstatSync;
    };
    const original = {
      openSync: mutableFs.openSync,
      readdirSync: mutableFs.readdirSync,
      lstatSync: mutableFs.lstatSync,
    };
    const touched: string[] = [];
    const trap = (name: keyof typeof original) => {
      mutableFs[name] = ((...args: unknown[]) => {
        const value = String(args[0]);
        if (value.includes(`${path.sep}farm${path.sep}`)) touched.push(value);
        return (original[name] as (...a: unknown[]) => unknown)(...args);
      }) as never;
    };
    let after: ReturnType<typeof getProjectOverview>;
    try {
      trap("openSync");
      trap("readdirSync");
      trap("lstatSync");
      after = getProjectOverview({
        context: { workspaceId: workspace.id, projectId: project.id },
        projectId: project.id,
        sections,
      });
    } finally {
      mutableFs.openSync = original.openSync;
      mutableFs.readdirSync = original.readdirSync;
      mutableFs.lstatSync = original.lstatSync;
    }
    expect(touched).toEqual([]);
    expect(after).toEqual(before);
  });

  test("resolves a Session context to the same visibility", async () => {
    const root = makeRoot();
    const { workspace, project } = await fixture(root);
    const db = openDomainDb();
    const sessionId = "session_overview";
    db.prepare(
      `INSERT INTO agent_sessions (id, workspace_id, project_id, agent, started_at)
       VALUES (?, ?, ?, 'agent', 1)`,
    ).run(sessionId, workspace.id, project.id);
    expect(
      getProjectOverview({
        context: { sessionId },
        projectId: project.id,
        sections: { runs: { limit: 5 } },
      }).runs!.items,
    ).toHaveLength(1);
  });
});
