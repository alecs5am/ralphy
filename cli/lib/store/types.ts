export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

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
  storageClass: string;
  originalName: string | null;
  metadata: JsonValue | null;
  createdAt: number;
};

export type ArtifactRow = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  slug: string;
  kind: string;
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
  state: "working" | "candidate" | "approved" | "rejected" | "superseded" | "archived";
  metadata: JsonValue | null;
  authoredBySessionId: string | null;
  createdAt: number;
};

export type CompositionRow = {
  id: string;
  projectId: string;
  slug: string;
  kind: "video" | "carousel" | "sticker-pack" | "image" | "audio" | "document" | "custom";
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

export type UnitRow = {
  id: string;
  projectId: string;
  slug: string;
  format: string;
  currentRevisionId: string | null;
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

export type RunObjectRow = {
  id: string;
  runId: string;
  objectId: string | null;
  path: string;
  purpose: string;
  state: string;
  retention: string;
  bytes: number | null;
  sha256: string | null;
  metadata: JsonValue | null;
  createdAt: number;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export class StoreConflictError extends Error {
  readonly code = "E_CONFLICT";

  constructor(message = "Store row version conflict") {
    super(message);
    this.name = "StoreConflictError";
  }
}
