import { describe, expect, test, vi } from "vitest";
import { InvalidLibraryRootError } from "../electron/media/catalog";
import {
  ActiveRootResource,
  createSingleFlight,
  guardedResult,
  guardedSideEffect,
  MediaSessionState,
  restorePersistedLibrary,
  sendIfWindowAlive,
  StaleMediaSessionError,
  stopMediaRuntime,
} from "../electron/media/session";

function deferred<Value>(): {
  promise: Promise<Value>;
  resolve(value: Value): void;
} {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function resource(start: () => Promise<boolean> = async () => true): {
  start: ReturnType<typeof vi.fn<[], Promise<boolean>>>;
  close: ReturnType<typeof vi.fn<[], void>>;
} {
  return {
    start: vi.fn(start),
    close: vi.fn(),
  };
}

describe("single-flight operations", () => {
  test("shares one in-flight restore and allows a later retry", async () => {
    const run = createSingleFlight<number>();
    const pending = deferred<number>();
    const firstStart = vi.fn(() => pending.promise);
    const duplicateStart = vi.fn(async () => 99);

    const first = run(firstStart);
    const duplicate = run(duplicateStart);

    expect(duplicate).toBe(first);
    expect(firstStart).toHaveBeenCalledOnce();
    expect(duplicateStart).not.toHaveBeenCalled();

    pending.resolve(7);
    await expect(first).resolves.toBe(7);
    await expect(run(async () => 8)).resolves.toBe(8);
  });
});

describe("media session epochs", () => {
  test("rejects a delayed older open before it can replace a newer root", async () => {
    const state = new MediaSessionState();
    state.activateRoot("/tmp/previous/.ralphy");
    const firstValidation = deferred<string>();
    const firstOperation = state.beginOpen();
    const firstOpen = firstValidation.promise.then((root) => (
      state.completeOpen(firstOperation, root)
    ));

    const secondOperation = state.beginOpen();
    state.completeOpen(secondOperation, "/tmp/second/.ralphy");
    firstValidation.resolve("/tmp/first/.ralphy");

    await expect(firstOpen).rejects.toThrow(StaleMediaSessionError);
    expect(state.requireRoot()).toBe("/tmp/second/.ralphy");
  });

  test("rejects an old restore after a newer explicit open wins", async () => {
    const state = new MediaSessionState();
    state.activateRoot("/tmp/previous/.ralphy");
    const persistedRoot = deferred<string | null>();
    const restoringOperation = state.beginOpen();
    const openPersistedRoot = vi.fn(async (
      operation: typeof restoringOperation,
      rootPath: string,
    ) => state.completeOpen(operation, rootPath));
    const restoring = restorePersistedLibrary(
      state,
      restoringOperation,
      () => persistedRoot.promise,
      openPersistedRoot,
    );

    const openingOperation = state.beginOpen();
    state.completeOpen(openingOperation, "/tmp/new/.ralphy");
    persistedRoot.resolve("/tmp/old/.ralphy");

    await expect(restoring).rejects.toThrow(StaleMediaSessionError);
    expect(openPersistedRoot).not.toHaveBeenCalled();
    expect(state.requireRoot()).toBe("/tmp/new/.ralphy");
  });

  test("maps an invalid persisted library to an empty restore", async () => {
    const state = new MediaSessionState();
    state.activateRoot("/tmp/previous/.ralphy");
    const operation = state.beginOpen();
    const result = await restorePersistedLibrary(
      state,
      operation,
      async () => "/tmp/missing/.ralphy",
      async () => {
        throw new InvalidLibraryRootError(
          "Library root must contain a real workspaces directory",
        );
      },
    );

    expect(result).toBeNull();
    expect(state.requireRoot()).toBe("/tmp/previous/.ralphy");
  });

  test("does not hide an invalid-root failure from a superseded restore", async () => {
    const state = new MediaSessionState();
    state.activateRoot("/tmp/previous/.ralphy");
    const enteredValidation = deferred<void>();
    const validation = deferred<void>();
    const restoringOperation = state.beginOpen();
    const restoring = restorePersistedLibrary(
      state,
      restoringOperation,
      async () => "/tmp/missing/.ralphy",
      async () => {
        enteredValidation.resolve();
        await validation.promise;
        throw new InvalidLibraryRootError("Library root disappeared");
      },
    );

    await enteredValidation.promise;
    const explicitOperation = state.beginOpen();
    state.completeOpen(explicitOperation, "/tmp/new/.ralphy");
    validation.resolve();

    await expect(restoring).rejects.toThrow(StaleMediaSessionError);
    expect(state.requireRoot()).toBe("/tmp/new/.ralphy");
  });

  test("does not hide unexpected persisted library failures", async () => {
    const state = new MediaSessionState();
    const operation = state.beginOpen();
    const restoring = restorePersistedLibrary(
      state,
      operation,
      async () => "/tmp/current/.ralphy",
      async () => {
        throw new Error("media worker failed");
      },
    );

    await expect(restoring).rejects.toThrow("media worker failed");
  });

  test("invalidates a delayed open when runtime stop wins", () => {
    const state = new MediaSessionState();
    const root = "/tmp/current/.ralphy";
    state.activateRoot(root);
    const delayed = state.beginOpen();

    stopMediaRuntime(state, {});
    expect(() => state.completeOpen(delayed, root)).toThrow(StaleMediaSessionError);
    expect(() => state.requireRoot()).toThrow(/active/i);
  });

  test("invalidates active operations when reopening the same canonical root", () => {
    const state = new MediaSessionState();
    const root = "/tmp/current/.ralphy";
    const original = state.activateRoot(root);
    const reopened = state.beginOpen();

    const current = state.completeOpen(reopened, root);

    expect(() => state.assertActive(original)).toThrow(StaleMediaSessionError);
    expect(() => state.assertActive(current)).not.toThrow();
  });

  test("rejects a delayed result after switching to another root", async () => {
    const state = new MediaSessionState();
    state.activateRoot("/tmp/first/.ralphy");
    const operation = state.captureActive();
    const read = deferred<string>();
    const pending = guardedResult(state, operation, () => read.promise);

    state.activateRoot("/tmp/second/.ralphy");
    read.resolve("first-root data");

    await expect(pending).rejects.toThrow(StaleMediaSessionError);
  });

  test("blocks an irreversible side effect prepared for an inactive root", async () => {
    const state = new MediaSessionState();
    state.activateRoot("/tmp/first/.ralphy");
    const operation = state.captureActive();
    const resolution = deferred<string>();
    const sideEffect = vi.fn(async () => "opened");
    const pending = guardedSideEffect(
      state,
      operation,
      () => resolution.promise,
      sideEffect,
    );

    state.activateRoot("/tmp/second/.ralphy");
    resolution.resolve("/tmp/first/.ralphy/file.mp4");

    await expect(pending).rejects.toThrow(StaleMediaSessionError);
    expect(sideEffect).not.toHaveBeenCalled();
  });
});

describe("transactional active resources", () => {
  test("keeps the previous resource when candidate startup fails", async () => {
    const state = new MediaSessionState();
    const active = state.activateRoot("/tmp/current/.ralphy");
    const resources = new ActiveRootResource<ReturnType<typeof resource>>();
    const previous = resource();
    await resources.replace({
      assertCurrent: () => state.assertActive(active),
      create: () => previous,
      commit: () => "previous",
    });
    const candidate = resource(async () => {
      throw new Error("watch failed");
    });

    await expect(resources.replace({
      assertCurrent: () => state.assertActive(active),
      create: () => candidate,
      commit: () => "candidate",
    })).rejects.toThrow("watch failed");

    expect(candidate.close).toHaveBeenCalledOnce();
    expect(previous.close).not.toHaveBeenCalled();
    resources.close();
    expect(previous.close).toHaveBeenCalledOnce();
  });

  test("keeps the previous resource and session when settings commit fails", async () => {
    const state = new MediaSessionState();
    const root = "/tmp/current/.ralphy";
    const active = state.activateRoot(root);
    const resources = new ActiveRootResource<ReturnType<typeof resource>>();
    const previous = resource();
    await resources.replace({
      assertCurrent: () => state.assertActive(active),
      create: () => previous,
      commit: () => "previous",
    });
    const candidate = resource();
    const open = state.beginOpen();

    await expect(resources.replace({
      assertCurrent: () => state.assertOpen(open),
      create: () => candidate,
      prepare: async () => {
        throw new Error("settings failed");
      },
      commit: () => state.completeOpen(open, "/tmp/next/.ralphy"),
    })).rejects.toThrow("settings failed");
    state.abortOpen(open);

    expect(candidate.close).toHaveBeenCalledOnce();
    expect(previous.close).not.toHaveBeenCalled();
    expect(state.requireRoot()).toBe(root);
    resources.close();
    expect(previous.close).toHaveBeenCalledOnce();
  });
});

describe("media runtime teardown", () => {
  test("closes root resources and invalidates file access", () => {
    const state = new MediaSessionState();
    const root = "/tmp/current/.ralphy";
    state.activateRoot(root);
    const clearFileAccess = vi.spyOn(state.fileAccess, "clear");
    const watcher = { close: vi.fn() };
    const worker = { close: vi.fn() };

    stopMediaRuntime(state, { watcher, worker });

    expect(watcher.close).toHaveBeenCalledOnce();
    expect(worker.close).toHaveBeenCalledOnce();
    expect(clearFileAccess).toHaveBeenCalledOnce();
    expect(() => state.requireRoot()).toThrow(/active/i);
  });

  test("does not emit to a destroyed window or destroyed web contents", () => {
    const send = vi.fn();
    const destroyedWindow = {
      isDestroyed: () => true,
      webContents: { isDestroyed: () => false, send },
    };
    const destroyedContents = {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => true, send },
    };

    expect(sendIfWindowAlive(destroyedWindow, "media:event", {})).toBe(false);
    expect(sendIfWindowAlive(destroyedContents, "media:event", {})).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
