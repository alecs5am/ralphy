import type { Database } from "bun:sqlite";
import { openDomainDb } from "../../cli/lib/store/db.js";
import type {
  BuildAggregate,
  BuildDocumentBindingRow,
  BuildOutputRow,
  BuildRow,
  CompositionAggregate,
  CompositionInputRow,
  CompositionRevisionAggregate,
  CompositionRevisionRow,
  CompositionRow,
  CompositionSourceRow,
} from "../../cli/lib/store/internal-types.js";
import type {
  BuildState,
  CompositionKind,
  CompositionRevisionState,
  JsonValue,
} from "../../cli/lib/store/types.js";

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

type RevisionDbRow = {
  id: string;
  composition_id: string;
  revision_no: number;
  parent_revision_id: string | null;
  iteration_id: string | null;
  state: CompositionRevisionState;
  engine: string;
  engine_version: string | null;
  engine_config_json: string;
  manifest_sha256: string | null;
  authored_by_session_id: string | null;
  created_at: number;
  sealed_at: number | null;
};

type SourceDbRow = {
  id: string;
  composition_revision_id: string;
  logical_path: string;
  object_id: string;
  position: number;
  created_at: number;
};

type InputDbRow = {
  id: string;
  composition_revision_id: string;
  artifact_revision_id: string;
  role: string;
  position: number;
  config_json: string | null;
  created_at: number;
};

type BuildDbRow = {
  id: string;
  composition_revision_id: string;
  run_id: string | null;
  state: BuildState;
  profile_json: string;
  error: string | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
};

type OutputDbRow = {
  id: string;
  build_id: string;
  artifact_revision_id: string;
  role: string | null;
  position: number;
  created_at: number;
};

type BindingDbRow = {
  id: string;
  build_id: string;
  document_revision_id: string;
  role: string;
  created_at: number;
};

export function getCompositionAggregate(id: string): CompositionAggregate {
  const db = openDomainDb();
  return db.transaction(() => {
    const row = db
      .query<CompositionDbRow, [string]>(
        `SELECT id, project_id, slug, kind, selected_revision_id, row_version,
                created_at, updated_at FROM compositions WHERE id = ?`,
      )
      .get(id);
    if (!row) throw new Error(`Composition not found: ${id}`);
    const composition: CompositionRow = {
      id: row.id,
      projectId: row.project_id,
      slug: row.slug,
      kind: row.kind,
      selectedRevisionId: row.selected_revision_id,
      rowVersion: row.row_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    const revisions = db
      .query<RevisionDbRow, [string]>(
        `SELECT id, composition_id, revision_no, parent_revision_id,
                iteration_id, state, engine, engine_version,
                engine_config_json, manifest_sha256, authored_by_session_id,
                created_at, sealed_at
         FROM composition_revisions WHERE composition_id = ?
         ORDER BY revision_no ASC, id ASC`,
      )
      .all(id)
      .map((revision) => revisionAggregate(db, revision));
    return { ...composition, revisions };
  })();
}

function revisionAggregate(
  db: Database,
  row: RevisionDbRow,
): CompositionRevisionAggregate {
  const revision: CompositionRevisionRow = {
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
  const sources = db
    .query<SourceDbRow, [string]>(
      `SELECT id, composition_revision_id, logical_path, object_id, position,
              created_at FROM composition_revision_files
       WHERE composition_revision_id = ? ORDER BY position ASC, id ASC`,
    )
    .all(row.id)
    .map<CompositionSourceRow>((source) => ({
      id: source.id,
      compositionRevisionId: source.composition_revision_id,
      logicalPath: source.logical_path,
      objectId: source.object_id,
      position: source.position,
      createdAt: source.created_at,
    }));
  const inputs = db
    .query<InputDbRow, [string]>(
      `SELECT id, composition_revision_id, artifact_revision_id, role,
              position, config_json, created_at FROM composition_inputs
       WHERE composition_revision_id = ? ORDER BY position ASC, id ASC`,
    )
    .all(row.id)
    .map<CompositionInputRow>((input) => ({
      id: input.id,
      compositionRevisionId: input.composition_revision_id,
      artifactRevisionId: input.artifact_revision_id,
      role: input.role,
      position: input.position,
      config: parseJson(input.config_json),
      createdAt: input.created_at,
    }));
  return { ...revision, sources, inputs, builds: listBuilds(db, row.id) };
}

function listBuilds(db: Database, revisionId: string): BuildAggregate[] {
  return db
    .query<BuildDbRow, [string]>(
      `SELECT id, composition_revision_id, run_id, state, profile_json, error,
              created_at, started_at, ended_at FROM builds
       WHERE composition_revision_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(revisionId)
    .map((row) => {
      const build: BuildRow = {
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
      const outputs = db
        .query<OutputDbRow, [string]>(
          `SELECT id, build_id, artifact_revision_id, role, position, created_at
           FROM build_outputs WHERE build_id = ? ORDER BY position ASC, id ASC`,
        )
        .all(row.id)
        .map<BuildOutputRow>((output) => ({
          id: output.id,
          buildId: output.build_id,
          artifactRevisionId: output.artifact_revision_id,
          role: output.role,
          position: output.position,
          createdAt: output.created_at,
        }));
      const documentBindings = db
        .query<BindingDbRow, [string]>(
          `SELECT id, build_id, document_revision_id, role, created_at
           FROM build_document_bindings WHERE build_id = ?
           ORDER BY created_at ASC, id ASC`,
        )
        .all(row.id)
        .map<BuildDocumentBindingRow>((binding) => ({
          id: binding.id,
          buildId: binding.build_id,
          documentRevisionId: binding.document_revision_id,
          role: binding.role,
          createdAt: binding.created_at,
        }));
      return { ...build, outputs, documentBindings };
    });
}

function parseJson(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}
