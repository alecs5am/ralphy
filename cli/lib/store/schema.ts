import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

export const SCHEMA_VERSION = 1;

export type Migration = {
  version: number;
  sql: string;
};

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE social_accounts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        external_id TEXT NOT NULL,
        display_name TEXT,
        username TEXT,
        config_json TEXT CHECK (config_json IS NULL OR json_valid(config_json)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (workspace_id, platform, external_id)
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'active',
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (workspace_id, slug)
      );

      CREATE TABLE project_iterations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        number INTEGER NOT NULL CHECK (number > 0),
        title TEXT NOT NULL,
        reason TEXT,
        state TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        closed_at INTEGER,
        UNIQUE (project_id, number)
      );

      CREATE TABLE feedback_items (
        id TEXT PRIMARY KEY,
        iteration_id TEXT NOT NULL REFERENCES project_iterations(id) ON DELETE CASCADE,
        target_type TEXT,
        target_id TEXT,
        timecode_ms INTEGER CHECK (timecode_ms IS NULL OR timecode_ms >= 0),
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
        resolution_note TEXT,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );

      CREATE TABLE feedback_resolution_links (
        id TEXT PRIMARY KEY,
        feedback_id TEXT NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (feedback_id, entity_type, entity_id)
      );

      CREATE TABLE project_stages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        stage TEXT NOT NULL,
        state TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
        updated_at INTEGER NOT NULL,
        UNIQUE (project_id, stage)
      );

      CREATE TABLE agent_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        agent TEXT NOT NULL,
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );

      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL CHECK (kind IN (
          'brief', 'style-guide', 'production-plan', 'scenario', 'storyboard',
          'research', 'postmortem', 'memory', 'note', 'custom'
        )),
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        current_revision_id TEXT REFERENCES document_revisions(id) ON DELETE RESTRICT,
        row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (workspace_id, project_id, slug)
      );

      CREATE TABLE document_revisions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
        revision_no INTEGER NOT NULL CHECK (revision_no > 0),
        parent_revision_id TEXT REFERENCES document_revisions(id) ON DELETE RESTRICT,
        iteration_id TEXT REFERENCES project_iterations(id) ON DELETE RESTRICT,
        format TEXT NOT NULL CHECK (format IN ('markdown', 'text', 'json')),
        title TEXT,
        body TEXT NOT NULL,
        content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
        authored_by_session_id TEXT REFERENCES agent_sessions(id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL,
        UNIQUE (document_id, revision_no)
      );

      CREATE VIRTUAL TABLE document_revisions_fts USING fts5(
        revision_id UNINDEXED,
        title,
        body
      );

      CREATE TABLE project_document_bindings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        document_revision_id TEXT NOT NULL REFERENCES document_revisions(id) ON DELETE RESTRICT,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (project_id, role)
      );

      CREATE TABLE objects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        backend TEXT NOT NULL CHECK (backend = 'local'),
        bucket TEXT NOT NULL CHECK (
          length(bucket) > 0
          AND substr(bucket, 1, 1) <> '/'
          AND substr(bucket, 1, 1) <> char(92)
          AND bucket NOT GLOB '[A-Za-z]:*'
          AND instr('/' || replace(bucket, char(92), '/') || '/', '/../') = 0
        ),
        key TEXT NOT NULL CHECK (
          length(key) > 0
          AND substr(key, 1, 1) <> '/'
          AND substr(key, 1, 1) <> char(92)
          AND key NOT GLOB '[A-Za-z]:*'
          AND instr('/' || replace(key, char(92), '/') || '/', '/../') = 0
          AND lower(key) NOT LIKE 'data:%'
        ),
        sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
        mime TEXT NOT NULL,
        bytes INTEGER NOT NULL CHECK (bytes > 0),
        storage_class TEXT NOT NULL,
        original_name TEXT,
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        created_at INTEGER NOT NULL,
        UNIQUE (bucket, key)
      );

      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        slug TEXT NOT NULL,
        kind TEXT NOT NULL,
        selected_revision_id TEXT REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (workspace_id, project_id, slug)
      );

      CREATE TABLE artifact_revisions (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
        object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
        revision_no INTEGER NOT NULL CHECK (revision_no > 0),
        parent_revision_id TEXT REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        iteration_id TEXT REFERENCES project_iterations(id) ON DELETE RESTRICT,
        state TEXT NOT NULL CHECK (state IN (
          'working', 'candidate', 'approved', 'rejected', 'superseded', 'archived'
        )),
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        authored_by_session_id TEXT REFERENCES agent_sessions(id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL,
        UNIQUE (artifact_id, revision_no)
      );

      CREATE TABLE artifact_relations (
        id TEXT PRIMARY KEY,
        from_revision_id TEXT NOT NULL REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        to_revision_id TEXT NOT NULL REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        relation TEXT NOT NULL,
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        created_at INTEGER NOT NULL,
        UNIQUE (from_revision_id, to_revision_id, relation)
      );

      CREATE TABLE artifact_usages (
        id TEXT PRIMARY KEY,
        artifact_revision_id TEXT NOT NULL REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        feedback_id TEXT REFERENCES feedback_items(id) ON DELETE RESTRICT,
        context_type TEXT,
        context_id TEXT,
        role TEXT NOT NULL,
        lifecycle TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE compositions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        slug TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (
          'video', 'carousel', 'sticker-pack', 'image', 'audio', 'document', 'custom'
        )),
        selected_revision_id TEXT REFERENCES composition_revisions(id) ON DELETE RESTRICT,
        row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (project_id, slug)
      );

      CREATE TABLE composition_revisions (
        id TEXT PRIMARY KEY,
        composition_id TEXT NOT NULL REFERENCES compositions(id) ON DELETE RESTRICT,
        revision_no INTEGER NOT NULL CHECK (revision_no > 0),
        parent_revision_id TEXT REFERENCES composition_revisions(id) ON DELETE RESTRICT,
        iteration_id TEXT REFERENCES project_iterations(id) ON DELETE RESTRICT,
        state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'sealed')),
        engine TEXT NOT NULL CHECK (length(engine) > 0),
        engine_version TEXT,
        engine_config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(engine_config_json)),
        manifest_sha256 TEXT CHECK (manifest_sha256 IS NULL OR length(manifest_sha256) = 64),
        authored_by_session_id TEXT REFERENCES agent_sessions(id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL,
        sealed_at INTEGER,
        CHECK (
          (state = 'draft' AND sealed_at IS NULL)
          OR (state = 'sealed' AND sealed_at IS NOT NULL AND manifest_sha256 IS NOT NULL)
        ),
        UNIQUE (composition_id, revision_no)
      );

      CREATE TABLE composition_revision_files (
        id TEXT PRIMARY KEY,
        composition_revision_id TEXT NOT NULL REFERENCES composition_revisions(id) ON DELETE CASCADE,
        logical_path TEXT NOT NULL CHECK (
          length(logical_path) > 0
          AND substr(logical_path, 1, 1) <> '/'
          AND substr(logical_path, 1, 1) <> char(92)
          AND logical_path NOT GLOB '[A-Za-z]:*'
          AND instr('/' || replace(logical_path, char(92), '/') || '/', '/../') = 0
        ),
        object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
        created_at INTEGER NOT NULL,
        UNIQUE (composition_revision_id, logical_path),
        UNIQUE (composition_revision_id, position)
      );

      CREATE TABLE composition_inputs (
        id TEXT PRIMARY KEY,
        composition_revision_id TEXT NOT NULL REFERENCES composition_revisions(id) ON DELETE CASCADE,
        artifact_revision_id TEXT NOT NULL REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        role TEXT NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0),
        config_json TEXT CHECK (config_json IS NULL OR json_valid(config_json)),
        created_at INTEGER NOT NULL,
        UNIQUE (composition_revision_id, position)
      );

      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        agent_session_id TEXT REFERENCES agent_sessions(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL,
        label TEXT,
        state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        ended_at INTEGER,
        error TEXT
      );

      CREATE TABLE run_attempts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
        attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
        provider TEXT,
        model TEXT,
        state TEXT NOT NULL,
        request_json TEXT CHECK (request_json IS NULL OR json_valid(request_json)),
        response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
        cost_usd REAL CHECK (cost_usd IS NULL OR cost_usd >= 0),
        error TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        UNIQUE (run_id, attempt_no)
      );

      CREATE TABLE run_objects (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
        object_id TEXT REFERENCES objects(id) ON DELETE RESTRICT,
        path TEXT NOT NULL CHECK (
          length(path) > 0
          AND substr(path, 1, 1) <> '/'
          AND substr(path, 1, 1) <> char(92)
          AND path NOT GLOB '[A-Za-z]:*'
          AND instr('/' || replace(path, char(92), '/') || '/', '/../') = 0
        ),
        purpose TEXT NOT NULL,
        state TEXT NOT NULL,
        retention TEXT NOT NULL,
        bytes INTEGER CHECK (bytes IS NULL OR bytes >= 0),
        sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        created_at INTEGER NOT NULL
      );

      CREATE TABLE builds (
        id TEXT PRIMARY KEY,
        composition_revision_id TEXT NOT NULL REFERENCES composition_revisions(id) ON DELETE RESTRICT,
        run_id TEXT REFERENCES runs(id) ON DELETE RESTRICT,
        state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
        profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
        error TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        ended_at INTEGER
      );

      CREATE TABLE build_outputs (
        id TEXT PRIMARY KEY,
        build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
        artifact_revision_id TEXT NOT NULL REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        role TEXT,
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at INTEGER NOT NULL,
        UNIQUE (build_id, position)
      );

      CREATE TABLE build_document_bindings (
        id TEXT PRIMARY KEY,
        build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
        document_revision_id TEXT NOT NULL REFERENCES document_revisions(id) ON DELETE RESTRICT,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (build_id, role)
      );

      CREATE TABLE evaluations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        artifact_revision_id TEXT REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        composition_revision_id TEXT REFERENCES composition_revisions(id) ON DELETE RESTRICT,
        build_id TEXT REFERENCES builds(id) ON DELETE RESTRICT,
        run_id TEXT REFERENCES runs(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL,
        verdict TEXT,
        score REAL,
        report_json TEXT NOT NULL CHECK (json_valid(report_json)),
        created_at INTEGER NOT NULL
      );

      CREATE TABLE units (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        slug TEXT NOT NULL,
        format TEXT NOT NULL,
        current_revision_id TEXT REFERENCES unit_revisions(id) ON DELETE RESTRICT,
        row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (project_id, slug)
      );

      CREATE TABLE unit_revisions (
        id TEXT PRIMARY KEY,
        unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
        revision_no INTEGER NOT NULL CHECK (revision_no > 0),
        parent_revision_id TEXT REFERENCES unit_revisions(id) ON DELETE RESTRICT,
        iteration_id TEXT REFERENCES project_iterations(id) ON DELETE RESTRICT,
        note TEXT,
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        authored_by_session_id TEXT REFERENCES agent_sessions(id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL,
        UNIQUE (unit_id, revision_no)
      );

      CREATE TABLE unit_items (
        id TEXT PRIMARY KEY,
        unit_revision_id TEXT NOT NULL REFERENCES unit_revisions(id) ON DELETE CASCADE,
        artifact_revision_id TEXT REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        document_revision_id TEXT REFERENCES document_revisions(id) ON DELETE RESTRICT,
        role TEXT NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0),
        config_json TEXT CHECK (config_json IS NULL OR json_valid(config_json)),
        created_at INTEGER NOT NULL,
        CHECK (
          (artifact_revision_id IS NOT NULL) + (document_revision_id IS NOT NULL) = 1
        ),
        UNIQUE (unit_revision_id, position)
      );

      CREATE TABLE unit_presentations (
        id TEXT PRIMARY KEY,
        unit_revision_id TEXT NOT NULL REFERENCES unit_revisions(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        caption TEXT,
        cover_artifact_revision_id TEXT REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        crop_json TEXT CHECK (crop_json IS NULL OR json_valid(crop_json)),
        safe_area_json TEXT CHECK (safe_area_json IS NULL OR json_valid(safe_area_json)),
        options_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_json)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (unit_revision_id, platform)
      );

      CREATE TABLE presentation_items (
        id TEXT PRIMARY KEY,
        presentation_id TEXT NOT NULL REFERENCES unit_presentations(id) ON DELETE CASCADE,
        unit_item_id TEXT NOT NULL REFERENCES unit_items(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL CHECK (position >= 0),
        config_json TEXT CHECK (config_json IS NULL OR json_valid(config_json)),
        UNIQUE (presentation_id, position)
      );

      CREATE TABLE publications (
        id TEXT PRIMARY KEY,
        presentation_id TEXT NOT NULL REFERENCES unit_presentations(id) ON DELETE RESTRICT,
        social_account_id TEXT REFERENCES social_accounts(id) ON DELETE RESTRICT,
        run_id TEXT REFERENCES runs(id) ON DELETE RESTRICT,
        provider TEXT NOT NULL,
        provider_id TEXT,
        state TEXT NOT NULL CHECK (state IN (
          'draft', 'scheduled', 'submitted', 'published', 'failed', 'cancelled'
        )),
        url TEXT,
        scheduled_at INTEGER,
        published_at INTEGER,
        error TEXT,
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE metric_snapshots (
        id TEXT PRIMARY KEY,
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE RESTRICT,
        captured_at INTEGER NOT NULL,
        views INTEGER CHECK (views IS NULL OR views >= 0),
        likes INTEGER CHECK (likes IS NULL OR likes >= 0),
        comments INTEGER CHECK (comments IS NULL OR comments >= 0),
        shares INTEGER CHECK (shares IS NULL OR shares >= 0),
        watch_time_ms INTEGER CHECK (watch_time_ms IS NULL OR watch_time_ms >= 0),
        raw_json TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
        created_at INTEGER NOT NULL
      );

      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT REFERENCES runs(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
          'pending', 'blocked', 'running', 'completed', 'failed', 'cancelled'
        )),
        command TEXT NOT NULL CHECK (json_valid(command)),
        depends_on TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(depends_on)),
        priority INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        ended_at INTEGER,
        exit_code INTEGER,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
        log_path TEXT,
        tag TEXT,
        project_id TEXT
      );

      CREATE TABLE job_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        ts INTEGER NOT NULL,
        stream TEXT NOT NULL CHECK (stream IN ('stdout', 'stderr', 'system')),
        line TEXT NOT NULL
      );

      CREATE TABLE job_artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        object_id TEXT REFERENCES objects(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        bytes INTEGER CHECK (bytes IS NULL OR bytes >= 0),
        sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64)
      );

      CREATE TABLE activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
        created_at INTEGER NOT NULL
      );

      CREATE TABLE storage_transfers (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL,
        state TEXT NOT NULL,
        source_bucket TEXT NOT NULL,
        destination_bucket TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE storage_transfer_entries (
        id TEXT PRIMARY KEY,
        transfer_id TEXT NOT NULL REFERENCES storage_transfers(id) ON DELETE CASCADE,
        object_id TEXT REFERENCES objects(id) ON DELETE RESTRICT,
        source_key TEXT NOT NULL,
        destination_key TEXT NOT NULL,
        bytes INTEGER CHECK (bytes IS NULL OR bytes >= 0),
        sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
        state TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX idx_social_accounts_workspace ON social_accounts(workspace_id);
      CREATE INDEX idx_projects_workspace ON projects(workspace_id);
      CREATE INDEX idx_iterations_project ON project_iterations(project_id, number);
      CREATE INDEX idx_feedback_iteration ON feedback_items(iteration_id, status);
      CREATE UNIQUE INDEX idx_documents_workspace_slug
        ON documents(workspace_id, slug) WHERE project_id IS NULL;
      CREATE INDEX idx_documents_scope ON documents(workspace_id, project_id, kind);
      CREATE INDEX idx_document_revisions_document ON document_revisions(document_id, revision_no);
      CREATE INDEX idx_objects_scope ON objects(workspace_id, project_id, storage_class);
      CREATE INDEX idx_objects_sha256 ON objects(sha256);
      CREATE UNIQUE INDEX idx_artifacts_workspace_slug
        ON artifacts(workspace_id, slug) WHERE project_id IS NULL;
      CREATE INDEX idx_artifacts_scope ON artifacts(workspace_id, project_id, kind);
      CREATE INDEX idx_artifact_revisions_artifact ON artifact_revisions(artifact_id, revision_no);
      CREATE INDEX idx_compositions_project ON compositions(project_id);
      CREATE INDEX idx_composition_revisions_composition ON composition_revisions(composition_id, revision_no);
      CREATE INDEX idx_builds_revision ON builds(composition_revision_id, created_at);
      CREATE INDEX idx_units_project ON units(project_id);
      CREATE INDEX idx_unit_revisions_unit ON unit_revisions(unit_id, revision_no);
      CREATE INDEX idx_publications_presentation ON publications(presentation_id, created_at);
      CREATE INDEX idx_metric_snapshots_publication ON metric_snapshots(publication_id, captured_at);
      CREATE INDEX idx_runs_project ON runs(project_id, created_at);
      CREATE INDEX idx_run_attempts_run ON run_attempts(run_id, attempt_no);
      CREATE INDEX idx_run_objects_run ON run_objects(run_id, created_at);
      CREATE INDEX idx_jobs_status ON jobs(status);
      CREATE INDEX idx_jobs_tag ON jobs(tag);
      CREATE INDEX idx_jobs_project ON jobs(project_id);
      CREATE INDEX idx_job_logs_job_id ON job_logs(job_id);
      CREATE INDEX idx_job_logs_ts ON job_logs(ts);
      CREATE INDEX idx_job_artifacts_job_id ON job_artifacts(job_id);
      CREATE INDEX idx_activity_workspace_id ON activity_events(workspace_id, id);
      CREATE INDEX idx_activity_project_id ON activity_events(project_id, id);
      CREATE INDEX idx_storage_transfer_entries_transfer ON storage_transfer_entries(transfer_id);

      CREATE TRIGGER document_revisions_no_update
      BEFORE UPDATE ON document_revisions
      BEGIN
        SELECT RAISE(ABORT, 'document revisions are immutable');
      END;

      CREATE TRIGGER document_revisions_no_delete
      BEFORE DELETE ON document_revisions
      BEGIN
        SELECT RAISE(ABORT, 'document revisions are immutable');
      END;

      CREATE TRIGGER artifact_revisions_no_update
      BEFORE UPDATE ON artifact_revisions
      BEGIN
        SELECT RAISE(ABORT, 'artifact revisions are immutable');
      END;

      CREATE TRIGGER artifact_revisions_no_delete
      BEFORE DELETE ON artifact_revisions
      BEGIN
        SELECT RAISE(ABORT, 'artifact revisions are immutable');
      END;

      CREATE TRIGGER unit_revisions_no_update
      BEFORE UPDATE ON unit_revisions
      BEGIN
        SELECT RAISE(ABORT, 'unit revisions are immutable');
      END;

      CREATE TRIGGER unit_revisions_no_delete
      BEFORE DELETE ON unit_revisions
      BEGIN
        SELECT RAISE(ABORT, 'unit revisions are immutable');
      END;

      CREATE TRIGGER composition_revisions_update_guard
      BEFORE UPDATE ON composition_revisions
      WHEN NOT (
        OLD.state = 'draft'
        AND NEW.state = 'sealed'
        AND NEW.id IS OLD.id
        AND NEW.composition_id IS OLD.composition_id
        AND NEW.revision_no IS OLD.revision_no
        AND NEW.parent_revision_id IS OLD.parent_revision_id
        AND NEW.iteration_id IS OLD.iteration_id
        AND NEW.engine IS OLD.engine
        AND NEW.engine_version IS OLD.engine_version
        AND NEW.engine_config_json IS OLD.engine_config_json
        AND NEW.authored_by_session_id IS OLD.authored_by_session_id
        AND NEW.created_at IS OLD.created_at
        AND NEW.sealed_at IS NOT NULL
        AND NEW.manifest_sha256 IS NOT NULL
      )
      BEGIN
        SELECT RAISE(ABORT, 'composition revisions allow only draft to sealed');
      END;

      CREATE TRIGGER composition_revisions_no_delete
      BEFORE DELETE ON composition_revisions
      BEGIN
        SELECT RAISE(ABORT, 'composition revisions are immutable');
      END;

      CREATE TRIGGER composition_files_no_insert_when_sealed
      BEFORE INSERT ON composition_revision_files
      WHEN (SELECT state FROM composition_revisions WHERE id = NEW.composition_revision_id) = 'sealed'
      BEGIN
        SELECT RAISE(ABORT, 'sealed composition children are immutable');
      END;

      CREATE TRIGGER composition_files_no_update_when_sealed
      BEFORE UPDATE ON composition_revision_files
      WHEN (SELECT state FROM composition_revisions WHERE id = OLD.composition_revision_id) = 'sealed'
        OR (SELECT state FROM composition_revisions WHERE id = NEW.composition_revision_id) = 'sealed'
      BEGIN
        SELECT RAISE(ABORT, 'sealed composition children are immutable');
      END;

      CREATE TRIGGER composition_files_no_delete_when_sealed
      BEFORE DELETE ON composition_revision_files
      WHEN (SELECT state FROM composition_revisions WHERE id = OLD.composition_revision_id) = 'sealed'
      BEGIN
        SELECT RAISE(ABORT, 'sealed composition children are immutable');
      END;

      CREATE TRIGGER composition_inputs_no_insert_when_sealed
      BEFORE INSERT ON composition_inputs
      WHEN (SELECT state FROM composition_revisions WHERE id = NEW.composition_revision_id) = 'sealed'
      BEGIN
        SELECT RAISE(ABORT, 'sealed composition children are immutable');
      END;

      CREATE TRIGGER composition_inputs_no_update_when_sealed
      BEFORE UPDATE ON composition_inputs
      WHEN (SELECT state FROM composition_revisions WHERE id = OLD.composition_revision_id) = 'sealed'
        OR (SELECT state FROM composition_revisions WHERE id = NEW.composition_revision_id) = 'sealed'
      BEGIN
        SELECT RAISE(ABORT, 'sealed composition children are immutable');
      END;

      CREATE TRIGGER composition_inputs_no_delete_when_sealed
      BEFORE DELETE ON composition_inputs
      WHEN (SELECT state FROM composition_revisions WHERE id = OLD.composition_revision_id) = 'sealed'
      BEGIN
        SELECT RAISE(ABORT, 'sealed composition children are immutable');
      END;

      CREATE TRIGGER activity_events_no_update
      BEFORE UPDATE ON activity_events
      BEGIN
        SELECT RAISE(ABORT, 'activity events are append-only');
      END;

      CREATE TRIGGER activity_events_no_delete
      BEFORE DELETE ON activity_events
      BEGIN
        SELECT RAISE(ABORT, 'activity events are append-only');
      END;
    `,
  },
];

export function applyMigrations(
  db: Database,
  options: { beforeVersion?: (version: number) => void } = {},
): void {
  const current = readUserVersion(db);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${current} is newer than supported version ${SCHEMA_VERSION}`,
    );
  }

  const pending = MIGRATIONS.filter((migration) => migration.version > current);
  if (pending.length === 0) return;
  assertOrderedMigrations(current, pending);

  if (databaseHasUserTables(db)) backupDatabase(db, current);

  db.exec("BEGIN EXCLUSIVE");
  try {
    for (const migration of pending) {
      options.beforeVersion?.(migration.version);
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      ).run(migration.version, Date.now());
      db.exec(`PRAGMA user_version = ${migration.version}`);
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the original migration error if SQLite already ended the transaction.
    }
    throw error;
  }
}

function readUserVersion(db: Database): number {
  return (
    db.query<{ user_version: number }, []>("PRAGMA user_version").get()
      ?.user_version ?? 0
  );
}

function assertOrderedMigrations(
  current: number,
  pending: readonly Migration[],
): void {
  let expected = current + 1;
  for (const migration of pending) {
    if (migration.version !== expected) {
      throw new Error(
        `Expected schema migration ${expected}, found ${migration.version}`,
      );
    }
    expected++;
  }
}

function databaseHasUserTables(db: Database): boolean {
  const row = db
    .query<
      { count: number },
      []
    >("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .get();
  return (row?.count ?? 0) > 0;
}

function backupDatabase(db: Database, version: number): void {
  if (!db.filename || db.filename === ":memory:") return;

  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const backupDir = path.join(
    path.dirname(path.resolve(db.filename)),
    "backups",
  );
  fs.mkdirSync(backupDir, { recursive: true });
  let timestamp = Date.now();
  let backupPath = path.join(
    backupDir,
    `ralphy-schema-${version}-${timestamp}.db`,
  );
  while (fs.existsSync(backupPath)) {
    backupPath = path.join(
      backupDir,
      `ralphy-schema-${version}-${++timestamp}.db`,
    );
  }

  db.prepare("VACUUM INTO ?").run(backupPath);
  const backup = new Database(backupPath, { readonly: true });
  try {
    const result = backup
      .query<{ integrity_check: string }, []>("PRAGMA integrity_check")
      .get()?.integrity_check;
    if (result !== "ok")
      throw new Error(`Database backup integrity check failed: ${result}`);
  } finally {
    backup.close();
  }
}
