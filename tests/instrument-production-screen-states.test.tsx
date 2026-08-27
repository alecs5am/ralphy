import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  isChatRailVisible,
  isWorkspacePickerVisible,
  ProjectScreenLoadingFallback,
} from "@/app/App";
import { PROJECT_VIEWS, type ProjectView } from "@/widgets/project-header/ui/ProjectControls";
import {
  InstrumentScreenRoot,
  type InstrumentRouteKey,
  type InstrumentScenarioState,
} from "@/shared/instrument/screen-state-registry";
import {
  CHAT_RAIL_ROUTE_KEYS,
  PRODUCTION_GLOBAL_OVERLAY_ROUTES,
  PRODUCTION_SCREEN_STATES,
  WORKSPACE_PICKER_ROUTE_KEYS,
} from "@/shared/instrument/production-screen-states";
import { bridge } from "@/shared/api/ipc";
import {
  MARKETPLACE_BASE_ROUTE_KINDS,
  MARKETPLACE_CATEGORY_ROUTE_VALUES,
  MARKETPLACE_LIBRARY_ROUTE_VALUES,
  MARKETPLACE_UNAVAILABLE_DETAIL_ROUTE_VALUES,
  MarketplaceScreenView,
} from "@/pages/marketplace/ui/MarketplaceScreen";
import {
  MemoryScreen,
  memoryInstrumentStates,
} from "@/pages/memory/ui/MemoryScreen";
import { SETTINGS_CATEGORY_IDS } from "@/pages/settings/ui/SettingsScreen";
import {
  projectMarketplacePublicItem,
  type MarketplaceItemPresentation,
  type MarketplaceSnapshot,
} from "@/pages/marketplace/lib/presentation";
import { MarketplaceInstalledModels } from "@/pages/marketplace/ui/MarketplaceModelViews";
import type { MarketplaceLocation, MarketplaceQueryState, MarketplaceRoute } from "@/pages/marketplace/model/navigation";
import { WORKSPACE_PAGES } from "@/shared/model/workbench";
import { createReactHost } from "./react-host";

const actualRouteKeys: readonly InstrumentRouteKey[] = [
  "startup.welcome",
  "startup.library",
  "startup.migration",
  ...WORKSPACE_PAGES.map((page) => `workspace.${page}` as const),
  ...PROJECT_VIEWS.map((view) => `project.${view}` as const),
  ...SETTINGS_CATEGORY_IDS.map((category) => `settings.${category}` as const),
  ...MARKETPLACE_BASE_ROUTE_KINDS.map((route) => `marketplace.${route}` as const),
  ...MARKETPLACE_CATEGORY_ROUTE_VALUES.map((category) => `marketplace.category.${category}` as const),
  ...MARKETPLACE_LIBRARY_ROUTE_VALUES.map((section) => `marketplace.library.${section}` as const),
  ...MARKETPLACE_UNAVAILABLE_DETAIL_ROUTE_VALUES.map((category) => `marketplace.unavailable-detail.${category}` as const),
];

type OwnerInstrumentRoute =
  | `startup.${"welcome" | "library" | "migration"}`
  | `workspace.${(typeof WORKSPACE_PAGES)[number]}`
  | `project.${(typeof PROJECT_VIEWS)[number]}`
  | `settings.${(typeof SETTINGS_CATEGORY_IDS)[number]}`
  | `marketplace.${(typeof MARKETPLACE_BASE_ROUTE_KINDS)[number]}`
  | `marketplace.category.${(typeof MARKETPLACE_CATEGORY_ROUTE_VALUES)[number]}`
  | `marketplace.library.${(typeof MARKETPLACE_LIBRARY_ROUTE_VALUES)[number]}`
  | `marketplace.unavailable-detail.${(typeof MARKETPLACE_UNAVAILABLE_DETAIL_ROUTE_VALUES)[number]}`;
type MissingInstrumentRoute = Exclude<InstrumentRouteKey, OwnerInstrumentRoute>;
type ExtraOwnerRoute = Exclude<OwnerInstrumentRoute, InstrumentRouteKey>;
type MissingProjectView = Exclude<ProjectView, (typeof PROJECT_VIEWS)[number]>;
type MissingMarketplaceRouteKind = Exclude<MarketplaceRoute["kind"],
  | (typeof MARKETPLACE_BASE_ROUTE_KINDS)[number]
  | "category"
  | "library"
  | "unavailable-detail"
>;
const instrumentRouteUnionIsExhaustive: [MissingInstrumentRoute, ExtraOwnerRoute, MissingProjectView, MissingMarketplaceRouteKind] extends [never, never, never, never] ? true : never = true;

const scenarioStates = new Set<InstrumentScenarioState>([
  "restoring", "loading", "ready", "empty", "offline", "partial", "unavailable", "error",
  "selected", "disabled", "editing", "conflict", "history", "viewer", "playing", "scheduling", "mock-review",
]);

const workspacePickerRoutes = actualRouteKeys.filter((routeKey) => (
  routeKey.startsWith("workspace.") || routeKey.startsWith("project.")
));
const chatRailRoutes = actualRouteKeys.filter((routeKey) => (
  routeKey === "startup.library"
  || routeKey.startsWith("workspace.")
  || routeKey.startsWith("project.")
  || routeKey.startsWith("marketplace.")
));

const marketplaceQuery: MarketplaceQueryState = {
  text: "",
  filters: { category: "models", source: "all", license: "all", compatibility: "all", modality: "all", format: "all" },
  sort: "relevance",
};
const modelDetailLocation: MarketplaceLocation = {
  route: { kind: "detail", itemId: "model:huggingface:Acme/alpha" },
  query: marketplaceQuery,
  selectedItemId: "model:huggingface:Acme/alpha",
  scrollTop: 0,
  focusId: "marketplace-heading",
};
/* One bundled row per shelf: enough to prove the shelf renders items. */
function packPresentation(category: "prompts" | "components" | "skills"): MarketplaceItemPresentation {
  const kind = category === "prompts" ? "prompt" : category === "components" ? "component" : "skill";
  return {
    ...templatePresentation,
    origin: "pack",
    key: `pack:${kind}:sample`,
    category,
    name: `Bundled ${kind}`,
    sourceLabel: "Bundled with this build",
    pack: { id: `${kind}:sample`, category: kind, slug: "sample", title: `Bundled ${kind}`, summary: "A bundled document", path: null, tags: [] },
    install: { status: "no-workspace" },
  } as MarketplaceItemPresentation;
}

const marketplaceReady: Extract<MarketplaceSnapshot, { status: "ready" }> = {
  status: "ready",
  items: [],
  categories: [],
  machine: null,
  publicSource: { schemaVersion: 1, source: "live", refreshedAt: "2026-08-21T00:00:00.000Z", sourceUpdatedAt: null, warning: null, items: [] },
  packSource: null,
  sourceErrors: [],
  sourceHealth: { publicLibrary: "ready", models: "ready" },
  refreshing: false,
  query: marketplaceQuery,
};
const localModelDetail = {
  provider: "huggingface" as const,
  id: "Acme/alpha",
  name: "Alpha",
  author: "Acme",
  task: "text-generation",
  modality: "text",
  modelType: "base",
  baseModel: "Alpha",
  license: "apache-2.0",
  gated: false,
  revision: "main",
  lastModified: "2026-08-21T00:00:00.000Z",
  downloads: 1,
  likes: 1,
  tags: [],
  iconUrl: null,
  previewUrl: null,
  providerUrl: "https://huggingface.co/Acme/alpha",
  recommendedPackage: { format: "GGUF", bytes: 1, files: ["alpha.gguf"] },
  comfort: { level: "comfortable" as const, label: "Comfortable here", score: 4, runtime: "ollama", estimatedMemoryBytes: 1, evidence: [] },
  state: "remote" as const,
  permissions: [],
  readme: "# Alpha",
  previewUrls: [],
  files: [{ name: "alpha.gguf", bytes: 1, format: "GGUF", recommended: true, warning: null }],
};
const commonPresentation = {
  summary: "Source-backed item",
  sourceLabel: "Ralphy public library · Live",
  version: { status: "unavailable" as const, reason: "Version unavailable" },
  updatedAt: { status: "unavailable" as const, reason: "Update unavailable" },
  license: { status: "ready" as const, value: "apache-2.0" },
  publisherIdentity: { status: "unavailable" as const, reason: "Publisher unavailable" },
  contentAudit: { status: "unavailable" as const, reason: "Audit unavailable" },
  compatibility: { status: "ready" as const, value: "Comfortable here" },
};
const modelPresentation: MarketplaceItemPresentation = {
  origin: "models",
  ...commonPresentation,
  key: "model:huggingface:Acme/alpha",
  category: "models",
  name: "Alpha",
  model: localModelDetail,
};
const templatePresentation = projectMarketplacePublicItem({
  id: "clean-cut",
  category: "template",
  name: "Clean cut",
  summary: "A concise template",
  referenceUrls: [],
  recipe: null,
}, "live");
const recipePresentation = projectMarketplacePublicItem({
  id: "voxel-dither",
  category: "recipe",
  name: "Voxel dither",
  summary: "A reproducible recipe",
  referenceUrls: [],
  recipe: null,
}, "live");

const marketplaceError: Extract<MarketplaceSnapshot, { status: "error" }> = {
  status: "error",
  error: "Marketplace sources are unavailable",
  sourceErrors: [{ source: "models", scope: "model-catalog", message: "Models unavailable" }],
  sourceHealth: { publicLibrary: "unavailable", models: "unavailable" },
  query: marketplaceQuery,
};
const localMachine = {
  platform: "macOS",
  architecture: "arm64",
  cpu: "Apple",
  totalMemoryBytes: 16,
  freeDiskBytes: 16,
  runtimes: [{ id: "ollama" as const, label: "Ollama", available: true, detail: "Detected" }],
  installed: [{ id: "alpha", name: "Alpha", runtime: "ollama" as const, digest: "sha256:a", bytes: 1, format: "GGUF", updatedAt: null }],
};

function marketplaceLocation(route: MarketplaceLocation["route"]): MarketplaceLocation {
  return {
    route,
    query: marketplaceQuery,
    selectedItemId: route.kind === "detail" ? route.itemId : null,
    scrollTop: 0,
    focusId: "marketplace-heading",
  } as MarketplaceLocation;
}

function renderMarketplaceState(route: MarketplaceLocation["route"], snapshot: MarketplaceSnapshot): string | null {
  const markup = renderToStaticMarkup(<MarketplaceScreenView catalog={null} location={marketplaceLocation(route)} sidebarVisible={false} snapshot={snapshot} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />);
  return /data-instrument-state="([^"]+)"/.exec(markup)?.[1] ?? null;
}

async function renderModelDetail(load: ReturnType<typeof vi.spyOn>) {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => {
    root.render(<MarketplaceScreenView catalog={null} location={modelDetailLocation} sidebarVisible={false} snapshot={marketplaceReady} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(load).toHaveBeenCalled();
  return { host, root };
}

afterEach(() => vi.restoreAllMocks());

describe("production instrument screen states", () => {
  test("marks the actual lazy ProjectScreen fallback as project units loading", () => {
    const markup = renderToStaticMarkup(<ProjectScreenLoadingFallback />);
    expect(markup).toContain('data-instrument-route="project.units"');
    expect(markup).toContain('data-instrument-state="loading"');
    expect(markup).toContain('data-instrument-root="project-units"');
    expect(markup).toContain("Opening project…");
  });

  test("derives route values from the runtime owners and exhausts the route union", () => {
    expect(instrumentRouteUnionIsExhaustive).toBe(true);
    expect(PROJECT_VIEWS.length).toBeGreaterThan(0);
    expect(SETTINGS_CATEGORY_IDS.length).toBeGreaterThan(0);
    expect(MARKETPLACE_BASE_ROUTE_KINDS.length).toBeGreaterThan(0);
    expect(MARKETPLACE_CATEGORY_ROUTE_VALUES.length).toBeGreaterThan(0);
    expect(MARKETPLACE_LIBRARY_ROUTE_VALUES.length).toBeGreaterThan(0);
    expect(MARKETPLACE_UNAVAILABLE_DETAIL_ROUTE_VALUES.length).toBeGreaterThan(0);
  });

  test("declares exactly the states emitted by discover", () => {
    const descriptor = PRODUCTION_SCREEN_STATES.find(({ routeKey }) => routeKey === "marketplace.discover")!;
    const emitted = [
      renderMarketplaceState({ kind: "discover" }, { status: "loading", query: marketplaceQuery }),
      renderMarketplaceState({ kind: "discover" }, marketplaceError),
      renderMarketplaceState({ kind: "discover" }, { ...marketplaceReady, sourceHealth: { publicLibrary: "unavailable", models: "ready" } }),
      renderMarketplaceState({ kind: "discover" }, marketplaceReady),
    ];
    expect(descriptor.states).toEqual([...new Set(emitted)]);
  });

  test("marks collection and unsupported categories unavailable when their live content is unavailable", () => {
    const unavailableCategory = {
      ...marketplaceReady,
      categories: [{ category: "prompts" as const, label: "Prompts", purpose: "Unavailable", count: { status: "unavailable" as const, reason: "No prompt contract" }, catalog: "unavailable" as const }],
    };
    expect(renderMarketplaceState({ kind: "collection" }, marketplaceReady)).toBe("unavailable");
    expect(renderMarketplaceState({ kind: "category", category: "prompts" }, unavailableCategory)).toBe("unavailable");
  });

  test("lets the installed-library owner emit only unavailable, empty, and ready", () => {
    const unavailable = renderToStaticMarkup(<MarketplaceInstalledModels machine={null} />);
    const empty = renderToStaticMarkup(<MarketplaceInstalledModels machine={{ ...localMachine, installed: [] }} />);
    const ready = renderToStaticMarkup(<MarketplaceInstalledModels machine={localMachine} />);
    const states = [unavailable, empty, ready].map((markup) => /data-instrument-state="([^"]+)"/.exec(markup)?.[1] ?? null);
    const descriptor = PRODUCTION_SCREEN_STATES.find(({ routeKey }) => routeKey === "marketplace.library.installed")!;
    expect(states).toEqual(["unavailable", "empty", "ready"]);
    expect(descriptor.states).toEqual(states);
  });

  test("keeps every Marketplace descriptor state reachable from its live route family", () => {
    const partial = { ...marketplaceReady, sourceHealth: { publicLibrary: "unavailable" as const, models: "ready" as const } };
    const readyWith = (item: MarketplaceItemPresentation) => ({ ...marketplaceReady, items: [item] });
    const expected = (routeKey: string, emitted: readonly (string | null)[]) => {
      const descriptor = PRODUCTION_SCREEN_STATES.find((candidate) => candidate.routeKey === routeKey)!;
      expect(descriptor.states, routeKey).toEqual([...new Set(emitted)]);
    };

    expected("marketplace.results", [
      renderMarketplaceState({ kind: "results" }, { status: "loading", query: marketplaceQuery }),
      renderMarketplaceState({ kind: "results" }, marketplaceError),
      renderMarketplaceState({ kind: "results" }, partial),
      renderMarketplaceState({ kind: "results" }, marketplaceReady),
      renderMarketplaceState({ kind: "results" }, readyWith(modelPresentation)),
    ]);
    expected("marketplace.collection", [
      renderMarketplaceState({ kind: "collection" }, { status: "loading", query: marketplaceQuery }),
      renderMarketplaceState({ kind: "collection" }, marketplaceError),
      renderMarketplaceState({ kind: "collection" }, marketplaceReady),
    ]);

    const supported = { models: modelPresentation, templates: templatePresentation, recipes: recipePresentation } as const;
    for (const [category, item] of Object.entries(supported) as [keyof typeof supported, MarketplaceItemPresentation][]) {
      expected(`marketplace.category.${category}`, [
        renderMarketplaceState({ kind: "category", category }, { status: "loading", query: marketplaceQuery }),
        renderMarketplaceState({ kind: "category", category }, marketplaceError),
        renderMarketplaceState({ kind: "category", category }, partial),
        renderMarketplaceState({ kind: "category", category }, marketplaceReady),
        renderMarketplaceState({ kind: "category", category }, readyWith(item)),
      ]);
    }

    /* These three are stocked by the bundled catalog, so each also has a live
       "ready" -- a shelf with a row on it, not only a shelf that could exist. */
    for (const category of ["prompts", "components", "skills"] as const) {
      const categoryState = (status: "ready" | "unavailable", items: MarketplaceItemPresentation[] = []) => ({
        ...marketplaceReady,
        items,
        categories: [{ category, label: category, purpose: "Contract state", count: status === "ready" ? { status, value: items.length } : { status, reason: "Unavailable" }, catalog: status }],
      } as MarketplaceSnapshot);
      expected(`marketplace.category.${category}`, [
        renderMarketplaceState({ kind: "category", category }, { status: "loading", query: marketplaceQuery }),
        renderMarketplaceState({ kind: "category", category }, marketplaceError),
        renderMarketplaceState({ kind: "category", category }, { ...categoryState("ready"), sourceHealth: partial.sourceHealth } as MarketplaceSnapshot),
        renderMarketplaceState({ kind: "category", category }, categoryState("ready")),
        renderMarketplaceState({ kind: "category", category }, categoryState("unavailable")),
        renderMarketplaceState({ kind: "category", category }, categoryState("ready", [packPresentation(category)])),
      ]);
    }

    expect(PRODUCTION_SCREEN_STATES.find(({ routeKey }) => routeKey === "marketplace.detail")!.states)
      .toEqual(["loading", "ready", "unavailable", "error"]);
    expect(renderMarketplaceState({ kind: "detail", itemId: "stale" }, marketplaceReady)).toBe("unavailable");
    for (const section of ["saved", "added", "downloads", "updates", "attention"] as const) {
      expected(`marketplace.library.${section}`, [renderMarketplaceState({ kind: "library", section }, marketplaceReady)]);
    }
    for (const category of ["prompts", "components", "skills"] as const) {
      expected(`marketplace.unavailable-detail.${category}`, [renderMarketplaceState({ kind: "unavailable-detail", category }, marketplaceReady)]);
    }
  });

  test("marks the independent model-detail loading state instead of aggregate ready", async () => {
    const load = vi.spyOn(bridge, "loadLocalModelDetail").mockImplementation(() => new Promise(() => undefined));
    const { host, root } = await renderModelDetail(load);
    try {
      const markers = host.container.querySelectorAll("[data-instrument-route='marketplace.detail']");
      expect(markers).toHaveLength(1);
      expect(markers[0]?.getAttribute("data-instrument-state")).toBe("loading");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("marks the independent model-detail error state", async () => {
    const load = vi.spyOn(bridge, "loadLocalModelDetail").mockRejectedValue(new Error("Detail unavailable"));
    const { host, root } = await renderModelDetail(load);
    try {
      const markers = host.container.querySelectorAll("[data-instrument-route='marketplace.detail']");
      expect(markers).toHaveLength(1);
      expect(markers[0]?.getAttribute("data-instrument-state")).toBe("error");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("marks the independent model-detail ready state", async () => {
    const load = vi.spyOn(bridge, "loadLocalModelDetail").mockResolvedValue(localModelDetail);
    const { host, root } = await renderModelDetail(load);
    try {
      const markers = host.container.querySelectorAll("[data-instrument-route='marketplace.detail']");
      expect(markers).toHaveLength(1);
      expect(markers[0]?.getAttribute("data-instrument-state")).toBe("ready");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("registers every concrete route exactly once with declared scenario states", () => {
    const routeKeys = PRODUCTION_SCREEN_STATES.map(({ routeKey }) => routeKey);
    const duplicates = routeKeys.filter((routeKey, index) => routeKeys.indexOf(routeKey) !== index);
    const unknown = PRODUCTION_SCREEN_STATES.flatMap(({ routeKey, states }) => (
      states.filter((state) => !scenarioStates.has(state)).map((state) => `${routeKey}:${state}`)
    ));

    expect([...routeKeys].sort()).toEqual([...actualRouteKeys].sort());
    expect(duplicates).toEqual([]);
    expect(unknown).toEqual([]);
    expect(PRODUCTION_SCREEN_STATES.every(({ states, rootMarker, landmarks }) => (
      states.length > 0 && rootMarker.length > 0 && landmarks.length > 0
    ))).toBe(true);
  });

  test("derives global overlay applicability from the App visibility predicates", () => {
    expect(isWorkspacePickerVisible({ mode: "work", sidebarVisible: true, workspaceId: "ws_ux" })).toBe(true);
    expect(isWorkspacePickerVisible({ mode: "marketplace", sidebarVisible: true, workspaceId: "ws_ux" })).toBe(false);
    expect(isWorkspacePickerVisible({ mode: "work", sidebarVisible: false, workspaceId: "ws_ux" })).toBe(false);
    expect(isWorkspacePickerVisible({ mode: "work", sidebarVisible: true, workspaceId: null })).toBe(false);

    expect(isChatRailVisible({ workbenchVisible: true, rightPanelVisible: true })).toBe(true);
    expect(isChatRailVisible({ workbenchVisible: false, rightPanelVisible: true })).toBe(false);
    expect(isChatRailVisible({ workbenchVisible: true, rightPanelVisible: false })).toBe(false);

    expect(WORKSPACE_PICKER_ROUTE_KEYS).toEqual(workspacePickerRoutes);
    expect(CHAT_RAIL_ROUTE_KEYS).toEqual(chatRailRoutes);
    expect(Object.keys(PRODUCTION_GLOBAL_OVERLAY_ROUTES)).toEqual([
      "workspace-picker",
      "agent-chat-recent-menu",
      "agent-chat-provider-menu",
      "agent-chat-model-menu",
      "agent-chat-mode-menu",
      "agent-chat-context",
    ]);
    expect(PRODUCTION_GLOBAL_OVERLAY_ROUTES).toEqual({
      "workspace-picker": WORKSPACE_PICKER_ROUTE_KEYS,
      "agent-chat-recent-menu": CHAT_RAIL_ROUTE_KEYS,
      "agent-chat-provider-menu": CHAT_RAIL_ROUTE_KEYS,
      "agent-chat-model-menu": CHAT_RAIL_ROUTE_KEYS,
      "agent-chat-mode-menu": CHAT_RAIL_ROUTE_KEYS,
      "agent-chat-context": CHAT_RAIL_ROUTE_KEYS,
    });
  });

  test("rejects undeclared owner states and emits exact markers for declared states", () => {
    expect(() => renderToStaticMarkup(
      <InstrumentScreenRoot descriptor={memoryInstrumentStates} state="playing">Memory</InstrumentScreenRoot>,
    )).toThrow(/workspace\.memory.*playing/);

    const markup = renderToStaticMarkup(
      <InstrumentScreenRoot descriptor={memoryInstrumentStates} state="unavailable">
        <main>Memory</main>
      </InstrumentScreenRoot>,
    );
    expect(markup).toContain('data-instrument-route="workspace.memory"');
    expect(markup).toContain('data-instrument-state="unavailable"');
    expect(markup).toContain(`data-instrument-root="${memoryInstrumentStates.rootMarker}"`);
  });

  test("marks the live Memory unavailable path with its owner descriptor", async () => {
    vi.spyOn(bridge, "loadMemory").mockRejectedValue(new Error("Memory unavailable"));
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(<MemoryScreen workspaceId="ws_ux" workspaceName="UX Testing Lab" />);
        await Promise.resolve();
        await Promise.resolve();
      });
      const screen = host.container.querySelector("[data-instrument-route='workspace.memory']");
      expect(screen?.getAttribute("data-instrument-state")).toBe("unavailable");
      expect(screen?.getAttribute("data-instrument-root")).toBe(memoryInstrumentStates.rootMarker);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
