import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
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
  getComposition,
  putCompositionSource,
  removeCompositionInput,
  removeCompositionSource,
  reviseComposition,
  sealCompositionRevision,
  selectCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import {
  closeDomainDb,
  domainDbPath,
  openDomainDb,
} from "../../cli/lib/store/db.js";
import {
  bindBuildDocument,
  createDocument,
  reviseDocument,
} from "../../cli/lib/store/documents.js";
import {
  ingestObject,
  resolveObjectPath,
} from "../../cli/lib/store/objects.js";
import {
  createIteration,
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import { getRun, startRun } from "../../cli/lib/store/runs.js";
import type {
  ObjectRow,
  ProjectRow,
  WorkspaceRow,
} from "../../cli/lib/store/types.js";
import { StoreConflictError } from "../../cli/lib/store/types.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { scopedActivity } from "../helpers/activity.js";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain Composition store", () => {
  test("creates a generic Project Composition", () => {
    roots.push(makeTmpRoot("ralphy-domain-compositions-create"));
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });

    const composition = createComposition({
      projectId: project.id,
      slug: "main-cut",
      kind: "video",
    });

    expect(getComposition(composition.id)).toMatchObject({
      id: composition.id,
      projectId: project.id,
      slug: "main-cut",
      kind: "video",
      selectedRevisionId: null,
      revisions: [],
    });
  });

  test("revises across engines, clones an explicit parent, and keeps selection independent", async () => {
    const { root, workspace, project } = setupProject("revision");
    const source = await storeBytes(root, workspace, project, "index.html");
    const sceneObject = await storeBytes(
      root,
      workspace,
      project,
      "scene.mp4",
    );
    const sceneArtifact = createArtifact({
      projectId: project.id,
      slug: "scene",
      kind: "video",
    });
    const scene = addArtifactRevision({
      artifactId: sceneArtifact.id,
      objectId: sceneObject.id,
      state: "approved",
    });
    const composition = createComposition({
      projectId: project.id,
      slug: "main-cut",
      kind: "video",
    });
    const iteration = createIteration({
      projectId: project.id,
      title: "Initial cut",
    });
    const v1 = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      iterationId: iteration.id,
      engine: "hyperframes",
      engineVersion: "1.0.0",
      engineConfig: { z: 2, a: 1 },
    });
    putCompositionSource({
      revisionId: v1.id,
      logicalPath: "index.html",
      objectId: source.id,
    });
    bindCompositionInput({
      revisionId: v1.id,
      artifactRevisionId: scene.id,
      role: "scene",
      position: 0,
      config: { trim: { end: 3, start: 0 } },
    });
    const sealedV1 = sealCompositionRevision({ revisionId: v1.id });
    for (const mutate of [
      () =>
        putCompositionSource({
          revisionId: v1.id,
          logicalPath: "index.html",
          objectId: source.id,
        }),
      () =>
        removeCompositionSource({
          revisionId: v1.id,
          logicalPath: "index.html",
        }),
      () =>
        bindCompositionInput({
          revisionId: v1.id,
          artifactRevisionId: scene.id,
          role: "scene",
          position: 0,
        }),
      () => removeCompositionInput({ revisionId: v1.id, position: 0 }),
    ]) {
      expect(mutate).toThrow(/sealed/i);
    }
    selectCompositionRevision({
      compositionId: composition.id,
      revisionId: v1.id,
      expectedSelectedRevisionId: null,
    });

    const v2 = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: v1.id,
      engine: "remotion",
      engineConfig: {},
    });
    const afterV2 = getComposition(composition.id);
    expect(v2).toMatchObject({
      revisionNo: 2,
      parentRevisionId: v1.id,
      engine: "remotion",
      state: "draft",
    });
    expect(afterV2.selectedRevisionId).toBe(v1.id);
    expect(afterV2.revisions[1]).toMatchObject({
      id: v2.id,
      iterationId: null,
      authoredBySessionId: null,
      sources: [
        expect.objectContaining({
          logicalPath: "index.html",
          objectId: source.id,
          position: 0,
        }),
      ],
      inputs: [
        expect.objectContaining({
          artifactRevisionId: scene.id,
          role: "scene",
          position: 0,
        }),
      ],
      builds: [],
    });
    expect(afterV2.revisions[1]?.sources[0]?.id).not.toBe(
      afterV2.revisions[0]?.sources[0]?.id,
    );
    expect(afterV2.revisions[1]?.inputs[0]?.id).not.toBe(
      afterV2.revisions[0]?.inputs[0]?.id,
    );

    removeCompositionSource({
      revisionId: v2.id,
      logicalPath: "index.html",
    });
    removeCompositionInput({ revisionId: v2.id, position: 0 });
    expect(getComposition(composition.id).revisions[1]).toMatchObject({
      sources: [],
      inputs: [],
    });
    expect(() =>
      reviseComposition({
        compositionId: composition.id,
        expectedLatestRevisionId: v1.id,
        engine: "manual",
        engineConfig: {},
      }),
    ).toThrow(/conflict/i);

    const branch = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: v2.id,
      parentRevisionId: v1.id,
      engine: "html",
      engineConfig: {},
    });
    expect(branch).toMatchObject({ revisionNo: 3, parentRevisionId: v1.id });
    expect(getComposition(composition.id).revisions[2]).toMatchObject({
      sources: [expect.objectContaining({ logicalPath: "index.html" })],
      inputs: [expect.objectContaining({ artifactRevisionId: scene.id })],
    });
    expect(sealedV1.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("validates latest, parent, Iteration, Session, engine, and JSON before revision insertion", () => {
    const { workspace, project } = setupProject("revision-validation");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "revision-outside",
      name: "Outside",
    });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const ownIteration = createIteration({
      projectId: project.id,
      title: "Own",
    });
    const siblingIteration = createIteration({
      projectId: sibling.id,
      title: "Sibling",
    });
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace-agent",
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "project-agent",
    });
    const siblingSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: sibling.id,
      agent: "sibling-agent",
    });
    const outsideSession = startAgentSession({
      workspaceId: outsideWorkspace.id,
      projectId: outsideProject.id,
      agent: "outside-agent",
    });
    const endedSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "ended-agent",
    });
    endAgentSession(endedSession.id);
    const composition = createComposition({
      projectId: project.id,
      slug: "validated",
      kind: "custom",
    });

    expect(() =>
      reviseComposition({
        compositionId: composition.id,
        engine: "manual",
      } as never),
    ).toThrow(/expectedLatestRevisionId/i);
    expect(() =>
      reviseComposition({
        compositionId: composition.id,
        expectedLatestRevisionId: null,
        engine: "not a slug",
      }),
    ).toThrow(/slug/i);
    for (const engineConfig of [
      { value: Number.NaN },
      { fileData: "SGVsbG8=" },
      { value: "data:text/plain,hello" },
      new Date(),
    ]) {
      expect(() =>
        reviseComposition({
          compositionId: composition.id,
          expectedLatestRevisionId: null,
          engine: "manual",
          engineConfig: engineConfig as never,
        }),
      ).toThrow();
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      reviseComposition({
        compositionId: composition.id,
        expectedLatestRevisionId: null,
        engine: "manual",
        engineConfig: cyclic as never,
      }),
    ).toThrow(/cycle/i);

    const v1 = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      iterationId: ownIteration.id,
      engine: "manual",
      engineConfig: {},
      authoredBySessionId: projectSession.id,
    });
    expect(v1).toMatchObject({
      iterationId: ownIteration.id,
      authoredBySessionId: projectSession.id,
    });
    expect(() =>
      reviseComposition({
        compositionId: composition.id,
        expectedLatestRevisionId: v1.id,
        parentRevisionId: null,
        engine: "manual",
      }),
    ).toThrow(/first/i);
    expect(() =>
      reviseComposition({
        compositionId: composition.id,
        expectedLatestRevisionId: v1.id,
        iterationId: siblingIteration.id,
        engine: "manual",
      }),
    ).toThrow(/Iteration/i);
    for (const authoredBySessionId of [
      siblingSession.id,
      outsideSession.id,
      endedSession.id,
    ]) {
      expect(() =>
        reviseComposition({
          compositionId: composition.id,
          expectedLatestRevisionId: v1.id,
          engine: "manual",
          authoredBySessionId,
        }),
      ).toThrow(/Session/i);
    }
    const v2 = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: v1.id,
      engine: "manual",
      authoredBySessionId: workspaceSession.id,
    });
    expect(v2.authoredBySessionId).toBe(workspaceSession.id);

    const foreign = createComposition({
      projectId: project.id,
      slug: "foreign-parent",
      kind: "custom",
    });
    const foreignV1 = reviseComposition({
      compositionId: foreign.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    expect(() =>
      reviseComposition({
        compositionId: composition.id,
        expectedLatestRevisionId: v2.id,
        parentRevisionId: foreignV1.id,
        engine: "manual",
      }),
    ).toThrow(/parent/i);
    expect(getComposition(composition.id).revisions).toHaveLength(2);
  });

  test("upserts ordered draft sources and inputs while enforcing exact byte and Project scope", async () => {
    const { root, workspace, project } = setupProject("children");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "children-outside",
      name: "Outside",
    });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const sharedObject = await storeBytes(
      root,
      workspace,
      null,
      "shared.html",
    );
    const localObject = await storeBytes(
      root,
      workspace,
      project,
      "local.html",
    );
    const replacementObject = await storeBytes(
      root,
      workspace,
      project,
      "replacement.html",
    );
    const siblingObject = await storeBytes(
      root,
      workspace,
      sibling,
      "sibling.html",
    );
    const outsideObject = await storeBytes(
      root,
      outsideWorkspace,
      outsideProject,
      "outside.html",
    );
    const sharedRevision = artifactRevisionFor(
      workspace,
      null,
      sharedObject,
      "shared-input",
    );
    const localRevision = artifactRevisionFor(
      workspace,
      project,
      localObject,
      "local-input",
    );
    const siblingRevision = artifactRevisionFor(
      workspace,
      sibling,
      siblingObject,
      "sibling-input",
    );
    const outsideRevision = artifactRevisionFor(
      outsideWorkspace,
      outsideProject,
      outsideObject,
      "outside-input",
    );
    const composition = createComposition({
      projectId: project.id,
      slug: "children",
      kind: "video",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "hyperframes",
    });

    putCompositionSource({
      revisionId: revision.id,
      logicalPath: "src/second.html",
      objectId: sharedObject.id,
      position: 1,
    });
    const first = putCompositionSource({
      revisionId: revision.id,
      logicalPath: "index.html",
      objectId: localObject.id,
      position: 0,
    });
    const replaced = putCompositionSource({
      revisionId: revision.id,
      logicalPath: "index.html",
      objectId: replacementObject.id,
    });
    expect(replaced).toMatchObject({
      id: first.id,
      objectId: replacementObject.id,
      position: 0,
    });
    expect(() =>
      putCompositionSource({
        revisionId: revision.id,
        logicalPath: "third.html",
        objectId: localObject.id,
        position: 1,
      }),
    ).toThrow(StoreConflictError);
    for (const logicalPath of [
      "",
      "/index.html",
      "../index.html",
      "src/../index.html",
      "src\\index.html",
      "C:/index.html",
      "data:text/html,hello",
      "https://example.com/index.html",
    ]) {
      expect(() =>
        putCompositionSource({
          revisionId: revision.id,
          logicalPath,
          objectId: localObject.id,
        }),
      ).toThrow(/logicalPath/i);
    }
    for (const objectId of [siblingObject.id, outsideObject.id]) {
      expect(() =>
        putCompositionSource({
          revisionId: revision.id,
          logicalPath: `${objectId}.html`,
          objectId,
        }),
      ).toThrow(/scope/i);
    }

    bindCompositionInput({
      revisionId: revision.id,
      artifactRevisionId: localRevision.id,
      role: "scene",
      position: 1,
      config: { z: 2, a: 1 },
    });
    bindCompositionInput({
      revisionId: revision.id,
      artifactRevisionId: sharedRevision.id,
      role: "scene",
      position: 0,
    });
    const rebound = bindCompositionInput({
      revisionId: revision.id,
      artifactRevisionId: sharedRevision.id,
      role: "scene",
      position: 1,
      config: {},
    });
    expect(rebound.position).toBe(1);
    for (const artifactRevisionId of [
      siblingRevision.id,
      outsideRevision.id,
    ]) {
      expect(() =>
        bindCompositionInput({
          revisionId: revision.id,
          artifactRevisionId,
          role: "scene",
          position: 2,
        }),
      ).toThrow(/scope/i);
    }

    const missingObject = await storeBytes(
      root,
      workspace,
      project,
      "missing.html",
    );
    fs.rmSync(resolveObjectPath(missingObject));
    expect(() =>
      putCompositionSource({
        revisionId: revision.id,
        logicalPath: "missing.html",
        objectId: missingObject.id,
      }),
    ).toThrow(/missing/i);
    const missingRevision = artifactRevisionFor(
      workspace,
      project,
      replacementObject,
      "missing-input",
    );
    fs.rmSync(resolveObjectPath(replacementObject));
    expect(() =>
      bindCompositionInput({
        revisionId: revision.id,
        artifactRevisionId: missingRevision.id,
        role: "scene",
        position: 2,
      }),
    ).toThrow(/missing/i);

    const symlinkObject = await storeBytes(
      root,
      workspace,
      project,
      "symlink.bin",
    );
    const symlinkRevision = artifactRevisionFor(
      workspace,
      project,
      symlinkObject,
      "symlink-input",
    );
    const symlinkTarget = path.join(root.dir, "symlink-target.bin");
    fs.writeFileSync(symlinkTarget, "symlink-target");
    const symlinkPath = resolveObjectPath(symlinkObject);
    fs.rmSync(symlinkPath);
    fs.symlinkSync(symlinkTarget, symlinkPath);
    expect(() =>
      putCompositionSource({
        revisionId: revision.id,
        logicalPath: "symlink.bin",
        objectId: symlinkObject.id,
      }),
    ).toThrow(/regular file|symlink/i);
    expect(() =>
      bindCompositionInput({
        revisionId: revision.id,
        artifactRevisionId: symlinkRevision.id,
        role: "scene",
        position: 2,
      }),
    ).toThrow(/regular file|symlink/i);

    const aggregate = getComposition(composition.id).revisions[0]!;
    expect(aggregate.sources.map((source) => source.position)).toEqual([0, 1]);
    expect(aggregate.inputs.map((item) => item.position)).toEqual([0, 1]);
    expect(aggregate.inputs.map((item) => item.role)).toEqual([
      "scene",
      "scene",
    ]);
  });

  test("hashes a stable canonical manifest while preserving null configuration", async () => {
    const { root, workspace, project } = setupProject("manifest");
    const source = await storeBytes(root, workspace, project, "index.html");
    const artifactObject = await storeBytes(
      root,
      workspace,
      project,
      "scene.bin",
    );
    const artifactRevision = artifactRevisionFor(
      workspace,
      project,
      artifactObject,
      "scene",
    );

    const seal = (
      slug: string,
      engineConfig: unknown,
      inputConfig: unknown,
    ) => {
      const composition = createComposition({
        projectId: project.id,
        slug,
        kind: "custom",
      });
      const revision = reviseComposition({
        compositionId: composition.id,
        expectedLatestRevisionId: null,
        engine: "manual",
        engineConfig: engineConfig as never,
      });
      putCompositionSource({
        revisionId: revision.id,
        logicalPath: "index.html",
        objectId: source.id,
        position: 0,
      });
      bindCompositionInput({
        revisionId: revision.id,
        artifactRevisionId: artifactRevision.id,
        role: "primary",
        position: 0,
        config: inputConfig as never,
      });
      return sealCompositionRevision({ revisionId: revision.id });
    };

    const first = seal(
      "first",
      { z: [3, { b: 2, a: 1 }], a: true },
      { trim: { end: 5, start: 1 } },
    );
    const reordered = seal(
      "reordered",
      { a: true, z: [3, { a: 1, b: 2 }] },
      { trim: { start: 1, end: 5 } },
    );
    const nullConfig = seal("null-config", null, null);
    const emptyEngineConfig = seal("empty-engine-config", {}, null);
    const emptyInputConfig = seal("empty-input-config", null, {});

    expect(reordered.manifestSha256).toBe(first.manifestSha256);
    expect(nullConfig.manifestSha256).not.toBe(
      emptyEngineConfig.manifestSha256,
    );
    expect(nullConfig.manifestSha256).not.toBe(
      emptyInputConfig.manifestSha256,
    );
  });

  test("rolls back draft and seal mutations when activity insertion aborts", async () => {
    const { root, workspace, project } = setupProject("activity-rollback");
    const source = await storeBytes(root, workspace, project, "index.html");
    const composition = createComposition({
      projectId: project.id,
      slug: "rollback",
      kind: "video",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "hyperframes",
    });
    const db = openDomainDb();
    db.exec(`
      CREATE TRIGGER reject_composition_source_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'composition.source_put'
      BEGIN
        SELECT RAISE(ABORT, 'fixture source activity rejection');
      END;
    `);
    expect(() =>
      putCompositionSource({
        revisionId: revision.id,
        logicalPath: "index.html",
        objectId: source.id,
      }),
    ).toThrow(/source activity rejection/i);
    expect(getComposition(composition.id).revisions[0]?.sources).toEqual([]);
    db.exec("DROP TRIGGER reject_composition_source_activity");
    putCompositionSource({
      revisionId: revision.id,
      logicalPath: "index.html",
      objectId: source.id,
    });
    const activityBefore = scopedActivity({ projectId: project.id,});
    db.exec(`
      CREATE TRIGGER reject_composition_seal_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'composition.sealed'
      BEGIN
        SELECT RAISE(ABORT, 'fixture seal activity rejection');
      END;
    `);
    expect(() =>
      sealCompositionRevision({ revisionId: revision.id }),
    ).toThrow(/seal activity rejection/i);
    expect(getComposition(composition.id).revisions[0]).toMatchObject({
      state: "draft",
      sealedAt: null,
      manifestSha256: null,
    });
    expect(scopedActivity({ projectId: project.id,})).toEqual(
      activityBefore,
    );
  });

  test("selects any sealed revision with an independent expected selection", async () => {
    const { root, workspace, project } = setupProject("selection");
    const source = await storeBytes(root, workspace, project, "index.html");
    const composition = createComposition({
      projectId: project.id,
      slug: "selection",
      kind: "video",
    });
    const v1 = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "hyperframes",
    });
    putCompositionSource({
      revisionId: v1.id,
      logicalPath: "index.html",
      objectId: source.id,
    });
    sealCompositionRevision({ revisionId: v1.id });
    selectCompositionRevision({
      compositionId: composition.id,
      revisionId: v1.id,
      expectedSelectedRevisionId: null,
    });
    const v2 = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: v1.id,
      engine: "remotion",
    });
    sealCompositionRevision({ revisionId: v2.id });

    expect(() =>
      selectCompositionRevision({
        compositionId: composition.id,
        revisionId: v2.id,
        expectedSelectedRevisionId: null,
      }),
    ).toThrow(StoreConflictError);
    selectCompositionRevision({
      compositionId: composition.id,
      revisionId: v2.id,
      expectedSelectedRevisionId: v1.id,
    });
    expect(
      selectCompositionRevision({
        compositionId: composition.id,
        revisionId: v1.id,
        expectedSelectedRevisionId: v2.id,
      }).selectedRevisionId,
    ).toBe(v1.id);
    const draft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: v2.id,
      engine: "html",
    });
    expect(() =>
      selectCompositionRevision({
        compositionId: composition.id,
        revisionId: draft.id,
        expectedSelectedRevisionId: v1.id,
      }),
    ).toThrow(/sealed/i);
  });

  test("guards draft child identities and sealed children from raw SQL replacement", async () => {
    const { root, workspace, project } = setupProject("child-guards");
    const source = await storeBytes(root, workspace, project, "index.html");
    const artifactRevision = artifactRevisionFor(
      workspace,
      project,
      source,
      "source",
    );
    const composition = createComposition({
      projectId: project.id,
      slug: "guarded",
      kind: "video",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "hyperframes",
    });
    const sourceRow = putCompositionSource({
      revisionId: revision.id,
      logicalPath: "index.html",
      objectId: source.id,
      position: 0,
    });
    const inputRow = bindCompositionInput({
      revisionId: revision.id,
      artifactRevisionId: artifactRevision.id,
      role: "source",
      position: 0,
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");

    for (const sql of [
      `INSERT OR REPLACE INTO composition_revision_files
       (id, composition_revision_id, logical_path, object_id, position, created_at)
       VALUES ('${sourceRow.id}', '${revision.id}', 'changed.html', '${source.id}', 1, 2)`,
      `INSERT OR REPLACE INTO composition_revision_files
       (id, composition_revision_id, logical_path, object_id, position, created_at)
       VALUES ('cfile_replacement', '${revision.id}', 'index.html', '${source.id}', 1, 2)`,
      `INSERT OR REPLACE INTO composition_revision_files
       (id, composition_revision_id, logical_path, object_id, position, created_at)
       VALUES ('cfile_position', '${revision.id}', 'position.html', '${source.id}', 0, 2)`,
      `INSERT OR REPLACE INTO composition_inputs
       (id, composition_revision_id, artifact_revision_id, role, position, created_at)
       VALUES ('${inputRow.id}', '${revision.id}', '${artifactRevision.id}', 'changed', 1, 2)`,
      `INSERT OR REPLACE INTO composition_inputs
       (id, composition_revision_id, artifact_revision_id, role, position, created_at)
       VALUES ('input_replacement', '${revision.id}', '${artifactRevision.id}', 'changed', 0, 2)`,
    ]) {
      expectSqlRejected(db, sql, /immutable|identity|conflict/i);
    }
    sealCompositionRevision({ revisionId: revision.id });
    for (const sql of [
      `UPDATE composition_revision_files SET logical_path = 'changed.html' WHERE id = '${sourceRow.id}'`,
      `DELETE FROM composition_revision_files WHERE id = '${sourceRow.id}'`,
      `UPDATE composition_inputs SET role = 'changed' WHERE id = '${inputRow.id}'`,
      `DELETE FROM composition_inputs WHERE id = '${inputRow.id}'`,
    ]) {
      expectSqlRejected(db, sql, /sealed|immutable/i);
    }
    expect(
      db.query("SELECT * FROM composition_revision_files WHERE id = ?").get(
        sourceRow.id,
      ),
    ).toMatchObject({ logical_path: "index.html", position: 0 });
    expect(
      db.query("SELECT * FROM composition_inputs WHERE id = ?").get(
        inputRow.id,
      ),
    ).toMatchObject({ role: "source", position: 0 });
  });

  test("builds one sealed revision with an exact Project Run, Documents, and ordered outputs", async () => {
    const { root, workspace, project } = setupProject("build-success");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "build-success-outside",
      name: "Outside",
    });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const { composition, revision } = await sealedCompositionFixture(
      root,
      workspace,
      project,
      "success",
    );
    const draftComposition = createComposition({
      projectId: project.id,
      slug: "draft",
      kind: "video",
    });
    const draft = reviseComposition({
      compositionId: draftComposition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    const exactRun = startRun({ projectId: project.id, kind: "build" });
    const workspaceRun = startRun({
      workspaceId: workspace.id,
      kind: "build",
    });
    const siblingRun = startRun({ projectId: sibling.id, kind: "build" });
    const outsideRun = startRun({
      projectId: outsideProject.id,
      kind: "build",
    });
    const unscopedRun = startRun({ kind: "migration" });

    expect(() =>
      startBuild({
        compositionRevisionId: draft.id,
        runId: exactRun.id,
        profile: {},
      }),
    ).toThrow(/sealed/i);
    for (const runId of [
      workspaceRun.id,
      siblingRun.id,
      outsideRun.id,
      unscopedRun.id,
    ]) {
      expect(() =>
        startBuild({
          compositionRevisionId: revision.id,
          runId,
          profile: {},
        }),
      ).toThrow(/Project Run|Run.*Project|scope/i);
    }
    expect(() =>
      startBuild({
        compositionRevisionId: revision.id,
        runId: exactRun.id,
        profile: { imageData: "SGVsbG8=" },
      }),
    ).toThrow(/base64/i);

    const build = startBuild({
      compositionRevisionId: revision.id,
      runId: exactRun.id,
      profile: { name: "social", crf: 24 },
    });
    expect(build).toMatchObject({
      compositionRevisionId: revision.id,
      runId: exactRun.id,
      state: "running",
      profile: { crf: 24, name: "social" },
    });
    const workspaceDocument = createDocument({
      workspaceId: workspace.id,
      kind: "style-guide",
      slug: "style",
      title: "Style",
    });
    const workspaceDocumentRevision = reviseDocument({
      documentId: workspaceDocument.id,
      format: "text",
      body: "Shared style",
    });
    const projectDocument = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Brief",
    });
    const projectDocumentRevision = reviseDocument({
      documentId: projectDocument.id,
      format: "text",
      body: "Exact brief",
    });
    const siblingDocument = createDocument({
      projectId: sibling.id,
      kind: "note",
      slug: "sibling-note",
      title: "Sibling",
    });
    const siblingDocumentRevision = reviseDocument({
      documentId: siblingDocument.id,
      format: "text",
      body: "Sibling note",
    });
    const outsideDocument = createDocument({
      projectId: outsideProject.id,
      kind: "note",
      slug: "outside-note",
      title: "Outside",
    });
    const outsideDocumentRevision = reviseDocument({
      documentId: outsideDocument.id,
      format: "text",
      body: "Outside note",
    });
    const workspaceBinding = bindBuildDocument({
      buildId: build.id,
      documentRevisionId: workspaceDocumentRevision.id,
      role: "style-guide",
    });
    await Bun.sleep(2);
    const projectBinding = bindBuildDocument({
      buildId: build.id,
      documentRevisionId: projectDocumentRevision.id,
      role: "brief",
    });
    for (const documentRevisionId of [
      siblingDocumentRevision.id,
      outsideDocumentRevision.id,
    ]) {
      expect(() =>
        bindBuildDocument({
          buildId: build.id,
          documentRevisionId,
          role: `foreign-${documentRevisionId}`,
        }),
      ).toThrow(/scope/i);
    }

    const masterObject = await storeBytes(
      root,
      workspace,
      project,
      "master.mp4",
    );
    const previewObject = await storeBytes(
      root,
      workspace,
      project,
      "preview.mp4",
    );
    const master = artifactRevisionFor(
      workspace,
      project,
      masterObject,
      "master",
    );
    const preview = artifactRevisionFor(
      workspace,
      project,
      previewObject,
      "preview",
    );
    const completed = completeBuild({
      buildId: build.id,
      outputs: [
        { artifactRevisionId: preview.id, role: "preview", position: 1 },
        { artifactRevisionId: master.id, role: "master", position: 0 },
      ],
    });
    expect(completed).toMatchObject({ state: "succeeded", runId: exactRun.id });
    expect(getRun(exactRun.id)).toMatchObject({
      state: "pending",
      attempts: [],
    });
    const aggregate = getComposition(composition.id);
    expect(aggregate.selectedRevisionId).toBeNull();
    expect(aggregate.revisions[0]?.builds).toEqual([
      expect.objectContaining({
        id: build.id,
        state: "succeeded",
        outputs: [
          expect.objectContaining({
            artifactRevisionId: master.id,
            role: "master",
            position: 0,
          }),
          expect.objectContaining({
            artifactRevisionId: preview.id,
            role: "preview",
            position: 1,
          }),
        ],
        documentBindings: [workspaceBinding, projectBinding],
      }),
    ]);
    expect(() =>
      bindBuildDocument({
        buildId: build.id,
        documentRevisionId: projectDocumentRevision.id,
        role: "terminal",
      }),
    ).toThrow(/terminal|pending|running/i);
    expect(() => failBuild(build.id, { error: "late" })).toThrow(/terminal/i);
    expect(() => cancelBuild(build.id)).toThrow(/terminal/i);
    expect(() =>
      completeBuild({
        buildId: build.id,
        outputs: [{ artifactRevisionId: master.id, position: 0 }],
      }),
    ).toThrow(/terminal|running/i);
    const nextRevision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: revision.id,
      engine: "remotion",
      engineConfig: {},
    });
    expect(getComposition(composition.id).revisions[1]).toMatchObject({
      id: nextRevision.id,
      builds: [],
      sources: [expect.objectContaining({ logicalPath: "index.html" })],
    });
  });

  test("rolls back invalid or unaudited Build outputs atomically", async () => {
    const { root, workspace, project } = setupProject("build-rollback");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const { composition, revision } = await sealedCompositionFixture(
      root,
      workspace,
      project,
      "rollback",
    );
    const exactRun = startRun({ projectId: project.id, kind: "build" });
    const build = startBuild({
      compositionRevisionId: revision.id,
      runId: exactRun.id,
      profile: {},
    });
    const localObject = await storeBytes(
      root,
      workspace,
      project,
      "local.mp4",
    );
    const sharedObject = await storeBytes(
      root,
      workspace,
      null,
      "shared.mp4",
    );
    const siblingObject = await storeBytes(
      root,
      workspace,
      sibling,
      "sibling.mp4",
    );
    const local = artifactRevisionFor(
      workspace,
      project,
      localObject,
      "local-output",
    );
    const shared = artifactRevisionFor(
      workspace,
      null,
      sharedObject,
      "shared-output",
    );
    const siblingOutput = artifactRevisionFor(
      workspace,
      sibling,
      siblingObject,
      "sibling-output",
    );

    for (const outputs of [
      [],
      [{ artifactRevisionId: local.id, position: 1 }],
      [
        { artifactRevisionId: local.id, position: 0 },
        { artifactRevisionId: local.id, position: 0 },
      ],
      [{ artifactRevisionId: local.id, position: -1 }],
    ]) {
      expect(() => completeBuild({ buildId: build.id, outputs })).toThrow(
        /output|position|contiguous/i,
      );
    }
    for (const artifactRevisionId of [shared.id, siblingOutput.id]) {
      expect(() =>
        completeBuild({
          buildId: build.id,
          outputs: [
            { artifactRevisionId: local.id, position: 0 },
            { artifactRevisionId, position: 1 },
          ],
        }),
      ).toThrow(/Project|scope/i);
    }
    expect(getComposition(composition.id).revisions[0]?.builds[0]).toMatchObject(
      { state: "running", outputs: [] },
    );

    const missingObject = await storeBytes(
      root,
      workspace,
      project,
      "missing.mp4",
    );
    const missing = artifactRevisionFor(
      workspace,
      project,
      missingObject,
      "missing-output",
    );
    fs.rmSync(resolveObjectPath(missingObject));
    expect(() =>
      completeBuild({
        buildId: build.id,
        outputs: [{ artifactRevisionId: missing.id, position: 0 }],
      }),
    ).toThrow(/missing/i);

    const db = openDomainDb();
    const activityBefore = scopedActivity({ projectId: project.id,});
    db.exec(`
      CREATE TRIGGER reject_build_complete_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'build.completed'
      BEGIN
        SELECT RAISE(ABORT, 'fixture Build activity rejection');
      END;
    `);
    expect(() =>
      completeBuild({
        buildId: build.id,
        outputs: [{ artifactRevisionId: local.id, position: 0 }],
      }),
    ).toThrow(/Build activity rejection/i);
    expect(getComposition(composition.id).revisions[0]?.builds[0]).toMatchObject(
      { state: "running", outputs: [] },
    );
    expect(scopedActivity({ projectId: project.id,})).toEqual(
      activityBefore,
    );
    db.exec("DROP TRIGGER reject_build_complete_activity");
    completeBuild({
      buildId: build.id,
      outputs: [{ artifactRevisionId: local.id, position: 0 }],
    });
  });

  test("retains failed and cancelled Builds without changing their Runs", async () => {
    const { root, workspace, project } = setupProject("build-terminal");
    const { composition, revision } = await sealedCompositionFixture(
      root,
      workspace,
      project,
      "terminal",
    );
    const failedRun = startRun({ projectId: project.id, kind: "build" });
    const cancelledRun = startRun({ projectId: project.id, kind: "build" });
    const failed = startBuild({
      compositionRevisionId: revision.id,
      runId: failedRun.id,
      profile: { name: "master" },
    });
    await Bun.sleep(2);
    const cancelled = startBuild({
      compositionRevisionId: revision.id,
      runId: cancelledRun.id,
      profile: { name: "preview" },
    });

    expect(failBuild(failed.id, { error: "renderer failed" })).toMatchObject({
      state: "failed",
      error: "renderer failed",
    });
    expect(cancelBuild(cancelled.id, { error: "user cancelled" })).toMatchObject(
      { state: "cancelled", error: "user cancelled" },
    );
    expect(getRun(failedRun.id).state).toBe("pending");
    expect(getRun(cancelledRun.id).state).toBe("pending");
    expect(
      getComposition(composition.id).revisions[0]?.builds.map((build) =>
        build.state,
      ),
    ).toEqual(["failed", "cancelled"]);
  });

  test("guards Build identity, outputs, and Document bindings with recursive triggers disabled", async () => {
    const { root, workspace, project } = setupProject("build-guards");
    const { revision } = await sealedCompositionFixture(
      root,
      workspace,
      project,
      "guards",
    );
    const run = startRun({ projectId: project.id, kind: "build" });
    const build = startBuild({
      compositionRevisionId: revision.id,
      runId: run.id,
      profile: { name: "guarded" },
    });
    const outputObject = await storeBytes(
      root,
      workspace,
      project,
      "output.mp4",
    );
    const output = artifactRevisionFor(
      workspace,
      project,
      outputObject,
      "guarded-output",
    );
    const document = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "guarded-brief",
      title: "Brief",
    });
    const documentRevision = reviseDocument({
      documentId: document.id,
      format: "text",
      body: "Exact brief",
    });
    const binding = bindBuildDocument({
      buildId: build.id,
      documentRevisionId: documentRevision.id,
      role: "brief",
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    db.prepare(
      `INSERT INTO build_outputs
       (id, build_id, artifact_revision_id, role, position, created_at)
       VALUES ('output_guarded', ?, ?, 'master', 0, ?)`,
    ).run(build.id, output.id, Date.now());

    for (const sql of [
      `INSERT OR REPLACE INTO builds
       (id, composition_revision_id, run_id, state, profile_json, created_at, started_at)
       VALUES ('${build.id}', '${revision.id}', '${run.id}', 'running', '{}', 2, 2)`,
      `UPDATE builds SET run_id = NULL WHERE id = '${build.id}'`,
      `UPDATE builds SET profile_json = '{}' WHERE id = '${build.id}'`,
      `DELETE FROM builds WHERE id = '${build.id}'`,
      `INSERT OR REPLACE INTO build_outputs
       (id, build_id, artifact_revision_id, role, position, created_at)
       VALUES ('output_guarded', '${build.id}', '${output.id}', 'changed', 1, 2)`,
      `INSERT OR REPLACE INTO build_outputs
       (id, build_id, artifact_revision_id, role, position, created_at)
       VALUES ('output_replacement', '${build.id}', '${output.id}', 'changed', 0, 2)`,
      `UPDATE build_outputs SET role = 'changed' WHERE id = 'output_guarded'`,
      `DELETE FROM build_outputs WHERE id = 'output_guarded'`,
      `INSERT OR REPLACE INTO build_document_bindings
       (id, build_id, document_revision_id, role, created_at)
       VALUES ('${binding.id}', '${build.id}', '${documentRevision.id}', 'changed', 2)`,
      `INSERT OR REPLACE INTO build_document_bindings
       (id, build_id, document_revision_id, role, created_at)
       VALUES ('bind_replacement', '${build.id}', '${documentRevision.id}', 'brief', 2)`,
      `UPDATE build_document_bindings SET role = 'changed' WHERE id = '${binding.id}'`,
      `DELETE FROM build_document_bindings WHERE id = '${binding.id}'`,
    ]) {
      expectSqlRejected(db, sql, /immutable|identity|append-only/i);
    }
    failBuild(build.id, { error: "stop" });
    expectSqlRejected(
      db,
      `INSERT INTO build_outputs
       (id, build_id, artifact_revision_id, position, created_at)
       VALUES ('output_late', '${build.id}', '${output.id}', 1, 3)`,
      /running|terminal/i,
    );
    expectSqlRejected(
      db,
      `INSERT INTO build_document_bindings
       (id, build_id, document_revision_id, role, created_at)
       VALUES ('bind_late', '${build.id}', '${documentRevision.id}', 'late', 3)`,
      /pending|running|terminal/i,
    );
  });

  test("guards raw Composition selection, parent, and Iteration scope", async () => {
    const { root, workspace, project } = setupProject("graph-guards");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const siblingIteration = createIteration({
      projectId: sibling.id,
      title: "Sibling iteration",
    });
    const first = createComposition({
      projectId: project.id,
      slug: "first",
      kind: "video",
    });
    const firstDraft = reviseComposition({
      compositionId: first.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    const second = createComposition({
      projectId: project.id,
      slug: "second",
      kind: "video",
    });
    const secondDraft = reviseComposition({
      compositionId: second.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    const source = await storeBytes(root, workspace, project, "second.html");
    putCompositionSource({
      revisionId: secondDraft.id,
      logicalPath: "index.html",
      objectId: source.id,
    });
    const secondSealed = sealCompositionRevision({
      revisionId: secondDraft.id,
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");

    for (const sql of [
      `UPDATE compositions
       SET selected_revision_id = '${firstDraft.id}'
       WHERE id = '${first.id}'`,
      `UPDATE compositions
       SET selected_revision_id = '${secondSealed.id}'
       WHERE id = '${first.id}'`,
      `INSERT INTO compositions
       (id, project_id, slug, kind, selected_revision_id, created_at, updated_at)
       VALUES ('comp_raw_cross_selection', '${project.id}', 'raw-cross', 'video',
               '${secondSealed.id}', 1, 1)`,
      `INSERT INTO composition_revisions
       (id, composition_id, revision_no, parent_revision_id, state,
        engine, engine_config_json, created_at)
       VALUES ('crev_raw_cross_parent', '${first.id}', 2, '${secondSealed.id}',
               'draft', 'manual', '{}', 1)`,
      `INSERT INTO composition_revisions
       (id, composition_id, revision_no, iteration_id, state,
        engine, engine_config_json, created_at)
       VALUES ('crev_raw_cross_iteration', '${first.id}', 2,
               '${siblingIteration.id}', 'draft', 'manual', '{}', 1)`,
    ]) {
      expectSqlRejected(db, sql, /Composition|sealed|Project|scope/i);
    }
  });

  test("guards raw Composition source and input provenance", async () => {
    const { root, workspace, project } = setupProject("input-guards");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const localObject = await storeBytes(
      root,
      workspace,
      project,
      "local.bin",
    );
    const siblingObject = await storeBytes(
      root,
      workspace,
      sibling,
      "sibling.bin",
    );
    const localRevision = artifactRevisionFor(
      workspace,
      project,
      localObject,
      "local",
    );
    const siblingRevision = artifactRevisionFor(
      workspace,
      sibling,
      siblingObject,
      "sibling",
    );
    const malformedArtifact = createArtifact({
      projectId: project.id,
      slug: "malformed",
      kind: "data",
    });
    const composition = createComposition({
      projectId: project.id,
      slug: "guarded",
      kind: "custom",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    const source = putCompositionSource({
      revisionId: revision.id,
      logicalPath: "local.bin",
      objectId: localObject.id,
      position: 0,
    });
    const input = bindCompositionInput({
      revisionId: revision.id,
      artifactRevisionId: localRevision.id,
      role: "source",
      position: 0,
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");

    for (const sql of [
      `INSERT INTO composition_revision_files
       (id, composition_revision_id, logical_path, object_id, position, created_at)
       VALUES ('cfile_raw_sibling', '${revision.id}', 'sibling.bin',
               '${siblingObject.id}', 1, 1)`,
      `UPDATE composition_revision_files
       SET object_id = '${siblingObject.id}' WHERE id = '${source.id}'`,
      `INSERT INTO composition_inputs
       (id, composition_revision_id, artifact_revision_id, role, position, created_at)
       VALUES ('input_raw_sibling', '${revision.id}', '${siblingRevision.id}',
               'source', 1, 1)`,
      `UPDATE composition_inputs
       SET artifact_revision_id = '${siblingRevision.id}' WHERE id = '${input.id}'`,
      `INSERT INTO artifact_revisions
       (id, artifact_id, object_id, revision_no, state, created_at)
       VALUES ('arev_raw_bad_backing', '${malformedArtifact.id}',
               '${siblingObject.id}', 1, 'working', 1);
       INSERT INTO composition_inputs
       (id, composition_revision_id, artifact_revision_id, role, position, created_at)
       VALUES ('input_raw_bad_backing', '${revision.id}',
               'arev_raw_bad_backing', 'source', 1, 1)`,
    ]) {
      expectSqlRejected(db, sql, /Object|Artifact|Project|scope/i);
    }
  });

  test("guards raw Build provenance, timestamps, outputs, and Documents", async () => {
    const { root, workspace, project } = setupProject("build-scope-guards");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const { revision } = await sealedCompositionFixture(
      root,
      workspace,
      project,
      "build-scope",
    );
    const draftComposition = createComposition({
      projectId: project.id,
      slug: "draft",
      kind: "video",
    });
    const draft = reviseComposition({
      compositionId: draftComposition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    const exactRun = startRun({ projectId: project.id, kind: "build" });
    const siblingRun = startRun({ projectId: sibling.id, kind: "build" });
    const build = startBuild({
      compositionRevisionId: revision.id,
      runId: exactRun.id,
      profile: {},
    });
    const siblingObject = await storeBytes(
      root,
      workspace,
      sibling,
      "sibling-output.bin",
    );
    const siblingOutput = artifactRevisionFor(
      workspace,
      sibling,
      siblingObject,
      "sibling-output",
    );
    const siblingDocument = createDocument({
      projectId: sibling.id,
      kind: "brief",
      slug: "sibling-brief",
      title: "Sibling brief",
    });
    const siblingDocumentRevision = reviseDocument({
      documentId: siblingDocument.id,
      format: "text",
      body: "Sibling",
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");

    for (const sql of [
      `INSERT INTO builds
       (id, composition_revision_id, run_id, state, profile_json,
        created_at, started_at)
       VALUES ('build_raw_draft', '${draft.id}', '${exactRun.id}',
               'running', '{}', 1, 1)`,
      `INSERT INTO builds
       (id, composition_revision_id, run_id, state, profile_json,
        created_at, started_at)
       VALUES ('build_raw_sibling_run', '${revision.id}', '${siblingRun.id}',
               'running', '{}', 1, 1)`,
      `INSERT INTO builds
       (id, composition_revision_id, run_id, state, profile_json,
        created_at, started_at, ended_at)
       VALUES ('build_raw_bad_terminal', '${revision.id}', '${exactRun.id}',
               'succeeded', '{}', 3, NULL, 2)`,
      `INSERT INTO builds
       (id, composition_revision_id, run_id, state, profile_json,
        created_at, started_at, ended_at)
       VALUES ('build_raw_reverse_time', '${revision.id}', '${exactRun.id}',
               'failed', '{}', 1, 3, 2)`,
      `INSERT INTO build_outputs
       (id, build_id, artifact_revision_id, role, position, created_at)
       VALUES ('output_raw_sibling', '${build.id}', '${siblingOutput.id}',
               'master', 0, 1)`,
      `INSERT INTO build_document_bindings
       (id, build_id, document_revision_id, role, created_at)
       VALUES ('bind_raw_sibling', '${build.id}',
               '${siblingDocumentRevision.id}', 'brief', 1)`,
    ]) {
      expectSqlRejected(db, sql, /Build|sealed|Run|Project|scope|timestamp/i);
    }

    db.exec("SAVEPOINT nullable_migration_build");
    expect(() =>
      db.prepare(
        `INSERT INTO builds
         (id, composition_revision_id, state, profile_json, created_at)
         VALUES ('build_raw_migration', ?, 'pending', '{}', 1)`,
      ).run(revision.id),
    ).not.toThrow();
    db.exec("ROLLBACK TO nullable_migration_build");
    db.exec("RELEASE nullable_migration_build");
  });

  test("requires an own selected expectation and rejects alternate base64", async () => {
    const { root, workspace, project } = setupProject("runtime-guards");
    const { composition, revision } = await sealedCompositionFixture(
      root,
      workspace,
      project,
      "runtime",
    );

    for (const input of [
      { compositionId: composition.id, revisionId: revision.id },
      {
        compositionId: composition.id,
        revisionId: revision.id,
        expectedSelectedRevisionId: undefined,
      },
      Object.assign(
        Object.create({ expectedSelectedRevisionId: null }) as object,
        { compositionId: composition.id, revisionId: revision.id },
      ),
    ]) {
      expect(() =>
        selectCompositionRevision(input as never),
      ).toThrow(/requires expectedSelectedRevisionId/i);
    }

    const run = startRun({ projectId: project.id, kind: "build" });
    for (const profile of [
      { imageData: "SGVsbG8" },
      { imageData: "SGVsbG8_" },
    ]) {
      expect(() =>
        startBuild({
          compositionRevisionId: revision.id,
          runId: run.id,
          profile,
        }),
      ).toThrow(/base64/i);
    }
  });

  test("rechecks a source Object after acquiring the writer lock", async () => {
    const { root, workspace, project } = setupProject("source-race");
    const source = await storeBytes(root, workspace, project, "source.html");
    const composition = createComposition({
      projectId: project.id,
      slug: "source-race",
      kind: "video",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });

    const result = await runAfterObjectMutation(root, source.id, {
      name: "putCompositionSource",
      input: {
        revisionId: revision.id,
        logicalPath: "index.html",
        objectId: source.id,
      },
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/missing/i) });
    expect(getComposition(composition.id).revisions[0]?.sources).toEqual([]);
  });

  test("rechecks an input Artifact Object after acquiring the writer lock", async () => {
    const { root, workspace, project } = setupProject("input-race");
    const object = await storeBytes(root, workspace, project, "input.bin");
    const artifact = artifactRevisionFor(
      workspace,
      project,
      object,
      "input-race",
    );
    const composition = createComposition({
      projectId: project.id,
      slug: "input-race",
      kind: "video",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });

    const result = await runAfterObjectMutation(root, object.id, {
      name: "bindCompositionInput",
      input: {
        revisionId: revision.id,
        artifactRevisionId: artifact.id,
        role: "source",
        position: 0,
      },
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/missing/i) });
    expect(getComposition(composition.id).revisions[0]?.inputs).toEqual([]);
  });

  test("rechecks manifest Objects after acquiring the writer lock", async () => {
    const { root, workspace, project } = setupProject("seal-race");
    const source = await storeBytes(root, workspace, project, "source.html");
    const composition = createComposition({
      projectId: project.id,
      slug: "seal-race",
      kind: "video",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    putCompositionSource({
      revisionId: revision.id,
      logicalPath: "index.html",
      objectId: source.id,
    });

    const result = await runAfterObjectMutation(root, source.id, {
      name: "sealCompositionRevision",
      input: { revisionId: revision.id },
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/missing/i) });
    expect(getComposition(composition.id).revisions[0]?.state).toBe("draft");
  });

  test("rechecks Build output Objects after acquiring the writer lock", async () => {
    const { root, workspace, project } = setupProject("complete-race");
    const { composition, revision } = await sealedCompositionFixture(
      root,
      workspace,
      project,
      "complete-race",
    );
    const run = startRun({ projectId: project.id, kind: "build" });
    const build = startBuild({
      compositionRevisionId: revision.id,
      runId: run.id,
      profile: {},
    });
    const object = await storeBytes(root, workspace, project, "output.bin");
    const output = artifactRevisionFor(
      workspace,
      project,
      object,
      "complete-race-output",
    );

    const result = await runAfterObjectMutation(root, object.id, {
      name: "completeBuild",
      input: {
        buildId: build.id,
        outputs: [{ artifactRevisionId: output.id, position: 0 }],
      },
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/missing/i) });
    expect(getComposition(composition.id).revisions[0]?.builds[0]).toMatchObject({
      state: "running",
      outputs: [],
    });
  });
});

function setupProject(label: string): {
  root: TmpRoot;
  workspace: WorkspaceRow;
  project: ProjectRow;
} {
  const root = makeTmpRoot(`ralphy-domain-compositions-${label}`);
  roots.push(root);
  const workspace = createWorkspace({
    slug: `${label}-workspace`,
    name: "Workspace",
  });
  const project = createProject({
    workspaceId: workspace.id,
    slug: `${label}-project`,
    name: "Project",
  });
  return { root, workspace, project };
}

async function storeBytes(
  root: TmpRoot,
  workspace: WorkspaceRow,
  project: ProjectRow | null,
  name: string,
): Promise<ObjectRow> {
  const sourcePath = path.join(root.dir, `${crypto.randomUUID()}-${name}`);
  fs.writeFileSync(sourcePath, `bytes:${name}`);
  return ingestObject({
    scope: project
      ? { workspaceId: workspace.id, projectId: project.id }
      : { workspaceId: workspace.id },
    sourcePath,
    originalName: name,
    mime: name.endsWith(".html") ? "text/html" : "application/octet-stream",
    storageClass: "working",
  });
}

function artifactRevisionFor(
  workspace: WorkspaceRow,
  project: ProjectRow | null,
  object: ObjectRow,
  slug: string,
) {
  const artifact = createArtifact({
    ...(project
      ? { projectId: project.id }
      : { workspaceId: workspace.id }),
    slug,
    kind: "data",
  });
  return addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "working",
  });
}

async function sealedCompositionFixture(
  root: TmpRoot,
  workspace: WorkspaceRow,
  project: ProjectRow,
  label: string,
) {
  const source = await storeBytes(
    root,
    workspace,
    project,
    `${label}.html`,
  );
  const composition = createComposition({
    projectId: project.id,
    slug: `composition-${label}`,
    kind: "video",
  });
  const draft = reviseComposition({
    compositionId: composition.id,
    expectedLatestRevisionId: null,
    engine: "hyperframes",
    engineConfig: {},
  });
  putCompositionSource({
    revisionId: draft.id,
    logicalPath: "index.html",
    objectId: source.id,
  });
  const revision = sealCompositionRevision({ revisionId: draft.id });
  return { composition, revision };
}

function expectSqlRejected(
  db: Database,
  sql: string,
  message: RegExp,
): void {
  db.exec("SAVEPOINT composition_guard_test");
  let error: unknown = null;
  try {
    db.exec(sql);
  } catch (caught) {
    error = caught;
  } finally {
    db.exec("ROLLBACK TO composition_guard_test");
    db.exec("RELEASE composition_guard_test");
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error | null)?.message ?? "").toMatch(message);
}

async function runAfterObjectMutation(
  root: TmpRoot,
  objectId: string,
  operation: {
    name:
      | "putCompositionSource"
      | "bindCompositionInput"
      | "sealCompositionRevision"
      | "completeBuild";
    input: Record<string, unknown>;
  },
): Promise<{ ok: boolean; error?: string }> {
  const readyPath = path.join(root.dir, `${crypto.randomUUID()}.ready`);
  const blocker = new Database(domainDbPath(), { create: true });
  blocker.exec("PRAGMA busy_timeout = 5000");
  blocker.exec("BEGIN IMMEDIATE");
  blocker
    .prepare("UPDATE objects SET key = ?, original_name = ? WHERE id = ?")
    .run(`objects/${objectId}.gone`, "missing.gone", objectId);

  const workerSource = `
    import fs from "node:fs";
    import { setRoot } from ${JSON.stringify(
      path.join(process.cwd(), "cli/lib/paths.ts"),
    )};
    import { openDomainDb } from ${JSON.stringify(
      path.join(process.cwd(), "cli/lib/store/db.ts"),
    )};
    import * as compositions from ${JSON.stringify(
      path.join(process.cwd(), "cli/lib/store/compositions.ts"),
    )};

    const root = process.env.RALPHY_TEST_ROOT;
    const readyPath = process.env.RALPHY_TEST_READY;
    const operation = JSON.parse(process.env.RALPHY_TEST_OPERATION ?? "null");
    if (!root || !readyPath || !operation) throw new Error("missing race fixture");
    setRoot(root);
    const db = openDomainDb();
    const transaction = db.transaction.bind(db);
    db.transaction = (callback) => {
      const current = transaction(callback);
      return {
        immediate(...args) {
          fs.writeFileSync(readyPath, "ready");
          return current.immediate(...args);
        },
      };
    };
    try {
      const value = await compositions[operation.name](operation.input);
      console.log(JSON.stringify({ ok: true, value }));
    } catch (error) {
      console.log(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  `;
  const worker = Bun.spawn({
    cmd: ["bun", "-e", workerSource],
    cwd: process.cwd(),
    env: {
      ...process.env,
      RALPHY_TEST_ROOT: root.dir,
      RALPHY_TEST_READY: readyPath,
      RALPHY_TEST_OPERATION: JSON.stringify(operation),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  let committed = false;
  try {
    const deadline = Date.now() + 2_000;
    while (!fs.existsSync(readyPath)) {
      if (Date.now() >= deadline) {
        worker.kill();
        throw new Error("Composition race worker missed the transaction barrier");
      }
      await Bun.sleep(5);
    }
    blocker.exec("COMMIT");
    committed = true;
    const [exitCode, stdout, stderr] = await Promise.all([
      worker.exited,
      new Response(worker.stdout).text(),
      new Response(worker.stderr).text(),
    ]);
    if (exitCode !== 0) {
      throw new Error(`Composition race worker failed: ${stderr}`);
    }
    return JSON.parse(stdout.trim()) as { ok: boolean; error?: string };
  } finally {
    if (!committed) blocker.exec("ROLLBACK");
    blocker.close();
  }
}
