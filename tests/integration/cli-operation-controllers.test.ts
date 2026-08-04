import { afterEach, describe, expect, test } from "bun:test";
import { startGenerationOperation } from "../../cli/lib/controllers/operations.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { startConsumerSession } from "../../cli/lib/store/sessions.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { installConsumer } from "../helpers/consumer-auth.js";

let root: TmpRoot;

afterEach(() => {
  closeDomainDb();
  root.cleanup();
});

describe("replayable operation controllers", () => {
  test("commits one Run plus Job and replays through a new Session", () => {
    root = makeTmpRoot("ralphy-operation-controller");
    const workspace = createWorkspace({ slug: "primary", name: "Primary" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "controller-project",
      name: "Controller Project",
    });
    const consumer = installConsumer(root);
    const firstSession = startConsumerSession(consumer.authority, {
      workspaceId: workspace.id,
      projectId: project.id,
    });
    const external = {
      runId: "consumer-generation-1",
      nodeId: "node-1",
      attempt: 1,
      operation: "generation",
      idempotencyKey: "generation-key-1",
    } as const;
    const input = {
      authority: consumer.authority,
      context: { sessionId: firstSession.id, external },
      workspaceId: workspace.id,
      projectId: project.id,
      request: { model: "fixture/image", prompt: "a coffee shop" } as const,
      job: {
        kind: "generate.image" as const,
        command: { argv: ["generate", "image", "--slot", "hero"] },
      },
    };

    const first = startGenerationOperation(input);
    expect(first.replayed).toBe(false);
    expect(first.state).toBe("pending");
    expect(first.results.items).toEqual([]);

    const reconnect = consumer.authenticate();
    const secondSession = startConsumerSession(reconnect, {
      workspaceId: workspace.id,
      projectId: project.id,
    });
    const replay = startGenerationOperation({
      ...input,
      authority: reconnect,
      context: { sessionId: secondSession.id, external },
    });
    expect(replay).toMatchObject({
      runId: first.runId,
      replayed: true,
      state: "pending",
    });
    expect(
      openDomainDb().query<{ count: number }, []>("SELECT COUNT(*) AS count FROM runs").get()?.count,
    ).toBe(1);
    expect(
      openDomainDb().query<{ count: number }, []>("SELECT COUNT(*) AS count FROM jobs").get()?.count,
    ).toBe(1);

    expect(() => startGenerationOperation({
      ...input,
      authority: reconnect,
      context: { sessionId: secondSession.id, external },
      request: { model: "fixture/image", prompt: "a different shop" },
    })).toThrow(/request|digest|conflict/i);
  });

  test("rolls back the Run when the Job cannot be serialized", () => {
    root = makeTmpRoot("ralphy-operation-rollback");
    const workspace = createWorkspace({ slug: "primary", name: "Primary" });
    const project = createProject({ workspaceId: workspace.id, slug: "rollback", name: "Rollback" });
    const consumer = installConsumer(root);
    const session = startConsumerSession(consumer.authority, {
      workspaceId: workspace.id,
      projectId: project.id,
    });
    const command = { argv: ["generate", "image"] } as { argv: string[]; cycle?: unknown };
    command.cycle = command;

    expect(() => startGenerationOperation({
      authority: consumer.authority,
      context: {
        sessionId: session.id,
        external: {
          runId: "consumer-rollback-1",
          nodeId: "node-rollback",
          attempt: 1,
          operation: "generation",
          idempotencyKey: "rollback-key-1",
        },
      },
      workspaceId: workspace.id,
      projectId: project.id,
      request: { prompt: "rollback" },
      job: { kind: "generate.image", command: command as never },
    })).toThrow();
    expect(openDomainDb().query<{ count: number }, []>("SELECT COUNT(*) AS count FROM runs").get()?.count).toBe(0);
    expect(openDomainDb().query<{ count: number }, []>("SELECT COUNT(*) AS count FROM jobs").get()?.count).toBe(0);
  });
});
