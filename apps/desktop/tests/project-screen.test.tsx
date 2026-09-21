import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import * as projectControls from "@/widgets/project-header";
import { ProjectScreenView } from "@/pages/project";
import { createProjectScreenController } from "@/pages/project";

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
  test("keeps project navigation secondary to media without the old view switcher", () => {
    const markup = renderToStaticMarkup(
      <projectControls.ProjectControls title="Launch" activeTab="media" onSelect={vi.fn()} />,
    );
    expect(markup).toContain("Launch");
    expect(markup).toContain('<details');
    expect(markup).toContain('aria-label="Project details"');
    expect(markup).toContain("Documents");
    expect(markup).toContain("Activity");
    expect(markup).not.toContain('role="tablist"');
    expect(markup).not.toContain(">Units<");
  });

  test("opens the media surface and offers a return from secondary project details", () => {
    const ProjectControls = projectControls.ProjectControls;
    const tabs = renderToStaticMarkup(
      <ProjectControls activeTab="documents" onSelect={vi.fn()} />,
    );
    const controller = createProjectScreenController({} as never, project, 0);
    const screen = renderToStaticMarkup(<ProjectScreenView project={project} controller={controller} snapshot={controller.getSnapshot()} />);
    expect(tabs).toContain('aria-label="Back to media"');
    expect(screen).toContain('id="project-panel-media"');
    expect(screen).toContain('aria-label="Project media"');
    expect(screen).not.toContain('role="tabpanel"');
  });

  test("keeps the active Project route on stable domain IPC only", () => {
    const renderer = [
      "src/app/App.tsx",
      "src/app/ui/WorkRoute.tsx",
      "src/pages/project/ui/ProjectScreen.tsx",
      "src/widgets/project-header/ui/ProjectControls.tsx",
      "src/widgets/project-header/ui/ProjectHeader.tsx",
      "src/pages/project/model/screen-controller.ts",
      "src/shared/model/workbench.ts",
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
