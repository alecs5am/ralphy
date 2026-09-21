import { act, type ComponentProps, type HTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CatalogResult } from "../electron/media/types";
import { bridge } from "@/shared/api/ipc";
import { ThemeProvider, useTheme } from "@/shared/lib/ThemeProvider";
import { MarketplaceScreen } from "@/pages/marketplace";
import { MARKETPLACE_SIDEBAR_WIDTH, isMarketplaceLocation, marketplaceReducer, readMarketplaceNavigation, writeMarketplaceNavigation } from "@/pages/marketplace";
import { type MarketplaceLocation } from "@/shared/model/routes";
import type { WorkbenchPreferences } from "@/shared/model/workbench";
import type { ThemePreference } from "@/shared/instrument/types";
import { createReactHost, type HostNode } from "./react-host";

vi.mock("motion/react", () => {
  const Div = ({ children, initial: _initial, animate: _animate, transition: _transition, layout: _layout, ...props }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props}>{children as ReactNode}</div>;
  const Section = ({ children, layout: _layout, ...props }: HTMLAttributes<HTMLElement> & Record<string, unknown>) => <section {...props}>{children as ReactNode}</section>;
  const Aside = ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: HTMLAttributes<HTMLElement> & Record<string, unknown>) => <aside {...props}>{children as ReactNode}</aside>;
  const Header = ({ children, layout: _layout, ...props }: HTMLAttributes<HTMLElement> & Record<string, unknown>) => <header {...props}>{children as ReactNode}</header>;
  const Pass = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { AnimatePresence: Pass, LayoutGroup: Pass, MotionConfig: Pass, motion: { div: Div, section: Section, aside: Aside, header: Header } };
});
vi.mock("../src/widgets/utility-panels/ui/UtilityPanels", () => ({
  AgentChatPanel: ({ onOpenContext, onOpenUnit, onToggleView }: ComponentProps<typeof import("@/widgets/utility-panels").AgentChatPanel>) => <aside data-testid="agent-chat">
    <button id="chat-context" onClick={onOpenContext}>Context</button>
    <button id="chat-unit" onClick={() => onOpenUnit?.({ workspaceId: "workspace-1", projectId: null }, "unit-1", "Chat result")}>Chat result</button>
    {onToggleView && <button id="chat-workspace-toggle" onClick={onToggleView}>Toggle workspace panel</button>}
  </aside>,
  BottomPanel: () => null,
}));
vi.mock("../src/widgets/welcome/ui/WelcomeScreen", () => ({ WelcomeScreen: () => <div>Loading Ralphy</div> }));
vi.mock("../src/features/agent-chat/model/useAgentChat", () => ({
  /* The id is what the view panel keys its tabs and its width by, so the stub carries one. */
  useAgentChat: ({ enabled }: { enabled: boolean }) => {
    (globalThis as typeof globalThis & { __agentChatEnabled?: boolean[] }).__agentChatEnabled?.push(enabled);
    return { activeChat: { id: "chat-under-test" } };
  },
}));

const locationA: MarketplaceLocation = {
  route: { kind: "category", category: "recipes" },
  query: {
    text: "ffmpeg",
    filters: {
      category: "recipes",
      source: "ralphy",
      license: "all",
      compatibility: "unknown",
      modality: "all",
      format: "all",
    },
    sort: "name",
  },
  selectedItemId: "recipe:voxel-dither",
  scrollTop: 438,
  focusId: "marketplace-item-recipe:voxel-dither",
};

const locationB: MarketplaceLocation = {
  ...locationA,
  route: { kind: "detail", itemId: "recipe:voxel-dither" },
  selectedItemId: "recipe:voxel-dither",
  scrollTop: 91,
  focusId: "marketplace-detail-copy",
};

function storage(initial?: string): Storage {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("ralphy-marketplace-navigation-v1", initial);
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function emptyCatalog(): CatalogResult {
  return {
    rootPath: "/tmp/.ralphy",
    generation: 1,
    workspaces: [],
    projects: [],
    mediaItemCount: 0,
    completedAt: "2026-08-20T10:00:00.000Z",
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function commandKey(key: string): Event {
  return Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), {
    key, metaKey: true, altKey: false, ctrlKey: false, shiftKey: false, repeat: false,
  });
}

function installInstrumentMeasurements(frameWidth: number, deskWidth: number): void {
  class MeasuredResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const node = target as unknown as HostNode;
      const className = node.getAttribute("class") ?? "";
      if (className.includes("instrument-shell")) node.clientWidth = frameWidth;
      if (className.includes("instrument-desk-scroll")) node.clientWidth = deskWidth;
      this.callback([{ target, contentRect: node.getBoundingClientRect() } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    disconnect() {}
    unobserve() {}
  }
  globalThis.ResizeObserver = MeasuredResizeObserver as unknown as typeof ResizeObserver;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("marketplace navigation", () => {
  test("restores old unavailable routes and source filters into supported browsing", () => {
    const target = storage();
    let state = readMarketplaceNavigation(target);
    state = marketplaceReducer(state, { type: "navigate", location: { ...locationA, route: { kind: "library", section: "downloads" }, query: { ...locationA.query, filters: { ...locationA.query.filters, source: "modelscope" } } } });
    writeMarketplaceNavigation(target, state);
    const restored = readMarketplaceNavigation(target);
    expect(restored.location.route).toEqual({ kind: "category", category: "templates" });
    expect(restored.location.query.filters.source).toBe("all");
    expect(restored.history[restored.historyIndex]).toEqual(restored.location);
  });

  test("round-trips one bounded query/location state and rejects malformed variants", () => {
    const target = storage();
    let state = readMarketplaceNavigation(target);
    state = marketplaceReducer(state, { type: "switch-mode", mode: "marketplace", returnFocusId: "workspace-card-a" });
    state = marketplaceReducer(state, { type: "navigate", location: locationA });
    writeMarketplaceNavigation(target, state);

    const roundTrip = readMarketplaceNavigation(target);
    expect(roundTrip.location).toEqual(locationA);
    expect(roundTrip.workReturnFocusId).toBe("workspace-card-a");
    expect(isMarketplaceLocation({ ...roundTrip.location, query: { ...roundTrip.location.query, sort: "popular" } })).toBe(false);
    expect(isMarketplaceLocation({ ...roundTrip.location, route: { kind: "detail", itemId: "model:a" }, selectedItemId: "model:b" })).toBe(false);
    expect(isMarketplaceLocation({ ...roundTrip.location, query: { ...roundTrip.location.query, extra: true } })).toBe(false);
    expect(isMarketplaceLocation({ ...roundTrip.location, scrollTop: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isMarketplaceLocation({ ...roundTrip.location, focusId: "x".repeat(257) })).toBe(false);
  });

  test("falls back safely when persistence contains unknown keys, invalid enums, or oversized history", () => {
    const persisted = {
      mode: "marketplace",
      sidebarVisible: true,
      location: { ...locationA, unexpected: true },
      history: Array.from({ length: 51 }, () => locationA),
      historyIndex: 50,
      workReturnFocusId: null,
    };
    const state = readMarketplaceNavigation(storage(JSON.stringify(persisted)));
    expect(state.mode).toBe("work");
    expect(state.location.route).toEqual({ kind: "category", category: "templates" });
    expect(state.history).toHaveLength(1);

    expect(isMarketplaceLocation({ ...locationA, query: { ...locationA.query, text: "x".repeat(257) } })).toBe(false);
    expect(isMarketplaceLocation({ ...locationA, query: { ...locationA.query, filters: { ...locationA.query.filters, source: "github" } } })).toBe(false);
    expect(isMarketplaceLocation({ ...locationA, route: { kind: "unavailable-detail", category: "recipes" }, selectedItemId: null })).toBe(false);
  });

  test("restores immutable history and ignores selection on detail routes", () => {
    let state = readMarketplaceNavigation(storage());
    state = marketplaceReducer(state, { type: "navigate", location: locationA });
    state = marketplaceReducer(state, { type: "navigate", location: locationB });
    const detailState = state;
    expect(marketplaceReducer(detailState, { type: "select", itemId: "model:b" })).toBe(detailState);

    state = marketplaceReducer(state, { type: "back" });
    expect(state.location).toEqual(locationA);
    state = marketplaceReducer(state, { type: "forward" });
    expect(state.location).toEqual(locationB);
    state = marketplaceReducer(state, { type: "remember", patch: { scrollTop: 700, focusId: "copy" } });
    expect(state.location).toEqual({ ...locationB, scrollTop: 700, focusId: "copy" });
    state = marketplaceReducer(state, { type: "back" });
    expect(state.location).toEqual(locationA);
  });

  test("keeps Marketplace sidebar visibility independent from My Work sizing", () => {
    const initial = readMarketplaceNavigation(storage());
    const hidden = marketplaceReducer(initial, { type: "toggle-sidebar" });
    expect(initial.sidebarVisible).toBe(true);
    expect(hidden.sidebarVisible).toBe(false);
    expect(MARKETPLACE_SIDEBAR_WIDTH).toBe(248);
  });

  test("defaults to Templates and migrates legacy Discover without narrowing cross-category search", () => {
    const initial = readMarketplaceNavigation(storage());
    expect(initial.location.route).toEqual({ kind: "category", category: "templates" });
    expect(initial.location.query.filters.category).toBe("templates");
    const legacy = { ...locationA, route: { kind: "discover" as const } };
    const restored = readMarketplaceNavigation(storage(JSON.stringify({ ...initial, location: legacy, history: [legacy] })));
    expect(restored.location.route).toEqual(initial.location.route);
    expect(restored.location.query).toEqual(initial.location.query);
    expect(marketplaceReducer(initial, { type: "navigate", location: legacy }).location.route).toEqual(initial.location.route);
    const search = { ...locationA, route: { kind: "results" as const }, query: { ...locationA.query, filters: { ...locationA.query.filters, category: "all" as const } } };
    const target = storage();
    writeMarketplaceNavigation(target, marketplaceReducer(initial, { type: "navigate", location: search }));
    expect(readMarketplaceNavigation(target).location).toEqual(search);
  });

  test("renders a truthful Marketplace shell for null and empty catalogs", () => {
    const props = {
      location: locationA,
      sidebarVisible: false,
      onBack: () => undefined,
      onNavigate: () => undefined,
      onRememberLocation: () => undefined,
    };
    const nullMarkup = renderToStaticMarkup(<MarketplaceScreen catalog={null} {...props} />);
    const emptyMarkup = renderToStaticMarkup(<MarketplaceScreen catalog={emptyCatalog()} {...props} />);

    expect(nullMarkup).toContain("Effects");
    expect(nullMarkup).toContain('aria-label="Library category"');
    expect(nullMarkup).toContain("Create a workspace to save items");
    expect(emptyMarkup).toContain("Effects");
    expect(emptyMarkup).toContain("Create a workspace to save items");
    expect(emptyMarkup).not.toContain("Workspace targets are available for supported reviews.");
    expect(emptyMarkup).not.toContain("Choose a workspace");
  });

  test.each([true, false])("preserves chat and shows Explore when the work content panel is open: %s", async (viewOpen) => {
    vi.useFakeTimers();
    const host = createReactHost();
    installInstrumentMeasurements(1_360, 1_120);
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1360 },
      innerHeight: { configurable: true, value: 900 },
    });
    const local = storage();
    local.setItem("ralphy-media-workbench-v1", JSON.stringify({ lens: "chat", rightPanelVisible: true, sidebarWidth: 372, viewPanel: { open: viewOpen } }));
    let persistedMarketplace = readMarketplaceNavigation(local);
    persistedMarketplace = marketplaceReducer(persistedMarketplace, {
      type: "remember",
      patch: { focusId: "marketplace-heading", scrollTop: 438 },
    });
    writeMarketplaceNavigation(local, persistedMarketplace);
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
    const restore = vi.spyOn(bridge, "restoreLibrary").mockResolvedValue({
      identity: { storeId: "store-1", label: "Ralphy", rootEpoch: 1, activitySequence: 0 },
      catalog: {
        ...emptyCatalog(),
        workspaces: [{
          id: "workspace-1", name: "UX Testing Lab", description: "", absolutePath: "/tmp/ux",
          projectCount: 0, sharedCount: 0, unitCount: 0, finalCount: 0, recentActivity: "2026-08-20T10:00:00.000Z",
        }],
      },
    });
    const { App } = await import("@/app/App");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<App />); await settle(); });
      await act(async () => { vi.advanceTimersByTime(1_500); await settle(); });
      const explore = host.container.querySelector("#sidebar-explore") as HostNode;
      const workSurface = host.container.querySelector(".app-mode-work") as HostNode;
      const marketplaceSurface = host.container.querySelector(".app-mode-marketplace") as HostNode;
      const chat = host.container.querySelector("[data-testid=\"agent-chat\"]");
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("docked");
      const hiddenMarketplaceHeading = host.container.querySelector("#marketplace-heading") as HostNode;
      expect(document.activeElement).not.toBe(hiddenMarketplaceHeading);
      expect(explore).not.toBeNull();
      explore.focus();
      await act(async () => explore.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      await act(async () => { vi.advanceTimersByTime(1); await settle(); });

      expect(host.container.querySelector(".app-mode-work")).toBe(workSurface);
      expect(host.container.querySelector(".app-mode-marketplace")).toBe(marketplaceSurface);
      const marketplaceHeading = host.container.querySelector(".instrument-top-row #marketplace-heading") as HostNode;
      expect(marketplaceHeading).not.toBeNull();
      expect(marketplaceSurface.querySelector(".marketplace-toolbar")).toBeNull();
      expect(host.container.querySelectorAll(".page-header-host .page-header")).toHaveLength(1);
      const toolbar = host.container.querySelector(".instrument-top-row .marketplace-toolbar")!;
      expect(toolbar.querySelector("input")?.getAttribute("aria-label")).toBe("Search creative library");
      const filters = toolbar.querySelectorAll("button").find((button) => button.getAttribute("aria-controls") && button.getAttribute("aria-label")?.startsWith("Filters"))!;
      await act(async () => filters.dispatchEvent(new Event("click", { bubbles: true })));
      expect(filters.getAttribute("aria-expanded")).toBe("true");
      expect(marketplaceSurface.querySelector(`#${filters.getAttribute("aria-controls")}`)?.getAttribute("hidden")).toBeNull();
      const marketplaceScroll = marketplaceSurface.querySelector(".marketplace-scroll") as HostNode;
      expect(workSurface.getAttribute("hidden")).not.toBeNull();
      expect(workSurface.getAttribute("inert")).not.toBeNull();
      expect(marketplaceSurface.getAttribute("hidden")).toBeNull();
      expect(host.container.querySelector(".instrument-desk-column")?.getAttribute("hidden")).toBeNull();
      expect(chat).not.toBeNull();
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("docked");
      expect(host.container.querySelectorAll(".context-sidebar")).toHaveLength(1);
      expect(((host.container.querySelector(".workbench") as unknown as HostNode).style as unknown as Record<string, string>)["--sidebar-w"]).toBe("372px");
      expect(host.container.querySelector(".resize-sidebar")).toBeNull();
      expect(host.container.querySelector("[data-testid=\"agent-chat\"]")).toBe(chat);
      expect(chat!.querySelector("#chat-workspace-toggle")).toBeNull();
      expect(document.activeElement).toBe(marketplaceHeading);
      expect(marketplaceScroll.scrollTop).toBe(438);

      await act(async () => window.dispatchEvent(commandKey("r")));
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("closed");
      expect(marketplaceSurface.getAttribute("hidden")).toBeNull();
      const agentToggle = host.container.querySelectorAll("button").find((button) => button.getAttribute("aria-label") === "Agent")!;
      expect(agentToggle).not.toBeUndefined();
      await act(async () => agentToggle.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("docked");
      expect(marketplaceSurface.getAttribute("hidden")).toBeNull();
      expect(host.container.querySelector("[data-testid=\"agent-chat\"]")).toBe(chat);

      const marketplaceMode = host.container.querySelector("#sidebar-explore") as HostNode;
      marketplaceMode.focus();
      marketplaceScroll.scrollTop = 612;
      await act(async () => marketplaceScroll.dispatchEvent(new Event("scroll", { bubbles: true })));
      expect(document.activeElement).toBe(marketplaceMode);
      expect(JSON.parse(local.getItem("ralphy-marketplace-navigation-v1")!).location.scrollTop).toBe(612);

      const effects = marketplaceSurface.querySelectorAll("button").find((button) => button.getAttribute("aria-label") === "Effects")!;
      expect(effects).not.toBeUndefined();
      await act(async () => effects.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(host.container.querySelector(".instrument-top-row #marketplace-heading")?.textContent).toBe("Effects");
      expect(JSON.parse(local.getItem("ralphy-marketplace-navigation-v1")!).location.query.filters.category).toBe("recipes");

      let back = [...host.container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Back")!;
      await act(async () => back.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(host.container.querySelector(".instrument-top-row #marketplace-heading")?.textContent).toBe("Templates");
      const forward = [...host.container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Forward")!;
      await act(async () => forward.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(host.container.querySelector(".instrument-top-row #marketplace-heading")?.textContent).toBe("Effects");
      back = [...host.container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Back")!;
      await act(async () => back.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));

      await act(async () => window.dispatchEvent(commandKey("b")));
      expect(host.container.querySelector(".context-sidebar")).toBeNull();
      expect(marketplaceSurface.querySelectorAll("button").some((button) => button.getAttribute("aria-label") === "More library categories")).toBe(true);
      await act(async () => window.dispatchEvent(commandKey("b")));
      expect(host.container.querySelectorAll(".context-sidebar")).toHaveLength(1);

      back = [...host.container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Back")!;
      await act(async () => back.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      await act(async () => { vi.advanceTimersByTime(1); await settle(); });
      expect(workSurface.getAttribute("hidden")).toBeNull();
      expect(marketplaceSurface.getAttribute("hidden")).not.toBeNull();
      expect(host.container.querySelector(".app-mode-work")).toBe(workSurface);
      expect(host.container.querySelector(".app-mode-marketplace")).toBe(marketplaceSurface);
      expect(document.activeElement).toBe(host.container.querySelector("#sidebar-explore"));

      const marketplaceAgain = host.container.querySelector("#sidebar-explore") as HostNode;
      await act(async () => marketplaceAgain.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      await act(async () => { vi.advanceTimersByTime(1); await settle(); });
      const restoredHeading = host.container.querySelector(".instrument-top-row #marketplace-heading")!;
      expect(document.activeElement === restoredHeading).toBe(true);
      expect(restoredHeading.textContent).toBe("Templates");
      const workAgain = [...host.container.querySelectorAll(".context-sidebar button")].find((button) => button.textContent.startsWith("Content"))!;
      expect(workAgain).not.toBeUndefined();
      workAgain.focus();
      await act(async () => workAgain.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      await act(async () => { vi.advanceTimersByTime(121); await settle(); });
      expect(workSurface.getAttribute("hidden")).toBeNull();
      expect(marketplaceSurface.getAttribute("hidden")).not.toBeNull();
      expect(document.activeElement).toBe(workAgain);
      expect(host.container.querySelector("[data-testid=\"agent-chat\"]")).toBe(chat);
      expect(JSON.parse(local.getItem("ralphy-media-workbench-v1")!).workspacePage).toBe("units");
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("docked");
      expect(chat!.querySelector("#chat-workspace-toggle")).not.toBeNull();
      for (const action of ["chat-unit", "chat-context"]) {
        await act(async () => marketplaceAgain.dispatchEvent(new Event("click", { bubbles: true })));
        expect(marketplaceSurface.getAttribute("hidden")).toBeNull();
        await act(async () => chat!.querySelector(`#${action}`)!.dispatchEvent(new Event("click", { bubbles: true })));
        expect(workSurface.getAttribute("hidden")).toBeNull();
        expect(marketplaceSurface.getAttribute("hidden")).not.toBeNull();
        expect(host.container.querySelector("[data-testid=\"agent-chat\"]")).toBe(chat);
        expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("docked");
      }
    } finally {
      await act(async () => root.unmount());
      restore.mockRestore();
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else delete (globalThis as Record<string, unknown>).localStorage;
      host.restore();
    }
  });

  test.each([
    ["success", "grid"],
    ["success", "list"],
    ["null", "grid"],
    ["null", "list"],
    ["reject", "grid"],
    ["reject", "list"],
  ] as const)("persists theme after %s restoration while preserving %s workbench preferences", async (outcome, workspaceView) => {
    vi.useFakeTimers();
    const host = createReactHost();
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1360 },
      innerHeight: { configurable: true, value: 900 },
      matchMedia: {
        configurable: true,
        value: () => ({
          matches: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }),
      },
    });
    Object.assign(document.documentElement, { dataset: {} });
    const local = storage();
    const saved = {
      theme: "dark",
      rootPath: "store-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      pinnedWorkspaceIds: ["workspace-1"],
      pinnedProjectIds: ["workspace-1/project-1"],
      workspacePage: "memory",
      sidebarVisible: false,
      lens: "desk",
      rightPanelVisible: true,
      bottomPanelVisible: true,
      workspaceView,
      sidebarWidth: 372,
      rightPanelWidth: 404,
      bottomPanelHeight: 280,
      // Restoring a workspace destination does not manufacture document tabs.
      viewPanel: { open: true, width: 440, byChat: {} },
    } satisfies WorkbenchPreferences;
    /* Everything but the panel's per-chat record, which is asserted separately. */
    const persisted = () => {
      const record = JSON.parse(local.getItem("ralphy-media-workbench-v1")!) as WorkbenchPreferences;
      const tabs = record.viewPanel.byChat["chat-under-test"]?.tabs.map(({ label }) => label) ?? [];
      return { record: { ...record, viewPanel: { ...record.viewPanel, byChat: {} } }, tabs };
    };
    local.setItem("ralphy-media-workbench-v1", JSON.stringify(saved));
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
    let finishRestore!: () => void;
    const restore = vi.spyOn(bridge, "restoreLibrary").mockReturnValue(new Promise((resolve, reject) => {
      finishRestore = () => {
        if (outcome === "success") resolve(restored);
        else if (outcome === "null") resolve(null);
        else reject(new Error("Home library unavailable"));
      };
    }));
    const restored = {
      identity: { storeId: "store-1", label: "Ralphy", rootEpoch: 1, activitySequence: 0 },
      catalog: {
        rootPath: "store-1",
        generation: 1,
        mediaItemCount: 0,
        completedAt: "2026-08-20T10:00:00.000Z",
        workspaces: [{
          id: "workspace-1", name: "UX Testing Lab", description: "", absolutePath: "/tmp/ux",
          projectCount: 1, sharedCount: 0, unitCount: 0, finalCount: 0, recentActivity: "2026-08-20T10:00:00.000Z",
        }],
        projects: [{
          id: "workspace-1/project-1", workspaceId: "workspace-1", projectId: "project-1",
          name: "Theme QA", brief: "", status: "assets", phase: "production", finalState: "review",
          platform: null, aspectRatio: null, spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 0,
          recentActivity: "2026-08-20T10:00:00.000Z",
        }],
      },
    };
    const { App } = await import("@/app/App");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    let changeTheme!: (value: ThemePreference) => void;
    function ThemeControl() {
      changeTheme = useTheme().setPreference;
      return null;
    }

    try {
      await act(async () => { root.render(<ThemeProvider initialPreference="dark"><App /><ThemeControl /></ThemeProvider>); await settle(); });
      await act(async () => { vi.advanceTimersByTime(500); await settle(); });
      expect(persisted().record).toEqual(saved);
      expect(persisted().tabs).toEqual([]);

      await act(async () => { finishRestore(); await settle(); });
      await act(async () => { vi.advanceTimersByTime(121); await settle(); });
      expect(persisted().record).toEqual(saved);
      expect(persisted().tabs).toEqual([]);

      await act(async () => { changeTheme("light"); await settle(); });
      await act(async () => { vi.advanceTimersByTime(121); await settle(); });
      expect(persisted().record).toEqual({ ...saved, theme: "light" });
    } finally {
      await act(async () => root.unmount());
      restore.mockRestore();
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else delete (globalThis as Record<string, unknown>).localStorage;
      host.restore();
    }
  });

  test("restores persisted Marketplace focus after Welcome without stealing it on scroll memory", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1360 },
      innerHeight: { configurable: true, value: 900 },
    });
    const local = storage();
    let persistedMarketplace = readMarketplaceNavigation(local);
    persistedMarketplace = marketplaceReducer(persistedMarketplace, {
      type: "switch-mode",
      mode: "marketplace",
      returnFocusId: null,
    });
    persistedMarketplace = marketplaceReducer(persistedMarketplace, {
      type: "remember",
      patch: { focusId: "marketplace-heading", scrollTop: 438 },
    });
    writeMarketplaceNavigation(local, persistedMarketplace);
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
    const restore = vi.spyOn(bridge, "restoreLibrary").mockResolvedValue(null);
    const { App } = await import("@/app/App");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<App />); await settle(); });
      expect(host.container.textContent).toContain("Loading Ralphy");
      await act(async () => { vi.advanceTimersByTime(1_500); await settle(); });

      const marketplaceSurface = host.container.querySelector(".app-mode-marketplace") as HostNode;
      const marketplaceHeading = host.container.querySelector(".instrument-top-row #marketplace-heading") as HostNode;
      expect(marketplaceHeading).not.toBeNull();
      const marketplaceScroll = marketplaceSurface.querySelector(".marketplace-scroll") as HostNode;
      expect(marketplaceSurface.getAttribute("hidden")).toBeNull();
      expect(document.activeElement).toBe(marketplaceHeading);
      expect(marketplaceScroll.scrollTop).toBe(438);

      const marketplaceMode = host.container.querySelector("#sidebar-explore") as HostNode;
      marketplaceMode.focus();
      marketplaceScroll.scrollTop = 612;
      await act(async () => marketplaceScroll.dispatchEvent(new Event("scroll", { bubbles: true })));
      expect(document.activeElement).toBe(marketplaceMode);
    } finally {
      await act(async () => root.unmount());
      restore.mockRestore();
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else delete (globalThis as Record<string, unknown>).localStorage;
      host.restore();
    }
  });

  test("opens Marketplace from the null-catalog recovery state", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("KeyboardEvent", class extends Event {
      key: string; metaKey: boolean;
      ctrlKey = false; altKey = false; shiftKey = false;
      constructor(type: string, init: KeyboardEventInit) { super(type, init); this.key = init.key ?? ""; this.metaKey = !!init.metaKey; }
    });
    const host = createReactHost();
    // The lightweight host has separate document/window EventTargets, without DOM bubbling.
    const dispatchDocument = document.dispatchEvent.bind(document);
    vi.spyOn(document, "dispatchEvent").mockImplementation((event) => {
      dispatchDocument(event);
      if (event.bubbles && !event.cancelBubble) window.dispatchEvent(event);
      return !event.defaultPrevented;
    });
    installInstrumentMeasurements(1_100, 860);
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1360 },
      innerHeight: { configurable: true, value: 900 },
    });
    const local = storage();
    local.setItem("ralphy-media-workbench-v1", JSON.stringify({ rightPanelVisible: false }));
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
    const enabledStates: boolean[] = [];
    (globalThis as typeof globalThis & { __agentChatEnabled?: boolean[] }).__agentChatEnabled = enabledStates;
    const restore = vi.spyOn(bridge, "restoreLibrary").mockResolvedValue(null);
    // The header no longer carries a rail toggle, so the keyboard shortcut the main process
    // forwards is the affordance under test.
    let toggleRightPanel: (() => void) | null = null;
    vi.spyOn(bridge, "onToggleRightPanel").mockImplementation((callback) => {
      toggleRightPanel = callback;
      return () => { toggleRightPanel = null; };
    });
    const { App } = await import("@/app/App");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<App />); await settle(); });
      await act(async () => { vi.advanceTimersByTime(1_500); await settle(); });
      expect(host.container.querySelector("button[aria-label=\"Toggle right panel\"]")).toBeNull();
      expect(document.body.querySelector("[data-instrument-overlay=\"right-rail-sheet\"]")).toBeNull();
      expect(enabledStates.at(-1)).toBe(false);
      const chat = host.container.querySelector("[data-testid=\"agent-chat\"]");
      await act(async () => { toggleRightPanel?.(); await settle(); });
      expect(document.body.querySelector("[data-instrument-overlay=\"right-rail-sheet\"]")).toBeNull();
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("docked");
      expect(enabledStates.at(-1)).toBe(true);
      await act(async () => { toggleRightPanel?.(); await settle(); });
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("closed");
      expect(enabledStates.at(-1)).toBe(false);
      // Nothing about the lens reaches storage here on purpose: this is the null-catalog recovery
      // state, and the preference write is gated on a catalog. `workbench-state` covers the
      // round trip.
      const marketplace = [...host.container.querySelectorAll("button")].find((button) => button.textContent === "Explore");
      expect(marketplace).not.toBeUndefined();
      await act(async () => marketplace!.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      const marketplaceSurface = host.container.querySelector(".app-mode-marketplace") as HostNode;
      expect(marketplaceSurface.getAttribute("hidden")).toBeNull();
      expect(host.container.querySelector(".instrument-top-row #marketplace-heading")?.textContent).toBe("Templates");
      // A closed chat stays closed on navigation, and its subtree is never remounted.
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("closed");
      expect(host.container.querySelector("[data-testid=\"agent-chat\"]")).toBe(chat);
    } finally {
      await act(async () => root.unmount());
      restore.mockRestore();
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else delete (globalThis as Record<string, unknown>).localStorage;
      delete (globalThis as typeof globalThis & { __agentChatEnabled?: boolean[] }).__agentChatEnabled;
      vi.unstubAllGlobals();
      host.restore();
    }
  });

  test("renders the existing disconnected chat state safely without a root", async () => {
    const host = createReactHost();
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage() });
    const previousRaf = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
    const previousCancelRaf = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
    Object.defineProperties(globalThis, {
      requestAnimationFrame: { configurable: true, value: window.requestAnimationFrame },
      cancelAnimationFrame: { configurable: true, value: window.cancelAnimationFrame },
    });
    const actualChat = await vi.importActual<typeof import("@/features/agent-chat")>("../src/features/agent-chat/model/useAgentChat");
    const actualPanels = await vi.importActual<typeof import("@/widgets/utility-panels")>("../src/widgets/utility-panels/ui/UtilityPanels");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    function NoRootChat({ saved = false }: { saved?: boolean }) {
      const chat = actualChat.useAgentChat({ rootPath: null, workspaceId: null, project: null, enabled: false });
      if (saved) chat.activeChat = { ...chat.activeChat, entries: [{ id: 1, kind: "user", text: "Saved demo request" }] };
      return <actualPanels.AgentChatPanel chat={chat} workspace={null} project={null} onClose={() => undefined} onOpenSettings={() => undefined} />;
    }
    try {
      await act(async () => { root.render(<NoRootChat />); await settle(); });
      /* Handoff 17's dialog: the ways in are listed as rows and the selected one carries its own
         control, so the copy is the dialog's title plus that control's state. */
      expect(host.container.textContent).toContain("No provider connected");
      expect(host.container.textContent).toContain("Codex CLI not found");
      expect(host.container.querySelector("textarea")).toBeNull();
      await act(async () => { root.render(<NoRootChat saved />); await settle(); });
      expect(host.container.textContent).toContain("Saved demo request");
      expect(host.container.textContent).toContain("Connect a provider to continue");
      expect(host.container.querySelector("[aria-label=\"Send message\"]")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      if (previousRaf) Object.defineProperty(globalThis, "requestAnimationFrame", previousRaf);
      else delete (globalThis as Record<string, unknown>).requestAnimationFrame;
      if (previousCancelRaf) Object.defineProperty(globalThis, "cancelAnimationFrame", previousCancelRaf);
      else delete (globalThis as Record<string, unknown>).cancelAnimationFrame;
      host.restore();
    }
  });
});
