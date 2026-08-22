import { spawn } from "node:child_process";
import { build } from "esbuild";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { ActivityDto, ArtifactMediaCardDto, CompositionDto, CompositionRevisionDto, MediaCardDto, UnitDto, UnitRevisionDto, WorkspaceOverviewDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "../src/lib/ipc";
import { ProjectScreenView, createProjectScreenController } from "../src/screens/ProjectScreen";
import { SharedLibraryScreenView } from "../src/screens/SharedLibraryScreen";
import { SharedArtifactInspector } from "../src/screens/shared-library/SharedArtifactInspector";
import { presentSharedArtifact } from "../src/screens/shared-library/presentation";
import { readStylesheet } from "./style-sources";
import { WorkspaceScreenView, createWorkspaceScreenController } from "../src/screens/WorkspaceScreen";

const workspaceOverviewStyles = readStylesheet("workspace-overview.css");
const styles = ["reset.css", "tokens.css", "workbench.css", "shared-library.css", "instrument.css"]
  .map((file) => readStylesheet(file))
  .concat(workspaceOverviewStyles)
  .join("\n");
const workbenchStyles = readStylesheet("workbench.css");
const tokenStyles = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
const settingsStyles = readStylesheet("settings.css");
const settingsScreenSource = readFileSync(join(process.cwd(), "src/screens/SettingsScreen.tsx"), "utf8");
const settingsSurfaceSource = [
  "src/screens/SettingsScreen.tsx",
  ...readdirSync(join(process.cwd(), "src/screens/settings")).map((file) => `src/screens/settings/${file}`),
].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
const sharedLibraryStyles = readStylesheet("shared-library.css");
const marketplaceStyles = readStylesheet("marketplace.css");

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
  id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", compositionId: composition.id, slug: "launch-unit", format: "9:16",
  latestRevisionId: "unit-revision-1", selectedRevisionId: "unit-revision-1", createdAt: 1, updatedAt: 2,
};
const unitRevision: UnitRevisionDto = {
  id: "unit-revision-1", unitId: "unit-1", compositionRevisionId: compositionRevision.id, revisionNo: 1, parentRevisionId: null, iterationId: null,
  note: null, authoredBySessionId: null, createdAt: 1, sealedAt: 2,
};
const activity: ActivityDto = {
  sequence: 1, workspaceId: "workspace-1", projectId: "project-1", entityType: "run", entityId: "run-1",
  action: "generation.completed", createdAt: 1,
};

type ProjectMarkup = Record<"documents" | "media" | "units" | "activity" | "memory", string>;

async function activeScreenMarkup(): Promise<{ workspace: string } & ProjectMarkup> {
  const workspaceValue = {
    workspace: { id: "workspace-1", slug: "launch", name: "Launch Studio", rowVersion: 1, createdAt: 1, updatedAt: 2 },
    accounts: { items: [], nextCursor: null },
    projects: { items: [{ id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2 }], nextCursor: null },
    units: { items: [], nextCursor: null },
    publications: { items: [], nextCursor: null },
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
    workspaceDescription: "Launch campaigns",
    onOpenPage: () => undefined,
    onOpenUnit: () => undefined,
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
  await projectController.selectTab("units");
  await projectController.openUnit(unit.id);
  const units = renderToStaticMarkup(createElement(ProjectScreenView, { project, controller: projectController, snapshot: projectController.getSnapshot() }));
  await projectController.selectTab("activity");
  const activityMarkup = renderToStaticMarkup(createElement(ProjectScreenView, { project, controller: projectController, snapshot: projectController.getSnapshot() }));
  const memory = `<main class="main-region memory-region">
    <div class="memory-topbar"></div><div class="memory-filters"></div>
    <section class="memory-rulebook"><div class="memory-group"><header><i></i></header><div>
      <article class="memory-rule"><button class="memory-rule-head">Memory</button></article>
      <article class="memory-rule is-open"><button class="memory-rule-head">Open memory</button><div class="memory-rule-body">Body</div></article>
    </div></div></section>
  </main>`;
  return { workspace, media, documents, units, activity: activityMarkup, memory };
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
  overviewNarrativeColumns: number | null;
  overviewColumnRatio: number | null;
  overviewScrollOwners: string[];
  splitVerticalContained: boolean | null;
  masterRowEdgeInset: number | null;
  masterRowSearchOffset: number | null;
  masterRowTopInset: number | null;
  masterRowHeight: number | null;
  masterRowGap: number | null;
  revisionEdgeInset: number | null;
  revisionTopInset: number | null;
  revisionGap: number | null;
  mediaTitleFontSize: number | null;
  mediaMetaFontSize: number | null;
  activityTimeFontSize: number | null;
  activityEntityFontSize: number | null;
  forbidden: number;
  projectHeaderCount: number;
  projectTabsCenterOffset: number | null;
  gooeyBlobCoverage: number | null;
  unitCardsInGridFlow: boolean | null;
  projectTabsHeaderOffset: number | null;
  projectTabsReceivePointer: boolean | null;
  projectTabsAppRegion: string | null;
  memoryRegionPadding: string | null;
  memoryTopbarBorder: string | null;
  memoryFilterBorder: string | null;
  memoryInactiveBackground: string | null;
  memoryOpenBackground: string | null;
  memoryBodyBorder: string | null;
};

async function chromiumGeometry(markup: { workspace: string } & ProjectMarkup): Promise<GeometryResult[]> {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-geometry-"));
  try {
    const links = ["reset.css", "tokens.css", "workbench.css", "instrument.css"]
      .map((file) => `<link rel="stylesheet" href="${pathToFileURL(join(process.cwd(), "src/styles", file)).href}">`)
      .join("");
    const shell = (screen: string) => `<div class="workbench has-right-panel" style="--sidebar-w:288px;--inspector-w:336px"><aside class="context-sidebar"></aside><section class="main-shell"><header class="main-header"></header><div class="main-content-stage">${screen}</div></section><aside class="utility-right-panel"></aside></div>`;
    const templates = Object.entries(markup).map(([name, value]) => `<template id="${name}">${shell(value)}</template>`).join("");
    writeFileSync(join(directory, "layout.html"), `<!doctype html><html><head>${links}<style>${workspaceOverviewStyles}</style></head><body><div id="root"></div>${templates}</body></html>`);
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
        const viewports = [[2560, 1400], [1360, 900], [1100, 720]];
        for (const [screen, width, height] of ["workspace", "documents", "media", "units", "activity", "memory"].flatMap((screen) => viewports.map(([width, height]) => [screen, width, height]))) {
          win.setContentSize(width, height);
          await win.webContents.executeJavaScript(\`(async () => {
              const screen = \${JSON.stringify(screen)}, root = document.getElementById("root");
              root.innerHTML = document.getElementById(screen).innerHTML;
              if (screen === "media") { const space = root.querySelector(".virtual-grid-space"); if (space) space.style.height = "1600px"; }
              if (screen === "documents") {
                const detail = root.querySelector(".documents-detail"), viewer = detail?.querySelector(":scope > .markdown-view");
                if (detail && viewer) { const review = document.createElement("div"); review.className = "document-current-review"; review.append(viewer.cloneNode(true)); detail.append(review); }
              }
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            })()\`);
            const documentNode = await win.webContents.debugger.sendCommand("DOM.getDocument");
            const focusSelectors = ({
              workspace: [".workspace-overview-header button"],
              documents: [".project-dock button[aria-selected=true]", ".document-search input", ".document-row", ".document-detail-heading"],
              media: [".project-dock button[aria-selected=true]", ".select-menu-trigger", ".snappy-slider"],
              units: [".project-dock button[aria-selected=true]", ".unit-card"],
              activity: [".project-dock button[aria-selected=true]", ".activity-scroll"],
              memory: [".memory-rule-head"],
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
                ? [".main-region", ".screen-header", ".workspace-overview-meta", ".workspace-overview-scroll", ".workspace-overview-section", ".workspace-content-plan", ".workspace-plan-days", ".workspace-plan-events", ".workspace-unit-outcomes", ".workspace-outcome-groups", ".workspace-operations-grid", ".workspace-operations-panel"]
                : [".main-region", ...({ documents: [".project-header", ".project-controls", ".project-domain-body", ".project-dock", ".documents-workbench", ".documents-master", ".documents-detail"], media: [".project-header", ".project-controls", ".project-domain-body", ".project-dock", ".media-panel", ".media-domain-toolbar", ".project-media-grid", ".asset-grid-scroll"], units: [".project-header", ".project-controls", ".project-domain-body", ".project-dock", ".units-workbench", ".units-grid-scroll", ".units-grid", ".unit-card"], activity: [".project-header", ".project-controls", ".project-domain-body", ".project-dock", ".activity-scroll"], memory: [".memory-filters", ".memory-rulebook", ".memory-rule"] })[screen]];
              const overflows = [];
              for (const selector of selectors) for (const element of root.querySelectorAll(selector)) {
                if (element.scrollWidth > element.clientWidth + 1) overflows.push(selector + ":" + element.scrollWidth + ">" + element.clientWidth);
              }
              const metrics = root.querySelector(".metrics-band");
              const metricColumns = metrics ? getComputedStyle(metrics).gridTemplateColumns.split(" ").filter(Boolean).length : null;
              const ownerCandidates = ({ documents: [".project-domain-body", ".documents-master", ".documents-detail"], media: [".project-domain-body", ".asset-grid-scroll"], units: [".project-domain-body", ".units-grid-scroll"], activity: [".project-domain-body", ".activity-scroll"], memory: [".memory-rulebook"], workspace: [".workspace-domain-body"] })[screen];
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
              const mediaInsets = [".project-region", ".asset-grid-scroll"].map((selector) => {
                const element = root.querySelector(selector); return element ? parseFloat(getComputedStyle(element).paddingLeft) : 0;
              }).filter((value) => value > 0);
              const focusSelectors = ({ workspace: [".workspace-overview-header button"], documents: [".project-dock button[aria-selected=true]", ".document-search input", ".document-row", ".document-detail-heading"], media: [".project-dock button[aria-selected=true]", ".select-menu-trigger", ".snappy-slider"], units: [".project-dock button[aria-selected=true]", ".unit-card"], activity: [".project-dock button[aria-selected=true]", ".activity-scroll"], memory: [".memory-rule-head"] })[screen];
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
              const overviewNarrative = root.querySelector(".overview-main-layout");
              const overviewNarrativeColumns = overviewNarrative ? getComputedStyle(overviewNarrative).gridTemplateColumns.split(" ").filter(Boolean).length : null;
              const overviewPrimaryWidth = root.querySelector(".overview-primary-column")?.getBoundingClientRect().width ?? null;
              const overviewSupportWidth = root.querySelector(".overview-support-column")?.getBoundingClientRect().width ?? null;
              const overviewColumnRatio = overviewPrimaryWidth && overviewSupportWidth ? overviewPrimaryWidth / overviewSupportWidth : null;
              const overviewScrollOwners = [".project-domain-body", ".overview-dashboard"].filter((selector) => { const item = root.querySelector(selector); if (!item) return false; const overflow = getComputedStyle(item).overflowY; return overflow === "auto" || overflow === "scroll"; });
              const split = root.querySelector(".documents-workbench, .composition-workbench");
              const splitBody = root.querySelector(".project-domain-body");
              const splitVerticalContained = split && splitBody ? [split, ...split.children].every((pane) => {
                const outer = splitBody.getBoundingClientRect(), inner = pane.getBoundingClientRect();
                return inner.height > 0 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
              }) : null;
              const masterGeometry = ({ documents: [".documents-virtual-list", ".document-row", 54] })[screen];
              const masterList = masterGeometry ? root.querySelector(masterGeometry[0]) : null;
              const masterRow = masterGeometry ? root.querySelector(masterGeometry[1]) : null;
              const masterListRect = masterList?.getBoundingClientRect();
              const masterRowRect = masterRow?.getBoundingClientRect();
              const masterRowEdgeInset = masterListRect && masterRowRect ? masterRowRect.left - masterListRect.left : null;
              // The row and the search pill above it are siblings in the master column, so
              // their left edges have to agree; a per-row inset put them on different edges.
              const masterSearchRect = root.querySelector(".document-search")?.getBoundingClientRect();
              const masterRowSearchOffset = masterSearchRect && masterRowRect ? masterRowRect.left - masterSearchRect.left : null;
              const masterRowTopInset = masterListRect && masterRowRect ? masterRowRect.top - masterListRect.top : null;
              const masterRowHeight = masterRowRect?.height ?? null;
              const masterRowGap = masterRowRect ? masterGeometry[2] - masterRowRect.height : null;
              const revisionRail = root.querySelector(screen === "units" ? ".unit-revision-rail" : ":not(*)");
              const revisionButton = revisionRail?.querySelector("button");
              const revisionRailRect = revisionRail?.getBoundingClientRect();
              const revisionButtonRect = revisionButton?.getBoundingClientRect();
              const revisionEdgeInset = revisionRailRect && revisionButtonRect ? revisionButtonRect.left - revisionRailRect.left : null;
              const revisionTopInset = revisionRailRect && revisionButtonRect ? revisionButtonRect.top - revisionRailRect.top : null;
              const revisionGap = !revisionRail || !revisionButtonRect ? null : Number.parseFloat(getComputedStyle(revisionRail).columnGap);
              const fontSize = (selector) => { const element = root.querySelector(selector); return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null; };
              const mediaTitleFontSize = fontSize(".media-card-tile .asset-copy strong");
              const mediaMetaFontSize = fontSize(".media-card-tile .asset-copy small");
              const activityTimeFontSize = fontSize(".activity-event time");
              const activityEntityFontSize = fontSize(".activity-event > span:not(.activity-icon)");
              const projectHeaderCount = root.querySelectorAll(".project-header").length;
              const projectControls = root.querySelector(".project-controls");
              const controlsRect = projectControls?.getBoundingClientRect();
              const tabsRect = root.querySelector(".project-controls .project-dock")?.getBoundingClientRect();
              const blobsRect = null;
              const projectTabsCenterOffset = controlsRect && tabsRect ? Math.abs((controlsRect.left + controlsRect.width / 2) - (tabsRect.left + tabsRect.width / 2)) : null;
              const headerRect = root.querySelector(".main-header")?.getBoundingClientRect();
              const projectTabsHeaderOffset = headerRect && tabsRect ? Math.abs((headerRect.top + headerRect.height / 2) - (tabsRect.top + tabsRect.height / 2)) : null;
              const projectTab = root.querySelector(".project-controls [role=tab]");
              const projectTabRect = projectTab?.getBoundingClientRect();
              const projectTabHit = projectTabRect ? document.elementFromPoint(projectTabRect.left + projectTabRect.width / 2, projectTabRect.top + projectTabRect.height / 2) : null;
              const projectTabsReceivePointer = projectTab ? projectTab === projectTabHit || projectTab.contains(projectTabHit) : null;
              const projectTabsAppRegion = projectControls ? getComputedStyle(projectControls).getPropertyValue("-webkit-app-region") : null;
              const gooeyBlobCoverage = tabsRect ? 1 : null;
              const unitCards = [...root.querySelectorAll(".unit-card")];
              const unitCardsInGridFlow = screen !== "units" ? null : unitCards.length > 0 && unitCards.every((card) => getComputedStyle(card).position !== "absolute");
              const forbidden = [...root.querySelectorAll(".load-more, .project-preview, .pagination")].length + (screen === "media" ? [...root.querySelectorAll(".media-panel button")].filter((button) => button.textContent.trim() === "Open").length : 0);
              const style = (selector) => { const element = root.querySelector(selector); return element ? getComputedStyle(element) : null; };
              return { screen, width: innerWidth, height: innerHeight, overflows, metricColumns, scrollOwners, documentDetailWidth: documentDetail?.getBoundingClientRect().width ?? null, documentViewerWidths, documentViewerMaxWidths, nestedMediaScroll, mediaInsets, focus, overviewColumns, overviewWidth, overviewMetricWidths, overviewNarrativeColumns, overviewColumnRatio, overviewScrollOwners, splitVerticalContained, masterRowEdgeInset, masterRowSearchOffset, masterRowTopInset, masterRowHeight, masterRowGap, revisionEdgeInset, revisionTopInset, revisionGap, mediaTitleFontSize, mediaMetaFontSize, activityTimeFontSize, activityEntityFontSize, forbidden, projectHeaderCount, projectTabsCenterOffset, gooeyBlobCoverage, unitCardsInGridFlow, projectTabsHeaderOffset, projectTabsReceivePointer, projectTabsAppRegion,
                memoryRegionPadding: style(".memory-region")?.padding ?? null,
                memoryTopbarBorder: style(".memory-topbar")?.borderBottomWidth ?? null,
                memoryFilterBorder: style(".memory-filters")?.borderTopWidth ?? null,
                memoryInactiveBackground: style(".memory-rule:not(.is-open)")?.backgroundColor ?? null,
                memoryOpenBackground: style(".memory-rule.is-open")?.backgroundColor ?? null,
                memoryBodyBorder: style(".memory-rule-body")?.borderTopWidth ?? null };
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

const sharedArtifact = (id: string): ArtifactMediaCardDto => ({
  ref: { type: "artifact", id }, workspaceId: "workspace-1", projectId: null, slug: id, kind: "reference-image",
  selectedRevisionId: `revision-${id}`, selectedState: "approved", mime: "image/png", bytes: 2_048,
  selectedAt: 1, revisionCount: 2, selectedObjectId: `object-${id}`, storageClass: "durable", usageRoles: ["reference"],
  target: null, mediaKind: "image", provenance: "unknown",
});

function sharedLibraryMarkup(view: "grid" | "list") {
  const artifacts = Array.from({ length: 10 }, (_, index) => presentSharedArtifact(sharedArtifact(`artifact-${index + 1}`)));
  const unavailable = { status: "unavailable", reason: "Unavailable from Core." } as const;
  return renderToStaticMarkup(createElement(SharedLibraryScreenView, {
    workspaceId: "workspace-1", workspaceName: "Launch Studio", rootEpoch: 1,
    controller: {
      subscribe: () => () => undefined, getSnapshot: () => { throw new Error("Not used"); }, start: async () => undefined,
      refresh: async () => undefined, loadMore: async () => undefined, setQuery: () => undefined,
      selectArtifact: () => undefined, reconcileArtifact: () => undefined, dispose: () => undefined,
    },
    snapshot: {
      status: "ready", query: { text: "", mediaKind: "all", provenance: "all", view, sort: "recently-selected" },
      refreshing: false, loadingMore: false, pageError: null, refreshError: null,
      value: { artifacts, selectedArtifactId: null, nextCursor: null, totalCount: { status: "ready", value: artifacts.length }, totalSelectedBytes: unavailable },
    },
    resolvePreview: async () => null,
  } as never));
}

type SharedGeometryResult = {
  state: string;
  width: number;
  height: number;
  contentSizeSettled: boolean;
  overflows: string[];
  columns: number | null;
  toolbarHeight: number | null;
  inspectorPosition: string | null;
  inspectorWidth: number | null;
  contentWidth: number | null;
  auditOverflowX: string | null;
  auditScrollable: boolean | null;
  auditTabIndex: number | null;
  fitsViewport: boolean | null;
  portalMounted: boolean | null;
  internalVertical: boolean | null;
  mediaControls: number;
  autoplayCount: number;
  workflowKind: string | null;
  workflowStep: string | null;
  focus: Array<{ selector: string; width: number; style: string }>;
  motion: Array<{ selector: string; transition: string; animation: string }>;
};

type SharedGeometrySmoke = {
  font: { locatorMime: string; contentType: string | null; loaded: boolean };
  results: SharedGeometryResult[];
};

async function sharedLibraryGeometry(): Promise<SharedGeometrySmoke> {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-shared-geometry-"));
  try {
    const systemFont = "/System/Library/Fonts/Keyboard.ttf";
    if (!existsSync(systemFont)) throw new Error(`Real font fixture is unavailable: ${systemFont}`);
    const fontBytes = readFileSync(systemFont);
    const libraryRoot = join(directory, ".ralphy");
    const fontPath = join(libraryRoot, "workspaces", "specimen.ttf");
    mkdirSync(join(libraryRoot, "workspaces"), { recursive: true });
    writeFileSync(fontPath, fontBytes);
    await build({
      entryPoints: [join(process.cwd(), "electron/media/protocol-access.ts")],
      outfile: join(directory, "protocol-access.cjs"), bundle: true, platform: "node", format: "cjs",
      target: "node22", logLevel: "silent",
    });
    const links = ["reset.css", "tokens.css", "workbench.css", "shared-library.css"]
      .map((file) => `<link rel="stylesheet" href="${pathToFileURL(join(process.cwd(), "src/styles", file)).href}">`)
      .join("");
    // The shell is a stand-in for the instrument columns: the stage is sized here rather than
    // by a stylesheet rule, so the harness keeps constraining the screen even as the shell's
    // own classes come and go.
    const shell = (content: string) => `<div class="workbench has-right-panel" style="--sidebar-w:272px;--inspector-w:336px"><aside class="context-sidebar"></aside><section class="main-shell"><header class="main-header"></header><div class="main-content-stage" style="width:calc(100vw - 272px - 336px)">${content}</div></section><aside class="utility-right-panel"></aside></div>`;
    const inspector = renderToStaticMarkup(createElement(SharedArtifactInspector, {
      artifact: presentSharedArtifact(sharedArtifact("artifact-1")), workspaceId: "workspace-1", rootEpoch: 1,
      returnFocus: null, onClose: () => undefined, onReconcile: () => undefined,
    }));
    const templates = [
      ["grid", shell(sharedLibraryMarkup("grid"))], ["list", shell(sharedLibraryMarkup("list"))],
      ["inspector-panel", inspector],
    ].map(([name, value]) => `<template id="${name}">${value}</template>`).join("");
    writeFileSync(join(directory, "harness.tsx"), `
      import { createRoot } from "react-dom/client";
      import { SharedArtifactViewer } from ${JSON.stringify(join(process.cwd(), "src/screens/shared-library/SharedArtifactViewer.tsx"))};
      import { SharedLibraryWorkflows } from ${JSON.stringify(join(process.cwd(), "src/screens/shared-library/SharedLibraryWorkflows.tsx"))};
      import { presentSharedArtifact } from ${JSON.stringify(join(process.cwd(), "src/screens/shared-library/presentation.ts"))};

      const card = {
        ref: { type: "artifact", id: "geometry-artifact" }, workspaceId: "workspace-1", projectId: null,
        slug: "geometry-artifact-with-a-long-lossless-identity", kind: "brand-reference",
        selectedRevisionId: "geometry-revision-1", selectedState: "approved", mime: "image/svg+xml", bytes: 2048,
        selectedAt: 1, revisionCount: 1, selectedObjectId: "geometry-object-1", storageClass: "durable",
        usageRoles: ["A long referenced role that remains lossless across the viewer context panel"],
        target: { type: "object", id: "geometry-object-1" }, mediaKind: "image", provenance: "unknown",
      };
      const artifact = presentSharedArtifact(card);
      const suggestions = { status: "ready", value: [
        { field: "Title", value: "Canonical launch identity with enough descriptive content to exercise the longest suggestion card layout", source: "Embedded metadata and filename evidence" },
        { field: "Media kind and role", value: "Reusable visual reference for future campaign composition and continuity work", source: "MIME and workspace usage evidence" },
        { field: "Named entity", value: "Geometry Test Product Family and Campaign Collection", source: "Filename token evidence" },
        { field: "Purpose", value: "Use when future agents need a consistent visual anchor across projects while preserving the original source identity", source: "Project reference evidence" },
      ] };
      window.__sharedGeometryArtifact = card;
      window.__sharedGeometryRevisions = [{
        id: "geometry-revision-1", artifactId: card.ref.id, objectId: "geometry-object-1", revisionNo: 1,
        parentRevisionId: null, iterationId: null, state: "approved", authoredBySessionId: null, createdAt: 1,
      }];
      const root = createRoot(document.getElementById("react-root"));
      function Harness({ state }) {
        if (state === "viewer") return <SharedArtifactViewer artifact={artifact} artifacts={[artifact]}
          workspaceId="workspace-1" rootEpoch={1} returnFocus={null} onClose={() => {}}
          onNavigate={() => {}} onReconcile={() => {}} onOpenInspector={() => {}} />;
        const kind = state.split(":")[1];
        return <SharedLibraryWorkflows key={state} kind={kind} artifact={artifact} suggestions={suggestions}
          returnFocus={null} onClose={() => {}} />;
      }
      window.renderSharedGeometry = (state) => root.render(state ? <Harness key={state} state={state} /> : null);
    `);
    await build({
      entryPoints: [join(directory, "harness.tsx")], outfile: join(directory, "harness.js"),
      bundle: true, platform: "browser", format: "iife", target: "chrome130", jsx: "automatic",
      nodePaths: [join(process.cwd(), "node_modules")],
      define: { "process.env.NODE_ENV": '"production"', "import.meta.env": '{"MODE":"test","VITE_RALPHY_ENABLE_MOCKS":"true"}' },
      logLevel: "silent",
    });
    writeFileSync(join(directory, "layout.html"), `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' file:; img-src 'self' data: blob: ralphy-media:; media-src 'self' blob: ralphy-media:; connect-src 'self' ws:; font-src 'self' data: ralphy-media:; object-src 'none';">${links}</head><body><div id="fixture-root"></div><div id="react-root"></div>${templates}<script>
      window.ralphy = {
        loadSharedLibraryArtifact: async () => window.__sharedGeometryArtifact,
        loadSharedLibraryRevisions: async () => ({ items: window.__sharedGeometryRevisions, nextCursor: null }),
        selectSharedLibraryRevision: async () => window.__sharedGeometryArtifact,
        resolveSharedLibraryPreview: async () => ({ url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'%3E%3Crect width='100%25' height='100%25' fill='%232d2d2d'/%3E%3C/svg%3E", sizeBytes: 2048 }),
        performSharedLibraryAction: async () => undefined,
      };
    </script><script src="./harness.js"></script></body></html>`);
    writeFileSync(join(directory, "package.json"), JSON.stringify({ main: "main.cjs" }));
    writeFileSync(join(directory, "main.cjs"), `
      const { app, BrowserWindow, net, protocol } = require("electron");
      const { pathToFileURL } = require("node:url");
      const { MediaProtocolAccess } = require("./protocol-access.cjs");
      const access = new MediaProtocolAccess();
      const libraryRoot = ${JSON.stringify(libraryRoot)};
      protocol.registerSchemesAsPrivileged([{ scheme: "ralphy-media", privileges: {
        standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
      } }]);
      app.commandLine.appendSwitch("disable-gpu");
      app.whenReady().then(async () => {
        const minted = await access.mintTrustedLocator(
          libraryRoot, ${JSON.stringify(fontPath)}, "font/sfnt", ${fontBytes.byteLength},
        );
        const fontUrl = "ralphy-media://asset/" + minted.token;
        let servedContentType = null;
        protocol.handle("ralphy-media", async (request) => {
          const url = new URL(request.url);
          if (url.hostname !== "asset") return new Response("Not found", { status: 404 });
          const safePath = await access.resolve(libraryRoot, url.pathname.slice(1));
          const response = await net.fetch(pathToFileURL(safePath).toString());
          servedContentType = response.headers.get("content-type");
          return response;
        });
        const win = new BrowserWindow({ show: false, width: 1360, height: 900, useContentSize: true });
        await win.loadFile(${JSON.stringify(join(directory, "layout.html"))});
        const font = await win.webContents.executeJavaScript(\`(async () => {
          const face = await new FontFace("RalphyGuardedFontSmoke", 'url("' + \${JSON.stringify(fontUrl)} + '")').load();
          document.fonts.add(face);
          return { loaded: face.status === "loaded" && document.fonts.check("12px RalphyGuardedFontSmoke") };
        })()\`);
        font.locatorMime = "font/sfnt";
        font.contentType = servedContentType;
        win.webContents.debugger.attach("1.3");
        await win.webContents.debugger.sendCommand("DOM.enable");
        await win.webContents.debugger.sendCommand("CSS.enable");
        await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
        const results = [], viewports = [[2560, 1400], [1360, 900], [1280, 800]];
        const states = ["grid", "list", "inspector", "viewer", "workflow:add:0", "workflow:add:1", "workflow:add:2", "workflow:add:3", "workflow:promote", "workflow:duplicate", "workflow:suggestions", "workflow:archive", "workflow:update-review"];
        const waitForContentSize = async (state, width, height) => {
          const deadline = Date.now() + 2000;
          let bounds, renderer;
          while (Date.now() < deadline) {
            bounds = win.getContentBounds();
            renderer = await win.webContents.executeJavaScript("({ width: innerWidth, height: innerHeight })");
            if (bounds.width === width && bounds.height === height && renderer.width === width && renderer.height === height) return;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          throw new Error("Shared Library geometry viewport " + state + " did not settle at " + width + "x" + height
            + "; content bounds=" + JSON.stringify(bounds) + "; renderer=" + JSON.stringify(renderer));
        };
        for (const [state, width, height] of states.flatMap((state) => viewports.map(([width, height]) => [state, width, height]))) {
          win.setContentSize(width, height);
          await waitForContentSize(state, width, height);
          await win.webContents.executeJavaScript(\`(async () => {
            const state = \${JSON.stringify(state)}, fixture = document.getElementById("fixture-root");
            fixture.innerHTML = "";
            window.renderSharedGeometry(state === "viewer" || state.startsWith("workflow:") ? state : null);
            if (state === "grid" || state === "list" || state === "inspector") fixture.innerHTML = document.getElementById(state === "inspector" ? "grid" : state).innerHTML;
            if (state === "inspector") {
              const content = fixture.querySelector(".shared-library-content");
              content.dataset.inspectorOpen = "true";
              content.append(document.getElementById("inspector-panel").content.cloneNode(true));
            }
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            if (state.startsWith("workflow:add:")) {
              document.querySelectorAll(".shared-workflow-steps button")[Number(state.split(":")[2])]?.click();
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }
          })()\`);
          const focusSelectors = state.startsWith("workflow:") ? [
            ".shared-workflow-header > button", ".shared-workflow-footer button",
          ] : ({
            grid: [".shared-artifact-identity", ".shared-library-search input", ".shared-library-view-toggle button", ".shared-library-select"],
            list: [".shared-library-audit-scroll", ".shared-library-audit-row", ".shared-library-audit-row input"],
            inspector: [".shared-inspector-head button", ".shared-inspector-section > summary"],
            viewer: [".shared-viewer-head button", ".image-zoom-controls button", ".shared-viewer-context > button"],
          })[state];
          const documentNode = await win.webContents.debugger.sendCommand("DOM.getDocument");
          for (const selector of focusSelectors) {
            const node = await win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector });
            if (node.nodeId) await win.webContents.debugger.sendCommand("CSS.forcePseudoState", { nodeId: node.nodeId, forcedPseudoClasses: ["focus-visible"] });
          }
          results.push(await win.webContents.executeJavaScript(\`(() => {
            const state = \${JSON.stringify(state)}, requestedWidth = \${JSON.stringify(width)}, requestedHeight = \${JSON.stringify(height)}, fixture = document.getElementById("fixture-root");
            const production = state === "viewer" || state.startsWith("workflow:"), scope = production ? document : fixture;
            const selectors = state.startsWith("workflow:") ? [
              ".shared-workflow-window", ".shared-workflow-header", ".shared-workflow-body", ".shared-workflow-block", ".shared-workflow-fields", ".shared-workflow-choices", ".shared-workflow-suggestions", ".shared-workflow-footer",
            ] : ({
              grid: [".shared-library-screen", ".shared-library-toolbar", ".shared-library-grid"],
              list: [".shared-library-screen", ".shared-library-toolbar", ".shared-library-audit"],
              inspector: [".shared-library-screen", ".shared-library-toolbar", ".shared-library-grid", ".shared-artifact-inspector", ".shared-inspector-scroll", ".shared-inspector-preview", ".shared-inspector-actions"],
              viewer: [".shared-artifact-viewer", ".shared-viewer-head", ".shared-viewer-body", ".shared-viewer-main", ".shared-viewer-stage", ".shared-viewer-transport", ".shared-viewer-context", ".image-viewport", ".image-zoom-controls"],
            })[state];
            const required = state.startsWith("workflow:") ? [".shared-workflow-window", ".shared-workflow-header", ".shared-workflow-body", ".shared-workflow-footer"] : selectors;
            const overflows = required.filter((selector) => !scope.querySelector(selector)).map((selector) => "missing:" + selector);
            for (const selector of selectors) for (const element of scope.querySelectorAll(selector)) {
              if (element.scrollWidth > element.clientWidth + 1) overflows.push(selector + ":" + element.scrollWidth + ">" + element.clientWidth);
            }
            const grid = scope.querySelector(".shared-library-grid");
            const toolbar = scope.querySelector(".shared-library-toolbar");
            const content = scope.querySelector(".shared-library-content");
            const inspector = scope.querySelector(".shared-artifact-inspector");
            const audit = scope.querySelector(".shared-library-audit-scroll");
            const surface = scope.querySelector(state === "viewer" ? ".shared-artifact-viewer" : state.startsWith("workflow:") ? ".shared-workflow-window" : ":not(*)");
            const rect = surface?.getBoundingClientRect();
            const focusSelectors = \${JSON.stringify(focusSelectors)};
            const focus = focusSelectors.map((selector) => {
              const element = scope.querySelector(selector), style = element ? getComputedStyle(element) : null;
              return { selector, width: style ? parseFloat(style.outlineWidth) : 0, style: style?.outlineStyle ?? "missing" };
            });
            const motionSelectors = state.startsWith("workflow:") ? [".shared-workflow-overlay", ".shared-workflow-window"] : ({ grid: [".shared-artifact-frame", ".shared-artifact-identity"], list: [".shared-library-audit-row"], inspector: [".shared-inspector-section > summary > svg"], viewer: [".shared-viewer-head button"] })[state];
            const motion = motionSelectors.map((selector) => { const style = getComputedStyle(scope.querySelector(selector)); return { selector, transition: style.transitionDuration, animation: style.animationName }; });
            const scrollOwners = state === "viewer" ? [scope.querySelector(".shared-viewer-body"), scope.querySelector(".shared-viewer-context")] : state.startsWith("workflow:") ? [scope.querySelector(".shared-workflow-body")] : [];
            const internalVertical = production ? scrollOwners.filter(Boolean).every((element) => element.scrollHeight <= element.clientHeight + 1 || ["auto", "scroll"].includes(getComputedStyle(element).overflowY)) : null;
            return {
              state, width: innerWidth, height: innerHeight, contentSizeSettled: innerWidth === requestedWidth && innerHeight === requestedHeight, overflows,
              columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : null,
              toolbarHeight: toolbar?.getBoundingClientRect().height ?? null,
              inspectorPosition: inspector ? getComputedStyle(inspector).position : null,
              inspectorWidth: inspector?.getBoundingClientRect().width ?? null,
              contentWidth: content?.getBoundingClientRect().width ?? null,
              auditOverflowX: audit ? getComputedStyle(audit).overflowX : null,
              auditScrollable: audit ? audit.scrollWidth > audit.clientWidth : null,
              auditTabIndex: audit?.tabIndex ?? null,
              fitsViewport: rect ? rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 : null,
              portalMounted: surface ? !document.getElementById("react-root").contains(surface) && document.body.contains(surface) : null,
              internalVertical,
              mediaControls: state === "viewer" ? scope.querySelectorAll(".image-zoom-controls button").length : 0,
              autoplayCount: production ? scope.querySelectorAll("audio[autoplay], video[autoplay]").length : 0,
              workflowKind: state.startsWith("workflow:") ? surface?.getAttribute("data-workflow") ?? null : null,
              workflowStep: state.startsWith("workflow:add:") ? scope.querySelector(".shared-workflow-steps button[aria-current=step]")?.textContent.trim() ?? null : null,
              focus, motion,
            };
          })()\`));
        }
        process.stdout.write("RALPHY_SHARED_GEOMETRY=" + JSON.stringify({ font, results }) + "\\n");
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
      child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`Shared Library Electron geometry failed (${code}): ${stderr}`)));
    });
    const line = output.split("\n").find((candidate) => candidate.startsWith("RALPHY_SHARED_GEOMETRY="));
    if (!line) throw new Error(`Shared Library Electron geometry returned no results: ${output}`);
    return JSON.parse(line.slice("RALPHY_SHARED_GEOMETRY=".length)) as SharedGeometrySmoke;
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
  test("gives Marketplace container-responsive detail, sidebar focus, and complete reduced motion rules", () => {
    const containerRules = marketplaceStyles.slice(
      marketplaceStyles.indexOf("@container main-region (max-width: 760px)"),
      marketplaceStyles.indexOf("@media (max-width: 1160px)"),
    );
    const viewportRules = marketplaceStyles.slice(
      marketplaceStyles.indexOf("@media (max-width: 1160px)"),
      marketplaceStyles.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(marketplaceStyles).toMatch(/\.marketplace-screen\s*\{[^}]*container-name:\s*main-region[^}]*container-type:\s*inline-size/s);
    expect(marketplaceStyles).toMatch(/#app-mode-marketplace:focus-visible,[\s\S]*Marketplace categories[\s\S]*outline:\s*2px solid var\(--instrument-focus-on-dark\)/);
    expect(containerRules).toMatch(/\.marketplace-model-detail-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(containerRules).toMatch(/\.marketplace-public-detail-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(containerRules).toMatch(/\.marketplace-model-hero[\s\S]*\.marketplace-model-actions[\s\S]*\.marketplace-model-detail-layout/);
    expect(containerRules).toMatch(/\.marketplace-public-hero[\s\S]*\.marketplace-public-actions[\s\S]*\.marketplace-public-detail-layout/);
    expect(viewportRules).not.toMatch(/\.marketplace-(?:model|public)-(?:hero|actions|detail-layout)/);
    expect(marketplaceStyles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation-duration:\s*0s !important[\s\S]*transition-duration:\s*0s !important/);
  });

  test("documents workbench locks the outer panel and gives both responsive panes exact semantic states", () => {
    expect(workbenchStyles).toMatch(/\.project-domain-body\s*\{[^}]*overflow:\s*hidden/s);
    expect(workbenchStyles).toMatch(/\.documents-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(240px,\s*\.72fr\)\s+minmax\(360px,\s*1\.28fr\)/s);
    // The narrow form is one column, measured against the panel rather than the window: the
    // chat rail takes desk width without the window changing size.
    expect(workbenchStyles).toMatch(/@container project-domain \(max-width: 760px\)\s*\{\s*\.documents-workbench\s*\{[^}]*minmax\(0, 1fr\)/s);
    expect(workbenchStyles).toMatch(/\.documents-master,\s*\.documents-detail\s*\{[^}]*min-width:\s*0[^}]*overflow-y:\s*auto/s);
    expect(workbenchStyles).toMatch(/\.document-row:hover:not\(\.is-selected\)\s*\{[^}]*background:\s*var\(--hover\)/s);
    // Selection is the inverted surface plus its paired ink. Design v2 has no rings, and the
    // ring is what made the selected row look wider than the rows around it.
    expect(workbenchStyles).toMatch(/\.document-row\.is-selected\s*\{[^}]*background:\s*var\(--selected\)[^}]*color:\s*var\(--selected-ink\)/s);
    expect(workbenchStyles).not.toMatch(/\.document-row\.is-selected\s*\{[^}]*box-shadow/s);
    expect(workbenchStyles).not.toMatch(/\.document-row\.is-selected\s*\{[^}]*inset\s+2px\s+0/s);
    // The row is flush with the search pill above it; a 6px inset put them on different edges.
    expect(workbenchStyles).toMatch(/\.document-row\s*\{[^}]*left:\s*0[^}]*width:\s*100%/s);
  });

  test("uses one calm responsive master detail language", () => {
    expect(workbenchStyles).toMatch(/\.documents-workbench\s*\{[^}]*gap:\s*var\(--space-2\)/s);
    expect(workbenchStyles).toMatch(/\.documents-detail[^}]*\{[^}]*border-radius:\s*var\(--radius-lg\)[^}]*background:\s*var\(--raised\)/s);
    expect(workbenchStyles).toMatch(/\.composition-detail[^}]*\{[^}]*border-radius:\s*var\(--radius-lg\)[^}]*background:\s*var\(--raised\)/s);
    expect(workbenchStyles).toMatch(/\.composition-output-preview:has\(\.preview-empty\)\s*\{[^}]*height:\s*160px/s);
    expect(workbenchStyles).not.toMatch(/\.(?:documents-detail|composition-detail)\s*\{[^}]*border:\s*1px/s);
  });

  test("keeps an unselected detail state compact instead of painting an empty slab", () => {
    expect(workbenchStyles).toMatch(/\.(?:documents-detail|composition-detail):has\(> \.empty-section\)[\s\S]*background:\s*transparent/s);
    expect(workbenchStyles).toMatch(/\.(?:documents-detail|composition-detail) > \.empty-section[\s\S]*width:\s*min\(360px,\s*100%\)[\s\S]*background:\s*var\(--raised\)/s);
  });

  test("allows trusted media URLs for image previews", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const sources = (directive: string) => html.match(new RegExp(`${directive} ([^;]+)`))?.[1].split(/\s+/) ?? [];
    expect(html).toMatch(/img-src[^;]*ralphy-media:/);
    expect(html).toMatch(/img-src[^;]*\*\.cdn\.hf\.co/);
    expect(html).toMatch(/img-src[^;]*image-b2\.civitai\.com/);
    expect(sources("img-src")).toEqual(expect.arrayContaining(["https://ralphy.b-cdn.net/blocks/", "https://ralphy.b-cdn.net/units/"]));
    expect(sources("media-src")).toEqual(expect.arrayContaining(["https://ralphy.b-cdn.net/blocks/", "https://ralphy.b-cdn.net/units/"]));
    expect(sources("img-src")).not.toContain("https://ralphy.b-cdn.net");
    expect(sources("media-src")).not.toContain("https://ralphy.b-cdn.net");
    expect(html).not.toMatch(/(?:default-src|script-src|connect-src)[^;]*ralphy\.b-cdn\.net/);
  });

  test("allows guarded media URLs for font previews through the registered Electron protocol", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const main = readFileSync(join(process.cwd(), "electron/main.ts"), "utf8");
    expect(html).toMatch(/font-src[^;]*ralphy-media:/);
    expect(main).toContain('protocol.handle("ralphy-media"');
    expect(main).toContain('url.hostname !== "asset"');
    expect(main).toContain("mediaState.fileAccess.resolve(");
  });

  test("keeps legacy styles on the supplied type scale and supported weights", () => {
    expect(styles).not.toMatch(/font-size:\s*(?:9|10)px/);
    expect(styles).not.toContain("font-weight: 500");
  });

  test("calibrates the Shared Library grid and motion with existing tokens", () => {
    expect(sharedLibraryStyles).toMatch(/\.shared-library-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(252px, 1fr\)\)/s);
    expect(sharedLibraryStyles).toMatch(/\.shared-library-skeleton\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(252px, 1fr\)\)/s);
    // No breakpoint names a column count: the tile minimum is the only number involved.
    expect(sharedLibraryStyles).not.toMatch(/\.shared-library-(?:grid|skeleton)[^}]*repeat\(\d/);
    expect(sharedLibraryStyles).toContain("transition: background var(--dur) var(--ease)");
    expect(sharedLibraryStyles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("gates the Shared Library stylesheet to the loaded design system contract", () => {
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");
    const allowedSizes = new Set([9.5, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 16, 17, 18, 19, 23, 40, 76]);
    const sizes = [...sharedLibraryStyles.matchAll(/(?:font-size:\s*|font:\s*)([\d.]+)px/g)].map((match) => Number(match[1]));
    const weights = [...sharedLibraryStyles.matchAll(/font-weight:\s*(\d+)/g)].map((match) => Number(match[1]));
    const borders = [...sharedLibraryStyles.matchAll(/border(?::|-(?:top|right|bottom|left):)\s*([^;]+)/g)].map((match) => match[1].trim());

    expect(main).toContain('import "./styles/shared-library.css"');
    expect([...new Set(sizes.filter((size) => !allowedSizes.has(size)))]).toEqual([]);
    expect([...new Set(weights)]).toEqual([400]);
    expect(sharedLibraryStyles).not.toContain("text-transform");
    expect(borders.filter((value) => value !== "0")).toEqual([]);
    expect(sharedLibraryStyles).toMatch(/\.shared-library-screen button:focus-visible,[\s\S]*outline:\s*2px solid var\(--accent-soft\)/);
  });

  test("fits actual Shared Library components and every workflow portal in real Electron geometry", async () => {
    const { font, results } = await sharedLibraryGeometry();

    expect(font).toEqual({ locatorMime: "font/sfnt", contentType: "font/ttf", loaded: true });

    const states = ["grid", "list", "inspector", "viewer", "workflow:add:0", "workflow:add:1", "workflow:add:2", "workflow:add:3", "workflow:promote", "workflow:duplicate", "workflow:suggestions", "workflow:archive", "workflow:update-review"];
    expect(results).toHaveLength(39);
    for (const state of states) {
      expect(results.filter((result) => result.state === state).map(({ width, height }) => ({ width, height }))).toEqual([
        { width: 2560, height: 1400 }, { width: 1360, height: 900 }, { width: 1280, height: 800 },
      ]);
    }
    expect(results.every(({ contentSizeSettled }) => contentSizeSettled)).toBe(true);
    expect(results.flatMap(({ state, width, overflows }) => overflows.map((overflow) => ({ state, width, overflow })))).toEqual([]);
    expect(results.filter(({ state }) => state === "grid").map(({ width, columns }) => ({ width, columns }))).toEqual([
      { width: 2560, columns: 7 }, { width: 1360, columns: 2 }, { width: 1280, columns: 2 },
    ]);
    expect(results.find(({ state, width }) => state === "inspector" && width === 2560)?.columns).toBe(5);
    const narrowInspector = results.find(({ state, width }) => state === "inspector" && width === 1280)!;
    expect(narrowInspector.inspectorPosition).toBe("absolute");
    expect(Math.abs((narrowInspector.inspectorWidth ?? 0) - (narrowInspector.contentWidth ?? 0))).toBeLessThan(2);
    expect(results.filter(({ state, width }) => state === "grid" && width <= 1360).every(({ toolbarHeight }) => (toolbarHeight ?? 0) > 36)).toBe(true);
    expect(results.filter(({ state }) => state === "list").map(({ auditOverflowX, auditScrollable, auditTabIndex }) => ({ auditOverflowX, auditScrollable, auditTabIndex }))).toEqual([
      { auditOverflowX: "auto", auditScrollable: false, auditTabIndex: 0 },
      { auditOverflowX: "auto", auditScrollable: true, auditTabIndex: 0 },
      { auditOverflowX: "auto", auditScrollable: true, auditTabIndex: 0 },
    ]);
    const productionPortals = results.filter(({ state }) => state === "viewer" || state.startsWith("workflow:"));
    expect(productionPortals.every(({ fitsViewport, portalMounted, internalVertical }) => fitsViewport && portalMounted && internalVertical)).toBe(true);
    expect(productionPortals.every(({ autoplayCount }) => autoplayCount === 0)).toBe(true);
    expect(results.filter(({ state }) => state === "viewer").every(({ mediaControls }) => mediaControls === 3)).toBe(true);
    expect([...new Set(results.filter(({ state }) => state.startsWith("workflow:")).map(({ workflowKind }) => workflowKind))].sort()).toEqual([
      "add", "archive", "duplicate", "promote", "suggestions", "update-review",
    ]);
    expect(results.filter(({ state, width }) => state.startsWith("workflow:add:") && width === 1280).map(({ workflowStep }) => workflowStep)).toEqual([
      "1Source", "2Duplicates", "3Describe for reuse", "4Confirm",
    ]);
    expect(results.flatMap(({ state, width, focus }) => focus.filter((value) => value.width < 2 || value.style === "none").map((value) => ({ state, width, ...value })))).toEqual([]);
    expect(results.flatMap(({ state, width, motion }) => motion.filter(({ transition, animation }) => transition !== "0s" || animation !== "none").map((value) => ({ state, width, ...value })))).toEqual([]);
  }, 20_000);

  test("names the responsive controls container and preserves round status pills", () => {
    expect(styles).toContain("container-name: project-controls");
    expect(styles).toMatch(/\.project-facts > span,[\s\S]*corner-shape:\s*round/);
    expect(styles).toContain(".workspace-plan-days");
    expect(styles).toMatch(/@container main-region \(max-width: 760px\)[\s\S]*\.workspace-outcome-groups\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  test("uses the approved neutral surfaces and larger smooth radii", () => {
    expect(styles).toMatch(/--canvas:\s*var\(--instrument-legacy-canvas\)/);
    expect(styles).toMatch(/--raised:\s*var\(--instrument-legacy-raised\)/);
    expect(styles).toMatch(/--radius-md:\s*10px/);
    expect(styles).toMatch(/\.main-header\s*\{[^}]*border-bottom:\s*0/s);
    expect(styles).toMatch(/\.asset-modal-surface,[\s\S]*corner-shape:\s*squircle/);
  });

  test("bundles Doto locally at its accessible minimum and removes the legacy purple token", () => {
    const reset = readFileSync(join(process.cwd(), "src/styles/reset.css"), "utf8");
    const palette = readFileSync(join(process.cwd(), "src/instrument/palette.ts"), "utf8");
    expect(tokenStyles).toMatch(/font-family:\s*"Doto"[\s\S]*Doto-Variable\.ttf/);
    expect(`${tokenStyles}\n${reset}\n${palette}`).not.toMatch(/#(?:7F7BD6|8B7CF6)/i);
    expect(tokenStyles).toContain("/* instrument-token-definitions:start */");
    expect(tokenStyles).toContain("/* instrument-token-definitions:end */");
  });

  test("shares the compact profile-menu tokens across reusable controls", () => {
    for (const token of [
      "--field-surface",
      "--field-radius",
      "--menu-surface",
      "--menu-radius",
      "--menu-padding",
      "--menu-item-height",
      "--control-focus",
    ]) expect(tokenStyles).toContain(token);

    // v2: every menu and popover is one flat #141414 widget — no border, no shadow.
    for (const selector of ["select-menu-content", "workspace-picker-popover", "agent-popover", "asset-context-menu"]) {
      expect(workbenchStyles).toMatch(new RegExp(`\\.${selector}\\s*\\{[^}]*border:\\s*0[^}]*background:\\s*var\\(--instrument-widget-dark\\)`, "s"));
    }
    expect(workbenchStyles).toMatch(/\.select-menu-trigger\s*\{[^}]*border:\s*0[^}]*background:\s*var\(--instrument-widget-dark\)/s);
    expect(settingsStyles).toMatch(/\.profile-menu,[\s\S]*\.help-menu\s*\{[^}]*border:\s*0[^}]*background:\s*var\(--instrument-widget-dark\)/s);
    // Settings own their surfaces in the stylesheet rather than in the markup, so the plate
    // and its sunken controls are asserted where they are actually declared.
    expect(settingsStyles).toMatch(/\.settings-plate\s*\{[^}]*background:\s*var\(--instrument-widget-light\)/s);
    expect(settingsStyles).toMatch(/\.settings-toggle\s*\{[^}]*background:\s*var\(--instrument-widget-light-sunken\)/s);
    expect(settingsScreenSource).not.toMatch(/className="[^"]*\b(?:bg|text|rounded)-/);
  });

  test("renders active surfaces with visible focus in Chromium", async () => {
    const results = await chromiumGeometry(await activeScreenMarkup());

    expect(results).toHaveLength(18);
    for (const screen of ["documents", "media", "units", "activity", "memory"] as const) {
      expect(results.filter((result) => result.screen === screen).map(({ width, height }) => ({ width, height })))
        .toEqual([{ width: 2560, height: 1400 }, { width: 1360, height: 900 }, { width: 1100, height: 720 }]);
    }
    expect(results.find(({ screen, width }) => screen === "workspace" && width === 1100)?.overflows).toEqual([]);
    expect(results.map(({ screen, width, overflows }) => ({ screen, width, overflows })))
      .toEqual(results.map(({ screen, width }) => ({ screen, width, overflows: [] })));
    const expectedOwners = {
      documents: [".documents-master", ".documents-detail"],
      media: [".asset-grid-scroll"],
      units: [".units-grid-scroll"],
      activity: [".activity-scroll"],
      memory: [".memory-rulebook"],
    };
    for (const [screen, scrollOwners] of Object.entries(expectedOwners)) {
      expect(results.filter((result) => result.screen === screen).map((result) => result.scrollOwners))
        .toEqual([scrollOwners, scrollOwners, scrollOwners]);
    }
    expect(results.filter(({ screen, width }) => width === 1100 && screen === "documents").map(({ screen, splitVerticalContained }) => ({ screen, splitVerticalContained })))
      .toEqual([{ screen: "documents", splitVerticalContained: true }]);
    expect(results.filter(({ screen, nestedMediaScroll }) => screen === "media" && nestedMediaScroll)).toEqual([]);
    expect(results.filter(({ screen }) => screen === "memory").map(({ memoryRegionPadding, memoryTopbarBorder, memoryFilterBorder, memoryInactiveBackground, memoryOpenBackground, memoryBodyBorder }) => ({ memoryRegionPadding, memoryTopbarBorder, memoryFilterBorder, memoryInactiveBackground, memoryOpenBackground, memoryBodyBorder }))).toEqual([
      { memoryRegionPadding: "0px", memoryTopbarBorder: "0px", memoryFilterBorder: "0px", memoryInactiveBackground: "rgba(0, 0, 0, 0)", memoryOpenBackground: "rgb(29, 29, 29)", memoryBodyBorder: "0px" },
      { memoryRegionPadding: "0px", memoryTopbarBorder: "0px", memoryFilterBorder: "0px", memoryInactiveBackground: "rgba(0, 0, 0, 0)", memoryOpenBackground: "rgb(29, 29, 29)", memoryBodyBorder: "0px" },
      { memoryRegionPadding: "0px", memoryTopbarBorder: "0px", memoryFilterBorder: "0px", memoryInactiveBackground: "rgba(0, 0, 0, 0)", memoryOpenBackground: "rgb(29, 29, 29)", memoryBodyBorder: "0px" },
    ]);
    expect(results.filter(({ screen }) => screen === "media").map(({ width, mediaInsets }) => ({ width, mediaInsets: mediaInsets.length })))
      .toEqual([{ width: 2560, mediaInsets: 1 }, { width: 1360, mediaInsets: 1 }, { width: 1100, mediaInsets: 1 }]);
    expect(results.flatMap(({ screen, width, documentDetailWidth, documentViewerWidths }) => screen !== "documents" || documentDetailWidth === null
      ? []
      : documentViewerWidths.filter((viewerWidth) => viewerWidth > Math.min(960, documentDetailWidth - 48) + 1).map((viewerWidth) => ({ width, documentDetailWidth, viewerWidth })))).toEqual([]);
    expect(results.filter(({ screen }) => screen === "documents").map(({ width, documentViewerWidths }) => ({ width, viewers: documentViewerWidths.length })))
      .toEqual([{ width: 2560, viewers: 2 }, { width: 1360, viewers: 2 }, { width: 1100, viewers: 2 }]);
    expect(results.filter(({ screen }) => screen === "documents").map(({ width, documentViewerMaxWidths }) => ({ width, documentViewerMaxWidths })))
      .toEqual([{ width: 2560, documentViewerMaxWidths: ["960px", "960px"] }, { width: 1360, documentViewerMaxWidths: ["960px", "960px"] }, { width: 1100, documentViewerMaxWidths: ["960px", "960px"] }]);
    // Air at the list edge comes from the master column's own padding, not from offsetting
    // every row, which is what left the selected pill misaligned with the search field.
    expect(results.filter(({ screen }) => screen === "documents").flatMap(({ screen, width, masterRowSearchOffset }) =>
      masterRowSearchOffset === 0 ? [] : [{ screen, width, masterRowSearchOffset }])).toEqual([]);
    expect(results.filter(({ screen }) => screen === "documents").flatMap(({ screen, width, masterRowTopInset }) =>
      masterRowTopInset !== null && masterRowTopInset >= 4 ? [] : [{ screen, width, masterRowTopInset }])).toEqual([]);
    expect(results.filter(({ screen }) => screen === "documents").flatMap(({ screen, width, masterRowHeight }) =>
      masterRowHeight !== null && masterRowHeight <= 54 ? [] : [{ screen, width, masterRowHeight }])).toEqual([]);
    expect(results.filter(({ screen }) => screen === "documents").flatMap(({ screen, width, masterRowGap }) =>
      masterRowGap === null || masterRowGap >= 6 ? [] : [{ screen, width, masterRowGap }])).toEqual([]);
    // The card label sizes the instrument design ships: the stylesheet used to claim 13/12 while
    // the utility layer rendered these, so the floor is stated at what the operator actually sees.
    expect(results.filter(({ screen }) => screen === "media").flatMap(({ width, mediaTitleFontSize, mediaMetaFontSize }) =>
      mediaTitleFontSize !== null && mediaTitleFontSize >= 11.5 && mediaMetaFontSize !== null && mediaMetaFontSize >= 9 ? [] : [{ width, mediaTitleFontSize, mediaMetaFontSize }])).toEqual([]);
    expect(results.filter(({ screen }) => screen === "activity").flatMap(({ width, activityTimeFontSize, activityEntityFontSize }) =>
      activityTimeFontSize !== null && activityTimeFontSize >= 12 && activityEntityFontSize !== null && activityEntityFontSize >= 12 ? [] : [{ width, activityTimeFontSize, activityEntityFontSize }])).toEqual([]);
    expect(results.filter(({ screen }) => screen === "documents").map(({ width, focus }) => ({ width, selectors: focus.map(({ selector }) => selector) })))
      .toEqual([{ width: 2560, selectors: [".project-dock button[aria-selected=true]", ".document-search input", ".document-row", ".document-detail-heading"] }, { width: 1360, selectors: [".project-dock button[aria-selected=true]", ".document-search input", ".document-row", ".document-detail-heading"] }, { width: 1100, selectors: [".project-dock button[aria-selected=true]", ".document-search input", ".document-row", ".document-detail-heading"] }]);
    expect(results.flatMap(({ screen, width, focus }) => focus.filter(({ width: focusWidth }) => focusWidth < 2).map((value) => ({ screen, width, focus: value })))).toEqual([]);
    expect(results.flatMap(({ screen, width, focus }) => focus.filter(({ contrast }) => contrast < 3).map((value) => ({ screen, width, focus: value })))).toEqual([]);
    expect(results.filter(({ forbidden }) => forbidden !== 0)).toEqual([]);
    expect(results.filter(({ screen }) => screen !== "workspace").every(({ projectHeaderCount }) => projectHeaderCount === 0)).toBe(true);
    expect(results.filter(({ screen }) => screen !== "workspace" && screen !== "memory").every(({ projectTabsCenterOffset }) => projectTabsCenterOffset !== null && projectTabsCenterOffset < 1)).toBe(true);
    expect(results.filter(({ screen }) => screen !== "workspace" && screen !== "memory").every(({ projectTabsHeaderOffset }) => projectTabsHeaderOffset !== null && projectTabsHeaderOffset > 100)).toBe(true);
    expect(results.filter(({ screen }) => screen !== "workspace" && screen !== "memory").every(({ projectTabsReceivePointer }) => projectTabsReceivePointer)).toBe(true);
    expect(results.filter(({ screen }) => screen !== "workspace" && screen !== "memory").every(({ projectTabsAppRegion }) => projectTabsAppRegion === "no-drag")).toBe(true);
    expect(results.filter(({ screen }) => screen !== "workspace" && screen !== "memory").every(({ gooeyBlobCoverage }) => gooeyBlobCoverage !== null && gooeyBlobCoverage >= 0.99)).toBe(true);
    expect(results.filter(({ screen }) => screen === "units").every(({ unitCardsInGridFlow }) => unitCardsInGridFlow)).toBe(true);
    expect(workbenchStyles).toMatch(/\.media-card-button:focus-visible\s*\{[^}]*outline:\s*var\(--focus-ring\)/s);
    expect(workbenchStyles).toMatch(/\.asset-context-menu button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fg\)/s);
  }, 20_000);

  test("keeps active surfaces borderless and free of the undefined surface token", () => {
    expect(styles).not.toContain("var(--surface)");
    expect(workbenchStyles).not.toMatch(/\.project-domain-list/);
    expect(styles).not.toContain(".project-preview");
    expect(workbenchStyles).not.toMatch(/\.project-domain-list > button\.is-selected\s*\{[^}]*inset\s+2px\s+0/s);
    expect(workbenchStyles).toMatch(/\.calendar-region\{[^}]*padding:0[^}]*background:var\(--canvas\)/s);
    expect(workbenchStyles).not.toMatch(/\.calendar-shell\{[^}]*border-radius/s);
    expect(workbenchStyles).not.toMatch(/\.calendar-shell\{[^}]*box-shadow/s);
  });

  test("leaves the activity log without a rail, in either whole or per-event form", () => {
    // The list-level rail was pinned to hard 58/24px offsets and a hard-coded column x, so
    // it never met the first or last row; design v2 carries no rules or borders at all.
    expect(workbenchStyles).not.toContain(".activity-virtual-list::before");
    expect(workbenchStyles).not.toContain(".activity-source::before");
    expect(workbenchStyles).not.toContain("--activity-timeline-x");
  });

  test("keeps the activity timeline surface transparent", () => {
    expect(workbenchStyles).toMatch(/\.activity-table\s*\{[^}]*background:\s*transparent/s);
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
    // The reset owns one neutral keyboard ring; pointer focus stays quiet. What this test
    // guards is that no ring is drawn from the removed accent colour.
    expect(reset).toMatch(/:focus\s*\{[^}]*outline:\s*none/s);
    expect(reset).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--focus-ring\)/s);
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
    expect(renderer).not.toContain('aria-label="Toggle bottom panel"');
    expect(app).toContain("if (event.repeat) return");
    // Every global chord resolves through one registry, so a rebinding is live immediately
    // and no handler hardcodes a key.
    expect(app).toContain("resolveCommand(event, readCommandBindings(");
    expect(app).not.toMatch(/command && (?:event\.)?key === "/);
    const commands = readFileSync(join(process.cwd(), "src/screens/settings/commands.ts"), "utf8");
    expect(commands).toContain('chord("b", { meta: true })');
    expect(commands).toContain('chord(",", { meta: true })');
  });

  test("sizes every responsive layout against its container rather than the window", () => {
    // A viewport breakpoint lies about the space a route actually has: the desk is the window
    // minus the sidebar and the chat rail, so `xl:` fired on a 908px column and the overview
    // split into two 430px halves with six-across metric strips inside them.
    expect(renderer).not.toMatch(/\b(?:sm|md|lg|xl|2xl):[a-z[]/);
    expect(renderer).toContain("@min-[860px]/instrument-desk:col-span-6");
    // Strips inside a half-width section derive their track count instead of declaring it.
    expect(styles).toMatch(/\.workspace-efficiency-strip\s*\{[^}]*repeat\(auto-fit/s);
    expect(styles).toMatch(/\.workspace-plan-days\s*\{[^}]*repeat\(auto-fit/s);
    expect(styles).not.toMatch(/@media\(max-width:1050px\)/);
  });

  test("provides searchable workspace navigation and operator-sized shell columns", () => {
    expect(renderer).toContain('aria-label="Search workspaces"');
    expect(renderer).toContain('aria-activedescendant');
    expect(renderer).toContain("closeAndRestoreFocus");
    // Both shell columns are draggable; only the bottom panel is still a fixed foundation.
    expect(renderer).toContain('ariaLabel="Resize sidebar"');
    expect(renderer).toContain('ariaLabel="Resize agent panel"');
    expect(renderer).not.toContain('ariaLabel="Resize bottom panel"');
    // The grabber paints unconditionally: a hover-only affordance never advertises itself.
    expect(styles).toMatch(
      /\.resize-instrument-sidebar::after,\s*\.resize-instrument-rail::after\s*\{[^}]*background:\s*var\(--instrument-resize-grip\)/s,
    );
    // The dock belongs to the desk column, not the window: fixed positioning centred it on
    // the app and drifted off the project whenever a column took width.
    expect(styles).toMatch(/\.project-controls\s*\{[^}]*position:\s*absolute/s);
    expect(renderer).toContain("onLostPointerCapture");
    expect(renderer).toContain("createPortal");
    expect(styles).toMatch(
      /\.workspace-picker-popover\s*\{[^}]*position:\s*fixed/s,
    );
    expect(styles).toMatch(
      /\.workspace-picker-search:focus-within\s*\{[^}]*box-shadow:\s*none/s,
    );
    expect(renderer).toContain("[-webkit-app-region:no-drag]");
    expect(styles).toMatch(/button:not\(:disabled\)[^{]*\{[^}]*cursor:\s*pointer/s);
    expect(styles).toMatch(/\.instrument-shell\s*\{[^}]*--instrument-left-width:\s*240px/s);
    expect(styles).toMatch(/\.instrument-shell\s*\{[^}]*--instrument-right-rail-width:\s*292px/s);
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
    const projectsScreen = readFileSync(
      join(process.cwd(), "src/screens/WorkspaceProjectsScreen.tsx"),
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
    expect(projectsScreen).toContain("projectGlyphVars(project.name)");
    expect(picker).toContain("workspaceDitherVars(selected?.name ?? value)");
    expect(sidebar).toContain("sidebar-nav-row");
    expect(sidebar).not.toContain("sidebar-mascot-peek");
    expect(sidebar).not.toContain('title="Filter projects"');
    expect(profile).not.toContain(".ralphy library");
    expect(styles).toContain("--dither-op: 1");
    // v2: the workspace card is a sidebar widget, flush with the stack above and below it.
    expect(styles).toMatch(
      /\.sidebar-context\s*\{[^}]*height:\s*118px[^}]*border-radius:\s*var\(--radius-panel\)/s,
    );
    expect(styles).toMatch(/\.sidebar-context \.workspace-hero,\s*\.sidebar-context \.workspace-picker\s*\{\s*height:\s*100%/s);
    expect(styles).toMatch(
      /\.workspace-hero\s*\{[^}]*background:\s*var\(--instrument-widget-dark\)/s,
    );
    expect(styles).toMatch(
      /\.project-glyph\s*\{[^}]*background:\s*color-mix\(in oklab, var\(--glyph-color\)/s,
    );
    expect(styles).toMatch(
      /button\.sidebar-nav-row\.is-selected\s*\{[^}]*background:\s*var\(--selected\)/s,
    );
    expect(styles).toMatch(
      /\.workspace-option-field\s*\{[^}]*row-field\.png/s,
    );
    for (let slot = 1; slot <= 8; slot += 1) {
      expect(styles).toContain(`--p${slot}:`);
      expect(styles).toContain(`--p${slot}-hi:`);
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
    expect(app).toContain("bridge.onToggleRightPanel(toggleRightRail)");
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
    // v2 forbids borders: the chat is a flat #141414 widget on the desk.
    expect(styles).toMatch(
      /\.utility-right-panel\s*\{[^}]*border:\s*0[^}]*background:\s*var\(--instrument-widget-dark\)/s,
    );
    expect(styles).toMatch(/\.agent-composer\s*\{[^}]*background:\s*var\(--field-surface\)/s);
    expect(styles).toMatch(
      /\.agent-composer textarea\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/s,
    );
  });

  test("does not package a terminal runtime", () => {
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
    expect(types).not.toContain("createTerminal");
    expect(preload).not.toContain("TERMINAL_CHANNELS");
    expect(main).not.toContain("TerminalManager");
    expect(buildElectron).not.toContain("node-pty");
    expect(packageMac).not.toContain("node-pty");
  });

  test("keeps the terminal out of the renderer UI", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const utilityPanels = readFileSync(
      join(process.cwd(), "src/components/UtilityPanels.tsx"),
      "utf8",
    );
    expect(app).not.toContain("BottomPanel");
    expect(app).not.toContain("onToggleBottom");
    expect(utilityPanels).not.toContain("TerminalWorkspace");
    // Settings own the shell environment as preferences; the emulator itself stays out.
    expect(settingsSurfaceSource).not.toMatch(/TerminalWorkspace|createTerminal|node-pty/);
    expect(app).toContain("loadSettingsScreen");
  });

  test("opens app-level settings from a custom profile popover", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const profileMenu = readFileSync(
      join(process.cwd(), "src/components/ProfileMenu.tsx"),
      "utf8",
    );
    const preferences = readFileSync(
      join(process.cwd(), "src/state/workbench.ts"),
      "utf8",
    );
    const settingsPreferences = readFileSync(
      join(process.cwd(), "src/screens/settings/preferences.ts"),
      "utf8",
    );

    expect(profileMenu).toContain("createPortal");
    expect(profileMenu).toContain('role="menu"');
    expect(profileMenu).toContain("Settings");
    expect(profileMenu).toContain("closeAndRestoreFocus");
    expect(app).toContain('id === "app.settings"');
    expect(app).toContain("<SettingsScreen");
    expect(app).toContain("onBack={() => setSettingsVisible(false)}");
    for (const category of [
      "General",
      "Profile",
      "Appearance",
      "Keyboard shortcuts",
      "Agents",
      "Generation providers",
      "Storage & media",
      "Permissions & privacy",
      "Terminal & environment",
      "Diagnostics",
      "Updates",
      "About",
    ]) {
      expect(settingsSurfaceSource).toContain(`"${category}"`);
    }
    expect(settingsSurfaceSource).toContain("Home Ralphy library");
    expect(settingsSurfaceSource).not.toContain("Change .ralphy library");
    // A credential reaches the OS keychain through secure IPC and never a preference store.
    expect(settingsSurfaceSource).toContain("setAgentApiKey");
    expect(preferences).not.toMatch(/apiKey|providerKey|elevenlabs|openrouter/i);
    expect(settingsPreferences).not.toMatch(/apiKey|providerKey|secret|token/i);
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
    expect(mascot).toContain('mask id="eyes"');
    expect(sidebar).not.toContain("<RalphyMascot");
    expect(settings).toContain("<RalphyMascot");
    expect(welcome).toContain("<RalphyMascot");
  });

  test("keeps library switching in the profile and the terminal out of the top chrome", () => {
    const shell = readFileSync(
      join(process.cwd(), "src/instrument/InstrumentShell.tsx"),
      "utf8",
    );
    expect(shell).not.toContain('aria-label="Toggle bottom panel"');
    const main = readFileSync(join(process.cwd(), "electron/main.ts"), "utf8");
    expect(main).toContain("trafficLightPosition");
    expect(main).toContain("setWindowOpenHandler");
    expect(main).toContain('target.protocol === "http:"');
    expect(main).toContain('target.protocol === "https:"');
    expect(main).toContain('return { action: "deny" }');
  });
});
