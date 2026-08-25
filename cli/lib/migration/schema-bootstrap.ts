import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalRequestJson } from "../store/canonical-json.js";
import {
  createExclusiveRegularFileAt,
  openDirectoryAt,
  openRegularFileAt,
  openRootDirectory,
} from "../store/posix-directory.js";
import { MIGRATIONS } from "../store/schema.js";
import type { JsonValue } from "../store/types.js";

const SCHEMA_FROM = 5;
const SCHEMA_TO = 6;
const TASK_2D2_RUN_ID = "mig_c37f36ac-47a0-4330-8303-74cee92b7ddd" as const;
const TASK_2D2_CUTOVER_AT = 1_786_301_683_658;
const SCHEMA_MIGRATION = MIGRATIONS.find(({ version }) => version === SCHEMA_TO) ?? missingSchemaMigration();

export type Task2d2SchemaV5Baseline = Readonly<{
  workspaces: number;
  projects: number;
  objects: number;
  objectBytes: number;
  artifacts: number;
  artifactRevisions: number;
  artifactRevisionObjectBytes: number;
  units: number;
  compositions: number;
  compositionRevisions: number;
  compositionFiles: number;
  compositionInputs: number;
  builds: number;
  buildOutputs: number;
  migrationEntries: number;
  migrationEntriesImported: number;
  migrationEntriesVerified: number;
  migrationEntriesExcluded: number;
  migrationEntriesIssue: number;
  migrationSourcesSha256: string;
  migrationTargetRefsSha256: string;
  dsStoreEntries: number;
}>;

export type Task2d2SchemaV5Authority = Readonly<{
  migrationRunId: typeof TASK_2D2_RUN_ID;
  cutoverActivityId: number;
  cutoverCreatedAt: typeof TASK_2D2_CUTOVER_AT;
  storeId: string;
  baseline: Task2d2SchemaV5Baseline;
}>;

export type PrepareTask2d2SchemaV6Input = Readonly<{
  databasePath: string;
  appsStopped: boolean;
  coreCommit: string;
  liveAuthority: Task2d2SchemaV5Authority;
}>;

export type PrepareTask2d2SchemaV6Result = Readonly<{
  databasePath: string;
  backupDirectory: string;
  backupPath: string;
  manifestPath: string;
  backupSha256: string;
}>;

type FileIdentity = Readonly<{ dev: number; ino: number }>;
type TableShape = Readonly<{
  name: string;
  columns: readonly Readonly<{ name: string; primaryKey: number }>[];
  usesRowid: boolean;
}>;
type ApplicationRows = Readonly<{
  tables: readonly TableShape[];
  count: number;
  sha256: string;
}>;
type Snapshot = Readonly<{
  dataVersion: number;
  history: readonly Readonly<{ version: number; appliedAt: number }>[];
  tableCounts: Readonly<Record<string, number>>;
  applicationRows: ApplicationRows;
  preimageSha256: string;
}>;

type PinnedDirectory = Readonly<{ path: string; fd: number; label: string }>;

type Backup = Readonly<{
  directory: string;
  directories: readonly PinnedDirectory[];
  path: string;
  fd: number;
  bytes: number;
  sha256: string;
  manifestPath: string;
  manifestFd: number;
  manifestBytes: Buffer;
}>;

export function prepareTask2d2SchemaV6(
  input: PrepareTask2d2SchemaV6Input,
): PrepareTask2d2SchemaV6Result {
  assertAuthority(input);
  const databasePath = assertExactDatabasePath(input.databasePath);
  const dataRoot = path.dirname(databasePath);
  const dataRootFd = openPinnedRootDirectory(dataRoot);
  let sourceFd = -1;
  let reader: Database | null = null;
  let writer: Database | null = null;
  let backup: Backup | null = null;
  try {
    sourceFd = requiredRegularFileAt(dataRootFd, "ralphy.db", "source database");
    const sourceIdentity = assertPinnedPath(databasePath, sourceFd, "source database");

    reader = openReadonlyDatabase(databasePath);
    const snapshot = captureV5Snapshot(reader, input.liveAuthority);

    const createdAt = Date.now();
    backup = createSchemaBackup({
      dataRoot,
      dataRootFd,
      databasePath,
      coreCommit: input.coreCommit,
      createdAt,
      sourceIdentity,
      snapshot,
      reader,
      liveAuthority: input.liveAuthority,
    });
    assertPinnedEnvironment(dataRoot, dataRootFd, databasePath, sourceFd, backup);
    writer = new Database(databasePath, { readwrite: true, strict: true });
    writer.exec("PRAGMA busy_timeout = 0");
    writer.exec("PRAGMA foreign_keys = ON");
    assertPinnedEnvironment(dataRoot, dataRootFd, databasePath, sourceFd, backup);
    try {
      writer.exec("BEGIN IMMEDIATE");
    } catch (error) {
      throw new Error(
        `Task 2D2 schema preparation could not acquire the exclusive writer lock: ${errorMessage(error)}`,
        { cause: error },
      );
    }
    requireUnchangedDataVersion(reader, snapshot.dataVersion);
    assertPinnedEnvironment(dataRoot, dataRootFd, databasePath, sourceFd, backup, true);
    assertSnapshot(writer, snapshot, SCHEMA_FROM, input.liveAuthority);
    reader.close();
    reader = null;
    assertPinnedEnvironment(dataRoot, dataRootFd, databasePath, sourceFd, backup, true);
    writer.exec(SCHEMA_MIGRATION.sql);
    writer.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(SCHEMA_TO, createdAt);
    writer.exec(`PRAGMA user_version = ${SCHEMA_TO}`);
    assertPrepared(writer, snapshot, input.liveAuthority, createdAt);
    writer.exec("COMMIT");
    writer.close();
    writer = null;
    withReadonlyDatabase(databasePath, (db) => assertPrepared(db, snapshot, input.liveAuthority, createdAt));
    assertPinnedEnvironment(dataRoot, dataRootFd, databasePath, sourceFd, backup, true);
    return {
      databasePath,
      backupDirectory: backup.directory,
      backupPath: backup.path,
      manifestPath: backup.manifestPath,
      backupSha256: backup.sha256,
    };
  } catch (error) {
    if (backup) {
      throw new Error(
        `${errorMessage(error)}; retained schema-5 backup: ${backup.directory}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (writer?.inTransaction) {
      try { writer.exec("ROLLBACK"); } catch { /* Closing also abandons the transaction. */ }
    }
    writer?.close();
    reader?.close();
    if (backup) {
      fs.closeSync(backup.manifestFd);
      fs.closeSync(backup.fd);
      for (const directory of [...backup.directories].reverse()) fs.closeSync(directory.fd);
    }
    if (sourceFd >= 0) fs.closeSync(sourceFd);
    fs.closeSync(dataRootFd);
  }
}

function assertAuthority(input: PrepareTask2d2SchemaV6Input): void {
  if (input.appsStopped !== true) {
    throw new Error("Task 2D2 schema preparation requires explicit apps-stopped confirmation");
  }
  if (!/^[0-9a-f]{40}$/u.test(input.coreCommit)) {
    throw new Error("Task 2D2 schema preparation requires an exact lowercase Core commit");
  }
  const authority = input.liveAuthority;
  if (!authority || authority.migrationRunId !== TASK_2D2_RUN_ID
    || authority.cutoverCreatedAt !== TASK_2D2_CUTOVER_AT
    || !Number.isSafeInteger(authority.cutoverActivityId) || authority.cutoverActivityId <= 0
    || !/^store_[0-9a-f]{32}$/u.test(authority.storeId)) {
    throw new Error("Task 2D2 schema preparation requires the exact approved live identity");
  }
  if (!authority.baseline || typeof authority.baseline !== "object") {
    throw new Error("Task 2D2 schema preparation requires exact approved baseline facts");
  }
  const digestKeys = new Set(["migrationSourcesSha256", "migrationTargetRefsSha256"]);
  for (const [key, value] of Object.entries(authority.baseline)) {
    if (digestKeys.has(key)) {
      if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
        throw new Error("Task 2D2 schema preparation requires exact approved baseline digests");
      }
    } else if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error("Task 2D2 schema preparation requires exact approved baseline counts");
    }
  }
}

function assertExactDatabasePath(input: string): string {
  if (!path.isAbsolute(input) || path.resolve(input) !== input || path.basename(input) !== "ralphy.db") {
    throw new Error("Task 2D2 schema preparation requires an absolute canonical ralphy.db path");
  }
  let canonical: string;
  try {
    canonical = fs.realpathSync.native(input);
  } catch {
    throw new Error("Task 2D2 schema preparation requires an existing database");
  }
  if (canonical !== input) {
    throw new Error("Task 2D2 schema preparation rejects symlink path components");
  }
  return input;
}

function assertPrivateDirectory(fd: number, label: string): void {
  const stat = fs.fstatSync(fd);
  if (!stat.isDirectory() || stat.uid !== currentUid() || (stat.mode & 0o022) !== 0) {
    throw new Error(`Task 2D2 ${label} identity, owner, or mode is unsafe`);
  }
}

function openPinnedRootDirectory(directory: string): number {
  const before = fs.lstatSync(directory);
  if (before.isSymbolicLink() || !before.isDirectory() || before.uid !== currentUid()
    || (before.mode & 0o022) !== 0) {
    throw new Error("Task 2D2 data root identity, owner, or mode is unsafe");
  }
  const fd = openRootDirectory(directory);
  try {
    const opened = fs.fstatSync(fd);
    const after = fs.lstatSync(directory);
    if (opened.dev !== before.dev || opened.ino !== before.ino
      || after.dev !== before.dev || after.ino !== before.ino) {
      throw new Error("Task 2D2 data root identity changed while opening");
    }
    assertPrivateDirectory(fd, "data root");
    return fd;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function requiredRegularFileAt(directory: number, name: string, label: string): number {
  const fd = openRegularFileAt(directory, name);
  if (fd === null) throw new Error(`Task 2D2 ${label} is missing or unsafe`);
  const stat = fs.fstatSync(fd);
  if (stat.uid !== currentUid() || stat.nlink !== 1 || (stat.mode & 0o022) !== 0) {
    fs.closeSync(fd);
    throw new Error(`Task 2D2 ${label} identity, owner, or mode is unsafe`);
  }
  return fd;
}

function assertPinnedPath(file: string, fd: number, label: string): FileIdentity {
  const opened = fs.fstatSync(fd);
  const current = fs.lstatSync(file);
  if (!opened.isFile() || current.isSymbolicLink() || !current.isFile()
    || opened.dev !== current.dev || opened.ino !== current.ino
    || opened.uid !== current.uid || opened.mode !== current.mode
    || opened.uid !== currentUid() || opened.nlink !== 1 || current.nlink !== 1
    || (opened.mode & 0o022) !== 0) {
    throw new Error(`Task 2D2 ${label} path identity changed`);
  }
  return { dev: opened.dev, ino: opened.ino };
}

function captureV5Snapshot(db: Database, authority: Task2d2SchemaV5Authority): Snapshot {
  const before = readDataVersion(db);
  db.exec("BEGIN DEFERRED");
  try {
    assertExactSchema(db, SCHEMA_FROM);
    const history = readHistory(db);
    assertHistory(history, SCHEMA_FROM);
    const tableCounts = readTableCounts(db);
    const applicationRows = digestApplicationRows(db, readTableShapes(db));
    assertLiveIdentity(db, authority);
    assertDatabaseChecks(db, "schema-5 source");
    const preimageSha256 = sha256(canonicalRequestJson({
      schemaIdentitySha256: schemaIdentitySha256(SCHEMA_FROM),
      history,
      tableCounts,
      applicationRows,
    } as unknown as JsonValue, "Task 2D2 schema-5 preimage"));
    db.exec("COMMIT");
    requireUnchangedDataVersion(db, before);
    return {
      dataVersion: before,
      history,
      tableCounts,
      applicationRows,
      preimageSha256,
    };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* Preserve the first failure. */ }
    throw error;
  }
}

function createSchemaBackup(input: {
  dataRoot: string;
  dataRootFd: number;
  databasePath: string;
  coreCommit: string;
  createdAt: number;
  sourceIdentity: FileIdentity;
  snapshot: Snapshot;
  reader: Database;
  liveAuthority: Task2d2SchemaV5Authority;
}): Backup {
  const opened: PinnedDirectory[] = [];
  let backupFd = -1;
  let manifestFd = -1;
  try {
    const backups = openDirectoryAt(input.dataRootFd, "backups", 0o700);
    const backupsPath = path.join(input.dataRoot, "backups");
    opened.push({ path: backupsPath, fd: backups.fd, label: "backup root" });
    assertPrivateDirectory(backups.fd, "backup root");
    if (backups.created) fs.fsyncSync(input.dataRootFd);
    const task = openDirectoryAt(backups.fd, "task-2d2-schema-v6", 0o700);
    const taskPath = path.join(backupsPath, "task-2d2-schema-v6");
    opened.push({ path: taskPath, fd: task.fd, label: "schema backup root" });
    assertPrivateDirectory(task.fd, "schema backup root");
    if (task.created) fs.fsyncSync(backups.fd);
    const label = `${utcLabel(input.createdAt)}-${input.coreCommit}`;
    const leaf = openDirectoryAt(task.fd, label, 0o700);
    if (!leaf.created) {
      fs.closeSync(leaf.fd);
      throw new Error("Task 2D2 schema backup directory already exists");
    }
    const directory = path.join(taskPath, label);
    opened.push({ path: directory, fd: leaf.fd, label: "schema backup directory" });
    assertPrivateDirectory(leaf.fd, "schema backup directory");
    fs.fsyncSync(task.fd);
    assertPinnedDirectoryPath(opened[2]!);
    const backupPath = path.join(directory, "ralphy.db");
    const existing = openRegularFileAt(leaf.fd, "ralphy.db");
    if (existing !== null) {
      fs.closeSync(existing);
      throw new Error("Task 2D2 schema backup database destination already exists");
    }
    try {
      input.reader.prepare("VACUUM INTO ?").run(backupPath);
    } catch (error) {
      throw new Error(`Task 2D2 schema snapshot backup write failed: ${errorMessage(error)}`, { cause: error });
    }
    backupFd = requiredRegularFileAt(leaf.fd, "ralphy.db", "schema backup database");
    fs.fchmodSync(backupFd, 0o600);
    fs.fsyncSync(backupFd);
    assertExactPinnedArtifact(backupPath, backupFd, "schema backup database");
    assertPinnedDirectories(opened);
    withReadonlyDatabase(backupPath, (backupDb) => {
      assertSnapshot(backupDb, input.snapshot, SCHEMA_FROM, input.liveAuthority);
      assertDatabaseChecks(backupDb, "schema-5 backup");
    });
    assertExactPinnedArtifact(backupPath, backupFd, "schema backup database");
    assertPinnedDirectories(opened);
    const hashed = hashDescriptor(backupFd);
    const manifest = {
      version: 1,
      sourceDatabasePath: input.databasePath,
      sourceDevice: String(input.sourceIdentity.dev),
      sourceInode: String(input.sourceIdentity.ino),
      coreCommit: input.coreCommit,
      fromSchemaVersion: SCHEMA_FROM,
      toSchemaVersion: SCHEMA_TO,
      schemaMigrationSha256: sha256(SCHEMA_MIGRATION.sql),
      toSchemaIdentitySha256: schemaIdentitySha256(SCHEMA_TO),
      liveIdentitySha256: sha256(canonicalRequestJson(input.liveAuthority as JsonValue)),
      preimageSha256: input.snapshot.preimageSha256,
      applicationRowCount: input.snapshot.applicationRows.count,
      applicationRowsSha256: input.snapshot.applicationRows.sha256,
      preBackupDataVersion: input.snapshot.dataVersion,
      backupBytes: hashed.bytes,
      backupSha256: hashed.sha256,
      backupIntegrity: "ok",
      createdAt: input.createdAt,
    } satisfies JsonValue;
    const manifestPath = path.join(directory, "manifest.json");
    const manifestBytes = Buffer.from(
      `${canonicalRequestJson(manifest, "Task 2D2 schema backup manifest")}\n`,
      "utf8",
    );
    const createdManifestFd = createExclusiveRegularFileAt(leaf.fd, "manifest.json", 0o600);
    if (createdManifestFd === null) throw new Error("Task 2D2 schema backup manifest already exists");
    const createdManifestIdentity = fs.fstatSync(createdManifestFd);
    try {
      fs.writeFileSync(createdManifestFd, manifestBytes);
      fs.fsyncSync(createdManifestFd);
    } finally {
      fs.closeSync(createdManifestFd);
    }
    manifestFd = requiredRegularFileAt(leaf.fd, "manifest.json", "schema backup manifest");
    const reopenedManifestIdentity = fs.fstatSync(manifestFd);
    if (reopenedManifestIdentity.dev !== createdManifestIdentity.dev
      || reopenedManifestIdentity.ino !== createdManifestIdentity.ino) {
      throw new Error("Task 2D2 schema backup manifest changed while pinning");
    }
    assertExactPinnedArtifact(manifestPath, manifestFd, "schema backup manifest");
    assertDescriptorBytes(manifestFd, manifestBytes, "schema backup manifest");
    fs.fsyncSync(leaf.fd);
    for (const pinned of [...opened].reverse()) fs.fsyncSync(pinned.fd);
    return {
      directory,
      directories: opened,
      path: backupPath,
      fd: backupFd,
      bytes: hashed.bytes,
      sha256: hashed.sha256,
      manifestPath,
      manifestFd,
      manifestBytes,
    };
  } catch (error) {
    if (manifestFd >= 0) fs.closeSync(manifestFd);
    if (backupFd >= 0) fs.closeSync(backupFd);
    for (const directory of [...opened].reverse()) fs.closeSync(directory.fd);
    throw error;
  }
}

function withReadonlyDatabase<T>(databasePath: string, operation: (db: Database) => T): T {
  const db = openReadonlyDatabase(databasePath);
  try {
    return operation(db);
  } finally {
    db.close();
  }
}

function openReadonlyDatabase(databasePath: string): Database {
  const db = new Database(databasePath, { readonly: true, strict: true });
  db.exec("PRAGMA busy_timeout = 0");
  return db;
}

function assertPrepared(
  db: Database,
  snapshot: Snapshot,
  authority: Task2d2SchemaV5Authority,
  expectedAppliedAt: number,
): void {
  assertExactSchema(db, SCHEMA_TO);
  const history = readHistory(db);
  assertHistory(history, SCHEMA_TO);
  if (!sameJson(history.slice(0, SCHEMA_FROM), snapshot.history)) {
    throw new Error("Task 2D2 schema preparation changed existing migration history");
  }
  const migrationRows = db.query<{ count: number }, [number, number]>(
    `SELECT COUNT(*) AS count FROM schema_migrations
     WHERE version = ? AND typeof(version) = 'integer'
       AND applied_at = ? AND typeof(applied_at) = 'integer'`,
  ).get(SCHEMA_TO, expectedAppliedAt)!.count;
  if (migrationRows !== 1) {
    throw new Error("Task 2D2 schema-6 migration row changed");
  }
  const expectedCounts = {
    ...snapshot.tableCounts,
    migration_entry_supplemental_refs: 0,
    schema_migrations: snapshot.tableCounts.schema_migrations! + 1,
  };
  assertApplicationRows(db, snapshot, "changed during schema preparation");
  if (!sameJson(readTableCounts(db), expectedCounts)) {
    throw new Error("Task 2D2 schema preparation changed table row counts");
  }
  assertLiveIdentity(db, authority);
  assertDatabaseChecks(db, "schema-6 source");
}

function assertSnapshot(
  db: Database,
  snapshot: Snapshot,
  schemaVersion: number,
  authority: Task2d2SchemaV5Authority,
): void {
  assertExactSchema(db, schemaVersion);
  const history = readHistory(db);
  if (!sameJson(history, snapshot.history)) {
    throw new Error("Task 2D2 schema-5 migration history changed across backup fence");
  }
  const counts = readTableCounts(db);
  if (!sameJson(counts, snapshot.tableCounts)) {
    throw new Error("Task 2D2 schema-5 table counts changed across backup fence");
  }
  assertApplicationRows(db, snapshot, "changed across backup fence");
  assertLiveIdentity(db, authority);
}

function assertExactSchema(db: Database, version: number): void {
  const userVersion = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
  if (userVersion !== version) {
    throw new Error(`Task 2D2 schema preparation requires exact schema ${version}`);
  }
  const actual = schemaRows(db);
  const expected = expectedSchemaRows(version);
  if (!sameJson(actual, expected)) {
    throw new Error(`Task 2D2 schema ${version} identity is not exact`);
  }
}

function expectedSchemaRows(version: number): Array<Record<string, string | null>> {
  const db = new Database(":memory:", { strict: true });
  try {
    for (const migration of MIGRATIONS.filter((candidate) => candidate.version <= version)) {
      db.exec(migration.sql);
    }
    return schemaRows(db);
  } finally {
    db.close();
  }
}

function schemaIdentitySha256(version: number): string {
  return sha256(canonicalRequestJson(expectedSchemaRows(version) as JsonValue));
}

function schemaRows(db: Database): Array<Record<string, string | null>> {
  return db.query<Record<string, string | null>, []>(
    `SELECT type, name, tbl_name, sql FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
  ).all();
}

function readHistory(db: Database): Array<{ version: number; appliedAt: number }> {
  return db.query<{ version: number; appliedAt: number }, []>(
    "SELECT version, applied_at AS appliedAt FROM schema_migrations ORDER BY version",
  ).all();
}

function assertHistory(history: readonly { version: number }[], version: number): void {
  if (history.length !== version || history.some((row, index) => row.version !== index + 1)) {
    throw new Error(`Task 2D2 schema preparation requires exact migration history through ${version}`);
  }
}

function readTableCounts(db: Database): Record<string, number> {
  return Object.fromEntries(db.query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map(({ name }) => [
    name,
    db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM "${name}"`).get()!.count,
  ]));
}

function readTableShapes(db: Database): TableShape[] {
  return db.query<{ name: string }, []>(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map(({ name }) => {
    const columns = db.query<{ name: string; pk: number; hidden: number }, []>(
      `PRAGMA table_xinfo(${quoteIdentifier(name)})`,
    ).all().filter(({ hidden }) => hidden === 0)
      .map((column) => ({ name: column.name, primaryKey: column.pk }));
    if (columns.length === 0) throw new Error(`Task 2D2 table ${name} has no visible columns`);
    return {
      name,
      columns,
      usesRowid: columns.every(({ primaryKey }) => primaryKey === 0),
    };
  });
}

function digestApplicationRows(db: Database, tables: readonly TableShape[]): ApplicationRows {
  const hash = createHash("sha256");
  let count = 0;
  for (const table of tables) {
    hash.update(canonicalRequestJson({
      table: table.name,
      columns: table.columns,
      usesRowid: table.usesRowid,
    } as unknown as JsonValue, "Task 2D2 application table shape"));
    hash.update("\n");
    const selected = [
      ...(table.usesRowid ? [{ name: "$rowid", expression: "rowid" }] : []),
      ...table.columns.map(({ name }) => ({ name, expression: quoteIdentifier(name) })),
    ];
    const projection = selected.flatMap(({ expression }, index) => [
      `typeof(${expression}) AS ${quoteIdentifier(`storage_class_${index}`)}`,
      `CASE typeof(${expression})
         WHEN 'integer' THEN CAST(${expression} AS TEXT)
         WHEN 'real' THEN ${expression}
         WHEN 'text' THEN hex(CAST(${expression} AS BLOB))
         WHEN 'blob' THEN hex(${expression})
         ELSE NULL
       END AS ${quoteIdentifier(`storage_value_${index}`)}`,
    ]).join(", ");
    const primaryKey = table.columns.filter(({ primaryKey }) => primaryKey > 0)
      .sort((left, right) => left.primaryKey - right.primaryKey);
    const orderBy = table.usesRowid
      ? "rowid"
      : primaryKey.map(({ name }) => quoteIdentifier(name)).join(", ");
    const where = table.name === "schema_migrations" ? " WHERE version <= 5" : "";
    const sql = `SELECT ${projection} FROM ${quoteIdentifier(table.name)}${where} ORDER BY ${orderBy}`;
    for (const row of db.query<Record<string, unknown>, []>(sql).iterate()) {
      const columns: Record<string, JsonValue> = {};
      selected.forEach(({ name }, index) => {
        columns[name] = encodeStorageValue(
          row[`storage_class_${index}`],
          row[`storage_value_${index}`],
          `${table.name}.${name}`,
        );
      });
      hash.update(canonicalRequestJson({ table: table.name, columns } as JsonValue, "Task 2D2 application row"));
      hash.update("\n");
      count += 1;
    }
  }
  return { tables, count, sha256: hash.digest("hex") };
}

function encodeStorageValue(storageClass: unknown, value: unknown, label: string): JsonValue {
  if (storageClass === "null") return { storageClass: "null" };
  if (storageClass === "integer" && typeof value === "string") {
    return { storageClass, decimal: value };
  }
  if (storageClass === "real" && typeof value === "number") {
    const bytes = Buffer.allocUnsafe(8);
    bytes.writeDoubleBE(value);
    return { storageClass, ieee754Hex: bytes.toString("hex") };
  }
  if ((storageClass === "text" || storageClass === "blob") && typeof value === "string") {
    return { storageClass, hex: value.toLowerCase() };
  }
  throw new Error(`Task 2D2 ${label} has an unsupported SQLite storage value`);
}

function assertApplicationRows(db: Database, snapshot: Snapshot, reason: string): void {
  const actual = digestApplicationRows(db, snapshot.applicationRows.tables);
  if (actual.count !== snapshot.applicationRows.count
    || actual.sha256 !== snapshot.applicationRows.sha256) {
    throw new Error(`Task 2D2 schema-5 application rows ${reason}`);
  }
}

function assertLiveIdentity(db: Database, authority: Task2d2SchemaV5Authority): void {
  const migration = db.query<{
    phase: string;
    cutover_at: number | null;
    cutover_activity_id: number | null;
  }, [string]>(
    "SELECT phase, cutover_at, cutover_activity_id FROM migration_runs WHERE id = ?",
  ).get(TASK_2D2_RUN_ID);
  const activities = db.query<{ id: number; created_at: number }, [string]>(
    `SELECT id, created_at FROM activity_events
     WHERE entity_type = 'migration_run' AND entity_id = ? AND action = 'cutover' ORDER BY id`,
  ).all(TASK_2D2_RUN_ID);
  const storeId = db.query<{ store_id: string }, []>(
    "SELECT store_id FROM store_metadata WHERE singleton = 1",
  ).get()?.store_id;
  const actual = {
    migrationRunId: TASK_2D2_RUN_ID,
    cutoverActivityId: activities[0]?.id,
    cutoverCreatedAt: activities[0]?.created_at,
    storeId,
    baseline: readLiveBaseline(db),
  };
  if (!migration || migration.phase !== "cutover"
    || migration.cutover_at !== TASK_2D2_CUTOVER_AT
    || migration.cutover_activity_id !== authority.cutoverActivityId
    || activities.length !== 1
    || !sameJson(actual, authority)) {
    throw new Error("Task 2D2 schema preparation source differs from the approved live identity");
  }
}

function readLiveBaseline(db: Database): Task2d2SchemaV5Baseline {
  const scalar = (sql: string): number => db.query<{ value: number }, []>(sql).get()!.value;
  const entries = db.query<{ id: string; state: string; target_refs_json: string | null }, [string]>(
    "SELECT id, state, target_refs_json FROM migration_entries WHERE migration_run_id = ? ORDER BY id",
  ).all(TASK_2D2_RUN_ID);
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
  ).all(TASK_2D2_RUN_ID);
  return {
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
    migrationSourcesSha256: sha256(canonicalRequestJson(sources as JsonValue)),
    migrationTargetRefsSha256: migrationTargetRefs.digest("hex"),
    dsStoreEntries: scalar(
      `SELECT COUNT(*) AS value FROM migration_entries
       WHERE migration_run_id = '${TASK_2D2_RUN_ID}' AND source_kind = 'ralphy'
         AND entry_kind = 'file'
         AND (source_path = '.DS_Store' OR substr(source_path, -10) = '/.DS_Store')
         AND disposition = 'system' AND state = 'excluded'`,
    ),
  };
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function assertDatabaseChecks(db: Database, label: string): void {
  const integrity = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()?.integrity_check;
  if (integrity !== "ok") throw new Error(`Task 2D2 ${label} integrity check failed`);
  if (db.query("PRAGMA foreign_key_check").all().length !== 0) {
    throw new Error(`Task 2D2 ${label} foreign-key check failed`);
  }
}

function readDataVersion(db: Database): number {
  return db.query<{ data_version: number }, []>("PRAGMA data_version").get()!.data_version;
}

function requireUnchangedDataVersion(db: Database, expected: number): void {
  if (readDataVersion(db) !== expected) {
    throw new Error("Task 2D2 source changed across the schema backup fence");
  }
}

function assertPinnedEnvironment(
  dataRoot: string,
  dataRootFd: number,
  databasePath: string,
  sourceFd: number,
  backup: Backup,
  verifyBackupHash = false,
): void {
  assertPinnedDirectoryPath({ path: dataRoot, fd: dataRootFd, label: "data root" });
  assertPinnedPath(databasePath, sourceFd, "source database");
  assertBackupArtifacts(backup, verifyBackupHash);
}

function assertPinnedDirectories(directories: readonly PinnedDirectory[]): void {
  for (const directory of directories) assertPinnedDirectoryPath(directory);
}

function assertPinnedDirectoryPath(directory: PinnedDirectory): void {
  try {
    const current = fs.lstatSync(directory.path);
    const opened = fs.fstatSync(directory.fd);
    if (current.isSymbolicLink() || !current.isDirectory() || !opened.isDirectory()
      || current.dev !== opened.dev || current.ino !== opened.ino
      || current.uid !== opened.uid || current.mode !== opened.mode
      || opened.uid !== currentUid() || (opened.mode & 0o022) !== 0) {
      throw new Error();
    }
  } catch {
    throw new Error(`Task 2D2 ${directory.label} identity, owner, or mode changed`);
  }
}

function assertExactPinnedArtifact(file: string, fd: number, label: string): void {
  try {
    const current = fs.lstatSync(file);
    const opened = fs.fstatSync(fd);
    if (current.isSymbolicLink() || !current.isFile() || !opened.isFile()
      || current.dev !== opened.dev || current.ino !== opened.ino
      || current.uid !== opened.uid || current.mode !== opened.mode
      || opened.uid !== currentUid() || opened.nlink !== 1 || current.nlink !== 1
      || (opened.mode & 0o777) !== 0o600) {
      throw new Error();
    }
  } catch {
    throw new Error(`Task 2D2 ${label} changed`);
  }
}

function assertBackupArtifacts(backup: Backup, verifyHash: boolean): void {
  assertPinnedDirectories(backup.directories);
  assertExactPinnedArtifact(backup.path, backup.fd, "schema backup database");
  if (fs.fstatSync(backup.fd).size !== backup.bytes) {
    throw new Error("Task 2D2 schema backup database changed");
  }
  assertExactPinnedArtifact(backup.manifestPath, backup.manifestFd, "schema backup manifest");
  assertDescriptorBytes(backup.manifestFd, backup.manifestBytes, "schema backup manifest");
  if (verifyHash) {
    const retained = hashDescriptor(backup.fd);
    if (retained.bytes !== backup.bytes || retained.sha256 !== backup.sha256) {
      throw new Error(`Task 2D2 schema backup changed: ${backup.directory}`);
    }
  }
}

function assertDescriptorBytes(fd: number, expected: Buffer, label: string): void {
  const actual = readDescriptor(fd);
  if (!actual.equals(expected)) throw new Error(`Task 2D2 ${label} changed`);
}

function readDescriptor(fd: number): Buffer {
  const stat = fs.fstatSync(fd);
  const bytes = Buffer.allocUnsafe(stat.size);
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
    if (count === 0) break;
    offset += count;
  }
  if (offset !== bytes.length) throw new Error("Task 2D2 retained descriptor changed while reading");
  return bytes;
}

function hashDescriptor(fd: number): { bytes: number; sha256: string } {
  const before = fs.fstatSync(fd);
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  let offset = 0;
  for (;;) {
    const bytes = fs.readSync(fd, chunk, 0, chunk.length, offset);
    if (bytes === 0) break;
    hash.update(chunk.subarray(0, bytes));
    offset += bytes;
  }
  const after = fs.fstatSync(fd);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs || offset !== before.size) {
    throw new Error("Task 2D2 schema backup changed while hashing");
  }
  return { bytes: offset, sha256: hash.digest("hex") };
}

function utcLabel(timestamp: number): string {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error("Task 2D2 schema preparation timestamp is invalid");
  }
  return new Date(timestamp).toISOString().replaceAll(":", "-");
}

function sha256(value: string): string {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalRequestJson(left as JsonValue) === canonicalRequestJson(right as JsonValue);
}

function missingSchemaMigration(): never {
  throw new Error("Task 2D2 schema migration 6 is unavailable");
}

function currentUid(): number {
  return typeof process.geteuid === "function" ? process.geteuid() : process.getuid?.() ?? -1;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
