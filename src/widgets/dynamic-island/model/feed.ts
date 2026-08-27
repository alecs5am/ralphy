import type { AgentChatState } from "@/features/agent-chat";
import type { MarketplaceLocation } from "@/shared/model/routes";
import type { WorkbenchRoute } from "@/shared/model/workbench";
import type { Availability } from "@/shared/instrument/types";

export interface ProjectStatusSummary { approved: number; needsWork: number; rejected: number; unreviewed: number }
export interface IslandTask { id: string; label: string; status: "running" | "complete" | "failed"; progress: number | null; destination?: WorkbenchRoute | MarketplaceLocation }
export interface IslandNotification { id: string; title: string; timestamp: number; severity: "info" | "attention" | "error"; unread: boolean; destination?: WorkbenchRoute | MarketplaceLocation }
export interface DynamicIslandFeed { projectStatus: Availability<ProjectStatusSummary>; activeTask: IslandTask | null; notifications: Availability<IslandNotification[]> }
// Where the operator currently is. The island is the only chrome that still carries this
// after the project header and the top-right avatar were removed, so it is never empty:
// `identity` seeds the dither grain and tint, `label` is the place, `detail` its section.
export interface IslandContext { identity: string | null; label: string; detail: string | null; count: number | null }
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
