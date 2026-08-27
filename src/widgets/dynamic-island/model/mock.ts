import type { ProjectSummary, WorkspaceSummary } from "@/shared/api/ipc";
import type { DynamicIslandFeed } from "./feed";

export interface DynamicIslandMockContext { rootEpoch: number; workspace: WorkspaceSummary | null; project: ProjectSummary | null }
export type DynamicIslandMockProvider = (input: DynamicIslandMockContext) => DynamicIslandFeed | null;

export const projectMockDynamicIslandFeed: DynamicIslandMockProvider = ({ rootEpoch, workspace, project }) => {
  if (workspace?.name !== "UX Testing Lab") return null;
  const destination = project ? { kind: "project" as const, workspaceId: project.workspaceId, projectId: project.projectId } : { kind: "workspace" as const, workspaceId: workspace.id };
  return {
    projectStatus: { status: "ready", value: { approved: 18, needsWork: 3, rejected: 1, unreviewed: 7 } },
    activeTask: { id: `ux-task-${rootEpoch}`, label: project ? `Reviewing ${project.name}` : "Preparing UX review", status: "running", progress: 0.68, destination },
    notifications: { status: "ready", value: [
      { id: "ux-mock-render-1", title: "Iteration 3 render is ready", timestamp: 1_723_000_000_000, severity: "attention", unread: true, destination },
      { id: "ux-mock-sync-2", title: "Shared library synced", timestamp: 1_722_999_700_000, severity: "info", unread: false, destination },
      { id: "ux-mock-agent-3", title: "Agent completed the project brief", timestamp: 1_722_999_400_000, severity: "info", unread: false, destination },
    ] },
  };
};
