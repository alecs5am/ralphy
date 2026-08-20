import { describe, expect, test, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, readFile, realpath, rm, stat, symlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import type { RalphyBridgeClient } from "../electron/ralphy/client";
import { MediaProtocolAccess } from "../electron/media/protocol-access";
import { makeLibraryFixture } from "./fixtures";

describe("Electron IPC security", () => {
  test("validates Local Models provider requests before network access", async () => {
    const localModels = await import("../electron/local-models") as typeof import("../electron/local-models") & {
      parseLocalModelSearchInput(value: unknown): unknown;
      parseLocalModelReference(value: unknown): unknown;
      parseLocalModelProviderUrl(value: unknown): string;
    };

    expect(localModels.parseLocalModelSearchInput({ query: " qwen ", provider: "huggingface", sort: "comfort", limit: 8 }))
      .toEqual({ query: "qwen", provider: "huggingface", sort: "comfort", limit: 8 });
    expect(localModels.parseLocalModelReference({ provider: "civitai", id: "123" }))
      .toEqual({ provider: "civitai", id: "123" });
    expect(localModels.parseLocalModelProviderUrl("https://huggingface.co/Qwen/model"))
      .toBe("https://huggingface.co/Qwen/model");
    for (const invalid of [
      { query: "x".repeat(257) },
      { provider: "evil" },
      { sort: "best" },
      { limit: 0 },
      { unexpected: true },
    ]) expect(() => localModels.parseLocalModelSearchInput(invalid)).toThrow("Invalid Local Models search");
    expect(() => localModels.parseLocalModelReference({ provider: "huggingface", id: "../token" })).toThrow("Invalid model reference");
    expect(() => localModels.parseLocalModelProviderUrl("file:///Users/demo/.ssh/id_rsa")).toThrow("Invalid provider URL");
  });

  test("documents workbench production search validates sender, query, scope, cursor, and stale root", async () => {
    const { registerProjectMediaIpc } = await import("../electron/ralphy/project-reader");
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<any>>();
    const mainFrame = {};
    const webContents = { mainFrame };
    const window = { isDestroyed: () => false, webContents };
    const project = { workspaceId: "workspace-1", projectId: "project-1" };
    const result = {
      documentId: "document-1", revisionId: "revision-1", workspaceId: "workspace-1", projectId: "project-1",
      kind: "brief", slug: "brief", documentTitle: "Brief", revisionNo: 1, parentRevisionId: null,
      iterationId: null, format: "markdown", title: null, authoredBySessionId: null, createdAt: 1,
    };
    let epoch = 1;
    let mode: "valid" | "sibling" | "stale" = "valid";
    const request = vi.fn(async () => {
      if (mode === "stale") epoch += 1;
      return { items: [{ ...result, ...(mode === "sibling" ? { projectId: "project-2" } : {}) }], nextCursor: "next" };
    });
    registerProjectMediaIpc({
      handle(channel, listener) { handlers.set(channel, listener); },
      getWindow: () => window,
      captureRoot: () => ({ epoch }),
      assertRoot: (root) => { if (root.epoch !== epoch) throw new Error("stale root"); },
      session: { client: { request: request as RalphyBridgeClient["request"] } },
      authorizeTrustedLocator: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn(), writeBuffer: vi.fn(),
    });

    const search = handlers.get("project:documents:search");
    expect(search).toBeTypeOf("function");
    if (!search) return;
    const trusted = { sender: webContents, senderFrame: mainFrame };
    await expect(search(trusted, project, "c++ -draft NOT", "opaque-after")).resolves.toEqual({
      ok: true, value: { items: [result], nextCursor: "next" },
    });
    expect(request).toHaveBeenCalledWith("document.search", {
      context: project, query: "c++ -draft NOT", after: "opaque-after", limit: 50,
    });

    const utf8Boundary = `  ${"é".repeat(512)}  `;
    request.mockClear();
    await expect(search(trusted, project, utf8Boundary, null)).resolves.toMatchObject({ ok: true });
    expect(request).toHaveBeenCalledWith("document.search", {
      context: project, query: utf8Boundary, limit: 50,
    });

    request.mockClear();
    await expect(search(trusted, project, "é".repeat(513), null)).resolves.toEqual({
      ok: false,
      error: {
        code: "E_VALIDATION_FAILED",
        message: "Document search query must be 1–1,024 UTF-8 bytes after trimming.",
      },
    });
    await expect(search(trusted, project, "é".repeat(513), null)).resolves.not.toMatchObject({
      error: { message: "The operation could not be completed" },
    });
    for (const call of [
      () => search({ sender: webContents, senderFrame: {} }, project, "launch", null),
      () => search(trusted, { workspaceId: "", projectId: "project-1" }, "launch", null),
      () => search(trusted, project, "", null),
      () => search(trusted, project, "launch", 1),
      () => search(trusted, project, "launch", "x".repeat(4097)),
    ]) await expect(call()).resolves.toMatchObject({ ok: false });
    expect(request).not.toHaveBeenCalled();

    mode = "sibling";
    await expect(search(trusted, project, "launch", null)).resolves.toMatchObject({ ok: false });
    mode = "stale";
    epoch = 1;
    await expect(search(trusted, project, "launch", null)).resolves.toMatchObject({ ok: false });
  });

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
    expect(Object.keys(exposed as object)).not.toContain("chooseLibrary");
    expect(Object.keys(exposed as object)).toEqual(expect.arrayContaining([
      "restoreLibrary",
      "loadMarketplacePublicLibrary",
      "loadWorkspaceOverview",
      "loadSharedLibraryPage",
      "loadSharedLibraryArtifact",
      "loadSharedLibraryRevisions",
      "selectSharedLibraryRevision",
      "resolveSharedLibraryPreview",
      "performSharedLibraryAction",
      "loadProjectOverview",
      "loadProjectPage",
      "loadProjectActivityRun",
      "loadProjectMediaCard",
      "loadProjectGeneration",
      "loadProjectMediaRevisions",
      "selectProjectMediaRevision",
      "performProjectMediaAction",
      "loadDocumentPreview",
      "resolveProjectPreview",
      "loadProjectComposition",
      "loadProjectCompositionRevision",
      "loadProjectCompositionBuild",
      "loadProjectCompositionPage",
      "reviseProjectComposition",
      "selectProjectCompositionRevision",
      "buildProjectComposition",
      "resolveCompositionOutputPreview",
      "loadProjectUnit",
      "loadProjectUnitRevision",
      "loadProjectUnitPage",
      "selectProjectUnitRevision",
      "copyMigrationRecoveryCommand",
      "sendAgentMessage",
      "createTerminal",
      "searchLocalModels",
      "loadLocalModelDetail",
      "refreshLocalModelMachine",
      "openLocalModelProvider",
    ]));
    expect(Object.keys(exposed as object).filter((name) => name === "performProjectMediaAction")).toHaveLength(1);
    const bridge = exposed as {
      startFileDrag(path: string): Promise<void>;
      loadMarketplacePublicLibrary(): Promise<void>;
      loadWorkspaceOverview(workspaceId: string): Promise<void>;
      loadSharedLibraryPage(workspaceId: string, query?: { after?: string | null; mediaKind?: "image"; provenance?: "generation" }): Promise<void>;
      loadSharedLibraryArtifact(workspaceId: string, artifactId: string): Promise<void>;
      loadSharedLibraryRevisions(workspaceId: string, artifactId: string, after?: string): Promise<void>;
      selectSharedLibraryRevision(workspaceId: string, artifactId: string, revisionId: string, expectedSelectedRevisionId: string | null): Promise<void>;
      resolveSharedLibraryPreview(workspaceId: string, artifactId: string): Promise<void>;
      performSharedLibraryAction(workspaceId: string, artifactId: string, action: "open" | "finder"): Promise<void>;
      loadProjectOverview(project: { workspaceId: string; projectId: string }): Promise<void>;
      loadProjectActivityRun(project: { workspaceId: string; projectId: string }, runId: string): Promise<void>;
      loadProjectMediaCard(project: { workspaceId: string; projectId: string }, ref: { type: "artifact"; id: string }): Promise<void>;
      loadProjectGeneration(project: { workspaceId: string; projectId: string }, target: { type: "artifact-revision"; id: string }, after?: string): Promise<void>;
      loadProjectMediaRevisions(project: { workspaceId: string; projectId: string }, artifactId: string, after?: string): Promise<void>;
      selectProjectMediaRevision(project: { workspaceId: string; projectId: string }, artifactId: string, revisionId: string, expectedSelectedRevisionId: string | null): Promise<void>;
      performProjectMediaAction(project: { workspaceId: string; projectId: string }, ref: { type: "artifact"; id: string }, action: "copy"): Promise<void>;
      loadProjectComposition(project: { workspaceId: string; projectId: string }, compositionId: string): Promise<void>;
      loadProjectCompositionRevision(project: { workspaceId: string; projectId: string }, revisionId: string): Promise<void>;
      loadProjectCompositionBuild(project: { workspaceId: string; projectId: string }, buildId: string): Promise<void>;
      loadProjectCompositionPage(project: { workspaceId: string; projectId: string }, request: { kind: "revisions"; compositionId: string; cursor?: string }): Promise<void>;
      buildProjectComposition(project: { workspaceId: string; projectId: string }, revisionId: string): Promise<void>;
      resolveCompositionOutputPreview(project: { workspaceId: string; projectId: string }, revisionId: string): Promise<void>;
      loadProjectUnit(project: { workspaceId: string; projectId: string }, unitId: string): Promise<void>;
      loadProjectUnitRevision(project: { workspaceId: string; projectId: string }, unitId: string, revisionId: string): Promise<void>;
      loadProjectUnitPage(project: { workspaceId: string; projectId: string }, request: { kind: "revisions"; unitId: string; cursor?: string }): Promise<void>;
      selectProjectUnitRevision(project: { workspaceId: string; projectId: string }, unitId: string, revisionId: string, expectedSelectedRevisionId: string | null): Promise<void>;
      writeTerminal(sessionId: string, data: string): Promise<void>;
      resizeTerminal(sessionId: string, dimensions: { cols: number; rows: number }): Promise<void>;
      searchLocalModels(input: { query: string; provider: "huggingface" }): Promise<void>;
      loadLocalModelDetail(ref: { provider: "huggingface"; id: string }): Promise<void>;
      refreshLocalModelMachine(): Promise<void>;
      openLocalModelProvider(url: string): Promise<void>;
    };
    await bridge.startFileDrag("/library/video.mp4");
    await bridge.loadMarketplacePublicLibrary();
    await bridge.loadWorkspaceOverview("workspace-1");
    await bridge.loadSharedLibraryPage("workspace-1", { after: "shared-next", mediaKind: "image", provenance: "generation" });
    await bridge.loadSharedLibraryArtifact("workspace-1", "artifact-1");
    await bridge.loadSharedLibraryRevisions("workspace-1", "artifact-1", "revision-next");
    await bridge.selectSharedLibraryRevision("workspace-1", "artifact-1", "revision-1", null);
    await bridge.resolveSharedLibraryPreview("workspace-1", "artifact-1");
    await bridge.performSharedLibraryAction("workspace-1", "artifact-1", "finder");
    await bridge.loadProjectOverview({ workspaceId: "workspace-1", projectId: "project-1" });
    await bridge.loadProjectActivityRun({ workspaceId: "workspace-1", projectId: "project-1" }, "run-1");
    await bridge.loadProjectMediaCard({ workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact", id: "artifact-1" });
    await bridge.loadProjectGeneration({ workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact-revision", id: "revision-1" }, "generation-next");
    await bridge.loadProjectMediaRevisions({ workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-next");
    await bridge.selectProjectMediaRevision({ workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-1", null);
    await bridge.performProjectMediaAction({ workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact", id: "artifact-1" }, "copy");
    await bridge.loadProjectComposition({ workspaceId: "workspace-1", projectId: "project-1" }, "composition-1");
    await bridge.loadProjectCompositionRevision({ workspaceId: "workspace-1", projectId: "project-1" }, "revision-1");
    await bridge.loadProjectCompositionBuild({ workspaceId: "workspace-1", projectId: "project-1" }, "build-1");
    await bridge.loadProjectCompositionPage({ workspaceId: "workspace-1", projectId: "project-1" }, { kind: "revisions", compositionId: "composition-1", cursor: "composition-next" });
    await bridge.buildProjectComposition({ workspaceId: "workspace-1", projectId: "project-1" }, "revision-1");
    await bridge.resolveCompositionOutputPreview({ workspaceId: "workspace-1", projectId: "project-1" }, "artifact-revision-1");
    await bridge.loadProjectUnit({ workspaceId: "workspace-1", projectId: "project-1" }, "unit-1");
    await bridge.loadProjectUnitRevision({ workspaceId: "workspace-1", projectId: "project-1" }, "unit-1", "unit-revision-1");
    await bridge.loadProjectUnitPage({ workspaceId: "workspace-1", projectId: "project-1" }, { kind: "revisions", unitId: "unit-1", cursor: "unit-next" });
    await bridge.selectProjectUnitRevision({ workspaceId: "workspace-1", projectId: "project-1" }, "unit-1", "unit-revision-1", null);
    await bridge.writeTerminal("terminal-1", "ls\n");
    await bridge.resizeTerminal("terminal-1", { cols: 80, rows: 24 });
    await bridge.searchLocalModels({ query: "qwen", provider: "huggingface" });
    await bridge.loadLocalModelDetail({ provider: "huggingface", id: "Qwen/model" });
    await bridge.refreshLocalModelMachine();
    await bridge.openLocalModelProvider("https://huggingface.co/Qwen/model");
    expect(invoke.mock.calls).toEqual(expect.arrayContaining([
      ["media:files:drag", "/library/video.mp4"],
      ["marketplace:public-library:load"],
      ["workspace:overview", "workspace-1"],
      ["workspace:shared-library:page", "workspace-1", { after: "shared-next", mediaKind: "image", provenance: "generation" }],
      ["workspace:shared-library:show", "workspace-1", "artifact-1"],
      ["workspace:shared-library:revisions", "workspace-1", "artifact-1", "revision-next"],
      ["workspace:shared-library:select", "workspace-1", "artifact-1", "revision-1", null],
      ["workspace:shared-library:preview", "workspace-1", "artifact-1"],
      ["workspace:shared-library:action", "workspace-1", "artifact-1", "finder"],
      ["project:overview", { workspaceId: "workspace-1", projectId: "project-1" }],
      ["project:activity:run", { workspaceId: "workspace-1", projectId: "project-1" }, "run-1"],
      ["project:media:show", { workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact", id: "artifact-1" }],
      ["project:media:generation", { workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact-revision", id: "revision-1" }, "generation-next"],
      ["project:media:revisions", { workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-next"],
      ["project:media:select", { workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-1", null],
      ["project:media:action", { workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact", id: "artifact-1" }, "copy"],
      ["project:composition:show", { workspaceId: "workspace-1", projectId: "project-1" }, "composition-1"],
      ["project:composition:revision:show", { workspaceId: "workspace-1", projectId: "project-1" }, "revision-1"],
      ["project:composition:build:show", { workspaceId: "workspace-1", projectId: "project-1" }, "build-1"],
      ["project:composition:page", { workspaceId: "workspace-1", projectId: "project-1" }, { kind: "revisions", compositionId: "composition-1", cursor: "composition-next" }],
      ["project:composition:build", { workspaceId: "workspace-1", projectId: "project-1" }, "revision-1", undefined],
      ["project:composition:output-preview", { workspaceId: "workspace-1", projectId: "project-1" }, "artifact-revision-1"],
      ["project:unit:show", { workspaceId: "workspace-1", projectId: "project-1" }, "unit-1"],
      ["project:unit:revision:show", { workspaceId: "workspace-1", projectId: "project-1" }, "unit-1", "unit-revision-1"],
      ["project:unit:page", { workspaceId: "workspace-1", projectId: "project-1" }, { kind: "revisions", unitId: "unit-1", cursor: "unit-next" }],
      ["project:unit:select", { workspaceId: "workspace-1", projectId: "project-1" }, "unit-1", "unit-revision-1", null],
      ["models:search", { query: "qwen", provider: "huggingface" }],
      ["models:detail", { provider: "huggingface", id: "Qwen/model" }],
      ["models:machine"],
      ["models:open-provider", "https://huggingface.co/Qwen/model"],
      ["terminal:write", "terminal-1", "ls\n"],
      ["terminal:resize", "terminal-1", { cols: 80, rows: 24 }],
    ]));
    expect(send).not.toHaveBeenCalled();
    const preloadSource = await readFile(fileURLToPath(new URL("../electron/preload.ts", import.meta.url)), "utf8");
    expect(preloadSource).not.toMatch(/absolutePath|\bbucket\b|object path/i);
  });

  test("registered Marketplace catalog IPC accepts no renderer input and rejects untrusted or stale roots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ralphy-marketplace-ipc-"));
    try {
      const { registerMarketplaceLibraryIpc } = await import("../electron/marketplace-library");
      let handler!: (event: unknown, ...args: unknown[]) => Promise<any>;
      const mainFrame = {};
      const webContents = { mainFrame };
      const window = { isDestroyed: () => false, webContents };
      let epoch = 1;
      let stale = false;
      const fetcher = vi.fn(async () => {
        if (stale) epoch += 1;
        const result = new Response(JSON.stringify({
          schemaVersion: 1,
          blocks: [{ kind: "template", id: "safe", name: "Safe", blurb: "Safe" }],
        }), { headers: { "content-type": "application/json" } });
        Object.defineProperty(result, "url", { value: "https://ralphy.b-cdn.net/library/library.json" });
        return result;
      }) as unknown as typeof fetch;

      registerMarketplaceLibraryIpc({
        handle(channel, listener) {
          expect(channel).toBe("marketplace:public-library:load");
          handler = listener;
        },
        getWindow: () => window,
        captureRoot: () => ({ epoch }),
        assertRoot: (root) => { if (root.epoch !== epoch) throw new Error("stale root"); },
        fetcher,
        cachePath: join(directory, "catalog.json"),
        now: () => 1_787_200_000_000,
      });

      const trusted = { sender: webContents, senderFrame: mainFrame };
      await expect(handler({ sender: webContents, senderFrame: {} })).resolves.toMatchObject({ ok: false });
      await expect(handler(trusted, "https://evil.example/library.json")).resolves.toMatchObject({ ok: false });
      expect(fetcher).not.toHaveBeenCalled();

      await expect(handler(trusted)).resolves.toMatchObject({
        ok: true,
        value: { source: "live", items: [{ id: "safe", category: "template" }] },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);

      stale = true;
      epoch = 1;
      await expect(handler(trusted)).resolves.toEqual({
        ok: false,
        error: { code: "E_INTERNAL", message: "The operation could not be completed" },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("mock Marketplace bridge reports the catalog unavailable instead of inventing source evidence", async () => {
    const { bridge } = await import("../src/lib/ipc");
    await expect(bridge.loadMarketplacePublicLibrary()).rejects.toThrow(
      "Marketplace public catalog is unavailable in mock mode",
    );
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
      authorizeTrustedLocator: vi.fn(),
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
      writeBuffer: vi.fn(),
    });

    expect([...handlers.keys()]).toEqual([
      "project:media:generation", "project:media:show", "project:media:revisions", "project:media:select", "project:media:action",
      "project:documents:search",
      "project:composition:show", "project:composition:revision:show", "project:composition:build:show", "project:composition:page",
      "project:unit:show", "project:unit:revision:show", "project:unit:page", "project:unit:preview", "project:unit:select",
    ]);
    const generation = handlers.get("project:media:generation")!;
    const show = handlers.get("project:media:show")!;
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
      () => show(trusted, { workspaceId: "workspace-1", projectId: "project-1" }, { type: "artifact", id: "", extra: true }),
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

  test("registered Project media IPC fences each settled Core request", async () => {
    const { registerProjectMediaIpc } = await import("../electron/ralphy/project-reader");
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
    const mainFrame = {};
    const webContents = { mainFrame };
    const window = { isDestroyed: () => false, webContents };
    const assertRoot = vi.fn();
    const value = {
      status: "unknown" as const,
      target: { type: "artifact-revision" as const, id: "revision-1" },
      reason: "not-recorded",
    };
    registerProjectMediaIpc({
      handle(channel, listener) { handlers.set(channel, listener); },
      getWindow: () => window,
      captureRoot: () => ({ epoch: 1 }),
      assertRoot,
      session: { client: { request: vi.fn(async () => value) as RalphyBridgeClient["request"] } },
      authorizeTrustedLocator: vi.fn(),
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
      writeBuffer: vi.fn(),
    });

    await expect(handlers.get("project:media:generation")!(
      { sender: webContents, senderFrame: mainFrame },
      { workspaceId: "workspace-1", projectId: "project-1" },
      value.target,
      undefined,
    )).resolves.toEqual({ ok: true, value });
    expect(assertRoot).toHaveBeenCalledTimes(4);
  });

  test("composition production registrar validates closed pages, parent scope, sender, and root", async () => {
    const { registerProjectMediaIpc } = await import("../electron/ralphy/project-reader");
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<any>>();
    const mainFrame = {};
    const webContents = { mainFrame };
    const window = { isDestroyed: () => false, webContents };
    const project = { workspaceId: "workspace-1", projectId: "project-1" };
    let epoch = 1;
    let sibling = false;
    const request = vi.fn(async (method: string) => method === "composition.revisions" ? {
      items: [{ id: "revision-1", compositionId: sibling ? "composition-2" : "composition-1", revisionNo: 1, parentRevisionId: null, iterationId: null, state: "sealed", engine: "manual", engineVersion: null, authoredBySessionId: null, createdAt: 1, sealedAt: 2 }],
      nextCursor: "next",
    } : { id: "composition-1", projectId: sibling ? "project-2" : "project-1", slug: "hero", kind: "video", latestRevisionId: "revision-1", selectedRevisionId: "revision-1", createdAt: 1, updatedAt: 2 });
    registerProjectMediaIpc({
      handle(channel, listener) { handlers.set(channel, listener); },
      getWindow: () => window,
      captureRoot: () => ({ epoch }),
      assertRoot: (root) => { if (root.epoch !== epoch) throw new Error("stale root"); },
      session: { client: { request: request as RalphyBridgeClient["request"] } },
      authorizeTrustedLocator: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn(), writeBuffer: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: mainFrame };
    const show = handlers.get("project:composition:show")!;
    const page = handlers.get("project:composition:page")!;

    await expect(page(trusted, project, { kind: "revisions", compositionId: "composition-1", cursor: "opaque" })).resolves.toMatchObject({ ok: true });
    expect(request).toHaveBeenLastCalledWith("composition.revisions", { context: project, compositionId: "composition-1", order: "newest", after: "opaque", limit: 50 });
    request.mockClear();
    for (const call of [
      () => page({ sender: webContents, senderFrame: {} }, project, { kind: "revisions", compositionId: "composition-1" }),
      () => page(trusted, project, { kind: "all", compositionId: "composition-1" }),
      () => page(trusted, project, { kind: "sources", revisionId: "", cursor: 1 }),
      () => page(trusted, project, { kind: "build-outputs", buildId: "build-1", extra: true }),
    ]) await expect(call()).resolves.toMatchObject({ ok: false });
    expect(request).not.toHaveBeenCalled();

    sibling = true;
    await expect(show(trusted, project, "composition-1")).resolves.toMatchObject({ ok: false });
    await expect(page(trusted, project, { kind: "revisions", compositionId: "composition-1" })).resolves.toMatchObject({ ok: false });
    sibling = false;
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (...args: Parameters<typeof original>) => { epoch += 1; return original(...args); });
    epoch = 1;
    await expect(show(trusted, project, "composition-1")).resolves.toMatchObject({ ok: false });
  });

  test("unit workbench production registrar validates closed pages, scope, sender, and root", async () => {
    const { registerProjectMediaIpc } = await import("../electron/ralphy/project-reader");
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<any>>();
    const mainFrame = {};
    const webContents = { mainFrame };
    const window = { isDestroyed: () => false, webContents };
    const project = { workspaceId: "workspace-1", projectId: "project-1" };
    const unit = {
      id: "unit-1", ...project, compositionId: null, slug: "reel", format: "9:16", latestRevisionId: "unit-revision-2",
      selectedRevisionId: "unit-revision-1", createdAt: 1, updatedAt: 2,
    };
    const revision = {
      id: "unit-revision-1", unitId: "unit-1", compositionRevisionId: null, revisionNo: 1, parentRevisionId: null,
      iterationId: null, note: null, authoredBySessionId: null, sealedAt: 2, createdAt: 1,
    };
    let epoch = 1;
    let mode: "valid" | "shared" | "sibling" | "stale" = "valid";
    const request = vi.fn(async (method: string) => {
      const result = method === "unit.revisions"
        ? { items: [revision], nextCursor: "revision-next" }
        : method === "unit.revision.show"
          ? revision
          : unit;
      if (mode === "stale") epoch += 1;
      if (mode === "shared") return { ...unit, projectId: null };
      if (mode === "sibling") {
        return method === "unit.revision.show"
          ? { ...revision, unitId: "unit-2" }
          : { ...unit, projectId: "project-2" };
      }
      return result;
    });
    registerProjectMediaIpc({
      handle(channel, listener) { handlers.set(channel, listener); },
      getWindow: () => window,
      captureRoot: () => ({ epoch }),
      assertRoot: (binding) => { if (binding.epoch !== epoch) throw new Error("stale root"); },
      session: { client: { request: request as RalphyBridgeClient["request"] } },
      authorizeTrustedLocator: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn(), writeBuffer: vi.fn(),
    });

    const show = handlers.get("project:unit:show");
    const showRevision = handlers.get("project:unit:revision:show");
    const page = handlers.get("project:unit:page");
    const select = handlers.get("project:unit:select");
    expect([show, showRevision, page, select].every((handler) => typeof handler === "function")).toBe(true);
    const trusted = { sender: webContents, senderFrame: mainFrame };

    await expect(page!(trusted, project, { kind: "revisions", unitId: "unit-1" }))
      .resolves.toEqual({ ok: true, value: { items: [revision], nextCursor: "revision-next" } });
    expect(request).toHaveBeenLastCalledWith("unit.revisions", {
      context: project, unitId: "unit-1", order: "newest", limit: 50,
    });
    await expect(select!(trusted, project, "unit-1", "unit-revision-1", null))
      .resolves.toEqual({ ok: true, value: unit });
    expect(request).toHaveBeenLastCalledWith("unit.select", {
      context: project, unitId: "unit-1", revisionId: "unit-revision-1",
      expectedSelectedRevisionId: null,
    });

    mode = "shared";
    await expect(show!(trusted, project, "unit-1"))
      .resolves.toEqual({ ok: true, value: { ...unit, projectId: null } });
    mode = "valid";

    request.mockClear();
    for (const call of [
      () => page!({ sender: webContents, senderFrame: {} }, project, { kind: "revisions", unitId: "unit-1" }),
      () => page!(trusted, project, { kind: "revisions", unitId: "unit-1", extra: true }),
      () => page!(trusted, project, { kind: "children", unitId: "unit-1" }),
      () => page!(trusted, project, { kind: "items", revisionId: "", cursor: 1 }),
      () => select!(trusted, project, "unit-1", "unit-revision-1", undefined),
    ]) await expect(call()).resolves.toMatchObject({ ok: false });
    expect(request).not.toHaveBeenCalled();

    mode = "sibling";
    await expect(show!(trusted, project, "unit-1")).resolves.toMatchObject({ ok: false });
    await expect(showRevision!(trusted, project, "unit-1", "unit-revision-1"))
      .resolves.toMatchObject({ ok: false });
    mode = "stale";
    epoch = 1;
    await expect(show!(trusted, project, "unit-1")).resolves.toMatchObject({ ok: false });
  });

  test("registered Project media actions keep locators in main and copy a native file URL buffer", async () => {
    const { registerProjectMediaIpc } = await import("../electron/ralphy/project-reader");
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
    const mainFrame = {};
    const webContents = { mainFrame };
    const window = { isDestroyed: () => false, webContents };
    const project = { workspaceId: "workspace-1", projectId: "project-1" };
    const ref = { type: "artifact" as const, id: "artifact-1" };
    const card = {
      ref, ...project, slug: "hero", kind: "image", selectedRevisionId: "revision-1",
      selectedState: "approved", mime: "image/png", bytes: 12, selectedAt: 1,
      revisionCount: 1, selectedObjectId: "object-1", storageClass: "bucket", usageRoles: [],
      target: { type: "object" as const, id: "object-1" }, mediaKind: "image" as const,
      provenance: "generation" as const,
    };
    const locator = { absolutePath: "/private/library/.ralphy/buckets/hero.png", mime: "image/png", bytes: 12 };
    const canonicalPath = "/private/library/.ralphy/buckets/canonical-hero.png";
    const request = vi.fn(async (method: string) => method === "media.show" ? card : locator);
    const authorizeTrustedLocator = vi.fn(async () => canonicalPath);
    const openPath = vi.fn(async () => "");
    const showItemInFolder = vi.fn();
    const writeBuffer = vi.fn();

    registerProjectMediaIpc({
      handle(channel, listener) { handlers.set(channel, listener); },
      getWindow: () => window,
      captureRoot: () => ({ epoch: 1 }),
      assertRoot: () => undefined,
      session: { client: { request: request as RalphyBridgeClient["request"] } },
      authorizeTrustedLocator,
      openPath,
      showItemInFolder,
      writeBuffer,
    });

    const action = handlers.get("project:media:action");
    expect(action).toBeTypeOf("function");
    const trusted = { sender: webContents, senderFrame: mainFrame };
    for (const name of ["open", "finder", "copy"] as const) {
      await expect(action!(trusted, project, ref, name)).resolves.toEqual({ ok: true, value: undefined });
    }

    expect(request.mock.calls.filter(([method]) => method === "locator.resolve").map(([, params]) => (
      (params as { purpose: string }).purpose
    ))).toEqual(["open", "finder", "drag"]);
    expect(authorizeTrustedLocator).toHaveBeenCalledTimes(3);
    expect(openPath).toHaveBeenCalledWith(canonicalPath);
    expect(showItemInFolder).toHaveBeenCalledWith(canonicalPath);
    expect(writeBuffer).toHaveBeenCalledOnce();
    const [format, buffer] = writeBuffer.mock.calls[0]!;
    expect(format).toBe("public.file-url");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString("utf8")).toBe(pathToFileURL(canonicalPath).href);
    expect(fileURLToPath(buffer.toString("utf8"))).toBe(canonicalPath);
    expect(JSON.stringify(await action!(trusted, project, ref, "copy"))).not.toContain(canonicalPath);
  });

  test("registered Project media actions reject untrusted, stale, and unauthorized targets before effects", async () => {
    const fixture = await makeLibraryFixture();
    try {
      const { registerProjectMediaIpc } = await import("../electron/ralphy/project-reader");
      const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
      const mainFrame = {};
      const webContents = { mainFrame };
      const window = { isDestroyed: () => false, webContents };
      let activeWindow = window;
      const project = { workspaceId: "workspace-1", projectId: "project-1" };
      const ref = { type: "artifact" as const, id: "artifact-1" };
      const card = {
        ref, ...project, slug: "hero", kind: "image", selectedRevisionId: "revision-1",
        selectedState: "approved", mime: "image/png", bytes: 3, selectedAt: 1,
        revisionCount: 1, selectedObjectId: "object-1", storageClass: "bucket", usageRoles: [],
        target: { type: "object" as const, id: "object-1" }, mediaKind: "image" as const,
        provenance: "generation" as const,
      };
      const mediaPath = join(fixture.alphaPath, "artifacts", "images", "hero.png");
      const canonicalMediaPath = await realpath(mediaPath);
      const canonicalRoot = await realpath(fixture.rootPath);
      const linkedPath = join(fixture.alphaPath, "artifacts", "images", "action-link.png");
      await symlink(mediaPath, linkedPath);
      const canonicalLinkedPath = join(canonicalRoot, relative(fixture.rootPath, linkedPath));
      const bytes = (await stat(mediaPath)).size;
      const access = new MediaProtocolAccess();
      let epoch = 1;
      let mode: "valid" | "missing" | "sibling" | "malformed" | "outside" | "symlink"
        | "stale-core" | "stale-locator" | "stale-auth" | "stale-sender" = "valid";
      const request = vi.fn(async (method: string) => {
        if (method === "media.show") {
          if (mode === "stale-core") epoch += 1;
          if (mode === "missing") return { ...card, selectedRevisionId: null, selectedState: null, mime: null,
            bytes: null, selectedAt: null, selectedObjectId: null, storageClass: null, target: null };
          if (mode === "sibling") return { ...card, workspaceId: "workspace-2" };
          return card;
        }
        if (mode === "stale-locator") epoch += 1;
        if (mode === "malformed") return { absolutePath: canonicalMediaPath, mime: "image/png", bytes, private: true };
        if (mode === "outside") return { absolutePath: "/tmp/outside.png", mime: "image/png", bytes };
        if (mode === "symlink") return { absolutePath: canonicalLinkedPath, mime: "image/png", bytes };
        return { absolutePath: canonicalMediaPath, mime: "image/png", bytes };
      });
      const authorizeTrustedLocator = vi.fn(async (
        root: { rootPath: string },
        path: string,
        mime: string | null,
        expectedBytes: number,
        assertCurrent: () => void,
      ) => {
        const authorized = await access.authorizeTrustedLocator(
          root.rootPath,
          path,
          mime,
          expectedBytes,
          assertCurrent,
        );
        if (mode === "stale-auth") epoch += 1;
        if (mode === "stale-sender") {
          activeWindow = { isDestroyed: () => false, webContents: { mainFrame: {} } };
        }
        return authorized;
      });
      const openPath = vi.fn();
      const showItemInFolder = vi.fn();
      const writeBuffer = vi.fn();

      registerProjectMediaIpc({
        handle(channel, listener) { handlers.set(channel, listener); },
        getWindow: () => activeWindow,
        captureRoot: () => ({ epoch, rootPath: fixture.rootPath }),
        assertRoot: (root) => { if (root.epoch !== epoch) throw new Error("stale root"); },
        session: { client: { request: request as RalphyBridgeClient["request"] } },
        authorizeTrustedLocator,
        openPath,
        showItemInFolder,
        writeBuffer,
      });
      const action = handlers.get("project:media:action")!;
      const trusted = { sender: webContents, senderFrame: mainFrame };

      await expect(action({ sender: webContents, senderFrame: {} }, project, ref, "open")).resolves.toMatchObject({ ok: false });
      for (const args of [
        [{ workspaceId: "", projectId: "project-1" }, ref, "open"],
        [project, { type: "artifact", id: "", extra: true }, "open"],
        [project, ref, "trash"],
      ] as const) await expect(action(trusted, ...args)).resolves.toMatchObject({ ok: false });
      expect(request).not.toHaveBeenCalled();

      for (mode of [
        "missing", "sibling", "malformed", "outside", "symlink",
        "stale-core", "stale-locator", "stale-auth", "stale-sender",
      ] as const) {
        epoch = 1;
        activeWindow = window;
        await expect(action(trusted, project, ref, "open")).resolves.toMatchObject({ ok: false });
      }
      expect(openPath).not.toHaveBeenCalled();
      expect(showItemInFolder).not.toHaveBeenCalled();
      expect(writeBuffer).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.parentPath, { recursive: true, force: true });
    }
  });

  test("registered Shared Library IPC keeps workspace locators root-fenced and tokens revocable", async () => {
    const fixture = await makeLibraryFixture();
    try {
      const { registerSharedLibraryIpc } = await import("../electron/ralphy/shared-library-reader");
      const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<any>>();
      const mainFrame = {};
      const webContents = { mainFrame };
      const window = { isDestroyed: () => false, webContents };
      const trusted = { sender: webContents, senderFrame: mainFrame };
      const mediaPath = join(fixture.alphaPath, "artifacts", "images", "hero.png");
      const canonicalMediaPath = await realpath(mediaPath);
      const canonicalRoot = await realpath(fixture.rootPath);
      const linkedPath = join(fixture.alphaPath, "artifacts", "images", "shared-link.png");
      await symlink(mediaPath, linkedPath);
      const canonicalLinkedPath = join(canonicalRoot, relative(fixture.rootPath, linkedPath));
      const bytes = (await stat(mediaPath)).size;
      const card = {
        ref: { type: "artifact" as const, id: "artifact-1" },
        workspaceId: "workspace-1",
        projectId: null,
        slug: "hero",
        kind: "image",
        selectedRevisionId: "revision-1",
        selectedState: "approved",
        mime: "image/png",
        bytes,
        selectedAt: 1,
        revisionCount: 1,
        selectedObjectId: "object-1",
        storageClass: "durable",
        usageRoles: ["reference"],
        target: { type: "object" as const, id: "object-1" },
        mediaKind: "image" as const,
        provenance: "not-generation" as const,
      };
      const revision = {
        id: "revision-1", artifactId: "artifact-1", objectId: "object-1",
        revisionNo: 1, parentRevisionId: null, iterationId: null,
        state: "approved" as const, authoredBySessionId: null, createdAt: 1,
      };
      let epoch = 1;
      let mode: "valid" | "project" | "workspace" | "outside" | "symlink" | "forged"
        | "stale-core" | "stale-locator" = "valid";
      const request = vi.fn(async (method: string) => {
        if (mode === "stale-core") epoch += 1;
        if (method === "media.list") return { items: [card], nextCursor: null };
        if (method === "media.revisions") return { items: [revision], nextCursor: null };
        if (method === "media.select") return card;
        if (method === "media.show") {
          if (mode === "project") return { ...card, projectId: "project-1" };
          if (mode === "workspace") return { ...card, workspaceId: "workspace-2" };
          return card;
        }
        if (mode === "stale-locator") epoch += 1;
        if (mode === "outside") return { absolutePath: "/tmp/outside.png", mime: "image/png", bytes };
        if (mode === "symlink") return { absolutePath: canonicalLinkedPath, mime: "image/png", bytes };
        if (mode === "forged") return { absolutePath: canonicalMediaPath, mime: "image/png", bytes, private: true };
        return { absolutePath: canonicalMediaPath, mime: "image/png", bytes };
      });
      const access = new MediaProtocolAccess();
      const mintTrustedLocator = vi.fn(async (
        root: { rootPath: string },
        path: string,
        mime: string | null,
        expectedBytes: number,
        assertCurrent: () => void,
      ) => {
        const minted = await access.mintTrustedLocator(
          root.rootPath, path, mime, expectedBytes, assertCurrent,
        );
        return { url: `ralphy-media://asset/${minted.token}`, sizeBytes: minted.sizeBytes };
      });
      const authorizeTrustedLocator = vi.fn((
        root: { rootPath: string },
        path: string,
        mime: string | null,
        expectedBytes: number,
        assertCurrent: () => void,
      ) => access.authorizeTrustedLocator(root.rootPath, path, mime, expectedBytes, assertCurrent));
      const openPath = vi.fn(async () => "");
      const showItemInFolder = vi.fn();

      registerSharedLibraryIpc({
        handle(channel, listener) { handlers.set(channel, listener); },
        getWindow: () => window,
        captureRoot: () => ({ epoch, rootPath: fixture.rootPath }),
        assertRoot: (root) => { if (root.epoch !== epoch) throw new Error("stale root"); },
        session: { client: { request: request as RalphyBridgeClient["request"] } },
        mintTrustedLocator,
        authorizeTrustedLocator,
        openPath,
        showItemInFolder,
      });

      expect([...handlers.keys()]).toEqual([
        "workspace:shared-library:page",
        "workspace:shared-library:show",
        "workspace:shared-library:revisions",
        "workspace:shared-library:select",
        "workspace:shared-library:preview",
        "workspace:shared-library:action",
      ]);
      const loadPage = handlers.get("workspace:shared-library:page")!;
      const select = handlers.get("workspace:shared-library:select")!;
      const preview = handlers.get("workspace:shared-library:preview")!;
      const action = handlers.get("workspace:shared-library:action")!;

      for (const call of [
        () => loadPage({ sender: webContents, senderFrame: {} }, "workspace-1"),
        () => loadPage(trusted, "", undefined),
        () => loadPage(trusted, "workspace-1", { after: 1 }),
        () => select(trusted, "workspace-1", "artifact-1", "revision-1", undefined),
        () => action(trusted, "workspace-1", "artifact-1", "trash"),
      ]) await expect(call()).resolves.toMatchObject({ ok: false });
      expect(request).not.toHaveBeenCalled();

      await expect(loadPage(trusted, "workspace-1", undefined)).resolves.toEqual({
        ok: true, value: { items: [card], nextCursor: null },
      });
      expect(request).toHaveBeenLastCalledWith("media.list", {
        context: { workspaceId: "workspace-1" }, limit: 50, types: ["artifact"],
      });
      await expect(select(trusted, "workspace-1", "artifact-1", "revision-1", null))
        .resolves.toEqual({ ok: true, value: card });
      expect(request).toHaveBeenLastCalledWith("media.select", {
        context: { workspaceId: "workspace-1" }, ref: { type: "artifact", id: "artifact-1" },
        revisionId: "revision-1", expectedSelectedRevisionId: null,
      });

      const previewResult = await preview(trusted, "workspace-1", "artifact-1");
      expect(previewResult).toMatchObject({ ok: true, value: { sizeBytes: bytes } });
      expect(JSON.stringify(previewResult)).not.toMatch(/absolutePath|\.ralphy\/|buckets/i);
      const url = previewResult.value.url as string;
      const token = new URL(url).pathname.slice(1);
      await expect(access.resolve(fixture.rootPath, token)).resolves.toBe(await realpath(mediaPath));
      access.clear();
      await expect(access.resolve(fixture.rootPath, token)).rejects.toThrow(/unknown media token/i);

      await expect(action(trusted, "workspace-1", "artifact-1", "open"))
        .resolves.toEqual({ ok: true, value: undefined });
      await expect(action(trusted, "workspace-1", "artifact-1", "finder"))
        .resolves.toEqual({ ok: true, value: undefined });
      expect(openPath).toHaveBeenCalledWith(await realpath(mediaPath));
      expect(showItemInFolder).toHaveBeenCalledWith(await realpath(mediaPath));

      const effectCounts = [openPath.mock.calls.length, showItemInFolder.mock.calls.length];
      for (mode of [
        "project", "workspace", "outside", "symlink", "forged", "stale-core", "stale-locator",
      ] as const) {
        epoch = 1;
        await expect(action(trusted, "workspace-1", "artifact-1", "open"))
          .resolves.toMatchObject({ ok: false });
      }
      expect([openPath.mock.calls.length, showItemInFolder.mock.calls.length]).toEqual(effectCounts);
    } finally {
      await rm(fixture.parentPath, { recursive: true, force: true });
    }
  });

  test("mock Shared Library bridge stays truthful and does not invent mutations", async () => {
    const { bridge } = await import("../src/lib/ipc");

    await expect(bridge.loadSharedLibraryPage("workspace-1")).resolves.toEqual({
      items: [], nextCursor: null,
    });
    await expect(bridge.loadSharedLibraryRevisions("workspace-1", "artifact-1"))
      .resolves.toEqual({ items: [], nextCursor: null });
    await expect(bridge.resolveSharedLibraryPreview("workspace-1", "artifact-1"))
      .resolves.toBeNull();
    await expect(bridge.loadSharedLibraryArtifact("workspace-1", "artifact-1"))
      .rejects.toThrow(/unavailable in mock mode/i);
    await expect(bridge.selectSharedLibraryRevision(
      "workspace-1", "artifact-1", "revision-1", null,
    )).rejects.toThrow(/mutations are unavailable in mock mode/i);
    await expect(bridge.performSharedLibraryAction("workspace-1", "artifact-1", "open"))
      .rejects.toThrow(/actions are unavailable in mock mode/i);
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
