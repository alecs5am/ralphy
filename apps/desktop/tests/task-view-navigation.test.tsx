import { act, useState } from "react";
import { expect, test, vi } from "vitest";
import { useViewTabs } from "@/app/model/use-view-tabs";
import type { ProjectSummary } from "@/shared/api/ipc";
import { EMPTY_VIEW_PANEL, type WorkbenchRoute, type WorkspacePage } from "@/shared/model/workbench";
import { HOME_TAB_ID, ViewPanel, openViewTab, retargetViewTab, selectViewTab, tabSetFor } from "@/widgets/view-panel";
import { createReactHost } from "./react-host";

test("sidebar destinations do not create tabs and retained documents remain reachable by keyboard", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let view: ReturnType<typeof useViewTabs>;
  function Harness() {
    const [viewPanel, setViewPanel] = useState(EMPTY_VIEW_PANEL);
    const [route, setRoute] = useState<WorkbenchRoute>({ kind: "workspace", workspaceId: "ws" });
    const [workspacePage, setWorkspacePage] = useState<WorkspacePage>("units");
    view = useViewTabs({ viewPanel, setViewPanel, route, workspacePage, mode: "work", lens: "desk", setLens() {}, viewChatId: "chat", projects: [{ workspaceId: "ws", projectId: "prj", name: "Project" } as ProjectSummary], settingsVisible: false,
      onOpenWorkspacePage: (page) => { setWorkspacePage(page); setRoute({ kind: "workspace", workspaceId: "ws", page }); }, onOpenProject: () => setRoute({ kind: "project", workspaceId: "ws", projectId: "prj" }) });
    return <ViewPanel set={view.tabSet} width={800} chords={{}} onOpen={view.openView} onSelect={view.selectView} onClose={view.closeView} onToggleExpanded={view.toggleViewExpanded}>Content</ViewPanel>;
  }
  const chord = (key: string, altKey = false) => Object.assign(new Event("keydown", { cancelable: true }), { key, metaKey: !altKey, altKey, ctrlKey: false, shiftKey: false });
  try {
    await act(async () => root.render(<Harness />));
    expect(view!.tabSet.tabs.map(({ type }) => type)).toEqual(["home"]);
    await act(async () => view!.openView({ type: "unit", targetId: "ws/prj/image/rev-2", label: "Image" }));
    const image = view!.viewTab;
    expect(host.container.findAll((node) => node.getAttribute("aria-label") === "Expand workspace panel")).toHaveLength(0);
    await act(async () => host.container.findAll((node) => node.getAttribute("aria-label") === "All content")[0]!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(view!.viewTab.type).toBe("units");
    expect(view!.tabSet.tabs).toContainEqual(image);
    await act(async () => view!.openView({ type: "browser", targetId: "https://example.com", label: "Reference" }));
    const browser = view!.viewTab;
    await act(async () => view!.openView({ type: "calendar", label: "Calendar" }));
    expect(view!.viewTab.type).toBe("calendar");
    expect(view!.tabSet.tabs.map(({ type }) => type)).toEqual(["home", "unit", "browser"]);
    expect(view!.tabSet.tabs).toContainEqual(image);
    expect(view!.tabSet.tabs).toContainEqual(browser);
    await act(async () => window.dispatchEvent(chord("1", true)));
    expect(view!.viewTab).toEqual(image);
    await act(async () => window.dispatchEvent(chord("w")));
    expect(view!.tabSet.tabs).toContainEqual(browser);
    await act(async () => view!.selectView(browser.id));
    await act(async () => view!.closeView(browser.id));
    expect(view!.viewTab.type).toBe("calendar");
    expect(view!.tabSet.tabs.map(({ type }) => type)).toEqual(["home"]);
    await act(async () => view!.openView({ type: "project", targetId: "prj", label: "Project" }));
    await act(async () => view!.openView({ type: "unit", targetId: image.targetId, label: "Image" }));
    await act(async () => view!.openView({ type: "project", targetId: "prj", label: "Project" }));
    expect(view!.viewTab.type).toBe("project");
    expect(view!.tabSet.tabs.map(({ type }) => type)).toEqual(["home", "unit"]);
    await act(async () => view!.selectView(view!.tabSet.tabs.find(({ type }) => type === "unit")!.id));
    await act(async () => host.container.findAll((node) => node.getAttribute("aria-label") === "All content")[0]!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(view!.viewTab.type).toBe("units");
    expect(view!.tabSet.tabs.map(({ type }) => type)).toEqual(["home", "unit"]);
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});

test("the task strip hides sidebar destinations while the persistent browser survives navigation", async () => {
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const idle = () => undefined;
  let set = openViewTab(tabSetFor(EMPTY_VIEW_PANEL, null), { type: "calendar", label: "Calendar" });
  const render = async () => act(async () => root.render(<ViewPanel set={set} width={800} chords={{}} onOpen={idle} onSelect={idle} onClose={idle} browser={<textarea aria-label="Browser draft" defaultValue="Keep this page" />}>Content</ViewPanel>));
  try {
    await render();
    expect(host.container.querySelector('[role="tablist"]')).toBeNull();
    expect(host.container.querySelector('[aria-label="New view"]')).toBeNull();
    expect(host.container.querySelector('[aria-label="Workspace home"]')).toBeNull();
    const browser = host.container.querySelector("textarea");
    set = openViewTab(set, { type: "browser", label: "Browser" });
    const browserId = set.activeTabId;
    set = selectViewTab(set, HOME_TAB_ID);
    await render();
    expect(host.container.querySelector('[role="tablist"]')).toBeNull();
    set = selectViewTab(set, browserId);
    await render();
    expect(host.container.querySelector('[role="tablist"]')?.textContent).toBe("Browser");
    set = openViewTab(set, { type: "unit", targetId: "ws/prj/unit", label: "Creative" });
    await render();
    expect(host.container.querySelector('[role="tablist"]')?.textContent).toBe("Creative");
    set = selectViewTab(retargetViewTab(set, browserId, "https://example.com", "Reference"), browserId);
    await render();
    expect(host.container.querySelector('[role="tablist"]')?.textContent).toContain("Reference");
    expect(host.container.querySelector("textarea")).toBe(browser);
    expect(host.container.querySelector(".view-panel-browser")?.getAttribute("class")).not.toContain("invisible");
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("legacy mixed tabs restore the active document across lens changes and sidebar navigation keeps the empty browser", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let initial = openViewTab(tabSetFor(EMPTY_VIEW_PANEL, null), { type: "calendar", label: "Calendar" });
  initial = openViewTab(initial, { type: "browser", label: "Browser" });
  const browserId = initial.activeTabId;
  initial = openViewTab(initial, { type: "unit", targetId: "ws/prj/unit/rev-2", label: "Creative" });
  const documentId = initial.activeTabId;
  let view: ReturnType<typeof useViewTabs>;
  function Harness({ lens }: { lens: "desk" | "chat" }) {
    const [viewPanel, setViewPanel] = useState({ ...EMPTY_VIEW_PANEL, byChat: { chat: { ...initial, width: 600 } } });
    const [workspacePage, setWorkspacePage] = useState<WorkspacePage>("units");
    view = useViewTabs({ viewPanel, setViewPanel, workspacePage, route: { kind: "workspace", workspaceId: "ws" }, mode: "work", lens, setLens() {}, viewChatId: "chat", projects: [], settingsVisible: false, onOpenWorkspacePage: setWorkspacePage, onOpenProject() {} });
    return null;
  }
  try {
    await act(async () => root.render(<Harness lens="desk" />));
    expect(view!.viewTab.targetId).toBe("ws/prj/unit/rev-2");
    await act(async () => root.render(<Harness lens="chat" />));
    expect(view!.viewTab.id).toBe(documentId);
    await act(async () => view!.openView({ type: "calendar", label: "Calendar" }));
    expect(view!.viewTab.type).toBe("calendar");
    await act(async () => view!.closeView(documentId));
    expect(view!.viewTab.type).toBe("calendar");
    expect(view!.tabSet.tabs.some(({ id }) => id === browserId)).toBe(true);
    await act(async () => view!.openView({ type: "browser", label: "Browser" }));
    expect(view!.viewTab.id).toBe(browserId);
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});

test("task clicks during workspace history loading attach only to that workspace's restored chat", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let view: ReturnType<typeof useViewTabs>;
  function Harness({ chatId, ready, scope }: { chatId: string; ready: boolean; scope: string }) {
    const [viewPanel, setViewPanel] = useState(EMPTY_VIEW_PANEL);
    view = useViewTabs({ viewPanel, setViewPanel, viewChatId: chatId, viewChatReady: ready, viewScopeKey: scope,
      workspacePage: "units", route: { kind: "workspace", workspaceId: scope }, mode: "work", lens: "desk", setLens() {}, projects: [], settingsVisible: false, onOpenWorkspacePage() {}, onOpenProject() {} });
    return null;
  }
  try {
    await act(async () => root.render(<Harness chatId="old-chat" ready scope="old-workspace" />));
    await act(async () => root.render(<Harness chatId="old-chat" ready={false} scope="new-workspace" />));
    await act(async () => view!.openView({ type: "unit", targetId: "new-workspace/prj/unit", label: "New task" }));
    expect(view!.viewFrameActive).toBe(false);
    await act(async () => root.render(<Harness chatId="new-chat" ready scope="new-workspace" />));
    expect(view!.viewTab.targetId).toBe("new-workspace/prj/unit");
    await act(async () => root.render(<Harness chatId="old-chat" ready scope="old-workspace" />));
    expect(view!.tabSet.tabs.map(({ type }) => type)).toEqual(["home"]);
    await act(async () => root.render(<Harness chatId="old-chat" ready={false} scope="abandoned-root/workspace" />));
    await act(async () => view!.openView({ type: "browser", label: "Browser" }));
    await act(async () => root.render(<Harness chatId="third-chat" ready scope="different-root/workspace" />));
    expect(view!.tabSet.tabs.map(({ type }) => type)).toEqual(["home"]);
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});
