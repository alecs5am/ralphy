import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import {
  bindCompositionInput,
  createComposition,
  reviseComposition,
  sealCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { replaceProjectDocumentBinding } from "../../cli/lib/store/document-content.js";
import {
  createDocument,
  reviseDocument,
} from "../../cli/lib/store/documents.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { encodeCursor } from "../../cli/lib/store/pagination.js";
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
import { withPoisonFarmReadTrap } from "../helpers/poison-farm.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

const ACTIVITY_KEYS = [
  "action",
  "createdAt",
  "entityId",
  "entityType",
  "projectId",
  "sequence",
  "workspaceId",
] as const;
const PROJECT_KEYS = [
  "createdAt",
  "id",
  "name",
  "rowVersion",
  "slug",
  "state",
  "updatedAt",
  "workspaceId",
] as const;
const UNIT_KEYS = [
  "createdAt",
  "format",
  "id",
  "latestRevisionId",
  "projectId",
  "selectedRevisionId",
  "slug",
  "updatedAt",
  "workspaceId",
] as const;
const WORKSPACE_KEYS = [
  "createdAt",
  "id",
  "name",
  "rowVersion",
  "slug",
  "updatedAt",
] as const;

function expectKeys(value: object, keys: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

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
  const workspaceDocument = createDocument({
    workspaceId: workspace.id,
    kind: "style-guide",
    slug: "style",
    title: "Workspace style",
  });
  reviseDocument({
    documentId: workspaceDocument.id,
    expectedHeadId: null,
    format: "text",
    body: "workspace style",
  });
  const shadowedWorkspaceDocument = createDocument({
    workspaceId: workspace.id,
    kind: "brief",
    slug: "brief",
    title: "Workspace brief",
  });
  reviseDocument({
    documentId: shadowedWorkspaceDocument.id,
    expectedHeadId: null,
    format: "text",
    body: "workspace brief",
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
  const artifactRevision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
  });
  bindCompositionInput({
    revisionId: revision.id,
    artifactRevisionId: artifactRevision.id,
    role: "primary",
    position: 0,
  });
  sealCompositionRevision({ revisionId: revision.id });
  const buildRun = startRun({ projectId: project.id, kind: "build" });
  const build = startBuild({
    compositionRevisionId: revision.id,
    runId: buildRun.id,
    profile: { quality: "preview" },
  });
  const stageId = "stage_overview_ready";
  openDomainDb()
    .prepare(
      `INSERT INTO project_stages
       (id, project_id, stage, state, entity_type, entity_id, metadata_json,
        row_version, updated_at)
       VALUES (?, ?, 'render', 'ready', 'build', ?, '{}', 1, 1)`,
    )
    .run(stageId, project.id, build.id);
  return {
    workspace,
    project,
    sibling,
    workspaceDocument,
    shadowedWorkspaceDocument,
    document,
    first,
    second,
    composition,
    revision,
    iteration,
    build,
    stageId,
  };
}

describe("workspace overview", () => {
  test("returns one root summary and only the requested sections", async () => {
    const root = makeRoot();
    const { workspace } = await fixture(root);
    const bare = getWorkspaceOverview({
      context: { workspaceId: workspace.id },
      workspaceId: workspace.id,
      sections: {},
    });
    expect(Object.keys(bare)).toEqual(["workspace"]);
    expectKeys(bare.workspace, WORKSPACE_KEYS);

    const withSections = getWorkspaceOverview({
      context: { workspaceId: workspace.id },
      workspaceId: workspace.id,
      sections: {
        documents: { limit: 10 },
        accounts: { limit: 10 },
        projects: { limit: 10 },
        units: { limit: 10 },
        activity: { afterSequence: 0, limit: 10 },
      },
    });
    expect(Object.keys(withSections).sort()).toEqual([
      "accounts",
      "activity",
      "documents",
      "projects",
      "units",
      "workspace",
    ]);
    expect(withSections.documents!.items.map((item) => item.slug).sort()).toEqual([
      "brief",
      "style",
    ]);
    expect(Object.keys(withSections.documents!.items[0]!).sort()).toEqual([
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
    expect(Object.keys(withSections.accounts!.items[0]!).sort()).toEqual([
      "createdAt",
      "credentialConfigured",
      "credentialSource",
      "displayName",
      "externalId",
      "id",
      "platform",
      "relinkRequired",
      "rowVersion",
      "updatedAt",
      "username",
      "workspaceId",
    ]);
    // Workspace-scoped sections never leak Project-owned rows.
    expect(withSections.units!.items.map((unit) => unit.slug)).toEqual(["shared"]);
    expectKeys(withSections.units!.items[0]!, UNIT_KEYS);
    // Same-millisecond rows tie-break by id, so compare the set.
    expect(
      withSections.projects!.items.map((project) => project.slug).sort(),
    ).toEqual(["launch", "sibling"]);
    for (const project of withSections.projects!.items) {
      expectKeys(project, PROJECT_KEYS);
    }
    expect(
      withSections.activity!.items.every(
        (event) => event.workspaceId === workspace.id,
      ),
    ).toBe(true);
    for (const event of withSections.activity!.items) {
      expectKeys(event, ACTIVITY_KEYS);
    }

    const independentSections = [
      ["documents", { documents: { limit: 10 } }],
      ["accounts", { accounts: { limit: 10 } }],
      ["projects", { projects: { limit: 10 } }],
      ["units", { units: { limit: 10 } }],
      ["activity", { activity: { afterSequence: 0, limit: 10 } }],
    ] as const;
    for (const [name, sections] of independentSections) {
      const one = getWorkspaceOverview({
        context: { workspaceId: workspace.id },
        workspaceId: workspace.id,
        sections,
      }) as unknown as Record<string, unknown>;
      expect(Object.keys(one).sort()).toEqual(["workspace", name].sort());
      const page = one[name] as { items: unknown[] };
      expect(Object.keys(page).sort()).toEqual(["items", "nextCursor"]);
      expect(page.items.length).toBeGreaterThan(0);
    }
  });

  test("requires an explicit sections object at runtime", async () => {
    const root = makeRoot();
    const { workspace } = await fixture(root);
    expect(() =>
      getWorkspaceOverview({
        context: { workspaceId: workspace.id },
        workspaceId: workspace.id,
      } as never),
    ).toThrow(/sections.*required/i);
  });

  test("rejects a Workspace the context does not hold", async () => {
    const root = makeRoot();
    const { workspace } = await fixture(root);
    const other = createWorkspace({ slug: "other", name: "Other" });
    expect(() =>
      getWorkspaceOverview({
        context: { workspaceId: other.id },
        workspaceId: workspace.id,
        sections: {},
      }),
    ).toThrow(/not found/i);
  });
});

describe("project overview", () => {
  test("returns every section with its exact DTO allowlist", async () => {
    const root = makeRoot();
    const {
      workspace,
      project,
      workspaceDocument,
      shadowedWorkspaceDocument,
      document,
      first,
      second,
      revision,
      build,
      stageId,
    } =
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
    expectKeys(overview.project, PROJECT_KEYS);
    expect(overview.project.id).toBe(project.id);
    expect(Object.keys(overview).sort()).toEqual([
      "activity",
      "builds",
      "compositions",
      "documents",
      "feedback",
      "iterations",
      "mediaCounts",
      "project",
      "runs",
      "stages",
      "units",
    ]);

    expect(overview.documents!.items.map((item) => item.id).sort()).toEqual(
      [workspaceDocument.id, document.id].sort(),
    );
    expect(overview.documents!.items.map((item) => item.id)).not.toContain(
      shadowedWorkspaceDocument.id,
    );
    const overviewDocument = overview.documents!.items.find(
      (item) => item.id === document.id,
    )!;
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
    expectKeys(overview.units!.items[0]!, UNIT_KEYS);
    expect(overview.mediaCounts).toEqual({
      artifacts: 1,
      objects: 1,
      runObjects: 0,
    });
    expect(
      overview.documents!.items.find((item) => item.id === workspaceDocument.id)!
        .binding,
    ).toBeNull();
    expect(overview.builds!.items).toEqual([
      {
        id: build.id,
        compositionRevisionId: revision.id,
        runId: build.runId,
        state: "running",
        createdAt: build.createdAt,
        finishedAt: null,
      },
    ]);
    expect(Object.keys(overview.builds!.items[0]!).sort()).toEqual([
      "compositionRevisionId",
      "createdAt",
      "finishedAt",
      "id",
      "runId",
      "state",
    ]);
    expect(overview.stages!.items.map((stage) => stage.id)).toEqual([stageId]);
    expect(Object.keys(overview.stages!.items[0]!).sort()).toEqual([
      "entityId",
      "entityType",
      "id",
      "projectId",
      "rowVersion",
      "stage",
      "state",
      "updatedAt",
    ]);
    expect(
      overview.activity!.items.every((event) => event.projectId === project.id),
    ).toBe(true);
    for (const event of overview.activity!.items) {
      expectKeys(event, ACTIVITY_KEYS);
    }
    // No section carries a payload, body, locator, or hash.
    expect(JSON.stringify(overview)).not.toMatch(
      /"(payload|body|bucket|key|sha256|path|metadata|report)"/,
    );
  });

  test("requires an explicit sections object at runtime", async () => {
    const root = makeRoot();
    const { workspace, project } = await fixture(root);
    expect(() =>
      getProjectOverview({
        context: { workspaceId: workspace.id, projectId: project.id },
        projectId: project.id,
      } as never),
    ).toThrow(/sections.*required/i);
  });

  test("returns every section independently and pages with its own cursor", async () => {
    const root = makeRoot();
    const { workspace, project } = await fixture(root);
    const independentSections = [
      ["documents", { documents: { limit: 10 } }],
      ["iterations", { iterations: { limit: 10 } }],
      ["feedback", { feedback: { limit: 10 } }],
      ["stages", { stages: { limit: 10 } }],
      ["compositions", { compositions: { limit: 10 } }],
      ["builds", { builds: { limit: 10 } }],
      ["units", { units: { limit: 10 } }],
      ["runs", { runs: { limit: 10 } }],
      ["activity", { activity: { afterSequence: 0, limit: 50 } }],
    ] as const;
    for (const [name, sections] of independentSections) {
      const one = getProjectOverview({
        context: { workspaceId: workspace.id, projectId: project.id },
        projectId: project.id,
        sections,
      }) as unknown as Record<string, unknown>;
      expect(Object.keys(one).sort()).toEqual(["project", name].sort());
      const page = one[name] as { items: unknown[] };
      expect(Object.keys(page).sort()).toEqual(["items", "nextCursor"]);
      expect(page.items.length).toBeGreaterThan(0);
    }
    const counts = getProjectOverview({
      context: { workspaceId: workspace.id, projectId: project.id },
      projectId: project.id,
      sections: { mediaCounts: true },
    });
    expect(Object.keys(counts).sort()).toEqual(["mediaCounts", "project"]);

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
    const foreignCursor = encodeCursor("p1", { ordinal: 1, id: "a" });
    const request = (sections: Record<string, unknown>) =>
      getProjectOverview({
        context: { workspaceId: workspace.id, projectId: project.id },
        projectId: project.id,
        sections: sections as never,
      });
    const pagedSections = [
      "documents",
      "iterations",
      "feedback",
      "stages",
      "compositions",
      "builds",
      "units",
      "runs",
    ];
    for (const section of pagedSections) {
      expect(() => request({ [section]: { limit: 51 } })).toThrow(/limit/i);
      expect(() =>
        request({ [section]: { after: foreignCursor, limit: 5 } }),
      ).toThrow(/cursor/i);
    }
    expect(() => request({ iterations: { limit: 0 } })).toThrow(/limit/i);
    expect(() => request({ activity: { afterSequence: 0, limit: 51 } })).toThrow(
      /limit/i,
    );
    expect(() => request({ iterations: { limit: 50 } })).not.toThrow();

    const workspaceRequest = (sections: Record<string, unknown>) =>
      getWorkspaceOverview({
        context: { workspaceId: workspace.id },
        workspaceId: workspace.id,
        sections: sections as never,
      });
    for (const section of ["documents", "units", "accounts", "projects"]) {
      expect(() => workspaceRequest({ [section]: { limit: 51 } })).toThrow(
        /limit/i,
      );
      expect(() =>
        workspaceRequest({
          [section]: { after: foreignCursor, limit: 5 },
        }),
      ).toThrow(/cursor/i);
    }
    expect(() =>
      workspaceRequest({ activity: { afterSequence: 0, limit: 51 } }),
    ).toThrow(/limit/i);
    for (const afterSequence of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      999.5,
      -1,
      undefined,
    ]) {
      expect(() =>
        request({ activity: { afterSequence, limit: 5 } }),
      ).toThrow(/afterSequence|integer/i);
      expect(() =>
        workspaceRequest({ activity: { afterSequence, limit: 5 } }),
      ).toThrow(/afterSequence|integer/i);
    }
  });

  test("refuses a sibling Project and a Project outside the context Workspace", async () => {
    const root = makeRoot();
    const { workspace, project, sibling } = await fixture(root);
    const other = createWorkspace({ slug: "outside", name: "Outside" });
    expect(() =>
      getProjectOverview({
        context: { workspaceId: workspace.id, projectId: sibling.id },
        projectId: project.id,
        sections: {},
      }),
    ).toThrow(/not found/i);
    expect(() =>
      getProjectOverview({
        context: { workspaceId: other.id },
        projectId: project.id,
        sections: {},
      }),
    ).toThrow(/not found/i);
  });

  test("is unchanged by a poison farm tree and touches no farm descendant", async () => {
    const root = makeRoot();
    const { workspace, project } = await fixture(root);
    const workspaceSections = {
      documents: { limit: 10 },
      units: { limit: 10 },
      accounts: { limit: 10 },
      projects: { limit: 10 },
      activity: { afterSequence: 0, limit: 50 },
    } as const;
    const projectSections = {
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
    } as const;
    const before = {
      workspace: getWorkspaceOverview({
        context: { workspaceId: workspace.id },
        workspaceId: workspace.id,
        sections: workspaceSections,
      }),
      project: getProjectOverview({
        context: { workspaceId: workspace.id, projectId: project.id },
        projectId: project.id,
        sections: projectSections,
      }),
    };

    const trapped = withPoisonFarmReadTrap(root.dir, () => ({
      workspace: getWorkspaceOverview({
        context: { workspaceId: workspace.id },
        workspaceId: workspace.id,
        sections: workspaceSections,
      }),
      project: getProjectOverview({
        context: { workspaceId: workspace.id, projectId: project.id },
        projectId: project.id,
        sections: projectSections,
      }),
    }));
    expect(trapped.touched).toEqual([]);
    expect(trapped.result).toEqual(before);
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
    ).toHaveLength(2);
  });
});
