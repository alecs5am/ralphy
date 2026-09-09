import { act } from "react";
import { expect, test, vi } from "vitest";

import { WorkRoute, type WorkRouteProps } from "@/app/ui/WorkRoute";
import { useSettingsDialog } from "@/app/model/use-settings-dialog";
import { ViewPanel, openViewTab, tabSetFor } from "@/widgets/view-panel";
import { EMPTY_VIEW_PANEL, readWorkbenchPreferences } from "@/shared/model/workbench";
import { createReactHost } from "./react-host";

const { mountStudio } = vi.hoisted(() => ({ mountStudio: vi.fn() }));
vi.mock("@/pages/generation", async () => {
  const { useEffect } = await import("react");
  return {
    GenerationScreen: (props: { workspaceId: string; workspaceName: string; rootEpoch: number; onOpenProviders?(): void }) => {
      useEffect(() => { mountStudio(); }, []);
      return <main aria-label="Create studio" data-workspace={props.workspaceId} data-epoch={props.rootEpoch}>
        {props.workspaceName}<button type="button" onClick={props.onOpenProviders}>Providers</button>
      </main>;
    },
  };
});

const workspace = {
  id: "studio", name: "Test studio", description: "", absolutePath: "/tmp/studio",
  projectCount: 0, sharedCount: 0, unitCount: 0, finalCount: 0, recentActivity: null,
};
const noAction = () => undefined;
const props: WorkRouteProps = {
  catalog: null, error: null, restoring: false, route: { kind: "workspace", workspaceId: workspace.id },
  pinnedWorkspaceIds: [], pinnedProjectIds: [], rootEpoch: 7, activitySequence: 0,
  workspaces: [workspace], projects: [], selectedWorkspace: workspace, selectedProject: null,
  workspacePage: "generation", overviewReturnState: null, workspaceDestination: null,
  sidebarSearchRequest: 0, targetUnitId: null, chat: null,
  onRetryLibrary: noAction, onOpenWorkspace: noAction, onOpenProject: noAction,
  onOpenWorkspacePage: noAction, onNavigateFromOverview: noAction, onToggleProjectPin: noAction,
};

test("Create opens without a chat, forwards provider settings, and remounts on root changes", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const onOpenProviders = vi.fn();
  mountStudio.mockClear();
  try {
    await act(async () => root.render(<WorkRoute {...props} onOpenProviders={onOpenProviders} />));
    await act(async () => { await vi.dynamicImportSettled(); });
    const screen = host.container.querySelector("[data-workspace]");
    expect(screen?.getAttribute("data-workspace")).toBe(workspace.id);
    expect(screen?.getAttribute("data-epoch")).toBe("7");
    expect(screen?.textContent).toContain(workspace.name);
    await act(async () => screen!.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(onOpenProviders).toHaveBeenCalledOnce();
    await act(async () => root.render(<WorkRoute {...props} rootEpoch={8} onOpenProviders={onOpenProviders} />));
    expect(mountStudio).toHaveBeenCalledTimes(2);
    expect(host.container.querySelector("main")?.getAttribute("data-epoch")).toBe("8");

    const set = openViewTab(tabSetFor(EMPTY_VIEW_PANEL, null), { type: "generation", label: "Create" });
    await act(async () => root.render(<ViewPanel set={set} width={700} chords={{}} onOpen={noAction} onClose={noAction} onSelect={noAction}>
      <WorkRoute {...props} />
    </ViewPanel>));
    expect(host.container.querySelectorAll(".view-panel")).toHaveLength(1);
    expect(host.container.querySelectorAll("[data-workspace]")).toHaveLength(1);
    expect(host.container.querySelectorAll(".rounded-window")).toHaveLength(1);
    expect(readWorkbenchPreferences({ getItem: () => JSON.stringify({ workspacePage: "generation" }), setItem: noAction }).workspacePage).toBe("generation");
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});

test("settings entry can open Providers and return to the default entry", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let settings: ReturnType<typeof useSettingsDialog>;
  function Harness() { settings = useSettingsDialog(); return null; }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => settings!.openSettings("providers"));
    expect(settings!.settingsVisible).toBe(true);
    expect(settings!.settingsEntry).toBe("providers");
    await act(async () => settings!.setSettingsVisible(false));
    await act(async () => settings!.openSettings());
    expect(settings!.settingsVisible).toBe(true);
    expect(settings!.settingsEntry).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});
