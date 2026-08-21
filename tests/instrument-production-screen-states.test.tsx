import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  isChatRailVisible,
  isWorkspacePickerVisible,
} from "../src/App";
import {
  InstrumentScreenRoot,
  type InstrumentRouteKey,
  type InstrumentScenarioState,
} from "../src/instrument/screen-state-registry";
import {
  CHAT_RAIL_ROUTE_KEYS,
  PRODUCTION_GLOBAL_OVERLAY_ROUTES,
  PRODUCTION_SCREEN_STATES,
  WORKSPACE_PICKER_ROUTE_KEYS,
} from "../src/instrument/production-screen-states";
import { bridge } from "../src/lib/ipc";
import {
  MemoryScreen,
  memoryInstrumentStates,
} from "../src/screens/MemoryScreen";
import { createReactHost } from "./react-host";

const actualRouteKeys = [
  "startup.welcome",
  "startup.library",
  "startup.migration",
  "workspace.overview",
  "workspace.projects",
  "workspace.units",
  "workspace.shared",
  "workspace.memory",
  "workspace.calendar",
  "project.units",
  "project.documents",
  "project.media",
  "project.activity",
  "settings.general",
  "settings.profile",
  "settings.appearance",
  "settings.providers",
  "settings.terminal",
  "settings.about",
  "marketplace.discover",
  "marketplace.results",
  "marketplace.collection",
  "marketplace.detail",
  "marketplace.category.models",
  "marketplace.category.templates",
  "marketplace.category.recipes",
  "marketplace.category.prompts",
  "marketplace.category.components",
  "marketplace.category.skills",
  "marketplace.library.installed",
  "marketplace.library.saved",
  "marketplace.library.added",
  "marketplace.library.downloads",
  "marketplace.library.updates",
  "marketplace.library.attention",
  "marketplace.unavailable-detail.prompts",
  "marketplace.unavailable-detail.components",
  "marketplace.unavailable-detail.skills",
] as const satisfies readonly InstrumentRouteKey[];

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

afterEach(() => vi.restoreAllMocks());

describe("production instrument screen states", () => {
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
    ]);
    expect(PRODUCTION_GLOBAL_OVERLAY_ROUTES).toEqual({
      "workspace-picker": WORKSPACE_PICKER_ROUTE_KEYS,
      "agent-chat-recent-menu": CHAT_RAIL_ROUTE_KEYS,
      "agent-chat-provider-menu": CHAT_RAIL_ROUTE_KEYS,
      "agent-chat-model-menu": CHAT_RAIL_ROUTE_KEYS,
      "agent-chat-mode-menu": CHAT_RAIL_ROUTE_KEYS,
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
