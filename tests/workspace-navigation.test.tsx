import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { MediaCardDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "../src/lib/ipc";
import type { WorkspaceSummary } from "../src/lib/ipc";
import { ContextSidebar } from "../src/components/ContextSidebar";
import { ActivityIsland } from "../src/components/ActivityIsland";
import { MainHeader } from "../src/components/Titlebar";
import { MarketplaceScreen } from "../src/screens/MarketplaceScreen";
import { App } from "../src/App";
import { WorkspaceProjectsScreen } from "../src/screens/WorkspaceProjectsScreen";
import { LibraryScreen } from "../src/screens/LibraryScreen";
import { bridge } from "../src/lib/ipc";
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
  test("keeps the active workspace route through Marketplace and Local Models", async () => {
    const host = createReactHost();
    const storage = new Map<string, string>([[
      "ralphy-media-workbench-v1",
      JSON.stringify({ rootPath: "mock-store", workspaceId: "launch-studio", rightPanelVisible: true }),
    ]]);
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const previousAnimationFrame = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
    const previousCancelAnimationFrame = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
    Object.assign(document.documentElement, { dataset: {} });
    Object.assign(window, {
      innerWidth: 1280,
      innerHeight: 800,
      localStorage,
      matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    Object.assign(globalThis, { requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    const button = (label: string) => host.container.findAll((node) => (
      node.tagName === "BUTTON" && node.textContent.includes(label)
    ))[0];

    try {
      await act(async () => {
        root.render(<App />);
        await Promise.resolve();
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1_600));
        await new Promise((resolve) => setTimeout(resolve, 400));
      });

      await act(async () => button("Marketplace")!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.textContent).toContain("WORK IN PROGRESS");
      expect(button("Local Models")).toBeDefined();
      expect(host.container.findAll((node) => node.getAttribute("aria-label") === "Toggle right panel")).toHaveLength(0);

      await act(async () => button("Local Models")!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.textContent).toContain("Back to Marketplace");
      await act(async () => button("Back to Marketplace")!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.textContent).toContain("WORK IN PROGRESS");

      await act(async () => button("My Work")!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.textContent).toContain("Arc Grinder Launch");
    } finally {
      await act(async () => root.unmount());
      if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
      if (previousAnimationFrame) Object.defineProperty(globalThis, "requestAnimationFrame", previousAnimationFrame);
      else delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
      if (previousCancelAnimationFrame) Object.defineProperty(globalThis, "cancelAnimationFrame", previousCancelAnimationFrame);
      else delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
      host.restore();
    }
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
    expect(styles).toMatch(/\.workspace-project-card-shell \.workspace-project-card\s*\{[^}]*width:\s*100%/s);
  });

  test("keeps My Work focused on workspace resources", () => {
    const markup = renderToStaticMarkup(
      <ContextSidebar
        page="projects"
        pageActive
        mode="work"
        rootPath="/tmp/demo/.ralphy"
        workspaces={[workspace]}
        workspaceId={workspace.id}
        pinnedWorkspaceIds={[]}
        onModeChange={() => undefined}
        onOpenWorkspace={() => undefined}
        onOpenPage={() => undefined}
      />,
    );

    expect(markup).toContain("Memory");
    expect(markup).toContain("Calendar");
    expect(markup).toContain("Shared library");
    expect(markup).toContain("My Work");
    expect(markup).toContain("Marketplace");
    expect(markup).not.toContain("THIS COMPUTER");
    expect(markup).not.toContain("Local Models");
    expect(markup).not.toContain("Settings");
    expect(markup).not.toContain("Filter projects");
    expect(markup).not.toContain("Launch film");
  });

  test("renders an honest Marketplace landing with a Local Models action", () => {
    const markup = renderToStaticMarkup(
      <MarketplaceScreen
        localModelsOpen={false}
        onOpenLocalModels={() => undefined}
        onCloseLocalModels={() => undefined}
      />,
    );

    expect(markup).toContain("WORK IN PROGRESS");
    expect(markup).toContain("Local Models");
  });

  test("shows only explicit Activity Island state", () => {
    const markup = renderToStaticMarkup(
      <ActivityIsland
        state={{
          projectName: "Launch film",
          status: "Rendering",
          count: 2,
          busyLabel: "Exporting",
          progress: 140,
          alert: "Review needed",
        }}
      />,
    );

    expect(markup).toContain("Launch film");
    expect(markup).toContain("Rendering");
    expect(markup).toContain("2");
    expect(markup).toContain("Exporting");
    expect(markup).toContain("100%");
    expect(markup).toContain("Review needed");
    expect(markup).not.toMatch(/WAN|MB\/S|\d{1,2}:\d{2}/);

    const empty = renderToStaticMarkup(
      <ActivityIsland
        state={{ projectName: null, status: null, count: null, busyLabel: null, progress: null, alert: null }}
      />,
    );
    expect(empty).not.toMatch(/Launch film|Rendering|Exporting|Review needed/);
  });

  test("renders the Instrument top row without an open-project tab strip", () => {
    const markup = renderToStaticMarkup(
      <MainHeader
        sidebarVisible
        rightPanelVisible={false}
        rightPanelAvailable
        rootPath="/tmp/demo/.ralphy"
        activity={{ projectName: null, status: null, count: null, busyLabel: null, progress: null, alert: null }}
        onToggleSidebar={() => undefined}
        onToggleRightPanel={() => undefined}
      />,
    );

    expect(markup).not.toContain("header-tabs");
    expect(markup).toContain('aria-label="Toggle right panel"');
  });
});
