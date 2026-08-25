import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareTask2d2SchemaV6 } from "../../cli/lib/migration/schema-bootstrap.js";
import { canonicalRequestJson } from "../../cli/lib/store/canonical-json.js";
import { MIGRATIONS } from "../../cli/lib/store/schema.js";

const CORE_COMMIT = "a".repeat(40);
const RUN_ID = "mig_c37f36ac-47a0-4330-8303-74cee92b7ddd";
const CUTOVER_AT = 1_786_301_683_658;
const CUTOVER_ACTIVITY_ID = 8_765;
const SOURCE_ID = "source-schema-bootstrap-fixture";
const ENTRY_ID = "mentry_schema-bootstrap-fixture";
const ENTRY_ID_VARIANT = "mentry_schema-bootstrap-fixture-variant";
const ENTRY_ID_NULL_REFS = "mentry_schema-bootstrap-null-target-refs";
const DS_STORE_ENTRY_ID = "mentry_schema-bootstrap-ds-store";
const DS_STORE_ROOT_ENTRY_ID = "mentry_schema-bootstrap-ds-store-root";
const DS_STORE_LOWER_ENTRY_ID = "mentry_schema-bootstrap-ds-store-lower";
const TARGET_REFS = `["obj_00000000-0000-4000-8000-000000000001","run_11111111-1111-4111-8111-111111111111"]`;
const TARGET_REFS_VARIANT = `[ "obj_00000000-0000-4000-8000-000000000001", "run_11111111-1111-4111-8111-111111111111" ]`;

test("prepares exact schema 5 through a durable schema-5 backup", () => {
  const fixture = createV5Fixture();
  try {
    const beforeEntries = readEntries(fixture.databasePath);
    const beforeCounts = tableCounts(fixture.databasePath);
    const beforeWorkspace = readWorkspace(fixture.databasePath);
    expect(fs.statSync(`${fixture.databasePath}-wal`).size).toBeGreaterThan(0);

    const result = prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    });

    expect(result.databasePath).toBe(fixture.databasePath);
    expect(result.backupDirectory).toStartWith(
      path.join(fixture.dataRoot, "backups", "task-2d2-schema-v6") + path.sep,
    );
    expect(path.basename(result.backupPath)).toBe("ralphy.db");
    expect(fs.statSync(result.backupPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(result.manifestPath).mode & 0o777).toBe(0o600);

    const manifestBytes = fs.readFileSync(result.manifestPath, "utf8");
    const manifest = JSON.parse(manifestBytes) as Record<string, unknown>;
    expect(manifestBytes).toBe(`${canonicalRequestJson(manifest)}\n`);
    expect(manifest).toMatchObject({
      version: 1,
      sourceDatabasePath: fixture.databasePath,
      coreCommit: CORE_COMMIT,
      fromSchemaVersion: 5,
      toSchemaVersion: 6,
      backupIntegrity: "ok",
      backupSha256: result.backupSha256,
      liveIdentitySha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      applicationRowsSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      toSchemaIdentitySha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(result.backupSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.backupSha256).toBe(createHash("sha256").update(fs.readFileSync(result.backupPath)).digest("hex"));
    expect(manifest.backupBytes).toBe(fs.statSync(result.backupPath).size);
    expect(manifest.schemaMigrationSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(manifest.preimageSha256).toMatch(/^[0-9a-f]{64}$/u);

    expect(readUserVersion(result.backupPath)).toBe(5);
    expect(readHistory(result.backupPath).map(({ version }) => version)).toEqual([1, 2, 3, 4, 5]);
    expect(readEntries(result.backupPath)).toEqual(beforeEntries);
    expect(readWorkspace(result.backupPath)).toEqual(beforeWorkspace);
    expect(tableCounts(result.backupPath)).toEqual(beforeCounts);
    expect(readChecks(result.backupPath)).toEqual({ integrity: "ok", foreignKeys: [] });

    expect(readUserVersion(fixture.databasePath)).toBe(6);
    expect(readHistory(fixture.databasePath).map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(readEntries(fixture.databasePath)).toEqual(beforeEntries);
    expect(readWorkspace(fixture.databasePath)).toEqual(beforeWorkspace);
    expect(tableCounts(fixture.databasePath)).toEqual({
      ...beforeCounts,
      migration_entry_supplemental_refs: 0,
      schema_migrations: beforeCounts.schema_migrations + 1,
    });
    expect(readChecks(fixture.databasePath)).toEqual({ integrity: "ok", foreignKeys: [] });
  } finally {
    fixture.cleanup();
  }
});

test("requires explicit authority before creating a backup", () => {
  for (const input of [
    { appsStopped: false, coreCommit: CORE_COMMIT },
    { appsStopped: true, coreCommit: "A".repeat(40) },
    { appsStopped: true, coreCommit: "a".repeat(39) },
  ]) {
    const fixture = createV5Fixture();
    try {
      expect(() => prepareTask2d2SchemaV6({
        databasePath: fixture.databasePath,
        liveAuthority: fixture.liveAuthority,
        ...input,
      })).toThrow();
      expect(readUserVersion(fixture.databasePath)).toBe(5);
      expect(fs.existsSync(path.join(fixture.dataRoot, "backups"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  }
});

test("rejects noncanonical and symlinked database paths before backup", () => {
  const fixture = createV5Fixture();
  try {
    const symlinkRoot = path.join(path.dirname(fixture.dataRoot), "linked-data");
    fs.symlinkSync(fixture.dataRoot, symlinkRoot, "dir");
    for (const databasePath of [
      path.relative(process.cwd(), fixture.databasePath),
      `${fixture.dataRoot}${path.sep}.${path.sep}ralphy.db`,
      path.join(symlinkRoot, "ralphy.db"),
      path.join(fixture.dataRoot, "wrong.db"),
    ]) {
      expect(() => prepareTask2d2SchemaV6({
        databasePath,
        appsStopped: true,
        coreCommit: CORE_COMMIT,
        liveAuthority: fixture.liveAuthority,
      })).toThrow();
    }
    expect(readUserVersion(fixture.databasePath)).toBe(5);
    expect(fs.existsSync(path.join(fixture.dataRoot, "backups"))).toBe(false);
  } finally {
    fixture.cleanup();
  }
});

test("rejects an unsafe writable data root", () => {
  const fixture = createV5Fixture();
  try {
    fs.chmodSync(fixture.dataRoot, 0o777);
    expect(() => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    })).toThrow(/mode is unsafe/u);
    expect(readUserVersion(fixture.databasePath)).toBe(5);
  } finally {
    fs.chmodSync(fixture.dataRoot, 0o700);
    fixture.cleanup();
  }
});

test("rejects schemas other than exact version 5", () => {
  for (const version of [4, 6]) {
    const fixture = createSchemaFixture(version);
    try {
      expect(() => prepareTask2d2SchemaV6({
        databasePath: fixture.databasePath,
        appsStopped: true,
        coreCommit: CORE_COMMIT,
        liveAuthority: dummyLiveAuthority(),
      })).toThrow(/requires exact schema 5/u);
      expect(readUserVersion(fixture.databasePath)).toBe(version);
    } finally {
      fixture.cleanup();
    }
  }
});

test("rejects a generic schema-5 database outside the approved live identity", () => {
  const authorized = createV5Fixture();
  const generic = createV5Fixture();
  try {
    expect(() => prepareTask2d2SchemaV6({
      databasePath: generic.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: authorized.liveAuthority,
    })).toThrow(/approved live identity/u);
    expect(readUserVersion(generic.databasePath)).toBe(5);
    expect(fs.existsSync(path.join(generic.dataRoot, "backups"))).toBe(false);
  } finally {
    authorized.cleanup();
    generic.cleanup();
  }
});

test("authorizes exact-case root and nested .DS_Store paths", () => {
  const fixture = createV5Fixture();
  try {
    expect(fixture.liveAuthority.baseline.dsStoreEntries).toBe(2);
    prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    });
    expect(readUserVersion(fixture.databasePath)).toBe(6);
  } finally {
    fixture.cleanup();
  }
});

test("preserves NULL and TEXT target refs in the approved baseline", () => {
  const fixture = createV5Fixture();
  try {
    expect(withReadonly(fixture.databasePath, (db) => db.query<{
      id: string;
      storageClass: string;
    }, [string, string]>(
      `SELECT id, typeof(target_refs_json) AS storageClass FROM migration_entries
       WHERE id IN (?, ?) ORDER BY id`,
    ).all(DS_STORE_ENTRY_ID, ENTRY_ID_NULL_REFS))).toEqual([
      { id: DS_STORE_ENTRY_ID, storageClass: "text" },
      { id: ENTRY_ID_NULL_REFS, storageClass: "null" },
    ]);
    prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    });
    expect(readUserVersion(fixture.databasePath)).toBe(6);
  } finally {
    fixture.cleanup();
  }
});

test("uses a readonly source connection for the SQLite-native backup", () => {
  const fixture = createV5Fixture();
  let attempted = false;
  let denied = false;
  try {
    withPrepareInjection(fixture.databasePath, (db, sql) => {
      if (sql !== "VACUUM INTO ?" || attempted) return;
      attempted = true;
      try {
        db.prepare("UPDATE workspaces SET name = name WHERE id = 'ws_fixture'").run();
      } catch {
        denied = true;
      }
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }));
    expect(attempted).toBe(true);
    expect(denied).toBe(true);
  } finally {
    fixture.cleanup();
  }
});

test("rolls back a same-count application-row mutation during migration 6", () => {
  const fixture = createV5Fixture();
  try {
    expect(() => withExecInjection(fixture.databasePath, {
      matches: (sql) => sql === migration6Sql(),
      after: (db) => db.prepare(
        "UPDATE workspaces SET name = 'Mutated during schema migration' WHERE id = 'ws_fixture'",
      ).run(),
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }))).toThrow(/application rows changed.*retained schema-5 backup/u);
    expect(readUserVersion(fixture.databasePath)).toBe(5);
    expect(readWorkspace(fixture.databasePath).name).toBe("Fixture");
  } finally {
    fixture.cleanup();
  }
});

test("preserves equal numeric values with different SQLite storage classes", () => {
  const fixture = createV5Fixture();
  try {
    expect(readNumericStorageClasses(fixture.databasePath)).toEqual(["integer", "real"]);
    expect(() => withExecInjection(fixture.databasePath, {
      matches: (sql) => sql === migration6Sql(),
      after: (db) => db.exec(
        "UPDATE document_revisions_fts SET revision_id = CAST(1.0 AS REAL) WHERE rowid = 9001",
      ),
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }))).toThrow(/application rows changed.*retained schema-5 backup/u);
    expect(readUserVersion(fixture.databasePath)).toBe(5);
    expect(readNumericStorageClasses(fixture.databasePath)).toEqual(["integer", "real"]);
  } finally {
    fixture.cleanup();
  }
});

test("rolls back a wrong migration-6 applied_at before commit", () => {
  const fixture = createV5Fixture();
  try {
    expect(() => withExecInjection(fixture.databasePath, {
      matches: (sql) => sql === "PRAGMA user_version = 6",
      after: (db) => db.exec(
        "UPDATE schema_migrations SET applied_at = applied_at + 1 WHERE version = 6",
      ),
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }))).toThrow(/schema-6 migration row changed.*retained schema-5 backup/u);
    expect(readUserVersion(fixture.databasePath)).toBe(5);
    expect(readHistory(fixture.databasePath).map(({ version }) => version)).toEqual([1, 2, 3, 4, 5]);
  } finally {
    fixture.cleanup();
  }
});

test("fresh readonly postcheck rejects a REAL migration-6 applied_at", () => {
  const fixture = createV5Fixture();
  let migrated = false;
  try {
    expect(() => withExecInjection(fixture.databasePath, {
      matches: (sql) => {
        if (sql === migration6Sql()) migrated = true;
        return migrated && sql === "COMMIT";
      },
      after: (db) => db.exec(
        "UPDATE schema_migrations SET applied_at = CAST(applied_at AS REAL) + 0.5 WHERE version = 6",
      ),
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }))).toThrow(/schema-6 migration row changed.*retained schema-5 backup/u);
    expect(readUserVersion(fixture.databasePath)).toBe(6);
    expect(withReadonly(fixture.databasePath, (db) => db.query<{ storageClass: string }, []>(
      "SELECT typeof(applied_at) AS storageClass FROM schema_migrations WHERE version = 6",
    ).get()!.storageClass)).toBe("real");
  } finally {
    fixture.cleanup();
  }
});

test("rejects a same-count WAL commit between backup and the writer lock", () => {
  const fixture = createV5Fixture();
  try {
    expect(() => withExecInjection(fixture.databasePath, {
      matches: (sql) => sql === "BEGIN IMMEDIATE",
      before: () => {
        const competitor = new Database(fixture.databasePath, { readwrite: true, strict: true });
        try {
          competitor.prepare("UPDATE workspaces SET name = 'Concurrent writer' WHERE slug = 'fixture'").run();
        } finally {
          competitor.close();
        }
      },
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }))).toThrow(/changed across the schema backup fence.*retained schema-5 backup/u);

    expect(readUserVersion(fixture.databasePath)).toBe(5);
    expect(readWorkspace(fixture.databasePath).name).toBe("Concurrent writer");
    const backupRoot = path.join(fixture.dataRoot, "backups", "task-2d2-schema-v6");
    const backupDirectories = fs.readdirSync(backupRoot);
    expect(backupDirectories).toHaveLength(1);
    expect(readUserVersion(path.join(backupRoot, backupDirectories[0]!, "ralphy.db"))).toBe(5);
    expect(readWorkspace(path.join(backupRoot, backupDirectories[0]!, "ralphy.db")).name).toBe("Fixture");
  } finally {
    fixture.cleanup();
  }
});

test("rejects a same-size in-place backup mutation before the writer fence", () => {
  const fixture = createV5Fixture();
  let sameSize = false;
  try {
    expect(() => withExecInjection(fixture.databasePath, {
      matches: (sql) => sql === "BEGIN IMMEDIATE",
      before: () => { sameSize = mutateBackupWorkspaceSameLength(fixture.dataRoot); },
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }))).toThrow(/schema backup changed.*retained schema-5 backup/u);
    expect(sameSize).toBe(true);
    expect(readUserVersion(fixture.databasePath)).toBe(5);
    expect(readUserVersion(onlyBackupPath(fixture.dataRoot))).toBe(5);
  } finally {
    fixture.cleanup();
  }
});

test("rechecks backup content after the full fenced snapshot", () => {
  const fixture = createV5Fixture();
  let mutated = false;
  try {
    expect(() => withQueryInjection(fixture.databasePath, (db, sql) => {
      if (mutated || !db.inTransaction
        || !sql.includes("substr(source_path, -10) = '/.DS_Store'")) return;
      const backupRoot = path.join(fixture.dataRoot, "backups", "task-2d2-schema-v6");
      if (!fs.existsSync(backupRoot)) return;
      mutated = true;
      expect(mutateBackupWorkspaceSameLength(fixture.dataRoot)).toBe(true);
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }))).toThrow(/schema backup changed.*retained schema-5 backup/u);
    expect(mutated).toBe(true);
    expect(readUserVersion(fixture.databasePath)).toBe(5);
  } finally {
    fixture.cleanup();
  }
});

test("fails closed when another writer holds the migration lock", () => {
  const fixture = createV5Fixture();
  const blocker = new Database(fixture.databasePath, { readwrite: true, strict: true });
  try {
    blocker.exec("PRAGMA busy_timeout = 0");
    blocker.exec("BEGIN IMMEDIATE");
    expect(() => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    })).toThrow(/could not acquire the exclusive writer lock.*retained schema-5 backup/u);
    expect(readUserVersion(fixture.databasePath)).toBe(5);
    expect(readUserVersion(onlyBackupPath(fixture.dataRoot))).toBe(5);
  } finally {
    if (blocker.inTransaction) blocker.exec("ROLLBACK");
    blocker.close();
    fixture.cleanup();
  }
});

test("rejects source or backup path replacement before migration", () => {
  for (const target of ["source", "backup"] as const) {
    const fixture = createV5Fixture();
    const movedSource = `${fixture.databasePath}.original`;
    try {
      expect(() => withExecInjection(fixture.databasePath, {
        matches: (sql) => sql === "PRAGMA foreign_keys = ON",
        after: () => {
          if (target === "source") {
            for (const suffix of ["", "-wal", "-shm"]) {
              const source = `${fixture.databasePath}${suffix}`;
              if (fs.existsSync(source)) fs.renameSync(source, `${movedSource}${suffix}`);
            }
            const replacement = new Database(fixture.databasePath, { create: true });
            replacement.close();
            return;
          }
          const backupPath = onlyBackupPath(fixture.dataRoot);
          fs.renameSync(backupPath, `${backupPath}.replaced`);
          fs.copyFileSync(`${backupPath}.replaced`, backupPath);
        },
      }, () => prepareTask2d2SchemaV6({
        databasePath: fixture.databasePath,
        appsStopped: true,
        coreCommit: CORE_COMMIT,
        liveAuthority: fixture.liveAuthority,
      }))).toThrow(target === "source"
        ? /source database path identity changed.*retained schema-5 backup/u
        : /schema backup database changed.*retained schema-5 backup/u);
      if (target === "source") {
        expect(fs.statSync(movedSource).isFile()).toBe(true);
        expect(readUserVersion(fixture.databasePath)).toBe(0);
        expect(readUserVersion(onlyBackupPath(fixture.dataRoot))).toBe(5);
      }
      else expect(readUserVersion(fixture.databasePath)).toBe(5);
    } finally {
      fixture.cleanup();
    }
  }
});

test("retains the data-root and every backup-ancestor descriptor through the fence", () => {
  for (const target of ["data-root", "backup-ancestor", "backup-mode"] as const) {
    const fixture = createV5Fixture();
    try {
      expect(() => withExecInjection(fixture.databasePath, {
        matches: (sql) => sql === "PRAGMA foreign_keys = ON",
        after: () => {
          if (target === "data-root") {
            replaceDataRootWithHardlinks(fixture);
            return;
          }
          const backups = path.join(fixture.dataRoot, "backups");
          if (target === "backup-ancestor") {
            fs.renameSync(backups, `${backups}.moved`);
            fs.symlinkSync("backups.moved", backups, "dir");
            return;
          }
          fs.chmodSync(path.join(backups, "task-2d2-schema-v6"), 0o777);
        },
      }, () => prepareTask2d2SchemaV6({
        databasePath: fixture.databasePath,
        appsStopped: true,
        coreCommit: CORE_COMMIT,
        liveAuthority: fixture.liveAuthority,
      }))).toThrow(/identity, owner, or mode changed.*retained schema-5 backup/u);
    } finally {
      fixture.cleanup();
    }
  }
});

test("pins the exact manifest identity, mode, and bytes before migration", () => {
  for (const target of ["identity", "mode", "bytes"] as const) {
    const fixture = createV5Fixture();
    try {
      expect(() => withExecInjection(fixture.databasePath, {
        matches: (sql) => sql === "BEGIN IMMEDIATE",
        before: () => mutateOnlyManifest(fixture.dataRoot, target),
      }, () => prepareTask2d2SchemaV6({
        databasePath: fixture.databasePath,
        appsStopped: true,
        coreCommit: CORE_COMMIT,
        liveAuthority: fixture.liveAuthority,
      }))).toThrow(/schema backup manifest changed.*retained schema-5 backup/u);
      expect(readUserVersion(fixture.databasePath)).toBe(5);
    } finally {
      fixture.cleanup();
    }
  }
});

test("revalidates the pinned manifest after committing schema 6", () => {
  const fixture = createV5Fixture();
  let migrated = false;
  try {
    expect(() => withExecInjection(fixture.databasePath, {
      matches: (sql) => {
        if (sql === migration6Sql()) migrated = true;
        return migrated && sql === "COMMIT";
      },
      after: () => fs.chmodSync(path.join(onlyBackupDirectory(fixture.dataRoot), "manifest.json"), 0o644),
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }))).toThrow(/schema backup manifest changed.*retained schema-5 backup/u);
    expect(readUserVersion(fixture.databasePath)).toBe(6);
  } finally {
    fixture.cleanup();
  }
});

test("fails closed when backup fsync fails", () => {
  const mutableFs = fs as typeof fs & { fsyncSync: typeof fs.fsyncSync };
  const originalFsync = mutableFs.fsyncSync;
  const fixture = createV5Fixture();
  try {
    mutableFs.fsyncSync = () => { throw new Error("injected fsync failure"); };
    expect(() => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    })).toThrow(/injected fsync failure/u);
    expect(readUserVersion(fixture.databasePath)).toBe(5);
  } finally {
    mutableFs.fsyncSync = originalFsync;
    fixture.cleanup();
  }
});

test("rolls migration-6 failure back after retaining the schema-5 backup", () => {
  const fixture = createV5Fixture();
  try {
    expect(() => withExecInjection(fixture.databasePath, {
      matches: (sql) => sql === migration6Sql(),
      after: () => { throw new Error("injected migration failure"); },
    }, () => prepareTask2d2SchemaV6({
      databasePath: fixture.databasePath,
      appsStopped: true,
      coreCommit: CORE_COMMIT,
      liveAuthority: fixture.liveAuthority,
    }))).toThrow(/injected migration failure.*retained schema-5 backup/u);
    expect(readUserVersion(fixture.databasePath)).toBe(5);
    expect(readHistory(fixture.databasePath).map(({ version }) => version)).toEqual([1, 2, 3, 4, 5]);
    expect(tableCounts(fixture.databasePath)).not.toHaveProperty("migration_entry_supplemental_refs");
    expect(readUserVersion(onlyBackupPath(fixture.dataRoot))).toBe(5);
  } finally {
    fixture.cleanup();
  }
});

function createV5Fixture(): {
  dataRoot: string;
  databasePath: string;
  liveAuthority: ReturnType<typeof readLiveAuthority>;
  cleanup: () => void;
} {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ralphy-schema-bootstrap-")));
  const dataRoot = path.join(root, "data");
  fs.mkdirSync(dataRoot, { mode: 0o700 });
  const databasePath = path.join(dataRoot, "ralphy.db");
  const db = new Database(databasePath, { create: true, strict: true });
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA wal_autocheckpoint = 0");
    db.exec("PRAGMA foreign_keys = ON");
    for (const migration of MIGRATIONS.filter(({ version }) => version <= 5)) {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(migration.version, 1_000 + migration.version);
      db.exec(`PRAGMA user_version = ${migration.version}`);
    }
    db.prepare(
      `INSERT INTO activity_events
       (id, entity_type, entity_id, action, payload_json, created_at)
       VALUES (?, 'migration_run', ?, 'cutover', '{}', ?)`,
    ).run(CUTOVER_ACTIVITY_ID, RUN_ID, CUTOVER_AT);
    db.prepare(
      `INSERT INTO migration_runs
       (id, phase, cutover_at, cutover_activity_id, created_at, updated_at)
       VALUES (?, 'cutover', ?, ?, 1, ?)`,
    ).run(RUN_ID, CUTOVER_AT, CUTOVER_ACTIVITY_ID, CUTOVER_AT);
    db.prepare(
      `INSERT INTO migration_sources
       (id, migration_run_id, source_kind, source_label, canonical_path_hash,
        source_device, source_inode, source_mode, created_at)
       VALUES (?, ?, 'ralphy', 'fixture', ?, '1', '1', 448, 1)`,
    ).run(SOURCE_ID, RUN_ID, "1".repeat(64));
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, target_refs_json, state, terminal_at, created_at, updated_at)
       VALUES (?, ?, ?, 'fixture/source', ?, 'file', 'ralphy', 'domain', '1', '2', 384,
               17, 23, ?, 'imported', 29, 31, 37)`,
    ).run(ENTRY_ID, RUN_ID, SOURCE_ID, "2".repeat(64), TARGET_REFS);
    const targetRefsInsertGuard = db.query<{ sql: string }, []>(
      "SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'migration_entries_target_refs_insert_guard'",
    ).get()!.sql;
    db.exec("DROP TRIGGER migration_entries_target_refs_insert_guard");
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, target_refs_json, state, terminal_at, created_at, updated_at)
       VALUES (?, ?, ?, 'fixture/variant', ?, 'file', 'ralphy', 'domain', '1', '3', 384,
               19, 25, ?, 'imported', 30, 32, 38)`,
    ).run(ENTRY_ID_VARIANT, RUN_ID, SOURCE_ID, "3".repeat(64), TARGET_REFS_VARIANT);
    db.exec(targetRefsInsertGuard);
    const insertDsStore = db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, target_refs_json, state, terminal_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'file', 'ralphy', 'system', '1', ?, 384,
               6148, 39, '[]', 'excluded', 40, 41, 42)`,
    );
    insertDsStore.run(DS_STORE_ENTRY_ID, RUN_ID, SOURCE_ID, "fixture/.DS_Store", "4".repeat(64), "4");
    insertDsStore.run(DS_STORE_LOWER_ENTRY_ID, RUN_ID, SOURCE_ID, "fixture/.ds_store", "5".repeat(64), "5");
    insertDsStore.run(DS_STORE_ROOT_ENTRY_ID, RUN_ID, SOURCE_ID, ".DS_Store", "7".repeat(64), "7");
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, target_refs_json, state, terminal_at, created_at, updated_at)
       VALUES (?, ?, ?, 'fixture/null-target-refs', ?, 'file', 'ralphy', 'domain', '1', '6', 384,
               0, 43, NULL, 'inventoried', NULL, 44, 45)`,
    ).run(ENTRY_ID_NULL_REFS, RUN_ID, SOURCE_ID, "6".repeat(64));
    db.prepare(
      "INSERT INTO workspaces (id, slug, name, row_version, created_at, updated_at) VALUES ('ws_fixture', 'fixture', 'Fixture', 1, 41, 43)",
    ).run();
    db.exec(
      `INSERT INTO document_revisions_fts(rowid, revision_id, title, body)
       VALUES (9001, CAST(1 AS INTEGER), 'integer', 'same numeric value'),
              (9002, CAST(1.0 AS REAL), 'real', 'same numeric value')`,
    );
  } catch (error) {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  let keeperOpen = true;
  const liveAuthority = readLiveAuthority(db);
  const closeKeeper = () => {
    if (!keeperOpen) return;
    db.close();
    keeperOpen = false;
  };
  return {
    dataRoot,
    databasePath,
    liveAuthority,
    cleanup: () => {
      closeKeeper();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function createSchemaFixture(version: 4 | 6): { dataRoot: string; databasePath: string; cleanup: () => void } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ralphy-schema-version-")));
  const dataRoot = path.join(root, "data");
  fs.mkdirSync(dataRoot, { mode: 0o700 });
  const databasePath = path.join(dataRoot, "ralphy.db");
  const db = new Database(databasePath, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA wal_autocheckpoint = 0");
  for (const migration of MIGRATIONS.filter((candidate) => candidate.version <= version)) {
    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(migration.version, migration.version);
    db.exec(`PRAGMA user_version = ${migration.version}`);
  }
  return {
    dataRoot,
    databasePath,
    cleanup: () => {
      db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function onlyBackupPath(dataRoot: string): string {
  return path.join(onlyBackupDirectory(dataRoot), "ralphy.db");
}

function onlyBackupDirectory(dataRoot: string): string {
  const root = path.join(dataRoot, "backups", "task-2d2-schema-v6");
  const directories = fs.readdirSync(root);
  expect(directories).toHaveLength(1);
  return path.join(root, directories[0]!);
}

function readWorkspace(databasePath: string): Record<string, unknown> {
  return withReadonly(databasePath, (db) => {
    const row = db.query<Record<string, unknown>, []>(
      "SELECT * FROM workspaces WHERE slug = 'fixture'",
    ).get();
    if (!row) throw new Error("Fixture Workspace is missing");
    return row;
  });
}

function readUserVersion(databasePath: string): number {
  return withReadonly(databasePath, (db) =>
    db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version);
}

function readHistory(databasePath: string): Array<{ version: number; applied_at: number }> {
  return withReadonly(databasePath, (db) =>
    db.query<{ version: number; applied_at: number }, []>(
      "SELECT version, applied_at FROM schema_migrations ORDER BY version",
    ).all());
}

function readEntries(databasePath: string): Record<string, unknown>[] {
  return withReadonly(databasePath, (db) => {
    const rows = db.query<Record<string, unknown>, [string, string]>(
      `SELECT *, hex(CAST(target_refs_json AS BLOB)) AS target_refs_utf8_hex
       FROM migration_entries WHERE id IN (?, ?) ORDER BY id`,
    ).all(ENTRY_ID, ENTRY_ID_VARIANT);
    if (rows.length !== 2) throw new Error("Fixture migration entries are missing");
    return rows;
  });
}

function readNumericStorageClasses(databasePath: string): string[] {
  return withReadonly(databasePath, (db) => db.query<{ storageClass: string }, []>(
    `SELECT typeof(revision_id) AS storageClass
     FROM document_revisions_fts WHERE rowid IN (9001, 9002) ORDER BY rowid`,
  ).all().map(({ storageClass }) => storageClass));
}

function readLiveAuthority(db: Database) {
  const scalar = (sql: string): number => db.query<{ value: number }, []>(sql).get()!.value;
  const entries = db.query<{ id: string; state: string; target_refs_json: string | null }, [string]>(
    "SELECT id, state, target_refs_json FROM migration_entries WHERE migration_run_id = ? ORDER BY id",
  ).all(RUN_ID);
  const migrationTargetRefs = createHash("sha256");
  for (const row of entries) {
    migrationTargetRefs.update(canonicalRequestJson({
      id: row.id,
      targetRefsStorageClass: row.target_refs_json === null ? "null" : "text",
      targetRefsUtf8Hex: row.target_refs_json === null
        ? null
        : Buffer.from(row.target_refs_json, "utf8").toString("hex"),
    }));
    migrationTargetRefs.update("\n");
  }
  const sources = db.query<Record<string, unknown>, [string]>(
    "SELECT * FROM migration_sources WHERE migration_run_id = ? ORDER BY id",
  ).all(RUN_ID);
  return {
    migrationRunId: RUN_ID,
    cutoverActivityId: CUTOVER_ACTIVITY_ID,
    cutoverCreatedAt: CUTOVER_AT,
    storeId: db.query<{ store_id: string }, []>(
      "SELECT store_id FROM store_metadata WHERE singleton = 1",
    ).get()!.store_id,
    baseline: {
      workspaces: scalar("SELECT COUNT(*) AS value FROM workspaces"),
      projects: scalar("SELECT COUNT(*) AS value FROM projects"),
      objects: scalar("SELECT COUNT(*) AS value FROM objects"),
      objectBytes: scalar("SELECT COALESCE(SUM(bytes), 0) AS value FROM objects"),
      artifacts: scalar("SELECT COUNT(*) AS value FROM artifacts"),
      artifactRevisions: scalar("SELECT COUNT(*) AS value FROM artifact_revisions"),
      artifactRevisionObjectBytes: scalar(
        `SELECT COALESCE(SUM(object.bytes), 0) AS value
         FROM artifact_revisions revision JOIN objects object ON object.id = revision.object_id`,
      ),
      units: scalar("SELECT COUNT(*) AS value FROM units"),
      compositions: scalar("SELECT COUNT(*) AS value FROM compositions"),
      compositionRevisions: scalar("SELECT COUNT(*) AS value FROM composition_revisions"),
      compositionFiles: scalar("SELECT COUNT(*) AS value FROM composition_revision_files"),
      compositionInputs: scalar("SELECT COUNT(*) AS value FROM composition_inputs"),
      builds: scalar("SELECT COUNT(*) AS value FROM builds"),
      buildOutputs: scalar("SELECT COUNT(*) AS value FROM build_outputs"),
      migrationEntries: entries.length,
      migrationEntriesImported: entries.filter(({ state }) => state === "imported").length,
      migrationEntriesVerified: entries.filter(({ state }) => state === "verified").length,
      migrationEntriesExcluded: entries.filter(({ state }) => state === "excluded").length,
      migrationEntriesIssue: entries.filter(({ state }) => state === "issue").length,
      migrationSourcesSha256: createHash("sha256")
        .update(canonicalRequestJson(sources as never)).digest("hex"),
      migrationTargetRefsSha256: migrationTargetRefs.digest("hex"),
      dsStoreEntries: scalar(
         `SELECT COUNT(*) AS value FROM migration_entries
         WHERE migration_run_id = '${RUN_ID}' AND source_kind = 'ralphy'
           AND entry_kind = 'file'
           AND (source_path = '.DS_Store' OR substr(source_path, -10) = '/.DS_Store')
           AND disposition = 'system' AND state = 'excluded'`,
      ),
    },
  } as const;
}

function dummyLiveAuthority(): ReturnType<typeof readLiveAuthority> {
  return {
    migrationRunId: RUN_ID,
    cutoverActivityId: CUTOVER_ACTIVITY_ID,
    cutoverCreatedAt: CUTOVER_AT,
    storeId: `store_${"0".repeat(32)}`,
    baseline: {
      workspaces: 0,
      projects: 0,
      objects: 0,
      objectBytes: 0,
      artifacts: 0,
      artifactRevisions: 0,
      artifactRevisionObjectBytes: 0,
      units: 0,
      compositions: 0,
      compositionRevisions: 0,
      compositionFiles: 0,
      compositionInputs: 0,
      builds: 0,
      buildOutputs: 0,
      migrationEntries: 0,
      migrationEntriesImported: 0,
      migrationEntriesVerified: 0,
      migrationEntriesExcluded: 0,
      migrationEntriesIssue: 0,
      migrationSourcesSha256: "0".repeat(64),
      migrationTargetRefsSha256: "0".repeat(64),
      dsStoreEntries: 0,
    },
  };
}

function migration6Sql(): string {
  return MIGRATIONS.find(({ version }) => version === 6)!.sql;
}

function withExecInjection<T>(
  databasePath: string,
  injection: {
    matches: (sql: string) => boolean;
    before?: (db: Database) => void;
    after?: (db: Database) => void;
  },
  operation: () => T,
): T {
  const prototype = Database.prototype as unknown as {
    exec(this: Database, sql: string): unknown;
  };
  const original = prototype.exec;
  let injected = false;
  prototype.exec = function exec(this: Database, sql: string): unknown {
    const matches = !injected && this.filename === databasePath && injection.matches(sql);
    if (matches) {
      injected = true;
      injection.before?.(this);
    }
    const result = original.call(this, sql);
    if (matches) injection.after?.(this);
    return result;
  };
  try {
    return operation();
  } finally {
    prototype.exec = original;
  }
}

function withPrepareInjection<T>(
  databasePath: string,
  inspect: (db: Database, sql: string) => void,
  operation: () => T,
): T {
  const prototype = Database.prototype as unknown as {
    prepare(this: Database, sql: string): unknown;
  };
  const original = prototype.prepare;
  prototype.prepare = function prepare(this: Database, sql: string): unknown {
    if (this.filename === databasePath) inspect(this, sql);
    return original.call(this, sql);
  };
  try {
    return operation();
  } finally {
    prototype.prepare = original;
  }
}

function withQueryInjection<T>(
  databasePath: string,
  inspect: (db: Database, sql: string) => void,
  operation: () => T,
): T {
  const prototype = Database.prototype as unknown as {
    query(this: Database, sql: string): unknown;
  };
  const original = prototype.query;
  prototype.query = function query(this: Database, sql: string): unknown {
    if (this.filename === databasePath) inspect(this, sql);
    return original.call(this, sql);
  };
  try {
    return operation();
  } finally {
    prototype.query = original;
  }
}

function mutateBackupWorkspaceSameLength(dataRoot: string): boolean {
  const backupPath = onlyBackupPath(dataRoot);
  const before = fs.statSync(backupPath).size;
  const db = new Database(backupPath, { readwrite: true, strict: true });
  try {
    db.prepare("UPDATE workspaces SET name = 'Mixture' WHERE id = 'ws_fixture'").run();
  } finally {
    db.close();
  }
  return fs.statSync(backupPath).size === before;
}

function replaceDataRootWithHardlinks(fixture: { dataRoot: string; databasePath: string }): void {
  const moved = `${fixture.dataRoot}.moved`;
  fs.renameSync(fixture.dataRoot, moved);
  fs.mkdirSync(fixture.dataRoot, { mode: 0o700 });
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = path.join(moved, `ralphy.db${suffix}`);
    if (fs.existsSync(source)) fs.linkSync(source, `${fixture.databasePath}${suffix}`);
  }
  fs.symlinkSync(path.join(moved, "backups"), path.join(fixture.dataRoot, "backups"), "dir");
}

function mutateOnlyManifest(dataRoot: string, target: "identity" | "mode" | "bytes"): void {
  const manifest = path.join(onlyBackupDirectory(dataRoot), "manifest.json");
  if (target === "mode") {
    fs.chmodSync(manifest, 0o644);
    return;
  }
  if (target === "bytes") {
    fs.appendFileSync(manifest, " ");
    return;
  }
  const bytes = fs.readFileSync(manifest);
  fs.renameSync(manifest, `${manifest}.moved`);
  fs.writeFileSync(manifest, bytes, { mode: 0o600 });
}

function tableCounts(databasePath: string): Record<string, number> {
  return withReadonly(databasePath, (db) => Object.fromEntries(
    db.query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all().map(({ name }) => [
      name,
      db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM "${name}"`).get()!.count,
    ]),
  ));
}

function readChecks(databasePath: string): { integrity: string; foreignKeys: unknown[] } {
  return withReadonly(databasePath, (db) => ({
    integrity: db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()!.integrity_check,
    foreignKeys: db.query("PRAGMA foreign_key_check").all(),
  }));
}

function withReadonly<T>(databasePath: string, operation: (db: Database) => T): T {
  const db = new Database(databasePath, { readonly: true, strict: true });
  try {
    return operation(db);
  } finally {
    db.close();
  }
}
