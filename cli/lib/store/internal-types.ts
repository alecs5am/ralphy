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
  JsonValue,
  ObjectStorageClass,
  PresentationCaptionRevisionRow,
  PresentationItemRow,
  PublicationRow,
  RunAttemptRow,
  RunRow,
  UnitItemRow,
  UnitPresentationRow,
  UnitRevisionRow,
  UnitRow,
} from "./types.js";

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
