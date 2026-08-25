import { afterEach, describe, expect, spyOn, test } from "bun:test";
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
  "settings",
  "brands",
  "personas",
  "workspace_templates",
  "memory_entries",
  "memory_revisions",
  "campaigns",
  "campaign_cells",
  "calendar_entries",
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
  "agent_turns",
  "agent_turn_events",
  "runs",
  "run_attempts",
  "run_objects",
  "jobs",
  "job_logs",
  "job_artifacts",
  "activity_events",
  "migration_runs",
  "migration_sources",
  "migration_entries",
  "migration_entry_supplemental_refs",
  "migration_issues",
] as const;

let roots: TmpRoot[] = [];

function makeRoot(prefix = "ralphy-domain-db"): TmpRoot {
  const tmp = makeTmpRoot(prefix);
  roots.push(tmp);
  return tmp;
}

function createV1Database(databasePath: string): void {
  const db = new Database(databasePath, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("BEGIN EXCLUSIVE");
  db.exec(MIGRATIONS[0]!.sql);
  db.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)",
  ).run(1);
  db.exec("PRAGMA user_version = 1");
  db.exec("COMMIT");
  db.prepare(
    `INSERT INTO workspaces (id, slug, name, created_at, updated_at)
     VALUES ('ws_legacy', 'legacy', 'Legacy Workspace', 1, 1)`,
  ).run();
  db.prepare(
    `INSERT INTO social_accounts
     (id, workspace_id, platform, external_id, display_name, username,
      config_json, created_at, updated_at)
     VALUES ('acct_legacy', 'ws_legacy', 'instagram', 'external-legacy',
             'Legacy Account', 'legacy-user', '{"enabled":true}', 1, 1)`,
  ).run();
  db.close();
}

afterEach(() => {
  closeDomainDb();
  for (const tmp of roots) tmp.cleanup();
  roots = [];
});

describe("domain database bootstrap", () => {
  test("opens the authoritative database with enforced pragmas and current schema", () => {
    const tmp = makeRoot();
    const db = openDomainDb();

    expect(domainDbPath()).toBe(path.join(tmp.dir, ".ralphy", "ralphy.db"));
    expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(db.query("PRAGMA journal_mode").get()).toEqual({
      journal_mode: "wal",
    });
    expect(db.query("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
    expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION });
    expect(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((row) => row.name),
    ).toEqual(expect.arrayContaining([...REQUIRED_TABLES]));
    expect(db.query("SELECT version FROM schema_migrations").all()).toEqual(
      MIGRATIONS.map(({ version }) => ({ version })),
    );
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(SCHEMA_VERSION).toBe(9);

    const socialAccountColumns = db
      .query<{ name: string }, []>("PRAGMA table_info('social_accounts')")
      .all()
      .map((column) => column.name);
    expect(socialAccountColumns.slice(-3)).toEqual([
      "credential_ref",
      "relink_required",
      "row_version",
    ]);

    db.prepare(
      `INSERT INTO workspaces (id, slug, name, created_at, updated_at)
       VALUES ('ws_schema_v2', 'schema-v2', 'Schema v2', 1, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO social_accounts
       (id, workspace_id, platform, external_id, created_at, updated_at)
       VALUES ('acct_schema_v2', 'ws_schema_v2', 'instagram', 'legacy-id', 1, 1)`,
    ).run();
    expect(
      db
        .query(
          `SELECT credential_ref, relink_required, row_version
           FROM social_accounts WHERE id = 'acct_schema_v2'`,
        )
        .get(),
    ).toEqual({ credential_ref: null, relink_required: 0, row_version: 1 });
    expect(() =>
      db.exec(
        "UPDATE social_accounts SET relink_required = 2 WHERE id = 'acct_schema_v2'",
      ),
    ).toThrow(/constraint/i);
    expect(() =>
      db.exec(
        "UPDATE social_accounts SET row_version = 0 WHERE id = 'acct_schema_v2'",
      ),
    ).toThrow(/constraint/i);

    closeDomainDb();
    const reopened = openDomainDb();
    expect(
      reopened.query("SELECT COUNT(*) AS count FROM schema_migrations").get(),
    ).toEqual({
      count: MIGRATIONS.length,
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

  test("does not reset WAL mode when opening a current database", () => {
    makeRoot("ralphy-domain-db-writer");
    openDomainDb();
    closeDomainDb();
    const exec = Database.prototype.exec;
    const execSpy = spyOn(Database.prototype, "exec").mockImplementation(function (
      this: Database,
      sql: string,
    ) {
      if (/^PRAGMA journal_mode\s*=\s*WAL$/i.test(sql)) {
        throw new Error("database is locked");
      }
      return exec.call(this, sql);
    });

    try {
      expect(() => openDomainDb()).not.toThrow();
      expect(openDomainDb().query("PRAGMA journal_mode").get()).toEqual({
        journal_mode: "wal",
      });
    } finally {
      closeDomainDb();
      execSpy.mockRestore();
    }
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

  test("does not take a writer lock when the schema is current", () => {
    makeRoot("ralphy-domain-db-current");
    const databasePath = domainDbPath();
    const writer = new Database(databasePath, { create: true });
    writer.exec("PRAGMA journal_mode = WAL");
    applyMigrations(writer);
    writer.exec("BEGIN IMMEDIATE");
    const reader = new Database(databasePath, { create: true });
    reader.exec("PRAGMA busy_timeout = 0");

    try {
      expect(() => applyMigrations(reader)).not.toThrow();
      expect(reader.query("PRAGMA user_version").get()).toEqual({
      user_version: SCHEMA_VERSION,
      });
    } finally {
      reader.close();
      writer.exec("ROLLBACK");
      writer.close();
    }
  });

  test("preserves a v1 Social Account and one verified v1 backup during the ordinary upgrade", () => {
    const tmp = makeRoot("ralphy-domain-db'backup");
    const databasePath = domainDbPath();
    createV1Database(databasePath);

    const live = openDomainDb();
    expect(live.query("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION });
    expect(
      live.query("SELECT version FROM schema_migrations ORDER BY version").all(),
    ).toEqual(MIGRATIONS.map(({ version }) => ({ version })));
    expect(
      live
        .query(
          `SELECT id, workspace_id, platform, external_id, credential_ref,
                  relink_required, row_version
           FROM social_accounts WHERE id = 'acct_legacy'`,
        )
        .get(),
    ).toEqual({
      id: "acct_legacy",
      workspace_id: "ws_legacy",
      platform: "instagram",
      external_id: "external-legacy",
      credential_ref: null,
      relink_required: 0,
      row_version: 1,
    });

    const backupDir = path.join(tmp.dir, ".ralphy", "backups");
    const backups = fs.readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^ralphy-schema-1-\d+\.db$/);

    const backup = new Database(path.join(backupDir, backups[0]), {
      readonly: true,
    });
    expect(backup.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(backup.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
    expect(backup.query("SELECT version FROM schema_migrations").all()).toEqual([
      { version: 1 },
    ]);
    expect(
      backup
        .query(
          `SELECT id, workspace_id, platform, external_id
           FROM social_accounts WHERE id = 'acct_legacy'`,
        )
        .get(),
    ).toEqual({
      id: "acct_legacy",
      workspace_id: "ws_legacy",
      platform: "instagram",
      external_id: "external-legacy",
    });
    backup.close();
  });

  test("serializes concurrent migration decisions under the exclusive lock", async () => {
    const tmp = makeRoot("ralphy-domain-db-concurrent");
    const databasePath = domainDbPath();
    createV1Database(databasePath);
    const blocker = new Database(databasePath, { create: true });
    blocker.exec("BEGIN EXCLUSIVE");

    const workerSource = `
      import fs from "node:fs";
      import { Database } from "bun:sqlite";
      import { applyMigrations } from ${JSON.stringify(
        path.join(process.cwd(), "cli/lib/store/schema.ts"),
      )};

      const databasePath = process.env.RALPHY_TEST_DOMAIN_DB;
      const readyPath = process.env.RALPHY_TEST_MIGRATION_READY;
      if (!databasePath || !readyPath) throw new Error("missing test worker paths");

      const db = new Database(databasePath, { create: true });
      db.exec("PRAGMA busy_timeout = 5000");
      const observed = new Proxy(db, {
        get(target, property) {
          if (property === "exec") {
            return (sql) => {
              if (sql === "BEGIN EXCLUSIVE") fs.writeFileSync(readyPath, "");
              return target.exec(sql);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });

      try {
        applyMigrations(observed);
      } finally {
        db.close();
      }
    `;
    const readyPaths = [
      path.join(tmp.dir, "migrator-1.ready"),
      path.join(tmp.dir, "migrator-2.ready"),
    ];
    const workers = readyPaths.map((readyPath) =>
      Bun.spawn({
        cmd: ["bun", "-e", workerSource],
        cwd: process.cwd(),
        env: {
          ...process.env,
          RALPHY_TEST_DOMAIN_DB: databasePath,
          RALPHY_TEST_MIGRATION_READY: readyPath,
        },
        stdout: "ignore",
        stderr: "pipe",
      }),
    );
    let released = false;

    try {
      const deadline = Date.now() + 2_000;
      while (!readyPaths.every(fs.existsSync)) {
        if (Date.now() >= deadline) {
          throw new Error(
            "concurrent migrators did not reach the lock barrier",
          );
        }
        await Bun.sleep(5);
      }

      blocker.exec("COMMIT");
      released = true;
      const results = await Promise.all(
        workers.map(async (worker) => {
          const [exitCode, stderr] = await Promise.all([
            worker.exited,
            new Response(worker.stderr).text(),
          ]);
          return { exitCode, stderr };
        }),
      );

      expect(results).toEqual([
        { exitCode: 0, stderr: "" },
        { exitCode: 0, stderr: "" },
      ]);
    } finally {
      if (!released) blocker.exec("ROLLBACK");
      blocker.close();
      for (const worker of workers) {
        if (worker.exitCode === null) worker.kill();
      }
      await Promise.all(workers.map((worker) => worker.exited));
    }

    const live = new Database(databasePath, { readonly: true });
    expect(live.query("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION });
    expect(
      live
        .query(
          `SELECT id, credential_ref, relink_required, row_version
           FROM social_accounts WHERE id = 'acct_legacy'`,
        )
        .get(),
    ).toEqual({
      id: "acct_legacy",
      credential_ref: null,
      relink_required: 0,
      row_version: 1,
    });
    live.close();

    const backupDir = path.join(tmp.dir, ".ralphy", "backups");
    const backups = fs.readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^ralphy-schema-1-\d+\.db$/);
    const backup = new Database(path.join(backupDir, backups[0]), {
      readonly: true,
    });
    expect(backup.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(backup.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
    expect(
      backup
        .query("SELECT id FROM social_accounts WHERE id = 'acct_legacy'")
        .get(),
    ).toEqual({ id: "acct_legacy" });
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

    db.prepare(
      `INSERT INTO builds
       (id, composition_revision_id, state, profile_json, created_at, started_at)
       VALUES ('build_1', 'crev_1', 'running', '{}', 1, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO build_outputs
       (id, build_id, artifact_revision_id, role, position, created_at)
       VALUES ('output_1', 'build_1', 'arev_1', 'master', 0, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO build_document_bindings
       (id, build_id, document_revision_id, role, created_at)
       VALUES ('bind_build_1', 'build_1', 'drev_1', 'brief', 1)`,
    ).run();
    db.prepare(
      "UPDATE builds SET state = 'succeeded', ended_at = 2 WHERE id = 'build_1'",
    ).run();
    expect(() =>
      db.prepare("UPDATE builds SET profile_json = '{}' WHERE id = 'build_1'").run(),
    ).toThrow(/immutable/i);
    expect(() => db.prepare("DELETE FROM builds WHERE id = 'build_1'").run()).toThrow(
      /immutable/i,
    );
    expect(() =>
      db.prepare("UPDATE build_outputs SET role = 'changed' WHERE id = 'output_1'").run(),
    ).toThrow(/immutable/i);
    expect(() =>
      db.prepare("DELETE FROM build_outputs WHERE id = 'output_1'").run(),
    ).toThrow(/immutable/i);
    expect(() =>
      db
        .prepare(
          `INSERT INTO build_outputs
           (id, build_id, artifact_revision_id, position, created_at)
           VALUES ('output_late', 'build_1', 'arev_1', 1, 2)`,
        )
        .run(),
    ).toThrow(/running/i);
    expect(() =>
      db
        .prepare(
          "UPDATE build_document_bindings SET role = 'changed' WHERE id = 'bind_build_1'",
        )
        .run(),
    ).toThrow(/immutable/i);
    expect(() =>
      db
        .prepare(
          "DELETE FROM build_document_bindings WHERE id = 'bind_build_1'",
        )
        .run(),
    ).toThrow(/immutable/i);
    expect(() =>
      db
        .prepare(
          `INSERT INTO build_document_bindings
           (id, build_id, document_revision_id, role, created_at)
           VALUES ('bind_late', 'build_1', 'drev_1', 'late', 2)`,
        )
        .run(),
    ).toThrow(/pending|running/i);

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

  test("rejects replacement of immutable rows with recursive triggers disabled", () => {
    makeRoot();
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    seedRevisionGraph(db);
    db.prepare(
      "INSERT INTO workspaces (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run("ws_2", "other-workspace", "Other workspace", 1, 1);
    db.prepare(
      "INSERT INTO agent_sessions (id, workspace_id, agent, metadata_json, started_at) VALUES (?, ?, ?, ?, ?)",
    ).run("session_1", "ws_1", "codex", '{"mode":"review"}', 1);
    db.prepare(
      "INSERT INTO activity_events (id, workspace_id, project_id, entity_type, entity_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      41,
      "ws_1",
      "prj_1",
      "document",
      "doc_1",
      "document.revised",
      '{"revisionId":"drev_1"}',
      1,
    );

    const originalStore = serializedSingleton(db, "store_metadata", "singleton", 1);
    const immutableRows = [
      ["agent_sessions", "session_1"],
      ["document_revisions", "drev_1"],
      ["artifact_revisions", "arev_1"],
      ["composition_revisions", "crev_1"],
      ["unit_revisions", "urev_1"],
      ["activity_events", 41],
    ] as const;
    const originals = immutableRows.map(([table, id]) =>
      serializedSingleton(db, table, "id", id),
    );

    expect(() => db.exec("DELETE FROM store_metadata")).toThrow(/immutable/i);
    expect(() =>
      db.exec(
        `INSERT OR REPLACE INTO store_metadata (singleton, store_id)
         VALUES (1, 'store_${"f".repeat(32)}')`,
      ),
    ).toThrow(/immutable/i);
    expect(() =>
      db.exec(
        `INSERT OR REPLACE INTO store_metadata (singleton, store_id)
         SELECT singleton, store_id FROM store_metadata`,
      ),
    ).toThrow(/immutable/i);

    expect(() =>
      db.exec("DELETE FROM agent_sessions WHERE id = 'session_1'"),
    ).toThrow(/immutable/i);
    expect(() =>
      db.exec(
        `INSERT OR REPLACE INTO agent_sessions
           (id, workspace_id, agent, metadata_json, started_at)
         VALUES ('session_1', 'ws_2', 'rewritten', '{}', 2)`,
      ),
    ).toThrow(/immutable/i);

    const revisionReplacements = [
      {
        table: "document_revisions",
        sameId: `INSERT OR REPLACE INTO document_revisions
          (id, document_id, revision_no, format, body, content_sha256, created_at)
          VALUES ('drev_1', 'doc_1', 1, 'text', 'Rewritten', '${"b".repeat(64)}', 2)`,
        sameRevision: `INSERT OR REPLACE INTO document_revisions
          (id, document_id, revision_no, format, body, content_sha256, created_at)
          VALUES ('drev_other', 'doc_1', 1, 'text', 'Rewritten', '${"b".repeat(64)}', 2)`,
      },
      {
        table: "artifact_revisions",
        sameId: `INSERT OR REPLACE INTO artifact_revisions
          (id, artifact_id, object_id, revision_no, state, created_at)
          VALUES ('arev_1', 'art_1', 'obj_1', 1, 'approved', 2)`,
        sameRevision: `INSERT OR REPLACE INTO artifact_revisions
          (id, artifact_id, object_id, revision_no, state, created_at)
          VALUES ('arev_other', 'art_1', 'obj_1', 1, 'approved', 2)`,
      },
      {
        table: "composition_revisions",
        sameId: `INSERT OR REPLACE INTO composition_revisions
          (id, composition_id, revision_no, state, engine, engine_config_json, created_at)
          VALUES ('crev_1', 'comp_1', 1, 'draft', 'remotion', '{}', 2)`,
        sameRevision: `INSERT OR REPLACE INTO composition_revisions
          (id, composition_id, revision_no, state, engine, engine_config_json, created_at)
          VALUES ('crev_other', 'comp_1', 1, 'draft', 'remotion', '{}', 2)`,
      },
      {
        table: "unit_revisions",
        sameId: `INSERT OR REPLACE INTO unit_revisions
          (id, unit_id, revision_no, note, created_at)
          VALUES ('urev_1', 'unit_1', 1, 'Rewritten', 2)`,
        sameRevision: `INSERT OR REPLACE INTO unit_revisions
          (id, unit_id, revision_no, note, created_at)
          VALUES ('urev_other', 'unit_1', 1, 'Rewritten', 2)`,
      },
    ] as const;
    for (const replacement of revisionReplacements) {
      expect(() => db.exec(replacement.sameId), replacement.table).toThrow(
        /immutable/i,
      );
      expect(
        () => db.exec(replacement.sameRevision),
        replacement.table,
      ).toThrow(/immutable/i);
    }

    expect(() =>
      db.exec("DELETE FROM activity_events WHERE id = 41"),
    ).toThrow(/append-only/i);
    expect(() =>
      db.exec(
        `INSERT OR REPLACE INTO activity_events
           (id, workspace_id, project_id, entity_type, entity_id, action, payload_json, created_at)
         VALUES (41, 'ws_1', 'prj_1', 'project', 'prj_1', 'project.rewritten', '{}', 2)`,
      ),
    ).toThrow(/append-only/i);

    expect(serializedSingleton(db, "store_metadata", "singleton", 1)).toBe(
      originalStore,
    );
    expect(
      immutableRows.map(([table, id]) =>
        serializedSingleton(db, table, "id", id),
      ),
    ).toEqual(originals);
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

  test("rejects duplicate workspace-scoped Document slugs", () => {
    makeRoot();
    const db = openDomainDb();
    db.prepare(
      "INSERT INTO workspaces (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run("ws_documents", "documents", "Documents", 1, 1);
    const insert = db.prepare(
      "INSERT INTO documents (id, workspace_id, kind, slug, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run(
      "doc_workspace_1",
      "ws_documents",
      "brief",
      "brief",
      "First",
      1,
      1,
    );

    expect(() =>
      insert.run(
        "doc_workspace_2",
        "ws_documents",
        "brief",
        "brief",
        "Second",
        1,
        1,
      ),
    ).toThrow();
  });

  test("rejects duplicate workspace-scoped Artifact slugs", () => {
    makeRoot();
    const db = openDomainDb();
    db.prepare(
      "INSERT INTO workspaces (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run("ws_artifacts", "artifacts", "Artifacts", 1, 1);
    const insert = db.prepare(
      "INSERT INTO artifacts (id, workspace_id, slug, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    insert.run("art_workspace_1", "ws_artifacts", "logo", "image", 1, 1);

    expect(() =>
      insert.run("art_workspace_2", "ws_artifacts", "logo", "image", 1, 1),
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
    "INSERT INTO units (id, workspace_id, project_id, slug, format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run("unit_1", "ws_1", "prj_1", "unit", "video", 1, 1);
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

function serializedSingleton(
  db: Database,
  table: string,
  key: string,
  value: string | number,
): string {
  return JSON.stringify(
    db.query(`SELECT * FROM ${table} WHERE ${key} = ?`).get(value),
  );
}
