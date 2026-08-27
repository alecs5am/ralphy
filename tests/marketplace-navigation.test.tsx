import { act, type HTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CatalogResult } from "../electron/media/types";
import { bridge } from "@/shared/api/ipc";
import { ThemeProvider, useTheme } from "@/app/providers/ThemeProvider";
import { MarketplaceScreen } from "@/pages/marketplace/ui/MarketplaceScreen";
import {
  MARKETPLACE_SIDEBAR_WIDTH,
  isMarketplaceLocation,
  marketplaceReducer,
  readMarketplaceNavigation,
  writeMarketplaceNavigation,
  type MarketplaceLocation,
} from "@/pages/marketplace/model/navigation";
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
  AgentChatPanel: () => <aside data-testid="agent-chat">Agent chat</aside>,
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
    expect(state.location.route).toEqual({ kind: "discover" });
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

    expect(nullMarkup).toContain("Recipes");
    expect(nullMarkup).toContain("Marketplace category");
    expect(nullMarkup).toContain("Project targets are unavailable until the home library reconnects.");
    expect(emptyMarkup).toContain("Recipes");
    expect(emptyMarkup).toContain("No named project targets are available in the current home library.");
    expect(emptyMarkup).not.toContain("Workspace targets are available for supported reviews.");
    expect(emptyMarkup).not.toContain("Choose a workspace");
  });

  test("keeps both mode surfaces mounted, preserves chat, and returns from Marketplace root", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    installInstrumentMeasurements(1_360, 1_120);
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1360 },
      innerHeight: { configurable: true, value: 900 },
    });
    const local = storage();
    local.setItem("ralphy-media-workbench-v1", JSON.stringify({ rightPanelVisible: true }));
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
      catalog: emptyCatalog(),
    });
    const { App } = await import("@/app/App");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<App />); await settle(); });
      await act(async () => { vi.advanceTimersByTime(1_500); await settle(); });
      const workMode = host.container.querySelector("#app-mode-work") as unknown as HostNode;
      const hiddenMarketplaceHeading = host.container.querySelector("#marketplace-heading") as HostNode;
      expect(document.activeElement).not.toBe(hiddenMarketplaceHeading);
      workMode.focus();
      const marketplace = [...host.container.querySelectorAll("button")].find((button) => button.textContent === "Marketplace")!;
      await act(async () => marketplace.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      await act(async () => { vi.advanceTimersByTime(1); await settle(); });

      const workSurface = host.container.querySelector(".app-mode-work") as unknown as HostNode;
      const marketplaceSurface = host.container.querySelector(".app-mode-marketplace") as unknown as HostNode;
      const marketplaceHeading = marketplaceSurface.querySelector("#marketplace-heading") as HostNode;
      const marketplaceScroll = marketplaceSurface.querySelector(".marketplace-scroll") as HostNode;
      expect(workSurface.getAttribute("hidden")).not.toBeNull();
      expect(workSurface.getAttribute("inert")).not.toBeNull();
      expect(marketplaceSurface.getAttribute("hidden")).toBeNull();
      const chat = host.container.querySelector("[data-testid=\"agent-chat\"]");
      expect(chat).not.toBeNull();
      // The chat stays mounted across a place switch, but its dock is closed: the desk lens is
      // the default and it exists so the content column is undivided. Reaching the chat is the
      // lens pair's job, not a preference the place switch has to preserve.
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("closed");
      expect(host.container.querySelectorAll(".context-sidebar")).toHaveLength(1);
      expect(((host.container.querySelector(".workbench") as unknown as HostNode).style as unknown as Record<string, string>)["--sidebar-w"]).toBe("260px");
      expect(host.container.querySelector(".resize-sidebar")).toBeNull();
      expect(host.container.querySelector("[data-testid=\"agent-chat\"]")).toBe(chat);
      expect(document.activeElement).toBe(marketplaceHeading);
      expect(marketplaceScroll.scrollTop).toBe(438);

      const marketplaceMode = host.container.querySelector("#app-mode-marketplace") as HostNode;
      marketplaceMode.focus();
      marketplaceScroll.scrollTop = 612;
      await act(async () => marketplaceScroll.dispatchEvent(new Event("scroll", { bubbles: true })));
      expect(document.activeElement).toBe(marketplaceMode);
      expect(JSON.parse(local.getItem("ralphy-marketplace-navigation-v1")!).location.scrollTop).toBe(612);

      const models = [...host.container.querySelectorAll("button")].find((button) => button.textContent === "Models")!;
      await act(async () => models.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(marketplaceSurface.querySelector("h1")?.textContent).toBe("Models");
      expect(JSON.parse(local.getItem("ralphy-marketplace-navigation-v1")!).location.query.filters.category).toBe("models");

      let back = [...host.container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Back")!;
      await act(async () => back.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(marketplaceSurface.querySelector("h1")?.textContent).toBe("Marketplace");
      const forward = [...host.container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Forward")!;
      await act(async () => forward.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(marketplaceSurface.querySelector("h1")?.textContent).toBe("Models");
      back = [...host.container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Back")!;
      await act(async () => back.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));

      const toggle = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperties(toggle, {
        key: { value: "b" },
        metaKey: { value: true },
        altKey: { value: false },
        ctrlKey: { value: false },
        shiftKey: { value: false },
        repeat: { value: false },
      });
      await act(async () => window.dispatchEvent(toggle));
      expect(host.container.querySelector(".context-sidebar")).toBeNull();
      expect(marketplaceSurface.textContent).toContain("Marketplace category");
      await act(async () => window.dispatchEvent(toggle));
      expect(host.container.querySelectorAll(".context-sidebar")).toHaveLength(1);

      back = [...host.container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Back")!;
      await act(async () => back.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      await act(async () => { vi.advanceTimersByTime(1); await settle(); });
      expect(workSurface.getAttribute("hidden")).toBeNull();
      expect(marketplaceSurface.getAttribute("hidden")).not.toBeNull();
      expect((document.activeElement as unknown as HostNode).getAttribute("id")).toBe("app-mode-work");

      const marketplaceAgain = [...host.container.querySelectorAll("button")].find((button) => button.textContent === "Marketplace")!;
      await act(async () => marketplaceAgain.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      await act(async () => { vi.advanceTimersByTime(1); await settle(); });
      expect(document.activeElement).toBe(marketplaceHeading);
      const workAgain = [...host.container.querySelectorAll("button")].find((button) => button.textContent === "My Work")!;
      await act(async () => workAgain.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      await act(async () => { vi.advanceTimersByTime(1); await settle(); });
      expect((document.activeElement as unknown as HostNode).getAttribute("id")).toBe("app-mode-work");
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
      /* The panel is preserved across a restore like every other preference -- and it gains a tab
         for the restored place, because the tab set follows the route: a restore that lands on
         project-1 is a navigation to project-1. That tab is stored under the live chat's id, which
         this test cannot know, so the assertion drops the panel's keys and states what it holds. */
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
      /* The chat holds the place the restore landed on -- when there was one: a restore that
         returns nothing, or fails, leaves the panel with no place to name. */
      expect(persisted().tabs).toEqual(outcome === "success" ? ["Workspace", "Theme QA"] : []);

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
      const marketplaceHeading = marketplaceSurface.querySelector("#marketplace-heading") as HostNode;
      const marketplaceScroll = marketplaceSurface.querySelector(".marketplace-scroll") as HostNode;
      expect(marketplaceSurface.getAttribute("hidden")).toBeNull();
      expect(document.activeElement).toBe(marketplaceHeading);
      expect(marketplaceScroll.scrollTop).toBe(438);

      const marketplaceMode = host.container.querySelector("#app-mode-marketplace") as HostNode;
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
    const host = createReactHost();
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
      /* The shortcut the main process forwards is a chat-lens affordance: there the chat is the
         lens and cannot be shown or hidden, so the chord toggles the panel beside it. Under the
         desk lens the chat is unreachable by design, so the chord is silent -- it used to pull the
         lens over, which made the lens pair (⌘1/⌘2) a decoration. */
      const chat = host.container.querySelector("[data-testid=\"agent-chat\"]");
      await act(async () => { toggleRightPanel?.(); await settle(); });
      expect(document.body.querySelector("[data-instrument-overlay=\"right-rail-sheet\"]")).toBeNull();
      /* The chat's markup stays parked in the shell while the rail is closed, so what says it is
         not on screen is the rail's mode and the chat controller being disabled -- not the
         absence of the element. */
      expect(host.container.querySelector(".instrument-shell")?.getAttribute("data-right-rail-mode")).toBe("closed");
      expect(enabledStates.at(-1)).toBe(false);
      // Nothing about the lens reaches storage here on purpose: this is the null-catalog recovery
      // state, and the preference write is gated on a catalog. `workbench-state` covers the
      // round trip.
      const marketplace = [...host.container.querySelectorAll("button")].find((button) => button.textContent === "Marketplace");
      expect(marketplace).not.toBeUndefined();
      await act(async () => marketplace!.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(host.container.textContent).toContain("Discover");
      // The lens does not apply in Marketplace, so its dock closes -- and the chat is the same
      // element throughout, never remounted.
      expect(host.container.querySelector("[data-testid=\"agent-chat\"]")).toBe(chat);
    } finally {
      await act(async () => root.unmount());
      restore.mockRestore();
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else delete (globalThis as Record<string, unknown>).localStorage;
      delete (globalThis as typeof globalThis & { __agentChatEnabled?: boolean[] }).__agentChatEnabled;
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
    const actualChat = await vi.importActual<typeof import("@/features/agent-chat/model/useAgentChat")>("../src/features/agent-chat/model/useAgentChat");
    const actualPanels = await vi.importActual<typeof import("@/widgets/utility-panels/ui/UtilityPanels")>("../src/widgets/utility-panels/ui/UtilityPanels");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    function NoRootChat() {
      const chat = actualChat.useAgentChat({ rootPath: null, workspaceId: null, project: null, enabled: false });
      return <actualPanels.AgentChatPanel chat={chat} workspace={null} project={null} onClose={() => undefined} onOpenSettings={() => undefined} />;
    }
    try {
      await act(async () => { root.render(<NoRootChat />); await settle(); });
      /* Handoff 17's dialog: the ways in are listed as rows and the selected one carries its own
         control, so the copy is the dialog's title plus that control's state. */
      expect(host.container.textContent).toContain("No provider connected");
      expect(host.container.textContent).toContain("Codex CLI not found");
      expect(host.container.querySelector("textarea")).toBeNull();
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
