import { act, useState } from "react";
import { expect, test, vi } from "vitest";
import { useViewTabs } from "@/app/model/use-view-tabs";
import { EMPTY_VIEW_PANEL } from "@/shared/model/workbench";
import { createReactHost } from "./react-host";

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
