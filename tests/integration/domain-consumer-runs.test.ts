import { afterEach, describe, expect, test } from "bun:test";
import {
  canonicalRequestJson,
  requestDigest,
} from "../../cli/lib/store/canonical-json.js";
import {
  bindConsumerPrincipal,
  consumerCredentialDigest,
} from "../../cli/lib/store/consumers.js";
import { authenticateConsumer } from "../../cli/lib/store/consumer-auth.js";
import { getConsumerPrincipal } from "../../cli/lib/store/internal-consumers.js";
import {
  findConsumerOperation,
  listRunResults,
  startConsumerOperationRun,
  startConsumerOperationRunInTransaction,
} from "../../cli/lib/store/consumer-runs.js";
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
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
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

const DIGEST = consumerCredentialDigest(Buffer.alloc(32, 3).toString("base64url"));

function bind(namespace = "farm", id = "consumer_farm", digest = DIGEST) {
  return withImmediateTransaction((db) =>
    bindConsumerPrincipal(db, { id, namespace, identityDigest: digest }),
  );
}

function fixture(slug: string) {
  const root = roots.at(-1)!;
  const workspace = createWorkspace({ slug, name: slug });
  const project = createProject({ workspaceId: workspace.id, slug, name: slug });
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

describe("canonical request digest", () => {
  test("sorts keys by byte order, normalizes -0, and preserves array order", () => {
    expect(canonicalRequestJson({ b: 1, a: 2, A: 3 })).toBe('{"A":3,"a":2,"b":1}');
    expect(canonicalRequestJson({ z: [3, 1, 2] })).toBe('{"z":[3,1,2]}');
    expect(canonicalRequestJson({ n: -0 })).toBe('{"n":0}');
    expect(requestDigest({ a: 1, b: 2 })).toBe(requestDigest({ b: 2, a: 1 }));
    expect(requestDigest({ n: -0 })).toBe(requestDigest({ n: 0 }));
    expect(requestDigest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
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
    const first = startRunAttempt({ runId: accepted.run.id, provider: "local" });
    finishRunAttempt(first.id, { state: "failed", error: "fixture failure" });
    finishRun(accepted.run.id, { state: "failed", error: "fixture failure" });
    const db = openDomainDb();
    const activityCount = db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM activity_events")
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
        .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM activity_events")
        .get()!.count,
    ).toBe(activityCount);
  });

  test("creates one pending Run and replays it by tuple and by key", () => {
    makeRoot();
    const { scope, accepted } = start("replay");
    expect(accepted.replayed).toBe(false);
    expect(accepted.run).toMatchObject({
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      kind: "generation",
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

    // A reconnected Session for the same principal recovers the same Run.
    const reconnectAuthority = authenticateConsumer("farm", scope.token);
    const reconnect = startConsumerSession(reconnectAuthority, {
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
    });
    const replay = startConsumerOperationRun(reconnectAuthority, {
      sessionId: reconnect.id,
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      kind: "generation",
      external: EXTERNAL,
      requestDigest: requestDigest({ prompt: "hello" }),
    });
    expect(replay.replayed).toBe(true);
    expect(replay.run.id).toBe(accepted.run.id);

    for (const selector of [
      { external: { runId: EXTERNAL.runId, nodeId: EXTERNAL.nodeId, attempt: 1, operation: "generation" } },
      { idempotencyKey: EXTERNAL.idempotencyKey },
    ] as const) {
      const found = findConsumerOperation(reconnectAuthority, {
        sessionId: reconnect.id,
        workspaceId: scope.workspace.id,
        projectId: scope.project.id,
        ...selector,
      });
      expect(found.replayed).toBe(true);
      expect(found.run.id).toBe(accepted.run.id);
    }
    expect(verifyDomainStore().integrity).toBe("ok");
  });

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
      startConsumerOperationRun(scope.authority, { ...base, kind: "transform" }),
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
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("rejects an ordinary or ended Session", () => {
    makeRoot();
    const { scope } = start("authz");
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
      startConsumerOperationRun(scope.authority, { ...base, sessionId: ordinary.id }),
    ).toThrow(/not owned/i);
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
    const before = db
      .query<{ runs: number }, []>("SELECT COUNT(*) AS runs FROM runs")
      .get()!.runs;
    expect(() =>
      withImmediateTransaction((tx) => {
        const started = startConsumerOperationRunInTransaction(tx, scope.authority, {
          sessionId: scope.session.id,
          workspaceId: scope.workspace.id,
          projectId: scope.project.id,
          kind: "generation",
          external: EXTERNAL,
          requestDigest: requestDigest({ prompt: "hello" }),
        });
        insertJobInTransaction(tx, {
          run_id: started.run.id,
          kind: "generate",
          command: { argv: ["ralphy", "generate"] } as never,
        });
        throw new Error("injected failure after every insert");
      }),
    ).toThrow(/injected failure/);
    expect(
      db.query<{ runs: number }, []>("SELECT COUNT(*) AS runs FROM runs").get()!.runs,
    ).toBe(before);
    expect(
      db.query<{ jobs: number }, []>("SELECT COUNT(*) AS jobs FROM jobs").get()!.jobs,
    ).toBe(0);

    const committed = withImmediateTransaction((tx) => {
      const started = startConsumerOperationRunInTransaction(tx, scope.authority, {
        sessionId: scope.session.id,
        workspaceId: scope.workspace.id,
        projectId: scope.project.id,
        kind: "generation",
        external: EXTERNAL,
        requestDigest: requestDigest({ prompt: "hello" }),
      });
      const jobId = insertJobInTransaction(tx, {
        run_id: started.run.id,
        kind: "generate",
        command: { argv: ["ralphy", "generate"] } as never,
      });
      return { runId: started.run.id, jobId };
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
      const page: { items: { id: string; position: number }[]; nextCursor: string | null } =
        listRunResults({
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
        context: { workspaceId: scope.workspace.id, projectId: scope.project.id },
        runId: accepted.run.id,
        limit: 10,
      }),
    ).toThrow(/consumer Session/i);
  });

  test("pages Project Run results through its owning Workspace consumer Session", () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "workspace-results", name: "Workspace" });
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
    expect([...first.items, ...second.items].map(({ position }) => position)).toEqual([
      0,
      1,
      2,
    ]);
  });

  test("generic queue retry rejects an externally owned Job before mutating", () => {
    makeRoot();
    const { scope, accepted } = start("retry");
    const externalJob = insertJob({
      run_id: accepted.run.id,
      kind: "generate",
      command: { argv: ["ralphy", "generate"] } as never,
      tag: "batch",
    });
    const ordinaryRun = startRun({
      workspaceId: scope.workspace.id,
      projectId: scope.project.id,
      kind: "generation",
    });
    const ordinaryJob = insertJob({
      run_id: ordinaryRun.id,
      kind: "generate",
      command: { argv: ["ralphy", "generate"] } as never,
      tag: "batch",
    });
    // A Job only finalizes from `running`, so claim both first.
    for (let index = 0; index < 2; index += 1) claimNextPending();
    finalizeJob(externalJob, "failed", { exitCode: 1, errorMessage: "boom" });
    finalizeJob(ordinaryJob, "failed", { exitCode: 1, errorMessage: "boom" });

    expect(() => retryJob(externalJob)).toThrow(/external operation Run/i);
    expect(getJob(externalJob)?.status).toBe("failed");
    // A mixed bulk set rejects entirely and changes zero rows.
    expect(() => retryJobsByFilter({ tag: "batch" })).toThrow(/external operation Run/i);
    expect(getJob(ordinaryJob)?.status).toBe("failed");
    // The ordinary Job alone still retries.
    expect(retryJob(ordinaryJob)).toBe(true);
    expect(getJob(ordinaryJob)?.status).toBe("pending");
    // Scoped to provenance: claiming a Job writes an absolute `jobs.log_path`,
    // a pre-existing worker/verifier disagreement outside this boundary.
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
    db.prepare(
      "UPDATE runs SET request_digest = 'nothex' WHERE id = ?",
    ).run(accepted.run.id);
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
