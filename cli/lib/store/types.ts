import type { MediaArtifactKind } from "../schemas/media-artifact.js";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type WorkspaceRow = {
  id: string;
  slug: string;
  name: string;
  metadata: JsonValue | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type SocialAccountRow = {
  id: string;
  workspaceId: string;
  platform: string;
  externalId: string;
  displayName: string | null;
  username: string | null;
  config: JsonValue | null;
  createdAt: number;
  updatedAt: number;
};

export type ProjectState = "active" | "archived";

export type ProjectRow = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  state: ProjectState;
  metadata: JsonValue | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type IterationState = "active" | "closed";

export type IterationRow = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  reason: string | null;
  state: IterationState;
  createdAt: number;
  closedAt: number | null;
};

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

export type FeedbackRow = {
  id: string;
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

export type FeedbackResolutionLinkRow = EntityReference & {
  id: string;
  feedbackId: string;
  createdAt: number;
};

export type AgentSessionRow = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  agent: string;
  metadata: JsonValue | null;
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

export type DocumentRow = {
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

export type ObjectStorageClass = "durable" | "working" | "diagnostic";

export type ArtifactKind = Exclude<MediaArtifactKind, "ref">;

export type ArtifactRevisionState =
  | "working"
  | "candidate"
  | "approved"
  | "rejected"
  | "superseded"
  | "archived";

export type ArtifactRow = {
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

export type ArtifactRevisionRow = {
  id: string;
  artifactId: string;
  objectId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  state: ArtifactRevisionState;
  metadata: JsonValue | null;
  authoredBySessionId: string | null;
  createdAt: number;
};

export type ArtifactRelationRow = {
  id: string;
  fromRevisionId: string;
  toRevisionId: string;
  relation: string;
  metadata: JsonValue | null;
  createdAt: number;
};

export type ArtifactUsageRow = {
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

export type CompositionRow = {
  id: string;
  projectId: string;
  slug: string;
  kind: CompositionKind;
  selectedRevisionId: string | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type CompositionRevisionRow = {
  id: string;
  compositionId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  state: "draft" | "sealed";
  engine: string;
  engineVersion: string | null;
  engineConfig: JsonValue;
  manifestSha256: string | null;
  authoredBySessionId: string | null;
  createdAt: number;
  sealedAt: number | null;
};

export type BuildRow = {
  id: string;
  compositionRevisionId: string;
  runId: string | null;
  state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  profile: JsonValue;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
};

export type CompositionSourceRow = {
  id: string;
  compositionRevisionId: string;
  logicalPath: string;
  objectId: string;
  position: number;
  createdAt: number;
};

export type CompositionInputRow = {
  id: string;
  compositionRevisionId: string;
  artifactRevisionId: string;
  role: string;
  position: number;
  config: JsonValue | null;
  createdAt: number;
};

export type BuildOutputRow = {
  id: string;
  buildId: string;
  artifactRevisionId: string;
  role: string | null;
  position: number;
  createdAt: number;
};

export type BuildDocumentBindingRow = {
  id: string;
  buildId: string;
  documentRevisionId: string;
  role: string;
  createdAt: number;
};

export type UnitRow = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  slug: string;
  format: string;
  latestRevisionId: string | null;
  selectedRevisionId: string | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type UnitRevisionRow = {
  id: string;
  unitId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  note: string | null;
  metadata: JsonValue | null;
  authoredBySessionId: string | null;
  createdAt: number;
  sealedAt: number | null;
};

export type UnitItemRow = {
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

export type PresentationCaptionRevisionRow = {
  id: string;
  presentationId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  state: PresentationCaptionState;
  text: string;
  createdAt: number;
};

export type PresentationItemRow = {
  id: string;
  presentationId: string;
  unitItemId: string;
  position: number;
  config: JsonValue | null;
  createdAt: number;
};

export type UnitPresentationRow = {
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

export type PublicationRow = {
  id: string;
  presentationId: string;
  effectiveCaptionRevisionId: string | null;
  effectiveOptions: JsonValue;
  socialAccountId: string | null;
  submissionRunId: string;
  activeClaimRunId: string | null;
  revisedFromPublicationId: string | null;
  rail: PublicationRail;
  providerPublicationId: string | null;
  state: PublicationState;
  url: string | null;
  scheduledAt: number | null;
  submittedAt: number | null;
  publishedAt: number | null;
  error: string | null;
  failureStage: string | null;
  idempotencyKey: string;
  claimKind: PublicationClaimKind | null;
  claimEpoch: number;
  claimExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type PublicationFence = {
  kind: PublicationClaimKind;
  runId: string;
  epoch: number;
  token: string;
  expiresAt: number;
};

export type PublicationClaim = {
  publication: PublicationRow;
  fence: PublicationFence;
};

export type MetricRetentionPoint = {
  pct?: number;
  watchRatio?: number;
  [key: string]: JsonValue | undefined;
};

export type MetricSnapshotRow = {
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
  raw: JsonValue | null;
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

export type RunRow = {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  agentSessionId: string | null;
  kind: string;
  label: string | null;
  state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  metadata: JsonValue | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
};

export type RunAttemptRow = {
  id: string;
  runId: string;
  attemptNo: number;
  provider: string | null;
  model: string | null;
  state: RunRow["state"];
  request: JsonValue | null;
  response: JsonValue | null;
  costUsd: number | null;
  error: string | null;
  startedAt: number;
  endedAt: number | null;
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

export type RunResultRow = {
  id: string;
  runId: string;
  position: number;
  entityType: RunResultEntityType;
  entityId: string;
  createdAt: number;
};

export type Page<T, C = string> = { items: T[]; nextCursor: C | null };

export type ConsumerPrincipalRow = {
  id: string;
  namespace: string;
  identityDigest: string;
  createdAt: number;
  disabledAt: number | null;
};

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

export class StoreConflictError extends Error {
  readonly code = "E_CONFLICT";

  constructor(message = "Store row version conflict") {
    super(message);
    this.name = "StoreConflictError";
  }
}
