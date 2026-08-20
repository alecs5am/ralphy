import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { MediaCardDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "../src/lib/ipc";
import type { WorkspaceSummary } from "../src/lib/ipc";
import { ContextSidebar } from "../src/components/ContextSidebar";
import { MainHeader } from "../src/components/Titlebar";
import { WorkspaceProjectsScreen } from "../src/screens/WorkspaceProjectsScreen";
import { LibraryScreen } from "../src/screens/LibraryScreen";
import { bridge } from "../src/lib/ipc";
import { readWorkbenchPreferences, WORKSPACE_PAGES } from "../src/state/workbench";
import { createReactHost } from "./react-host";

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

const styles = readFileSync(join(process.cwd(), "src/styles/workbench.css"), "utf8");

function mediaCard(id: string, mime: string): MediaCardDto {
  return {
    ref: { type: "object", id },
    workspaceId: "workspace-1",
    projectId: "project-1",
    storageClass: "final",
    mime,
    bytes: 2_048,
    createdAt: 1,
    referenceCount: 1,
    target: { type: "object", id },
    mediaKind: mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "image" : "document",
    provenance: "not-generation",
  };
}

describe("workspace projects navigation", () => {
  test("never mounts the workbench hidden while motion is reduced", () => {
    const source = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    expect(source).toContain("initial={false}");
    expect(source).not.toContain("initial={{ opacity: 0 }}");
  });
  test("fills each project preview with up to four visual project files", async () => {
    const cards = [
      mediaCard("cover", "image/png"),
      mediaCard("cut", "video/mp4"),
      mediaCard("frame-a", "image/jpeg"),
      mediaCard("notes", "text/plain"),
      mediaCard("frame-b", "image/webp"),
      mediaCard("extra", "image/png"),
    ];
    const load = vi.spyOn(bridge, "loadProjectPage").mockResolvedValue({ items: cards, nextCursor: null });
    const resolve = vi.spyOn(bridge, "resolveProjectPreview").mockImplementation(async (_project, ref) => ({
      url: `ralphy-media://asset/${ref.id}`,
      sizeBytes: 2_048,
    }));
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(
          <WorkspaceProjectsScreen
            workspaceName="Launch Studio"
            workspaceDescription="Short-form launches"
            projects={projects}
            rootEpoch={7}
            pinnedProjectIds={[]}
            searchRequest={0}
            onOpenProject={() => undefined}
            onToggleProjectPin={() => undefined}
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(host.container.querySelector(".workspace-project-preview-collage")).not.toBeNull();
      expect(host.container.querySelectorAll(".workspace-project-preview-file")).toHaveLength(4);
      expect([
        ...host.container.querySelectorAll("img"),
        ...host.container.querySelectorAll("video"),
      ]).toHaveLength(4);
      expect(host.container.textContent).not.toContain("notes");
    } finally {
      await act(async () => root.unmount());
      host.restore();
      load.mockRestore();
      resolve.mockRestore();
    }
  });

  test("shows a centered retry instead of a library picker when home library fails", () => {
    const markup = renderToStaticMarkup(
      <LibraryScreen
        catalog={null}
        error="Home library failed"
        restoring={false}
        pinnedWorkspaceIds={[]}
        onRetry={() => undefined}
        onOpenWorkspace={() => undefined}
        onOpenProject={() => undefined}
      />,
    );

    expect(markup).toContain("Home library unavailable");
    expect(markup).toContain("Home library failed");
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("Choose .ralphy");
    expect(markup).not.toContain("Change library");
  });

  test("renders the workspace projects as a grid-only page", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceProjectsScreen
        workspaceName="Launch Studio"
        workspaceDescription="Short-form launches"
        projects={projects}
        rootEpoch={7}
        pinnedProjectIds={[]}
        searchRequest={0}
        onOpenProject={() => undefined}
        onToggleProjectPin={() => undefined}
      />,
    );

    expect(markup).toContain("Projects");
    expect(markup).toContain("workspace-projects-region");
    expect(markup).toContain("workspace-project-grid");
    expect(markup).not.toContain('aria-label="Project view"');
    expect(markup).not.toContain('aria-label="List view"');
    expect(markup).not.toContain("workspace-project-list");
    expect(markup).toContain("workspace-project-preview");
    expect(markup).toContain("workspace-project-card-details");
    expect(markup).toContain("workspace-project-card-status");
    expect(markup).toContain("Launch film");
    expect(markup).toContain("Open project Launch film");
    expect(markup).toContain("Pin project Launch film");
    expect(markup).toContain("1 final");
    expect(markup.slice(markup.indexOf("workspace-project-grid"))).not.toContain("3.84");
    expect(styles).toMatch(/\.workspace-project-card-shell \.workspace-project-card\s*\{[^}]*width:\s*100%/s);
  });

  test("keeps workspace resources in the sidebar navigation", () => {
    const markup = renderToStaticMarkup(
      <ContextSidebar
        route={{ kind: "workspace", workspaceId: workspace.id }}
        page="overview"
        pageActive
        localModelsActive={false}
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
        onOpenLocalModels={() => undefined}
        onOpenWorkspace={() => undefined}
        onOpenPage={() => undefined}
      />,
    );

    expect(WORKSPACE_PAGES).toEqual(["overview", "projects", "units", "shared", "memory", "calendar"]);
    expect(readWorkbenchPreferences({ getItem: () => null, setItem: () => undefined }).workspacePage).toBe("overview");
    expect(markup).toContain("Overview");
    expect(markup.indexOf("Overview")).toBeLessThan(markup.indexOf("Projects"));
    expect(markup).toContain("Memory");
    expect(markup).toContain("Calendar");
    expect(markup).toContain("Shared library");
    expect(markup).toContain("THIS COMPUTER");
    expect(markup).toContain("Local Models");
    expect(markup).not.toContain("Filter projects");
    expect(markup).not.toContain("Launch film");
  });

  test("opens the project grid from one Home action without an open-project tab strip", async () => {
    const onHome = vi.fn();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(<MainHeader
          sidebarVisible
          canGoBack={false}
          canGoForward={false}
          rightPanelVisible={false}
          bottomPanelVisible={false}
          onHome={onHome}
          onBack={() => undefined}
          onForward={() => undefined}
          onToggleSidebar={() => undefined}
          onToggleRightPanel={() => undefined}
          onToggleBottomPanel={() => undefined}
        />);
      });

      expect(host.container.querySelector(".header-tabs")).toBeNull();
      const home = host.container.querySelector<HTMLButtonElement>(".main-header-home");
      expect(home).not.toBeNull();
      await act(async () => home!.dispatchEvent(new Event("click", { bubbles: true })));

      expect(onHome).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
