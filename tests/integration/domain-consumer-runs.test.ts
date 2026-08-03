import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import {
  canonicalRequestJson,
  requestDigest,
} from "../../cli/lib/store/canonical-json.js";
import {
  bindConsumerPrincipal,
  consumerCredentialDigest,
} from "../../cli/lib/store/consumers.js";
import {
  authenticateConsumer,
  revokeConsumerAuthority,
} from "../../cli/lib/store/consumer-auth.js";
import { getConsumerPrincipal } from "../../cli/lib/store/internal-consumers.js";
import {
  findConsumerOperation,
  listRunResults,
  startConsumerOperationRun,
  startConsumerOperationRunInTransaction,
} from "../../cli/lib/store/consumer-runs.js";
import {
  createComposition,
  failBuild,
  putCompositionSource,
  reviseComposition,
  sealCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import {
  closeDomainDb,
  openDomainDb,
  withImmediateTransaction,
} from "../../cli/lib/store/db.js";
import {
  claimNextPending,
  insertJob,
  insertJobInTransaction,
  retryJob,
  retryJobsByFilter,
  getJob,
  finalizeJob,
} from "../../cli/lib/jobs/db.js";
import {
  finishRun,
  finishRunAttempt,
  recordRunResult,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import {
  endConsumerSession,
  startAgentSession,
  startConsumerSession,
} from "../../cli/lib/store/sessions.js";
import {
  createDocument,
  reviseDocument,
} from "../../cli/lib/store/documents.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import {
  appendMetricSnapshot,
  claimPublication,
  createUnit,
  finishPublicationClaim,
  recordPublication,
  reviseUnit,
} from "../../cli/lib/store/units.js";
import { StoreConflictError } from "../../cli/lib/store/types.js";
import { verifyDomainStore } from "../../cli/lib/store/verify.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { installFarmConsumer } from "../helpers/consumer-auth.js";

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-consumer-runs");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

const DIGEST = consumerCredentialDigest(
  Buffer.alloc(32, 3).toString("base64url"),
);

function bind(namespace = "farm", id = "consumer_farm", digest = DIGEST) {
  return withImmediateTransaction((db) =>
    bindConsumerPrincipal(db, { id, namespace, identityDigest: digest }),
  );
}

function fixture(slug: string) {
  const root = roots.at(-1)!;
  const workspace = createWorkspace({ slug, name: slug });
  const project = createProject({
    workspaceId: workspace.id,
    slug,
    name: slug,
  });
  const farm = installFarmConsumer(root);
  const session = startConsumerSession(farm.authority, {
    workspaceId: workspace.id,
    projectId: project.id,
  });
  return {
    workspace,
    project,
    principal: { id: farm.identity.consumerId },
    session,
    authority: farm.authority,
    token: farm.token,
  };
}

const EXTERNAL = {
  runId: "farm-run-1",
  nodeId: "node-1",
  attempt: 1,
  operation: "generation",
  idempotencyKey: "key-1",
};

function start(
  slug: string,
  overrides: Partial<Parameters<typeof startConsumerOperationRun>[1]> = {},
) {
  const scope = fixture(slug);
  return {
    scope,
    accepted: startConsumerOperationRun(scope.authority, {
      sessionId: scope.session.id,
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      kind: "generation",
      external: EXTERNAL,
      requestDigest: requestDigest({ prompt: "hello" }),
      ...overrides,
    }),
  };
}

const CONSUMER_OPERATIONS = [
  "generation",
  "build",
  "unit-revision",
  "publication",
  "metric-refresh",
  "agent-turn",
] as const;
const RETRY_OPERATIONS = [
  "generation",
  "build",
  "publication",
  "metric-refresh",
] as const;

type ConsumerOperation = (typeof CONSUMER_OPERATIONS)[number];
type ConsumerFixture = ReturnType<typeof fixture>;

function externalOperation(operation: ConsumerOperation, attempt = 1) {
  return {
    runId: `farm-${operation}`,
    nodeId: `${operation}-node`,
    attempt,
    operation,
    idempotencyKey: `${operation}-key-${attempt}`,
  };
}

function createTextRevisions(scope: ConsumerFixture, slug: string) {
  const document = createDocument({
    projectId: scope.project.id,
    kind: "note",
    slug,
    title: slug,
  });
  const first = reviseDocument({
    documentId: document.id,
    expectedHeadId: null,
    format: "text",
    body: `${slug}-one`,
  });
  const second = reviseDocument({
    documentId: document.id,
    expectedHeadId: first.id,
    format: "text",
    body: `${slug}-two`,
  });
  return { document, first, second };
}

function createUnitGraph(
  scope: ConsumerFixture,
  slug: string,
  withPresentation: boolean,
) {
  const source = createTextRevisions(scope, `${slug}-source`).second;
  const unit = createUnit({
    projectId: scope.project.id,
    slug,
    format: "article",
  });
  const revision = reviseUnit({
    unitId: unit.id,
    expectedLatestRevisionId: null,
    items: [
      {
        documentRevisionId: source.id,
        role: "body",
        position: 0,
      },
    ],
    presentations: withPresentation
      ? [{ platform: "manual", caption: `${slug} caption` }]
      : [],
  });
  const db = openDomainDb();
  const item = db
    .query<
      { id: string },
      [string]
    >("SELECT id FROM unit_items WHERE unit_revision_id = ? AND position = 0")
    .get(revision.id)!;
  const presentation = withPresentation
    ? db
        .query<
          { id: string },
          [string]
        >("SELECT id FROM unit_presentations WHERE unit_revision_id = ? AND position = 0")
        .get(revision.id)!
    : null;
  return { revision, item, presentation };
}

async function storeFixtureObject(scope: ConsumerFixture, name: string) {
  const sourcePath = path.join(roots.at(-1)!.dir, name);
  fs.writeFileSync(sourcePath, `fixture:${name}`);
  return ingestObject({
    scope: {
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
    },
    sourcePath,
    originalName: name,
    mime: name.endsWith(".html") ? "text/html" : "application/octet-stream",
    storageClass: "working",
  });
}

type ExpectedResult = { id: string; entityType: string; entityId: string };

async function writeOperationResults(
  scope: ConsumerFixture,
  operation: ConsumerOperation,
  runId: string,
): Promise<ExpectedResult[]> {
  const db = openDomainDb();
  const result = (input: {
    position: number;
    entityType: string;
    entityId: string;
  }): ExpectedResult => {
    const saved = recordRunResult(db, { runId, ...input });
    return {
      id: saved.id,
      entityType: saved.entityType,
      entityId: saved.entityId,
    };
  };
  if (operation === "generation") {
    const artifact = createArtifact({
      projectId: scope.project.id,
      slug: "generated-result",
      kind: "data",
    });
    const first = addArtifactRevision({
      artifactId: artifact.id,
      objectId: (await storeFixtureObject(scope, "generation-one.bin")).id,
      state: "candidate",
    });
    const second = addArtifactRevision({
      artifactId: artifact.id,
      objectId: (await storeFixtureObject(scope, "generation-two.bin")).id,
      parentRevisionId: first.id,
      state: "candidate",
    });
    return [
      result({
        position: 0,
        entityType: "artifact_revision",
        entityId: first.id,
      }),
      result({
        position: 1,
        entityType: "artifact_revision",
        entityId: second.id,
      }),
    ];
  }
  if (operation === "build") {
    const composition = createComposition({
      projectId: scope.project.id,
      slug: "build-composition",
      kind: "video",
    });
    const draft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "hyperframes",
    });
    putCompositionSource({
      revisionId: draft.id,
      logicalPath: "index.html",
      objectId: (await storeFixtureObject(scope, "build-source.html")).id,
    });
    const revision = sealCompositionRevision({ revisionId: draft.id });
    const build = startBuild({
      compositionRevisionId: revision.id,
      runId,
      profile: { preset: "fixture" },
    });
    failBuild(build.id, { error: "deterministic fixture result" });
    return [
      result({
        position: 0,
        entityType: "build",
        entityId: build.id,
      }),
      result({
        position: 1,
        entityType: "composition_revision",
        entityId: revision.id,
      }),
    ];
  }
  if (operation === "unit-revision") {
    const unit = createUnitGraph(scope, operation, false);
    return [
      result({
        position: 0,
        entityType: "unit_revision",
        entityId: unit.revision.id,
      }),
      result({
        position: 1,
        entityType: "unit_item",
        entityId: unit.item.id,
      }),
    ];
  }
  if (operation === "publication" || operation === "metric-refresh") {
    const unit = createUnitGraph(scope, operation, true);
    const presentationId = unit.presentation!.id;
    const submissionRunId =
      operation === "publication"
        ? runId
        : startRun({
            projectId: scope.project.id,
            kind: "publication-prerequisite",
          }).id;
    const publication = recordPublication({
      presentationId,
      submissionRunId,
      rail: "manual",
      idempotencyKey: `${operation}-publication-domain-fact`,
    });
    if (operation === "publication") {
      const claim = claimPublication(publication.id, "draft", 60_000);
      finishPublicationClaim(publication.id, {
        fence: claim.fence,
        state: "submitted",
        providerPublicationId: "fixture-publication",
        submittedAt: Date.now(),
      });
      const saved = db
        .query<
          { id: string },
          [string]
        >("SELECT id FROM run_results WHERE run_id = ?")
        .get(runId)!;
      return [
        { id: saved.id, entityType: "publication", entityId: publication.id },
      ];
    }
    const metrics = [
      appendMetricSnapshot({
        publicationId: publication.id,
        runId,
        position: 0,
        source: "farm",
        asOf: 100,
        views: 10,
      }),
      appendMetricSnapshot({
        publicationId: publication.id,
        runId,
        position: 1,
        source: "farm",
        asOf: 200,
        views: 20,
      }),
    ];
    return db
      .query<{ id: string; entityId: string }, [string]>(
        `SELECT id, entity_id AS entityId FROM run_results
         WHERE run_id = ? ORDER BY position`,
      )
      .all(runId)
      .map((saved, index) => ({
        id: saved.id,
        entityType: "metric_snapshot",
        entityId: metrics[index]!.id,
      }));
  }
  const revisions = createTextRevisions(scope, `${operation}-result`);
  return [
    result({
      position: 0,
      entityType: "document_revision",
      entityId: revisions.first.id,
    }),
    result({
      position: 1,
      entityType: "document_revision",
      entityId: revisions.second.id,
    }),
  ];
}

async function runConsumerController(input: {
  scope: ConsumerFixture;
  authority: ConsumerFixture["authority"];
  sessionId: string;
  operation: ConsumerOperation;
  external: ReturnType<typeof externalOperation>;
  digest: string;
}) {
  const accepted = startConsumerOperationRun(input.authority, {
    sessionId: input.sessionId,
    workspaceId: input.scope.workspace.id,
    projectId: input.scope.project.id,
    kind: input.operation,
    external: input.external,
    requestDigest: input.digest,
  });
  if (accepted.replayed) return { accepted, written: null };
  const results = await writeOperationResults(
    input.scope,
    input.operation,
    accepted.run.id,
  );
  const jobId =
    input.operation === "publication"
      ? null
      : insertJob({
          run_id: accepted.run.id,
          kind: "shell",
          command: { argv: ["consumer", input.operation] },
          project_id: input.scope.project.id,
        });
  return { accepted, written: { results, jobId } };
}

function consumerFactCounts() {
  return openDomainDb()
    .query<
      {
        runs: number;
        runAttempts: number;
        documents: number;
        documentRevisions: number;
        objects: number;
        artifacts: number;
        artifactRevisions: number;
        compositions: number;
        compositionRevisions: number;
        builds: number;
        units: number;
        unitRevisions: number;
        unitItems: number;
        unitPresentations: number;
        results: number;
        jobs: number;
        publications: number;
        metricSnapshots: number;
      },
      []
    >(
      `SELECT
         (SELECT COUNT(*) FROM runs) AS runs,
         (SELECT COUNT(*) FROM run_attempts) AS runAttempts,
         (SELECT COUNT(*) FROM documents) AS documents,
         (SELECT COUNT(*) FROM document_revisions) AS documentRevisions,
         (SELECT COUNT(*) FROM objects) AS objects,
         (SELECT COUNT(*) FROM artifacts) AS artifacts,
         (SELECT COUNT(*) FROM artifact_revisions) AS artifactRevisions,
         (SELECT COUNT(*) FROM compositions) AS compositions,
         (SELECT COUNT(*) FROM composition_revisions) AS compositionRevisions,
         (SELECT COUNT(*) FROM builds) AS builds,
         (SELECT COUNT(*) FROM units) AS units,
         (SELECT COUNT(*) FROM unit_revisions) AS unitRevisions,
         (SELECT COUNT(*) FROM unit_items) AS unitItems,
         (SELECT COUNT(*) FROM unit_presentations) AS unitPresentations,
         (SELECT COUNT(*) FROM run_results) AS results,
         (SELECT COUNT(*) FROM jobs) AS jobs,
         (SELECT COUNT(*) FROM publications) AS publications,
         (SELECT COUNT(*) FROM metric_snapshots) AS metricSnapshots`,
    )
    .get()!;
}

const OPERATION_COUNTS = {
  generation: {
    runs: 1,
    runAttempts: 0,
    documents: 0,
    documentRevisions: 0,
    objects: 2,
    artifacts: 1,
    artifactRevisions: 2,
    compositions: 0,
    compositionRevisions: 0,
    builds: 0,
    units: 0,
    unitRevisions: 0,
    unitItems: 0,
    unitPresentations: 0,
    results: 2,
    jobs: 1,
    publications: 0,
    metricSnapshots: 0,
  },
  build: {
    runs: 1,
    runAttempts: 0,
    documents: 0,
    documentRevisions: 0,
    objects: 1,
    artifacts: 0,
    artifactRevisions: 0,
    compositions: 1,
    compositionRevisions: 1,
    builds: 1,
    units: 0,
    unitRevisions: 0,
    unitItems: 0,
    unitPresentations: 0,
    results: 2,
    jobs: 1,
    publications: 0,
    metricSnapshots: 0,
  },
  "unit-revision": {
    runs: 1,
    runAttempts: 0,
    documents: 1,
    documentRevisions: 2,
    objects: 0,
    artifacts: 0,
    artifactRevisions: 0,
    compositions: 0,
    compositionRevisions: 0,
    builds: 0,
    units: 1,
    unitRevisions: 1,
    unitItems: 1,
    unitPresentations: 0,
    results: 2,
    jobs: 1,
    publications: 0,
    metricSnapshots: 0,
  },
  publication: {
    runs: 1,
    runAttempts: 1,
    documents: 1,
    documentRevisions: 2,
    objects: 0,
    artifacts: 0,
    artifactRevisions: 0,
    compositions: 0,
    compositionRevisions: 0,
    builds: 0,
    units: 1,
    unitRevisions: 1,
    unitItems: 1,
    unitPresentations: 1,
    results: 1,
    jobs: 0,
    publications: 1,
    metricSnapshots: 0,
  },
  "metric-refresh": {
    runs: 2,
    runAttempts: 0,
    documents: 1,
    documentRevisions: 2,
    objects: 0,
    artifacts: 0,
    artifactRevisions: 0,
    compositions: 0,
    compositionRevisions: 0,
    builds: 0,
    units: 1,
    unitRevisions: 1,
    unitItems: 1,
    unitPresentations: 1,
    results: 2,
    jobs: 1,
    publications: 1,
    metricSnapshots: 2,
  },
  "agent-turn": {
    runs: 1,
    runAttempts: 0,
    documents: 1,
    documentRevisions: 2,
    objects: 0,
    artifacts: 0,
    artifactRevisions: 0,
    compositions: 0,
    compositionRevisions: 0,
    builds: 0,
    units: 0,
    unitRevisions: 0,
    unitItems: 0,
    unitPresentations: 0,
    results: 2,
    jobs: 1,
    publications: 0,
    metricSnapshots: 0,
  },
} satisfies Record<ConsumerOperation, ReturnType<typeof consumerFactCounts>>;

describe("canonical request digest", () => {
  test("sorts keys by byte order, normalizes -0, and preserves array order", () => {
    expect(canonicalRequestJson({ b: 1, a: 2, A: 3 })).toBe(
      '{"A":3,"a":2,"b":1}',
    );
    expect(canonicalRequestJson({ z: [3, 1, 2] })).toBe('{"z":[3,1,2]}');
    expect(canonicalRequestJson({ n: -0 })).toBe('{"n":0}');
    expect(requestDigest({ a: 1, b: 2 })).toBe(requestDigest({ b: 2, a: 1 }));
    expect(requestDigest({ n: -0 })).toBe(requestDigest({ n: 0 }));
    expect(requestDigest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  test("preserves the established request serialization for a lone-surrogate key", () => {
    expect(canonicalRequestJson(JSON.parse('{"\\ud800":1}'))).toBe(
      '{"\\ud800":1}',
    );
  });

  test("rejects everything whose serialization is not well defined", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse: unknown[] = [1];
    sparse[2] = 3;
    for (const value of [
      { n: Number.NaN },
      { n: Number.POSITIVE_INFINITY },
      { u: undefined },
      { b: 1n },
      { d: new Date(0) },
      { m: new Map() },
      cyclic,
      { s: sparse },
      { lone: "\ud800" },
    ]) {
      expect(() => canonicalRequestJson(value as never)).toThrow(/request/i);
    }
  });
});

describe("consumer principals", () => {
  test("binds once and replays only byte-identical identity", () => {
    makeRoot();
    openDomainDb();
    expect(bind()).toBeUndefined();
    const principal = getConsumerPrincipal(openDomainDb(), "farm");
    expect(principal).toMatchObject({
      id: "consumer_farm",
      namespace: "farm",
      identityDigest: DIGEST,
      disabledAt: null,
    });
    expect(bind()).toBeUndefined();
    expect(getConsumerPrincipal(openDomainDb(), "farm")).toEqual(principal);
    expect(() => bind("farm", "consumer_other")).toThrow(StoreConflictError);
    expect(() => bind("farm", "consumer_farm", "b".repeat(64))).toThrow(
      StoreConflictError,
    );
    expect(() => bind("Farm")).toThrow(/namespace/i);
    expect(() => bind("farm2", "consumer_x", "nothex")).toThrow(/digest/i);
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("only authenticated consumer authority can mint a consumer Session", () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "mint", name: "Mint" });
    expect(() =>
      startAgentSession({ workspaceId: workspace.id, agent: "consumer:farm" }),
    ).toThrow(/reserved/i);
    const farm = installFarmConsumer(root);
    const session = startConsumerSession(farm.authority, {
      workspaceId: workspace.id,
    });
    expect(session.agent).toBe("consumer:farm");
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("a consumer Session cannot start an ordinary Run", () => {
    makeRoot();
    const { workspace, project, session } = fixture("ordinary");
    expect(() =>
      startRun({
        workspaceId: workspace.id,
        projectId: project.id,
        agentSessionId: session.id,
        kind: "generation",
      }),
    ).toThrow(/consumer Session cannot start an ordinary Run/i);
    expect(verifyDomainStore().integrity).toBe("ok");
  });
});

describe("external operation Runs", () => {
  test("rejects REPLACE conflicts against consumer tuple and idempotency key", () => {
    makeRoot();
    const { accepted } = start("replace-conflicts");
    const db = openDomainDb();

    expect(() =>
      db
        .prepare(
          `INSERT OR REPLACE INTO runs
           (id, workspace_id, project_id, agent_session_id, kind, state,
            external_system, external_run_id, external_node_id, external_attempt,
            external_operation, idempotency_key, request_digest,
            consumer_principal_id, created_at)
           SELECT 'run_replacement_tuple', workspace_id, project_id,
             agent_session_id, kind, 'pending', external_system, external_run_id,
             external_node_id, external_attempt, external_operation,
             'replacement-key', request_digest, consumer_principal_id, created_at
           FROM runs WHERE id = ?`,
        )
        .run(accepted.run.id),
    ).toThrow(/Run (?:identity|conflict|immutable)/i);
    expect(() =>
      db
        .prepare(
          `INSERT OR REPLACE INTO runs
           (id, workspace_id, project_id, agent_session_id, kind, state,
            external_system, external_run_id, external_node_id, external_attempt,
            external_operation, idempotency_key, request_digest,
            consumer_principal_id, created_at)
           SELECT 'run_replacement_key', workspace_id, project_id,
             agent_session_id, kind, 'pending', external_system,
             'replacement-external-run', external_node_id, external_attempt,
             external_operation, idempotency_key, request_digest,
             consumer_principal_id, created_at
           FROM runs WHERE id = ?`,
        )
        .run(accepted.run.id),
    ).toThrow(/Run (?:identity|conflict|immutable)/i);
    expect(
      db
        .query<{ id: string; state: string; count: number }, [string]>(
          `SELECT id, state, (SELECT COUNT(*) FROM runs) AS count
           FROM runs WHERE id = ?`,
        )
        .get(accepted.run.id),
    ).toEqual({ id: accepted.run.id, state: "pending", count: 1 });
  });

  test("allows the first worker Attempt but rejects generic external retry", () => {
    makeRoot();
    const { accepted } = start("attempt-lifecycle");
    const first = startRunAttempt({
      runId: accepted.run.id,
      provider: "local",
    });
    finishRunAttempt(first.id, { state: "failed", error: "fixture failure" });
    finishRun(accepted.run.id, { state: "failed", error: "fixture failure" });
    const db = openDomainDb();
    const activityCount = db
      .query<
        { count: number },
        []
      >("SELECT COUNT(*) AS count FROM activity_events")
      .get()!.count;

    expect(() => startRunAttempt({ runId: accepted.run.id })).toThrow(
      StoreConflictError,
    );
    expect(() =>
      db
        .prepare(
          "UPDATE runs SET state = 'running', ended_at = NULL, error = NULL WHERE id = ?",
        )
        .run(accepted.run.id),
    ).toThrow(/Run lifecycle/i);
    expect(
      db
        .query<{ state: string; attempts: number }, [string]>(
          `SELECT run.state AS state, COUNT(attempt.id) AS attempts
           FROM runs run LEFT JOIN run_attempts attempt ON attempt.run_id = run.id
           WHERE run.id = ? GROUP BY run.id`,
        )
        .get(accepted.run.id),
    ).toEqual({ state: "failed", attempts: 1 });
    expect(
      db
        .query<
          { count: number },
          []
        >("SELECT COUNT(*) AS count FROM activity_events")
        .get()!.count,
    ).toBe(activityCount);
  });

  test.each(CONSUMER_OPERATIONS)(
    "replays %s after reconnect by tuple and by key",
    async (operation) => {
      makeRoot();
      const scope = fixture(`replay-${operation}`);
      const external = externalOperation(operation);
      const digest = requestDigest({ operation, payload: "fixture" });
      const initial = await runConsumerController({
        scope,
        authority: scope.authority,
        sessionId: scope.session.id,
        operation,
        external,
        digest,
      });
      const accepted = initial.accepted;
      expect(initial.written).not.toBeNull();
      const expectedResults = initial.written!.results;
      expect(accepted.replayed).toBe(false);
      expect(accepted.run).toMatchObject({
        workspaceId: scope.workspace.id,
        projectId: scope.project.id,
        kind: operation,
        state: "pending",
      });
      expect(Object.keys(accepted.run).sort()).toEqual([
        "agentSessionId",
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

      revokeConsumerAuthority(scope.authority);
      const reconnectAuthority = authenticateConsumer("farm", scope.token);
      const reconnect = startConsumerSession(reconnectAuthority, {
        workspaceId: scope.workspace.id,
        projectId: scope.project.id,
      });
      const beforeReplay = consumerFactCounts();
      const activityBeforeReplay = openDomainDb()
        .query<
          { count: number },
          []
        >("SELECT COUNT(*) AS count FROM activity_events")
        .get()!.count;
      expect(beforeReplay).toEqual(OPERATION_COUNTS[operation]);
      const replay = await runConsumerController({
        scope,
        authority: reconnectAuthority,
        sessionId: reconnect.id,
        operation,
        external,
        digest,
      });
      expect(replay.accepted.replayed).toBe(true);
      expect(replay.accepted.run.id).toBe(accepted.run.id);
      expect(replay.accepted.run.state).toBe(
        operation === "publication" ? "succeeded" : "pending",
      );
      expect(replay.written).toBeNull();

      for (const selector of [
        {
          external: {
            runId: external.runId,
            nodeId: external.nodeId,
            attempt: external.attempt,
            operation: external.operation,
          },
        },
        { idempotencyKey: external.idempotencyKey },
      ] as const) {
        const recovered: ExpectedResult[] = [];
        let resultsAfter: string | null = null;
        for (;;) {
          const found = findConsumerOperation(reconnectAuthority, {
            sessionId: reconnect.id,
            workspaceId: scope.workspace.id,
            projectId: scope.project.id,
            resultsAfter,
            resultsLimit: 1,
            ...selector,
          });
          expect(found.replayed).toBe(true);
          expect(found.run.id).toBe(accepted.run.id);
          recovered.push(
            ...found.results.items.map(({ id, entityType, entityId }) => ({
              id,
              entityType,
              entityId,
            })),
          );
          if (found.results.nextCursor === null) break;
          expect(found.results.nextCursor.startsWith("p1.")).toBe(true);
          resultsAfter = found.results.nextCursor;
        }
        expect(recovered).toEqual(expectedResults);
      }
      expect(consumerFactCounts()).toEqual(beforeReplay);
      expect(
        openDomainDb()
          .query<
            { count: number },
            []
          >("SELECT COUNT(*) AS count FROM activity_events")
          .get()!.count,
      ).toBe(activityBeforeReplay);
      expect(verifyDomainStore().integrity).toBe("ok");
    },
  );

  test("conflicts on a changed digest, kind, scope, or tuple/key disagreement", () => {
    makeRoot();
    const { scope } = start("conflict");
    const base = {
      sessionId: scope.session.id,
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      kind: "generation",
      external: EXTERNAL,
      requestDigest: requestDigest({ prompt: "hello" }),
    };
    expect(() =>
      startConsumerOperationRun(scope.authority, {
        ...base,
        requestDigest: requestDigest({ prompt: "other" }),
      }),
    ).toThrow(StoreConflictError);
    expect(() =>
      startConsumerOperationRun(scope.authority, {
        ...base,
        kind: "transform",
      }),
    ).toThrow(StoreConflictError);
    // Same key, different tuple.
    expect(() =>
      startConsumerOperationRun(scope.authority, {
        ...base,
        external: { ...EXTERNAL, attempt: 2 },
      }),
    ).toThrow(StoreConflictError);
    // Same tuple, different key.
    expect(() =>
      startConsumerOperationRun(scope.authority, {
        ...base,
        external: { ...EXTERNAL, idempotencyKey: "key-2" },
      }),
    ).toThrow(StoreConflictError);
    const sibling = createProject({
      workspaceId: scope.workspace.id,
      slug: "conflict-sibling",
      name: "Conflict sibling",
    });
    const siblingSession = startConsumerSession(scope.authority, {
      workspaceId: scope.workspace.id,
      projectId: sibling.id,
    });
    expect(() =>
      startConsumerOperationRun(scope.authority, {
        ...base,
        sessionId: siblingSession.id,
        projectId: sibling.id,
      }),
    ).toThrow(StoreConflictError);
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("rejects an ordinary or ended Session", () => {
    makeRoot();
    const { scope, accepted } = start("authz");
    const ordinary = startAgentSession({
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      agent: "agent",
    });
    const base = {
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      kind: "generation",
      external: { ...EXTERNAL, idempotencyKey: "key-authz" },
      requestDigest: requestDigest({ prompt: "hello" }),
    };
    expect(() =>
      startConsumerOperationRun(scope.authority, {
        ...base,
        sessionId: ordinary.id,
      }),
    ).toThrow(/not owned/i);
    expect(() =>
      endConsumerSession(scope.authority, scope.session.id),
    ).toThrow(/active Run/i);
    finishRun(accepted.run.id, { state: "cancelled" });
    endConsumerSession(scope.authority, scope.session.id);
    expect(() =>
      startConsumerOperationRun(scope.authority, {
        ...base,
        sessionId: scope.session.id,
      }),
    ).toThrow(/not owned/i);
    expect(() =>
      findConsumerOperation(scope.authority, {
        sessionId: ordinary.id,
        workspaceId: scope.workspace.id,
        projectId: scope.project.id,
        idempotencyKey: EXTERNAL.idempotencyKey,
      }),
    ).toThrow(/not owned/i);
  });

  test("checks the exact principal after locating a replay candidate", () => {
    makeRoot();
    const { scope, accepted } = start("foreign-principal");
    const db = openDomainDb();
    withImmediateTransaction((tx) =>
      bindConsumerPrincipal(tx, {
        id: "consumer_foreign",
        namespace: "foreign",
        identityDigest: "c".repeat(64),
      }),
    );
    // The exact-principal check is defense in depth behind immutable provenance.
    // Bypass only that guard so the otherwise-valid foreign principal is the
    // located row owner and the replay comparison itself is exercised.
    db.exec("DROP TRIGGER runs_external_provenance_update_guard");
    db.prepare("UPDATE runs SET consumer_principal_id = ? WHERE id = ?").run(
      "consumer_foreign",
      accepted.run.id,
    );
    const input = {
      sessionId: scope.session.id,
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      kind: "generation",
      external: EXTERNAL,
      requestDigest: requestDigest({ prompt: "hello" }),
    };

    expect(() => startConsumerOperationRun(scope.authority, input)).toThrow(
      StoreConflictError,
    );
    expect(() =>
      findConsumerOperation(scope.authority, {
        sessionId: scope.session.id,
        workspaceId: scope.workspace.id,
        projectId: scope.project.id,
        idempotencyKey: EXTERNAL.idempotencyKey,
      }),
    ).toThrow(/not found/i);
    expect(() =>
      listRunResults({
        context: {
          sessionId: scope.session.id,
          consumerAuthority: scope.authority,
        },
        runId: accepted.run.id,
        limit: 1,
      }),
    ).toThrow(/own consumer principal/i);
    expect(consumerFactCounts().runs).toBe(1);
  });

  test("rejects an operation scope the Session does not contain", () => {
    makeRoot();
    const { scope } = start("scope");
    const sibling = createProject({
      workspaceId: scope.workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    expect(() =>
      startConsumerOperationRun(scope.authority, {
        sessionId: scope.session.id,
        workspaceId: scope.workspace.id,
        projectId: sibling.id,
        kind: "generation",
        external: { ...EXTERNAL, idempotencyKey: "key-scope" },
        requestDigest: requestDigest({ prompt: "hello" }),
      }),
    ).toThrow(/does not contain the operation scope/i);
  });

  test("commits the Run, domain row, and Job all-or-none", () => {
    makeRoot();
    const scope = fixture("atomic");
    const db = openDomainDb();
    const presentationId = createUnitGraph(scope, "atomic-publication", true)
      .presentation!.id;
    const counts = () =>
      db
        .query<{ runs: number; publications: number; jobs: number }, []>(
          `SELECT
             (SELECT COUNT(*) FROM runs) AS runs,
             (SELECT COUNT(*) FROM publications) AS publications,
             (SELECT COUNT(*) FROM jobs) AS jobs`,
        )
        .get()!;
    const before = counts();
    const insertPublication = (
      tx: ReturnType<typeof openDomainDb>,
      runId: string,
    ) => {
      tx.prepare(
        `INSERT INTO publications
         (id, presentation_id, effective_caption_revision_id,
          effective_options_json, submission_run_id, rail, state,
          idempotency_key, created_at, updated_at)
         SELECT 'pub_atomic', presentation.id,
           presentation.effective_caption_revision_id,
           presentation.options_json, ?, 'manual', 'draft',
           'atomic-publication-key', ?, ?
         FROM unit_presentations presentation WHERE presentation.id = ?`,
      ).run(runId, Date.now(), Date.now(), presentationId);
    };
    const transaction = (failAfter: "run" | "domain" | "job" | null) =>
      withImmediateTransaction((tx) => {
        const started = startConsumerOperationRunInTransaction(
          tx,
          scope.authority,
          {
            sessionId: scope.session.id,
            workspaceId: scope.workspace.id,
            projectId: scope.project.id,
            kind: "publication",
            external: EXTERNAL,
            requestDigest: requestDigest({ publication: "atomic" }),
          },
        );
        if (failAfter === "run") throw new Error("injected after run");
        insertPublication(tx, started.run.id);
        if (failAfter === "domain") throw new Error("injected after domain");
        const jobId = insertJobInTransaction(tx, {
          run_id: started.run.id,
          kind: "shell",
          command: { argv: ["consumer", "publication"] },
          project_id: scope.project.id,
        });
        if (failAfter === "job") throw new Error("injected after job");
        return { runId: started.run.id, jobId };
      });

    for (const checkpoint of ["run", "domain", "job"] as const) {
      expect(() => transaction(checkpoint)).toThrow(
        `injected after ${checkpoint}`,
      );
      expect(counts()).toEqual(before);
    }

    const committed = transaction(null);
    expect(counts()).toEqual({
      runs: before.runs + 1,
      publications: before.publications + 1,
      jobs: before.jobs + 1,
    });
    expect(getJob(committed.jobId)?.run_id).toBe(committed.runId);
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("pages results by position and rejects non-consumer readers", () => {
    makeRoot();
    const { scope, accepted } = start("results");
    const db = openDomainDb();
    const document = createDocument({
      projectId: scope.project.id,
      kind: "note",
      slug: "note",
      title: "Note",
    });
    const revisions: { id: string }[] = [];
    for (let index = 0; index < 3; index += 1) {
      revisions.push(
        reviseDocument({
          documentId: document.id,
          expectedHeadId: revisions.at(-1)?.id ?? null,
          format: "text",
          body: `body-${index}`,
        }),
      );
    }
    revisions.forEach((revision, index) => {
      recordRunResult(db, {
        runId: accepted.run.id,
        position: index,
        entityType: "document_revision",
        entityId: revision.id,
      });
    });

    const seen: string[] = [];
    let after: string | null = null;
    for (;;) {
      const page: {
        items: { id: string; position: number }[];
        nextCursor: string | null;
      } = listRunResults({
        context: {
          sessionId: scope.session.id,
          consumerAuthority: scope.authority,
        },
        runId: accepted.run.id,
        after,
        limit: 2,
      });
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor === null) break;
      expect(page.nextCursor.startsWith("p1.")).toBe(true);
      after = page.nextCursor;
    }
    expect(seen).toHaveLength(3);

    const ordinary = startAgentSession({
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      agent: "agent",
    });
    expect(() =>
      listRunResults({
        context: { sessionId: ordinary.id },
        runId: accepted.run.id,
        limit: 10,
      }),
    ).toThrow(/consumer/i);
    expect(() =>
      listRunResults({
        context: {
          workspaceId: scope.workspace.id,
          projectId: scope.project.id,
        },
        runId: accepted.run.id,
        limit: 10,
      }),
    ).toThrow(/consumer Session/i);
  });

  test("pages Project Run results through its owning Workspace consumer Session", () => {
    const root = makeRoot();
    const workspace = createWorkspace({
      slug: "workspace-results",
      name: "Workspace",
    });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "project-results",
      name: "Project",
    });
    const farm = installFarmConsumer(root);
    const session = startConsumerSession(farm.authority, {
      workspaceId: workspace.id,
    });
    const run = startConsumerOperationRun(farm.authority, {
      sessionId: session.id,
      workspaceId: workspace.id,
      projectId: project.id,
      kind: "generation",
      external: {
        ...EXTERNAL,
        runId: "workspace-results-run",
        idempotencyKey: "workspace-results-key",
      },
      requestDigest: requestDigest({ prompt: "workspace" }),
    }).run;
    expect(
      findConsumerOperation(farm.authority, {
        sessionId: session.id,
        workspaceId: workspace.id,
        projectId: project.id,
        idempotencyKey: "workspace-results-key",
      }).run.id,
    ).toBe(run.id);

    const document = createDocument({
      projectId: project.id,
      kind: "note",
      slug: "workspace-results",
      title: "Workspace Results",
    });
    const revisions: { id: string }[] = [];
    for (let index = 0; index < 3; index += 1) {
      revisions.push(
        reviseDocument({
          documentId: document.id,
          expectedHeadId: revisions.at(-1)?.id ?? null,
          format: "text",
          body: `workspace-body-${index}`,
        }),
      );
      recordRunResult(openDomainDb(), {
        runId: run.id,
        position: index,
        entityType: "document_revision",
        entityId: revisions[index]!.id,
      });
    }

    const first = listRunResults({
      context: { sessionId: session.id, consumerAuthority: farm.authority },
      runId: run.id,
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = listRunResults({
      context: { sessionId: session.id, consumerAuthority: farm.authority },
      runId: run.id,
      after: first.nextCursor,
      limit: 2,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      [...first.items, ...second.items].map(({ position }) => position),
    ).toEqual([0, 1, 2]);
  });

  test("generic retry rejects every external Job and attempt 2 starts distinctly", () => {
    makeRoot();
    const scope = fixture("retry-matrix");
    const originals = RETRY_OPERATIONS.map((operation) => {
      const external = externalOperation(operation);
      const accepted = startConsumerOperationRun(scope.authority, {
        sessionId: scope.session.id,
        workspaceId: scope.workspace.id,
        projectId: scope.project.id,
        kind: operation,
        external,
        requestDigest: requestDigest({ operation, attempt: 1 }),
      });
      const jobId = insertJob({
        run_id: accepted.run.id,
        kind: "shell",
        command: { argv: ["consumer", operation] },
        tag: "all-external",
        project_id: scope.project.id,
      });
      return { operation, external, runId: accepted.run.id, jobId };
    });

    for (const original of originals) {
      expect(claimNextPending()?.id).toBe(original.jobId);
      finalizeJob(original.jobId, "failed", {
        exitCode: 1,
        errorMessage: `${original.operation} failed`,
      });
    }
    const db = openDomainDb();
    const snapshotJobs = (ids: number[]) => ids.map((id) => getJob(id));
    const snapshotRuns = (ids: string[]) =>
      ids.map((id) =>
        db
          .query<
            Record<string, string | number | null>,
            [string]
          >("SELECT * FROM runs WHERE id = ?")
          .get(id),
      );
    const snapshotCounts = () =>
      db
        .query<{ runs: number; jobs: number; attempts: number }, []>(
          `SELECT (SELECT COUNT(*) FROM runs) AS runs,
                (SELECT COUNT(*) FROM jobs) AS jobs,
                (SELECT COUNT(*) FROM run_attempts) AS attempts`,
        )
        .get()!;
    const originalJobIds = originals.map(({ jobId }) => jobId);
    const originalRunIds = originals.map(({ runId }) => runId);
    const beforeRetry = {
      runs: snapshotRuns(originalRunIds),
      jobs: snapshotJobs(originalJobIds),
      counts: snapshotCounts(),
    };

    for (const original of originals) {
      expect(() => retryJob(original.jobId)).toThrow(/external operation Run/i);
      expect({
        runs: snapshotRuns(originalRunIds),
        jobs: snapshotJobs(originalJobIds),
        counts: snapshotCounts(),
      }).toEqual(beforeRetry);
    }

    const beforeExternalBulk = snapshotJobs(originalJobIds);
    expect(
      beforeExternalBulk.map((job) => [job?.status, job?.retry_count]),
    ).toEqual([
      ["failed", 0],
      ["failed", 0],
      ["failed", 0],
      ["failed", 0],
    ]);
    expect(() => retryJobsByFilter({ tag: "all-external" })).toThrow(
      /external operation Run/i,
    );
    expect({
      runs: snapshotRuns(originalRunIds),
      jobs: snapshotJobs(originalJobIds),
      counts: snapshotCounts(),
    }).toEqual(beforeRetry);

    const ordinaryRun = startRun({
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      kind: "generation",
    });
    const ordinaryJob = insertJob({
      run_id: ordinaryRun.id,
      kind: "shell",
      command: { argv: ["ordinary"] },
      tag: "ordinary",
      project_id: scope.project.id,
    });
    expect(claimNextPending()?.id).toBe(ordinaryJob);
    finalizeJob(ordinaryJob, "failed", {
      exitCode: 1,
      errorMessage: "ordinary failed",
    });

    const mixedIds = [...originalJobIds, ordinaryJob];
    const mixedRunIds = [...originalRunIds, ordinaryRun.id];
    const beforeMixedBulk = {
      runs: snapshotRuns(mixedRunIds),
      jobs: snapshotJobs(mixedIds),
      counts: snapshotCounts(),
    };
    expect(
      beforeMixedBulk.jobs.map((job) => [job?.status, job?.retry_count]),
    ).toEqual([
      ["failed", 0],
      ["failed", 0],
      ["failed", 0],
      ["failed", 0],
      ["failed", 0],
    ]);
    expect(() => retryJobsByFilter({ state: "failed" })).toThrow(
      /external operation Run/i,
    );
    expect({
      runs: snapshotRuns(mixedRunIds),
      jobs: snapshotJobs(mixedIds),
      counts: snapshotCounts(),
    }).toEqual(beforeMixedBulk);

    expect(beforeRetry.runs).toHaveLength(RETRY_OPERATIONS.length);
    expect(beforeRetry.runs.map((run) => [run?.state, run?.external_attempt])).toEqual([
      ["failed", 1],
      ["failed", 1],
      ["failed", 1],
      ["failed", 1],
    ]);
    const attemptTwos = originals.map((original) => {
      const external = externalOperation(original.operation, 2);
      const accepted = startConsumerOperationRun(scope.authority, {
        sessionId: scope.session.id,
        workspaceId: scope.workspace.id,
        projectId: scope.project.id,
        kind: original.operation,
        external,
        requestDigest: requestDigest({
          operation: original.operation,
          attempt: 2,
        }),
      });
      expect(accepted.replayed).toBe(false);
      expect(accepted.run.id).not.toBe(original.runId);
      const jobId = insertJob({
        run_id: accepted.run.id,
        kind: "shell",
        command: { argv: ["consumer", original.operation, "attempt-2"] },
        project_id: scope.project.id,
      });
      expect(getJob(jobId)).toMatchObject({
        status: "pending",
        retry_count: 0,
      });
      expect(
        startConsumerOperationRun(scope.authority, {
          sessionId: scope.session.id,
          workspaceId: scope.workspace.id,
          projectId: scope.project.id,
          kind: original.operation,
          external,
          requestDigest: requestDigest({
            operation: original.operation,
            attempt: 2,
          }),
        }),
      ).toMatchObject({ replayed: true, run: { id: accepted.run.id } });
      expect(
        findConsumerOperation(scope.authority, {
          sessionId: scope.session.id,
          workspaceId: scope.workspace.id,
          projectId: scope.project.id,
          external: {
            runId: original.external.runId,
            nodeId: original.external.nodeId,
            attempt: 1,
            operation: original.external.operation,
          },
        }).run.id,
      ).toBe(original.runId);
      return { runId: accepted.run.id, jobId };
    });
    expect(new Set(attemptTwos.map(({ runId }) => runId)).size).toBe(
      RETRY_OPERATIONS.length,
    );
    expect(snapshotJobs(originalJobIds)).toEqual(beforeExternalBulk);
    expect(snapshotRuns(originalRunIds)).toEqual(beforeRetry.runs);

    expect(retryJob(ordinaryJob)).toBe(true);
    expect(getJob(ordinaryJob)?.status).toBe("pending");
    expect(verifyDomainStore().sessionProvenanceIssues).toEqual([]);
  });
});

describe("external provenance corruption", () => {
  test("guards bounded printable external text fields in direct SQL", () => {
    makeRoot();
    const { accepted } = start("external-text-guards");
    const db = openDomainDb();
    db.exec("DROP TRIGGER runs_external_provenance_update_guard");
    const columns = [
      "external_system",
      "external_run_id",
      "external_node_id",
      "external_operation",
      "idempotency_key",
    ];
    const rejected = columns.map((column) => {
      try {
        db.prepare(`UPDATE runs SET ${column} = ? WHERE id = ?`).run(
          "not printable",
          accepted.run.id,
        );
        return false;
      } catch {
        return true;
      }
    });
    expect(rejected).toEqual([true, true, true, true, true]);
  });

  test("routes bypassed external text corruption to provenance", () => {
    makeRoot();
    const { accepted } = start("external-text-verifier");
    const db = openDomainDb();
    db.exec("DROP TRIGGER runs_external_provenance_update_guard");
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare("UPDATE runs SET external_operation = ? WHERE id = ?").run(
      "not printable",
      accepted.run.id,
    );
    db.exec("PRAGMA ignore_check_constraints = OFF");

    expect(verifyDomainStore().sessionProvenanceIssues).toContainEqual({
      entityType: "run",
      entityId: accepted.run.id,
      reason: "external-provenance-mismatch",
    });
  });

  test("guards external request digest storage class", () => {
    makeRoot();
    const { accepted } = start("external-guards");
    const db = openDomainDb();
    db.exec("DROP TRIGGER runs_external_provenance_update_guard");
    expect(() =>
      db.exec(
        `UPDATE runs
         SET request_digest = CAST('${"a".repeat(64)}' AS BLOB)
         WHERE id = '${accepted.run.id}'`,
      ),
    ).toThrow(/constraint/i);
  });

  test("guards external attempt safe-integer range", () => {
    makeRoot();
    const { accepted } = start("external-attempt-guard");
    const db = openDomainDb();
    db.exec("DROP TRIGGER runs_external_provenance_update_guard");
    expect(() =>
      db.exec(
        `UPDATE runs SET external_attempt = 9007199254740992
         WHERE id = '${accepted.run.id}'`,
      ),
    ).toThrow(/constraint/i);
  });

  test("routes bypassed external numeric and digest corruption to provenance", () => {
    makeRoot();
    const { accepted } = start("external-guards-verifier");
    const db = openDomainDb();
    db.exec("DROP TRIGGER runs_external_provenance_update_guard");
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.exec(
      `UPDATE runs
       SET request_digest = CAST('${"b".repeat(64)}' AS BLOB),
           external_attempt = 9007199254740992
       WHERE id = '${accepted.run.id}'`,
    );
    db.exec("PRAGMA ignore_check_constraints = OFF");

    expect(verifyDomainStore().sessionProvenanceIssues).toContainEqual({
      entityType: "run",
      entityId: accepted.run.id,
      reason: "external-provenance-mismatch",
    });
  });

  test("routes principal, Session, and Run findings to provenance", () => {
    makeRoot();
    const { scope, accepted } = start("corrupt");
    const db = openDomainDb();
    for (const { name } of db
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type = 'trigger'
         AND tbl_name IN ('consumer_principals', 'agent_sessions', 'runs')`,
      )
      .all()) {
      db.exec(`DROP TRIGGER "${name}"`);
    }
    db.exec("PRAGMA ignore_check_constraints = ON; PRAGMA foreign_keys = OFF");
    db.prepare(
      `INSERT INTO consumer_principals (id, namespace, identity_digest, created_at)
       VALUES ('consumer_bad', 'BAD NS', 'nothex', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO agent_sessions (id, workspace_id, agent, consumer_principal_id, started_at)
       VALUES ('session_orphan', ?, 'consumer:farm', 'consumer_gone', 1)`,
    ).run(scope.workspace.id);
    db.prepare(
      `INSERT INTO agent_sessions (id, workspace_id, agent, consumer_principal_id, started_at)
       VALUES ('session_label', ?, 'agent', ?, 1)`,
    ).run(scope.workspace.id, scope.principal.id);
    db.prepare("UPDATE runs SET request_digest = 'nothex' WHERE id = ?").run(
      accepted.run.id,
    );
    db.exec("PRAGMA ignore_check_constraints = OFF; PRAGMA foreign_keys = ON");

    const issues = verifyDomainStore().sessionProvenanceIssues;
    expect(issues).toContainEqual({
      entityType: "consumer-principal",
      entityId: "consumer_bad",
      reason: "invalid-consumer-principal",
    });
    expect(issues).toContainEqual({
      entityType: "agent-session",
      entityId: "session_orphan",
      reason: "consumer-session-ownership-mismatch",
    });
    expect(issues).toContainEqual({
      entityType: "agent-session",
      entityId: "session_label",
      reason: "consumer-session-auth-mismatch",
    });
    expect(issues).toContainEqual({
      entityType: "run",
      entityId: accepted.run.id,
      reason: "external-provenance-mismatch",
    });
  });

  test("rejects an invalid RunObject MIME", () => {
    makeRoot();
    const { scope } = start("mime");
    const run = startRun({
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      kind: "diagnostic",
    });
    const db = openDomainDb();
    expect(() =>
      db
        .prepare(
          `INSERT INTO run_objects
           (id, run_id, path, purpose, state, retention, mime, created_at)
           VALUES ('robj_bad', ?, 'tmp/x.bin', 'diagnostic', 'diagnostic', 'keep-on-failure', 'not-a-mime', 1)`,
        )
        .run(run.id),
    ).toThrow(/constraint/i);
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare(
      `INSERT INTO run_objects
       (id, run_id, path, purpose, state, retention, mime, created_at)
       VALUES ('robj_bad', ?, 'tmp/x.bin', 'diagnostic', 'diagnostic', 'keep-on-failure', 'not-a-mime', 1)`,
    ).run(run.id);
    db.exec("PRAGMA ignore_check_constraints = OFF");
    expect(verifyDomainStore().runObjectIssues).toContainEqual({
      table: "run_objects",
      rowId: "robj_bad",
      column: "mime",
      reason: "invalid-mime",
    });
  });
});
