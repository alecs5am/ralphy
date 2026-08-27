/**
 * Moving around My Work: which page of a workspace is open, which project, and the way back to
 * the Overview a route was reached from.
 *
 * Every workspace screen renders under a workspace route, and a project route renders the project
 * instead -- so setting the page without landing the route left each view tab showing whatever
 * project was open. One definition of the pair lives here, and the sidebar, the tab strip, the
 * island and the Overview's own links all call it.
 *
 * The destination and its return state are one unit: they are what "Back to Overview" means, and
 * they are dropped together the moment the workspace they belong to is no longer the open one.
 */
import { useCallback, useEffect, useState } from "react";

import type { ProjectSummary, WorkspaceSummary } from "@/shared/api/ipc";
import {
  mostRecentWorkspaceId,
  type WorkbenchAction,
  type WorkspaceDestination,
  type WorkspaceOverviewReturnState,
  type WorkspacePage,
} from "@/shared/model/workbench";

export function useWorkspaceNavigation({
  setWorkspacePage,
  dispatch,
  selectedWorkspace,
  workspaces,
  setLens,
}: {
  setWorkspacePage(page: WorkspacePage): void;
  dispatch(action: WorkbenchAction): void;
  selectedWorkspace: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
  setLens(lens: "desk" | "chat"): void;
}) {
  const [workspaceDestination, setWorkspaceDestination] = useState<WorkspaceDestination | null>(null);
  const [overviewReturnState, setOverviewReturnState] = useState<WorkspaceOverviewReturnState | null>(null);
  const [targetUnitId, setTargetUnitId] = useState<string | null>(null);

  const clearOverviewNavigation = useCallback(() => {
    setWorkspaceDestination(null);
    setOverviewReturnState(null);
  }, []);

  const openWorkspace = useCallback((workspaceId: string) => {
    clearOverviewNavigation();
    dispatch({ type: "open-workspace", workspaceId });
  }, [clearOverviewNavigation, dispatch]);

  useEffect(() => {
    if (overviewReturnState && overviewReturnState.originWorkspaceId !== selectedWorkspace?.id) clearOverviewNavigation();
  }, [clearOverviewNavigation, overviewReturnState, selectedWorkspace?.id]);

  const openProject = (project: ProjectSummary, unitId: string | null = null) => {
    setTargetUnitId(unitId);
    /* A project opens on the desk, never beside the chat: the screen is a workbench with its own
       tabs, filters and inspectors, and a chat column standing next to it leaves neither enough
       width. The chat lens is still one control away for an operator who asks for it. */
    setLens("desk");
    dispatch({
      type: "open-project",
      project: {
        workspaceId: project.workspaceId,
        projectId: project.projectId,
      },
    });
  };

  const openWorkspacePage = (page: WorkspacePage) => {
    setWorkspacePage(page);
    const workspaceId = selectedWorkspace?.id ?? mostRecentWorkspaceId(workspaces);
    if (workspaceId) openWorkspace(workspaceId);
    else clearOverviewNavigation();
  };

  const navigateFromOverview = (destination: WorkspaceDestination, returnState: WorkspaceOverviewReturnState) => {
    setWorkspaceDestination(destination);
    setOverviewReturnState(returnState);
    setWorkspacePage(destination.page);
  };

  const backToOverview = () => {
    setWorkspaceDestination(null);
    setWorkspacePage("overview");
  };

  return {
    workspaceDestination,
    overviewReturnState,
    targetUnitId,
    clearOverviewNavigation,
    openWorkspace,
    openProject,
    openWorkspacePage,
    navigateFromOverview,
    backToOverview,
  };
}
