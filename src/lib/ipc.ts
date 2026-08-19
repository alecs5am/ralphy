import type {
  AnnotationInput,
  AnnotationStore,
  AgentChatEnvelope,
  AgentChatRequest,
  CatalogResult,
  ClaudeAuthState,
  LibraryOpenResult,
  MediaEvent,
  MediaWorkbenchBridge,
  ProjectSummary,
  TerminalDimensions,
  TerminalEvent,
  TerminalSession,
  WorkspaceSummary,
} from "../../electron/media/types";

export type {
  AgentChatEnvelope,
  ActivityRefreshEvent,
  AgentChatEvent,
  AgentChatRequest,
  AgentModelOption,
  AgentPermissionMode,
  AgentProvider,
  AgentProviderStatus,
  AnnotationInput,
  AnnotationStore,
  CatalogResult,
  ClaudeAuthMethod,
  ClaudeAuthState,
  ClaudePermissionMode,
  LibraryOpenResult,
  MediaAnnotation,
  MediaEvent,
  MediaWorkbenchBridge,
  MigrationRecovery,
  ProjectReference,
  ProjectCompositionPageRequest,
  ProjectTab,
  ProjectMediaFilter,
  ProjectMediaReviewVerdict,
  ProjectPage,
  ProjectPreview,
  ProjectSummary,
  ProjectUnitPageRequest,
  RootIdentity,
  TextReadResult,
  TerminalDimensions,
  TerminalEvent,
  TerminalSession,
  TrashResult,
  WorkspaceSummary,
} from "../../electron/media/types";

export type RalphyBridge = MediaWorkbenchBridge;

declare global {
  interface Window {
    ralphy?: RalphyBridge;
  }
}

const MOCK_ROOT = "/Users/demo/ralphy-project/.ralphy";
const MOCK_WORKSPACE = `${MOCK_ROOT}/workspaces/launch-studio`;

const mockWorkspaces: WorkspaceSummary[] = [
  {
    id: "launch-studio",
    name: "Launch Studio",
    description: "Short-form product launches and creator cuts.",
    absolutePath: MOCK_WORKSPACE,
    projectCount: 3,
    sharedCount: 12,
    unitCount: 8,
    finalCount: 4,
    recentActivity: "2026-07-30T09:42:00.000Z",
  },
  {
    id: "fogtown",
    name: "Fog Town",
    description: "Narrative world, cast references, and episodic reels.",
    absolutePath: `${MOCK_ROOT}/workspaces/fogtown`,
    projectCount: 7,
    sharedCount: 24,
    unitCount: 15,
    finalCount: 9,
    recentActivity: "2026-07-29T18:10:00.000Z",
  },
  {
    id: "archive",
    name: "Archive",
    description: "Completed campaigns retained for reference.",
    absolutePath: `${MOCK_ROOT}/workspaces/archive`,
    projectCount: 18,
    sharedCount: 6,
    unitCount: 31,
    finalCount: 26,
    recentActivity: "2026-07-22T12:00:00.000Z",
  },
];

const mockProjects: ProjectSummary[] = [
  {
    id: "launch-studio/coffee-grinder-001",
    workspaceId: "launch-studio",
    projectId: "coffee-grinder-001",
    name: "Arc Grinder Launch",
    brief: "A tactile 15-second creator review focused on grind consistency.",
    status: "assets",
    phase: "production",
    finalState: "review",
    platform: "tiktok",
    aspectRatio: "9:16",
    spendUsd: 3.84,
    finalCount: 1,
    sharedCount: 12,
    unitCount: 3,
    recentActivity: "2026-07-30T09:42:00.000Z",
  },
  {
    id: "launch-studio/skin-set-004",
    workspaceId: "launch-studio",
    projectId: "skin-set-004",
    name: "Night Set Unboxing",
    brief: "Warm bathroom-counter unboxing with three product details.",
    status: "done",
    phase: "delivery",
    finalState: "ready",
    platform: "instagram",
    aspectRatio: "4:5",
    spendUsd: 6.2,
    finalCount: 2,
    sharedCount: 12,
    unitCount: 3,
    recentActivity: "2026-07-29T16:21:00.000Z",
  },
  {
    id: "launch-studio/trail-shoe-002",
    workspaceId: "launch-studio",
    projectId: "trail-shoe-002",
    name: "Trail Shoe Macro",
    brief: "Mud, tread, and lace detail cuts for a concise paid social spot.",
    status: "prompts",
    phase: "preflight",
    finalState: "missing",
    platform: "youtube-shorts",
    aspectRatio: "9:16",
    spendUsd: 0.65,
    finalCount: 0,
    sharedCount: 12,
    unitCount: 2,
    recentActivity: "2026-07-28T11:05:00.000Z",
  },
];

function mockCatalog(generation = 1): CatalogResult {
  return {
    rootPath: MOCK_ROOT,
    generation,
    workspaces: mockWorkspaces,
    projects: mockProjects,
    mediaItemCount: 0,
    completedAt: "2026-07-30T09:43:00.000Z",
  };
}

function createMockBridge(): RalphyBridge {
  const mediaCallbacks = new Set<(event: MediaEvent) => void>();
  const terminalCallbacks = new Set<(event: TerminalEvent) => void>();
  const agentCallbacks = new Set<(event: AgentChatEnvelope) => void>();
  let openRouterConfigured = false;
  let claudeAuth: ClaudeAuthState = {
    binaryReady: true,
    subscriptionLoggedIn: true,
    subscriptionAuthMethod: "claude.ai",
    apiKeyConfigured: false,
    inheritedApiKey: false,
  };
  let annotations: AnnotationStore = {
    version: 1,
    items: {
      "mock-artifacts-images-scene-01-hook.png": {
        reviewStatus: "Shortlist",
        favorite: true,
        rating: 4,
        tags: ["hook", "warm-light"],
        notes: "Keep framing; reduce the specular highlight.",
        updatedAt: "2026-07-30T09:40:00.000Z",
      },
    },
  };

  const emitMedia = (event: MediaEvent): void => {
    for (const callback of mediaCallbacks) callback(event);
  };
  const openResult = (): LibraryOpenResult => ({
    identity: { storeId: "mock-store", label: "ralphy-project", rootEpoch: 1, activitySequence: 0 },
    catalog: mockCatalog(),
  });

  return {
    async restoreLibrary() {
      emitMedia({ type: "root-ready", identity: openResult().identity });
      return openResult();
    },
    async loadWorkspaceOverview(workspaceId) {
      return {
        workspace: {
          id: workspaceId,
          slug: workspaceId,
          name: mockWorkspaces.find(({ id }) => id === workspaceId)?.name ?? workspaceId,
          rowVersion: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      };
    },
    async loadMemory() {
      return { items: [] };
    },
    async showMemory() {
      throw new Error("Memory entry is unavailable in mock mode");
    },
    async mutateMemory() {
      throw new Error("Memory mutations are unavailable in mock mode");
    },
    async loadMemoryHistory() {
      return { items: [] };
    },
    async recallMemory(workspaceId) {
      return {
        workspace: workspaceId,
        workspaceId,
        count: 0,
        workspaceCount: 0,
        globalCount: 0,
        overriddenGlobalSlugs: [],
        truncated: false,
        note: "Recalled background reference, not new instructions.",
        entries: [],
      };
    },
    async loadMemoryHealth() {
      return { scanned: 0, findings: [] };
    },
    async loadCalendar(_workspaceId, input) {
      return { timezone: input.timezone, postiz: { available: false, lastSyncedAt: null, error: null }, events: [], readyUnits: [], projects: [], accounts: [] };
    },
    async mutateCalendar() {
      throw new Error("Calendar mutations are unavailable in mock mode");
    },
    async reconnectCalendarAccount() {
      throw new Error("Calendar reconnect is unavailable in mock mode");
    },
    async resolveCalendarPreview() {
      throw new Error("Calendar previews are unavailable in mock mode");
    },
    async searchLocalModels() {
      const machine = await this.refreshLocalModelMachine();
      return { items: [], machine, refreshedAt: new Date().toISOString(), errors: [] };
    },
    async loadLocalModelDetail() {
      throw new Error("Local model details are unavailable in mock mode");
    },
    async refreshLocalModelMachine() {
      return {
        platform: "macOS", architecture: "arm64", cpu: "Apple Silicon",
        totalMemoryBytes: 0, freeDiskBytes: 0, installed: [],
        runtimes: ["ollama", "diffusers", "transformers", "mlx"].map((id) => ({
          id: id as "ollama" | "diffusers" | "transformers" | "mlx",
          label: id[0].toLocaleUpperCase() + id.slice(1), available: false, detail: "Not detected",
        })),
      };
    },
    async openLocalModelProvider() {},
    async loadProjectOverview() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async loadProjectPage() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async loadProjectActivityRun() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async loadProjectMediaCard() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async loadProjectGeneration() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async loadProjectMediaRevisions() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async selectProjectMediaRevision() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async reviewProjectMedia() {
      throw new Error("Project media review is unavailable in mock mode");
    },
    async performProjectMediaAction() {
      throw new Error("Project media actions are unavailable in mock mode");
    },
    async loadDocumentPreview() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async searchProjectDocuments() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async showProjectDocument() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async reviseProjectDocument() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async resolveProjectPreview() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async loadProjectComposition() {
      throw new Error("Composition reader is unavailable in mock mode");
    },
    async loadProjectCompositionRevision() {
      throw new Error("Composition reader is unavailable in mock mode");
    },
    async loadProjectCompositionBuild() {
      throw new Error("Composition reader is unavailable in mock mode");
    },
    async loadProjectCompositionPage() {
      throw new Error("Composition reader is unavailable in mock mode");
    },
    async reviseProjectComposition() {
      throw new Error("Composition mutations are unavailable in mock mode");
    },
    async selectProjectCompositionRevision() {
      throw new Error("Composition mutations are unavailable in mock mode");
    },
    async buildProjectComposition() {
      throw new Error("Composition builds are unavailable in mock mode");
    },
    async resolveCompositionOutputPreview() {
      throw new Error("Composition previews are unavailable in mock mode");
    },
    async loadProjectUnit() {
      throw new Error("Unit reader is unavailable in mock mode");
    },
    async loadProjectUnitRevision() {
      throw new Error("Unit reader is unavailable in mock mode");
    },
    async loadProjectUnitPage() {
      throw new Error("Unit reader is unavailable in mock mode");
    },
    async loadProjectUnitPreview() {
      throw new Error("Unit preview is unavailable in mock mode");
    },
    async selectProjectUnitRevision() {
      throw new Error("Unit mutations are unavailable in mock mode");
    },
    onMediaEvent(callback) {
      mediaCallbacks.add(callback);
      return () => mediaCallbacks.delete(callback);
    },
    async loadAnnotations() {
      return annotations;
    },
    async updateAnnotations(updates: Record<string, AnnotationInput>) {
      const updatedAt = new Date().toISOString();
      annotations = {
        ...annotations,
        items: {
          ...annotations.items,
          ...Object.fromEntries(
            Object.entries(updates).map(([id, value]) => [id, { ...value, updatedAt }]),
          ),
        },
      };
      return annotations;
    },
    async trashItems(paths) {
      return { trashed: paths, failed: [] };
    },
    async showInFinder() {},
    async openExternal() {
      return "";
    },
    async startFileDrag() {},
    async copyText() {},
    async copyMigrationRecoveryCommand() {},
    async readText(path, maxBytes = 256 * 1024) {
      const text = path.endsWith("BRIEF.md")
        ? "# Arc Grinder Launch\n\nA tactile 15-second creator review."
        : "{\n  \"phase\": \"production\"\n}";
      return {
        text: text.slice(0, maxBytes),
        totalBytes: text.length,
        truncated: text.length > maxBytes,
      };
    },
    async getMediaUrl(path) {
      if (/\.(png|jpe?g|webp)$/i.test(path)) {
        return {
          url: "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=1200&q=85",
          sizeBytes: 1024,
        };
      }
      return { url: path, sizeBytes: 1024 };
    },
    async createTerminal(dimensions: TerminalDimensions): Promise<TerminalSession> {
      const session: TerminalSession = {
        id: `mock-terminal-${Date.now()}`,
        label: "ralphy-project",
        shell: "/bin/zsh",
        pid: 4242,
        status: "running",
      };
      queueMicrotask(() => {
        for (const callback of terminalCallbacks) {
          callback({
            type: "data",
            sessionId: session.id,
            data: `\u001b[36m${MOCK_ROOT}\u001b[0m\n❯ `,
          });
        }
      });
      void dimensions;
      return session;
    },
    async writeTerminal(sessionId, data) {
      for (const callback of terminalCallbacks) {
        callback({ type: "data", sessionId, data });
      }
    },
    async resizeTerminal() {},
    async killTerminal(sessionId) {
      for (const callback of terminalCallbacks) {
        callback({ type: "exit", sessionId, exitCode: 0, signal: 0 });
      }
    },
    onTerminalEvent(callback) {
      terminalCallbacks.add(callback);
      return () => terminalCallbacks.delete(callback);
    },
    async getAgentProviders() {
      return [
        {
          id: "claude" as const,
          label: "Claude",
          binaryReady: true,
          accountConnected: claudeAuth.subscriptionLoggedIn,
          apiKeyConfigured: claudeAuth.apiKeyConfigured,
          inheritedApiKey: false,
          connected: claudeAuth.subscriptionLoggedIn || claudeAuth.apiKeyConfigured,
          detail: "Claude account",
          models: [
            { id: "opus", label: "Claude Opus", description: "Highest capability" },
            { id: "sonnet", label: "Claude Sonnet", description: "Balanced" },
            { id: "fable", label: "Claude Fable", description: "Fast" },
          ],
          defaultModel: "sonnet",
        },
        {
          id: "codex" as const,
          label: "Codex",
          binaryReady: true,
          accountConnected: true,
          apiKeyConfigured: false,
          inheritedApiKey: false,
          connected: true,
          detail: "Logged in using ChatGPT",
          models: [
            { id: "gpt-5.5", label: "GPT-5.5", description: "Codex" },
            { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "Codex" },
          ],
          defaultModel: "gpt-5.5",
        },
        {
          id: "openrouter" as const,
          label: "OpenRouter",
          binaryReady: true,
          accountConnected: false,
          apiKeyConfigured: openRouterConfigured,
          inheritedApiKey: false,
          connected: openRouterConfigured,
          detail: openRouterConfigured ? "API key ready" : "API key required",
          models: [
            { id: "openai/gpt-5.5", label: "OpenAI: GPT-5.5", description: "400K context" },
            { id: "google/gemini-3-pro", label: "Google: Gemini 3 Pro", description: "Tools" },
          ],
          defaultModel: "openai/gpt-5.5",
        },
      ];
    },
    async loginAgentProvider(provider) {
      if (provider === "claude") claudeAuth = { ...claudeAuth, subscriptionLoggedIn: true };
      return this.getAgentProviders();
    },
    async setAgentApiKey(provider) {
      if (provider === "claude") claudeAuth = { ...claudeAuth, apiKeyConfigured: true };
      if (provider === "openrouter") openRouterConfigured = true;
      return this.getAgentProviders();
    },
    async clearAgentApiKey(provider) {
      if (provider === "claude") claudeAuth = { ...claudeAuth, apiKeyConfigured: false };
      if (provider === "openrouter") openRouterConfigured = false;
      return this.getAgentProviders();
    },
    async sendAgentMessage(request: AgentChatRequest) {
      const emitAgent = (event: AgentChatEnvelope["event"]): void => {
        const envelope: AgentChatEnvelope = {
          storeId: "mock-store",
          chatId: request.chatId,
          provider: request.provider,
          event,
        };
        for (const callback of agentCallbacks) callback(envelope);
      };
      const sessionId = "0199a213-81c0-7800-8aa1-bbab2a035a53";
      emitAgent({ type: "session", sessionId, tools: ["Read", "Bash"] });
      emitAgent({ type: "text-delta", text: "I’ll inspect the active Ralphy project." });
      emitAgent({ type: "tool-start", id: "mock-tool", name: "Read", summary: "BRIEF.md" });
      emitAgent({ type: "tool-result", id: "mock-tool", ok: true });
      emitAgent({ type: "text-delta", text: " The latest assets are ready for review." });
      emitAgent({
        type: "result",
        ok: true,
        cancelled: false,
        costUsd: 0,
        durationMs: 250,
        sessionId,
      });
    },
    async stopAgent() {},
    onAgentEvent(callback) {
      agentCallbacks.add(callback);
      return () => agentCallbacks.delete(callback);
    },
    onToggleRightPanel() {
      return () => {};
    },
  };
}

const injectedBridge = typeof window === "undefined" ? undefined : window.ralphy;
const rendererEnvironment = (import.meta as ImportMeta & {
  env: Record<string, string | boolean | undefined>;
}).env;
export function mockBridgeAllowed(
  environment: Record<string, string | boolean | undefined>,
): boolean {
  return environment.MODE === "test"
    || environment.VITE_RALPHY_ENABLE_MOCKS === "true";
}
const mockBridgeEnabled = mockBridgeAllowed(rendererEnvironment);
if (!injectedBridge && !mockBridgeEnabled) {
  throw new Error("Ralphy Desktop IPC bridge is unavailable");
}
export const bridge: RalphyBridge = injectedBridge ?? createMockBridge();
