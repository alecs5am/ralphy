import type { RalphyBridgeClient } from "./client";
import type { ActivityDto, BridgeEvent } from "./types";

export interface ActivityBinding {
  storeId: string;
  rootEpoch: number;
}

export interface ActivitySynchronizer {
  start(input: {
    client: Pick<RalphyBridgeClient, "request" | "onEvent">;
    binding: ActivityBinding;
    afterSequence: number;
  }): Promise<number>;
  currentSequence(): number;
  publish(): void;
  stop(): Promise<void>;
}

interface ActivitySynchronizerDependencies {
  createSubscriptionId(): string;
  onRefresh(value: ActivityBinding & { sequence: number }): void;
  onError(error: unknown): void;
}

const unavailable = () => new Error("Live activity updates are unavailable");
const sequence = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function validAck(value: unknown, subscriptionId: string, afterSequence: number): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const ack = value as Record<string, unknown>;
  return Object.keys(ack).length === 2
    && ack.subscriptionId === subscriptionId
    && ack.sequence === afterSequence;
}

function activityPage(value: unknown, cursor: number): { items: ActivityDto[]; nextCursor: number | null } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.items) || !(page.nextCursor === null || sequence(page.nextCursor))) throw unavailable();
  let previous = cursor;
  for (const item of page.items) {
    if (item === null || typeof item !== "object" || !sequence((item as ActivityDto).sequence) || (item as ActivityDto).sequence <= previous) {
      throw unavailable();
    }
    previous = (item as ActivityDto).sequence;
  }
  if (page.nextCursor !== null && (page.nextCursor <= cursor || page.nextCursor < previous)) throw unavailable();
  return { items: page.items as ActivityDto[], nextCursor: page.nextCursor as number | null };
}

export function createActivitySynchronizer(
  dependencies: ActivitySynchronizerDependencies,
): ActivitySynchronizer {
  let generation = 0;
  let current = 0;
  let published = false;
  let rootReadySequence = 0;
  let bufferedToken: number | null = null;
  let currentBinding: ActivityBinding | null = null;
  let stopPromise: Promise<void> | null = null;
  let active: {
    client: Pick<RalphyBridgeClient, "request" | "onEvent">;
    subscriptionId: string;
    detach(): void;
  } | null = null;

  const cleanup = (
    client: Pick<RalphyBridgeClient, "request" | "onEvent">,
    subscriptionId: string,
  ): Promise<void> => client.request("activity.unsubscribe", { subscriptionId }).then(
    () => undefined,
    () => undefined,
  );

  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;
    generation += 1;
    const stopped = active;
    active = null;
    currentBinding = null;
    stopped?.detach();
    stopPromise = stopped ? cleanup(stopped.client, stopped.subscriptionId) : Promise.resolve();
    return stopPromise;
  };

  return {
    async start({ client, binding, afterSequence }) {
      const ownGeneration = ++generation;
      const subscriptionId = dependencies.createSubscriptionId();
      let acknowledged = false;
      const bufferedEvents: number[] = [];
      let tail = Promise.resolve();
      current = afterSequence;
      published = false;
      rootReadySequence = afterSequence;
      bufferedToken = null;
      currentBinding = binding;
      stopPromise = null;

      const commit = (next: number) => {
        if (ownGeneration !== generation || next <= current) return;
        current = next;
        if (published) dependencies.onRefresh({ ...binding, sequence: next });
        else bufferedToken = next;
      };
      const advance = async (pending: number) => {
        if (ownGeneration !== generation || pending <= current) return;
        if (pending === current + 1) {
          commit(pending);
          return;
        }
        let cursor = current;
        let newest = current;
        while (newest < pending) {
          const page = activityPage(await client.request("activity.list", { afterSequence: cursor, limit: 100 }), cursor);
          if (ownGeneration !== generation) return;
          const last = page.items.at(-1)?.sequence ?? cursor;
          newest = page.nextCursor ?? last;
          if (newest < pending && page.nextCursor === null) throw unavailable();
          cursor = newest;
        }
        commit(newest);
      };
      const enqueue = (pending: number) => {
        tail = tail.then(() => advance(pending)).catch((error) => {
          if (ownGeneration === generation) dependencies.onError(error);
        });
      };
      const detach = client.onEvent((bridgeEvent: BridgeEvent) => {
        if (
          ownGeneration !== generation
          || bridgeEvent.event !== "activity"
          || bridgeEvent.subscriptionId !== subscriptionId
        ) return;
        if (acknowledged) enqueue(bridgeEvent.sequence);
        else bufferedEvents.push(bridgeEvent.sequence);
      });
      active = { client, subscriptionId, detach };

      let ack: unknown;
      try {
        ack = await client.request("activity.subscribe", { subscriptionId, afterSequence });
      } catch {
        ack = null;
      }
      if (ownGeneration !== generation) return afterSequence;
      if (!validAck(ack, subscriptionId, afterSequence)) {
        generation += 1;
        active = null;
        currentBinding = null;
        detach();
        dependencies.onError(unavailable());
        stopPromise = cleanup(client, subscriptionId);
        await stopPromise;
        return afterSequence;
      }

      acknowledged = true;
      bufferedEvents.forEach(enqueue);
      await tail;
      if (ownGeneration !== generation) return afterSequence;
      rootReadySequence = current;
      bufferedToken = null;
      return current;
    },
    currentSequence: () => current,
    publish() {
      published = true;
      if (currentBinding && bufferedToken !== null && bufferedToken > rootReadySequence) {
        dependencies.onRefresh({ ...currentBinding, sequence: bufferedToken });
        bufferedToken = null;
      }
    },
    stop,
  };
}
