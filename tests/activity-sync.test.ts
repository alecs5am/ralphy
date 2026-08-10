import { describe, expect, test, vi } from "vitest";
import type { ActivityDto, BridgeEvent } from "../electron/ralphy/types";
import { createActivitySynchronizer } from "../electron/ralphy/activity-sync";

const activity = (sequence: number): ActivityDto => ({
  sequence,
  workspaceId: "workspace-1",
  projectId: null,
  entityType: "workspace",
  entityId: "workspace-1",
  action: "updated",
  createdAt: sequence,
});

const event = (subscriptionId: string, sequence: number): BridgeEvent => ({
  v: 1,
  event: "activity",
  subscriptionId,
  sequence,
  data: activity(sequence),
});

const deferred = <Value>() => {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
};

function harness(request: (method: string, params: unknown) => Promise<unknown>) {
  let listener: ((value: BridgeEvent) => void) | null = null;
  let detachCount = 0;
  return {
    client: {
      request,
      onEvent(next: (value: BridgeEvent) => void) {
        listener = next;
        return () => {
          detachCount += 1;
          listener = null;
        };
      },
    },
    emit(value: BridgeEvent) { listener?.(value); },
    listening() { return listener !== null; },
    detachCount() { return detachCount; },
  };
}

describe("global activity synchronizer", () => {
  test("attaches before subscribe and holds matching events until the exact ACK", async () => {
    const ack = deferred<unknown>();
    const refreshes: unknown[] = [];
    let attachedAtRequest = false;
    const bridge = harness(async (method, params) => {
      expect(method).toBe("activity.subscribe");
      expect(params).toEqual({ subscriptionId: "subscription-1", afterSequence: 4 });
      attachedAtRequest = bridge.listening();
      bridge.emit(event("other", 5));
      bridge.emit({ v: 1, event: "agent", agentSessionId: "agent-1", turnId: "turn-1", sequence: 5, data: {} });
      bridge.emit(event("subscription-1", 5));
      return await ack.promise;
    });
    const sync = createActivitySynchronizer({
      createSubscriptionId: () => "subscription-1",
      onRefresh: (value) => refreshes.push(value),
      onError: () => undefined,
    });

    const starting = sync.start({
      client: bridge.client,
      binding: { storeId: "store-1", rootEpoch: 7 },
      afterSequence: 4,
    });
    await Promise.resolve();
    expect(attachedAtRequest).toBe(true);
    expect(sync.currentSequence()).toBe(4);
    expect(refreshes).toEqual([]);

    ack.resolve({ subscriptionId: "subscription-1", sequence: 4 });
    await expect(starting).resolves.toBe(5);
    expect(sync.currentSequence()).toBe(5);
    expect(refreshes).toEqual([]);
  });

  test("rejects a malformed ACK without rolling back the usable root", async () => {
    const errors: unknown[] = [];
    const requests: Array<[string, unknown]> = [];
    const bridge = harness(async (method, params) => {
      requests.push([method, params]);
      if (method === "activity.subscribe") return { subscriptionId: "wrong", sequence: 8 };
      if (method === "activity.unsubscribe") return { subscriptionId: "subscription-1", unsubscribed: true };
      throw new Error(`Unexpected ${method}`);
    });
    const sync = createActivitySynchronizer({
      createSubscriptionId: () => "subscription-1",
      onRefresh: () => undefined,
      onError: (error) => errors.push(error),
    });

    await expect(sync.start({ client: bridge.client, binding: { storeId: "store-1", rootEpoch: 1 }, afterSequence: 8 })).resolves.toBe(8);

    expect(sync.currentSequence()).toBe(8);
    expect(bridge.listening()).toBe(false);
    expect(errors.map(String)).toEqual(["Error: Live activity updates are unavailable"]);
    expect(requests).toEqual([
      ["activity.subscribe", { subscriptionId: "subscription-1", afterSequence: 8 }],
      ["activity.unsubscribe", { subscriptionId: "subscription-1" }],
    ]);
  });

  test("deduplicates and accepts direct next activity without catch-up", async () => {
    const refreshes: unknown[] = [];
    const requests: Array<[string, unknown]> = [];
    const bridge = harness(async (method, params) => {
      requests.push([method, params]);
      if (method === "activity.subscribe") return { subscriptionId: "subscription-1", sequence: 10 };
      if (method === "activity.unsubscribe") return { subscriptionId: "subscription-1", unsubscribed: true };
      throw new Error(`Unexpected ${method}`);
    });
    const sync = createActivitySynchronizer({
      createSubscriptionId: () => "subscription-1",
      onRefresh: (value) => refreshes.push(value),
      onError: () => undefined,
    });
    await sync.start({ client: bridge.client, binding: { storeId: "store-1", rootEpoch: 2 }, afterSequence: 10 });
    sync.publish();

    bridge.emit(event("subscription-1", 10));
    bridge.emit(event("subscription-1", 11));
    bridge.emit(event("subscription-1", 11));
    await vi.waitFor(() => expect(sync.currentSequence()).toBe(11));

    expect(refreshes).toEqual([{ storeId: "store-1", rootEpoch: 2, sequence: 11 }]);
    expect(requests.filter(([method]) => method === "activity.list")).toEqual([]);
  });

  test("serializes a two-page catch-up and permits non-contiguous global IDs", async () => {
    const refreshes: unknown[] = [];
    const requests: Array<[string, unknown]> = [];
    const bridge = harness(async (method, params) => {
      requests.push([method, params]);
      if (method === "activity.subscribe") return { subscriptionId: "subscription-1", sequence: 10 };
      if (method === "activity.list" && (params as { afterSequence: number }).afterSequence === 10) {
        return { items: [activity(12), activity(14)], nextCursor: 14 };
      }
      if (method === "activity.list" && (params as { afterSequence: number }).afterSequence === 14) {
        return { items: [activity(18), activity(20)], nextCursor: null };
      }
      throw new Error(`Unexpected ${method}`);
    });
    const sync = createActivitySynchronizer({
      createSubscriptionId: () => "subscription-1",
      onRefresh: (value) => refreshes.push(value),
      onError: () => undefined,
    });
    await sync.start({ client: bridge.client, binding: { storeId: "store-1", rootEpoch: 2 }, afterSequence: 10 });
    sync.publish();

    bridge.emit(event("subscription-1", 18));
    bridge.emit(event("subscription-1", 20));
    await vi.waitFor(() => expect(sync.currentSequence()).toBe(20));

    expect(requests.filter(([method]) => method === "activity.list")).toEqual([
      ["activity.list", { afterSequence: 10, limit: 100 }],
      ["activity.list", { afterSequence: 14, limit: 100 }],
    ]);
    expect(refreshes).toEqual([
      { storeId: "store-1", rootEpoch: 2, sequence: 20 },
    ]);
  });

  test.each([
    ["rejected", async () => { throw new Error("offline"); }],
    ["stalled cursor", async () => ({ items: [activity(12)], nextCursor: 10 })],
    ["descending rows", async () => ({ items: [activity(13), activity(12)], nextCursor: 13 })],
    ["uncovered end", async () => ({ items: [activity(12)], nextCursor: null })],
  ])("leaves current unchanged after a %s catch-up page", async (_name, page) => {
    const errors: unknown[] = [];
    const bridge = harness(async (method) => {
      if (method === "activity.subscribe") return { subscriptionId: "subscription-1", sequence: 10 };
      if (method === "activity.list") return await page();
      throw new Error(`Unexpected ${method}`);
    });
    const sync = createActivitySynchronizer({
      createSubscriptionId: () => "subscription-1",
      onRefresh: () => undefined,
      onError: (error) => errors.push(error),
    });
    await sync.start({ client: bridge.client, binding: { storeId: "store-1", rootEpoch: 2 }, afterSequence: 10 });
    sync.publish();

    bridge.emit(event("subscription-1", 15));
    await vi.waitFor(() => expect(errors).toHaveLength(1));

    expect(sync.currentSequence()).toBe(10);
  });

  test("stop detaches first, ignores deferred work, and unsubscribes exactly once", async () => {
    const page = deferred<unknown>();
    const unsubscribe = deferred<unknown>();
    const refreshes: unknown[] = [];
    const requests: Array<[string, unknown]> = [];
    const bridge = harness(async (method, params) => {
      requests.push([method, params]);
      if (method === "activity.subscribe") return { subscriptionId: "subscription-1", sequence: 1 };
      if (method === "activity.list") return await page.promise;
      if (method === "activity.unsubscribe") return await unsubscribe.promise;
      throw new Error(`Unexpected ${method}`);
    });
    const sync = createActivitySynchronizer({
      createSubscriptionId: () => "subscription-1",
      onRefresh: (value) => refreshes.push(value),
      onError: () => undefined,
    });
    await sync.start({ client: bridge.client, binding: { storeId: "store-1", rootEpoch: 1 }, afterSequence: 1 });
    sync.publish();
    bridge.emit(event("subscription-1", 4));
    await vi.waitFor(() => expect(requests.some(([method]) => method === "activity.list")).toBe(true));

    const stopping = sync.stop();
    expect(bridge.listening()).toBe(false);
    expect(bridge.detachCount()).toBe(1);
    expect(requests.filter(([method]) => method === "activity.unsubscribe")).toEqual([
      ["activity.unsubscribe", { subscriptionId: "subscription-1" }],
    ]);
    expect(sync.stop()).toBe(stopping);
    page.resolve({ items: [activity(4)], nextCursor: null });
    unsubscribe.resolve({ subscriptionId: "subscription-1", unsubscribed: true });
    await stopping;

    expect(sync.currentSequence()).toBe(1);
    expect(refreshes).toEqual([]);
  });

  test("treats unsubscribe failure as nonfatal", async () => {
    const bridge = harness(async (method) => {
      if (method === "activity.subscribe") return { subscriptionId: "subscription-1", sequence: 3 };
      if (method === "activity.unsubscribe") throw new Error("closed");
      throw new Error(`Unexpected ${method}`);
    });
    const sync = createActivitySynchronizer({
      createSubscriptionId: () => "subscription-1",
      onRefresh: () => undefined,
      onError: () => undefined,
    });
    await sync.start({ client: bridge.client, binding: { storeId: "store-1", rootEpoch: 1 }, afterSequence: 3 });

    await expect(sync.stop()).resolves.toBeUndefined();
  });

  test("publishes only a token newer than the sequence returned for root-ready", async () => {
    const refreshes: unknown[] = [];
    const bridge = harness(async (method) => {
      if (method === "activity.subscribe") {
        bridge.emit(event("subscription-1", 6));
        return { subscriptionId: "subscription-1", sequence: 5 };
      }
      throw new Error(`Unexpected ${method}`);
    });
    const sync = createActivitySynchronizer({
      createSubscriptionId: () => "subscription-1",
      onRefresh: (value) => refreshes.push(value),
      onError: () => undefined,
    });

    await expect(sync.start({ client: bridge.client, binding: { storeId: "store-1", rootEpoch: 1 }, afterSequence: 5 })).resolves.toBe(6);
    bridge.emit(event("subscription-1", 7));
    await vi.waitFor(() => expect(sync.currentSequence()).toBe(7));
    expect(refreshes).toEqual([]);

    sync.publish();
    expect(refreshes).toEqual([{ storeId: "store-1", rootEpoch: 1, sequence: 7 }]);
    sync.publish();
    expect(refreshes).toHaveLength(1);
  });

  test("a stopped old root cannot publish into a same-store new epoch", async () => {
    const oldPage = deferred<unknown>();
    const refreshes: unknown[] = [];
    let subscription = "subscription-old";
    const bridge = harness(async (method) => {
      if (method === "activity.subscribe") return { subscriptionId: subscription, sequence: 1 };
      if (method === "activity.list") return await oldPage.promise;
      if (method === "activity.unsubscribe") return { subscriptionId: "subscription-old", unsubscribed: true };
      throw new Error(`Unexpected ${method}`);
    });
    const sync = createActivitySynchronizer({
      createSubscriptionId: () => subscription,
      onRefresh: (value) => refreshes.push(value),
      onError: () => undefined,
    });
    await sync.start({ client: bridge.client, binding: { storeId: "store-1", rootEpoch: 1 }, afterSequence: 1 });
    sync.publish();
    bridge.emit(event("subscription-old", 4));
    await sync.stop();

    subscription = "subscription-new";
    await sync.start({ client: bridge.client, binding: { storeId: "store-1", rootEpoch: 2 }, afterSequence: 1 });
    sync.publish();
    oldPage.resolve({ items: [activity(4)], nextCursor: null });
    bridge.emit(event("subscription-new", 2));
    await vi.waitFor(() => expect(sync.currentSequence()).toBe(2));

    expect(refreshes).toEqual([{ storeId: "store-1", rootEpoch: 2, sequence: 2 }]);
  });
});
