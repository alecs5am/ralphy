import { contextBridge, ipcRenderer } from "electron";
import { type IpcResult, unwrapIpcResult } from "./ipc-security";
import {
  AGENT_CHANNELS,
  APP_CHANNELS,
  MEDIA_CHANNELS,
  TERMINAL_CHANNELS,
  type AnnotationInput,
  type AgentChatEnvelope,
  type AgentChatRequest,
  type MediaEvent,
  type MediaWorkbenchBridge,
  type ProjectReference,
  type ProjectUnitPageRequest,
  type TerminalEvent,
} from "./media/types";
import type { Page, UnitItemDto, UnitPresentationDto, UnitRevisionDto } from "./ralphy/types";

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

const mediaBridge: MediaWorkbenchBridge = {
  chooseLibrary: () => invoke(MEDIA_CHANNELS.chooseLibrary),
  restoreLibrary: () => invoke(MEDIA_CHANNELS.restoreLibrary),
  loadWorkspaceOverview: (workspaceId) => invoke(MEDIA_CHANNELS.loadWorkspaceOverview, workspaceId),
  loadProjectOverview: (project) => invoke(MEDIA_CHANNELS.loadProjectOverview, project),
  loadProjectPage: (input) => invoke(MEDIA_CHANNELS.loadProjectPage, input),
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
  createTerminal: (dimensions) => invoke(TERMINAL_CHANNELS.create, dimensions),
  writeTerminal: (sessionId, data) => invoke(TERMINAL_CHANNELS.write, sessionId, data),
  resizeTerminal: (sessionId, dimensions) => (
    invoke(TERMINAL_CHANNELS.resize, sessionId, dimensions)
  ),
  killTerminal: (sessionId) => invoke(TERMINAL_CHANNELS.kill, sessionId),
  onTerminalEvent(callback: (event: TerminalEvent) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalEvent): void => {
      callback(payload);
    };
    ipcRenderer.on(TERMINAL_CHANNELS.event, listener);
    return () => ipcRenderer.removeListener(TERMINAL_CHANNELS.event, listener);
  },
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
