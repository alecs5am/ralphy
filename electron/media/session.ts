import { MediaProtocolAccess } from "./protocol-access";
import { InvalidLibraryRootError } from "./catalog";
import type {
  CatalogProgress,
} from "./types";

export class StaleMediaSessionError extends Error {
  constructor() {
    super("Stale media session operation");
    this.name = "StaleMediaSessionError";
  }
}

export function createSingleFlight<Result>(): (
  start: () => Promise<Result>,
) => Promise<Result> {
  let pending: Promise<Result> | null = null;
  return (start) => {
    if (pending) return pending;
    const operation = start();
    pending = operation;
    const clear = () => {
      if (pending === operation) pending = null;
    };
    void operation.then(clear, clear);
    return operation;
  };
}

export interface MediaSessionEpoch {
  readonly epoch: number;
}

export interface ActiveMediaSession extends MediaSessionEpoch {
  readonly rootPath: string;
}

export class MediaSessionState {
  readonly fileAccess = new MediaProtocolAccess();
  #epoch = 0;
  #lastAllocatedEpoch = 0;
  #pendingOpenEpoch: number | null = null;
  #activeRoot: string | null = null;
  #catalogGeneration = 0;
  #catalogEpoch = 0;
  #catalogRoot: string | null = null;

  beginOpen(): MediaSessionEpoch {
    const operation = this.#advanceEpoch();
    this.#pendingOpenEpoch = operation.epoch;
    this.fileAccess.clear();
    return operation;
  }

  assertOpen(operation: MediaSessionEpoch): void {
    if (
      operation.epoch !== this.#epoch
      || operation.epoch !== this.#pendingOpenEpoch
    ) {
      throw new StaleMediaSessionError();
    }
  }

  assertCurrent(operation: MediaSessionEpoch): void {
    if (operation.epoch !== this.#epoch) throw new StaleMediaSessionError();
  }

  completeOpen(
    operation: MediaSessionEpoch,
    rootPath: string,
  ): ActiveMediaSession {
    this.assertOpen(operation);
    this.#activeRoot = rootPath;
    this.#pendingOpenEpoch = null;
    return { ...operation, rootPath };
  }

  abortOpen(operation: MediaSessionEpoch): void {
    if (
      operation.epoch === this.#epoch
      && operation.epoch === this.#pendingOpenEpoch
    ) {
      this.#advanceEpoch();
      this.#pendingOpenEpoch = null;
    }
  }

  activateRoot(rootPath: string): ActiveMediaSession {
    return this.completeOpen(this.beginOpen(), rootPath);
  }

  captureActive(expectedRoot?: string): ActiveMediaSession {
    if (this.#pendingOpenEpoch !== null || !this.#activeRoot) {
      throw new Error("No active .ralphy library");
    }
    if (expectedRoot && expectedRoot !== this.#activeRoot) {
      throw new StaleMediaSessionError();
    }
    return { epoch: this.#epoch, rootPath: this.#activeRoot };
  }

  assertActive(operation: ActiveMediaSession): void {
    if (
      operation.epoch !== this.#epoch
      || this.#pendingOpenEpoch !== null
      || operation.rootPath !== this.#activeRoot
    ) {
      throw new StaleMediaSessionError();
    }
  }

  requireRoot(): string {
    return this.captureActive().rootPath;
  }

  isActiveRoot(rootPath: string): boolean {
    return this.#pendingOpenEpoch === null && rootPath === this.#activeRoot;
  }

  beginCatalog(
    operation: MediaSessionEpoch | ActiveMediaSession,
    rootPath: string,
  ): number {
    this.#assertCatalogOperation(operation, rootPath);
    this.#catalogGeneration += 1;
    this.#catalogEpoch = operation.epoch;
    this.#catalogRoot = rootPath;
    return this.#catalogGeneration;
  }

  acceptCatalog(
    operation: MediaSessionEpoch | ActiveMediaSession,
    rootPath: string,
    generation: number,
  ): void {
    this.#assertCatalogOperation(operation, rootPath);
    if (
      generation !== this.#catalogGeneration
      || operation.epoch !== this.#catalogEpoch
      || rootPath !== this.#catalogRoot
    ) {
      throw new StaleMediaSessionError();
    }
  }

  isCurrentCatalogProgress(progress: CatalogProgress): boolean {
    return progress.generation === this.#catalogGeneration
      && this.#catalogEpoch === this.#epoch;
  }

  close(): void {
    this.#advanceEpoch();
    this.#pendingOpenEpoch = null;
    this.#activeRoot = null;
    this.fileAccess.clear();
  }

  #allocateEpoch(): MediaSessionEpoch {
    this.#lastAllocatedEpoch += 1;
    return { epoch: this.#lastAllocatedEpoch };
  }

  #advanceEpoch(): MediaSessionEpoch {
    const operation = this.#allocateEpoch();
    this.#epoch = operation.epoch;
    return operation;
  }

  #assertCatalogOperation(
    operation: MediaSessionEpoch | ActiveMediaSession,
    rootPath: string,
  ): void {
    if ("rootPath" in operation) {
      this.assertActive(operation);
      if (operation.rootPath !== rootPath) throw new StaleMediaSessionError();
    } else {
      this.assertOpen(operation);
    }
  }
}

export async function restorePersistedLibrary<Result>(
  state: MediaSessionState,
  operation: MediaSessionEpoch,
  readRoot: (assertCurrent: () => void) => Promise<string | null>,
  openLibrary: (
    operation: MediaSessionEpoch,
    rootPath: string,
  ) => Promise<Result>,
): Promise<Result | null> {
  try {
    const assertCurrent = (): void => state.assertOpen(operation);
    const rootPath = await readRoot(assertCurrent);
    assertCurrent();
    if (!rootPath) {
      state.abortOpen(operation);
      return null;
    }
    return await openLibrary(operation, rootPath);
  } catch (error) {
    state.assertCurrent(operation);
    state.abortOpen(operation);
    if (error instanceof StaleMediaSessionError) throw error;
    if (error instanceof InvalidLibraryRootError) return null;
    throw error;
  }
}

interface StartableResource {
  start(): Promise<boolean>;
  close(): void;
}

interface ResourceReplacement<Resource extends StartableResource, Result> {
  assertCurrent(): void;
  create(): Resource;
  prepare?(): Promise<void>;
  commit(): Result;
}

export class ActiveRootResource<Resource extends StartableResource> {
  #resource: Resource | null = null;
  #tail: Promise<void> = Promise.resolve();

  replace<Result>(
    replacement: ResourceReplacement<Resource, Result>,
  ): Promise<Result> {
    const operation = this.#tail.then(async () => {
      replacement.assertCurrent();
      const candidate = replacement.create();
      try {
        const started = await candidate.start();
        replacement.assertCurrent();
        if (!started) throw new StaleMediaSessionError();
        await replacement.prepare?.();
        replacement.assertCurrent();
        const previous = this.#resource;
        const result = replacement.commit();
        this.#resource = candidate;
        try {
          previous?.close();
        } catch {
          // The new resource and session are already committed.
        }
        return result;
      } catch (error) {
        try {
          candidate.close();
        } catch {
          // Preserve the startup or commit error.
        }
        throw error;
      }
    });
    this.#tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  close(): void {
    const resource = this.#resource;
    this.#resource = null;
    try {
      resource?.close();
    } catch {
      // Session invalidation remains authoritative during teardown.
    }
  }
}

export async function guardedResult<Result>(
  state: MediaSessionState,
  operation: ActiveMediaSession,
  run: () => Promise<Result>,
): Promise<Result> {
  state.assertActive(operation);
  const result = await run();
  state.assertActive(operation);
  return result;
}

export async function guardedSideEffect<Prepared, Result>(
  state: MediaSessionState,
  operation: ActiveMediaSession,
  prepare: () => Promise<Prepared>,
  sideEffect: (prepared: Prepared) => Result | Promise<Result>,
): Promise<Result> {
  state.assertActive(operation);
  const prepared = await prepare();
  state.assertActive(operation);
  const result = await sideEffect(prepared);
  state.assertActive(operation);
  return result;
}

interface ClosableWatcher {
  close(): void;
}

interface ClosableWorker {
  close(): void;
}

export function stopMediaRuntime(
  state: MediaSessionState,
  resources: {
    watcher?: ClosableWatcher | null;
    worker?: ClosableWorker | null;
  },
): void {
  state.close();
  resources.watcher?.close();
  resources.worker?.close();
}

interface EventWindow {
  isDestroyed(): boolean;
  webContents: {
    isDestroyed(): boolean;
    send(channel: string, payload: unknown): void;
  };
}

export function sendIfWindowAlive(
  window: EventWindow | null,
  channel: string,
  payload: unknown,
): boolean {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false;
  try {
    window.webContents.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}
