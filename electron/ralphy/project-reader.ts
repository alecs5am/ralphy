import { RalphyBridgeError, type RalphyBridgeClient } from "./client";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { assertTrustedSender, toIpcResult } from "../ipc-security";
import { parseBoundedJsonValue } from "../json-value";
import type {
  ActivityDto,
  ArtifactMediaCardDto,
  ArtifactRevisionDto,
  BridgeMethod,
  BuildDto,
  BuildOutputDto,
  CompositionBuildCompletion,
  CompositionDto,
  CompositionInputDto,
  CompositionRevisionDto,
  CompositionSourceDto,
  DocumentDetailDto,
  DocumentDto,
  DocumentRevisionDto,
  DocumentSearchDto,
  EvaluationDto,
  JsonValue,
  MediaCardDto,
  MediaGenerationDetailDto,
  MediaGenerationTarget,
  Page,
  ParamsFor,
  ProjectOverviewDto,
  ResultFor,
  RunAttemptDto,
  RunDto,
  UnitDto,
  UnitItemDto,
  UnitPresentationDto,
  UnitPreviewDto,
  UnitRevisionDto,
} from "./types";
import {
  MEDIA_CHANNELS,
  PROJECT_MEDIA_FILTERS,
} from "../media/types";
import type { RalphySession } from "./session";
import type {
  ProjectMediaFilter,
  ProjectMediaAction,
  ProjectMediaKind,
  ProjectMediaQuery,
  ProjectMediaReviewVerdict,
  ProjectPage,
  ProjectPreview,
  ProjectReference,
  ProjectTab,
  ProjectCompositionPageRequest,
  ProjectUnitPageRequest,
  MediaProvenance,
} from "../media/types";

export const PROJECT_PAGE_LIMIT = 50;
export const PROJECT_OVERVIEW_LIMIT = 5;
export const PROJECT_ACTIVITY_LIMIT = 10;
export const DOCUMENT_PREVIEW_CHUNK_BYTES = 65_536;
export const DOCUMENT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
export const GENERATION_ATTEMPT_LIMIT = 20;

export type ProjectRef = ProjectReference;
export type { ProjectMediaFilter, ProjectMediaQuery, ProjectPage, ProjectPreview, ProjectTab };

type Request = Pick<RalphyBridgeClient, "request">["request"];
type Mint = (absolutePath: string, mime: string | null, expectedBytes: number) => Promise<ProjectPreview>;

export type CompositionOutputPreview = ProjectPreview & { mime: string | null };
export type ReviseCompositionInput = {
  compositionId: string;
  expectedLatestRevisionId: string | null;
  parentRevisionId?: string | null;
  iterationId?: string | null;
  engine: string;
  engineVersion?: string | null;
  engineConfig?: JsonValue;
};

function projectContext(project: ProjectRef): ProjectRef {
  if (!project || !validId(project.workspaceId) || !validId(project.projectId)) {
    throw new Error("Invalid project identifier");
  }
  return project;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function validPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096;
}

function validGenerationId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function projectOverviewDto(value: unknown, project: ProjectRef): ProjectOverviewDto {
  const overview = record(value);
  const details = record(overview?.project);
  const allowed = new Set([
    "project", "spendUsd", "documents", "iterations", "feedback", "stages",
    "compositions", "builds", "units", "runs", "activity", "mediaCounts",
    "publications", "metrics",
  ]);
  if (!overview || !details || !Object.hasOwn(overview, "project") || !Object.hasOwn(overview, "spendUsd")
    || Reflect.ownKeys(overview).some((key) => typeof key !== "string" || !allowed.has(key))
    || details.id !== project.projectId || details.workspaceId !== project.workspaceId
    || !finite(overview.spendUsd) || overview.spendUsd < 0) {
    throw new Error("Invalid Project overview");
  }
  return value as ProjectOverviewDto;
}

function sequence(value: unknown, positive = false): value is number {
  return Number.isSafeInteger(value) && (value as number) >= (positive ? 1 : 0);
}

const RUN_STATES = new Set(["pending", "running", "succeeded", "failed", "cancelled"]);
const TEXT_ROLES = new Set(["prompt", "text", "negative-prompt"]);
const PARAMETER_NAMES = new Set([
  "size", "durationSec", "aspectRatio", "resolution", "generateAudio", "referenceCount",
  "referenceVideoCount", "hasFirstFrame", "hasLastFrame", "hasImage", "voiceSpecified",
  "stability", "similarityBoost", "style", "speed", "speakerBoost", "forceInstrumental",
  "promptInfluence", "language", "backend",
]);
const NUMBER_PARAMETERS = new Set([
  "durationSec", "referenceCount", "referenceVideoCount", "stability", "similarityBoost",
  "style", "speed", "promptInfluence",
]);
const BOOLEAN_PARAMETERS = new Set([
  "generateAudio", "hasFirstFrame", "hasLastFrame", "hasImage", "voiceSpecified",
  "speakerBoost", "forceInstrumental",
]);
const PROJECT_MEDIA_KINDS = new Set<ProjectMediaKind>([
  "image", "video", "audio", "document", "other",
]);
const MEDIA_PROVENANCE = new Set<MediaProvenance>([
  "generation", "not-generation", "unknown",
]);
const DOCUMENT_KINDS = new Set([
  "brief", "style-guide", "production-plan", "scenario", "storyboard", "research", "postmortem", "memory", "note", "custom",
]);
const DOCUMENT_FORMATS = new Set(["markdown", "text", "json"]);

function validMediaClassification(value: Record<string, unknown>): boolean {
  return PROJECT_MEDIA_KINDS.has(value.mediaKind as ProjectMediaKind)
    && MEDIA_PROVENANCE.has(value.provenance as MediaProvenance);
}

function validJson(value: unknown): value is JsonValue {
  try {
    parseBoundedJsonValue(value);
    return true;
  } catch {
    return false;
  }
}

function unitDto(value: unknown, project: ProjectRef, unitId: string): value is UnitDto {
  const unit = record(value);
  return !!unit && exactKeys(unit, [
    "id", "workspaceId", "projectId", "compositionId", "slug", "format", "latestRevisionId",
    "selectedRevisionId", "createdAt", "updatedAt",
  ]) && unit.id === unitId && unit.workspaceId === project.workspaceId
    && optionalScope(unit.projectId, project.projectId) && validId(unit.slug) && validId(unit.format)
    && (unit.compositionId === null || validId(unit.compositionId))
    && (unit.latestRevisionId === null || validId(unit.latestRevisionId))
    && (unit.selectedRevisionId === null || validId(unit.selectedRevisionId))
    && sequence(unit.createdAt) && sequence(unit.updatedAt);
}

function unitRevisionDto(value: unknown, unitId: string): value is UnitRevisionDto {
  const revision = record(value);
  return !!revision && exactKeys(revision, [
    "id", "unitId", "compositionRevisionId", "revisionNo", "parentRevisionId", "iterationId", "note",
    "authoredBySessionId", "createdAt", "sealedAt",
  ]) && validId(revision.id) && revision.unitId === unitId && sequence(revision.revisionNo, true)
    && (revision.compositionRevisionId === null || validId(revision.compositionRevisionId))
    && (revision.parentRevisionId === null || validId(revision.parentRevisionId))
    && (revision.iterationId === null || validId(revision.iterationId))
    && (revision.note === null || (typeof revision.note === "string" && Buffer.byteLength(revision.note, "utf8") <= 65_536))
    && (revision.authoredBySessionId === null || validId(revision.authoredBySessionId))
    && sequence(revision.createdAt) && (revision.sealedAt === null || sequence(revision.sealedAt));
}

function unitItemDto(value: unknown, revisionId: string): value is UnitItemDto {
  const item = record(value);
  if (!item || !exactKeys(item, [
    "id", "unitRevisionId", "artifactRevisionId", "documentRevisionId", "role",
    "position", "config", "createdAt",
  ])) return false;
  const artifact = item.artifactRevisionId === null || validId(item.artifactRevisionId);
  const document = item.documentRevisionId === null || validId(item.documentRevisionId);
  return validId(item.id) && item.unitRevisionId === revisionId && artifact && document
    && (item.artifactRevisionId === null) !== (item.documentRevisionId === null)
    && validId(item.role) && sequence(item.position) && (item.config === null || validJson(item.config))
    && sequence(item.createdAt);
}

function unitPresentationDto(value: unknown, revisionId: string): value is UnitPresentationDto {
  const presentation = record(value);
  return !!presentation && exactKeys(presentation, [
    "id", "unitRevisionId", "platform", "position", "effectiveCaptionRevisionId",
    "coverArtifactRevisionId", "crop", "safeArea", "options", "createdAt",
  ]) && validId(presentation.id) && presentation.unitRevisionId === revisionId
    && validId(presentation.platform) && sequence(presentation.position)
    && (presentation.effectiveCaptionRevisionId === null || validId(presentation.effectiveCaptionRevisionId))
    && (presentation.coverArtifactRevisionId === null || validId(presentation.coverArtifactRevisionId))
    && (presentation.crop === null || validJson(presentation.crop))
    && (presentation.safeArea === null || validJson(presentation.safeArea))
    && validJson(presentation.options) && sequence(presentation.createdAt);
}

function unitPreviewDto(value: unknown, revisionId: string, platform: string): value is UnitPreviewDto {
  const preview = record(value);
  return !!preview && exactKeys(preview, ["unitRevisionId", "platform", "presentation"])
    && preview.unitRevisionId === revisionId && preview.platform === platform
    && record(preview.presentation) !== null && validJson(preview.presentation);
}

function unitPage<Item>(
  value: unknown,
  validItem: (item: unknown) => item is Item,
): Page<Item> {
  const page = record(value);
  if (!page || !exactKeys(page, ["items", "nextCursor"]) || !Array.isArray(page.items)
    || page.items.length > PROJECT_PAGE_LIMIT || !page.items.every(validItem)
    || (page.nextCursor !== null && (typeof page.nextCursor !== "string" || !page.nextCursor || page.nextCursor.length > 4096))) {
    throw new Error("Invalid Unit page");
  }
  return value as Page<Item>;
}

function documentRevisionDto(value: unknown, documentId: string): value is DocumentRevisionDto {
  const revision = record(value);
  return !!revision && validId(revision.id) && revision.documentId === documentId
    && sequence(revision.revisionNo, true)
    && (revision.parentRevisionId === null || validId(revision.parentRevisionId))
    && (revision.iterationId === null || validId(revision.iterationId))
    && DOCUMENT_FORMATS.has(revision.format as string)
    && (revision.title === null || typeof revision.title === "string")
    && (revision.authoredBySessionId === null || validId(revision.authoredBySessionId))
    && sequence(revision.createdAt);
}

function documentDetailDto(value: unknown, project: ProjectRef, documentId: string): value is DocumentDetailDto {
  const document = record(value);
  return !!document && document.id === documentId && document.workspaceId === project.workspaceId
    && optionalScope(document.projectId, project.projectId)
    && DOCUMENT_KINDS.has(document.kind as string) && validId(document.slug)
    && typeof document.title === "string"
    && (document.currentRevisionId === null || validId(document.currentRevisionId))
    && sequence(document.rowVersion, true) && sequence(document.createdAt) && sequence(document.updatedAt)
    && (document.currentRevision === null || documentRevisionDto(document.currentRevision, documentId))
    && (document.currentRevision === null
      ? document.currentRevisionId === null
      : document.currentRevision.id === document.currentRevisionId);
}

function documentSearchPage(value: unknown, project: ProjectRef): Page<DocumentSearchDto> {
  const page = record(value);
  const validItem = (item: unknown): item is DocumentSearchDto => {
    const result = record(item);
    return !!result && exactKeys(result, [
      "documentId", "revisionId", "workspaceId", "projectId", "kind", "slug", "documentTitle",
      "revisionNo", "parentRevisionId", "iterationId", "format", "title", "authoredBySessionId", "createdAt",
    ]) && validId(result.documentId) && validId(result.revisionId)
      && result.workspaceId === project.workspaceId && optionalScope(result.projectId, project.projectId)
      && DOCUMENT_KINDS.has(result.kind as string) && validId(result.slug)
      && typeof result.documentTitle === "string" && result.documentTitle.length > 0 && result.documentTitle.length <= 4_096
      && sequence(result.revisionNo, true)
      && (result.parentRevisionId === null || validId(result.parentRevisionId))
      && (result.iterationId === null || validId(result.iterationId))
      && DOCUMENT_FORMATS.has(result.format as string)
      && (result.title === null || (typeof result.title === "string" && result.title.length <= 4_096))
      && (result.authoredBySessionId === null || validId(result.authoredBySessionId))
      && sequence(result.createdAt);
  };
  if (!page || !exactKeys(page, ["items", "nextCursor"]) || !Array.isArray(page.items)
    || page.items.length > PROJECT_PAGE_LIMIT || !page.items.every(validItem)
    || (page.nextCursor !== null && (typeof page.nextCursor !== "string" || !page.nextCursor || page.nextCursor.length > 4_096))) {
    throw new Error("Invalid Document search page");
  }
  return value as Page<DocumentSearchDto>;
}

function generationTarget(value: unknown): MediaGenerationTarget {
  const target = record(value);
  if (!target || !exactKeys(target, ["type", "id"]) || !validGenerationId(target.id)) {
    throw new Error("Invalid generation target");
  }
  if (target.type !== "artifact-revision" && target.type !== "run-object") {
    throw new Error("Invalid generation target");
  }
  return { type: target.type, id: target.id };
}

function generationInput(value: unknown): boolean {
  const input = record(value);
  if (!input || !exactKeys(input, ["version", "texts", "parameters"]) || input.version !== 1
    || !Array.isArray(input.texts) || input.texts.length > 3
    || !Array.isArray(input.parameters) || input.parameters.length > 32) return false;
  const roles = new Set<string>();
  for (const item of input.texts) {
    const text = record(item);
    if (!text || !exactKeys(text, ["role", "value", "truncated"])
      || typeof text.role !== "string" || !TEXT_ROLES.has(text.role) || roles.has(text.role)
      || typeof text.value !== "string" || Buffer.byteLength(text.value, "utf8") > 65_536
      || typeof text.truncated !== "boolean") return false;
    roles.add(text.role);
  }
  const names = new Set<string>();
  for (const item of input.parameters) {
    const parameter = record(item);
    if (!parameter || !exactKeys(parameter, ["name", "value"])
      || typeof parameter.name !== "string" || !PARAMETER_NAMES.has(parameter.name)
      || names.has(parameter.name) || !generationParameter(parameter.name, parameter.value)) return false;
    names.add(parameter.name);
  }
  return true;
}

function generationParameter(name: string, value: unknown): boolean {
  if (name === "size") return typeof value === "string" && value.length <= 32 && /^[1-9]\d*x[1-9]\d*$/.test(value);
  if (name === "aspectRatio") return typeof value === "string" && value.length <= 32 && /^[1-9]\d?:[1-9]\d?$/.test(value);
  if (name === "resolution") return typeof value === "string" && value.length <= 32 && /^(?:[1-9]\d{2,3}p|[248]K)$/.test(value);
  if (name === "language") return value === "ru" || value === "en" || value === "auto";
  if (name === "backend") return value === "elevenlabs" || value === "openrouter" || value === "gemini";
  if (NUMBER_PARAMETERS.has(name)) return finite(value);
  return BOOLEAN_PARAMETERS.has(name) && typeof value === "boolean";
}

function runDto(value: unknown, project: ProjectRef): value is RunDto {
  const run = record(value);
  return !!run && exactKeys(run, [
    "id", "workspaceId", "projectId", "agentSessionId", "kind", "label", "state",
    "createdAt", "startedAt", "endedAt",
  ]) && validGenerationId(run.id)
    && run.workspaceId === project.workspaceId
    && (run.projectId === null || run.projectId === project.projectId)
    && (run.agentSessionId === null || validGenerationId(run.agentSessionId))
    && typeof run.kind === "string" && run.kind.length > 0 && run.kind.length <= 256
    && (run.label === null || (typeof run.label === "string" && run.label.length <= 4096))
    && typeof run.state === "string" && RUN_STATES.has(run.state)
    && sequence(run.createdAt)
    && (run.startedAt === null || sequence(run.startedAt))
    && (run.endedAt === null || sequence(run.endedAt));
}

function generationAttempt(value: unknown, runId: string): boolean {
  const attempt = record(value);
  return !!attempt && exactKeys(attempt, [
    "id", "runId", "attemptNo", "provider", "model", "state", "costUsd", "startedAt", "endedAt", "input",
  ]) && validGenerationId(attempt.id) && attempt.runId === runId
    && sequence(attempt.attemptNo, true)
    && (attempt.provider === null || (typeof attempt.provider === "string" && attempt.provider.length > 0 && attempt.provider.length <= 256))
    && (attempt.model === null || (typeof attempt.model === "string" && attempt.model.length > 0 && attempt.model.length <= 1024))
    && typeof attempt.state === "string" && RUN_STATES.has(attempt.state)
    && (attempt.costUsd === null || (finite(attempt.costUsd) && attempt.costUsd >= 0))
    && sequence(attempt.startedAt)
    && (attempt.endedAt === null || sequence(attempt.endedAt))
    && (attempt.input === null || generationInput(attempt.input));
}

function runAttemptDto(value: unknown, runId: string): value is RunAttemptDto {
  const attempt = record(value);
  return !!attempt && exactKeys(attempt, [
    "id", "runId", "attemptNo", "provider", "model", "state", "costUsd", "startedAt", "endedAt",
  ]) && generationAttempt({ ...attempt, input: null }, runId);
}

function validateGenerationDetail(
  value: unknown,
  expectedTarget: MediaGenerationTarget,
  project: ProjectRef,
): MediaGenerationDetailDto {
  const detail = record(value);
  if (!detail || typeof detail.status !== "string") throw new Error("Invalid generation detail");
  let target: MediaGenerationTarget;
  try {
    target = generationTarget(detail.target);
  } catch {
    throw new Error("Invalid generation detail");
  }
  if (target.type !== expectedTarget.type || target.id !== expectedTarget.id) throw new Error("Invalid generation detail");
  if (detail.status === "unknown") {
    if (!exactKeys(detail, ["status", "target", "reason"])
      || (detail.reason !== "not-recorded" && detail.reason !== "ambiguous")) throw new Error("Invalid generation detail");
  } else if (detail.status === "not-generation") {
    if (!exactKeys(detail, ["status", "target", "producer"]) || !runDto(detail.producer, project)) throw new Error("Invalid generation detail");
  } else if (detail.status === "generation") {
    const attempts = record(detail.attempts);
    const cost = record(detail.cost);
    if (!exactKeys(detail, ["status", "target", "run", "attempts", "cost"])
      || !runDto(detail.run, project) || !attempts || !exactKeys(attempts, ["items", "nextCursor"])
      || !Array.isArray(attempts.items) || attempts.items.length > GENERATION_ATTEMPT_LIMIT
      || !attempts.items.every((attempt) => generationAttempt(attempt, (detail.run as RunDto).id))
      || (attempts.nextCursor !== null && (typeof attempts.nextCursor !== "string" || !attempts.nextCursor || attempts.nextCursor.length > 4096))
      || !cost || !exactKeys(cost, ["knownUsd", "complete"])
      || (cost.knownUsd !== null && (!finite(cost.knownUsd) || cost.knownUsd < 0))
      || typeof cost.complete !== "boolean") throw new Error("Invalid generation detail");
  } else {
    throw new Error("Invalid generation detail");
  }
  return value as MediaGenerationDetailDto;
}

function artifactRevision(value: unknown, artifactId: string): value is ArtifactRevisionDto {
  const revision = record(value);
  return !!revision && exactKeys(revision, [
    "id", "artifactId", "objectId", "revisionNo", "parentRevisionId", "iterationId",
    "state", "authoredBySessionId", "createdAt",
  ])
    && validGenerationId(revision.id) && revision.artifactId === artifactId
    && validGenerationId(revision.objectId)
    && sequence(revision.revisionNo, true)
    && (revision.parentRevisionId === null || validGenerationId(revision.parentRevisionId))
    && (revision.iterationId === null || validGenerationId(revision.iterationId))
    && typeof revision.state === "string" && ["working", "candidate", "approved", "rejected", "superseded", "archived"].includes(revision.state)
    && (revision.authoredBySessionId === null || validGenerationId(revision.authoredBySessionId))
    && sequence(revision.createdAt);
}

function validateArtifactCard(value: unknown, project: ProjectRef, artifactId: string, revisionId: string): ArtifactMediaCardDto {
  const card = record(value);
  const ref = record(card?.ref);
  const target = card?.target === null ? null : record(card?.target);
  if (!card || !exactKeys(card, [
    "ref", "workspaceId", "projectId", "slug", "kind", "selectedRevisionId", "selectedState",
    "mime", "bytes", "selectedAt", "revisionCount", "selectedObjectId", "storageClass", "usageRoles", "target",
    "mediaKind", "provenance",
  ]) || !ref || !exactKeys(ref, ["type", "id"]) || ref.type !== "artifact" || ref.id !== artifactId
    || card.workspaceId !== project.workspaceId || card.projectId !== project.projectId
    || typeof card.slug !== "string" || !card.slug || card.slug.length > 256
    || typeof card.kind !== "string" || !card.kind || card.kind.length > 256
    || card.selectedRevisionId !== revisionId
    || (card.selectedState !== null && (typeof card.selectedState !== "string" || !card.selectedState || card.selectedState.length > 128))
    || (card.mime !== null && (typeof card.mime !== "string" || !card.mime || card.mime.length > 1024))
    || (card.bytes !== null && !sequence(card.bytes))
    || (card.selectedAt !== null && !sequence(card.selectedAt))
    || !sequence(card.revisionCount)
    || !validGenerationId(card.selectedObjectId)
    || (card.storageClass !== null && (typeof card.storageClass !== "string" || !card.storageClass || card.storageClass.length > 128))
    || !Array.isArray(card.usageRoles) || !card.usageRoles.every((role) => typeof role === "string" && !!role && role.length <= 256)
    || !validMediaClassification(card)
    || !target || !exactKeys(target, ["type", "id"]) || target.type !== "object"
    || target.id !== card.selectedObjectId) {
    throw new Error("Invalid selected Artifact");
  }
  return value as ArtifactMediaCardDto;
}

function validateMediaReview(
  value: unknown,
  project: ProjectRef,
  artifactId: string,
  verdict: ProjectMediaReviewVerdict,
): ArtifactMediaCardDto {
  const review = record(value);
  if (!review || !exactKeys(review, ["card", "revisionId", "evaluation", "feedbackId"])
    || !validId(review.revisionId)
    || review.feedbackId !== null
    || !compositionEvaluationDto(review.evaluation, project, { type: "artifact_revision", id: review.revisionId })
    || (review.evaluation as EvaluationDto).projectId !== project.projectId
    || (review.evaluation as EvaluationDto).verdict !== verdict) {
    throw new Error("Invalid Media review");
  }
  try {
    return validateArtifactCard(review.card, project, artifactId, review.revisionId);
  } catch {
    throw new Error("Invalid Media review");
  }
}

function mediaRef(value: unknown): MediaCardDto["ref"] {
  const ref = record(value);
  if (!ref || !exactKeys(ref, ["type", "id"]) || !validGenerationId(ref.id)
    || !["artifact", "run-object", "object"].includes(ref.type as string)) {
    throw new Error("Invalid Media reference");
  }
  return { type: ref.type as MediaCardDto["ref"]["type"], id: ref.id };
}

function optionalScope(value: unknown, expected: string): boolean {
  return value === null || value === expected;
}

function validateMediaCard(value: unknown, project: ProjectRef, expectedRef: MediaCardDto["ref"]): MediaCardDto {
  const card = record(value);
  const ref = record(card?.ref);
  const target = card?.target === null ? null : record(card?.target);
  const exactRef = !!ref && exactKeys(ref, ["type", "id"])
    && ref.type === expectedRef.type && ref.id === expectedRef.id;
  const validTarget = (expectedType: "object" | "run-object", expectedId: string): boolean => (
    !!target && exactKeys(target, ["type", "id"]) && target.type === expectedType && target.id === expectedId
  );
  if (!card || !exactRef) throw new Error("Invalid Media card");
  if (!validMediaClassification(card)) throw new Error("Invalid Media card");

  if (expectedRef.type === "artifact") {
    const selected = card.selectedRevisionId !== null;
    if (!exactKeys(card, [
      "ref", "workspaceId", "projectId", "slug", "kind", "selectedRevisionId", "selectedState",
      "mime", "bytes", "selectedAt", "revisionCount", "selectedObjectId", "storageClass", "usageRoles", "target",
      "mediaKind", "provenance",
    ]) || card.workspaceId !== project.workspaceId || !optionalScope(card.projectId, project.projectId)
      || typeof card.slug !== "string" || !card.slug || card.slug.length > 256
      || typeof card.kind !== "string" || !card.kind || card.kind.length > 256
      || (selected ? !validGenerationId(card.selectedRevisionId) : card.selectedRevisionId !== null)
      || (card.selectedState !== null && (typeof card.selectedState !== "string" || !card.selectedState || card.selectedState.length > 128))
      || (card.mime !== null && (typeof card.mime !== "string" || !card.mime || card.mime.length > 1024))
      || (card.bytes !== null && !sequence(card.bytes)) || (card.selectedAt !== null && !sequence(card.selectedAt))
      || !sequence(card.revisionCount) || (card.selectedObjectId !== null && !validGenerationId(card.selectedObjectId))
      || selected !== (card.selectedObjectId !== null)
      || (card.storageClass !== null && (typeof card.storageClass !== "string" || !card.storageClass || card.storageClass.length > 128))
      || !Array.isArray(card.usageRoles) || !card.usageRoles.every((role) => typeof role === "string" && !!role && role.length <= 256)
      || (card.selectedObjectId === null ? target !== null : !validTarget("object", card.selectedObjectId))) {
      throw new Error("Invalid Media card");
    }
  } else if (expectedRef.type === "run-object") {
    if (!exactKeys(card, [
      "ref", "workspaceId", "projectId", "runId", "purpose", "state", "retention", "mime", "bytes",
      "createdAt", "objectId", "logicalPath", "locationClass", "attemptId", "attemptNo", "target",
      "mediaKind", "provenance",
    ]) || !optionalScope(card.workspaceId, project.workspaceId) || !optionalScope(card.projectId, project.projectId)
      || !validGenerationId(card.runId) || typeof card.purpose !== "string" || !card.purpose || card.purpose.length > 256
      || typeof card.state !== "string" || !card.state || card.state.length > 128
      || typeof card.retention !== "string" || !card.retention || card.retention.length > 128
      || (card.mime !== null && (typeof card.mime !== "string" || !card.mime || card.mime.length > 1024))
      || (card.bytes !== null && !sequence(card.bytes)) || !sequence(card.createdAt)
      || (card.objectId !== null && !validGenerationId(card.objectId))
      || typeof card.logicalPath !== "string" || !card.logicalPath || card.logicalPath.length > 4096
      || !["temp", "cache", "bucket", "other"].includes(card.locationClass as string)
      || card.attemptId !== null || card.attemptNo !== null
      || (card.objectId === null ? !validTarget("run-object", expectedRef.id) : !validTarget("object", card.objectId))) {
      throw new Error("Invalid Media card");
    }
  } else if (!exactKeys(card, [
    "ref", "workspaceId", "projectId", "storageClass", "mime", "bytes", "createdAt", "referenceCount", "target",
    "mediaKind", "provenance",
  ]) || card.workspaceId !== project.workspaceId || !optionalScope(card.projectId, project.projectId)
    || typeof card.storageClass !== "string" || !card.storageClass || card.storageClass.length > 128
    || typeof card.mime !== "string" || !card.mime || card.mime.length > 1024
    || !sequence(card.bytes) || !sequence(card.createdAt) || !sequence(card.referenceCount)
    || !validTarget("object", expectedRef.id)) {
    throw new Error("Invalid Media card");
  }
  return value as MediaCardDto;
}

function normalizeGenerationSource(value: MediaGenerationTarget | MediaCardDto): {
  target: MediaGenerationTarget;
  localUnknown?: true;
} {
  const card = record(value);
  const ref = record(card?.ref);
  if (!ref) return { target: generationTarget(value) };
  if (!exactKeys(ref, ["type", "id"]) || !validGenerationId(ref.id)) throw new Error("Invalid generation target");
  if (ref.type === "run-object") return { target: { type: "run-object", id: ref.id } };
  if (ref.type !== "artifact") throw new Error("Invalid generation target");
  if (card?.selectedRevisionId === null) {
    return { target: { type: "artifact-revision", id: ref.id }, localUnknown: true };
  }
  if (!validGenerationId(card?.selectedRevisionId)) throw new Error("Invalid generation target");
  return { target: { type: "artifact-revision", id: card.selectedRevisionId } };
}

function pageCursor(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
    throw new Error("Invalid page cursor");
  }
  return value;
}

function validDocumentSearchQuery(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && Buffer.byteLength(value.trim(), "utf8") <= 1_024;
}

function activityCursor(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid activity cursor");
  return value;
}

function asPage(value: unknown): ProjectPage {
  if (!value || typeof value !== "object" || !Array.isArray((value as Page<unknown>).items)) {
    throw new Error("Invalid Project page");
  }
  return value as ProjectPage;
}

function asActivityPage(value: unknown, project: ProjectRef, afterSequence: number): ProjectPage {
  const page = record(value);
  if (!page || !exactKeys(page, ["items", "nextCursor"]) || !Array.isArray(page.items)
    || page.items.length > PROJECT_PAGE_LIMIT) throw new Error("Invalid Activity page");
  let previous = afterSequence;
  for (const raw of page.items) {
    const item = record(raw);
    if (!item || !exactKeys(item, ["sequence", "workspaceId", "projectId", "entityType", "entityId", "action", "createdAt"])
      || !sequence(item.sequence, true) || item.sequence <= previous
      || item.workspaceId !== project.workspaceId || !optionalScope(item.projectId, project.projectId)
      || !validId(item.entityType) || !validId(item.entityId) || !validId(item.action)
      || !finite(item.createdAt) || item.createdAt < 0) throw new Error("Invalid Activity page");
    previous = item.sequence;
  }
  if (page.nextCursor !== null && (!sequence(page.nextCursor, true)
    || page.nextCursor <= afterSequence || page.nextCursor < previous)) throw new Error("Invalid Activity page");
  return value as ProjectPage;
}

function asMediaPage(value: unknown, project: ProjectRef): ProjectPage {
  const page = record(value);
  if (!page || !exactKeys(page, ["items", "nextCursor"]) || !Array.isArray(page.items)
    || page.items.length > PROJECT_PAGE_LIMIT
    || (page.nextCursor !== null && (typeof page.nextCursor !== "string" || !page.nextCursor || page.nextCursor.length > 4096))) {
    throw new Error("Invalid Media page");
  }
  for (const item of page.items) {
    const value = record(item);
    validateMediaCard(item, project, mediaRef(value?.ref));
  }
  return value as ProjectPage;
}

function mediaQuery(value: ProjectMediaQuery | undefined): ProjectMediaQuery {
  const query = value ?? { filter: "all" };
  const raw = record(query);
  if (!raw || !exactKeys(raw, [
    "filter",
    ...["mediaKind", "provenance"].filter((key) => Object.hasOwn(raw, key)),
  ]) || !PROJECT_MEDIA_FILTERS.includes(raw.filter as ProjectMediaFilter)
    || (raw.mediaKind !== undefined && !PROJECT_MEDIA_KINDS.has(raw.mediaKind as ProjectMediaKind))
    || (raw.provenance !== undefined && !MEDIA_PROVENANCE.has(raw.provenance as MediaProvenance))) {
    throw new Error("Invalid Media query");
  }
  return raw as ProjectMediaQuery;
}

interface ProjectMediaIpcEvent {
  sender: unknown;
  senderFrame: unknown;
}

interface ProjectMediaIpcWindow {
  isDestroyed(): boolean;
  webContents: { mainFrame: unknown };
}

function parseProjectMediaIpcProject(value: unknown): ProjectRef {
  const project = record(value);
  if (!project || !exactKeys(project, ["workspaceId", "projectId"])
    || !validId(project.workspaceId) || !validId(project.projectId)) {
    throw new Error("Invalid project reference");
  }
  return { workspaceId: project.workspaceId, projectId: project.projectId };
}

function parseProjectUnitPageRequest(value: unknown): ProjectUnitPageRequest {
  const input = record(value);
  if (!input || (input.kind !== "revisions" && input.kind !== "items" && input.kind !== "presentations")) {
    throw new Error("Invalid Unit page request");
  }
  const idKey = input.kind === "revisions" ? "unitId" : "revisionId";
  if (!exactKeys(input, ["kind", idKey, ...Object.hasOwn(input, "cursor") ? ["cursor"] : []])
    || !validId(input[idKey])) throw new Error("Invalid Unit page request");
  const cursor = pageCursor(input.cursor);
  return {
    kind: input.kind,
    [idKey]: input[idKey],
    ...(cursor === undefined ? {} : { cursor }),
  } as ProjectUnitPageRequest;
}

const COMPOSITION_KINDS = new Set(["video", "carousel", "sticker-pack", "image", "audio", "document", "custom"]);
const BUILD_STATES = new Set(["pending", "running", "succeeded", "failed", "cancelled"]);

function compositionDto(value: unknown, project: ProjectRef, compositionId: string): value is CompositionDto {
  const item = record(value);
  return !!item && exactKeys(item, [
    "id", "projectId", "slug", "kind", "latestRevisionId", "selectedRevisionId", "createdAt", "updatedAt",
  ]) && item.id === compositionId && item.projectId === project.projectId
    && validId(item.slug) && COMPOSITION_KINDS.has(item.kind as string)
    && (item.latestRevisionId === null || validId(item.latestRevisionId))
    && (item.selectedRevisionId === null || validId(item.selectedRevisionId))
    && sequence(item.createdAt) && sequence(item.updatedAt);
}

function compositionRevisionDto(value: unknown, revisionId: string, compositionId?: string): value is CompositionRevisionDto {
  const item = record(value);
  return !!item && exactKeys(item, [
    "id", "compositionId", "revisionNo", "parentRevisionId", "iterationId", "state", "engine",
    "engineVersion", "authoredBySessionId", "createdAt", "sealedAt",
  ]) && item.id === revisionId && (compositionId === undefined ? validId(item.compositionId) : item.compositionId === compositionId)
    && sequence(item.revisionNo, true) && (item.parentRevisionId === null || validId(item.parentRevisionId))
    && (item.iterationId === null || validId(item.iterationId)) && (item.state === "draft" || item.state === "sealed")
    && validId(item.engine) && (item.engineVersion === null || validId(item.engineVersion))
    && (item.authoredBySessionId === null || validId(item.authoredBySessionId))
    && sequence(item.createdAt) && (item.sealedAt === null || sequence(item.sealedAt));
}

function compositionBuildDto(value: unknown, buildId: string, revisionId?: string): value is BuildDto {
  const item = record(value);
  return !!item && exactKeys(item, [
    "id", "compositionRevisionId", "runId", "state", "createdAt", "finishedAt",
  ]) && item.id === buildId
    && (revisionId === undefined ? validId(item.compositionRevisionId) : item.compositionRevisionId === revisionId)
    && (item.runId === null || validId(item.runId)) && BUILD_STATES.has(item.state as string)
    && sequence(item.createdAt) && (item.finishedAt === null || sequence(item.finishedAt));
}

function compositionEvaluationDto(value: unknown, project: ProjectRef, target: EvaluationDto["target"]): value is EvaluationDto {
  const item = record(value);
  const actualTarget = record(item?.target);
  return !!item && exactKeys(item, [
    "id", "workspaceId", "projectId", "target", "kind", "verdict", "favorite", "rating", "tags",
    "note", "authoredBySessionId", "createdAt",
  ]) && validId(item.id) && item.workspaceId === project.workspaceId && optionalScope(item.projectId, project.projectId)
    && !!actualTarget && exactKeys(actualTarget, ["type", "id"])
    && actualTarget.type === target.type && actualTarget.id === target.id
    && validId(item.kind) && (item.verdict === null || validId(item.verdict))
    && typeof item.favorite === "boolean" && (item.rating === null || (sequence(item.rating, true) && (item.rating as number) <= 5))
    && Array.isArray(item.tags) && item.tags.length <= 64 && item.tags.every(validId)
    && (item.note === null || (typeof item.note === "string" && Buffer.byteLength(item.note, "utf8") <= 65_536))
    && validId(item.authoredBySessionId) && sequence(item.createdAt);
}

function compositionPage<Item>(value: unknown, validItem: (item: unknown) => item is Item): Page<Item> {
  const page = record(value);
  if (!page || !exactKeys(page, ["items", "nextCursor"]) || !Array.isArray(page.items)
    || page.items.length > PROJECT_PAGE_LIMIT || !page.items.every(validItem)
    || (page.nextCursor !== null && (typeof page.nextCursor !== "string" || !page.nextCursor || page.nextCursor.length > 4096))) {
    throw new Error("Invalid Composition page");
  }
  return value as Page<Item>;
}

function parseProjectCompositionPageRequest(value: unknown): ProjectCompositionPageRequest {
  const input = record(value);
  const kinds = ["revisions", "sources", "inputs", "revision-evaluations", "builds", "build-outputs", "build-evaluations"];
  if (!input || !kinds.includes(input.kind as string)) throw new Error("Invalid Composition page request");
  const idKey = input.kind === "revisions" ? "compositionId"
    : input.kind === "build-outputs" || input.kind === "build-evaluations" ? "buildId" : "revisionId";
  if (!exactKeys(input, ["kind", idKey, ...Object.hasOwn(input, "cursor") ? ["cursor"] : []]) || !validId(input[idKey])) {
    throw new Error("Invalid Composition page request");
  }
  const cursor = pageCursor(input.cursor);
  return { kind: input.kind, [idKey]: input[idKey], ...(cursor === undefined ? {} : { cursor }) } as ProjectCompositionPageRequest;
}

export function registerProjectMediaIpc<Root>({
  handle,
  getWindow,
  captureRoot,
  assertRoot,
  session,
  authorizeTrustedLocator,
  openPath,
  showItemInFolder,
  writeBuffer,
}: {
  handle(
    channel: string,
    listener: (event: ProjectMediaIpcEvent, ...args: unknown[]) => Promise<unknown>,
  ): void;
  getWindow(): ProjectMediaIpcWindow | null;
  captureRoot(): Root;
  assertRoot(root: Root): void;
  session: Pick<RalphySession, "client">;
  authorizeTrustedLocator(
    root: Root,
    absolutePath: string,
    mime: string | null,
    expectedBytes: number,
    assertCurrent: () => void,
  ): Promise<string>;
  openPath(path: string): unknown;
  showItemInFolder(path: string): unknown;
  writeBuffer(format: "public.file-url", data: Buffer): unknown;
}): void {
  type Reader = ReturnType<typeof createProjectReader>;
  const secured = (
    listener: (reader: Reader, root: Root, assertCurrent: () => void, ...args: unknown[]) => unknown,
  ): ((event: ProjectMediaIpcEvent, ...args: unknown[]) => Promise<unknown>) => (
    (event, ...args) => toIpcResult(async () => {
      assertTrustedSender(event, getWindow());
      const root = captureRoot();
      const assertCurrent = () => {
        assertTrustedSender(event, getWindow());
        assertRoot(root);
      };
      assertCurrent();
      const request: Request = async <Method extends BridgeMethod>(
        method: Method,
        params: ParamsFor<Method>,
      ): Promise<ResultFor<Method>> => {
        assertCurrent();
        const result = await session.client.request(method, params);
        assertCurrent();
        return result;
      };
      const result = await listener(createProjectReader({ request }), root, assertCurrent, ...args);
      assertCurrent();
      return result;
    })
  );

  handle(MEDIA_CHANNELS.loadProjectGeneration, secured((reader, _root, _assertCurrent, rawProject, rawTarget, rawAfter) => (
    reader.loadGeneration(
      parseProjectMediaIpcProject(rawProject),
      generationTarget(rawTarget),
      pageCursor(rawAfter),
    )
  )));
  handle(MEDIA_CHANNELS.loadProjectMediaCard, secured((reader, _root, _assertCurrent, rawProject, rawRef) => (
    reader.loadMediaCard(parseProjectMediaIpcProject(rawProject), mediaRef(rawRef))
  )));
  handle(MEDIA_CHANNELS.loadProjectMediaRevisions, secured((reader, _root, _assertCurrent, rawProject, rawArtifactId, rawAfter) => {
    if (!validGenerationId(rawArtifactId)) throw new Error("Invalid Artifact identifier");
    return reader.loadMediaRevisions(
      parseProjectMediaIpcProject(rawProject),
      rawArtifactId,
      pageCursor(rawAfter),
    );
  }));
  handle(MEDIA_CHANNELS.selectProjectMediaRevision, secured((
    reader,
    _root,
    _assertCurrent,
    rawProject,
    rawArtifactId,
    rawRevisionId,
    rawExpectedSelectedRevisionId,
  ) => {
    if (!validGenerationId(rawArtifactId) || !validGenerationId(rawRevisionId)
      || (rawExpectedSelectedRevisionId !== null && !validGenerationId(rawExpectedSelectedRevisionId))) {
      throw new Error("Invalid Artifact selection");
    }
    return reader.selectMediaRevision(
      parseProjectMediaIpcProject(rawProject),
      rawArtifactId,
      rawRevisionId,
      rawExpectedSelectedRevisionId,
    );
  }));
  handle(MEDIA_CHANNELS.reviewProjectMedia, secured((
    reader,
    _root,
    _assertCurrent,
    rawProject,
    rawArtifactId,
    rawExpectedSelectedRevisionId,
    rawVerdict,
  ) => {
    if (!validId(rawArtifactId) || !validId(rawExpectedSelectedRevisionId)
      || (rawVerdict !== "approved" && rawVerdict !== "needs-work" && rawVerdict !== "rejected")) {
      throw new Error("Invalid Media review");
    }
    return reader.reviewMedia(
      parseProjectMediaIpcProject(rawProject),
      rawArtifactId,
      rawExpectedSelectedRevisionId,
      rawVerdict,
    );
  }));
  handle(MEDIA_CHANNELS.performProjectMediaAction, secured(async (
    reader,
    root,
    assertCurrent,
    rawProject,
    rawRef,
    rawAction,
  ) => {
    if (rawAction !== "open" && rawAction !== "finder" && rawAction !== "copy") {
      throw new Error("Invalid Media action");
    }
    const locator = await reader.resolveMediaActionLocator(
      parseProjectMediaIpcProject(rawProject),
      mediaRef(rawRef),
      rawAction,
    );
    assertCurrent();
    const path = await authorizeTrustedLocator(
      root,
      locator.absolutePath,
      locator.mime,
      locator.bytes,
      assertCurrent,
    );
    assertCurrent();
    if (rawAction === "open") {
      assertCurrent();
      await openPath(path);
      assertCurrent();
    } else if (rawAction === "finder") {
      assertCurrent();
      showItemInFolder(path);
    } else {
      assertCurrent();
      writeBuffer("public.file-url", Buffer.from(pathToFileURL(path).href));
    }
    return undefined;
  }));
  handle(MEDIA_CHANNELS.searchProjectDocuments, secured((reader, _root, _assertCurrent, rawProject, rawQuery, rawAfter) => {
    if (!validDocumentSearchQuery(rawQuery)) {
      throw new RalphyBridgeError(
        "E_VALIDATION_FAILED",
        "Document search query must be 1–1,024 UTF-8 bytes after trimming.",
      );
    }
    return reader.searchDocuments(
      parseProjectMediaIpcProject(rawProject),
      rawQuery,
      pageCursor(rawAfter),
    );
  }));
  handle(MEDIA_CHANNELS.loadProjectComposition, secured((reader, _root, _assertCurrent, rawProject, rawCompositionId) => {
    if (!validId(rawCompositionId)) throw new Error("Invalid Composition identifier");
    return reader.loadProjectComposition(parseProjectMediaIpcProject(rawProject), rawCompositionId);
  }));
  handle(MEDIA_CHANNELS.loadProjectCompositionRevision, secured((reader, _root, _assertCurrent, rawProject, rawRevisionId) => {
    if (!validId(rawRevisionId)) throw new Error("Invalid Composition revision identifier");
    return reader.loadProjectCompositionRevision(parseProjectMediaIpcProject(rawProject), rawRevisionId);
  }));
  handle(MEDIA_CHANNELS.loadProjectCompositionBuild, secured((reader, _root, _assertCurrent, rawProject, rawBuildId) => {
    if (!validId(rawBuildId)) throw new Error("Invalid Composition Build identifier");
    return reader.loadProjectCompositionBuild(parseProjectMediaIpcProject(rawProject), rawBuildId);
  }));
  handle(MEDIA_CHANNELS.loadProjectCompositionPage, secured((reader, _root, _assertCurrent, rawProject, rawRequest) => (
    reader.loadProjectCompositionPage(
      parseProjectMediaIpcProject(rawProject),
      parseProjectCompositionPageRequest(rawRequest),
    )
  )));
  handle(MEDIA_CHANNELS.loadProjectUnit, secured((reader, _root, _assertCurrent, rawProject, rawUnitId) => {
    if (!validId(rawUnitId)) throw new Error("Invalid Unit identifier");
    return reader.loadProjectUnit(parseProjectMediaIpcProject(rawProject), rawUnitId);
  }));
  handle(MEDIA_CHANNELS.loadProjectUnitRevision, secured((reader, _root, _assertCurrent, rawProject, rawUnitId, rawRevisionId) => {
    if (!validId(rawUnitId) || !validId(rawRevisionId)) throw new Error("Invalid Unit revision identifier");
    return reader.loadProjectUnitRevision(
      parseProjectMediaIpcProject(rawProject),
      rawUnitId,
      rawRevisionId,
    );
  }));
  handle(MEDIA_CHANNELS.loadProjectUnitPage, secured((reader, _root, _assertCurrent, rawProject, rawRequest) => {
    const project = parseProjectMediaIpcProject(rawProject);
    const input = parseProjectUnitPageRequest(rawRequest);
    if (input.kind === "revisions") return reader.loadProjectUnitPage(project, input);
    if (input.kind === "items") return reader.loadProjectUnitPage(project, input);
    return reader.loadProjectUnitPage(project, input);
  }));
  handle(MEDIA_CHANNELS.loadProjectUnitPreview, secured((reader, _root, _assertCurrent, rawProject, rawRevisionId, rawPlatform) => {
    if (!validId(rawRevisionId) || !validId(rawPlatform)) throw new Error("Invalid Unit preview request");
    return reader.loadProjectUnitPreview(parseProjectMediaIpcProject(rawProject), rawRevisionId, rawPlatform);
  }));
  handle(MEDIA_CHANNELS.selectProjectUnitRevision, secured((reader, _root, _assertCurrent, rawProject, rawUnitId, rawRevisionId, rawExpectedSelectedRevisionId) => {
    if (!validId(rawUnitId) || !validId(rawRevisionId)
      || (rawExpectedSelectedRevisionId !== null && !validId(rawExpectedSelectedRevisionId))) {
      throw new Error("Invalid Unit selection");
    }
    return reader.selectProjectUnitRevision(
      parseProjectMediaIpcProject(rawProject),
      rawUnitId,
      rawRevisionId,
      rawExpectedSelectedRevisionId,
    );
  }));
}

export function createProjectReader({ request, mint }: { request: Request; mint?: Mint }) {
  const documentDetails = new Map<string, DocumentDetailDto>();
  async function loadProjectCompositionPage(
    project: ProjectRef,
    rawInput: ProjectCompositionPageRequest,
  ): Promise<Page<CompositionRevisionDto | CompositionSourceDto | CompositionInputDto | EvaluationDto | BuildDto | BuildOutputDto>> {
    const context = projectContext(project);
    const input = parseProjectCompositionPageRequest(rawInput);
    const after = pageCursor(input.cursor);
    const cursor = after ? { after } : {};
    if (input.kind === "revisions") {
      const value = await request("composition.revisions", { context, compositionId: input.compositionId, order: "newest", ...cursor, limit: PROJECT_PAGE_LIMIT });
      return compositionPage(value, (item): item is CompositionRevisionDto => {
        const id = record(item)?.id;
        return validId(id) && compositionRevisionDto(item, id, input.compositionId);
      });
    }
    if (input.kind === "sources") {
      const value = await request("composition.sources", { context, revisionId: input.revisionId, ...cursor, limit: PROJECT_PAGE_LIMIT });
      return compositionPage(value, (item): item is CompositionSourceDto => {
        const source = record(item);
        return !!source && exactKeys(source, ["id", "compositionRevisionId", "objectId", "position", "createdAt"])
          && validId(source.id) && source.compositionRevisionId === input.revisionId && validId(source.objectId)
          && sequence(source.position) && sequence(source.createdAt);
      });
    }
    if (input.kind === "inputs") {
      const value = await request("composition.inputs", { context, revisionId: input.revisionId, ...cursor, limit: PROJECT_PAGE_LIMIT });
      return compositionPage(value, (item): item is CompositionInputDto => {
        const compositionInput = record(item);
        return !!compositionInput && exactKeys(compositionInput, ["id", "compositionRevisionId", "artifactRevisionId", "role", "position", "createdAt"])
          && validId(compositionInput.id) && compositionInput.compositionRevisionId === input.revisionId
          && validId(compositionInput.artifactRevisionId) && validId(compositionInput.role)
          && sequence(compositionInput.position) && sequence(compositionInput.createdAt);
      });
    }
    if (input.kind === "revision-evaluations") {
      const target = { type: "composition_revision" as const, id: input.revisionId };
      return compositionPage(
        await request("evaluation.list", { context, target, order: "newest", ...cursor, limit: PROJECT_PAGE_LIMIT }),
        (item): item is EvaluationDto => compositionEvaluationDto(item, context, target),
      );
    }
    if (input.kind === "builds") {
      const value = await request("composition.builds", { context, compositionRevisionId: input.revisionId, order: "newest", ...cursor, limit: PROJECT_PAGE_LIMIT });
      return compositionPage(value, (item): item is BuildDto => {
        const id = record(item)?.id;
        return validId(id) && compositionBuildDto(item, id, input.revisionId);
      });
    }
    if (input.kind === "build-outputs") {
      const value = await request("build.outputs", { context, buildId: input.buildId, ...cursor, limit: PROJECT_PAGE_LIMIT });
      return compositionPage(value, (item): item is BuildOutputDto => {
        const output = record(item);
        return !!output && exactKeys(output, ["id", "buildId", "artifactRevisionId", "role", "position", "createdAt"])
          && validId(output.id) && output.buildId === input.buildId && validId(output.artifactRevisionId)
          && (output.role === null || validId(output.role)) && sequence(output.position) && sequence(output.createdAt);
      });
    }
    if (input.kind !== "build-evaluations") throw new Error("Invalid Composition page request");
    const target = { type: "build" as const, id: input.buildId };
    return compositionPage(
      await request("evaluation.list", { context, target, order: "newest", ...cursor, limit: PROJECT_PAGE_LIMIT }),
      (item): item is EvaluationDto => compositionEvaluationDto(item, context, target),
    );
  }

  function loadProjectUnitPage(
    project: ProjectRef,
    input: Extract<ProjectUnitPageRequest, { kind: "revisions" }>,
  ): Promise<Page<UnitRevisionDto>>;
  function loadProjectUnitPage(
    project: ProjectRef,
    input: Extract<ProjectUnitPageRequest, { kind: "items" }>,
  ): Promise<Page<UnitItemDto>>;
  function loadProjectUnitPage(
    project: ProjectRef,
    input: Extract<ProjectUnitPageRequest, { kind: "presentations" }>,
  ): Promise<Page<UnitPresentationDto>>;
  async function loadProjectUnitPage(
    project: ProjectRef,
    rawInput: ProjectUnitPageRequest,
  ): Promise<Page<UnitRevisionDto> | Page<UnitItemDto> | Page<UnitPresentationDto>> {
    const context = projectContext(project);
    const input = parseProjectUnitPageRequest(rawInput);
    const after = pageCursor(input.cursor);
    if (input.kind === "revisions") {
      return unitPage(
        await request("unit.revisions", {
          context, unitId: input.unitId, order: "newest",
          ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT,
        }),
        (item): item is UnitRevisionDto => unitRevisionDto(item, input.unitId),
      );
    }
    if (input.kind === "items") {
      return unitPage(
        await request("unit.items", {
          context, revisionId: input.revisionId,
          ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT,
        }),
        (item): item is UnitItemDto => unitItemDto(item, input.revisionId),
      );
    }
    return unitPage(
      await request("unit.presentations", {
        context, revisionId: input.revisionId,
        ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT,
      }),
      (item): item is UnitPresentationDto => unitPresentationDto(item, input.revisionId),
    );
  }

  return {
    async loadOverview(project: ProjectRef): Promise<ProjectOverviewDto> {
      const context = projectContext(project);
      return projectOverviewDto(await request("project.overview", {
        context,
        projectId: context.projectId,
        sections: {
          documents: { limit: PROJECT_OVERVIEW_LIMIT },
          iterations: { limit: PROJECT_OVERVIEW_LIMIT },
          feedback: { limit: PROJECT_OVERVIEW_LIMIT },
          stages: { limit: PROJECT_OVERVIEW_LIMIT },
          compositions: { limit: PROJECT_OVERVIEW_LIMIT },
          builds: { limit: PROJECT_OVERVIEW_LIMIT },
          units: { limit: PROJECT_OVERVIEW_LIMIT },
          runs: { limit: PROJECT_OVERVIEW_LIMIT },
          activity: { afterSequence: 0, limit: PROJECT_ACTIVITY_LIMIT },
          mediaCounts: true,
          publications: { limit: PROJECT_OVERVIEW_LIMIT },
          metrics: true,
        },
      }), context);
    },

    async loadProjectActivityRun(project: ProjectRef, runId: string): Promise<import("../media/types").ActivityRunDetail> {
      const context = projectContext(project);
      if (!validGenerationId(runId)) throw new Error("Invalid Run identifier");
      const run = await request("run.show", { context, runId });
      if (!runDto(run, context) || run.id !== runId) throw new Error("Invalid Activity run detail");
      const value = record(await request("run.attempts", { context, runId, limit: GENERATION_ATTEMPT_LIMIT }));
      if (!value || !exactKeys(value, ["items", "nextCursor"]) || !Array.isArray(value.items)
        || value.items.length > GENERATION_ATTEMPT_LIMIT || !value.items.every((item) => runAttemptDto(item, runId))
        || (value.nextCursor !== null && (typeof value.nextCursor !== "string" || !value.nextCursor || value.nextCursor.length > 4096))) {
        throw new Error("Invalid Activity run detail");
      }
      return { run, attempts: value.items, nextCursor: value.nextCursor };
    },

    async loadPage(input: {
      tab: ProjectTab;
      project: ProjectRef;
      cursor?: string | number | null;
      mediaQuery?: ProjectMediaQuery;
    }): Promise<ProjectPage> {
      const context = projectContext(input.project);
      if (input.tab === "activity") {
        const afterSequence = activityCursor(input.cursor);
        return asActivityPage(await request("activity.list", {
          context,
          afterSequence,
          limit: PROJECT_PAGE_LIMIT,
        }), context, afterSequence);
      }
      const after = pageCursor(input.cursor);
      if (input.tab === "documents") {
        const page = asPage(await request("document.list", { context, ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT })) as Page<DocumentDto>;
        const items = await Promise.all(page.items.map(async (document) => {
          const cacheKey = `${document.id}:${document.currentRevisionId ?? "none"}`;
          const cached = documentDetails.get(cacheKey);
          if (cached) return cached;
          try {
            const detail = await request("document.show", { context, documentId: document.id });
            if (!documentDetailDto(detail, context, document.id)) throw new Error("Invalid Document detail");
            documentDetails.set(cacheKey, detail);
            return detail;
          } catch {
            return document;
          }
        }));
        return { ...page, items };
      }
      if (input.tab === "media") {
        const query = mediaQuery(input.mediaQuery);
        const filter = query.filter === "all" ? {} : { filter: query.filter };
        return asMediaPage(await request("media.list", {
          context,
          ...(after ? { after } : {}),
          ...filter,
          ...(query.mediaKind === undefined ? {} : { mediaKind: query.mediaKind }),
          ...(query.provenance === undefined ? {} : { provenance: query.provenance }),
          limit: PROJECT_PAGE_LIMIT,
          types: query.filter === "advanced-objects" ? ["object"] : ["artifact", "run-object"],
        }), context);
      }
      if (input.tab === "compositions") {
        return asPage(await request("composition.list", {
          context,
          projectId: context.projectId,
          ...(after ? { after } : {}),
          limit: PROJECT_PAGE_LIMIT,
        }));
      }
      if (input.tab === "units") {
        return asPage(await request("unit.list", { context, ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT }));
      }
      throw new Error("Invalid Project tab");
    },

    async loadProjectUnit(project: ProjectRef, unitId: string): Promise<UnitDto> {
      const context = projectContext(project);
      if (!validId(unitId)) throw new Error("Invalid Unit identifier");
      const value = await request("unit.show", { context, unitId });
      if (!unitDto(value, context, unitId)) throw new Error("Invalid Unit");
      return value;
    },

    async loadProjectUnitPreview(project: ProjectRef, revisionId: string, platform: string): Promise<UnitPreviewDto> {
      const context = projectContext(project);
      if (!validId(revisionId) || !validId(platform)) throw new Error("Invalid Unit preview request");
      const preview = await request("unit.preview", { context, unitRevisionId: revisionId, platform });
      if (!unitPreviewDto(preview, revisionId, platform)) throw new Error("Invalid Unit preview");
      return preview;
    },

    async loadProjectUnitRevision(
      project: ProjectRef,
      unitId: string,
      revisionId: string,
    ): Promise<UnitRevisionDto> {
      const context = projectContext(project);
      if (!validId(unitId) || !validId(revisionId)) throw new Error("Invalid Unit revision identifier");
      const value = await request("unit.revision.show", { context, revisionId });
      if (!unitRevisionDto(value, unitId)) throw new Error("Invalid Unit revision");
      return value;
    },

    loadProjectUnitPage,

    async selectProjectUnitRevision(
      project: ProjectRef,
      unitId: string,
      revisionId: string,
      expectedSelectedRevisionId: string | null,
    ): Promise<UnitDto> {
      const context = projectContext(project);
      if (!validId(unitId) || !validId(revisionId)
        || (expectedSelectedRevisionId !== null && !validId(expectedSelectedRevisionId))) {
        throw new Error("Invalid Unit selection");
      }
      const value = await request("unit.select", {
        context, unitId, revisionId, expectedSelectedRevisionId,
      });
      if (!unitDto(value, context, unitId) || value.selectedRevisionId !== revisionId) {
        throw new Error("Invalid Unit selection");
      }
      return value;
    },

    async loadGeneration(
      project: ProjectRef,
      source: MediaGenerationTarget | MediaCardDto,
      after?: string | null,
    ): Promise<MediaGenerationDetailDto> {
      const context = projectContext(project);
      const { target, localUnknown } = normalizeGenerationSource(source);
      if (localUnknown) return { status: "unknown", target, reason: "not-recorded" };
      const cursor = pageCursor(after);
      const detail = await request("media.generation.show", {
        context,
        target,
        ...(cursor ? { after: cursor } : {}),
        limit: GENERATION_ATTEMPT_LIMIT,
      });
      return validateGenerationDetail(detail, target, context);
    },

    async loadMediaCard(project: ProjectRef, ref: MediaCardDto["ref"]): Promise<MediaCardDto> {
      const context = projectContext(project);
      const exactRef = mediaRef(ref);
      return validateMediaCard(await request("media.show", { context, ref: exactRef }), context, exactRef);
    },

    async resolveMediaActionLocator(
      project: ProjectRef,
      ref: MediaCardDto["ref"],
      action: ProjectMediaAction,
    ): Promise<{ absolutePath: string; mime: string | null; bytes: number }> {
      const context = projectContext(project);
      const exactRef = mediaRef(ref);
      if (!["open", "finder", "copy"].includes(action)) throw new Error("Invalid Media action");
      const card = validateMediaCard(
        await request("media.show", { context, ref: exactRef }),
        context,
        exactRef,
      );
      if (!card.target) throw new Error("Media has no resolvable target");
      const locator = record(await request("locator.resolve", {
        context,
        target: card.target,
        purpose: action === "copy" ? "drag" : action,
      }));
      if (!locator || !exactKeys(locator, ["absolutePath", "mime", "bytes"])
        || !validPath(locator.absolutePath) || !isAbsolute(locator.absolutePath)
        || (locator.mime !== null && (typeof locator.mime !== "string" || !locator.mime || locator.mime.length > 1024))
        || !Number.isSafeInteger(locator.bytes) || (locator.bytes as number) < 0) {
        throw new Error("Invalid action locator");
      }
      return locator as { absolutePath: string; mime: string | null; bytes: number };
    },

    async loadMediaRevisions(
      project: ProjectRef,
      artifactId: string,
      after?: string | null,
    ): Promise<Page<ArtifactRevisionDto>> {
      const context = projectContext(project);
      if (!validGenerationId(artifactId)) throw new Error("Invalid Artifact identifier");
      const cursor = pageCursor(after);
      const value = await request("media.revisions", {
        context,
        ref: { type: "artifact", id: artifactId },
        ...(cursor ? { after: cursor } : {}),
        limit: PROJECT_PAGE_LIMIT,
      });
      const result = record(value);
      if (!result || !exactKeys(result, ["items", "nextCursor"])
        || !Array.isArray(result.items) || result.items.length > PROJECT_PAGE_LIMIT
        || !result.items.every((item) => artifactRevision(item, artifactId))
        || (result.nextCursor !== null && (typeof result.nextCursor !== "string" || !result.nextCursor || result.nextCursor.length > 4096))) {
        throw new Error("Invalid Artifact revision page");
      }
      return value;
    },

    async selectMediaRevision(
      project: ProjectRef,
      artifactId: string,
      revisionId: string,
      expectedSelectedRevisionId: string | null,
    ): Promise<ArtifactMediaCardDto> {
      const context = projectContext(project);
      if (!validGenerationId(artifactId) || !validGenerationId(revisionId)
        || (expectedSelectedRevisionId !== null && !validGenerationId(expectedSelectedRevisionId))) {
        throw new Error("Invalid Artifact selection");
      }
      const selected = await request("media.select", {
        context,
        ref: { type: "artifact", id: artifactId },
        revisionId,
        expectedSelectedRevisionId,
      });
      return validateArtifactCard(selected, context, artifactId, revisionId);
    },

    async reviewMedia(
      project: ProjectRef,
      artifactId: string,
      expectedSelectedRevisionId: string,
      verdict: ProjectMediaReviewVerdict,
    ): Promise<ArtifactMediaCardDto> {
      const context = projectContext(project);
      if (!validId(artifactId) || !validId(expectedSelectedRevisionId)
        || !["approved", "needs-work", "rejected"].includes(verdict)) {
        throw new Error("Invalid Media review");
      }
      const started = await request("session.start", {
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        agent: "desktop",
      });
      if (!validId(started.id) || started.workspaceId !== context.workspaceId
        || started.projectId !== context.projectId || started.endedAt !== null) {
        throw new Error("Invalid Media review session");
      }
      let failed = false;
      try {
        const reviewed = await request("media.review", {
          context: { sessionId: started.id },
          ref: { type: "artifact", id: artifactId },
          expectedSelectedRevisionId,
          verdict,
        });
        return validateMediaReview(reviewed, context, artifactId, verdict);
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        try {
          await request("session.end", { sessionId: started.id });
        } catch (error) {
          if (!failed) throw error;
        }
      }
    },

    async loadDocumentPreview(project: ProjectRef, revisionId: string) {
      const context = projectContext(project);
      if (!validId(revisionId)) throw new Error("Invalid document revision identifier");
      let afterByte = 0;
      let text = "";
      let format = "text";
      let truncated = false;
      for (let remaining = DOCUMENT_PREVIEW_MAX_BYTES; remaining > 0;) {
        const limitBytes = Math.min(DOCUMENT_PREVIEW_CHUNK_BYTES, remaining);
        const page = await request("document.content", { context, revisionId, afterByte, limitBytes });
        if (typeof page.text !== "string" || typeof page.format !== "string") throw new Error("Invalid document content");
        const chunkBytes = Buffer.byteLength(page.text, "utf8");
        if (chunkBytes > remaining) {
          truncated = true;
          break;
        }
        text += page.text;
        format = page.format;
        remaining -= chunkBytes;
        if (page.nextByte === null) break;
        if (!Number.isSafeInteger(page.nextByte) || page.nextByte <= afterByte) {
          throw new Error("Invalid document content cursor");
        }
        afterByte = page.nextByte;
        if (remaining === 0) truncated = true;
      }
      return { revisionId, format, text, truncated };
    },

    async searchDocuments(project: ProjectRef, query: string, after?: string | null): Promise<Page<DocumentSearchDto>> {
      const context = projectContext(project);
      if (!validDocumentSearchQuery(query)) {
        throw new Error("Invalid document search query");
      }
      const cursor = pageCursor(after);
      return documentSearchPage(await request("document.search", {
        context, query, ...(cursor ? { after: cursor } : {}), limit: PROJECT_PAGE_LIMIT,
      }), context);
    },

    async showDocument(project: ProjectRef, documentId: string): Promise<DocumentDetailDto> {
      const context = projectContext(project);
      if (!validId(documentId)) throw new Error("Invalid document identifier");
      const detail = await request("document.show", { context, documentId });
      if (!documentDetailDto(detail, context, documentId)) throw new Error("Invalid Document detail");
      return detail;
    },

    async reviseDocument(project: ProjectRef, input: {
      documentId: string;
      expectedHeadId?: string | null;
      iterationId?: string | null;
      format: "markdown" | "text" | "json";
      title?: string | null;
      body: JsonValue;
    }): Promise<DocumentRevisionDto> {
      const context = projectContext(project);
      if (!validId(input.documentId)) throw new Error("Invalid document identifier");
      return await request("document.revise", { context, ...input });
    },

    async loadProjectComposition(project: ProjectRef, compositionId: string): Promise<CompositionDto> {
      const context = projectContext(project);
      if (!validId(compositionId)) throw new Error("Invalid composition identifier");
      const value = await request("composition.show", { context, compositionId });
      if (!compositionDto(value, context, compositionId)) throw new Error("Invalid Composition");
      return value;
    },

    async loadProjectCompositionRevision(project: ProjectRef, revisionId: string): Promise<CompositionRevisionDto> {
      const context = projectContext(project);
      if (!validId(revisionId)) throw new Error("Invalid Composition revision identifier");
      const value = await request("composition.revision.show", { context, revisionId });
      if (!compositionRevisionDto(value, revisionId)) throw new Error("Invalid Composition revision");
      return value;
    },

    async loadProjectCompositionBuild(project: ProjectRef, buildId: string): Promise<BuildDto> {
      const context = projectContext(project);
      if (!validId(buildId)) throw new Error("Invalid Composition Build identifier");
      const value = await request("build.show", { context, buildId });
      if (!compositionBuildDto(value, buildId)) throw new Error("Invalid Composition Build");
      return value;
    },

    loadProjectCompositionPage,

    async reviseComposition(project: ProjectRef, input: ReviseCompositionInput): Promise<CompositionRevisionDto> {
      const context = projectContext(project);
      if (!validId(input.compositionId) || !validId(input.engine)) throw new Error("Invalid composition revision request");
      for (const id of [input.expectedLatestRevisionId, input.parentRevisionId, input.iterationId]) {
        if (id !== undefined && id !== null && !validId(id)) throw new Error("Invalid composition revision request");
      }
      return await request("composition.revise", { context, ...input });
    },

    async selectCompositionRevision(project: ProjectRef, input: {
      compositionId: string;
      revisionId: string;
      expectedSelectedRevisionId: string | null;
    }): Promise<CompositionDto> {
      const context = projectContext(project);
      if (!validId(input.compositionId) || !validId(input.revisionId) || (input.expectedSelectedRevisionId !== null && !validId(input.expectedSelectedRevisionId))) {
        throw new Error("Invalid composition selection request");
      }
      return await request("composition.select", { context, ...input });
    },

    async buildComposition(project: ProjectRef, compositionRevisionId: string, profile?: JsonValue): Promise<CompositionBuildCompletion> {
      const context = projectContext(project);
      if (!validId(compositionRevisionId)) throw new Error("Invalid composition revision identifier");
      return await request("composition.build", { context, compositionRevisionId, ...(profile === undefined ? {} : { profile }) });
    },

    async resolveCompositionOutputPreview(project: ProjectRef, revisionId: string): Promise<CompositionOutputPreview> {
      const context = projectContext(project);
      if (!validId(revisionId)) throw new Error("Invalid artifact revision identifier");
      const revision = await request("media.revision.show", { context, revisionId });
      if (!revision || revision.id !== revisionId || !validId(revision.objectId)) throw new Error("Invalid Artifact revision");
      if (!mint) throw new Error("Project previews are unavailable");
      const locator = await request("locator.resolve", { context, target: { type: "object", id: revision.objectId }, purpose: "preview" });
      if (!locator || !validPath(locator.absolutePath) || !Number.isSafeInteger(locator.bytes) || locator.bytes < 0 || (locator.mime !== null && typeof locator.mime !== "string")) {
        throw new Error("Invalid preview locator");
      }
      const preview = await mint(locator.absolutePath, locator.mime, locator.bytes);
      return { ...preview, mime: locator.mime };
    },

    async resolvePreview(project: ProjectRef, ref: MediaCardDto["ref"]): Promise<ProjectPreview | null> {
      const context = projectContext(project);
      if (!ref || !validId(ref.id) || !["artifact", "run-object", "object"].includes(ref.type)) {
        throw new Error("Invalid Media reference");
      }
      const card = await request("media.show", { context, ref });
      if (!card || typeof card !== "object" || !("target" in card)) throw new Error("Invalid Media card");
      const target = (card as MediaCardDto).target;
      if (!target) return null;
      if (!mint) throw new Error("Project previews are unavailable");
      const locator = await request("locator.resolve", {
        context,
        target,
        purpose: "preview",
      });
      if (!locator || !validPath(locator.absolutePath) || !Number.isSafeInteger(locator.bytes) || locator.bytes < 0) {
        throw new Error("Invalid preview locator");
      }
      return mint(locator.absolutePath, locator.mime, locator.bytes);
    },
  };
}

export type ProjectActivity = ActivityDto;
