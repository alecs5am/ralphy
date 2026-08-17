import type {
  MediaFilter,
  MediaKind as CoreMediaKind,
  MediaProvenance,
} from "../ralphy/types";

export type ReviewStatus =
  | "Unreviewed"
  | "Approved"
  | "Shortlist"
  | "Needs Work"
  | "Reject";

export type MediaEntity =
  | "final-render"
  | "generated-artifact"
  | "reference"
  | "unit-asset"
  | "lifecycle-document"
  | "production-file"
  | "other-project-file";

export type MediaKind =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "pdf"
  | "other";

export interface ProjectReference {
  workspaceId: string;
  projectId: string;
}

export type ProjectTab = "documents" | "media" | "compositions" | "units" | "activity";
export const PROJECT_MEDIA_FILTERS = [
  "all",
  "references",
  "working",
  "candidate",
  "approved",
  "rejected",
  "superseded",
  "run-diagnostics",
  "run-cache-temp",
  "advanced-objects",
] as const satisfies readonly ("all" | MediaFilter)[];
export type ProjectMediaFilter = typeof PROJECT_MEDIA_FILTERS[number];
export type ProjectMediaKind = CoreMediaKind;
export type ProjectMediaQuery = {
  filter: ProjectMediaFilter;
  mediaKind?: ProjectMediaKind;
  provenance?: MediaProvenance;
};
export type ProjectMediaAction = "open" | "finder" | "copy";
export type ProjectUnitPageRequest =
  | { kind: "revisions"; unitId: string; cursor?: string | null }
  | { kind: "items"; revisionId: string; cursor?: string | null }
  | { kind: "presentations"; revisionId: string; cursor?: string | null };
export type ProjectCompositionPageRequest =
  | { kind: "revisions"; compositionId: string; cursor?: string | null }
  | { kind: "sources" | "inputs" | "revision-evaluations" | "builds"; revisionId: string; cursor?: string | null }
  | { kind: "build-outputs" | "build-evaluations"; buildId: string; cursor?: string | null };
export type { MediaProvenance };
export type ProjectPage = { items: unknown[]; nextCursor: string | number | null };
export type ProjectPreview = { url: string; sizeBytes: number };

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string;
  absolutePath: string;
  projectCount: number;
  sharedCount: number;
  unitCount: number;
  finalCount: number;
  recentActivity: string;
}

export interface ProjectSummary extends ProjectReference {
  id: string;
  name: string;
  brief: string;
  status: string;
  phase: string | null;
  finalState: string;
  platform: string | null;
  aspectRatio: string | null;
  spendUsd: number | null;
  finalCount: number;
  sharedCount: number;
  unitCount: number;
  recentActivity: string;
}

export interface GenerationAttribution {
  provider: string;
  model: string;
  operation: string;
  timestamp: string;
  costUsd: number | null;
  slot: string | null;
}

export interface MediaItem extends ProjectReference {
  id: string;
  name: string;
  absolutePath: string;
  projectRelativePath: string;
  entity: MediaEntity;
  kind: MediaKind;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  generation: GenerationAttribution | null;
}

export interface MediaPreviewSource {
  url: string;
  sizeBytes: number;
}

export const MAX_WAVEFORM_DECODE_BYTES = 24 * 1024 * 1024;

export interface MediaAnnotation {
  reviewStatus: ReviewStatus;
  favorite: boolean;
  rating: number;
  tags: string[];
  notes: string;
  updatedAt: string;
}

export interface AnnotationInput {
  reviewStatus: ReviewStatus;
  favorite: boolean;
  rating: number;
  tags: string[];
  notes: string;
}

export interface AnnotationStore {
  version: number;
  items: Record<string, MediaAnnotation>;
}

export interface CatalogProgress {
  generation: number;
  workspacesRead: number;
  projectsRead: number;
}

export interface CatalogResult {
  rootPath: string;
  generation: number;
  workspaces: WorkspaceSummary[];
  projects: ProjectSummary[];
  mediaItemCount: 0;
  completedAt: string;
}

export interface GenerationLedgerResult {
  entries: GenerationAttribution[];
  totalCostUsd: number;
  malformedLineCount: number;
  oversizedLineCount: number;
  truncated: boolean;
}

export interface LibraryOpenResult {
  identity: RootIdentity;
  catalog: CatalogResult;
}

export interface RootIdentity {
  storeId: string;
  label: string;
  rootEpoch: number;
  activitySequence: number;
}

export type ActivityRefreshEvent = {
  type: "activity-refresh";
  storeId: string;
  rootEpoch: number;
  sequence: number;
};

export interface MigrationRecovery {
  runId: string;
  phase: string;
}

export interface TextReadResult {
  text: string;
  totalBytes: number;
  truncated: boolean;
}

export interface TrashResult {
  trashed: string[];
  failed: Array<{ path: string; error: string }>;
}

export interface TerminalDimensions {
  cols: number;
  rows: number;
}

export interface TerminalSession {
  id: string;
  label: string;
  shell: string;
  pid: number;
  status: "running" | "exited";
  exitCode?: number;
  signal?: number;
}

export type TerminalEvent =
  | { type: "data"; sessionId: string; data: string }
  | { type: "exit"; sessionId: string; exitCode: number; signal: number };

export type AgentProvider = "claude" | "codex" | "openrouter";
export type AgentPermissionMode = "auto" | "plan" | "full";
export type ClaudeAuthMethod = "subscription" | "api-key";
export type ClaudePermissionMode = AgentPermissionMode;

export interface ClaudeAuthState {
  binaryReady: boolean;
  subscriptionLoggedIn: boolean;
  subscriptionAuthMethod: string | null;
  apiKeyConfigured: boolean;
  inheritedApiKey: boolean;
}

export type AgentChatEvent =
  | { type: "session"; sessionId: string; tools: string[] }
  | { type: "text-delta"; text: string }
  | { type: "tool-start"; id: string; name: string; summary: string }
  | { type: "tool-result"; id: string; ok: boolean }
  | {
    type: "result";
    ok: boolean;
    cancelled: boolean;
    costUsd: number;
    durationMs: number;
    sessionId: string | null;
  }
  | { type: "error"; code: string; message: string };

export type ClaudeChatEvent = AgentChatEvent;

export interface AgentChatRequest {
  chatId: string;
  provider: AgentProvider;
  model: string;
  prompt: string;
  project?: ProjectReference | null;
  claudeAuthMethod: ClaudeAuthMethod;
  permissionMode: AgentPermissionMode;
  resumeSessionId?: string | null;
}

export interface AgentModelOption {
  id: string;
  label: string;
  description: string;
}

export interface AgentProviderStatus {
  id: AgentProvider;
  label: string;
  binaryReady: boolean;
  accountConnected: boolean;
  apiKeyConfigured: boolean;
  inheritedApiKey: boolean;
  connected: boolean;
  detail: string;
  models: AgentModelOption[];
  defaultModel: string;
}

export interface AgentChatEnvelope {
  storeId: string;
  chatId: string;
  provider: AgentProvider;
  event: AgentChatEvent;
}

export type MediaEvent =
  | { type: "root-ready"; identity: RootIdentity }
  | ActivityRefreshEvent
  | { type: "migration-recovery"; recovery: MigrationRecovery }
  | { type: "catalog-progress"; progress: CatalogProgress }
  | { type: "catalog-result"; result: CatalogResult }
  | { type: "error"; operation: string; message: string; generation?: number };

export interface MediaWorkbenchBridge {
  chooseLibrary(): Promise<LibraryOpenResult | null>;
  restoreLibrary(): Promise<LibraryOpenResult | null>;
  loadWorkspaceOverview(workspaceId: string): Promise<import("../ralphy/types").WorkspaceOverviewDto>;
  loadProjectOverview(project: ProjectReference): Promise<import("../ralphy/types").ProjectOverviewDto>;
  loadProjectPage(input: {
    tab: ProjectTab;
    project: ProjectReference;
    cursor?: string | number | null;
    mediaQuery?: ProjectMediaQuery;
  }): Promise<ProjectPage>;
  loadProjectMediaCard(
    project: ProjectReference,
    ref: import("../ralphy/types").MediaCardDto["ref"],
  ): Promise<import("../ralphy/types").MediaCardDto>;
  loadProjectGeneration(
    project: ProjectReference,
    target: import("../ralphy/types").MediaGenerationTarget,
    after?: string | null,
  ): Promise<import("../ralphy/types").MediaGenerationDetailDto>;
  loadProjectMediaRevisions(
    project: ProjectReference,
    artifactId: string,
    after?: string | null,
  ): Promise<import("../ralphy/types").Page<import("../ralphy/types").ArtifactRevisionDto>>;
  selectProjectMediaRevision(
    project: ProjectReference,
    artifactId: string,
    revisionId: string,
    expectedSelectedRevisionId: string | null,
  ): Promise<import("../ralphy/types").ArtifactMediaCardDto>;
  performProjectMediaAction(
    project: ProjectReference,
    ref: import("../ralphy/types").MediaCardDto["ref"],
    action: ProjectMediaAction,
  ): Promise<void>;
  loadDocumentPreview(project: ProjectReference, revisionId: string): Promise<{
    revisionId: string;
    format: string;
    text: string;
    truncated: boolean;
  }>;
  searchProjectDocuments(project: ProjectReference, query: string, cursor?: string | null): Promise<import("../ralphy/types").Page<import("../ralphy/types").DocumentSearchDto>>;
  showProjectDocument(project: ProjectReference, documentId: string): Promise<import("../ralphy/types").DocumentDetailDto>;
  reviseProjectDocument(project: ProjectReference, input: {
    documentId: string;
    expectedHeadId?: string | null;
    iterationId?: string | null;
    format: "markdown" | "text" | "json";
    title?: string | null;
    body: import("../ralphy/types").JsonValue;
  }): Promise<import("../ralphy/types").DocumentRevisionDto>;
  resolveProjectPreview(project: ProjectReference, ref: import("../ralphy/types").MediaCardDto["ref"]): Promise<ProjectPreview | null>;
  loadProjectComposition(project: ProjectReference, compositionId: string): Promise<import("../ralphy/types").CompositionDto>;
  loadProjectCompositionRevision(project: ProjectReference, revisionId: string): Promise<import("../ralphy/types").CompositionRevisionDto>;
  loadProjectCompositionBuild(project: ProjectReference, buildId: string): Promise<import("../ralphy/types").BuildDto>;
  loadProjectCompositionPage(project: ProjectReference, request: ProjectCompositionPageRequest): Promise<import("../ralphy/types").Page<import("../ralphy/types").CompositionRevisionDto | import("../ralphy/types").CompositionSourceDto | import("../ralphy/types").CompositionInputDto | import("../ralphy/types").EvaluationDto | import("../ralphy/types").BuildDto | import("../ralphy/types").BuildOutputDto>>;
  reviseProjectComposition(project: ProjectReference, input: import("../ralphy/project-reader").ReviseCompositionInput): Promise<import("../ralphy/types").CompositionRevisionDto>;
  selectProjectCompositionRevision(project: ProjectReference, input: {
    compositionId: string;
    revisionId: string;
    expectedSelectedRevisionId: string | null;
  }): Promise<import("../ralphy/types").CompositionDto>;
  buildProjectComposition(project: ProjectReference, compositionRevisionId: string, profile?: import("../ralphy/types").JsonValue): Promise<import("../ralphy/types").CompositionBuildCompletion>;
  resolveCompositionOutputPreview(project: ProjectReference, artifactRevisionId: string): Promise<import("../ralphy/project-reader").CompositionOutputPreview>;
  loadProjectUnit(project: ProjectReference, unitId: string): Promise<import("../ralphy/types").UnitDto>;
  loadProjectUnitRevision(project: ProjectReference, unitId: string, revisionId: string): Promise<import("../ralphy/types").UnitRevisionDto>;
  loadProjectUnitPage(project: ProjectReference, request: Extract<ProjectUnitPageRequest, { kind: "revisions" }>): Promise<import("../ralphy/types").Page<import("../ralphy/types").UnitRevisionDto>>;
  loadProjectUnitPage(project: ProjectReference, request: Extract<ProjectUnitPageRequest, { kind: "items" }>): Promise<import("../ralphy/types").Page<import("../ralphy/types").UnitItemDto>>;
  loadProjectUnitPage(project: ProjectReference, request: Extract<ProjectUnitPageRequest, { kind: "presentations" }>): Promise<import("../ralphy/types").Page<import("../ralphy/types").UnitPresentationDto>>;
  selectProjectUnitRevision(project: ProjectReference, unitId: string, revisionId: string, expectedSelectedRevisionId: string | null): Promise<import("../ralphy/types").UnitDto>;
  onMediaEvent(callback: (event: MediaEvent) => void): () => void;
  loadAnnotations(): Promise<AnnotationStore>;
  updateAnnotations(updates: Record<string, AnnotationInput>): Promise<AnnotationStore>;
  trashItems(paths: string[]): Promise<TrashResult>;
  showInFinder(path: string): Promise<void>;
  openExternal(path: string): Promise<string>;
  startFileDrag(path: string): Promise<void>;
  copyText(text: string): Promise<void>;
  copyMigrationRecoveryCommand(): Promise<void>;
  readText(path: string, maxBytes?: number): Promise<TextReadResult>;
  getMediaUrl(path: string): Promise<MediaPreviewSource>;
  createTerminal(dimensions: TerminalDimensions): Promise<TerminalSession>;
  writeTerminal(sessionId: string, data: string): Promise<void>;
  resizeTerminal(sessionId: string, dimensions: TerminalDimensions): Promise<void>;
  killTerminal(sessionId: string): Promise<void>;
  onTerminalEvent(callback: (event: TerminalEvent) => void): () => void;
  getAgentProviders(): Promise<AgentProviderStatus[]>;
  loginAgentProvider(provider: "claude" | "codex"): Promise<AgentProviderStatus[]>;
  setAgentApiKey(
    provider: "claude" | "openrouter",
    apiKey: string,
  ): Promise<AgentProviderStatus[]>;
  clearAgentApiKey(provider: "claude" | "openrouter"): Promise<AgentProviderStatus[]>;
  sendAgentMessage(request: AgentChatRequest): Promise<void>;
  stopAgent(): Promise<void>;
  onAgentEvent(callback: (event: AgentChatEnvelope) => void): () => void;
  onToggleRightPanel(callback: () => void): () => void;
}

export const APP_CHANNELS = {
  toggleRightPanel: "app:toggle-right-panel",
} as const;

export const MEDIA_CHANNELS = {
  chooseLibrary: "media:library:choose",
  restoreLibrary: "media:library:restore",
  loadWorkspaceOverview: "workspace:overview",
  loadProjectOverview: "project:overview",
  loadProjectPage: "project:page",
  loadProjectMediaCard: "project:media:show",
  loadProjectGeneration: "project:media:generation",
  loadProjectMediaRevisions: "project:media:revisions",
  selectProjectMediaRevision: "project:media:select",
  performProjectMediaAction: "project:media:action",
  loadDocumentPreview: "project:document-preview",
  searchProjectDocuments: "project:documents:search",
  showProjectDocument: "project:document:show",
  reviseProjectDocument: "project:document:revise",
  resolveProjectPreview: "project:preview",
  loadProjectComposition: "project:composition:show",
  loadProjectCompositionRevision: "project:composition:revision:show",
  loadProjectCompositionBuild: "project:composition:build:show",
  loadProjectCompositionPage: "project:composition:page",
  reviseProjectComposition: "project:composition:revise",
  selectProjectCompositionRevision: "project:composition:select",
  buildProjectComposition: "project:composition:build",
  resolveCompositionOutputPreview: "project:composition:output-preview",
  loadProjectUnit: "project:unit:show",
  loadProjectUnitRevision: "project:unit:revision:show",
  loadProjectUnitPage: "project:unit:page",
  selectProjectUnitRevision: "project:unit:select",
  event: "media:event",
  loadAnnotations: "media:annotations:load",
  updateAnnotations: "media:annotations:update",
  trashItems: "media:files:trash",
  showInFinder: "media:files:finder",
  openExternal: "media:files:open",
  startFileDrag: "media:files:drag",
  copyText: "media:clipboard:write",
  copyMigrationRecoveryCommand: "media:migration:recovery-command",
  readText: "media:text:read",
  getMediaUrl: "media:url",
} as const;

export const TERMINAL_CHANNELS = {
  create: "terminal:create",
  write: "terminal:write",
  resize: "terminal:resize",
  kill: "terminal:kill",
  event: "terminal:event",
} as const;

export const AGENT_CHANNELS = {
  providers: "agent:providers",
  login: "agent:login",
  setApiKey: "agent:api-key:set",
  clearApiKey: "agent:api-key:clear",
  send: "agent:send",
  stop: "agent:stop",
  event: "agent:event",
} as const;

export type WorkerRequest =
  { type: "catalog"; requestId: number; rootPath: string; generation: number };

export type WorkerResponse =
  | { type: "catalog-progress"; requestId: number; progress: CatalogProgress }
  | { type: "catalog-result"; requestId: number; result: CatalogResult }
  | { type: "error"; requestId: number; message: string };
