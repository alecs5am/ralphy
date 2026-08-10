import { describe, expect, test, vi } from "vitest";

const hello = {
  storeId: "store-next",
  rootId: "root-next",
  activitySequence: 42,
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => { resolve = accept; });
  return { promise, resolve };
};

describe("main-owned root session", () => {
  test("cleans the old root in security order after replacement hello", async () => {
    const rootSession = await import("../electron/root-session").catch(() => ({}));
    expect(rootSession).toHaveProperty("openRootSession");
    const events: string[] = [];
    const candidateClient = { name: "candidate" };
    const previousClient = { name: "previous" };
    const session = {
      root: "/libraries/old/.ralphy",
      hello: { storeId: "store-old", rootId: "root-old", activitySequence: 8 },
      client: previousClient,
      rootEpoch: 3,
      async open(root: string, hooks: {
        preparePreviousClose(previousRoot: string | null): Promise<void>;
        beforePreviousClose(previousRoot: string | null, previousClient: unknown): Promise<void>;
        afterPreviousClose(previousRoot: string | null): void;
      }) {
        expect(root).toBe("/libraries/next/.ralphy");
        const previousRoot = this.root;
        await hooks.preparePreviousClose(previousRoot, candidateClient);
        await hooks.beforePreviousClose(previousRoot, this.client);
        events.push("bridge-close");
        this.root = root;
        this.hello = hello;
        this.client = candidateClient;
        this.rootEpoch += 1;
        hooks.afterPreviousClose(previousRoot);
        return hello;
      },
    };
    const { openRootSession } = rootSession as {
      openRootSession(options: Record<string, unknown>): Promise<unknown>;
    };

    const result = await openRootSession({
      session,
      root: "/libraries/next/.ralphy",
      label: "Next Library",
      prepare: async (_previousRoot: string | null, client: unknown) => {
        events.push(client === candidateClient ? "candidate" : "wrong-client");
      },
      invalidateFileTokens: () => events.push("tokens"),
      stopAgentTurns: () => events.push("agent"),
      terminateTerminals: () => events.push("terminals"),
      unsubscribeActivity: async (client: unknown) => events.push(client === previousClient ? "activity-unsubscribe" : "wrong-old-client"),
      subscribeActivity: async (client: unknown, binding: unknown) => {
        expect(client).toBe(candidateClient);
        expect(binding).toEqual({ storeId: "store-next", rootEpoch: 4, afterSequence: 42 });
        events.push("activity-subscribe");
        return 44;
      },
    });

    expect(events).toEqual(["candidate", "activity-unsubscribe", "tokens", "agent", "bridge-close", "terminals", "activity-subscribe"]);
    expect(result).toEqual({ storeId: "store-next", label: "Next Library", rootEpoch: 4, activitySequence: 44 });
    expect(result).not.toHaveProperty("root");
  });

  test("retains old-root resources when replacement hello fails", async () => {
    const { openRootSession } = await import("../electron/root-session") as {
      openRootSession(options: Record<string, unknown>): Promise<unknown>;
    };
    const cleanup = vi.fn();
    const session = {
      root: "/libraries/old/.ralphy",
      hello: { storeId: "store-old", rootId: "root-old", activitySequence: 8 },
      client: {},
      async open() {
        throw Object.assign(new Error("invalid root"), { code: "E_ROOT_INVALID" });
      },
    };

    await expect(openRootSession({
      session,
      root: "/libraries/broken/.ralphy",
      label: "Broken",
      invalidateFileTokens: cleanup,
      stopAgentTurns: cleanup,
      terminateTerminals: cleanup,
      unsubscribeActivity: cleanup,
      subscribeActivity: cleanup,
    })).rejects.toMatchObject({ code: "E_ROOT_INVALID" });

    expect(session.root).toBe("/libraries/old/.ralphy");
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("retains the previous bridge and resources when preparation fails", async () => {
    const { openRootSession } = await import("../electron/root-session") as {
      openRootSession(options: Record<string, unknown>): Promise<unknown>;
    };
    const cleanup = vi.fn();
    const session = {
      root: "/libraries/old/.ralphy",
      hello: { storeId: "store-old", rootId: "root-old", activitySequence: 8 },
      client: {},
      async open(_root: string, hooks: {
        preparePreviousClose(previousRoot: string | null): Promise<void>;
      }) {
        await hooks.preparePreviousClose(this.root);
        throw new Error("previous bridge should remain active");
      },
    };

    await expect(openRootSession({
      session,
      root: "/libraries/next/.ralphy",
      label: "Next",
      prepare: async () => {
        throw new Error("scanner failed");
      },
      invalidateFileTokens: cleanup,
      stopAgentTurns: cleanup,
      terminateTerminals: cleanup,
      unsubscribeActivity: cleanup,
      subscribeActivity: cleanup,
    })).rejects.toThrow("scanner failed");

    expect(session.root).toBe("/libraries/old/.ralphy");
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("cleans the root selected inside the serialized commit", async () => {
    const { openRootSession } = await import("../electron/root-session") as {
      openRootSession(options: Record<string, unknown>): Promise<unknown>;
    };
    const terminated: string[] = [];
    const session = {
      root: "/libraries/stale/.ralphy",
      hello: { storeId: "store-stale", rootId: "root-stale", activitySequence: 8 },
      client: {},
      async open(root: string, hooks: {
        preparePreviousClose(previousRoot: string | null): Promise<void>;
        beforePreviousClose(previousRoot: string | null): void;
        afterPreviousClose(previousRoot: string | null): void;
      }) {
        const committedPreviousRoot = "/libraries/current/.ralphy";
        await hooks.preparePreviousClose(committedPreviousRoot);
        hooks.beforePreviousClose(committedPreviousRoot);
        this.root = root;
        this.hello = hello;
        hooks.afterPreviousClose(committedPreviousRoot);
        return hello;
      },
    };

    await openRootSession({
      session,
      root: "/libraries/next/.ralphy",
      label: "Next",
      invalidateFileTokens: vi.fn(),
      stopAgentTurns: vi.fn(),
      terminateTerminals: (root: string) => terminated.push(root),
      unsubscribeActivity: vi.fn(),
      subscribeActivity: vi.fn(),
    });

    expect(terminated).toEqual(["/libraries/current/.ralphy"]);
  });

  test("same-store replacement carries the incremented root epoch", async () => {
    const { openRootSession } = await import("../electron/root-session") as {
      openRootSession(options: Record<string, unknown>): Promise<unknown>;
    };
    const session = {
      root: "/libraries/old/.ralphy",
      hello: { storeId: "store-same", activitySequence: 3 },
      client: { name: "old" },
      rootEpoch: 9,
      async open(root: string, hooks: {
        preparePreviousClose(previousRoot: string | null, candidateClient: unknown): Promise<void>;
        beforePreviousClose(previousRoot: string | null, previousClient: unknown): Promise<void>;
        afterPreviousClose(previousRoot: string | null): void;
      }) {
        const candidate = { name: "new" };
        await hooks.preparePreviousClose(this.root, candidate);
        await hooks.beforePreviousClose(this.root, this.client);
        hooks.afterPreviousClose(this.root);
        this.root = root;
        this.client = candidate;
        this.rootEpoch += 1;
        this.hello = { storeId: "store-same", activitySequence: 5 };
        return this.hello;
      },
    };

    const identity = await openRootSession({
      session,
      root: "/libraries/new/.ralphy",
      label: "Same",
      invalidateFileTokens: vi.fn(),
      stopAgentTurns: vi.fn(),
      terminateTerminals: vi.fn(),
      unsubscribeActivity: vi.fn(),
      subscribeActivity: async () => 6,
    });

    expect(identity).toEqual({ storeId: "store-same", label: "Same", rootEpoch: 10, activitySequence: 6 });
  });

  test("shutdown waits for activity cleanup and is idempotent", async () => {
    const { createRootShutdown } = await import("../electron/root-session") as {
      createRootShutdown(stopActivity: () => Promise<void>, closeSession: () => Promise<void>): () => Promise<void>;
    };
    let release!: () => void;
    const activityStopped = new Promise<void>((resolve) => { release = resolve; });
    const events: string[] = [];
    const shutdown = createRootShutdown(
      async () => {
        events.push("activity-stop");
        await activityStopped;
        throw new Error("already closed");
      },
      async () => { events.push("session-close"); },
    );

    const first = shutdown();
    const second = shutdown();
    expect(second).toBe(first);
    expect(events).toEqual(["activity-stop"]);
    release();
    await expect(first).resolves.toBeUndefined();
    expect(events).toEqual(["activity-stop", "session-close"]);
  });

  test("quit coordinator prevents repeated entry until ordered shutdown completes", async () => {
    const { createQuitCoordinator, createRootShutdown } = await import("../electron/root-session") as {
      createQuitCoordinator(shutdown: () => Promise<void>, quit: () => void): {
        request(event: { preventDefault(): void }): Promise<void>;
      };
      createRootShutdown(stopActivity: () => Promise<void>, closeSession: () => Promise<void>): () => Promise<void>;
    };
    const unsubscribe = deferred();
    const close = deferred();
    const events: string[] = [];
    const shutdown = createRootShutdown(
      async () => {
        events.push("activity-stop-start");
        await unsubscribe.promise;
        events.push("activity-stop-complete");
      },
      async () => {
        events.push("session-close-start");
        await close.promise;
        events.push("session-close-complete");
      },
    );
    const finalEntry = { preventDefault: vi.fn() };
    let coordinator!: { request(event: { preventDefault(): void }): Promise<void> };
    const quit = vi.fn(() => {
      events.push("quit");
      void coordinator.request(finalEntry);
    });
    coordinator = createQuitCoordinator(shutdown, quit);
    const windowClose = { preventDefault: vi.fn() };
    const beforeQuit = { preventDefault: vi.fn() };

    const first = coordinator.request(windowClose);
    const repeated = coordinator.request(beforeQuit);
    expect(repeated).toBe(first);
    expect(windowClose.preventDefault).toHaveBeenCalledOnce();
    expect(beforeQuit.preventDefault).toHaveBeenCalledOnce();
    expect(events).toEqual(["activity-stop-start"]);
    unsubscribe.resolve();
    await vi.waitFor(() => expect(events).toContain("session-close-start"));
    expect(quit).not.toHaveBeenCalled();
    close.resolve();
    await first;

    expect(events).toEqual([
      "activity-stop-start",
      "activity-stop-complete",
      "session-close-start",
      "session-close-complete",
      "quit",
    ]);
    expect(quit).toHaveBeenCalledOnce();
    expect(finalEntry.preventDefault).not.toHaveBeenCalled();
  });

  test("quit coordinator still closes the session when activity stop fails", async () => {
    const { createQuitCoordinator, createRootShutdown } = await import("../electron/root-session") as {
      createQuitCoordinator(shutdown: () => Promise<void>, quit: () => void): {
        request(event: { preventDefault(): void }): Promise<void>;
      };
      createRootShutdown(stopActivity: () => Promise<void>, closeSession: () => Promise<void>): () => Promise<void>;
    };
    const events: string[] = [];
    const shutdown = createRootShutdown(
      async () => {
        events.push("activity-stop");
        throw new Error("bridge already gone");
      },
      async () => { events.push("session-close"); },
    );
    const quit = vi.fn(() => events.push("quit"));
    const coordinator = createQuitCoordinator(shutdown, quit);
    const entry = { preventDefault: vi.fn() };

    await coordinator.request(entry);

    expect(entry.preventDefault).toHaveBeenCalledOnce();
    expect(events).toEqual(["activity-stop", "session-close", "quit"]);
    expect(quit).toHaveBeenCalledOnce();
  });
});
