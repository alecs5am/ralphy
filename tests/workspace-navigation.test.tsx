import { existsSync, readFileSync } from "node:fs";
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
import { SharedLibraryScreen } from "../src/screens/SharedLibraryScreen";
import { LibraryScreen } from "../src/screens/LibraryScreen";
import { bridge } from "../src/lib/ipc";
import { readWorkbenchPreferences, WORKSPACE_PAGES } from "../src/state/workbench";
import { createReactHost } from "./react-host";


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
  test("renders the live Shared Library destination instead of the workspace placeholder", () => {
    const markup = renderToStaticMarkup(
      <SharedLibraryScreen workspaceId="workspace-1" workspaceName="Launch Studio" rootEpoch={7} />,
    );

    expect(markup).toContain("Shared Library");
    expect(markup).toContain("Reusable workspace artifacts for people and agents");
    expect(markup).not.toContain("Shared Library is not wired yet");
  });

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
    // The card states its own width in markup; the sheet's `.workspace-project-card-shell
    // .workspace-project-card { width: 100% }` was already shadowed by that utility, and the rest
    // of that rule (`min-height: 0`, `background: transparent`, `box-shadow: none`) only cancelled
    // declarations the same chunk made two rules earlier.
    expect(markup).toMatch(/class="workspace-project-card [^"]*\bw-full\b/);
  });

  test("keeps workspace resources in the sidebar navigation", () => {
    const markup = renderToStaticMarkup(
      <ContextSidebar
        mode="work"
        lens="desk"
        route={{ kind: "workspace", workspaceId: workspace.id }}
        page="overview"
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
        onSwitchMode={() => undefined}
        onOpenMarketplaceRoute={() => undefined}
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
    expect(markup).not.toContain("THIS COMPUTER");
    // The sidebar user pill opens Settings directly instead of a one-item menu.
    expect(markup).toContain("Open settings");
    expect(markup).toContain("My Work");
    expect(markup).toContain("Marketplace");
    expect(markup).not.toContain("Local Models");
    expect(markup).not.toContain("Filter projects");
    expect(markup).not.toContain("Launch film");
  });

  test("adapts the same sidebar to all Marketplace destinations without workspace chrome", () => {
    const markup = renderToStaticMarkup(
      <ContextSidebar
        mode="marketplace"
        route={{ kind: "workspace", workspaceId: workspace.id }}
        page="overview"
        pageActive={false}
        marketplaceRoute={{ kind: "category", category: "models" }}
        rootPath="/tmp/demo/.ralphy"
        workspaces={[workspace]}
        workspaceId={workspace.id}
        pinnedWorkspaceIds={[]}
        canGoBack
        canGoForward={false}
        onBack={() => undefined}
        onForward={() => undefined}
        onToggleSidebar={() => undefined}
        onOpenSettings={() => undefined}
        onSwitchMode={() => undefined}
        onOpenMarketplaceRoute={() => undefined}
        onOpenWorkspace={() => undefined}
        onOpenPage={() => undefined}
      />,
    );

    expect(markup).toContain("Discover");
    expect(markup).toContain("Components &amp; Effects");
    expect(markup).toContain("MY LIBRARY");
    expect(markup).toContain("Needs attention");
    expect(markup).not.toContain("Launch Studio");
    expect(markup).not.toContain("Local Models");
  });

  test("has no standalone Local Models screen, style entry, or application route", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const entry = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");

    expect(existsSync(join(process.cwd(), "src/screens/LocalModelsScreen.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/styles/local-models.css"))).toBe(false);
    expect(app).not.toMatch(/LocalModelsScreen|localModelsVisible|local-models/i);
    expect(entry).not.toContain("./styles/local-models.css");
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
          onHome={onHome}
          onBack={() => undefined}
          onForward={() => undefined}
          onToggleSidebar={() => undefined}
          onToggleRightPanel={() => undefined}
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
