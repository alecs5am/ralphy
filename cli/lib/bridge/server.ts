import { once } from "node:events";
import type { Readable, Writable } from "node:stream";
import {
  BridgeFrameDecoder,
  BridgeProtocolError,
  MAX_IN_FLIGHT,
  MAX_OUTBOUND_BYTES,
  MAX_SEEN_IDS,
  createBridgeSuccess,
  parseBridgeRequest,
  projectBridgeError,
  stringifyBridgeMessage,
} from "./protocol.js";
import {
  createBridgeMethods,
  type BridgeMethodContext,
  type BridgeMethodTable,
} from "./methods.js";
import {
  revokeConsumerAuthority,
  type ConsumerAuthority,
} from "../store/consumer-auth.js";
import { endConsumerSession } from "../store/sessions.js";
import { listGlobalActivity } from "../store/activity.js";

export type BridgeServerOptions = {
  dataRoot: string;
  input?: Readable;
  output?: Writable;
  methods?: BridgeMethodTable;
};

/** A single serialized stdout lane shared by responses and future events. */
export class BridgeWriter {
  private tail = Promise.resolve();
  private queued = 0;
  private closed = false;

  constructor(private readonly output: Writable) {}

  get queuedBytes(): number {
    return this.queued;
  }

  write(message: unknown): Promise<void> {
    if (this.closed) return Promise.reject(new Error("Bridge writer is closed"));
    const frame = stringifyBridgeMessage(message);
    const bytes = Buffer.byteLength(frame, "utf8");
    if (this.queued + bytes > MAX_OUTBOUND_BYTES) {
      return Promise.reject(
        new BridgeProtocolError("E_PROTOCOL_INVALID", "Bridge output queue exceeds byte limit"),
      );
    }
    this.queued += bytes;
    const operation = this.tail.then(async () => {
      try {
        const writable = this.output.write(frame);
        if (!writable) await once(this.output, "drain");
      } finally {
        this.queued -= bytes;
      }
    });
    this.tail = operation.catch(() => undefined);
    return operation;
  }

  async flush(): Promise<void> {
    await this.tail;
  }

  close(): void {
    this.closed = true;
  }
}

export async function runBridge(options: BridgeServerOptions): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const writer = new BridgeWriter(output);
  const methods = options.methods ?? createBridgeMethods({ dataRoot: options.dataRoot });
  const decoder = new BridgeFrameDecoder();
  const seenIds = new Set<string>();
  const liveIds = new Set<string>();
  const completedIds = new Set<string>();
  const inFlight = new Set<Promise<void>>();
  const queuedFrames: Buffer[] = [];
  const consumerSessions = new Set<string>();
  const activitySubscriptions = new Map<string, { sequence: number; ready: boolean }>();
  let authority: ConsumerAuthority | undefined;
  let helloComplete = false;
  let mutationLane = Promise.resolve();
  let closed = false;
  let resolving = false;
  let polling = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const context: BridgeMethodContext = {
    get authority() {
      return authority;
    },
    consumerSessions,
    activitySubscriptions,
    get helloComplete() {
      return helloComplete;
    },
    markHello: () => {
      helloComplete = true;
    },
    setAuthority: (value) => {
      authority = value;
    },
  };

  const finishConnection = async (): Promise<void> => {
    if (resolving) return;
    resolving = true;
    closed = true;
    if (pollTimer !== undefined) clearInterval(pollTimer);
    input.pause();
    for (const sessionId of consumerSessions) {
      if (authority) {
        try {
          endConsumerSession(authority, sessionId);
        } catch {
          // Active operation Sessions remain valid only for terminal cleanup.
        }
      }
    }
    if (authority) {
      try {
        revokeConsumerAuthority(authority);
      } catch {
        // The authority may already have been revoked by an authentication failure.
      }
    }
    await Promise.allSettled([...inFlight]);
    await writer.flush();
    writer.close();
  };

  const fatal = async (error: unknown): Promise<void> => {
    if (closed) return;
    closed = true;
    input.pause();
    for (const promise of inFlight) void promise.catch(() => undefined);
    const failure = projectBridgeError(error instanceof BridgeProtocolError ? error : new BridgeProtocolError("E_PROTOCOL_INVALID", "Bridge connection is invalid"), null);
    try {
      await writer.write(failure);
      await writer.flush();
    } catch {
      // The queue is intentionally bounded; if it is full, closing is safer than allocating.
    }
    await finishConnection();
  };

  const sendFailure = async (id: string | null, error: unknown): Promise<void> => {
    const failure = projectBridgeError(error, id);
    try {
      await writer.write(failure);
    } catch (writeError) {
      await fatal(writeError);
    }
  };

  const dispatch = async (request: ReturnType<typeof parseBridgeRequest>): Promise<void> => {
    if (!helloComplete && request.method !== "system.hello") {
      await sendFailure(request.id, new BridgeProtocolError("E_PROTOCOL_INVALID", "system.hello is required first"));
      return;
    }
    const method = methods.get(request.method);
    if (!method) {
      await sendFailure(request.id, new BridgeProtocolError("E_PROTOCOL_INVALID", "Unknown bridge method"));
      return;
    }
    const execute = async (): Promise<unknown> => method.handle(request.params, context);
    let result: unknown;
    try {
      if (request.method === "system.hello") {
        result = await execute();
      } else if (method.kind === "read") {
        await mutationLane;
        result = await execute();
      } else {
        const operation = mutationLane.then(execute, execute);
        mutationLane = operation.then(() => undefined, () => undefined);
        result = await operation;
      }
      await writer.write(createBridgeSuccess(request.id, result));
      if (request.method === "activity.subscribe") {
        const subscriptionId = (result as { subscriptionId: string }).subscriptionId;
        const subscription = activitySubscriptions.get(subscriptionId);
        if (subscription) subscription.ready = true;
      }
    } catch (error) {
      await sendFailure(request.id, error);
    }
  };

  const accept = (frame: Buffer): void => {
    if (closed) return;
    let request: ReturnType<typeof parseBridgeRequest>;
    try {
      request = parseBridgeRequest(frame);
    } catch (error) {
      void fatal(error);
      return;
    }
    if (liveIds.has(request.id)) {
      void fatal(new BridgeProtocolError("E_PROTOCOL_INVALID", "Duplicate live bridge request id"));
      return;
    }
    if (completedIds.has(request.id)) {
      void sendFailure(request.id, new BridgeProtocolError("E_PROTOCOL_INVALID", "Bridge request id was already completed"));
      return;
    }
    if (seenIds.size >= MAX_SEEN_IDS) {
      void fatal(new BridgeProtocolError("E_PROTOCOL_INVALID", "Bridge request id capacity is exhausted"));
      return;
    }
    seenIds.add(request.id);
    liveIds.add(request.id);
    const work = dispatch(request)
      .catch((error) => sendFailure(request.id, error))
      .finally(() => {
        liveIds.delete(request.id);
        completedIds.add(request.id);
        inFlight.delete(work);
        if (inFlight.size < MAX_IN_FLIGHT) {
          input.resume();
          drainFrames();
        }
      });
    inFlight.add(work);
    if (inFlight.size >= MAX_IN_FLIGHT) input.pause();
  };

  const drainFrames = (): void => {
    while (!closed && inFlight.size < MAX_IN_FLIGHT && queuedFrames.length > 0) {
      accept(queuedFrames.shift()!);
    }
  };

  const onData = (chunk: Buffer | string): void => {
    if (closed) return;
    let frames: Buffer[];
    try {
      frames = decoder.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    } catch (error) {
      void fatal(error);
      return;
    }
    queuedFrames.push(...frames);
    drainFrames();
    if (inFlight.size >= MAX_IN_FLIGHT) input.pause();
  };
  const onEnd = (): void => {
    try {
      decoder.end();
    } catch (error) {
      void fatal(error);
      return;
    }
    void (async () => {
      await Promise.allSettled([...inFlight]);
      if (queuedFrames.length > 0) {
        await fatal(new BridgeProtocolError("E_PROTOCOL_INVALID", "Bridge connection closed with pending requests"));
        return;
      }
      await finishConnection();
    })();
  };

  input.on("data", onData);
  input.once("end", onEnd);
  input.once("error", (error) => void fatal(error));
  const pollActivities = async (): Promise<void> => {
    if (closed || polling) return;
    polling = true;
    try {
      for (const [subscriptionId, subscription] of activitySubscriptions) {
        if (!subscription.ready) continue;
        const page = listGlobalActivity({ afterSequence: subscription.sequence, limit: 100 });
        for (const item of page.items) {
          if (closed) return;
          await writer.write({
            v: 1,
            event: "activity",
            subscriptionId,
            sequence: item.sequence,
            data: item,
          });
          subscription.sequence = item.sequence;
        }
      }
    } catch (error) {
      await fatal(error);
    } finally {
      polling = false;
    }
  };
  pollTimer = setInterval(() => void pollActivities(), 50);
  await new Promise<void>((resolve) => {
    const check = () => {
      if (resolving) resolve();
      else setTimeout(check, 5);
    };
    check();
  });
}
