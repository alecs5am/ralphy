import { describe, expect, test, vi } from "vitest";
import type { RalphyBridgeClient } from "../electron/ralphy/client";

describe("Electron IPC security", () => {
  test("keeps root identity and activity refresh payloads numeric and private", async () => {
    const { applyActivityRefresh } = await import("../src/App") as {
      applyActivityRefresh(identity: unknown, event: unknown): unknown;
    };
    const identity = {
      storeId: "store-1",
      label: "Library",
      rootEpoch: 4,
      activitySequence: 10,
    };
    const refresh = {
      type: "activity-refresh",
      storeId: "store-1",
      rootEpoch: 4,
      sequence: 11,
    };

    expect(Object.keys(identity)).toEqual(["storeId", "label", "rootEpoch", "activitySequence"]);
    expect(Object.keys(refresh)).toEqual(["type", "storeId", "rootEpoch", "sequence"]);
    expect(JSON.stringify(refresh)).not.toMatch(/subscription|workspaceId|projectId|entity|action|payload|data|createdAt/i);
    expect(applyActivityRefresh(identity, refresh)).toEqual({ ...identity, activitySequence: 11 });
  });

  test("accepts only a strictly newer refresh from the active root binding", async () => {
    const { applyActivityRefresh } = await import("../src/App") as {
      applyActivityRefresh(identity: unknown, event: unknown): unknown;
    };
    const identity = {
      storeId: "store-1",
      label: "Library",
      rootEpoch: 4,
      activitySequence: 10,
    };

    expect(applyActivityRefresh(identity, { type: "activity-refresh", storeId: "store-1", rootEpoch: 4, sequence: 10 })).toBe(identity);
    expect(applyActivityRefresh(identity, { type: "activity-refresh", storeId: "store-1", rootEpoch: 4, sequence: 9 })).toBe(identity);
    expect(applyActivityRefresh(identity, { type: "activity-refresh", storeId: "store-old", rootEpoch: 4, sequence: 12 })).toBe(identity);
    expect(applyActivityRefresh(identity, { type: "activity-refresh", storeId: "store-1", rootEpoch: 3, sequence: 12 })).toBe(identity);
    expect(applyActivityRefresh(null, { type: "activity-refresh", storeId: "store-1", rootEpoch: 4, sequence: 12 })).toBeNull();
  });

  test("maps bridge codes without exposing unknown error messages", async () => {
    const security = await import("../electron/ipc-security").catch(() => ({}));

    expect(security).toHaveProperty("toIpcResult");
    const { toIpcResult } = security as {
      toIpcResult<T>(run: () => Promise<T>): Promise<unknown>;
    };
    await expect(toIpcResult(async () => {
      throw Object.assign(new Error("safe conflict"), { code: "E_CONFLICT" });
    })).resolves.toEqual({
      ok: false,
      error: { code: "E_CONFLICT", message: "safe conflict" },
    });
    await expect(toIpcResult(async () => {
      throw new Error("raw bridge stderr: token=secret");
    })).resolves.toEqual({
      ok: false,
      error: { code: "E_INTERNAL", message: "The operation could not be completed" },
    });
  });

  test("allows only the exact renderer URL or dev origin", async () => {
    const security = await import("../electron/ipc-security").catch(() => ({}));

    expect(security).toHaveProperty("isTrustedNavigation");
    const { isTrustedNavigation } = security as {
      isTrustedNavigation(target: string, renderer: string): boolean;
    };
    expect(isTrustedNavigation(
      "file:///Applications/Ralphy/dist/index.html#project",
      "file:///Applications/Ralphy/dist/index.html",
    )).toBe(true);
    expect(isTrustedNavigation(
      "file:///tmp/index.html",
      "file:///Applications/Ralphy/dist/index.html",
    )).toBe(false);
    expect(isTrustedNavigation(
      "http://localhost:5173/workspace",
      "http://localhost:5173",
    )).toBe(true);
    expect(isTrustedNavigation(
      "https://attacker.example/",
      "http://localhost:5173",
    )).toBe(false);
  });

  test("applies the exact renderer predicate to navigations and redirects", async () => {
    const security = await import("../electron/ipc-security").catch(() => ({}));
    expect(security).toHaveProperty("installNavigationGuards");
    const listeners = new Map<string, (event: { preventDefault(): void }, url: string) => void>();
    const webContents = {
      on(event: string, listener: (event: { preventDefault(): void }, url: string) => void) {
        listeners.set(event, listener);
      },
    };
    (security as {
      installNavigationGuards(contents: typeof webContents, rendererUrl: string): void;
    }).installNavigationGuards(webContents, "https://app.ralphy.test/workspace");

    expect([...listeners.keys()]).toEqual(["will-navigate", "will-redirect"]);
    for (const eventName of ["will-navigate", "will-redirect"]) {
      const preventDefault = vi.fn();
      listeners.get(eventName)?.(
        { preventDefault },
        "https://attacker.example/workspace",
      );
      expect(preventDefault).toHaveBeenCalledOnce();
    }
  });

  test("accepts only the active main frame and denies permissions", async () => {
    const security = await import("../electron/ipc-security");
    const mainFrame = {};
    const webContents = { mainFrame };
    const window = { isDestroyed: () => false, webContents };

    expect(() => security.assertTrustedSender({
      sender: webContents,
      senderFrame: mainFrame,
    }, window)).not.toThrow();
    expect(() => security.assertTrustedSender({
      sender: webContents,
      senderFrame: {},
    }, window)).toThrow("Untrusted");
    expect(security).toHaveProperty("denyPermissionRequest");
    const callback = vi.fn();
    (security as typeof security & {
      denyPermissionRequest(
        webContents: unknown,
        permission: string,
        callback: (allowed: boolean) => void,
      ): void;
    }).denyPermissionRequest(webContents, "camera", callback);
    expect(callback).toHaveBeenCalledWith(false);
  });

  test("creates sandboxed isolated renderer preferences", async () => {
    const security = await import("../electron/ipc-security");
    expect(security).toHaveProperty("secureWebPreferences");
    const preferences = (security as typeof security & {
      secureWebPreferences(preload: string): Record<string, unknown>;
    }).secureWebPreferences("/app/preload.cjs");

    expect(preferences).toEqual({
      preload: "/app/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });

  test("preload exposes an explicit method allowlist", async () => {
    vi.resetModules();
    let exposed: unknown;
    const invoke = vi.fn(async () => ({ ok: true, value: undefined }));
    const send = vi.fn();
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld(_name: string, value: unknown) {
          exposed = value;
        },
      },
      ipcRenderer: {
        invoke,
        send,
        on: vi.fn(),
        removeListener: vi.fn(),
      },
    }));

    await import("../electron/preload");

    expect(exposed).toBeTypeOf("object");
    expect(Object.keys(exposed as object)).not.toContain("request");
    expect(Object.keys(exposed as object)).toEqual(expect.arrayContaining([
      "restoreLibrary",
      "chooseLibrary",
      "loadWorkspaceOverview",
      "loadProjectOverview",
      "loadProjectPage",
      "loadProjectGeneration",
      "loadProjectMediaRevisions",
      "selectProjectMediaRevision",
      "loadDocumentPreview",
      "resolveProjectPreview",
      "loadProjectComposition",
      "reviseProjectComposition",
      "selectProjectCompositionRevision",
      "buildProjectComposition",
      "resolveCompositionOutputPreview",
      "copyMigrationRecoveryCommand",
      "sendAgentMessage",
      "createTerminal",
    ]));
    const bridge = exposed as {
      startFileDrag(path: string): Promise<void>;
      loadWorkspaceOverview(workspaceId: string): Promise<void>;
      loadProjectOverview(project: { workspaceId: string; projectId: string }): Promise<void>;
      loadProjectGeneration(project: { workspaceId: string; projectId: string }, target: { type: "artifact-revision"; id: string }, after?: string): Promise<void>;
      loadProjectMediaRevisions(project: { workspaceId: string; projectId: string }, artifactId: string, after?: string): Promise<void>;
      selectProjectMediaRevision(project: { workspaceId: string; projectId: string }, artifactId: string, revisionId: string, expectedSelectedRevisionId: string | null): Promise<void>;
      loadProjectComposition(project: { workspaceId: string; projectId: string }, compositionId: string): Promise<void>;
      buildProjectComposition(project: { workspaceId: string; projectId: string }, revisionId: string): Promise<void>;
      resolveCompositionOutputPreview(project: { workspaceId: string; projectId: string }, revisionId: string): Promise<void>;
      writeTerminal(sessionId: string, data: string): Promise<void>;
      resizeTerminal(sessionId: string, dimensions: { cols: number; rows: number }): Promise<void>;
    };
    await bridge.startFileDrag("/library/video.mp4");
    await bridge.loadWorkspaceOverview("workspace-1");
    await bridge.loadProjectOverview({ workspaceId: "workspace-1", projectId: "project-1" });
    await bridge.loadProjectGeneration({ workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact-revision", id: "revision-1" }, "generation-next");
    await bridge.loadProjectMediaRevisions({ workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-next");
    await bridge.selectProjectMediaRevision({ workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-1", null);
    await bridge.loadProjectComposition({ workspaceId: "workspace-1", projectId: "project-1" }, "composition-1");
    await bridge.buildProjectComposition({ workspaceId: "workspace-1", projectId: "project-1" }, "revision-1");
    await bridge.resolveCompositionOutputPreview({ workspaceId: "workspace-1", projectId: "project-1" }, "artifact-revision-1");
    await bridge.writeTerminal("terminal-1", "ls\n");
    await bridge.resizeTerminal("terminal-1", { cols: 80, rows: 24 });
    expect(invoke.mock.calls).toEqual(expect.arrayContaining([
      ["media:files:drag", "/library/video.mp4"],
      ["workspace:overview", "workspace-1"],
      ["project:overview", { workspaceId: "workspace-1", projectId: "project-1" }],
      ["project:media:generation", { workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact-revision", id: "revision-1" }, "generation-next"],
      ["project:media:revisions", { workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-next"],
      ["project:media:select", { workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-1", null],
      ["project:composition:show", { workspaceId: "workspace-1", projectId: "project-1" }, "composition-1"],
      ["project:composition:build", { workspaceId: "workspace-1", projectId: "project-1" }, "revision-1", undefined],
      ["project:composition:output-preview", { workspaceId: "workspace-1", projectId: "project-1" }, "artifact-revision-1"],
      ["terminal:write", "terminal-1", "ls\n"],
      ["terminal:resize", "terminal-1", { cols: 80, rows: 24 }],
    ]));
    expect(send).not.toHaveBeenCalled();
  });

  test("registered Workspace overview IPC validates, trusts, and rejects stale roots", async () => {
    const workspaceReader = await import("../electron/ralphy/workspace-reader") as Record<string, unknown>;
    expect(workspaceReader.registerWorkspaceOverviewIpc).toBeTypeOf("function");
    const register = workspaceReader.registerWorkspaceOverviewIpc as (input: Record<string, unknown>) => void;
    let handler!: (event: unknown, workspaceId: unknown) => Promise<unknown>;
    const mainFrame = {};
    const webContents = { mainFrame };
    const window = { isDestroyed: () => false, webContents };
    let epoch = 1;
    let resolve!: (value: unknown) => void;
    const response = new Promise((yes) => { resolve = yes; });
    const firstRequest = vi.fn(() => response);
    const nextOverview = {
      workspace: {
        id: "workspace-1", slug: "launch", name: "Launch", rowVersion: 1,
        createdAt: 1, updatedAt: 2,
      },
    };
    const secondRequest = vi.fn(async () => nextOverview);
    let activeRequest: RalphyBridgeClient["request"] | null = null;
    const session = {
      get client() {
        if (!activeRequest) throw new Error("No active Ralphy root");
        return { request: activeRequest };
      },
    };

    expect(() => register({
      handle(channel: string, listener: typeof handler) {
        expect(channel).toBe("workspace:overview");
        handler = listener;
      },
      getWindow: () => window,
      captureRoot: () => ({ epoch }),
      assertRoot: (binding: { epoch: number }) => {
        if (binding.epoch !== epoch) throw new Error("stale root");
      },
      session,
    })).not.toThrow();

    await expect(handler({ sender: webContents, senderFrame: {} }, "workspace-1")).resolves.toEqual({
      ok: false, error: { code: "E_INTERNAL", message: "The operation could not be completed" },
    });
    await expect(handler({ sender: webContents, senderFrame: mainFrame }, "")).resolves.toEqual({
      ok: false, error: { code: "E_INTERNAL", message: "The operation could not be completed" },
    });
    expect(firstRequest).not.toHaveBeenCalled();

    activeRequest = firstRequest as unknown as RalphyBridgeClient["request"];
    const pending = handler({ sender: webContents, senderFrame: mainFrame }, "workspace-1");
    await vi.waitFor(() => expect(firstRequest).toHaveBeenCalledOnce());
    epoch = 2;
    activeRequest = secondRequest as unknown as RalphyBridgeClient["request"];
    resolve({ workspace: { id: "workspace-1", slug: "launch", name: "Launch", rowVersion: 1, createdAt: 1, updatedAt: 2 } });
    await expect(pending).resolves.toEqual({
      ok: false, error: { code: "E_INTERNAL", message: "The operation could not be completed" },
    });
    await expect(handler(
      { sender: webContents, senderFrame: mainFrame },
      "workspace-1",
    )).resolves.toEqual({ ok: true, value: nextOverview });
    expect(secondRequest).toHaveBeenCalledOnce();
  });

  test("registered Project media IPC enforces sender, input, and root fences", async () => {
    const projectReader = await import("../electron/ralphy/project-reader") as Record<string, unknown>;
    expect(projectReader.registerProjectMediaIpc).toBeTypeOf("function");
    const register = projectReader.registerProjectMediaIpc as (input: Record<string, unknown>) => void;
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
    const mainFrame = {};
    const webContents = { mainFrame };
    const window = { isDestroyed: () => false, webContents };
    let epoch = 1;
    let resolve!: (value: unknown) => void;
    const response = new Promise((yes) => { resolve = yes; });
    const request = vi.fn(() => response);
    const session = { client: { request } };

    register({
      handle(channel: string, listener: (event: unknown, ...args: unknown[]) => Promise<unknown>) {
        handlers.set(channel, listener);
      },
      getWindow: () => window,
      captureRoot: () => ({ epoch }),
      assertRoot: (binding: { epoch: number }) => {
        if (binding.epoch !== epoch) throw new Error("stale root");
      },
      session,
    });

    expect([...handlers.keys()]).toEqual([
      "project:media:generation", "project:media:revisions", "project:media:select",
    ]);
    const generation = handlers.get("project:media:generation")!;
    const revisions = handlers.get("project:media:revisions")!;
    const select = handlers.get("project:media:select")!;
    const trusted = { sender: webContents, senderFrame: mainFrame };

    await expect(generation(
      { sender: webContents, senderFrame: {} },
      { workspaceId: "workspace-1", projectId: "project-1" },
      { type: "artifact-revision", id: "revision-1" },
      undefined,
    )).resolves.toMatchObject({ ok: false });
    for (const call of [
      () => generation(trusted, { workspaceId: "", projectId: "project-1" }, { type: "artifact-revision", id: "revision-1" }, undefined),
      () => generation(trusted, { workspaceId: "workspace-1", projectId: "project-1" }, { type: "object", id: "object-1" }, undefined),
      () => generation(trusted, { workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact-revision", id: "revision-1" }, 1),
      () => revisions(trusted, { workspaceId: "workspace-1", projectId: "project-1" }, "", undefined),
      () => select(trusted, { workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-1", undefined),
    ]) await expect(call()).resolves.toMatchObject({ ok: false });
    expect(request).not.toHaveBeenCalled();

    const pending = generation(
      trusted,
      { workspaceId: "workspace-1", projectId: "project-1" },
      { type: "artifact-revision", id: "revision-1" },
      undefined,
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    epoch = 2;
    resolve({
      status: "unknown",
      target: { type: "artifact-revision", id: "revision-1" },
      reason: "not-recorded",
    });
    await expect(pending).resolves.toMatchObject({ ok: false });
  });

  test("never enables renderer mocks in production without an explicit flag", async () => {
    const ipc = await import("../src/lib/ipc");
    expect(ipc).toHaveProperty("mockBridgeAllowed");
    const { mockBridgeAllowed } = ipc as typeof ipc & {
      mockBridgeAllowed(environment: Record<string, string | boolean | undefined>): boolean;
    };

    expect(mockBridgeAllowed({ MODE: "production" })).toBe(false);
    expect(mockBridgeAllowed({ MODE: "development" })).toBe(false);
    expect(mockBridgeAllowed({
      MODE: "production",
      VITE_RALPHY_ENABLE_MOCKS: "true",
    })).toBe(true);
    expect(mockBridgeAllowed({ MODE: "test" })).toBe(true);
  });
});
