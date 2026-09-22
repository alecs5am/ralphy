import { DESKTOP_SYSTEM_CHANNELS } from "../shared/desktop-system";
import { GENERATION_UNIT_CHANNELS } from "../shared/generation-units";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { VIDEO_CHANNELS } from "../shared/video-workspace";
import { AGENT_CHAT_STORAGE_CHANNELS } from "../shared/agent-chat-storage";
import { type IpcResult, unwrapIpcResult } from "./ipc-security";
import {
  AGENT_CHANNELS,
  APP_CHANNELS,
  MEDIA_CHANNELS,
  type AnnotationInput,
  type AgentChatEnvelope,
  type AgentChatRequest,
  type MediaEvent,
  type MediaWorkbenchBridge,
  type ProjectReference,
  type ProjectCompositionPageRequest,
  type ProjectUnitPageRequest,
} from "./media/types";
import type { BuildDto, BuildOutputDto, CompositionInputDto, CompositionRevisionDto, CompositionSourceDto, EvaluationDto, Page, UnitItemDto, UnitPresentationDto, UnitRevisionDto } from "./ralphy/types";

async function invoke<Value>(channel: string, ...args: unknown[]): Promise<Value> {
  return unwrapIpcResult(
    await ipcRenderer.invoke(channel, ...args) as IpcResult<Value>,
  );
}

function loadProjectUnitPage(
  project: ProjectReference,
  request: Extract<ProjectUnitPageRequest, { kind: "revisions" }>,
): Promise<Page<UnitRevisionDto>>;
function loadProjectUnitPage(
  project: ProjectReference,
  request: Extract<ProjectUnitPageRequest, { kind: "items" }>,
): Promise<Page<UnitItemDto>>;
function loadProjectUnitPage(
  project: ProjectReference,
  request: Extract<ProjectUnitPageRequest, { kind: "presentations" }>,
): Promise<Page<UnitPresentationDto>>;
function loadProjectUnitPage(
  project: ProjectReference,
  request: ProjectUnitPageRequest,
): Promise<Page<UnitRevisionDto | UnitItemDto | UnitPresentationDto>> {
  return invoke(MEDIA_CHANNELS.loadProjectUnitPage, project, request);
}

function loadProjectCompositionPage(
  project: ProjectReference,
  request: ProjectCompositionPageRequest,
): Promise<Page<CompositionRevisionDto | CompositionSourceDto | CompositionInputDto | EvaluationDto | BuildDto | BuildOutputDto>> {
  return invoke(MEDIA_CHANNELS.loadProjectCompositionPage, project, request);
}

const mediaBridge: MediaWorkbenchBridge = {
  loadAgentChats: (rootPath, workspaceId) => invoke(AGENT_CHAT_STORAGE_CHANNELS.load, rootPath, workspaceId),
  saveAgentChats: (rootPath, workspaceId, data, expectedRevision) => invoke(AGENT_CHAT_STORAGE_CHANNELS.save, rootPath, workspaceId, data, expectedRevision),
  exportLibraryWorkspace: (workspaceId) => invoke(DESKTOP_SYSTEM_CHANNELS.exportWorkspace, workspaceId),
  importLibraryWorkspace: () => invoke(DESKTOP_SYSTEM_CHANNELS.importWorkspace),
  createLibraryWorkspace: (name) => invoke(DESKTOP_SYSTEM_CHANNELS.createWorkspace, name),
  createLibraryProject: (workspaceId, name) => invoke(DESKTOP_SYSTEM_CHANNELS.createProject, workspaceId, name),
  getDesktopSystemInfo: () => invoke(DESKTOP_SYSTEM_CHANNELS.info),
  clearDesktopCache: () => invoke(DESKTOP_SYSTEM_CHANNELS.clearCache),
  revealDesktopFolder: (folder) => invoke(DESKTOP_SYSTEM_CHANNELS.revealFolder, folder),
  loadVideoWorkspace: (ref) => invoke(VIDEO_CHANNELS.loadVideoWorkspace, ref),
  saveVideoWorkspace: (ref, html, fps, expected) => invoke(VIDEO_CHANNELS.saveVideoWorkspace, ref, html, fps, expected),
  previewVideoWorkspace: (ref, html) => invoke(VIDEO_CHANNELS.previewVideoWorkspace, ref, html),
  renderVideoWorkspace: (ref, expected) => invoke(VIDEO_CHANNELS.renderVideoWorkspace, ref, expected),
  importVideoWorkspaceAsset: (ref, file) => {
    const path = file ? webUtils.getPathForFile(file) : undefined;
    if (file && !path) return Promise.reject(new Error("Drop a file from Finder to import it"));
    return invoke(VIDEO_CHANNELS.importVideoWorkspaceAsset, ref, path);
  },
  loadGenerationProviders: () => invoke(MEDIA_CHANNELS.loadGenerationProviders),
  probeGenerationProvider: (provider) => invoke(MEDIA_CHANNELS.probeGenerationProvider, provider),
  setGenerationProviderKey: (provider, apiKey) => invoke(MEDIA_CHANNELS.setGenerationProviderKey, provider, apiKey),
  clearGenerationProviderKey: (provider) => invoke(MEDIA_CHANNELS.clearGenerationProviderKey, provider),
  loadGenerationCatalog: (workspaceId) => invoke(MEDIA_CHANNELS.loadGenerationCatalog, workspaceId),
  loadGenerationVoices: (workspaceId) => invoke(MEDIA_CHANNELS.loadGenerationVoices, workspaceId),
  loadGenerationDraft: (workspaceId) => invoke(MEDIA_CHANNELS.loadGenerationDraft, workspaceId),
  saveGenerationDraft: (workspaceId, draft) => invoke(MEDIA_CHANNELS.saveGenerationDraft, workspaceId, draft),
  startGeneration: (workspaceId, draft, mode) => invoke(MEDIA_CHANNELS.startGeneration, workspaceId, draft, mode),
  loadGenerationRuns: (workspaceId, before) => invoke(MEDIA_CHANNELS.loadGenerationRuns, workspaceId, before),
  loadGenerationUnitOptions: (workspaceId, projectId) => invoke(GENERATION_UNIT_CHANNELS.options, workspaceId, projectId),
  saveGenerationToUnit: (workspaceId, source, destination) => invoke(GENERATION_UNIT_CHANNELS.save, workspaceId, source, destination),
  cancelGenerationRun: (workspaceId, id) => invoke(MEDIA_CHANNELS.cancelGenerationRun, workspaceId, id),
  exportGenerationAsset: (workspaceId, asset) => invoke(MEDIA_CHANNELS.exportGenerationAsset, workspaceId, asset),
  loadCanvasModels: (workspaceId) => invoke(MEDIA_CHANNELS.loadCanvasModels, workspaceId),
  importCanvasAsset: (workspaceId, file) => {
    if (!file) return invoke(MEDIA_CHANNELS.importCanvasAsset, workspaceId);
    const path = webUtils.getPathForFile(file);
    if (!path) return Promise.reject(new Error("Drop a file from Finder to import it"));
    return invoke(MEDIA_CHANNELS.importCanvasAsset, workspaceId, path);
  },
  loadCanvasAssetPreview: (workspaceId, asset) => invoke(MEDIA_CHANNELS.loadCanvasAssetPreview, workspaceId, asset),
  startCanvasRun: (workspaceId, canvas, options) => invoke(MEDIA_CHANNELS.startCanvasRun, workspaceId, canvas, options),
  loadCanvasRuns: (workspaceId, canvas, query) => invoke(MEDIA_CHANNELS.loadCanvasRuns, workspaceId, canvas, query),
  cancelCanvasRun: (workspaceId, run) => invoke(MEDIA_CHANNELS.cancelCanvasRun, workspaceId, run),
  loadCanvases: (workspaceId) => invoke(MEDIA_CHANNELS.loadCanvases, workspaceId),
  saveCanvas: (workspaceId, canvas, expectedRevision) => invoke(MEDIA_CHANNELS.saveCanvas, workspaceId, canvas, expectedRevision),
  summariseAgentTitle: (request) => invoke(AGENT_CHANNELS.title, request),
  loadAgentContext: (input) => invoke(AGENT_CHANNELS.context, input),
  readContextPath: (path) => invoke(AGENT_CHANNELS.contextRead, path),
  /* The only synchronous member: a dropped file's path is a preload capability rather than an IPC
     call, and it is what makes a Finder drop worth anything to a harness that runs on the
     operator's own filesystem. */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file as File) || null;
    } catch {
      return null;
    }
  },
  restoreLibrary: () => invoke(MEDIA_CHANNELS.restoreLibrary),
  loadMarketplacePublicLibrary: () => invoke(MEDIA_CHANNELS.loadMarketplacePublicLibrary),
  loadMarketplacePackCatalog: () => invoke(MEDIA_CHANNELS.loadMarketplacePackCatalog),
  loadMarketplacePackDocument: (id) => invoke(MEDIA_CHANNELS.loadMarketplacePackDocument, id),
  loadMarketplaceInstalls: () => invoke(MEDIA_CHANNELS.loadMarketplaceInstalls),
  mutateMarketplaceInstalls: (mutation) => invoke(MEDIA_CHANNELS.mutateMarketplaceInstalls, mutation),
  loadWorkspaceOverview: (workspaceId) => invoke(MEDIA_CHANNELS.loadWorkspaceOverview, workspaceId),
  loadWorkspaceUnitPage: (workspaceId, cursors) => invoke(MEDIA_CHANNELS.loadWorkspaceUnitPage, workspaceId, cursors),
  loadSharedLibraryPage: (workspaceId, query) => (
    invoke(MEDIA_CHANNELS.loadSharedLibraryPage, workspaceId, query)
  ),
  loadSharedLibraryArtifact: (workspaceId, artifactId) => (
    invoke(MEDIA_CHANNELS.loadSharedLibraryArtifact, workspaceId, artifactId)
  ),
  loadSharedLibraryRevisions: (workspaceId, artifactId, after) => (
    invoke(MEDIA_CHANNELS.loadSharedLibraryRevisions, workspaceId, artifactId, after)
  ),
  selectSharedLibraryRevision: (workspaceId, artifactId, revisionId, expectedSelectedRevisionId) => (
    invoke(
      MEDIA_CHANNELS.selectSharedLibraryRevision,
      workspaceId,
      artifactId,
      revisionId,
      expectedSelectedRevisionId,
    )
  ),
  resolveSharedLibraryPreview: (workspaceId, artifactId) => (
    invoke(MEDIA_CHANNELS.resolveSharedLibraryPreview, workspaceId, artifactId)
  ),
  performSharedLibraryAction: (workspaceId, artifactId, action) => (
    invoke(MEDIA_CHANNELS.performSharedLibraryAction, workspaceId, artifactId, action)
  ),
  loadMemory: (workspaceId, input) => invoke(MEDIA_CHANNELS.loadMemory, workspaceId, input),
  showMemory: (workspaceId, memoryEntryId) => invoke(MEDIA_CHANNELS.showMemory, workspaceId, memoryEntryId),
  mutateMemory: (workspaceId, input) => invoke(MEDIA_CHANNELS.mutateMemory, workspaceId, input),
  loadMemoryHistory: (workspaceId, memoryEntryId) => invoke(MEDIA_CHANNELS.loadMemoryHistory, workspaceId, memoryEntryId),
  recallMemory: (workspaceId) => invoke(MEDIA_CHANNELS.recallMemory, workspaceId),
  loadMemoryHealth: (workspaceId) => invoke(MEDIA_CHANNELS.loadMemoryHealth, workspaceId),
  loadCalendar: (workspaceId, input) => invoke(MEDIA_CHANNELS.loadCalendar, workspaceId, input),
  mutateCalendar: (workspaceId, input) => invoke(MEDIA_CHANNELS.mutateCalendar, workspaceId, input),
  connectCalendar: (workspaceId, credential) => invoke(MEDIA_CHANNELS.connectCalendar, workspaceId, credential),
  reconnectCalendarAccount: (workspaceId, input) => invoke(MEDIA_CHANNELS.reconnectCalendarAccount, workspaceId, input),
  resolveCalendarPreview: (workspaceId, projectId, ref) => invoke(MEDIA_CHANNELS.resolveCalendarPreview, workspaceId, projectId, ref),
  searchLocalModels: (input) => invoke(MEDIA_CHANNELS.searchLocalModels, input),
  loadLocalModelDetail: (ref) => invoke(MEDIA_CHANNELS.loadLocalModelDetail, ref),
  refreshLocalModelMachine: () => invoke(MEDIA_CHANNELS.refreshLocalModelMachine),
  openLocalModelProvider: (url) => invoke(MEDIA_CHANNELS.openLocalModelProvider, url),
  applyNativeAppearance: (theme) => invoke(MEDIA_CHANNELS.applyNativeAppearance, theme),
  loadProjectOverview: (project) => invoke(MEDIA_CHANNELS.loadProjectOverview, project),
  loadProjectPage: (input) => invoke(MEDIA_CHANNELS.loadProjectPage, input),
  loadProjectActivityRun: (project, runId) => invoke(MEDIA_CHANNELS.loadProjectActivityRun, project, runId),
  loadProjectMediaCard: (project, ref) => invoke(MEDIA_CHANNELS.loadProjectMediaCard, project, ref),
  loadProjectGeneration: (project, target, after) => (
    invoke(MEDIA_CHANNELS.loadProjectGeneration, project, target, after)
  ),
  loadProjectMediaRevisions: (project, artifactId, after) => (
    invoke(MEDIA_CHANNELS.loadProjectMediaRevisions, project, artifactId, after)
  ),
  reviewProjectMedia: (project, input) => invoke(MEDIA_CHANNELS.reviewProjectMedia, project, input),
  selectProjectMediaRevision: (project, artifactId, revisionId, expectedSelectedRevisionId) => (
    invoke(
      MEDIA_CHANNELS.selectProjectMediaRevision,
      project,
      artifactId,
      revisionId,
      expectedSelectedRevisionId,
    )
  ),
  performProjectMediaAction: (project, ref, action) => (
    invoke(MEDIA_CHANNELS.performProjectMediaAction, project, ref, action)
  ),
  importProjectMediaAsset: (project, ref) => (
    invoke(MEDIA_CHANNELS.importProjectMediaAsset, project, ref)
  ),
  loadDocumentPreview: (project, revisionId) => (
    invoke(MEDIA_CHANNELS.loadDocumentPreview, project, revisionId)
  ),
  searchProjectDocuments: (project, query, cursor) => (
    invoke(MEDIA_CHANNELS.searchProjectDocuments, project, query, cursor)
  ),
  showProjectDocument: (project, documentId) => (
    invoke(MEDIA_CHANNELS.showProjectDocument, project, documentId)
  ),
  createProjectDocument: (project, input) => invoke(MEDIA_CHANNELS.createProjectDocument, project, input),
  reviseProjectDocument: (project, input) => (
    invoke(MEDIA_CHANNELS.reviseProjectDocument, project, input)
  ),
  resolveProjectPreview: (project, ref) => (
    invoke(MEDIA_CHANNELS.resolveProjectPreview, project, ref)
  ),
  loadProjectComposition: (project, compositionId) => (
    invoke(MEDIA_CHANNELS.loadProjectComposition, project, compositionId)
  ),
  loadProjectCompositionRevision: (project, revisionId) => (
    invoke(MEDIA_CHANNELS.loadProjectCompositionRevision, project, revisionId)
  ),
  loadProjectCompositionBuild: (project, buildId) => (
    invoke(MEDIA_CHANNELS.loadProjectCompositionBuild, project, buildId)
  ),
  loadProjectCompositionPage,
  reviseProjectComposition: (project, input) => (
    invoke(MEDIA_CHANNELS.reviseProjectComposition, project, input)
  ),
  selectProjectCompositionRevision: (project, input) => (
    invoke(MEDIA_CHANNELS.selectProjectCompositionRevision, project, input)
  ),
  buildProjectComposition: (project, compositionRevisionId, profile) => (
    invoke(MEDIA_CHANNELS.buildProjectComposition, project, compositionRevisionId, profile)
  ),
  resolveCompositionOutputPreview: (project, artifactRevisionId) => (
    invoke(MEDIA_CHANNELS.resolveCompositionOutputPreview, project, artifactRevisionId)
  ),
  loadProjectUnit: (project, unitId) => (
    invoke(MEDIA_CHANNELS.loadProjectUnit, project, unitId)
  ),
  loadProjectUnitRevision: (project, unitId, revisionId) => (
    invoke(MEDIA_CHANNELS.loadProjectUnitRevision, project, unitId, revisionId)
  ),
  loadProjectUnitPage,
  loadProjectUnitPreview: (project, revisionId, platform) => (
    invoke(MEDIA_CHANNELS.loadProjectUnitPreview, project, revisionId, platform)
  ),
  selectProjectUnitRevision: (project, unitId, revisionId, expectedSelectedRevisionId) => (
    invoke(
      MEDIA_CHANNELS.selectProjectUnitRevision,
      project,
      unitId,
      revisionId,
      expectedSelectedRevisionId,
    )
  ),
  onMediaEvent(callback: (event: MediaEvent) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: MediaEvent): void => {
      callback(payload);
    };
    ipcRenderer.on(MEDIA_CHANNELS.event, listener);
    return () => ipcRenderer.removeListener(MEDIA_CHANNELS.event, listener);
  },
  loadAnnotations: () => invoke(MEDIA_CHANNELS.loadAnnotations),
  updateAnnotations: (updates: Record<string, AnnotationInput>) => (
    invoke(MEDIA_CHANNELS.updateAnnotations, updates)
  ),
  trashItems: (paths) => invoke(MEDIA_CHANNELS.trashItems, paths),
  showInFinder: (path) => invoke(MEDIA_CHANNELS.showInFinder, path),
  openExternal: (path) => invoke(MEDIA_CHANNELS.openExternal, path),
  startFileDrag: (path) => invoke(MEDIA_CHANNELS.startFileDrag, path),
  copyText: (text) => invoke(MEDIA_CHANNELS.copyText, text),
  copyMigrationRecoveryCommand: () => invoke(MEDIA_CHANNELS.copyMigrationRecoveryCommand),
  readText: (path, maxBytes) => invoke(MEDIA_CHANNELS.readText, path, maxBytes),
  getMediaUrl: (path) => invoke(MEDIA_CHANNELS.getMediaUrl, path),
  getAgentProviders: () => invoke(AGENT_CHANNELS.providers),
  loadAgentHistory: (sessionId, workspaceId) => invoke(AGENT_CHANNELS.history, sessionId, workspaceId),
  loginAgentProvider: (provider) => invoke(AGENT_CHANNELS.login, provider),
  setAgentApiKey: (provider, apiKey) => (
    invoke(AGENT_CHANNELS.setApiKey, provider, apiKey)
  ),
  clearAgentApiKey: (provider) => invoke(AGENT_CHANNELS.clearApiKey, provider),
  sendAgentMessage: (request: AgentChatRequest) => (
    invoke(AGENT_CHANNELS.send, request)
  ),
  stopAgent: () => invoke(AGENT_CHANNELS.stop),
  onAgentEvent(callback: (event: AgentChatEnvelope) => void) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: AgentChatEnvelope,
    ): void => callback(payload);
    ipcRenderer.on(AGENT_CHANNELS.event, listener);
    return () => ipcRenderer.removeListener(AGENT_CHANNELS.event, listener);
  },
  onToggleRightPanel(callback) {
    const listener = (): void => callback();
    ipcRenderer.on(APP_CHANNELS.toggleRightPanel, listener);
    return () => ipcRenderer.removeListener(APP_CHANNELS.toggleRightPanel, listener);
  },
};

contextBridge.exposeInMainWorld("ralphy", mediaBridge);
