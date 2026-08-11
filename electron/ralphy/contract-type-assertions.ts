import type { BridgeContext, JsonValue, ParamsFor, ResultFor } from "./types";

type Equal<Left, Right> = [Left] extends [Right] ? [Right] extends [Left] ? true : false : false;
type Assert<Value extends true> = Value;

type Context = { context: BridgeContext };
type ExpectedRevise = Context & {
  compositionId: string;
  expectedLatestRevisionId: string | null;
  parentRevisionId?: string | null;
  iterationId?: string | null;
  engine: string;
  engineVersion?: string | null;
  engineConfig?: JsonValue;
};
type ExpectedBuildParams = Context & { compositionRevisionId: string; profile?: JsonValue };
type ExpectedBuildResult = {
  id: string;
  compositionRevisionId: string;
  runId: string;
  state: "succeeded";
  createdAt: number;
  finishedAt: number | null;
  outputs: Array<{ artifactRevisionId: string; objectId: string; role: string | null; position: number }>;
};
type ExpectedEvaluation = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  target: { type: "artifact_revision" | "composition_revision" | "build" | "run"; id: string };
  kind: string;
  verdict: string | null;
  favorite: boolean;
  rating: number | null;
  tags: string[];
  note: string | null;
  authoredBySessionId: string;
  createdAt: number;
};
type ExpectedGenerationTarget =
  | { type: "artifact-revision"; id: string }
  | { type: "run-object"; id: string };
type ExpectedGenerationInput = {
  version: 1;
  texts: Array<{
    role: "prompt" | "text" | "negative-prompt";
    value: string;
    truncated: boolean;
  }>;
  parameters: Array<{
    name:
      | "size" | "durationSec" | "aspectRatio" | "resolution"
      | "generateAudio" | "referenceCount" | "referenceVideoCount"
      | "hasFirstFrame" | "hasLastFrame" | "hasImage" | "voiceSpecified"
      | "stability" | "similarityBoost" | "style" | "speed"
      | "speakerBoost" | "forceInstrumental" | "promptInfluence"
      | "language" | "backend";
    value: string | number | boolean;
  }>;
};
type ExpectedRun = {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  agentSessionId: string | null;
  kind: string;
  label: string | null;
  state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
};
type ExpectedGenerationAttempt = {
  id: string;
  runId: string;
  attemptNo: number;
  provider: string | null;
  model: string | null;
  state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  costUsd: number | null;
  startedAt: number;
  endedAt: number | null;
  input: ExpectedGenerationInput | null;
};
type ExpectedGenerationDetail =
  | {
      status: "generation";
      target: ExpectedGenerationTarget;
      run: ExpectedRun;
      attempts: { items: ExpectedGenerationAttempt[]; nextCursor: string | null };
      cost: { knownUsd: number | null; complete: boolean };
    }
  | { status: "not-generation"; target: ExpectedGenerationTarget; producer: ExpectedRun }
  | { status: "unknown"; target: ExpectedGenerationTarget; reason: "not-recorded" | "ambiguous" };
type ExpectedGenerationParams = Context & {
  target: ExpectedGenerationTarget;
  after?: string | null;
  limit?: number;
};
type ExpectedMediaSelectionParams = Context & {
  ref: { type: "artifact"; id: string };
  revisionId: string;
  expectedSelectedRevisionId: string | null;
};
type ExpectedMediaFacets = {
  mediaKind: "image" | "video" | "audio" | "document" | "other";
  provenance: "generation" | "not-generation" | "unknown";
};
type ExpectedMediaListParams = Context & {
  after?: string | null;
  limit?: number;
  filter?: "references" | "working" | "candidate" | "approved" | "rejected"
    | "superseded" | "run-diagnostics" | "run-cache-temp" | "advanced-objects";
  types?: Array<"artifact" | "run-object" | "object">;
  mediaKind?: ExpectedMediaFacets["mediaKind"];
  provenance?: ExpectedMediaFacets["provenance"];
};
type ExpectedArtifactRevision = {
  id: string;
  artifactId: string;
  objectId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  iterationId: string | null;
  state: "working" | "candidate" | "approved" | "rejected" | "superseded" | "archived";
  authoredBySessionId: string | null;
  createdAt: number;
};

export type ReviseContractIsCurrent = Assert<Equal<ParamsFor<"composition.revise">, ExpectedRevise>>;
export type BuildParamsAreCurrent = Assert<Equal<ParamsFor<"composition.build">, ExpectedBuildParams>>;
export type BuildResultIsTerminal = Assert<Equal<ResultFor<"composition.build">, ExpectedBuildResult>>;
export type EvaluationDtoIsCurrent = Assert<Equal<ResultFor<"evaluation.list">["items"][number], ExpectedEvaluation>>;
export type GenerationParamsAreCurrent = Assert<Equal<ParamsFor<"media.generation.show">, ExpectedGenerationParams>>;
export type GenerationDetailIsCurrent = Assert<Equal<ResultFor<"media.generation.show">, ExpectedGenerationDetail>>;
export type MediaSelectionParamsAreNullAware = Assert<Equal<ParamsFor<"media.select">, ExpectedMediaSelectionParams>>;
export type MediaListParamsAreCurrent = Assert<Equal<ParamsFor<"media.list">, ExpectedMediaListParams>>;
type MediaCard = ResultFor<"media.list">["items"][number];
export type ArtifactMediaFacetsAreRequired = Assert<Equal<Pick<Extract<MediaCard, { ref: { type: "artifact" } }>, keyof ExpectedMediaFacets>, ExpectedMediaFacets>>;
export type RunObjectMediaFacetsAreRequired = Assert<Equal<Pick<Extract<MediaCard, { ref: { type: "run-object" } }>, keyof ExpectedMediaFacets>, ExpectedMediaFacets>>;
export type ObjectMediaFacetsAreRequired = Assert<Equal<Pick<Extract<MediaCard, { ref: { type: "object" } }>, keyof ExpectedMediaFacets>, ExpectedMediaFacets>>;
export type MediaRevisionResultIsCurrent = Assert<Equal<ResultFor<"media.revisions">, {
  items: ExpectedArtifactRevision[];
  nextCursor: string | null;
}>>;
type HistoryOrder = "oldest" | "newest" | undefined;
export type EvaluationHistoryOrderIsCurrent = Assert<Equal<ParamsFor<"evaluation.list">["order"], HistoryOrder>>;
export type CompositionRevisionHistoryOrderIsCurrent = Assert<Equal<ParamsFor<"composition.revisions">["order"], HistoryOrder>>;
export type CompositionBuildHistoryOrderIsCurrent = Assert<Equal<ParamsFor<"composition.builds">["order"], HistoryOrder>>;
export type UnitRevisionHistoryOrderIsCurrent = Assert<Equal<ParamsFor<"unit.revisions">["order"], HistoryOrder>>;
export type UnitChildOrderRemainsImplicit = Assert<Equal<Extract<keyof ParamsFor<"unit.items"> | keyof ParamsFor<"unit.presentations">, "order">, never>>;
export type EvaluationFiltersAreExclusive = Assert<Equal<{
  context: BridgeContext;
  target: { type: "build"; id: string };
  targetType: "build";
} extends ParamsFor<"evaluation.list"> ? true : false, false>>;
export type LegacyBuildFieldsAreAbsent = Assert<Equal<Extract<keyof ParamsFor<"composition.build">, "external" | "input">, never>>;
