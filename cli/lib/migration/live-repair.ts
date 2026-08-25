import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  classifierVersion,
  classifyCompositionLocator,
  classifyRenderLocator,
  decodeHyperframesGenerationEvidence,
} from "./production-evidence.js";
import { migrationStableId } from "./stable-id.js";
import { canonicalRequestJson } from "../store/canonical-json.js";
import {
  compositionManifestSha256,
  validateBuildProfile,
} from "../store/compositions.js";
import type { JsonValue } from "../store/types.js";
import { MIGRATIONS } from "../store/schema.js";

const TASK_2D2_VERSION = "task-2d2-v1" as const;
const TASK_2D2_RUN_ID = "mig_c37f36ac-47a0-4330-8303-74cee92b7ddd" as const;
const TASK_2D2_SOURCE_ID = "mig_1cb7c4dc-5f3f-4e4f-8fa5-fbb8710e736e" as const;
const TASK_2D2_SOURCE_LABEL = "ralphy" as const;
const TASK_2D2_SOURCE_PATH_HASH = "41f35f9dc2f95ebdd88726181178685dfb93fab0169fdbb06ebbd5ed1e0b9755" as const;
const TASK_2D2_CUTOVER_AT = 1_786_301_683_658;
const TASK_2D2_DENTI_OWNER_ID = "mentry_9b5e5a5c-06bb-494f-9478-d55af6895d72" as const;
const TASK_2D2_DENTI_OWNER_PATH = "workspaces/denti-ai/projects/denti-perio-pitch-001/logs/generations.jsonl" as const;
const TASK_2D2_DENTI_OWNER_HASH = "81852c9bba9193e62612d924e5dae189d32057aa35e3cbd8a527bf91eb516c85" as const;

type AuditedReviewBoundary = Readonly<{
  ownerEntryId: string; ownerPath: string; projectId: string;
  composition: string; output: string; bytes: number;
  reason: "output-byte-mismatch" | "source-evidence-mismatch";
  classifierReason: "render-invalid" | "composition-invalid";
}>;
const TASK_2D2_AUDITED_REVIEW = new Map<string, AuditedReviewBoundary>([
  ["drev_1dd38421-134c-4bd5-801e-ca1649971135", {
    ownerEntryId: "mentry_be6a8ad1-a03f-47f1-872b-f8e15111cb6b",
    ownerPath: "workspaces/short-guides/projects/short-15s-farm-001/logs/generations.jsonl",
    projectId: "prj_548aa7ce-7724-4de1-8a38-c34ec99002a2", composition: "index.html",
    output: "[migration-path-omitted sha256=a336633f8c6651ef9be61bd7e16b2caa313348818a589df9c54d340d0f2637ac]",
    bytes: 4_089_146, reason: "output-byte-mismatch", classifierReason: "render-invalid",
  }],
  ["drev_46fb2d6d-8023-4e82-8eb3-116b676a40d1", {
    ownerEntryId: TASK_2D2_DENTI_OWNER_ID, ownerPath: TASK_2D2_DENTI_OWNER_PATH,
    projectId: "prj_2d9cceda-aacb-4675-821d-dd79d9623d68", composition: "compositions/full-r2.html",
    output: "[migration-path-omitted sha256=289b4b2659c6d12458e1980feb14cee891d60f672f9161ae9c126fd3cc306119]",
    bytes: 26_569_720, reason: "output-byte-mismatch", classifierReason: "render-invalid",
  }],
  ["drev_629d5001-27ed-4e91-844b-9084d05bcdd8", {
    ownerEntryId: "mentry_d2416d74-a156-46fd-9293-edb71f27a1ee",
    ownerPath: "workspaces/sotaocr/projects/sotaocr-contextdrop-001/logs/generations.jsonl",
    projectId: "prj_d40c43e0-eab9-4a45-877f-2cf5ca039831", composition: "index.html",
    output: "[migration-path-omitted sha256=3d2e42ae75b8e7f9f4ddcb40ca7541e87fae9b9cf471ac11cb328f1ca45a7c1f]",
    bytes: 20_019_805, reason: "output-byte-mismatch", classifierReason: "render-invalid",
  }],
  ["drev_7c60a57e-927d-427f-8ad3-2e8cb5e6c73a", {
    ownerEntryId: TASK_2D2_DENTI_OWNER_ID, ownerPath: TASK_2D2_DENTI_OWNER_PATH,
    projectId: "prj_2d9cceda-aacb-4675-821d-dd79d9623d68", composition: "compositions/variant-1.html",
    output: "[migration-path-omitted sha256=59c65bb7c55dccd5e6e43586f02fa61429023d46163095424e6626431a35c70f]",
    bytes: 8_553_198, reason: "output-byte-mismatch", classifierReason: "render-invalid",
  }],
  ["drev_fd4e127e-4a76-411a-8d44-2d381b9f8119", {
    ownerEntryId: "mentry_d2416d74-a156-46fd-9293-edb71f27a1ee",
    ownerPath: "workspaces/sotaocr/projects/sotaocr-contextdrop-001/logs/generations.jsonl",
    projectId: "prj_d40c43e0-eab9-4a45-877f-2cf5ca039831", composition: "compositions/format-repo-flex.html",
    output: "[migration-path-omitted sha256=9c64eca4d4f87232c31e71d9778c7ae4ad551aef80fc68dd9be6a4ecc9fdd242]",
    bytes: 15_546_084, reason: "output-byte-mismatch", classifierReason: "render-invalid",
  }],
  ["drev_d6521bd0-86c2-48e5-84af-e25cc4b08374", {
    ownerEntryId: "mentry_89336710-b955-4661-9b79-5369cb272c65",
    ownerPath: "workspaces/nightmaker/projects/nightmaker-hooks-001/logs/generations.jsonl",
    projectId: "prj_90e6aae7-fcdf-427a-8da4-0640479acac4", composition: "hook-06.html",
    output: "workspaces/nightmaker/projects/nightmaker-hooks-001/render/hook-06.mp4",
    bytes: 117_507, reason: "source-evidence-mismatch", classifierReason: "composition-invalid",
  }],
  ["drev_7916b6a3-8665-4710-8d6e-054f64e96098", {
    ownerEntryId: "mentry_d2416d74-a156-46fd-9293-edb71f27a1ee",
    ownerPath: "workspaces/sotaocr/projects/sotaocr-contextdrop-001/logs/generations.jsonl",
    projectId: "prj_d40c43e0-eab9-4a45-877f-2cf5ca039831", composition: "format-raw-demo.html",
    output: "[migration-path-omitted sha256=311e588d37117d5713115b28d356ef9b63038f6714fe0dadb80dc5ef0fcace89]",
    bytes: 9_367_712, reason: "source-evidence-mismatch", classifierReason: "composition-invalid",
  }],
]);

type SqlValue = string | number | bigint | Uint8Array | null;
type SqlRow = Record<string, SqlValue>;
export type MarkerPayloadWithoutPlanSha256 = Readonly<{
  version: typeof TASK_2D2_VERSION;
  evidenceSha256: string;
  coreCommit: string;
  classifierVersion: typeof classifierVersion;
  schemaVersion: 6;
  authorizedBaseline: Readonly<Record<string, string | number>>;
  insertedCounts: Readonly<Record<string, number>>;
  deletedScopes: readonly Readonly<Record<string, JsonValue>>[];
  deletionPreimageSha256: string;
  needsReviewCounts: Readonly<Record<string, number>>;
}>;
type Derivation = Readonly<{ derive: "repairTimestamp" }> | Readonly<{
  derive: "planSha256";
  encoding: "task-2d2-marker-json";
  payload: MarkerPayloadWithoutPlanSha256;
}>;
export type PlannedValue = JsonValue | Derivation;
export type PlannedRow = Readonly<{ table: string; primaryKey: string; columns: Readonly<Record<string, PlannedValue>> }>;
export type PlannedTransition = Readonly<{ table: string; primaryKey: string; from: JsonValue; to: JsonValue }>;
export type CapturedEvidenceRow = Readonly<{ table: string; primaryKey: string; columns: Readonly<Record<string, JsonValue>> }>;
export type PlannedDeletion = Readonly<{ table: "projects" | "workspaces"; primaryKey: string; fullPreimage: Readonly<Record<string, JsonValue>> }>;
export type PlanInvariant = Readonly<{ code: string; facts: JsonValue }>;
export type LiveRepairPlan = Readonly<{
  version: typeof TASK_2D2_VERSION; coreCommit: string; classifierVersion: typeof classifierVersion;
  schemaVersion: 6; migrationRunId: typeof TASK_2D2_RUN_ID;
  baseline: Readonly<Record<string, number | string>>;
  evidenceRows: readonly CapturedEvidenceRow[]; evidenceSha256: string;
  insertedRows: readonly PlannedRow[]; transitions: readonly PlannedTransition[];
  supplementalRefs: readonly Readonly<{
    migrationEntryId: string; targetRef: string; repairKey: typeof TASK_2D2_VERSION;
  }>[];
  deletions: readonly PlannedDeletion[]; invariants: readonly PlanInvariant[];
  timestampPolicy: "marker-created-at-for-marker-and-supplemental-refs";
}>;

export type LiveRepairState = "fresh" | "complete-rerun" | "conflict";
export type LiveRepairReport = Readonly<{
  version: typeof TASK_2D2_VERSION; state: LiveRepairState; applicable: boolean;
  planSha256: string; evidenceSha256: string; coreCommit: string;
  schemaVersion: 6; migrationRunId: typeof TASK_2D2_RUN_ID;
  baseline: Readonly<Record<string, number | string>>;
  insertCounts: Readonly<Record<string, number>>;
  deleteIds: readonly string[]; deletionPreimageSha256: string;
  eligibleGenerationRevisionIds: readonly string[];
  needsReview: readonly Readonly<{ generationRevisionId: string; reason: string }>[];
  ignoredCounts: Readonly<{ wrapperWithoutOutput: 4; errors: 51 }>;
  conflicts: readonly Readonly<{ code: string; entityId?: string }>[];
  changes: number;
}>;

type SourceEntry = Readonly<{
  id: string; migration_source_id: string; source_path: string; projectId: string; kind: "root" | "snapshot";
  object: { id: string; sha256: string };
}>;

type RenderEvidence = Readonly<{
  entryId: string; migrationSourceId: string; sourcePath: string; projectId: string;
  objectBytes: number; artifactRevisionId: string | null;
}>;

type RenderIndex = Readonly<{
  byPath: ReadonlyMap<string, RenderEvidence[]>; byProjectBytes: ReadonlyMap<string, RenderEvidence[]>;
}>;

type EligibleGeneration = {
  revisionId: string; ownerEntryId: string; sourceEntryId: string; outputEntryId: string;
  sourceObjectId: string; artifactRevisionId: string; projectId: string; workspaceId: string;
  completedAt: number; startedAt: number; outputBytes: number;
  provider: string | null; model: string | null; costUsd: number | null; profile: JsonValue;
};
type GenerationOutcome = Readonly<{ generationRevisionId: string; outcome: "strict-import" | "needs-review" | "ignored"; reason: string }>;

const TASK_2D2_TARGET_TABLES = {
  comp: "compositions", crev: "composition_revisions", cfile: "composition_revision_files",
  run: "runs", attempt: "run_attempts", build: "builds", output: "build_outputs", result: "run_results",
} as const;
type Task2d2TargetPrefix = keyof typeof TASK_2D2_TARGET_TABLES;
const TASK_2D2_TARGET_REF =
  /^(comp|crev|cfile|run|attempt|build|output|result)_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function buildLiveRepairPlan(db: Database, coreCommit: string): LiveRepairPlan {
  if (!/^[0-9a-f]{40}$/u.test(coreCommit)) throw new Error("Core commit must be a full lowercase Git SHA");
  if (db.inTransaction) throw new Error("Task 2D2 planner requires its own read transaction");
  db.exec("BEGIN DEFERRED");
  try {
    const plan = buildPlanInTransaction(db, coreCommit);
    db.exec("COMMIT");
    return plan;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function buildPlanInTransaction(db: Database, coreCommit: string): LiveRepairPlan {
  const evidence = new Map<string, CapturedEvidenceRow>();
  const invariantFacts: Record<string, JsonValue> = {};
  const baseline = inspectBaseline(db);
  requireBaseline(baseline);
  assertSchemaIdentity(db);
  captureDsStoreEvidence(db, evidence);

  const migration = one(db,
    `SELECT * FROM migration_runs WHERE id = ?`, [TASK_2D2_RUN_ID]);
  if (!migration || migration.phase !== "cutover" || migration.cutover_at !== TASK_2D2_CUTOVER_AT) {
    conflict("migration run is not the authorized cutover");
  }
  capture(evidence, "migration_runs", TASK_2D2_RUN_ID, migration!);
  const migrationSources = all(db,
    "SELECT * FROM migration_sources WHERE migration_run_id = ? ORDER BY id", [TASK_2D2_RUN_ID]);
  const ralphySource = migrationSources.filter((source) => source.id === TASK_2D2_SOURCE_ID
    && source.source_kind === "ralphy" && source.source_label === TASK_2D2_SOURCE_LABEL
    && source.canonical_path_hash === TASK_2D2_SOURCE_PATH_HASH);
  if (ralphySource.length !== 1) conflict("authorized Ralphy migration source identity differs");
  for (const source of migrationSources) {
    capture(evidence, "migration_sources", String(source.id), source);
  }
  const cutover = all(db,
    `SELECT * FROM activity_events
     WHERE entity_type = 'migration_run' AND entity_id = ? AND action = 'cutover'`,
    [TASK_2D2_RUN_ID]);
  if (cutover.length !== 1 || cutover[0]!.created_at !== TASK_2D2_CUTOVER_AT
    || cutover[0]!.id !== migration!.cutover_activity_id) {
    conflict("cutover Activity is not unique and exact");
  }
  capture(evidence, "activity_events", String(numberValue(cutover[0]!.id)), cutover[0]!);

  const inspected = inspectCompositionSources(db, evidence);
  const sourceEntries = inspected.sources;
  const roots = sourceEntries.filter((entry) => entry.kind === "root");
  const snapshots = sourceEntries.filter((entry) => entry.kind === "snapshot");
  if (roots.length !== 73 || snapshots.length !== 216
    || new Set(sourceEntries.map((entry) => entry.projectId)).size !== 74) {
    conflict("Composition source cardinality differs from the authorized 73/216/74 baseline");
  }
  const rootProjects = new Set(roots.map((entry) => entry.projectId));
  const rootlessProjects = [...new Set(sourceEntries.map((entry) => entry.projectId))]
    .filter((projectId) => !rootProjects.has(projectId));
  const pluralOnlyProjectId = importedScopeIds(TASK_2D2_SOURCE_LABEL, {
    workspaceSlug: "denti-ai", projectSlug: "denti-voiceperio-creatives-001",
  }).projectId;
  if (rootlessProjects.length !== 1 || rootlessProjects[0] !== pluralOnlyProjectId) {
    conflict("the one plural-only Composition container is not the authorized locator-derived Project");
  }

  const generations = inspectGenerations(db, sourceEntries, inspected.renders, evidence);
  if (generations.outcomes.length !== 639
    || generations.eligible.length !== 67
    || generations.outcomes.filter((row) => row.outcome === "needs-review").length !== 517
    || generations.outcomes.filter((row) => row.outcome === "ignored").length !== 55) {
    conflict("generation outcome ledger differs from the authorized 67/517/55 split");
  }
  const ignoredErrors = generations.outcomes.filter((row) => row.outcome === "ignored" && row.reason === "error").length;
  const ignoredWrappers = generations.outcomes.filter((row) => row.outcome === "ignored" && row.reason === "wrapper-without-output").length;
  if (ignoredErrors !== 51 || ignoredWrappers !== 4) {
    conflict("ignored generation ledger differs from the authorized 51/4 split");
  }
  const reasonCounts = countReasons(generations.outcomes);
  const exactReasonCounts: Record<string, number> = {
    "exact-evidence-match": 67, "archive-locator-mismatch": 33, "output-byte-mismatch": 12,
    "source-evidence-mismatch": 2, "composition-invalid": 470, "wrapper-without-output": 4, error: 51,
  };
  if (canonicalRequestJson(reasonCounts) !== canonicalRequestJson(exactReasonCounts)) {
    conflict("generation ledger differs from the exact seven authorized outcome classes");
  }

  const markerRows = all(db,
    `SELECT * FROM activity_events
     WHERE entity_type = 'migration_run' AND entity_id = ? AND action = 'repair.task-2d2.applied'`,
    [TASK_2D2_RUN_ID]);
  if (markerRows.length !== 0) conflict("fresh planner found an existing Task 2D2 marker");

  const buildStartedAt = new Map<string, number>();
  for (const row of generations.eligible) {
    const current = buildStartedAt.get(row.sourceEntryId);
    if (current === undefined || row.startedAt < current) buildStartedAt.set(row.sourceEntryId, row.startedAt);
  }
  const rows: PlannedRow[] = [];
  const transitions: PlannedTransition[] = [];
  const supplemental: LiveRepairPlan["supplementalRefs"][number][] = [];
  const revisionByEntry = new Map<string, { compositionId: string; revisionId: string }>();

  for (const [projectId, projectEntries] of groupBy(sourceEntries, (entry) => entry.projectId)) {
    const compositionId = repairId("comp", `project:${projectId}`);
    const ordered = [...projectEntries].sort((left, right) =>
      Number(left.kind === "root") - Number(right.kind === "root") || compareUtf8(left.id, right.id));
    const repaired = ordered.map((entry, index) => ({
      entry,
      revisionId: repairId("crev", `migration-entry:${entry.id}`),
      fileId: repairId("cfile", `migration-entry:${entry.id}`),
      revisionNo: index + 1,
      createdAt: buildStartedAt.get(entry.id) ?? TASK_2D2_CUTOVER_AT,
    }));
    const selected = repaired.find((value) => value.entry.kind === "root") ?? null;
    const createdAt = Math.min(...repaired.map((value) => value.createdAt));
    rows.push(planned("compositions", compositionId, {
      id: compositionId, project_id: projectId, slug: "recovered-video", kind: "video",
      selected_revision_id: null, row_version: 1, created_at: createdAt, updated_at: TASK_2D2_CUTOVER_AT,
    }));
    for (const item of repaired) {
      const engineConfig = { recovery: { migrationEntryId: item.entry.id, version: TASK_2D2_VERSION } };
      const manifest = compositionManifestSha256({
        kind: "video", engine: "hyperframes", engineVersion: null, engineConfig,
        sources: [{ logicalPath: "index.html", position: 0, objectId: item.entry.object.id, sha256: item.entry.object.sha256 }],
        inputs: [],
      });
      rows.push(planned("composition_revisions", item.revisionId, {
        id: item.revisionId, composition_id: compositionId, revision_no: item.revisionNo,
        parent_revision_id: null, iteration_id: null, state: "draft", engine: "hyperframes",
        engine_version: null, engine_config_json: canonicalRequestJson(engineConfig), manifest_sha256: null,
        authored_by_session_id: null, created_at: item.createdAt, sealed_at: null,
      }));
      rows.push(planned("composition_revision_files", item.fileId, {
        id: item.fileId, composition_revision_id: item.revisionId, logical_path: "index.html",
        object_id: item.entry.object.id, position: 0, created_at: item.createdAt,
      }));
      transitions.push(transition("composition_revisions", item.revisionId,
        { state: "draft", manifest_sha256: null, sealed_at: null },
        { state: "sealed", manifest_sha256: manifest, sealed_at: item.createdAt }));
      revisionByEntry.set(item.entry.id, { compositionId, revisionId: item.revisionId });
      for (const targetRef of [compositionId, item.revisionId, item.fileId]) {
        supplemental.push(supplementalRef(item.entry.id, targetRef));
      }
    }
    if (selected) transitions.push(transition("compositions", compositionId,
      { selected_revision_id: null, row_version: 1 },
      { selected_revision_id: selected.revisionId, row_version: 2 }));
  }

  for (const generation of generations.eligible) {
    const source = revisionByEntry.get(generation.sourceEntryId);
    if (!source) conflict(`eligible generation has no repaired source: ${generation.revisionId}`);
    const ids = {
      run: repairId("run", `generation-revision:${generation.revisionId}`),
      attempt: repairId("attempt", `generation-revision:${generation.revisionId}`),
      build: repairId("build", `generation-revision:${generation.revisionId}`),
      output: repairId("output", `generation-revision:${generation.revisionId}`),
      result: repairId("result", `generation-revision:${generation.revisionId}`),
    };
    const metadata = {
      generationDocumentRevisionId: generation.revisionId,
      migrationRunId: TASK_2D2_RUN_ID,
      outputMigrationEntryId: generation.outputEntryId,
      repairKey: TASK_2D2_VERSION,
      sourceMigrationEntryId: generation.sourceEntryId,
    };
    const request = { compositionRevisionId: source!.revisionId, profile: generation.profile, sourceObjectId: generation.sourceObjectId };
    const response = { artifactRevisionId: generation.artifactRevisionId, bytes: generation.outputBytes, role: "master" };
    rows.push(planned("runs", ids.run, {
      id: ids.run, workspace_id: generation.workspaceId, project_id: generation.projectId,
      agent_session_id: null, kind: "composition.build", label: null, state: "pending",
      metadata_json: canonicalRequestJson(metadata), external_system: null, external_run_id: null,
      external_node_id: null, external_attempt: null, external_operation: null, idempotency_key: null,
      request_digest: null, consumer_principal_id: null, created_at: generation.startedAt,
      started_at: null, ended_at: null, error: null,
    }));
    transitions.push(transition("runs", ids.run,
      { state: "pending", started_at: null, ended_at: null, error: null },
      { state: "running", started_at: generation.startedAt, ended_at: null, error: null }));
    rows.push(planned("run_attempts", ids.attempt, {
      id: ids.attempt, run_id: ids.run, attempt_no: 1, provider: generation.provider,
      model: generation.model, state: "running", request_json: canonicalRequestJson(request),
      response_json: null, cost_usd: null, error: null, started_at: generation.startedAt, ended_at: null,
    }));
    rows.push(planned("builds", ids.build, {
      id: ids.build, composition_revision_id: source!.revisionId, run_id: ids.run,
      state: "running", profile_json: canonicalRequestJson(generation.profile), error: null,
      created_at: generation.startedAt, started_at: generation.startedAt, ended_at: null,
    }));
    rows.push(planned("build_outputs", ids.output, {
      id: ids.output, build_id: ids.build, artifact_revision_id: generation.artifactRevisionId,
      role: "master", position: 0, created_at: generation.completedAt,
    }));
    transitions.push(transition("builds", ids.build,
      { state: "running", ended_at: null, error: null },
      { state: "succeeded", ended_at: generation.completedAt, error: null }));
    transitions.push(transition("run_attempts", ids.attempt,
      { state: "running", response_json: null, cost_usd: null, ended_at: null, error: null },
      { state: "succeeded", response_json: canonicalRequestJson(response), cost_usd: generation.costUsd,
        ended_at: generation.completedAt, error: null }));
    rows.push(planned("run_results", ids.result, {
      id: ids.result, run_id: ids.run, position: 0, entity_type: "build",
      entity_id: ids.build, created_at: generation.completedAt,
    }));
    transitions.push(transition("runs", ids.run,
      { state: "running", started_at: generation.startedAt, ended_at: null, error: null },
      { state: "succeeded", started_at: generation.startedAt, ended_at: generation.completedAt, error: null }));
    for (const targetRef of [ids.run, ids.attempt, ids.build, ids.output, ids.result]) {
      supplemental.push(supplementalRef(generation.ownerEntryId, targetRef));
    }
    for (const targetRef of [ids.build, ids.output]) {
      supplemental.push(supplementalRef(generation.outputEntryId, targetRef));
    }
  }

  const deletions = inspectGhostDeletions(db, evidence, invariantFacts);
  const markerId = numberValue(one(db, "SELECT COALESCE(MAX(id), 0) + 1 AS id FROM activity_events")!.id);
  const insertCounts = countTables(rows);
  insertCounts.activity_events = 1;
  const evidenceRows = [...evidence.values()].sort(compareEvidence);
  const evidenceSha256 = digest(evidenceRows);
  const markerPayload: MarkerPayloadWithoutPlanSha256 = {
    authorizedBaseline: baseline,
    classifierVersion,
    coreCommit,
    deletedScopes: deletions.map((row) => row.fullPreimage),
    deletionPreimageSha256: digest(deletions.map((row) => row.fullPreimage)),
    evidenceSha256,
    insertedCounts: insertCounts,
    needsReviewCounts: countReasons(generations.outcomes.filter((row) => row.outcome === "needs-review")),
    schemaVersion: 6,
    version: TASK_2D2_VERSION,
  };
  rows.push({
    table: "activity_events", primaryKey: String(markerId), columns: {
      id: markerId, workspace_id: null, project_id: null, entity_type: "migration_run",
      entity_id: TASK_2D2_RUN_ID, action: "repair.task-2d2.applied",
      payload_json: {
        derive: "planSha256", encoding: "task-2d2-marker-json", payload: markerPayload,
      },
      created_at: { derive: "repairTimestamp" },
    },
  });
  rows.sort(comparePlannedRows);
  transitions.sort(compareTransitions);
  supplemental.sort((left, right) => compareUtf8(left.migrationEntryId, right.migrationEntryId)
    || compareUtf8(left.targetRef, right.targetRef));
  const duplicatePairs = supplemental.length - new Set(supplemental.map((row) => `${row.migrationEntryId}\0${row.targetRef}`)).size;
  if (rows.length !== 988 || transitions.length !== 630 || supplemental.length !== 1_336
    || deletions.length !== 24 || duplicatePairs !== 0) {
    conflict("planned mutation arithmetic differs from 988/630/1336/24");
  }
  assertTargetsAbsent(db, rows, supplemental);
  invariantFacts.insertedRows = rows.length;
  invariantFacts.transitions = transitions.length;
  invariantFacts.supplementalPairs = supplemental.length;
  invariantFacts.supplementalPairDuplicates = duplicatePairs;
  invariantFacts.deletions = deletions.length;
  invariantFacts.freshChangedSqlRows = rows.length + transitions.length + supplemental.length + deletions.length;
  if (invariantFacts.freshChangedSqlRows !== 2_978) conflict("fresh SQL row arithmetic is not 2,978");
  invariantFacts.snapshotCounts = { compositions: 74, revisions: 289, files: 289 };
  invariantFacts.buildGraphCounts = { runs: 67, attempts: 67, builds: 67, outputs: 67, results: 67 };
  invariantFacts.generationOutcomes = { strictImport: 67, needsReview: 517, ignored: 55 };

  invariantFacts.generationOutcomeLedger = generations.outcomes;
  const invariants = Object.entries(invariantFacts)
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([code, facts]) => ({ code, facts }));
  return deepFreeze({
    version: TASK_2D2_VERSION, coreCommit, classifierVersion, schemaVersion: 6,
    migrationRunId: TASK_2D2_RUN_ID, baseline, evidenceRows, evidenceSha256,
    insertedRows: rows, transitions, supplementalRefs: supplemental, deletions, invariants,
    timestampPolicy: "marker-created-at-for-marker-and-supplemental-refs",
  });
}

export function materializeLiveRepairValue(
  value: PlannedValue,
  input: Readonly<{ repairTimestamp: number; planSha256: string }>,
): JsonValue {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(value);
    if (keys.length === 1 && record.derive === "repairTimestamp") return input.repairTimestamp;
    if (keys.length === 3 && record.derive === "planSha256"
      && record.encoding === "task-2d2-marker-json" && "payload" in record) {
      return canonicalRequestJson({
        ...(record.payload as MarkerPayloadWithoutPlanSha256),
        planSha256: input.planSha256,
      } as unknown as JsonValue);
    }
  }
  return value as JsonValue;
}

function inspectBaseline(db: Database): Record<string, number | string> {
  const scalar = (sql: string): number => numberValue(one(db, sql)!.value);
  const entries = all(db,
    "SELECT id, state, target_refs_json FROM migration_entries WHERE migration_run_id = ? ORDER BY id",
    [TASK_2D2_RUN_ID]);
  return {
    schemaVersion: scalar("SELECT MAX(version) AS value FROM schema_migrations"),
    userVersion: scalar("SELECT user_version AS value FROM pragma_user_version"),
    schemaVersionRows: scalar("SELECT COUNT(*) AS value FROM schema_migrations WHERE version = 6"),
    workspaces: scalar("SELECT COUNT(*) AS value FROM workspaces"),
    projects: scalar("SELECT COUNT(*) AS value FROM projects"),
    objects: scalar("SELECT COUNT(*) AS value FROM objects"),
    objectBytes: scalar("SELECT COALESCE(SUM(bytes), 0) AS value FROM objects"),
    artifacts: scalar("SELECT COUNT(*) AS value FROM artifacts"),
    artifactRevisions: scalar("SELECT COUNT(*) AS value FROM artifact_revisions"),
    artifactRevisionObjectBytes: scalar(
      "SELECT COALESCE(SUM(object.bytes), 0) AS value FROM artifact_revisions revision JOIN objects object ON object.id = revision.object_id"),
    units: scalar("SELECT COUNT(*) AS value FROM units"),
    compositions: scalar("SELECT COUNT(*) AS value FROM compositions"),
    compositionRevisions: scalar("SELECT COUNT(*) AS value FROM composition_revisions"),
    compositionFiles: scalar("SELECT COUNT(*) AS value FROM composition_revision_files"),
    compositionInputs: scalar("SELECT COUNT(*) AS value FROM composition_inputs"),
    builds: scalar("SELECT COUNT(*) AS value FROM builds"),
    buildOutputs: scalar("SELECT COUNT(*) AS value FROM build_outputs"),
    migrationEntries: entries.length,
    migrationEntriesImported: entries.filter((row) => row.state === "imported").length,
    migrationEntriesVerified: entries.filter((row) => row.state === "verified").length,
    migrationEntriesExcluded: entries.filter((row) => row.state === "excluded").length,
    migrationEntriesIssue: entries.filter((row) => row.state === "issue").length,
    migrationEntryStateRefsSha256: digest(entries.map((row) => ({
      id: row.id, state: row.state, targetRefsJson: row.target_refs_json,
    }))),
    productionManifests: scalar(
      `SELECT COUNT(*) AS value FROM migration_entries
       WHERE migration_run_id = '${TASK_2D2_RUN_ID}' AND source_kind = 'ralphy'
         AND entry_kind = 'file'
         AND (lower(source_path) = 'production.json' OR lower(source_path) LIKE '%/production.json')`),
    dsStoreEntries: scalar(
      `SELECT COUNT(*) AS value FROM migration_entries
       WHERE migration_run_id = '${TASK_2D2_RUN_ID}' AND source_kind = 'ralphy'
         AND entry_kind = 'file' AND substr(source_path, -10) = '/.DS_Store'
         AND disposition = 'system' AND state = 'excluded'`),
  };
}

function requireBaseline(value: Record<string, number | string>): void {
  const expected: Record<string, number> = {
    schemaVersion: 6, userVersion: 6, schemaVersionRows: 1,
    workspaces: 33, projects: 207, objects: 83_206,
    artifacts: 21_626, artifactRevisions: 22_461, units: 181,
    compositions: 0, compositionRevisions: 0, compositionFiles: 0,
    compositionInputs: 0, builds: 0, buildOutputs: 0, productionManifests: 0, dsStoreEntries: 427,
  };
  for (const [key, count] of Object.entries(expected)) {
    if (value[key] !== count) conflict(`${key}: expected ${count}, found ${String(value[key])}`);
  }
}

function assertSchemaIdentity(db: Database): void {
  const versions = all(db, "SELECT version FROM schema_migrations ORDER BY version")
    .map((row) => numberValue(row.version));
  if (canonicalRequestJson(versions) !== "[1,2,3,4,5,6]") {
    conflict("schema migration history is not exactly versions 1 through 6");
  }
  const schemaRows = (database: Database) => all(database,
    `SELECT type, name, tbl_name AS tableName, sql
     FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'
     ORDER BY type, name`);
  const expectedDb = new Database(":memory:", { strict: true });
  let expected: SqlRow[];
  try {
    for (const migration of MIGRATIONS.filter(({ version }) => version <= 6)) {
      expectedDb.exec(migration.sql);
    }
    expected = schemaRows(expectedDb);
  } finally {
    expectedDb.close();
  }
  if (canonicalRequestJson(schemaRows(db) as unknown as JsonValue)
    !== canonicalRequestJson(expected as unknown as JsonValue)) {
    conflict("schema version 6 supplemental-ref identity differs from the approved migration");
  }
}

function captureDsStoreEvidence(db: Database, evidence: Map<string, CapturedEvidenceRow>): void {
  const rows = all(db,
    `SELECT * FROM migration_entries
     WHERE migration_run_id = ? AND source_kind = 'ralphy' AND entry_kind = 'file'
       AND substr(source_path, -10) = '/.DS_Store' AND disposition = 'system' AND state = 'excluded'
     ORDER BY id`, [TASK_2D2_RUN_ID]);
  if (rows.length !== 427) conflict(".DS_Store evidence differs from the authorized 427 file rows");
  for (const row of rows) capture(evidence, "migration_entries", String(row.id), row);
}

function inspectCompositionSources(
  db: Database,
  evidence: Map<string, CapturedEvidenceRow>,
): { sources: SourceEntry[]; renders: RenderIndex } {
  const entries = all(db,
    `SELECT entry.*, source.source_label AS migration_source_label
     FROM migration_entries entry
     JOIN migration_sources source ON source.id = entry.migration_source_id
     WHERE entry.migration_run_id = ? AND entry.entry_kind = 'file'
       AND entry.source_kind = 'ralphy' AND entry.disposition = 'object' AND entry.state = 'verified'
     ORDER BY entry.id`, [TASK_2D2_RUN_ID]);
  const projects = new Map(all(db, "SELECT * FROM projects")
    .map((row) => [String(row.id), row]));
  const result: SourceEntry[] = [];
  const renders: RenderEvidence[] = [];
  let renderCount = 0;
  let renderArtifactCount = 0;
  let rootArtifactCount = 0;
  for (const entry of entries) {
    const scope = locatorScope(String(entry.source_path));
    if (!scope) continue;
    const classification = classifyCompositionLocator({ value: scope.relative, projectLocator: scope.projectLocator });
    if (classification.kind === "invalid") {
      const render = classifyRenderLocator({ value: scope.relative, projectLocator: scope.projectLocator });
      if (render.kind === "render") {
        renderCount += 1;
        const refs = parseRefs(entry.target_refs_json);
        const sourceLabel = String(entry.migration_source_label);
        const { workspaceId, projectId } = importedScopeIds(sourceLabel, scope);
        const project = projects.get(projectId);
        if (!project || project.workspace_id !== workspaceId) {
          conflict(`render evidence has no exact imported scope: ${String(entry.id)}`);
        }
        const resolved = assertArtifactEraRefs(db, refs, null, {
          workspaceId, projectId,
        }, evidence, `render ${String(entry.id)}`);
        if (entry.bytes !== resolved.object.bytes || entry.sha256 !== resolved.object.sha256) {
          conflict(`render migration entry bytes or sha256 differ from its Object: ${String(entry.id)}`);
        }
        if (resolved.artifactRevisionId) renderArtifactCount += 1;
        renders.push({
          entryId: String(entry.id),
          migrationSourceId: String(entry.migration_source_id), sourcePath: String(entry.source_path),
          projectId,
          objectBytes: numberValue(resolved.object.bytes), artifactRevisionId: resolved.artifactRevisionId,
        });
        capture(evidence, "migration_entries", String(entry.id), stripAliases(entry, ["migration_source_label"]));
        capture(evidence, "projects", projectId, project!);
        capture(evidence, "workspaces", String(project!.workspace_id),
          one(db, "SELECT * FROM workspaces WHERE id = ?", [String(project!.workspace_id)])!);
      }
      continue;
    }
    const sourceLabel = String(entry.migration_source_label);
    const { workspaceId: expectedWorkspaceId, projectId } = importedScopeIds(sourceLabel, scope);
    const project = projects.get(projectId);
    if (!project || project.slug !== scope.projectSlug || project.workspace_id !== expectedWorkspaceId) {
      conflict(`Composition source has no exact imported scope: ${String(entry.id)}`);
    }
    const refs = parseRefs(entry.target_refs_json);
    const objectIds = refs.filter((ref) => ref.startsWith("obj_"));
    if (objectIds.length !== 1) conflict(`Composition source does not reference exactly one Object: ${String(entry.id)}`);
    if (classification.kind === "snapshot" && refs.length !== 3) {
      conflict(`plural Composition source lacks its exact Artifact triple: ${String(entry.id)}`);
    }
    if (classification.kind === "root") {
      if (refs.length === 3) rootArtifactCount += 1;
      else if (refs.length !== 1) conflict(`root Composition source refs are not exact: ${String(entry.id)}`);
    }
    const resolved = assertArtifactEraRefs(db, refs, objectIds[0]!, {
      workspaceId: expectedWorkspaceId, projectId,
    }, evidence, `source ${String(entry.id)}`);
    if (entry.bytes !== resolved.object.bytes || entry.sha256 !== resolved.object.sha256) {
      conflict(`Composition source Object scope mismatch: ${String(entry.id)}`);
    }
    capture(evidence, "migration_entries", String(entry.id), stripAliases(entry, ["migration_source_label"]));
    capture(evidence, "projects", projectId, project!);
    capture(evidence, "workspaces", String(project!.workspace_id),
      one(db, "SELECT * FROM workspaces WHERE id = ?", [String(project!.workspace_id)])!);
    result.push({
      id: String(entry.id), migration_source_id: String(entry.migration_source_id),
      source_path: String(entry.source_path), projectId, kind: classification.kind,
      object: { id: resolved.objectId, sha256: String(resolved.object.sha256) },
    });
  }
  if (renderCount !== 784 || renderArtifactCount !== 778 || rootArtifactCount !== 72) {
    conflict(`Artifact-era topology differs from render 784/778 and root 72: ${renderCount}/${renderArtifactCount}/${rootArtifactCount}`);
  }
  return {
    sources: result,
    renders: {
      byPath: groupBy(renders, (row) => `${row.migrationSourceId}\0${row.sourcePath}`),
      byProjectBytes: groupBy(renders, (row) =>
        `${row.migrationSourceId}\0${row.projectId}\0${row.objectBytes}`),
    },
  };
}

function inspectGenerations(
  db: Database,
  sources: readonly SourceEntry[],
  renders: RenderIndex,
  evidence: Map<string, CapturedEvidenceRow>,
): { eligible: EligibleGeneration[]; outcomes: GenerationOutcome[] } {
  const owners = all(db,
    `SELECT entry.id AS owner_entry_id, entry.migration_source_id, entry.source_locator_hash,
            source.source_label AS migration_source_label, entry.source_path,
            entry.target_refs_json, revision.*, document.project_id AS document_project_id,
            project.workspace_id AS document_workspace_id
     FROM migration_entries entry
     JOIN migration_sources source ON source.id = entry.migration_source_id
     JOIN json_each(entry.target_refs_json) ref
     JOIN document_revisions revision ON revision.id = ref.value
     JOIN documents document ON document.id = revision.document_id
     JOIN projects project ON project.id = document.project_id
     WHERE entry.migration_run_id = ? AND entry.entry_kind = 'file'
       AND entry.source_kind = 'ralphy' AND entry.disposition = 'domain' AND entry.state = 'imported'
       AND (entry.source_path LIKE '%/generations.jsonl' OR entry.source_path LIKE '%/logs/generations.jsonl')
       AND ref.value LIKE 'drev_%'
     ORDER BY revision.id, entry.id`, [TASK_2D2_RUN_ID])
    .filter((row) => /^(?:workspaces\/[^/]+\/projects\/[^/]+|projects\/[^/]+)\/(?:logs\/)?generations\.jsonl$/u
      .test(String(row.source_path)));
  const globalOwners = groupBy(all(db,
    `SELECT entry.id AS owner_entry_id, ref.value AS revision_id
     FROM migration_entries entry
     JOIN json_each(entry.target_refs_json) ref
     WHERE entry.migration_run_id = ? AND typeof(ref.value) = 'text' AND ref.value LIKE 'drev_%'
     ORDER BY ref.value, entry.id, ref.key`, [TASK_2D2_RUN_ID]),
  (row) => String(row.revision_id));
  const sourceByKey = new Map(sources.map((entry) => [`${entry.migration_source_id}\0${entry.source_path}`, entry]));
  const eligible: EligibleGeneration[] = [];
  const outcomes: GenerationOutcome[] = [];
  const auditedReviewSeen = new Set<string>();
  for (const row of owners) {
    const revisionId = String(row.id);
    const occurrences = globalOwners.get(revisionId) ?? [];
    if (occurrences.length !== 1 || occurrences[0]!.owner_entry_id !== row.owner_entry_id) {
      conflict(`generation revision ownership is not globally unique: ${revisionId}`);
    }
    const projectLocator = generationProjectLocator(String(row.source_path));
    const ownerScope = locatorScope(`${projectLocator}/generations.jsonl`);
    if (!ownerScope) conflict(`generation owner scope is invalid: ${revisionId}`);
    const { workspaceId: owningWorkspaceId, projectId: owningProjectId } = importedScopeIds(
      String(row.migration_source_label), ownerScope!,
    );
    const body = parseJson(String(row.body), `generation ${revisionId}`);
    const decoded = decodeHyperframesGenerationEvidence({
      body, documentProjectId: String(row.document_project_id),
      owningEntryWorkspaceId: owningWorkspaceId,
      owningEntryProjectId: owningProjectId, projectLocator,
    });
    capture(evidence, "migration_entries", String(row.owner_entry_id),
      one(db, "SELECT * FROM migration_entries WHERE id = ?", [String(row.owner_entry_id)])!);
    capture(evidence, "document_revisions", revisionId, stripAliases(row, [
      "owner_entry_id", "migration_source_id", "source_locator_hash", "source_path", "target_refs_json",
      "migration_source_label", "document_project_id", "document_workspace_id",
    ]));
    const document = one(db, "SELECT * FROM documents WHERE id = ?", [String(row.document_id)]);
    const project = one(db, "SELECT * FROM projects WHERE id = ?", [String(row.document_project_id)]);
    const workspace = one(db, "SELECT * FROM workspaces WHERE id = ?", [String(row.document_workspace_id)]);
    if (!document || !project || !workspace
      || document.workspace_id !== owningWorkspaceId || document.project_id !== owningProjectId
      || project.workspace_id !== owningWorkspaceId) {
      conflict(`generation Document/Project/Workspace scope differs: ${revisionId}`);
    }
    capture(evidence, "documents", String(row.document_id), document!);
    capture(evidence, "projects", String(row.document_project_id), project!);
    capture(evidence, "workspaces", String(row.document_workspace_id), workspace!);
    const auditedReview = TASK_2D2_AUDITED_REVIEW.get(revisionId);
    if (auditedReview) {
      const top = recordValue(body);
      const generationInput = recordValue(top?.input);
      const generationOutput = recordValue(top?.output);
      if (decoded.kind !== "needs-review" || decoded.reason !== auditedReview.classifierReason
        || row.owner_entry_id !== auditedReview.ownerEntryId
        || row.source_path !== auditedReview.ownerPath
        || row.migration_source_id !== TASK_2D2_SOURCE_ID
        || row.document_project_id !== auditedReview.projectId
        || generationInput?.composition !== auditedReview.composition
        || generationOutput?.local !== auditedReview.output
        || generationOutput?.bytes !== auditedReview.bytes) {
        conflict(`audited generation review boundary differs: ${revisionId}`);
      }
      auditedReviewSeen.add(revisionId);
      outcomes.push({
        generationRevisionId: revisionId,
        outcome: "needs-review",
        reason: auditedReview.reason,
      });
      continue;
    }
    if (decoded.kind === "ignored") {
      outcomes.push({ generationRevisionId: revisionId, outcome: "ignored", reason: decoded.reason });
      continue;
    }
    if (decoded.kind === "needs-review") {
      outcomes.push({ generationRevisionId: revisionId, outcome: "needs-review", reason: decoded.reason });
      continue;
    }
    const matched = matchEligibleGeneration(row, body, decoded, projectLocator, sourceByKey, renders);
    if (typeof matched === "string") {
      outcomes.push({ generationRevisionId: revisionId, outcome: "needs-review", reason: matched });
      continue;
    }
    eligible.push(matched);
    outcomes.push({ generationRevisionId: revisionId, outcome: "strict-import", reason: "exact-evidence-match" });
  }
  if (auditedReviewSeen.size !== TASK_2D2_AUDITED_REVIEW.size) {
    conflict("audited generation review boundaries are incomplete");
  }
  outcomes.sort((left, right) => compareUtf8(left.generationRevisionId, right.generationRevisionId));
  eligible.sort((left, right) => compareUtf8(left.revisionId, right.revisionId));
  if (new Set(eligible.map((row) => row.outputEntryId)).size !== eligible.length) {
    conflict("eligible output entry is not globally one-to-one");
  }
  if (new Set(eligible.map((row) => row.sourceEntryId)).size !== 53) {
    conflict("eligible generations do not resolve to the authorized 53 source snapshots");
  }
  const strictProjectIds = {
    denti: importedScopeIds(TASK_2D2_SOURCE_LABEL, {
      workspaceSlug: "denti-ai", projectSlug: "denti-perio-pitch-001",
    }).projectId,
    nightmaker: importedScopeIds(TASK_2D2_SOURCE_LABEL, {
      workspaceSlug: "nightmaker", projectSlug: "nightmaker-hooks-001",
    }).projectId,
  };
  if (eligible.filter((row) => row.projectId === strictProjectIds.denti).length !== 57
    || eligible.filter((row) => row.projectId === strictProjectIds.nightmaker).length !== 10
    || eligible.some((row) => row.projectId !== strictProjectIds.denti
      && row.projectId !== strictProjectIds.nightmaker)) {
    conflict("eligible generation ownership differs from the locator-derived Denti 57 / Nightmaker 10 scopes");
  }
  const projectByRevision = new Map(owners.map((row) => [String(row.id), String(row.document_project_id)]));
  const archiveOutcomes = outcomes.filter((row) => row.reason === "archive-locator-mismatch");
  const dentiArchives = archiveOutcomes.filter((row) => projectByRevision.get(row.generationRevisionId) === strictProjectIds.denti).length;
  const nightmakerArchives = archiveOutcomes.filter((row) => projectByRevision.get(row.generationRevisionId) === strictProjectIds.nightmaker).length;
  if (dentiArchives !== 22 || nightmakerArchives !== 11
    || archiveOutcomes.some((row) => !Object.values(strictProjectIds).includes(
      projectByRevision.get(row.generationRevisionId) ?? "",
    ))) {
    conflict(`archive-mismatch ownership differs from Denti 22 / Nightmaker 11: ${dentiArchives}/${nightmakerArchives}`);
  }
  const dentiOwners = owners.filter((row) => row.source_path === TASK_2D2_DENTI_OWNER_PATH);
  if (!dentiOwners.length || dentiOwners.some((row) =>
    row.owner_entry_id !== TASK_2D2_DENTI_OWNER_ID
    || row.source_locator_hash !== TASK_2D2_DENTI_OWNER_HASH
    || row.migration_source_id !== TASK_2D2_SOURCE_ID
    || row.migration_source_label !== TASK_2D2_SOURCE_LABEL)) {
    conflict("Denti generation owner identity differs from the audited entry and locator hash");
  }
  for (const [line, expectedId, suffix] of [
    [32, "drev_f22c7481-4b59-4538-8274-f912b04ec6d3", "variant-1.html"],
    [33, "drev_d2f1c794-34cb-417d-8d08-7b6c08e1d8ba", "variant-2.html"],
  ] as const) {
    const outcome = outcomes.find((row) => row.generationRevisionId === expectedId);
    const source = sourceByKey.get(
      `${TASK_2D2_SOURCE_ID}\0${generationProjectLocator(TASK_2D2_DENTI_OWNER_PATH)}/compositions/${suffix}`);
    if (dentiOwners.filter((row) => row.id === expectedId).length !== 1
      || outcome?.reason !== "archive-locator-mismatch" || source?.projectId !== strictProjectIds.denti) {
      conflict(`Denti generation line ${line} is not the exact archive-mismatch ${suffix} binding`);
    }
  }
  return { eligible, outcomes };
}

function assertArtifactEraRefs(
  db: Database,
  refs: readonly string[],
  expectedObjectId: string | null,
  expectedScope: { workspaceId: string; projectId: string } | null,
  evidence: Map<string, CapturedEvidenceRow>,
  label: string,
): { objectId: string; object: SqlRow; artifactRevisionId: string | null } {
  if (refs.length === 1 && refs[0]!.startsWith("obj_")) {
    if (expectedObjectId && refs[0] !== expectedObjectId) conflict(`${label} Object ref changed`);
    const object = one(db, "SELECT * FROM objects WHERE id = ?", [refs[0]!]);
    if (!object || expectedScope && (object.workspace_id !== expectedScope.workspaceId
      || object.project_id !== expectedScope.projectId)) conflict(`${label} Object is missing or out of scope`);
    capture(evidence, "objects", refs[0]!, object!);
    return { objectId: refs[0]!, object: object!, artifactRevisionId: null };
  }
  if (refs.length !== 3 || !refs[0]!.startsWith("arev_")
    || !refs[1]!.startsWith("art_") || !refs[2]!.startsWith("obj_")) {
    conflict(`${label} refs are not the exact [ArtifactRevision, Artifact, Object] triple`);
  }
  if (expectedObjectId && refs[2] !== expectedObjectId) conflict(`${label} Object ref changed`);
  const artifact = one(db, "SELECT * FROM artifacts WHERE id = ?", [refs[1]!]);
  const revision = one(db, "SELECT * FROM artifact_revisions WHERE id = ?", [refs[0]!]);
  const object = one(db, "SELECT * FROM objects WHERE id = ?", [refs[2]!]);
  if (!artifact || !revision || !object || revision.artifact_id !== artifact.id || revision.object_id !== object.id
    || artifact.workspace_id !== object.workspace_id || artifact.project_id !== object.project_id
    || expectedScope && (object.workspace_id !== expectedScope.workspaceId || object.project_id !== expectedScope.projectId)) {
    conflict(`${label} Artifact/Object identity or scope differs`);
  }
  capture(evidence, "artifacts", refs[1]!, artifact!);
  capture(evidence, "artifact_revisions", refs[0]!, revision!);
  capture(evidence, "objects", refs[2]!, object!);
  return { objectId: refs[2]!, object: object!, artifactRevisionId: refs[0]! };
}

function matchEligibleGeneration(
  row: SqlRow,
  body: JsonValue,
  decoded: Extract<ReturnType<typeof decodeHyperframesGenerationEvidence>, { kind: "eligible" }>,
  projectLocator: string,
  sourceByKey: ReadonlyMap<string, SourceEntry>,
  renders: RenderIndex,
): EligibleGeneration | string {
  const input = recordValue(recordValue(body)?.input);
  const top = recordValue(body)!;
  const sourcePath = `${projectLocator}/${decoded.composition.canonicalProjectRelative}`;
  const outputPath = `${projectLocator}/${decoded.render.canonicalProjectRelative}`;
  const source = sourceByKey.get(`${String(row.migration_source_id)}\0${sourcePath}`);
  if (!source || source.projectId !== row.document_project_id) return "source-evidence-mismatch";
  const pathKey = `${String(row.migration_source_id)}\0${outputPath}`;
  const exact = renders.byPath.get(pathKey) ?? [];
  if (exact.length > 1) conflict(`render canonical path is not unique: ${outputPath}`);
  const exactOutput = exact[0];
  let output: RenderEvidence;
  if (exactOutput?.objectBytes === decoded.outputBytes) output = exactOutput;
  else {
    const alternate = (renders.byProjectBytes.get(
      `${String(row.migration_source_id)}\0${String(row.document_project_id)}\0${decoded.outputBytes}`,
    ) ?? []).filter((candidate) => candidate.sourcePath !== outputPath);
    if (alternate.length === 1) {
      if (!alternate[0]!.artifactRevisionId) conflict(`archived render lacks its exact Artifact triple: ${alternate[0]!.sourcePath}`);
      return "archive-locator-mismatch";
    }
    if (alternate.length === 0) return "output-byte-mismatch";
    conflict(`render byte-match evidence is ambiguous: ${String(row.id)}`);
  }
  if (!output.artifactRevisionId) return "output-evidence-mismatch";
  const completedAt = Date.parse(decoded.completedAt);
  const latency = top.latency_ms;
  if (!Number.isSafeInteger(completedAt) || completedAt < 0
    || typeof latency !== "number" || !Number.isSafeInteger(latency) || latency < 0
    || !Number.isSafeInteger(completedAt - latency) || completedAt - latency < 0) return "timestamp-or-latency-invalid";
  const cost = top.cost_usd;
  if (cost !== undefined && (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)) return "cost-invalid";
  const profile: Record<string, JsonValue> = {};
  for (const key of ["fps", "quality", "format", "resolution", "workers"] as const) {
    if (!input || !Object.hasOwn(input, key)) continue;
    const value = input[key];
    const valid = key === "fps" ? typeof value === "number" && Number.isFinite(value)
      : key === "quality" ? value === "draft" || value === "standard" || value === "high"
      : key === "format" ? value === "mp4" : typeof value === "string";
    if (!valid) return `profile-${key}-invalid`;
    profile[key] = value!;
  }
  try {
    validateBuildProfile(profile);
  } catch {
    return "profile-invalid";
  }
  return {
    revisionId: String(row.id), ownerEntryId: String(row.owner_entry_id), sourceEntryId: source.id,
    outputEntryId: output.entryId, sourceObjectId: source.object.id,
    artifactRevisionId: output.artifactRevisionId, projectId: String(row.document_project_id),
    workspaceId: String(row.document_workspace_id), completedAt, startedAt: completedAt - numberValue(latency),
    outputBytes: decoded.outputBytes, provider: retainedText(top.provider), model: retainedText(top.model),
    costUsd: cost === undefined ? null : cost, profile,
  };
}

function inspectGhostDeletions(
  db: Database,
  evidence: Map<string, CapturedEvidenceRow>,
  invariants: Record<string, JsonValue>,
): PlannedDeletion[] {
  const ghostEvidence = all(db,
    `SELECT entry.*, source.source_label AS migration_source_label
     FROM migration_entries entry
     JOIN migration_sources source ON source.id = entry.migration_source_id
     WHERE entry.migration_run_id = ? AND entry.source_kind = 'ralphy' AND entry.entry_kind = 'file'
       AND entry.disposition = 'system' AND entry.state = 'excluded'
       AND substr(entry.source_path, -10) = '/.DS_Store'
     ORDER BY entry.id`, [TASK_2D2_RUN_ID]).flatMap((entry) => {
    const sourcePath = String(entry.source_path);
    const workspace = sourcePath === "workspaces/.DS_Store";
    const projectWorkspace = sourcePath === "projects/.DS_Store" ? "default"
      : sourcePath.match(/^workspaces\/([^/]+)\/projects\/\.DS_Store$/u)?.[1];
    if (!workspace && !projectWorkspace) return [];
    const prefix = workspace ? "ws" as const : "prj" as const;
    const sourceLabel = String(entry.migration_source_label);
    const key = workspace ? `workspace:${sourceLabel}\0.DS_Store`
      : `project:${sourceLabel}\0${projectWorkspace}\0.DS_Store`;
    return [{ table: workspace ? "workspaces" as const : "projects" as const,
      id: migrationStableId(prefix, TASK_2D2_RUN_ID, key), entry,
      expectedWorkspaceId: workspace ? null : migrationStableId("ws", TASK_2D2_RUN_ID,
        `workspace:${sourceLabel}\0${projectWorkspace}`) }];
  });
  if (ghostEvidence.length !== 24 || new Set(ghostEvidence.map((row) => row.id)).size !== 24) {
    conflict("ghost scope evidence does not derive exactly 24 unique IDs");
  }
  const ghosts = ghostEvidence.map(({ table, id, entry, expectedWorkspaceId }) => {
    capture(evidence, "migration_entries", String(entry.id), stripAliases(entry, ["migration_source_label"]));
    const row = one(db, `SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!row) conflict(`evidence-derived ghost scope is missing: ${id}`);
    if (table === "projects" && row!.workspace_id !== expectedWorkspaceId) {
      conflict(`evidence-derived ghost Project has the wrong deterministic Workspace: ${id}`);
    }
    return { table, row: row! };
  });
  if (ghosts.filter((ghost) => ghost.table === "projects").length !== 23
    || ghosts.filter((ghost) => ghost.table === "workspaces").length !== 1) {
    conflict("ghost scope set differs from the authorized 23 Projects and one Workspace");
  }
  const ids = new Set(ghosts.map((ghost) => String(ghost.row.id)));
  const tables = all(db,
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((row) => String(row.name));
  const references: { table: string; column: string; entityId: string; count: number }[] = [];
  const checkedSurfaces = new Set<string>();
  for (const table of tables) {
    const columns = all(db, `PRAGMA table_info(${quoteIdentifier(table)})`);
    const fks = all(db, `PRAGMA foreign_key_list(${quoteIdentifier(table)})`)
      .filter((fk) => fk.table === "projects" || fk.table === "workspaces")
      .map((fk) => String(fk.from));
    const polymorphic = columns.map((column) => String(column.name))
      .filter((name) => name === "entity_id" || name === "target_id" || name === "context_id");
    for (const column of new Set([...fks, ...polymorphic])) {
      checkedSurfaces.add(`${table}.${column}`);
      for (const entityId of ids) {
        const count = numberValue(one(db,
          `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} = ?`, [entityId])!.count);
        if (count) references.push({ table, column, entityId, count });
      }
    }
  }
  checkedSurfaces.add("migration_entries.target_refs_json");
  checkedSurfaces.add("migration_entry_supplemental_refs.target_ref");
  for (const entityId of ids) {
    const original = numberValue(one(db,
      `SELECT COUNT(*) AS count FROM migration_entries entry, json_each(entry.target_refs_json) ref
       WHERE ref.value = ?`, [entityId])!.count);
    const supplemental = numberValue(one(db,
      "SELECT COUNT(*) AS count FROM migration_entry_supplemental_refs WHERE target_ref = ?", [entityId])!.count);
    if (original || supplemental) references.push({
      table: "migration_refs", column: "target_ref", entityId, count: original + supplemental,
    });
  }
  if (references.length) conflict(`ghost scopes retain references: ${references[0]!.entityId}`);
  invariants.ghostReferenceProof = {
    checkedIds: [...ids].sort(compareUtf8), checkedSurfaces: [...checkedSurfaces].sort(compareUtf8), references,
  };
  return ghosts.map(({ table, row }) => {
    if (row.row_version !== 1) conflict(`ghost scope row_version changed: ${String(row.id)}`);
    capture(evidence, table, String(row.id), row);
    return { table, primaryKey: String(row.id), fullPreimage: jsonColumns(row) };
  }).sort((left, right) => compareUtf8(left.table, right.table) || compareUtf8(left.primaryKey, right.primaryKey));
}

function assertTargetsAbsent(
  db: Database,
  rows: readonly PlannedRow[],
  refs: readonly LiveRepairPlan["supplementalRefs"][number][],
): void {
  if (numberValue(one(db,
    "SELECT COUNT(*) AS count FROM migration_entry_supplemental_refs WHERE repair_key = 'task-2d2-v1'")!.count) !== 0) {
    conflict("fresh planner found an existing Task 2D2 supplemental association");
  }
  const originalRef = one(db,
    `SELECT ref.value AS target_ref
     FROM migration_entries entry
     JOIN json_each(entry.target_refs_json) ref
     JOIN json_each(?) planned ON planned.value = ref.value
     LIMIT 1`, [canonicalRequestJson(rows.map((row) => row.primaryKey))]);
  if (originalRef) conflict(`fresh planner found an original repair target ref: ${String(originalRef.target_ref)}`);
  const repairKeySurfaces = all(db,
    `SELECT schema.name AS table_name, column.name AS column_name
     FROM sqlite_schema schema
     JOIN pragma_table_xinfo(schema.name) column
     WHERE schema.type = 'table'
       AND column.name IN ('metadata_json', 'config_json', 'engine_config_json')
     ORDER BY schema.name, column.name`);
  for (const surface of repairKeySurfaces) {
    const table = String(surface.table_name);
    const column = String(surface.column_name);
    if (one(db, `SELECT 1 AS found FROM ${quoteIdentifier(table)}
      WHERE json_extract(${quoteIdentifier(column)}, '$.repairKey') = ? LIMIT 1`, [TASK_2D2_VERSION])) {
      conflict(`fresh planner found an existing Task 2D2 repair key: ${table}.${column}`);
    }
  }
  for (const row of rows) {
    const found = one(db, `SELECT 1 AS found FROM ${quoteIdentifier(row.table)} WHERE id = ?`, [row.primaryKey]);
    if (found) conflict(`deterministic target already exists: ${row.primaryKey}`);
  }
  for (const ref of refs) {
    const found = one(db,
      `SELECT 1 AS found FROM migration_entry_supplemental_refs
       WHERE migration_entry_id = ? AND target_ref = ?`, [ref.migrationEntryId, ref.targetRef]);
    if (found) conflict(`supplemental pair already exists: ${ref.migrationEntryId}/${ref.targetRef}`);
  }
}

export function deriveLiveRepairReport(
  plan: LiveRepairPlan,
  input: { state: Exclude<LiveRepairState, "complete-rerun">; conflicts: readonly { code: string; entityId?: string }[] },
): LiveRepairReport {
  if ((input as { state: LiveRepairState }).state === "complete-rerun") {
    throw new Error("Task 2D2 fresh planner cannot verify complete-rerun state");
  }
  if ((input.state === "conflict") !== (input.conflicts.length > 0)) {
    throw new Error("Task 2D2 report state and conflicts are inconsistent");
  }
  if (digest(plan.evidenceRows) !== plan.evidenceSha256) {
    throw new Error("Task 2D2 plan evidence digest does not match its captured rows");
  }
  if (plan.insertedRows.length !== 988 || plan.transitions.length !== 630
    || plan.supplementalRefs.length !== 1_336 || plan.deletions.length !== 24
    || new Set(plan.supplementalRefs.map((row) => `${row.migrationEntryId}\0${row.targetRef}`)).size !== 1_336) {
    throw new Error("Task 2D2 plan mutation arithmetic is inconsistent");
  }
  const ledger = plan.invariants.find((row) => row.code === "generationOutcomeLedger")?.facts;
  if (!Array.isArray(ledger) || ledger.length !== 639) throw new Error("Task 2D2 plan has no complete generation outcome ledger");
  const outcomes = ledger as unknown as GenerationOutcome[];
  const needsReview = outcomes.filter((row) => row.outcome === "needs-review")
    .map((row) => ({ generationRevisionId: row.generationRevisionId, reason: row.reason }));
  const eligible = outcomes.filter((row) => row.outcome === "strict-import")
    .map((row) => row.generationRevisionId);
  if (outcomes.filter((row) => row.outcome === "ignored" && row.reason === "wrapper-without-output").length !== 4
    || outcomes.filter((row) => row.outcome === "ignored" && row.reason === "error").length !== 51) {
    throw new Error("Task 2D2 plan ignored outcome ledger is inconsistent");
  }
  const report = {
    version: plan.version,
    state: input.state,
    applicable: input.state === "fresh",
    planSha256: digest(plan),
    evidenceSha256: plan.evidenceSha256,
    coreCommit: plan.coreCommit,
    schemaVersion: plan.schemaVersion,
    migrationRunId: plan.migrationRunId,
    baseline: plan.baseline,
    insertCounts: countTables(plan.insertedRows),
    deleteIds: plan.deletions.map((row) => row.primaryKey).sort(compareUtf8),
    deletionPreimageSha256: digest(plan.deletions.map((row) => row.fullPreimage)),
    eligibleGenerationRevisionIds: eligible,
    needsReview,
    ignoredCounts: {
      wrapperWithoutOutput: 4,
      errors: 51,
    },
    conflicts: [...input.conflicts].sort((left, right) => compareUtf8(left.code, right.code)
      || compareUtf8(left.entityId ?? "", right.entityId ?? "")),
    changes: input.state === "fresh" ? 2_978 : 0,
  } satisfies LiveRepairReport;
  return deepFreeze(report);
}

function planned(table: string, id: string, columns: Record<string, PlannedValue>): PlannedRow {
  return { table, primaryKey: id, columns };
}

function transition(
  table: string,
  id: string,
  from: Record<string, PlannedValue>,
  to: Record<string, PlannedValue>,
): PlannedTransition {
  return { table, primaryKey: id, from: from as JsonValue, to: to as JsonValue };
}

function supplementalRef(migrationEntryId: string, targetRef: string): LiveRepairPlan["supplementalRefs"][number] {
  return { migrationEntryId, targetRef, repairKey: TASK_2D2_VERSION };
}

function repairId(prefix: Task2d2TargetPrefix, evidence: string): string {
  return migrationStableId(prefix, TASK_2D2_RUN_ID,
    `task-2d2-live-repair:v1\0${prefix}\0${evidence}`);
}

function locatorScope(sourcePath: string): {
  projectLocator: string;
  workspaceSlug: string;
  projectSlug: string;
  relative: string;
} | null {
  const match = sourcePath.match(/^(?:(workspaces\/([^/]+)\/projects\/([^/]+))|(projects\/([^/]+)))\/(.+)$/u);
  if (!match) return null;
  return match[1]
    ? { projectLocator: match[1], workspaceSlug: match[2]!, projectSlug: match[3]!, relative: match[6]! }
    : { projectLocator: match[4]!, workspaceSlug: "default", projectSlug: match[5]!, relative: match[6]! };
}

function importedScopeIds(
  sourceLabel: string,
  scope: { workspaceSlug: string; projectSlug: string },
): { workspaceId: string; projectId: string } {
  return {
    workspaceId: migrationStableId("ws", TASK_2D2_RUN_ID,
      `workspace:${sourceLabel}\0${scope.workspaceSlug}`),
    projectId: migrationStableId("prj", TASK_2D2_RUN_ID,
      `project:${sourceLabel}\0${scope.workspaceSlug}\0${scope.projectSlug}`),
  };
}

function generationProjectLocator(sourcePath: string): string {
  const suffix = sourcePath.endsWith("/logs/generations.jsonl")
    ? "/logs/generations.jsonl" : "/generations.jsonl";
  if (!sourcePath.endsWith(suffix)) conflict(`invalid generation ledger locator: ${sourcePath}`);
  return sourcePath.slice(0, -suffix.length);
}

function parseRefs(value: SqlValue | undefined): string[] {
  if (value === null || value === undefined) return [];
  const parsed = parseJson(String(value), "migration target refs");
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    conflict("migration target refs are not a string array");
  }
  const refs = [...parsed as string[]];
  const sorted = [...refs].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (canonicalRequestJson(refs) !== String(value) || new Set(refs).size !== refs.length
    || refs.some((ref) => !/^[a-z][a-z0-9]*_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(ref))
    || refs.some((ref, index) => ref !== sorted[index])) {
    conflict("migration target refs are not canonical sorted unique Domain IDs");
  }
  return refs;
}

function parseJson(value: string, label: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    conflict(`${label} is not valid JSON`);
  }
}

function recordValue(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue> : null;
}

function retainedText(value: JsonValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function countTables(rows: readonly PlannedRow[]): Record<string, number> {
  return countValues(rows, (row) => row.table);
}

function countReasons(rows: readonly GenerationOutcome[]): Record<string, number> {
  return countValues(rows, (row) => row.reason);
}

function countValues<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[key(row)] = (counts[key(row)] ?? 0) + 1;
  return counts;
}

function groupBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const selected = result.get(key(value)) ?? [];
    selected.push(value);
    result.set(key(value), selected);
  }
  return result;
}

function all(db: Database, sql: string, parameters: readonly SqlValue[] = []): SqlRow[] {
  return db.query<SqlRow, SqlValue[]>(sql).all(...parameters) as SqlRow[];
}

function one(db: Database, sql: string, parameters: readonly SqlValue[] = []): SqlRow | null {
  return db.query<SqlRow, SqlValue[]>(sql).get(...parameters) as SqlRow | null;
}

function capture(
  evidence: Map<string, CapturedEvidenceRow>,
  table: string,
  primaryKey: string,
  row: SqlRow,
): void {
  const captured = { table, primaryKey, columns: jsonColumns(row) };
  const key = `${table}\0${primaryKey}`;
  const previous = evidence.get(key);
  if (previous && canonicalRequestJson(previous) !== canonicalRequestJson(captured)) {
    conflict(`captured evidence changed within snapshot: ${table}/${primaryKey}`);
  }
  evidence.set(key, captured);
}

function jsonColumns(row: SqlRow): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(row).sort(([left], [right]) => compareUtf8(left, right))) {
    if (typeof value === "bigint") {
      const number = Number(value);
      if (!Number.isSafeInteger(number)) conflict(`unsafe integer in evidence column: ${key}`);
      result[key] = number;
    } else if (value instanceof Uint8Array) conflict(`binary value in evidence column: ${key}`);
    else result[key] = value;
  }
  return result;
}

function stripAliases(row: SqlRow, names: readonly string[]): SqlRow {
  const result = { ...row };
  for (const name of names) delete result[name];
  return result;
}

function numberValue(value: SqlValue | undefined): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) conflict(`unsafe integer: ${String(value)}`);
  return number;
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalRequestJson(value as JsonValue, "Task 2D2 plan"), "utf8"))
    .digest("hex");
}

const compareEvidence = (left: CapturedEvidenceRow, right: CapturedEvidenceRow): number =>
  compareUtf8(left.table, right.table) || compareUtf8(left.primaryKey, right.primaryKey);
const comparePlannedRows = (left: PlannedRow, right: PlannedRow): number =>
  compareUtf8(left.table, right.table) || compareUtf8(left.primaryKey, right.primaryKey);

function compareTransitions(left: PlannedTransition, right: PlannedTransition): number {
  const rank = (value: PlannedTransition): number => {
    const from = recordValue(value.from);
    if (value.table === "composition_revisions") return 0;
    if (value.table === "compositions") return 1;
    if (value.table === "runs" && from?.state === "pending") return 2;
    if (value.table === "builds") return 3;
    if (value.table === "run_attempts") return 4;
    return 5;
  };
  return rank(left) - rank(right) || compareUtf8(left.primaryKey, right.primaryKey);
}

const compareUtf8 = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;
function conflict(detail: string): never { throw new Error(`Task 2D2 baseline conflict: ${detail}`); }

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export function insertTask2d2SupplementalRef(
  db: Database,
  input: {
    migrationEntryId: string;
    targetRef: string;
    createdAt: number;
  },
): void {
  const prefix = TASK_2D2_TARGET_REF.exec(input.targetRef)?.[1] as Task2d2TargetPrefix | undefined;
  const table = prefix ? TASK_2D2_TARGET_TABLES[prefix] : null;
  if (!table) throw new Error("Supplemental ref is not a canonical Task 2D2 target");
  if (!db.query<{ found: number }, [string]>(
    `SELECT 1 AS found FROM ${table} WHERE id = ?`,
  ).get(input.targetRef)) {
    throw new Error(`Task 2D2 target does not exist: ${input.targetRef}`);
  }
  db.prepare(
    `INSERT INTO migration_entry_supplemental_refs
     (migration_entry_id, target_ref, repair_key, created_at)
     VALUES (?, ?, 'task-2d2-v1', ?)`,
  ).run(input.migrationEntryId, input.targetRef, input.createdAt);
}
