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

      CREATE TABLE store_metadata (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        store_id TEXT NOT NULL UNIQUE CHECK (
          length(store_id) = 38 AND substr(store_id, 1, 6) = 'store_'
        )
      );

      INSERT INTO store_metadata (singleton, store_id)
      VALUES (1, 'store_' || lower(hex(randomblob(16))));

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
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        agent TEXT NOT NULL CHECK (length(trim(agent)) > 0),
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        started_at INTEGER NOT NULL,
        ended_at INTEGER CHECK (ended_at IS NULL OR ended_at >= started_at)
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

      CREATE TABLE run_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL CHECK (position >= 0),
        entity_type TEXT NOT NULL CHECK (entity_type IN (
          'document_revision', 'artifact_revision', 'composition_revision',
          'build', 'build_output', 'unit_revision', 'unit_item',
          'unit_presentation', 'publication', 'metric_snapshot'
        )),
        entity_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (run_id, position),
        UNIQUE (run_id, entity_type, entity_id)
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
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        artifact_revision_id TEXT REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        composition_revision_id TEXT REFERENCES composition_revisions(id) ON DELETE RESTRICT,
        build_id TEXT REFERENCES builds(id) ON DELETE RESTRICT,
        run_id TEXT REFERENCES runs(id) ON DELETE RESTRICT,
        authored_by_session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL CHECK (length(trim(kind)) > 0),
        verdict TEXT,
        favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
        rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
        tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
        note TEXT,
        report_json TEXT NOT NULL CHECK (json_valid(report_json)),
        created_at INTEGER NOT NULL,
        CHECK (
          (artifact_revision_id IS NOT NULL)
          + (composition_revision_id IS NOT NULL)
          + (build_id IS NOT NULL)
          + (run_id IS NOT NULL) = 1
        )
      );

      CREATE TABLE units (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
        slug TEXT NOT NULL CHECK (
          length(slug) > 0
          AND slug = lower(slug)
          AND slug NOT GLOB '*[^a-z0-9-]*'
          AND substr(slug, 1, 1) GLOB '[a-z0-9]'
          AND substr(slug, -1, 1) GLOB '[a-z0-9]'
          AND instr(slug, '--') = 0
        ),
        format TEXT NOT NULL CHECK (
          length(format) > 0
          AND format = lower(format)
          AND format NOT GLOB '*[^a-z0-9-]*'
          AND substr(format, 1, 1) GLOB '[a-z0-9]'
          AND substr(format, -1, 1) GLOB '[a-z0-9]'
          AND instr(format, '--') = 0
        ),
        latest_revision_id TEXT REFERENCES unit_revisions(id) ON DELETE RESTRICT,
        selected_revision_id TEXT REFERENCES unit_revisions(id) ON DELETE RESTRICT,
        row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
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
        sealed_at INTEGER,
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
        platform TEXT NOT NULL CHECK (
          length(platform) > 0
          AND platform = lower(platform)
          AND platform NOT GLOB '*[^a-z0-9-]*'
          AND substr(platform, 1, 1) GLOB '[a-z0-9]'
          AND substr(platform, -1, 1) GLOB '[a-z0-9]'
          AND instr(platform, '--') = 0
          AND platform NOT IN ('reels', 'shorts')
        ),
        position INTEGER NOT NULL CHECK (position >= 0),
        effective_caption_revision_id TEXT REFERENCES presentation_caption_revisions(id) ON DELETE RESTRICT,
        cover_artifact_revision_id TEXT REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
        crop_json TEXT CHECK (crop_json IS NULL OR json_valid(crop_json)),
        safe_area_json TEXT CHECK (safe_area_json IS NULL OR json_valid(safe_area_json)),
        options_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_json)),
        created_at INTEGER NOT NULL,
        UNIQUE (unit_revision_id, platform),
        UNIQUE (unit_revision_id, position)
      );

      CREATE TABLE presentation_caption_revisions (
        id TEXT PRIMARY KEY,
        presentation_id TEXT NOT NULL REFERENCES unit_presentations(id) ON DELETE CASCADE,
        revision_no INTEGER NOT NULL CHECK (revision_no > 0),
        parent_revision_id TEXT REFERENCES presentation_caption_revisions(id) ON DELETE RESTRICT,
        state TEXT NOT NULL CHECK (state IN (
          'draft', 'humanized', 'auto-draft-archived', 'final'
        )),
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (presentation_id, revision_no)
      );

      CREATE TABLE presentation_items (
        id TEXT PRIMARY KEY,
        presentation_id TEXT NOT NULL REFERENCES unit_presentations(id) ON DELETE CASCADE,
        unit_item_id TEXT NOT NULL REFERENCES unit_items(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL CHECK (position >= 0),
        config_json TEXT CHECK (config_json IS NULL OR json_valid(config_json)),
        created_at INTEGER NOT NULL,
        UNIQUE (presentation_id, position),
        UNIQUE (presentation_id, unit_item_id)
      );

      CREATE TABLE publications (
        id TEXT PRIMARY KEY,
        presentation_id TEXT NOT NULL REFERENCES unit_presentations(id) ON DELETE RESTRICT,
        effective_caption_revision_id TEXT REFERENCES presentation_caption_revisions(id) ON DELETE RESTRICT,
        effective_options_json TEXT NOT NULL CHECK (json_valid(effective_options_json)),
        social_account_id TEXT REFERENCES social_accounts(id) ON DELETE RESTRICT,
        submission_run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE RESTRICT,
        active_claim_run_id TEXT UNIQUE REFERENCES runs(id) ON DELETE RESTRICT,
        revised_from_publication_id TEXT REFERENCES publications(id) ON DELETE RESTRICT,
        rail TEXT NOT NULL CHECK (rail IN (
          'postiz', 'github-pages', 'devto', 'hashnode', 'manual'
        )),
        provider_publication_id TEXT,
        state TEXT NOT NULL CHECK (state IN (
          'draft', 'submitting', 'scheduled', 'submitted', 'published',
          'failed', 'cancelled', 'reconciliation_required', 'unknown'
        )),
        url TEXT CHECK (
          url IS NULL OR (
            length(url) BETWEEN 1 AND 2048
            AND (
              (
                lower(substr(url, 1, 7)) = 'http://'
                AND length(
                  substr(
                    substr(url, 8),
                    1,
                    min(
                      instr(substr(url, 8) || '/', '/'),
                      instr(substr(url, 8) || '?', '?'),
                      instr(substr(url, 8) || '#', '#')
                    ) - 1
                  )
                ) > 0
                AND instr(
                  substr(
                    substr(url, 8),
                    1,
                    min(
                      instr(substr(url, 8) || '/', '/'),
                      instr(substr(url, 8) || '?', '?'),
                      instr(substr(url, 8) || '#', '#')
                    ) - 1
                  ),
                  '@'
                ) = 0
              )
              OR (
                lower(substr(url, 1, 8)) = 'https://'
                AND length(
                  substr(
                    substr(url, 9),
                    1,
                    min(
                      instr(substr(url, 9) || '/', '/'),
                      instr(substr(url, 9) || '?', '?'),
                      instr(substr(url, 9) || '#', '#')
                    ) - 1
                  )
                ) > 0
                AND instr(
                  substr(
                    substr(url, 9),
                    1,
                    min(
                      instr(substr(url, 9) || '/', '/'),
                      instr(substr(url, 9) || '?', '?'),
                      instr(substr(url, 9) || '#', '#')
                    ) - 1
                  ),
                  '@'
                ) = 0
              )
            )
            AND instr(url, char(9)) = 0
            AND instr(url, char(10)) = 0
            AND instr(url, char(13)) = 0
            AND instr(url, ' ') = 0
          )
        ),
        scheduled_at INTEGER,
        submitted_at INTEGER,
        published_at INTEGER,
        error TEXT,
        failure_stage TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        claim_kind TEXT CHECK (claim_kind IS NULL OR claim_kind IN (
          'submission', 'reconciliation', 'status-lookup', 'cancellation'
        )),
        claim_epoch INTEGER NOT NULL DEFAULT 0 CHECK (claim_epoch >= 0),
        claim_token TEXT,
        claim_expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (
          (claim_kind IS NULL AND active_claim_run_id IS NULL AND claim_token IS NULL AND claim_expires_at IS NULL)
          OR
          (
            claim_kind IS NOT NULL
            AND active_claim_run_id IS NOT NULL
            AND claim_token IS NOT NULL
            AND claim_expires_at IS NOT NULL
            AND claim_expires_at > updated_at
          )
        ),
        CHECK (submitted_at IS NULL OR submitted_at >= created_at),
        CHECK (published_at IS NULL OR published_at >= created_at),
        CHECK (scheduled_at IS NULL OR scheduled_at >= created_at),
        CHECK (
          published_at IS NULL OR submitted_at IS NULL OR published_at >= submitted_at
        ),
        CHECK (
          published_at IS NULL OR scheduled_at IS NULL OR published_at >= scheduled_at
        ),
        CHECK (state <> 'submitted' OR submitted_at IS NOT NULL),
        CHECK (state <> 'published' OR published_at IS NOT NULL),
        CHECK (
          state NOT IN ('draft', 'submitting')
          OR (submitted_at IS NULL AND published_at IS NULL)
        ),
        CHECK (state <> 'scheduled' OR published_at IS NULL)
      );

      CREATE TABLE metric_snapshots (
        id TEXT PRIMARY KEY,
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE RESTRICT,
        source TEXT NOT NULL CHECK (
          length(source) > 0
          AND source = lower(source)
          AND source NOT GLOB '*[^a-z0-9-]*'
          AND substr(source, 1, 1) GLOB '[a-z0-9]'
          AND substr(source, -1, 1) GLOB '[a-z0-9]'
          AND instr(source, '--') = 0
        ),
        as_of INTEGER NOT NULL CHECK (
          typeof(as_of) = 'integer' AND as_of BETWEEN 0 AND 9007199254740991
        ),
        window_start INTEGER,
        window_end INTEGER,
        views INTEGER CHECK (
          views IS NULL OR (typeof(views) = 'integer' AND views BETWEEN 0 AND 9007199254740991)
        ),
        likes INTEGER CHECK (
          likes IS NULL OR (typeof(likes) = 'integer' AND likes BETWEEN 0 AND 9007199254740991)
        ),
        comments INTEGER CHECK (
          comments IS NULL OR (typeof(comments) = 'integer' AND comments BETWEEN 0 AND 9007199254740991)
        ),
        shares INTEGER CHECK (
          shares IS NULL OR (typeof(shares) = 'integer' AND shares BETWEEN 0 AND 9007199254740991)
        ),
        watch_time_ms INTEGER CHECK (
          watch_time_ms IS NULL OR (
            typeof(watch_time_ms) = 'integer'
            AND watch_time_ms BETWEEN 0 AND 9007199254740991
          )
        ),
        ctr REAL CHECK (
          ctr IS NULL OR (
            typeof(ctr) IN ('integer', 'real')
            AND ctr >= 0
            AND ctr <= 1.7976931348623157e308
          )
        ),
        retention_curve_json TEXT CHECK (
          retention_curve_json IS NULL OR (
            json_valid(retention_curve_json)
            AND json_type(retention_curve_json) = 'array'
          )
        ),
        avg_view_duration_sec REAL CHECK (
          avg_view_duration_sec IS NULL OR (
            typeof(avg_view_duration_sec) IN ('integer', 'real')
            AND avg_view_duration_sec >= 0
            AND avg_view_duration_sec <= 1.7976931348623157e308
          )
        ),
        note TEXT,
        raw_json TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
        created_at INTEGER NOT NULL CHECK (
          typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991
        ),
        CHECK (
          (window_start IS NULL AND window_end IS NULL)
          OR (
            typeof(window_start) = 'integer'
            AND typeof(window_end) = 'integer'
            AND window_start BETWEEN 0 AND 9007199254740991
            AND window_end BETWEEN window_start AND 9007199254740991
          )
        )
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
      CREATE INDEX idx_agent_sessions_scope
        ON agent_sessions(workspace_id, project_id, id);
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
      CREATE INDEX idx_evaluations_scope
        ON evaluations(workspace_id, project_id, created_at, id);
      CREATE UNIQUE INDEX idx_units_workspace_slug
        ON units(workspace_id, slug) WHERE project_id IS NULL;
      CREATE UNIQUE INDEX idx_units_project_slug
        ON units(project_id, slug) WHERE project_id IS NOT NULL;
      CREATE INDEX idx_units_scope ON units(workspace_id, project_id);
      CREATE INDEX idx_unit_revisions_unit ON unit_revisions(unit_id, revision_no);
      CREATE INDEX idx_publications_presentation ON publications(presentation_id, created_at, id);
      CREATE INDEX idx_publications_state ON publications(state, updated_at, id);
      CREATE INDEX idx_metric_snapshots_publication
        ON metric_snapshots(publication_id, as_of DESC, created_at DESC, id DESC);
      CREATE INDEX idx_runs_project ON runs(project_id, created_at);
      CREATE INDEX idx_run_attempts_run ON run_attempts(run_id, attempt_no);
      CREATE INDEX idx_run_objects_run ON run_objects(run_id, created_at);
      CREATE INDEX idx_run_results_run ON run_results(run_id, position);
      CREATE INDEX idx_jobs_status ON jobs(status);
      CREATE INDEX idx_jobs_tag ON jobs(tag);
      CREATE INDEX idx_jobs_project ON jobs(project_id);
      CREATE UNIQUE INDEX idx_jobs_run ON jobs(run_id) WHERE run_id IS NOT NULL;
      CREATE INDEX idx_job_logs_job_id ON job_logs(job_id);
      CREATE INDEX idx_job_logs_ts ON job_logs(ts);
      CREATE INDEX idx_job_artifacts_job_id ON job_artifacts(job_id);
      CREATE INDEX idx_activity_workspace_id ON activity_events(workspace_id, id);
      CREATE INDEX idx_activity_project_id ON activity_events(project_id, id);
      CREATE INDEX idx_storage_transfer_entries_transfer ON storage_transfer_entries(transfer_id);

      CREATE TRIGGER social_accounts_no_conflicting_insert
      BEFORE INSERT ON social_accounts
      WHEN EXISTS (
        SELECT 1 FROM social_accounts account
        WHERE account.id = NEW.id
          OR (
            account.workspace_id = NEW.workspace_id
            AND account.platform = NEW.platform
            AND account.external_id = NEW.external_id
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Social Account identity is immutable');
      END;

      CREATE TRIGGER social_accounts_identity_update_guard
      BEFORE UPDATE ON social_accounts
      WHEN NEW.id IS NOT OLD.id
        OR NEW.workspace_id IS NOT OLD.workspace_id
        OR NEW.platform IS NOT OLD.platform
        OR NEW.external_id IS NOT OLD.external_id
        OR NEW.created_at IS NOT OLD.created_at
      BEGIN
        SELECT RAISE(ABORT, 'Social Account identity is immutable');
      END;

      CREATE TRIGGER social_accounts_no_delete_when_referenced
      BEFORE DELETE ON social_accounts
      WHEN EXISTS (
        SELECT 1 FROM publications publication
        WHERE publication.social_account_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Referenced Social Accounts cannot be deleted');
      END;

      CREATE TRIGGER jobs_no_conflicting_insert
      BEFORE INSERT ON jobs
      WHEN EXISTS (
        SELECT 1 FROM jobs
        WHERE id = NEW.id
          OR (NEW.run_id IS NOT NULL AND run_id = NEW.run_id)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Job identity is immutable');
      END;

      CREATE TRIGGER jobs_identity_update_guard
      BEFORE UPDATE ON jobs
      WHEN NEW.id IS NOT OLD.id
        OR NEW.run_id IS NOT OLD.run_id
        OR NEW.kind IS NOT OLD.kind
        OR NEW.command IS NOT OLD.command
        OR NEW.depends_on IS NOT OLD.depends_on
        OR NEW.priority IS NOT OLD.priority
        OR NEW.created_at IS NOT OLD.created_at
        OR NEW.tag IS NOT OLD.tag
        OR NEW.project_id IS NOT OLD.project_id
      BEGIN
        SELECT RAISE(ABORT, 'Job identity is immutable');
      END;

      CREATE TRIGGER jobs_no_delete
      BEFORE DELETE ON jobs
      BEGIN
        SELECT RAISE(ABORT, 'Jobs are append-only');
      END;

      CREATE TRIGGER job_logs_no_update
      BEFORE UPDATE ON job_logs
      BEGIN
        SELECT RAISE(ABORT, 'Job logs are append-only');
      END;

      CREATE TRIGGER job_logs_no_duplicate_insert
      BEFORE INSERT ON job_logs
      WHEN EXISTS (SELECT 1 FROM job_logs WHERE id = NEW.id)
      BEGIN
        SELECT RAISE(ABORT, 'Job logs are append-only');
      END;

      CREATE TRIGGER job_logs_no_delete
      BEFORE DELETE ON job_logs
      BEGIN
        SELECT RAISE(ABORT, 'Job logs are append-only');
      END;

      CREATE TRIGGER job_artifacts_no_update
      BEFORE UPDATE ON job_artifacts
      BEGIN
        SELECT RAISE(ABORT, 'Job artifacts are append-only');
      END;

      CREATE TRIGGER job_artifacts_no_duplicate_insert
      BEFORE INSERT ON job_artifacts
      WHEN EXISTS (SELECT 1 FROM job_artifacts WHERE id = NEW.id)
      BEGIN
        SELECT RAISE(ABORT, 'Job artifacts are append-only');
      END;

      CREATE TRIGGER job_artifacts_no_delete
      BEFORE DELETE ON job_artifacts
      BEGIN
        SELECT RAISE(ABORT, 'Job artifacts are append-only');
      END;

      CREATE TRIGGER store_metadata_no_update
      BEFORE UPDATE ON store_metadata
      BEGIN
        SELECT RAISE(ABORT, 'store identity is immutable');
      END;

      CREATE TRIGGER store_metadata_no_conflicting_insert
      BEFORE INSERT ON store_metadata
      WHEN EXISTS (
        SELECT 1 FROM store_metadata
        WHERE singleton = NEW.singleton OR store_id = NEW.store_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'store identity is immutable');
      END;

      CREATE TRIGGER store_metadata_no_delete
      BEFORE DELETE ON store_metadata
      BEGIN
        SELECT RAISE(ABORT, 'store identity is immutable');
      END;

      CREATE TRIGGER agent_sessions_open_insert
      BEFORE INSERT ON agent_sessions
      WHEN NEW.ended_at IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'Agent Session must start open');
      END;

      CREATE TRIGGER agent_sessions_project_scope_insert
      BEFORE INSERT ON agent_sessions
      WHEN NEW.project_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = NEW.project_id AND p.workspace_id = NEW.workspace_id
        )
      BEGIN
        SELECT RAISE(ABORT, 'Agent Session Project must belong to its Workspace');
      END;

      CREATE TRIGGER agent_sessions_update_guard
      BEFORE UPDATE ON agent_sessions
      WHEN NOT (
        NEW.id IS OLD.id
        AND NEW.workspace_id IS OLD.workspace_id
        AND NEW.project_id IS OLD.project_id
        AND NEW.agent IS OLD.agent
        AND NEW.metadata_json IS OLD.metadata_json
        AND NEW.started_at IS OLD.started_at
        AND OLD.ended_at IS NULL
        AND NEW.ended_at IS NOT NULL
      )
      BEGIN
        SELECT RAISE(ABORT, 'Agent Session scope and identity are immutable');
      END;

      CREATE TRIGGER agent_sessions_no_duplicate_insert
      BEFORE INSERT ON agent_sessions
      WHEN EXISTS (SELECT 1 FROM agent_sessions WHERE id = NEW.id)
      BEGIN
        SELECT RAISE(ABORT, 'Agent Session identity is immutable');
      END;

      CREATE TRIGGER agent_sessions_no_delete
      BEFORE DELETE ON agent_sessions
      BEGIN
        SELECT RAISE(ABORT, 'Agent Session identity is immutable');
      END;

      CREATE TRIGGER document_revision_session_scope_insert
      BEFORE INSERT ON document_revisions
      WHEN NEW.authored_by_session_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM agent_sessions s
          JOIN documents d ON d.id = NEW.document_id
          WHERE s.id = NEW.authored_by_session_id
            AND s.ended_at IS NULL
            AND s.workspace_id = d.workspace_id
            AND (
              (d.project_id IS NULL AND s.project_id IS NULL)
              OR (
                d.project_id IS NOT NULL
                AND (s.project_id IS NULL OR s.project_id = d.project_id)
              )
            )
        )
      BEGIN
        SELECT RAISE(ABORT, 'active Agent Session does not contain entity scope');
      END;

      CREATE TRIGGER evaluations_no_conflicting_insert
      BEFORE INSERT ON evaluations
      WHEN EXISTS (SELECT 1 FROM evaluations WHERE id = NEW.id)
      BEGIN
        SELECT RAISE(ABORT, 'Evaluation identity is immutable');
      END;

      CREATE TRIGGER evaluations_scope_insert
      BEFORE INSERT ON evaluations
      WHEN NOT EXISTS (
        SELECT 1
        FROM artifact_revisions revision
        JOIN artifacts artifact ON artifact.id = revision.artifact_id
        WHERE revision.id = NEW.artifact_revision_id
          AND artifact.workspace_id = NEW.workspace_id
          AND artifact.project_id IS NEW.project_id
        UNION ALL
        SELECT 1
        FROM composition_revisions revision
        JOIN compositions composition ON composition.id = revision.composition_id
        JOIN projects project ON project.id = composition.project_id
        WHERE revision.id = NEW.composition_revision_id
          AND project.workspace_id = NEW.workspace_id
          AND project.id IS NEW.project_id
        UNION ALL
        SELECT 1
        FROM builds build
        JOIN composition_revisions revision
          ON revision.id = build.composition_revision_id
        JOIN compositions composition ON composition.id = revision.composition_id
        JOIN projects project ON project.id = composition.project_id
        WHERE build.id = NEW.build_id
          AND project.workspace_id = NEW.workspace_id
          AND project.id IS NEW.project_id
        UNION ALL
        SELECT 1
        FROM runs run
        WHERE run.id = NEW.run_id
          AND run.workspace_id IS NEW.workspace_id
          AND run.project_id IS NEW.project_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Evaluation scope must equal its derived target scope');
      END;

      CREATE TRIGGER evaluation_session_scope_insert
      BEFORE INSERT ON evaluations
      WHEN NOT EXISTS (
        SELECT 1
        FROM agent_sessions s
        WHERE s.id = NEW.authored_by_session_id
          AND s.ended_at IS NULL
          AND s.workspace_id = NEW.workspace_id
          AND (
            (NEW.project_id IS NULL AND s.project_id IS NULL)
            OR (
              NEW.project_id IS NOT NULL
              AND (s.project_id IS NULL OR s.project_id = NEW.project_id)
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'active Agent Session does not contain entity scope');
      END;

      CREATE TRIGGER evaluations_no_update
      BEFORE UPDATE ON evaluations
      BEGIN
        SELECT RAISE(ABORT, 'Evaluations are immutable');
      END;

      CREATE TRIGGER evaluations_no_delete
      BEFORE DELETE ON evaluations
      BEGIN
        SELECT RAISE(ABORT, 'Evaluations are immutable');
      END;

      CREATE TRIGGER artifact_revision_session_scope_insert
      BEFORE INSERT ON artifact_revisions
      WHEN NEW.authored_by_session_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM agent_sessions s
          JOIN artifacts a ON a.id = NEW.artifact_id
          WHERE s.id = NEW.authored_by_session_id
            AND s.ended_at IS NULL
            AND s.workspace_id = a.workspace_id
            AND (
              (a.project_id IS NULL AND s.project_id IS NULL)
              OR (
                a.project_id IS NOT NULL
                AND (s.project_id IS NULL OR s.project_id = a.project_id)
              )
            )
        )
      BEGIN
        SELECT RAISE(ABORT, 'active Agent Session does not contain entity scope');
      END;

      CREATE TRIGGER composition_revision_session_scope_insert
      BEFORE INSERT ON composition_revisions
      WHEN NEW.authored_by_session_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM agent_sessions s
          JOIN compositions c ON c.id = NEW.composition_id
          JOIN projects p ON p.id = c.project_id
          WHERE s.id = NEW.authored_by_session_id
            AND s.ended_at IS NULL
            AND s.workspace_id = p.workspace_id
            AND (s.project_id IS NULL OR s.project_id = p.id)
        )
      BEGIN
        SELECT RAISE(ABORT, 'active Agent Session does not contain entity scope');
      END;

      CREATE TRIGGER composition_selection_scope_insert
      BEFORE INSERT ON compositions
      WHEN NEW.selected_revision_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM composition_revisions r
          WHERE r.id = NEW.selected_revision_id
            AND r.composition_id = NEW.id
            AND r.state = 'sealed'
        )
      BEGIN
        SELECT RAISE(ABORT, 'selected revision must be sealed in the same Composition');
      END;

      CREATE TRIGGER composition_selection_scope_update
      BEFORE UPDATE OF selected_revision_id ON compositions
      WHEN NEW.selected_revision_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM composition_revisions r
          WHERE r.id = NEW.selected_revision_id
            AND r.composition_id = NEW.id
            AND r.state = 'sealed'
        )
      BEGIN
        SELECT RAISE(ABORT, 'selected revision must be sealed in the same Composition');
      END;

      CREATE TRIGGER composition_revision_scope_insert
      BEFORE INSERT ON composition_revisions
      WHEN (
          NEW.parent_revision_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM composition_revisions parent
            WHERE parent.id = NEW.parent_revision_id
              AND parent.composition_id = NEW.composition_id
          )
        )
        OR (
          NEW.iteration_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM project_iterations i
            JOIN compositions c ON c.id = NEW.composition_id
            WHERE i.id = NEW.iteration_id
              AND i.project_id = c.project_id
          )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Composition revision parent or Iteration is outside its Project scope');
      END;

      CREATE TRIGGER composition_revision_scope_update
      BEFORE UPDATE OF composition_id, parent_revision_id, iteration_id ON composition_revisions
      WHEN (
          NEW.parent_revision_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM composition_revisions parent
            WHERE parent.id = NEW.parent_revision_id
              AND parent.composition_id = NEW.composition_id
          )
        )
        OR (
          NEW.iteration_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM project_iterations i
            JOIN compositions c ON c.id = NEW.composition_id
            WHERE i.id = NEW.iteration_id
              AND i.project_id = c.project_id
          )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Composition revision parent or Iteration is outside its Project scope');
      END;

      CREATE TRIGGER unit_revision_session_scope_insert
      BEFORE INSERT ON unit_revisions
      WHEN NEW.authored_by_session_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM agent_sessions s
          JOIN units u ON u.id = NEW.unit_id
          WHERE s.id = NEW.authored_by_session_id
            AND s.ended_at IS NULL
            AND s.workspace_id = u.workspace_id
            AND (
              (u.project_id IS NULL AND s.project_id IS NULL)
              OR (
                u.project_id IS NOT NULL
                AND (s.project_id IS NULL OR s.project_id = u.project_id)
              )
            )
        )
      BEGIN
        SELECT RAISE(ABORT, 'active Agent Session does not contain entity scope');
      END;

      CREATE TRIGGER run_session_scope_insert
      BEFORE INSERT ON runs
      WHEN NEW.agent_session_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM agent_sessions s
          WHERE s.id = NEW.agent_session_id
            AND s.ended_at IS NULL
            AND NEW.workspace_id IS NOT NULL
            AND s.workspace_id = NEW.workspace_id
            AND (
              (NEW.project_id IS NULL AND s.project_id IS NULL)
              OR (
                NEW.project_id IS NOT NULL
                AND (s.project_id IS NULL OR s.project_id = NEW.project_id)
                AND EXISTS (
                  SELECT 1 FROM projects p
                  WHERE p.id = NEW.project_id
                    AND p.workspace_id = NEW.workspace_id
                )
              )
            )
        )
      BEGIN
        SELECT RAISE(ABORT, 'active Agent Session does not contain entity scope');
      END;

      CREATE TRIGGER run_provenance_scope_update_guard
      BEFORE UPDATE OF workspace_id, project_id, agent_session_id ON runs
      WHEN NEW.workspace_id IS NOT OLD.workspace_id
        OR NEW.project_id IS NOT OLD.project_id
        OR NEW.agent_session_id IS NOT OLD.agent_session_id
      BEGIN
        SELECT RAISE(ABORT, 'Run provenance scope is immutable');
      END;

      CREATE TRIGGER run_results_no_conflicting_insert
      BEFORE INSERT ON run_results
      WHEN EXISTS (
        SELECT 1 FROM run_results
        WHERE id = NEW.id
          OR (run_id = NEW.run_id AND position = NEW.position)
          OR (
            run_id = NEW.run_id
            AND entity_type = NEW.entity_type
            AND entity_id = NEW.entity_id
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Run result identity is immutable');
      END;

      CREATE TRIGGER run_results_scope_insert
      BEFORE INSERT ON run_results
      WHEN NOT EXISTS (
        SELECT 1 FROM runs run
        WHERE run.id = NEW.run_id
          AND run.state IN ('pending', 'running')
          AND (
            (
              NEW.entity_type = 'document_revision'
              AND EXISTS (
                SELECT 1 FROM document_revisions revision
                JOIN documents document ON document.id = revision.document_id
                WHERE revision.id = NEW.entity_id
                  AND document.workspace_id IS run.workspace_id
                  AND document.project_id IS run.project_id
              )
            )
            OR (
              NEW.entity_type = 'artifact_revision'
              AND EXISTS (
                SELECT 1 FROM artifact_revisions revision
                JOIN artifacts artifact ON artifact.id = revision.artifact_id
                WHERE revision.id = NEW.entity_id
                  AND artifact.workspace_id IS run.workspace_id
                  AND artifact.project_id IS run.project_id
              )
            )
            OR (
              NEW.entity_type = 'composition_revision'
              AND EXISTS (
                SELECT 1 FROM composition_revisions revision
                JOIN compositions composition ON composition.id = revision.composition_id
                JOIN projects project ON project.id = composition.project_id
                WHERE revision.id = NEW.entity_id
                  AND revision.state = 'sealed'
                  AND project.workspace_id IS run.workspace_id
                  AND project.id IS run.project_id
              )
            )
            OR (
              NEW.entity_type = 'build'
              AND EXISTS (
                SELECT 1 FROM builds build
                JOIN composition_revisions revision ON revision.id = build.composition_revision_id
                JOIN compositions composition ON composition.id = revision.composition_id
                JOIN projects project ON project.id = composition.project_id
                WHERE build.id = NEW.entity_id
                  AND build.state IN ('succeeded', 'failed', 'cancelled')
                  AND project.workspace_id IS run.workspace_id
                  AND project.id IS run.project_id
              )
            )
            OR (
              NEW.entity_type = 'build_output'
              AND EXISTS (
                SELECT 1 FROM build_outputs output
                JOIN builds build ON build.id = output.build_id
                JOIN composition_revisions revision ON revision.id = build.composition_revision_id
                JOIN compositions composition ON composition.id = revision.composition_id
                JOIN projects project ON project.id = composition.project_id
                WHERE output.id = NEW.entity_id
                  AND build.state = 'succeeded'
                  AND project.workspace_id IS run.workspace_id
                  AND project.id IS run.project_id
              )
            )
            OR (
              NEW.entity_type = 'unit_revision'
              AND EXISTS (
                SELECT 1 FROM unit_revisions revision
                JOIN units unit ON unit.id = revision.unit_id
                WHERE revision.id = NEW.entity_id
                  AND revision.sealed_at IS NOT NULL
                  AND unit.workspace_id IS run.workspace_id
                  AND unit.project_id IS run.project_id
              )
            )
            OR (
              NEW.entity_type = 'unit_item'
              AND EXISTS (
                SELECT 1 FROM unit_items item
                JOIN unit_revisions revision ON revision.id = item.unit_revision_id
                JOIN units unit ON unit.id = revision.unit_id
                WHERE item.id = NEW.entity_id
                  AND revision.sealed_at IS NOT NULL
                  AND unit.workspace_id IS run.workspace_id
                  AND unit.project_id IS run.project_id
              )
            )
            OR (
              NEW.entity_type = 'unit_presentation'
              AND EXISTS (
                SELECT 1 FROM unit_presentations presentation
                JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
                JOIN units unit ON unit.id = revision.unit_id
                WHERE presentation.id = NEW.entity_id
                  AND revision.sealed_at IS NOT NULL
                  AND unit.workspace_id IS run.workspace_id
                  AND unit.project_id IS run.project_id
              )
            )
            OR (
              NEW.entity_type = 'publication'
              AND EXISTS (
                SELECT 1 FROM publications publication
                JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
                JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
                JOIN units unit ON unit.id = revision.unit_id
                WHERE publication.id = NEW.entity_id
                  AND unit.workspace_id IS run.workspace_id
                  AND unit.project_id IS run.project_id
              )
            )
            OR (
              NEW.entity_type = 'metric_snapshot'
              AND EXISTS (
                SELECT 1 FROM metric_snapshots metric
                JOIN publications publication ON publication.id = metric.publication_id
                JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
                JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
                JOIN units unit ON unit.id = revision.unit_id
                WHERE metric.id = NEW.entity_id
                  AND unit.workspace_id IS run.workspace_id
                  AND unit.project_id IS run.project_id
              )
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Run result must exist in the exact Run scope');
      END;

      CREATE TRIGGER run_results_no_update
      BEFORE UPDATE ON run_results
      BEGIN
        SELECT RAISE(ABORT, 'Run results are immutable');
      END;

      CREATE TRIGGER run_results_no_delete
      BEFORE DELETE ON run_results
      BEGIN
        SELECT RAISE(ABORT, 'Run results are immutable');
      END;

      CREATE TRIGGER document_revisions_no_update
      BEFORE UPDATE ON document_revisions
      BEGIN
        SELECT RAISE(ABORT, 'document revisions are immutable');
      END;

      CREATE TRIGGER document_revisions_no_duplicate_insert
      BEFORE INSERT ON document_revisions
      WHEN EXISTS (
        SELECT 1 FROM document_revisions
        WHERE id = NEW.id
          OR (
            document_id = NEW.document_id
            AND revision_no = NEW.revision_no
          )
      )
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

      CREATE TRIGGER artifact_revisions_no_duplicate_insert
      BEFORE INSERT ON artifact_revisions
      WHEN EXISTS (
        SELECT 1 FROM artifact_revisions
        WHERE id = NEW.id
          OR (
            artifact_id = NEW.artifact_id
            AND revision_no = NEW.revision_no
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'artifact revisions are immutable');
      END;

      CREATE TRIGGER artifact_revisions_no_delete
      BEFORE DELETE ON artifact_revisions
      BEGIN
        SELECT RAISE(ABORT, 'artifact revisions are immutable');
      END;

      CREATE TRIGGER unit_revisions_update_guard
      BEFORE UPDATE ON unit_revisions
      WHEN NOT (
        OLD.sealed_at IS NULL
        AND NEW.sealed_at IS NOT NULL
        AND NEW.id IS OLD.id
        AND NEW.unit_id IS OLD.unit_id
        AND NEW.revision_no IS OLD.revision_no
        AND NEW.parent_revision_id IS OLD.parent_revision_id
        AND NEW.iteration_id IS OLD.iteration_id
        AND NEW.note IS OLD.note
        AND NEW.metadata_json IS OLD.metadata_json
        AND NEW.authored_by_session_id IS OLD.authored_by_session_id
        AND NEW.created_at IS OLD.created_at
      )
      BEGIN
        SELECT RAISE(ABORT, 'Unit revisions are immutable except for the final seal transition');
      END;

      CREATE TRIGGER unit_revisions_no_duplicate_insert
      BEFORE INSERT ON unit_revisions
      WHEN EXISTS (
        SELECT 1 FROM unit_revisions
        WHERE id = NEW.id
          OR (unit_id = NEW.unit_id AND revision_no = NEW.revision_no)
      )
      BEGIN
        SELECT RAISE(ABORT, 'unit revisions are immutable');
      END;

      CREATE TRIGGER unit_revisions_no_delete
      BEFORE DELETE ON unit_revisions
      BEGIN
        SELECT RAISE(ABORT, 'unit revisions are immutable');
      END;

      CREATE TRIGGER units_scope_insert
      BEFORE INSERT ON units
      WHEN NEW.project_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = NEW.project_id AND p.workspace_id = NEW.workspace_id
        )
      BEGIN
        SELECT RAISE(ABORT, 'Unit Project must belong to its Workspace');
      END;

      CREATE TRIGGER units_no_conflicting_insert
      BEFORE INSERT ON units
      WHEN EXISTS (
        SELECT 1 FROM units existing
        WHERE existing.id = NEW.id
          OR (
            existing.workspace_id = NEW.workspace_id
            AND existing.project_id IS NEW.project_id
            AND existing.slug = NEW.slug
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Unit identity and scoped slug are immutable');
      END;

      CREATE TRIGGER units_no_delete
      BEFORE DELETE ON units
      BEGIN
        SELECT RAISE(ABORT, 'Units are immutable identities');
      END;

      CREATE TRIGGER units_identity_update_guard
      BEFORE UPDATE ON units
      WHEN NEW.id IS NOT OLD.id
        OR NEW.workspace_id IS NOT OLD.workspace_id
        OR NEW.project_id IS NOT OLD.project_id
        OR NEW.slug IS NOT OLD.slug
        OR NEW.format IS NOT OLD.format
        OR NEW.created_at IS NOT OLD.created_at
      BEGIN
        SELECT RAISE(ABORT, 'Unit identity is immutable');
      END;

      CREATE TRIGGER units_latest_scope_insert
      BEFORE INSERT ON units
      WHEN NEW.latest_revision_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM unit_revisions r
          WHERE r.id = NEW.latest_revision_id
            AND r.unit_id = NEW.id
            AND r.sealed_at IS NOT NULL
        )
      BEGIN
        SELECT RAISE(ABORT, 'Unit latest revision must be sealed in the same Unit');
      END;

      CREATE TRIGGER units_latest_scope_update
      BEFORE UPDATE OF latest_revision_id ON units
      WHEN (
          EXISTS (SELECT 1 FROM unit_revisions r WHERE r.unit_id = NEW.id AND r.sealed_at IS NOT NULL)
          AND NEW.latest_revision_id IS NULL
        )
        OR (
          NEW.latest_revision_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM unit_revisions r
            WHERE r.id = NEW.latest_revision_id
              AND r.unit_id = NEW.id
              AND r.sealed_at IS NOT NULL
              AND r.revision_no = (
                SELECT MAX(latest.revision_no) FROM unit_revisions latest
                WHERE latest.unit_id = NEW.id AND latest.sealed_at IS NOT NULL
              )
          )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Unit latest revision must be the highest sealed revision');
      END;

      CREATE TRIGGER units_selected_scope_insert
      BEFORE INSERT ON units
      WHEN NEW.selected_revision_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM unit_revisions r
          WHERE r.id = NEW.selected_revision_id
            AND r.unit_id = NEW.id
            AND r.sealed_at IS NOT NULL
        )
      BEGIN
        SELECT RAISE(ABORT, 'Unit selected revision must be sealed in the same Unit');
      END;

      CREATE TRIGGER units_selected_scope_update
      BEFORE UPDATE OF selected_revision_id ON units
      WHEN NEW.selected_revision_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM unit_revisions r
          WHERE r.id = NEW.selected_revision_id
            AND r.unit_id = NEW.id
            AND r.sealed_at IS NOT NULL
        )
      BEGIN
        SELECT RAISE(ABORT, 'Unit selected revision must be sealed in the same Unit');
      END;

      CREATE TRIGGER unit_revision_scope_insert
      BEFORE INSERT ON unit_revisions
      WHEN NOT EXISTS (
          SELECT 1 FROM unit_revisions existing
          WHERE existing.id = NEW.id
            OR (
              existing.unit_id = NEW.unit_id
              AND existing.revision_no = NEW.revision_no
            )
        )
        AND (
          NEW.revision_no <> (
          SELECT COALESCE(MAX(revision_no), 0) + 1
          FROM unit_revisions WHERE unit_id = NEW.unit_id
        )
        OR (NEW.revision_no = 1 AND NEW.parent_revision_id IS NOT NULL)
        OR (NEW.revision_no > 1 AND NEW.parent_revision_id IS NULL)
        OR (
          NEW.parent_revision_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM unit_revisions parent
            WHERE parent.id = NEW.parent_revision_id
              AND parent.unit_id = NEW.unit_id
              AND parent.sealed_at IS NOT NULL
          )
        )
        OR (
          NEW.iteration_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM units u
            JOIN project_iterations i ON i.project_id = u.project_id
            WHERE u.id = NEW.unit_id AND i.id = NEW.iteration_id
          )
        )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Unit revision parent or Iteration is outside its scope');
      END;

      CREATE TRIGGER unit_revisions_open_insert
      BEFORE INSERT ON unit_revisions
      WHEN NEW.sealed_at IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'Unit revisions must be inserted open and sealed after graph validation');
      END;

      CREATE TRIGGER unit_revision_seal_graph_guard
      BEFORE UPDATE OF sealed_at ON unit_revisions
      WHEN NEW.sealed_at IS NOT NULL
        AND (
          NOT EXISTS (SELECT 1 FROM unit_items item WHERE item.unit_revision_id = NEW.id)
          OR EXISTS (
            SELECT 1
            FROM (
              SELECT COUNT(*) AS count, MIN(position) AS minimum, MAX(position) AS maximum
              FROM unit_items WHERE unit_revision_id = NEW.id
            ) positions
            WHERE positions.minimum <> 0 OR positions.maximum <> positions.count - 1
          )
          OR EXISTS (
            SELECT 1
            FROM (
              SELECT COUNT(*) AS count, MIN(position) AS minimum, MAX(position) AS maximum
              FROM unit_presentations WHERE unit_revision_id = NEW.id
            ) positions
            WHERE positions.count > 0
              AND (positions.minimum <> 0 OR positions.maximum <> positions.count - 1)
          )
          OR EXISTS (
            SELECT 1 FROM unit_presentations presentation
            WHERE presentation.unit_revision_id = NEW.id
              AND presentation.cover_artifact_revision_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM unit_items item
                WHERE item.unit_revision_id = NEW.id
                  AND item.artifact_revision_id = presentation.cover_artifact_revision_id
              )
          )
          OR EXISTS (
            SELECT 1 FROM unit_presentations presentation
            WHERE presentation.unit_revision_id = NEW.id
              AND presentation.effective_caption_revision_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM presentation_caption_revisions caption
                WHERE caption.id = presentation.effective_caption_revision_id
                  AND caption.presentation_id = presentation.id
              )
          )
          OR EXISTS (
            SELECT 1 FROM unit_presentations presentation
            WHERE presentation.unit_revision_id = NEW.id
              AND EXISTS (
                SELECT 1
                FROM (
                  SELECT COUNT(*) AS count, MIN(position) AS minimum, MAX(position) AS maximum
                  FROM presentation_items item
                  WHERE item.presentation_id = presentation.id
                ) positions
                WHERE positions.count > 0
                  AND (positions.minimum <> 0 OR positions.maximum <> positions.count - 1)
              )
          )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Unit revision graph is incomplete or non-contiguous');
      END;

      CREATE TRIGGER unit_revision_advance_latest
      AFTER UPDATE OF sealed_at ON unit_revisions
      WHEN OLD.sealed_at IS NULL AND NEW.sealed_at IS NOT NULL
      BEGIN
        UPDATE units
        SET latest_revision_id = NEW.id,
            row_version = row_version + 1,
            updated_at = NEW.sealed_at
        WHERE id = NEW.unit_id;
      END;

      CREATE TRIGGER unit_items_no_conflicting_insert
      BEFORE INSERT ON unit_items
      WHEN EXISTS (
        SELECT 1 FROM unit_items
        WHERE id = NEW.id
          OR (unit_revision_id = NEW.unit_revision_id AND position = NEW.position)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Unit item identity is immutable');
      END;

      CREATE TRIGGER unit_items_scope_insert
      BEFORE INSERT ON unit_items
      WHEN NOT EXISTS (
        SELECT 1
        FROM unit_revisions revision
        JOIN units unit ON unit.id = revision.unit_id
        WHERE revision.id = NEW.unit_revision_id
          AND revision.sealed_at IS NULL
          AND (
            (
              NEW.artifact_revision_id IS NOT NULL
              AND NEW.document_revision_id IS NULL
              AND EXISTS (
                SELECT 1
                FROM artifact_revisions ar
                JOIN artifacts artifact ON artifact.id = ar.artifact_id
                WHERE ar.id = NEW.artifact_revision_id
                  AND artifact.workspace_id = unit.workspace_id
                  AND (
                    (unit.project_id IS NULL AND artifact.project_id IS NULL)
                    OR (
                      unit.project_id IS NOT NULL
                      AND (artifact.project_id IS NULL OR artifact.project_id = unit.project_id)
                    )
                  )
              )
            )
            OR (
              NEW.document_revision_id IS NOT NULL
              AND NEW.artifact_revision_id IS NULL
              AND EXISTS (
                SELECT 1
                FROM document_revisions dr
                JOIN documents document ON document.id = dr.document_id
                WHERE dr.id = NEW.document_revision_id
                  AND document.workspace_id = unit.workspace_id
                  AND (
                    (unit.project_id IS NULL AND document.project_id IS NULL)
                    OR (
                      unit.project_id IS NOT NULL
                      AND (document.project_id IS NULL OR document.project_id = unit.project_id)
                    )
                  )
              )
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Unit item target is outside its open revision scope');
      END;

      CREATE TRIGGER unit_items_no_update
      BEFORE UPDATE ON unit_items
      BEGIN
        SELECT RAISE(ABORT, 'Unit items are immutable');
      END;

      CREATE TRIGGER unit_items_no_delete_when_sealed
      BEFORE DELETE ON unit_items
      WHEN (SELECT sealed_at FROM unit_revisions WHERE id = OLD.unit_revision_id) IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'sealed Unit items are immutable');
      END;

      CREATE TRIGGER unit_presentations_no_conflicting_insert
      BEFORE INSERT ON unit_presentations
      WHEN EXISTS (
        SELECT 1 FROM unit_presentations
        WHERE id = NEW.id
          OR (unit_revision_id = NEW.unit_revision_id AND platform = NEW.platform)
          OR (unit_revision_id = NEW.unit_revision_id AND position = NEW.position)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Unit presentation identity is immutable');
      END;

      CREATE TRIGGER unit_presentations_open_insert
      BEFORE INSERT ON unit_presentations
      WHEN NOT EXISTS (
        SELECT 1 FROM unit_revisions revision
        WHERE revision.id = NEW.unit_revision_id AND revision.sealed_at IS NULL
      )
      BEGIN
        SELECT RAISE(ABORT, 'Unit presentations require an open revision');
      END;

      CREATE TRIGGER unit_presentations_update_guard
      BEFORE UPDATE ON unit_presentations
      WHEN NOT (
        (SELECT sealed_at FROM unit_revisions WHERE id = OLD.unit_revision_id) IS NULL
        AND NEW.id IS OLD.id
        AND NEW.unit_revision_id IS OLD.unit_revision_id
        AND NEW.platform IS OLD.platform
        AND NEW.position IS OLD.position
        AND NEW.cover_artifact_revision_id IS OLD.cover_artifact_revision_id
        AND NEW.crop_json IS OLD.crop_json
        AND NEW.safe_area_json IS OLD.safe_area_json
        AND NEW.options_json IS OLD.options_json
        AND NEW.created_at IS OLD.created_at
      )
      BEGIN
        SELECT RAISE(ABORT, 'Unit presentation graph is immutable after sealing');
      END;

      CREATE TRIGGER unit_presentations_no_delete_when_sealed
      BEFORE DELETE ON unit_presentations
      WHEN (SELECT sealed_at FROM unit_revisions WHERE id = OLD.unit_revision_id) IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'sealed Unit presentations are immutable');
      END;

      CREATE TRIGGER presentation_captions_no_conflicting_insert
      BEFORE INSERT ON presentation_caption_revisions
      WHEN EXISTS (
        SELECT 1 FROM presentation_caption_revisions
        WHERE id = NEW.id
          OR (presentation_id = NEW.presentation_id AND revision_no = NEW.revision_no)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Presentation caption identity is immutable');
      END;

      CREATE TRIGGER presentation_captions_scope_insert
      BEFORE INSERT ON presentation_caption_revisions
      WHEN NOT EXISTS (
        SELECT 1
        FROM unit_presentations presentation
        JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
        WHERE presentation.id = NEW.presentation_id
          AND revision.sealed_at IS NULL
          AND (
            (NEW.revision_no = 1 AND NEW.parent_revision_id IS NULL)
            OR (
              NEW.revision_no > 1
              AND EXISTS (
                SELECT 1 FROM presentation_caption_revisions parent
                WHERE parent.id = NEW.parent_revision_id
                  AND parent.presentation_id = NEW.presentation_id
                  AND parent.revision_no = NEW.revision_no - 1
              )
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Presentation caption must extend its open Presentation history');
      END;

      CREATE TRIGGER presentation_captions_no_update
      BEFORE UPDATE ON presentation_caption_revisions
      BEGIN
        SELECT RAISE(ABORT, 'Presentation caption revisions are immutable');
      END;

      CREATE TRIGGER presentation_captions_no_delete
      BEFORE DELETE ON presentation_caption_revisions
      BEGIN
        SELECT RAISE(ABORT, 'Presentation caption revisions are immutable');
      END;

      CREATE TRIGGER presentation_items_no_conflicting_insert
      BEFORE INSERT ON presentation_items
      WHEN EXISTS (
        SELECT 1 FROM presentation_items
        WHERE id = NEW.id
          OR (presentation_id = NEW.presentation_id AND position = NEW.position)
          OR (presentation_id = NEW.presentation_id AND unit_item_id = NEW.unit_item_id)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Presentation item identity is immutable');
      END;

      CREATE TRIGGER presentation_items_scope_insert
      BEFORE INSERT ON presentation_items
      WHEN NOT EXISTS (
        SELECT 1
        FROM unit_presentations presentation
        JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
        JOIN unit_items item ON item.id = NEW.unit_item_id
        WHERE presentation.id = NEW.presentation_id
          AND revision.sealed_at IS NULL
          AND item.unit_revision_id = presentation.unit_revision_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Presentation item must reference its open Unit revision');
      END;

      CREATE TRIGGER presentation_items_no_update
      BEFORE UPDATE ON presentation_items
      BEGIN
        SELECT RAISE(ABORT, 'Presentation items are immutable');
      END;

      CREATE TRIGGER presentation_items_no_delete_when_sealed
      BEFORE DELETE ON presentation_items
      WHEN EXISTS (
        SELECT 1
        FROM unit_presentations presentation
        JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
        WHERE presentation.id = OLD.presentation_id AND revision.sealed_at IS NOT NULL
      )
      BEGIN
        SELECT RAISE(ABORT, 'sealed Presentation items are immutable');
      END;

      CREATE TRIGGER publications_no_conflicting_insert
      BEFORE INSERT ON publications
      WHEN EXISTS (
        SELECT 1 FROM publications
        WHERE id = NEW.id
          OR idempotency_key = NEW.idempotency_key
          OR submission_run_id = NEW.submission_run_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Publication attempt identity is immutable');
      END;

      CREATE TRIGGER publications_scope_insert
      BEFORE INSERT ON publications
      WHEN NOT EXISTS (
        SELECT 1
        FROM unit_presentations presentation
        JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
        JOIN units unit ON unit.id = revision.unit_id
        JOIN runs run ON run.id = NEW.submission_run_id
        WHERE presentation.id = NEW.presentation_id
          AND revision.sealed_at IS NOT NULL
          AND NEW.effective_caption_revision_id IS presentation.effective_caption_revision_id
          AND NEW.effective_options_json IS presentation.options_json
          AND run.workspace_id IS unit.workspace_id
          AND run.project_id IS unit.project_id
          AND run.state = 'pending'
          AND NOT EXISTS (SELECT 1 FROM run_attempts attempt WHERE attempt.run_id = run.id)
          AND NOT EXISTS (SELECT 1 FROM run_results result WHERE result.run_id = run.id)
          AND NEW.active_claim_run_id IS NULL
          AND NEW.claim_kind IS NULL
          AND NEW.claim_epoch = 0
          AND NEW.claim_token IS NULL
          AND NEW.claim_expires_at IS NULL
          AND NEW.provider_publication_id IS NULL
          AND NEW.url IS NULL
          AND NEW.submitted_at IS NULL
          AND NEW.published_at IS NULL
          AND (
            (
              NEW.rail IN ('github-pages', 'manual')
              AND NEW.social_account_id IS NULL
            )
            OR (
              NEW.rail IN ('postiz', 'devto', 'hashnode')
              AND EXISTS (
                SELECT 1 FROM social_accounts account
                WHERE account.id = NEW.social_account_id
                  AND account.workspace_id = unit.workspace_id
                  AND account.platform = presentation.platform
              )
            )
            OR (
              NEW.state = 'failed'
              AND NEW.social_account_id IS NULL
              AND NEW.failure_stage IN ('account-resolution', 'preflight')
              AND NEW.error IS NOT NULL
              AND NEW.provider_publication_id IS NULL
              AND NEW.claim_token IS NULL
            )
          )
          AND (
            NEW.revised_from_publication_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM publications previous
              JOIN unit_presentations previous_presentation
                ON previous_presentation.id = previous.presentation_id
              JOIN unit_revisions previous_revision
                ON previous_revision.id = previous_presentation.unit_revision_id
              JOIN units previous_unit ON previous_unit.id = previous_revision.unit_id
              WHERE previous.id = NEW.revised_from_publication_id
                AND previous_unit.workspace_id = unit.workspace_id
                AND previous.created_at <= NEW.created_at
            )
          )
          AND (
            (
              NEW.state = 'draft'
              AND NEW.error IS NULL
              AND NEW.failure_stage IS NULL
              AND NEW.claim_token IS NULL
            )
            OR (
              NEW.state = 'failed'
              AND NEW.failure_stage IN ('account-resolution', 'preflight')
              AND NEW.error IS NOT NULL
              AND NEW.claim_token IS NULL
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Publication requires a sealed Presentation, exact fresh Run, and valid rail scope');
      END;

      CREATE TRIGGER publications_identity_update_guard
      BEFORE UPDATE ON publications
      WHEN NEW.id IS NOT OLD.id
        OR NEW.presentation_id IS NOT OLD.presentation_id
        OR NEW.effective_caption_revision_id IS NOT OLD.effective_caption_revision_id
        OR NEW.effective_options_json IS NOT OLD.effective_options_json
        OR NEW.social_account_id IS NOT OLD.social_account_id
        OR NEW.submission_run_id IS NOT OLD.submission_run_id
        OR NEW.revised_from_publication_id IS NOT OLD.revised_from_publication_id
        OR NEW.rail IS NOT OLD.rail
        OR NEW.scheduled_at IS NOT OLD.scheduled_at
        OR NEW.idempotency_key IS NOT OLD.idempotency_key
        OR NEW.created_at IS NOT OLD.created_at
      BEGIN
        SELECT RAISE(ABORT, 'Publication identity and provenance are immutable');
      END;

      CREATE TRIGGER publications_provider_fields_update_guard
      BEFORE UPDATE ON publications
      WHEN NOT (
          NEW.provider_publication_id IS OLD.provider_publication_id
          OR (
            OLD.provider_publication_id IS NULL
            AND NEW.provider_publication_id IS NOT NULL
            AND OLD.claim_token IS NOT NULL
            AND NEW.claim_token IS NULL
          )
        )
        OR NOT (
          NEW.url IS OLD.url
          OR (
            OLD.url IS NULL
            AND NEW.url IS NOT NULL
            AND OLD.claim_token IS NOT NULL
            AND NEW.claim_token IS NULL
          )
        )
        OR NOT (
          NEW.submitted_at IS OLD.submitted_at
          OR (
            OLD.submitted_at IS NULL
            AND NEW.submitted_at IS NOT NULL
            AND OLD.claim_token IS NOT NULL
            AND NEW.claim_token IS NULL
            AND NEW.state IN ('scheduled', 'submitted', 'published')
          )
        )
        OR NOT (
          NEW.published_at IS OLD.published_at
          OR (
            OLD.published_at IS NULL
            AND NEW.published_at IS NOT NULL
            AND OLD.claim_token IS NOT NULL
            AND NEW.claim_token IS NULL
            AND NEW.state = 'published'
          )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Publication provider identifiers and timestamps are one-way fenced fields');
      END;

      CREATE TRIGGER publications_claim_run_update_guard
      BEFORE UPDATE ON publications
      WHEN OLD.claim_token IS NULL
        AND NEW.claim_token IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM unit_presentations presentation
          JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
          JOIN units unit ON unit.id = revision.unit_id
          JOIN runs run ON run.id = NEW.active_claim_run_id
          WHERE presentation.id = OLD.presentation_id
            AND run.workspace_id IS unit.workspace_id
            AND run.project_id IS unit.project_id
            AND run.state = 'pending'
            AND NOT EXISTS (
              SELECT 1 FROM run_attempts attempt WHERE attempt.run_id = run.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM run_results result WHERE result.run_id = run.id
            )
            AND (
              (NEW.claim_kind = 'submission' AND run.id = OLD.submission_run_id)
              OR (
                NEW.claim_kind IN (
                  'reconciliation', 'status-lookup', 'cancellation'
                )
                AND run.id <> OLD.submission_run_id
                AND NOT EXISTS (
                  SELECT 1 FROM publications reserved
                  WHERE reserved.submission_run_id = run.id
                    OR reserved.active_claim_run_id = run.id
                )
              )
            )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Publication claim requires its exact fresh Run');
      END;

      CREATE TRIGGER publications_transition_guard
      BEFORE UPDATE ON publications
      WHEN NOT (
        (
          NEW.state IS OLD.state
          AND NEW.active_claim_run_id IS OLD.active_claim_run_id
          AND NEW.claim_kind IS OLD.claim_kind
          AND NEW.claim_epoch IS OLD.claim_epoch
          AND NEW.claim_token IS OLD.claim_token
          AND NEW.claim_expires_at IS OLD.claim_expires_at
          AND NEW.provider_publication_id IS OLD.provider_publication_id
          AND NEW.url IS OLD.url
          AND NEW.submitted_at IS OLD.submitted_at
          AND NEW.published_at IS OLD.published_at
          AND NEW.error IS OLD.error
          AND NEW.failure_stage IS OLD.failure_stage
          AND NEW.updated_at IS OLD.updated_at
        )
        OR (
          OLD.state = 'draft'
          AND OLD.claim_token IS NULL
          AND NEW.state = 'submitting'
          AND NEW.claim_kind = 'submission'
          AND NEW.active_claim_run_id = OLD.submission_run_id
          AND NEW.claim_epoch = OLD.claim_epoch + 1
          AND NEW.claim_token IS NOT NULL
          AND NEW.claim_expires_at IS NOT NULL
          AND NEW.updated_at >= OLD.updated_at
        )
        OR (
          OLD.state = 'draft'
          AND OLD.claim_token IS NULL
          AND NEW.state = 'cancelled'
          AND NEW.claim_token IS NULL
          AND NEW.claim_epoch = OLD.claim_epoch
          AND NEW.updated_at >= OLD.updated_at
        )
        OR (
          OLD.claim_token IS NULL
          AND NEW.active_claim_run_id IS NOT NULL
          AND NEW.active_claim_run_id <> OLD.submission_run_id
          AND NEW.claim_epoch = OLD.claim_epoch + 1
          AND NEW.claim_token IS NOT NULL
          AND NEW.claim_expires_at IS NOT NULL
          AND (
            (
              NEW.claim_kind = 'reconciliation'
              AND OLD.state IN ('unknown', 'reconciliation_required')
              AND (
                (OLD.state = 'unknown' AND NEW.state = 'reconciliation_required')
                OR (
                  OLD.state = 'reconciliation_required'
                  AND NEW.state = OLD.state
                )
              )
            )
            OR (
              NEW.claim_kind = 'status-lookup'
              AND OLD.state IN ('scheduled', 'submitted')
              AND NEW.state = OLD.state
            )
            OR (
              NEW.claim_kind = 'cancellation'
              AND OLD.state IN ('scheduled', 'submitted')
              AND NEW.state = OLD.state
            )
          )
          AND NEW.updated_at >= OLD.updated_at
        )
        OR (
          OLD.claim_token IS NOT NULL
          AND NEW.claim_token IS NULL
          AND NEW.claim_kind IS NULL
          AND NEW.active_claim_run_id IS NULL
          AND NEW.claim_expires_at IS NULL
          AND NEW.claim_epoch = OLD.claim_epoch
          AND NEW.updated_at >= OLD.updated_at
          AND NEW.updated_at <= OLD.claim_expires_at
          AND (
            (
              OLD.claim_kind = 'submission'
              AND OLD.state = 'submitting'
              AND NEW.state IN (
                'scheduled', 'submitted', 'published', 'failed',
                'reconciliation_required', 'unknown'
              )
            )
            OR (
              OLD.claim_kind = 'reconciliation'
              AND OLD.state = 'reconciliation_required'
              AND NEW.state IN (
                'scheduled', 'submitted', 'published', 'failed', 'cancelled',
                'reconciliation_required', 'unknown'
              )
            )
            OR (
              OLD.claim_kind = 'status-lookup'
              AND (
                (OLD.state = 'scheduled' AND NEW.state IN (
                  'scheduled', 'published', 'failed', 'cancelled'
                ))
                OR (OLD.state = 'submitted' AND NEW.state IN (
                  'submitted', 'published', 'failed', 'cancelled'
                ))
              )
            )
            OR (
              OLD.claim_kind = 'cancellation'
              AND (
                (OLD.state = 'scheduled' AND NEW.state IN (
                  'scheduled', 'published', 'failed', 'cancelled',
                  'reconciliation_required', 'unknown'
                ))
                OR (OLD.state = 'submitted' AND NEW.state IN (
                  'submitted', 'published', 'failed', 'cancelled',
                  'reconciliation_required', 'unknown'
                ))
              )
            )
          )
        )
        OR (
          OLD.claim_token IS NOT NULL
          AND NEW.claim_token IS NULL
          AND NEW.claim_kind IS NULL
          AND NEW.active_claim_run_id IS NULL
          AND NEW.claim_expires_at IS NULL
          AND NEW.claim_epoch = OLD.claim_epoch + 1
          AND OLD.claim_kind IN (
            'reconciliation', 'status-lookup', 'cancellation'
          )
          AND NEW.updated_at > OLD.claim_expires_at
          AND (
            (
              OLD.claim_kind = 'status-lookup'
              AND OLD.state IN ('scheduled', 'submitted')
              AND NEW.state = OLD.state
            )
            OR (
              OLD.claim_kind = 'cancellation'
              AND OLD.state IN ('scheduled', 'submitted')
              AND NEW.state IN ('reconciliation_required', 'unknown')
            )
            OR (
              OLD.claim_kind = 'reconciliation'
              AND OLD.state = 'reconciliation_required'
              AND NEW.state IN ('reconciliation_required', 'unknown')
            )
          )
          AND NEW.updated_at >= OLD.updated_at
        )
        OR (
          OLD.claim_token IS NOT NULL
          AND NEW.claim_token IS NULL
          AND NEW.claim_kind IS NULL
          AND NEW.active_claim_run_id IS NULL
          AND NEW.claim_expires_at IS NULL
          AND NEW.claim_epoch = OLD.claim_epoch + 1
          AND OLD.claim_kind = 'submission'
          AND OLD.state = 'submitting'
          AND NEW.state IN ('reconciliation_required', 'unknown')
          AND NEW.updated_at > OLD.claim_expires_at
          AND NEW.updated_at >= OLD.updated_at
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Publication transition requires its exact fence');
      END;

      CREATE TRIGGER publications_no_delete
      BEFORE DELETE ON publications
      BEGIN
        SELECT RAISE(ABORT, 'Publications are append-only attempts');
      END;

      CREATE TRIGGER metric_snapshots_no_conflicting_insert
      BEFORE INSERT ON metric_snapshots
      WHEN EXISTS (SELECT 1 FROM metric_snapshots WHERE id = NEW.id)
      BEGIN
        SELECT RAISE(ABORT, 'Metric snapshot identity is immutable');
      END;

      CREATE TRIGGER metric_snapshots_json_insert_guard
      BEFORE INSERT ON metric_snapshots
      WHEN (
          NEW.retention_curve_json IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM json_each(NEW.retention_curve_json) point
              WHERE point.type <> 'object'
                OR (
                  json_type(point.value, '$.pct') IS NOT NULL
                  AND (
                    json_type(point.value, '$.pct') NOT IN ('integer', 'real')
                    OR json_extract(point.value, '$.pct') < 0
                    OR json_extract(point.value, '$.pct') > 100
                  )
                )
                OR (
                  json_type(point.value, '$.watchRatio') IS NOT NULL
                  AND (
                    json_type(point.value, '$.watchRatio') NOT IN ('integer', 'real')
                    OR json_extract(point.value, '$.watchRatio') < 0
                    OR json_extract(point.value, '$.watchRatio') > 1.7976931348623157e308
                  )
                )
            )
            OR EXISTS (
              SELECT 1 FROM json_tree(NEW.retention_curve_json) value
              WHERE value.type IN ('integer', 'real')
                AND (
                  value.atom < -1.7976931348623157e308
                  OR value.atom > 1.7976931348623157e308
                )
            )
          )
        )
        OR (
          NEW.raw_json IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM json_tree(NEW.raw_json) value
            WHERE value.type IN ('integer', 'real')
              AND (
                value.atom < -1.7976931348623157e308
                OR value.atom > 1.7976931348623157e308
              )
          )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Metric snapshot JSON contains invalid numeric data');
      END;

      CREATE TRIGGER metric_snapshots_no_update
      BEFORE UPDATE ON metric_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'Metric snapshots are immutable');
      END;

      CREATE TRIGGER metric_snapshots_no_delete
      BEFORE DELETE ON metric_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'Metric snapshots are immutable');
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

      CREATE TRIGGER composition_revisions_no_duplicate_insert
      BEFORE INSERT ON composition_revisions
      WHEN EXISTS (
        SELECT 1 FROM composition_revisions
        WHERE id = NEW.id
          OR (
            composition_id = NEW.composition_id
            AND revision_no = NEW.revision_no
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'composition revisions are immutable');
      END;

      CREATE TRIGGER composition_revisions_no_delete
      BEFORE DELETE ON composition_revisions
      BEGIN
        SELECT RAISE(ABORT, 'composition revisions are immutable');
      END;

      CREATE TRIGGER composition_files_no_conflicting_insert
      BEFORE INSERT ON composition_revision_files
      WHEN EXISTS (
        SELECT 1 FROM composition_revision_files
        WHERE id = NEW.id
          OR (
            composition_revision_id = NEW.composition_revision_id
            AND logical_path = NEW.logical_path
          )
          OR (
            composition_revision_id = NEW.composition_revision_id
            AND position = NEW.position
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'composition source identity is immutable');
      END;

      CREATE TRIGGER composition_files_scope_insert
      BEFORE INSERT ON composition_revision_files
      WHEN NOT EXISTS (
        SELECT 1
        FROM composition_revisions r
        JOIN compositions c ON c.id = r.composition_id
        JOIN projects p ON p.id = c.project_id
        JOIN objects o ON o.id = NEW.object_id
        WHERE r.id = NEW.composition_revision_id
          AND o.workspace_id = p.workspace_id
          AND (o.project_id IS NULL OR o.project_id = p.id)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Composition source Object is outside its Project scope');
      END;

      CREATE TRIGGER composition_files_scope_update
      BEFORE UPDATE OF composition_revision_id, object_id ON composition_revision_files
      WHEN NOT EXISTS (
        SELECT 1
        FROM composition_revisions r
        JOIN compositions c ON c.id = r.composition_id
        JOIN projects p ON p.id = c.project_id
        JOIN objects o ON o.id = NEW.object_id
        WHERE r.id = NEW.composition_revision_id
          AND o.workspace_id = p.workspace_id
          AND (o.project_id IS NULL OR o.project_id = p.id)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Composition source Object is outside its Project scope');
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

      CREATE TRIGGER composition_inputs_no_conflicting_insert
      BEFORE INSERT ON composition_inputs
      WHEN EXISTS (
        SELECT 1 FROM composition_inputs
        WHERE id = NEW.id
          OR (
            composition_revision_id = NEW.composition_revision_id
            AND position = NEW.position
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'composition input identity is immutable');
      END;

      CREATE TRIGGER composition_inputs_scope_insert
      BEFORE INSERT ON composition_inputs
      WHEN NOT EXISTS (
        SELECT 1
        FROM composition_revisions r
        JOIN compositions c ON c.id = r.composition_id
        JOIN projects p ON p.id = c.project_id
        JOIN artifact_revisions ar ON ar.id = NEW.artifact_revision_id
        JOIN artifacts a ON a.id = ar.artifact_id
        JOIN objects o ON o.id = ar.object_id
        WHERE r.id = NEW.composition_revision_id
          AND a.workspace_id = p.workspace_id
          AND (a.project_id IS NULL OR a.project_id = p.id)
          AND o.workspace_id = a.workspace_id
          AND (
            (a.project_id IS NULL AND o.project_id IS NULL)
            OR (
              a.project_id IS NOT NULL
              AND (o.project_id IS NULL OR o.project_id = a.project_id)
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Composition input Artifact is outside its Project scope');
      END;

      CREATE TRIGGER composition_inputs_scope_update
      BEFORE UPDATE OF composition_revision_id, artifact_revision_id ON composition_inputs
      WHEN NOT EXISTS (
        SELECT 1
        FROM composition_revisions r
        JOIN compositions c ON c.id = r.composition_id
        JOIN projects p ON p.id = c.project_id
        JOIN artifact_revisions ar ON ar.id = NEW.artifact_revision_id
        JOIN artifacts a ON a.id = ar.artifact_id
        JOIN objects o ON o.id = ar.object_id
        WHERE r.id = NEW.composition_revision_id
          AND a.workspace_id = p.workspace_id
          AND (a.project_id IS NULL OR a.project_id = p.id)
          AND o.workspace_id = a.workspace_id
          AND (
            (a.project_id IS NULL AND o.project_id IS NULL)
            OR (
              a.project_id IS NOT NULL
              AND (o.project_id IS NULL OR o.project_id = a.project_id)
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Composition input Artifact is outside its Project scope');
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

      CREATE TRIGGER builds_no_conflicting_insert
      BEFORE INSERT ON builds
      WHEN EXISTS (SELECT 1 FROM builds WHERE id = NEW.id)
      BEGIN
        SELECT RAISE(ABORT, 'Build identity is immutable');
      END;

      CREATE TRIGGER builds_scope_state_insert
      BEFORE INSERT ON builds
      WHEN NOT EXISTS (
        SELECT 1
        FROM composition_revisions revision
        JOIN compositions composition ON composition.id = revision.composition_id
        JOIN projects project ON project.id = composition.project_id
        WHERE revision.id = NEW.composition_revision_id
          AND revision.state = 'sealed'
          AND (
            NEW.run_id IS NULL
            OR EXISTS (
              SELECT 1 FROM runs run
              WHERE run.id = NEW.run_id
                AND run.workspace_id = project.workspace_id
                AND run.project_id = project.id
            )
          )
          AND (
            (
              NEW.state = 'pending'
              AND NEW.started_at IS NULL
              AND NEW.ended_at IS NULL
              AND NEW.error IS NULL
            )
            OR (
              NEW.state = 'running'
              AND NEW.started_at IS NOT NULL
              AND NEW.started_at >= NEW.created_at
              AND NEW.ended_at IS NULL
              AND NEW.error IS NULL
            )
            OR (
              NEW.state = 'succeeded'
              AND NEW.started_at IS NOT NULL
              AND NEW.started_at >= NEW.created_at
              AND NEW.ended_at IS NOT NULL
              AND NEW.ended_at >= NEW.started_at
              AND NEW.error IS NULL
            )
            OR (
              NEW.state IN ('failed', 'cancelled')
              AND NEW.started_at IS NOT NULL
              AND NEW.started_at >= NEW.created_at
              AND NEW.ended_at IS NOT NULL
              AND NEW.ended_at >= NEW.started_at
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Build requires a sealed revision, exact Project Run, and valid state timestamps');
      END;

      CREATE TRIGGER builds_scope_state_update
      BEFORE UPDATE ON builds
      WHEN NOT EXISTS (
        SELECT 1
        FROM composition_revisions revision
        JOIN compositions composition ON composition.id = revision.composition_id
        JOIN projects project ON project.id = composition.project_id
        WHERE revision.id = NEW.composition_revision_id
          AND revision.state = 'sealed'
          AND (
            NEW.run_id IS NULL
            OR EXISTS (
              SELECT 1 FROM runs run
              WHERE run.id = NEW.run_id
                AND run.workspace_id = project.workspace_id
                AND run.project_id = project.id
            )
          )
          AND (
            (
              NEW.state = 'pending'
              AND NEW.started_at IS NULL
              AND NEW.ended_at IS NULL
              AND NEW.error IS NULL
            )
            OR (
              NEW.state = 'running'
              AND NEW.started_at IS NOT NULL
              AND NEW.started_at >= NEW.created_at
              AND NEW.ended_at IS NULL
              AND NEW.error IS NULL
            )
            OR (
              NEW.state = 'succeeded'
              AND NEW.started_at IS NOT NULL
              AND NEW.started_at >= NEW.created_at
              AND NEW.ended_at IS NOT NULL
              AND NEW.ended_at >= NEW.started_at
              AND NEW.error IS NULL
            )
            OR (
              NEW.state IN ('failed', 'cancelled')
              AND NEW.started_at IS NOT NULL
              AND NEW.started_at >= NEW.created_at
              AND NEW.ended_at IS NOT NULL
              AND NEW.ended_at >= NEW.started_at
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Build requires a sealed revision, exact Project Run, and valid state timestamps');
      END;

      CREATE TRIGGER builds_update_guard
      BEFORE UPDATE ON builds
      WHEN NOT (
        NEW.id IS OLD.id
        AND NEW.composition_revision_id IS OLD.composition_revision_id
        AND NEW.run_id IS OLD.run_id
        AND NEW.profile_json IS OLD.profile_json
        AND NEW.created_at IS OLD.created_at
        AND (
          (
            OLD.state = 'pending'
            AND NEW.state = 'running'
            AND NEW.started_at IS NOT NULL
            AND NEW.ended_at IS NULL
            AND NEW.error IS NULL
          )
          OR (
            OLD.state = 'running'
            AND NEW.state IN ('succeeded', 'failed', 'cancelled')
            AND NEW.started_at IS OLD.started_at
            AND NEW.ended_at IS NOT NULL
          )
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Build identity and terminal state are immutable');
      END;

      CREATE TRIGGER builds_no_delete
      BEFORE DELETE ON builds
      BEGIN
        SELECT RAISE(ABORT, 'Build identity is immutable');
      END;

      CREATE TRIGGER build_outputs_running_insert
      BEFORE INSERT ON build_outputs
      WHEN COALESCE((SELECT state FROM builds WHERE id = NEW.build_id), '') <> 'running'
      BEGIN
        SELECT RAISE(ABORT, 'Build outputs require a running Build');
      END;

      CREATE TRIGGER build_outputs_scope_insert
      BEFORE INSERT ON build_outputs
      WHEN NOT EXISTS (
        SELECT 1
        FROM builds build
        JOIN composition_revisions revision ON revision.id = build.composition_revision_id
        JOIN compositions composition ON composition.id = revision.composition_id
        JOIN projects project ON project.id = composition.project_id
        JOIN artifact_revisions ar ON ar.id = NEW.artifact_revision_id
        JOIN artifacts artifact ON artifact.id = ar.artifact_id
        JOIN objects object ON object.id = ar.object_id
        WHERE build.id = NEW.build_id
          AND artifact.workspace_id = project.workspace_id
          AND artifact.project_id = project.id
          AND object.workspace_id = artifact.workspace_id
          AND (object.project_id IS NULL OR object.project_id = artifact.project_id)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Build output requires an exact Project Artifact revision');
      END;

      CREATE TRIGGER build_outputs_scope_update
      BEFORE UPDATE OF build_id, artifact_revision_id ON build_outputs
      WHEN NOT EXISTS (
        SELECT 1
        FROM builds build
        JOIN composition_revisions revision ON revision.id = build.composition_revision_id
        JOIN compositions composition ON composition.id = revision.composition_id
        JOIN projects project ON project.id = composition.project_id
        JOIN artifact_revisions ar ON ar.id = NEW.artifact_revision_id
        JOIN artifacts artifact ON artifact.id = ar.artifact_id
        JOIN objects object ON object.id = ar.object_id
        WHERE build.id = NEW.build_id
          AND artifact.workspace_id = project.workspace_id
          AND artifact.project_id = project.id
          AND object.workspace_id = artifact.workspace_id
          AND (object.project_id IS NULL OR object.project_id = artifact.project_id)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Build output requires an exact Project Artifact revision');
      END;

      CREATE TRIGGER build_outputs_no_conflicting_insert
      BEFORE INSERT ON build_outputs
      WHEN EXISTS (
        SELECT 1 FROM build_outputs
        WHERE id = NEW.id
          OR (build_id = NEW.build_id AND position = NEW.position)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Build output identity is immutable');
      END;

      CREATE TRIGGER build_outputs_no_update
      BEFORE UPDATE ON build_outputs
      BEGIN
        SELECT RAISE(ABORT, 'Build outputs are immutable');
      END;

      CREATE TRIGGER build_outputs_no_delete
      BEFORE DELETE ON build_outputs
      BEGIN
        SELECT RAISE(ABORT, 'Build outputs are immutable');
      END;

      CREATE TRIGGER build_document_bindings_active_insert
      BEFORE INSERT ON build_document_bindings
      WHEN COALESCE((SELECT state FROM builds WHERE id = NEW.build_id), '') NOT IN ('pending', 'running')
      BEGIN
        SELECT RAISE(ABORT, 'Build Document bindings require a pending or running Build');
      END;

      CREATE TRIGGER build_document_bindings_scope_insert
      BEFORE INSERT ON build_document_bindings
      WHEN NOT EXISTS (
        SELECT 1
        FROM builds build
        JOIN composition_revisions revision ON revision.id = build.composition_revision_id
        JOIN compositions composition ON composition.id = revision.composition_id
        JOIN projects project ON project.id = composition.project_id
        JOIN document_revisions dr ON dr.id = NEW.document_revision_id
        JOIN documents document ON document.id = dr.document_id
        WHERE build.id = NEW.build_id
          AND document.workspace_id = project.workspace_id
          AND (document.project_id IS NULL OR document.project_id = project.id)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Build Document binding is outside its Project scope');
      END;

      CREATE TRIGGER build_document_bindings_scope_update
      BEFORE UPDATE OF build_id, document_revision_id ON build_document_bindings
      WHEN NOT EXISTS (
        SELECT 1
        FROM builds build
        JOIN composition_revisions revision ON revision.id = build.composition_revision_id
        JOIN compositions composition ON composition.id = revision.composition_id
        JOIN projects project ON project.id = composition.project_id
        JOIN document_revisions dr ON dr.id = NEW.document_revision_id
        JOIN documents document ON document.id = dr.document_id
        WHERE build.id = NEW.build_id
          AND document.workspace_id = project.workspace_id
          AND (document.project_id IS NULL OR document.project_id = project.id)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Build Document binding is outside its Project scope');
      END;

      CREATE TRIGGER build_document_bindings_no_conflicting_insert
      BEFORE INSERT ON build_document_bindings
      WHEN EXISTS (
        SELECT 1 FROM build_document_bindings
        WHERE id = NEW.id
          OR (build_id = NEW.build_id AND role = NEW.role)
      )
      BEGIN
        SELECT RAISE(ABORT, 'Build Document binding identity is immutable');
      END;

      CREATE TRIGGER build_document_bindings_no_update
      BEFORE UPDATE ON build_document_bindings
      BEGIN
        SELECT RAISE(ABORT, 'Build Document bindings are immutable');
      END;

      CREATE TRIGGER build_document_bindings_no_delete
      BEFORE DELETE ON build_document_bindings
      BEGIN
        SELECT RAISE(ABORT, 'Build Document bindings are immutable');
      END;

      CREATE TRIGGER activity_events_no_update
      BEFORE UPDATE ON activity_events
      BEGIN
        SELECT RAISE(ABORT, 'activity events are append-only');
      END;

      CREATE TRIGGER activity_events_no_duplicate_insert
      BEFORE INSERT ON activity_events
      WHEN EXISTS (SELECT 1 FROM activity_events WHERE id = NEW.id)
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
  const optimisticVersion = readUserVersion(db);
  if (optimisticVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${optimisticVersion} is newer than supported version ${SCHEMA_VERSION}`,
    );
  }
  if (optimisticVersion === SCHEMA_VERSION) return;
  if (optimisticVersion < SCHEMA_VERSION && databaseHasUserTables(db)) {
    backupDatabase(db, optimisticVersion);
  }

  db.exec("BEGIN EXCLUSIVE");
  try {
    const current = readUserVersion(db);
    if (current > SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${current} is newer than supported version ${SCHEMA_VERSION}`,
      );
    }

    const pending = MIGRATIONS.filter(
      (migration) => migration.version > current,
    );
    assertOrderedMigrations(current, pending);

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
