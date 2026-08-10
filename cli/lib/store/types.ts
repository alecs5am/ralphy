import type { MediaArtifactKind } from "../schemas/media-artifact.js";
import type { QueryContext } from "./scope-context.js";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ProjectState = "active" | "archived";

export type IterationState = "active" | "closed";

export type FeedbackStatus = "open" | "resolved" | "dismissed";
export type FeedbackTargetType =
  | "document_revision"
  | "artifact_revision"
  | "composition_revision"
  | "build"
  | "build_output"
  | "unit_item"
  | "unit_presentation";

export type TargetReference = {
  type: FeedbackTargetType;
  id: string;
};

export type EntityReference = {
  entityType: FeedbackTargetType;
  entityId: string;
};

export type IterationDto = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  reason: string | null;
  state: IterationState;
  createdAt: number;
  closedAt: number | null;
};

export type FeedbackDto = {
  id: string;
  projectId: string;
  iterationId: string;
  targetType: FeedbackTargetType | null;
  targetId: string | null;
  timecodeMs: number | null;
  body: string;
  status: FeedbackStatus;
  resolutionNote: string | null;
  createdAt: number;
  resolvedAt: number | null;
};

export type FeedbackResolutionLinkDto = {
  id: string;
  projectId: string;
  feedbackId: string;
  entityType: FeedbackTargetType;
  entityId: string;
  createdAt: number;
};

export type ProjectStageDto = {
  id: string;
  projectId: string;
  stage: string;
  state: string;
  entityType: string | null;
  entityId: string | null;
  rowVersion: number;
  updatedAt: number;
};

export type AgentSessionDto = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  agent: string;
  startedAt: number;
  endedAt: number | null;
};

export type DocumentKind =
  | "brief"
  | "style-guide"
  | "production-plan"
  | "scenario"
  | "storyboard"
  | "research"
  | "postmortem"
  | "memory"
  | "note"
  | "custom";

export type DocumentFormat = "markdown" | "text" | "json";

export type DocumentDto = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  kind: DocumentKind;
  slug: string;
  title: string;
  currentRevisionId: string | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type DocumentRevisionDto = {
  id: string;
  documentId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  format: DocumentFormat;
  title: string | null;
  authoredBySessionId: string | null;
  createdAt: number;
};

export type DocumentDetailDto = DocumentDto & {
  currentRevision: DocumentRevisionDto | null;
};

export type DocumentSearchDto = {
  documentId: string;
  revisionId: string;
  workspaceId: string;
  projectId: string | null;
  kind: DocumentKind;
  slug: string;
  documentTitle: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  format: DocumentFormat;
  title: string | null;
  authoredBySessionId: string | null;
  createdAt: number;
};

export type ObjectStorageClass = "durable" | "working" | "diagnostic";

export type ObjectDto = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  mime: string;
  bytes: number;
  storageClass: ObjectStorageClass;
  createdAt: number;
};

export type ArtifactKind = Exclude<MediaArtifactKind, "ref">;

export type ArtifactRevisionState =
  | "working"
  | "candidate"
  | "approved"
  | "rejected"
  | "superseded"
  | "archived";

export type ArtifactDto = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  slug: string;
  kind: ArtifactKind;
  selectedRevisionId: string | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

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

export type ArtifactRelationDto = {
  id: string;
  fromRevisionId: string;
  toRevisionId: string;
  relation: string;
  createdAt: number;
};

export type ArtifactUsageDto = {
  id: string;
  artifactRevisionId: string;
  workspaceId: string | null;
  projectId: string | null;
  feedbackId: string | null;
  role: string;
  lifecycle: string | null;
  createdAt: number;
};

export type CompositionKind =
  | "video"
  | "carousel"
  | "sticker-pack"
  | "image"
  | "audio"
  | "document"
  | "custom";

export type CompositionRevisionState = "draft" | "sealed";

export type BuildState =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type CompositionDto = {
  id: string;
  projectId: string;
  slug: string;
  kind: CompositionKind;
  latestRevisionId: string | null;
  selectedRevisionId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CompositionRevisionDto = {
  id: string;
  compositionId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  state: CompositionRevisionState;
  engine: string;
  engineVersion: string | null;
  authoredBySessionId: string | null;
  createdAt: number;
  sealedAt: number | null;
};

export type CompositionSourceDto = {
  id: string;
  compositionRevisionId: string;
  objectId: string;
  position: number;
  createdAt: number;
};

export type CompositionInputDto = {
  id: string;
  compositionRevisionId: string;
  artifactRevisionId: string;
  role: string;
  position: number;
  createdAt: number;
};

export type BuildDto = {
  id: string;
  compositionRevisionId: string;
  runId: string | null;
  state: BuildState;
  createdAt: number;
  finishedAt: number | null;
};

export type BuildOutputDto = {
  id: string;
  buildId: string;
  artifactRevisionId: string;
  role: string | null;
  position: number;
  createdAt: number;
};

export type UnitDto = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  slug: string;
  format: string;
  latestRevisionId: string | null;
  selectedRevisionId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type UnitRevisionDto = {
  id: string;
  unitId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  note: string | null;
  authoredBySessionId: string | null;
  createdAt: number;
  sealedAt: number | null;
};

export type UnitItemDto = {
  id: string;
  unitRevisionId: string;
  artifactRevisionId: string | null;
  documentRevisionId: string | null;
  role: string;
  position: number;
  config: JsonValue | null;
  createdAt: number;
};

export type PresentationCaptionState =
  | "draft"
  | "humanized"
  | "auto-draft-archived"
  | "final";

export type PresentationCaptionRevisionDto = {
  id: string;
  presentationId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  state: PresentationCaptionState;
  text: string;
  createdAt: number;
};

export type PresentationItemDto = {
  id: string;
  presentationId: string;
  unitItemId: string;
  position: number;
  config: JsonValue | null;
  createdAt: number;
};

export type UnitPresentationDto = {
  id: string;
  unitRevisionId: string;
  platform: string;
  position: number;
  effectiveCaptionRevisionId: string | null;
  coverArtifactRevisionId: string | null;
  crop: JsonValue | null;
  safeArea: JsonValue | null;
  options: JsonValue;
  createdAt: number;
};

export type PublicationRail =
  | "postiz"
  | "github-pages"
  | "devto"
  | "hashnode"
  | "manual";

export type PublicationState =
  | "draft"
  | "submitting"
  | "scheduled"
  | "submitted"
  | "published"
  | "failed"
  | "cancelled"
  | "reconciliation_required"
  | "unknown";

export type PublicationClaimKind =
  | "submission"
  | "reconciliation"
  | "status-lookup"
  | "cancellation";

export type PublicationDto = {
  id: string;
  presentationId: string;
  effectiveCaptionRevisionId: string | null;
  effectiveOptions: JsonValue;
  socialAccountId: string | null;
  submissionRunId: string;
  revisedFromPublicationId: string | null;
  rail: PublicationRail;
  providerPublicationId: string | null;
  state: PublicationState;
  url: string | null;
  scheduledAt: number | null;
  submittedAt: number | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type MetricRetentionPoint = {
  pct?: number;
  watchRatio?: number;
  [key: string]: JsonValue | undefined;
};

export type MetricSnapshotDto = {
  id: string;
  publicationId: string;
  source: string;
  asOf: number;
  windowStart: number | null;
  windowEnd: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  watchTimeMs: number | null;
  ctr: number | null;
  retentionCurve: MetricRetentionPoint[] | null;
  avgViewDurationSec: number | null;
  note: string | null;
  createdAt: number;
};

export type MetricTotals = {
  publicationCount: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  watchTimeMs: number | null;
};

export type RunResultEntityType =
  | "document_revision"
  | "artifact_revision"
  | "composition_revision"
  | "build"
  | "build_output"
  | "unit_revision"
  | "unit_item"
  | "unit_presentation"
  | "publication"
  | "metric_snapshot";

export type Page<T, C = string> = { items: T[]; nextCursor: C | null };

export type RunState =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

/** External provenance and request digest stay internal to the store. */
export type RunDto = {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  agentSessionId: string | null;
  kind: string;
  label: string | null;
  state: RunState;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
};

export type RunAttemptDto = {
  id: string;
  runId: string;
  attemptNo: number;
  provider: string | null;
  model: string | null;
  state: RunState;
  costUsd: number | null;
  startedAt: number;
  endedAt: number | null;
};

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

export type RunObjectDto = {
  id: string;
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
};

export type RunResultDto = {
  id: string;
  runId: string;
  position: number;
  entityType: string;
  entityId: string;
  createdAt: number;
};

export type ExternalOperation = {
  runId: string;
  nodeId: string;
  attempt: number;
  operation: string;
  idempotencyKey: string;
};

export type ConsumerOperationStart = { run: RunDto; replayed: boolean };

export type EvaluationTargetType =
  | "artifact_revision"
  | "composition_revision"
  | "build"
  | "run";

export type EvaluationTarget = { type: EvaluationTargetType; id: string };

/** Raw report, metadata, and provider payload stay internal. */
export type EvaluationDto = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  target: EvaluationTarget;
  kind: string;
  verdict: string | null;
  favorite: boolean;
  rating: number | null;
  tags: string[];
  note: string | null;
  authoredBySessionId: string;
  createdAt: number;
};

/** Activity is the one global sequence; `sequence` is `activity_events.id`. */
export type ActivityDto = {
  sequence: number;
  workspaceId: string | null;
  projectId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: number;
};

export type WorkspaceSummaryDto = {
  id: string;
  slug: string;
  name: string;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type ProjectSummaryDto = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  state: ProjectState;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type OverviewProjectDto = ProjectSummaryDto & {
  purpose: string | null;
};

export type OverviewPublicationDto = {
  id: string;
  unitId: string;
  presentationId: string;
  platform: string;
  socialAccountId: string | null;
  rail: PublicationRail;
  state: PublicationState;
  url: string | null;
  scheduledAt: number | null;
  submittedAt: number | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type DocumentBindingDto = {
  ownerType: "project" | "build";
  ownerId: string;
  role: string;
  documentId: string;
  boundRevisionId: string;
  currentHeadRevisionId: string | null;
  hasNewerHead: boolean;
};

export type OverviewDocumentDto = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  slug: string;
  title: string;
  kind: DocumentKind;
  currentRevisionId: string | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type OverviewProjectDocumentDto = OverviewDocumentDto & {
  binding: DocumentBindingDto | null;
};

export type OverviewUnitDto = UnitDto;

export type OverviewAccountDto = {
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
};

export type OverviewIterationDto = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  state: IterationState;
  priorIterationChanges: string | null;
  createdAt: number;
  closedAt: number | null;
};

export type OverviewFeedbackDto = {
  id: string;
  projectId: string;
  iterationId: string;
  status: FeedbackStatus;
  targetType: FeedbackTargetType | null;
  targetId: string | null;
  createdAt: number;
  resolvedAt: number | null;
};

export type OverviewStageDto = {
  id: string;
  projectId: string;
  stage: string;
  state: string;
  entityType: string | null;
  entityId: string | null;
  rowVersion: number;
  updatedAt: number;
};

export type OverviewCompositionDto = CompositionDto;

export type OverviewBuildDto = BuildDto;

export type OverviewRunDto = {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  kind: string;
  label: string | null;
  state: RunState;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
};

export type OverviewMediaCounts = {
  artifacts: number;
  objects: number;
  runObjects: number;
};

export type MediaFilter =
  | "references"
  | "working"
  | "candidate"
  | "approved"
  | "rejected"
  | "superseded"
  | "run-diagnostics"
  | "run-cache-temp"
  | "advanced-objects";

export type RunObjectLocationClass = "temp" | "cache" | "bucket" | "other";

export type OverviewPageRequest<C = string> = { after?: C | null; limit: number };
export type OverviewMediaRequest = OverviewPageRequest & { filter?: MediaFilter };
export type OverviewActivityRequest = { afterSequence: number; limit: number };

export type WorkspaceOverviewRequest = {
  context: QueryContext;
  workspaceId: string;
  sections: {
    documents?: OverviewPageRequest;
    units?: OverviewPageRequest;
    accounts?: OverviewPageRequest;
    projects?: OverviewPageRequest;
    activity?: OverviewActivityRequest;
    sharedMedia?: OverviewMediaRequest;
    publications?: OverviewPageRequest;
    metrics?: true;
  };
};

export type WorkspaceOverview = {
  workspace: WorkspaceSummaryDto;
  documents?: Page<OverviewDocumentDto>;
  units?: Page<OverviewUnitDto>;
  accounts?: Page<OverviewAccountDto>;
  projects?: Page<ProjectSummaryDto>;
  activity?: Page<ActivityDto, number>;
  sharedMedia?: Page<MediaCard>;
  publications?: Page<OverviewPublicationDto>;
  metrics?: MetricTotals;
};

export type ProjectOverviewRequest = {
  context: QueryContext;
  projectId: string;
  sections: {
    documents?: OverviewPageRequest;
    iterations?: OverviewPageRequest;
    feedback?: OverviewPageRequest;
    stages?: OverviewPageRequest;
    compositions?: OverviewPageRequest;
    builds?: OverviewPageRequest;
    units?: OverviewPageRequest;
    runs?: OverviewPageRequest;
    activity?: OverviewActivityRequest;
    mediaCounts?: true;
    publications?: OverviewPageRequest;
    metrics?: true;
  };
};

export type ProjectOverview = {
  project: OverviewProjectDto;
  documents?: Page<OverviewProjectDocumentDto>;
  iterations?: Page<OverviewIterationDto>;
  feedback?: Page<OverviewFeedbackDto>;
  stages?: Page<OverviewStageDto>;
  compositions?: Page<OverviewCompositionDto>;
  builds?: Page<OverviewBuildDto>;
  units?: Page<OverviewUnitDto>;
  runs?: Page<OverviewRunDto>;
  activity?: Page<ActivityDto, number>;
  mediaCounts?: OverviewMediaCounts;
  publications?: Page<OverviewPublicationDto>;
  metrics?: MetricTotals;
};

export type MediaRefType = "artifact" | "run-object" | "object";
export type MediaRef = { type: MediaRefType; id: string };

/** No card carries a bucket, key, hash, original name, path, or metadata. */
export type ArtifactMediaCard = {
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
};

export type RunObjectMediaCard = {
  ref: { type: "run-object"; id: string };
  workspaceId: string | null;
  projectId: string | null;
  runId: string;
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
  objectId: string | null;
  target: { type: "object"; id: string } | { type: "run-object"; id: string };
};

export type ObjectMediaCard = {
  ref: { type: "object"; id: string };
  workspaceId: string;
  projectId: string | null;
  storageClass: string;
  mime: string;
  bytes: number;
  createdAt: number;
  referenceCount: number;
  target: { type: "object"; id: string };
};

export type MediaCard = ArtifactMediaCard | RunObjectMediaCard | ObjectMediaCard;

export type MediaReviewVerdict =
  | "shortlist"
  | "approved"
  | "rejected"
  | "needs-work";

export type ReviewMediaInput = {
  ref: MediaRef;
  expectedSelectedRevisionId: string;
  verdict: MediaReviewVerdict;
  authoredBySessionId: string;
  iterationId?: string | null;
  feedback?: string | null;
  favorite?: boolean;
  rating?: number | null;
  tags?: string[];
  note?: string | null;
};

export type ReviewMediaResult = {
  card: ArtifactMediaCard;
  revisionId: string;
  evaluation: EvaluationDto;
  feedbackId: string | null;
};

export type DocumentContentPage = {
  revisionId: string;
  format: DocumentFormat;
  text: string;
  nextByte: number | null;
};

export class StoreConflictError extends Error {
  readonly code = "E_CONFLICT";

  constructor(message = "Store row version conflict") {
    super(message);
    this.name = "StoreConflictError";
  }
}
