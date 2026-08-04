import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { DomainError } from "../errors/domain.js";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { registerPreparedObject, resolveObjectPath, type PreparedObject } from "./internal-objects.js";
import {
  finishRunAttemptInTransaction,
  finishRunInTransaction,
  startRunAttemptInTransaction,
  startRunInTransaction,
} from "./runs.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import {
  resolveQueryContext,
  type QueryContext,
  type ResolvedScope,
} from "./scope-context.js";
import { assertActiveSessionScope } from "./sessions.js";
import type {
  BuildDto,
  BuildOutputDto,
  CompositionKind,
  CompositionDto,
  CompositionInputDto,
  CompositionRevisionDto,
  CompositionSourceDto,
  JsonValue,
  Page,
} from "./types.js";
import { StoreConflictError } from "./types.js";
import type {
  BuildRow,
  CompositionInputRow,
  CompositionRevisionRow,
  CompositionRow,
  CompositionSourceRow,
  ObjectRow,
} from "./internal-types.js";

type CompositionDbRow = {
  id: string;
  project_id: string;
  slug: string;
  kind: CompositionKind;
  selected_revision_id: string | null;
  row_version: number;
  created_at: number;
  updated_at: number;
};

type CompositionRevisionDbRow = {
  id: string;
  composition_id: string;
  revision_no: number;
  parent_revision_id: string | null;
  iteration_id: string | null;
  state: "draft" | "sealed";
  engine: string;
  engine_version: string | null;
  engine_config_json: string;
  manifest_sha256: string | null;
  authored_by_session_id: string | null;
  created_at: number;
  sealed_at: number | null;
};

type CompositionSourceDbRow = {
  id: string;
  composition_revision_id: string;
  logical_path: string;
  object_id: string;
  position: number;
  created_at: number;
};

type CompositionInputDbRow = {
  id: string;
  composition_revision_id: string;
  artifact_revision_id: string;
  role: string;
  position: number;
  config_json: string | null;
  created_at: number;
};

type ObjectDbRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  backend: "local";
  bucket: string;
  key: string;
  sha256: string;
  mime: string;
  bytes: number;
  storage_class: ObjectRow["storageClass"];
  original_name: string | null;
  metadata_json: string | null;
  created_at: number;
};

type BuildDbRow = {
  id: string;
  composition_revision_id: string;
  run_id: string | null;
  state: BuildRow["state"];
  profile_json: string;
  error: string | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
};

type RevisionScope = {
  revision: CompositionRevisionRow;
  composition: CompositionRow;
  workspaceId: string;
};

const COMPOSITION_COLUMNS =
  "id, project_id, slug, kind, selected_revision_id, row_version, created_at, updated_at";
const REVISION_COLUMNS =
  "id, composition_id, revision_no, parent_revision_id, iteration_id, state, engine, engine_version, engine_config_json, manifest_sha256, authored_by_session_id, created_at, sealed_at";
const SOURCE_COLUMNS =
  "id, composition_revision_id, logical_path, object_id, position, created_at";
const INPUT_COLUMNS =
  "id, composition_revision_id, artifact_revision_id, role, position, config_json, created_at";
const OBJECT_COLUMNS =
  "id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes, storage_class, original_name, metadata_json, created_at";
const BUILD_COLUMNS =
  "id, composition_revision_id, run_id, state, profile_json, error, created_at, started_at, ended_at";
const COMPOSITION_DTO_COLUMNS = `composition.id AS id,
  composition.project_id AS projectId, composition.slug AS slug,
  composition.kind AS kind,
  (SELECT revision.id FROM composition_revisions revision
   WHERE revision.composition_id = composition.id
   ORDER BY revision.revision_no DESC, revision.id DESC LIMIT 1) AS latestRevisionId,
  composition.selected_revision_id AS selectedRevisionId,
  composition.created_at AS createdAt, composition.updated_at AS updatedAt`;
const REVISION_DTO_COLUMNS = `revision.id AS id,
  revision.composition_id AS compositionId, revision.revision_no AS revisionNo,
  revision.parent_revision_id AS parentRevisionId,
  revision.iteration_id AS iterationId, revision.state AS state,
  revision.engine AS engine, revision.engine_version AS engineVersion,
  revision.authored_by_session_id AS authoredBySessionId,
  revision.created_at AS createdAt, revision.sealed_at AS sealedAt`;
const SOURCE_DTO_COLUMNS = `source.id AS id,
  source.composition_revision_id AS compositionRevisionId,
  source.object_id AS objectId, source.position AS position,
  source.created_at AS createdAt`;
const INPUT_DTO_COLUMNS = `input.id AS id,
  input.composition_revision_id AS compositionRevisionId,
  input.artifact_revision_id AS artifactRevisionId, input.role AS role,
  input.position AS position, input.created_at AS createdAt`;
const BUILD_DTO_COLUMNS = `build.id AS id,
  build.composition_revision_id AS compositionRevisionId,
  build.run_id AS runId, build.state AS state,
  build.created_at AS createdAt, build.ended_at AS finishedAt`;
const OUTPUT_DTO_COLUMNS = `output.id AS id, output.build_id AS buildId,
  output.artifact_revision_id AS artifactRevisionId, output.role AS role,
  output.position AS position, output.created_at AS createdAt`;
const COMPOSITION_KINDS = new Set<CompositionKind>([
  "video",
  "carousel",
  "sticker-pack",
  "image",
  "audio",
  "document",
  "custom",
]);
const ENGINE_SLUG = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const DATA_URL =
  /data:(?:[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+)?(?:;[a-z0-9!#$&^_.+-]+=[^;,\s]+)*(?:;base64)?,[^\s"'<>]*/i;
const BINARY_KEYS = new Set([
  "base64",
  "b64",
  "binary",
  "blob",
  "bytes",
  "dataurl",
  "filedata",
  "imagedata",
]);

export function createComposition(input: {
  projectId: string;
  slug: string;
  kind: CompositionKind;
}): CompositionDto {
  const slug = checkedText(input.slug, "Composition slug");
  if (!COMPOSITION_KINDS.has(input.kind)) {
    throw new Error(`Invalid Composition kind: ${input.kind}`);
  }
  return withImmediateTransaction((db) => {
    const scope = projectScope(db, input.projectId);
    if (!scope) throw new Error(`Project not found: ${input.projectId}`);
    const id = newDomainId("comp");
    const now = Date.now();
    db.prepare(
      "INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, input.projectId, slug, input.kind, now, now);
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: input.projectId,
      entityType: "composition",
      entityId: id,
      action: "composition.created",
      payload: { kind: input.kind, slug },
      createdAt: now,
    });
    return toCompositionDto(db, getCompositionRow(db, id)!);
  });
}

export function reviseComposition(input: {
  compositionId: string;
  expectedLatestRevisionId: string | null;
  /** @internal Preallocated by descriptor-first checkout materialization. */
  preallocatedRevisionId?: string;
  /** @internal Exact parent children captured for descriptor-first checkout materialization. */
  expectedParentSnapshot?: {
    sources: readonly { logicalPath: string; objectId: string; position: number }[];
    inputs: readonly { artifactRevisionId: string; role: string; position: number; config: JsonValue | null }[];
  };
  parentRevisionId?: string | null;
  iterationId?: string | null;
  engine: string;
  engineVersion?: string | null;
  engineConfig?: JsonValue;
  authoredBySessionId?: string | null;
}): CompositionRevisionDto {
  if (!Object.hasOwn(input, "expectedLatestRevisionId")) {
    throw new Error("Composition revision requires expectedLatestRevisionId");
  }
  const engine = checkedEngine(input.engine);
  const engineVersion = optionalText(
    input.engineVersion,
    "Composition engine version",
  );
  const engineConfig = canonicalJsonInput(
    Object.hasOwn(input, "engineConfig") ? input.engineConfig : {},
    "Composition engine config",
  );
  return withImmediateTransaction((db) => {
    const composition = getCompositionRow(db, input.compositionId);
    if (!composition) {
      throw new Error(`Composition not found: ${input.compositionId}`);
    }
    const scope = projectScope(db, composition.projectId)!;
    const latest = latestRevision(db, composition.id);
    if ((latest?.id ?? null) !== input.expectedLatestRevisionId) {
      throw new StoreConflictError("Composition latest revision conflict");
    }

    const parentId = Object.hasOwn(input, "parentRevisionId")
      ? input.parentRevisionId ?? null
      : latest?.id ?? null;
    if (latest && parentId === null) {
      throw new Error("Only the first Composition revision may have no parent");
    }
    if (!latest && parentId !== null) {
      throw new Error("The first Composition revision cannot have a parent");
    }
    if (parentId !== null) {
      const parent = getRevisionRow(db, parentId);
      if (!parent || parent.compositionId !== composition.id) {
        throw new Error(
          "Composition revision parent must belong to the same Composition",
        );
      }
    }
    assertIterationProject(db, input.iterationId ?? null, composition.projectId);
    if (input.authoredBySessionId != null) {
      assertActiveSessionScope(db, input.authoredBySessionId, {
        workspaceId: scope.workspaceId,
        projectId: composition.projectId,
      });
    }

    const id = input.preallocatedRevisionId ?? newDomainId("crev");
    const revisionNo = (latest?.revisionNo ?? 0) + 1;
    const createdAt = Date.now();
    db.prepare(
      `INSERT INTO composition_revisions
       (id, composition_id, revision_no, parent_revision_id, iteration_id, state,
        engine, engine_version, engine_config_json, authored_by_session_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      composition.id,
      revisionNo,
      parentId,
      input.iterationId ?? null,
      engine,
      engineVersion,
      JSON.stringify(engineConfig),
      input.authoredBySessionId ?? null,
      createdAt,
    );
    if (parentId !== null) cloneRevisionChildren(db, parentId, id, createdAt, input.expectedParentSnapshot);
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: composition.projectId,
      entityType: "composition_revision",
      entityId: id,
      action: "composition.revised",
      payload: {
        compositionId: composition.id,
        revisionNo,
        parentRevisionId: parentId,
        engine,
      },
      createdAt,
    });
    return toRevisionDto(getRevisionRow(db, id)!);
  });
}

export function putCompositionSource(input: {
  revisionId: string;
  logicalPath: string;
  objectId: string;
  position?: number;
}): CompositionSourceDto {
  const logicalPath = checkedLogicalPath(input.logicalPath);
  const position =
    input.position === undefined
      ? undefined
      : checkedPosition(input.position, "Composition source position");
  const initialObject = getObjectRow(openDomainDb(), input.objectId);
  if (!initialObject) throw new Error(`Object not found: ${input.objectId}`);
  resolveObjectPath(initialObject);

  return withImmediateTransaction((db) => {
    const scope = requireDraftRevision(db, input.revisionId);
    const object = getObjectRow(db, input.objectId);
    if (!object) throw new Error(`Object not found: ${input.objectId}`);
    assertObjectVisibleToProject(object, scope);
    resolveObjectPath(object);
    const existing = db
      .query<CompositionSourceDbRow, [string, string]>(
        `SELECT ${SOURCE_COLUMNS} FROM composition_revision_files
         WHERE composition_revision_id = ? AND logical_path = ?`,
      )
      .get(scope.revision.id, logicalPath);
    const nextPosition =
      position ??
      (existing?.position ??
        (db
          .query<{ position: number }, [string]>(
            "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM composition_revision_files WHERE composition_revision_id = ?",
          )
          .get(scope.revision.id)?.position ?? 0));
    assertSourcePositionAvailable(
      db,
      scope.revision.id,
      nextPosition,
      existing?.id ?? null,
    );
    const now = Date.now();
    let id: string;
    if (existing) {
      id = existing.id;
      db.prepare(
        "UPDATE composition_revision_files SET object_id = ?, position = ? WHERE id = ?",
      ).run(object.id, nextPosition, id);
    } else {
      id = newDomainId("cfile");
      db.prepare(
        `INSERT INTO composition_revision_files
         (id, composition_revision_id, logical_path, object_id, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, scope.revision.id, logicalPath, object.id, nextPosition, now);
    }
    appendRevisionActivity(db, scope, id, "composition.source_put", {
      objectId: object.id,
      position: nextPosition,
    });
    return toSourceDto(getSourceRow(db, id)!);
  });
}

export function removeCompositionSource(input: {
  revisionId: string;
  logicalPath: string;
}): CompositionSourceDto {
  const logicalPath = checkedLogicalPath(input.logicalPath);
  return withImmediateTransaction((db) => {
    const scope = requireDraftRevision(db, input.revisionId);
    const source = db
      .query<CompositionSourceDbRow, [string, string]>(
        `SELECT ${SOURCE_COLUMNS} FROM composition_revision_files
         WHERE composition_revision_id = ? AND logical_path = ?`,
      )
      .get(scope.revision.id, logicalPath);
    if (!source) throw new Error(`Composition source not found: ${logicalPath}`);
    db.prepare("DELETE FROM composition_revision_files WHERE id = ?").run(
      source.id,
    );
    appendRevisionActivity(
      db,
      scope,
      source.id,
      "composition.source_removed",
      { position: source.position },
    );
    return toSourceDto(toSourceRow(source));
  });
}

export function bindCompositionInput(input: {
  revisionId: string;
  artifactRevisionId: string;
  role: string;
  position: number;
  config?: JsonValue | null;
}): CompositionInputDto {
  const role = checkedText(input.role, "Composition input role");
  const position = checkedPosition(
    input.position,
    "Composition input position",
  );
  const config = canonicalOptionalJson(
    input.config,
    "Composition input config",
  );
  const initial = artifactRevisionScope(openDomainDb(), input.artifactRevisionId);
  if (!initial) {
    throw new Error(`Artifact Revision not found: ${input.artifactRevisionId}`);
  }
  resolveObjectPath(initial.object);

  return withImmediateTransaction((db) => {
    const scope = requireDraftRevision(db, input.revisionId);
    const artifact = artifactRevisionScope(db, input.artifactRevisionId);
    if (!artifact) {
      throw new Error(`Artifact Revision not found: ${input.artifactRevisionId}`);
    }
    assertArtifactVisibleToProject(artifact, scope);
    resolveObjectPath(artifact.object);
    const existing = db
      .query<CompositionInputDbRow, [string, number]>(
        `SELECT ${INPUT_COLUMNS} FROM composition_inputs
         WHERE composition_revision_id = ? AND position = ?`,
      )
      .get(scope.revision.id, position);
    const now = Date.now();
    let id: string;
    if (existing) {
      id = existing.id;
      db.prepare(
        "UPDATE composition_inputs SET artifact_revision_id = ?, role = ?, config_json = ? WHERE id = ?",
      ).run(artifact.revisionId, role, serializeJson(config), id);
    } else {
      id = newDomainId("input");
      db.prepare(
        `INSERT INTO composition_inputs
         (id, composition_revision_id, artifact_revision_id, role, position, config_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        scope.revision.id,
        artifact.revisionId,
        role,
        position,
        serializeJson(config),
        now,
      );
    }
    appendRevisionActivity(db, scope, id, "composition.input_bound", {
      artifactRevisionId: artifact.revisionId,
      role,
      position,
    });
    return toInputDto(getInputRow(db, id)!);
  });
}

export function removeCompositionInput(input: {
  revisionId: string;
  position: number;
}): CompositionInputDto {
  const position = checkedPosition(
    input.position,
    "Composition input position",
  );
  return withImmediateTransaction((db) => {
    const scope = requireDraftRevision(db, input.revisionId);
    const row = db
      .query<CompositionInputDbRow, [string, number]>(
        `SELECT ${INPUT_COLUMNS} FROM composition_inputs
         WHERE composition_revision_id = ? AND position = ?`,
      )
      .get(scope.revision.id, position);
    if (!row) throw new Error(`Composition input not found at position ${position}`);
    db.prepare("DELETE FROM composition_inputs WHERE id = ?").run(row.id);
    appendRevisionActivity(
      db,
      scope,
      row.id,
      "composition.input_removed",
      { position },
    );
    return toInputDto(toInputRow(row));
  });
}

export function sealCompositionRevision(input: {
  revisionId: string;
}): CompositionRevisionDto {
  const before = manifestForRevision(openDomainDb(), input.revisionId, true);
  if (!before.sources.length && !before.inputs.length) {
    throw new Error("Cannot seal an empty Composition revision");
  }
  const manifestSha256 = digestManifest(before.manifest);
  return withImmediateTransaction((db) => {
    const scope = requireDraftRevision(db, input.revisionId);
    const current = manifestForRevision(db, scope.revision.id, true);
    if (digestManifest(current.manifest) !== manifestSha256) {
      throw new StoreConflictError("Composition revision changed while sealing");
    }
    const sealedAt = Date.now();
    const result = db
      .prepare(
        `UPDATE composition_revisions
         SET state = 'sealed', manifest_sha256 = ?, sealed_at = ?
         WHERE id = ? AND state = 'draft'`,
      )
      .run(manifestSha256, sealedAt, scope.revision.id);
    if (!result.changes) {
      throw new StoreConflictError("Composition revision is not draft");
    }
    appendRevisionActivity(
      db,
      scope,
      scope.revision.id,
      "composition.sealed",
      { revisionNo: scope.revision.revisionNo },
      sealedAt,
    );
    return toRevisionDto(getRevisionRow(db, scope.revision.id)!);
  });
}

/** Atomically snapshots, seals, and starts the Composition Build lifecycle. */
export function snapshotAndStartCompositionBuild(input: {
  revisionId: string;
  expectedLatestRevisionId: string;
  sources: readonly { logicalPath: string; prepared: unknown; position: number }[];
  expectedInputs: readonly {
    position: number;
    artifactRevisionId: string;
    role: string;
    config: JsonValue | null;
  }[];
  profile: JsonValue;
  authoredBySessionId?: string | null;
  testHooks?: { beforeCommit?: () => void };
}) {
  const sources = input.sources.map((source) => ({
    ...source,
    prepared: source.prepared as PreparedObject,
    logicalPath: checkedLogicalPath(source.logicalPath),
    position: checkedPosition(source.position, "Composition source position"),
  }));
  if (sources.some((source, index) => source.position !== index)) {
    throw new Error("Composition source positions must be contiguous");
  }
  return withImmediateTransaction((db) => {
    const scope = requireDraftRevision(db, input.revisionId);
    const latest = latestRevision(db, scope.composition.id);
    if (!latest || latest.id !== input.expectedLatestRevisionId || latest.id !== scope.revision.id) {
      throw new StoreConflictError("Composition latest revision conflict");
    }
    const inputs = db.query<CompositionInputDbRow, [string]>(
      `SELECT ${INPUT_COLUMNS} FROM composition_inputs
       WHERE composition_revision_id = ? ORDER BY position, id`,
    ).all(scope.revision.id).map(toInputRow);
    if (
      inputs.length !== input.expectedInputs.length ||
      inputs.some((row, index) => {
        const expected = input.expectedInputs[index];
        return !expected || row.position !== expected.position ||
          row.artifactRevisionId !== expected.artifactRevisionId || row.role !== expected.role ||
          serializeJson(row.config) !== serializeJson(canonicalJsonInput(expected.config, "Composition input config"));
      })
    ) {
      throw new StoreConflictError("Composition inputs changed while snapshotting");
    }
    for (const compositionInput of inputs) {
      const artifact = artifactRevisionScope(db, compositionInput.artifactRevisionId);
      if (!artifact) throw new Error(`Artifact Revision not found: ${compositionInput.artifactRevisionId}`);
      assertArtifactVisibleToProject(artifact, scope);
      resolveObjectPath(artifact.object);
    }
    db.prepare("DELETE FROM composition_revision_files WHERE composition_revision_id = ?").run(scope.revision.id);
    const insert = db.prepare(
      `INSERT INTO composition_revision_files
       (id, composition_revision_id, logical_path, object_id, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    for (const source of sources) {
      const object = registerPreparedObject(db, source.prepared);
      assertObjectVisibleToProject(object, scope);
      appendActivity(db, {
        workspaceId: object.workspaceId,
        projectId: object.projectId,
        entityType: "object",
        entityId: object.id,
        action: "object.registered",
        payload: { bytes: object.bytes, mime: object.mime, storageClass: object.storageClass },
        createdAt: object.createdAt,
      });
      insert.run(newDomainId("cfile"), scope.revision.id, source.logicalPath, object.id, source.position, now);
    }
    const current = manifestForRevision(db, scope.revision.id, true);
    if (!current.sources.length && !current.inputs.length) throw new Error("Cannot seal an empty Composition revision");
    const manifestSha256 = digestManifest(current.manifest);
    db.prepare(
      `UPDATE composition_revisions SET state = 'sealed', manifest_sha256 = ?, sealed_at = ?
       WHERE id = ? AND state = 'draft'`,
    ).run(manifestSha256, now, scope.revision.id);
    appendRevisionActivity(db, scope, scope.revision.id, "composition.sealed", { revisionNo: scope.revision.revisionNo }, now);
    const run = startRunInTransaction(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.composition.projectId,
      agentSessionId: input.authoredBySessionId,
      kind: "composition.build",
      label: scope.composition.slug,
    });
    const attempt = startRunAttemptInTransaction(db, {
      runId: run.id,
      provider: scope.revision.engine,
      model: scope.revision.engine,
    });
    const buildId = newDomainId("build");
    const profile = canonicalJsonInput(input.profile, "Build profile");
    db.prepare(
      `INSERT INTO builds
       (id, composition_revision_id, run_id, state, profile_json, created_at, started_at)
       VALUES (?, ?, ?, 'running', ?, ?, ?)`,
    ).run(buildId, scope.revision.id, run.id, JSON.stringify(profile), now, now);
    appendBuildActivity(db, scope, buildId, "build.started", {
      compositionRevisionId: scope.revision.id,
      runId: run.id,
    }, now);
    input.testHooks?.beforeCommit?.();
    return {
      revision: toRevisionDto(getRevisionRow(db, scope.revision.id)!),
      run,
      attempt,
      build: toBuildDto(getBuildRow(db, buildId)!),
    };
  });
}

export function validateBuildProfile(profile: JsonValue): JsonValue {
  const value = canonicalJsonInput(profile, "Build profile");
  const format = value && typeof value === "object" && !Array.isArray(value) ? value.format : undefined;
  if (format !== undefined && format !== null && format !== "mp4") {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "format",
      detail: "Composition builds support only mp4 output",
    });
  }
  return value;
}

/** Terminalizes a failed Build, its Attempt, and its Run in one transaction. */
export function failCompositionBuildRun(input: {
  buildId: string;
  attemptId: string;
  error: Error;
}): BuildDto {
  return withImmediateTransaction((db) => {
    const scope = getBuildScope(db, input.buildId);
    if (!scope) throw new Error(`Build not found: ${input.buildId}`);
    if (scope.build.state !== "running" || !scope.build.runId) {
      throw new StoreConflictError("Build is terminal or not running");
    }
    const endedAt = Date.now();
    db.prepare("UPDATE builds SET state = 'failed', error = ?, ended_at = ? WHERE id = ? AND state = 'running'")
      .run(input.error.message.slice(0, 500), endedAt, scope.build.id);
    finishRunAttemptInTransaction(db, input.attemptId, { state: "failed", error: input.error });
    finishRunInTransaction(db, scope.build.runId, { state: "failed", error: input.error });
    appendBuildActivity(db, scope.revisionScope, scope.build.id, "build.failed", { state: "failed", failed: true }, endedAt);
    return toBuildDto(getBuildRow(db, scope.build.id)!);
  });
}

export function selectCompositionRevision(input: {
  compositionId: string;
  revisionId: string;
  expectedSelectedRevisionId: string | null;
}): CompositionDto {
  if (
    !Object.hasOwn(input, "expectedSelectedRevisionId") ||
    input.expectedSelectedRevisionId === undefined
  ) {
    throw new Error("Composition selection requires expectedSelectedRevisionId");
  }
  return withImmediateTransaction((db) => {
    const composition = getCompositionRow(db, input.compositionId);
    if (!composition) {
      throw new Error(`Composition not found: ${input.compositionId}`);
    }
    const revision = getRevisionRow(db, input.revisionId);
    if (!revision || revision.compositionId !== composition.id) {
      throw new Error(
        "Composition revision does not belong to the Composition",
      );
    }
    if (revision.state !== "sealed") {
      throw new Error("Only a sealed Composition revision may be selected");
    }
    const scope = projectScope(db, composition.projectId)!;
    const now = Date.now();
    const result = db
      .prepare(
        `UPDATE compositions
         SET selected_revision_id = ?, row_version = row_version + 1, updated_at = ?
         WHERE id = ? AND selected_revision_id IS ?`,
      )
      .run(
        revision.id,
        now,
        composition.id,
        input.expectedSelectedRevisionId,
      );
    if (!result.changes) {
      throw new StoreConflictError("Composition selection conflict");
    }
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: composition.projectId,
      entityType: "composition",
      entityId: composition.id,
      action: "composition.selected",
      payload: {
        fromRevisionId: input.expectedSelectedRevisionId,
        revisionId: revision.id,
      },
      createdAt: now,
    });
    return toCompositionDto(db, getCompositionRow(db, composition.id)!);
  });
}

export function startBuild(input: {
  compositionRevisionId: string;
  runId: string;
  profile: JsonValue;
}): BuildDto {
  const runId = checkedText(input.runId, "Build Run ID");
  const profile = canonicalJsonInput(input.profile, "Build profile");
  return withImmediateTransaction((db) => {
    const scope = getRevisionScope(db, input.compositionRevisionId);
    if (!scope) {
      throw new Error(
        `Composition Revision not found: ${input.compositionRevisionId}`,
      );
    }
    if (scope.revision.state !== "sealed") {
      throw new Error("A Build requires a sealed Composition revision");
    }
    assertExactProjectRun(db, runId, scope);
    const id = newDomainId("build");
    const startedAt = Date.now();
    db.prepare(
      `INSERT INTO builds
       (id, composition_revision_id, run_id, state, profile_json, created_at, started_at)
       VALUES (?, ?, ?, 'running', ?, ?, ?)`,
    ).run(
      id,
      scope.revision.id,
      runId,
      JSON.stringify(profile),
      startedAt,
      startedAt,
    );
    appendBuildActivity(db, scope, id, "build.started", {
      compositionRevisionId: scope.revision.id,
      runId,
    }, startedAt);
    return toBuildDto(getBuildRow(db, id)!);
  });
}

export function completeBuild(input: {
  buildId: string;
  outputs: Array<{
    artifactRevisionId: string;
    role?: string | null;
    position: number;
  }>;
}): BuildDto {
  const outputs = checkedBuildOutputs(input.outputs);
  const initial = getBuildScope(openDomainDb(), input.buildId);
  if (!initial) throw new Error(`Build not found: ${input.buildId}`);
  if (initial.build.state !== "running") {
    throw new StoreConflictError("Build is terminal or not running");
  }
  for (const output of outputs) {
    const artifact = artifactRevisionScope(
      openDomainDb(),
      output.artifactRevisionId,
    );
    if (!artifact) {
      throw new Error(
        `Artifact Revision not found: ${output.artifactRevisionId}`,
      );
    }
    assertBuildOutputArtifact(artifact, initial.revisionScope);
    resolveObjectPath(artifact.object);
  }

  return withImmediateTransaction((db) => {
    const scope = getBuildScope(db, input.buildId);
    if (!scope) throw new Error(`Build not found: ${input.buildId}`);
    if (scope.build.state !== "running") {
      throw new StoreConflictError("Build is terminal or not running");
    }
    const createdAt = Date.now();
    const insert = db.prepare(
      `INSERT INTO build_outputs
       (id, build_id, artifact_revision_id, role, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const output of outputs) {
      const artifact = artifactRevisionScope(db, output.artifactRevisionId);
      if (!artifact) {
        throw new Error(
          `Artifact Revision not found: ${output.artifactRevisionId}`,
        );
      }
      assertBuildOutputArtifact(artifact, scope.revisionScope);
      resolveObjectPath(artifact.object);
      insert.run(
        newDomainId("output"),
        scope.build.id,
        artifact.revisionId,
        output.role,
        output.position,
        createdAt,
      );
    }
    const result = db
      .prepare(
        `UPDATE builds SET state = 'succeeded', ended_at = ?, error = NULL
         WHERE id = ? AND state = 'running'`,
      )
      .run(createdAt, scope.build.id);
    if (!result.changes) {
      throw new StoreConflictError("Build is terminal or not running");
    }
    appendBuildActivity(db, scope.revisionScope, scope.build.id, "build.completed", {
      outputCount: outputs.length,
    }, createdAt);
    return toBuildDto(getBuildRow(db, scope.build.id)!);
  });
}

export function failBuild(
  buildId: string,
  input: { error?: string | null } = {},
): BuildDto {
  return finishBuild(buildId, "failed", input.error ?? null);
}

export function cancelBuild(
  buildId: string,
  input: { error?: string | null } = {},
): BuildDto {
  return finishBuild(buildId, "cancelled", input.error ?? null);
}

function finishBuild(
  buildId: string,
  state: "failed" | "cancelled",
  error: string | null,
): BuildDto {
  return withImmediateTransaction((db) => {
    const scope = getBuildScope(db, buildId);
    if (!scope) throw new Error(`Build not found: ${buildId}`);
    if (scope.build.state !== "running") {
      throw new StoreConflictError("Build is terminal or not running");
    }
    const endedAt = Date.now();
    const result = db
      .prepare(
        "UPDATE builds SET state = ?, ended_at = ?, error = ? WHERE id = ? AND state = 'running'",
      )
      .run(state, endedAt, error, scope.build.id);
    if (!result.changes) {
      throw new StoreConflictError("Build is terminal or not running");
    }
    appendBuildActivity(
      db,
      scope.revisionScope,
      scope.build.id,
      state === "failed" ? "build.failed" : "build.cancelled",
      { state, failed: error !== null },
      endedAt,
    );
    return toBuildDto(getBuildRow(db, scope.build.id)!);
  });
}

export function getComposition(input: {
  context: QueryContext;
  compositionId: string;
}): CompositionDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const composition = getVisibleCompositionDto(db, scope, input.compositionId);
  if (!composition) {
    throw new Error(`Composition not found: ${input.compositionId}`);
  }
  return composition;
}

export function listCompositions(input: {
  context: QueryContext;
  projectId: string;
  after?: string | null;
  limit: number;
}): Page<CompositionDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("c1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  assertVisibleProject(db, scope, input.projectId);
  const rows = db
    .query<CompositionDto, (string | number)[]>(
      `SELECT ${COMPOSITION_DTO_COLUMNS} FROM compositions composition
       WHERE composition.project_id = ?
         AND (composition.created_at > ? OR
              (composition.created_at = ? AND composition.id > ?))
       ORDER BY composition.created_at ASC, composition.id ASC LIMIT ?`,
    )
    .all(
      input.projectId,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getCompositionRevision(input: {
  context: QueryContext;
  revisionId: string;
}): CompositionRevisionDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const revision = getVisibleRevisionDto(db, scope, input.revisionId);
  if (!revision) {
    throw new Error(`Composition Revision not found: ${input.revisionId}`);
  }
  return revision;
}

export function listCompositionRevisions(input: {
  context: QueryContext;
  compositionId: string;
  after?: string | null;
  limit: number;
}): Page<CompositionRevisionDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("v1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleCompositionDto(db, scope, input.compositionId)) {
    throw new Error(`Composition not found: ${input.compositionId}`);
  }
  const rows = db
    .query<CompositionRevisionDto, (string | number)[]>(
      `SELECT ${REVISION_DTO_COLUMNS} FROM composition_revisions revision
       WHERE revision.composition_id = ?
         AND (revision.revision_no > ? OR
              (revision.revision_no = ? AND revision.id > ?))
       ORDER BY revision.revision_no ASC, revision.id ASC LIMIT ?`,
    )
    .all(
      input.compositionId,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  return buildPage(rows, input.limit, "v1", (row) => ({
    ordinal: row.revisionNo,
    id: row.id,
  }));
}

export function getCompositionSource(input: {
  context: QueryContext;
  sourceId: string;
}): CompositionSourceDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const source = getVisibleSourceDto(db, scope, input.sourceId);
  if (!source) throw new Error(`Composition Source not found: ${input.sourceId}`);
  return source;
}

export function listCompositionSources(input: {
  context: QueryContext;
  revisionId: string;
  after?: string | null;
  limit: number;
}): Page<CompositionSourceDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("p1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleRevisionDto(db, scope, input.revisionId)) {
    throw new Error(`Composition Revision not found: ${input.revisionId}`);
  }
  const rows = db
    .query<CompositionSourceDto, (string | number)[]>(
      `SELECT ${SOURCE_DTO_COLUMNS} FROM composition_revision_files source
       WHERE source.composition_revision_id = ?
         AND (source.position > ? OR
              (source.position = ? AND source.id > ?))
       ORDER BY source.position ASC, source.id ASC LIMIT ?`,
    )
    .all(
      input.revisionId,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  return buildPage(rows, input.limit, "p1", (row) => ({
    ordinal: row.position,
    id: row.id,
  }));
}

export function getCompositionInput(input: {
  context: QueryContext;
  inputId: string;
}): CompositionInputDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const compositionInput = getVisibleInputDto(db, scope, input.inputId);
  if (!compositionInput) {
    throw new Error(`Composition Input not found: ${input.inputId}`);
  }
  return compositionInput;
}

export function listCompositionInputs(input: {
  context: QueryContext;
  revisionId: string;
  after?: string | null;
  limit: number;
}): Page<CompositionInputDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("p1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleRevisionDto(db, scope, input.revisionId)) {
    throw new Error(`Composition Revision not found: ${input.revisionId}`);
  }
  const rows = db
    .query<CompositionInputDto, (string | number)[]>(
      `SELECT ${INPUT_DTO_COLUMNS} FROM composition_inputs input
       WHERE input.composition_revision_id = ?
         AND (input.position > ? OR (input.position = ? AND input.id > ?))
       ORDER BY input.position ASC, input.id ASC LIMIT ?`,
    )
    .all(
      input.revisionId,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  return buildPage(rows, input.limit, "p1", (row) => ({
    ordinal: row.position,
    id: row.id,
  }));
}

export function getBuild(input: {
  context: QueryContext;
  buildId: string;
}): BuildDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const build = getVisibleBuildDto(db, scope, input.buildId);
  if (!build) throw new Error(`Build not found: ${input.buildId}`);
  return build;
}

export function listBuilds(input: {
  context: QueryContext;
  compositionRevisionId: string;
  after?: string | null;
  limit: number;
}): Page<BuildDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("c1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleRevisionDto(db, scope, input.compositionRevisionId)) {
    throw new Error(
      `Composition Revision not found: ${input.compositionRevisionId}`,
    );
  }
  const rows = db
    .query<BuildDto, (string | number)[]>(
      `SELECT ${BUILD_DTO_COLUMNS} FROM builds build
       WHERE build.composition_revision_id = ?
         AND (build.created_at > ? OR
              (build.created_at = ? AND build.id > ?))
       ORDER BY build.created_at ASC, build.id ASC LIMIT ?`,
    )
    .all(
      input.compositionRevisionId,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getBuildOutput(input: {
  context: QueryContext;
  outputId: string;
}): BuildOutputDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const output = getVisibleOutputDto(db, scope, input.outputId);
  if (!output) throw new Error(`Build Output not found: ${input.outputId}`);
  return output;
}

export function listBuildOutputs(input: {
  context: QueryContext;
  buildId: string;
  after?: string | null;
  limit: number;
}): Page<BuildOutputDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("p1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleBuildDto(db, scope, input.buildId)) {
    throw new Error(`Build not found: ${input.buildId}`);
  }
  const rows = db
    .query<BuildOutputDto, (string | number)[]>(
      `SELECT ${OUTPUT_DTO_COLUMNS} FROM build_outputs output
       WHERE output.build_id = ?
         AND (output.position > ? OR (output.position = ? AND output.id > ?))
       ORDER BY output.position ASC, output.id ASC LIMIT ?`,
    )
    .all(
      input.buildId,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  return buildPage(rows, input.limit, "p1", (row) => ({
    ordinal: row.position,
    id: row.id,
  }));
}

function projectVisibility(
  scope: ResolvedScope,
): { sql: string; values: string[] } {
  return scope.projectId === null
    ? { sql: "project.workspace_id = ?", values: [scope.workspaceId] }
    : {
        sql: "project.id = ? AND project.workspace_id = ?",
        values: [scope.projectId, scope.workspaceId],
      };
}

function assertVisibleProject(
  db: Database,
  scope: ResolvedScope,
  projectId: string,
): void {
  const visibility = projectVisibility(scope);
  const visible = db
    .query<{ id: string }, string[]>(
      `SELECT project.id FROM projects project
       WHERE project.id = ? AND ${visibility.sql}`,
    )
    .get(projectId, ...visibility.values);
  if (!visible) throw new Error(`Project not found: ${projectId}`);
}

function getVisibleCompositionDto(
  db: Database,
  scope: ResolvedScope,
  compositionId: string,
): CompositionDto | null {
  const visibility = projectVisibility(scope);
  return db
    .query<CompositionDto, string[]>(
      `SELECT ${COMPOSITION_DTO_COLUMNS}
       FROM compositions composition
       JOIN projects project ON project.id = composition.project_id
       WHERE composition.id = ? AND ${visibility.sql}`,
    )
    .get(compositionId, ...visibility.values);
}

function getVisibleRevisionDto(
  db: Database,
  scope: ResolvedScope,
  revisionId: string,
): CompositionRevisionDto | null {
  const visibility = projectVisibility(scope);
  return db
    .query<CompositionRevisionDto, string[]>(
      `SELECT ${REVISION_DTO_COLUMNS}
       FROM composition_revisions revision
       JOIN compositions composition ON composition.id = revision.composition_id
       JOIN projects project ON project.id = composition.project_id
       WHERE revision.id = ? AND ${visibility.sql}`,
    )
    .get(revisionId, ...visibility.values);
}

function getVisibleSourceDto(
  db: Database,
  scope: ResolvedScope,
  sourceId: string,
): CompositionSourceDto | null {
  const visibility = projectVisibility(scope);
  return db
    .query<CompositionSourceDto, string[]>(
      `SELECT ${SOURCE_DTO_COLUMNS}
       FROM composition_revision_files source
       JOIN composition_revisions revision
         ON revision.id = source.composition_revision_id
       JOIN compositions composition ON composition.id = revision.composition_id
       JOIN projects project ON project.id = composition.project_id
       WHERE source.id = ? AND ${visibility.sql}`,
    )
    .get(sourceId, ...visibility.values);
}

function getVisibleInputDto(
  db: Database,
  scope: ResolvedScope,
  inputId: string,
): CompositionInputDto | null {
  const visibility = projectVisibility(scope);
  return db
    .query<CompositionInputDto, string[]>(
      `SELECT ${INPUT_DTO_COLUMNS}
       FROM composition_inputs input
       JOIN composition_revisions revision
         ON revision.id = input.composition_revision_id
       JOIN compositions composition ON composition.id = revision.composition_id
       JOIN projects project ON project.id = composition.project_id
       WHERE input.id = ? AND ${visibility.sql}`,
    )
    .get(inputId, ...visibility.values);
}

function getVisibleBuildDto(
  db: Database,
  scope: ResolvedScope,
  buildId: string,
): BuildDto | null {
  const visibility = projectVisibility(scope);
  return db
    .query<BuildDto, string[]>(
      `SELECT ${BUILD_DTO_COLUMNS}
       FROM builds build
       JOIN composition_revisions revision
         ON revision.id = build.composition_revision_id
       JOIN compositions composition ON composition.id = revision.composition_id
       JOIN projects project ON project.id = composition.project_id
       WHERE build.id = ? AND ${visibility.sql}`,
    )
    .get(buildId, ...visibility.values);
}

function getVisibleOutputDto(
  db: Database,
  scope: ResolvedScope,
  outputId: string,
): BuildOutputDto | null {
  const visibility = projectVisibility(scope);
  return db
    .query<BuildOutputDto, string[]>(
      `SELECT ${OUTPUT_DTO_COLUMNS}
       FROM build_outputs output
       JOIN builds build ON build.id = output.build_id
       JOIN composition_revisions revision
         ON revision.id = build.composition_revision_id
       JOIN compositions composition ON composition.id = revision.composition_id
       JOIN projects project ON project.id = composition.project_id
       WHERE output.id = ? AND ${visibility.sql}`,
    )
    .get(outputId, ...visibility.values);
}

function getBuildScope(
  db: Database,
  buildId: string,
): { build: BuildRow; revisionScope: RevisionScope } | null {
  const build = getBuildRow(db, buildId);
  if (!build) return null;
  const revisionScope = getRevisionScope(db, build.compositionRevisionId);
  if (!revisionScope) return null;
  return { build, revisionScope };
}

function assertExactProjectRun(
  db: Database,
  runId: string,
  scope: RevisionScope,
): void {
  const run = db
    .query<
      { workspaceId: string | null; projectId: string | null },
      [string]
    >(
      "SELECT workspace_id AS workspaceId, project_id AS projectId FROM runs WHERE id = ?",
    )
    .get(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (
    run.workspaceId !== scope.workspaceId ||
    run.projectId !== scope.composition.projectId
  ) {
    throw new Error("Build requires an exact same-Project Run");
  }
}

function assertBuildOutputArtifact(
  artifact: { workspaceId: string; projectId: string | null },
  scope: RevisionScope,
): void {
  if (
    artifact.workspaceId !== scope.workspaceId ||
    artifact.projectId !== scope.composition.projectId
  ) {
    throw new Error("Build output requires an exact Project Artifact revision");
  }
}

function checkedBuildOutputs(
  values: Array<{
    artifactRevisionId: string;
    role?: string | null;
    position: number;
  }>,
): Array<{
  artifactRevisionId: string;
  role: string | null;
  position: number;
}> {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Build requires at least one output");
  }
  const outputs = values
    .map((output) => ({
      artifactRevisionId: checkedText(
        output.artifactRevisionId,
        "Build output Artifact Revision ID",
      ),
      role: optionalText(output.role, "Build output role"),
      position: checkedPosition(output.position, "Build output position"),
    }))
    .sort((left, right) => left.position - right.position);
  for (let position = 0; position < outputs.length; position++) {
    if (outputs[position]!.position !== position) {
      throw new Error("Build output positions must be unique and contiguous");
    }
  }
  return outputs;
}

function appendBuildActivity(
  db: Database,
  scope: RevisionScope,
  buildId: string,
  action: string,
  payload: JsonValue,
  createdAt: number,
): void {
  appendActivity(db, {
    workspaceId: scope.workspaceId,
    projectId: scope.composition.projectId,
    entityType: "build",
    entityId: buildId,
    action,
    payload,
    createdAt,
  });
}

function latestRevision(
  db: Database,
  compositionId: string,
): CompositionRevisionRow | null {
  const row = db
    .query<CompositionRevisionDbRow, [string]>(
      `SELECT ${REVISION_COLUMNS} FROM composition_revisions
       WHERE composition_id = ? ORDER BY revision_no DESC, id DESC LIMIT 1`,
    )
    .get(compositionId);
  return row ? toRevisionRow(row) : null;
}

function cloneRevisionChildren(
  db: Database,
  parentId: string,
  revisionId: string,
  createdAt: number,
  expected?: {
    sources: readonly { logicalPath: string; objectId: string; position: number }[];
    inputs: readonly { artifactRevisionId: string; role: string; position: number; config: JsonValue | null }[];
  },
): void {
  const sources = db
    .query<CompositionSourceDbRow, [string]>(
      `SELECT ${SOURCE_COLUMNS} FROM composition_revision_files
       WHERE composition_revision_id = ?
       ORDER BY position ASC, logical_path ASC, id ASC`,
    )
    .all(parentId);
  const inputs = db
    .query<CompositionInputDbRow, [string]>(
      `SELECT ${INPUT_COLUMNS} FROM composition_inputs
       WHERE composition_revision_id = ? ORDER BY position ASC, id ASC`,
    )
    .all(parentId);
  const sourceMismatch = expected && (
    sources.length !== expected.sources.length || sources.some((source, index) => {
      const captured = expected.sources[index];
      return !captured || source.logical_path !== captured.logicalPath || source.object_id !== captured.objectId || source.position !== captured.position;
    })
  );
  const inputMismatch = expected && (
    inputs.length !== expected.inputs.length || inputs.some((item, index) => {
      const captured = expected.inputs[index];
      return !captured || item.artifact_revision_id !== captured.artifactRevisionId || item.role !== captured.role ||
        item.position !== captured.position || item.config_json !== serializeJson(canonicalOptionalJson(captured.config, "Composition input config"));
    })
  );
  if (sourceMismatch || inputMismatch) {
    throw new StoreConflictError("Composition parent children changed during checkout materialization");
  }
  const insertSource = db.prepare(
    `INSERT INTO composition_revision_files
     (id, composition_revision_id, logical_path, object_id, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const source of sources) {
    insertSource.run(
      newDomainId("cfile"),
      revisionId,
      source.logical_path,
      source.object_id,
      source.position,
      createdAt,
    );
  }
  const insertInput = db.prepare(
    `INSERT INTO composition_inputs
     (id, composition_revision_id, artifact_revision_id, role, position, config_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const item of inputs) {
    insertInput.run(
      newDomainId("input"),
      revisionId,
      item.artifact_revision_id,
      item.role,
      item.position,
      item.config_json,
      createdAt,
    );
  }
}

function requireDraftRevision(db: Database, id: string): RevisionScope {
  const scope = getRevisionScope(db, id);
  if (!scope) throw new Error(`Composition Revision not found: ${id}`);
  if (scope.revision.state !== "draft") {
    throw new Error(`Composition Revision is sealed: ${id}`);
  }
  return scope;
}

function getRevisionScope(db: Database, id: string): RevisionScope | null {
  const revision = getRevisionRow(db, id);
  if (!revision) return null;
  const composition = getCompositionRow(db, revision.compositionId);
  if (!composition) return null;
  const project = projectScope(db, composition.projectId);
  if (!project) return null;
  return { revision, composition, workspaceId: project.workspaceId };
}

function assertIterationProject(
  db: Database,
  iterationId: string | null,
  projectId: string,
): void {
  if (iterationId === null) return;
  const row = db
    .query<{ projectId: string }, [string]>(
      "SELECT project_id AS projectId FROM project_iterations WHERE id = ?",
    )
    .get(iterationId);
  if (!row || row.projectId !== projectId) {
    throw new Error("Iteration does not belong to the Composition Project");
  }
}

function assertSourcePositionAvailable(
  db: Database,
  revisionId: string,
  position: number,
  ownId: string | null,
): void {
  const row = db
    .query<{ id: string }, [string, number]>(
      `SELECT id FROM composition_revision_files
       WHERE composition_revision_id = ? AND position = ?`,
    )
    .get(revisionId, position);
  if (row && row.id !== ownId) {
    throw new StoreConflictError(
      `Composition source position already exists: ${position}`,
    );
  }
}

function appendRevisionActivity(
  db: Database,
  scope: RevisionScope,
  entityId: string,
  action: string,
  payload: JsonValue,
  createdAt = Date.now(),
): void {
  appendActivity(db, {
    workspaceId: scope.workspaceId,
    projectId: scope.composition.projectId,
    entityType: "composition_revision",
    entityId,
    action,
    payload,
    createdAt,
  });
}

function manifestForRevision(
  db: Database,
  revisionId: string,
  probeBytes: boolean,
): {
  sources: CompositionSourceRow[];
  inputs: CompositionInputRow[];
  manifest: JsonValue;
} {
  const scope = getRevisionScope(db, revisionId);
  if (!scope) {
    throw new Error(`Composition Revision not found: ${revisionId}`);
  }
  if (scope.revision.state !== "draft") {
    throw new Error(`Composition Revision is sealed: ${revisionId}`);
  }
  const sources = db
    .query<CompositionSourceDbRow, [string]>(
      `SELECT ${SOURCE_COLUMNS} FROM composition_revision_files
       WHERE composition_revision_id = ?
       ORDER BY position ASC, logical_path ASC, id ASC`,
    )
    .all(revisionId)
    .map(toSourceRow);
  const sourceManifest = sources.map((source) => {
    const object = getObjectRow(db, source.objectId);
    if (!object) throw new Error(`Object not found: ${source.objectId}`);
    assertObjectVisibleToProject(object, scope);
    if (probeBytes) resolveObjectPath(object);
    return {
      logicalPath: source.logicalPath,
      position: source.position,
      objectId: object.id,
      sha256: object.sha256,
    };
  });
  const inputs = db
    .query<CompositionInputDbRow, [string]>(
      `SELECT ${INPUT_COLUMNS} FROM composition_inputs
       WHERE composition_revision_id = ? ORDER BY position ASC, id ASC`,
    )
    .all(revisionId)
    .map(toInputRow);
  const inputManifest = inputs.map((input) => {
    const artifact = artifactRevisionScope(db, input.artifactRevisionId);
    if (!artifact) {
      throw new Error(`Artifact Revision not found: ${input.artifactRevisionId}`);
    }
    assertArtifactVisibleToProject(artifact, scope);
    if (probeBytes) resolveObjectPath(artifact.object);
    return {
      position: input.position,
      artifactRevisionId: input.artifactRevisionId,
      role: input.role,
      config: input.config,
    };
  });
  return {
    sources,
    inputs,
    manifest: canonicalJsonValue(
      {
        kind: scope.composition.kind,
        engine: scope.revision.engine,
        engineVersion: scope.revision.engineVersion,
        engineConfig: scope.revision.engineConfig,
        sources: sourceManifest,
        inputs: inputManifest,
      },
      false,
      new Set<object>(),
      "Composition manifest",
    ),
  };
}

function digestManifest(manifest: JsonValue): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function projectScope(
  db: Database,
  projectId: string,
): { workspaceId: string } | null {
  return db
    .query<{ workspaceId: string }, [string]>(
      "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
    )
    .get(projectId);
}

function getCompositionRow(db: Database, id: string): CompositionRow | null {
  const row = db
    .query<CompositionDbRow, [string]>(
      `SELECT ${COMPOSITION_COLUMNS} FROM compositions WHERE id = ?`,
    )
    .get(id);
  return row
    ? {
        id: row.id,
        projectId: row.project_id,
        slug: row.slug,
        kind: row.kind,
        selectedRevisionId: row.selected_revision_id,
        rowVersion: row.row_version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

function getRevisionRow(
  db: Database,
  id: string,
): CompositionRevisionRow | null {
  const row = db
    .query<CompositionRevisionDbRow, [string]>(
      `SELECT ${REVISION_COLUMNS} FROM composition_revisions WHERE id = ?`,
    )
    .get(id);
  return row ? toRevisionRow(row) : null;
}

function getSourceRow(db: Database, id: string): CompositionSourceRow | null {
  const row = db
    .query<CompositionSourceDbRow, [string]>(
      `SELECT ${SOURCE_COLUMNS} FROM composition_revision_files WHERE id = ?`,
    )
    .get(id);
  return row ? toSourceRow(row) : null;
}

function getInputRow(db: Database, id: string): CompositionInputRow | null {
  const row = db
    .query<CompositionInputDbRow, [string]>(
      `SELECT ${INPUT_COLUMNS} FROM composition_inputs WHERE id = ?`,
    )
    .get(id);
  return row ? toInputRow(row) : null;
}

function getBuildRow(db: Database, id: string): BuildRow | null {
  const row = db
    .query<BuildDbRow, [string]>(
      `SELECT ${BUILD_COLUMNS} FROM builds WHERE id = ?`,
    )
    .get(id);
  return row ? toBuildRow(row) : null;
}

function getObjectRow(db: Database, id: string): ObjectRow | null {
  const row = db
    .query<ObjectDbRow, [string]>(
      `SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?`,
    )
    .get(id);
  return row
    ? {
        id: row.id,
        workspaceId: row.workspace_id,
        projectId: row.project_id,
        backend: row.backend,
        bucket: row.bucket,
        key: row.key,
        sha256: row.sha256,
        mime: row.mime,
        bytes: row.bytes,
        storageClass: row.storage_class,
        originalName: row.original_name,
        metadata: parseJson(row.metadata_json),
        createdAt: row.created_at,
      }
    : null;
}

function artifactRevisionScope(
  db: Database,
  revisionId: string,
): {
  revisionId: string;
  workspaceId: string;
  projectId: string | null;
  object: ObjectRow;
} | null {
  const row = db
    .query<
      {
        revisionId: string;
        workspaceId: string;
        projectId: string | null;
        objectId: string;
      },
      [string]
    >(
      `SELECT r.id AS revisionId, a.workspace_id AS workspaceId,
              a.project_id AS projectId, r.object_id AS objectId
       FROM artifact_revisions r
       JOIN artifacts a ON a.id = r.artifact_id
       WHERE r.id = ?`,
    )
    .get(revisionId);
  if (!row) return null;
  const object = getObjectRow(db, row.objectId);
  if (!object) throw new Error(`Object not found: ${row.objectId}`);
  const backingVisible =
    object.workspaceId === row.workspaceId &&
    (row.projectId === null
      ? object.projectId === null
      : object.projectId === null || object.projectId === row.projectId);
  if (!backingVisible) {
    throw new Error("Artifact Revision Object is outside its Artifact scope");
  }
  return { ...row, object };
}

function assertObjectVisibleToProject(
  object: ObjectRow,
  scope: RevisionScope,
): void {
  if (
    object.workspaceId !== scope.workspaceId ||
    (object.projectId !== null &&
      object.projectId !== scope.composition.projectId)
  ) {
    throw new Error("Object is outside the Composition Project scope");
  }
}

function assertArtifactVisibleToProject(
  artifact: { workspaceId: string; projectId: string | null },
  scope: RevisionScope,
): void {
  if (
    artifact.workspaceId !== scope.workspaceId ||
    (artifact.projectId !== null &&
      artifact.projectId !== scope.composition.projectId)
  ) {
    throw new Error(
      "Artifact Revision is outside the Composition Project scope",
    );
  }
}

function toRevisionRow(row: CompositionRevisionDbRow): CompositionRevisionRow {
  return {
    id: row.id,
    compositionId: row.composition_id,
    revisionNo: row.revision_no,
    parentRevisionId: row.parent_revision_id,
    iterationId: row.iteration_id,
    state: row.state,
    engine: row.engine,
    engineVersion: row.engine_version,
    engineConfig: JSON.parse(row.engine_config_json) as JsonValue,
    manifestSha256: row.manifest_sha256,
    authoredBySessionId: row.authored_by_session_id,
    createdAt: row.created_at,
    sealedAt: row.sealed_at,
  };
}

function toSourceRow(row: CompositionSourceDbRow): CompositionSourceRow {
  return {
    id: row.id,
    compositionRevisionId: row.composition_revision_id,
    logicalPath: row.logical_path,
    objectId: row.object_id,
    position: row.position,
    createdAt: row.created_at,
  };
}

function toInputRow(row: CompositionInputDbRow): CompositionInputRow {
  return {
    id: row.id,
    compositionRevisionId: row.composition_revision_id,
    artifactRevisionId: row.artifact_revision_id,
    role: row.role,
    position: row.position,
    config: parseJson(row.config_json),
    createdAt: row.created_at,
  };
}

function toBuildRow(row: BuildDbRow): BuildRow {
  return {
    id: row.id,
    compositionRevisionId: row.composition_revision_id,
    runId: row.run_id,
    state: row.state,
    profile: JSON.parse(row.profile_json) as JsonValue,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function toCompositionDto(db: Database, row: CompositionRow): CompositionDto {
  return {
    id: row.id,
    projectId: row.projectId,
    slug: row.slug,
    kind: row.kind,
    latestRevisionId: latestRevision(db, row.id)?.id ?? null,
    selectedRevisionId: row.selectedRevisionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRevisionDto(row: CompositionRevisionRow): CompositionRevisionDto {
  return {
    id: row.id,
    compositionId: row.compositionId,
    revisionNo: row.revisionNo,
    parentRevisionId: row.parentRevisionId,
    iterationId: row.iterationId,
    state: row.state,
    engine: row.engine,
    engineVersion: row.engineVersion,
    authoredBySessionId: row.authoredBySessionId,
    createdAt: row.createdAt,
    sealedAt: row.sealedAt,
  };
}

function toSourceDto(row: CompositionSourceRow): CompositionSourceDto {
  return {
    id: row.id,
    compositionRevisionId: row.compositionRevisionId,
    objectId: row.objectId,
    position: row.position,
    createdAt: row.createdAt,
  };
}

function toInputDto(row: CompositionInputRow): CompositionInputDto {
  return {
    id: row.id,
    compositionRevisionId: row.compositionRevisionId,
    artifactRevisionId: row.artifactRevisionId,
    role: row.role,
    position: row.position,
    createdAt: row.createdAt,
  };
}

function toBuildDto(row: BuildRow): BuildDto {
  return {
    id: row.id,
    compositionRevisionId: row.compositionRevisionId,
    runId: row.runId,
    state: row.state,
    createdAt: row.createdAt,
    finishedAt: row.endedAt,
  };
}

function checkedText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must not be empty`);
  return trimmed;
}

function optionalText(
  value: string | null | undefined,
  label: string,
): string | null {
  return value == null ? null : checkedText(value, label);
}

function checkedEngine(value: string): string {
  const engine = checkedText(value, "Composition engine");
  if (!ENGINE_SLUG.test(engine)) {
    throw new Error("Composition engine must be a non-empty slug");
  }
  return engine;
}

function checkedPosition(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function checkedLogicalPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (
    !value ||
    value !== normalized ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    /^data:/i.test(value) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    normalized
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("Composition source logicalPath must be relative POSIX");
  }
  return value;
}

function canonicalOptionalJson(
  value: JsonValue | null | undefined,
  label: string,
): JsonValue | null {
  return value == null ? null : canonicalJsonInput(value, label);
}

function canonicalJsonInput(value: unknown, label: string): JsonValue {
  return canonicalJsonValue(value, false, new Set<object>(), label);
}

function canonicalJsonValue(
  value: unknown,
  binaryContext: boolean,
  seen: Set<object>,
  label: string,
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains a non-finite number`);
    }
    return value;
  }
  if (typeof value === "string") {
    if (DATA_URL.test(value)) throw new Error(`${label} contains a data URL`);
    if (binaryContext && isStrictBase64(value)) {
      throw new Error(`${label} contains base64 beneath a binary key`);
    }
    return value;
  }
  if (typeof value !== "object") throw new Error(`${label} must be JSON`);
  if (seen.has(value)) throw new Error(`${label} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) =>
        canonicalJsonValue(item, binaryContext, seen, label),
      );
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-JSON object`);
    }
    const result = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(value).sort()) {
      if (DATA_URL.test(key)) throw new Error(`${label} contains a data URL`);
      result[key] = canonicalJsonValue(
        (value as Record<string, unknown>)[key],
        binaryContext || BINARY_KEYS.has(key.toLowerCase()),
        seen,
        label,
      );
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function isStrictBase64(value: string): boolean {
  if (value.length < 2 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    return false;
  }
  const unpadded = value.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) return false;
  const normalized = unpadded.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("base64") === padded;
}

function parseJson(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}

function serializeJson(value: JsonValue | null): string | null {
  return value === null ? null : JSON.stringify(value);
}
