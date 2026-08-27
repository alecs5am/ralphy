/**
 * What the island says: the live feed, the mock feed a testing workspace substitutes, and the one
 * line of context that tells the operator where they are.
 *
 * The island is the only chrome left that names your place, so it always has a context --
 * workspace plus page, project plus phase, or the Marketplace section. The mock feed loads on
 * demand and only in the mock build: a workspace named "UX Testing Lab" is a demonstration, and
 * nothing about it may reach a real store.
 */
import { useEffect, useMemo, useState } from "react";

import { projectDynamicIslandFeed, type DynamicIslandFeed, type IslandContext } from "@/widgets/dynamic-island";
import type { AgentChatState } from "@/features/agent-chat";
import type { ProjectSummary, WorkspaceSummary } from "@/shared/api/ipc";
import type { AppMode, MarketplaceRoute } from "@/shared/model/routes";
import { WORKSPACE_PAGE_LABELS, type WorkspacePage } from "@/shared/model/workbench";

export interface IslandInput {
  mode: AppMode;
  marketplaceRoute: MarketplaceRoute;
  rootEpoch: number;
  agentState: AgentChatState | null;
  error: string | null;
  selectedWorkspace: WorkspaceSummary | null;
  selectedProject: ProjectSummary | null;
  workspacePage: WorkspacePage;
}

export function useIslandFeed({
  mode,
  marketplaceRoute,
  rootEpoch,
  agentState,
  error,
  selectedWorkspace,
  selectedProject,
  workspacePage,
}: IslandInput) {
  const liveIslandFeed = useMemo(() => projectDynamicIslandFeed({
    rootEpoch,
    agentState: agentState ?? { chats: [], activeChatId: "", runningChatId: null },
    appError: error,
  }), [agentState, error, rootEpoch]);
  // The island is the only chrome left that says where you are, so it always has a
  // context: workspace plus page, project plus phase, or the marketplace section. The
  // project's own section is the dock's job, one row below.
  const islandContext = useMemo<IslandContext>(() => {
    if (mode === "marketplace") {
      const route = marketplaceRoute;
      const detail = route.kind === "category" ? route.category
        : route.kind === "library" ? route.section
          : route.kind;
      return { identity: null, label: "Marketplace", detail, count: null };
    }
    if (selectedProject) return { identity: selectedProject.name, label: selectedProject.name, detail: selectedProject.phase || selectedProject.status || null, count: null };
    if (selectedWorkspace) {
      const count = workspacePage === "projects" ? selectedWorkspace.projectCount
        : workspacePage === "units" ? selectedWorkspace.unitCount
          : workspacePage === "shared" ? selectedWorkspace.sharedCount
            : null;
      return { identity: selectedWorkspace.name, label: selectedWorkspace.name, detail: WORKSPACE_PAGE_LABELS[workspacePage], count };
    }
    return { identity: null, label: "Library", detail: null, count: null };
  }, [marketplaceRoute, mode, selectedProject, selectedWorkspace, workspacePage]);
  const [mockIslandFeed, setMockIslandFeed] = useState<DynamicIslandFeed | null>(null);
  useEffect(() => {
    let cancelled = false;
    setMockIslandFeed(null);
    if (import.meta.env.VITE_RALPHY_ENABLE_MOCKS !== "true" || selectedWorkspace?.name !== "UX Testing Lab") return;
    void import("@/widgets/dynamic-island").then(({ projectMockDynamicIslandFeed }) => {
      if (!cancelled) setMockIslandFeed(projectMockDynamicIslandFeed({ rootEpoch, workspace: selectedWorkspace, project: selectedProject }));
    });
    return () => { cancelled = true; };
  }, [rootEpoch, selectedProject?.projectId, selectedProject?.workspaceId, selectedWorkspace?.id, selectedWorkspace?.name]);

  return { feed: mockIslandFeed ?? liveIslandFeed, context: islandContext, mock: mockIslandFeed !== null };
}
