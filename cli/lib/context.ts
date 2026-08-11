import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DomainError } from "./errors/domain.js";
import { assertStartupJournalReady } from "./migration/cutover-journal.js";
import { MIGRATIONS, SCHEMA_VERSION } from "./store/schema.js";

export type DataRootIdentity = {
  dataRoot: string;
  storeId: string;
  rootId: string;
};

export type CommandContext =
  | { kind: "session"; sessionId: string; workspaceId: string; projectId?: string }
  | { kind: "scope"; workspaceId: string; projectId?: string };

export function resolveDataRoot(input: {
  root?: string;
  cwd?: string;
} = {}): DataRootIdentity {
  if (input.root !== undefined) {
    const requested = path.resolve(input.root);
    if (path.basename(requested) === ".ralphy") assertStartupJournalReady(requested);
    const explicit = canonicalDirectory(input.root, "--root");
    if (path.basename(explicit) === ".ralphy") assertStartupJournalReady(explicit);
    if (!fs.existsSync(path.join(explicit, "ralphy.db"))) {
      if (fs.existsSync(path.join(explicit, ".ralphy"))) {
        throw inputError(
          "--root",
          "expected the data directory itself, not a repository containing .ralphy",
        );
      }
      throw new DomainError("E_MIGRATION_INCOMPLETE");
    }
    return identifyDataRoot(explicit);
  }

  let current = canonicalDirectory(input.cwd ?? process.cwd(), "--cwd");
  while (true) {
    const candidate = path.join(current, ".ralphy");
    assertStartupJournalReady(candidate);
    if (fs.existsSync(candidate)) {
      if (!fs.existsSync(path.join(candidate, "ralphy.db"))) {
        throw new DomainError("E_MIGRATION_INCOMPLETE");
      }
      return identifyDataRoot(fs.realpathSync.native(candidate));
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new DomainError("E_MIGRATION_INCOMPLETE");
}

export function resolveCommandContext(input: {
  sessionId?: string;
  workspaceId?: string;
  projectId?: string;
  positionalProjectId?: string;
  cwd?: string;
  dataRoot: string;
}): CommandContext {
  const dataRoot = canonicalDirectory(input.dataRoot, "--root");
  const databasePath = path.join(dataRoot, "ralphy.db");
  if (!fs.existsSync(databasePath)) {
    throw new DomainError("E_MIGRATION_INCOMPLETE");
  }
  let db: Database | null = null;
  try {
    db = openIdentityDatabase(databasePath);
    return resolveContext(db, { ...input, dataRoot });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("E_MIGRATION_INCOMPLETE");
  } finally {
    db?.close();
  }
}

function resolveContext(
  db: Database,
  input: {
    sessionId?: string;
    workspaceId?: string;
    projectId?: string;
    positionalProjectId?: string;
    cwd?: string;
    dataRoot: string;
  },
): CommandContext {
  const explicitProjectId = coherentProjectIds(
    input.projectId,
    input.positionalProjectId,
  );
  const cwdProject = projectFromCwd(
    db,
    input.dataRoot,
    input.cwd ?? process.cwd(),
  );

  if (input.sessionId !== undefined) {
    const session = db
      .query<
        { workspaceId: string; projectId: string | null; endedAt: number | null },
        [string]
      >(
        `SELECT workspace_id AS workspaceId, project_id AS projectId,
                ended_at AS endedAt
         FROM agent_sessions WHERE id = ?`,
      )
      .get(input.sessionId);
    if (!session || session.endedAt !== null) {
      throw inputError("--session", "expected an existing active Agent Session");
    }
    assertMatch("--workspace", input.workspaceId, session.workspaceId);
    assertMatch("--project", explicitProjectId, session.projectId);
    assertMatch("--cwd", cwdProject?.projectId, session.projectId);
    return Object.freeze({
      kind: "session",
      sessionId: input.sessionId,
      workspaceId: session.workspaceId,
      ...(session.projectId === null ? {} : { projectId: session.projectId }),
    });
  }

  const projectId = explicitProjectId ?? cwdProject?.projectId;
  if (
    explicitProjectId !== undefined &&
    cwdProject !== null &&
    explicitProjectId !== cwdProject.projectId
  ) {
    throw inputError("--project", "conflicts with the Project derived from --cwd");
  }
  if (projectId !== undefined) {
    const project = db
      .query<{ id: string; workspaceId: string }, [string, string]>(
        "SELECT id, workspace_id AS workspaceId FROM projects WHERE id = ? OR slug = ?",
      )
      .get(projectId, projectId);
    if (!project) throw inputError("--project", `Project not found: ${projectId}`);
    assertMatch("--workspace", input.workspaceId, project.workspaceId);
    return Object.freeze({
      kind: "scope",
      workspaceId: project.workspaceId,
      projectId: project.id,
    });
  }

  const workspaceId = input.workspaceId ?? inferOnlyWorkspace(db);
  const workspace = db
    .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
    .get(workspaceId);
  if (!workspace) {
    throw inputError("--workspace", `Workspace not found: ${workspaceId}`);
  }
  return Object.freeze({ kind: "scope", workspaceId });
}

function identifyDataRoot(dataRoot: string): DataRootIdentity {
  let db: Database | null = null;
  try {
    db = openIdentityDatabase(path.join(dataRoot, "ralphy.db"));
    const store = db
      .query<{ storeId: string }, []>(
        "SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1",
      )
      .get();
    if (!store?.storeId) throw new DomainError("E_MIGRATION_INCOMPLETE");
    const stat = fs.statSync(dataRoot);
    const rootId = createHash("sha256")
      .update(`${dataRoot}\0${stat.dev}\0${stat.ino}`)
      .digest("hex");
    return Object.freeze({ dataRoot, storeId: store.storeId, rootId });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("E_MIGRATION_INCOMPLETE");
  } finally {
    db?.close();
  }
}

function openIdentityDatabase(databasePath: string): Database {
  let db: Database | null = null;
  try {
    db = new Database(databasePath, { readonly: true });
    db.exec("PRAGMA busy_timeout = 5000");
    db.query("PRAGMA schema_version").get();
    return db;
  } catch (error) {
    try {
      db?.close();
    } catch {
      // Preserve the original open failure.
    }
    if (!isSqliteCantOpen(error)) throw error;
    return openStandaloneWalSnapshot(databasePath, error);
  }
}

function openStandaloneWalSnapshot(
  databasePath: string,
  openError: unknown,
): Database {
  let directoryDescriptor: number | null = null;
  let descriptor: number | null = null;
  let snapshot: Database | null = null;
  try {
    const directoryPath = path.dirname(databasePath);
    const directoryBefore = fs.lstatSync(directoryPath);
    if (!directoryBefore.isDirectory() || directoryBefore.isSymbolicLink()) {
      throw openError;
    }
    directoryDescriptor = fs.openSync(
      directoryPath,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY |
        fs.constants.O_NOFOLLOW,
    );
    const directoryOpened = fs.fstatSync(directoryDescriptor);
    if (
      !directoryOpened.isDirectory() ||
      !sameFile(directoryBefore, directoryOpened)
    ) {
      throw openError;
    }
    if (hasWalSidecar(databasePath)) throw openError;
    const before = fs.lstatSync(databasePath);
    if (!before.isFile() || before.isSymbolicLink()) throw openError;
    descriptor = fs.openSync(
      databasePath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    const opened = fs.fstatSync(descriptor);
    if (!sameFile(before, opened)) throw openError;
    const image = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    const current = fs.lstatSync(databasePath);
    if (
      !sameFile(opened, after) ||
      !sameFile(opened, current) ||
      !samePinnedDirectory(
        directoryDescriptor,
        directoryOpened,
        directoryPath,
      ) ||
      hasWalSidecar(databasePath) ||
      image.byteLength !== opened.size ||
      image.subarray(0, 16).toString("binary") !== "SQLite format 3\0" ||
      image[18] !== 2 ||
      image[19] !== 2
    ) {
      throw openError;
    }
    image[18] = 1;
    image[19] = 1;
    snapshot = Database.deserialize(image, { readonly: true });
    snapshot.exec("PRAGMA query_only = ON");
    const integrity = snapshot
      .query<{ integrity_check: string }, []>("PRAGMA integrity_check")
      .all();
    if (
      integrity.length !== 1 ||
      integrity[0]?.integrity_check !== "ok"
    ) {
      throw openError;
    }
    const userVersion = snapshot
      .query<{ user_version: number }, []>("PRAGMA user_version")
      .get();
    if (
      userVersion?.user_version !== SCHEMA_VERSION ||
      !hasExactSchemaIdentity(snapshot)
    ) {
      throw openError;
    }
    if (
      hasWalSidecar(databasePath) ||
      !sameFile(opened, fs.lstatSync(databasePath)) ||
      !samePinnedDirectory(
        directoryDescriptor,
        directoryOpened,
        directoryPath,
      )
    ) {
      throw openError;
    }
    return snapshot;
  } catch {
    try {
      snapshot?.close();
    } catch {
      // The caller maps the original open failure to the public error.
    }
    throw openError;
  } finally {
    try {
      if (descriptor !== null) fs.closeSync(descriptor);
    } finally {
      if (directoryDescriptor !== null) fs.closeSync(directoryDescriptor);
    }
  }
}

type SchemaIdentityRow = {
  type: string;
  name: string;
  tableName: string;
  sql: string | null;
};

function hasExactSchemaIdentity(snapshot: Database): boolean {
  const versions = snapshot
    .query<{ version: number }, []>(
      "SELECT version FROM schema_migrations ORDER BY version",
    )
    .all();
  if (
    versions.length !== MIGRATIONS.length ||
    versions.some((row, index) => row.version !== MIGRATIONS[index]?.version)
  ) {
    return false;
  }

  const expected = new Database(":memory:", { strict: true });
  try {
    for (const migration of MIGRATIONS) expected.exec(migration.sql);
    return JSON.stringify(readSchemaIdentity(snapshot)) ===
      JSON.stringify(readSchemaIdentity(expected));
  } finally {
    expected.close();
  }
}

function readSchemaIdentity(db: Database): SchemaIdentityRow[] {
  return db.query<SchemaIdentityRow, []>(
    `SELECT type, name, tbl_name AS tableName, sql
     FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
  ).all();
}

function hasWalSidecar(databasePath: string): boolean {
  return pathEntryExists(`${databasePath}-wal`) ||
    pathEntryExists(`${databasePath}-shm`);
}

function pathEntryExists(candidate: string): boolean {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function samePinnedDirectory(
  descriptor: number,
  opened: fs.Stats,
  directoryPath: string,
): boolean {
  try {
    const after = fs.fstatSync(descriptor);
    const current = fs.lstatSync(directoryPath);
    return after.isDirectory() && current.isDirectory() &&
      !current.isSymbolicLink() && sameFile(opened, after) &&
      sameFile(opened, current);
  } catch {
    return false;
  }
}

function isSqliteCantOpen(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "SQLITE_CANTOPEN";
}

function sameFile(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino &&
    left.size === right.size && left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs;
}

function projectFromCwd(
  db: Database,
  dataRoot: string,
  cwd: string | undefined,
): { workspaceId: string; projectId: string } | null {
  if (cwd === undefined) return null;
  let canonical: string;
  try {
    canonical = fs.realpathSync.native(cwd);
  } catch {
    return null;
  }
  const relative = path.relative(dataRoot, canonical);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  const parts = relative.split(path.sep);
  if (parts[0] !== "buckets" || parts[2] !== "projects" || !parts[1] || !parts[3]) {
    return null;
  }
  const row = db
    .query<{ workspaceId: string; projectId: string }, [string, string]>(
      `SELECT workspace_id AS workspaceId, id AS projectId
       FROM projects WHERE workspace_id = ? AND id = ?`,
    )
    .get(parts[1], parts[3]);
  return row ?? null;
}

function inferOnlyWorkspace(db: Database): string {
  const rows = db
    .query<{ id: string }, []>("SELECT id FROM workspaces ORDER BY id LIMIT 2")
    .all();
  if (rows.length !== 1) {
    throw inputError(
      "--workspace",
      rows.length === 0
        ? "no Workspace exists"
        : "more than one Workspace exists; pass an explicit Workspace or Agent Session",
    );
  }
  return rows[0]!.id;
}

function coherentProjectIds(
  flagged: string | undefined,
  positional: string | undefined,
): string | undefined {
  if (flagged !== undefined && positional !== undefined && flagged !== positional) {
    throw inputError("--project", "conflicts with the positional Project");
  }
  return flagged ?? positional;
}

function assertMatch(
  field: string,
  actual: string | undefined,
  expected: string | null,
): void {
  if (actual !== undefined && actual !== expected) {
    throw inputError(field, "conflicts with the immutable Agent Session scope");
  }
}

function canonicalDirectory(value: string, field: string): string {
  try {
    const canonical = fs.realpathSync.native(path.resolve(value));
    if (!fs.statSync(canonical).isDirectory()) throw new Error("not a directory");
    return canonical;
  } catch {
    throw inputError(field, "expected an existing directory");
  }
}

function inputError(field: string, detail: string): DomainError {
  return new DomainError("E_INPUT_INVALID", undefined, {
    field,
    detail,
    verb: "session",
  });
}
