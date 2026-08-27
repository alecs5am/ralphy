import { contextBridge, ipcRenderer, webUtils } from "electron";
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
  loadDocumentPreview: (project, revisionId) => (
    invoke(MEDIA_CHANNELS.loadDocumentPreview, project, revisionId)
  ),
  searchProjectDocuments: (project, query, cursor) => (
    invoke(MEDIA_CHANNELS.searchProjectDocuments, project, query, cursor)
  ),
  showProjectDocument: (project, documentId) => (
    invoke(MEDIA_CHANNELS.showProjectDocument, project, documentId)
  ),
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
