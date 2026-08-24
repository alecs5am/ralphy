import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  net,
  nativeImage,
  nativeTheme,
  protocol,
  safeStorage,
  screen,
  session as electronSession,
  shell,
} from "electron";
import { readFileSync, statSync } from "node:fs";
import { mkdir, realpath, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { Worker } from "node:worker_threads";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ClaudeCredentialStore,
  EncryptedCredentialStore,
  validateAnthropicApiKey,
  validateOpenRouterApiKey,
} from "./claude/credentials";
import { parseAgentChatRequest } from "./agent/request";
import {
  CodexSession,
  loginCodex,
  readCodexAuthStatus,
  resolveCodexBinary,
} from "./agent/codex-session";
import {
  CLAUDE_MODELS,
  fetchOpenRouterModels,
  readCodexModels,
} from "./agent/models";
import {
  ClaudeSession,
  claudeSubscriptionEnvironment,
  loginClaudeSubscription,
  readClaudeAuthStatus,
  resolveClaudeBinary,
} from "./claude/session";
import { loadAnnotations, updateAnnotations } from "./media/annotations";
import {
  buildDomainCatalog,
  ensureHomeLibraryRoot,
  isDomainLibraryRoot,
  readBoundedText,
  resolveProjectPath,
  validateLibraryRoot,
} from "./media/catalog";
import {
  AGENT_CHANNELS,
  APP_CHANNELS,
  MEDIA_CHANNELS,
  MAX_WAVEFORM_DECODE_BYTES,
  PROJECT_MEDIA_FILTERS,
  type CatalogResult,
  type AgentChatEnvelope,
  type AgentProvider,
  type AgentProviderStatus,
  type ClaudeAuthState,
  type LibraryOpenResult,
  type MediaEvent,
  type MediaPreviewSource,
  type ProjectReference,
  type ProjectMediaFilter,
  type ProjectMediaKind,
  type ProjectMediaQuery,
  type MediaProvenance,
  type WorkerRequest,
  type WorkerResponse,
} from "./media/types";
import { LibraryWatcher } from "./media/watcher";
import {
  resolveMediaByteRange,
  trashAuthorizedItems,
} from "./media/protocol-access";
import { guardedAtomicWrite } from "./media/atomic-write";
import {
  ActiveRootResource,
  type ActiveMediaSession,
  createSingleFlight,
  guardedResult,
  guardedSideEffect,
  type MediaSessionEpoch,
  MediaSessionState,
  sendIfWindowAlive,
  StaleMediaSessionError,
  stopMediaRuntime,
} from "./media/session";
import {
  captureStagedRootIdentity,
  dispatchDesktopStartup,
  readSecretHandoffRequest,
  runSecretHandoff,
  secretFileForProvider,
  secretProviderFromRef,
} from "./migration/secret-handoff";
import { RalphyBridgeClient } from "./ralphy/client";
import {
  createActivitySynchronizer,
  type ActivitySynchronizer,
} from "./ralphy/activity-sync";
import { createProjectReader, registerProjectMediaIpc } from "./ralphy/project-reader";
import { registerSharedLibraryIpc } from "./ralphy/shared-library-reader";
import { createMemoryReader } from "./ralphy/memory-reader";
import { createCalendarReader } from "./ralphy/calendar-reader";
import { registerWorkspaceOverviewIpc } from "./ralphy/workspace-reader";
import { registerMarketplaceLibraryIpc } from "./marketplace-library";
import type { BridgeMethod, JsonValue, ParamsFor, ResultFor } from "./ralphy/types";
import { resolveRalphyExecutable } from "./ralphy/executable";
import { RalphySession } from "./ralphy/session";
import {
  createQuitCoordinator,
  createRootShutdown,
  openRootSession,
  type RootIdentity,
} from "./root-session";
import {
  findMigrationRecovery,
  migrationRecoveryFromError,
  recoveryCommand,
  type MainMigrationRecovery,
} from "./migration-recovery";
import {
  assertTrustedSender as assertIpcSender,
  denyPermissionRequest,
  installNavigationGuards,
  secureWebPreferences,
  toIpcResult,
} from "./ipc-security";
import {
  fitWindowBounds,
  parseWindowBounds,
  type WindowBounds,
} from "./window-state";
import { parseBoundedJsonValue as parseJsonValue } from "./json-value";
import { INSTRUMENT_PALETTE } from "../src/instrument/palette";
import {
  loadLocalModelDetail,
  loadLocalModelMachine,
  parseLocalModelProviderUrl,
  parseLocalModelReference,
  parseLocalModelSearchInput,
  searchLocalModels,
} from "./local-models";

const RENDERER = join(__dirname, "..", "dist", "index.html");
const WORKER_ENTRY = join(__dirname, "media", "worker.cjs");
const WINDOW_STATE_LIMIT_BYTES = 1024;
const DEFAULT_WINDOW_SIZE = { width: 1200, height: 800 };
const MINIMUM_WINDOW_SIZE = { width: 1100, height: 720 };
const CLIPBOARD_LIMIT = 2 * 1024 * 1024;
const MAX_TRASH_ITEMS = 1000;
const SMOKE_TEST = process.argv.includes("--smoke-test");
const INSTRUMENT_SHELL_AUDIT = process.argv.includes("--instrument-shell-audit");
let cachedFileDragIcon: Electron.NativeImage | null = null;
let claudeCredentialStore: ClaudeCredentialStore | null = null;
let openRouterCredentialStore: EncryptedCredentialStore | null = null;
let activeAgentSession: { stop(): void } | null = null;
let agentTurnBusy = false;
let cachedOpenRouterModels: { at: number; models: AgentProviderStatus["models"] } | null = null;
const ralphyBin = resolveRalphyExecutable({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  env: process.env,
});
let ralphySession: RalphySession;
let activitySynchronizer: ActivitySynchronizer;
let shutdownRoot: (() => Promise<void>) | null = null;
let backgroundShutdown: Promise<void> | null = null;
let quitCoordinator: ReturnType<typeof createQuitCoordinator>;
let migrationRecovery: MainMigrationRecovery | null = null;

function fileDragIcon(): Electron.NativeImage {
  if (cachedFileDragIcon) return cachedFileDragIcon;
  const candidates = [
    join(process.resourcesPath, "RalphyMedia-drag.png"),
    join(__dirname, "..", "assets", "app-icon-1024.png"),
  ];
  for (const path of candidates) {
    const icon = nativeImage.createFromPath(path);
    if (!icon.isEmpty()) {
      cachedFileDragIcon = icon.resize({ width: 48, height: 48 });
      return cachedFileDragIcon;
    }
  }
  throw new Error("Native drag icon is unavailable");
}

interface PendingWorkerRequest {
  resolve: (value: CatalogResult) => void;
  reject: (error: Error) => void;
}

class MediaWorkerClient {
  readonly #worker: Worker;
  readonly #onMessage: (message: WorkerResponse) => void;
  readonly #pending = new Map<number, PendingWorkerRequest>();
  #nextRequestId = 1;

  constructor(onMessage: (message: WorkerResponse) => void) {
    this.#onMessage = onMessage;
    this.#worker = new Worker(WORKER_ENTRY);
    this.#worker.on("message", (message: WorkerResponse) => this.#handle(message));
    this.#worker.on("error", (error) => this.#failAll(error));
    this.#worker.on("exit", (code) => {
      if (code !== 0) this.#failAll(new Error(`Media worker exited with code ${code}`));
    });
  }

  catalog(rootPath: string, generation: number): Promise<CatalogResult> {
    return this.#request<CatalogResult>((requestId) => ({
      type: "catalog",
      requestId,
      rootPath,
      generation,
    }));
  }

  close(): void {
    this.#failAll(new Error("Media worker closed"));
    void this.#worker.terminate();
  }

  #request<Result extends CatalogResult>(
    message: (requestId: number) => WorkerRequest,
  ): Promise<Result> {
    const requestId = this.#nextRequestId;
    this.#nextRequestId += 1;
    return new Promise<Result>((resolve, reject) => {
      this.#pending.set(requestId, {
        resolve: (value) => resolve(value as Result),
        reject,
      });
      this.#worker.postMessage(message(requestId));
    });
  }

  #handle(message: WorkerResponse): void {
    if (message.type === "catalog-progress") {
      this.#onMessage(message);
      return;
    }
    const pending = this.#pending.get(message.requestId);
    if (!pending) return;
    this.#pending.delete(message.requestId);
    if (message.type === "catalog-result") {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.message));
    }
  }

  #failAll(error: Error): void {
    for (const request of this.#pending.values()) request.reject(error);
    this.#pending.clear();
  }
}

let win: BrowserWindow | null = null;
let worker: MediaWorkerClient | null = null;
const mediaState = new MediaSessionState();
let watcher: ActiveRootResource<LibraryWatcher>;
const restoreLibrary = createSingleFlight<LibraryOpenResult | null>();

function credentialStore(): ClaudeCredentialStore {
  if (!claudeCredentialStore) {
    claudeCredentialStore = new ClaudeCredentialStore({
      path: join(app.getPath("userData"), "claude-api-key.bin"),
      cipher: safeStorage,
    });
  }
  return claudeCredentialStore;
}

function openRouterStore(): EncryptedCredentialStore {
  if (!openRouterCredentialStore) {
    openRouterCredentialStore = new EncryptedCredentialStore({
      path: join(app.getPath("userData"), "openrouter-api-key.bin"),
      cipher: safeStorage,
      validate: validateOpenRouterApiKey,
    });
  }
  return openRouterCredentialStore;
}

function inheritedAnthropicApiKey(): string | null {
  try {
    return validateAnthropicApiKey(process.env.ANTHROPIC_API_KEY ?? "");
  } catch {
    return null;
  }
}

function inheritedOpenRouterApiKey(): string | null {
  try {
    return validateOpenRouterApiKey(process.env.OPENROUTER_API_KEY ?? "");
  } catch {
    return null;
  }
}

async function openRouterModels(apiKey?: string): Promise<AgentProviderStatus["models"]> {
  if (cachedOpenRouterModels && Date.now() - cachedOpenRouterModels.at < 5 * 60_000) {
    return cachedOpenRouterModels.models;
  }
  const models = await fetchOpenRouterModels(
    (input, init) => net.fetch(
      typeof input === "string" || input instanceof Request ? input : input.toString(),
      init,
    ),
    apiKey,
  ).catch(() => []);
  if (models.length > 0) cachedOpenRouterModels = { at: Date.now(), models };
  return models;
}

async function claudeAuthState(binary?: string | null): Promise<ClaudeAuthState> {
  const resolvedBinary = binary === undefined ? await resolveClaudeBinary() : binary;
  let subscriptionLoggedIn = false;
  let subscriptionAuthMethod: string | null = null;
  if (resolvedBinary) {
    try {
      const status = await readClaudeAuthStatus(
        resolvedBinary,
        claudeSubscriptionEnvironment(process.env),
      );
      subscriptionLoggedIn = status.loggedIn;
      subscriptionAuthMethod = status.loggedIn ? status.authMethod : null;
    } catch {
      // A missing or expired Claude login is represented as disconnected state.
    }
  }
  const inheritedApiKey = inheritedAnthropicApiKey() !== null;
  return {
    binaryReady: resolvedBinary !== null,
    subscriptionLoggedIn,
    subscriptionAuthMethod,
    apiKeyConfigured: inheritedApiKey || await credentialStore().has(),
    inheritedApiKey,
  };
}

async function agentProviderStatuses(): Promise<AgentProviderStatus[]> {
  const [claude, codexBinary] = await Promise.all([
    claudeAuthState(),
    resolveCodexBinary(),
  ]);
  const codexStatus = codexBinary
    ? await readCodexAuthStatus(codexBinary).catch(() => null)
    : null;
  const codexModels = codexBinary
    ? await readCodexModels(join(app.getPath("home"), ".codex", "models_cache.json"))
    : [];
  const inheritedOpenRouterKey = inheritedOpenRouterApiKey();
  const storedOpenRouterKey = await openRouterStore().read();
  const openRouterKey = storedOpenRouterKey ?? inheritedOpenRouterKey ?? undefined;
  const routerModels = await openRouterModels(openRouterKey);

  const claudeConnected = claude.subscriptionLoggedIn || claude.apiKeyConfigured;
  const codexConnected = codexBinary !== null && codexStatus?.loggedIn === true;
  const routerConnected = codexBinary !== null && Boolean(openRouterKey);
  return [
    {
      id: "claude",
      label: "Claude",
      binaryReady: claude.binaryReady,
      accountConnected: claude.subscriptionLoggedIn,
      apiKeyConfigured: claude.apiKeyConfigured,
      inheritedApiKey: claude.inheritedApiKey,
      connected: claude.binaryReady && claudeConnected,
      detail: claude.subscriptionLoggedIn
        ? `Signed in with ${claude.subscriptionAuthMethod ?? "Claude"}`
        : claude.apiKeyConfigured ? "Anthropic API key ready" : "Claude login required",
      models: CLAUDE_MODELS,
      defaultModel: "sonnet",
    },
    {
      id: "codex",
      label: "Codex",
      binaryReady: codexBinary !== null,
      accountConnected: codexStatus?.loggedIn === true,
      apiKeyConfigured: false,
      inheritedApiKey: false,
      connected: codexConnected,
      detail: codexStatus?.detail ?? (codexBinary ? "Codex login required" : "Codex CLI not found"),
      models: codexModels,
      defaultModel: "default",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      binaryReady: codexBinary !== null,
      accountConnected: false,
      apiKeyConfigured: Boolean(openRouterKey),
      inheritedApiKey: inheritedOpenRouterKey !== null,
      connected: routerConnected,
      detail: openRouterKey ? "OpenRouter API key ready" : "OpenRouter API key required",
      models: routerModels,
      defaultModel: routerModels[0]?.id ?? "~openai/gpt-latest",
    },
  ];
}

function emitMedia(event: MediaEvent): void {
  sendIfWindowAlive(win, MEDIA_CHANNELS.event, event);
}

function mediaWorker(): MediaWorkerClient {
  if (!worker) {
    worker = new MediaWorkerClient((message) => {
      if (
        message.type === "catalog-progress"
        && mediaState.isCurrentCatalogProgress(message.progress)
      ) {
        emitMedia({ type: "catalog-progress", progress: message.progress });
      }
    });
  }
  return worker;
}

function windowStatePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}

function readWindowBounds(): WindowBounds | null {
  const path = windowStatePath();
  try {
    const info = statSync(path);
    if (!info.isFile() || info.size > WINDOW_STATE_LIMIT_BYTES) return null;
    return parseWindowBounds(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

async function writeWindowBounds(bounds: WindowBounds): Promise<void> {
  const path = windowStatePath();
  await mkdir(dirname(path), { recursive: true });
  await guardedAtomicWrite(path, `${JSON.stringify(bounds)}\n`, {
    maxBytes: WINDOW_STATE_LIMIT_BYTES,
  });
}

function parseString(value: unknown, label: string, maxLength = 4096): string {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function parseProjectReference(value: unknown): ProjectReference {
  if (value === null || typeof value !== "object") throw new Error("Invalid project reference");
  const row = value as Record<string, unknown>;
  return {
    workspaceId: parseString(row.workspaceId, "workspace id", 256),
    projectId: parseString(row.projectId, "project id", 256),
  };
}

function parseDocumentRevision(input: unknown): {
  documentId: string;
  expectedHeadId?: string | null;
  iterationId?: string | null;
  format: "markdown" | "text" | "json";
  title?: string | null;
  body: JsonValue;
} {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid document revision");
  const value = input as Record<string, unknown>;
  if (!["markdown", "text", "json"].includes(value.format as string)) throw new Error("Invalid document format");
  const optionalId = (item: unknown, label: string): string | null | undefined => (
    item === undefined ? undefined : item === null ? null : parseString(item, label, 256)
  );
  const title = value.title === undefined ? undefined : value.title === null ? null : parseString(value.title, "document title", 4096);
  return {
    documentId: parseString(value.documentId, "document id", 256),
    ...(optionalId(value.expectedHeadId, "expected document head") === undefined ? {} : { expectedHeadId: optionalId(value.expectedHeadId, "expected document head") }),
    ...(optionalId(value.iterationId, "iteration id") === undefined ? {} : { iterationId: optionalId(value.iterationId, "iteration id") }),
    format: value.format as "markdown" | "text" | "json",
    ...(title === undefined ? {} : { title }),
    body: parseJsonValue(value.body),
  };
}

function parseCompositionRevision(input: unknown): {
  compositionId: string;
  expectedLatestRevisionId: string | null;
  parentRevisionId?: string | null;
  iterationId?: string | null;
  engine: string;
  engineVersion?: string | null;
  engineConfig?: JsonValue;
} {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid composition revision");
  const value = input as Record<string, unknown>;
  const optionalId = (item: unknown, label: string): string | null | undefined => (
    item === undefined ? undefined : item === null ? null : parseString(item, label, 256)
  );
  const expectedLatestRevisionId = optionalId(value.expectedLatestRevisionId, "expected latest revision");
  if (expectedLatestRevisionId === undefined) throw new Error("Invalid composition revision");
  const parentRevisionId = optionalId(value.parentRevisionId, "parent revision");
  const iterationId = optionalId(value.iterationId, "iteration id");
  const engineVersion = optionalId(value.engineVersion, "engine version");
  return {
    compositionId: parseString(value.compositionId, "composition id", 256),
    expectedLatestRevisionId,
    ...(parentRevisionId === undefined ? {} : { parentRevisionId }),
    ...(iterationId === undefined ? {} : { iterationId }),
    engine: parseString(value.engine, "composition engine", 256),
    ...(engineVersion === undefined ? {} : { engineVersion }),
    ...(value.engineConfig === undefined ? {} : { engineConfig: parseJsonValue(value.engineConfig) }),
  };
}

function parseCompositionSelection(input: unknown): {
  compositionId: string;
  revisionId: string;
  expectedSelectedRevisionId: string | null;
} {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid composition selection");
  const value = input as Record<string, unknown>;
  return {
    compositionId: parseString(value.compositionId, "composition id", 256),
    revisionId: parseString(value.revisionId, "composition revision id", 256),
    expectedSelectedRevisionId: value.expectedSelectedRevisionId === null
      ? null
      : parseString(value.expectedSelectedRevisionId, "expected selected revision", 256),
  };
}

function captureBridgeRoot(): { rootPath: string; storeId: string; epoch: number } {
  const rootPath = ralphySession.root;
  const hello = ralphySession.hello;
  if (!rootPath || !hello) throw new Error("No active Ralphy library");
  return { rootPath, storeId: hello.storeId, epoch: ralphySession.rootEpoch };
}

function assertBridgeRoot(binding: { rootPath: string; storeId: string; epoch: number }): void {
  if (
    ralphySession.root !== binding.rootPath
    || ralphySession.hello?.storeId !== binding.storeId
    || ralphySession.rootEpoch !== binding.epoch
  ) throw new StaleMediaSessionError();
}

function assertTrustedSender(
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
): void {
  assertIpcSender(event, win);
}

function securedHandle(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => toIpcResult(() => {
    assertTrustedSender(event);
    return listener(event, ...args);
  }));
}

async function refreshCatalog(
  operation: MediaSessionEpoch | ActiveMediaSession,
  rootPath: string,
  emitResult = true,
  client?: Pick<RalphyBridgeClient, "request">,
): Promise<CatalogResult> {
  const generation = mediaState.beginCatalog(operation, rootPath);
  const domain = await isDomainLibraryRoot(rootPath);
  const result = domain
    ? await buildDomainCatalog(rootPath, client ?? ralphySession.client, generation, (progress) => {
        if (mediaState.isCurrentCatalogProgress(progress)) {
          emitMedia({ type: "catalog-progress", progress });
        }
      })
    : await mediaWorker().catalog(rootPath, generation);
  mediaState.acceptCatalog(operation, rootPath, generation);
  if (emitResult) emitMedia({ type: "catalog-result", result });
  return result;
}

function createWatcher(
  rootPath: string,
  client?: Pick<RalphyBridgeClient, "request">,
): LibraryWatcher {
  return new LibraryWatcher({
    rootPath,
    onCatalogChange() {
      let operation: ActiveMediaSession;
      try {
        operation = mediaState.captureActive(rootPath);
      } catch {
        return;
      }
      void refreshCatalog(operation, rootPath, true, client).catch((error: unknown) => {
        if (!(error instanceof StaleMediaSessionError)) {
          emitMedia({
            type: "error",
            operation: "catalog-refresh",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
    onError(error) {
      if (mediaState.isActiveRoot(rootPath)) {
        emitMedia({ type: "error", operation: "watch", message: error.message });
      }
    },
  });
}

async function prepareMediaRoot(
  root: string,
  client?: Pick<RalphyBridgeClient, "request">,
): Promise<CatalogResult> {
  const operation = mediaState.beginOpen();
  try {
    const catalog = await refreshCatalog(operation, root, false, client);
    mediaState.assertOpen(operation);
    const active = await watcher.replace({
      assertCurrent: () => mediaState.assertOpen(operation),
      create: () => createWatcher(root, client),
      commit: () => mediaState.completeOpen(operation, root),
    });
    mediaState.assertActive(active);
    return catalog;
  } catch (error) {
    mediaState.abortOpen(operation);
    throw error;
  }
}

async function openLibrary(
  rootPath: string,
): Promise<LibraryOpenResult> {
  const interrupted = await findMigrationRecovery(rootPath);
  if (interrupted) throw new MigrationRecoveryRequired(interrupted);
  const root = await validateLibraryRoot(rootPath);

  let identity: RootIdentity;
  let catalog: CatalogResult | null = null;
  try {
    identity = await openRootSession({
      session: ralphySession,
      root,
      label: basename(dirname(root)) || ".ralphy",
      prepare: async (previousRoot, candidateClient) => {
        catalog = await prepareMediaRoot(root, candidateClient as RalphyBridgeClient);
        return async () => {
          if (previousRoot) {
            await prepareMediaRoot(previousRoot);
            return;
          }
          mediaState.close();
          watcher.close();
        };
      },
      invalidateFileTokens: () => mediaState.fileAccess.clear(),
      stopAgentTurns: () => activeAgentSession?.stop(),
      unsubscribeActivity: async () => activitySynchronizer.stop(),
      subscribeActivity: async (client, binding) => activitySynchronizer.start({
        client: client as RalphyBridgeClient,
        binding,
        afterSequence: binding.afterSequence,
      }),
    });
  } catch (error) {
    const recovery = migrationRecoveryFromError(error);
    if (recovery) throw new MigrationRecoveryRequired(recovery);
    throw error;
  }
  if (!catalog) throw new Error("Library startup did not produce a catalog");
  migrationRecovery = null;
  emitMedia({ type: "root-ready", identity });
  activitySynchronizer.publish();
  emitMedia({ type: "catalog-result", result: catalog });
  return { identity, catalog };
}

class MigrationRecoveryRequired extends Error {
  constructor(readonly recovery: MainMigrationRecovery) {
    super("Migration recovery required");
    this.name = "MigrationRecoveryRequired";
  }
}

function showMigrationRecovery(recovery: MainMigrationRecovery): void {
  migrationRecovery = recovery;
  emitMedia({
    type: "migration-recovery",
    recovery: { runId: recovery.runId, phase: recovery.phase },
  });
}

function parseAgentProvider(value: unknown, allowed: AgentProvider[]): AgentProvider {
  if (typeof value === "string" && allowed.includes(value as AgentProvider)) {
    return value as AgentProvider;
  }
  throw new Error("Invalid agent provider");
}

function registerAgentIpc(): void {
  securedHandle(AGENT_CHANNELS.providers, async (event) => {
    assertTrustedSender(event);
    return agentProviderStatuses();
  });
  securedHandle(AGENT_CHANNELS.login, async (event, rawProvider: unknown) => {
    assertTrustedSender(event);
    const provider = parseAgentProvider(rawProvider, ["claude", "codex"]);
    if (provider === "claude") {
      const binary = await resolveClaudeBinary();
      if (!binary) throw new Error("Install the Claude CLI before signing in");
      await loginClaudeSubscription(binary);
    } else {
      const binary = await resolveCodexBinary();
      if (!binary) throw new Error("Install the Codex CLI before signing in");
      await loginCodex(binary);
    }
    return agentProviderStatuses();
  });
  securedHandle(
    AGENT_CHANNELS.setApiKey,
    async (event, rawProvider: unknown, rawApiKey: unknown) => {
      assertTrustedSender(event);
      const provider = parseAgentProvider(rawProvider, ["claude", "openrouter"]);
      const apiKey = parseString(rawApiKey, `${provider} API key`, 512);
      if (provider === "claude") await credentialStore().write(apiKey);
      else {
        await openRouterStore().write(apiKey);
        cachedOpenRouterModels = null;
      }
      return agentProviderStatuses();
    },
  );
  securedHandle(AGENT_CHANNELS.clearApiKey, async (event, rawProvider: unknown) => {
    assertTrustedSender(event);
    const provider = parseAgentProvider(rawProvider, ["claude", "openrouter"]);
    if (provider === "claude") await credentialStore().clear();
    else {
      await openRouterStore().clear();
      cachedOpenRouterModels = null;
    }
    return agentProviderStatuses();
  });
  securedHandle(AGENT_CHANNELS.send, async (event, rawRequest: unknown) => {
    assertTrustedSender(event);
    if (agentTurnBusy) throw new Error("An agent is already working");
    agentTurnBusy = true;
    try {
      const operation = captureBridgeRoot();
      const request = parseAgentChatRequest(rawRequest);
      const projectPath = request.project
        ? await resolveProjectPath(
          operation.rootPath,
          request.project.workspaceId,
          request.project.projectId,
        )
        : undefined;
      assertBridgeRoot(operation);
      const emit = (chatEvent: AgentChatEnvelope["event"]): void => {
        const envelope: AgentChatEnvelope = {
          storeId: operation.storeId,
          chatId: request.chatId,
          provider: request.provider,
          event: chatEvent,
        };
        sendIfWindowAlive(win, AGENT_CHANNELS.event, envelope);
      };

      if (request.provider === "claude") {
        const binary = await resolveClaudeBinary();
        if (!binary) throw new Error("Claude CLI is not installed");
        let apiKey: string | undefined;
        if (request.claudeAuthMethod === "api-key") {
          apiKey = await credentialStore().read() ?? inheritedAnthropicApiKey() ?? undefined;
          if (!apiKey) throw new Error("Add an Anthropic API key before sending");
        } else {
          const status = await readClaudeAuthStatus(
            binary,
            claudeSubscriptionEnvironment(process.env),
          ).catch(() => null);
          if (!status?.loggedIn) throw new Error("Sign in to Claude before sending");
        }
        assertBridgeRoot(operation);
        const session = new ClaudeSession({ binary, emit });
        activeAgentSession = session;
        try {
          await session.run({
            rootPath: operation.rootPath,
            projectPath,
            prompt: request.prompt,
            model: request.model,
            authMethod: request.claudeAuthMethod,
            apiKey,
            permissionMode: request.permissionMode,
            resumeSessionId: request.resumeSessionId,
          });
        } finally {
          if (activeAgentSession === session) activeAgentSession = null;
        }
        return;
      }

      const binary = await resolveCodexBinary();
      if (!binary) throw new Error("Codex CLI is not installed");
      let openRouterApiKey: string | undefined;
      if (request.provider === "codex") {
        const status = await readCodexAuthStatus(binary).catch(() => null);
        if (!status?.loggedIn) throw new Error("Sign in to Codex before sending");
      } else {
        openRouterApiKey = await openRouterStore().read()
          ?? inheritedOpenRouterApiKey()
          ?? undefined;
        if (!openRouterApiKey) throw new Error("Add an OpenRouter API key before sending");
      }
      assertBridgeRoot(operation);
      const session = new CodexSession({ binary, emit });
      activeAgentSession = session;
      try {
        await session.run({
          rootPath: operation.rootPath,
          projectPath,
          prompt: request.prompt,
          provider: request.provider,
          model: request.model,
          openRouterApiKey,
          permissionMode: request.permissionMode,
          resumeSessionId: request.resumeSessionId,
        });
      } finally {
        if (activeAgentSession === session) activeAgentSession = null;
      }
    } finally {
      agentTurnBusy = false;
    }
  });
  securedHandle(AGENT_CHANNELS.stop, (event) => {
    assertTrustedSender(event);
    activeAgentSession?.stop();
  });
}

async function mediaUrl(
  operation: ActiveMediaSession,
  path: string,
): Promise<MediaPreviewSource> {
  const assertCurrent = (): void => mediaState.assertActive(operation);
  const { token, sizeBytes } = await mediaState.fileAccess.mint(
    operation.rootPath,
    path,
    assertCurrent,
  );
  assertCurrent();
  return { url: `ralphy-media://asset/${token}`, sizeBytes };
}

function registerMediaIpc(): void {
  securedHandle(MEDIA_CHANNELS.searchLocalModels, (_event, rawInput: unknown) => (
    searchLocalModels(parseLocalModelSearchInput(rawInput), undefined, net.fetch)
  ));
  securedHandle(MEDIA_CHANNELS.loadLocalModelDetail, async (_event, rawRef: unknown) => {
    const machine = await loadLocalModelMachine(net.fetch);
    return loadLocalModelDetail(parseLocalModelReference(rawRef), machine, net.fetch);
  });
  securedHandle(MEDIA_CHANNELS.refreshLocalModelMachine, () => loadLocalModelMachine(net.fetch));
  securedHandle(MEDIA_CHANNELS.openLocalModelProvider, (_event, rawUrl: unknown) => (
    shell.openExternal(parseLocalModelProviderUrl(rawUrl))
  ));
  securedHandle(MEDIA_CHANNELS.applyNativeAppearance, (_event, rawTheme: unknown) => {
    /* An unknown value falls back to "system" rather than throwing: a bad appearance is a cosmetic
       fault and the renderer should not lose a frame over it. */
    nativeTheme.themeSource = rawTheme === "dark" || rawTheme === "light" ? rawTheme : "system";
  });
  securedHandle(MEDIA_CHANNELS.restoreLibrary, () => {
    return restoreLibrary(async () => {
      try {
        return await openLibrary(await ensureHomeLibraryRoot(homedir()));
      } catch (error) {
        if (error instanceof MigrationRecoveryRequired) {
          showMigrationRecovery(error.recovery);
          return null;
        }
        throw error;
      }
    });
  });
  securedHandle(MEDIA_CHANNELS.loadAnnotations, () => {
    const operation = mediaState.captureActive();
    const assertCurrent = (): void => mediaState.assertActive(operation);
    return guardedResult(
      mediaState,
      operation,
      () => loadAnnotations(operation.rootPath, { assertCurrent }),
    );
  });
  securedHandle(MEDIA_CHANNELS.updateAnnotations, (_event, updates: unknown) => {
    const operation = mediaState.captureActive();
    const assertCurrent = (): void => mediaState.assertActive(operation);
    return guardedResult(
      mediaState,
      operation,
      () => updateAnnotations(operation.rootPath, updates, { assertCurrent }),
    );
  });
  securedHandle(MEDIA_CHANNELS.trashItems, (_event, rawPaths: unknown) => {
    const operation = mediaState.captureActive();
    if (
      !Array.isArray(rawPaths)
      || rawPaths.length > MAX_TRASH_ITEMS
      || !rawPaths.every((path) => typeof path === "string")
    ) {
      throw new Error("Invalid Trash paths");
    }
    const paths = rawPaths.map((path) => parseString(path, "Trash path"));
    return trashAuthorizedItems(
      operation.rootPath,
      paths,
      mediaState.fileAccess,
      (path) => shell.trashItem(path),
      () => mediaState.assertActive(operation),
    );
  });
  securedHandle(MEDIA_CHANNELS.showInFinder, (_event, rawPath: unknown) => {
    const operation = mediaState.captureActive();
    const path = parseString(rawPath, "Finder path");
    return guardedSideEffect(
      mediaState,
      operation,
      () => mediaState.fileAccess.resolveFile(operation.rootPath, path),
      (resolvedPath) => shell.showItemInFolder(resolvedPath),
    );
  });
  securedHandle(MEDIA_CHANNELS.openExternal, (_event, rawPath: unknown) => {
    const operation = mediaState.captureActive();
    const path = parseString(rawPath, "external path");
    return guardedSideEffect(
      mediaState,
      operation,
      () => mediaState.fileAccess.resolveFile(operation.rootPath, path),
      (resolvedPath) => shell.openPath(resolvedPath),
    );
  });
  securedHandle(MEDIA_CHANNELS.startFileDrag, (event, rawPath: unknown) => {
    const operation = mediaState.captureActive();
    const path = parseString(rawPath, "drag path");
    const resolvedPath = mediaState.fileAccess.resolveFileForDrag(
      operation.rootPath,
      path,
    );
    mediaState.assertActive(operation);
    event.sender.startDrag({
      file: resolvedPath,
      icon: fileDragIcon(),
    });
  });
  securedHandle(MEDIA_CHANNELS.copyText, (_event, rawText: unknown) => {
    const text = parseString(rawText, "clipboard text", CLIPBOARD_LIMIT);
    clipboard.writeText(text);
  });
  securedHandle(MEDIA_CHANNELS.copyMigrationRecoveryCommand, () => {
    if (!migrationRecovery) throw new Error("No migration recovery is active");
    clipboard.writeText(recoveryCommand(migrationRecovery));
  });
  securedHandle(
    MEDIA_CHANNELS.readText,
    (_event, rawPath: unknown, rawMaxBytes?: unknown) => {
      const operation = mediaState.captureActive();
      const maxBytes = typeof rawMaxBytes === "number" && Number.isFinite(rawMaxBytes)
        ? rawMaxBytes
        : undefined;
      const path = parseString(rawPath, "text path");
      return guardedResult(mediaState, operation, async () => {
        const resolvedPath = await mediaState.fileAccess.resolveFile(
          operation.rootPath,
          path,
          ["text"],
        );
        mediaState.assertActive(operation);
        return readBoundedText(operation.rootPath, resolvedPath, maxBytes);
      });
    },
  );
  securedHandle(MEDIA_CHANNELS.getMediaUrl, (_event, rawPath: unknown) => {
    const operation = mediaState.captureActive();
    return mediaUrl(operation, parseString(rawPath, "media path"));
  });
}

function projectReaderForCurrentRoot() {
  const operation = captureBridgeRoot();
  return createProjectReader({
    request: async <Method extends BridgeMethod>(method: Method, params: ParamsFor<Method>): Promise<ResultFor<Method>> => {
      assertBridgeRoot(operation);
      const result = await ralphySession.client.request(method, params);
      assertBridgeRoot(operation);
      return result;
    },
    mint: async (absolutePath, mime, expectedBytes) => {
      const minted = await mediaState.fileAccess.mintTrustedLocator(
        operation.rootPath,
        absolutePath,
        mime,
        expectedBytes,
        () => assertBridgeRoot(operation),
      );
      assertBridgeRoot(operation);
      return { url: `ralphy-media://asset/${minted.token}`, sizeBytes: minted.sizeBytes };
    },
  });
}

function memoryReaderForCurrentRoot() {
  const operation = captureBridgeRoot();
  return createMemoryReader({
    request: async <Method extends BridgeMethod>(method: Method, params: ParamsFor<Method>): Promise<ResultFor<Method>> => {
      assertBridgeRoot(operation);
      const result = await ralphySession.client.request(method, params);
      assertBridgeRoot(operation);
      return result;
    },
  });
}

function calendarReaderForCurrentRoot() {
  const operation = captureBridgeRoot();
  return createCalendarReader({
    request: async <Method extends BridgeMethod>(method: Method, params: ParamsFor<Method>): Promise<ResultFor<Method>> => {
      assertBridgeRoot(operation);
      const result = await ralphySession.client.request(method, params);
      assertBridgeRoot(operation);
      return result;
    },
    mint: async (absolutePath, mime, expectedBytes) => {
      const minted = await mediaState.fileAccess.mintTrustedLocator(
        operation.rootPath,
        absolutePath,
        mime,
        expectedBytes,
        () => assertBridgeRoot(operation),
      );
      assertBridgeRoot(operation);
      return { url: `ralphy-media://asset/${minted.token}`, sizeBytes: minted.sizeBytes };
    },
  });
}

function parseProjectDomainPage(value: unknown): {
  tab: "documents" | "media" | "compositions" | "units" | "activity";
  project: ProjectReference;
  cursor?: string | number | null;
  mediaQuery?: ProjectMediaQuery;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Project page request");
  }
  const input = value as Record<string, unknown>;
  if (!Reflect.ownKeys(input).every((key) => (
    key === "tab" || key === "project" || key === "cursor" || key === "mediaQuery"
  ))) throw new Error("Invalid Project page request");
  if (![
    "documents", "media", "compositions", "units", "activity",
  ].includes(input.tab as string)) throw new Error("Invalid Project tab");
  if (
    input.cursor !== undefined
    && input.cursor !== null
    && typeof input.cursor !== "string"
    && (!Number.isSafeInteger(input.cursor) || (input.cursor as number) < 0)
  ) throw new Error("Invalid Project cursor");
  const mediaQuery = input.mediaQuery === undefined ? undefined : parseProjectMediaQuery(input.mediaQuery);
  return {
    tab: input.tab as "documents" | "media" | "compositions" | "units" | "activity",
    project: parseProjectReference(input.project),
    ...(input.cursor === undefined ? {} : { cursor: input.cursor as string | number | null }),
    ...(mediaQuery === undefined ? {} : { mediaQuery }),
  };
}

function parseProjectMediaQuery(value: unknown): ProjectMediaQuery {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Media query");
  }
  const query = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(query);
  if (!keys.every((key) => key === "filter" || key === "mediaKind" || key === "provenance")
    || !PROJECT_MEDIA_FILTERS.includes(query.filter as ProjectMediaFilter)
    || (query.mediaKind !== undefined && ![
      "image", "video", "audio", "document", "other",
    ].includes(query.mediaKind as ProjectMediaKind))
    || (query.provenance !== undefined && ![
      "generation", "not-generation", "unknown",
    ].includes(query.provenance as MediaProvenance))) {
    throw new Error("Invalid Media query");
  }
  return query as ProjectMediaQuery;
}

function parseProjectMediaRef(value: unknown): { type: "artifact" | "run-object" | "object"; id: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Media reference");
  const ref = value as Record<string, unknown>;
  if (!["artifact", "run-object", "object"].includes(ref.type as string)) throw new Error("Invalid Media reference");
  return { type: ref.type as "artifact" | "run-object" | "object", id: parseString(ref.id, "Media identifier", 256) };
}

function registerProjectDomainIpc(): void {
  registerMarketplaceLibraryIpc({
    handle: (channel, listener) => {
      ipcMain.handle(channel, (event, ...args) => listener(event, ...args));
    },
    getWindow: () => win,
    captureRoot: captureBridgeRoot,
    assertRoot: assertBridgeRoot,
    fetcher: (input, init) => net.fetch(input instanceof URL ? input.href : input, init),
    cachePath: join(app.getPath("userData"), "marketplace-public-library.json"),
    now: Date.now,
  });
  registerWorkspaceOverviewIpc({
    handle: (channel, listener) => {
      ipcMain.handle(channel, (event, workspaceId) => listener(event, workspaceId));
    },
    getWindow: () => win,
    captureRoot: captureBridgeRoot,
    assertRoot: assertBridgeRoot,
    session: ralphySession,
  });
  registerSharedLibraryIpc({
    handle: (channel, listener) => {
      ipcMain.handle(channel, (event, ...args) => listener(event, ...args));
    },
    getWindow: () => win,
    captureRoot: captureBridgeRoot,
    assertRoot: assertBridgeRoot,
    session: ralphySession,
    mintTrustedLocator: async (operation, absolutePath, mime, expectedBytes, assertCurrent) => {
      const minted = await mediaState.fileAccess.mintTrustedLocator(
        operation.rootPath,
        absolutePath,
        mime,
        expectedBytes,
        assertCurrent,
      );
      assertCurrent();
      return { url: `ralphy-media://asset/${minted.token}`, sizeBytes: minted.sizeBytes };
    },
    authorizeTrustedLocator: (operation, absolutePath, mime, expectedBytes, assertCurrent) => (
      mediaState.fileAccess.authorizeTrustedLocator(
        operation.rootPath,
        absolutePath,
        mime,
        expectedBytes,
        assertCurrent,
      )
    ),
    openPath: (path) => shell.openPath(path),
    showItemInFolder: (path) => shell.showItemInFolder(path),
  });
  registerProjectMediaIpc({
    handle: (channel, listener) => {
      ipcMain.handle(channel, (event, ...args) => listener(event, ...args));
    },
    getWindow: () => win,
    captureRoot: captureBridgeRoot,
    assertRoot: assertBridgeRoot,
    session: ralphySession,
    authorizeTrustedLocator: (operation, absolutePath, mime, expectedBytes, assertCurrent) => (
      mediaState.fileAccess.authorizeTrustedLocator(
        operation.rootPath,
        absolutePath,
        mime,
        expectedBytes,
        assertCurrent,
      )
    ),
    openPath: (path) => shell.openPath(path),
    showItemInFolder: (path) => shell.showItemInFolder(path),
    writeBuffer: (format, data) => clipboard.writeBuffer(format, data),
  });
  securedHandle(MEDIA_CHANNELS.loadMemory, (_event, rawWorkspaceId: unknown, rawInput: unknown) => (
    memoryReaderForCurrentRoot().list(
      parseString(rawWorkspaceId, "Workspace identifier", 256),
      rawInput as never,
    )
  ));
  securedHandle(MEDIA_CHANNELS.showMemory, (_event, rawWorkspaceId: unknown, rawEntryId: unknown) => (
    memoryReaderForCurrentRoot().show(
      parseString(rawWorkspaceId, "Workspace identifier", 256),
      parseString(rawEntryId, "Memory identifier", 256),
    )
  ));
  securedHandle(MEDIA_CHANNELS.mutateMemory, (_event, rawWorkspaceId: unknown, rawInput: unknown) => (
    memoryReaderForCurrentRoot().mutate(
      parseString(rawWorkspaceId, "Workspace identifier", 256),
      rawInput as never,
    )
  ));
  securedHandle(MEDIA_CHANNELS.loadMemoryHistory, (_event, rawWorkspaceId: unknown, rawEntryId: unknown) => (
    memoryReaderForCurrentRoot().history(
      parseString(rawWorkspaceId, "Workspace identifier", 256),
      parseString(rawEntryId, "Memory identifier", 256),
    )
  ));
  securedHandle(MEDIA_CHANNELS.recallMemory, (_event, rawWorkspaceId: unknown) => (
    memoryReaderForCurrentRoot().recall(parseString(rawWorkspaceId, "Workspace identifier", 256))
  ));
  securedHandle(MEDIA_CHANNELS.loadMemoryHealth, (_event, rawWorkspaceId: unknown) => (
    memoryReaderForCurrentRoot().health(parseString(rawWorkspaceId, "Workspace identifier", 256))
  ));
  securedHandle(MEDIA_CHANNELS.loadCalendar, (_event, rawWorkspaceId: unknown, rawInput: unknown) => (
    calendarReaderForCurrentRoot().load(
      parseString(rawWorkspaceId, "Workspace identifier", 256),
      rawInput as never,
    )
  ));
  securedHandle(MEDIA_CHANNELS.mutateCalendar, (_event, rawWorkspaceId: unknown, rawInput: unknown) => (
    calendarReaderForCurrentRoot().mutate(
      parseString(rawWorkspaceId, "Workspace identifier", 256),
      rawInput as never,
    )
  ));
  securedHandle(MEDIA_CHANNELS.reconnectCalendarAccount, (_event, rawWorkspaceId: unknown, rawInput: unknown) => (
    calendarReaderForCurrentRoot().reconnect(
      parseString(rawWorkspaceId, "Workspace identifier", 256),
      rawInput as never,
    )
  ));
  securedHandle(MEDIA_CHANNELS.resolveCalendarPreview, (_event, rawWorkspaceId: unknown, rawProjectId: unknown, rawRef: unknown) => (
    calendarReaderForCurrentRoot().resolvePreview(
      parseString(rawWorkspaceId, "Workspace identifier", 256),
      rawProjectId === null ? null : parseString(rawProjectId, "Project identifier", 256),
      rawRef as never,
    )
  ));
  securedHandle(MEDIA_CHANNELS.loadProjectOverview, (_event, rawProject: unknown) => (
    projectReaderForCurrentRoot().loadOverview(parseProjectReference(rawProject))
  ));
  securedHandle(MEDIA_CHANNELS.loadProjectPage, (_event, rawInput: unknown) => (
    projectReaderForCurrentRoot().loadPage(parseProjectDomainPage(rawInput))
  ));
  securedHandle(MEDIA_CHANNELS.loadProjectActivityRun, (_event, rawProject: unknown, rawRunId: unknown) => (
    projectReaderForCurrentRoot().loadProjectActivityRun(
      parseProjectReference(rawProject),
      parseString(rawRunId, "Run identifier", 256),
    )
  ));
  securedHandle(
    MEDIA_CHANNELS.loadDocumentPreview,
    (_event, rawProject: unknown, rawRevisionId: unknown) => (
      projectReaderForCurrentRoot().loadDocumentPreview(
        parseProjectReference(rawProject),
        parseString(rawRevisionId, "Document revision identifier", 256),
      )
    ),
  );
  securedHandle(
    MEDIA_CHANNELS.showProjectDocument,
    (_event, rawProject: unknown, rawDocumentId: unknown) => (
      projectReaderForCurrentRoot().showDocument(
        parseProjectReference(rawProject),
        parseString(rawDocumentId, "document id", 256),
      )
    ),
  );
  securedHandle(
    MEDIA_CHANNELS.reviseProjectDocument,
    (_event, rawProject: unknown, rawInput: unknown) => (
      projectReaderForCurrentRoot().reviseDocument(
        parseProjectReference(rawProject),
        parseDocumentRevision(rawInput),
      )
    ),
  );
  securedHandle(
    MEDIA_CHANNELS.resolveProjectPreview,
    (_event, rawProject: unknown, rawRef: unknown) => (
      projectReaderForCurrentRoot().resolvePreview(
        parseProjectReference(rawProject),
        parseProjectMediaRef(rawRef),
      )
    ),
  );
  securedHandle(
    MEDIA_CHANNELS.reviseProjectComposition,
    (_event, rawProject: unknown, rawInput: unknown) => (
      projectReaderForCurrentRoot().reviseComposition(
        parseProjectReference(rawProject),
        parseCompositionRevision(rawInput),
      )
    ),
  );
  securedHandle(
    MEDIA_CHANNELS.selectProjectCompositionRevision,
    (_event, rawProject: unknown, rawInput: unknown) => (
      projectReaderForCurrentRoot().selectCompositionRevision(
        parseProjectReference(rawProject),
        parseCompositionSelection(rawInput),
      )
    ),
  );
  securedHandle(
    MEDIA_CHANNELS.buildProjectComposition,
    (_event, rawProject: unknown, rawRevisionId: unknown, rawProfile: unknown) => (
      projectReaderForCurrentRoot().buildComposition(
        parseProjectReference(rawProject),
        parseString(rawRevisionId, "composition revision id", 256),
        rawProfile === undefined ? undefined : parseJsonValue(rawProfile),
      )
    ),
  );
  securedHandle(
    MEDIA_CHANNELS.resolveCompositionOutputPreview,
    (_event, rawProject: unknown, rawRevisionId: unknown) => (
      projectReaderForCurrentRoot().resolveCompositionOutputPreview(
        parseProjectReference(rawProject),
        parseString(rawRevisionId, "artifact revision id", 256),
      )
    ),
  );
}

function createWindow(): void {
  const savedBounds = readWindowBounds();
  const initialBounds = savedBounds
    ? fitWindowBounds(
      savedBounds,
      screen.getDisplayMatching(savedBounds).workArea,
      MINIMUM_WINDOW_SIZE,
    )
    : DEFAULT_WINDOW_SIZE;
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const rendererUrl = devUrl ?? pathToFileURL(RENDERER).toString();
  const createdWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: MINIMUM_WINDOW_SIZE.width,
    minHeight: MINIMUM_WINDOW_SIZE.height,
    titleBarStyle: "hiddenInset",
    /* The app has one chrome line and the lights stand on it. y is the light's own frame origin and
       that frame is 16 tall, so the line is y + 8 = 24 -- the same line macOS itself uses, read off
       a native window through the accessibility API rather than guessed: ChatGPT's lights report a
       frame origin 16 below its window top. Every chrome row is 32 tall on the window's 8 line, so
       its centre is 8 + 16 = 24 too. x stays at 22 rather than the system's 15, because our window
       pads itself by 8 and the sidebar card by 14: the lights belong inside the card, not on its
       edge. Both rows share the one line deliberately -- the lights are drawn at a fixed window
       offset, so a second line would be a row they can never sit on, and repositioning them per
       sidebar toggle would put an IPC round trip in the middle of an animation. */
    trafficLightPosition: { x: 22, y: 16 },
    backgroundColor: INSTRUMENT_PALETTE.dark.desk,
    show: !SMOKE_TEST && !INSTRUMENT_SHELL_AUDIT,
    webPreferences: secureWebPreferences(join(__dirname, "preload.cjs")),
  });
  const persistBounds = (): void => {
    void writeWindowBounds(createdWindow.getNormalBounds()).catch(() => undefined);
  };
  createdWindow.on("resized", persistBounds);
  createdWindow.on("moved", persistBounds);
  createdWindow.on("close", (event) => {
    persistBounds();
    void quitCoordinator.request(event);
  });
  createdWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === "http:" || target.protocol === "https:") {
        void shell.openExternal(target.toString());
      }
    } catch {
      // Malformed links are ignored at the renderer trust boundary.
    }
    return { action: "deny" };
  });
  installNavigationGuards(createdWindow.webContents, rendererUrl);
  createdWindow.webContents.on("before-input-event", (event, input) => {
    const command = input.meta && !input.alt && !input.control && !input.shift;
    if (
      input.type === "keyDown"
      && command
      && input.key.toLocaleLowerCase() === "r"
    ) {
      event.preventDefault();
      sendIfWindowAlive(createdWindow, APP_CHANNELS.toggleRightPanel, undefined);
    }
  });
  win = createdWindow;
  createdWindow.on("closed", () => {
    if (win === createdWindow) win = null;
    if (INSTRUMENT_SHELL_AUDIT) app.quit();
  });
  if (devUrl) void createdWindow.loadURL(devUrl);
  else void createdWindow.loadFile(RENDERER);
  if (SMOKE_TEST) {
    createdWindow.webContents.once("did-finish-load", () => {
      void (async () => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const ready = await createdWindow.webContents.executeJavaScript(
            `(() => {
              if (
                !document.querySelector(".workbench")
                || !window.ralphy?.restoreLibrary
                || !window.ralphy?.getAgentProviders
                || !window.ralphy?.sendAgentMessage
                || !window.ralphy?.onToggleRightPanel
                || !CSS.supports("corner-shape", "squircle")
              ) return false;
              const fixture = document.createElement("div");
              fixture.innerHTML = [
                '<div class="project-facts"><span>Fact</span></div>',
                '<button class="structure-row">Row</button>',
                '<div class="project-controls"></div>',
              ].join("");
              document.body.append(fixture);
              const fact = getComputedStyle(fixture.children[0].children[0]);
              const row = getComputedStyle(fixture.children[1]);
              const controls = getComputedStyle(fixture.children[2]);
              const valid =
                Number.parseFloat(fact.fontSize) >= 11
                && fact.getPropertyValue("corner-shape").trim() === "round"
                && row.borderBottomWidth === "0px"
                && controls.containerName === "project-controls";
              fixture.remove();
              return valid;
            })()`,
          );
          if (ready) {
            console.log("RALPHY_SMOKE_READY");
            await new Promise((resolveReady) => setTimeout(resolveReady, 100));
            app.exit(0);
            return;
          }
          await new Promise((resolveReady) => setTimeout(resolveReady, 50));
        }
        app.exit(1);
      })().catch((error: unknown) => {
        console.error(error);
        app.exit(1);
      });
    });
  }
}

function stopBackgroundResources(): Promise<void> {
  if (backgroundShutdown) return backgroundShutdown;
  activeAgentSession?.stop();
  stopMediaRuntime(mediaState, { watcher, worker });
  worker = null;
  backgroundShutdown = shutdownRoot?.() ?? Promise.resolve();
  return backgroundShutdown;
}

function startSecretHandoff(): void {
  void app.whenReady().then(async () => {
    try {
      const userData = app.getPath("userData");
      const request = await readSecretHandoffRequest(process.stdin);
      const provider = secretProviderFromRef(request.ref);
      if (!provider) throw new Error("Unsupported secret handoff provider");
      const sourcePath = await realpath(join(dirname(dirname(dirname(request.stagedRoot))), ".ralphy"));
      if (SMOKE_TEST) {
        await captureStagedRootIdentity(request.stagedRoot);
        app.exit(0);
        return;
      }
      await runSecretHandoff(request, {
        stores: {
          anthropic: new ClaudeCredentialStore({
            path: join(userData, secretFileForProvider("anthropic")),
            cipher: safeStorage,
          }),
          openrouter: new EncryptedCredentialStore({
            path: join(userData, secretFileForProvider("openrouter")),
            cipher: safeStorage,
            validate: validateOpenRouterApiKey,
          }),
        },
        createBridge: (root) => new RalphyBridgeClient(
          ralphyBin ? { bin: ralphyBin, root } : { root },
        ),
        captureRoot: captureStagedRootIdentity,
        sourcePath,
        encryptedSourcePath: await realpath(join(userData, secretFileForProvider(provider))),
      });
      app.exit(0);
    } catch {
      app.exit(1);
    }
  });
}

function startNormalDesktop(): void {
  ralphySession = new RalphySession(ralphyBin ? { bin: ralphyBin } : {});
  activitySynchronizer = createActivitySynchronizer({
    createSubscriptionId: randomUUID,
    onRefresh: (event) => emitMedia({ type: "activity-refresh", ...event }),
    onError: () => emitMedia({
      type: "error",
      operation: "activity-subscribe",
      message: "Live activity updates are unavailable",
    }),
  });
  shutdownRoot = createRootShutdown(
    () => activitySynchronizer.stop(),
    () => ralphySession.close(),
  );
  backgroundShutdown = null;
  quitCoordinator = createQuitCoordinator(
    stopBackgroundResources,
    () => app.quit(),
  );
  watcher = new ActiveRootResource<LibraryWatcher>();
  protocol.registerSchemesAsPrivileged([{
    scheme: "ralphy-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  }]);
  registerMediaIpc();
  registerProjectDomainIpc();
  registerAgentIpc();

  void app.whenReady().then(() => {
    electronSession.defaultSession.setPermissionRequestHandler(denyPermissionRequest);
    protocol.handle("ralphy-media", async (request) => {
      try {
        const operation = mediaState.captureActive();
        const assertCurrent = (): void => mediaState.assertActive(operation);
        const url = new URL(request.url);
        if (url.hostname !== "asset") return new Response("Not found", { status: 404 });
        const token = url.pathname.slice(1);
        const safePath = await mediaState.fileAccess.resolve(
          operation.rootPath,
          token,
          assertCurrent,
        );
        assertCurrent();
        const info = await stat(safePath);
        assertCurrent();
        if (
          url.searchParams.get("purpose") === "waveform"
          && info.size > MAX_WAVEFORM_DECODE_BYTES
        ) {
          return new Response("Waveform source exceeds the decode limit", {
            status: 413,
          });
        }
        const requestedRange = request.headers.get("range");
        const range = resolveMediaByteRange(requestedRange, info.size);
        if (requestedRange !== null && range === null) {
          return new Response(null, {
            status: 416,
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Range": `bytes */${info.size}`,
            },
          });
        }
        const response = await net.fetch(pathToFileURL(safePath).toString(), {
          headers: range
            ? { Range: `bytes=${range.start}-${range.end}` }
            : undefined,
        });
        assertCurrent();
        const headers = new Headers(response.headers);
        headers.set("Accept-Ranges", "bytes");
        headers.set(
          "Content-Length",
          String(range ? range.end - range.start + 1 : info.size),
        );
        if (range) {
          headers.set(
            "Content-Range",
            `bytes ${range.start}-${range.end}/${info.size}`,
          );
        }
        return new Response(response.body, {
          status: range ? 206 : response.status,
          statusText: range ? "Partial Content" : response.statusText,
          headers,
        });
      } catch {
        return new Response("Forbidden", { status: 403 });
      }
    });
    createWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on("before-quit", (event) => {
    void quitCoordinator.request(event);
  });
}

dispatchDesktopStartup(process.argv, startSecretHandoff, startNormalDesktop);
