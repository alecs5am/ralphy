// Internal SQL row shapes and unbounded aggregates.
//
// These carry fields that never cross a public boundary: activity payloads,
// Object bucket/key/hash/original name, RunObject paths and metadata, Document
// bodies, and children that are not bounded by a cursor. Only store, verifier,
// and migration modules may import this file; commands, controllers, the
// bridge, agents, and Desktop-facing modules use the DTOs in `types.ts`.
//
// The dependency is one-way: this file imports types from `types.ts`, never the
// other way around.

import type {
  ArtifactKind,
  ArtifactRevisionState,
  BuildState,
  CompositionKind,
  CompositionRevisionState,
  DocumentFormat,
  FeedbackStatus,
  FeedbackTargetType,
  IterationState,
  JsonValue,
  MetricRetentionPoint,
  ObjectStorageClass,
  PresentationCaptionState,
  PublicationClaimKind,
  PublicationDto,
  PublicationRail,
  PublicationState,
  ProjectState,
  RunResultEntityType,
  RunState,
} from "./types.js";

export type WorkspaceRow = {
  id: string;
  slug: string;
  name: string;
  metadata: JsonValue | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
};

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

export type RunRow = {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  agentSessionId: string | null;
  kind: string;
  label: string | null;
  state: RunState;
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
  state: RunState;
  request: JsonValue | null;
  response: JsonValue | null;
  costUsd: number | null;
  error: string | null;
  startedAt: number;
  endedAt: number | null;
};

export type RunResultRow = {
  id: string;
  runId: string;
  position: number;
  entityType: RunResultEntityType;
  entityId: string;
  createdAt: number;
};

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

export type ActivityEventRow = {
  id: number;
  workspaceId: string | null;
  projectId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  payload: JsonValue;
  createdAt: number;
};

export type ConsumerPrincipalRow = {
  id: string;
  namespace: string;
  identityDigest: string;
  createdAt: number;
  disabledAt: number | null;
};

export type DocumentRevisionRow = {
  id: string;
  documentId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  format: DocumentFormat;
  title: string | null;
  body: string;
  contentSha256: string;
  authoredBySessionId: string | null;
  createdAt: number;
};

export type ObjectRow = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  backend: "local";
  bucket: string;
  key: string;
  sha256: string;
  mime: string;
  bytes: number;
  storageClass: ObjectStorageClass;
  originalName: string | null;
  metadata: JsonValue | null;
  createdAt: number;
};

export type RunObjectRow = {
  id: string;
  runId: string;
  objectId: string | null;
  path: string;
  purpose: string;
  state: string;
  retention: string;
  mime: string | null;
  bytes: number | null;
  sha256: string | null;
  metadata: JsonValue | null;
  createdAt: number;
};

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
  state: CompositionRevisionState;
  engine: string;
  engineVersion: string | null;
  engineConfig: JsonValue;
  manifestSha256: string | null;
  authoredBySessionId: string | null;
  createdAt: number;
  sealedAt: number | null;
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

export type BuildRow = {
  id: string;
  compositionRevisionId: string;
  runId: string | null;
  state: BuildState;
  profile: JsonValue;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
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

export type BuildAggregate = BuildRow & {
  outputs: BuildOutputRow[];
  documentBindings: BuildDocumentBindingRow[];
};

export type CompositionRevisionAggregate = CompositionRevisionRow & {
  sources: CompositionSourceRow[];
  inputs: CompositionInputRow[];
  builds: BuildAggregate[];
};

export type CompositionAggregate = CompositionRow & {
  revisions: CompositionRevisionAggregate[];
};

export type UnitRow = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  compositionId: string | null;
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
  compositionRevisionId: string | null;
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
  publication: PublicationDto;
  fence: PublicationFence;
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

export type UnitPresentationAggregate = UnitPresentationRow & {
  captions: PresentationCaptionRevisionRow[];
  items: PresentationItemRow[];
  publications: PublicationRow[];
};

export type UnitRevisionAggregate = UnitRevisionRow & {
  items: UnitItemRow[];
  presentations: UnitPresentationAggregate[];
};

export type UnitAggregate = UnitRow & {
  revisions: UnitRevisionAggregate[];
};

export type RunAggregate = RunRow & {
  attempts: RunAttemptRow[];
  objects: RunObjectRow[];
};
