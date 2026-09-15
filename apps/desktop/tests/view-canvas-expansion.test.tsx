import { act, useState } from "react";
import { expect, test, vi } from "vitest";
import { useViewTabs } from "@/app/model/use-view-tabs";
import { EMPTY_VIEW_PANEL } from "@/shared/model/workbench";
import { createReactHost } from "./react-host";
import type { ProjectSummary } from "@/shared/api/ipc";
import { shellColumns } from "@/app/layout/shell-geometry";

test("the chat panel remains visible in a narrow window when both columns fit", () => {
  const input = { dimensions: { frameWidth: 1100, deskWidth: 600, deskHeight: 900 }, leftVisible: true, leftWidth: 260, rightWidth: 300, viewWidth: 585, railDocked: true };
  expect(shellColumns(input)).toMatchObject({ viewPanelFits: true, viewPanelWidth: 448 });
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
  let view: ReturnType<typeof useViewTabs>;
  function Harness() {
    const [viewPanel, setViewPanel] = useState(EMPTY_VIEW_PANEL);
    const [lens, setLens] = useState<"desk" | "chat">("chat");
    view = useViewTabs({ viewPanel, setViewPanel, lens, setLens, mode: "work", viewChatId: "chat", route: { kind: "workspace", workspaceId: "ws" }, projects: [project], workspacePage: "overview", settingsVisible: false, onOpenWorkspacePage: openPage, onOpenProject: (project) => { openProject(project); setLens("desk"); } });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => view!.openView({ type: "project", targetId: "prj", label: "Project" }));
    openProject.mockClear(); openPage.mockClear();
    await act(async () => view!.openView({ type: "unit", targetId: "ws/prj/image", label: "Image" }));
    const image = view!.viewTab.id;
    await act(async () => view!.openView({ type: "unit", targetId: "ws/prj/video", label: "Video" }));
    expect(view!.viewFrameActive).toBe(true);
    expect(view!.viewExpanded).toBe(false);
    expect(openProject).not.toHaveBeenCalled();
    expect(openPage).not.toHaveBeenCalled();
    await act(async () => view!.selectView(image));
    expect(view!.viewTab.label).toBe("Image");
    await act(async () => view!.closeView(image));
    expect(view!.viewTab.type).toBe("project");
    expect(view!.viewFrameActive).toBe(true);
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});

test("canvas opens maximized, can be restored, and exiting restores ordinary panel behavior", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let view: ReturnType<typeof useViewTabs>;
  function Harness() {
    const [viewPanel, setViewPanel] = useState(EMPTY_VIEW_PANEL);
    const [lens, setLens] = useState<"desk" | "chat">("desk");
    view = useViewTabs({ viewPanel, setViewPanel, lens, setLens, mode: "work", viewChatId: "chat", route: { kind: "workspace", workspaceId: "ws" }, projects: [], workspacePage: "overview", settingsVisible: false, onOpenWorkspacePage: () => undefined, onOpenProject: () => undefined });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.openView({ type: "canvas", label: "Canvas" }));
    expect(view!.viewExpanded).toBe(true);
    expect(view!.viewTab.type).toBe("canvas");
    await act(async () => view!.toggleViewExpanded());
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.openView({ type: "canvas", label: "Canvas" }));
    expect(view!.viewExpanded).toBe(true);
    await act(async () => view!.openView({ type: "memory", label: "Memory" }));
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.toggleViewExpanded());
    await act(async () => view!.openView({ type: "context", label: "Context" }));
    expect(view!.viewExpanded).toBe(true);
    const canvas = view!.tabSet.tabs.find((tab) => tab.type === "canvas")!;
    await act(async () => view!.selectView(canvas.id));
    expect(view!.viewExpanded).toBe(true);
    await act(async () => view!.closeView(canvas.id));
    expect(view!.viewExpanded).toBe(false);
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});

test("asking an agent from a desk canvas reveals chat even when its chat record loads later", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let view: ReturnType<typeof useViewTabs>;
  function Harness({ ready }: { ready: boolean }) {
    const [viewPanel, setViewPanel] = useState(EMPTY_VIEW_PANEL);
    const [lens, setLens] = useState<"desk" | "chat">("desk");
    view = useViewTabs({ viewPanel, setViewPanel, lens, setLens, mode: "work", viewChatId: ready ? "chat" : null, route: { kind: "workspace", workspaceId: "ws" }, projects: [], workspacePage: "canvas", settingsVisible: false, onOpenWorkspacePage: () => undefined, onOpenProject: () => undefined });
    return null;
  }
  try {
    await act(async () => root.render(<Harness ready={false} />));
    await act(async () => view!.revealCanvasChat());
    await act(async () => root.render(<Harness ready />));
    expect(view!.viewFrameActive).toBe(true);
    expect(view!.viewTab.type).toBe("canvas");
    expect(view!.viewExpanded).toBe(false);
    await act(async () => view!.openView({ type: "canvas", label: "Canvases" }));
    expect(view!.viewExpanded).toBe(true);
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});
