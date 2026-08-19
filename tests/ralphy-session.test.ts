import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { RalphySession } from "../electron/ralphy/session";
import { BRIDGE_METHODS } from "../electron/ralphy/types";

const fixtureRootId = (root: string): string => createHash("sha256").update(root).digest("hex");

let fixtureDirectory: string;
let fixtureBin: string;
let candidateHome: string;

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), "ralphy-bridge-session-"));
  fixtureBin = join(fixtureDirectory, "ralphy-fake");
  await writeFile(fixtureBin, `#!/usr/bin/env node
const readline = require("node:readline");

const args = process.argv.slice(2);
const root = args[args.indexOf("--root") + 1];
const rootName = require("node:path").basename(root);
const rootId = require("node:crypto").createHash("sha256").update(root).digest("hex");
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
if (rootName === "never") setTimeout(() => process.exit(0), 1000).unref();
if (rootName === "stubborn") {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1000);
  setTimeout(() => process.exit(0), 3000);
}

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "system.hello") {
    if (rootName === "never") return;
    const delay = rootName === "slow" ? 60 : rootName === "fast" ? 5 : 0;
    setTimeout(() => {
      if (rootName === "fail") {
        send({
          v: 1,
          id: request.id,
          ok: false,
          error: { code: "E_ROOT_INVALID", message: "Root is invalid" },
        });
        return;
      }
      send({
        v: 1,
        id: request.id,
        ok: true,
        result: {
          protocolVersion: 1,
          schemaVersion: 9,
          coreVersion: "3.0.0-test",
          storeId: "store-test",
          rootId,
          capabilities: ${JSON.stringify(BRIDGE_METHODS)},
          activitySequence: 0,
          startup: { state: "ready", migration: "complete" },
          limits: {
            maxFrameBytes: 1048576,
            maxRequestIdBytes: 128,
            maxInFlight: 64,
            maxSeenIds: 65536,
            maxOutboundBytes: 8388608,
            maxAgentDeltaBytes: 65536,
          },
        },
      });
    }, delay);
    return;
  }
  if (request.params && request.params.hang === true) return;
  send({
    v: 1,
    id: request.id,
    ok: true,
    result: {
      rootId,
      environment: {
        leaked: process.env.ELECTRON_SECRET || null,
        path: process.env.PATH,
      },
    },
  });
});
`);
  await chmod(fixtureBin, 0o755);
  candidateHome = join(fixtureDirectory, "candidate-home");
  const candidateBin = join(candidateHome, ".local", "bin", "ralphy");
  await mkdir(join(candidateHome, ".local", "bin"), { recursive: true });
  await copyFile(fixtureBin, candidateBin);
  await chmod(candidateBin, 0o755);
});

afterAll(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

describe("RalphySession", () => {
  test("retains the previous working session when a new root fails", async () => {
    const session = new RalphySession({ bin: fixtureBin });
    expect(session.rootEpoch).toBe(0);
    await session.open("/libraries/current");
    expect(session.rootEpoch).toBe(1);

    await expect(session.open("/libraries/fail")).rejects.toMatchObject({
      code: "E_ROOT_INVALID",
    });

    expect(session.rootEpoch).toBe(1);
    expect(session.root).toBe("/libraries/current");
    await expect(session.client.request("workspace.list", {})).resolves.toEqual({
      rootId: fixtureRootId("/libraries/current"),
      environment: expect.any(Object),
    });
    await session.close();
  });

  test("closes the previous client after the replacement hello succeeds", async () => {
    const session = new RalphySession({ bin: fixtureBin });
    await session.open("/libraries/current");
    const previous = session.client;
    const pending = previous.request("activity.subscribe", { hang: true } as never);
    const closed = expect(pending).rejects.toMatchObject({ code: "E_BRIDGE_CLOSED" });

    await expect(session.open("/libraries/next")).resolves.toMatchObject({
      rootId: fixtureRootId("/libraries/next"),
    });

    await closed;
    expect(session.rootEpoch).toBe(2);
    expect(session.root).toBe("/libraries/next");
    await session.close();
  });

  test("awaits async previous cleanup with the previous client before committing replacement", async () => {
    const session = new RalphySession({ bin: fixtureBin });
    await session.open("/libraries/current");
    const previous = session.client;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const cleanupEntered = new Promise<void>((resolve) => { entered = resolve; });

    const replacement = session.open("/libraries/next", {
      async beforePreviousClose(previousRoot, previousClient) {
        expect(previousRoot).toBe("/libraries/current");
        expect(previousClient).toBe(previous);
        entered();
        await blocked;
      },
    });
    await cleanupEntered;

    expect(session.root).toBe("/libraries/current");
    expect(session.client).toBe(previous);
    await expect(previous.request("workspace.list", {})).resolves.toMatchObject({
      rootId: fixtureRootId("/libraries/current"),
    });
    release();
    await replacement;

    expect(session.root).toBe("/libraries/next");
    await session.close();
  });

  test("prevents a slower earlier open from replacing a newer root", async () => {
    const session = new RalphySession({ bin: fixtureBin });
    await session.open("/libraries/current");

    const slow = session.open("/libraries/slow");
    const superseded = expect(slow).rejects.toMatchObject({
      code: "E_BRIDGE_SUPERSEDED",
    });
    const fast = session.open("/libraries/fast");

    await expect(fast).resolves.toMatchObject({ rootId: fixtureRootId("/libraries/fast") });
    await superseded;
    expect(session.rootEpoch).toBe(2);
    expect(session.root).toBe("/libraries/fast");
    await session.close();
  });

  test("rolls back preparation when a newer root starts before commit", async () => {
    const session = new RalphySession({ bin: fixtureBin });
    await session.open("/libraries/current");
    let releasePreparation!: () => void;
    const preparationBlocked = new Promise<void>((resolve) => {
      releasePreparation = resolve;
    });
    let preparationStarted!: () => void;
    const preparationEntered = new Promise<void>((resolve) => {
      preparationStarted = resolve;
    });
    const events: string[] = [];

    const stale = session.open("/libraries/next", {
      async preparePreviousClose(previousRoot) {
        events.push(`prepare:${previousRoot}`);
        preparationStarted();
        await preparationBlocked;
        return () => events.push(`rollback:${previousRoot}`);
      },
      beforePreviousClose(previousRoot) {
        events.push(`cleanup:${previousRoot}`);
      },
    });
    await preparationEntered;
    const latest = session.open("/libraries/fast", {
      preparePreviousClose(previousRoot) {
        events.push(`latest-prepare:${previousRoot}`);
      },
      beforePreviousClose(previousRoot) {
        events.push(`latest-cleanup:${previousRoot}`);
      },
    });
    releasePreparation();

    await expect(stale).rejects.toMatchObject({ code: "E_BRIDGE_SUPERSEDED" });
    await expect(latest).resolves.toMatchObject({ rootId: fixtureRootId("/libraries/fast") });
    expect(events).toEqual([
      "prepare:/libraries/current",
      "rollback:/libraries/current",
      "latest-prepare:/libraries/current",
      "latest-cleanup:/libraries/current",
    ]);
    expect(session.root).toBe("/libraries/fast");
    await session.close();
  });

  test("cancels a superseded candidate that never completes hello", async () => {
    const session = new RalphySession({ bin: fixtureBin });
    const stale = session.open("/libraries/never").then(
      () => ({ code: "resolved" }),
      (error: unknown) => error,
    );

    try {
      await session.open("/libraries/fast");
      const outcome = await Promise.race([
        stale,
        new Promise((resolve) => setTimeout(() => resolve({ code: "timeout" }), 250)),
      ]);
      expect(outcome).toMatchObject({ code: "E_BRIDGE_SUPERSEDED" });
    } finally {
      await session.close();
    }
  });

  test("close cancels a candidate that never completes hello", async () => {
    const session = new RalphySession({ bin: fixtureBin });
    const opening = session.open("/libraries/never").then(
      () => ({ code: "resolved" }),
      (error: unknown) => error,
    );

    await session.close();
    const outcome = await Promise.race([
      opening,
      new Promise((resolve) => setTimeout(() => resolve({ code: "timeout" }), 250)),
    ]);

    expect(outcome).toMatchObject({ code: "E_BRIDGE_SUPERSEDED" });
  });

  test("increments rootEpoch when close clears the active root", async () => {
    const session = new RalphySession({ bin: fixtureBin });
    await session.open("/libraries/current");
    const beforeClose = session.rootEpoch;

    await session.close();

    expect(session.root).toBeNull();
    expect(session.rootEpoch).toBe(beforeClose + 1);
  });

  test("does not wedge root replacement when the prior bridge ignores SIGTERM", async () => {
    const session = new RalphySession({ bin: fixtureBin });
    await session.open("/libraries/stubborn");
    const replacement = session.open("/libraries/next");

    try {
      const outcome = await Promise.race([
        replacement.then((hello) => hello.rootId),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 2500)),
      ]);
      expect(outcome).toBe(fixtureRootId("/libraries/next"));
    } finally {
      await replacement;
      await session.close();
    }
  });

  test("discovers a production candidate and passes only a GUI-safe environment", async () => {
    const session = new RalphySession({
      env: {
        HOME: candidateHome,
        PATH: "relative:/unsafe/bin",
        ELECTRON_SECRET: "must-not-leak",
      },
    });

    await session.open("/libraries/discovered");

    await expect(session.client.request("workspace.list", {})).resolves.toEqual({
      rootId: fixtureRootId("/libraries/discovered"),
      environment: {
        leaked: null,
        path: [
          join(candidateHome, ".bun", "bin"),
          join(candidateHome, ".local", "bin"),
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
        ].join(":"),
      },
    });
    await session.close();
  });
});
