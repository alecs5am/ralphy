/**
 * The bridge the renderer talks to when Electron has not injected one: the design harnesses, the
 * tests and the mock-only dev build.
 *
 * Most calls refuse rather than invent -- an empty page is a real state a screen must draw, an
 * invented history is not. The project route and the agent providers are the two that answer in
 * full, and they live in the two files beside this one.
 */
import type {
  AnnotationInput,
  AnnotationStore,
  LibraryOpenResult,
  MarketplacePublicSnapshotDto,
  MediaEvent,
} from "../../../electron/media/types";
import type { RalphyBridge } from "./ipc";
import { mockCatalog, mockWorkspaces } from "./mock-fixtures";
import { mockAgentSurfaces } from "./mock-agent-bridge";
import { mockProjectSurfaces } from "./mock-project-bridge";

/* The injected bridge arrives as an argument rather than being read from `window`: the mock is
   built by `ipc.ts`, which is the one place that decides which bridge wins, and nothing here may
   reach back into that decision. */
export function createMockBridge(injectedBridge?: RalphyBridge): RalphyBridge {
  const mediaCallbacks = new Set<(event: MediaEvent) => void>();
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
    /* No host, no path: a dropped file falls back to its own name, which is still a reference the
       operator can see. */
    pathForFile: () => null,
    /* No provider, no title: the mock leaves a chat with the name it has. */
    async summariseAgentTitle() { return null; },
    /* Nothing to read in a mock library: the page's places are real files or they are absent. */
    async readContextPath() { return null; },
    async loadAgentContext({ provider }) {
      /* The mock states the same shape with nothing in it: a demo library reaches no files, and
         every band says so rather than the page rendering as though it failed to load. */
      return {
        provider,
        cwd: "/mock",
        preamble: "[Ralphy Media context]\nLibrary: /mock\n[/Ralphy Media context]",
        blocks: [],
        layers: (["machine", "ralphy", "workspace", "project", "skills"] as const).map((id) => ({
          id,
          label: id[0]!.toLocaleUpperCase() + id.slice(1),
          note: "mock bridge — no provider runs here",
          rows: [],
          count: null,
          unavailable: "No provider runs in the mock bridge",
          warning: null,
        })),
      };
    },
    async restoreLibrary() {
      emitMedia({ type: "root-ready", identity: openResult().identity });
      return openResult();
    },
    async loadMarketplacePublicLibrary(): Promise<MarketplacePublicSnapshotDto> {
      throw new Error("Marketplace public catalog is unavailable in mock mode");
    },
    async loadMarketplacePackCatalog() {
      return { schemaVersion: 1 as const, cliVersion: null, entries: [], unavailable: "The bundled catalog is unavailable in mock mode" };
    },
    async loadMarketplacePackDocument() {
      throw new Error("The bundled catalog is unavailable in mock mode");
    },
    async loadMarketplaceInstalls() {
      return { schemaVersion: 1 as const, selectedWorkspaceId: null, installs: [], warning: null };
    },
    async mutateMarketplaceInstalls() {
      return { schemaVersion: 1 as const, selectedWorkspaceId: null, installs: [], warning: "Installs are unavailable in mock mode" };
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
    async loadSharedLibraryPage() {
      return { items: [], nextCursor: null };
    },
    async loadSharedLibraryArtifact() {
      throw new Error("Shared Library Artifact is unavailable in mock mode");
    },
    async loadSharedLibraryRevisions() {
      return { items: [], nextCursor: null };
    },
    async selectSharedLibraryRevision() {
      throw new Error("Shared Library mutations are unavailable in mock mode");
    },
    async resolveSharedLibraryPreview() {
      return null;
    },
    async performSharedLibraryAction() {
      throw new Error("Shared Library actions are unavailable in mock mode");
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
    /* Chrome, not data: the mock bridge stands in for the library, not for the window. Whenever
       mocks run inside the real app there is a preload bridge next to them and a real window to
       dress, so this one call goes through rather than being swallowed -- otherwise the design
       harness is the one place the window's own appearance is never set. */
    async applyNativeAppearance(theme) {
      await injectedBridge?.applyNativeAppearance(theme);
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
    onToggleRightPanel() {
      return () => {};
    },
    ...mockProjectSurfaces(),
    ...mockAgentSurfaces(),
  };
}
