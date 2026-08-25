import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  classifierVersion,
  classifyCompositionLocator,
  classifyRenderLocator,
  decodeHyperframesGenerationEvidence,
} from "../../cli/lib/migration/import.js";
import { migrationStableId } from "../../cli/lib/migration/stable-id.js";
import {
  buildLiveRepairPlan,
  deriveLiveRepairReport,
  insertTask2d2SupplementalRef,
  materializeLiveRepairValue,
} from "../../cli/lib/migration/live-repair.js";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import * as compositions from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import {
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
  test("materializes only top-level repair derivations for SQLite bindings", () => {
    const nestedSentinels = {
      metadata: {
        derive: "repairTimestamp",
        markerLike: {
          derive: "planSha256",
          encoding: "task-2d2-marker-json",
          payload: { keep: true },
        },
      },
    } as const;
    expect(materializeLiveRepairValue(nestedSentinels, {
      repairTimestamp: 123,
      planSha256: "plan-sha",
    })).toBe(nestedSentinels);
    expect(materializeLiveRepairValue({ derive: "repairTimestamp" }, {
      repairTimestamp: 123,
      planSha256: "plan-sha",
    })).toBe(123);

    const marker = materializeLiveRepairValue({
      derive: "planSha256",
      encoding: "task-2d2-marker-json",
      payload: {
        version: "task-2d2-v1",
        evidenceSha256: "evidence-sha",
        coreCommit: "core-commit",
        classifierVersion: "task-2d1-v1",
        schemaVersion: 6,
        authorizedBaseline: {},
        insertedCounts: {},
        deletedScopes: [],
        deletionPreimageSha256: "deletion-sha",
        needsReviewCounts: {},
      },
    }, {
      repairTimestamp: 123,
      planSha256: "plan-sha",
    });
    expect(marker).toBe("{\"authorizedBaseline\":{},\"classifierVersion\":\"task-2d1-v1\",\"coreCommit\":\"core-commit\",\"deletedScopes\":[],\"deletionPreimageSha256\":\"deletion-sha\",\"evidenceSha256\":\"evidence-sha\",\"insertedCounts\":{},\"needsReviewCounts\":{},\"planSha256\":\"plan-sha\",\"schemaVersion\":6,\"version\":\"task-2d2-v1\"}");
  });

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

    applyMigrationsThroughV6(db);

    expect(SCHEMA_VERSION).toBe(9);
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

describe("task 2d2 read-only planner", () => {
  test("rejects a store outside the authorized baseline without writing", () => {
    const db = new Database(":memory:");
    try {
      applyMigrationsThroughV6(db);
      db.exec("PRAGMA foreign_keys = ON");
      db.exec("PRAGMA query_only = ON");

      expect(() => buildLiveRepairPlan(db, "03ff6607e14b9c0c47a1946a2ac978d1006262a0"))
        .toThrow("Task 2D2 baseline conflict");
    } finally {
      db.close();
    }
  });

  test("builds the full deterministic fresh plan and derives its report without writes", () => {
    const db = new Database(":memory:");
    try {
      applyMigrationsThroughV6(db);
      db.exec("PRAGMA foreign_keys = ON");
      seedTask2d2PlannerFixture(db);
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()!.integrity_check).toBe("ok");
      const classifiedEntries = classifyPlannerFixtureEntries(db);
      expect(plannerWorkspaceId("denti-ai")).toBe("ws_0f2fd33c-bfc6-4a75-83b4-2e1966aafe9f");
      expect(projectIdsForPlannerFixture().slice(0, 3)).toEqual([
        "prj_a2fe0669-c74f-494e-887c-b1b775ebfb31",
        "prj_2d9cceda-aacb-4675-821d-dd79d9623d68",
        "prj_90e6aae7-fcdf-427a-8da4-0640479acac4",
      ]);
      expect(classifiedEntries.filter((row) => row.kind === "render")).toHaveLength(784);
      expect(classifiedEntries.filter((row) => row.kind === "render" && row.hasArtifact)).toHaveLength(778);
      expect(classifiedEntries.filter((row) => row.kind === "root")).toHaveLength(73);
      expect(classifiedEntries.filter((row) => row.kind === "root" && row.hasArtifact)).toHaveLength(72);
      expect(classifiedEntries.filter((row) => row.kind === "snapshot")).toHaveLength(216);
      expect(classifiedEntries.filter((row) => row.kind === "snapshot" && row.hasArtifact)).toHaveLength(216);
      for (const boundary of Object.values(AUDITED_BOUNDARY_GENERATIONS)) {
        const row = db.query<{
          body: string;
          documentProjectId: string;
          ownerEntryId: string;
          ownerPath: string;
        }, [string]>(
          `SELECT revision.body, document.project_id AS documentProjectId,
                  entry.id AS ownerEntryId, entry.source_path AS ownerPath
           FROM document_revisions revision
           JOIN documents document ON document.id = revision.document_id
           JOIN migration_entries entry
           JOIN json_each(entry.target_refs_json) ref ON ref.value = revision.id
           WHERE revision.id = ?`,
        ).get(boundary.revisionId)!;
        expect(row).toMatchObject({
          documentProjectId: boundary.projectId,
          ownerEntryId: boundary.ownerEntryId,
          ownerPath: boundary.ownerPath,
        });
        const body = JSON.parse(row.body) as {
          input: { composition: string };
          output: { local: string; bytes: number };
        };
        expect(body.input.composition).toBe(boundary.composition);
        expect(body.output).toEqual({ local: boundary.output, bytes: boundary.bytes });
        const scope = plannerProjectScopes()[boundary.projectIndex]!;
        expect(decodeHyperframesGenerationEvidence({
          body: body as never,
          documentProjectId: boundary.projectId,
          owningEntryWorkspaceId: plannerWorkspaceId(scope.workspaceSlug),
          owningEntryProjectId: boundary.projectId,
          projectLocator: scope.locator,
        })).toEqual({
          kind: "needs-review",
          reason: boundary.reason === "source-evidence-mismatch" ? "composition-invalid" : "render-invalid",
        });
      }
      expect(db.query<{ count: number }, []>(
        "SELECT COUNT(*) AS count FROM migration_entries WHERE substr(source_path, -10) = '/.DS_Store' AND entry_kind = 'file' AND disposition = 'system' AND state = 'excluded'",
      ).get()!.count).toBe(427);
      const dsStoreBefore = db.query<Record<string, unknown>, []>(
        "SELECT * FROM migration_entries WHERE substr(source_path, -10) = '/.DS_Store' ORDER BY id",
      ).all();
      const baselineBefore = db.query<{
        objectBytes: number;
        artifactRevisionObjectBytes: number;
      }, []>(
        `SELECT
           (SELECT SUM(bytes) FROM objects) AS objectBytes,
           (SELECT SUM(object.bytes) FROM artifact_revisions revision JOIN objects object ON object.id = revision.object_id)
             AS artifactRevisionObjectBytes`,
      ).get()!;
      const expectedGhostIdsBefore = [
        migrationStableId("ws", PLANNER_RUN_ID, `workspace:${PLANNER_SOURCE_LABEL}\0.DS_Store`),
        ...Array.from({ length: 23 }, (_, index) => {
          const workspaceSlug = index === 0 ? "default" : `normal-${index}`;
          return migrationStableId("prj", PLANNER_RUN_ID,
            `project:${PLANNER_SOURCE_LABEL}\0${workspaceSlug}\0.DS_Store`);
        }),
      ].sort();
      const expectedDeletionPreimages = expectedGhostIdsBefore.map((id) => {
        const table = id.startsWith("ws_") ? "workspaces" : "projects";
        const row = db.query<Record<string, string | number | null>, [string]>(`SELECT * FROM ${table} WHERE id = ?`).get(id)!;
        return { table, primaryKey: id, fullPreimage: row };
      }).sort((left, right) => left.table.localeCompare(right.table) || left.primaryKey.localeCompare(right.primaryKey));
      const before = db.query<{ changes: number }, []>("SELECT total_changes() AS changes").get()!.changes;
      db.exec("PRAGMA query_only = ON");

      const plan = buildLiveRepairPlan(db, "03ff6607e14b9c0c47a1946a2ac978d1006262a0");
      const report = deriveLiveRepairReport(plan, { state: "fresh", conflicts: [] });
      db.exec("PRAGMA reverse_unordered_selects = ON");
      const reversedPlan = buildLiveRepairPlan(db, "03ff6607e14b9c0c47a1946a2ac978d1006262a0");
      const reversedReport = deriveLiveRepairReport(reversedPlan, { state: "fresh", conflicts: [] });
      expect(reversedPlan).toEqual(plan);
      expect(reversedReport).toEqual(report);

      expect(db.query<{ changes: number }, []>("SELECT total_changes() AS changes").get()!.changes).toBe(before);
      expect(db.query<Record<string, unknown>, []>(
        "SELECT * FROM migration_entries WHERE substr(source_path, -10) = '/.DS_Store' ORDER BY id",
      ).all()).toEqual(dsStoreBefore);
      expect(Object.isFrozen(plan)).toBe(true);
      expect(Object.isFrozen(plan.insertedRows[0]!.columns)).toBe(true);
      expect(Object.isFrozen((plan.insertedRows.find((row) => row.table === "activity_events")!
        .columns.payload_json as { payload: object }).payload)).toBe(true);
      expect(plan.baseline.objectBytes).toBe(baselineBefore.objectBytes);
      expect(plan.baseline.artifactRevisionObjectBytes).toBe(baselineBefore.artifactRevisionObjectBytes);
      expect(plan.baseline.objectBytes).toBe(3_744_514);
      expect(plan.baseline.artifactRevisionObjectBytes).toBe(3_654_797);
      expect(plan.baseline.productionManifests).toBe(0);
      expect(plan.baseline.migrationEntryStateRefsSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(plan.insertedRows).toHaveLength(988);
      expect(plan.transitions).toHaveLength(630);
      expect(plan.supplementalRefs).toHaveLength(1_336);
      expect(plan.deletions).toHaveLength(24);
      expect(plan.insertedRows.every((row) => typeof row.primaryKey === "string")).toBe(true);
      expect(plan.transitions.every((row) => typeof row.primaryKey === "string")).toBe(true);
      expect(plan.deletions.every((row) => "fullPreimage" in row)).toBe(true);
      expect(plan.deletions).toEqual(expectedDeletionPreimages);
      expect(new Set(plan.supplementalRefs.map((row) =>
        `${row.migrationEntryId}\0${row.targetRef}`)).size).toBe(1_336);
      expect(plan.invariants.find((row) => row.code === "generationOutcomeLedger")!.facts)
        .toHaveLength(639);
      const ledger = plan.invariants.find((row) => row.code === "generationOutcomeLedger")!.facts as Array<{ outcome: string; reason: string }>;
      const generationRevisionIds = plannerGenerationRevisionIds();
      const expectedLedger = Array.from({ length: 639 }, (_, index) => ({
        generationRevisionId: generationRevisionIds[index]!,
        ...plannerGenerationClass(index),
      })).sort((left, right) => left.generationRevisionId.localeCompare(right.generationRevisionId));
      expect(ledger).toEqual(expectedLedger);
      const mismatchRevisionIds = expectedLedger.filter((row) => row.reason === "output-byte-mismatch")
        .map((row) => row.generationRevisionId);
      expect(mismatchRevisionIds).toHaveLength(12);
      expect(plan.evidenceRows.filter((row) => row.table === "document_revisions"
        && mismatchRevisionIds.includes(row.primaryKey))).toHaveLength(12);
      expect(plan.evidenceRows).toContainEqual(expect.objectContaining({
        table: "migration_sources",
        primaryKey: PLANNER_SOURCE_ID,
        columns: expect.objectContaining({ source_label: PLANNER_SOURCE_LABEL }),
      }));
      expect(Object.fromEntries([...new Set(ledger.map((row) => row.reason))].sort().map((reason) => [
        reason, ledger.filter((row) => row.reason === reason).length,
      ]))).toEqual({
        "composition-invalid": 470,
        error: 51,
        "exact-evidence-match": 67,
        "archive-locator-mismatch": 33,
        "output-byte-mismatch": 12,
        "source-evidence-mismatch": 2,
        "wrapper-without-output": 4,
      });
      expect(plan.invariants).toContainEqual({ code: "freshChangedSqlRows", facts: 2_978 });
      expect(report).toMatchObject({
        state: "fresh", applicable: true, changes: 2_978,
        ignoredCounts: { wrapperWithoutOutput: 4, errors: 51 },
      });
      expect(report.eligibleGenerationRevisionIds).toHaveLength(67);
      expect(report.needsReview).toHaveLength(517);
      expect(report.eligibleGenerationRevisionIds).toEqual(generationRevisionIds
        .filter((_, index) => plannerGenerationClass(index).outcome === "strict-import").sort());
      expect(report.needsReview.map((row) => row.generationRevisionId)).toEqual(
        generationRevisionIds.filter((_, index) => plannerGenerationClass(index).outcome === "needs-review").sort(),
      );
      expect(report.needsReview.map((row) => row.reason)).toEqual(expectedLedger
        .filter((row) => row.outcome === "needs-review").map((row) => row.reason));
      expect(report.planSha256).toMatch(/^[0-9a-f]{64}$/);
      const marker = plan.insertedRows.find((row) => row.table === "activity_events")!;
      expect(marker.columns.created_at).toEqual({ derive: "repairTimestamp" });
      expect(marker.columns.payload_json).toMatchObject({
        derive: "planSha256",
        encoding: "task-2d2-marker-json",
        payload: {
          evidenceSha256: plan.evidenceSha256,
          version: plan.version,
        },
      });
      expect(marker.columns.payload_json).not.toHaveProperty("payload.migrationRunId");
      expect(marker.columns.payload_json).not.toHaveProperty("payload.planSha256");
      expect(deriveLiveRepairReport(plan, {
        state: "conflict",
        conflicts: [{ code: "Z", entityId: "two" }, { code: "A" }],
      })).toMatchObject({
        state: "conflict", applicable: false, changes: 0,
        planSha256: report.planSha256,
        conflicts: [{ code: "A" }, { code: "Z", entityId: "two" }],
      });
      expect(() => deriveLiveRepairReport(plan, {
        state: "complete-rerun", conflicts: [],
      } as never)).toThrow("fresh planner");
      expect(() => deriveLiveRepairReport(plan, { state: "fresh", conflicts: [{ code: "unexpected" }] }))
        .toThrow("state and conflicts");
      const runRows = plan.insertedRows.filter((row) => row.table === "runs");
      expect(runRows.filter((row) => row.columns.project_id === projectIdsForPlannerFixture()[1]).length).toBe(57);
      expect(runRows.filter((row) => row.columns.project_id === projectIdsForPlannerFixture()[2]).length).toBe(10);
      const runMetadata = runRows.map((row) => JSON.parse(String(row.columns.metadata_json)) as { sourceMigrationEntryId: string });
      expect(new Set(runMetadata.map((row) => row.sourceMigrationEntryId)).size).toBe(53);
      const firstRun = runRows.find((row) => String(row.columns.metadata_json).includes(generationRevisionIds[0]!))!;
      const firstAttempt = plan.insertedRows.find((row) => row.table === "run_attempts"
        && row.columns.run_id === firstRun.primaryKey)!;
      expect(plan.transitions.find((row) => row.table === "run_attempts"
        && row.primaryKey === firstAttempt.primaryKey)!.to).toMatchObject({ cost_usd: 0.25 });
      const refOwnership = { source: 0, generation: 0, render: 0 };
      for (const ref of plan.supplementalRefs) {
        if (ref.migrationEntryId.startsWith("mentry_source_")) refOwnership.source += 1;
        else if (ref.migrationEntryId.startsWith("mentry_render_")) refOwnership.render += 1;
        else refOwnership.generation += 1;
      }
      expect(refOwnership).toEqual({ source: 867, generation: 335, render: 134 });
      const expectedPairs: string[] = [];
      const revisions = plan.insertedRows.filter((row) => row.table === "composition_revisions");
      const filesByRevision = new Map(plan.insertedRows.filter((row) => row.table === "composition_revision_files")
        .map((row) => [String(row.columns.composition_revision_id), row.primaryKey]));
      for (const revision of revisions) {
        const config = JSON.parse(String(revision.columns.engine_config_json)) as { recovery: { migrationEntryId: string } };
        for (const target of [String(revision.columns.composition_id), revision.primaryKey, filesByRevision.get(revision.primaryKey)!]) {
          expectedPairs.push(`${config.recovery.migrationEntryId}\0${target}`);
        }
      }
      const ownerByRevision = new Map<string, string>();
      for (const row of plan.evidenceRows.filter((value) =>
        value.table === "migration_entries" && String(value.columns.source_path).endsWith("generations.jsonl"))) {
        for (const revisionId of JSON.parse(String(row.columns.target_refs_json)) as string[]) ownerByRevision.set(revisionId, row.primaryKey);
      }
      const attemptsByRun = new Map(plan.insertedRows.filter((row) => row.table === "run_attempts")
        .map((row) => [String(row.columns.run_id), row.primaryKey]));
      const buildsByRun = new Map(plan.insertedRows.filter((row) => row.table === "builds")
        .map((row) => [String(row.columns.run_id), row]));
      const outputsByBuild = new Map(plan.insertedRows.filter((row) => row.table === "build_outputs")
        .map((row) => [String(row.columns.build_id), row.primaryKey]));
      const resultsByRun = new Map(plan.insertedRows.filter((row) => row.table === "run_results")
        .map((row) => [String(row.columns.run_id), row.primaryKey]));
      for (const run of runRows) {
        const metadata = JSON.parse(String(run.columns.metadata_json)) as {
          generationDocumentRevisionId: string;
          outputMigrationEntryId: string;
        };
        const build = buildsByRun.get(run.primaryKey)!;
        const output = outputsByBuild.get(build.primaryKey)!;
        const owner = ownerByRevision.get(metadata.generationDocumentRevisionId)!;
        for (const target of [run.primaryKey, attemptsByRun.get(run.primaryKey)!, build.primaryKey, output, resultsByRun.get(run.primaryKey)!]) {
          expectedPairs.push(`${owner}\0${target}`);
        }
        expectedPairs.push(`${metadata.outputMigrationEntryId}\0${build.primaryKey}`);
        expectedPairs.push(`${metadata.outputMigrationEntryId}\0${output}`);
      }
      expect(plan.supplementalRefs.map((row) => `${row.migrationEntryId}\0${row.targetRef}`).sort())
        .toEqual(expectedPairs.sort());
      expect(plan.insertedRows.some((row) => row.primaryKey === "comp_cbb20e06-b03e-43bf-8c6b-50d1fb34fe7f")).toBe(true);
      expect(plan.insertedRows.some((row) => row.primaryKey === "crev_7858baee-f4d2-4f06-821e-f8b928b72b30")).toBe(true);
      expect(plan.insertedRows.some((row) => row.primaryKey === "run_4bf3fa85-eeaa-41ad-875a-5a8ecf0cf7ab")).toBe(true);
      expect(plan.deletions.map((row) => row.primaryKey)).toContain("ws_039f921a-dd32-4c23-8d98-fc8acfd4e09c");
      expect(plan.deletions.map((row) => row.primaryKey)).toContain("prj_b5555575-36ec-4800-8f55-92cf9af7211a");
      expect(plan.deletions.map((row) => row.primaryKey).sort()).toEqual(expectedGhostIdsBefore);
      expect(plan.deletions.some((row) => row.primaryKey === "prj-fill-0")).toBe(false);
      expect(plan.deletions.some((row) => row.primaryKey === migrationStableId(
        "ws", PLANNER_RUN_ID, `workspace:${PLANNER_SOURCE_LABEL}\0normal-29`,
      ))).toBe(false);
      expect(report.deletionPreimageSha256).toBe("16be18a7c0e40bca066e967c50b5af328fc006ba370159d6c9fb8e7b44f765a1");
      expect(plan.evidenceRows.filter((row) => row.primaryKey.startsWith("mentry_ds_scope_"))).toHaveLength(24);
      for (const row of plan.evidenceRows.filter((value) => value.primaryKey.startsWith("mentry_ds_scope_"))) {
        const sourcePath = String(row.columns.source_path);
        const workspace = sourcePath === "workspaces/.DS_Store";
        const workspaceSlug = sourcePath === "projects/.DS_Store" ? "default"
          : sourcePath.match(/^workspaces\/([^/]+)\/projects\/\.DS_Store$/)?.[1];
        const derivedId = workspace
          ? migrationStableId("ws", PLANNER_RUN_ID, `workspace:${PLANNER_SOURCE_LABEL}\0.DS_Store`)
          : migrationStableId("prj", PLANNER_RUN_ID,
            `project:${PLANNER_SOURCE_LABEL}\0${workspaceSlug}\0.DS_Store`);
        expect(expectedGhostIdsBefore).toContain(derivedId);
      }
      const sourcePathByEntry = new Map(plan.evidenceRows
        .filter((row) => row.table === "migration_entries")
        .map((row) => [row.primaryKey, row.columns.source_path]));
      expect(generationRevisionIds.slice(31, 33)).toEqual([
        "drev_f22c7481-4b59-4538-8274-f912b04ec6d3",
        "drev_d2f1c794-34cb-417d-8d08-7b6c08e1d8ba",
      ]);
      for (const [index, variant] of [[31, 1], [32, 2]] as const) {
        expect(ledger.find((row) => row.generationRevisionId === generationRevisionIds[index]))
          .toMatchObject({ outcome: "needs-review", reason: "archive-locator-mismatch" });
        expect(sourcePathByEntry.values()).toContain(
          `workspaces/denti-ai/projects/denti-perio-pitch-001/compositions/variant-${variant}.html`,
        );
      }
      for (const boundary of Object.values(AUDITED_BOUNDARY_GENERATIONS)) {
        expect(ledger.find((row) => row.generationRevisionId === boundary.revisionId)).toMatchObject({
          outcome: "needs-review",
          reason: boundary.reason,
        });
      }

      for (const mutateEvidence of [
        (value: typeof plan) => {
          const row = value.evidenceRows.find((item) => item.table === "migration_entries")!;
          (row.columns as Record<string, unknown>).source_path = "same-count-mutated-path";
        },
        (value: typeof plan) => {
          const row = value.evidenceRows.find((item) => item.table === "objects")!;
          (row.columns as Record<string, unknown>).id = fixtureDomainId("obj", 999_999);
        },
        (value: typeof plan) => {
          const row = value.evidenceRows.find((item) => item.table === "migration_entries"
            && typeof item.columns.target_refs_json === "string")!;
          (row.columns as Record<string, unknown>).target_refs_json = JSON.stringify([fixtureDomainId("obj", 999_999)]);
        },
        (value: typeof plan) => {
          const row = value.evidenceRows.find((item) => item.table === "artifact_revisions")!;
          (row.columns as Record<string, unknown>).object_id = fixtureDomainId("obj", 999_999);
        },
      ]) {
        const staleEvidence = structuredClone(plan);
        mutateEvidence(staleEvidence);
        expect(() => deriveLiveRepairReport(staleEvidence, { state: "fresh", conflicts: [] }))
          .toThrow("evidence digest");
      }
      for (const mutate of [
        (value: typeof plan) => { (value.insertedRows[0]!.columns as Record<string, unknown>).created_at = 2; },
        (value: typeof plan) => { (value.transitions[0]!.to as Record<string, unknown>).sealed_at = 2; },
        (value: typeof plan) => { (value.deletions[0]!.fullPreimage as Record<string, unknown>).updated_at = 2; },
        (value: typeof plan) => { (value.invariants[0] as { facts: unknown }).facts = { mutated: true }; },
      ]) {
        const changed = structuredClone(plan);
        mutate(changed);
        expect(deriveLiveRepairReport(changed, { state: "fresh", conflicts: [] }).planSha256)
          .not.toBe(report.planSha256);
      }
      const invalidPairs = structuredClone(plan);
      (invalidPairs.supplementalRefs[0] as { targetRef: string }).targetRef = invalidPairs.supplementalRefs[1]!.targetRef;
      expect(() => deriveLiveRepairReport(invalidPairs, { state: "fresh", conflicts: [] }))
        .toThrow("mutation arithmetic");
    } finally {
      db.close();
    }
  });

  test("rejects same-count audited-topology substitutions", () => {
    const unexpectedlyAccepted: string[] = [];
    for (const mutation of [
      "render", "source-ref", "ghost-evidence", "ghost-fk",
      "ghost-original-ref", "unexpected-supplemental", "ghost-polymorphic", "malformed-generation",
      "source-entry-bytes", "render-entry-sha", "source-workspace", "ghost-workspace", "production-manifest",
      "source-canonical-hash", "denti-owner-id", "denti-identity-substitution",
      "generation-ref-nongeneration", "generation-ref-other-source",
      "unexpected-original-target", "unexpected-repair-key",
    ] as const) {
      const db = new Database(":memory:");
      try {
        applyMigrationsThroughV6(db);
        db.exec("PRAGMA foreign_keys = ON");
        seedTask2d2PlannerFixture(db, mutation);
        expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
        db.exec("PRAGMA query_only = ON");
        let rejected = false;
        try {
          buildLiveRepairPlan(db, "03ff6607e14b9c0c47a1946a2ac978d1006262a0");
        } catch (error) {
          rejected = error instanceof Error && error.message.includes("Task 2D2 baseline conflict");
        }
        if (!rejected) unexpectedlyAccepted.push(mutation);
      } finally {
        db.close();
      }
    }
    expect(unexpectedlyAccepted).toEqual([]);
  }, 30_000);
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
  applyMigrationsThroughV6(db);
  return db;
}

function applyMigrationsThroughV6(db: Database): void {
  const current = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
  for (const migration of MIGRATIONS.filter(({ version }) => version > current && version <= 6)) {
    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, 1)")
      .run(migration.version);
    db.exec(`PRAGMA user_version = ${migration.version}`);
  }
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

const PLANNER_RUN_ID = "mig_c37f36ac-47a0-4330-8303-74cee92b7ddd";
const PLANNER_SOURCE_ID = "mig_1cb7c4dc-5f3f-4e4f-8fa5-fbb8710e736e";
const PLANNER_SOURCE_LABEL = "ralphy";
const PLANNER_SOURCE_PATH_HASH = "41f35f9dc2f95ebdd88726181178685dfb93fab0169fdbb06ebbd5ed1e0b9755";
const DENTI_GENERATION_OWNER_ID = "mentry_9b5e5a5c-06bb-494f-9478-d55af6895d72";
const DENTI_GENERATION_LOCATOR_HASH = "81852c9bba9193e62612d924e5dae189d32057aa35e3cbd8a527bf91eb516c85";
const AUDITED_BOUNDARY_GENERATIONS = {
  100: {
    revisionId: "drev_1dd38421-134c-4bd5-801e-ca1649971135",
    ownerEntryId: "mentry_be6a8ad1-a03f-47f1-872b-f8e15111cb6b",
    ownerPath: "workspaces/short-guides/projects/short-15s-farm-001/logs/generations.jsonl",
    projectId: "prj_548aa7ce-7724-4de1-8a38-c34ec99002a2",
    projectIndex: 4,
    composition: "index.html",
    output: "[migration-path-omitted sha256=a336633f8c6651ef9be61bd7e16b2caa313348818a589df9c54d340d0f2637ac]",
    bytes: 4_089_146,
    reason: "output-byte-mismatch",
  },
  101: {
    revisionId: "drev_46fb2d6d-8023-4e82-8eb3-116b676a40d1",
    ownerEntryId: DENTI_GENERATION_OWNER_ID,
    ownerPath: "workspaces/denti-ai/projects/denti-perio-pitch-001/logs/generations.jsonl",
    projectId: "prj_2d9cceda-aacb-4675-821d-dd79d9623d68",
    projectIndex: 1,
    composition: "compositions/full-r2.html",
    output: "[migration-path-omitted sha256=289b4b2659c6d12458e1980feb14cee891d60f672f9161ae9c126fd3cc306119]",
    bytes: 26_569_720,
    reason: "output-byte-mismatch",
  },
  102: {
    revisionId: "drev_629d5001-27ed-4e91-844b-9084d05bcdd8",
    ownerEntryId: "mentry_d2416d74-a156-46fd-9293-edb71f27a1ee",
    ownerPath: "workspaces/sotaocr/projects/sotaocr-contextdrop-001/logs/generations.jsonl",
    projectId: "prj_d40c43e0-eab9-4a45-877f-2cf5ca039831",
    projectIndex: 3,
    composition: "index.html",
    output: "[migration-path-omitted sha256=3d2e42ae75b8e7f9f4ddcb40ca7541e87fae9b9cf471ac11cb328f1ca45a7c1f]",
    bytes: 20_019_805,
    reason: "output-byte-mismatch",
  },
  88: {
    revisionId: "drev_7c60a57e-927d-427f-8ad3-2e8cb5e6c73a",
    ownerEntryId: DENTI_GENERATION_OWNER_ID,
    ownerPath: "workspaces/denti-ai/projects/denti-perio-pitch-001/logs/generations.jsonl",
    projectId: "prj_2d9cceda-aacb-4675-821d-dd79d9623d68",
    projectIndex: 1,
    composition: "compositions/variant-1.html",
    output: "[migration-path-omitted sha256=59c65bb7c55dccd5e6e43586f02fa61429023d46163095424e6626431a35c70f]",
    bytes: 8_553_198,
    reason: "output-byte-mismatch",
  },
  104: {
    revisionId: "drev_fd4e127e-4a76-411a-8d44-2d381b9f8119",
    ownerEntryId: "mentry_d2416d74-a156-46fd-9293-edb71f27a1ee",
    ownerPath: "workspaces/sotaocr/projects/sotaocr-contextdrop-001/logs/generations.jsonl",
    projectId: "prj_d40c43e0-eab9-4a45-877f-2cf5ca039831",
    projectIndex: 3,
    composition: "compositions/format-repo-flex.html",
    output: "[migration-path-omitted sha256=9c64eca4d4f87232c31e71d9778c7ae4ad551aef80fc68dd9be6a4ecc9fdd242]",
    bytes: 15_546_084,
    reason: "output-byte-mismatch",
  },
  112: {
    revisionId: "drev_d6521bd0-86c2-48e5-84af-e25cc4b08374",
    ownerEntryId: "mentry_89336710-b955-4661-9b79-5369cb272c65",
    ownerPath: "workspaces/nightmaker/projects/nightmaker-hooks-001/logs/generations.jsonl",
    projectId: "prj_90e6aae7-fcdf-427a-8da4-0640479acac4",
    projectIndex: 2,
    composition: "hook-06.html",
    output: "workspaces/nightmaker/projects/nightmaker-hooks-001/render/hook-06.mp4",
    bytes: 117_507,
    reason: "source-evidence-mismatch",
  },
  113: {
    revisionId: "drev_7916b6a3-8665-4710-8d6e-054f64e96098",
    ownerEntryId: "mentry_d2416d74-a156-46fd-9293-edb71f27a1ee",
    ownerPath: "workspaces/sotaocr/projects/sotaocr-contextdrop-001/logs/generations.jsonl",
    projectId: "prj_d40c43e0-eab9-4a45-877f-2cf5ca039831",
    projectIndex: 3,
    composition: "format-raw-demo.html",
    output: "[migration-path-omitted sha256=311e588d37117d5713115b28d356ef9b63038f6714fe0dadb80dc5ef0fcace89]",
    bytes: 9_367_712,
    reason: "source-evidence-mismatch",
  },
} as const;

function auditedBoundaryGeneration(index: number) {
  return AUDITED_BOUNDARY_GENERATIONS[index as keyof typeof AUDITED_BOUNDARY_GENERATIONS];
}

function plannerProjectScopes(): Array<{ workspaceSlug: string; projectSlug: string; locator: string }> {
  return Array.from({ length: 74 }, (_, index) => {
    const [workspaceSlug, projectSlug] = index === 0
      ? ["denti-ai", "denti-voiceperio-creatives-001"]
      : index === 1 ? ["denti-ai", "denti-perio-pitch-001"]
        : index === 2 ? ["nightmaker", "nightmaker-hooks-001"]
          : index === 3 ? ["sotaocr", "sotaocr-contextdrop-001"]
            : index === 4 ? ["short-guides", "short-15s-farm-001"]
              : ["default", `p${index.toString().padStart(3, "0")}`];
    return {
      workspaceSlug,
      projectSlug,
      locator: workspaceSlug === "default" ? `projects/${projectSlug}`
        : `workspaces/${workspaceSlug}/projects/${projectSlug}`,
    };
  });
}

function plannerWorkspaceId(slug: string): string {
  return migrationStableId("ws", PLANNER_RUN_ID, `workspace:${PLANNER_SOURCE_LABEL}\0${slug}`);
}

function projectIdsForPlannerFixture(): string[] {
  return plannerProjectScopes().map(({ workspaceSlug, projectSlug }) => migrationStableId(
    "prj", PLANNER_RUN_ID, `project:${PLANNER_SOURCE_LABEL}\0${workspaceSlug}\0${projectSlug}`,
  ));
}

function plannerGenerationProjectIndex(index: number): number {
  const audited = auditedBoundaryGeneration(index);
  if (audited) return audited.projectIndex;
  if (index < 57 || index >= 67 && index <= 88 || index >= 100 && index <= 107) return 1;
  if (index >= 57 && index < 67 || index >= 89 && index < 100) return 2;
  return 3 + (index % 71);
}

function plannerGenerationClass(index: number): {
  outcome: "strict-import" | "needs-review" | "ignored";
  reason: string;
} {
  const audited = auditedBoundaryGeneration(index);
  if (audited) return { outcome: "needs-review", reason: audited.reason };
  if (index < 67 && index !== 31 && index !== 32 || index === 67 || index === 68) {
    return { outcome: "strict-import", reason: "exact-evidence-match" };
  }
  if (index === 31 || index === 32 || index >= 69 && index < 100 || index === 103) {
    return { outcome: "needs-review", reason: "archive-locator-mismatch" };
  }
  if (index < 112) return { outcome: "needs-review", reason: "output-byte-mismatch" };
  if (index < 114) return { outcome: "needs-review", reason: "source-evidence-mismatch" };
  if (index < 584) return { outcome: "needs-review", reason: "composition-invalid" };
  if (index < 588) return { outcome: "ignored", reason: "wrapper-without-output" };
  return { outcome: "ignored", reason: "error" };
}

function plannerGenerationRevisionIds(dentiLocatorHash = DENTI_GENERATION_LOCATOR_HASH): string[] {
  const lineByProject = new Map<number, number>();
  return Array.from({ length: 639 }, (_, index) => {
    const projectIndex = plannerGenerationProjectIndex(index);
    const line = (lineByProject.get(projectIndex) ?? 0) + 1;
    lineByProject.set(projectIndex, line);
    const audited = auditedBoundaryGeneration(index);
    if (audited) return audited.revisionId;
    const ownerPath = `${plannerProjectScopes()[projectIndex]!.locator}/logs/generations.jsonl`;
    const sourceLocatorHash = projectIndex === 1
      ? dentiLocatorHash
      : createHash("sha256").update(ownerPath).digest("hex");
    return migrationStableId("drev", PLANNER_RUN_ID,
      `document-revision:${PLANNER_SOURCE_LABEL}:${sourceLocatorHash}:line-${line}`);
  });
}

function fixtureDomainId(prefix: string, value: number): string {
  return `${prefix}_00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function classifyPlannerFixtureEntries(db: Database): Array<{
  kind: "root" | "snapshot" | "render";
  hasArtifact: boolean;
}> {
  const rows = db.query<{
    sourcePath: string;
    sourceKind: string;
    targetRefsJson: string | null;
  }, []>(
    `SELECT source_path AS sourcePath, source_kind AS sourceKind, target_refs_json AS targetRefsJson
     FROM migration_entries WHERE entry_kind = 'file' AND disposition = 'object' AND state = 'verified'`,
  ).all();
  const result: Array<{ kind: "root" | "snapshot" | "render"; hasArtifact: boolean }> = [];
  for (const row of rows) {
    if (row.sourceKind !== "ralphy") continue;
    const match = row.sourcePath.match(/^((?:workspaces\/[^/]+\/)?projects\/[^/]+)\/(.+)$/);
    if (!match) continue;
    const composition = classifyCompositionLocator({ value: match[2], projectLocator: match[1]! });
    const render = classifyRenderLocator({ value: match[2], projectLocator: match[1]! });
    const hasArtifact = (JSON.parse(row.targetRefsJson ?? "[]") as string[]).some((ref) => ref.startsWith("art_"));
    if (composition.kind !== "invalid") result.push({ kind: composition.kind, hasArtifact });
    else if (render.kind === "render") result.push({ kind: "render", hasArtifact });
  }
  return result;
}

function seedTask2d2PlannerFixture(
  db: Database,
  mutation?: "render" | "source-ref" | "ghost-evidence" | "ghost-fk"
    | "ghost-original-ref" | "unexpected-supplemental" | "ghost-polymorphic"
    | "malformed-generation" | "source-entry-bytes" | "render-entry-sha"
    | "source-workspace" | "ghost-workspace" | "production-manifest"
    | "source-canonical-hash" | "denti-owner-id" | "denti-identity-substitution"
    | "generation-ref-nongeneration" | "generation-ref-other-source"
    | "unexpected-original-target" | "unexpected-repair-key",
): void {
  const runId = PLANNER_RUN_ID;
  const sourceId = PLANNER_SOURCE_ID;
  const sourceLabel = PLANNER_SOURCE_LABEL;
  const cutoverAt = 1_786_301_683_658;
  const dentiLocatorHash = mutation === "denti-identity-substitution"
    ? "9".repeat(64) : DENTI_GENERATION_LOCATOR_HASH;
  const workspaceId = plannerWorkspaceId("default");
  const projectScopes = plannerProjectScopes();
  const projectIds = projectIdsForPlannerFixture();
  const workspaceSlugs = ["default", "denti-ai", "nightmaker", "sotaocr", "short-guides",
    ...Array.from({ length: 26 }, (_, index) => `normal-${index + 1}`), "normal-29"];
  const workspaceIds = new Map(workspaceSlugs.map((slug) => [slug, plannerWorkspaceId(slug)]));
  const projectWorkspaceId = (index: number) => mutation === "source-workspace" && index === 1
    ? workspaceId : workspaceIds.get(projectScopes[index]!.workspaceSlug)!;
  const ghostWorkspaceId = migrationStableId("ws", runId, `workspace:${sourceLabel}\0.DS_Store`);
  const insertWorkspace = db.prepare(
    "INSERT INTO workspaces (id, slug, name, metadata_json, row_version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1)");
  const insertProject = db.prepare(
    "INSERT INTO projects (id, workspace_id, slug, name, metadata_json, row_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 1)");
  const insertEntry = db.prepare(
    `INSERT INTO migration_entries
     (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
      entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
      bytes, mtime_ms, sha256, target_refs_json, state, terminal_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'file', 'ralphy', ?, '1', ?, 420, ?, 1, ?, ?, ?, 1, 1, 1)`);
  const insertObject = db.prepare(
    `INSERT INTO objects
     (id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes, storage_class, created_at)
     VALUES (?, ?, ?, 'local', 'objects', ?, ?, ?, ?, 'standard', 1)`);

  db.transaction(() => {
    const workspaceMetadata = (primary = false) => JSON.stringify({
      migrationRunId: runId, migrationSourceLabel: sourceLabel, ...(primary ? { migrationPrimary: true } : {}),
    });
    const projectMetadata = JSON.stringify({ migrationRunId: runId, migrationSourceLabel: sourceLabel });
    const ghostProjectMetadata = JSON.stringify({
      migrationRunId: runId, migrationSourceLabel: sourceLabel, needsReview: true, migrationRegistryMissing: true,
    });
    for (const slug of workspaceSlugs) {
      insertWorkspace.run(workspaceIds.get(slug)!, slug,
        slug === "normal-29" ? ".DS_Store" : `Workspace ${slug}`, workspaceMetadata(slug === "default"));
    }
    insertWorkspace.run(ghostWorkspaceId, ".DS_Store", ".DS_Store", workspaceMetadata());
    for (let index = 0; index < 74; index += 1) {
      const scope = projectScopes[index]!;
      insertProject.run(projectIds[index]!, projectWorkspaceId(index), scope.projectSlug,
        `Misleading display ${index}`, projectMetadata);
    }
    for (let index = 0; index < 23; index += 1) {
      const workspaceSlug = index === 0 ? "default" : `normal-${index}`;
      insertProject.run(migrationStableId("prj", runId, `project:${sourceLabel}\0${workspaceSlug}\0.DS_Store`),
        mutation === "ghost-workspace" && index === 0 ? workspaceIds.get("nightmaker")! : workspaceIds.get(workspaceSlug)!,
        ".DS_Store", ".DS_Store", ghostProjectMetadata);
    }
    for (let index = 0; index < 110; index += 1) {
      insertProject.run(`prj-fill-${index}`, workspaceId, `fill-${index}`,
        index === 0 ? ".DS_Store" : `Fill ${index}`,
        mutation === "unexpected-repair-key" && index === 0
          ? JSON.stringify({ repairKey: "task-2d2-v1" }) : projectMetadata);
    }
    db.prepare("INSERT INTO migration_runs (id, phase, cutover_at, created_at, updated_at) VALUES (?, 'cutover', ?, 1, ?)")
      .run(runId, cutoverAt, cutoverAt);
    db.prepare(
      `INSERT INTO migration_sources
       (id, migration_run_id, source_kind, source_label, canonical_path_hash,
        source_device, source_inode, source_mode, created_at)
       VALUES (?, ?, 'ralphy', ?, ?, '1', '1', 493, 1)`,
    ).run(sourceId, runId, sourceLabel,
      mutation === "source-canonical-hash" ? "1".repeat(64) : PLANNER_SOURCE_PATH_HASH);
    db.prepare(
      `INSERT INTO migration_sources
       (id, migration_run_id, source_kind, source_label, canonical_path_hash,
        source_device, source_inode, source_mode, created_at)
       VALUES ('source-desktop-decoy', ?, 'desktop', 'desktop-decoy', ?, '2', '2', 493, 1)`,
    ).run(runId, "2".repeat(64));
    const cutover = db.prepare(
      "INSERT INTO activity_events (entity_type, entity_id, action, payload_json, created_at) VALUES ('migration_run', ?, 'cutover', '{}', ?)",
    ).run(runId, cutoverAt);
    db.prepare("UPDATE migration_runs SET cutover_activity_id = ? WHERE id = ?").run(Number(cutover.lastInsertRowid), runId);

    let sourceObjectCount = 0;
    for (let projectIndex = 0; projectIndex < 74; projectIndex += 1) {
      const scope = projectScopes[projectIndex]!;
      const scopedWorkspaceId = projectWorkspaceId(projectIndex);
      const pluralCount = projectIndex === 0 ? 2 : projectIndex === 1 ? 43
        : projectIndex === 2 ? 10 : projectIndex <= 21 ? 3 : 2;
      const snapshots = Array.from({ length: pluralCount }, (_, variant) =>
        `compositions/variant-${variant + 1}.html`);
      if (projectIndex === 1) snapshots[42] = "compositions/full-r2.html";
      if (projectIndex === 3) snapshots[0] = "compositions/format-repo-flex.html";
      const relatives = [
        ...(projectIndex === 0 ? [] : ["index.html"]),
        ...snapshots,
      ];
      for (const relative of relatives) {
        const objectId = fixtureDomainId("obj", sourceObjectCount + 1);
        const entryId = `mentry_source_${sourceObjectCount.toString().padStart(6, "0")}`;
        const sourcePath = `${scope.locator}/${relative}`;
        const sourceArtifactId = fixtureDomainId("art", sourceObjectCount + 1);
        const sourceArtifactRevisionId = fixtureDomainId("arev", sourceObjectCount + 1);
        insertObject.run(objectId, scopedWorkspaceId, projectIds[projectIndex]!, `source-${sourceObjectCount}`,
          "a".repeat(64), "text/html", 10 + sourceObjectCount);
        const hasArtifact = relative !== "index.html" || projectIndex !== 73;
        const refs = hasArtifact && !(mutation === "source-ref" && sourceObjectCount === 0)
          ? [objectId, sourceArtifactId, sourceArtifactRevisionId].sort()
          : [objectId];
        insertEntry.run(entryId, runId, sourceId, sourcePath,
          createHash("sha256").update(sourcePath).digest("hex"), "object", `source-${sourceObjectCount}`,
          10 + sourceObjectCount + (mutation === "source-entry-bytes" && sourceObjectCount === 0 ? 1 : 0),
          "a".repeat(64), JSON.stringify(refs), "verified");
        if (hasArtifact) {
          db.prepare(
            "INSERT INTO artifacts (id, workspace_id, project_id, slug, kind, row_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'document', 1, 1, 1)",
          ).run(sourceArtifactId, scopedWorkspaceId, projectIds[projectIndex]!, `source-${sourceObjectCount}`);
          db.prepare(
            "INSERT INTO artifact_revisions (id, artifact_id, object_id, revision_no, state, created_at) VALUES (?, ?, ?, 1, 'approved', 1)",
          ).run(sourceArtifactRevisionId, sourceArtifactId, objectId);
        }
        sourceObjectCount += 1;
      }
    }

    const ownerRefs = Array.from({ length: 74 }, () => [] as string[]);
    const insertDocument = db.prepare(
      "INSERT INTO documents (id, workspace_id, project_id, kind, slug, title, created_at, updated_at) VALUES (?, ?, ?, 'custom', ?, ?, 1, 1)");
    const insertRevision = db.prepare(
      `INSERT INTO document_revisions
       (id, document_id, revision_no, format, title, body, content_sha256, created_at)
       VALUES (?, ?, 1, 'json', ?, ?, ?, 1)`);
    let renderCount = 0;
    const addRender = (projectIndex: number, relative: string, bytes: number, withArtifact = true) => {
      const scope = projectScopes[projectIndex]!;
      const scopedWorkspaceId = projectWorkspaceId(projectIndex);
      const suffix = renderCount.toString().padStart(4, "0");
      const objectId = fixtureDomainId("obj", 1_000 + renderCount);
      const artifactId = fixtureDomainId("art", 1_000 + renderCount);
      const artifactRevisionId = fixtureDomainId("arev", 1_000 + renderCount);
      const sourcePath = `${scope.locator}/${relative}`;
      insertObject.run(objectId, scopedWorkspaceId, projectIds[projectIndex]!, `render-${suffix}`, "b".repeat(64), "video/mp4", bytes);
      const refs = withArtifact ? [objectId, artifactId, artifactRevisionId].sort() : [objectId];
      if (withArtifact) {
        db.prepare(
          "INSERT INTO artifacts (id, workspace_id, project_id, slug, kind, row_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'video', 1, 1, 1)",
        ).run(artifactId, scopedWorkspaceId, projectIds[projectIndex]!, `render-${suffix}`);
        db.prepare(
          "INSERT INTO artifact_revisions (id, artifact_id, object_id, revision_no, state, created_at) VALUES (?, ?, ?, 1, 'approved', 1)",
        ).run(artifactRevisionId, artifactId, objectId);
      }
      insertEntry.run(`mentry_render_${suffix}`, runId, sourceId, sourcePath,
        createHash("sha256").update(sourcePath).digest("hex"), "object", `render-${suffix}`,
        bytes, mutation === "render-entry-sha" && renderCount === 0 ? "c".repeat(64) : "b".repeat(64),
        JSON.stringify(refs), "verified");
      renderCount += 1;
      return { artifactRevisionId, relative };
    };
    const dentiSources = [
      ...Array.from({ length: 31 }, (_, index) => `variant-${index + 3}.html`),
      "variant-1.html", "variant-2.html",
      ...Array.from({ length: 9 }, (_, index) => `variant-${index + 34}.html`),
      "full-r2.html",
      ...Array.from({ length: 14 }, (_, index) => `variant-${index + 1}.html`),
    ];
    const generationRevisionIds = plannerGenerationRevisionIds(dentiLocatorHash);
    let dentiStrictIndex = 0;
    let nightmakerStrictIndex = 0;
    for (let index = 0; index < 639; index += 1) {
      const projectIndex = plannerGenerationProjectIndex(index);
      const scope = projectScopes[projectIndex]!;
      const scopedWorkspaceId = projectWorkspaceId(projectIndex);
      const projectSlug = scope.projectSlug;
      const classification = plannerGenerationClass(index);
      const auditedBoundary = auditedBoundaryGeneration(index);
      let body: Record<string, unknown>;
      if (auditedBoundary) {
        if (index === 112) addRender(projectIndex, "render/hook-06.mp4", auditedBoundary.bytes);
        body = {
          endpoint: "hyperframes-render", status: "ok", timestamp: "2026-08-01T00:00:00.000Z",
          latency_ms: 100, input: { composition: auditedBoundary.composition, project: projectSlug },
          output: { local: auditedBoundary.output, bytes: auditedBoundary.bytes },
        };
      } else if (classification.reason === "exact-evidence-match") {
        const composition = projectIndex === 1
          ? `compositions/${dentiSources[dentiStrictIndex++]!}`
          : `compositions/variant-${++nightmakerStrictIndex}.html`;
        const render = addRender(projectIndex, `render/output-${index}.mp4`, 1_000 + index);
        body = {
          endpoint: "hyperframes-render", status: "ok",
          timestamp: new Date(1_700_000_000_000 + index * 1_000).toISOString(),
          provider: "hyperframes", model: "renderer", latency_ms: 100, cost_usd: index === 0 ? 0.25 : 0,
          input: { composition, project: projectSlug, fps: 30, format: "mp4" },
          output: { local: render.relative, bytes: 1_000 + index },
        };
      } else if (classification.reason === "archive-locator-mismatch") {
        const auditedVariant = index === 31 ? 1 : index === 32 ? 2 : null;
        const composition = auditedVariant ? `compositions/variant-${auditedVariant}.html` : "index.html";
        const output = auditedVariant ? `render/variant-${auditedVariant}.mp4` : `render/original-${index}.mp4`;
        const alternate = auditedVariant ? `render/variant-${auditedVariant}.v1.mp4` : `render/archived-${index}.mp4`;
        addRender(projectIndex, alternate, 2_000 + index);
        if (auditedVariant) addRender(projectIndex, output, 90_000 + index);
        body = { endpoint: "hyperframes-render", status: "ok", timestamp: "2026-08-01T00:00:00.000Z",
          latency_ms: 100, input: { composition, project: projectSlug },
          output: { local: output, bytes: 2_000 + index } };
      } else if (classification.reason === "output-byte-mismatch") {
        const render = index === 111
          ? { relative: `render/missing-${index}.mp4` }
          : addRender(projectIndex, `render/byte-mismatch-${index}.mp4`, 30_000 + index * 2);
        body = { endpoint: "hyperframes-render", status: "ok", timestamp: "2026-08-01T00:00:00.000Z",
          latency_ms: 100, input: { composition: "index.html", project: projectSlug },
          output: { local: render.relative, bytes: 30_001 + index * 2 } };
      } else if (index < 114) {
        body = { endpoint: "hyperframes-render", status: "ok", timestamp: "2026-08-01T00:00:00.000Z",
          latency_ms: 100, input: { composition: "compositions/unbound.html", project: projectSlug },
          output: { local: "render/unbound.mp4", bytes: 1 } };
      } else if (index < 584) {
        body = { endpoint: "hyperframes-render", status: "ok", timestamp: "2026-08-01T00:00:00.000Z",
          input: { composition: null, project: projectSlug }, output: { local: "render/review.mp4", bytes: 1 } };
      } else if (index < 588) {
        body = { endpoint: "hyperframes-render", status: "ok", timestamp: "2026-08-01T00:00:00.000Z",
          input: { composition: "index.html", project: projectSlug } };
      } else body = { endpoint: "hyperframes-render", status: "error" };
      const documentId = `doc_generation_${index.toString().padStart(4, "0")}`;
      const revisionId = generationRevisionIds[index]!;
      const json = JSON.stringify(body);
      const storedBody = mutation === "malformed-generation" && index === 114 ? "{" : json;
      insertDocument.run(documentId, scopedWorkspaceId, projectIds[projectIndex]!, `opaque-${index}`, `Misleading ${index}`);
      insertRevision.run(revisionId, documentId, `generation line-${index + 1}`, storedBody,
        createHash("sha256").update(storedBody).digest("hex"));
      db.prepare("UPDATE documents SET current_revision_id = ? WHERE id = ?").run(revisionId, documentId);
      ownerRefs[projectIndex]!.push(revisionId);
    }
    while (renderCount < 784) {
      const relative = mutation === "render" && renderCount === 783
        ? `archive/unrelated-${renderCount}.mp4` : `render/unrelated-${renderCount}.mp4`;
      addRender(2 + (renderCount % 72), relative, 4_000 + renderCount, renderCount < 778);
    }
    for (const [id, sourcePath, refs] of [
      ["mentry_nested_composition", `${projectScopes[1]!.locator}/compositions/nested/decoy.html`, [fixtureDomainId("obj", 3)]],
      ["mentry_nested_render", `${projectScopes[1]!.locator}/render/nested/decoy.mp4`, [
        fixtureDomainId("arev", 1_000), fixtureDomainId("art", 1_000), fixtureDomainId("obj", 1_000),
      ]],
    ] as const) {
      const targetRefs = mutation === "generation-ref-nongeneration" && id === "mentry_nested_composition"
        ? [generationRevisionIds[0]!] : refs;
      insertEntry.run(id, runId, sourceId, sourcePath, createHash("sha256").update(sourcePath).digest("hex"),
        "object", id, 1, "c".repeat(64), JSON.stringify(targetRefs), "verified");
    }
    const directRootPath = `${projectScopes[3]!.locator}/format-raw-demo.html`;
    insertEntry.run("mentry_sota_direct_root", runId, sourceId, directRootPath,
      createHash("sha256").update(directRootPath).digest("hex"), "object", "sota-direct-root", 67,
      "a".repeat(64), JSON.stringify([
        fixtureDomainId("arev", 58), fixtureDomainId("art", 58), fixtureDomainId("obj", 58),
      ]), "verified");
    const insertDesktopDecoy = db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, sha256, target_refs_json, state, terminal_at, created_at, updated_at)
       VALUES (?, ?, 'source-desktop-decoy', ?, ?, 'file', 'desktop', 'object', '2', ?, 420,
        1, 1, ?, ?, 'verified', 1, 1, 1)`);
    for (const [id, sourcePath, refs] of [
      ["mentry_desktop_composition", `${projectScopes[1]!.locator}/compositions/desktop.html`, [fixtureDomainId("obj", 3)]],
      ["mentry_desktop_render", `${projectScopes[1]!.locator}/render/desktop.mp4`, [
        fixtureDomainId("arev", 1_000), fixtureDomainId("art", 1_000), fixtureDomainId("obj", 1_000),
      ]],
    ] as const) {
      const targetRefs = mutation === "generation-ref-other-source" && id === "mentry_desktop_composition"
        ? [generationRevisionIds[0]!] : refs;
      insertDesktopDecoy.run(id, runId, sourcePath, createHash("sha256").update(sourcePath).digest("hex"), id,
        "d".repeat(64), JSON.stringify(targetRefs));
    }
    for (let projectIndex = 0; projectIndex < 74; projectIndex += 1) {
      const ownerPath = `${projectScopes[projectIndex]!.locator}/logs/generations.jsonl`;
      const ownerEntryId = projectIndex === 1
        ? mutation === "denti-owner-id" ? "mentry_00000000-0000-4000-8000-000000009999"
          : DENTI_GENERATION_OWNER_ID
        : projectIndex === 2 ? "mentry_89336710-b955-4661-9b79-5369cb272c65"
          : projectIndex === 3 ? "mentry_d2416d74-a156-46fd-9293-edb71f27a1ee"
            : projectIndex === 4 ? "mentry_be6a8ad1-a03f-47f1-872b-f8e15111cb6b"
        : `mentry_generation_${projectIndex.toString().padStart(3, "0")}`;
      insertEntry.run(ownerEntryId, runId, sourceId, ownerPath,
        projectIndex === 1 ? dentiLocatorHash
          : createHash("sha256").update(ownerPath).digest("hex"),
        "domain", `generation-${projectIndex}`, 1,
        null, JSON.stringify(ownerRefs[projectIndex]!.sort()), "imported");
    }
    for (let index = 0; index < 24; index += 1) {
      const sourcePath = index === 0 ? "workspaces/.DS_Store"
        : index === 1 ? "projects/.DS_Store"
        : `workspaces/normal-${index - 1}/projects/.DS_Store`;
      const evidencePath = mutation === "ghost-evidence" && index === 0 ? "unbound/.DS_Store" : sourcePath;
      insertEntry.run(`mentry_ds_scope_${index}`, runId, sourceId, evidencePath,
        createHash("sha256").update(evidencePath).digest("hex"), "system", `ds-scope-${index}`,
        1, null, mutation === "ghost-original-ref" && index === 0 ? JSON.stringify([ghostWorkspaceId]) : null, "excluded");
    }
    for (let index = 24; index < 427; index += 1) {
      const sourcePath = `ignored/${index}/.DS_Store`;
      insertEntry.run(`mentry_ds_${index}`, runId, sourceId, sourcePath,
        createHash("sha256").update(sourcePath).digest("hex"), "system", `ds-${index}`, 1, null, null, "excluded");
    }
    insertEntry.run("mentry_ds_case_decoy", runId, sourceId, "ignored/.ds_store",
      createHash("sha256").update("ignored/.ds_store").digest("hex"), "system", "ds-case", 1, null,
      mutation === "unexpected-original-target"
        ? JSON.stringify(["comp_cbb20e06-b03e-43bf-8c6b-50d1fb34fe7f"]) : null,
      "excluded");
    if (mutation === "production-manifest") {
      const sourcePath = `${projectScopes[3]!.locator}/production.json`;
      insertEntry.run("mentry_production_manifest", runId, sourceId, sourcePath,
        createHash("sha256").update(sourcePath).digest("hex"), "domain", "production-manifest", 1,
        null, null, "imported");
    }

    if (mutation === "unexpected-supplemental") {
      db.prepare(
        `INSERT INTO migration_entry_supplemental_refs
         (migration_entry_id, target_ref, repair_key, created_at)
         VALUES ('mentry_ds_scope_0', 'comp_52e73ee0-45d9-41fd-8e86-a5b829c64c6b', 'task-2d2-v1', 1)`,
      ).run();
    }
    if (mutation === "ghost-polymorphic") {
      db.prepare(
        `INSERT INTO activity_events
         (entity_type, entity_id, action, payload_json, created_at)
         VALUES ('project', ?, 'decoy', '{}', 1)`,
      ).run(migrationStableId("prj", runId, `project:${sourceLabel}\0default\0.DS_Store`));
    }
    const remainingObjects = 83_206 - 289 - 784;
    const fillerProjectSql = mutation === "ghost-fk"
      ? `CASE WHEN value = 1 THEN '${migrationStableId("prj", runId, `project:${sourceLabel}\0default\0.DS_Store`)}' ELSE '${projectIds[5]}' END`
      : `'${projectIds[5]}'`;
    db.exec(`WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < ${remainingObjects})
      INSERT INTO objects (id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes, storage_class, created_at)
      SELECT printf('obj_fill_%06d', value), '${workspaceId}', ${fillerProjectSql}, 'local', 'objects',
             printf('fill-object-%06d', value), printf('%064x', value), 'application/octet-stream', 1, 'standard', 1 FROM n`);
    const remainingArtifacts = 21_626 - 288 - 778;
    db.exec(`WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < ${remainingArtifacts})
      INSERT INTO artifacts (id, workspace_id, project_id, slug, kind, row_version, created_at, updated_at)
      SELECT printf('art_fill_%06d', value), '${workspaceId}', '${projectIds[5]}', printf('fill-art-%06d', value), 'video', 1, 1, 1 FROM n`);
    db.exec(`WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < ${remainingArtifacts})
      INSERT INTO artifact_revisions (id, artifact_id, object_id, revision_no, state, created_at)
      SELECT printf('arev_fill_%06d', value), printf('art_fill_%06d', value), printf('obj_fill_%06d', value), 1, 'approved', 1 FROM n`);
    db.exec(`WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < 835)
      INSERT INTO artifact_revisions (id, artifact_id, object_id, revision_no, state, created_at)
      SELECT printf('arev_extra_%06d', value), 'art_fill_000001', 'obj_fill_000001', value + 1, 'approved', 1 FROM n`);
    db.exec(`WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < 181)
      INSERT INTO units (id, workspace_id, project_id, slug, format, row_version, created_at, updated_at)
      SELECT printf('unit_fill_%06d', value), '${workspaceId}', '${projectIds[5]}', printf('unit-%06d', value), 'video', 1, 1, 1 FROM n`);
  })();
}
