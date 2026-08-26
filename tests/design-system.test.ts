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
import { ICON_BUTTON, ICON_BUTTON_QUIET } from "../src/components/ui/IconButton";
import { WINDOW_CLOSE } from "../src/components/ui/Window";
import { builtStylesheetLink, readStylesheet } from "./style-sources";
import { WorkspaceScreenView, createWorkspaceScreenController } from "../src/screens/WorkspaceScreen";

// `workbench.css` and its eight `workbench/*-unowned.css` chunks are gone: the holding files were
// resolved rule by rule into the markup of the components that render each element, and what a
// utility cannot express is now two named sheets -- `frame.css` (the `.workbench` grid) and
// `resize-grabber.css` (the handle's pseudo-element).
const styles = ["reset.css", "tokens.css", "frame.css", "resize-grabber.css", "shared-library.css", "instrument.css"]
  .map((file) => readStylesheet(file))
  .join("\n");
const workbenchStyles = ["frame.css", "resize-grabber.css"].map((file) => readStylesheet(file)).join("\n");
const virtualAssetGridSource = readFileSync(join(process.cwd(), "src/components/VirtualAssetGrid.tsx"), "utf8");
const workspaceMediaTheme = readFileSync(join(process.cwd(), "src/styles/theme/workspace-media.css"), "utf8");
const workspaceMediaSource = ["src/screens/WorkspaceProjectsScreen.tsx", "src/components/ProjectHeader.tsx", "src/components/ui/GooeyTabs.tsx", "src/screens/project/MediaViewer.tsx", "src/screens/project/MediaPanel.tsx", "src/components/media/AudioWaveform.tsx", "src/components/media/VideoPlayer.tsx", "src/components/media/ImageViewport.tsx", "src/components/media/tone.ts"]
  .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
  .join("\n");
const mediaPanelSource = readFileSync(join(process.cwd(), "src/screens/project/MediaPanel.tsx"), "utf8");
const documentsActivityTheme = readFileSync(join(process.cwd(), "src/styles/theme/documents-activity.css"), "utf8");
const markdownViewSource = readFileSync(join(process.cwd(), "src/components/MarkdownView.tsx"), "utf8");
const documentsActivitySource = ["src/screens/project/ActivityTimeline.tsx", "src/screens/project/ActivityInspector.tsx", "src/components/MarkdownView.tsx", "src/components/WelcomeScreen.tsx", "src/components/VirtualAssetGrid.tsx"]
  .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
  .join("\n");
const tokenStyles = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
const settingsScreenSource = readFileSync(join(process.cwd(), "src/screens/SettingsScreen.tsx"), "utf8");
const settingsRows = readFileSync(join(process.cwd(), "src/screens/settings/rows.tsx"), "utf8");
const settingsSurfaceSource = [
  "src/screens/SettingsScreen.tsx",
  ...readdirSync(join(process.cwd(), "src/screens/settings")).map((file) => `src/screens/settings/${file}`),
].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
const sharedLibraryStyles = readStylesheet("shared-library.css");
const sharedLibraryTheme = readFileSync(join(process.cwd(), "src/styles/theme/shared-library.css"), "utf8");
const sharedLibrarySurfaceSource = [
  "src/screens/SharedLibraryScreen.tsx",
  ...readdirSync(join(process.cwd(), "src/screens/shared-library")).map((file) => `src/screens/shared-library/${file}`),
].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
const marketplaceStyles = readStylesheet("marketplace.css");
const marketplaceTheme = readFileSync(join(process.cwd(), "src/styles/theme/marketplace.css"), "utf8");
const marketplaceSurfaceSource = [
  "src/screens/MarketplaceScreen.tsx",
  ...readdirSync(join(process.cwd(), "src/screens/marketplace")).map((file) => `src/screens/marketplace/${file}`),
].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
const chromeTheme = readFileSync(join(process.cwd(), "src/styles/theme/chrome.css"), "utf8");
const titlebarSource = readFileSync(join(process.cwd(), "src/components/Titlebar.tsx"), "utf8");
const shellTheme = readFileSync(join(process.cwd(), "src/styles/theme/shell.css"), "utf8");
const shellStyles = readStylesheet("instrument.css");
const shellSource = [
  "src/instrument/InstrumentShell.tsx",
  "src/instrument/primitives.tsx",
  "src/instrument/InstrumentProfileControl.tsx",
  "src/instrument/DynamicIsland.tsx",
  "src/instrument/overlay-registry.tsx",
].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
const selectMenuSource = readFileSync(join(process.cwd(), "src/components/ui/SelectMenu.tsx"), "utf8");
const agentRailSource = readFileSync(join(process.cwd(), "src/components/UtilityPanels.tsx"), "utf8");
const agentRailTheme = readFileSync(join(process.cwd(), "src/styles/theme/agent-rail.css"), "utf8");
const pickerSource = readFileSync(join(process.cwd(), "src/components/WorkspacePicker.tsx"), "utf8");
const contextSidebarSource = readFileSync(join(process.cwd(), "src/components/ContextSidebar.tsx"), "utf8");
const librarySource = readFileSync(join(process.cwd(), "src/screens/LibraryScreen.tsx"), "utf8");
const workspaceOverviewTheme = readFileSync(join(process.cwd(), "src/styles/theme/workspace-overview.css"), "utf8");
const calendarMemoryTheme = readFileSync(join(process.cwd(), "src/styles/theme/calendar-memory.css"), "utf8");
const calendarMemorySurfaceSource = ["src/screens/CalendarScreen.tsx", "src/screens/MemoryScreen.tsx", "src/screens/calendar-memory-chrome.ts"]
  .map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
const projectTheme = readFileSync(join(process.cwd(), "src/styles/theme/project.css"), "utf8");
const projectSurfaceSource = [
  "src/screens/ProjectScreen.tsx",
  ...readdirSync(join(process.cwd(), "src/screens/project")).map((file) => `src/screens/project/${file}`),
  "src/components/VirtualAssetGrid.tsx",
  "src/components/ui/SnappySlider.tsx",
  "src/components/ui/IPhoneMockup.tsx",
  ...readdirSync(join(process.cwd(), "src/components/media")).map((file) => `src/components/media/${file}`),
].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
const documentsPanelSource = readFileSync(join(process.cwd(), "src/screens/project/DocumentsPanel.tsx"), "utf8");
const projectScreenSource = readFileSync(join(process.cwd(), "src/screens/ProjectScreen.tsx"), "utf8");
const calendarScreenSource = readFileSync(join(process.cwd(), "src/screens/CalendarScreen.tsx"), "utf8");
const workspaceOverviewSurfaceSource = [
  "src/screens/WorkspaceScreen.tsx",
  ...readdirSync(join(process.cwd(), "src/screens/workspace")).map((file) => `src/screens/workspace/${file}`),
].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");

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
  // Memory has no stylesheet of its own any more, so the fragment carries the class strings the
  // route really renders. Without them these probes would measure element defaults, not the screen.
  const memory = `<main class="main-region memory-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 type-base text-ink">
    <div class="memory-topbar flex h-11.5 items-center justify-between gap-3 px-5 pt-3 type-xs uppercase tracking-mono text-on-instrument-muted"></div>
    <div class="memory-filters m-0 flex w-full max-w-none flex-wrap items-center gap-2 rounded-panel bg-surface p-2"></div>
    <section class="memory-rulebook m-0 flex min-h-0 w-full max-w-none flex-1 flex-col gap-8.5 overflow-visible bg-transparent p-0"><div class="memory-group min-w-0"><header><i></i></header><div class="grid gap-0.75">
      <article class="memory-rule my-1 overflow-hidden rounded-cell bg-surface-sunken"><button class="memory-rule-head flex min-h-14 w-full items-center gap-2 bg-transparent px-3 py-2 text-left type-base text-ink focus-visible:-outline-offset-2">Memory</button></article>
      <article class="memory-rule my-1 overflow-hidden rounded-cell bg-surface-sunken is-open"><button class="memory-rule-head flex min-h-14 w-full items-center gap-2 bg-transparent px-3 py-2 text-left type-base text-ink focus-visible:-outline-offset-2">Open memory</button><div class="memory-rule-body grid gap-4.75 bg-surface px-4 pb-4 pt-3 type-base leading-5 text-ink">Body</div></article>
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
  memoryRulePlate: string | null;
  memoryOpenBody: string | null;
  memoryBodyBorder: string | null;
};

async function chromiumGeometry(markup: { workspace: string } & ProjectMarkup): Promise<GeometryResult[]> {
  const directory = mkdtempSync(join(tmpdir(), "ralphy-geometry-"));
  const resultPath = join(directory, "harness-result.json");
  try {
    const links = builtStylesheetLink();
    const shell = (screen: string) => `<div class="workbench has-right-panel" style="--sidebar-w:288px;--inspector-w:336px"><aside class="context-sidebar"></aside><section class="main-shell"><header class="main-header"></header><div class="main-content-stage">${screen}</div></section><aside class="utility-right-panel"></aside></div>`;
    const templates = Object.entries(markup).map(([name, value]) => `<template id="${name}">${shell(value)}</template>`).join("");
        // The workspace overview has no stylesheet of its own any more, so the harness links only
    // the shipped bundle: authored CSS and the utility layer in their real cascade.
    writeFileSync(join(directory, "layout.html"), `<!doctype html><html><head>${links}</head><body><div id="root"></div>${templates}</body></html>`);
    writeFileSync(join(directory, "package.json"), JSON.stringify({ main: "main.cjs" }));
    writeFileSync(join(directory, "main.cjs"), `
      const RESULT_PATH = ${JSON.stringify(resultPath)};
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
              const ownerCandidates = ({ documents: [".project-domain-body", ".documents-master", ".documents-detail"], media: [".project-domain-body", ".asset-grid-scroll"], units: [".project-domain-body", ".units-grid-scroll"], activity: [".project-domain-body", ".activity-scroll"], memory: [".memory-region", ".memory-rulebook"], workspace: [".workspace-domain-body"] })[screen];
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
                memoryRulePlate: style(".memory-rule:not(.is-open)")?.backgroundColor ?? null,
                memoryOpenBody: style(".memory-rule.is-open > .memory-rule-body")?.backgroundColor ?? null,
                memoryBodyBorder: style(".memory-rule-body")?.borderTopWidth ?? null };
            })()\`));
        }
        require("node:fs").writeFileSync(RESULT_PATH, JSON.stringify(results));
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
    // Results travel through a file: a large JSON line on a pipe is truncated when several
    // Electron children run at once, which made this harness flake only in the full suite.
    if (!existsSync(resultPath)) throw new Error(`Electron geometry smoke returned no results: ${output}`);
    return JSON.parse(readFileSync(resultPath, "utf8")) as GeometryResult[];
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
  const resultPath = join(directory, "harness-result.json");
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
    const links = builtStylesheetLink();
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
      const RESULT_PATH = ${JSON.stringify(resultPath)};
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
            // A field wrapped in a container shows the ring on the container (see reset.css), so
            // the search field is probed where the ring actually lands.
            grid: [".shared-artifact-identity", ".shared-library-search", ".shared-library-view-toggle button", ".shared-library-select"],
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
        require("node:fs").writeFileSync(RESULT_PATH, JSON.stringify({ font, results }));
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
    // Results travel through a file: a large JSON line on a pipe is truncated when several
    // Electron children run at once, which made this harness flake only in the full suite.
    if (!existsSync(resultPath)) throw new Error(`Shared Library Electron geometry returned no results: ${output}`);
    return JSON.parse(readFileSync(resultPath, "utf8")) as SharedGeometrySmoke;
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
    // The route declares its own content-row container in the markup that owns the screen. The
    // stylesheet no longer names it, and no longer holds a breakpoint of any kind.
    expect(marketplaceSurfaceSource).toContain("@container/main-region");
    expect(marketplaceStyles).not.toContain("@container");
    expect(marketplaceStyles).not.toContain("@media (max-width");
    expect(marketplaceStyles).not.toContain("@media (max-height");
    // Every breakpoint on the route is a role key read against that container. An element cannot
    // query the container it declares, which is why the header's own columns had to stop reading
    // `@container/header` -- that form never matched and the header never collapsed.
    expect(marketplaceTheme).toMatch(/--container-marketplace-split:\s*760px/);
    expect(marketplaceSurfaceSource).not.toMatch(/@(?:min|max)-\[/);
    expect(marketplaceSurfaceSource).not.toContain("@container/header");
    expect(marketplaceSurfaceSource).toMatch(/marketplace-header[^"]*grid-cols-\(--marketplace-header-columns\)[^"]*@max-marketplace-split\/main-region:grid-cols-1/);
    // Both detail layouts collapse to one column against the content row, and the hero and its
    // action cluster collapse with them. The two-column form is one role key, shared.
    expect(marketplaceTheme).toMatch(/--marketplace-detail-columns:\s*minmax\(0, 1fr\) minmax\(250px, 320px\)/);
    expect(marketplaceSurfaceSource).toMatch(/DETAIL_LAYOUT = "[^"]*grid-cols-\(--marketplace-detail-columns\)[^"]*@max-marketplace-split\/main-region:grid-cols-1/);
    expect(marketplaceSurfaceSource).toMatch(/DETAIL_HERO = "[^"]*@max-marketplace-split\/main-region:grid-cols-1/);
    expect(marketplaceSurfaceSource).toMatch(/DETAIL_ACTIONS = "[^"]*@max-marketplace-split\/main-region:col-start-1/);
    expect(marketplaceSurfaceSource.match(/marketplace-(?:model|public)-detail-layout \$\{DETAIL_LAYOUT\}/g)).toHaveLength(3);
    // The chrome ring stays a stylesheet rule: the mode switch and the navigation rows stand on
    // the black sidebar widget and belong to ContextSidebar, not to this area.
    expect(marketplaceStyles).toMatch(/#app-mode-marketplace:focus-visible,[\s\S]*Marketplace categories[\s\S]*outline:\s*2px solid var\(--instrument-focus-on-dark\)/);
    // The desk-wide ring inside the route is gone: reset.css paints the one 2px ring, and a
    // control standing on a black widget names the on-instrument ring explicitly.
    expect(marketplaceStyles).not.toContain(".marketplace-screen button:focus-visible");
    expect(readStylesheet("reset.css")).toMatch(/:focus-visible\s*\{\s*outline:\s*var\(--focus-ring\)/);
    expect(marketplaceSurfaceSource).toContain("focus-visible:outline-focus-on-instrument");
    // The stylesheet keeps the blanket reduced-motion rule for the borrowed children mounted
    // here, and the one animation declared in the markup carries its own contract.
    expect(marketplaceStyles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation-duration:\s*0s !important[\s\S]*transition-duration:\s*0s !important/);
    expect(marketplaceSurfaceSource).toContain("animate-pulse rounded-panel bg-surface motion-reduce:animate-none");
    // Nothing about type, radius or surface is declared in the stylesheet any more.
    expect([...marketplaceStyles.matchAll(/(?:font-size:\s*|font:\s*)([\d.]+)px/g)]).toEqual([]);
    expect(marketplaceStyles).not.toContain("border-radius");
    expect(marketplaceStyles).not.toContain("font-weight");
  });

  test("documents workbench locks the outer panel and gives both responsive panes exact semantic states", () => {
    // The panel is the locked outer frame and it declares the container every collapse reads.
    expect(projectScreenSource).toMatch(/project-domain-body @container\/project-domain[^`]*overflow-hidden/);
    expect(projectTheme).toMatch(/--project-documents-columns:\s*minmax\(240px, \.72fr\) minmax\(360px, 1\.28fr\)/);
    // The narrow form is one column, measured against the panel rather than the window: the
    // chat rail takes desk width without the window changing size.
    expect(projectTheme).toMatch(/--container-project-split:\s*760px/);
    expect(documentsPanelSource).toMatch(/documents-workbench[^"]*grid-cols-\(--project-documents-columns\)[^"]*@max-project-split\/project-domain:grid-cols-1/);
    // Both panes are scroll owners, and both may shrink below their content.
    expect(documentsPanelSource).toMatch(/documents-master[^"]*min-w-0 overflow-auto/);
    expect(documentsPanelSource).toMatch(/documents-detail[^`]*min-w-0 overflow-auto/);
    // Selection is the inverted surface plus its paired ink, stated together at the one call
    // site. The stylesheet used to name `--selected`/`--selected-ink`, which the utilities on
    // the same element already beat -- the row has drawn the black widget pair for a while.
    expect(documentsPanelSource).toMatch(/is-selected bg-instrument text-on-instrument/);
    expect(documentsPanelSource).toMatch(/bg-transparent text-ink hover:bg-surface/);
    expect(documentsPanelSource).not.toMatch(/document-row[^`]*shadow/);
    // The row is flush with the search pill above it; a 6px inset put them on different edges.
    expect(documentsPanelSource).toMatch(/document-row absolute top-0 left-0 grid w-full/);
  });

  test("uses one calm responsive master detail language", () => {
    // One gap, one cell radius and one sunken surface on the split's panes.
    expect(documentsPanelSource).toMatch(/documents-workbench[^"]*gap-2/);
    expect(documentsPanelSource).toMatch(/documents-detail[^`]*rounded-cell bg-surface-sunken/);
    expect(documentsPanelSource).not.toMatch(/documents-detail[^"`]*\bborder-/);
  });

  test("keeps an unselected detail state compact instead of painting an empty slab", () => {
    // The detail drops its own surface when all it holds is the empty state, and the state is a
    // bounded plate rather than a full-width slab.
    expect(documentsPanelSource).toMatch(/has-\[>\.empty-section\]:grid has-\[>\.empty-section\]:place-items-center has-\[>\.empty-section\]:bg-transparent/);
    // The plate's own three decisions now sit on the element next to the shared empty-state
    // vocabulary (`route-chrome.ts`), so they are asserted as members of one class list rather
    // than as one contiguous string.
    const emptyPlate = /className=\{`empty-section ([^`]*)`\}/.exec(documentsPanelSource)?.[1] ?? "";
    for (const utility of ["w-project-plate", "rounded-cell", "bg-surface-sunken"]) expect(emptyPlate.split(" ")).toContain(utility);
    expect(projectTheme).toMatch(/--spacing-project-plate:\s*min\(360px, 100%\)/);
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
    // The tile grid is one role key both the grid and its skeleton reach for by name.
    expect(sharedLibraryTheme).toMatch(/--shared-library-tiles:\s*repeat\(auto-fill, minmax\(252px, 1fr\)\)/);
    expect(sharedLibrarySurfaceSource.match(/grid-cols-\(--shared-library-tiles\)/g)).toHaveLength(3);
    // No breakpoint names a column count: the tile minimum is the only number involved.
    expect(sharedLibraryTheme).not.toMatch(/--shared-library-tiles:[^;]*repeat\(\d/);
    // Motion is declared where it renders, and every declaration carries its reduced-motion
    // contract with it; the stylesheet keeps the blanket rule for borrowed children.
    expect(sharedLibrarySurfaceSource).toContain("transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0");
    expect(sharedLibraryStyles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("gates the Shared Library stylesheet to the loaded design system contract", () => {
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");
    const sizes = [...sharedLibraryStyles.matchAll(/(?:font-size:\s*|font:\s*)([\d.]+)px/g)].map((match) => Number(match[1]));
    const weights = [...sharedLibraryStyles.matchAll(/font-weight:\s*(\d+)/g)].map((match) => Number(match[1]));
    const borders = [...sharedLibraryStyles.matchAll(/border(?::|-(?:top|right|bottom|left):)\s*([^;]+)/g)].map((match) => match[1].trim());

    expect(main).toContain('import "./styles/shared-library.css"');
    // The stylesheet declares no type at all any more, so these scans guard it against growing
    // one back; the same contract is asserted below where the type is now declared.
    expect(sizes).toEqual([]);
    expect(weights).toEqual([]);
    expect(sharedLibraryStyles).not.toContain("text-transform");
    expect(borders.filter((value) => value !== "0")).toEqual([]);
    // Every size in the markup names a step. The two font-specimen steps are role keys of their
    // own because there the size is the content being previewed, not UI type.
    expect(sharedLibrarySurfaceSource).not.toMatch(/\btext-\[/);
    expect(sharedLibraryTheme).toMatch(/--type-specimen: 40px/);
    expect(sharedLibraryTheme).toMatch(/--type-specimen-display: 76px/);
    expect([...new Set(sharedLibrarySurfaceSource.match(/\bfont-(?:thin|light|normal|medium|semibold|bold|extrabold|black)\b/g))].sort())
      .toEqual(["font-normal", "font-semibold"]);
    // The desk-wide button ring is gone from the stylesheet: reset.css paints the one 2px ring on
    // every :focus-visible, and a control standing on a black widget names the on-instrument ring
    // explicitly because the theme ink would be black on black in light. The Electron geometry
    // harness below measures the rendered ring on every probed control in every state.
    expect(sharedLibraryStyles).not.toContain(":focus-visible");
    expect(readStylesheet("reset.css")).toMatch(/:focus-visible\s*\{\s*outline:\s*var\(--focus-ring\)/);
    expect(sharedLibrarySurfaceSource).toContain("focus-visible:outline-focus-on-instrument");
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
    // The dock's float host is `instrument.css`'s `.project-controls`, and that rule states
    // `container-type: normal` -- so the `container-name` the holding sheet carried could never
    // establish a container and no query ever named it. The name is gone; what the test guards
    // now is that the host still states `container-type` deliberately.
    expect(styles).not.toContain("container-name: project-controls");
    expect(styles).toMatch(/\.project-controls\s*\{[^}]*container-type:\s*normal/s);
    expect(styles).toMatch(/\.project-facts > span,[\s\S]*corner-shape:\s*round/);
    // The workspace overview's bands now live on the elements that draw them: the day strip
    // reads its role key, and the outcome groups reach one column by deriving the count rather
    // than by the authored 760px query, which the utility on the grid always beat anyway.
    expect(workspaceOverviewSurfaceSource).toContain("grid-cols-(--workspace-day-columns)");
    expect(workspaceOverviewTheme).toMatch(/--workspace-outcome-columns:\s*repeat\(auto-fit/);
  });

  test("keeps the glyph button's ring, transition and disabled state in one place", () => {
    // The base is behaviour only. Size, radius and colour belong to the call site, and a base that
    // named any of them would be overridden by a caller writing the same property -- which
    // resolves by stylesheet order, not markup order, so the loser is not the one you can see.
    for (const property of ["size-", "rounded-", "bg-", "text-muted", "text-ink"]) {
      expect(ICON_BUTTON).not.toContain(property);
    }
    expect(ICON_BUTTON).toContain("focus-visible:outline-ink");
    expect(ICON_BUTTON).toContain("motion-reduce:transition-none");
    expect(ICON_BUTTON_QUIET).toContain(ICON_BUTTON);
    // Four of the converted controls had no focus ring at all: play, mute, copy caption and the
    // safe-area toggle were unreachable by keyboard in any visible sense. So no glyph button in
    // these files may write the ring by hand again -- the exception is the lens pair, whose ring
    // is the inverted one its filled pill needs, and which says so on the element.
    for (const file of [
      "src/screens/CalendarScreen.tsx",
      "src/screens/MemoryScreen.tsx",
      "src/screens/project/UnitViewer.tsx",
      "src/instrument/InstrumentShell.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain("IconButton");
      const rings = source.match(/focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/g) ?? [];
      expect(rings.length).toBeLessThanOrEqual(file.endsWith("InstrumentShell.tsx") ? 1 : 0);
    }
  });

  test("keeps the workspace overview's every rule on the element it styles", () => {
    // The area has no stylesheet at all: `workspace-overview.css` and its three parts are gone,
    // so nothing can claim a value the screen does not draw.
    expect(existsSync(join(process.cwd(), "src/styles/workspace-overview.css"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/styles/workspace-overview"))).toBe(false);
    expect(readFileSync(join(process.cwd(), "src/main.tsx"), "utf8")).not.toContain("workspace-overview.css");
    // The route declares its own content row, and every collapse reads a container, never the
    // window. `instrument-desk` belongs to the shell, so the route consumes it without
    // redeclaring it.
    expect(workspaceOverviewSurfaceSource).toContain("@container/main-region");
    expect(workspaceOverviewSurfaceSource).not.toContain("@container/instrument-desk");
    expect(workspaceOverviewSurfaceSource).not.toMatch(/@(?:min|max)-\[/);
    for (const key of ["section: 860px", "row: 760px", "portfolio: 900px", "portfolio-narrow: 520px"]) {
      expect(workspaceOverviewTheme).toContain(`--container-workspace-${key}`);
    }
    // One chrome for the three overview details, and it states the theme's own surface and ink: it
    // is portalled outside the work-mode scope, where the legacy ink is the on-dark family and
    // turns invisible on a light widget. Its controls take the theme-ink ring for the same reason;
    // only a control on the black header takes the on-instrument ring.
    const dialog = readFileSync(join(process.cwd(), "src/screens/workspace/DetailDialog.tsx"), "utf8");
    // The whole shape is the kit's `Modal` now: scrim, window, titlebar, close. What this file
    // still says for itself is which detail it is and how wide -- and the theme ink and the close
    // control's own ring live in the kit, once, for the reason above.
    expect(dialog).toContain('from "../../components/ui/Modal"');
    expect(dialog).toMatch(/<Modal\b/);
    const modalKit = readFileSync(join(process.cwd(), "src/components/ui/Modal.tsx"), "utf8");
    expect(modalKit).toMatch(/MODAL_SURFACE = `[^`]*\btext-ink\b[^`]*\$\{WINDOW\}`/);
    expect(modalKit).toContain("<WindowClose");
    // The close control's ring is asserted on the composed value rather than on the source text:
    // the geometry now comes from the glyph-button base, so the string is built rather than typed.
    expect(WINDOW_CLOSE).toContain("focus-visible:outline-ink");
    expect(dialog).not.toContain("focus-on-instrument");
    // Handoff 13 gives the greeting row no surface at all: the black plate it used to stand on
    // read as a fifth surface between the desk and the panels below it. With no widget under it
    // the row takes the theme pair throughout, and its primary control is the desk's inversion.
    const header = readFileSync(join(process.cwd(), "src/screens/workspace/WorkspaceOverviewHeader.tsx"), "utf8");
    expect(header).not.toContain("bg-instrument");
    expect(header).not.toContain("focus-on-instrument");
    // The one action in this header is the route's primary, so it takes the brand accent and the
    // ink that reads on it -- including the focus ring, which is drawn inside the fill.
    expect(header).toContain("bg-brand");
    expect(header).toContain("text-brand-ink");
    expect(header).toContain("focus-visible:outline-brand-ink");
    // The deleted reduced-motion blanket had nothing to hold back: this area declares no
    // transition and no animation of its own, and an !important rule in an unlayered sheet
    // cannot beat an !important utility inside @layer utilities anyway.
    expect(workspaceOverviewSurfaceSource).not.toMatch(/\btransition-|\banimate-/);
  });

  test("uses the approved neutral surfaces and larger smooth radii", () => {
    expect(styles).toMatch(/--canvas:\s*var\(--instrument-legacy-canvas\)/);
    expect(styles).toMatch(/--raised:\s*var\(--instrument-legacy-raised\)/);
    expect(styles).toMatch(/--radius-md:\s*10px/);
    // The header states its surface in its own markup now, and design v2 has no borders to
    // cancel, so there is no zero-border declaration left to assert.
    expect(titlebarSource).toMatch(/main-header \$\{CHROME_BAND\}[^`]*\bbg-desk\b[^`]*\btext-ink\b/);
    expect(titlebarSource).not.toMatch(/\bborder(?:-[a-z]+)?-\d/);
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

    // v2: every menu and popover is one flat #141414 widget — no border, no shadow. Both plates
    // state it in their own markup now: the sheet's `border: 0` was a restatement of the reset's
    // and the surface is the named role, so the pair travels with the element that draws it.
    for (const [source, marker] of [[selectMenuSource, "select-menu-content"], [pickerSource, "workspace-picker-popover"]] as const) {
      const plate = new RegExp(`"${marker}([^"]*)"`).exec(source)?.[1] ?? "";
      expect(plate.split(" ")).toContain("bg-instrument");
      expect(plate.split(" ")).toContain("text-on-instrument");
      expect(plate).not.toMatch(/\b(?:border-\d|shadow-)/);
    }
    // The asset context menu states the same decision in its own markup now, and states it as a
    // pair: the sheet painted the plate #141414 but left the rows on `--control-text`, which
    // resolves to the light-widget family inside `.app-mode-work` and read 2.08:1.
    const assetMenu = /const MENU = "([^"]*)"/.exec(mediaPanelSource)?.[1] ?? "";
    expect(assetMenu.split(" ")).toContain("bg-instrument");
    expect(assetMenu).not.toMatch(/\b(?:border-\d|shadow-)/);
    const assetMenuRow = /const MENU_ROW = "([^"]*)"/.exec(mediaPanelSource)?.[1] ?? "";
    expect(assetMenuRow.split(" ")).toContain("text-on-instrument-muted");
    expect(assetMenuRow).toContain("hover:bg-instrument-hover");
    expect(assetMenuRow).toContain("hover:text-on-instrument");
    // The chat's popover states the same decision in markup, where the plate also has to carry
    // the ink its rows inherit: the sheet declared none, so a row's rest ink came from whichever
    // ancestor happened to set a colour. Handoff 17 moved the chat onto a card, so this one is the
    // theme pair rather than the on-dark one.
    const popover = /const POPOVER = "([^"]*)"/.exec(agentRailSource)?.[1] ?? "";
    expect(popover.split(" ")).toContain("bg-card");
    expect(popover.split(" ")).toContain("text-secondary");
    expect(popover).not.toMatch(/\b(?:border-\d|shadow-)/);
    // The trigger's skin lives in SelectMenu now: one black pill, no border, and a caller that
    // paints its own surface declines it outright rather than half-overriding it.
    const trigger = /const TRIGGER_INSTRUMENT = "([^"]*)"/.exec(selectMenuSource)?.[1] ?? "";
    expect(trigger.split(" ")).toContain("bg-instrument");
    expect(trigger.split(" ")).toContain("text-on-instrument-muted");
    expect(selectMenuSource).not.toMatch(/\bborder-\d/);
    expect(selectMenuSource).toContain('tone === "instrument"');
    // Settings own their surfaces in the markup now, so both decisions are asserted where they
    // are actually declared: the plate is the light widget and the toggle track is the sunken
    // surface. The flat-dark-widget menu decision is asserted above, once per menu that actually
    // takes it -- the asset context menu, the agent rail's popover and the instrument select
    // trigger. The profile menu is deliberately not one of them: it portals to `document.body`,
    // outside `.app-mode-work`, and stands on the theme surface instead, which is why its own
    // surface pair is pinned in `instrument-profile.test.tsx` rather than here.
    // Handoff 13 moved settings onto the same four-level stack as the rest of the app, so the
    // plate is panel chrome and a row is a card standing on it -- `bg-surface` was the flat
    // #141414 widget the plate used to be, which sat almost on the panel step and gave the rows
    // under it nothing to stand against. A control inside a card takes the field, which is what
    // the toggle's off track now names.
    const plate = /export const PLATE = "([^"]*)"/.exec(settingsRows)?.[1] ?? "";
    expect(plate.split(" ")).toContain("bg-panel");
    expect(/export const ROW_SHELL = "([^"]*)"/.exec(settingsRows)?.[1]?.split(" ")).toContain("bg-card");
    expect(settingsRows).toContain("justify-start bg-field");
    // `settings.css` is gone. Its one rule suppressed the landing ring on the settings surface,
    // and the `!important` dialog rule it was written to beat no longer exists -- measured in the
    // running renderer, what draws that ring today is `reset.css`'s `:focus-visible` (the overlay
    // focuses its own surface on open, and that matches `:focus-visible`). A utility on the
    // surface beats an unlayered author rule outright, so the suppression is stated where the
    // surface is stated. With it off, the surface measures `outline: 2px solid #F2F2F0`.
    expect(existsSync(join(process.cwd(), "src/styles/settings.css"))).toBe(false);
    expect(readFileSync(join(process.cwd(), "src/App.tsx"), "utf8"))
      .toMatch(/id="settings"[\s\S]*?surfaceClassName="[^"]*focus-visible:outline-none/);
    expect(settingsScreenSource).toMatch(/className="[^"]*\b(?:bg|text|rounded)-/);
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
      // The rulebook is not a scroll owner: the route is. `.memory-rulebook` says
      // `overflow-visible` in its own markup, which is also what instrument.css asserts for
      // every named scroll region inside the desk scroll column.
      memory: [".memory-region"],
    };
    for (const [screen, scrollOwners] of Object.entries(expectedOwners)) {
      expect(results.filter((result) => result.screen === screen).map((result) => result.scrollOwners))
        .toEqual([scrollOwners, scrollOwners, scrollOwners]);
    }
    expect(results.filter(({ screen, width }) => width === 1100 && screen === "documents").map(({ screen, splitVerticalContained }) => ({ screen, splitVerticalContained })))
      .toEqual([{ screen: "documents", splitVerticalContained: true }]);
    expect(results.filter(({ screen, nestedMediaScroll }) => screen === "media" && nestedMediaScroll)).toEqual([]);
    // The rulebook is borderless, the route states its own desk padding, and the open rule is
    // told apart from a closed one by the body's lighter surface on the plate -- not by a second
    // tone on the plate itself, which the utilities on the article have beaten for a while.
    const memoryPlate = { memoryRegionPadding: "8px 8px 24px", memoryTopbarBorder: "0px", memoryFilterBorder: "0px", memoryRulePlate: "rgb(30, 30, 30)", memoryOpenBody: "rgb(20, 20, 20)", memoryBodyBorder: "0px" };
    expect(results.filter(({ screen }) => screen === "memory").map(({ memoryRegionPadding, memoryTopbarBorder, memoryFilterBorder, memoryRulePlate, memoryOpenBody, memoryBodyBorder }) => ({ memoryRegionPadding, memoryTopbarBorder, memoryFilterBorder, memoryRulePlate, memoryOpenBody, memoryBodyBorder }))).toEqual([memoryPlate, memoryPlate, memoryPlate]);
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
    // 09-activity-inspector.css restated `outline: var(--focus-ring)` on the media card button.
    // reset.css already draws that ring on every :focus-visible, which is why the declaration
    // never moved a pixel; the button states only the shape the ring follows.
    expect(styles).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--focus-ring\)/s);
    expect(virtualAssetGridSource).toMatch(/media-card-button[^"`]*focus-visible:rounded-control/);
    // The asset context menu's ring moved onto the row with the rest of its skin. It takes the
    // on-instrument ring, not `--fg`: the menu is a black plate in both themes, and the ring the
    // sheet drew resolved to desk ink whenever the menu opened inside `.app-mode-work`.
    expect(/const MENU_ROW = "([^"]*)"/.exec(mediaPanelSource)?.[1] ?? "")
      .toContain("focus-visible:outline-focus-on-instrument");
  }, 20_000);

  test("keeps active surfaces borderless and free of the undefined surface token", () => {
    expect(styles).not.toContain("var(--surface)");
    expect(workbenchStyles).not.toMatch(/\.project-domain-list/);
    expect(styles).not.toContain(".project-preview");
    expect(workbenchStyles).not.toMatch(/\.project-domain-list > button\.is-selected\s*\{[^}]*inset\s+2px\s+0/s);
    // Calendar and Memory have no stylesheet left, so the same three decisions are asserted where
    // they are declared: the route lets the desk show through and states its own padding, and the
    // shell it stands in draws no corner and no depth of its own. The sheet's `padding: 0` and
    // `background: var(--canvas)` never rendered either -- the route's own utilities said otherwise.
    expect(workbenchStyles).not.toMatch(/\.calendar-region|\.memory-region/);
    expect(calendarScreenSource).toMatch(/className="main-region calendar-region [^"]*\bbg-transparent\b[^"]*\bp-2 pb-6\b/);
    expect(calendarScreenSource).toMatch(/className="calendar-shell [^"]*\bbg-transparent\b[^"]*\bp-0\b/);
    // design v2 in this area: no border, no shadow and no gradient anywhere. The one exception is
    // the inset ring on today's cell in the date picker, which is a mark and not a border.
    expect(calendarMemorySurfaceSource.match(/\bbox-shadow:/g)).toEqual(["box-shadow:"]);
    expect(calendarMemorySurfaceSource).toMatch(/\[box-shadow:inset_0_0_0_1px_var\(--instrument-text-primary\)\]/);
    expect(calendarMemorySurfaceSource).not.toMatch(/\b(?:border|shadow|bg-gradient|bg-linear|bg-radial)-/);
    // Container queries only, read against the route's own content row -- never the window.
    expect(calendarMemorySurfaceSource).not.toMatch(/@(?:min|max)-\[/);
    for (const key of ["--container-calendar-toolbar", "--container-memory-row"]) expect(calendarMemoryTheme).toContain(key);
    expect(calendarMemorySurfaceSource).toContain("@max-calendar-toolbar/main-region:");
    expect(calendarMemorySurfaceSource).toContain("@max-memory-row/main-region:");
  });

  test("keeps the instrument shell frame on named roles and one scrim owner", () => {
    // The frame's own stylesheets are down to what a utility cannot express. `instrument.css` is
    // the scrim contract plus the rules this area does not own; `work-surfaces.css` is the legacy
    // token layer and nothing else.
    const instrument = readStylesheet("instrument.css");
    const workSurfaces = readFileSync(join(process.cwd(), "src/styles/work-surfaces.css"), "utf8");
    const reset = readFileSync(join(process.cwd(), "src/styles/reset.css"), "utf8");

    // One owner for the scrim. Ten components render `data-instrument-overlay-backdrop` on their
    // own overlay and state only position and layer, so a utility on any one of them would leave
    // the others unpainted -- there is no utility form for "every element with this attribute".
    expect(instrument).toMatch(/\[data-instrument-overlay-backdrop\]\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--instrument-widget-dark\) 62%/s);
    expect(workSurfaces).not.toMatch(/^\[data-instrument-overlay-backdrop\]/m);
    // A per-overlay tone is a `scrimClassName` on the overlay, not a second rule in the sheet.
    expect(shellSource).toContain('scrimClassName="z-sheet-backdrop bg-instrument/52"');

    // The reduced-motion blanket is gone from `work-surfaces.css`: an `!important` declaration in
    // an unlayered sheet loses to an `!important` utility inside `@layer utilities`, so it held
    // nothing back over the 586 elements it matched. Motion is stopped where it is declared.
    expect(workSurfaces).not.toMatch(/prefers-reduced-motion/);
    for (const source of [shellSource, readFileSync(join(process.cwd(), "src/components/ContextSidebar.tsx"), "utf8")]) {
      expect(source).toMatch(/motion-reduce:(?:animate-none|duration-0|\[transition-property:none\])/);
    }
    // The sidebar's slide-in is the defect this found: `instrument.css` declared the animation
    // after its own reduced-motion cancel, so the cancel never applied at all.
    expect(instrument).not.toContain("instrument-sidebar-in");
    expect(shellTheme).toMatch(/--animate-sidebar-in:\s*instrument-sidebar-in/);

    // Global element rules belong in the global reset, not in one area's chunk. The chunk that
    // held them is gone entirely -- `src/styles/workbench/` no longer exists.
    expect(existsSync(join(process.cwd(), "src/styles/workbench"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/styles/workbench.css"))).toBe(false);
    expect(reset).toMatch(/button:not\(:disabled\)[^{]*\{[^}]*cursor:\s*pointer/s);
    expect(reset).toMatch(/strong\s*\{[^}]*font-weight:\s*400/s);

    // Container queries only, read against a content row and never the window.
    expect(shellSource).not.toMatch(/@(?:min|max)-\[/);
    expect(shellSource).not.toMatch(/\b(?:sm|md|lg|xl|2xl):/);
    expect(shellTheme).toContain("--container-screen-header: 560px");
    // No borders, no shadows, no gradients in the frame's markup. `border-radius` is exempt: the
    // island's trigger inherits the plate's own radius so its focus ring follows the morph
    // instead of being cut square by the plate's rounded overflow clip.
    expect(shellSource.replace(/border-radius/g, "")).not.toMatch(/\b(?:border|shadow|bg-gradient|bg-linear|bg-radial)-/);
    expect(shellSource).not.toMatch(/box-shadow/);

    // The island's plate morphs between two named track pairs rather than two literals, and the
    // rail sheet's plate is stated by the component that opens it: portalled to `document.body`
    // it cannot read the shell's own rail width, so the width comes from a child in scope.
    // 32, not 36: the island stands on the chrome row, so its height is the row's or the 8 gap
    // under the chrome closes to 4 beneath it alone.
    expect(shellTheme).toMatch(/--island-rows:\s*32px 0fr/);
    expect(shellTheme).toMatch(/--island-rows-open:\s*44px 1fr/);
    expect(shellSource).toContain("grid-rows-(--island-rows-open)");
    expect(shellSource).toMatch(/surfaceClassName="fixed z-sheet inset-y-2 left-2 w-max max-w-overlay-fit/);
    expect(instrument).not.toContain("right-rail-sheet");
  });

  test("keeps the workbench chrome on named roles, container widths and no depth", () => {
    // The chrome area's stylesheet chunks are gone, and so is the holding file that stood in for
    // them: `src/styles/workbench/` and `workbench.css` no longer exist at all.
    expect(existsSync(join(process.cwd(), "src/styles/workbench"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/styles/workbench.css"))).toBe(false);
    expect(readFileSync(join(process.cwd(), "src/main.tsx"), "utf8")).not.toContain("styles/workbench");
    // The nine selectors this test used to pin as deliberately multi-owner are resolved rather
    // than held: a rule with several renderers is a shared class constant or a per-renderer set
    // of utilities, and the one keyframe is a named `--animate-*` role in the area theme file.
    // Every one is asserted where it now lives, so nothing was weakened by deleting the file.
    expect(chromeTheme).toMatch(/--animate-select-menu-in:\s*select-menu-in/);
    expect(chromeTheme).toContain("@keyframes select-menu-in");
    // Every renderer of a shared element states that element's whole set, so the file's deletion
    // leaves none of them unpainted -- that is the failure mode moving a multi-owner rule invites.
    // The witness per element is one utility the deleted rule's own declarations became.
    const renderers: Array<[string, string, string[]]> = [
      ["main-region", "@container/main-region", ["src/App.tsx", "src/screens/ProjectScreen.tsx", "src/screens/WorkspaceScreen.tsx", "src/screens/CalendarScreen.tsx", "src/screens/MarketplaceScreen.tsx", "src/screens/WorkspaceProjectsScreen.tsx", "src/screens/LibraryScreen.tsx", "src/screens/MemoryScreen.tsx", "src/screens/SharedLibraryScreen.tsx"]],
      ["screen-kicker", "mb-1", ["src/screens/WorkspaceScreen.tsx", "src/screens/LibraryScreen.tsx", "src/screens/SharedLibraryScreen.tsx", "src/screens/WorkspaceProjectsScreen.tsx"]],
      ["content-section", "min-w-0", ["src/screens/LibraryScreen.tsx", "src/screens/WorkspaceProjectsScreen.tsx"]],
      // Two renderers, not the five the deleted file's prose claimed: the overview, the
      // marketplace and the project panel each draw their own `*-section-heading`, which the
      // `.section-heading` rule never selected.
      ["section-heading", "h-8", ["src/screens/LibraryScreen.tsx", "src/screens/WorkspaceProjectsScreen.tsx"]],
      // The row's `gap: 14px` and `flex: none` were already dead on both renderers: each states
      // its own `gap-*` and its own flex behaviour, and a layered important utility beats an
      // unlayered declaration. `display: flex` is the one declaration that had to move.
      ["workspace-header-actions", "flex", ["src/screens/WorkspaceProjectsScreen.tsx", "src/screens/workspace/WorkspaceOverviewHeader.tsx"]],
    ];
    // `sidebar-profile-name` is absent from that list on purpose: its one renderer was
    // `ProfileMenu`, and the sidebar footer mounts `InstrumentProfileControl` instead, whose
    // label states its own truncation set. The class has no live renderer left to pin, so it is
    // pinned as gone rather than held as a name no markup answers to.
    expect(existsSync(join(process.cwd(), "src/components/ProfileMenu.tsx"))).toBe(false);
    expect(styles).not.toContain("sidebar-profile-name");
    for (const [element, witness, files] of renderers) {
      for (const file of files) {
        const source = readFileSync(join(process.cwd(), file), "utf8");
        const classLists = [...source.matchAll(new RegExp(element + "([^\"`]*)", "g"))].map(([, rest]) => rest.split(/\s+/));
        expect(classLists.some((list) => list.includes(witness)), `${file} renders ${element}`).toBe(true);
      }
    }
    // `.command-button` is the one that could not be a per-renderer set: five screens across four
    // areas render it, and it stands on two different plates. It is one shared constant with two
    // skins, so a caller can never repaint half of a surface/ink pair.
    const routeChrome = readFileSync(join(process.cwd(), "src/screens/route-chrome.ts"), "utf8");
    expect(routeChrome).toMatch(/export const COMMAND_BUTTON =/);
    expect(routeChrome).toMatch(/export const COMMAND_BUTTON_ON_INSTRUMENT =/);
    expect(/const COMMAND_SKIN = "([^"]*)"/.exec(routeChrome)?.[1] ?? "").toMatch(/bg-surface-hover text-ink/);
    expect(/const COMMAND_SKIN_ON_INSTRUMENT = "([^"]*)"/.exec(routeChrome)?.[1] ?? "").toMatch(/bg-instrument-raised text-on-instrument/);
    const chromeSources = [titlebarSource, selectMenuSource, pickerSource, contextSidebarSource, librarySource].join("\n");
    // design v2 in this area: no border, no shadow and no gradient anywhere in the markup.
    expect(chromeSources).not.toMatch(/\b(?:border|shadow|bg-gradient|bg-linear|bg-radial)-/);
    expect(chromeSources).not.toMatch(/box-shadow/);
    // Container queries only, read against a content row -- never the window. The desk is not
    // the window, so an arbitrary breakpoint width is a defect even when it happens to look right.
    expect(chromeSources).not.toMatch(/@(?:min|max)-\[/);
    expect(chromeSources).not.toMatch(/\b(?:sm|md|lg|xl|2xl):/);
    for (const key of ["--container-workspace-header", "--container-activity-filters"]) {
      expect(chromeTheme).toContain(key);
    }
    const projectsScreen = readFileSync(join(process.cwd(), "src/screens/WorkspaceProjectsScreen.tsx"), "utf8");
    expect(projectsScreen).toContain("@min-workspace-header/instrument-desk:");
    // A `display` utility on the trigger beats an authored `display: none`, so the activity
    // toolbar's container hide has to be a variant on the element, not a rule in the sheet.
    expect(readFileSync(join(process.cwd(), "src/screens/project/ActivityTimeline.tsx"), "utf8"))
      .toContain("@max-activity-filters/project-domain:hidden");
    // The shared trigger carries exactly one skin: the callers that state their own decline it.
    for (const file of [
      "src/screens/marketplace/MarketplaceHeader.tsx",
      "src/screens/shared-library/SharedLibraryToolbar.tsx",
      "src/screens/settings/rows.tsx",
      "src/screens/project/ActivityTimeline.tsx",
    ]) expect(readFileSync(join(process.cwd(), file), "utf8")).toContain('tone="caller"');
    // The checked row's inversion is still owned by the sheet, so the item states its rest ink
    // behind a `not-data-[state=checked]` guard -- an unguarded utility would win over it.
    expect(/const ITEM = "([^"]*)"/.exec(selectMenuSource)?.[1] ?? "")
      .toMatch(/not-data-\[state=checked\]:text-on-instrument-muted/);
  });

  test("keeps documents and activity on named roles, container widths and no depth", () => {
    // All three chunks are gone, and so is the holding file that stood in for them. The four
    // things it held are resolved rather than held: three had a single renderer after all, and
    // the keyframe is a named `--animate-*` role in the shell theme.
    expect(existsSync(join(process.cwd(), "src/styles/workbench"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/styles/workbench.css"))).toBe(false);
    expect(readFileSync(join(process.cwd(), "src/screens/LibraryScreen.tsx"), "utf8"))
      .toMatch(/ralphy-wordmark[^"`]*\btype-/);
    const appSource = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    expect(appSource).toMatch(/project-indexing[^"`]*\bflex\b[^"`]*\btext-muted\b/);
    // The indexing bar was a `content: ""` pseudo-element with no element to carry a utility, so
    // it became a real parent/child pair -- the only way one property gets one utility here.
    expect(appSource).toMatch(/loading-line[^"`]*\boverflow-hidden\b/);
    expect(appSource).toMatch(/animate-indexing[^"`]*motion-reduce:animate-none/);
    expect(shellTheme).toMatch(/--animate-indexing:\s*instrument-indexing/);
    expect(shellTheme).toContain("@keyframes instrument-indexing");
    // Nothing this area owns is left in the sheet, including two class names no component emits.
    for (const gone of [".markdown-alert", ".plain-text-view", ".welcome-", ".activity-inspector", ".activity-attempt", ".asset-cost", ".review-mark", ".asset-extension,", ".markdown-html", "@keyframes welcome-"]) {
      expect(workbenchStyles).not.toContain(gone);
    }
    // The only `.markdown-view` rules left in the sheet are the agent chat's, which 10-agent-chat.css
    // still owns. Every one of them is now shadowed by the component's `tone="instrument"` skin --
    // reported for the chrome area, not deleted here.
    for (const line of workbenchStyles.split("\n").filter((line) => line.includes(".markdown-view"))) {
      expect(line).toContain(".agent-message.is-assistant .markdown-view");
    }
    // The squircle opt-in list is gone with its holding file. `rounded-cell` is not one of the
    // radii tokens.css opts in by itself, so the one preview that wanted a squircle states it on
    // the element -- six of the list's other selectors measured identical with the rule disabled.
    expect(workbenchStyles).not.toContain(".asset-preview");
    expect(virtualAssetGridSource).toMatch(/asset-preview[^"`]*\[corner-shape:squircle\]/);
    // design v2 in this area: no border, no shadow and no gradient. `border-collapse` is a table
    // model and `border-0` is the removal of one, and the only box-shadows are the two named
    // inset marks -- the selected activity row and a blockquote.
    expect(documentsActivitySource).not.toMatch(/\bborder-(?!collapse\b|0\b)/);
    expect(documentsActivitySource).not.toMatch(/\b(?:shadow|bg-gradient|bg-linear|bg-radial)-/);
    // Two, not three: the on-dark blockquote mark went with the chat's black widget in handoff 17.
    expect(documentsActivitySource.match(/\bbox-shadow:/g)).toEqual(["box-shadow:", "box-shadow:"]);
    for (const mark of ["--activity-selected-mark", "--document-quote-mark"]) {
      expect(documentsActivityTheme).toContain(`${mark}: inset 2px 0 0 var(--instrument-text-`);
    }
    // Container queries only, read against the route's own panel -- never the window. The two
    // ranges the activity table swaps between are written as mutually exclusive, so no cell ever
    // carries two `grid-cols` utilities and lets the generated sheet decide.
    expect(documentsActivitySource).not.toMatch(/@(?:min|max)-\[/);
    expect(documentsActivitySource).not.toMatch(/\b(?:sm|md|lg|xl|2xl):/);
    expect(documentsActivityTheme).toContain("--container-activity-columns");
    expect(documentsActivitySource).toContain("@min-activity-filters/project-domain:@max-activity-columns/project-domain:grid-cols-(--activity-row-columns-medium)");
    expect(documentsActivitySource).toContain("@max-activity-filters/project-domain:grid-cols-(--activity-row-columns-narrow)");
    // A rendered document renders as a document and as one turn of a transcript, so the skin is a
    // prop and no caller repaints half of a surface/ink pair from CSS. Both tones are the theme
    // family since handoff 17 -- the chat is a card, and the on-dark skin has nothing left to paint.
    expect(markdownViewSource).toContain('tone?: MarkdownTone');
    expect(markdownViewSource).toMatch(/tone === "chat" \? CHAT_TONE : DOCUMENT_TONE/);
    expect(markdownViewSource).not.toContain("INSTRUMENT_TONE");
    expect(readFileSync(join(process.cwd(), "src/components/agent/AgentThread.tsx"), "utf8"))
      .toContain('<MarkdownView markdown={block.entry.text ?? ""} tone="chat"');
    // Every legacy tone on the timeline icon collapsed to one of two on-dark inks, so the map
    // states two and not seven.
    expect([...new Set((/const ICON_TONE[^}]*}/s.exec(documentsActivitySource)?.[0] ?? "").match(/text-on-instrument(?:-muted)?/g) ?? [])].sort())
      .toEqual(["text-on-instrument", "text-on-instrument-muted"]);
  });

  test("keeps the workspace cards and the media viewer on named roles, container widths and no depth", () => {
    // Both chunks are gone, and so is every holding file: `src/styles/workbench/` no longer
    // exists. The two selectors this test used to pin as held each turned out to have exactly the
    // renderers a grep found -- `.project-region` is App.tsx's loading fallback plus the screen it
    // stands in for, `.status-dot` is drawn by three -- so both moved onto every one of them.
    expect(existsSync(join(process.cwd(), "src/styles/workbench"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/styles/workbench.css"))).toBe(false);
    // `.project-region` no longer carries a wash on either renderer. The mode surface above it
    // paints the desk when the route is the elastic column and deliberately does not inside the
    // view panel, where the page card paints -- so the region's own `bg-desk` was repainting the
    // same colour in the desk lens and painting over a white card in the chat lens.
    for (const file of ["src/App.tsx", "src/screens/ProjectScreen.tsx"]) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).not.toMatch(/project-region[^"`]*\bbg-desk\b/);
    }
    for (const file of ["src/screens/LibraryScreen.tsx", "src/screens/WorkspaceProjectsScreen.tsx", "src/instrument/primitives.tsx"]) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).toMatch(/status-dot[^"`]*\bsize-/);
    }
    // The four rules the holding files still shadowed for this area are resolved too: the tab
    // blobs' reduced-motion cancel and the shared focus ring moved onto their components, and the
    // unreachable `.is-error` action was deleted -- no `.viewer-actions button` can carry it.
    for (const selector of [".workspace-project-card", ".workspace-project-preview", ".gooey-tabs", ".asset-modal", ".viewer-actions", ".project-facts", ".viewer-identity", ".property-row", ".image-zoom-controls", ".video-controls", ".audio-waveform-player", ".asset-context-menu"]) {
      expect(workbenchStyles).not.toContain(selector);
    }
    expect(readFileSync(join(process.cwd(), "src/components/ui/GooeyTabs.tsx"), "utf8"))
      .toMatch(/gooey-tabs-blobs[^"`]*motion-reduce:filter-none/);
    // design v2 in this area: no border, no shadow, no gradient. `shadow-none` is the removal of
    // one -- the media panel's selection plate has to cancel the tile's inset mark.
    expect(workspaceMediaSource).not.toMatch(/\bborder-(?!collapse\b|0\b)/);
    expect(workspaceMediaSource).not.toMatch(/\b(?:bg-gradient|bg-linear|bg-radial)-/);
    expect(workspaceMediaSource).not.toMatch(/\bshadow-(?!none\b)/);
    expect(workspaceMediaSource).not.toMatch(/box-shadow/);
    // Container queries only, read against the route's own content row -- never the window.
    expect(workspaceMediaSource).not.toMatch(/@(?:min|max)-\[/);
    expect(workspaceMediaSource).not.toMatch(/\b(?:sm|md|lg|xl|2xl):/);
    expect(workspaceMediaTheme).toContain("--container-workspace-projects-header");
    expect(workspaceMediaSource).toContain("@max-workspace-projects-header/main-region:flex-col");
    // The three players mount on a black widget and on a light one, so the skin is a prop and no
    // caller repaints half of a surface/ink pair from CSS.
    expect(readFileSync(join(process.cwd(), "src/components/media/tone.ts"), "utf8"))
      .toMatch(/export type PlayerTone = "instrument" \| "surface"/);
    for (const file of [
      "src/screens/project/MediaViewer.tsx",
      "src/screens/shared-library/SharedArtifactViewer.tsx",
      "src/screens/shared-library/SharedArtifactPreview.tsx",
      "src/screens/project/UnitSocialPreview.tsx",
      "src/components/VirtualAssetGrid.tsx",
    ]) expect(readFileSync(join(process.cwd(), file), "utf8")).toMatch(/tone="(?:instrument|surface)"/);
    // The asset modal is fixed to the window, so its gutter is the one length in the area with no
    // container to read: a continuous clamp, which is what replaced the deleted 1040px breakpoint.
    expect(workspaceMediaTheme).toContain("--spacing-asset-modal-gutter: clamp(20px, 3.75vw, 48px)");
    // `grid-template-columns` is not a Tailwind namespace, so every template in this area is a
    // custom property read back with `grid-cols-(--name)`.
    for (const template of ["--asset-modal-columns", "--viewer-property-columns", "--asset-menu-row-columns"]) {
      expect(workspaceMediaTheme).toContain(template);
      expect(workspaceMediaSource).toContain(`grid-cols-(${template})`);
    }
    // A collage tile is flush by design, and the extension badge another area draws on a loose
    // preview is hidden inside one. Both are stated from the collage, at (0,2,0), because a
    // `rounded-none` on the tile would lose to the badge's own rule.
    const collage = /const COLLAGE = "([^"]*)"/.exec(readFileSync(join(process.cwd(), "src/screens/WorkspaceProjectsScreen.tsx"), "utf8"))?.[1] ?? "";
    expect(collage).toContain("[&>.asset-preview]:rounded-none");
    expect(collage).toContain("[&_.asset-extension]:hidden");
  });

  test("leaves the activity log without a rail, in either whole or per-event form", () => {
    // The list-level rail was pinned to hard 58/24px offsets and a hard-coded column x, so
    // it never met the first or last row; design v2 carries no rules or borders at all.
    expect(workbenchStyles).not.toContain(".activity-virtual-list::before");
    expect(workbenchStyles).not.toContain(".activity-source::before");
    expect(workbenchStyles).not.toContain("--activity-timeline-x");
  });

  test("keeps the activity timeline surface transparent", () => {
    // Stated by the one component that renders the table, not by a sheet: the sunken plate is the
    // scroller's, and a second ground under it drew a square corner inside the rounded clip.
    expect(readFileSync(join(process.cwd(), "src/screens/project/ActivityTimeline.tsx"), "utf8"))
      .toMatch(/activity-table[^"`]*\bbg-transparent\b/);
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
    expect(renderer).toContain("@min-workspace-section/instrument-desk:col-span-6");
    // Strips inside a half-width section derive their track count instead of declaring it.
    expect(workspaceOverviewTheme).toMatch(/--workspace-efficiency-columns:\s*repeat\(auto-fit/);
    expect(workspaceOverviewTheme).toMatch(/--workspace-day-columns:\s*repeat\(auto-fit/);
    expect(workspaceOverviewTheme).toMatch(/--workspace-metric-columns:\s*repeat\(auto-fit/);
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
    // The grabber paints unconditionally: a hover-only affordance never advertises itself. Every
    // draggable edge shares the one rule, the view panel's included, so no column gets a
    // quieter grip than its neighbour.
    expect(styles).toMatch(
      /\.resize-instrument-sidebar::after,\s*\.resize-instrument-rail::after,\s*\.resize-instrument-view::after\s*\{[^}]*background:\s*var\(--instrument-resize-grip\)/s,
    );
    // The dock belongs to the desk column, not the window: fixed positioning centred it on
    // the app and drifted off the project whenever a column took width.
    expect(styles).toMatch(/\.project-controls\s*\{[^}]*position:\s*absolute/s);
    expect(renderer).toContain("onLostPointerCapture");
    expect(renderer).toContain("createPortal");
    // The popover is portalled and positioned from a measured rect, so its own markup states the
    // out-of-flow decision -- the sheet that used to state it is gone.
    expect(pickerSource).toMatch(/workspace-picker-popover fixed\b/);
    // The search's `box-shadow: none` reset never rendered -- nothing painted a shadow there.
    // What it did lack was a visible ring: the popover is portalled outside the work scope, so
    // the theme ring resolves to black on this black widget.
    expect(pickerSource).toContain("focus-within:outline-focus-on-instrument");
    expect(pickerSource).not.toMatch(/\bshadow-/);
    expect(renderer).toContain("[-webkit-app-region:no-drag]");
    expect(styles).toMatch(/button:not\(:disabled\)[^{]*\{[^}]*cursor:\s*pointer/s);
    // The two column fallbacks moved to the shell's own theme file with the rest of its role
    // keys. They cannot live on `:root`: the rail's menus derive their fit from the rail width,
    // and a custom property's `var()` is substituted where the property is declared.
    expect(shellTheme).toMatch(/\.instrument-shell\s*\{[^}]*--instrument-left-width:\s*260px/s);
    expect(shellTheme).toMatch(/\.instrument-shell\s*\{[^}]*--instrument-right-rail-width:\s*292px/s);
    // The desk column names the container eight other areas' width variants read. Its stable
    // gutter cannot be a utility: `marketplace.css` gives the gutter back for the one route that
    // scrolls itself, with an unlayered `!important` that a utility would beat, so the gutter and
    // the stage's `min-height` stay unlayered in `instrument.css` at the position they had.
    expect(shellSource).toContain("@container/instrument-desk");
    expect(shellSource).not.toContain("[scrollbar-gutter:stable]");
    expect(shellStyles).toMatch(/\.instrument-desk-scroll\s*\{\s*scrollbar-gutter:\s*stable/);
    expect(shellStyles).toMatch(/\.instrument-desk-scroll\s*>\s*\.main-content-stage\s*\{\s*min-height:\s*100%/);
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
    // The footer's identity is the sidebar's own markup plus the control it mounts, since
    // `ProfileMenu` is gone: both halves have to decline the raw library label, not just one.
    const profile = [
      "src/components/ContextSidebar.tsx",
      "src/instrument/InstrumentProfileControl.tsx",
      "src/components/ProfileAvatar.tsx",
    ].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");

    expect(/const HERO = "([^"]*)"/.exec(picker)?.[1] ?? "").toContain("workspace-hero");
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
    // Handoff 13: the workspace card is a widget standing on the one sidebar card, and its radius
    // is the hero role (22) rather than the panel role (18). It states its height once and the
    // picker and hero fill it, in markup.
    expect(chromeTheme).toMatch(/--spacing-workspace-card:\s*118px/);
    expect(sidebar).toMatch(/className="sidebar-context[^"]*\bh-workspace-card\b[^"]*\brounded-hero\b/);
    expect(picker).toMatch(/className="workspace-picker[^"]*\bh-full\b/);
    expect(/const HERO = "([^"]*)"/.exec(picker)?.[1] ?? "").toMatch(/\bh-full\b/);
    // The hero is the black widget, and it now carries the class that flips the on-dark token
    // set for its subtree, which is what makes its focus ring visible at all.
    expect(/const HERO = "([^"]*)"/.exec(picker)?.[1] ?? "").toMatch(/\bbg-instrument\b/);
    // `.project-glyph` reached no component at all; the identity plate that does render reads
    // the same ramp through --glyph-color.
    expect(workbenchStyles).not.toMatch(/\.project-glyph\s*\{/);
    expect(readFileSync(join(process.cwd(), "src/screens/workspace/WorkspaceOperations.tsx"), "utf8"))
      .toMatch(/color-mix\(in_srgb,var\(--glyph-color\)/);
    // Handoff 13 moved the nav onto the one sidebar card, so selection is no longer an inversion
    // against a black widget: a selected row is the field recess with the theme ink, and hover
    // takes the same surface. Stated once in the sidebar's own vocabulary; the stylesheet's
    // `.is-selected` hook was never set by any component.
    expect(/const SELECTED = "([^"]*)"/.exec(sidebar)?.[1] ?? "").toBe(
      "bg-field text-ink hover:bg-field hover:text-ink",
    );
    expect(styles).not.toContain("sidebar-nav-row.is-selected");
    expect(chromeTheme).toMatch(/--workspace-option-mask:\s*url\("\/assets\/dither\/row-field\.png"\)/);
    expect(picker).toContain("[mask-image:var(--workspace-option-mask)]");
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
    // The exit state is markup now: 16-welcome-screen.css is gone, and an authored
    // `transform`/`opacity` there could not have beaten the utilities on the element anyway.
    expect(welcome).toContain("is-exiting opacity-0");
    expect(welcome).toMatch(/welcome-screen[^`"]*transition duration-slow ease-instrument/);
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
    // The shortcut the main process forwards now means what the lens pair means: the chat rail is
    // unavailable under the desk lens on purpose, so opening a dock the lens closes again would
    // have made the OS-level affordance dead.
    expect(app).toContain("bridge.onToggleRightPanel(onToggle)");
    /* The chord toggles the panel beside the chat, and only under the chat lens: the chat is the
       lens, so there is nothing there for a "show me the chat" chord to show, and under the desk
       lens the chord is silent because the lens pair (⌘1/⌘2) is what changes lens. */
    expect(app).toContain("onToggle={toggleViewPanel}");
    expect(app).toContain('setViewPanel((record) => lens === "chat" ? { ...record, open: !record.open } : record)');
    expect(app).not.toContain("toggleLens");
    expect(app).toContain("useAgentChat");
    expect(app).toContain("<AgentChatPanel");
    expect(app).not.toContain("<RightPanelSummary");
    expect(panels).toContain("AgentChatPanel");
    expect(panels).toContain("AgentChatMenu");
    // One model control, not a provider pill beside a model pill: handoff 17's single pill lists
    // every connected provider's catalog, so a row carries both halves of the choice.
    expect(panels).not.toContain("AgentProviderMenu");
    expect(panels).toContain("AgentModelMenu");
    expect(panels).toContain("chat.setProvider(model.provider, model.id)");
    expect(panels).toContain('label: "Codex"');
    expect(panels).toContain('label: "OpenRouter"');
    expect(panels).not.toContain("<select");
    expect(panels).toContain("AiBrandIcon");
    // v2 forbids borders, and the chat is two layers rather than one flat plate: a 2px run of
    // panel around a card one radius step in, the same shell the sidebar and the view panel stand
    // on. The outer element owns the frame, the inner card owns the widget. Handoff 17 makes that
    // widget a card rather than a black plate -- the chat is a light surface by design -- so the
    // zone's ink is the theme's.
    // The shell itself is now the `Window` kit component: the rail names it rather than respelling
    // the two layers, so the contract is checked once, where the chrome is defined.
    const chrome = readFileSync(join(process.cwd(), "src/components/ui/Window.tsx"), "utf8");
    const WINDOW = /export const WINDOW = "([^"]*)"/.exec(chrome)?.[1] ?? "";
    const WINDOW_BODY = /export const WINDOW_PLATE = "([^"]*)"/.exec(chrome)?.[1] ?? "";
    expect(WINDOW.split(" ")).toContain("bg-panel");
    expect(WINDOW.split(" ")).toContain("p-0.5");
    expect(WINDOW.split(" ")).toContain("rounded-window");
    expect(WINDOW).not.toMatch(/\b(?:border-\d|shadow-)/);
    const railPlate = /`utility-right-panel panel-blur \$\{WINDOW\} ([^`]*)`/.exec(agentRailSource)?.[1] ?? "";
    expect(railPlate.split(" ")).toContain("text-ink");
    expect(agentRailSource).toContain('from "./ui/Window"');
    expect(agentRailSource).toContain("utility-right-panel-card ${WINDOW_BODY}");
    const railCard = WINDOW_BODY;
    expect(railCard.split(" ")).toContain("bg-card");
    // `rounded-frame`, not `rounded-inner`: handoff 16 makes the card's corner concentric with the
    // shell's, 16 less the 2 of frame, so the frame reads as a hairline rather than as a margin.
    expect(railCard.split(" ")).toContain("rounded-frame");
    // And the chrome is the zone's row in that frame, above the card rather than inside it.
    expect(agentRailSource.indexOf("utility-panel-header")).toBeLessThan(agentRailSource.indexOf("utility-right-panel-card"));
    // The composer's own skin is in markup: a field one step off the card, at the card's own
    // radius, with a transparent editable inside it. It carries no ring of its own -- a text field
    // already states its focus with a caret, and a lit border around every keystroke is noise.
    const composer = readFileSync(
      join(process.cwd(), "src/components/agent/AgentComposer.tsx"),
      "utf8",
    );
    expect(composer).toContain("rounded-composer bg-chat-field");
    expect(composer).toContain("agent-composer-field");
    expect(composer).not.toContain("focus-within:outline");
    // A tag is the platform's own atom: `contenteditable="false"` is what makes backspace take the
    // whole chip and an arrow step over it, so none of that is re-implemented in a key handler.
    expect(composer).toContain('tag.contentEditable = "false"');
    expect(composer).toContain("tag.dataset.tag =");
    expect(composer).toMatch(/\bmx-3 mb-3\b/);
    expect(panels).not.toMatch(/\bborder-(?!collapse\b|0\b)/);
    expect(panels).not.toMatch(/\b(?:shadow|bg-gradient|bg-linear|bg-radial)-/);
    // Nothing of the rail is left in the sheet: both chunks are gone and what stayed is unowned.
    for (const chunk of ["10-agent-chat.css", "11-agent-connect.css"]) {
      expect(existsSync(join(process.cwd(), "src/styles/workbench", chunk))).toBe(false);
    }
    for (const gone of [".agent-composer", ".agent-popover", ".agent-message", ".agent-connect", ".agent-send", ".agent-copy-button", ".markdown-view"]) {
      expect(styles).not.toContain(gone);
    }
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
      join(process.cwd(), "src/instrument/InstrumentProfileControl.tsx"),
      "utf8",
    );
    const overlayRegistry = readFileSync(
      join(process.cwd(), "src/instrument/overlay-registry.tsx"),
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

    // The popover is still custom, but the portal and the menu role are the overlay registry's
    // now rather than the control's own: `ProfileMenu` called `createPortal` and wrote
    // `role="menu"` inline, and the control that replaced it registers `profile-menu` as a menu
    // kind and lets the registry portal it and stamp the role. Both halves are asserted so a
    // registry that stopped portalling, or a kind that drifted off "menu", still fails here.
    expect(profileMenu).toContain('id="profile-menu"');
    expect(profileMenu).toContain("<InstrumentOverlay");
    expect(profileMenu).toContain("Settings");
    expect(profileMenu).toContain("closeAndRestoreFocus");
    expect(overlayRegistry).toContain("createPortal(content, document.body)");
    expect(overlayRegistry).toMatch(/"profile-menu":\s*\{\s*kind:\s*"menu"\s*\}/);
    expect(overlayRegistry).toContain("role={overlayRoles[INSTRUMENT_OVERLAYS[id].kind]}");
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
