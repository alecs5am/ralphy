import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  RalphyBridgeClient,
  RalphyBridgeError,
} from "../electron/ralphy/client";
import type { RalphyBridgeClientOptions } from "../electron/ralphy/client";
import { BRIDGE_METHODS } from "../electron/ralphy/types";
import { BRIDGE_LIMITS } from "../electron/ralphy/types";
import type {
  BridgeMethod,
  JsonValue,
  ParamsFor,
  ResultFor,
} from "../electron/ralphy/types";

let fixtureDirectory: string;
let fixtureBin: string;

function injectedBridge(mode: "success" | "error" | "backpressure-close") {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let secretFrame: Buffer | null = null;
  let releaseWrite: ((error?: Error | null) => void) | null = null;
  const send = (message: unknown) => stdout.write(`${JSON.stringify(message)}\n`);
  const stdin = new Writable({
    highWaterMark: mode === "backpressure-close" ? 1 : 16 * 1024,
    write(chunk: Buffer, _encoding, callback) {
      const frame = chunk;
      const request = JSON.parse(frame.toString()) as { id: string; method: string; params?: Record<string, unknown> };
      if (request.method === "system.hello") {
        callback();
        setImmediate(() => send({ v: 1, id: request.id, ok: true, result: {
          protocolVersion: 1,
          coreVersion: "3",
          schemaVersion: 9,
          storeId: "store-injected",
          rootId: "a".repeat(64),
          capabilities: [...BRIDGE_METHODS],
          activitySequence: 0,
          startup: { state: "ready", migration: "complete" },
          limits: BRIDGE_LIMITS,
        } }));
        return;
      }
      secretFrame = frame;
      if (mode === "error") {
        callback(new Error("injected write failure"));
      } else if (mode === "backpressure-close") {
        releaseWrite = callback;
      } else {
        callback();
        setImmediate(() => send({ v: 1, id: request.id, ok: true, result: {
          ref: request.params?.ref,
          kind: "text",
          completed: true,
        } }));
      }
    },
  });
  const child = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    killed: false,
    kill() {
      this.killed = true;
      this.signalCode = "SIGTERM";
      setImmediate(() => this.emit("close", null, "SIGTERM"));
      return true;
    },
  });
  stdin.on("finish", () => {
    child.exitCode = 0;
    setImmediate(() => child.emit("close", 0, null));
  });
  return {
    child,
    secretFrame: () => secretFrame,
    releaseWrite: () => releaseWrite?.(),
  };
}

function fixtureRequest<Result extends JsonValue = JsonValue>(
  client: RalphyBridgeClient,
  method: BridgeMethod,
  params: Record<string, unknown>,
): Promise<Result> {
  return client.request(method, params as never) as unknown as Promise<Result>;
}

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), "ralphy-bridge-client-"));
  fixtureBin = join(fixtureDirectory, "ralphy-fake");
  await writeFile(fixtureBin, `#!/usr/bin/env node
const readline = require("node:readline");

const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const root = rootFlag === -1 ? "" : args[rootFlag + 1];
if (args[0] !== "bridge" || args[1] !== "--stdio" || !root) process.exit(64);

if (root.includes("graceful-close")) {
  process.on("SIGTERM", () => process.exit(91));
  process.stdin.on("end", () => {
    setTimeout(() => {
      require("node:fs").writeFileSync(root + ".eof", "eof");
      process.exit(0);
    }, 50);
  });
}
if (root.includes("stubborn-close")) {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1000);
  setTimeout(() => process.exit(0), 3000);
}
if (root.includes("paused-stdin")) {
  setInterval(() => {}, 1000);
  setTimeout(() => process.exit(0), 3000);
}

process.stderr.write("stderr is not json\\n");
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
let sentEvents = false;
let trackedInFlight = 0;
let trackedPeak = 0;

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "system.hello") {
    const delay = root.includes("slow-hello") ? 40 : 0;
    const result = {
      protocolVersion: root.includes("protocol-2") ? 2 : 1,
      schemaVersion: 9,
      coreVersion: root.includes("core-1") ? "1" : root.includes("core-2") ? "2" : "3.0.0-test",
      storeId: "store-test",
      rootId: root.includes("bad-root-id") ? "root-test" : "a".repeat(64),
      capabilities: root.includes("missing-method")
        ? ${JSON.stringify(BRIDGE_METHODS)}.filter((method) => method !== "media.review")
        : ${JSON.stringify(BRIDGE_METHODS)},
      activitySequence: 6,
      startup: root.includes("bad-startup")
        ? { state: "starting", migration: "complete" }
        : { state: "ready", migration: "complete" },
      limits: {
        maxFrameBytes: 1048576,
        maxRequestIdBytes: 128,
        maxInFlight: 64,
        maxSeenIds: 65536,
        maxOutboundBytes: 8388608,
        maxAgentDeltaBytes: 65536,
      },
    };
    if (root.includes("bad-hello")) delete result.storeId;
    setTimeout(() => {
      send({ v: 1, id: request.id, ok: true, result });
      if (root.includes("paused-stdin")) process.stdin.pause();
    }, delay);
    return;
  }

  if (request.params && request.params.hang === true) return;
  if (request.params && request.params.exit === true) {
    setTimeout(() => process.exit(17), 5);
    return;
  }
  if (request.params && request.params.oversized === true) {
    process.stdout.write("x".repeat(1024 * 1024 + 1));
    return;
  }
  if (request.params && request.params.fatal === true) {
    send({
      v: 1,
      id: null,
      ok: false,
      error: { code: "E_PROTOCOL_INVALID", message: "Fatal protocol error" },
    });
    return;
  }
  if (request.params && request.params.invalidUtf8 === true) {
    process.stdout.write(Buffer.concat([
      Buffer.from('{"v":1,"id":"' + request.id + '","ok":true,"result":{"marker":"'),
      Buffer.from([0xc3, 0x28]),
      Buffer.from('"}}\\n'),
    ]));
    return;
  }
  if (request.params && request.params.mixedEnvelope === true) {
    send({
      v: 1,
      id: request.id,
      ok: true,
      result: { marker: "wrong" },
      event: "agent",
      agentSessionId: "agent-session-1",
      turnId: "turn-1",
      sequence: 1,
      data: { type: "started" },
    });
    setTimeout(() => send({
      v: 1,
      id: request.id,
      ok: true,
      result: { marker: "late" },
    }), 5);
    return;
  }
  if (request.params && request.params.missingResult === true) {
    send({ v: 1, id: request.id, ok: true });
    return;
  }
  if (request.params && request.params.failureWithResult === true) {
    send({
      v: 1,
      id: request.id,
      ok: false,
      error: { code: "E_FAKE", message: "fake failure" },
      result: { marker: "contradiction" },
    });
    return;
  }
  if (request.params && request.params.trackInFlight === true) {
    trackedInFlight += 1;
    trackedPeak = Math.max(trackedPeak, trackedInFlight);
    setTimeout(() => {
      const peak = trackedPeak;
      trackedInFlight -= 1;
      send({ v: 1, id: request.id, ok: true, result: { peak } });
    }, 20);
    return;
  }
  if (request.params && request.params.splitUtf8 === true) {
    const response = Buffer.from(JSON.stringify({
      v: 1,
      id: request.id,
      ok: true,
      result: { marker: "café" },
    }) + "\\n");
    const leadByte = response.indexOf(0xc3);
    process.stdout.write(response.subarray(0, leadByte + 1));
    setTimeout(() => process.stdout.write(response.subarray(leadByte + 1)), 1);
    return;
  }
  if (request.params && request.params.invalidEvent) {
    send(request.params.invalidEvent === "activity"
      ? {
          v: 1,
          event: "activity",
          sequence: 7,
          data: {
            sequence: 7,
            workspaceId: null,
            projectId: null,
            entityType: "artifact",
            entityId: "artifact-1",
            action: "created",
            createdAt: 1800000,
          },
        }
      : {
          v: 1,
          event: "agent",
          agentSessionId: "agent-session-1",
          sequence: 1,
          data: { type: "started" },
        });
  }
  if (!sentEvents) {
    sentEvents = true;
    send({
      v: 1,
      event: "activity",
      subscriptionId: "subscription-1",
      sequence: 7,
      data: {
        sequence: 7,
        workspaceId: "workspace-1",
        projectId: "project-1",
        entityType: "artifact",
        entityId: "artifact-1",
        action: "created",
        createdAt: 1800000,
      },
    });
    send({
      v: 1,
      event: "agent",
      agentSessionId: "agent-session-1",
      turnId: "turn-1",
      sequence: 1,
      data: { type: "started" },
    });
  }
  const delay = Number(request.params && request.params.delay) || 0;
  setTimeout(() => send({
    v: 1,
    id: request.id,
    ok: true,
    result: { marker: request.params && request.params.marker },
  }), delay);
});
`);
  await chmod(fixtureBin, 0o755);
});

afterAll(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

describe("RalphyBridgeClient", () => {
  test.each(["success", "error", "backpressure-close"] as const)(
    "zeroes the sensitive import frame after %s",
    async (mode) => {
      const injected = injectedBridge(mode);
      const client = new RalphyBridgeClient({
        root: "/library",
        spawn: () => injected.child as never,
      });
      await client.start();
      const secret = "sk-ant-sensitive-frame-1234567890";
      const pending = client.request("migration.secret.import", {
        runId: "mig_test",
        sourceEntryId: "mentry_test",
        ref: "provider/anthropic/workspace/ws_test/workspace/ws_test",
        kind: "text",
        value: secret,
      });

      if (mode === "success") await expect(pending).resolves.toMatchObject({ completed: true });
      else if (mode === "error") await expect(pending).rejects.toThrow();
      else {
        const observed = pending.catch((error: unknown) => error);
        const closing = client.close();
        const frame = injected.secretFrame();
        expect(frame).not.toBeNull();
        expect(frame?.every((byte) => byte === 0)).toBe(true);
        injected.releaseWrite();
        await Promise.all([closing, observed]);
      }

      const frame = injected.secretFrame();
      expect(frame).not.toBeNull();
      expect(frame?.every((byte) => byte === 0)).toBe(true);
      expect(String(await pending.catch((error: unknown) => error))).not.toContain(secret);
      await client.close();
    },
  );

  test("discovers RALPHY_BIN when bin is omitted from the public client options", async () => {
    const client = new RalphyBridgeClient({
      root: "/library",
      env: { HOME: fixtureDirectory, RALPHY_BIN: fixtureBin },
    });

    await expect(client.start()).resolves.toMatchObject({ rootId: "a".repeat(64) });
    await client.close();
  });

  test("accepts NodeJS.ProcessEnv and exposes typed media.review parameters/results", () => {
    const acceptsOptions = (_options: RalphyBridgeClientOptions) => true;
    expect(acceptsOptions({ root: "/library", env: process.env })).toBe(true);

    const valid: ParamsFor<"media.review"> = {
      context: { sessionId: "session-1" },
      ref: { type: "artifact", id: "artifact-1" },
      expectedSelectedRevisionId: "revision-1",
      verdict: "approved",
      rating: 5,
      tags: ["ready"],
      notes: "Approved for delivery",
    };
    const result: ResultFor<"media.review"> = {
      card: {
        id: "artifact-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        ref: valid.ref,
        kind: "video",
        mime: "video/mp4",
        bytes: 100,
        createdAt: 1,
      },
      revisionId: "revision-2",
      evaluation: {
        id: "evaluation-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        target: { type: "artifact_revision", id: "revision-2" },
        kind: "review",
        verdict: "approved",
        favorite: false,
        rating: 5,
        tags: ["ready"],
        note: "Approved for delivery",
        authoredBySessionId: "session-1",
        createdAt: 2,
      },
      feedbackId: null,
    };
    expect(result.revisionId).toBe("revision-2");

    const invalid: ParamsFor<"media.review"> = {
      ...valid,
      // @ts-expect-error media.review accepts stable IDs, never paths.
      absolutePath: "/tmp/asset.mp4",
    };
    expect(invalid).toBeDefined();
  });

  test("types every bridge method through stable domain params and DTO results", () => {
    const showWorkspace: ParamsFor<"workspace.show"> = {
      context: { workspaceId: "workspace-1" },
      workspaceId: "workspace-1",
    };
    const listWorkspaces: ResultFor<"workspace.list"> = {
      items: [{
        id: "workspace-1",
        slug: "workspace-one",
        name: "Workspace One",
        rowVersion: 1,
        createdAt: 1,
        updatedAt: 1,
      }],
      nextCursor: null,
    };
    expect(listWorkspaces.items[0]?.id).toBe(showWorkspace.workspaceId);

    const invalid: ParamsFor<"workspace.show"> = {
      ...showWorkspace,
      // @ts-expect-error bridge domain calls never accept filesystem paths.
      absolutePath: "/tmp/workspace",
    };
    expect(invalid).toBeDefined();
  });

  test("types the exact overview, filtered Media, Run Object, and activity contracts", () => {
    const workspace: ParamsFor<"workspace.overview"> = {
      context: { workspaceId: "ws_1" }, workspaceId: "ws_1",
      sections: {
        documents: { limit: 5 }, units: { limit: 5 }, accounts: { limit: 5 }, projects: { limit: 5 },
        activity: { afterSequence: 0, limit: 10 }, sharedMedia: { limit: 5 }, publications: { limit: 5 }, metrics: true,
      },
    };
    const project: ParamsFor<"project.overview"> = {
      context: { workspaceId: "ws_1", projectId: "prj_1" }, projectId: "prj_1",
      sections: {
        documents: { limit: 5 }, iterations: { limit: 5 }, feedback: { limit: 5 }, stages: { limit: 5 },
        compositions: { limit: 5 }, builds: { limit: 5 }, units: { limit: 5 }, runs: { limit: 5 },
        activity: { afterSequence: 0, limit: 10 }, mediaCounts: true, publications: { limit: 5 }, metrics: true,
      },
    };
    const media: ParamsFor<"media.list"> = {
      context: project.context, after: "media_1", limit: 1, filter: "references", types: ["artifact"],
    };
    const runObjects: ResultFor<"run.objects"> = {
      items: [{
        id: "robj_1", workspaceId: "ws_1", projectId: "prj_1", runId: "run_1", purpose: "output", state: "ready",
        retention: "durable", mime: "video/mp4", bytes: 12, createdAt: 1, objectId: "obj_1",
        logicalPath: "outputs/final.mp4", locationClass: "other", attemptId: null, attemptNo: null,
      }],
      nextCursor: null,
    };
    const overviewRun: NonNullable<ResultFor<"project.overview">["runs"]>["items"][number] = {
      id: "run_1", workspaceId: "ws_1", projectId: "prj_1", kind: "generation", label: "Launch",
      state: "succeeded", createdAt: 1, startedAt: 2, endedAt: 3,
    };
    const activity: ParamsFor<"activity.list"> = { afterSequence: 7, limit: 10 };
    const subscribe: ParamsFor<"activity.subscribe"> = { subscriptionId: "sub_1", afterSequence: 7 };
    const subscribed: ResultFor<"activity.subscribe"> = { subscriptionId: "sub_1", sequence: 7 };
    const unsubscribed: ResultFor<"activity.unsubscribe"> = { subscriptionId: "sub_1", unsubscribed: true };

    expect([workspace, project, media, runObjects, overviewRun, activity, subscribe, subscribed, unsubscribed]).toHaveLength(9);
  });

  test("matches the exact operation, recovery, activity, and binding contracts", () => {
    const context = { sessionId: "session-1" } as const;
    const external = {
      runId: "farm-run-1",
      nodeId: "node-1",
      attempt: 1,
      operation: "generate",
      idempotencyKey: "key-1",
    } as const;

    const build: ResultFor<"composition.build"> = {
      id: "build-1",
      compositionRevisionId: "composition-revision-1",
      runId: "run-1",
      state: "succeeded",
      createdAt: 1,
      finishedAt: 2,
      outputs: [{ artifactRevisionId: "artifact-revision-1", objectId: "object-1", role: "master", position: 0 }],
    };

    const operationStarts: [
      ParamsFor<"composition.build">,
      ParamsFor<"unit.revise">,
      ParamsFor<"publication.publish">,
      ParamsFor<"publication.lookup">,
      ParamsFor<"publication.reconcile">,
      ParamsFor<"publication.refresh">,
      ParamsFor<"agent.turn.start">,
      ParamsFor<"agent.turn.resume">,
    ] = [
      { context, compositionRevisionId: "composition-revision-1", profile: { quality: "preview" } },
      { context, unitId: "unit-1", expectedLatestRevisionId: "unit-revision-1", compositionRevisionId: "composition-revision-1", items: [] },
      { context, external, unitRevisionId: "unit-revision-1", platform: "tiktok" },
      { context, external, publicationId: "publication-1" },
      { context, external, publicationId: "publication-1" },
      { context, external, publicationId: "publication-1" },
      { context, external, provider: "codex", prompt: "Continue" },
      { context, external, turnId: "turn-1", prompt: "Revise" },
    ];

    const findByTuple: ParamsFor<"operation.find"> = {
      context,
      external: {
        runId: external.runId,
        nodeId: external.nodeId,
        attempt: external.attempt,
        operation: external.operation,
      },
      resultsAfter: null,
      resultsLimit: 25,
    };
    const findByKey: ParamsFor<"operation.find"> = {
      context,
      idempotencyKey: external.idempotencyKey,
    };
    const found: ResultFor<"operation.find"> = {
      run: {
        id: "run-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        agentSessionId: "session-1",
        kind: "generation",
        label: null,
        state: "pending",
        createdAt: 1,
        startedAt: null,
        endedAt: null,
      },
      results: { items: [], nextCursor: null },
      replayed: true,
    };

    const acceptsFind = (_params: ParamsFor<"operation.find">) => true;
    // @ts-expect-error operation.find requires exactly one tuple/key selector.
    acceptsFind({ context, external: findByTuple.external, idempotencyKey: external.idempotencyKey });
    // @ts-expect-error operation.find requires a complete external tuple.
    acceptsFind({ context, external: { runId: external.runId, nodeId: external.nodeId, attempt: 1 } });

    const acceptsBuild = (_params: ParamsFor<"composition.build">) => true;
    // @ts-expect-error Composition builds are terminal Core operations, not external replay requests.
    acceptsBuild({ context, idempotencyKey: "top-level-key", compositionRevisionId: "composition-revision-1" });
    // @ts-expect-error Composition builds do not accept an external operation tuple.
    acceptsBuild({ context, external: { externalSystem: "farm", externalRunId: "run-1", externalNodeId: "node-1", externalAttempt: 1 }, compositionRevisionId: "composition-revision-1" });

    const projectBinding: ParamsFor<"document.bind"> = {
      context,
      projectId: "project-1",
      role: "brief",
      revisionId: "document-revision-1",
      expectedRevisionId: null,
    };
    const buildBinding: ParamsFor<"document.bind"> = {
      context,
      buildId: "build-1",
      role: "transcript",
      revisionId: "document-revision-1",
      expectedRevisionId: "document-revision-0",
    };
    const acceptsBinding = (_params: ParamsFor<"document.bind">) => true;
    // @ts-expect-error document.bind owner branches are top-level, not nested.
    acceptsBinding({ context, owner: { projectId: "project-1", role: "brief" }, revisionId: "document-revision-1", expectedRevisionId: null });
    // @ts-expect-error document.bind accepts exactly one owner branch.
    acceptsBinding({ context, projectId: "project-1", buildId: "build-1", role: "brief", revisionId: "document-revision-1", expectedRevisionId: null });

    const draftCancel: ParamsFor<"publication.cancel"> = {
      context,
      publicationId: "publication-1",
      expectedState: "draft",
    };
    const providerCancel: ParamsFor<"publication.cancel"> = {
      context,
      publicationId: "publication-1",
      expectedState: "scheduled",
      external,
    };
    const acceptsCancel = (_params: ParamsFor<"publication.cancel">) => true;
    // @ts-expect-error draft cancellation is local and cannot have external provenance.
    acceptsCancel({ context, publicationId: "publication-1", expectedState: "draft", external });
    // @ts-expect-error provider cancellation is limited to scheduled/submitted Publications.
    acceptsCancel({ context, publicationId: "publication-1", expectedState: "published", external });

    const recovery: ParamsFor<"publication.recover"> = {
      context,
      publicationId: "publication-1",
      expectedState: "submitted",
      expectedClaimKind: "status-lookup",
      expectedClaimRunId: "run-1",
      expectedClaimEpoch: 2,
    };
    const recovered: ResultFor<"publication.recover"> = {
      publication: {
        id: recovery.publicationId,
        workspaceId: "workspace-1",
        projectId: "project-1",
        unitRevisionId: "unit-revision-1",
        platform: "tiktok",
        state: "submitted",
        externalId: "provider-1",
        createdAt: 1,
      },
      run: found.run,
    };
    const acceptsRecovery = (_params: ParamsFor<"publication.recover">) => true;
    // @ts-expect-error recovery requires the exact claim kind, Run, and epoch fence.
    acceptsRecovery({ context, publicationId: "publication-1", expectedState: "submitted" });
    // @ts-expect-error recovery never accepts a claim token.
    acceptsRecovery({ ...recovery, claimToken: "secret" });

    const activityParams: ParamsFor<"activity.list"> = { afterSequence: 7, limit: 100 };
    const scopedActivityParams: ParamsFor<"activity.list"> = { context, afterSequence: 7, limit: 100 };
    const activityPage: ResultFor<"activity.list"> = {
      items: [],
      nextCursor: 9,
    };
    expect([
      build,
      operationStarts,
      findByTuple,
      findByKey,
      found,
      projectBinding,
      buildBinding,
      draftCancel,
      providerCancel,
      recovered,
      activityPage,
      scopedActivityParams,
    ]).toHaveLength(12);
  });

  test("correlates out-of-order responses and keeps events separate from stderr", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    const received: unknown[] = [];
    const events = new Promise((resolve) => {
      client.onEvent((event) => {
        received.push(event);
        if (received.length === 2) resolve(received);
      });
    });

    await expect(client.start()).resolves.toEqual({
      protocolVersion: 1,
      schemaVersion: 9,
      coreVersion: "3.0.0-test",
      storeId: "store-test",
      rootId: "a".repeat(64),
      capabilities: [...BRIDGE_METHODS],
      activitySequence: 6,
      startup: { state: "ready", migration: "complete" },
      limits: {
        maxFrameBytes: 1048576,
        maxRequestIdBytes: 128,
        maxInFlight: 64,
        maxSeenIds: 65536,
        maxOutboundBytes: 8388608,
        maxAgentDeltaBytes: 65536,
      },
    });

    const slow = fixtureRequest(client, "workspace.list", { marker: "slow", delay: 30 });
    const fast = fixtureRequest(client, "project.list", { marker: "fast", delay: 1 });

    await expect(fast).resolves.toEqual({ marker: "fast" });
    await expect(slow).resolves.toEqual({ marker: "slow" });
    await expect(events).resolves.toEqual([
      {
        v: 1,
        event: "activity",
        subscriptionId: "subscription-1",
        sequence: 7,
        data: {
          sequence: 7,
          workspaceId: "workspace-1",
          projectId: "project-1",
          entityType: "artifact",
          entityId: "artifact-1",
          action: "created",
          createdAt: 1800000,
        },
      },
      {
        v: 1,
        event: "agent",
        agentSessionId: "agent-session-1",
        turnId: "turn-1",
        sequence: 1,
        data: { type: "started" },
      },
    ]);
    await client.close();
  });

  test("does not send domain requests until a compatible hello succeeds", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/slow-hello" });

    await expect(client.request("workspace.list", {})).rejects.toMatchObject({
      code: "E_BRIDGE_NOT_READY",
    });
    await client.start();
    await expect(fixtureRequest(client, "workspace.list", { marker: "ready" })).resolves.toEqual({
      marker: "ready",
    });
    await client.close();
  });

  test("rejects an incompatible protocol with an actionable upgrade error", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/protocol-2" });

    await expect(client.start()).rejects.toMatchObject({
      code: "E_BRIDGE_VERSION",
      message: expect.stringMatching(/update|upgrade/i),
    });
    await client.close();
  });

  test.each(["core-1", "core-2"])("rejects unsupported %s before enabling production mutations", async (root) => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: `/${root}` });

    await expect(client.start()).rejects.toMatchObject({
      code: "E_BRIDGE_VERSION",
      message: expect.stringMatching(/update|upgrade/i),
    });
    await client.close();
  });

  test("rejects an incomplete hello snapshot", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/bad-hello" });

    await expect(client.start()).rejects.toMatchObject({ code: "E_BRIDGE_PROTOCOL" });
    await client.close();
  });

  test("rejects hello when one required bridge method is missing", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/missing-method" });

    await expect(client.start()).rejects.toMatchObject({ code: "E_BRIDGE_VERSION" });
    await client.close();
  });

  test.each(["bad-root-id", "bad-startup"])(
    "rejects invalid current Core hello metadata: %s",
    async (root) => {
      const client = new RalphyBridgeClient({ bin: fixtureBin, root: `/${root}` });

      await expect(client.start()).rejects.toMatchObject({ code: "E_BRIDGE_PROTOCOL" });
      await client.close();
    },
  );

  test("rejects pending requests with E_BRIDGE_CLOSED on close", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();
    const pending = fixtureRequest(client, "activity.subscribe", { hang: true });
    const rejection = expect(pending).rejects.toEqual(expect.objectContaining({
      name: "RalphyBridgeError",
      code: "E_BRIDGE_CLOSED",
    } satisfies Partial<RalphyBridgeError>));

    await client.close();
    await rejection;
  });

  test("allows stdin EOF cleanup before signaling the bridge", async () => {
    const root = join(fixtureDirectory, "graceful-close");
    const client = new RalphyBridgeClient({ bin: fixtureBin, root });
    await client.start();

    await client.close();

    await expect(readFile(`${root}.eof`, "utf8")).resolves.toBe("eof");
  });

  test("bounds close when the bridge ignores stdin EOF and SIGTERM", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/stubborn-close" });
    await client.start();
    const closing = client.close();

    try {
      const outcome = await Promise.race([
        closing.then(() => "closed"),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 2500)),
      ]);
      expect(outcome).toBe("closed");
    } finally {
      await closing;
    }
  });

  test("does not report a closed bridge as started", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();
    await client.close();

    await expect(client.start()).rejects.toMatchObject({ code: "E_BRIDGE_CLOSED" });
  });

  test("rejects pending requests when the bridge exits", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();
    const pending = fixtureRequest(client, "activity.subscribe", { exit: true });

    await expect(pending).rejects.toMatchObject({ code: "E_BRIDGE_EXITED" });
    await client.close();
  });

  test("preserves a fatal id-null bridge failure as the terminal error", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();

    await expect(fixtureRequest(client, "workspace.list", { fatal: true })).rejects.toMatchObject({
      code: "E_PROTOCOL_INVALID",
      message: "Fatal protocol error",
    });
    await expect(client.request("workspace.list", {})).rejects.toMatchObject({
      code: "E_PROTOCOL_INVALID",
    });
    await client.close();
  });

  test.each(["activity", "agent"])(
    "rejects a malformed %s event envelope",
    async (event) => {
      const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
      await client.start();

      await expect(fixtureRequest(client, "workspace.list", { invalidEvent: event })).rejects.toMatchObject({
        code: "E_BRIDGE_PROTOCOL",
      });
      await client.close();
    },
  );

  test("rejects a frame that mixes response and event envelopes", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();

    await expect(fixtureRequest(client, "workspace.list", { mixedEnvelope: true })).rejects.toMatchObject({
      code: "E_BRIDGE_PROTOCOL",
    });
    await client.close();
  });

  test("requires result on every success envelope", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();

    await expect(fixtureRequest(client, "workspace.list", { missingResult: true })).rejects.toMatchObject({
      code: "E_BRIDGE_PROTOCOL",
    });
    await client.close();
  });

  test("rejects a failure envelope that also contains a result", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();

    await expect(fixtureRequest(client, "workspace.list", { failureWithResult: true })).rejects.toMatchObject({
      code: "E_BRIDGE_PROTOCOL",
    });
    await client.close();
  });

  test("decodes UTF-8 split across stdout chunks without corrupting JSON", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();

    await expect(fixtureRequest(client, "workspace.list", { splitUtf8: true })).resolves.toEqual({
      marker: "café",
    });
    await client.close();
  });

  test("rejects invalid UTF-8 instead of replacing bytes", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();

    await expect(fixtureRequest(client, "workspace.list", { invalidUtf8: true })).rejects.toMatchObject({
      code: "E_BRIDGE_PROTOCOL",
    });
    await client.close();
  });

  test("terminates a bridge that exceeds the one MiB line limit", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();
    const pending = fixtureRequest(client, "workspace.list", { oversized: true });

    await expect(pending).rejects.toMatchObject({ code: "E_BRIDGE_PROTOCOL" });
    await client.close();
  });

  test("rejects an oversized outbound frame without terminating the bridge", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();

    await expect(fixtureRequest(client, "workspace.list", {
      marker: "x".repeat(BRIDGE_LIMITS.maxFrameBytes),
    })).rejects.toMatchObject({ code: "E_BRIDGE_FRAME_TOO_LARGE" });
    await expect(fixtureRequest(client, "workspace.list", { marker: "still-running" })).resolves.toEqual({
      marker: "still-running",
    });
    await client.close();
  });

  test("never writes more than the negotiated request count concurrently", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/library" });
    await client.start();

    const results = await Promise.all(Array.from(
      { length: BRIDGE_LIMITS.maxInFlight + 1 },
      () => fixtureRequest<{ peak: number }>(client, "workspace.list", { trackInFlight: true }),
    ));

    expect(Math.max(...results.map(({ peak }) => peak))).toBe(BRIDGE_LIMITS.maxInFlight);
    await client.close();
  });

  test("bounds requests queued behind stdin backpressure", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/paused-stdin" });
    await client.start();
    const requests = Array.from({ length: 12 }, () => fixtureRequest(client, "workspace.list", {
      marker: "x".repeat(900_000),
    }));
    const observed = requests.map((request) => request.then(
      () => null,
      (error: unknown) => error,
    ));

    try {
      const outcome = await Promise.race([
        Promise.race(observed),
        new Promise((resolve) => setTimeout(() => resolve({ code: "timeout" }), 500)),
      ]);
      expect(outcome).toMatchObject({ code: "E_BRIDGE_BACKPRESSURE" });
    } finally {
      await client.close();
      await Promise.all(observed);
    }
  });
});
