import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRelation,
  addArtifactRevision,
  addArtifactUsage,
  createArtifact,
  getArtifact,
  getArtifactRelation,
  getArtifactRevision,
  getArtifactUsage,
  listArtifactRelations,
  listArtifactRevisions,
  listArtifacts,
  listArtifactUsages,
  selectArtifactRevision,
} from "../../cli/lib/store/artifacts.js";
import {
  bindCompositionInput,
  completeBuild,
  createComposition,
  getBuild,
  getBuildOutput,
  getComposition,
  getCompositionInput,
  getCompositionRevision,
  getCompositionSource,
  listBuildOutputs,
  listBuilds,
  listCompositionInputs,
  listCompositionRevisions,
  listCompositionSources,
  listCompositions,
  putCompositionSource,
  reviseComposition,
  sealCompositionRevision,
  selectCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import {
  assertLimit,
  buildPage,
  decodeCursor,
  encodeCursor,
  type CursorFamily,
} from "../../cli/lib/store/pagination.js";
import {
  appendActivity,
  assertSafeActivityPayload,
  latestActivitySequence,
  listGlobalActivity,
} from "../../cli/lib/store/activity.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { credentialSecretRef } from "../../cli/lib/providers/credentials.js";
import {
  getDocumentContent,
  getBuildDocumentBinding,
  getProjectDocumentBinding,
  listBuildDocumentBindings,
  listProjectDocumentBindings,
  replaceBuildDocumentBinding,
  replaceProjectDocumentBinding,
} from "../../cli/lib/store/document-content.js";
import {
  createDocument,
  getDocument,
  getDocumentRevision,
  listDocuments,
  listDocumentRevisions,
  reviseDocument,
  searchDocuments,
} from "../../cli/lib/store/documents.js";
import {
  createEvaluation,
  getEvaluation,
  listEvaluations,
} from "../../cli/lib/store/evaluations.js";
import {
  getMediaCard,
  getMediaCards,
  listMedia,
  reviewMedia,
} from "../../cli/lib/store/media.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import {
  getProjectOverview,
  getWorkspaceOverview,
} from "../../cli/lib/store/overviews.js";
import {
  finishRun,
  finishRunAttempt,
  getRun,
  getRunAttempt,
  getRunObject,
  listRunAttempts,
  listRunObjects,
  listRuns,
  recordRunObject,
  recordRunResult,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
import {
  addFeedback,
  createIteration,
  createProject,
  createWorkspace,
  getFeedback,
  getFeedbackResolutionLink,
  getIteration,
  getProject,
  getProjectStage,
  getWorkspace,
  listFeedback,
  listFeedbackResolutionLinks,
  listIterations,
  listProjectStages,
  listProjects,
  listSocialAccounts,
  listWorkspaces,
  resolveFeedback,
  updateProject,
  updateWorkspace,
  upsertSocialAccount,
  updateSocialAccountCredential,
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  getAgentSession,
  listAgentSessions,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import {
  appendMetricSnapshot,
  createUnit,
  getMetricSnapshot,
  getMetricTotals,
  getPresentationCaptionRevision,
  getPresentationItem,
  getPublication,
  getUnit,
  getUnitItem,
  getUnitPresentation,
  getUnitRevision,
  listMetricSnapshots,
  listPresentationCaptionRevisions,
  listPresentationItems,
  listPublications,
  listUnitItems,
  listUnitPresentations,
  listUnitRevisions,
  listUnits,
  recordPublication,
  reviseUnit,
  selectUnitRevision,
} from "../../cli/lib/store/units.js";
import { withPoisonFarmReadTrap } from "../helpers/poison-farm.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const FAMILIES: CursorFamily[] = ["c1", "v1", "p1"];

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-query-surfaces");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

function raw(family: CursorFamily, json: string): string {
  return `${family}.${Buffer.from(json, "utf8").toString("base64url")}`;
}

async function makeSurfaceFixture(): Promise<{
  ordinaryValues: unknown[];
  readQueryBaseline: unknown[];
  readQueryValues: () => unknown[];
  rootDir: string;
}> {
  const root = makeRoot();
  const createdWorkspace = createWorkspace({ slug: "surface", name: "Surface" });
  const workspace = updateWorkspace(
    createdWorkspace.id,
    { name: "Surface updated" },
    createdWorkspace.rowVersion,
  );
  const createdProject = createProject({
    workspaceId: workspace.id,
    slug: "surface",
    name: "Surface",
  });
  const project = updateProject(
    createdProject.id,
    { name: "Surface updated" },
    createdProject.rowVersion,
  );
  const context = { workspaceId: workspace.id, projectId: project.id } as const;
  const createdAccount = upsertSocialAccount({
    workspaceId: workspace.id,
    platform: "tiktok",
    externalId: "surface-account",
    displayName: "Surface",
    config: { profile: "surface" },
  });
  const account = updateSocialAccountCredential({
    workspaceId: workspace.id,
    accountId: createdAccount.id,
    credentialRef: credentialSecretRef("postiz", {
      kind: "scope",
      workspaceId: workspace.id,
      accountId: createdAccount.id,
    }),
    expectedRowVersion: createdAccount.rowVersion,
  });
  const session = startAgentSession({
    workspaceId: workspace.id,
    projectId: project.id,
    agent: "surface-auditor",
  });
  const iteration = createIteration({
    projectId: project.id,
    title: "Surface iteration",
  });
  const document = createDocument({
    projectId: project.id,
    kind: "brief",
    slug: "surface-brief",
    title: "Surface brief",
  });
  const documentRevision = reviseDocument({
    documentId: document.id,
    expectedHeadId: null,
    format: "text",
    body: "private document body",
    authoredBySessionId: session.id,
  });
  const projectBinding = replaceProjectDocumentBinding({
    context,
    projectId: project.id,
    role: "brief",
    revisionId: documentRevision.id,
    expectedRevisionId: null,
  });
  const feedback = addFeedback({
    iterationId: iteration.id,
    target: { type: "document_revision", id: documentRevision.id },
    body: "private feedback body",
  });

  const sourcePath = path.join(root.dir, "surface.bin");
  fs.writeFileSync(sourcePath, "surface bytes");
  const object = await ingestObject({
    scope: { workspaceId: workspace.id, projectId: project.id },
    sourcePath,
    originalName: "private-original-name.bin",
    mime: "application/octet-stream",
    storageClass: "working",
    metadata: { privateObjectFact: true },
  });
  const artifact = createArtifact({
    projectId: project.id,
    slug: "surface-artifact",
    kind: "data",
  });
  const artifactRevision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
    metadata: { privateArtifactFact: true },
    authoredBySessionId: session.id,
  });
  const selectedArtifact = selectArtifactRevision({
    artifactId: artifact.id,
    revisionId: artifactRevision.id,
    expectedRevisionId: null,
  });
  const relatedArtifact = createArtifact({
    projectId: project.id,
    slug: "surface-related",
    kind: "data",
  });
  const relatedRevision = addArtifactRevision({
    artifactId: relatedArtifact.id,
    objectId: object.id,
    state: "candidate",
    authoredBySessionId: session.id,
  });
  const relation = addArtifactRelation({
    fromRevisionId: artifactRevision.id,
    toRevisionId: relatedRevision.id,
    relation: "derived-from",
    metadata: { privateRelationFact: true },
  });
  const usage = addArtifactUsage({
    artifactRevisionId: artifactRevision.id,
    projectId: project.id,
    role: "source",
    lifecycle: "durable",
  });
  const resolvedFeedback = resolveFeedback(feedback.id, {
    note: "private resolution note",
    links: [{ type: "artifact_revision", id: artifactRevision.id }],
  });
  const resolutionLinks = listFeedbackResolutionLinks({
    context,
    feedbackId: feedback.id,
    limit: 10,
  });
  const resolutionLink = resolutionLinks.items[0]!;

  const composition = createComposition({
    projectId: project.id,
    slug: "surface-composition",
    kind: "video",
  });
  const draft = reviseComposition({
    compositionId: composition.id,
    expectedLatestRevisionId: null,
    iterationId: iteration.id,
    engine: "remotion",
    engineConfig: { privateEngineFact: true },
    authoredBySessionId: session.id,
  });
  const compositionInput = bindCompositionInput({
    revisionId: draft.id,
    artifactRevisionId: artifactRevision.id,
    role: "primary",
    position: 0,
    config: { fit: "cover" },
  });
  const compositionSource = putCompositionSource({
    revisionId: draft.id,
    logicalPath: "source/surface.bin",
    objectId: object.id,
    position: 0,
  });
  const compositionRevision = sealCompositionRevision({ revisionId: draft.id });
  const selectedComposition = selectCompositionRevision({
    compositionId: composition.id,
    revisionId: compositionRevision.id,
    expectedSelectedRevisionId: null,
  });
  const buildRun = startRun({
    projectId: project.id,
    agentSessionId: session.id,
    kind: "build",
  });
  const runningBuild = startBuild({
    compositionRevisionId: compositionRevision.id,
    runId: buildRun.id,
    profile: { privateProfileFact: true },
  });
  const buildBinding = replaceBuildDocumentBinding({
    context,
    buildId: runningBuild.id,
    role: "brief",
    revisionId: documentRevision.id,
    expectedRevisionId: null,
  });
  const build = completeBuild({
    buildId: runningBuild.id,
    outputs: [
      { artifactRevisionId: artifactRevision.id, role: "preview", position: 0 },
    ],
  });
  finishRun(buildRun.id, { state: "succeeded" });
  const buildOutputs = listBuildOutputs({ context, buildId: build.id, limit: 10 });
  const buildOutput = buildOutputs.items[0]!;
  const stageId = "stage_surface_ready";
  openDomainDb()
    .prepare(
      `INSERT INTO project_stages
       (id, project_id, stage, state, entity_type, entity_id, metadata_json,
        row_version, updated_at)
       VALUES (?, ?, 'render', 'ready', 'build', ?, '{"private":true}', 1, 1)`,
    )
    .run(stageId, project.id, build.id);

  const run = startRun({
    projectId: project.id,
    agentSessionId: session.id,
    kind: "generation",
    metadata: { privateRunFact: true },
  });
  const runResult = recordRunResult(openDomainDb(), {
    runId: run.id,
    position: 0,
    entityType: "document_revision",
    entityId: documentRevision.id,
  });
  const runObject = recordRunObject({
    runId: run.id,
    path: "tmp/private-worker-file.bin",
    purpose: "intermediate",
    state: "working",
    retention: "working",
    mime: "application/octet-stream",
    bytes: 10,
    sha256: "a".repeat(64),
    metadata: { privateRunObjectFact: true },
  });
  const runningAttempt = startRunAttempt({
    runId: run.id,
    provider: "fixture-provider",
    model: "fixture-model",
    request: { privateRequestFact: true },
  });
  const attempt = finishRunAttempt(runningAttempt.id, {
    state: "failed",
    response: { privateResponseFact: true },
    costUsd: 0,
    error: "private attempt error",
  });
  const finishedRun = finishRun(run.id, {
    state: "failed",
    error: "private run error",
  });

  const unit = createUnit({
    projectId: project.id,
    slug: "surface-unit",
    format: "video",
  });
  const unitRevision = reviseUnit({
    unitId: unit.id,
    expectedLatestRevisionId: null,
    iterationId: iteration.id,
    authoredBySessionId: session.id,
    metadata: { privateUnitFact: true },
    items: [
      {
        documentRevisionId: documentRevision.id,
        role: "caption-source",
        position: 0,
        config: { layout: "center" },
      },
    ],
    presentations: [
      {
        platform: "tiktok",
        position: 0,
        captions: [{ state: "final", text: "Public caption" }],
        effectiveCaptionRevisionNo: 1,
        options: { chrome: "tiktok" },
        items: [{ unitItemPosition: 0, position: 0, config: { crop: "cover" } }],
      },
    ],
  });
  const selectedUnit = selectUnitRevision({
    unitId: unit.id,
    revisionId: unitRevision.id,
    expectedSelectedRevisionId: null,
  });
  const unitItems = listUnitItems({ context, revisionId: unitRevision.id, limit: 10 });
  const presentations = listUnitPresentations({
    context,
    revisionId: unitRevision.id,
    limit: 10,
  });
  const presentation = presentations.items[0]!;
  const captions = listPresentationCaptionRevisions({
    context,
    presentationId: presentation.id,
    limit: 10,
  });
  const presentationItems = listPresentationItems({
    context,
    presentationId: presentation.id,
    limit: 10,
  });
  const publicationRun = startRun({ projectId: project.id, kind: "publication" });
  const publication = recordPublication({
    presentationId: presentation.id,
    socialAccountId: account.id,
    submissionRunId: publicationRun.id,
    rail: "postiz",
    idempotencyKey: "surface-publication",
  });
  const metricRun = startRun({ projectId: project.id, kind: "metric-refresh" });
  const metric = appendMetricSnapshot({
    publicationId: publication.id,
    runId: metricRun.id,
    position: 0,
    source: "postiz",
    asOf: 1,
    views: 1,
    raw: { privateProviderFact: true },
  });
  const evaluation = createEvaluation({
    target: { type: "build", id: build.id },
    authoredBySessionId: session.id,
    kind: "quality",
    verdict: "approved",
    report: { privateReportFact: true },
  });
  const review = reviewMedia({
    ref: { type: "artifact", id: artifact.id },
    expectedSelectedRevisionId: artifactRevision.id,
    verdict: "approved",
    authoredBySessionId: session.id,
  });
  const endedSession = endAgentSession(session.id);

  const mutationValues: unknown[] = [
    workspace,
    project,
    account,
    session,
    endedSession,
    iteration,
    resolvedFeedback,
    resolutionLink,
    projectBinding,
    buildBinding,
    object,
    selectedArtifact,
    artifactRevision,
    relation,
    usage,
    finishedRun,
    attempt,
    runObject,
    runResult,
    selectedComposition,
    compositionRevision,
    compositionInput,
    compositionSource,
    build,
    buildOutput,
    selectedUnit,
    unitRevision,
    publication,
    metric,
    evaluation,
    review,
  ];

  const readQueryValues = (): unknown[] => [
    getWorkspace(workspace.id),
    listWorkspaces({ limit: 10 }),
    getProject({ workspaceId: workspace.id, projectId: project.id }),
    listProjects({ workspaceId: workspace.id, limit: 10 }),
    listSocialAccounts({ workspaceId: workspace.id, limit: 10 }),
    getAgentSession(session.id),
    listAgentSessions({ workspaceId: workspace.id, projectId: project.id, limit: 10 }),
    getIteration({ context, iterationId: iteration.id }),
    listIterations({ context, projectId: project.id, limit: 10 }),
    getFeedback({ context, feedbackId: feedback.id }),
    listFeedback({ context, projectId: project.id, limit: 10 }),
    getFeedbackResolutionLink({ context, linkId: resolutionLink.id }),
    listFeedbackResolutionLinks({ context, feedbackId: feedback.id, limit: 10 }),
    getProjectStage({ context, stageId }),
    listProjectStages({ context, projectId: project.id, limit: 10 }),
    getDocument({ context, documentId: document.id }),
    listDocuments({ context, limit: 10 }),
    getDocumentRevision({ context, revisionId: documentRevision.id }),
    listDocumentRevisions({ context, documentId: document.id, limit: 10 }),
    getDocumentContent({
      context,
      revisionId: documentRevision.id,
      afterByte: 0,
      limitBytes: 64,
    }),
    searchDocuments({ context, query: "private", limit: 10 }),
    getProjectDocumentBinding(context, { projectId: project.id, role: "brief" }),
    listProjectDocumentBindings(context, { projectId: project.id, limit: 10 }),
    getBuildDocumentBinding(context, { buildId: build.id, role: "brief" }),
    listBuildDocumentBindings(context, { buildId: build.id, limit: 10 }),
    getArtifact({ context, artifactId: artifact.id }),
    listArtifacts({ context, limit: 10 }),
    getArtifactRevision({ context, revisionId: artifactRevision.id }),
    listArtifactRevisions({ context, artifactId: artifact.id, limit: 10 }),
    getArtifactRelation({ context, relationId: relation.id }),
    listArtifactRelations({ context, revisionId: artifactRevision.id, limit: 10 }),
    getArtifactUsage({ context, usageId: usage.id }),
    listArtifactUsages({ context, revisionId: artifactRevision.id, limit: 10 }),
    getRun({ context, runId: run.id }),
    listRuns({ context, limit: 10 }),
    getRunAttempt({ context, attemptId: attempt.id }),
    listRunAttempts({ context, runId: run.id, limit: 10 }),
    getRunObject({ context, runObjectId: runObject.id }),
    listRunObjects({ context, runId: run.id, limit: 10 }),
    getComposition({ context, compositionId: composition.id }),
    listCompositions({ context, projectId: project.id, limit: 10 }),
    getCompositionRevision({ context, revisionId: compositionRevision.id }),
    listCompositionRevisions({ context, compositionId: composition.id, limit: 10 }),
    getCompositionInput({ context, inputId: compositionInput.id }),
    listCompositionInputs({ context, revisionId: compositionRevision.id, limit: 10 }),
    getCompositionSource({ context, sourceId: compositionSource.id }),
    listCompositionSources({ context, revisionId: compositionRevision.id, limit: 10 }),
    getBuild({ context, buildId: build.id }),
    listBuilds({ context, compositionRevisionId: compositionRevision.id, limit: 10 }),
    getBuildOutput({ context, outputId: buildOutput.id }),
    listBuildOutputs({ context, buildId: build.id, limit: 10 }),
    getUnit({ context, unitId: unit.id }),
    listUnits({ context, limit: 10 }),
    getUnitRevision({ context, revisionId: unitRevision.id }),
    listUnitRevisions({ context, unitId: unit.id, limit: 10 }),
    getUnitItem({ context, itemId: unitItems.items[0]!.id }),
    listUnitItems({ context, revisionId: unitRevision.id, limit: 10 }),
    getUnitPresentation({ context, presentationId: presentation.id }),
    listUnitPresentations({ context, revisionId: unitRevision.id, limit: 10 }),
    getPresentationCaptionRevision({
      context,
      captionRevisionId: captions.items[0]!.id,
    }),
    listPresentationCaptionRevisions({
      context,
      presentationId: presentation.id,
      limit: 10,
    }),
    getPresentationItem({
      context,
      presentationItemId: presentationItems.items[0]!.id,
    }),
    listPresentationItems({ context, presentationId: presentation.id, limit: 10 }),
    getPublication({ context, publicationId: publication.id }),
    listPublications({ context, presentationId: presentation.id, limit: 10 }),
    getMetricSnapshot({ context, metricSnapshotId: metric.id }),
    listMetricSnapshots({ context, publicationId: publication.id, limit: 10 }),
    getMetricTotals({ context, publicationIds: [publication.id] }),
    getEvaluation(context, evaluation.id),
    listEvaluations({ context, limit: 10 }),
    getWorkspaceOverview({
      context: { workspaceId: workspace.id },
      workspaceId: workspace.id,
      sections: {
        documents: { limit: 10 },
        units: { limit: 10 },
        accounts: { limit: 10 },
        projects: { limit: 10 },
        activity: { afterSequence: 0, limit: 50 },
      },
    }),
    getProjectOverview({
      context,
      projectId: project.id,
      sections: {
        documents: { limit: 10 },
        iterations: { limit: 10 },
        feedback: { limit: 10 },
        stages: { limit: 10 },
        compositions: { limit: 10 },
        builds: { limit: 10 },
        units: { limit: 10 },
        runs: { limit: 10 },
        activity: { afterSequence: 0, limit: 50 },
        mediaCounts: true,
      },
    }),
    getMediaCard({ context, ref: { type: "object", id: object.id } }),
    getMediaCards({
      context,
      refs: [
        { type: "artifact", id: artifact.id },
        { type: "run-object", id: runObject.id },
      ],
    }),
    listMedia({ context, limit: 10 }),
    listGlobalActivity({ afterSequence: 0, limit: 100 }),
    latestActivitySequence(),
  ];

  const readQueryBaseline = readQueryValues();
  const ordinaryValues = [...mutationValues, ...readQueryBaseline];

  return {
    ordinaryValues,
    readQueryBaseline,
    readQueryValues,
    rootDir: root.dir,
  };
}

const FORBIDDEN_ORDINARY_KEY_PARTS = new Set([
  "body",
  "bucket",
  "credential",
  "digest",
  "error",
  "hash",
  "key",
  "locator",
  "metadata",
  "password",
  "path",
  "payload",
  "raw",
  "report",
  "request",
  "response",
  "secret",
  "sha256",
  "token",
]);

function ordinaryKeyParts(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase());
}

function isSensitiveNormalizedCompound(normalized: string): boolean {
  return (
    /^(source|log)path$/.test(normalized) ||
    /^(object|storage)key$/.test(normalized) ||
    /^(content|manifest)hash$/.test(normalized) ||
    /^(last|raw)error$/.test(normalized) ||
    /^(provider)?(request|response)(digest|json|body|payload|raw|data|text)?$/.test(
      normalized,
    ) ||
    /^(provider)?payload(json|body|data|text|raw)?$/.test(normalized) ||
    /^(evaluation)?report(json|body|data|text|raw)?$/.test(normalized) ||
    /^raw(json|body|data|text|error|request|response|payload|report)?$/.test(
      normalized,
    ) ||
    /^secret(ref|value|token|key)?$/.test(normalized)
  );
}

const FEEDBACK_DTO_KEYS = [
  "body",
  "createdAt",
  "id",
  "iterationId",
  "projectId",
  "resolutionNote",
  "resolvedAt",
  "status",
  "targetId",
  "targetType",
  "timecodeMs",
] as const;

function isFeedbackBody(record: Record<string, unknown>, key: string): boolean {
  return (
    key === "body" &&
    Object.keys(record).sort().join("\0") === [...FEEDBACK_DTO_KEYS].sort().join("\0")
  );
}

function isSafeAccountCredentialStatus(
  record: Record<string, unknown>,
  key: string,
): boolean {
  if (!("workspaceId" in record) || !("platform" in record) || !("externalId" in record)) {
    return false;
  }
  if (key === "credentialConfigured") return typeof record[key] === "boolean";
  return (
    key === "credentialSource" &&
    ["encrypted", "environment", "subscription", "missing"].includes(
      String(record[key]),
    )
  );
}

function forbiddenOrdinaryFields(value: unknown): string[] {
  const found: string[] = [];
  const seen = new WeakSet<object>();
  const visit = (current: unknown, location: string): void => {
    if (current === null || typeof current !== "object") return;
    if (seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${location}[${index}]`));
      return;
    }
    for (const [key, nested] of Object.entries(current)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (
        !isFeedbackBody(current, key) &&
        !isSafeAccountCredentialStatus(current, key) &&
        (ordinaryKeyParts(key).some((part) =>
          FORBIDDEN_ORDINARY_KEY_PARTS.has(part),
        ) ||
          isSensitiveNormalizedCompound(normalized) ||
          /^(apikey|authorization|cookie|credentials|errormessage|idempotencykey|originalname|secretref)$/.test(
            normalized,
          ))
      ) {
        found.push(`${location}.${key}`);
      }
      visit(nested, `${location}.${key}`);
    }
  };
  visit(value, "$root");
  return found;
}

const EXPECTED_ACTIVITY_WRITERS = [
  "cli/lib/agent/store.ts",
  "cli/lib/calendar/store.ts",
  "cli/lib/campaign/store.ts",
  "cli/lib/config.ts",
  "cli/lib/jobs/db.ts",
  "cli/lib/memory/store.ts",
  "cli/lib/migration/import.ts",
  "cli/lib/registry.ts",
  "cli/lib/store/artifacts.ts",
  "cli/lib/store/compositions.ts",
  "cli/lib/store/consumer-runs.ts",
  "cli/lib/store/document-content.ts",
  "cli/lib/store/documents.ts",
  "cli/lib/store/evaluations.ts",
  "cli/lib/store/internal-objects.ts",
  "cli/lib/store/internal-scope-mutations.ts",
  "cli/lib/store/media.ts",
  "cli/lib/store/operations.ts",
  "cli/lib/store/runs.ts",
  "cli/lib/store/scopes.ts",
  "cli/lib/store/sessions.ts",
  "cli/lib/store/transfers.ts",
  "cli/lib/store/units.ts",
] as const;
const UNEXERCISED_LITERAL_ACTIVITY_ACTIONS = [
  "agent_turn.started",
  "analytics.jsonl",
  "brief.md",
  "build.cancelled",
  "build.failed",
  "calendar.entry.created",
  "calendar.entry.transitioned",
  "calendar.entry.updated",
  "calendar.json",
  "calendar.slot.created",
  "campaign.created",
  "campaign.json",
  "campaign.pending_link.appended",
  "campaign.pending_links.cleared",
  "campaign.planned",
  "campaign.updated",
  "campaign_cell.produced",
  "campaign_cell.published",
  "captions.json",
  "composition.build",
  "composition.input_removed",
  "composition.source_removed",
  "delivery.json",
  "dev.to",
  "document.rebound",
  "jobs.db",
  "memory_entry.created",
  "memory_entry.revised",
  "production.json",
  "production_plan.md",
  "project.transferred",
  "project_stage.created",
  "project_stage.updated",
  "publication.cancelled",
  "publication.claimed",
  "publication.finished",
  "publication.idempotent_skip",
  "publication.operation_claim_expired",
  "publication.reconciliation_requested",
  "ralphy.db",
  "run.object_promoted",
  "scenario.json",
  "scenario.md",
  "session.started",
  "setting.created",
  "setting.deleted",
  "setting.updated",
  "settings.json",
  "storyboard.json",
  "storyboard.md",
  "style_lock.md",
] as const;

async function readActivitySourceInventory(): Promise<{
  actions: string[];
  directSqlFiles: string[];
  writers: string[];
}> {
  const actions = new Set<string>();
  const directSqlFiles: string[] = [];
  const writers: string[] = [];
  const glob = new Bun.Glob("cli/lib/**/*.ts");
  for await (const file of glob.scan(".")) {
    const source = await Bun.file(file).text();
    if (/INSERT\s+INTO\s+activity_events/i.test(source)) directSqlFiles.push(file);
    if (file === "cli/lib/store/activity.ts" || !/\bappendActivity\s*\(/.test(source)) {
      continue;
    }
    expect(source).toMatch(
      /import\s*\{[^}]*\bappendActivity\b[^}]*\}\s*from\s*["'][^"']*activity\.js["']/s,
    );
    writers.push(file);
    for (const match of source.matchAll(
      /["'`]([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_-]*)+)["'`]/g,
    )) {
      const action = match[1]!;
      if (!action.endsWith("_id")) actions.add(action);
    }
  }
  return {
    actions: [...actions].sort(),
    directSqlFiles: directSqlFiles.sort(),
    writers: writers.sort(),
  };
}

describe("domain cursor codecs", () => {
  test("round-trips every family and keeps the prefixes distinct", () => {
    const encoded = FAMILIES.map((family) =>
      encodeCursor(family, { ordinal: 7, id: "entity-7" }),
    );
    for (const [index, family] of FAMILIES.entries()) {
      expect(encoded[index]!.startsWith(`${family}.`)).toBe(true);
      expect(decodeCursor(family, encoded[index]!)).toEqual({
        ordinal: 7,
        id: "entity-7",
      });
    }
    expect(new Set(encoded).size).toBe(FAMILIES.length);
  });

  test("rejects a cursor decoded by the wrong family", () => {
    for (const family of FAMILIES) {
      const cursor = encodeCursor(family, { ordinal: 1, id: "a" });
      for (const other of FAMILIES) {
        if (other === family) continue;
        expect(() => decodeCursor(other, cursor)).toThrow(/cursor/i);
      }
    }
  });

  test("accepts a zero ordinal and the longest allowed identifier", () => {
    const id = "a".repeat(128);
    expect(decodeCursor("p1", encodeCursor("p1", { ordinal: 0, id }))).toEqual({
      ordinal: 0,
      id,
    });
  });

  test("rejects malformed payloads", () => {
    const cases: string[] = [
      raw("c1", "[1]"),
      raw("c1", "[1,\"a\",2]"),
      raw("c1", "{\"ordinal\":1,\"id\":\"a\"}"),
      raw("c1", "[-1,\"a\"]"),
      raw("c1", "[1.5,\"a\"]"),
      raw("c1", `[${Number.MAX_SAFE_INTEGER + 2},"a"]`),
      raw("c1", "[1,\"\"]"),
      raw("c1", `[1,"${"a".repeat(129)}"]`),
      raw("c1", "[1,\"line\\nbreak\"]"),
      raw("c1", "[1,\"café\"]"),
      raw("c1", "[1,\"a\"] "),
      raw("c1", "[ 1,\"a\"]"),
      "c1.",
      "c1",
      "",
      "c1.not!base64url",
      `c1.${Buffer.from("[1,\"a\"]", "utf8").toString("base64")}=`,
    ];
    for (const cursor of cases) {
      expect(() => decodeCursor("c1", cursor)).toThrow(/cursor/i);
    }
  });

  test("rejects a cursor over 256 bytes before decoding it", () => {
    const oversized = `c1.${"A".repeat(254)}`;
    expect(oversized.length).toBeGreaterThan(256);
    expect(() => decodeCursor("c1", oversized)).toThrow(/cursor/i);
  });

  test("rejects encoding an out-of-range ordinal or identifier", () => {
    expect(() => encodeCursor("c1", { ordinal: -1, id: "a" })).toThrow(/cursor/i);
    expect(() => encodeCursor("c1", { ordinal: 1.5, id: "a" })).toThrow(/cursor/i);
    expect(() => encodeCursor("c1", { ordinal: 1, id: "" })).toThrow(/cursor/i);
    expect(() =>
      encodeCursor("c1", { ordinal: 1, id: "a".repeat(129) }),
    ).toThrow(/cursor/i);
    expect(() => encodeCursor("c1", { ordinal: 1, id: "café" })).toThrow(
      /cursor/i,
    );
  });
});

describe("bounded page building", () => {
  const rows = [
    { createdAt: 10, id: "a" },
    { createdAt: 10, id: "b" },
    { createdAt: 11, id: "c" },
  ];
  const cursorOf = (row: (typeof rows)[number]) => ({
    ordinal: row.createdAt,
    id: row.id,
  });

  test("returns a cursor only when the extra row proves another page", () => {
    const full = buildPage(rows, 2, "c1", cursorOf);
    expect(full.items).toEqual([rows[0]!, rows[1]!]);
    expect(full.nextCursor).toBe(encodeCursor("c1", { ordinal: 10, id: "b" }));

    const last = buildPage(rows.slice(0, 2), 2, "c1", cursorOf);
    expect(last.items).toEqual([rows[0]!, rows[1]!]);
    expect(last.nextCursor).toBeNull();

    expect(buildPage([], 2, "c1", cursorOf)).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  test("paginates equal timestamps by the tie-breaking identifier", () => {
    const first = buildPage(rows, 1, "c1", cursorOf);
    expect(first.items).toEqual([rows[0]!]);
    const after = decodeCursor("c1", first.nextCursor!);
    expect(after).toEqual({ ordinal: 10, id: "a" });
    const remaining = rows.filter(
      (row) =>
        row.createdAt > after.ordinal ||
        (row.createdAt === after.ordinal && row.id > after.id),
    );
    expect(remaining).toEqual([rows[1]!, rows[2]!]);
  });
});

describe("stable-set traversal", () => {
  test("excludes a matching row inserted behind the issued cursor", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "stable", name: "Stable" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "stable",
      name: "Stable",
    });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const original = ["one", "two", "three"].map((slug) =>
      createDocument({ projectId: project.id, kind: "note", slug, title: slug }),
    );
    const db = openDomainDb();
    for (const [index, document] of original.entries()) {
      db.prepare("UPDATE documents SET created_at = ? WHERE id = ?").run(
        (index + 1) * 100,
        document.id,
      );
    }

    const first = listDocuments({ context, limit: 1 });
    const inserted = createDocument({
      projectId: project.id,
      kind: "note",
      slug: "inserted",
      title: "Inserted",
    });
    db.prepare("UPDATE documents SET created_at = 50 WHERE id = ?").run(inserted.id);

    const seen = first.items.map((item) => item.id);
    let after = first.nextCursor;
    while (after !== null) {
      const page = listDocuments({ context, after, limit: 1 });
      seen.push(...page.items.map((item) => item.id));
      after = page.nextCursor;
    }
    expect(seen).toEqual(original.map((document) => document.id));
    expect(new Set(seen).size).toBe(original.length);
    expect(seen).not.toContain(inserted.id);
  });
});

describe("limit bounds", () => {
  test("accepts the inclusive integer range and rejects everything else", () => {
    expect(() => assertLimit(1)).not.toThrow();
    expect(() => assertLimit(100)).not.toThrow();
    expect(() => assertLimit(50, 50)).not.toThrow();
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 101]) {
      expect(() => assertLimit(limit)).toThrow(/limit/i);
    }
    expect(() => assertLimit(51, 50)).toThrow(/limit/i);
  });
});

describe("global activity sequence", () => {
  test("returns an empty store as sequence zero", () => {
    makeRoot();
    openDomainDb();
    expect(latestActivitySequence()).toBe(0);
    expect(listGlobalActivity({ afterSequence: 0, limit: 10 })).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  test("pages 101 events with no gap and no duplicate", () => {
    makeRoot();
    const db = openDomainDb();
    const workspace = createWorkspace({ slug: "activity", name: "Activity" });
    const baseline = latestActivitySequence();
    for (let index = 0; index < 101; index += 1) {
      appendActivity(db, {
        workspaceId: workspace.id,
        entityType: "document",
        entityId: `document-${index}`,
        action: "document.created",
        payload: { revisionNo: index },
        createdAt: 1_000 + index,
      });
    }
    const seen: number[] = [];
    let afterSequence = baseline;
    for (;;) {
      const page = listGlobalActivity({ afterSequence, limit: 100 });
      for (const item of page.items) seen.push(item.sequence);
      if (page.nextCursor === null) break;
      expect(page.nextCursor).toBe(page.items.at(-1)!.sequence);
      afterSequence = page.nextCursor;
    }
    expect(seen.length).toBe(101);
    expect(new Set(seen).size).toBe(101);
    expect(seen).toEqual(
      Array.from({ length: 101 }, (_, index) => baseline + index + 1),
    );
    expect(latestActivitySequence()).toBe(baseline + 101);
  });

  test("exposes only the safe DTO shape and never a raw payload", () => {
    makeRoot();
    const db = openDomainDb();
    const workspace = createWorkspace({ slug: "shape", name: "Shape" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "shape",
      name: "Shape",
    });
    appendActivity(db, {
      workspaceId: workspace.id,
      projectId: project.id,
      entityType: "run",
      entityId: "run-1",
      action: "run.started",
      payload: { kind: "generation" },
      createdAt: 5,
    });
    const page = listGlobalActivity({ afterSequence: 0, limit: 100 });
    const event = page.items.at(-1)!;
    expect(Object.keys(event).sort()).toEqual([
      "action",
      "createdAt",
      "entityId",
      "entityType",
      "projectId",
      "sequence",
      "workspaceId",
    ]);
    expect(event).toMatchObject({
      workspaceId: workspace.id,
      projectId: project.id,
      entityType: "run",
      entityId: "run-1",
      action: "run.started",
      createdAt: 5,
    });
    expect(typeof event.sequence).toBe("number");
    expect(JSON.stringify(page)).not.toContain("generation");
  });

  test("rejects a malformed afterSequence or limit", () => {
    makeRoot();
    openDomainDb();
    for (const afterSequence of [-1, 1.5, Number.NaN]) {
      expect(() => listGlobalActivity({ afterSequence, limit: 10 })).toThrow(
        /sequence/i,
      );
    }
    for (const limit of [0, 101, 2.5]) {
      expect(() => listGlobalActivity({ afterSequence: 0, limit })).toThrow(/limit/i);
    }
  });
});

describe("activity payload safety", () => {
  function write(payload: unknown): void {
    const db = openDomainDb();
    appendActivity(db, {
      entityType: "document",
      entityId: "document-1",
      action: "document.created",
      payload: payload as never,
      createdAt: 1,
    });
  }

  test("accepts bounded identifiers, enums, counts, booleans, and null", () => {
    makeRoot();
    expect(() =>
      write({
        revisionId: "rev_01HX",
        revisionNo: 3,
        state: "approved",
        selected: true,
        parentRevisionId: null,
        mime: "image/png",
        fields: ["slug", "name"],
      }),
    ).not.toThrow();
  });

  test("rejects locators, hashes, secrets, and raw text", () => {
    makeRoot();
    openDomainDb();
    const rejected: Record<string, unknown>[] = [
      { path: "tmp/run/object.bin" },
      { locator: "buckets/ws/objects/a" },
      { sha256: "a".repeat(64) },
      { digest: "b".repeat(64) },
      { bucket: "buckets/ws/shared" },
      { idempotencyKey: "key-1" },
      { token: "abc" },
      { credential: "abc" },
      { secretRef: "abc" },
      { password: "abc" },
      { metadata: { any: 1 } },
      { config: { any: 1 } },
      { response: "ok" },
      { error: "boom" },
      { errorMessage: "boom" },
      { body: "text" },
      { promptText: "hello" },
      { url: "https://example.test" },
      { source: "https://example.test" },
      { source: "/absolute/path" },
      { source: "relative/nested/path" },
      { source: "a".repeat(129) },
      { source: "line\nbreak" },
      { source: "café" },
      { count: Number.NaN },
      { count: Number.POSITIVE_INFINITY },
      { fields: [{ nested: 1 }] },
      { "not a key": 1 },
    ];
    for (const payload of rejected) {
      expect(() => write(payload)).toThrow(/activity payload/i);
    }
    expect(latestActivitySequence()).toBe(0);
  });

  test("rejects a non-object payload and unbounded nesting", () => {
    makeRoot();
    openDomainDb();
    for (const payload of ["text", 1, true, ["a"], { a: { b: { c: 1 } } }]) {
      expect(() => write(payload)).toThrow(/activity payload/i);
    }
  });

  test("stores no forbidden raw payload across every exercised domain writer", async () => {
    const fixture = await makeSurfaceFixture();
    const inventory = await readActivitySourceInventory();
    expect(inventory.writers).toEqual([...EXPECTED_ACTIVITY_WRITERS].sort());
    expect(inventory.directSqlFiles).toEqual(["cli/lib/store/activity.ts"]);
    const db = openDomainDb();
    const stored = db
      .query<{ action: string; payloadJson: string }, []>(
        "SELECT action, payload_json AS payloadJson FROM activity_events",
      )
      .all();
    const actions = new Set(stored.map((row) => row.action));
    expect(inventory.actions.filter((action) => !actions.has(action))).toEqual(
      UNEXERCISED_LITERAL_ACTIVITY_ACTIONS,
    );
    expect([...actions].filter((action) => !inventory.actions.includes(action))).toEqual(
      [],
    );
    expect(stored.length).toBeGreaterThan(
      inventory.actions.length - UNEXERCISED_LITERAL_ACTIVITY_ACTIONS.length,
    );
    for (const row of stored) {
      const payload = JSON.parse(row.payloadJson);
      expect(() => assertSafeActivityPayload(payload)).not.toThrow();
      expect(forbiddenOrdinaryFields(payload)).toEqual([]);
    }
  });
});

describe("poison Farm read trap", () => {
  test("covers sync, promise, callback, stream, and Bun.file reads", async () => {
    const root = makeRoot();
    const identityPath = path.join(root.dir, ".ralphy", "farm", "identity.json");
    const trapped = withPoisonFarmReadTrap(root.dir, async () => {
      fs.readFileSync(identityPath);
      await fs.promises.readFile(identityPath);
      await new Promise<void>((resolve, reject) => {
        fs.readFile(identityPath, (error) => (error ? reject(error) : resolve()));
      });
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(identityPath);
        stream.on("error", reject);
        stream.on("end", resolve);
        stream.resume();
      });
      await Bun.file(identityPath).text();
    });
    await trapped.result;
    const touchedMethods = trapped.touched.map((entry) => entry.split(":", 1)[0]);
    for (const method of [
      "readFileSync",
      "promises.readFile",
      "readFile",
      "createReadStream",
      "Bun.file",
    ]) {
      expect(touchedMethods).toContain(method);
    }
  });
});

describe("ordinary public DTO safety", () => {
  test("recognizes explicit and compound sensitive field names without broad false positives", () => {
    const sensitive = {
      body: "private",
      sourcePath: "private",
      logPath: "private",
      objectKey: "private",
      storageKey: "private",
      contentHash: "private",
      manifestHash: "private",
      sha256: "private",
      lastError: "private",
      rawError: "private",
      request: "private",
      response: "private",
      requestDigest: "private",
      providerPayload: "private",
      evaluationReport: "private",
      rawJson: "private",
      secretRef: "private",
      sourcepath: "private",
      log_path: "private",
      objectkey: "private",
      storage_key: "private",
      contenthash: "private",
      manifest_hash: "private",
      lasterror: "private",
      raw_error: "private",
      requestdigest: "private",
      providerpayload: "private",
      evaluationreport: "private",
      rawjson: "private",
      secretref: "private",
    };
    expect(forbiddenOrdinaryFields(sensitive).sort()).toEqual(
      Object.keys(sensitive)
        .map((key) => `$root.${key}`)
        .sort(),
    );
    expect(
      forbiddenOrdinaryFields({
        source: "postiz",
        storageClass: "working",
        objectId: "obj_1",
        contentType: "video",
        manifestVersion: 1,
        lastSeenAt: 1,
        feedback: {
          id: "fb_1",
          projectId: "prj_1",
          iterationId: "it_1",
          targetType: null,
          targetId: null,
          timecodeMs: null,
          body: "Visible feedback",
          status: "open",
          resolutionNote: null,
          createdAt: 1,
          resolvedAt: null,
        },
      }),
    ).toEqual([]);
  });

  test("recursively excludes storage, provider, error, and secret fields", async () => {
    expect(
      forbiddenOrdinaryFields({ safe: [{ nested: { metadata: true } }] }),
    ).toEqual(["$root.safe[0].nested.metadata"]);
    const fixture = await makeSurfaceFixture();
    expect(forbiddenOrdinaryFields(fixture.ordinaryValues)).toEqual([]);
  });

  test("runs the comprehensive query surface without reading Farm", async () => {
    const fixture = await makeSurfaceFixture();
    const trapped = withPoisonFarmReadTrap(fixture.rootDir, fixture.readQueryValues);
    expect(trapped.touched).toEqual([]);
    expect(trapped.result).toEqual(fixture.readQueryBaseline);
    expect(forbiddenOrdinaryFields(trapped.result)).toEqual([]);
  });
});

describe("internal row boundary", () => {
  const STORE_OWNED = /^cli\/lib\/(store|migrate)\//;

  test("only store, verifier, and migration modules import internal-types", async () => {
    const glob = new Bun.Glob("cli/**/*.ts");
    const offenders: string[] = [];
    for await (const file of glob.scan(".")) {
      if (STORE_OWNED.test(file)) continue;
      const source = await Bun.file(file).text();
      if (source.includes("store/internal-types")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  test("internal-types never becomes a cycle with the public types", async () => {
    const internal = await Bun.file("cli/lib/store/internal-types.ts").text();
    const publicTypes = await Bun.file("cli/lib/store/types.ts").text();
    // One-way: internal may import type-only from public, never the reverse.
    expect(internal).toContain('from "./types.js"');
    expect(internal.match(/^import (?!type )/m)).toBeNull();
    expect(publicTypes).not.toContain("internal-types");
  });

});
