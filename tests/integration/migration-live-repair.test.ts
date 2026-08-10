import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  classifierVersion,
  classifyCompositionLocator,
  classifyRenderLocator,
  decodeHyperframesGenerationEvidence,
} from "../../cli/lib/migration/import.js";
import { insertTask2d2SupplementalRef } from "../../cli/lib/migration/live-repair.js";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import * as compositions from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import {
  applyMigrations,
  MIGRATIONS,
  SCHEMA_VERSION,
} from "../../cli/lib/store/schema.js";
import { makeTmpRoot } from "../helpers/tmp-root.js";
import { storedObjectPath } from "../helpers/stored-object.js";

const RUN_ID = "mig_00000000-0000-4000-8000-000000000201";
const SOURCE_ID = "mig_00000000-0000-4000-8000-000000000202";
const ENTRY_ID = "mentry_00000000-0000-4000-8000-000000000203";
const UUID = "00000000-0000-4000-8000-000000000204";
const GENERATION_DOCUMENT_REVISION_ID = "drev_00000000-0000-4000-8000-000000000210";
const REPAIR_WORKSPACE_ID = "ws_00000000-0000-4000-8000-000000000211";
const REPAIR_PROJECT_ID = "prj_00000000-0000-4000-8000-000000000212";
const REPAIR_OBJECT_ID = "obj_00000000-0000-4000-8000-000000000213";
const REPAIR_ARTIFACT_ID = "art_00000000-0000-4000-8000-000000000214";
const REPAIR_ARTIFACT_REVISION_ID = "arev_00000000-0000-4000-8000-000000000215";
const REPAIR_TARGETS = {
  comp: "comp_00000000-0000-4000-8000-000000000221",
  crev: "crev_00000000-0000-4000-8000-000000000222",
  cfile: "cfile_00000000-0000-4000-8000-000000000223",
  run: "run_00000000-0000-4000-8000-000000000224",
  attempt: "attempt_00000000-0000-4000-8000-000000000225",
  build: "build_00000000-0000-4000-8000-000000000226",
  output: "output_00000000-0000-4000-8000-000000000227",
  result: "result_00000000-0000-4000-8000-000000000228",
} as const;

describe("shared task 2d2 contracts", () => {
  test("shares the exact Task 2D1 canonical locator classifier", () => {
    const projectLocator = "workspaces/studio/projects/campaign";

    expect(classifierVersion).toBe("task-2d1-v1");
    expect(classifyCompositionLocator({ value: "index.html", projectLocator }))
      .toEqual({ kind: "root", canonicalProjectRelative: "index.html" });
    expect(classifyCompositionLocator({
      value: `${projectLocator}/compositions/variant.html`,
      projectLocator,
    })).toEqual({
      kind: "snapshot",
      canonicalProjectRelative: "compositions/variant.html",
    });
    expect(classifyRenderLocator({ value: "render/final.mp4", projectLocator }))
      .toEqual({ kind: "render", canonicalProjectRelative: "render/final.mp4" });

    for (const value of [
      "/index.html",
      "compositions\\variant.html",
      "compositions/../variant.html",
      "compositions//variant.html",
      "compositions/nested/variant.html",
    ]) {
      expect(classifyCompositionLocator({ value, projectLocator }).kind).toBe("invalid");
    }
    for (const invalidProjectLocator of [
      "workspaces/../projects/campaign",
      "projects/.",
    ]) {
      expect(classifyCompositionLocator({
        value: "index.html",
        projectLocator: invalidProjectLocator,
      }).kind).toBe("invalid");
    }
  });

  test("requires generation Document and owning-entry scope consistency", () => {
    const body = {
      endpoint: "hyperframes-render",
      status: "ok",
      timestamp: "2026-08-01T00:00:01.000Z",
      input: {
        composition: "index.html",
        project: "campaign",
        workspace: "studio",
      },
      output: { local: "render/final.mp4", bytes: 42 },
    } as const;
    const input = {
      body,
      documentProjectId: "prj_00000000-0000-4000-8000-000000000205",
      owningEntryWorkspaceId: "ws_00000000-0000-4000-8000-000000000206",
      owningEntryProjectId: "prj_00000000-0000-4000-8000-000000000205",
      projectLocator: "workspaces/studio/projects/campaign",
    };

    expect(decodeHyperframesGenerationEvidence(input)).toMatchObject({ kind: "eligible" });
    expect(decodeHyperframesGenerationEvidence({
      ...input,
      documentProjectId: "prj_00000000-0000-4000-8000-000000000207",
    })).toEqual({ kind: "needs-review", reason: "scope-mismatch" });
    expect(decodeHyperframesGenerationEvidence({
      ...input,
      body: { ...body, input: { ...body.input, workspace: "other" } },
    })).toEqual({ kind: "needs-review", reason: "scope-mismatch" });
  });

  test("reproduces the production Composition manifest from metadata only", async () => {
    const root = makeTmpRoot("ralphy-task-2d2-manifest");
    try {
      const workspace = createWorkspace({ slug: "studio", name: "Studio" });
      const project = createProject({
        workspaceId: workspace.id,
        slug: "campaign",
        name: "Campaign",
      });
      const storeSource = async (name: string, body: string) => {
        const sourcePath = path.join(root.dir, name);
        fs.writeFileSync(sourcePath, body);
        return ingestObject({
          scope: { workspaceId: workspace.id, projectId: project.id },
          sourcePath,
          originalName: name,
          mime: "text/html",
          storageClass: "working",
        });
      };
      const firstObject = await storeSource("first.html", "<main>first</main>");
      const secondObject = await storeSource("second.html", "<main>second</main>");
      const firstArtifact = createArtifact({
        projectId: project.id,
        slug: "first-input",
        kind: "video",
      });
      const secondArtifact = createArtifact({
        projectId: project.id,
        slug: "second-input",
        kind: "video",
      });
      const firstInput = addArtifactRevision({
        artifactId: firstArtifact.id,
        objectId: firstObject.id,
        state: "approved",
        metadata: { nested: { ordinal: 1 } },
      });
      const secondInput = addArtifactRevision({
        artifactId: secondArtifact.id,
        objectId: secondObject.id,
        state: "approved",
        metadata: { nested: { ordinal: 2 } },
      });
      const composition = compositions.createComposition({
        projectId: project.id,
        slug: "recovered-video",
        kind: "video",
      });
      const revision = compositions.reviseComposition({
        compositionId: composition.id,
        expectedLatestRevisionId: null,
        engine: "hyperframes",
        engineVersion: null,
        engineConfig: {
          recovery: {
            migrationEntryId: ENTRY_ID,
            version: "task-2d2-v1",
            evidence: { flags: ["first", "second"], nullable: null },
          },
        },
      });
      compositions.putCompositionSource({
        revisionId: revision.id,
        logicalPath: "second.html",
        objectId: secondObject.id,
        position: 1,
      });
      compositions.putCompositionSource({
        revisionId: revision.id,
        logicalPath: "first.html",
        objectId: firstObject.id,
        position: 0,
      });
      compositions.bindCompositionInput({
        revisionId: revision.id,
        artifactRevisionId: secondInput.id,
        role: "secondary",
        position: 1,
        config: null,
      });
      compositions.bindCompositionInput({
        revisionId: revision.id,
        artifactRevisionId: firstInput.id,
        role: "primary",
        position: 0,
        config: { trim: { start: 0, end: 3 }, options: ["safe", { nested: true }] },
      });
      compositions.sealCompositionRevision({ revisionId: revision.id });
      expect(openDomainDb().query<{ sources: number; inputs: number }, [string]>(
        `SELECT
           (SELECT COUNT(*) FROM composition_revision_files WHERE composition_revision_id = ?) AS sources,
           (SELECT COUNT(*) FROM composition_inputs WHERE composition_revision_id = ?) AS inputs`,
      ).get(revision.id, revision.id)).toEqual({ sources: 2, inputs: 2 });
      const db = openDomainDb();
      const row = db.query<{
        manifestSha256: string;
        kind: "video";
        engine: string;
        engineVersion: string | null;
        engineConfigJson: string;
      }, [string]>(
        `SELECT revision.manifest_sha256 AS manifestSha256,
                composition.kind,
                revision.engine,
                revision.engine_version AS engineVersion,
                revision.engine_config_json AS engineConfigJson
         FROM composition_revisions revision
         JOIN compositions composition ON composition.id = revision.composition_id
         WHERE revision.id = ?`,
      ).get(revision.id)!;
      const sources = db.query<{
        logicalPath: string;
        position: number;
        objectId: string;
        sha256: string;
      }, [string]>(
        `SELECT file.logical_path AS logicalPath, file.position, file.object_id AS objectId,
                object.sha256
         FROM composition_revision_files file
         JOIN objects object ON object.id = file.object_id
         WHERE file.composition_revision_id = ?
         ORDER BY file.position, file.logical_path`,
      ).all(revision.id);
      const inputs = db.query<{
        position: number;
        artifactRevisionId: string;
        role: string;
        configJson: string | null;
      }, [string]>(
        `SELECT position, artifact_revision_id AS artifactRevisionId, role,
                config_json AS configJson
         FROM composition_inputs
         WHERE composition_revision_id = ?
         ORDER BY position`,
      ).all(revision.id).map(({ configJson, ...input }) => ({
        ...input,
        config: configJson === null ? null : JSON.parse(configJson),
      }));
      fs.rmSync(storedObjectPath(firstObject.id));
      fs.rmSync(storedObjectPath(secondObject.id));

      expect(compositions.compositionManifestSha256({
        kind: row.kind,
        engine: row.engine,
        engineVersion: row.engineVersion,
        engineConfig: JSON.parse(row.engineConfigJson),
        sources,
        inputs,
      })).toBe(row.manifestSha256);
    } finally {
      closeDomainDb();
      root.cleanup();
    }
  });

  test("upgrades schema 5 to the exact supplemental-ref schema 6", () => {
    const db = openV5Database();
    seedV5TerminalEntry(db);
    const targetRefsJson = JSON.stringify([RUN_ID]);
    const beforeCount = db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM migration_entries",
    ).get()!.count;
    const beforeEntry = db.query<Record<string, unknown>, [string]>(
      "SELECT * FROM migration_entries WHERE id = ?",
    ).get(ENTRY_ID);
    expect(beforeCount).toBe(1);
    expect(beforeEntry?.target_refs_json).toBe(targetRefsJson);

    applyMigrations(db);

    expect(SCHEMA_VERSION).toBe(6);
    expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 6 });
    expect(db.query("SELECT version FROM schema_migrations ORDER BY version").all())
      .toEqual([1, 2, 3, 4, 5, 6].map((version) => ({ version })));
    expect(db.query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_entry_supplemental_refs'",
    ).get()).toEqual({ name: "migration_entry_supplemental_refs" });
    expect(db.query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_migration_entry_supplemental_refs_repair'",
    ).get()).toEqual({ name: "idx_migration_entry_supplemental_refs_repair" });
    expect(db.query<{ name: string }, []>(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND tbl_name = 'migration_entry_supplemental_refs'
       ORDER BY name`,
    ).all()).toEqual([
      { name: "migration_supplemental_refs_conflicting_insert" },
      { name: "migration_supplemental_refs_no_delete" },
      { name: "migration_supplemental_refs_no_update" },
    ]);
    expect(db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM migration_entries",
    ).get()!.count).toBe(beforeCount);
    expect(db.query<Record<string, unknown>, [string]>(
      "SELECT * FROM migration_entries WHERE id = ?",
    ).get(ENTRY_ID)).toEqual(beforeEntry);
    db.close();
  });

  test("accepts only the eight canonical repair target prefixes", () => {
    const db = openV6DatabaseWithEntry();
    for (const prefix of [
      "comp", "crev", "cfile", "run", "attempt", "build", "output", "result",
    ]) {
      db.prepare(
        `INSERT INTO migration_entry_supplemental_refs
         (migration_entry_id, target_ref, repair_key, created_at)
         VALUES (?, ?, 'task-2d2-v1', 1)`,
      ).run(ENTRY_ID, `${prefix}_${UUID}`);
    }

    for (const targetRef of [
      `provider/test/${UUID}`,
      `obj_${UUID}`,
      "comp_00000000-0000-3000-8000-000000000204",
      "comp_00000000-0000-4000-7000-000000000204",
      "comp_00000000-0000-4000-8000-00000000020A",
      "comp_00000000-0000-4000-8000-00000000020g",
      "comp_00000000-0000-4000-8000-00000000020-",
      "comp_00000000-0000-4000-8000-000000000204-extra",
    ]) {
      expect(() => db.prepare(
        `INSERT INTO migration_entry_supplemental_refs
         (migration_entry_id, target_ref, repair_key, created_at)
         VALUES (?, ?, 'task-2d2-v1', 1)`,
      ).run(ENTRY_ID, targetRef)).toThrow(/CHECK constraint failed/u);
    }
    db.close();
  });

  test("rejects supplemental-ref update, delete, and conflicting insert", () => {
    const db = openV6DatabaseWithEntry();
    const targetRef = `comp_${UUID}`;
    db.prepare(
      `INSERT INTO migration_entry_supplemental_refs
       (migration_entry_id, target_ref, repair_key, created_at)
       VALUES (?, ?, 'task-2d2-v1', 1)`,
    ).run(ENTRY_ID, targetRef);

    expect(() => db.prepare(
      "UPDATE migration_entry_supplemental_refs SET created_at = 2 WHERE migration_entry_id = ?",
    ).run(ENTRY_ID)).toThrow("supplemental migration refs are append-only");
    expect(() => db.prepare(
      "DELETE FROM migration_entry_supplemental_refs WHERE migration_entry_id = ?",
    ).run(ENTRY_ID)).toThrow("supplemental migration refs are append-only");
    expect(() => db.prepare(
      `INSERT INTO migration_entry_supplemental_refs
       (migration_entry_id, target_ref, repair_key, created_at)
       VALUES (?, ?, 'task-2d2-v1', 1)`,
    ).run(ENTRY_ID, targetRef)).toThrow("supplemental migration ref already exists");
    expect(() => db.prepare(
      "UPDATE migration_entry_supplemental_refs SET created_at = created_at WHERE migration_entry_id = ?",
    ).run(ENTRY_ID)).toThrow("supplemental migration refs are append-only");
    for (const conflict of ["OR IGNORE", "OR REPLACE"]) {
      expect(() => db.prepare(
        `INSERT ${conflict} INTO migration_entry_supplemental_refs
         (migration_entry_id, target_ref, repair_key, created_at)
         VALUES (?, ?, 'task-2d2-v1', 1)`,
      ).run(ENTRY_ID, targetRef)).toThrow("supplemental migration ref already exists");
    }
    db.close();
  });

  test("validates all Task 2D2 target families before supplemental-ref insertion", () => {
    const db = openV6DatabaseWithEntry();
    insertRepairTargets(db);
    for (const targetRef of Object.values(REPAIR_TARGETS)) {
      insertTask2d2SupplementalRef(db, {
        migrationEntryId: ENTRY_ID,
        targetRef,
        createdAt: 2,
      });
    }
    expect(db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM migration_entry_supplemental_refs",
    ).get()).toEqual({ count: 8 });

    for (const targetRef of [
      "comp_00000000-0000-4000-8000-000000000231",
      "crev_00000000-0000-4000-8000-000000000232",
      "cfile_00000000-0000-4000-8000-000000000233",
      "run_00000000-0000-4000-8000-000000000234",
      "attempt_00000000-0000-4000-8000-000000000235",
      "build_00000000-0000-4000-8000-000000000236",
      "output_00000000-0000-4000-8000-000000000237",
      "result_00000000-0000-4000-8000-000000000238",
    ]) {
      expect(() => insertTask2d2SupplementalRef(db, {
        migrationEntryId: ENTRY_ID,
        targetRef,
        createdAt: 2,
      })).toThrow(/target does not exist/u);
    }
    for (const targetRef of [`provider/test/${UUID}`, `obj_${UUID}`]) {
      expect(() => insertTask2d2SupplementalRef(db, {
        migrationEntryId: ENTRY_ID,
        targetRef,
        createdAt: 2,
      })).toThrow(/canonical Task 2D2 target/u);
    }

    const wrongTableId = "comp_00000000-0000-4000-8000-000000000239";
    db.prepare(
      `INSERT INTO runs (id, kind, state, created_at)
       VALUES (?, 'wrong-table-fixture', 'pending', 1)`,
    ).run(wrongTableId);
    expect(() => insertTask2d2SupplementalRef(db, {
      migrationEntryId: ENTRY_ID,
      targetRef: wrongTableId,
      createdAt: 2,
    })).toThrow(/target does not exist/u);
    db.close();
  });

});

function openV5Database(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of MIGRATIONS.filter(({ version }) => version <= 5)) {
    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, 1)")
      .run(migration.version);
    db.exec(`PRAGMA user_version = ${migration.version}`);
  }
  return db;
}

function openV6DatabaseWithEntry(): Database {
  const db = openV5Database();
  seedV5TerminalEntry(db);
  applyMigrations(db);
  return db;
}

function seedV5TerminalEntry(db: Database): void {
  db.prepare(
    `INSERT INTO migration_runs (id, phase, created_at, updated_at)
     VALUES (?, 'cutover', 1, 1)`,
  ).run(RUN_ID);
  db.prepare(
    `INSERT INTO migration_sources
     (id, migration_run_id, source_kind, source_label, canonical_path_hash,
      source_device, source_inode, source_mode, created_at)
     VALUES (?, ?, 'ralphy', 'fixture', ?, '1', '1', 0, 1)`,
  ).run(SOURCE_ID, RUN_ID, "a".repeat(64));
  db.prepare(
    `INSERT INTO migration_entries
     (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
      entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
      bytes, mtime_ms, target_refs_json, state, terminal_at, created_at, updated_at)
     VALUES (?, ?, ?, 'fixture', ?, 'directory', 'ralphy', 'domain', '1', '1', 0,
             0, 0, ?, 'imported', 1, 1, 1)`,
  ).run(
    ENTRY_ID,
    RUN_ID,
    SOURCE_ID,
    "b".repeat(64),
    JSON.stringify([RUN_ID]),
  );
}

function insertRepairTargets(db: Database): void {
  db.prepare(
    `INSERT INTO workspaces (id, slug, name, created_at, updated_at)
     VALUES (?, 'repair', 'Repair', 1, 1)`,
  ).run(REPAIR_WORKSPACE_ID);
  db.prepare(
    `INSERT INTO projects (id, workspace_id, slug, name, created_at, updated_at)
     VALUES (?, ?, 'repair', 'Repair', 1, 1)`,
  ).run(REPAIR_PROJECT_ID, REPAIR_WORKSPACE_ID);
  db.prepare(
    `INSERT INTO objects
     (id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes,
      storage_class, original_name, created_at)
     VALUES (?, ?, ?, 'local', 'fixture', 'fixture', ?, 'application/octet-stream',
             1, 'working', 'fixture', 1)`,
  ).run(REPAIR_OBJECT_ID, REPAIR_WORKSPACE_ID, REPAIR_PROJECT_ID, "a".repeat(64));
  db.prepare(
    `INSERT INTO artifacts
     (id, workspace_id, project_id, slug, kind, created_at, updated_at)
     VALUES (?, ?, ?, 'repair', 'video', 1, 1)`,
  ).run(REPAIR_ARTIFACT_ID, REPAIR_WORKSPACE_ID, REPAIR_PROJECT_ID);
  db.prepare(
    `INSERT INTO artifact_revisions
     (id, artifact_id, object_id, revision_no, state, created_at)
     VALUES (?, ?, ?, 1, 'working', 1)`,
  ).run(REPAIR_ARTIFACT_REVISION_ID, REPAIR_ARTIFACT_ID, REPAIR_OBJECT_ID);
  db.prepare(
    `INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at)
     VALUES (?, ?, 'repair', 'video', 1, 1)`,
  ).run(REPAIR_TARGETS.comp, REPAIR_PROJECT_ID);
  db.prepare(
    `INSERT INTO composition_revisions
     (id, composition_id, revision_no, engine, engine_config_json, created_at)
     VALUES (?, ?, 1, 'hyperframes', ?, 1)`,
  ).run(REPAIR_TARGETS.crev, REPAIR_TARGETS.comp, JSON.stringify({
    recovery: { version: "task-2d2-v1", migrationEntryId: ENTRY_ID },
  }));
  db.prepare(
    `INSERT INTO composition_revision_files
     (id, composition_revision_id, logical_path, object_id, position, created_at)
     VALUES (?, ?, 'index.html', ?, 0, 1)`,
  ).run(REPAIR_TARGETS.cfile, REPAIR_TARGETS.crev, REPAIR_OBJECT_ID);
  db.prepare(
    `UPDATE composition_revisions
     SET state = 'sealed', manifest_sha256 = ?, sealed_at = 1
     WHERE id = ?`,
  ).run("b".repeat(64), REPAIR_TARGETS.crev);
  db.prepare(
    `INSERT INTO runs
     (id, workspace_id, project_id, kind, state, metadata_json, created_at)
     VALUES (?, ?, ?, 'composition.build', 'pending', ?, 1)`,
  ).run(REPAIR_TARGETS.run, REPAIR_WORKSPACE_ID, REPAIR_PROJECT_ID, JSON.stringify({
    repairKey: "task-2d2-v1",
    migrationRunId: RUN_ID,
    generationDocumentRevisionId: GENERATION_DOCUMENT_REVISION_ID,
    sourceMigrationEntryId: ENTRY_ID,
    outputMigrationEntryId: ENTRY_ID,
  }));
  db.prepare("UPDATE runs SET state = 'running', started_at = 1 WHERE id = ?")
    .run(REPAIR_TARGETS.run);
  db.prepare(
    `INSERT INTO run_attempts (id, run_id, attempt_no, state, started_at)
     VALUES (?, ?, 1, 'pending', 1)`,
  ).run(REPAIR_TARGETS.attempt, REPAIR_TARGETS.run);
  db.prepare(
    `INSERT INTO builds
     (id, composition_revision_id, run_id, state, profile_json, created_at)
     VALUES (?, ?, ?, 'pending', '{}', 1)`,
  ).run(REPAIR_TARGETS.build, REPAIR_TARGETS.crev, REPAIR_TARGETS.run);
  db.prepare("UPDATE builds SET state = 'running', started_at = 1 WHERE id = ?")
    .run(REPAIR_TARGETS.build);
  db.prepare(
    `INSERT INTO build_outputs
     (id, build_id, artifact_revision_id, position, created_at)
     VALUES (?, ?, ?, 0, 1)`,
  ).run(REPAIR_TARGETS.output, REPAIR_TARGETS.build, REPAIR_ARTIFACT_REVISION_ID);
  db.prepare("UPDATE builds SET state = 'succeeded', ended_at = 1 WHERE id = ?")
    .run(REPAIR_TARGETS.build);
  db.prepare(
    `INSERT INTO run_results
     (id, run_id, position, entity_type, entity_id, created_at)
     VALUES (?, ?, 0, 'build', ?, 1)`,
  ).run(REPAIR_TARGETS.result, REPAIR_TARGETS.run, REPAIR_TARGETS.build);
}
