import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ProjectSummary } from "../src/lib/ipc";
import type { WorkspaceSummary } from "../src/lib/ipc";
import { ContextSidebar } from "../src/components/ContextSidebar";
import { MainHeader } from "../src/components/Titlebar";
import { WorkspaceProjectsScreen } from "../src/screens/WorkspaceProjectsScreen";

vi.mock("../src/components/ProfileMenu", () => ({ ProfileMenu: () => null }));

const projects: ProjectSummary[] = [
  {
    id: "workspace-1/project-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    name: "Launch film",
    brief: "A short launch film",
    status: "active",
    phase: "production",
    finalState: "working",
    platform: "tiktok",
    aspectRatio: "9:16",
    spendUsd: 3.84,
    finalCount: 1,
    sharedCount: 0,
    unitCount: 1,
    recentActivity: "2026-08-01T00:00:00.000Z",
  },
];

const workspace: WorkspaceSummary = {
  id: "workspace-1",
  name: "Launch Studio",
  description: "Short-form launches",
  absolutePath: "/tmp/demo/.ralphy/buckets/workspace-1",
  projectCount: 1,
  sharedCount: 2,
  unitCount: 3,
  finalCount: 1,
  recentActivity: "2026-08-01T00:00:00.000Z",
};

describe("workspace projects navigation", () => {
  test("renders project cards with a preview surface and open affordance", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceProjectsScreen
        workspaceName="Launch Studio"
        workspaceDescription="Short-form launches"
        projects={projects}
        pinnedProjectIds={[]}
        view="grid"
        searchRequest={0}
        onViewChange={() => undefined}
        onOpenProject={() => undefined}
        onToggleProjectPin={() => undefined}
      />,
    );

    expect(markup).toContain("Projects");
    expect(markup).toContain("workspace-project-grid");
    expect(markup).toContain("workspace-project-preview");
    expect(markup).toContain("Launch film");
    expect(markup).toContain("Open project Launch film");
  });

  test("keeps workspace resources in the sidebar navigation", () => {
    const markup = renderToStaticMarkup(
      <ContextSidebar
        route={{ kind: "workspace", workspaceId: workspace.id }}
        page="projects"
        pageActive
        rootPath="/tmp/demo/.ralphy"
        workspaces={[workspace]}
        workspaceId={workspace.id}
        pinnedWorkspaceIds={[]}
        canGoBack={false}
        canGoForward={false}
        onBack={() => undefined}
        onForward={() => undefined}
        onToggleSidebar={() => undefined}
        onOpenSettings={() => undefined}
        onOpenWorkspace={() => undefined}
        onOpenPage={() => undefined}
      />,
    );

    expect(markup).toContain("Memory");
    expect(markup).toContain("Calendar");
    expect(markup).toContain("Shared library");
    expect(markup).not.toContain("Filter projects");
    expect(markup).not.toContain("Launch film");
  });

  test("uses the titlebar slot for closable project tabs instead of breadcrumbs", () => {
    const markup = renderToStaticMarkup(
      <MainHeader
        tabs={[{ id: "workspace", label: "Projects", active: true, onOpen: () => undefined }]}
        sidebarVisible
        canGoBack
        canGoForward={false}
        rightPanelVisible={false}
        bottomPanelVisible={false}
        showChooseLibrary={false}
        onBack={() => undefined}
        onForward={() => undefined}
        onToggleSidebar={() => undefined}
        onChooseLibrary={() => undefined}
        onToggleRightPanel={() => undefined}
        onToggleBottomPanel={() => undefined}
      />,
    );

    expect(markup).toContain("Open project tabs");
    expect(markup).not.toContain("breadcrumbs");
  });
});
