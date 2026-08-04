import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  authenticateConsumer,
  readFarmIdentity,
  type ConsumerAuthority,
} from "../store/consumer-auth.js";
import { findConsumerOperation, listRunResults } from "../store/consumer-runs.js";
import { getDocumentContent } from "../store/document-content.js";
import {
  replaceBuildDocumentBinding,
  replaceProjectDocumentBinding,
} from "../store/document-content.js";
import {
  createDocument,
  documentMutationContext,
  getDocument,
  listDocumentRevisions,
  listDocuments,
  reviseDocument,
  searchDocuments,
} from "../store/documents.js";
import { latestActivitySequence, listActivity } from "../store/activity.js";
import { openDomainDb } from "../store/db.js";
import { getMediaCard, listMedia, reviewMedia } from "../store/media.js";
import { listArtifactRevisions, selectArtifactRevision } from "../store/artifacts.js";
import { createEvaluation, getEvaluation, listEvaluations } from "../store/evaluations.js";
import {
  getComposition,
  listCompositions,
  listCompositionRevisions,
  getCompositionRevision,
  reviseComposition,
  selectCompositionRevision,
} from "../store/compositions.js";
import {
  getUnit,
  listUnits,
  listUnitRevisions,
  getUnitRevision,
  reviseUnit,
  selectUnitRevision,
  listMetricSnapshots,
  getMetricTotals,
  listPublications,
  findPublicationByIdempotencyKey,
  getPublication,
  getUnitPresentation,
  startPublicationSubmission,
  cancelDraftPublication,
  requestPublicationReconciliation,
  expirePublicationOperationClaim,
  startMetricRefresh,
} from "../store/units.js";
import {
  getProjectOverview,
  getWorkspaceOverview,
} from "../store/overviews.js";
import {
  getCampaign,
  listCampaigns,
  listCalendarEntries,
  updateCampaign,
  updateCalendarEntry,
} from "../store/operations.js";
import {
  finishRun,
  getRun,
  listRunObjects,
  listRuns,
  startRun,
} from "../store/runs.js";
import {
  addFeedback,
  createIteration,
  getFeedback,
  getIteration,
  getProject,
  getProjectStage,
  getWorkspace,
  listFeedback,
  listIterations,
  listProjectStages,
  listProjects,
  listSocialAccounts,
  listWorkspaces,
  resolveFeedback,
  updateProject,
  updateWorkspace,
  upsertSocialAccount,
} from "../store/scopes.js";
import {
  endAgentSession,
  endConsumerSession,
  getAgentSession,
  listAgentSessions,
  startAgentSession,
  startConsumerSession,
} from "../store/sessions.js";
import { resolveQueryContext, type QueryContext } from "../store/scope-context.js";
import { getStoreIdentity } from "../store/sessions.js";
import { exportWorkspacePackage, importWorkspacePackage } from "../store/portable.js";
import { startBuild } from "../store/compositions.js";
import { getObjectRow, resolveObjectPath } from "../store/internal-objects.js";
import { createSecretStore } from "../store/secrets.js";
import { agentTurnStatus, startAgentTurn } from "../agent/session.js";
import { claudeProvider } from "../agent/claude.js";
import { codexProvider } from "../agent/codex.js";
import {
  STATIC_CREDENTIAL_DESCRIPTORS,
  createCredentialResolver,
} from "../providers/credentials.js";
import {
  startGenerationOperation,
  startRepairOperation,
  startTransformOperation,
  startTranscriptionOperation,
  type ReplayableOperationInput,
} from "../controllers/operations.js";
import type { JsonValue } from "../store/types.js";
import {
  BridgeProtocolError,
  MAX_AGENT_DELTA_BYTES,
  MAX_FRAME_BYTES,
  MAX_IN_FLIGHT,
  MAX_OUTBOUND_BYTES,
  MAX_REQUEST_ID_BYTES,
  MAX_SEEN_IDS,
  BRIDGE_PROTOCOL_VERSION,
} from "./protocol.js";
import {
  farmIdentityDigest,
  parseFarmIdentity,
  serializeFarmIdentity,
} from "../store/consumers.js";

export type BridgeMethodKind = "read" | "mutation" | "operation-start";

export type BridgeMethodContext = {
  authority?: ConsumerAuthority;
  consumerSessions: Set<string>;
  activitySubscriptions: Map<string, { sequence: number; ready: boolean }>;
  helloComplete: boolean;
  markHello(): void;
  setAuthority(authority: ConsumerAuthority): void;
};

export type BridgeMethod = {
  kind: BridgeMethodKind;
  handle(params: unknown, context: BridgeMethodContext): unknown | Promise<unknown>;
};

export type BridgeMethodTable = ReadonlyMap<string, BridgeMethod>;

export function createBridgeMethods(input: { dataRoot: string }): BridgeMethodTable {
  const methods = new Map<string, BridgeMethod>();
  const add = (
    name: string,
    kind: BridgeMethodKind,
    handle: BridgeMethod["handle"],
  ) => methods.set(name, { kind, handle });

  add("system.hello", "read", (_params, context) => {
    const hello = systemHello(input.dataRoot, [...methods.keys()]);
    context.markHello();
    return hello;
  });
  add("consumer.authenticate", "mutation", (params, context) => {
    if (!context.helloComplete) throw new Error("system.hello is required first");
    const value = object(params, "consumer.authenticate");
    const namespace = string(value.namespace, "namespace");
    const tokenBase64url = string(value.tokenBase64url, "tokenBase64url");
    const authority = authenticateConsumer(namespace, tokenBase64url);
    context.setAuthority(authority);
    return { namespace, authenticated: true };
  });
  add("consumer.session.start", "mutation", (params, context) => {
    const value = object(params, "consumer.session.start");
    const authority = requireAuthority(context);
    const session = startConsumerSession(authority, {
      workspaceId: string(value.workspaceId, "workspaceId"),
      projectId: optionalString(value.projectId),
      metadata: jsonValue(value.metadata ?? null),
    });
    context.consumerSessions.add(session.id);
    return session;
  });
  add("consumer.session.end", "mutation", (params, context) => {
    const value = object(params, "consumer.session.end");
    const authority = requireAuthority(context);
    const sessionId = string(value.sessionId, "sessionId");
    if (!context.consumerSessions.has(sessionId)) throw new Error("Consumer Session is not owned by this connection");
    const session = endConsumerSession(authority, sessionId);
    context.consumerSessions.delete(sessionId);
    return session;
  });

  add("session.start", "mutation", (params) => {
    const value = object(params, "session.start");
    const workspaceId = string(value.workspaceId, "workspaceId");
    return startAgentSession({
      workspaceId,
      projectId: optionalString(value.projectId),
      agent: string(value.agent, "agent"),
      metadata: jsonValue(value.metadata ?? null),
    });
  });
  add("session.show", "read", (params) => {
    const value = object(params, "session.show");
    const context = scopedContext(value);
    const session = getAgentSession(string(value.sessionId, "sessionId"));
    assertVisible(context, session.workspaceId, session.projectId);
    return session;
  });
  add("session.list", "read", (params) => {
    const value = object(params, "session.list");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    return listAgentSessions({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId ?? undefined,
      cursor: optionalString(value.after),
      limit: limit(value.limit),
    });
  });
  add("session.end", "mutation", (params) => endAgentSession(string(object(params, "session.end").sessionId, "sessionId")));

  add("workspace.list", "read", (params) => {
    const value = objectOrEmpty(params, "workspace.list");
    return listWorkspaces({ cursor: optionalString(value.after), limit: limit(value.limit) });
  });
  add("workspace.show", "read", (params) => {
    const value = object(params, "workspace.show");
    const context = scopedContext(value);
    const workspaceId = string(value.workspaceId, "workspaceId");
    assertVisible(context, workspaceId, null);
    return getWorkspace(workspaceId);
  });
  add("workspace.update", "mutation", (params) => {
    const value = object(params, "workspace.update");
    const context = scopedContext(value);
    const workspaceId = string(value.workspaceId, "workspaceId");
    assertVisible(context, workspaceId, null);
    return updateWorkspace(
      workspaceId,
      { slug: optionalString(value.slug), name: optionalString(value.name), metadata: value.metadata === undefined ? undefined : jsonValue(value.metadata) },
      positiveInteger(value.expectedRowVersion, "expectedRowVersion"),
    );
  });
  add("workspace.overview", "read", (params) => {
    const value = object(params, "workspace.overview");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    return getWorkspaceOverview({
      context,
      workspaceId: string(value.workspaceId ?? scope.workspaceId, "workspaceId"),
      sections: objectOrEmpty(value.sections, "sections") as never,
    });
  });
  add("workspace.account.list", "read", (params) => {
    const value = object(params, "workspace.account.list");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    return listSocialAccounts({ workspaceId: scope.workspaceId, cursor: optionalString(value.after), limit: limit(value.limit) });
  });
  add("workspace.account.upsert", "mutation", (params) => {
    const value = object(params, "workspace.account.upsert");
    const context = scopedContext(value);
    const workspaceId = string(value.workspaceId, "workspaceId");
    assertVisible(context, workspaceId, null);
    return upsertSocialAccount({
      workspaceId,
      platform: string(value.platform, "platform"),
      externalId: string(value.externalId, "externalId"),
      displayName: optionalString(value.displayName),
      username: optionalString(value.username),
      config: value.config === undefined ? null : jsonValue(value.config),
    });
  });
  add("workspace.export", "operation-start", async (params) => {
    const value = object(params, "workspace.export");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    const workspaceId = string(value.workspaceId ?? scope.workspaceId, "workspaceId");
    assertVisible(context, workspaceId, null);
    return exportWorkspacePackage({ workspaceId, projectId: optionalString(value.projectId) ?? null });
  });
  add("workspace.import", "operation-start", async (params) => {
    const value = object(params, "workspace.import");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    return importWorkspacePackage({
      packageObjectId: string(value.packageObjectId, "packageObjectId"),
      idempotencyKey: string(value.idempotencyKey, "idempotencyKey"),
      workspaceSlug: optionalString(value.workspaceSlug) ?? `imported-${scope.workspaceId}`,
      workspaceName: optionalString(value.workspaceName),
      entityAfter: optionalString(value.entityAfter),
      relinkAfter: optionalString(value.relinkAfter),
      limit: value.limit === undefined ? undefined : limit(value.limit),
    });
  });

  add("project.list", "read", (params) => {
    const value = object(params, "project.list");
    const scope = resolveScope(scopedContext(value));
    if (scope.projectId !== null) {
      return { items: [getProject({ workspaceId: scope.workspaceId, projectId: scope.projectId })], nextCursor: null };
    }
    return listProjects({ workspaceId: scope.workspaceId, cursor: optionalString(value.after), limit: limit(value.limit) });
  });
  add("project.show", "read", (params) => {
    const value = object(params, "project.show");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    const project = getProject({ workspaceId: scope.workspaceId, projectId: string(value.projectId, "projectId") });
    assertVisible(context, project.workspaceId, project.id);
    return project;
  });
  add("project.update", "mutation", (params) => {
    const value = object(params, "project.update");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    const current = getProject({ workspaceId: scope.workspaceId, projectId: string(value.projectId, "projectId") });
    assertVisible(context, current.workspaceId, current.id);
    return updateProject(current.id, {
      slug: optionalString(value.slug),
      name: optionalString(value.name),
      state: optionalString(value.state) as "active" | "archived" | undefined,
      metadata: value.metadata === undefined ? undefined : jsonValue(value.metadata),
    }, positiveInteger(value.expectedRowVersion, "expectedRowVersion"));
  });
  add("project.status", "read", (params) => {
    const value = object(params, "project.status");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    const projectId = string(value.projectId, "projectId");
    assertVisible(context, scope.workspaceId, projectId);
    if (value.stageId !== undefined) return getProjectStage({ context, stageId: string(value.stageId, "stageId") });
    return listProjectStages({ context, projectId, after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("project.overview", "read", (params) => {
    const value = object(params, "project.overview");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    const projectId = string(value.projectId, "projectId");
    assertVisible(context, scope.workspaceId, projectId);
    return getProjectOverview({ context, projectId, sections: objectOrEmpty(value.sections, "sections") as never });
  });
  add("project.iteration.list", "read", (params) => {
    const value = object(params, "project.iteration.list");
    const context = scopedContext(value);
    return listIterations({ context, projectId: string(value.projectId, "projectId"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("project.iteration.create", "mutation", (params) => {
    const value = object(params, "project.iteration.create");
    const context = scopedContext(value);
    const projectId = string(value.projectId, "projectId");
    assertVisible(context, resolveScope(context).workspaceId, projectId);
    return createIteration({ projectId, title: string(value.title, "title"), reason: optionalString(value.reason) });
  });

  add("feedback.list", "read", (params) => {
    const value = object(params, "feedback.list");
    return listFeedback({ context: scopedContext(value), projectId: string(value.projectId, "projectId"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("feedback.add", "mutation", (params) => {
    const value = object(params, "feedback.add");
    const context = scopedContext(value);
    const iterationId = string(value.iterationId, "iterationId");
    getIteration({ context, iterationId });
    const target = value.target === undefined ? undefined : object(value.target, "target");
    return addFeedback({
      iterationId,
      body: string(value.body, "body"),
      timecodeMs: value.timecodeMs === undefined ? undefined : integer(value.timecodeMs, "timecodeMs"),
      target: target === undefined ? undefined : { type: string(target.type, "target.type") as never, id: string(target.id, "target.id") },
    });
  });
  add("feedback.resolve", "mutation", (params) => {
    const value = object(params, "feedback.resolve");
    const context = scopedContext(value);
    getFeedback({ context, feedbackId: string(value.feedbackId, "feedbackId") });
    return resolveFeedback(string(value.feedbackId, "feedbackId"), { note: optionalString(value.note) });
  });

  add("document.create", "mutation", (params) => {
    const value = object(params, "document.create");
    const scope = resolveScope(scopedContext(value));
    return createDocument({
      ...(scope.projectId === null ? { workspaceId: scope.workspaceId } : { projectId: scope.projectId }),
      kind: string(value.kind, "kind") as never,
      slug: string(value.slug, "slug"),
      title: string(value.title, "title"),
    });
  });
  add("document.list", "read", (params) => {
    const value = object(params, "document.list");
    return listDocuments({ context: scopedContext(value), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("document.show", "read", (params) => {
    const value = object(params, "document.show");
    return getDocument({ context: scopedContext(value), documentId: string(value.documentId, "documentId") });
  });
  add("document.revisions", "read", (params) => {
    const value = object(params, "document.revisions");
    return listDocumentRevisions({ context: scopedContext(value), documentId: string(value.documentId, "documentId"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("document.content", "read", (params) => {
    const value = object(params, "document.content");
    return getDocumentContent({ context: scopedContext(value), revisionId: string(value.revisionId, "revisionId"), afterByte: integer(value.afterByte, "afterByte"), limitBytes: integer(value.limitBytes, "limitBytes") });
  });
  add("document.search", "read", (params) => {
    const value = object(params, "document.search");
    return searchDocuments({ context: scopedContext(value), query: string(value.query, "query"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("document.revise", "mutation", (params) => {
    const value = object(params, "document.revise");
    const context = scopedContext(value);
    const documentId = string(value.documentId, "documentId");
    const mutationContext = documentMutationContext(context, documentId);
    return reviseDocument({
      documentId,
      expectedHeadId: value.expectedHeadId === undefined ? null : optionalString(value.expectedHeadId),
      iterationId: optionalString(value.iterationId),
      format: string(value.format, "format") as never,
      title: optionalString(value.title),
      body: jsonValue(value.body),
      authoredBySessionId: mutationContext.sessionId,
    });
  });
  add("document.bind", "mutation", (params) => {
    const value = object(params, "document.bind");
    const context = scopedContext(value);
    const ownerProjectId = optionalString(value.projectId);
    const ownerBuildId = optionalString(value.buildId);
    if ((ownerProjectId === undefined) === (ownerBuildId === undefined)) throw new Error("Document binding requires exactly one owner");
    const input = {
      context,
      role: string(value.role, "role"),
      revisionId: string(value.revisionId, "revisionId"),
      expectedRevisionId: value.expectedRevisionId === null ? null : string(value.expectedRevisionId, "expectedRevisionId"),
    };
    return ownerProjectId === undefined
      ? replaceBuildDocumentBinding({ ...input, buildId: ownerBuildId! })
      : replaceProjectDocumentBinding({ ...input, projectId: ownerProjectId });
  });

  add("media.list", "read", (params) => {
    const value = object(params, "media.list");
    return listMedia({ context: scopedContext(value), types: value.types as never, after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("media.show", "read", (params) => {
    const value = object(params, "media.show");
    return getMediaCard({ context: scopedContext(value), ref: object(value.ref, "ref") as never });
  });
  add("media.revisions", "read", (params) => {
    const value = object(params, "media.revisions");
    const context = scopedContext(value);
    const ref = object(value.ref, "ref");
    if (string(ref.type, "ref.type") !== "artifact") throw new Error("Only Artifact refs have revisions");
    return listArtifactRevisions({
      context,
      artifactId: string(ref.id, "ref.id"),
      after: optionalString(value.after),
      limit: limit(value.limit),
    });
  });
  add("media.select", "mutation", (params) => {
    const value = object(params, "media.select");
    const context = scopedContext(value);
    const ref = object(value.ref, "ref");
    if (string(ref.type, "ref.type") !== "artifact") throw new Error("Only Artifact refs may be selected");
    getMediaCard({ context, ref: ref as never });
    return selectArtifactRevision({
      artifactId: string(ref.id, "ref.id"),
      revisionId: string(value.revisionId, "revisionId"),
      expectedRevisionId: value.expectedSelectedRevisionId === null ? null : string(value.expectedSelectedRevisionId, "expectedSelectedRevisionId"),
    });
  });
  add("media.review", "mutation", (params) => {
    const value = object(params, "media.review");
    const context = scopedContext(value);
    if (context.sessionId === undefined) throw new Error("Media review requires a Session context");
    return reviewMedia({
      ref: object(value.ref, "ref") as never,
      expectedSelectedRevisionId: string(value.expectedSelectedRevisionId, "expectedSelectedRevisionId"),
      verdict: string(value.verdict, "verdict") as never,
      authoredBySessionId: context.sessionId,
      iterationId: optionalString(value.iterationId),
      feedback: optionalString(value.feedback),
      favorite: value.favorite === undefined ? undefined : Boolean(value.favorite),
      rating: value.rating === undefined || value.rating === null ? value.rating as null | undefined : integer(value.rating, "rating"),
      tags: value.tags === undefined ? undefined : arrayOfStrings(value.tags, "tags"),
      note: optionalString(value.note),
    });
  });

  add("evaluation.list", "read", (params) => {
    const value = object(params, "evaluation.list");
    return listEvaluations({ context: scopedContext(value), targetType: optionalString(value.targetType) as never, after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("evaluation.show", "read", (params) => {
    const value = object(params, "evaluation.show");
    return getEvaluation(scopedContext(value), string(value.evaluationId, "evaluationId"));
  });
  add("evaluation.create", "mutation", (params) => {
    const value = object(params, "evaluation.create");
    const context = scopedContext(value);
    if (context.sessionId === undefined) throw new Error("Evaluation creation requires a Session context");
    const target = object(value.target, "target");
    return createEvaluation({
      target: { type: string(target.type, "target.type") as never, id: string(target.id, "target.id") },
      authoredBySessionId: context.sessionId,
      kind: string(value.kind, "kind"),
      verdict: optionalString(value.verdict),
      favorite: value.favorite === undefined ? undefined : Boolean(value.favorite),
      rating: value.rating === undefined || value.rating === null ? value.rating as null | undefined : integer(value.rating, "rating"),
      tags: value.tags === undefined ? undefined : arrayOfStrings(value.tags, "tags"),
      note: optionalString(value.note),
      report: value.report === undefined ? undefined : jsonValue(value.report),
    });
  });

  add("run.list", "read", (params) => {
    const value = object(params, "run.list");
    return listRuns({ context: scopedContext(value), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("run.show", "read", (params) => {
    const value = object(params, "run.show");
    return getRun({ context: scopedContext(value), runId: string(value.runId, "runId") });
  });
  add("run.results", "read", (params, context) => {
    const value = object(params, "run.results");
    const queryContext = scopedContext(value);
    const runContext = queryContext.sessionId !== undefined && context.authority
      ? { ...queryContext, consumerAuthority: context.authority }
      : queryContext;
    return listRunResults({ context: runContext, runId: string(value.runId, "runId"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("run.objects", "read", (params, context) => {
    const value = object(params, "run.objects");
    const queryContext = scopedContext(value);
    const runContext = queryContext.sessionId !== undefined && context.authority
      ? { ...queryContext, consumerAuthority: context.authority }
      : queryContext;
    return listRunObjects({ context: runContext, runId: string(value.runId, "runId"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("run.cancel", "mutation", (params) => {
    const value = object(params, "run.cancel");
    const context = scopedContext(value);
    const runId = string(value.runId, "runId");
    const run = getRun({ context, runId });
    const expectedState = string(value.expectedState, "expectedState");
    if (run.state !== expectedState) throw new Error("Run state changed before cancellation");
    if (run.state !== "pending" && run.state !== "running") throw new Error("Run is already terminal");
    return finishRun(runId, { state: "cancelled", error: optionalString(value.reason) });
  });

  add("composition.list", "read", (params) => {
    const value = object(params, "composition.list");
    return listCompositions({ context: scopedContext(value), projectId: string(value.projectId, "projectId"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("composition.show", "read", (params) => {
    const value = object(params, "composition.show");
    return getComposition({ context: scopedContext(value), compositionId: string(value.compositionId, "compositionId") });
  });
  add("composition.revise", "mutation", (params) => {
    const value = object(params, "composition.revise");
    const context = scopedContext(value);
    return reviseComposition({
      compositionId: string(value.compositionId, "compositionId"),
      expectedLatestRevisionId: value.expectedLatestRevisionId === null ? null : string(value.expectedLatestRevisionId, "expectedLatestRevisionId"),
      parentRevisionId: optionalString(value.parentRevisionId),
      iterationId: optionalString(value.iterationId),
      engine: string(value.engine, "engine"),
      engineVersion: optionalString(value.engineVersion),
      engineConfig: value.engineConfig === undefined ? undefined : jsonValue(value.engineConfig),
      authoredBySessionId: context.sessionId,
    });
  });
  add("composition.build", "operation-start", (params) => {
    const value = object(params, "composition.build");
    const context = scopedContext(value);
    const scope = resolveScope(context);
    const revision = getCompositionRevision({ context, revisionId: string(value.compositionRevisionId, "compositionRevisionId") });
    if (revision.state !== "sealed") throw new Error("Composition Revision must be sealed before Build");
    const run = startRunForScope(scope, context, "composition.build", value.label);
    return startBuild({ compositionRevisionId: revision.id, runId: run.id, profile: jsonValue(value.profile ?? {}) });
  });
  add("composition.select", "mutation", (params) => {
    const value = object(params, "composition.select");
    return selectCompositionRevision({ compositionId: string(value.compositionId, "compositionId"), revisionId: string(value.revisionId, "revisionId"), expectedSelectedRevisionId: value.expectedSelectedRevisionId === null ? null : string(value.expectedSelectedRevisionId, "expectedSelectedRevisionId") });
  });
  add("composition.revisions", "read", (params) => {
    const value = object(params, "composition.revisions");
    return listCompositionRevisions({ context: scopedContext(value), compositionId: string(value.compositionId, "compositionId"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("composition.revision.show", "read", (params) => {
    const value = object(params, "composition.revision.show");
    return getCompositionRevision({ context: scopedContext(value), revisionId: string(value.revisionId, "revisionId") });
  });

  add("unit.list", "read", (params) => {
    const value = object(params, "unit.list");
    return listUnits({ context: scopedContext(value), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("unit.show", "read", (params) => {
    const value = object(params, "unit.show");
    return getUnit({ context: scopedContext(value), unitId: string(value.unitId, "unitId") });
  });
  add("unit.revisions", "read", (params) => {
    const value = object(params, "unit.revisions");
    return listUnitRevisions({ context: scopedContext(value), unitId: string(value.unitId, "unitId"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("unit.revision.show", "read", (params) => {
    const value = object(params, "unit.revision.show");
    return getUnitRevision({ context: scopedContext(value), revisionId: string(value.revisionId, "revisionId") });
  });
  add("unit.revise", "mutation", (params) => {
    const value = object(params, "unit.revise");
    const context = scopedContext(value);
    return reviseUnit({
      unitId: string(value.unitId, "unitId"),
      expectedLatestRevisionId: value.expectedLatestRevisionId === null ? null : string(value.expectedLatestRevisionId, "expectedLatestRevisionId"),
      parentRevisionId: optionalString(value.parentRevisionId),
      iterationId: optionalString(value.iterationId),
      note: optionalString(value.note),
      metadata: value.metadata === undefined ? undefined : jsonValue(value.metadata),
      items: value.items as never,
      presentations: value.presentations as never,
      authoredBySessionId: context.sessionId,
    });
  });
  add("unit.select", "mutation", (params) => {
    const value = object(params, "unit.select");
    return selectUnitRevision({ unitId: string(value.unitId, "unitId"), revisionId: string(value.revisionId, "revisionId"), expectedSelectedRevisionId: value.expectedSelectedRevisionId === null ? null : string(value.expectedSelectedRevisionId, "expectedSelectedRevisionId") });
  });
  add("unit.preview", "read", (params) => {
    const value = object(params, "unit.preview");
    return getUnit({ context: scopedContext(value), unitId: string(value.unitId, "unitId") });
  });

  add("publication.list", "read", (params) => {
    const value = object(params, "publication.list");
    return listPublications({ context: scopedContext(value), presentationId: string(value.presentationId, "presentationId"), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("publication.lookup", "read", (params) => {
    const value = object(params, "publication.lookup");
    return findPublicationByIdempotencyKey({ context: scopedContext(value), presentationId: string(value.presentationId, "presentationId"), idempotencyKey: string(value.idempotencyKey, "idempotencyKey") });
  });
  add("publication.publish", "operation-start", (params) => {
    const value = object(params, "publication.publish");
    const context = scopedContext(value);
    getUnitPresentation({ context, presentationId: string(value.presentationId, "presentationId") });
    return startPublicationSubmission({
      presentationId: string(value.presentationId, "presentationId"),
      socialAccountId: optionalString(value.socialAccountId),
      rail: string(value.rail, "rail") as never,
      idempotencyKey: string(value.idempotencyKey, "idempotencyKey"),
      scheduledAt: optionalNumber(value.scheduledAt),
      revisedFromPublicationId: optionalString(value.revisedFromPublicationId),
      agentSessionId: context.sessionId,
      leaseMs: value.leaseMs === undefined ? 300_000 : positiveInteger(value.leaseMs, "leaseMs"),
    });
  });
  add("publication.cancel", "operation-start", (params) => {
    const value = object(params, "publication.cancel");
    const context = scopedContext(value);
    getPublication({ context, publicationId: string(value.publicationId, "publicationId") });
    if (string(value.expectedState, "expectedState") !== "draft") throw new Error("Only draft Publication cancellation is local");
    return cancelDraftPublication(string(value.publicationId, "publicationId"), "draft");
  });
  add("publication.reconcile", "operation-start", (params) => {
    const value = object(params, "publication.reconcile");
    const context = scopedContext(value);
    getPublication({ context, publicationId: string(value.publicationId, "publicationId") });
    const claim = object(value.fence, "fence");
    return requestPublicationReconciliation(string(value.publicationId, "publicationId"), {
      fence: { kind: "submission", runId: string(claim.runId, "fence.runId"), epoch: positiveInteger(claim.epoch, "fence.epoch"), token: string(claim.token, "fence.token"), expiresAt: integer(claim.expiresAt, "fence.expiresAt") },
      state: string(value.state, "state") as "reconciliation_required" | "unknown",
      error: string(value.error, "error"),
    });
  });
  add("publication.recover", "mutation", (params) => {
    const value = object(params, "publication.recover");
    const context = scopedContext(value);
    getPublication({ context, publicationId: string(value.publicationId, "publicationId") });
    return expirePublicationOperationClaim(string(value.publicationId, "publicationId"), {
      expectedKind: string(value.expectedKind, "expectedKind") as never,
      expectedEpoch: positiveInteger(value.expectedEpoch, "expectedEpoch"),
      expectedState: string(value.expectedState, "expectedState") as never,
      ...(value.nextState === undefined ? {} : { nextState: string(value.nextState, "nextState") as never }),
      error: string(value.error, "error"),
    } as never);
  });
  add("publication.refresh", "operation-start", (params) => {
    const value = object(params, "publication.refresh");
    const context = scopedContext(value);
    getPublication({ context, publicationId: string(value.publicationId, "publicationId") });
    return startMetricRefresh({
      publicationId: string(value.publicationId, "publicationId"),
      label: string(value.label, "label"),
      source: string(value.source, "source"),
      request: jsonValue(value.request ?? {}),
      agentSessionId: context.sessionId,
    });
  });
  add("metric.list", "read", (params) => {
    const value = object(params, "metric.list");
    return listMetricSnapshots({ context: scopedContext(value), publicationId: string(value.publicationId, "publicationId"), source: optionalString(value.source), asOf: optionalNumber(value.asOf), windowStart: optionalNumber(value.windowStart), windowEnd: optionalNumber(value.windowEnd), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("metric.totals", "read", (params) => {
    const value = object(params, "metric.totals");
    return getMetricTotals({ context: scopedContext(value), publicationIds: arrayOfStrings(value.publicationIds, "publicationIds"), source: optionalString(value.source), asOf: optionalNumber(value.asOf), windowStart: optionalNumber(value.windowStart), windowEnd: optionalNumber(value.windowEnd) });
  });
  add("operation.find", "read", (params, context) => {
    const value = object(params, "operation.find");
    const authority = requireAuthority(context);
    const sessionId = string(value.sessionId, "sessionId");
    if (!context.consumerSessions.has(sessionId)) throw new Error("Consumer Session is not owned by this connection");
    const scope = resolveScope({ sessionId });
    const external = value.external === undefined ? undefined : object(value.external, "external");
    return findConsumerOperation(authority, external === undefined
      ? { sessionId, workspaceId: scope.workspaceId, projectId: scope.projectId ?? undefined, idempotencyKey: string(value.idempotencyKey, "idempotencyKey"), resultsAfter: optionalString(value.after), resultsLimit: limit(value.limit) }
      : { sessionId, workspaceId: scope.workspaceId, projectId: scope.projectId ?? undefined, external: { runId: string(external.runId, "external.runId"), nodeId: string(external.nodeId, "external.nodeId"), attempt: positiveInteger(external.attempt, "external.attempt"), operation: string(external.operation, "external.operation") }, resultsAfter: optionalString(value.after), resultsLimit: limit(value.limit) });
  });

  addOperation(methods, "generation.start", startGenerationOperation);
  addOperation(methods, "transform.start", startTransformOperation);
  addOperation(methods, "transcription.start", startTranscriptionOperation);
  addOperation(methods, "repair.start", startRepairOperation);

  add("campaign.list", "read", (params) => {
    const value = object(params, "campaign.list");
    return listCampaigns({ context: scopedContext(value), state: optionalString(value.state) as never, after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("campaign.show", "read", (params) => {
    const value = object(params, "campaign.show");
    return getCampaign({ context: scopedContext(value), id: string(value.id, "id") });
  });
  add("campaign.update", "mutation", (params) => {
    const value = object(params, "campaign.update");
    return updateCampaign({ context: scopedContext(value), id: string(value.id, "id"), patch: jsonValue(value.patch) as never, expectedRowVersion: positiveInteger(value.expectedRowVersion, "expectedRowVersion") });
  });
  add("calendar.list", "read", (params) => {
    const value = object(params, "calendar.list");
    return listCalendarEntries({ context: scopedContext(value), from: optionalString(value.from), to: optionalString(value.to), after: optionalString(value.after), limit: limit(value.limit) });
  });
  add("calendar.update", "mutation", (params) => {
    const value = object(params, "calendar.update");
    return updateCalendarEntry({ context: scopedContext(value), id: string(value.id, "id"), patch: jsonValue(value.patch) as never, expectedRowVersion: positiveInteger(value.expectedRowVersion, "expectedRowVersion") });
  });

  add("locator.resolve", "read", (params) => {
    const value = object(params, "locator.resolve");
    const context = scopedContext(value);
    const target = object(value.target, "target");
    if (string(target.type, "target.type") !== "object") {
      throw new Error("Only Object locators are available to the trusted main process");
    }
    const objectId = string(target.id, "target.id");
    getMediaCard({ context, ref: { type: "object", id: objectId } });
    const row = getObjectRow(openDomainDb(), objectId);
    if (!row) throw new Error("Object not found");
    const absolutePath = resolveObjectPath(row);
    return { absolutePath, mime: row.mime, bytes: row.bytes };
  });
  add("migration.consumer.map", "read", (params) => {
    const value = object(params, "migration.consumer.map");
    string(value.migrationRunId, "migrationRunId");
    string(value.lockNonce, "lockNonce");
    if (string(value.namespace, "namespace") !== "farm") throw new Error("Only the farm namespace is supported");
    string(value.grantDigest, "grantDigest");
    string(value.sourceIdentityId, "sourceIdentityId");
    string(value.sourceInventoryDigest, "sourceInventoryDigest");
    if (value.afterSourceLocatorHash !== undefined) string(value.afterSourceLocatorHash, "afterSourceLocatorHash");
    return { items: [], nextCursor: null };
  });
  add("migration.desktop.import", "operation-start", (params) => {
    const value = object(params, "migration.desktop.import");
    scopedContext(value);
    return importWorkspacePackage({
      packageObjectId: string(value.packageObjectId, "packageObjectId"),
      idempotencyKey: string(value.idempotencyKey, "idempotencyKey"),
      workspaceSlug: optionalString(value.workspaceSlug),
      workspaceName: optionalString(value.workspaceName),
      entityAfter: optionalString(value.entityAfter),
      relinkAfter: optionalString(value.relinkAfter),
      limit: value.limit === undefined ? undefined : limit(value.limit),
    });
  });
  add("migration.secret.import", "mutation", async (params) => {
    const value = object(params, "migration.secret.import");
    const runId = string(value.runId, "runId");
    const sourceEntryId = string(value.sourceEntryId, "sourceEntryId");
    const ref = string(value.ref, "ref");
    const kind = string(value.kind, "kind");
    const store = createSecretStore({ dataRoot: input.dataRoot });
    if (kind === "text") {
      await store.set(ref, string(value.value, "value"), (db) => {
        recordSecretImport(db, { runId, sourceEntryId, ref, kind });
      });
    } else if (kind === "file") {
      const bytes = decodeBase64(string(value.base64, "base64"));
      await store.setSecretFile(ref, bytes);
      recordSecretImport(openDomainDb(), { runId, sourceEntryId, ref, kind });
    } else {
      throw new Error("migration.secret.import kind must be text or file");
    }
    return { runId, sourceEntryId, ref, kind, imported: true };
  });

  add("activity.list", "read", (params) => {
    const value = object(params, "activity.list");
    return listActivity({ context: scopedContext(value), afterSequence: integer(value.afterSequence, "afterSequence"), limit: limit(value.limit) });
  });
  add("activity.subscribe", "read", (params, context) => {
    const value = object(params, "activity.subscribe");
    const sequence = integer(value.afterSequence, "afterSequence");
    const subscriptionId = string(value.subscriptionId, "subscriptionId");
    if (context.activitySubscriptions.has(subscriptionId)) throw new Error("Activity subscription already exists");
    context.activitySubscriptions.set(subscriptionId, { sequence, ready: false });
    return { subscriptionId, sequence };
  });
  add("activity.unsubscribe", "mutation", (params, context) => {
    const value = object(params, "activity.unsubscribe");
    const subscriptionId = string(value.subscriptionId, "subscriptionId");
    context.activitySubscriptions.delete(subscriptionId);
    return { subscriptionId, unsubscribed: true };
  });
  add("agent.providers", "read", () => [
    codexProvider(),
    claudeProvider(),
    ...STATIC_CREDENTIAL_DESCRIPTORS.map(({ providerId, kind }) => ({ providerId, kind })),
  ]);
  add("agent.credential.status", "read", async (params) => {
    const value = object(params, "agent.credential.status");
    const scope = resolveScope(scopedContext(value));
    const resolver = createCredentialResolver({ dataRoot: input.dataRoot, context: { kind: "scope", workspaceId: scope.workspaceId, projectId: scope.projectId ?? undefined } });
    return resolver.status(string(value.provider, "provider"), value.accountId === undefined ? undefined : { accountId: string(value.accountId, "accountId") });
  });
  add("agent.credential.set", "mutation", async (params) => {
    const value = object(params, "agent.credential.set");
    const scope = resolveScope(scopedContext(value));
    const accountId = value.accountId === undefined ? undefined : string(value.accountId, "accountId");
    const resolver = createCredentialResolver({ dataRoot: input.dataRoot, context: { kind: "scope", workspaceId: scope.workspaceId, projectId: scope.projectId ?? undefined } });
    await resolver.set(string(value.provider, "provider"), string(value.value, "value"), accountId === undefined ? undefined : { accountId, expectedRowVersion: positiveInteger(value.expectedRowVersion, "expectedRowVersion") });
    return { provider: string(value.provider, "provider"), configured: true };
  });
  add("agent.credential.clear", "mutation", async (params) => {
    const value = object(params, "agent.credential.clear");
    const scope = resolveScope(scopedContext(value));
    const accountId = value.accountId === undefined ? undefined : string(value.accountId, "accountId");
    const resolver = createCredentialResolver({ dataRoot: input.dataRoot, context: { kind: "scope", workspaceId: scope.workspaceId, projectId: scope.projectId ?? undefined } });
    await resolver.clear(string(value.provider, "provider"), accountId === undefined ? undefined : { accountId, expectedRowVersion: positiveInteger(value.expectedRowVersion, "expectedRowVersion") });
    return { provider: string(value.provider, "provider"), configured: false };
  });
  add("agent.auth.status", "read", async (params) => {
    const value = object(params, "agent.auth.status");
    const scope = resolveScope(scopedContext(value));
    const resolver = createCredentialResolver({ dataRoot: input.dataRoot, context: { kind: "scope", workspaceId: scope.workspaceId, projectId: scope.projectId ?? undefined } });
    return resolver.status(string(value.provider, "provider"), value.accountId === undefined ? undefined : { accountId: string(value.accountId, "accountId") });
  });
  add("agent.auth.login", "mutation", async (params) => {
    const value = object(params, "agent.auth.login");
    const scope = resolveScope(scopedContext(value));
    const resolver = createCredentialResolver({ dataRoot: input.dataRoot, context: { kind: "scope", workspaceId: scope.workspaceId, projectId: scope.projectId ?? undefined } });
    await resolver.login(string(value.provider, "provider"));
    return { provider: string(value.provider, "provider"), loggedIn: true };
  });
  add("agent.turn.start", "operation-start", (params) => {
    const value = object(params, "agent.turn.start");
    const session = getAgentSession(string(value.sessionId, "sessionId"));
    return startAgentTurn({
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      agentSessionId: session.id,
      provider: string(value.provider, "provider"),
      chatId: optionalString(value.chatId),
    });
  });
  add("agent.turn.status", "read", (params) => {
    const value = object(params, "agent.turn.status");
    return agentTurnStatus(string(value.turnId, "turnId"), value.afterSequence === undefined ? 0 : integer(value.afterSequence, "afterSequence"));
  });
  add("agent.turn.resume", "operation-start", (params) => {
    const value = object(params, "agent.turn.resume");
    const previous = agentTurnStatus(string(value.turnId, "turnId")).turn;
    const session = getAgentSession(string(value.sessionId, "sessionId"));
    if (session.id !== previous.agentSessionId || session.workspaceId !== resolveScope(scopedContext(value)).workspaceId) throw new Error("Agent resume scope conflict");
    return startAgentTurn({
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      agentSessionId: session.id,
      provider: previous.provider,
      chatId: optionalString(value.chatId) ?? previous.chatId,
      resumedFromTurnId: previous.turnId,
    });
  });
  add("agent.turn.stop", "mutation", (params) => {
    const value = object(params, "agent.turn.stop");
    const turn = agentTurnStatus(string(value.turnId, "turnId")).turn;
    const cancelled = finishRun(turn.turnId, { state: "cancelled", error: optionalString(value.reason) });
    return cancelled;
  });

  for (const [name, kind] of [
    ["workspace.export", "operation-start"], ["workspace.import", "operation-start"],
    ["document.bind", "mutation"], ["media.list", "read"], ["media.show", "read"],
    ["media.revisions", "read"], ["media.select", "mutation"], ["media.review", "mutation"],
    ["evaluation.list", "read"], ["evaluation.show", "read"], ["evaluation.create", "mutation"],
    ["run.objects", "read"], ["run.cancel", "mutation"],
    ["composition.list", "read"], ["composition.show", "read"], ["composition.revise", "mutation"],
    ["composition.build", "operation-start"], ["composition.select", "mutation"],
    ["unit.list", "read"], ["unit.show", "read"], ["unit.revise", "mutation"],
    ["unit.select", "mutation"], ["unit.preview", "read"],
    ["publication.list", "read"], ["publication.publish", "operation-start"],
    ["publication.lookup", "operation-start"], ["publication.cancel", "operation-start"],
    ["publication.reconcile", "operation-start"], ["publication.recover", "mutation"],
    ["publication.refresh", "operation-start"], ["metric.list", "read"], ["metric.totals", "read"],
    ["locator.resolve", "read"], ["agent.providers", "read"], ["agent.credential.status", "read"],
    ["agent.credential.set", "mutation"], ["agent.credential.clear", "mutation"],
    ["agent.auth.status", "read"], ["agent.auth.login", "mutation"],
    ["agent.turn.start", "operation-start"], ["agent.turn.resume", "operation-start"],
    ["agent.turn.status", "read"], ["agent.turn.stop", "mutation"],
    ["migration.secret.import", "mutation"], ["migration.desktop.import", "operation-start"],
    ["migration.consumer.map", "read"],
  ] as const) {
    if (!methods.has(name)) addStub(methods, name, kind);
  }

  return methods;
}

function addStub(
  methods: Map<string, BridgeMethod>,
  name: string,
  kind: BridgeMethodKind,
): void {
  methods.set(name, {
    kind,
    handle: () => {
      throw new BridgeProtocolError("E_PROTOCOL_INVALID", `Bridge method is unavailable: ${name}`);
    },
  });
}

function addOperation(
  methods: Map<string, BridgeMethod>,
  name: string,
  operation: (input: ReplayableOperationInput) => unknown,
): void {
  methods.set(name, {
    kind: "operation-start",
    handle: (params, context) => {
      const value = object(params, name);
      const authority = requireAuthority(context);
      const sessionId = string(value.sessionId, "sessionId");
      if (!context.consumerSessions.has(sessionId)) throw new Error("Consumer Session is not owned by this connection");
      const external = object(value.external, "external");
      const job = object(value.job, "job");
      const command = object(job.command, "job.command");
      return operation({
        authority,
        context: {
          sessionId,
          external: {
            runId: string(external.runId, "external.runId"),
            nodeId: string(external.nodeId, "external.nodeId"),
            attempt: positiveInteger(external.attempt, "external.attempt"),
            operation: string(external.operation, "external.operation"),
            idempotencyKey: string(external.idempotencyKey, "external.idempotencyKey"),
          },
        },
        workspaceId: string(value.workspaceId, "workspaceId"),
        projectId: optionalString(value.projectId),
        label: optionalString(value.label),
        request: jsonValue(value.request),
        job: {
          kind: string(job.kind, "job.kind") as never,
          command: { argv: arrayOfStrings(command.argv, "job.command.argv") },
          priority: value.priority === undefined ? undefined : integer(value.priority, "priority"),
          tag: optionalString(value.tag),
        },
        resultsLimit: value.resultsLimit === undefined ? undefined : limit(value.resultsLimit),
      });
    },
  });
}

function systemHello(dataRoot: string, capabilities: string[]): Record<string, unknown> {
  const stat = fs.statSync(dataRoot);
  const rootId = createHash("sha256").update(`${path.resolve(dataRoot)}\0${stat.dev}\0${stat.ino}`).digest("hex");
  let farm: Record<string, unknown> | null = null;
  try {
    const identity = parseFarmIdentity(serializeFarmIdentity(readFarmIdentity()));
    const identityDigest = farmIdentityDigest(serializeFarmIdentity(identity));
    farm = {
      namespace: "farm",
      state: "ready",
      coreMigrationRunId: identity.migrationId,
      migrationId: identity.migrationId,
      stageDigest: identity.stageDigest,
      readyRecordDigest: identityDigest,
      identityDigest,
    };
  } catch {
    // No installed consumer is a valid pre-cutover state.
  }
  const consumers = { farm };
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    coreVersion: "1",
    schemaVersion: 4,
    storeId: getStoreIdentity(),
    rootId,
    capabilities: [...new Set([...capabilities, "workspace.export", "workspace.import", "migration.consumer.map"])].sort(),
    activitySequence: latestActivitySequence(),
    startup: { state: "ready", migration: "complete" },
    limits: {
      maxFrameBytes: MAX_FRAME_BYTES,
      maxRequestIdBytes: MAX_REQUEST_ID_BYTES,
      maxInFlight: MAX_IN_FLIGHT,
      maxSeenIds: MAX_SEEN_IDS,
      maxOutboundBytes: MAX_OUTBOUND_BYTES,
      maxAgentDeltaBytes: MAX_AGENT_DELTA_BYTES,
    },
    consumerNamespaces: ["farm"],
    consumers,
  };
}

function scopedContext(value: Record<string, unknown>): QueryContext {
  const context = object(value.context, "context");
  const hasSession = context.sessionId !== undefined;
  const hasWorkspace = context.workspaceId !== undefined;
  if (hasSession === hasWorkspace) throw new Error("Context requires exactly one Session or Workspace branch");
  if (hasSession) {
    if (Object.keys(context).length !== 1) throw new Error("Session context has unsupported fields");
    return { sessionId: string(context.sessionId, "context.sessionId") };
  }
  if (Object.keys(context).some((key) => !["workspaceId", "projectId"].includes(key))) throw new Error("Workspace context has unsupported fields");
  const workspaceId = string(context.workspaceId, "context.workspaceId");
  const projectId = context.projectId === undefined ? undefined : string(context.projectId, "context.projectId");
  return projectId === undefined ? { workspaceId } : { workspaceId, projectId };
}

function resolveScope(context: QueryContext): { workspaceId: string; projectId: string | null } {
  return resolveQueryContext(openDomainDb(), context);
}

function startRunForScope(
  scope: { workspaceId: string; projectId: string | null },
  context: QueryContext,
  kind: string,
  label: unknown,
) {
  return startRun({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    agentSessionId: context.sessionId ?? null,
    kind,
    label: optionalString(label),
  });
}

function assertVisible(context: QueryContext, workspaceId: string, projectId: string | null): void {
  const scope = resolveScope(context);
  if (scope.workspaceId !== workspaceId || (scope.projectId !== null && projectId !== null && scope.projectId !== projectId)) {
    throw new Error("Entity is outside the requested scope");
  }
}

function requireAuthority(context: BridgeMethodContext): ConsumerAuthority {
  if (!context.authority) throw new Error("Consumer authentication is required");
  return context.authority;
}

function recordSecretImport(
  db: ReturnType<typeof openDomainDb>,
  input: { runId: string; sourceEntryId: string; ref: string; kind: string },
): void {
  const row = db.query<{ metadataJson: string | null; state: string }, [string]>(
    "SELECT metadata_json AS metadataJson, state FROM runs WHERE id = ?",
  ).get(input.runId);
  if (!row) throw new Error("Migration Run not found");
  if (row.state !== "pending" && row.state !== "running") throw new Error("Migration Run is not active");
  const metadata = row.metadataJson ? JSON.parse(row.metadataJson) as Record<string, unknown> : {};
  const imports = Array.isArray(metadata.secretImports)
    ? metadata.secretImports.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    : [];
  const existing = imports.find((entry) => entry.sourceEntryId === input.sourceEntryId && entry.ref === input.ref);
  if (existing && existing.kind !== input.kind) throw new Error("Secret import kind conflict");
  if (!existing) imports.push({ sourceEntryId: input.sourceEntryId, ref: input.ref, kind: input.kind, imported: true });
  metadata.secretImports = imports;
  db.prepare("UPDATE runs SET metadata_json = ? WHERE id = ?").run(JSON.stringify(metadata), input.runId);
}

function decodeBase64(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error("base64 is invalid");
  }
  return Buffer.from(value, "base64");
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function objectOrEmpty(value: unknown, label: string): Record<string, unknown> {
  return value === undefined ? {} : object(value, label);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return string(value, "value");
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  return integer(value, "value");
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  const result = integer(value, label);
  if (result <= 0) throw new Error(`${label} must be positive`);
  return result;
}

function limit(value: unknown): number {
  return value === undefined ? 50 : Math.min(100, positiveInteger(value, "limit"));
}

function arrayOfStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label} must be a string array`);
  return value as string[];
}

function jsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object" && value !== null) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) result[key] = jsonValue(item);
    return result;
  }
  throw new Error("Value must be JSON-compatible");
}
