import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import * as projectControls from "../src/components/ProjectControls";
import { ProjectScreenView } from "../src/screens/ProjectScreen";
import { createProjectScreenController } from "../src/state/project-screen-controller";

const project = {
  id: "project-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  name: "Launch",
  brief: "A bounded domain project",
  status: "active",
  phase: "production",
  finalState: "working",
  platform: null,
  aspectRatio: null,
  spendUsd: null,
  finalCount: 0,
  sharedCount: 0,
  unitCount: 0,
  recentActivity: "2026-08-02T00:00:00.000Z",
};

describe("Project domain screen", () => {
  test("renders exactly the five accessible domain tabs", () => {
    const markup = renderToStaticMarkup(
      <projectControls.ProjectControls activeTab="overview" onSelect={vi.fn()} />,
    );
    const labels = [...markup.matchAll(/role="tab"[^>]*aria-label="([^"]+)"/g)]
      .map((match) => match[1]);

    expect(labels).toEqual([
      "Overview",
      "Documents",
      "Media",
      "Units",
      "Activity",
    ]);
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('class="project-dock"');
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"/);
    expect(markup).not.toContain("gooey-tabs");
    expect(markup).not.toMatch(/>Finals<|>Files<|>Refs</);
  });

  test("associates the selected tab and panel with roving keyboard focus", () => {
    const ProjectControls = projectControls.ProjectControls;
    const tabs = renderToStaticMarkup(
      <ProjectControls activeTab="media" onSelect={vi.fn()} />,
    );
    const controller = createProjectScreenController({} as never, project, 0);
    const screen = renderToStaticMarkup(<ProjectScreenView project={project} controller={controller} snapshot={controller.getSnapshot()} />);
    const moveProjectTab = (projectControls as typeof projectControls & {
      moveProjectTab(tab: string, key: string): string;
    }).moveProjectTab;

    expect(tabs).toContain('id="project-tab-media"');
    expect(tabs).toContain('aria-controls="project-panel-media"');
    expect(tabs).toMatch(/id="project-tab-media"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    expect(tabs).toMatch(/id="project-tab-documents"[^>]*tabindex="-1"/);
    expect(screen).toContain('id="project-panel-overview"');
    expect(screen).toContain('aria-labelledby="project-tab-overview"');
    expect(moveProjectTab("overview", "ArrowRight")).toBe("documents");
    expect(moveProjectTab("overview", "ArrowLeft")).toBe("activity");
    expect(moveProjectTab("media", "Home")).toBe("overview");
    expect(moveProjectTab("media", "End")).toBe("activity");
  });

  test("keeps the active Project route on stable domain IPC only", () => {
    const renderer = [
      "src/App.tsx",
      "src/screens/ProjectScreen.tsx",
      "src/components/ProjectControls.tsx",
      "src/components/ProjectHeader.tsx",
      "src/state/project-screen-controller.ts",
      "src/state/workbench.ts",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
    const boundary = [
      "electron/preload.ts",
      "electron/media/types.ts",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");

    expect(renderer).toContain("loadProjectOverview");
    expect(renderer).toContain("loadProjectPage");
    expect(renderer).not.toMatch(/annotations|trashItems|includeIntermediate/);
    expect(renderer).not.toMatch(/absolutePath|projectRelativePath|ProjectMode/);
    expect(renderer).not.toMatch(/mediaMatches|state\.media\.items\.filter|pages\.media\.items\.filter/);
    expect(renderer).not.toMatch(/run\.attempts|finder|trash/i);
    expect(boundary).not.toMatch(/scanProject|cancelProjectScan|ProjectScan/);
  });
});
