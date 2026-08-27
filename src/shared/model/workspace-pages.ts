/**
 * The pages a workspace has, in the order the sidebar lists them, and the label each one shows.
 *
 * One array is the source: the page type, the sidebar's rows and the view-tab kinds are all
 * derived from it, so a new page cannot be half-added.
 */
export type WorkspaceView = "grid" | "list";
export const WORKSPACE_PAGES = ["overview", "projects", "units", "shared", "memory", "context", "calendar"] as const;
export type WorkspacePage = (typeof WORKSPACE_PAGES)[number];

export const WORKSPACE_PAGE_LABELS: Record<WorkspacePage, string> = {
  overview: "Overview",
  projects: "Projects",
  units: "Units",
  shared: "Shared library",
  memory: "Memory",
  context: "Context",
  calendar: "Calendar",
};
