export const BRIDGE_PROTOCOL_VERSION = 1 as const;
export const BRIDGE_LIMITS = {
  maxFrameBytes: 1_048_576,
  maxRequestIdBytes: 128,
  maxInFlight: 64,
  maxSeenIds: 65_536,
  maxOutboundBytes: 8_388_608,
  maxAgentDeltaBytes: 65_536,
} as const;

export const BRIDGE_METHODS = [
  "system.hello",
  "consumer.authenticate",
  "consumer.session.start",
  "consumer.session.end",
  "session.start",
  "session.show",
  "session.list",
  "session.end",
  "workspace.list",
  "workspace.show",
  "workspace.update",
  "workspace.overview",
  "workspace.account.list",
  "workspace.account.upsert",
  "workspace.export",
  "workspace.import",
  "memory.list",
  "memory.show",
  "memory.create",
  "memory.revise",
  "memory.approve",
  "memory.reject",
  "memory.retire",
  "memory.history",
  "memory.recall",
  "memory.health",
  "project.list",
  "project.show",
  "project.update",
  "project.status",
  "project.overview",
  "project.iteration.list",
  "project.iteration.create",
  "feedback.list",
  "feedback.add",
  "feedback.resolve",
  "generation.start",
  "document.create",
  "document.list",
  "document.show",
  "document.revisions",
  "document.content",
  "document.search",
  "document.revise",
  "document.bind",
  "media.generation.show",
  "media.list",
  "media.show",
  "media.revisions",
  "media.revision.show",
  "media.select",
  "media.review",
  "evaluation.list",
  "evaluation.show",
  "evaluation.create",
  "run.list",
  "run.show",
  "run.attempts",
  "run.objects",
  "run.results",
  "run.cancel",
  "operation.find",
  "composition.list",
  "composition.show",
  "composition.revisions",
  "composition.revision.show",
  "composition.sources",
  "composition.inputs",
  "composition.builds",
  "build.show",
  "build.outputs",
  "composition.revise",
  "composition.build",
  "composition.select",
  "unit.create",
  "unit.list",
  "unit.show",
  "unit.revisions",
  "unit.revision.show",
  "unit.items",
  "unit.presentations",
  "presentation.items",
  "presentation.captions",
  "unit.revise",
  "unit.select",
  "unit.preview",
  "publication.list",
  "publication.publish",
  "publication.lookup",
  "publication.cancel",
  "publication.reconcile",
  "publication.recover",
  "publication.refresh",
  "repair.start",
  "metric.list",
  "metric.totals",
  "campaign.list",
  "campaign.show",
  "campaign.update",
  "calendar.list",
  "calendar.update",
  "calendar.overview",
  "calendar.create",
  "calendar.submit",
  "calendar.reschedule",
  "calendar.remove",
  "calendar.retry",
  "activity.list",
  "activity.subscribe",
  "activity.unsubscribe",
  "locator.resolve",
  "agent.providers",
  "agent.credential.status",
  "agent.credential.set",
  "agent.credential.clear",
  "agent.auth.status",
  "agent.auth.login",
  "agent.turn.start",
  "agent.turn.resume",
  "agent.turn.status",
  "agent.turn.stop",
  "migration.secret.import",
  "migration.desktop.import",
  "transcription.start",
  "transform.start",
] as const;

export type BridgeMethod = (typeof BRIDGE_METHODS)[number];

export type BridgeRequest = {
  v: 1;
  id: string;
  method: string;
  params?: unknown;
};

export type BridgeSuccess = {
  v: 1;
  id: string;
  ok: true;
  result: unknown;
};

export interface BridgeErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export type BridgeFailure = {
  v: 1;
  id: string | null;
  ok: false;
  error: BridgeErrorPayload;
};

export interface ActivityDto {
  sequence: number;
  workspaceId: string | null;
  projectId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: number;
}

export type BridgeEvent =
  | {
    v: 1;
    event: "activity";
    subscriptionId: string;
    sequence: number;
    data: ActivityDto;
  }
  | {
    v: 1;
    event: "agent";
    agentSessionId: string;
    turnId: string;
    sequence: number;
    data: unknown;
  };

export interface BridgeHello {
  protocolVersion: 1;
  schemaVersion: number;
  coreVersion: string;
  storeId: string;
  rootId: string;
  capabilities: BridgeMethod[];
  activitySequence: number;
  startup: { state: "ready"; migration: "complete" };
  limits: typeof BRIDGE_LIMITS;
}

export type BridgeContext =
  | { sessionId: string; workspaceId?: never; projectId?: never }
  | { sessionId?: never; workspaceId: string; projectId?: string };

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export interface Page<Item, Cursor = string> { items: Item[]; nextCursor: Cursor | null }
export interface AckDto { ok: true }

interface EntityDto { id: string }
interface ScopedDto extends EntityDto { workspaceId: string; projectId: string | null }
interface RevisionDto extends EntityDto { revisionNo: number; createdAt: number }

export interface WorkspaceDto extends EntityDto {
  slug: string;
  name: string;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
}
export interface SocialAccountDto extends EntityDto {
  workspaceId: string;
  platform: string;
  provider: string;
  handle: string | null;
  relinkRequired: boolean;
}
export interface ProjectDto extends EntityDto {
  workspaceId: string;
  slug: string;
  name: string;
  state: "active" | "archived";
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
}
export interface SessionDto extends ScopedDto {
  tool: string;
  state: string;
  startedAt: number;
  endedAt: number | null;
}
export interface IterationDto extends EntityDto {
  projectId: string;
  ordinal: number;
  state: string;
  createdAt: number;
}
export interface FeedbackDto extends EntityDto {
  projectId: string;
  iterationId: string;
  text: string;
  state: string;
  createdAt: number;
}
export interface DocumentDto extends ScopedDto {
  kind: "brief" | "style-guide" | "production-plan" | "scenario" | "storyboard" | "research" | "postmortem" | "memory" | "note" | "custom";
  slug: string;
  title: string;
  currentRevisionId: string | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
}
export interface DocumentRevisionDto extends RevisionDto {
  documentId: string;
  parentRevisionId: string | null;
  iterationId: string | null;
  format: "markdown" | "text" | "json";
  title: string | null;
  authoredBySessionId: string | null;
}
export interface DocumentDetailDto extends DocumentDto {
  currentRevision: DocumentRevisionDto | null;
}
export interface DocumentSearchDto {
  documentId: string;
  revisionId: string;
  workspaceId: string;
  projectId: string | null;
  kind: DocumentDto["kind"];
  slug: string;
  documentTitle: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  format: DocumentRevisionDto["format"];
  title: string | null;
  authoredBySessionId: string | null;
  createdAt: number;
}
export interface DocumentBindingDto {
  ownerType: "project" | "build";
  ownerId: string;
  role: string;
  documentId: string;
  boundRevisionId: string;
  currentHeadRevisionId: string | null;
  hasNewerHead: boolean;
}
export type MediaRef = { type: "artifact" | "run-object" | "object"; id: string };
export type MediaKind = "image" | "video" | "audio" | "document" | "other";
export type MediaProvenance = "generation" | "not-generation" | "unknown";
export type MediaFilter =
  | "references" | "working" | "candidate" | "approved" | "rejected"
  | "superseded" | "run-diagnostics" | "run-cache-temp"
  | "advanced-objects";
export type RunObjectLocationClass = "temp" | "cache" | "bucket" | "other";
export type ArtifactMediaCardDto = {
  ref: { type: "artifact"; id: string };
  workspaceId: string;
  projectId: string | null;
  slug: string;
  kind: string;
  selectedRevisionId: string | null;
  selectedState: string | null;
  mime: string | null;
  bytes: number | null;
  selectedAt: number | null;
  revisionCount: number;
  selectedObjectId: string | null;
  storageClass: string | null;
  usageRoles: string[];
  target: { type: "object"; id: string } | null;
  mediaKind: MediaKind;
  provenance: MediaProvenance;
};
export type RunObjectMediaCardDto = {
  ref: { type: "run-object"; id: string };
  workspaceId: string | null;
  projectId: string | null;
  runId: string;
  purpose: string;
  state: string;
  retention: string;
  mime: string | null;
  bytes: number | null;
  createdAt: number;
  objectId: string | null;
  logicalPath: string;
  locationClass: RunObjectLocationClass;
  attemptId: null;
  attemptNo: null;
  target: { type: "object"; id: string } | { type: "run-object"; id: string };
  mediaKind: MediaKind;
  provenance: MediaProvenance;
};
export type ObjectMediaCardDto = {
  ref: { type: "object"; id: string };
  workspaceId: string;
  projectId: string | null;
  storageClass: string;
  mime: string;
  bytes: number;
  createdAt: number;
  referenceCount: number;
  target: { type: "object"; id: string };
  mediaKind: MediaKind;
  provenance: MediaProvenance;
};
export type MediaCardDto = ArtifactMediaCardDto | RunObjectMediaCardDto | ObjectMediaCardDto;
export type ArtifactRevisionState =
  | "working"
  | "candidate"
  | "approved"
  | "rejected"
  | "superseded"
  | "archived";
export type ArtifactRevisionDto = {
  id: string;
  artifactId: string;
  objectId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  state: ArtifactRevisionState;
  authoredBySessionId: string | null;
  createdAt: number;
};
export interface RunAttemptDto extends EntityDto {
  runId: string;
  attemptNo: number;
  provider: string | null;
  model: string | null;
  state: RunState;
  costUsd: number | null;
  startedAt: number;
  endedAt: number | null;
}
export type EvaluationTargetType = "artifact_revision" | "composition_revision" | "build" | "run";
export type EvaluationTarget = { type: EvaluationTargetType; id: string };
export interface EvaluationDto extends ScopedDto {
  target: EvaluationTarget;
  kind: string;
  verdict: string | null;
  favorite: boolean;
  rating: number | null;
  tags: string[];
  note: string | null;
  authoredBySessionId: string;
  createdAt: number;
}
export type RunState = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export interface RunDto extends EntityDto {
  workspaceId: string | null;
  projectId: string | null;
  agentSessionId: string | null;
  kind: string;
  label: string | null;
  state: RunState;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}
export type GenerationTextRole = "prompt" | "text" | "negative-prompt";
export type GenerationParameterName =
  | "size"
  | "durationSec"
  | "aspectRatio"
  | "resolution"
  | "generateAudio"
  | "referenceCount"
  | "referenceVideoCount"
  | "hasFirstFrame"
  | "hasLastFrame"
  | "hasImage"
  | "voiceSpecified"
  | "stability"
  | "similarityBoost"
  | "style"
  | "speed"
  | "speakerBoost"
  | "forceInstrumental"
  | "promptInfluence"
  | "language"
  | "backend";
export type GenerationInputDto = {
  version: 1;
  texts: Array<{ role: GenerationTextRole; value: string; truncated: boolean }>;
  parameters: Array<{
    name: GenerationParameterName;
    value: string | number | boolean;
  }>;
};
export type MediaGenerationTarget =
  | { type: "artifact-revision"; id: string }
  | { type: "run-object"; id: string };
export type GenerationAttemptDetailDto = RunAttemptDto & {
  input: GenerationInputDto | null;
};
export type MediaGenerationDetailDto =
  | {
      status: "generation";
      target: MediaGenerationTarget;
      run: RunDto;
      attempts: Page<GenerationAttemptDetailDto>;
      cost: { knownUsd: number | null; complete: boolean };
    }
  | {
      status: "not-generation";
      target: MediaGenerationTarget;
      producer: RunDto;
    }
  | {
      status: "unknown";
      target: MediaGenerationTarget;
      reason: "not-recorded" | "ambiguous";
    };
export interface RunObjectDto extends EntityDto {
  workspaceId: string | null;
  projectId: string | null;
  runId: string;
  objectId: string | null;
  purpose: string;
  state: string;
  retention: string;
  mime: string | null;
  bytes: number | null;
  logicalPath: string;
  locationClass: RunObjectLocationClass;
  attemptId: null;
  attemptNo: null;
  createdAt: number;
}
export interface RunResultDto extends EntityDto {
  runId: string;
  position: number;
  entityType: string;
  entityId: string;
  createdAt: number;
}
export interface ExternalOperation {
  runId: string;
  nodeId: string;
  attempt: number;
  operation: string;
  idempotencyKey: string;
}
export interface OperationAccepted {
  runId: string;
  state: RunState;
  results: Page<RunResultDto>;
  replayed: boolean;
}
export type CompositionKind = "video" | "carousel" | "sticker-pack" | "image" | "audio" | "document" | "custom";
export interface CompositionDto extends EntityDto {
  projectId: string;
  slug: string;
  kind: CompositionKind;
  latestRevisionId: string | null;
  selectedRevisionId: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface CompositionRevisionDto extends RevisionDto {
  compositionId: string;
  parentRevisionId: string | null;
  iterationId: string | null;
  state: "draft" | "sealed";
  engine: string;
  engineVersion: string | null;
  authoredBySessionId: string | null;
  sealedAt: number | null;
}
export interface CompositionSourceDto extends EntityDto {
  compositionRevisionId: string;
  objectId: string;
  position: number;
  createdAt: number;
}
export interface CompositionInputDto extends EntityDto {
  compositionRevisionId: string;
  artifactRevisionId: string;
  role: string;
  position: number;
  createdAt: number;
}
export interface BuildDto extends EntityDto {
  compositionRevisionId: string;
  runId: string | null;
  state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: number;
  finishedAt: number | null;
}
export interface BuildOutputDto extends EntityDto {
  buildId: string;
  artifactRevisionId: string;
  role: string | null;
  position: number;
  createdAt: number;
}
export interface CompositionBuildCompletion {
  id: string;
  compositionRevisionId: string;
  runId: string;
  state: "succeeded";
  createdAt: number;
  finishedAt: number | null;
  outputs: Array<{
    artifactRevisionId: string;
    objectId: string;
    role: string | null;
    position: number;
  }>;
}
export interface UnitDto extends ScopedDto {
  compositionId: string | null;
  slug: string;
  format: string;
  latestRevisionId: string | null;
  selectedRevisionId: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface UnitRevisionDto extends RevisionDto {
  unitId: string;
  compositionRevisionId: string | null;
  parentRevisionId: string | null;
  iterationId: string | null;
  note: string | null;
  authoredBySessionId: string | null;
  sealedAt: number | null;
}
export interface UnitItemDto extends EntityDto {
  unitRevisionId: string;
  artifactRevisionId: string | null;
  documentRevisionId: string | null;
  role: string;
  position: number;
  config: JsonValue | null;
  createdAt: number;
}
export interface UnitPresentationDto extends EntityDto {
  unitRevisionId: string;
  platform: string;
  position: number;
  effectiveCaptionRevisionId: string | null;
  coverArtifactRevisionId: string | null;
  crop: JsonValue | null;
  safeArea: JsonValue | null;
  options: JsonValue;
  createdAt: number;
}
export interface PresentationItemDto extends EntityDto {
  presentationId: string;
  unitItemId: string;
  position: number;
  config: JsonValue | null;
  createdAt: number;
}
export interface PresentationCaptionRevisionDto extends RevisionDto {
  presentationId: string;
  parentRevisionId: string | null;
  state: "draft" | "humanized" | "auto-draft-archived" | "final";
  text: string;
}
export interface UnitPreviewDto {
  unitRevisionId: string;
  platform: string;
  presentation: JsonObject;
}
export interface PublicationDto extends ScopedDto {
  unitRevisionId: string;
  platform: string;
  state: string;
  externalId: string | null;
  createdAt: number;
}
export interface PublicationRecoveryResult {
  publication: PublicationDto;
  run: RunDto;
}
export interface MetricDto extends EntityDto {
  publicationId: string;
  capturedAt: number;
  values: JsonObject;
}
export interface CampaignDto extends ScopedDto {
  name: string;
  state: string;
  rowVersion: number;
}
export interface CalendarEntryDto extends ScopedDto {
  publicationId: string | null;
  scheduledAt: number;
  rowVersion: number;
}
export type CalendarChannelStatus = "draft" | "scheduled" | "uploading" | "published" | "failed" | "disconnected";
export type CalendarEventStatus = "draft" | "scheduled" | "uploading" | "published" | "partial" | "failed";
export interface CalendarChannelPublicationDto {
  id: string | null;
  platform: string;
  accountId: string | null;
  account: string;
  status: CalendarChannelStatus;
  at: number | null;
  postUrl: string | null;
  error: string | null;
  settings: JsonValue;
}
export interface CalendarMetricsDto {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  syncedAt: number;
}
export interface CalendarEventDto {
  id: string;
  rowVersion: number;
  unitId: string;
  unitRevisionId: string;
  title: string;
  projectId: string | null;
  project: string;
  kind: string;
  thumbnail: { type: "artifact-revision"; id: string } | null;
  at: number | null;
  draftAt: number | null;
  timezone: string;
  pinnedRevision: number;
  unitSelectedRevision: number | null;
  status: CalendarEventStatus;
  channels: CalendarChannelPublicationDto[];
  metrics: CalendarMetricsDto | null;
}
export interface CalendarReadyUnitDto {
  unitId: string;
  unitRevisionId: string | null;
  title: string;
  projectId: string | null;
  project: string;
  revision: number | null;
  kind: string;
  thumbnail: { type: "artifact-revision"; id: string } | null;
  platforms: string[];
  channels: Array<CalendarChannelInput & { platform: string; account: string }>;
  revisions: Array<{
    unitRevisionId: string;
    revision: number;
    thumbnail: { type: "artifact-revision"; id: string } | null;
    platforms: string[];
    channels: Array<CalendarChannelInput & { platform: string; account: string }>;
  }>;
  readiness: "ready" | "review" | "blocked" | "draft";
  note: string | null;
}
export interface CalendarWorkspaceDto {
  timezone: string;
  postiz: { available: boolean; lastSyncedAt: number | null; error: string | null };
  events: CalendarEventDto[];
  readyUnits: CalendarReadyUnitDto[];
  projects: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; platform: string; handle: string; disconnected: boolean; rowVersion: number }>;
}
export interface CalendarChannelInput {
  presentationId: string;
  socialAccountId: string;
  settings: JsonValue;
}
export interface AgentProviderDto { id: string; name: string; capabilities: string[] }
export interface CredentialStatusDto { provider: string; state: string; source: string | null }
export interface AgentTurnDto {
  turnId: string;
  runId: string;
  agentSessionId: string;
  state: string;
}
export interface AgentTurnEventDto {
  turnId: string;
  sequence: number;
  kind: string;
  data: JsonValue;
}
export type OverviewPage<Item, Cursor = string> = Page<Item, Cursor>;
export type OverviewProjectDto = ProjectDto & { purpose: string | null };
export type OverviewProjectDocumentDto = DocumentDto & { binding: DocumentBindingDto | null };
export interface OverviewIterationDto extends EntityDto {
  projectId: string;
  number: number;
  title: string;
  state: "active" | "closed";
  priorIterationChanges: string | null;
  createdAt: number;
  closedAt: number | null;
}
export interface OverviewAccountDto {
  id: string;
  workspaceId: string;
  platform: string;
  externalId: string;
  displayName: string | null;
  username: string | null;
  credentialConfigured: boolean;
  credentialSource: "encrypted" | "environment" | "subscription" | "missing";
  relinkRequired: boolean;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
}
export interface OverviewPublicationDto {
  id: string;
  unitId: string;
  presentationId: string;
  platform: string;
  socialAccountId: string | null;
  rail: "postiz" | "github-pages" | "devto" | "hashnode" | "manual";
  state: "draft" | "submitting" | "scheduled" | "submitted" | "published"
    | "failed" | "cancelled" | "reconciliation_required" | "unknown";
  url: string | null;
  scheduledAt: number | null;
  submittedAt: number | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}
export interface MetricTotals {
  publicationCount: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  watchTimeMs: number | null;
}
export interface WorkspaceOverviewDto {
  workspace: WorkspaceDto;
  documents?: Page<DocumentDto>;
  units?: Page<UnitDto>;
  accounts?: Page<OverviewAccountDto>;
  projects?: Page<ProjectDto>;
  activity?: Page<ActivityDto, number>;
  sharedMedia?: Page<MediaCardDto>;
  publications?: Page<OverviewPublicationDto>;
  metrics?: MetricTotals;
}
export interface OverviewFeedbackDto extends EntityDto {
  projectId: string;
  iterationId: string;
  status: "open" | "resolved" | "dismissed";
  targetType: "document_revision" | "artifact_revision" | "composition_revision" | "build" | "build_output" | "unit_item" | "unit_presentation" | null;
  targetId: string | null;
  createdAt: number;
  resolvedAt: number | null;
}
export interface OverviewRunDto extends EntityDto {
  workspaceId: string | null;
  projectId: string | null;
  kind: string;
  label: string | null;
  state: RunState;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}
export interface ProjectOverviewDto {
  project: OverviewProjectDto;
  spendUsd: number;
  documents?: OverviewPage<OverviewProjectDocumentDto>;
  iterations?: OverviewPage<OverviewIterationDto>;
  feedback?: OverviewPage<OverviewFeedbackDto>;
  stages?: OverviewPage<{ id: string; projectId: string; stage: string; state: string; entityType: string | null; entityId: string | null; rowVersion: number; updatedAt: number }>;
  compositions?: OverviewPage<CompositionDto>;
  builds?: OverviewPage<BuildDto>;
  units?: OverviewPage<UnitDto>;
  runs?: OverviewPage<OverviewRunDto>;
  activity?: OverviewPage<ActivityDto, number>;
  mediaCounts?: { artifacts: number; objects: number; runObjects: number };
  publications?: Page<OverviewPublicationDto>;
  metrics?: MetricTotals;
}
export interface LocatorDto { absolutePath: string; mime: string | null; bytes: number }
export interface MigrationDto { runId: string; state: string; issues: number }

export interface MigrationSecretImportParams {
  sourcePath: string;
  encryptedSourcePath: string;
  authorizationNonce: string;
  runId: string;
  sourceEntryId: string;
  ref: string;
  kind: "text";
  value: string;
}

export interface MigrationSecretImportResult {
  ref: string;
  kind: "text";
  completed: true;
}

type EmptyParams = Record<string, never>;
type ScopedParams = { context: BridgeContext };
type CursorParams = { after?: string | null; limit?: number };
type HistoryOrderParams = { order?: "oldest" | "newest" };
type ScopedCursorParams = ScopedParams & CursorParams;
type IdParams<Key extends string> = ScopedParams & { [Field in Key]: string };
type Contract<Params, Result> = { params: Params; result: Result };
type ProjectOverviewPage = { after?: string | null; limit: number };
type WorkspaceOverviewSections = {
  documents?: ProjectOverviewPage;
  units?: ProjectOverviewPage;
  accounts?: ProjectOverviewPage;
  projects?: ProjectOverviewPage;
  activity?: { afterSequence: number; limit: number };
  sharedMedia?: ProjectOverviewPage & { filter?: MediaFilter };
  publications?: ProjectOverviewPage;
  metrics?: true;
};
type ProjectOverviewSections = {
  documents?: ProjectOverviewPage;
  iterations?: ProjectOverviewPage;
  feedback?: ProjectOverviewPage;
  stages?: ProjectOverviewPage;
  compositions?: ProjectOverviewPage;
  builds?: ProjectOverviewPage;
  units?: ProjectOverviewPage;
  runs?: ProjectOverviewPage;
  activity?: { afterSequence: number; limit: number };
  mediaCounts?: true;
  publications?: ProjectOverviewPage;
  metrics?: true;
};
type ExternalOperationParams = { external?: ExternalOperation };
type EvaluationListFilter =
  | { target?: EvaluationTarget; targetType?: never }
  | { target?: never; targetType?: EvaluationTargetType };
type ExternalOperationTuple = Omit<ExternalOperation, "idempotencyKey">;
type OperationFindSelector =
  | { external: ExternalOperationTuple; idempotencyKey?: never }
  | { idempotencyKey: string; external?: never };
type ReplayableOperationParams = {
  sessionId: string;
  external: ExternalOperation;
  workspaceId: string;
  projectId?: string;
  label?: string;
  request: JsonValue;
  job: {
    kind: "generate.image" | "generate.video" | "generate.voiceover" | "generate.music"
      | "generate.captions" | "generate.sfx" | "render" | "shell";
    command: { argv: string[] };
  };
  priority?: number;
  tag?: string;
  resultsLimit?: number;
};
export interface MediaReviewParams {
  context: BridgeContext;
  ref: { type: "artifact"; id: string };
  expectedSelectedRevisionId: string;
  verdict: "shortlist" | "approved" | "rejected" | "needs-work";
  favorite?: boolean;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  tags?: string[];
  notes?: string;
  iterationId?: string;
  feedback?: string;
}

export interface MediaReviewResult {
  card: MediaCardDto & { ref: { type: "artifact"; id: string } };
  revision: ArtifactRevisionDto;
  evaluation: EvaluationDto;
  feedback: FeedbackDto | null;
}

export type MemoryTier = "global" | "workspace";
export type MemoryStatus = "active" | "proposed" | "rejected" | "archived";
export type MemoryType = "model" | "craft" | "tooling" | "client" | "style" | "user" | "legacy";
export type MemoryQualityFlag =
  | "missing-rule"
  | "missing-why"
  | "missing-how-to-apply"
  | "missing-negative-scope";
export interface MemoryBodyDto {
  rule: string;
  why: string;
  howToApply: string[];
  doesNotApplyTo: string[];
}
export interface MemoryDetailDto {
  id: string;
  revisionId: string;
  slug: string;
  version: number;
  revisionNo: number;
  tier: MemoryTier;
  workspace?: string;
  status: MemoryStatus;
  name: string;
  description: string;
  type: MemoryType;
  filed: string;
  source: string;
  body: MemoryBodyDto;
  rawBody: string;
  qualityFlags: MemoryQualityFlag[];
  overridesGlobal: boolean;
}
export interface MemoryWriteInput {
  tier: MemoryTier;
  status: "active" | "proposed";
  slug: string;
  name: string;
  description: string;
  type: Exclude<MemoryType, "legacy">;
  body: MemoryBodyDto;
  source: string;
}
export interface MemoryRecallDto {
  workspace: string;
  workspaceId: string;
  count: number;
  workspaceCount: number;
  globalCount: number;
  overriddenGlobalSlugs: string[];
  truncated: boolean;
  note: string;
  entries: MemoryDetailDto[];
}
export interface MemoryHealthDto {
  scanned: number;
  findings: Array<{
    memoryEntryId: string;
    slug: string;
    flags: MemoryQualityFlag[];
  }>;
}

export interface BridgeMethodContract {
  "system.hello": Contract<EmptyParams, BridgeHello>;
  "consumer.authenticate": Contract<{ namespace: "farm"; tokenBase64url: string }, AckDto>;
  "consumer.session.start": Contract<{ workspaceId: string; projectId?: string; tool: string; label?: string }, SessionDto>;
  "consumer.session.end": Contract<{ sessionId: string }, SessionDto>;
  "session.start": Contract<{ workspaceId: string; projectId?: string; tool: string; label?: string }, SessionDto>;
  "session.show": Contract<{ sessionId: string }, SessionDto>;
  "session.list": Contract<ScopedCursorParams, Page<SessionDto>>;
  "session.end": Contract<{ sessionId: string }, SessionDto>;
  "workspace.list": Contract<CursorParams, Page<WorkspaceDto>>;
  "workspace.show": Contract<IdParams<"workspaceId">, WorkspaceDto>;
  "workspace.update": Contract<IdParams<"workspaceId"> & { expectedRowVersion: number; patch: JsonObject }, WorkspaceDto>;
  /* `include` widens what a section counts as the workspace's: "owned" (the default, and what an
     older Core answers when the field is absent) is `project_id IS NULL`, "tree" is the whole
     workspace with its Projects. */
  "workspace.overview": Contract<IdParams<"workspaceId"> & { include?: "owned" | "tree"; sections: WorkspaceOverviewSections }, WorkspaceOverviewDto>;
  "workspace.account.list": Contract<IdParams<"workspaceId"> & CursorParams, Page<SocialAccountDto>>;
  "workspace.account.upsert": Contract<IdParams<"workspaceId"> & { account: JsonObject }, SocialAccountDto>;
  "workspace.export": Contract<IdParams<"workspaceId"> & { idempotencyKey: string }, {
    runId: string;
    packageObjectId: string;
    manifestSummary: { version: number; workspaceId: string; entityCounts: JsonObject };
  }>;
  "workspace.import": Contract<ScopedParams & {
    packageObjectId: string;
    idempotencyKey: string;
    entityAfter?: string | null;
    entityLimit?: number;
    relinkAfter?: string | null;
    relinkLimit?: number;
  }, { workspaceId: string; entityMapPage: Page<JsonObject>; relinkPage: Page<JsonObject> }>;
  "memory.list": Contract<ScopedParams & {
    scope?: "effective" | MemoryTier;
    status?: MemoryStatus;
    query?: string;
    types?: MemoryType[];
    order?: "slug" | "name";
  }, { items: MemoryDetailDto[] }>;
  "memory.show": Contract<ScopedParams & { memoryEntryId: string }, MemoryDetailDto>;
  "memory.create": Contract<ScopedParams & MemoryWriteInput, MemoryDetailDto>;
  "memory.revise": Contract<ScopedParams & Omit<MemoryWriteInput, "tier" | "slug"> & {
    memoryEntryId: string;
    expectedRevisionId: string;
  }, MemoryDetailDto>;
  "memory.approve": Contract<ScopedParams & { memoryEntryId: string; expectedRevisionId: string }, unknown>;
  "memory.reject": Contract<ScopedParams & { memoryEntryId: string; expectedRevisionId: string }, unknown>;
  "memory.retire": Contract<ScopedParams & { memoryEntryId: string; expectedRevisionId: string }, unknown>;
  "memory.history": Contract<ScopedParams & { memoryEntryId: string }, { items: MemoryDetailDto[] }>;
  "memory.recall": Contract<ScopedParams & { full?: boolean }, MemoryRecallDto>;
  "memory.health": Contract<ScopedParams, MemoryHealthDto>;
  "project.list": Contract<IdParams<"workspaceId"> & CursorParams, Page<ProjectDto>>;
  "project.show": Contract<IdParams<"projectId">, ProjectDto>;
  "project.update": Contract<IdParams<"projectId"> & { expectedRowVersion: number; patch: JsonObject }, ProjectDto>;
  "project.status": Contract<IdParams<"projectId">, { projectId: string; status: string; currentIterationId: string | null }>;
  "project.overview": Contract<IdParams<"projectId"> & { sections: ProjectOverviewSections }, ProjectOverviewDto>;
  "project.iteration.list": Contract<IdParams<"projectId"> & CursorParams, Page<IterationDto>>;
  "project.iteration.create": Contract<IdParams<"projectId"> & { label?: string }, IterationDto>;
  "feedback.list": Contract<IdParams<"projectId"> & CursorParams & { state?: string }, Page<FeedbackDto>>;
  "feedback.add": Contract<IdParams<"projectId"> & { iterationId: string; text: string; target?: MediaRef }, FeedbackDto>;
  "feedback.resolve": Contract<IdParams<"feedbackId"> & { resolutionRevisionId: string }, FeedbackDto>;
  "document.create": Contract<ScopedParams & { slug: string; kind: string; format: string; body: string }, DocumentDto>;
  "document.list": Contract<ScopedCursorParams, Page<DocumentDto>>;
  "document.show": Contract<IdParams<"documentId">, DocumentDetailDto>;
  "document.revisions": Contract<IdParams<"documentId"> & CursorParams, Page<DocumentRevisionDto>>;
  "document.content": Contract<ScopedParams & { revisionId: string; afterByte: number; limitBytes: number }, {
    revisionId: string;
    format: DocumentRevisionDto["format"];
    text: string;
    nextByte: number | null;
  }>;
  "document.search": Contract<ScopedCursorParams & { query: string }, Page<DocumentSearchDto>>;
  "document.revise": Contract<IdParams<"documentId"> & {
    expectedHeadId?: string | null;
    iterationId?: string | null;
    format: DocumentRevisionDto["format"];
    title?: string | null;
    body: JsonValue;
  }, DocumentRevisionDto>;
  "document.bind": Contract<ScopedParams & (
    | { projectId: string; buildId?: never; role: string }
    | { projectId?: never; buildId: string; role: string }
  ) & {
    revisionId: string;
    expectedRevisionId: string | null;
  }, DocumentBindingDto>;
  "media.list": Contract<ScopedCursorParams & {
    filter?: MediaFilter;
    types?: MediaRef["type"][];
    mediaKind?: MediaKind;
    provenance?: MediaProvenance;
  }, Page<MediaCardDto>>;
  "media.show": Contract<ScopedParams & { ref: MediaRef }, MediaCardDto>;
  "media.generation.show": Contract<ScopedParams & { target: MediaGenerationTarget } & CursorParams, MediaGenerationDetailDto>;
  "media.revisions": Contract<ScopedParams & { ref: { type: "artifact"; id: string } } & CursorParams, Page<ArtifactRevisionDto>>;
  "media.revision.show": Contract<ScopedParams & { revisionId: string }, ArtifactRevisionDto>;
  "media.select": Contract<ScopedParams & {
    ref: { type: "artifact"; id: string };
    revisionId: string;
    expectedSelectedRevisionId: string | null;
  }, MediaCardDto>;
  "media.review": Contract<MediaReviewParams, MediaReviewResult>;
  "evaluation.list": Contract<ScopedCursorParams & HistoryOrderParams & EvaluationListFilter, Page<EvaluationDto>>;
  "evaluation.show": Contract<IdParams<"evaluationId">, EvaluationDto>;
  "evaluation.create": Contract<ScopedParams & {
    target: { type: string; id: string };
    kind: string;
    verdict: string;
    favorite?: boolean;
    rating?: 1 | 2 | 3 | 4 | 5 | null;
    tags?: string[];
    note?: string;
    report?: JsonValue;
  }, EvaluationDto>;
  "generation.start": Contract<ReplayableOperationParams, OperationAccepted>;
  "run.list": Contract<ScopedCursorParams & { kind?: string; state?: string }, Page<RunDto>>;
  "run.show": Contract<IdParams<"runId">, RunDto>;
  "run.attempts": Contract<IdParams<"runId"> & CursorParams, Page<RunAttemptDto>>;
  "run.objects": Contract<IdParams<"runId"> & CursorParams, Page<RunObjectDto>>;
  "run.results": Contract<IdParams<"runId"> & CursorParams, Page<RunResultDto>>;
  "run.cancel": Contract<IdParams<"runId"> & { expectedState: string }, RunDto>;
  "operation.find": Contract<ScopedParams & OperationFindSelector & {
    resultsAfter?: string | null;
    resultsLimit?: number;
  }, { run: RunDto; results: Page<RunResultDto>; replayed: true }>;
  "composition.list": Contract<ScopedCursorParams & { projectId: string }, Page<CompositionDto>>;
  "composition.show": Contract<IdParams<"compositionId">, CompositionDto>;
  "composition.revisions": Contract<IdParams<"compositionId"> & CursorParams & HistoryOrderParams, Page<CompositionRevisionDto>>;
  "composition.revision.show": Contract<ScopedParams & { revisionId: string }, CompositionRevisionDto>;
  "composition.sources": Contract<ScopedParams & { revisionId: string } & CursorParams, Page<CompositionSourceDto>>;
  "composition.inputs": Contract<ScopedParams & { revisionId: string } & CursorParams, Page<CompositionInputDto>>;
  "composition.builds": Contract<ScopedParams & { compositionRevisionId: string } & CursorParams & HistoryOrderParams, Page<BuildDto>>;
  "build.show": Contract<ScopedParams & { buildId: string }, BuildDto>;
  "build.outputs": Contract<ScopedParams & { buildId: string } & CursorParams, Page<BuildOutputDto>>;
  "composition.revise": Contract<IdParams<"compositionId"> & {
    expectedLatestRevisionId: string | null;
    parentRevisionId?: string | null;
    iterationId?: string | null;
    engine: string;
    engineVersion?: string | null;
    engineConfig?: JsonValue;
  }, CompositionRevisionDto>;
  "composition.build": Contract<ScopedParams & { compositionRevisionId: string; profile?: JsonValue }, CompositionBuildCompletion>;
  "composition.select": Contract<IdParams<"compositionId"> & { revisionId: string; expectedSelectedRevisionId: string | null }, CompositionDto>;
  "unit.create": Contract<ScopedParams & { slug: string; format: string; compositionId?: string | null }, UnitDto>;
  "unit.list": Contract<ScopedCursorParams, Page<UnitDto>>;
  "unit.show": Contract<IdParams<"unitId">, UnitDto>;
  "unit.revisions": Contract<IdParams<"unitId"> & CursorParams & HistoryOrderParams, Page<UnitRevisionDto>>;
  "unit.revision.show": Contract<ScopedParams & { revisionId: string }, UnitRevisionDto>;
  "unit.items": Contract<ScopedParams & { revisionId: string } & CursorParams, Page<UnitItemDto>>;
  "unit.presentations": Contract<ScopedParams & { revisionId: string } & CursorParams, Page<UnitPresentationDto>>;
  "presentation.items": Contract<ScopedParams & { presentationId: string } & CursorParams, Page<PresentationItemDto>>;
  "presentation.captions": Contract<ScopedParams & { presentationId: string } & CursorParams, Page<PresentationCaptionRevisionDto>>;
  "unit.revise": Contract<IdParams<"unitId"> & {
    expectedLatestRevisionId: string | null;
    compositionRevisionId?: string | null;
    parentRevisionId?: string | null;
    iterationId?: string | null;
    note?: string | null;
    metadata?: JsonValue;
    items: JsonObject[];
    presentations?: JsonObject[];
  }, UnitRevisionDto>;
  "unit.select": Contract<IdParams<"unitId"> & { revisionId: string; expectedSelectedRevisionId: string | null }, UnitDto>;
  "unit.preview": Contract<ScopedParams & { unitRevisionId: string; platform: string }, UnitPreviewDto>;
  "publication.list": Contract<ScopedCursorParams & { unitId?: string; platform?: string; state?: string }, Page<PublicationDto>>;
  "publication.publish": Contract<ScopedParams & ExternalOperationParams & { unitRevisionId: string; platform: string; input?: JsonObject }, OperationAccepted>;
  "publication.lookup": Contract<IdParams<"publicationId"> & ExternalOperationParams, OperationAccepted>;
  "publication.cancel": Contract<IdParams<"publicationId"> & (
    | { expectedState: "draft"; external?: never }
    | { expectedState: "scheduled" | "submitted"; external?: ExternalOperation }
  ), PublicationDto | OperationAccepted>;
  "publication.reconcile": Contract<IdParams<"publicationId"> & ExternalOperationParams, OperationAccepted>;
  "publication.recover": Contract<IdParams<"publicationId"> & {
    expectedState: string;
    expectedClaimKind: "status-lookup" | "cancellation" | "reconciliation";
    expectedClaimRunId: string;
    expectedClaimEpoch: number;
  }, PublicationRecoveryResult>;
  "publication.refresh": Contract<IdParams<"publicationId"> & ExternalOperationParams, OperationAccepted>;
  "repair.start": Contract<ReplayableOperationParams, OperationAccepted>;
  "metric.list": Contract<IdParams<"publicationId"> & CursorParams, Page<MetricDto>>;
  "metric.totals": Contract<IdParams<"publicationId">, { publicationId: string; values: JsonObject }>;
  "campaign.list": Contract<ScopedCursorParams, Page<CampaignDto>>;
  "campaign.show": Contract<IdParams<"campaignId">, CampaignDto>;
  "campaign.update": Contract<IdParams<"campaignId"> & { expectedRowVersion: number; patch: JsonObject }, CampaignDto>;
  "calendar.list": Contract<ScopedCursorParams & { from?: number; to?: number }, Page<CalendarEntryDto>>;
  "calendar.update": Contract<IdParams<"calendarEntryId"> & { expectedRowVersion: number; patch: JsonObject }, CalendarEntryDto>;
  "calendar.overview": Contract<ScopedParams & { from: string; to: string; timezone: string }, CalendarWorkspaceDto>;
  "calendar.create": Contract<ScopedParams & { unitRevisionId: string; at: number | null; draftAt: number; timezone: string; channels: CalendarChannelInput[] }, CalendarEventDto>;
  "calendar.submit": Contract<ScopedParams & { eventId: string; expectedRowVersion: number; at: number }, CalendarEventDto>;
  "calendar.reschedule": Contract<ScopedParams & { eventId: string; expectedRowVersion: number; at: number }, CalendarEventDto>;
  "calendar.remove": Contract<ScopedParams & { eventId: string; expectedRowVersion: number }, CalendarEventDto>;
  "calendar.retry": Contract<ScopedParams & { eventId: string; expectedRowVersion: number }, CalendarEventDto>;
  "activity.list": Contract<
    | { context: BridgeContext; afterSequence: number; limit: number }
    | { afterSequence: number; limit: number },
    Page<ActivityDto, number>
  >;
  "activity.subscribe": Contract<
    { subscriptionId: string; afterSequence: number },
    { subscriptionId: string; sequence: number }
  >;
  "activity.unsubscribe": Contract<
    { subscriptionId: string },
    { subscriptionId: string; unsubscribed: true }
  >;
  "locator.resolve": Contract<ScopedParams & {
    target: { type: "object" | "run-object"; id: string };
    purpose: "preview" | "read-text" | "finder" | "open" | "drag";
  }, LocatorDto>;
  "agent.providers": Contract<EmptyParams, AgentProviderDto[]>;
  "agent.credential.status": Contract<ScopedParams & { provider: string }, CredentialStatusDto>;
  "agent.credential.set": Contract<ScopedParams & { provider: string; value: string; accountId?: string; expectedRowVersion?: number }, { provider: string; configured: boolean }>;
  "agent.credential.clear": Contract<ScopedParams & { provider: string }, CredentialStatusDto>;
  "agent.auth.status": Contract<ScopedParams & { provider: string }, CredentialStatusDto>;
  "agent.auth.login": Contract<ScopedParams & { provider: string }, CredentialStatusDto>;
  "agent.turn.start": Contract<ScopedParams & {
    provider: string;
    prompt: string;
    chatId?: string;
    external?: ExternalOperation;
    input?: JsonObject;
  }, AgentTurnDto>;
  "agent.turn.resume": Contract<ScopedParams & ExternalOperationParams & { turnId: string; prompt: string; chatId?: string }, AgentTurnDto>;
  "agent.turn.status": Contract<ScopedParams & { turnId: string } & CursorParams, { turn: AgentTurnDto; events: Page<AgentTurnEventDto> }>;
  "agent.turn.stop": Contract<ScopedParams & { turnId: string; expectedState: string }, AgentTurnDto>;
  "migration.secret.import": Contract<MigrationSecretImportParams, MigrationSecretImportResult>;
  "migration.desktop.import": Contract<{ payload: JsonObject; idempotencyKey: string }, MigrationDto>;
  "transcription.start": Contract<ReplayableOperationParams, OperationAccepted>;
  "transform.start": Contract<ReplayableOperationParams, OperationAccepted>;
}

type AssertNever<Value extends never> = Value;
export type MissingBridgeMethodContracts = AssertNever<Exclude<BridgeMethod, keyof BridgeMethodContract>>;
export type ExtraBridgeMethodContracts = AssertNever<Exclude<keyof BridgeMethodContract, BridgeMethod>>;
export type ParamsFor<Method extends BridgeMethod> = BridgeMethodContract[Method]["params"];
export type ResultFor<Method extends BridgeMethod> = BridgeMethodContract[Method]["result"];
