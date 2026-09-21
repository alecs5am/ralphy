import { act, useState } from "react";
import { expect, test, vi } from "vitest";
import { useViewTabs } from "@/app/model/use-view-tabs";
import { EMPTY_VIEW_PANEL, type WorkbenchRoute, type WorkspacePage } from "@/shared/model/workbench";
import { createReactHost } from "./react-host";
import type { ProjectSummary } from "@/shared/api/ipc";
import { shellColumns } from "@/app/layout/shell-geometry";

test("hiding the agent preserves the active content tab and opening content does not force chat", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let view: ReturnType<typeof useViewTabs>;
  let hideAgent: () => void;
  let currentLens: "desk" | "chat";
  function Harness() {
    const [viewPanel, setViewPanel] = useState(EMPTY_VIEW_PANEL);
    const [lens, setLens] = useState<"desk" | "chat">("chat");
    currentLens = lens;
    hideAgent = () => setLens("desk");
    view = useViewTabs({ viewPanel, setViewPanel, lens, setLens, mode: "work", viewChatId: "chat", route: { kind: "workspace", workspaceId: "ws" }, projects: [], workspacePage: "projects", settingsVisible: false, onOpenWorkspacePage: () => undefined, onOpenProject: () => undefined });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => view!.openView({ type: "unit", targetId: "ws/prj/video", label: "Video" }));
    const tab = view!.viewTab;
    await act(async () => hideAgent!());
    expect(view!.viewFrameActive).toBe(true);
    expect(view!.viewTab).toEqual(tab);
    await act(async () => view!.openView({ type: "browser", targetId: "https://example.com", label: "Reference" }));
    expect(currentLens!).toBe("desk");
    expect(view!.viewTab.type).toBe("browser");
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});

test("the agent rail preserves its width while both columns fit their minimum widths", () => {
  const input = { dimensions: { frameWidth: 1100, deskWidth: 600, deskHeight: 900 }, leftVisible: true, leftWidth: 260, rightWidth: 300, viewWidth: 585, railDocked: true, chatLens: true };
  expect(shellColumns(input)).toMatchObject({ viewPanelFits: true, railWidth: 300, railMax: 444 });
  expect(shellColumns({ ...input, dimensions: { ...input.dimensions, frameWidth: 948 } })).toMatchObject({ viewPanelFits: true, railWidth: 292 });
  expect(shellColumns({ ...input, dimensions: { ...input.dimensions, frameWidth: 947 } }).viewPanelFits).toBe(false);
  expect(shellColumns({ ...input, dimensions: { ...input.dimensions, frameWidth: 900 } }).viewPanelFits).toBe(false);
  expect(shellColumns({ ...input, leftVisible: false, dimensions: { ...input.dimensions, frameWidth: 900 } }).viewPanelFits).toBe(true);
});

test("Unit views open, switch and close beside the same chat without navigating to a project", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const openProject = vi.fn();
  const openPage = vi.fn();
  const project = { projectId: "prj", workspaceId: "ws", name: "Project" } as ProjectSummary;
  const otherWorkspaceProject = { ...project, workspaceId: "another", name: "Other workspace project" };
  let view: ReturnType<typeof useViewTabs>;
  function Harness() {
    const [viewPanel, setViewPanel] = useState(EMPTY_VIEW_PANEL);
    const [lens, setLens] = useState<"desk" | "chat">("chat");
    const [route, setRoute] = useState<WorkbenchRoute>({ kind: "workspace", workspaceId: "ws" });
    view = useViewTabs({ viewPanel, setViewPanel, lens, setLens, mode: "work", viewChatId: "chat", route, projects: [otherWorkspaceProject, project], workspacePage: "overview", settingsVisible: false, onOpenWorkspacePage: openPage, onOpenProject: (project) => { openProject(project); setRoute({ kind: "project", workspaceId: project.workspaceId, projectId: project.projectId }); setLens("desk"); } });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => view!.openView({ type: "project", targetId: "prj", label: "Project" }));
    expect(openProject).toHaveBeenCalledWith(project);
    openProject.mockClear(); openPage.mockClear();
    await act(async () => view!.openView({ type: "unit", targetId: "ws/prj/image", label: "Image" }));
    const image = view!.viewTab.id;
    await act(async () => view!.openView({ type: "unit", targetId: "ws/prj/video", label: "Video" }));
    expect(view!.viewFrameActive).toBe(true);
    expect(view!.viewExpanded).toBe(false);
    expect(openProject).not.toHaveBeenCalled();
    expect(openPage).not.toHaveBeenCalled();
    await act(async () => view!.openView({ type: "browser", targetId: "https://example.com", label: "Reference" }));
    await act(async () => view!.toggleViewExpanded());
    expect(view!.viewExpanded).toBe(true);
    await act(async () => view!.selectView(image));
    expect(view!.viewTab.label).toBe("Image");
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.closeView(image));
    expect(view!.viewTab.type).toBe("project");
    expect(view!.viewFrameActive).toBe(true);
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});

test.each(["desk", "chat"] as const)("Canvases preserves the %s lens, including when chat loads after navigation", async (initialLens) => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let view: ReturnType<typeof useViewTabs>;
  let currentLens: "desk" | "chat";
  let navigate: (page: WorkspacePage) => void;
  function Harness({ ready }: { ready: boolean }) {
    const [viewPanel, setViewPanel] = useState(EMPTY_VIEW_PANEL);
    const [lens, setLens] = useState<"desk" | "chat">(initialLens);
    const [workspacePage, setWorkspacePage] = useState<WorkspacePage>("overview");
    currentLens = lens;
    navigate = setWorkspacePage;
    view = useViewTabs({ viewPanel, setViewPanel, lens, setLens, mode: "work", viewChatId: "chat", viewChatReady: ready, route: { kind: "workspace", workspaceId: "ws" }, projects: [], workspacePage, settingsVisible: false, onOpenWorkspacePage: setWorkspacePage, onOpenProject: () => undefined });
    return null;
  }
  try {
    await act(async () => root.render(<Harness ready={false} />));
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.openView({ type: "canvas", label: "Canvas" }));
    expect(currentLens!).toBe(initialLens);
    expect(view!.viewExpanded).toBe(false);
    expect(view!.viewTab.type).toBe("canvas");
    await act(async () => root.render(<Harness ready />));
    expect(view!.viewFrameActive).toBe(true);
    expect(currentLens!).toBe(initialLens);
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.toggleViewExpanded());
    expect(view!.viewExpanded).toBe(true);
    await act(async () => root.render(<Harness ready />));
    expect(view!.viewExpanded).toBe(true);
    await act(async () => view!.openView({ type: "canvas", label: "Canvas" }));
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.toggleViewExpanded());
    await act(async () => view!.openView({ type: "memory", label: "Memory" }));
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.toggleViewExpanded());
    await act(async () => navigate!("context"));
    expect(view!.viewExpanded).toBe(false);
    expect(view!.tabSet.tabs.map(({ type }) => type)).toEqual(["home"]);
    await act(async () => view!.openView({ type: "canvas", label: "Canvases" }));
    expect(currentLens!).toBe(initialLens);
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.openView({ type: "memory", label: "Memory" }));
    expect(view!.viewExpanded).toBe(false);
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});

test("asking an agent from a desk canvas reveals chat even when its chat record loads later", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let view: ReturnType<typeof useViewTabs>;
  let currentLens: "desk" | "chat";
  function Harness({ ready }: { ready: boolean }) {
    const [viewPanel, setViewPanel] = useState(EMPTY_VIEW_PANEL);
    const [lens, setLens] = useState<"desk" | "chat">("desk");
    currentLens = lens;
    view = useViewTabs({ viewPanel, setViewPanel, lens, setLens, mode: "work", viewChatId: ready ? "chat" : null, route: { kind: "workspace", workspaceId: "ws" }, projects: [], workspacePage: "canvas", settingsVisible: false, onOpenWorkspacePage: () => undefined, onOpenProject: () => undefined });
    return null;
  }
  try {
    await act(async () => root.render(<Harness ready={false} />));
    await act(async () => view!.revealCanvasChat());
    await act(async () => root.render(<Harness ready />));
    expect(view!.viewFrameActive).toBe(true);
    expect(view!.viewTab.type).toBe("canvas");
    expect(currentLens!).toBe("chat");
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.openView({ type: "canvas", label: "Canvases" }));
    expect(currentLens!).toBe("chat");
    expect(view!.viewExpanded).toBe(false);
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});
