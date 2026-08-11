import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  addArtifactUsage,
  createArtifact,
  getArtifact,
  selectArtifactRevision,
} from "../../cli/lib/store/artifacts.js";
import {
  bindCompositionInput,
  completeBuild,
  createComposition,
  putCompositionSource,
  reviseComposition,
  sealCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import { requestDigest } from "../../cli/lib/store/canonical-json.js";
import { startConsumerOperationRun } from "../../cli/lib/store/consumer-runs.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { listEvaluations } from "../../cli/lib/store/evaluations.js";
import {
  OBJECT_REFERENCE_SOURCES,
  getMediaCard,
  getMediaCards,
  listMedia,
  reviewMedia,
} from "../../cli/lib/store/media.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { recordRunObject, recordRunResult, startRun } from "../../cli/lib/store/runs.js";
import {
  createIteration,
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
  startConsumerSession,
} from "../../cli/lib/store/sessions.js";
import { StoreConflictError } from "../../cli/lib/store/types.js";
import { verifyDomainStore } from "../../cli/lib/store/verify.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { installConsumer } from "../helpers/consumer-auth.js";

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-domain-media");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

async function ingest(root: TmpRoot, name: string, scope: {
  workspaceId: string;
  projectId?: string;
}, mime = "image/png") {
  const filePath = path.join(root.dir, name);
  fs.writeFileSync(filePath, name);
  return ingestObject({
    scope,
    sourcePath: filePath,
    originalName: name,
    mime,
    storageClass: "durable",
  });
}

async function fixture(root: TmpRoot) {
  const workspace = createWorkspace({ slug: "media", name: "Media" });
  const project = createProject({
    workspaceId: workspace.id,
    slug: "media",
    name: "Media",
  });
  const sibling = createProject({
    workspaceId: workspace.id,
    slug: "sibling",
    name: "Sibling",
  });
  const projectObject = await ingest(root, "project.png", {
    workspaceId: workspace.id,
    projectId: project.id,
  });
  const sharedObject = await ingest(root, "shared.png", {
    workspaceId: workspace.id,
  });
  const siblingObject = await ingest(root, "sibling.png", {
    workspaceId: workspace.id,
    projectId: sibling.id,
  });
  const artifact = createArtifact({
    projectId: project.id,
    slug: "hero",
    kind: "image",
  });
  const revision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: projectObject.id,
    state: "working",
  });
  selectArtifactRevision({
    artifactId: artifact.id,
    revisionId: revision.id,
    expectedRevisionId: null,
  });
  const run = startRun({ projectId: project.id, kind: "diagnostic" });
  fs.mkdirSync(path.join(root.dir, ".ralphy", "tmp"), { recursive: true });
  fs.writeFileSync(path.join(root.dir, ".ralphy", "tmp", "trace.bin"), "trace");
  const runObject = recordRunObject({
    runId: run.id,
    path: "tmp/trace.bin",
    purpose: "diagnostic",
    state: "diagnostic",
    retention: "keep-on-failure",
    bytes: 5,
    sha256: createHash("sha256").update("trace").digest("hex"),
  });
  const session = startAgentSession({
    workspaceId: workspace.id,
    projectId: project.id,
    agent: "reviewer",
  });
  return {
    workspace,
    project,
    sibling,
    projectObject,
    sharedObject,
    siblingObject,
    artifact,
    revision,
    run,
    runObject,
    session,
  };
}

describe("media cards", () => {
  test("returns one safe detail card without filesystem discovery", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const context = { workspaceId: f.workspace.id, projectId: f.project.id };
    const expectedKeys = {
      artifact: [
        "bytes",
        "kind",
        "mediaKind",
        "mime",
        "projectId",
        "provenance",
        "ref",
        "revisionCount",
        "selectedAt",
        "selectedObjectId",
        "selectedRevisionId",
        "selectedState",
        "slug",
        "storageClass",
        "target",
        "usageRoles",
        "workspaceId",
      ],
      object: [
        "bytes",
        "createdAt",
        "mediaKind",
        "mime",
        "projectId",
        "provenance",
        "ref",
        "referenceCount",
        "storageClass",
        "target",
        "workspaceId",
      ],
      "run-object": [
        "attemptId",
        "attemptNo",
        "bytes",
        "createdAt",
        "locationClass",
        "logicalPath",
        "mediaKind",
        "mime",
        "objectId",
        "projectId",
        "provenance",
        "purpose",
        "ref",
        "retention",
        "runId",
        "state",
        "target",
        "workspaceId",
      ],
    } as const;
    for (const ref of [
      { type: "artifact" as const, id: f.artifact.id },
      { type: "object" as const, id: f.projectObject.id },
      { type: "run-object" as const, id: f.runObject.id },
    ]) {
      const card = getMediaCard({ context, ref });
      expect(card).toEqual(getMediaCards({ context, refs: [ref] })[0]);
      expect(Object.keys(card).sort()).toEqual([...expectedKeys[ref.type]].sort());
      expect(recursiveKeys(card)).not.toContainAnyValues([
        "body",
        "bucket",
        "error",
        "key",
        "locator",
        "logPath",
        "metadata",
        "originalName",
        "path",
        "secret",
        "sha256",
        "tag",
      ]);
    }

    const siblingArtifact = createArtifact({
      projectId: f.sibling.id,
      slug: "invisible",
      kind: "image",
    });
    for (const ref of [
      { type: "artifact" as const, id: siblingArtifact.id },
      { type: "object" as const, id: f.siblingObject.id },
      { type: "object" as const, id: "obj_missing" },
    ]) {
      expect(errorMessage(() => getMediaCard({ context, ref }))).toBe(
        "Media request contains an unresolvable ref",
      );
    }

    const farm = path.join(root.dir, ".ralphy", "farm");
    fs.mkdirSync(path.join(farm, "buckets", "poison"), { recursive: true });
    fs.writeFileSync(path.join(farm, "buckets", "poison", "object.bin"), "x");
    const touched: string[] = [];
    const mutableFs = fs as unknown as Record<string, (...args: unknown[]) => unknown>;
    const names = ["lstatSync", "openSync", "readFileSync", "readdirSync", "realpathSync"];
    const originals = Object.fromEntries(names.map((name) => [name, mutableFs[name]]));
    try {
      for (const name of names) {
        mutableFs[name] = (...args: unknown[]) => {
          const target = String(args[0]);
          if (target.includes(`${path.sep}farm${path.sep}`)) touched.push(target);
          return originals[name]!(...args);
        };
      }
      expect(
        getMediaCard({
          context,
          ref: { type: "artifact", id: f.artifact.id },
        }).ref.id,
      ).toBe(f.artifact.id);
    } finally {
      for (const name of names) mutableFs[name] = originals[name]!;
    }
    expect(touched).toEqual([]);
  });

  test("returns the mixed union in the caller's exact order", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const refs = [
      { type: "run-object", id: f.runObject.id },
      { type: "artifact", id: f.artifact.id },
      { type: "object", id: f.projectObject.id },
    ] as const;
    const cards = getMediaCards({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      refs: [...refs],
    });
    expect(cards.map((card) => card.ref)).toEqual([...refs].map((ref) => ({ ...ref })));

    expect(Object.keys(cards[1]!).sort()).toEqual([
      "bytes",
      "kind",
      "mediaKind",
      "mime",
      "projectId",
      "provenance",
      "ref",
      "revisionCount",
      "selectedAt",
      "selectedObjectId",
      "selectedRevisionId",
      "selectedState",
      "slug",
      "storageClass",
      "target",
      "usageRoles",
      "workspaceId",
    ]);
    expect(cards[1]).toMatchObject({
      slug: "hero",
      kind: "image",
      selectedRevisionId: f.revision.id,
      selectedState: "working",
      mime: "image/png",
      revisionCount: 1,
    });
    expect(Object.keys(cards[0]!).sort()).toEqual([
      "attemptId",
      "attemptNo",
      "bytes",
      "createdAt",
      "locationClass",
      "logicalPath",
      "mediaKind",
      "mime",
      "objectId",
      "projectId",
      "provenance",
      "purpose",
      "ref",
      "retention",
      "runId",
      "state",
      "target",
      "workspaceId",
    ]);
    // An unpromoted RunObject has no MIME anywhere in the database.
    expect(cards[0]).toMatchObject({
      mime: null,
      objectId: null,
      bytes: 5,
      logicalPath: "tmp/trace.bin",
      locationClass: "temp",
      attemptId: null,
      attemptNo: null,
    });
    expect(Object.keys(cards[2]!).sort()).toEqual([
      "bytes",
      "createdAt",
      "mediaKind",
      "mime",
      "projectId",
      "provenance",
      "ref",
      "referenceCount",
      "storageClass",
      "target",
      "workspaceId",
    ]);
    expect(JSON.stringify(cards)).not.toMatch(
      /"(bucket|key|sha256|path|originalName|metadata)"/,
    );
  });

  test("classifies an exact batch once per selected media type", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const secondArtifact = createArtifact({
      projectId: f.project.id,
      slug: "batch-second",
      kind: "image",
    });
    const secondRevision = addArtifactRevision({
      artifactId: secondArtifact.id,
      objectId: f.sharedObject.id,
      state: "approved",
    });
    selectArtifactRevision({
      artifactId: secondArtifact.id,
      revisionId: secondRevision.id,
      expectedRevisionId: null,
    });
    const secondRunObject = recordRunObject({
      runId: f.run.id,
      path: "tmp/trace-2.bin",
      purpose: "diagnostic",
      state: "diagnostic",
      retention: "keep-on-failure",
    });
    const refs = [
      { type: "artifact" as const, id: secondArtifact.id },
      { type: "object" as const, id: f.projectObject.id },
      { type: "run-object" as const, id: f.runObject.id },
      { type: "artifact" as const, id: f.artifact.id },
      { type: "run-object" as const, id: secondRunObject.id },
      { type: "object" as const, id: f.sharedObject.id },
    ];
    const query = spyOn(openDomainDb(), "query");
    try {
      const cards = getMediaCards({
        context: { workspaceId: f.workspace.id, projectId: f.project.id },
        refs,
      });
      expect(cards.map((card) => card.ref)).toEqual(refs);
      const identityQueries = query.mock.calls.filter(([sql]) =>
        String(sql).includes("SELECT identity.id, identity.createdAt"),
      );
      expect(identityQueries.filter(([sql]) =>
        String(sql).includes("COUNT(*) AS producerCount"),
      )).toHaveLength(1);
      expect(identityQueries).toHaveLength(3);
    } finally {
      query.mockRestore();
    }
  });

  test("rejects the whole batch atomically without naming the bad ref", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const context = { workspaceId: f.workspace.id, projectId: f.project.id };
    for (const refs of [
      [{ type: "artifact", id: f.artifact.id }, { type: "artifact", id: f.artifact.id }],
      [{ type: "object", id: f.siblingObject.id }],
      [{ type: "artifact", id: f.artifact.id }, { type: "object", id: "obj_missing" }],
    ] as const) {
      expect(() => getMediaCards({ context, refs: [...refs] })).toThrow();
      const message = (() => {
        try {
          getMediaCards({ context, refs: [...refs] });
          return "";
        } catch (error) {
          return (error as Error).message;
        }
      })();
      expect(message).not.toContain("obj_missing");
      expect(message).not.toContain(f.siblingObject.id);
    }
    expect(() => getMediaCards({ context, refs: [] })).toThrow(/1\.\.100/);
    expect(() =>
      getMediaCards({
        context,
        refs: Array.from({ length: 101 }, (_, index) => ({
          type: "object" as const,
          id: `obj_${index}`,
        })),
      }),
    ).toThrow(/1\.\.100/);
    expect(() =>
      getMediaCards({ context, refs: [{ type: "bogus" as never, id: "x" }] }),
    ).toThrow(/ref type/i);
  });

  test("scopes visibility to the Project plus Workspace-shared rows", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const projectView = listMedia({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      limit: 100,
    });
    const seen = projectView.items.map((card) => card.ref.id);
    expect(seen).toContain(f.projectObject.id);
    expect(seen).toContain(f.sharedObject.id);
    expect(seen).toContain(f.artifact.id);
    expect(seen).toContain(f.runObject.id);
    expect(seen).not.toContain(f.siblingObject.id);

    const workspaceView = listMedia({
      context: { workspaceId: f.workspace.id },
      limit: 100,
    });
    const workspaceIds = workspaceView.items.map((card) => card.ref.id);
    expect(workspaceIds).toEqual([f.sharedObject.id]);
  });

  test("filters by type and pages by the creation cursor", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const objectsOnly = listMedia({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      types: ["object"],
      limit: 100,
    });
    expect(objectsOnly.items.every((card) => card.ref.type === "object")).toBe(true);

    const seen: string[] = [];
    let after: string | null = null;
    for (;;) {
      const page = listMedia({
        context: { workspaceId: f.workspace.id, projectId: f.project.id },
        after,
        limit: 1,
      });
      seen.push(...page.items.map((card) => card.ref.id));
      if (page.nextCursor === null) break;
      expect(page.nextCursor.startsWith("c1.")).toBe(true);
      after = page.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(() =>
      listMedia({
        context: { workspaceId: f.workspace.id },
        after: "v1.W1sxLCJhIl0",
        limit: 5,
      }),
    ).toThrow(/cursor/i);
    expect(() =>
      listMedia({ context: { workspaceId: f.workspace.id }, types: [], limit: 5 }),
    ).toThrow(/at least one type/i);
  });

  test("media facets classify every card and filter before the page limit", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const context = { workspaceId: f.workspace.id, projectId: f.project.id };
    const db = openDomainDb();
    db.prepare("UPDATE objects SET mime = 'image/png', created_at = 1 WHERE id = ?")
      .run(f.projectObject.id);
    db.prepare("UPDATE objects SET mime = 'video/mp4', created_at = 2 WHERE id = ?")
      .run(f.sharedObject.id);

    expect(listMedia({ context, limit: 100 }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: { type: "artifact", id: f.artifact.id },
          mediaKind: "image",
          provenance: "unknown",
        }),
        expect.objectContaining({
          ref: { type: "run-object", id: f.runObject.id },
          mediaKind: "other",
          provenance: "not-generation",
        }),
      ]),
    );
    expect(listMedia({
      context,
      types: ["object"],
      mediaKind: "video",
      limit: 1,
    }).items.map((card) => card.ref.id)).toEqual([f.sharedObject.id]);
    const generated = recordRunObject({
      runId: startRun({ projectId: f.project.id, kind: "generation" }).id,
      path: "tmp/generated.png",
      purpose: "result",
      state: "ready",
      retention: "keep",
      mime: "image/png",
    });
    db.prepare("UPDATE run_objects SET created_at = 3 WHERE id = ?").run(f.runObject.id);
    db.prepare("UPDATE run_objects SET created_at = 4 WHERE id = ?").run(generated.id);
    expect(listMedia({
      context,
      types: ["run-object"],
      provenance: "generation",
      limit: 1,
    }).items.map((card) => card.ref.id)).toEqual([generated.id]);
    expect(() => listMedia({ context, mediaKind: "archive" as never, limit: 1 }))
      .toThrow(/media kind/i);
    expect(() => listMedia({ context, provenance: "maybe" as never, limit: 1 }))
      .toThrow(/media provenance/i);
  });

  test("media facets classify the closed MIME matrix", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const cases = [
      { mime: "image/png", kind: "image" },
      { mime: "video/mp4", kind: "video" },
      { mime: "audio/wav", kind: "audio" },
      { mime: "text/markdown", kind: "document" },
      { mime: "application/pdf", kind: "document" },
      { mime: "application/vnd.ralphy.workspace+json", kind: "document" },
      { mime: "application/octet-stream", kind: "other" },
    ] as const;
    const refs = [];
    for (const [index, item] of cases.entries()) {
      const object = await ingest(
        root,
        `mime-${index}.bin`,
        { workspaceId: f.workspace.id, projectId: f.project.id },
        item.mime,
      );
      refs.push({ type: "object" as const, id: object.id });
    }
    expect(getMediaCards({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      refs,
    }).map((card) => ({ kind: card.mediaKind, provenance: card.provenance })))
      .toEqual(cases.map((item) => ({ kind: item.kind, provenance: "unknown" })));
  });

  test("media facets preserve producer cardinality and consumer isolation", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const context = { workspaceId: f.workspace.id, projectId: f.project.id };
    const selected = (slug: string, state = "approved" as const) => {
      const artifact = createArtifact({ projectId: f.project.id, slug, kind: "image" });
      const revision = addArtifactRevision({
        artifactId: artifact.id,
        objectId: f.projectObject.id,
        state,
      });
      selectArtifactRevision({
        artifactId: artifact.id,
        revisionId: revision.id,
        expectedRevisionId: null,
      });
      return { artifact, revision };
    };
    const direct = selected("facet-direct");
    const buildOnly = selected("facet-build");
    const nonGeneration = selected("facet-non-generation");
    const caseSensitive = selected("facet-case-sensitive");
    const absent = selected("facet-absent");
    const ambiguous = selected("facet-ambiguous");
    const deduplicated = selected("facet-deduplicated");
    const mixed = selected("facet-mixed");
    const unselected = createArtifact({
      projectId: f.project.id,
      slug: "facet-unselected",
      kind: "image",
    });
    addArtifactRevision({
      artifactId: unselected.id,
      objectId: f.projectObject.id,
      state: "approved",
    });

    const directRun = startRun({ projectId: f.project.id, kind: "generation" });
    recordRunResult(openDomainDb(), {
      runId: directRun.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: direct.revision.id,
    });
    const nonGenerationRun = startRun({ projectId: f.project.id, kind: "render" });
    recordRunResult(openDomainDb(), {
      runId: nonGenerationRun.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: nonGeneration.revision.id,
    });
    const caseSensitiveRun = startRun({
      projectId: f.project.id,
      kind: "Generate.image",
    });
    recordRunResult(openDomainDb(), {
      runId: caseSensitiveRun.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: caseSensitive.revision.id,
    });
    for (let position = 0; position < 2; position += 1) {
      const run = startRun({ projectId: f.project.id, kind: "generation" });
      recordRunResult(openDomainDb(), {
        runId: run.id,
        position,
        entityType: "artifact_revision",
        entityId: ambiguous.revision.id,
      });
    }

    const composition = createComposition({
      projectId: f.project.id,
      slug: "facet-producers",
      kind: "video",
    });
    const draft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    bindCompositionInput({
      revisionId: draft.id,
      artifactRevisionId: direct.revision.id,
      role: "source",
      position: 0,
    });
    const compositionRevision = sealCompositionRevision({ revisionId: draft.id });
    const recordBuildProducer = (runId: string, artifactRevisionId: string, position: number) => {
      const build = startBuild({
        compositionRevisionId: compositionRevision.id,
        runId,
        profile: { fixture: true },
      });
      const completed = completeBuild({
        buildId: build.id,
        outputs: [{ artifactRevisionId, role: "result", position: 0 }],
      });
      recordRunResult(openDomainDb(), {
        runId,
        position,
        entityType: "build",
        entityId: completed.id,
      });
    };
    const buildRun = startRun({ projectId: f.project.id, kind: "generate.video" });
    recordBuildProducer(buildRun.id, buildOnly.revision.id, 0);
    const sameRun = startRun({ projectId: f.project.id, kind: "generation" });
    recordRunResult(openDomainDb(), {
      runId: sameRun.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: deduplicated.revision.id,
    });
    recordBuildProducer(sameRun.id, deduplicated.revision.id, 1);
    const mixedDirectRun = startRun({ projectId: f.project.id, kind: "generation" });
    recordRunResult(openDomainDb(), {
      runId: mixedDirectRun.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: mixed.revision.id,
    });
    const mixedBuildRun = startRun({ projectId: f.project.id, kind: "generation" });
    recordBuildProducer(mixedBuildRun.id, mixed.revision.id, 0);

    const expected = new Map([
      [direct.artifact.id, "generation"],
      [buildOnly.artifact.id, "generation"],
      [nonGeneration.artifact.id, "not-generation"],
      [caseSensitive.artifact.id, "not-generation"],
      [absent.artifact.id, "unknown"],
      [ambiguous.artifact.id, "unknown"],
      [deduplicated.artifact.id, "generation"],
      [mixed.artifact.id, "unknown"],
      [unselected.id, "unknown"],
    ] as const);
    const page = listMedia({ context, types: ["artifact"], limit: 100 });
    const byId = new Map(page.items.map((card) => [card.ref.id, card]));
    for (const [id, provenance] of expected) {
      expect(byId.get(id)).toMatchObject({ mediaKind: id === unselected.id ? "other" : "image", provenance });
      expect(getMediaCard({ context, ref: { type: "artifact", id } })).toMatchObject({ provenance });
    }
    expect(listMedia({
      context,
      types: ["artifact"],
      filter: "approved",
      mediaKind: "image",
      provenance: "generation",
      limit: 100,
    }).items.map((card) => card.ref.id).sort()).toEqual([
      buildOnly.artifact.id,
      deduplicated.artifact.id,
      direct.artifact.id,
    ].sort());

    const owner = installConsumer(root, {
      id: "media_facet_owner",
      namespace: "media-facet-owner",
      tokenByte: 41,
    });
    const other = installConsumer(root, {
      id: "media_facet_other",
      namespace: "media-facet-other",
      tokenByte: 42,
    });
    const ownerSession = startConsumerSession(owner.authority, {
      workspaceId: f.workspace.id,
      projectId: f.project.id,
    });
    const otherSession = startConsumerSession(other.authority, {
      workspaceId: f.workspace.id,
      projectId: f.project.id,
    });
    const privateArtifact = selected("facet-private-producer");
    const privateRun = startConsumerOperationRun(owner.authority, {
      sessionId: ownerSession.id,
      workspaceId: f.workspace.id,
      projectId: f.project.id,
      kind: "generation",
      external: {
        runId: "facet-private-run",
        nodeId: "facet-node",
        attempt: 1,
        operation: "generation",
        idempotencyKey: "facet-private",
      },
      requestDigest: requestDigest({ fixture: "facet-private" }),
    }).run;
    recordRunResult(openDomainDb(), {
      runId: privateRun.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: privateArtifact.revision.id,
    });
    const privateRunObject = recordRunObject({
      runId: privateRun.id,
      path: "tmp/facet-private.png",
      purpose: "result",
      state: "ready",
      retention: "keep",
      mime: "image/png",
    });
    const crossAuthorityArtifact = selected("facet-cross-authority-producers");
    recordRunResult(openDomainDb(), {
      runId: privateRun.id,
      position: 1,
      entityType: "artifact_revision",
      entityId: crossAuthorityArtifact.revision.id,
    });
    const otherRun = startConsumerOperationRun(other.authority, {
      sessionId: otherSession.id,
      workspaceId: f.workspace.id,
      projectId: f.project.id,
      kind: "generation",
      external: {
        runId: "facet-other-run",
        nodeId: "facet-other-node",
        attempt: 1,
        operation: "generation",
        idempotencyKey: "facet-other",
      },
      requestDigest: requestDigest({ fixture: "facet-other" }),
    }).run;
    recordRunResult(openDomainDb(), {
      runId: otherRun.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: crossAuthorityArtifact.revision.id,
    });
    const query = spyOn(openDomainDb(), "query");
    try {
      expect(listMedia({
        context: { sessionId: ownerSession.id, consumerAuthority: owner.authority },
        limit: 100,
      }).items.length).toBeGreaterThan(1);
      expect(query.mock.calls.filter(([sql]) =>
        String(sql).includes("SELECT consumer_principal_id AS principalId"),
      )).toHaveLength(1);
      const identityQueries = query.mock.calls.filter(([sql]) =>
        String(sql).includes("SELECT identity.id, identity.createdAt"),
      );
      expect(identityQueries).toHaveLength(3);
      expect(identityQueries.filter(([sql]) =>
        String(sql).includes("COUNT(*) AS producerCount"),
      )).toHaveLength(1);
    } finally {
      query.mockRestore();
    }
    expect(getMediaCard({
      context: { sessionId: ownerSession.id, consumerAuthority: owner.authority },
      ref: { type: "artifact", id: privateArtifact.artifact.id },
    }).provenance).toBe("generation");
    expect(getMediaCard({
      context: { sessionId: otherSession.id, consumerAuthority: other.authority },
      ref: { type: "artifact", id: privateArtifact.artifact.id },
    }).provenance).toBe("unknown");
    for (const [sessionId, consumerAuthority] of [
      [ownerSession.id, owner.authority],
      [otherSession.id, other.authority],
    ] as const) {
      expect(getMediaCard({
        context: { sessionId, consumerAuthority },
        ref: { type: "artifact", id: crossAuthorityArtifact.artifact.id },
      }).provenance).toBe("unknown");
    }
    expect(listMedia({
      context: { sessionId: otherSession.id, consumerAuthority: other.authority },
      types: ["run-object"],
      limit: 100,
    }).items.map((card) => card.ref.id)).not.toContain(privateRunObject.id);
    expect(() => getMediaCard({
      context: { sessionId: otherSession.id, consumerAuthority: other.authority },
      ref: { type: "run-object", id: privateRunObject.id },
    })).toThrow(/unresolvable/);
  });

  test("applies every media predicate before cursor and limit without widening visibility", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const otherWorkspace = createWorkspace({ slug: "other-media", name: "Other Media" });
    const otherProject = createProject({
      workspaceId: otherWorkspace.id,
      slug: "other-media",
      name: "Other Media",
    });
    const otherObject = await ingest(root, "other.png", {
      workspaceId: otherWorkspace.id,
      projectId: otherProject.id,
    });

    const addSelected = (
      slug: string,
      state: "working" | "candidate" | "approved" | "rejected" | "superseded",
      projectId = f.project.id,
      objectId = f.projectObject.id,
    ) => {
      const artifact = createArtifact({ projectId, slug, kind: "image" });
      const revision = addArtifactRevision({
        artifactId: artifact.id,
        objectId,
        state,
      });
      selectArtifactRevision({
        artifactId: artifact.id,
        revisionId: revision.id,
        expectedRevisionId: null,
      });
      return { artifact, revision };
    };
    const candidate = addSelected("candidate", "candidate");
    const approved = addSelected("approved", "approved");
    const rejected = addSelected("rejected", "rejected");
    const superseded = addSelected("superseded", "superseded");
    const siblingApproved = addSelected(
      "sibling-approved",
      "approved",
      f.sibling.id,
      f.siblingObject.id,
    );
    const otherApproved = addSelected(
      "other-approved",
      "approved",
      otherProject.id,
      otherObject.id,
    );
    const sharedReference = createArtifact({
      workspaceId: f.workspace.id,
      slug: "shared-reference",
      kind: "image",
    });
    const sharedReferenceRevision = addArtifactRevision({
      artifactId: sharedReference.id,
      objectId: f.sharedObject.id,
      state: "working",
    });
    selectArtifactRevision({
      artifactId: sharedReference.id,
      revisionId: sharedReferenceRevision.id,
      expectedRevisionId: null,
    });
    addArtifactUsage({
      artifactRevisionId: sharedReferenceRevision.id,
      workspaceId: f.workspace.id,
      role: "reference",
    });
    const mixedCaseRunObjects = ["Cache/upper.bin", "Tmp/upper.bin"].map(
      (logicalPath) => recordRunObject({
        runId: f.run.id,
        path: logicalPath,
        purpose: "intermediate",
        state: "cached",
        retention: "cache",
      }),
    );

    const expected = {
      references: [sharedReference.id],
      working: [f.artifact.id, sharedReference.id],
      candidate: [candidate.artifact.id],
      approved: [approved.artifact.id],
      rejected: [rejected.artifact.id],
      superseded: [superseded.artifact.id],
      "run-diagnostics": [f.runObject.id],
      "run-cache-temp": [f.runObject.id],
      "advanced-objects": [f.projectObject.id, f.sharedObject.id],
    } as const;
    const context = { workspaceId: f.workspace.id, projectId: f.project.id };
    expect(mixedCaseRunObjects.map((item) =>
      (getMediaCard({ context, ref: { type: "run-object", id: item.id } }) as {
        locationClass: string;
      }).locationClass,
    )).toEqual(["other", "other"]);
    for (const [filter, ids] of Object.entries(expected)) {
      const seen: string[] = [];
      let after: string | null = null;
      do {
        const page = listMedia({ context, filter: filter as never, after, limit: 1 });
        seen.push(...page.items.map((item) => item.ref.id));
        after = page.nextCursor;
      } while (after !== null);
      expect(seen.sort()).toEqual([...ids].sort());
    }
    expect(listMedia({
      context,
      types: ["object"],
      filter: "references" as never,
      limit: 1,
    }).items).toEqual([]);
    expect(listMedia({
      context: { workspaceId: f.workspace.id },
      filter: "references" as never,
      limit: 10,
    }).items.map((item) => item.ref.id)).toEqual([sharedReference.id]);
    expect(listMedia({ context, filter: "approved" as never, limit: 10 }).items.map(
      (item) => item.ref.id,
    )).toEqual([approved.artifact.id]);
    expect([siblingApproved.artifact.id, otherApproved.artifact.id]).not.toContain(
      approved.artifact.id,
    );
  });

  test("counts every registered Object reference and detects registry drift", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const composition = createComposition({
      projectId: f.project.id,
      slug: "cut",
      kind: "video",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "remotion",
    });
    putCompositionSource({
      revisionId: revision.id,
      logicalPath: "project.png",
      objectId: f.projectObject.id,
    });
    const db = openDomainDb();
    db.prepare("UPDATE run_objects SET object_id = ? WHERE id = ?").run(
      f.projectObject.id,
      f.runObject.id,
    );
    const now = Date.now();
    const job = db
      .prepare(
        `INSERT INTO jobs
         (run_id, kind, status, command, depends_on, created_at, project_id)
         VALUES (?, 'reference-audit', 'completed', '[]', '[]', ?, ?)`,
      )
      .run(f.run.id, now, f.project.id);
    db.prepare(
      `INSERT INTO job_artifacts (job_id, object_id, kind, path)
       VALUES (?, ?, 'output', 'project.png')`,
    ).run(job.lastInsertRowid, f.projectObject.id);
    db.prepare(
      `INSERT INTO storage_transfers
       (id, workspace_id, project_id, kind, state, source_bucket,
        destination_bucket, created_at, updated_at)
       VALUES ('transfer_reference_audit', ?, ?, 'copy', 'completed',
               'source-bucket', 'destination-bucket', ?, ?)`,
    ).run(f.workspace.id, f.project.id, now, now);
    db.prepare(
      `INSERT INTO storage_transfer_entries
       (id, transfer_id, object_id, source_key, destination_key, state,
        created_at, updated_at)
       VALUES ('transfer_entry_reference_audit', 'transfer_reference_audit', ?,
               'source/project.png', 'destination/project.png', 'completed', ?, ?)`,
    ).run(f.projectObject.id, now, now);
    db.prepare(
      `INSERT INTO migration_runs (id, phase, created_at, updated_at)
       VALUES ('mig_reference_audit', 'audited', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO migration_sources
       (id, migration_run_id, source_kind, source_label, canonical_path_hash,
        source_device, source_inode, source_mode, created_at)
       VALUES ('migration_source_reference_audit', 'mig_reference_audit',
               'ralphy', 'fixture', ?, '1', '2', 448, ?)`,
    ).run("a".repeat(64), now);
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path,
        source_locator_hash, entry_kind, source_kind, disposition,
        source_device, source_inode, source_mode, bytes, mtime_ms,
        raw_evidence_object_id, state, created_at, updated_at)
       VALUES ('migration_entry_reference_audit', 'mig_reference_audit',
               'migration_source_reference_audit', 'raw.json', ?, 'file',
               'ralphy', 'domain', '1', '3', 420, 1, ?, ?, 'inventoried', ?, ?)`,
    ).run("b".repeat(64), now, f.projectObject.id, now, now);
    const [card] = getMediaCards({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      refs: [{ type: "object", id: f.projectObject.id }],
    });
    // One row in every registered Object reference source.
    expect(card).toMatchObject({ referenceCount: 6 });
    expect(
      OBJECT_REFERENCE_SOURCES.map(({ table, column }) =>
        db
          .query<{ total: number }, [string]>(
            `SELECT COUNT(*) AS total FROM ${table} WHERE ${column} = ?`,
          )
          .get(f.projectObject.id)!.total,
      ),
    ).toEqual([1, 1, 1, 1, 1, 1]);

    const actual = db
      .query<{ table: string; column: string }, []>(
        `SELECT m.name AS "table", fk."from" AS "column"
         FROM sqlite_master m
         JOIN pragma_foreign_key_list(m.name) fk
         WHERE m.type = 'table' AND fk."table" = 'objects'
         ORDER BY m.name, fk."from"`,
      )
      .all();
    expect(actual).toEqual(
      [...OBJECT_REFERENCE_SOURCES]
        .map((source) => ({ table: source.table, column: source.column }))
        .sort((left, right) =>
          left.table < right.table ? -1 : left.table > right.table ? 1 : 0,
        ),
    );
  });
});

function recursiveKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(recursiveKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...recursiveKeys(child)]);
}

function errorMessage(fn: () => unknown): string {
  try {
    fn();
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

describe("media review", () => {
  test("creates the state revision, selection, Evaluation, and feedback atomically", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const iteration = createIteration({ projectId: f.project.id, title: "v1" });
    const result = reviewMedia({
      ref: { type: "artifact", id: f.artifact.id },
      expectedSelectedRevisionId: f.revision.id,
      verdict: "needs-work",
      authoredBySessionId: f.session.id,
      iterationId: iteration.id,
      feedback: "Tighten the first beat.",
      favorite: true,
      rating: 3,
      tags: ["hook"],
    });
    expect(result.revisionId).not.toBe(f.revision.id);
    expect(result.card.selectedRevisionId).toBe(result.revisionId);
    expect(result.card.selectedState).toBe("candidate");
    expect(
      getArtifact({
        context: { workspaceId: f.workspace.id, projectId: f.project.id },
        artifactId: f.artifact.id,
      }).selectedRevisionId,
    ).toBe(result.revisionId);
    expect(result.evaluation).toMatchObject({
      target: { type: "artifact_revision", id: result.revisionId },
      kind: "media-review",
      verdict: "needs-work",
      favorite: true,
      rating: 3,
      tags: ["hook"],
      projectId: f.project.id,
    });
    expect(result.feedbackId).not.toBeNull();
    const feedback = openDomainDb()
      .query<{ body: string; targetId: string; status: string }, [string]>(
        `SELECT body, target_id AS targetId, status FROM feedback_items WHERE id = ?`,
      )
      .get(result.feedbackId!);
    expect(feedback).toEqual({
      body: "Tighten the first beat.",
      targetId: result.revisionId,
      status: "open",
    });
    const report = verifyDomainStore();
    // The fixture deliberately ingests Workspace and sibling Objects that
    // nothing references yet, so assert the chains under test.
    expect(report.brokenRevisionChains).toEqual([]);
    expect(report.sessionProvenanceIssues).toEqual([]);
    expect(report.runObjectIssues).toEqual([]);
  });

  test("maps each verdict to its state and rolls back a stale selection", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const first = reviewMedia({
      ref: { type: "artifact", id: f.artifact.id },
      expectedSelectedRevisionId: f.revision.id,
      verdict: "shortlist",
      authoredBySessionId: f.session.id,
    });
    expect(first.card.selectedState).toBe("candidate");
    const second = reviewMedia({
      ref: { type: "artifact", id: f.artifact.id },
      expectedSelectedRevisionId: first.revisionId,
      verdict: "approved",
      authoredBySessionId: f.session.id,
    });
    expect(second.card.selectedState).toBe("approved");

    const before = listEvaluations({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      limit: 100,
    }).items.length;
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: f.artifact.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "rejected",
        authoredBySessionId: f.session.id,
      }),
    ).toThrow(StoreConflictError);
    expect(
      listEvaluations({
        context: { workspaceId: f.workspace.id, projectId: f.project.id },
        limit: 100,
      }).items.length,
    ).toBe(before);
    expect(
      getArtifact({
        context: { workspaceId: f.workspace.id, projectId: f.project.id },
        artifactId: f.artifact.id,
      }).selectedRevisionId,
    ).toBe(second.revisionId);
    expect(verifyDomainStore().brokenRevisionChains).toEqual([]);
  });

  test("rolls back every row when the Iteration is invalid", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const iteration = createIteration({ projectId: f.project.id, title: "v1" });
    // No public close verb yet, so close it the way the store stores it.
    openDomainDb()
      .prepare(
        "UPDATE project_iterations SET state = 'closed', closed_at = 1 WHERE id = ?",
      )
      .run(iteration.id);
    const siblingIteration = createIteration({
      projectId: f.sibling.id,
      title: "sibling",
    });
    const db = openDomainDb();
    const counts = () => ({
      revisions: db
        .query<{ total: number }, [string]>(
          "SELECT COUNT(*) AS total FROM artifact_revisions WHERE artifact_id = ?",
        )
        .get(f.artifact.id)!.total,
      evaluations: db
        .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM evaluations")
        .get()!.total,
      feedback: db
        .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM feedback_items")
        .get()!.total,
    });
    const before = counts();
    for (const iterationId of [iteration.id, siblingIteration.id, "iter_missing"]) {
      expect(() =>
        reviewMedia({
          ref: { type: "artifact", id: f.artifact.id },
          expectedSelectedRevisionId: f.revision.id,
          verdict: "needs-work",
          authoredBySessionId: f.session.id,
          iterationId,
          feedback: "note",
        }),
      ).toThrow();
    }
    expect(counts()).toEqual(before);
    expect(
      getArtifact({
        context: { workspaceId: f.workspace.id, projectId: f.project.id },
        artifactId: f.artifact.id,
      }).selectedRevisionId,
    ).toBe(f.revision.id);
  });

  test("requires an Iteration and feedback for needs-work on a Project Artifact", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: f.artifact.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "needs-work",
        authoredBySessionId: f.session.id,
      }),
    ).toThrow(/requires an Iteration and feedback/i);
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: f.artifact.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "shortlist",
        authoredBySessionId: f.session.id,
        feedback: "no iteration",
      }),
    ).toThrow(/requires an Iteration/i);
  });

  test("a Workspace Artifact review takes no Iteration or feedback", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "ws-media", name: "WS" });
    const object = await ingest(root, "ws.png", { workspaceId: workspace.id });
    const artifact = createArtifact({
      workspaceId: workspace.id,
      slug: "shared",
      kind: "image",
    });
    const revision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "working",
    });
    selectArtifactRevision({
      artifactId: artifact.id,
      revisionId: revision.id,
      expectedRevisionId: null,
    });
    const session = startAgentSession({
      workspaceId: workspace.id,
      agent: "reviewer",
    });
    const result = reviewMedia({
      ref: { type: "artifact", id: artifact.id },
      expectedSelectedRevisionId: revision.id,
      verdict: "needs-work",
      authoredBySessionId: session.id,
    });
    expect(result.card.selectedState).toBe("candidate");
    expect(result.feedbackId).toBeNull();
    expect(result.evaluation.projectId).toBeNull();
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: artifact.id },
        expectedSelectedRevisionId: result.revisionId,
        verdict: "shortlist",
        authoredBySessionId: session.id,
        feedback: "not allowed",
      }),
    ).toThrow(/no Iteration or feedback/i);
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("refuses a non-Artifact ref, an unselected Artifact, and a dead Session", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    for (const ref of [
      { type: "object" as const, id: f.projectObject.id },
      { type: "run-object" as const, id: f.runObject.id },
    ]) {
      expect(() =>
        reviewMedia({
          ref,
          expectedSelectedRevisionId: f.revision.id,
          verdict: "approved",
          authoredBySessionId: f.session.id,
        }),
      ).toThrow(/only an Artifact ref is reviewable/i);
    }
    const unselected = createArtifact({
      projectId: f.project.id,
      slug: "unselected",
      kind: "image",
    });
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: unselected.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "approved",
        authoredBySessionId: f.session.id,
      }),
    ).toThrow(/must be selected/i);
    endAgentSession(f.session.id);
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: f.artifact.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "approved",
        authoredBySessionId: f.session.id,
      }),
    ).toThrow(/ended/i);
  });
});
