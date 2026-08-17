import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { ActivityDto, CompositionDto, CompositionRevisionDto, MediaCardDto, UnitDto, UnitRevisionDto, WorkspaceOverviewDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "../src/lib/ipc";
import { ProjectScreenView, createProjectScreenController } from "../src/screens/ProjectScreen";
import { WorkspaceScreenView, createWorkspaceScreenController } from "../src/screens/WorkspaceScreen";

const styles = ["reset.css", "tokens.css", "app.css", "workbench.css"]
  .map((file) => readFileSync(join(process.cwd(), "src/styles", file), "utf8"))
  .join("\n");
const workbenchStyles = readFileSync(
  join(process.cwd(), "src/styles/workbench.css"),
  "utf8",
);

const project: ProjectSummary = {
  id: "workspace-1/project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch",
  brief: "Launch campaign", status: "active", phase: "production", finalState: "working", platform: null,
  aspectRatio: null, spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 0,
  recentActivity: "2026-08-02T00:00:00.000Z",
};

const mediaCard: MediaCardDto = {
  ref: { type: "run-object", id: "run-object-1" }, workspaceId: "workspace-1", projectId: "project-1",
  runId: "run-1", purpose: "diagnostic-log", state: "ready", retention: "cache", mime: "text/plain",
  bytes: 128, createdAt: 1, objectId: null, logicalPath: "runs/run-1/diagnostics.txt", locationClass: "cache",
  attemptId: null, attemptNo: null, target: { type: "run-object", id: "run-object-1" },
};

const document = {
  id: "document-1", workspaceId: "workspace-1", projectId: "project-1", kind: "brief" as const,
  slug: "launch-brief", title: "Launch brief", currentRevisionId: "revision-1", rowVersion: 1,
  createdAt: 1, updatedAt: 2,
  currentRevision: { id: "revision-1", documentId: "document-1", revisionNo: 1, parentRevisionId: null,
    iterationId: null, format: "markdown" as const, title: "Launch brief", authoredBySessionId: null, createdAt: 1 },
};

const composition: CompositionDto = {
  id: "composition-1", projectId: "project-1", slug: "launch-cut", kind: "video",
  latestRevisionId: "composition-revision-1", selectedRevisionId: "composition-revision-1", createdAt: 1, updatedAt: 2,
};
const compositionRevision: CompositionRevisionDto = {
  id: "composition-revision-1", compositionId: "composition-1", revisionNo: 1, parentRevisionId: null,
  iterationId: null, state: "sealed", engine: "hyperframes", engineVersion: null,
  authoredBySessionId: null, createdAt: 1, sealedAt: 2,
};
const unit: UnitDto = {
  id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "launch-unit", format: "9:16",
  latestRevisionId: "unit-revision-1", selectedRevisionId: "unit-revision-1", createdAt: 1, updatedAt: 2,
};
const unitRevision: UnitRevisionDto = {
  id: "unit-revision-1", unitId: "unit-1", revisionNo: 1, parentRevisionId: null, iterationId: null,
  note: null, authoredBySessionId: null, createdAt: 1, sealedAt: 2,
};
const activity: ActivityDto = {
  sequence: 1, workspaceId: "workspace-1", projectId: "project-1", entityType: "run", entityId: "run-1",
  action: "generation.completed", createdAt: 1,
};

type ProjectMarkup = Record<"overview" | "documents" | "media" | "compositions" | "units" | "activity", string>;

async function activeScreenMarkup(): Promise<{ workspace: string } & ProjectMarkup> {
  const workspaceValue = {
    workspace: { id: "workspace-1", slug: "launch", name: "Launch Studio", rowVersion: 1, createdAt: 1, updatedAt: 2 },
    projects: { items: [{ id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2 }], nextCursor: null },
    metrics: { publicationCount: 12, views: 1234567, likes: 23456, comments: 3456, shares: 456, watchTimeMs: 987654321 },
  } satisfies WorkspaceOverviewDto;
  const workspaceController = createWorkspaceScreenController(
    { loadWorkspaceOverview: async () => workspaceValue },
    "workspace-1",
  );
  await workspaceController.start();
  const workspace = renderToStaticMarkup(createElement(WorkspaceScreenView, {
    controller: workspaceController,
    snapshot: workspaceController.getSnapshot(),
    catalogProjects: [project],
    view: "list",
    onViewChange: () => undefined,
    onOpenProject: () => undefined,
  }));

  const projectController = createProjectScreenController({
    loadProjectOverview: async () => ({
      project: { id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", purpose: "Launch campaign", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2 },
      spendUsd: 3.84,
      mediaCounts: { artifacts: 12, objects: 8, runObjects: 4 },
      metrics: { publicationCount: 2, views: 1_200, likes: 80, comments: 12, shares: 7, watchTimeMs: 345_000 },
    }),
    loadProjectPage: async ({ tab }) => ({
      documents: { items: [document], nextCursor: null },
      media: { items: [mediaCard], nextCursor: "next-page" },
      compositions: { items: [composition], nextCursor: null },
      units: { items: [unit], nextCursor: null },
      activity: { items: [activity], nextCursor: null },
    })[tab],
    loadProjectMediaCard: async () => mediaCard,
    loadDocumentPreview: async () => ({ revisionId: "revision-1", format: "markdown", text: "# Launch brief", truncated: false }),
    searchProjectDocuments: async () => ({ items: [], nextCursor: null }),
    showProjectDocument: async () => document,
    reviseProjectDocument: async () => document.currentRevision,
    resolveProjectPreview: async () => null,
    loadProjectGeneration: async (_project, target) => ({ status: "unknown" as const, target, reason: "not-recorded" as const }),
    loadProjectMediaRevisions: async () => ({ items: [], nextCursor: null }),
    selectProjectMediaRevision: async () => { throw new Error("Not used"); },
    loadProjectComposition: async () => composition,
    loadProjectCompositionRevision: async () => compositionRevision,
    loadProjectCompositionBuild: async () => { throw new Error("Not used"); },
    loadProjectCompositionPage: async (_project, request) => request.kind === "revisions"
      ? { items: [compositionRevision], nextCursor: null }
      : { items: [], nextCursor: null },
    reviseProjectComposition: async () => compositionRevision,
    selectProjectCompositionRevision: async () => composition,
    buildProjectComposition: async () => { throw new Error("Not used"); },
    resolveCompositionOutputPreview: async () => null,
    loadProjectUnit: async () => unit,
    loadProjectUnitRevision: async () => unitRevision,
    loadProjectUnitPage: async (_project, request) => request.kind === "revisions"
      ? { items: [unitRevision], nextCursor: null }
      : { items: [], nextCursor: null },
    selectProjectUnitRevision: async () => unit,
  } as never, project);
  await projectController.start();
  const overview = renderToStaticMarkup(createElement(ProjectScreenView, {
    project,
    controller: projectController,
    snapshot: projectController.getSnapshot(),
  }));
  await projectController.selectTab("media");
  projectController.selectMedia(mediaCard);
  const media = renderToStaticMarkup(createElement(ProjectScreenView, {
    project,
    controller: projectController,
    snapshot: projectController.getSnapshot(),
  }));
  await projectController.selectTab("documents");
  await projectController.openDocument(document);
  const documents = renderToStaticMarkup(createElement(ProjectScreenView, {
    project,
    controller: projectController,
    snapshot: projectController.getSnapshot(),
  }));
  await projectController.selectTab("compositions");
  const compositions = renderToStaticMarkup(createElement(ProjectScreenView, { project, controller: projectController, snapshot: projectController.getSnapshot() }));
  await projectController.selectTab("units");
  await projectController.openUnit(unit.id);
  const units = renderToStaticMarkup(createElement(ProjectScreenView, { project, controller: projectController, snapshot: projectController.getSnapshot() }));
  await projectController.selectTab("activity");
  const activityMarkup = renderToStaticMarkup(createElement(ProjectScreenView, { project, controller: projectController, snapshot: projectController.getSnapshot() }));
  return { workspace, overview, media, documents, compositions, units, activity: activityMarkup };
}

type GeometryResult = {
  screen: "workspace" | keyof ProjectMarkup;
  width: number;
  height: number;
  overflows: string[];
  metricColumns: number | null;
  scrollOwners: string[];
  documentDetailWidth: number | null;
  documentViewerWidths: number[];
  documentViewerMaxWidths: string[];
  nestedMediaScroll: boolean;
  mediaInsets: number[];
  focus: Array<{ selector: string; width: number; contrast: number }>;
  overviewColumns: number | null;
  overviewWidth: number | null;
  overviewMetricWidths: number[];
  overviewScrollOwners: string[];
  splitVerticalContained: boolean | null;
  forbidden: number;
};

async function chromiumGeometry(markup: { workspace: string } & ProjectMarkup): Promise<GeometryResult[]> {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-geometry-"));
  try {
    const links = ["reset.css", "tokens.css", "app.css", "workbench.css"]
      .map((file) => `<link rel="stylesheet" href="${pathToFileURL(join(process.cwd(), "src/styles", file)).href}">`)
      .join("");
    const shell = (screen: string) => `<div class="workbench has-right-panel" style="--sidebar-w:288px;--inspector-w:336px"><aside class="context-sidebar"></aside><section class="main-shell"><header class="main-header"></header><div class="main-content-stage">${screen}</div></section><aside class="utility-right-panel"></aside></div>`;
    const templates = Object.entries(markup).map(([name, value]) => `<template id="${name}">${shell(value)}</template>`).join("");
    writeFileSync(join(directory, "layout.html"), `<!doctype html><html><head>${links}</head><body><div id="root"></div>${templates}</body></html>`);
    writeFileSync(join(directory, "package.json"), JSON.stringify({ main: "main.cjs" }));
    writeFileSync(join(directory, "main.cjs"), `
      const { app, BrowserWindow } = require("electron");
      app.commandLine.appendSwitch("disable-gpu");
      app.whenReady().then(async () => {
        const win = new BrowserWindow({ show: false, width: 1360, height: 900, useContentSize: true });
        await win.loadFile(${JSON.stringify(join(directory, "layout.html"))});
        win.webContents.debugger.attach("1.3");
        await win.webContents.debugger.sendCommand("DOM.enable");
        await win.webContents.debugger.sendCommand("CSS.enable");
        const results = [];
        for (const [screen, width, height] of ["workspace", "overview", "documents", "media", "compositions", "units", "activity"].flatMap((screen) => [[screen, 1360, 900], [screen, 1100, 720]])) {
          win.setContentSize(width, height);
          await win.webContents.executeJavaScript(\`(async () => {
              const screen = \${JSON.stringify(screen)}, root = document.getElementById("root");
              root.innerHTML = document.getElementById(screen).innerHTML;
              if (screen === "overview") {
                const workbench = root.querySelector(".workbench");
                workbench.style.setProperty("--sidebar-column", "0px");
                workbench.style.setProperty("--right-column", "0px");
                workbench.style.minWidth = "0";
                root.querySelectorAll("aside").forEach((node) => { node.style.display = "none"; });
              }
              if (screen === "media") { const space = root.querySelector(".virtual-grid-space"); if (space) space.style.height = "1600px"; }
              if (screen === "documents") {
                const detail = root.querySelector(".documents-detail"), viewer = detail?.querySelector(":scope > .markdown-view");
                if (detail && viewer) { const review = document.createElement("div"); review.className = "document-current-review"; review.append(viewer.cloneNode(true)); detail.append(review); }
              }
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            })()\`);
            const documentNode = await win.webContents.debugger.sendCommand("DOM.getDocument");
            const focusSelectors = ({
              workspace: [".project-table-row"], overview: [".mode-segments button[aria-selected=true]", ".overview-link"],
              documents: [".mode-segments button[aria-selected=true]", ".document-search input", ".document-row", ".document-detail-heading"],
              media: [".mode-segments button[aria-selected=true]", ".select-menu-trigger", ".snappy-slider"],
              compositions: [".mode-segments button[aria-selected=true]", ".composition-master-row", ".composition-heading h3"],
              units: [".mode-segments button[aria-selected=true]", ".unit-row", ".unit-detail-heading"],
              activity: [".mode-segments button[aria-selected=true]", ".activity-scroll"],
            })[screen];
            for (const selector of focusSelectors) {
              const focusNode = await win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector });
              if (!focusNode.nodeId) throw new Error("Missing focus target: " + screen + " " + selector);
              await win.webContents.debugger.sendCommand("CSS.forcePseudoState", { nodeId: focusNode.nodeId, forcedPseudoClasses: ["focus-visible"] });
            }
            results.push(await win.webContents.executeJavaScript(\`(() => {
              const screen = \${JSON.stringify(screen)};
              const root = document.getElementById("root");
              const selectors = screen === "workspace"
                ? [".main-region", ".screen-header", ".metrics-band", ".metric", ".workspace-domain-body", ".workspace-projects", ".project-table", ".project-table-row"]
                : [".main-region", ".project-header", ".project-controls", ".project-domain-body", ".mode-segments",
                  ...({ overview: [".overview-dashboard", ".overview-card", ".overview-metrics"], documents: [".documents-workbench", ".documents-master", ".documents-detail"], media: [".media-panel", ".media-domain-toolbar", ".project-media-grid", ".asset-grid-scroll"], compositions: [".composition-workbench", ".composition-master", ".composition-detail"], units: [".units-workbench", ".units-master", ".units-detail"], activity: [".activity-scroll"] })[screen]];
              const overflows = [];
              for (const selector of selectors) for (const element of root.querySelectorAll(selector)) {
                if (element.scrollWidth > element.clientWidth + 1) overflows.push(selector + ":" + element.scrollWidth + ">" + element.clientWidth);
              }
              const metrics = root.querySelector(".metrics-band");
              const metricColumns = metrics ? getComputedStyle(metrics).gridTemplateColumns.split(" ").filter(Boolean).length : null;
              const ownerCandidates = ({ overview: [".project-domain-body", ".overview-dashboard"], documents: [".project-domain-body", ".documents-master", ".documents-detail"], media: [".project-domain-body", ".asset-grid-scroll"], compositions: [".project-domain-body", ".composition-master", ".composition-detail"], units: [".project-domain-body", ".units-master", ".units-detail"], activity: [".project-domain-body", ".activity-scroll"], workspace: [".workspace-domain-body"] })[screen];
              const scrollOwners = ownerCandidates.filter((selector) => {
                const element = root.querySelector(selector); if (!element) return false;
                const overflow = getComputedStyle(element).overflowY;
                return overflow === "auto" || overflow === "scroll";
              });
              const nestedMediaScroll = screen === "media" && scrollOwners.length > 1;
              const documentDetail = root.querySelector(".documents-detail");
              const documentViewers = [...root.querySelectorAll(".documents-detail > .markdown-view, .document-current-review > .markdown-view")];
              const documentViewerWidths = documentViewers.map((element) => element.getBoundingClientRect().width);
              const documentViewerMaxWidths = documentViewers.map((element) => getComputedStyle(element).maxWidth);
              const mediaInsets = [".project-domain-body", ".asset-grid-scroll"].map((selector) => {
                const element = root.querySelector(selector); return element ? parseFloat(getComputedStyle(element).paddingLeft) : 0;
              }).filter((value) => value > 0);
              const focusSelectors = ({ workspace: [".project-table-row"], overview: [".mode-segments button[aria-selected=true]", ".overview-link"], documents: [".mode-segments button[aria-selected=true]", ".document-search input", ".document-row", ".document-detail-heading"], media: [".mode-segments button[aria-selected=true]", ".select-menu-trigger", ".snappy-slider"], compositions: [".mode-segments button[aria-selected=true]", ".composition-master-row", ".composition-heading h3"], units: [".mode-segments button[aria-selected=true]", ".unit-row", ".unit-detail-heading"], activity: [".mode-segments button[aria-selected=true]", ".activity-scroll"] })[screen];
              const focus = focusSelectors.map((selector) => {
                const target = root.querySelector(selector);
                const style = getComputedStyle(target);
                const color = (value) => { const parts = (value.match(/[\\\\d.]+/g) || []).map(Number); const scale = value.startsWith("color(srgb") ? 255 : 1; return { rgb: parts.slice(0, 3).map((part) => part * scale), alpha: parts[3] ?? 1 }; };
                const composite = (top, bottom) => ({ rgb: top.rgb.map((part, index) => part * top.alpha + bottom.rgb[index] * (1 - top.alpha)), alpha: top.alpha + bottom.alpha * (1 - top.alpha) });
                let background = color(style.backgroundColor), parent = target.parentElement;
                while (background.alpha < 1 && parent) { background = composite(background, color(getComputedStyle(parent).backgroundColor)); parent = parent.parentElement; }
                const luminance = (parts) => parts.map((part) => part / 255).map((part) => part <= .04045 ? part / 12.92 : ((part + .055) / 1.055) ** 2.4).reduce((sum, part, index) => sum + part * [.2126, .7152, .0722][index], 0);
                const a = luminance(color(style.outlineColor).rgb), b = luminance(background.rgb);
                return { selector, width: style.outlineStyle === "none" ? 0 : parseFloat(style.outlineWidth), contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
              });
              const overviewDashboard = root.querySelector(".overview-dashboard");
              const overviewColumns = overviewDashboard ? getComputedStyle(overviewDashboard).gridTemplateColumns.split(" ").filter(Boolean).length : null;
              const overviewWidth = overviewDashboard?.getBoundingClientRect().width ?? null;
              const overviewMetricWidths = [...root.querySelectorAll(".overview-metrics > div")].map((item) => item.getBoundingClientRect().width);
              const overviewScrollOwners = [".project-domain-body", ".overview-dashboard"].filter((selector) => { const item = root.querySelector(selector); if (!item) return false; const overflow = getComputedStyle(item).overflowY; return overflow === "auto" || overflow === "scroll"; });
              const split = root.querySelector(".documents-workbench, .composition-workbench, .units-workbench");
              const splitBody = root.querySelector(".project-domain-body");
              const splitVerticalContained = split && splitBody ? [split, ...split.children].every((pane) => {
                const outer = splitBody.getBoundingClientRect(), inner = pane.getBoundingClientRect();
                return inner.height > 0 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
              }) : null;
              const forbidden = [...root.querySelectorAll(".load-more, .project-preview, .pagination")].length + (screen === "media" ? [...root.querySelectorAll(".media-panel button")].filter((button) => button.textContent.trim() === "Open").length : 0);
              return { screen, width: innerWidth, height: innerHeight, overflows, metricColumns, scrollOwners, documentDetailWidth: documentDetail?.getBoundingClientRect().width ?? null, documentViewerWidths, documentViewerMaxWidths, nestedMediaScroll, mediaInsets, focus, overviewColumns, overviewWidth, overviewMetricWidths, overviewScrollOwners, splitVerticalContained, forbidden };
            })()\`));
        }
        process.stdout.write("RALPHY_GEOMETRY=" + JSON.stringify(results) + "\\n");
        app.quit();
      }).catch((error) => { console.error(error); app.exit(1); });
    `);
    const electron = join(process.cwd(), "node_modules", ".bin", "electron");
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(electron, [directory], { env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" } });
      let stdout = "", stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`Electron geometry smoke failed (${code}): ${stderr}`)));
    });
    const line = output.split("\n").find((candidate) => candidate.startsWith("RALPHY_GEOMETRY="));
    if (!line) throw new Error(`Electron geometry smoke returned no results: ${output}`);
    return JSON.parse(line.slice("RALPHY_GEOMETRY=".length)) as GeometryResult[];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const renderer = readdirSync(join(process.cwd(), "src"), {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
  .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
  .join("\n");

describe("design system contract", () => {
  test("documents workbench locks the outer panel and gives both responsive panes exact semantic states", () => {
    expect(workbenchStyles).toMatch(/\.project-domain-body\.is-documents\s*\{[^}]*overflow:\s*hidden/s);
    expect(workbenchStyles).toMatch(/\.documents-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(280px,\s*340px\)\s+minmax\(0,\s*1fr\)/s);
    expect(workbenchStyles).toMatch(/\.documents-master,[\s\S]*\.documents-detail\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
    expect(workbenchStyles).toMatch(/\.document-row:hover\s*\{[^}]*background:\s*var\(--hover\)/s);
    expect(workbenchStyles).toMatch(/\.document-row\.is-selected\s*\{[^}]*background:\s*var\(--selected\)[^}]*box-shadow:\s*var\(--ring-select\)/s);
    expect(workbenchStyles).not.toMatch(/\.document-row\.is-selected\s*\{[^}]*inset\s+2px\s+0/s);
  });

  test("allows trusted media URLs for image previews", () => {
    expect(readFileSync(join(process.cwd(), "index.html"), "utf8"))
      .toMatch(/img-src[^;]*ralphy-media:/);
  });

  test("uses only the supplied type scale and regular weight", () => {
    expect(styles).not.toMatch(/font-size:\s*(?:9|10)px/);
    expect(styles).not.toContain("font-weight: 500");
    expect(styles).not.toContain("text-transform: uppercase");
    expect(styles).not.toMatch(/letter-spacing:\s*-/);
  });

  test("names the responsive controls container and preserves round status pills", () => {
    expect(styles).toContain("container-name: project-controls");
    expect(styles).toMatch(/\.project-facts > span,[\s\S]*corner-shape:\s*round/);
  });

  test("uses the approved neutral surfaces and larger smooth radii", () => {
    expect(styles).toMatch(/--canvas:\s*#181818/);
    expect(styles).toMatch(/--raised:\s*#2d2d2d/);
    expect(styles).toMatch(/--radius-md:\s*10px/);
    expect(styles).toMatch(/\.main-header\s*\{[^}]*border-bottom:\s*0/s);
    expect(styles).toMatch(/\.asset-modal-surface,[\s\S]*corner-shape:\s*squircle/);
  });

  test("renders active surfaces and the overview dashboard geometry with visible focus in Chromium", async () => {
    const results = await chromiumGeometry(await activeScreenMarkup());

    expect(results).toHaveLength(14);
    for (const screen of ["overview", "documents", "media", "compositions", "units", "activity"] as const) {
      expect(results.filter((result) => result.screen === screen).map(({ width, height }) => ({ width, height })))
        .toEqual([{ width: 1360, height: 900 }, { width: 1100, height: 720 }]);
    }
    expect(results.map(({ screen, width, overflows }) => ({ screen, width, overflows })))
      .toEqual(results.map(({ screen, width }) => ({ screen, width, overflows: [] })));
    expect(results.find(({ screen, width }) => screen === "workspace" && width === 1100)?.metricColumns).toBe(2);
    const expectedOwners = {
      overview: [".project-domain-body"],
      documents: [".documents-master", ".documents-detail"],
      media: [".asset-grid-scroll"],
      compositions: [".composition-master", ".composition-detail"],
      units: [".units-master", ".units-detail"],
      activity: [".activity-scroll"],
    };
    for (const [screen, scrollOwners] of Object.entries(expectedOwners)) {
      expect(results.filter((result) => result.screen === screen).map((result) => result.scrollOwners))
        .toEqual([scrollOwners, scrollOwners]);
    }
    expect(results.filter(({ screen, width }) => width === 1100 && ["documents", "compositions", "units"].includes(screen)).map(({ screen, splitVerticalContained }) => ({ screen, splitVerticalContained })))
      .toEqual(["documents", "compositions", "units"].map((screen) => ({ screen, splitVerticalContained: true })));
    expect(results.filter(({ screen, nestedMediaScroll }) => screen === "media" && nestedMediaScroll)).toEqual([]);
    expect(results.filter(({ screen }) => screen === "media").map(({ width, mediaInsets }) => ({ width, mediaInsets: mediaInsets.length })))
      .toEqual([{ width: 1360, mediaInsets: 1 }, { width: 1100, mediaInsets: 1 }]);
    expect(results.flatMap(({ screen, width, documentDetailWidth, documentViewerWidths }) => screen !== "documents" || documentDetailWidth === null
      ? []
      : documentViewerWidths.filter((viewerWidth) => viewerWidth > Math.min(820, documentDetailWidth - 48) + 1).map((viewerWidth) => ({ width, documentDetailWidth, viewerWidth })))).toEqual([]);
    expect(results.filter(({ screen }) => screen === "documents").map(({ width, documentViewerWidths }) => ({ width, viewers: documentViewerWidths.length })))
      .toEqual([{ width: 1360, viewers: 2 }, { width: 1100, viewers: 2 }]);
    expect(results.filter(({ screen }) => screen === "documents").map(({ width, documentViewerMaxWidths }) => ({ width, documentViewerMaxWidths })))
      .toEqual([{ width: 1360, documentViewerMaxWidths: ["820px", "820px"] }, { width: 1100, documentViewerMaxWidths: ["820px", "820px"] }]);
    expect(results.filter(({ screen }) => screen === "documents").map(({ width, focus }) => ({ width, selectors: focus.map(({ selector }) => selector) })))
      .toEqual([{ width: 1360, selectors: [".mode-segments button[aria-selected=true]", ".document-search input", ".document-row", ".document-detail-heading"] }, { width: 1100, selectors: [".mode-segments button[aria-selected=true]", ".document-search input", ".document-row", ".document-detail-heading"] }]);
    expect(results.filter(({ screen }) => screen === "overview").map(({ width, overviewColumns }) => ({ width, overviewColumns })))
      .toEqual([{ width: 1360, overviewColumns: 1 }, { width: 1100, overviewColumns: 1 }]);
    expect(results.filter(({ screen, overviewWidth }) => screen === "overview" && overviewWidth !== null && overviewWidth > 1440)).toEqual([]);
    expect(results.flatMap(({ screen, width, overviewMetricWidths }) => screen === "overview" ? overviewMetricWidths.filter((value) => value < 60).map((value) => ({ width, value })) : [])).toEqual([]);
    expect(results.flatMap(({ screen, width, focus }) => focus.filter(({ width: focusWidth }) => focusWidth < 2).map((value) => ({ screen, width, focus: value })))).toEqual([]);
    expect(results.flatMap(({ screen, width, focus }) => focus.filter(({ contrast }) => contrast < 3).map((value) => ({ screen, width, focus: value })))).toEqual([]);
    expect(results.filter(({ forbidden }) => forbidden !== 0)).toEqual([]);
    expect(workbenchStyles).toMatch(/\.media-card-button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fg\)/s);
    expect(workbenchStyles).toMatch(/\.asset-context-menu button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fg\)/s);
    expect(workbenchStyles).toMatch(/\.overview-dashboard\s*\{[^}]*max-width:\s*1440px/s);
    expect(workbenchStyles).toMatch(/@container project-domain \(min-width:\s*1200px\)/);
  }, 20_000);

  test("keeps active surfaces borderless and free of the undefined surface token", () => {
    expect(styles).not.toContain("var(--surface)");
    expect(workbenchStyles).not.toMatch(/\.project-domain-list\s*\{[^}]*border:\s*1px/s);
    expect(workbenchStyles).toMatch(/\.project-domain-list\s*\{[^}]*border:\s*0/s);
    expect(workbenchStyles).toMatch(/\.project-domain-list > article\s*\{[^}]*border-bottom:\s*0/s);
    expect(styles).not.toContain(".project-preview");
    expect(workbenchStyles).not.toMatch(/\.project-domain-list > button\.is-selected\s*\{[^}]*inset\s+2px\s+0/s);
  });

  test("uses one squircle command style without a stale pill override", () => {
    expect(workbenchStyles).not.toContain(".load-more");
  });

  test("resets browser chrome without applying a global accent focus ring", () => {
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");
    const resetPath = join(process.cwd(), "src/styles/reset.css");
    expect(existsSync(resetPath)).toBe(true);
    const reset = existsSync(resetPath) ? readFileSync(resetPath, "utf8") : "";

    expect(main).toContain('import "./styles/reset.css"');
    expect(reset).toContain("box-sizing: border-box");
    expect(reset).toMatch(/:focus-visible\s*\{[^}]*outline:\s*none/s);
    expect(styles).not.toMatch(
      /button:focus-visible,\s*input:focus-visible,\s*textarea:focus-visible,\s*select:focus-visible\s*\{[^}]*(?:--ring-focus|var\(--accent\))/s,
    );
    expect(styles).not.toMatch(
      /(?:focus-visible|focus-within)[^{]*\{[^}]*var\(--accent\)/s,
    );
  });

  test("uses headless selectors and panel shortcuts", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    expect(renderer).not.toMatch(/<select(?:\s|>)/);
    expect(renderer).toContain("@radix-ui/react-select");
    expect(renderer).toContain('role="listbox"');
    expect(renderer).toContain('role="slider"');
    expect(renderer).toContain('aria-label="Toggle sidebar"');
    expect(renderer).toContain('aria-label="Toggle right panel"');
    expect(renderer).toContain('aria-label="Toggle bottom panel"');
    expect(app).toContain("if (event.repeat) return");
    expect(app).toContain('command && key === "b"');
    expect(app).toContain('command && key === "j"');
    expect(app).not.toContain('commandOption && key === "b"');
  });

  test("provides searchable workspace navigation and resizable utility panels", () => {
    expect(renderer).toContain('aria-label="Search workspaces"');
    expect(renderer).toContain('aria-activedescendant');
    expect(renderer).toContain("closeAndRestoreFocus");
    expect(renderer).toContain('ariaLabel="Resize sidebar"');
    expect(renderer).toContain('ariaLabel="Resize right panel"');
    expect(renderer).toContain('ariaLabel="Resize bottom panel"');
    expect(renderer).toContain("onLostPointerCapture");
    expect(renderer).toContain("breadcrumb-button");
    expect(renderer).toContain("createPortal");
    expect(styles).toMatch(
      /\.workspace-picker-popover\s*\{[^}]*position:\s*fixed/s,
    );
    expect(styles).toMatch(
      /\.workspace-picker-search:focus-within\s*\{[^}]*box-shadow:\s*none/s,
    );
    expect(styles).toMatch(
      /\.breadcrumbs\s*\{[^}]*-webkit-app-region:\s*no-drag/s,
    );
    expect(styles).toMatch(/button:not\(:disabled\)[^{]*\{[^}]*cursor:\s*pointer/s);
  });

  test("transfers the approved dither workspace hero and project identity system", () => {
    const picker = readFileSync(
      join(process.cwd(), "src/components/WorkspacePicker.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      join(process.cwd(), "src/components/ContextSidebar.tsx"),
      "utf8",
    );
    const profile = readFileSync(
      join(process.cwd(), "src/components/ProfileMenu.tsx"),
      "utf8",
    );

    expect(picker).toContain('className="workspace-hero"');
    expect(picker).toContain("workspace-hero-field-hi");
    expect(picker).toContain("selected?.unitCount");
    expect(picker).toContain("selected?.sharedCount");
    expect(picker).not.toContain("basename(rootPath)");
    expect(picker).not.toContain("workspace-hero-pill");
    expect(picker).toContain("workspace-option-field");
    expect(picker).toContain("style={workspaceDitherVars(workspace.name)}");
    expect(sidebar).toContain("projectGlyphVars(project.name)");
    expect(sidebar).toContain("projectGlyphSlot(project.name)");
    expect(sidebar).toContain("data-glyph=");
    expect(picker).toContain("workspaceDitherVars(selected?.name ?? value)");
    expect(sidebar).toContain("sidebar-row-field");
    expect(sidebar).not.toContain("sidebar-mascot-peek");
    expect(sidebar).not.toContain('title="Filter projects"');
    expect(profile).toContain(".ralphy library</small>");
    expect(styles).toContain("--dither-op: 1");
    expect(styles).toMatch(
      /\.workspace-hero\s*\{[^}]*width:\s*calc\(100% - 24px\)/s,
    );
    expect(styles).toMatch(
      /\.sidebar-row\.is-selected::after\s*\{[^}]*linear-gradient/s,
    );
    expect(styles).toMatch(
      /\.project-glyph-mark\s*\{[^}]*display:\s*block/s,
    );
    expect(styles).toMatch(
      /\.sidebar-row-field\s*\{[^}]*z-index:\s*0/s,
    );
    expect(styles).toMatch(
      /\.sidebar-row\.is-selected::after\s*\{[^}]*z-index:\s*1/s,
    );
    expect(styles).toMatch(
      /\.sidebar-row\.is-selected\s*>\s*\*:not\(\.sidebar-row-field\)\s*\{[^}]*z-index:\s*2/s,
    );
    expect(styles).toMatch(
      /\.workspace-option-field\s*\{[^}]*row-field\.png/s,
    );
    for (let slot = 1; slot <= 8; slot += 1) {
      expect(styles).toContain(`--p${slot}:`);
      expect(styles).toContain(`.project-glyph[data-glyph="${slot}"]`);
      expect(
        existsSync(join(process.cwd(), `public/assets/dither/g${slot}.png`)),
      ).toBe(true);
    }
    for (const asset of [
      "orb-22.png",
      "ribbon-card.png",
      "ribbon-card-hi.png",
      "row-field.png",
    ]) {
      expect(existsSync(join(process.cwd(), "public/assets/dither", asset))).toBe(
        true,
      );
    }
  });

  test("shows a paced Ralphy welcome before revealing the workbench", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const welcomePath = join(process.cwd(), "src/components/WelcomeScreen.tsx");
    expect(existsSync(welcomePath)).toBe(true);
    const welcome = existsSync(welcomePath) ? readFileSync(welcomePath, "utf8") : "";

    expect(app).not.toContain("Opening library…");
    expect(app).toContain("WELCOME_MINIMUM_MS");
    expect(app).toContain("setWelcomeExiting(true)");
    expect(welcome).toContain("Howdy, partner!");
    expect(welcome).toContain("Workspace index");
    expect(welcome).toContain("Media workbench");
    expect(styles).toContain(".welcome-screen.is-exiting");
  });

  test("opens a global multi-provider chat with Cmd+R", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const main = readFileSync(join(process.cwd(), "electron/main.ts"), "utf8");
    const preload = readFileSync(join(process.cwd(), "electron/preload.ts"), "utf8");
    const panels = readFileSync(
      join(process.cwd(), "src/components/UtilityPanels.tsx"),
      "utf8",
    );

    expect(main).toContain('input.key.toLocaleLowerCase() === "r"');
    expect(main).toContain("event.preventDefault()");
    expect(preload).toContain("onToggleRightPanel");
    expect(app).toMatch(
      /bridge\.onToggleRightPanel\(\(\)\s*=>\s*setRightPanelVisible\(\(visible\)\s*=>\s*!visible\)\)/,
    );
    expect(app).toContain("useAgentChat");
    expect(app).toContain("<AgentChatPanel");
    expect(app).not.toContain("<RightPanelSummary");
    expect(panels).toContain("AgentChatPanel");
    expect(panels).toContain("AgentChatMenu");
    expect(panels).toContain("AgentProviderMenu");
    expect(panels).toContain("AgentModelMenu");
    expect(panels).toContain('label: "Codex"');
    expect(panels).toContain('label: "OpenRouter"');
    expect(panels).not.toContain("<select");
    expect(panels).toContain("AiBrandIcon");
    expect(styles).toMatch(
      /\.utility-right-panel\s*\{[^}]*border-left:\s*1px solid var\(--line\)/s,
    );
    expect(styles).toMatch(/\.agent-composer\s*\{[^}]*background:\s*var\(--raised\)/s);
    expect(styles).toMatch(
      /\.agent-composer textarea\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/s,
    );
  });

  test("exposes bounded terminal IPC and packages the native PTY runtime", () => {
    const main = readFileSync(join(process.cwd(), "electron/main.ts"), "utf8");
    const preload = readFileSync(join(process.cwd(), "electron/preload.ts"), "utf8");
    const types = readFileSync(
      join(process.cwd(), "electron/media/types.ts"),
      "utf8",
    );
    const buildElectron = readFileSync(
      join(process.cwd(), "scripts/build-electron.mjs"),
      "utf8",
    );
    const packageMac = readFileSync(
      join(process.cwd(), "scripts/package-mac.mjs"),
      "utf8",
    );
    const smoke = readFileSync(
      join(process.cwd(), "scripts/smoke-electron.mjs"),
      "utf8",
    );

    expect(types).toContain("createTerminal");
    expect(types).toContain("writeTerminal");
    expect(types).toContain("resizeTerminal");
    expect(types).toContain("killTerminal");
    expect(types).toContain("onTerminalEvent");
    expect(preload).toContain("TERMINAL_CHANNELS");
    expect(main).toContain("new TerminalManager");
    expect(main).toContain("assertTrustedSender");
    expect(main).toContain("mediaState.captureActive()");
    expect(main).toContain("terminalManager.dispose()");
    expect(buildElectron).toMatch(/external:\s*\[[^\]]*"node-pty"/s);
    expect(packageMac).toContain('join(root, "node_modules/node-pty")');
    expect(packageMac).toContain("spawn-helper");
    expect(packageMac).toContain("chmod");
    expect(main).toContain("window.ralphy?.createTerminal");
    expect(smoke).toContain("RALPHY_TERMINAL_BRIDGE_READY");
  });

  test("keeps a persistent xterm workspace with draggable resizable splits", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const controller = readFileSync(
      join(process.cwd(), "src/terminal/controller.ts"),
      "utf8",
    );
    const workspace = readFileSync(
      join(process.cwd(), "src/components/terminal/TerminalWorkspace.tsx"),
      "utf8",
    );
    const pane = readFileSync(
      join(process.cwd(), "src/components/terminal/TerminalPane.tsx"),
      "utf8",
    );
    const utilityPanels = readFileSync(
      join(process.cwd(), "src/components/UtilityPanels.tsx"),
      "utf8",
    );
    const terminalStyles = readFileSync(
      join(process.cwd(), "src/styles/terminal.css"),
      "utf8",
    );
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");

    expect(controller).toContain("new Terminal");
    expect(controller).toContain("new FitAddon");
    expect(controller).toContain("new WebLinksAddon");
    expect(controller).toContain('cursorStyle: "bar"');
    expect(controller).toContain(
      'fontFamily: \'"JetBrainsMono Nerd Font Mono", "JetBrains Mono", Menlo, monospace\'',
    );
    expect(controller).not.toContain('fontFamily: \'"AWS Diatype Mono"');
    expect(utilityPanels).not.toContain('className="bottom-panel-header"');
    expect(terminalStyles).toMatch(/\.terminal-workspace\s*\{[^}]*height:\s*100%/s);
    expect(pane).toContain("new ResizeObserver");
    expect(workspace).toContain("bridge.onTerminalEvent");
    expect(workspace).toContain("bridge.killTerminal");
    expect(pane).toContain("event.button !== 1");
    expect(pane).toContain("application/x-ralphy-terminal-tab");
    expect(pane).toContain('["top", "right", "bottom", "left"]');
    expect(workspace).toContain("setPointerCapture");
    expect(workspace).toContain("onLostPointerCapture");
    expect(app).toContain("visible={bottomPanelVisible}");
    expect(app).toContain("Math.floor(viewport.height * 0.5)");
    expect(workspace).toContain("@xterm/xterm/css/xterm.css");
    expect(app).toContain("loadSettingsScreen");
  });

  test("opens app-level settings from a custom profile popover", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const profileMenu = readFileSync(
      join(process.cwd(), "src/components/ProfileMenu.tsx"),
      "utf8",
    );
    const settings = readFileSync(
      join(process.cwd(), "src/screens/SettingsScreen.tsx"),
      "utf8",
    );
    const preferences = readFileSync(
      join(process.cwd(), "src/state/workbench.ts"),
      "utf8",
    );

    expect(profileMenu).toContain("createPortal");
    expect(profileMenu).toContain('role="menu"');
    expect(profileMenu).toContain("Settings");
    expect(profileMenu).toContain("closeAndRestoreFocus");
    expect(app).toContain('command && event.key === ","');
    expect(app).toContain("<SettingsScreen");
    expect(app).toContain("onBack={() => setSettingsVisible(false)}");
    for (const category of [
      "General",
      "Profile",
      "Appearance",
      "Providers",
      "Terminal",
      "About",
    ]) {
      expect(settings).toContain(`"${category}"`);
    }
    expect(settings).toContain("Change .ralphy library");
    expect(settings).toContain('type="password"');
    expect(settings).toContain('autoComplete="off"');
    expect(preferences).not.toMatch(/apiKey|providerKey|elevenlabs|openrouter/i);
  });

  test("uses the Ralphy mascot and a neutral dot-grid media stage", () => {
    const mascot = readFileSync(
      join(process.cwd(), "public/assets/ralphy-mascot.svg"),
      "utf8",
    );
    const welcome = readFileSync(
      join(process.cwd(), "src/components/WelcomeScreen.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      join(process.cwd(), "src/components/ContextSidebar.tsx"),
      "utf8",
    );
    const settings = readFileSync(
      join(process.cwd(), "src/screens/SettingsScreen.tsx"),
      "utf8",
    );
    const terminal = readFileSync(
      join(process.cwd(), "src/components/terminal/TerminalWorkspace.tsx"),
      "utf8",
    );

    expect(mascot).toContain('mask id="eyes"');
    expect(sidebar).not.toContain("<RalphyMascot");
    expect(settings).toContain("<RalphyMascot");
    expect(terminal).toContain("<RalphyMascot");
    expect(welcome).toContain("<RalphyMascot");
  });

  test("keeps library switching in the profile and panel toggles in requested order", () => {
    const titlebar = readFileSync(
      join(process.cwd(), "src/components/Titlebar.tsx"),
      "utf8",
    );
    expect(titlebar).not.toContain("MoreHorizontal");
    expect(titlebar).not.toContain("Change library");
    expect(titlebar.indexOf('aria-label="Toggle bottom panel"')).toBeLessThan(
      titlebar.indexOf('aria-label="Toggle right panel"'),
    );
    const main = readFileSync(join(process.cwd(), "electron/main.ts"), "utf8");
    expect(main).toContain("trafficLightPosition");
    expect(main).toContain("setWindowOpenHandler");
    expect(main).toContain('target.protocol === "http:"');
    expect(main).toContain('target.protocol === "https:"');
    expect(main).toContain('return { action: "deny" }');
  });
});
