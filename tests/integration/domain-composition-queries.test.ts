import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import {
  bindCompositionInput,
  cancelBuild,
  completeBuild,
  createComposition,
  failBuild,
  getBuild,
  getBuildOutput,
  getComposition,
  getCompositionInput,
  getCompositionRevision,
  getCompositionSource,
  listBuildOutputs,
  listBuilds,
  listCompositionInputs,
  listCompositionRevisions,
  listCompositionSources,
  listCompositions,
  putCompositionSource,
  removeCompositionInput,
  removeCompositionSource,
  reviseComposition,
  sealCompositionRevision,
  selectCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { encodeCursor } from "../../cli/lib/store/pagination.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import { startRun } from "../../cli/lib/store/runs.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const COMPOSITION_KEYS = [
  "createdAt",
  "id",
  "kind",
  "latestRevisionId",
  "projectId",
  "selectedRevisionId",
  "slug",
  "updatedAt",
] as const;
const REVISION_KEYS = [
  "authoredBySessionId",
  "compositionId",
  "createdAt",
  "engine",
  "engineVersion",
  "id",
  "iterationId",
  "parentRevisionId",
  "revisionNo",
  "sealedAt",
  "state",
] as const;
const SOURCE_KEYS = [
  "compositionRevisionId",
  "createdAt",
  "id",
  "objectId",
  "position",
] as const;
const INPUT_KEYS = [
  "artifactRevisionId",
  "compositionRevisionId",
  "createdAt",
  "id",
  "position",
  "role",
] as const;
const BUILD_KEYS = [
  "compositionRevisionId",
  "createdAt",
  "finishedAt",
  "id",
  "runId",
  "state",
] as const;
const OUTPUT_KEYS = [
  "artifactRevisionId",
  "buildId",
  "createdAt",
  "id",
  "position",
  "role",
] as const;

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-composition-queries");
  roots.push(root);
  return root;
}

function expectKeys(value: object, keys: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

async function storedObject(
  root: TmpRoot,
  workspaceId: string,
  projectId: string,
  name: string,
) {
  const sourcePath = path.join(root.dir, name);
  fs.writeFileSync(sourcePath, `bytes:${name}`);
  return ingestObject({
    scope: { workspaceId, projectId },
    sourcePath,
    originalName: name,
    mime: "application/octet-stream",
    storageClass: "working",
  });
}

async function fixture(label: string) {
  const root = makeRoot();
  const workspace = createWorkspace({ slug: `workspace-${label}`, name: "Workspace" });
  const project = createProject({
    workspaceId: workspace.id,
    slug: `project-${label}`,
    name: "Project",
  });
  const object = await storedObject(root, workspace.id, project.id, `${label}.bin`);
  const artifact = createArtifact({
    projectId: project.id,
    slug: `artifact-${label}`,
    kind: "data",
  });
  const artifactRevision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
  });
  const composition = createComposition({
    projectId: project.id,
    slug: `composition-${label}`,
    kind: "custom",
  });
  const draft = reviseComposition({
    compositionId: composition.id,
    expectedLatestRevisionId: null,
    engine: "manual",
    engineConfig: { privateEngineOption: "stored-only" },
  });
  const source = putCompositionSource({
    revisionId: draft.id,
    logicalPath: "private/index.bin",
    objectId: object.id,
    position: 0,
  });
  const input = bindCompositionInput({
    revisionId: draft.id,
    artifactRevisionId: artifactRevision.id,
    role: "primary",
    position: 0,
    config: { privateInputOption: "stored-only" },
  });
  const revision = sealCompositionRevision({ revisionId: draft.id });
  const selected = selectCompositionRevision({
    compositionId: composition.id,
    revisionId: revision.id,
    expectedSelectedRevisionId: null,
  });
  const run = startRun({ projectId: project.id, kind: "build" });
  const startedBuild = startBuild({
    compositionRevisionId: revision.id,
    runId: run.id,
    profile: { privateProfileOption: "stored-only" },
  });
  const build = completeBuild({
    buildId: startedBuild.id,
    outputs: [
      { artifactRevisionId: artifactRevision.id, role: "preview", position: 0 },
    ],
  });
  const outputId = openDomainDb()
    .query<{ id: string }, [string]>(
      "SELECT id FROM build_outputs WHERE build_id = ? AND position = 0",
    )
    .get(build.id)!.id;
  return {
    root,
    workspace,
    project,
    object,
    artifactRevision,
    composition,
    draft,
    source,
    input,
    revision,
    selected,
    startedBuild,
    build,
    outputId,
  };
}

describe("bounded Composition and Build queries", () => {
  test("mutation returns expose exact safe DTOs while private facts stay stored", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "safe-mutations", name: "Workspace" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "safe-mutations",
      name: "Project",
    });
    const object = await storedObject(root, workspace.id, project.id, "safe.bin");
    const artifact = createArtifact({ projectId: project.id, slug: "safe", kind: "data" });
    const artifactRevision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "approved",
    });

    const composition = createComposition({
      projectId: project.id,
      slug: "safe",
      kind: "custom",
    });
    expectKeys(composition, COMPOSITION_KEYS);
    const draft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig: { secret: "engine" },
    });
    expectKeys(draft, REVISION_KEYS);

    const source = putCompositionSource({
      revisionId: draft.id,
      logicalPath: "private/source.bin",
      objectId: object.id,
      position: 0,
    });
    expectKeys(source, SOURCE_KEYS);
    expectKeys(
      removeCompositionSource({ revisionId: draft.id, logicalPath: "private/source.bin" }),
      SOURCE_KEYS,
    );
    const storedSource = putCompositionSource({
      revisionId: draft.id,
      logicalPath: "private/source.bin",
      objectId: object.id,
      position: 0,
    });

    const input = bindCompositionInput({
      revisionId: draft.id,
      artifactRevisionId: artifactRevision.id,
      role: "primary",
      position: 0,
      config: { secret: "input" },
    });
    expectKeys(input, INPUT_KEYS);
    expectKeys(removeCompositionInput({ revisionId: draft.id, position: 0 }), INPUT_KEYS);
    const storedInput = bindCompositionInput({
      revisionId: draft.id,
      artifactRevisionId: artifactRevision.id,
      role: "primary",
      position: 0,
      config: { secret: "input" },
    });

    const revision = sealCompositionRevision({ revisionId: draft.id });
    expectKeys(revision, REVISION_KEYS);
    expectKeys(
      selectCompositionRevision({
        compositionId: composition.id,
        revisionId: revision.id,
        expectedSelectedRevisionId: null,
      }),
      COMPOSITION_KEYS,
    );

    const succeededRun = startRun({ projectId: project.id, kind: "build" });
    const running = startBuild({
      compositionRevisionId: revision.id,
      runId: succeededRun.id,
      profile: { secret: "profile" },
    });
    expectKeys(running, BUILD_KEYS);
    expectKeys(
      completeBuild({
        buildId: running.id,
        outputs: [{ artifactRevisionId: artifactRevision.id, position: 0 }],
      }),
      BUILD_KEYS,
    );

    const failedRun = startRun({ projectId: project.id, kind: "build" });
    const failed = startBuild({
      compositionRevisionId: revision.id,
      runId: failedRun.id,
      profile: {},
    });
    expectKeys(failBuild(failed.id, { error: "private renderer response" }), BUILD_KEYS);
    const cancelledRun = startRun({ projectId: project.id, kind: "build" });
    const cancelled = startBuild({
      compositionRevisionId: revision.id,
      runId: cancelledRun.id,
      profile: {},
    });
    expectKeys(cancelBuild(cancelled.id, { error: "private cancellation note" }), BUILD_KEYS);

    const db = openDomainDb();
    expect(
      db.query<
        { engineConfig: string; manifest: string | null },
        [string]
      >(
        `SELECT engine_config_json AS engineConfig, manifest_sha256 AS manifest
         FROM composition_revisions WHERE id = ?`,
      ).get(revision.id),
    ).toEqual({ engineConfig: '{"secret":"engine"}', manifest: expect.any(String) });
    expect(
      db.query<{ logicalPath: string }, [string]>(
        "SELECT logical_path AS logicalPath FROM composition_revision_files WHERE id = ?",
      ).get(storedSource.id),
    ).toEqual({ logicalPath: "private/source.bin" });
    expect(
      db.query<{ config: string | null }, [string]>(
        "SELECT config_json AS config FROM composition_inputs WHERE id = ?",
      ).get(storedInput.id),
    ).toEqual({ config: '{"secret":"input"}' });
    expect(
      db.query<{ profile: string }, [string]>(
        "SELECT profile_json AS profile FROM builds WHERE id = ?",
      ).get(running.id),
    ).toEqual({ profile: '{"secret":"profile"}' });
    expect(
      db.query<{ error: string | null }, [string]>(
        "SELECT error FROM builds WHERE id = ?",
      ).get(failed.id),
    ).toEqual({ error: "private renderer response" });
  });

  test("detail and list APIs expose only their exact DTO allowlists", async () => {
    const value = await fixture("allowlists");
    const context = {
      workspaceId: value.workspace.id,
      projectId: value.project.id,
    };
    const composition = getComposition({ context, compositionId: value.composition.id });
    const revision = getCompositionRevision({ context, revisionId: value.revision.id });
    const source = getCompositionSource({ context, sourceId: value.source.id });
    const input = getCompositionInput({ context, inputId: value.input.id });
    const build = getBuild({ context, buildId: value.build.id });
    const output = getBuildOutput({ context, outputId: value.outputId });

    expectKeys(composition, COMPOSITION_KEYS);
    expect(composition.latestRevisionId).toBe(value.revision.id);
    expectKeys(revision, REVISION_KEYS);
    expectKeys(source, SOURCE_KEYS);
    expect("logicalPath" in source).toBe(false);
    expectKeys(input, INPUT_KEYS);
    expectKeys(build, BUILD_KEYS);
    expectKeys(output, OUTPUT_KEYS);

    expectKeys(
      listCompositions({ context, projectId: value.project.id, limit: 10 }).items[0]!,
      COMPOSITION_KEYS,
    );
    expectKeys(
      listCompositionRevisions({ context, compositionId: value.composition.id, limit: 10 })
        .items[0]!,
      REVISION_KEYS,
    );
    expectKeys(
      listCompositionSources({ context, revisionId: value.revision.id, limit: 10 }).items[0]!,
      SOURCE_KEYS,
    );
    expectKeys(
      listCompositionInputs({ context, revisionId: value.revision.id, limit: 10 }).items[0]!,
      INPUT_KEYS,
    );
    expectKeys(
      listBuilds({ context, compositionRevisionId: value.revision.id, limit: 10 }).items[0]!,
      BUILD_KEYS,
    );
    expectKeys(
      listBuildOutputs({ context, buildId: value.build.id, limit: 10 }).items[0]!,
      OUTPUT_KEYS,
    );
  });

  test("c1 root traversal handles 101 equal timestamps without gaps or duplicates", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "root-pages", name: "Workspace" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "root-pages",
      name: "Project",
    });
    const db = openDomainDb();
    const insert = db.prepare(
      `INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at)
       VALUES (?, ?, ?, 'custom', 1, 1)`,
    );
    const ids = Array.from({ length: 101 }, (_, index) =>
      `comp-page-${String(100 - index).padStart(3, "0")}`,
    );
    db.transaction(() => {
      for (const id of ids) insert.run(id, project.id, id);
    })();

    const seen: string[] = [];
    let after: string | null | undefined;
    do {
      const page = listCompositions({
        context: { workspaceId: workspace.id },
        projectId: project.id,
        after,
        limit: 17,
      });
      seen.push(...page.items.map((item) => item.id));
      after = page.nextCursor;
    } while (after !== null);

    expect(seen).toEqual([...ids].sort());
    expect(new Set(seen).size).toBe(101);
  });

  test("newest history pages traverse 55 Composition revisions and Builds", async () => {
    const value = await fixture("newest-history");
    const { composition, project } = value;
    const context = { workspaceId: value.workspace.id, projectId: project.id };
    const revisions = [value.revision];
    let latestRevisionId = value.revision.id;
    for (let index = 1; index < 55; index += 1) {
      const draft = reviseComposition({
        compositionId: composition.id,
        expectedLatestRevisionId: latestRevisionId,
        engine: "manual",
      });
      const revision = sealCompositionRevision({ revisionId: draft.id });
      revisions.push(revision);
      latestRevisionId = revision.id;
    }

    const buildIds = Array.from(
      { length: 55 },
      (_, index) => `build-history-${String(index + 1).padStart(3, "0")}`,
    );
    const runs = buildIds.map(() => startRun({ projectId: project.id, kind: "build" }));
    const insertBuild = openDomainDb().prepare(
      `INSERT INTO builds
       (id, composition_revision_id, run_id, state, profile_json, created_at, started_at)
       VALUES (?, ?, ?, 'running', '{}', 1000, 1000)`,
    );
    openDomainDb().transaction(() => {
      for (const [index, id] of buildIds.entries()) {
        insertBuild.run(id, revisions[1]!.id, runs[index]!.id);
      }
    })();

    const oldestRevisions = listCompositionRevisions({
      context,
      compositionId: composition.id,
      limit: 50,
    });
    expect(oldestRevisions.items.map((item) => item.revisionNo))
      .toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(oldestRevisions.nextCursor?.startsWith("v1.")).toBe(true);
    expect(listCompositionRevisions({
      context,
      compositionId: composition.id,
      order: "oldest",
      after: oldestRevisions.nextCursor,
      limit: 50,
    }).items.map((item) => item.revisionNo)).toEqual([51, 52, 53, 54, 55]);

    const newestRevisions = listCompositionRevisions({
      context,
      compositionId: composition.id,
      order: "newest",
      limit: 50,
    });
    expect(newestRevisions.items.map((item) => item.revisionNo))
      .toEqual(Array.from({ length: 50 }, (_, index) => 55 - index));
    expect(newestRevisions.nextCursor?.startsWith("v2.")).toBe(true);
    expect(listCompositionRevisions({
      context,
      compositionId: composition.id,
      order: "newest",
      after: newestRevisions.nextCursor,
      limit: 50,
    })).toMatchObject({
      items: [5, 4, 3, 2, 1].map((revisionNo) => ({ revisionNo })),
      nextCursor: null,
    });

    const oldestBuilds = listBuilds({
      context,
      compositionRevisionId: revisions[1]!.id,
      limit: 50,
    });
    expect(oldestBuilds.items.map((item) => item.id)).toEqual(buildIds.slice(0, 50));
    expect(oldestBuilds.nextCursor?.startsWith("c1.")).toBe(true);
    expect(listBuilds({
      context,
      compositionRevisionId: revisions[1]!.id,
      order: "oldest",
      after: oldestBuilds.nextCursor,
      limit: 50,
    }).items.map((item) => item.id)).toEqual(buildIds.slice(50));

    const newestBuilds = listBuilds({
      context,
      compositionRevisionId: revisions[1]!.id,
      order: "newest",
      limit: 50,
    });
    expect(newestBuilds.items.map((item) => item.id)).toEqual([...buildIds].reverse().slice(0, 50));
    expect(newestBuilds.items[0]!.id).toBe(buildIds[54]);
    expect(newestBuilds.nextCursor?.startsWith("c2.")).toBe(true);
    expect(listBuilds({
      context,
      compositionRevisionId: revisions[1]!.id,
      order: "newest",
      after: newestBuilds.nextCursor,
      limit: 50,
    })).toMatchObject({
      items: [...buildIds].reverse().slice(50).map((id) => ({ id })),
      nextCursor: null,
    });

    expect(() => listCompositionRevisions({
      context,
      compositionId: composition.id,
      order: "newest",
      after: oldestRevisions.nextCursor,
      limit: 1,
    })).toThrow(/cursor/i);
    expect(() => listCompositionRevisions({
      context,
      compositionId: composition.id,
      after: newestRevisions.nextCursor,
      limit: 1,
    })).toThrow(/cursor/i);
    expect(() => listCompositionRevisions({
      context,
      compositionId: composition.id,
      order: "sideways" as never,
      limit: 1,
    })).toThrow(/order/i);
    expect(() => listBuilds({
      context,
      compositionRevisionId: revisions[1]!.id,
      order: "newest",
      after: oldestBuilds.nextCursor,
      limit: 1,
    })).toThrow(/cursor/i);
    expect(() => listBuilds({
      context,
      compositionRevisionId: revisions[1]!.id,
      after: newestBuilds.nextCursor,
      limit: 1,
    })).toThrow(/cursor/i);
    expect(() => listBuilds({
      context,
      compositionRevisionId: revisions[1]!.id,
      order: "sideways" as never,
      limit: 1,
    })).toThrow(/order/i);
  });

  test("nested histories use v1 or p1 and Builds use c1", async () => {
    const value = await fixture("nested-pages");
    const context = {
      workspaceId: value.workspace.id,
      projectId: value.project.id,
    };
    const v2 = reviseComposition({
      compositionId: value.composition.id,
      expectedLatestRevisionId: value.revision.id,
      engine: "manual",
    });
    putCompositionSource({
      revisionId: v2.id,
      logicalPath: "second.bin",
      objectId: value.object.id,
      position: 1,
    });
    bindCompositionInput({
      revisionId: v2.id,
      artifactRevisionId: value.artifactRevision.id,
      role: "secondary",
      position: 1,
    });

    const revisions1 = listCompositionRevisions({
      context,
      compositionId: value.composition.id,
      limit: 1,
    });
    expect(revisions1.items.map((item) => item.revisionNo)).toEqual([1]);
    expect(revisions1.nextCursor?.startsWith("v1.")).toBe(true);
    expect(
      listCompositionRevisions({
        context,
        compositionId: value.composition.id,
        after: revisions1.nextCursor,
        limit: 1,
      }).items.map((item) => item.revisionNo),
    ).toEqual([2]);

    const sources1 = listCompositionSources({ context, revisionId: v2.id, limit: 1 });
    expect(sources1.items.map((item) => item.position)).toEqual([0]);
    expect(sources1.nextCursor?.startsWith("p1.")).toBe(true);
    expect(
      listCompositionSources({
        context,
        revisionId: v2.id,
        after: sources1.nextCursor,
        limit: 1,
      }).items.map((item) => item.position),
    ).toEqual([1]);

    const inputs1 = listCompositionInputs({ context, revisionId: v2.id, limit: 1 });
    expect(inputs1.nextCursor?.startsWith("p1.")).toBe(true);
    expect(
      listCompositionInputs({
        context,
        revisionId: v2.id,
        after: inputs1.nextCursor,
        limit: 1,
      }).items.map((item) => item.position),
    ).toEqual([1]);

    const outputRun = startRun({ projectId: value.project.id, kind: "build" });
    const outputBuild = startBuild({
      compositionRevisionId: value.revision.id,
      runId: outputRun.id,
      profile: {},
    });
    completeBuild({
      buildId: outputBuild.id,
      outputs: [
        { artifactRevisionId: value.artifactRevision.id, position: 0 },
        { artifactRevisionId: value.artifactRevision.id, position: 1 },
      ],
    });
    const outputs1 = listBuildOutputs({ context, buildId: outputBuild.id, limit: 1 });
    expect(outputs1.nextCursor?.startsWith("p1.")).toBe(true);
    expect(
      listBuildOutputs({
        context,
        buildId: outputBuild.id,
        after: outputs1.nextCursor,
        limit: 1,
      }).items.map((item) => item.position),
    ).toEqual([1]);

    const firstRun = startRun({ projectId: value.project.id, kind: "build" });
    const secondRun = startRun({ projectId: value.project.id, kind: "build" });
    const db = openDomainDb();
    const insertBuild = db.prepare(
      `INSERT INTO builds
       (id, composition_revision_id, run_id, state, profile_json, created_at, started_at)
       VALUES (?, ?, ?, 'running', '{}', 1, 1)`,
    );
    insertBuild.run("build-z", value.revision.id, firstRun.id);
    insertBuild.run("build-a", value.revision.id, secondRun.id);
    const builds1 = listBuilds({
      context,
      compositionRevisionId: value.revision.id,
      limit: 1,
    });
    expect(builds1.items.map((item) => item.id)).toEqual(["build-a"]);
    expect(builds1.nextCursor?.startsWith("c1.")).toBe(true);
    expect(
      listBuilds({
        context,
        compositionRevisionId: value.revision.id,
        after: builds1.nextCursor,
        limit: 1,
      }).items.map((item) => item.id),
    ).toEqual(["build-z"]);

    expect(() =>
      listCompositions({
        context,
        projectId: value.project.id,
        after: encodeCursor("v1", { ordinal: 1, id: "x" }),
        limit: 1,
      }),
    ).toThrow(/cursor/i);
    expect(() =>
      listCompositionRevisions({
        context,
        compositionId: value.composition.id,
        after: encodeCursor("c1", { ordinal: 1, id: "x" }),
        limit: 1,
      }),
    ).toThrow(/cursor/i);
    expect(() =>
      listCompositionSources({
        context,
        revisionId: v2.id,
        after: encodeCursor("c1", { ordinal: 1, id: "x" }),
        limit: 1,
      }),
    ).toThrow(/cursor/i);
    expect(() =>
      listBuilds({
        context,
        compositionRevisionId: value.revision.id,
        after: encodeCursor("p1", { ordinal: 1, id: "x" }),
        limit: 1,
      }),
    ).toThrow(/cursor/i);

    const lists = [
      (limit: number) => listCompositions({ context, projectId: value.project.id, limit }),
      (limit: number) =>
        listCompositionRevisions({ context, compositionId: value.composition.id, limit }),
      (limit: number) => listCompositionSources({ context, revisionId: v2.id, limit }),
      (limit: number) => listCompositionInputs({ context, revisionId: v2.id, limit }),
      (limit: number) =>
        listBuilds({ context, compositionRevisionId: value.revision.id, limit }),
      (limit: number) => listBuildOutputs({ context, buildId: outputBuild.id, limit }),
    ];
    for (const list of lists) {
      for (const limit of [0, 1.5, 101]) expect(() => list(limit)).toThrow(/limit/i);
    }
  });

  test("Workspace scope sees its Projects while Project scope stays exact", async () => {
    const value = await fixture("visibility");
    const sibling = createProject({
      workspaceId: value.workspace.id,
      slug: "visibility-sibling",
      name: "Sibling",
    });
    const foreignWorkspace = createWorkspace({ slug: "visibility-foreign", name: "Foreign" });
    const foreignProject = createProject({
      workspaceId: foreignWorkspace.id,
      slug: "visibility-foreign",
      name: "Foreign",
    });
    const workspaceSession = startAgentSession({
      workspaceId: value.workspace.id,
      agent: "workspace-reader",
    });
    const projectSession = startAgentSession({
      workspaceId: value.workspace.id,
      projectId: value.project.id,
      agent: "project-reader",
    });
    const ended = startAgentSession({
      workspaceId: value.workspace.id,
      projectId: value.project.id,
      agent: "ended-reader",
    });
    endAgentSession(ended.id);

    expect(
      getComposition({
        context: { workspaceId: value.workspace.id },
        compositionId: value.composition.id,
      }).id,
    ).toBe(value.composition.id);
    expect(
      getBuildOutput({
        context: { sessionId: workspaceSession.id },
        outputId: value.outputId,
      }).id,
    ).toBe(value.outputId);
    expect(
      getCompositionRevision({
        context: { sessionId: projectSession.id },
        revisionId: value.revision.id,
      }).id,
    ).toBe(value.revision.id);

    for (const context of [
      { workspaceId: value.workspace.id, projectId: sibling.id },
      { workspaceId: foreignWorkspace.id, projectId: foreignProject.id },
    ]) {
      expect(() =>
        getComposition({ context, compositionId: value.composition.id }),
      ).toThrow(/not found/i);
      expect(() => getBuildOutput({ context, outputId: value.outputId })).toThrow(
        /not found/i,
      );
    }
    expect(() =>
      getComposition({
        context: { sessionId: ended.id },
        compositionId: value.composition.id,
      }),
    ).toThrow(/ended/i);
    expect(() =>
      listCompositions({
        context: { workspaceId: value.workspace.id, projectId: sibling.id },
        projectId: value.project.id,
        limit: 10,
      }),
    ).toThrow(/not found/i);
  });
});
