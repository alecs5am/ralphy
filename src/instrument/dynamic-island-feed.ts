import type { AgentChatState } from "../chat/useAgentChat";
import type { MarketplaceLocation } from "../state/marketplace-navigation";
import type { WorkbenchRoute } from "../state/workbench";
import type { Availability } from "./types";

export interface ProjectStatusSummary { approved: number; needsWork: number; rejected: number; unreviewed: number }
export interface IslandTask { id: string; label: string; status: "running" | "complete" | "failed"; progress: number | null; destination?: WorkbenchRoute | MarketplaceLocation }
export interface IslandNotification { id: string; title: string; timestamp: number; severity: "info" | "attention" | "error"; unread: boolean; destination?: WorkbenchRoute | MarketplaceLocation }
export interface DynamicIslandFeed { projectStatus: Availability<ProjectStatusSummary>; activeTask: IslandTask | null; notifications: Availability<IslandNotification[]> }
export interface DynamicIslandProjectionInput { rootEpoch: number; agentState: AgentChatState; appError: string | null }

export function projectDynamicIslandFeed(input: DynamicIslandProjectionInput): DynamicIslandFeed {
  const running = input.agentState.runningChatId
    ? input.agentState.chats.find(({ id }) => id === input.agentState.runningChatId)
    : null;
  return {
    projectStatus: { status: "unavailable", reason: "Project review totals are unavailable from the current Desktop contract." },
    activeTask: running ? { id: `agent-${running.id}`, label: running.title || "Agent task", status: "running", progress: null } : null,
    notifications: input.appError
      ? { status: "ready", value: [{ id: `app-error-${input.rootEpoch}`, title: input.appError, timestamp: Date.now(), severity: "error", unread: true }] }
      : { status: "empty", reason: "No new notifications." },
  };
}
