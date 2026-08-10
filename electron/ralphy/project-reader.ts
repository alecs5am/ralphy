import type { RalphyBridgeClient } from "./client";
import { assertTrustedSender, toIpcResult } from "../ipc-security";
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
  RunDto,
} from "./types";
import {
  MEDIA_CHANNELS,
  PROJECT_MEDIA_FILTERS,
} from "../media/types";
import type { RalphySession } from "./session";
import type {
  ProjectMediaFilter,
  ProjectPage,
  ProjectPreview,
  ProjectReference,
  ProjectTab,
} from "../media/types";

export const PROJECT_PAGE_LIMIT = 50;
export const PROJECT_OVERVIEW_LIMIT = 5;
export const PROJECT_ACTIVITY_LIMIT = 10;
export const DOCUMENT_PREVIEW_CHUNK_BYTES = 65_536;
export const DOCUMENT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
export const GENERATION_ATTEMPT_LIMIT = 20;

export type ProjectRef = ProjectReference;
export type { ProjectMediaFilter, ProjectPage, ProjectPreview, ProjectTab };

type Request = Pick<RalphyBridgeClient, "request">["request"];
type Mint = (absolutePath: string, mime: string | null, expectedBytes: number) => Promise<ProjectPreview>;

export type CompositionBuildAggregate = BuildDto & {
  outputs: BuildOutputDto[];
  evaluations: EvaluationDto[];
};
export type CompositionRevisionAggregate = CompositionRevisionDto & {
  sources: CompositionSourceDto[];
  inputs: CompositionInputDto[];
  evaluations: EvaluationDto[];
  builds: CompositionBuildAggregate[];
};
export type CompositionAggregate = CompositionDto & { revisions: CompositionRevisionAggregate[] };
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
    || !target || !exactKeys(target, ["type", "id"]) || target.type !== "object"
    || target.id !== card.selectedObjectId) {
    throw new Error("Invalid selected Artifact");
  }
  return value as ArtifactMediaCardDto;
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

async function drain<Item>(load: (after?: string) => Promise<Page<Item>>): Promise<Item[]> {
  const items: Item[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await load(after);
    if (!page || !Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== "string")) {
      throw new Error("Invalid Composition page");
    }
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    if (!page.nextCursor || page.nextCursor === after) throw new Error("Invalid Composition page cursor");
    after = page.nextCursor;
  }
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

export function registerProjectMediaIpc<Root>({
  handle,
  getWindow,
  captureRoot,
  assertRoot,
  session,
}: {
  handle(
    channel: string,
    listener: (event: ProjectMediaIpcEvent, ...args: unknown[]) => Promise<unknown>,
  ): void;
  getWindow(): ProjectMediaIpcWindow | null;
  captureRoot(): Root;
  assertRoot(root: Root): void;
  session: Pick<RalphySession, "client">;
}): void {
  type Reader = ReturnType<typeof createProjectReader>;
  const secured = (
    listener: (reader: Reader, ...args: unknown[]) => unknown,
  ): ((event: ProjectMediaIpcEvent, ...args: unknown[]) => Promise<unknown>) => (
    (event, ...args) => toIpcResult(async () => {
      assertTrustedSender(event, getWindow());
      const root = captureRoot();
      const request: Request = async <Method extends BridgeMethod>(
        method: Method,
        params: ParamsFor<Method>,
      ): Promise<ResultFor<Method>> => {
        assertRoot(root);
        const result = await session.client.request(method, params);
        assertRoot(root);
        return result;
      };
      return listener(createProjectReader({ request }), ...args);
    })
  );

  handle(MEDIA_CHANNELS.loadProjectGeneration, secured((reader, rawProject, rawTarget, rawAfter) => (
    reader.loadGeneration(
      parseProjectMediaIpcProject(rawProject),
      generationTarget(rawTarget),
      pageCursor(rawAfter),
    )
  )));
  handle(MEDIA_CHANNELS.loadProjectMediaRevisions, secured((reader, rawProject, rawArtifactId, rawAfter) => {
    if (!validGenerationId(rawArtifactId)) throw new Error("Invalid Artifact identifier");
    return reader.loadMediaRevisions(
      parseProjectMediaIpcProject(rawProject),
      rawArtifactId,
      pageCursor(rawAfter),
    );
  }));
  handle(MEDIA_CHANNELS.selectProjectMediaRevision, secured((
    reader,
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
}

export function createProjectReader({ request, mint }: { request: Request; mint?: Mint }) {
  return {
    async loadOverview(project: ProjectRef): Promise<ProjectOverviewDto> {
      const context = projectContext(project);
      return await request("project.overview", {
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
      });
    },

    async loadPage(input: {
      tab: ProjectTab;
      project: ProjectRef;
      cursor?: string | number | null;
      mediaFilter?: ProjectMediaFilter;
    }): Promise<ProjectPage> {
      const context = projectContext(input.project);
      if (input.tab === "activity") {
        return asPage(await request("activity.list", {
          context,
          afterSequence: activityCursor(input.cursor),
          limit: PROJECT_PAGE_LIMIT,
        }));
      }
      const after = pageCursor(input.cursor);
      if (input.tab === "documents") {
        return asPage(await request("document.list", { context, ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT }));
      }
      if (input.tab === "media") {
        const mediaFilter = input.mediaFilter ?? "all";
        if (!PROJECT_MEDIA_FILTERS.includes(mediaFilter)) throw new Error("Invalid Media filter");
        const filter = mediaFilter === "all" ? {} : { filter: mediaFilter };
        return asPage(await request("media.list", {
          context,
          ...(after ? { after } : {}),
          ...filter,
          limit: PROJECT_PAGE_LIMIT,
          types: mediaFilter === "advanced-objects" ? ["object"] : ["artifact", "run-object"],
        }));
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

    async searchDocuments(project: ProjectRef, query: string): Promise<Page<DocumentSearchDto>> {
      const context = projectContext(project);
      if (!query.trim()) throw new Error("Document search query must not be empty");
      return await request("document.search", { context, query, limit: PROJECT_PAGE_LIMIT });
    },

    async showDocument(project: ProjectRef, documentId: string): Promise<DocumentDetailDto> {
      const context = projectContext(project);
      if (!validId(documentId)) throw new Error("Invalid document identifier");
      return await request("document.show", { context, documentId });
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

    async loadComposition(project: ProjectRef, compositionId: string): Promise<CompositionAggregate> {
      const context = projectContext(project);
      if (!validId(compositionId)) throw new Error("Invalid composition identifier");
      const composition = await request("composition.show", { context, compositionId });
      const revisions = await drain((after) => request("composition.revisions", {
        context,
        compositionId,
        ...(after ? { after } : {}),
        limit: PROJECT_PAGE_LIMIT,
      }));
      const aggregates: CompositionRevisionAggregate[] = [];
      for (const revision of revisions) {
        const revisionId = revision.id;
        const sources = await drain((after) => request("composition.sources", { context, revisionId, ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT }));
        const inputs = await drain((after) => request("composition.inputs", { context, revisionId, ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT }));
        const evaluations = await drain((after) => request("evaluation.list", { context, target: { type: "composition_revision", id: revisionId }, ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT }));
        const builds = await drain((after) => request("composition.builds", { context, compositionRevisionId: revisionId, ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT }));
        const buildAggregates: CompositionBuildAggregate[] = [];
        for (const build of builds) {
          const outputs = await drain((after) => request("build.outputs", { context, buildId: build.id, ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT }));
          const buildEvaluations = await drain((after) => request("evaluation.list", { context, target: { type: "build", id: build.id }, ...(after ? { after } : {}), limit: PROJECT_PAGE_LIMIT }));
          buildAggregates.push({ ...build, outputs, evaluations: buildEvaluations });
        }
        aggregates.push({ ...revision, sources, inputs, evaluations, builds: buildAggregates });
      }
      return { ...composition, revisions: aggregates };
    },

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
