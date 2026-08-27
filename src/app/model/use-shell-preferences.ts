/**
 * The shell's own preferences, and the one place they are written back.
 *
 * Which columns are open, how wide they are, which lens is up and what the view panel holds are
 * all remembered, so the write-through belongs next to the state rather than to the component
 * that renders from it. It is debounced because a drag emits a width per frame, and it waits for
 * restoration to finish: writing during restore would persist the defaults over the operator's
 * own layout before the store had answered.
 */
import { useEffect, useState } from "react";

import type { ViewPanelPreferences } from "@/widgets/view-panel";
import type { RootIdentity } from "@/shared/api/ipc";
import {
  updateWorkbenchPreferences,
  type WorkbenchPreferences,
  type WorkbenchState,
  type WorkspacePage,
} from "@/shared/model/workbench";

export function useShellPreferences(
  initial: WorkbenchPreferences,
  { restoring, rootIdentity, state }: {
    restoring: boolean;
    rootIdentity: RootIdentity | null;
    state: WorkbenchState;
  },
) {
  /* The open page is a preference too: an operator who left on Calendar comes back to Calendar. */
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>(initial.workspacePage);
  const [sidebarVisible, setSidebarVisible] = useState(initial.sidebarVisible);
  const [rightPanelVisible, setRightPanelVisible] = useState(initial.rightPanelVisible);
  const [lens, setLens] = useState(initial.lens);
  const [rightOverlayOpen, setRightOverlayOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(initial.sidebarWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(initial.rightPanelWidth);
  const [viewPanel, setViewPanel] = useState<ViewPanelPreferences>(initial.viewPanel);

  useEffect(() => {
    if (restoring || !rootIdentity || !state.catalog) return;
    const workspaceId = state.route.kind === "library" ? null : state.route.workspaceId;
    const projectId = state.route.kind === "project" ? state.route.projectId : null;
    const timer = window.setTimeout(() => {
      updateWorkbenchPreferences(localStorage, (current) => ({
        ...current,
        rootPath: rootIdentity.storeId,
        workspaceId,
        projectId,
        pinnedWorkspaceIds: state.pinnedWorkspaceIds,
        pinnedProjectIds: state.pinnedProjectIds,
        workspacePage,
        sidebarVisible,
        lens,
        rightPanelVisible,
        sidebarWidth,
        rightPanelWidth,
        viewPanel,
      }));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    rootIdentity?.storeId,
    lens,
    rightPanelWidth,
    rightPanelVisible,
    restoring,
    sidebarWidth,
    sidebarVisible,
    state.pinnedProjectIds,
    state.pinnedWorkspaceIds,
    state.catalog,
    state.route,
    viewPanel,
    workspacePage,
  ]);

  return {
    workspacePage,
    setWorkspacePage,
    sidebarVisible,
    setSidebarVisible,
    rightPanelVisible,
    setRightPanelVisible,
    lens,
    setLens,
    rightOverlayOpen,
    setRightOverlayOpen,
    sidebarWidth,
    setSidebarWidth,
    rightPanelWidth,
    setRightPanelWidth,
    viewPanel,
    setViewPanel,
  };
}
