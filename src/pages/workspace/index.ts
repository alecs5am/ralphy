/* The slice's public API: what the rest of the app may reach. Anything not re-exported here
   is internal to pages/workspace, and moving it is nobody else's business. */
export * from "./ui/WorkspaceInsights";
export * from "./ui/WorkspaceOperations";
export * from "./ui/WorkspaceOverviewHeader";
export * from "./ui/WorkspacePerformance";
export * from "./ui/WorkspacePlanAndOutcomes";
export * from "./ui/WorkspaceScreen";
export * from "./model/screen-controller";
export * from "./lib/overview-presentation";
