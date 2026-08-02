import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  closeDomainDb,
  domainDbPath,
  openDomainDb,
  withImmediateTransaction,
} from "../../cli/lib/store/db.js";
import { DOMAIN_ID_PREFIXES, newDomainId } from "../../cli/lib/store/ids.js";
import {
  applyMigrations,
  MIGRATIONS,
  SCHEMA_VERSION,
} from "../../cli/lib/store/schema.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const REQUIRED_TABLES = [
  "schema_migrations",
  "storage_transfers",
  "storage_transfer_entries",
  "workspaces",
  "social_accounts",
  "projects",
  "project_iterations",
  "feedback_items",
  "feedback_resolution_links",
  "project_stages",
  "documents",
  "document_revisions",
  "project_document_bindings",
  "build_document_bindings",
  "document_revisions_fts",
  "objects",
  "artifacts",
  "artifact_revisions",
  "artifact_relations",
  "artifact_usages",
  "compositions",
  "composition_revisions",
  "composition_revision_files",
  "composition_inputs",
  "builds",
  "build_outputs",
  "evaluations",
  "units",
  "unit_revisions",
  "unit_items",
  "unit_presentations",
  "presentation_items",
  "publications",
  "metric_snapshots",
  "agent_sessions",
  "runs",
  "run_attempts",
  "run_objects",
  "jobs",
  "job_logs",
  "job_artifacts",
  "activity_events",
] as const;

let roots: TmpRoot[] = [];

function makeRoot(prefix = "ralphy-domain-db"): TmpRoot {
  const tmp = makeTmpRoot(prefix);
  roots.push(tmp);
  return tmp;
}

afterEach(() => {
  closeDomainDb();
  for (const tmp of roots) tmp.cleanup();
  roots = [];
});

describe("domain database bootstrap", () => {
  test("opens the authoritative database with enforced pragmas and schema v1", () => {
    const tmp = makeRoot();
    const db = openDomainDb();

    expect(domainDbPath()).toBe(path.join(tmp.dir, ".ralphy", "ralphy.db"));
    expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(db.query("PRAGMA journal_mode").get()).toEqual({
      journal_mode: "wal",
    });
    expect(db.query("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
    expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
    expect(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((row) => row.name),
    ).toEqual(expect.arrayContaining([...REQUIRED_TABLES]));
    expect(db.query("SELECT version FROM schema_migrations").all()).toEqual([
      { version: 1 },
    ]);
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual([1]);
    expect(SCHEMA_VERSION).toBe(1);

    closeDomainDb();
    const reopened = openDomainDb();
    expect(
      reopened.query("SELECT COUNT(*) AS count FROM schema_migrations").get(),
    ).toEqual({
      count: 1,
    });
  });

  test("reopens the cached connection when the absolute root changes", () => {
    makeRoot("ralphy-domain-db-first");
    const first = openDomainDb();
    const firstPath = domainDbPath();

    makeRoot("ralphy-domain-db-second");
    const second = openDomainDb();

    expect(domainDbPath()).not.toBe(firstPath);
    expect(second).not.toBe(first);
    expect(() => first.query("SELECT 1").get()).toThrow();
  });

  test("runs immediate transactions atomically", () => {
    makeRoot();
    const db = openDomainDb();
    db.exec("CREATE TABLE immediate_probe (value TEXT NOT NULL)");

    expect(() =>
      withImmediateTransaction((tx) => {
        tx.prepare("INSERT INTO immediate_probe (value) VALUES (?)").run(
          "rolled back",
        );
        throw new Error("fixture failure");
      }),
    ).toThrow("fixture failure");
    expect(db.query("SELECT value FROM immediate_probe").all()).toEqual([]);
  });

  test("generates opaque prefixed UUID identifiers", () => {
    expect(DOMAIN_ID_PREFIXES).toContain("ws");
    expect(newDomainId("ws")).toMatch(
      /^ws_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("schema migration safety", () => {
  test("rolls back the whole migration when a version hook fails", () => {
    const db = new Database(":memory:");
    expect(() =>
      applyMigrations(db, {
        beforeVersion(version) {
          expect(version).toBe(1);
          throw new Error("stop before migration");
        },
      }),
    ).toThrow("stop before migration");

    expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 0 });
    expect(
      db
        .query(
          "SELECT name FROM sqlite_master WHERE name = 'schema_migrations'",
        )
        .get(),
    ).toBeNull();
    expect(
      db
        .query("SELECT name FROM sqlite_master WHERE name = 'workspaces'")
        .get(),
    ).toBeNull();
    db.close();
  });

  test("rejects a database newer than this binary", () => {
    const db = new Database(":memory:");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    expect(() => applyMigrations(db)).toThrow(/newer/i);
    expect(db.query("PRAGMA user_version").get()).toEqual({
      user_version: SCHEMA_VERSION + 1,
    });
    db.close();
  });

  test("checkpoints and verifies a bound read-only backup before upgrading existing data", () => {
    const tmp = makeRoot("ralphy-domain-db'backup");
    const databasePath = domainDbPath();
    const existing = new Database(databasePath, { create: true });
    existing.exec("PRAGMA journal_mode = WAL");
    existing.exec("CREATE TABLE legacy_marker (value TEXT NOT NULL)");
    existing
      .prepare("INSERT INTO legacy_marker (value) VALUES (?)")
      .run("preserved");
    existing.close();

    openDomainDb();

    const backupDir = path.join(tmp.dir, ".ralphy", "backups");
    const backups = fs.readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^ralphy-schema-0-\d+\.db$/);

    const backup = new Database(path.join(backupDir, backups[0]), {
      readonly: true,
    });
    expect(backup.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(backup.query("SELECT value FROM legacy_marker").get()).toEqual({
      value: "preserved",
    });
    backup.close();
  });
});

describe("schema constraints", () => {
  test("declares an explicit ownership policy for every foreign key and no binary columns", () => {
    makeRoot();
    const db = openDomainDb();

    for (const table of REQUIRED_TABLES.filter(
      (name) => name !== "document_revisions_fts",
    )) {
      const foreignKeys = db
        .query(`PRAGMA foreign_key_list('${table}')`)
        .all() as Array<{
        on_delete: string;
      }>;
      for (const foreignKey of foreignKeys) {
        expect(["CASCADE", "RESTRICT"]).toContain(foreignKey.on_delete);
      }

      const columns = db.query(`PRAGMA table_info('${table}')`).all() as Array<{
        type: string;
      }>;
      expect(
        columns.some((column) => column.type.toUpperCase() === "BLOB"),
      ).toBe(false);
    }
  });

  test("enforces revision immutability, sealed composition children, and Unit target XOR", () => {
    makeRoot();
    const db = openDomainDb();
    seedRevisionGraph(db);

    expect(() =>
      db
        .prepare("UPDATE document_revisions SET title = ? WHERE id = ?")
        .run("changed", "drev_1"),
    ).toThrow(/immutable/i);
    expect(() =>
      db.prepare("DELETE FROM document_revisions WHERE id = ?").run("drev_1"),
    ).toThrow(/immutable/i);
    expect(() =>
      db
        .prepare("UPDATE artifact_revisions SET state = ? WHERE id = ?")
        .run("approved", "arev_1"),
    ).toThrow(/immutable/i);
    expect(() =>
      db.prepare("DELETE FROM artifact_revisions WHERE id = ?").run("arev_1"),
    ).toThrow(/immutable/i);
    expect(() =>
      db
        .prepare("UPDATE unit_revisions SET note = ? WHERE id = ?")
        .run("changed", "urev_1"),
    ).toThrow(/immutable/i);
    expect(() =>
      db.prepare("DELETE FROM unit_revisions WHERE id = ?").run("urev_1"),
    ).toThrow(/immutable/i);

    expect(() =>
      db
        .prepare(
          "UPDATE composition_revisions SET state = 'sealed', sealed_at = ?, manifest_sha256 = ?, engine = ? WHERE id = ?",
        )
        .run(2, "b".repeat(64), "changed", "crev_invalid"),
    ).toThrow(/draft to sealed/i);
    db.prepare(
      "UPDATE composition_revisions SET state = 'sealed', sealed_at = ?, manifest_sha256 = ? WHERE id = ?",
    ).run(2, "b".repeat(64), "crev_1");
    expect(() =>
      db
        .prepare(
          "INSERT INTO composition_revision_files (id, composition_revision_id, logical_path, object_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("cfile_2", "crev_1", "late.html", "obj_1", 1, 2),
    ).toThrow(/sealed/i);
    expect(() =>
      db
        .prepare(
          "UPDATE composition_revision_files SET logical_path = ? WHERE id = ?",
        )
        .run("changed.html", "cfile_1"),
    ).toThrow(/sealed/i);
    expect(() =>
      db
        .prepare("DELETE FROM composition_revision_files WHERE id = ?")
        .run("cfile_1"),
    ).toThrow(/sealed/i);
    expect(() =>
      db
        .prepare(
          "INSERT INTO composition_inputs (id, composition_revision_id, artifact_revision_id, role, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("input_2", "crev_1", "arev_1", "late", 1, 2),
    ).toThrow(/sealed/i);
    expect(() =>
      db
        .prepare("UPDATE composition_inputs SET role = ? WHERE id = ?")
        .run("changed", "input_1"),
    ).toThrow(/sealed/i);
    expect(() =>
      db.prepare("DELETE FROM composition_inputs WHERE id = ?").run("input_1"),
    ).toThrow(/sealed/i);

    expect(() =>
      insertUnitItem(db, {
        id: "item_neither",
        artifactRevisionId: null,
        documentRevisionId: null,
      }),
    ).toThrow();
    expect(() =>
      insertUnitItem(db, {
        id: "item_both",
        artifactRevisionId: "arev_1",
        documentRevisionId: "drev_1",
      }),
    ).toThrow();
    expect(() =>
      insertUnitItem(db, {
        id: "item_artifact",
        artifactRevisionId: "arev_1",
        documentRevisionId: null,
      }),
    ).not.toThrow();
    expect(() =>
      insertUnitItem(db, {
        id: "item_document",
        artifactRevisionId: null,
        documentRevisionId: "drev_1",
      }),
    ).not.toThrow();
  });

  test("accepts nullable JSON and rejects absolute or traversing Object keys", () => {
    makeRoot();
    const db = openDomainDb();
    db.prepare(
      "INSERT INTO workspaces (id, slug, name, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("ws_keys", "keys", "Keys", null, 1, 1);

    expect(() =>
      insertObject(db, "obj_valid", "objects/clip..v2.bin"),
    ).not.toThrow();
    expect(() =>
      insertObject(db, "obj_parent", "objects/../escape.bin"),
    ).toThrow();
    expect(() => insertObject(db, "obj_absolute", "/tmp/escape.bin")).toThrow();
    expect(() =>
      insertObject(db, "obj_windows", "C:\\tmp\\escape.bin"),
    ).toThrow();
  });
});

function seedRevisionGraph(db: Database): void {
  db.prepare(
    "INSERT INTO workspaces (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("ws_1", "workspace", "Workspace", 1, 1);
  db.prepare(
    "INSERT INTO projects (id, workspace_id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("prj_1", "ws_1", "project", "Project", 1, 1);
  db.prepare(
    "INSERT INTO documents (id, workspace_id, project_id, kind, slug, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("doc_1", "ws_1", "prj_1", "brief", "brief", "Brief", 1, 1);
  db.prepare(
    "INSERT INTO document_revisions (id, document_id, revision_no, format, title, body, content_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("drev_1", "doc_1", 1, "markdown", "Brief", "Body", "a".repeat(64), 1);

  insertObject(db, "obj_1", "objects/source.html", "ws_1", "prj_1");
  db.prepare(
    "INSERT INTO artifacts (id, workspace_id, project_id, slug, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run("art_1", "ws_1", "prj_1", "scene", "video", 1, 1);
  db.prepare(
    "INSERT INTO artifact_revisions (id, artifact_id, object_id, revision_no, state, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("arev_1", "art_1", "obj_1", 1, "working", 1);

  db.prepare(
    "INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("comp_1", "prj_1", "composition", "video", 1, 1);
  for (const id of ["crev_1", "crev_invalid"]) {
    db.prepare(
      "INSERT INTO composition_revisions (id, composition_id, revision_no, state, engine, engine_config_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      "comp_1",
      id === "crev_1" ? 1 : 2,
      "draft",
      "hyperframes",
      "{}",
      1,
    );
  }
  db.prepare(
    "INSERT INTO composition_revision_files (id, composition_revision_id, logical_path, object_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("cfile_1", "crev_1", "index.html", "obj_1", 0, 1);
  db.prepare(
    "INSERT INTO composition_inputs (id, composition_revision_id, artifact_revision_id, role, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("input_1", "crev_1", "arev_1", "scene", 0, 1);

  db.prepare(
    "INSERT INTO units (id, project_id, slug, format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("unit_1", "prj_1", "unit", "video", 1, 1);
  db.prepare(
    "INSERT INTO unit_revisions (id, unit_id, revision_no, note, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run("urev_1", "unit_1", 1, null, 1);
}

function insertObject(
  db: Database,
  id: string,
  key: string,
  workspaceId = "ws_keys",
  projectId: string | null = null,
): void {
  db.prepare(
    "INSERT INTO objects (id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes, storage_class, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    workspaceId,
    projectId,
    "local",
    projectId
      ? `${workspaceId}/projects/${projectId}`
      : `${workspaceId}/shared`,
    key,
    "a".repeat(64),
    "application/octet-stream",
    1,
    "working",
    1,
  );
}

function insertUnitItem(
  db: Database,
  input: {
    id: string;
    artifactRevisionId: string | null;
    documentRevisionId: string | null;
  },
): void {
  db.prepare(
    "INSERT INTO unit_items (id, unit_revision_id, artifact_revision_id, document_revision_id, role, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    input.id,
    "urev_1",
    input.artifactRevisionId,
    input.documentRevisionId,
    "primary",
    input.id === "item_document" ? 1 : 0,
    1,
  );
}
