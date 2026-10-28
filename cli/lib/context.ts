import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DomainError } from "./errors/domain.js";
import type { CommandScopeLabels } from "./context-state.js";
import { assertStartupJournalReady } from "./migration/cutover-journal.js";
import {
  countProjects,
  countWorkspaces,
  describeChoices,
  describeProject,
  describeWorkspace,
  findProjectRefById,
  findProjectRefs,
  findWorkspaceRef,
  listProjectRefs,
  listWorkspaceRefs,
  plainRef,
  quoteRef,
  type ProjectRef,
  type WorkspaceRef,
} from "./scope-ref.js";
import { MIGRATIONS, SCHEMA_VERSION } from "./store/schema.js";

export type DataRootIdentity = {
  dataRoot: string;
  storeId: string;
  rootId: string;
};

export type CommandContext =
  | { kind: "session"; sessionId: string; workspaceId: string; projectId?: string }
  | { kind: "scope"; workspaceId: string; projectId?: string };

/** The resolved context plus the slugs it was known by (#573). */
export type ResolvedCommandScope = {
  context: CommandContext;
  labels: CommandScopeLabels;
};

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

type CommandContextInput = {
  sessionId?: string;
  /** Workspace id or slug. */
  workspaceId?: string;
  /** Project id or slug. */
  projectId?: string;
  positionalProjectId?: string;
  cwd?: string;
  dataRoot: string;
};

/**
 * Resolve the immutable command context. Workspace and Project references may
 * be ids or slugs; each resolves to exactly one row or fails with the valid
 * choices listed (#573). There is no implicit current Workspace: without an
 * explicit scope only a library holding exactly one Workspace resolves.
 */
export function resolveCommandContext(input: CommandContextInput): CommandContext {
  return resolveCommandScope(input).context;
}

/** {@link resolveCommandContext} plus the slugs of the resolved scope. */
export function resolveCommandScope(input: CommandContextInput): ResolvedCommandScope {
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
  input: CommandContextInput,
): ResolvedCommandScope {
  const explicitProjectRef = coherentProjectIds(
    input.projectId,
    input.positionalProjectId,
  );
  const cwdProject = projectFromCwd(
    db,
    input.dataRoot,
    input.cwd ?? process.cwd(),
  );
  const explicitWorkspace = input.workspaceId === undefined
    ? undefined
    : requireWorkspace(db, input.workspaceId);

  if (input.sessionId !== undefined) {
    return resolveSessionScope(db, input.sessionId, {
      workspaceRef: input.workspaceId,
      workspace: explicitWorkspace,
      projectRef: explicitProjectRef,
      cwdProjectId: cwdProject?.projectId,
    });
  }

  if (explicitProjectRef !== undefined && cwdProject !== null) {
    const explicit = resolveProject(
      db,
      explicitProjectRef,
      explicitWorkspace ?? requireWorkspace(db, cwdProject.workspaceId),
    );
    if (explicit.id !== cwdProject.projectId) {
      throw inputError("--project", "conflicts with the Project derived from --cwd");
    }
  }
  const projectRef = explicitProjectRef ?? cwdProject?.projectId;
  if (projectRef !== undefined) {
    const project = resolveProject(db, projectRef, explicitWorkspace);
    return {
      context: Object.freeze({
        kind: "scope",
        workspaceId: project.workspaceId,
        projectId: project.id,
      }),
      labels: { workspaceSlug: project.workspaceSlug, projectSlug: project.slug },
    };
  }

  const workspace = explicitWorkspace ?? inferOnlyWorkspace(db);
  return {
    context: Object.freeze({ kind: "scope", workspaceId: workspace.id }),
    labels: { workspaceSlug: workspace.slug },
  };
}

function resolveSessionScope(
  db: Database,
  sessionId: string,
  explicit: {
    workspaceRef?: string;
    workspace?: WorkspaceRef;
    projectRef?: string;
    cwdProjectId?: string;
  },
): ResolvedCommandScope {
  const session = db
    .query<
      { workspaceId: string; projectId: string | null; endedAt: number | null },
      [string]
    >(
      `SELECT workspace_id AS workspaceId, project_id AS projectId,
              ended_at AS endedAt
       FROM agent_sessions WHERE id = ?`,
    )
    .get(sessionId);
  if (!session || session.endedAt !== null) {
    throw inputError("--session", "expected an existing active Agent Session");
  }
  const workspace = requireWorkspace(db, session.workspaceId);
  const project = session.projectId === null
    ? null
    : findProjectRefById(db, session.projectId);
  const bound = sessionScopeLabel(sessionId, workspace, project, session.projectId);

  if (explicit.workspace !== undefined && explicit.workspace.id !== workspace.id) {
    throw inputError(
      "--workspace",
      `Workspace ${quoteRef(explicit.workspaceRef ?? explicit.workspace.id)} ` +
        `(${explicit.workspace.id}) ${SESSION_CONFLICT}: ${bound}. ` +
        "Drop --workspace to use the Session's Workspace, or drop --session and pass the Workspace explicitly",
    );
  }
  if (explicit.projectRef !== undefined) {
    const named = sessionProjectCandidate(db, explicit.projectRef, workspace.id);
    if (named?.id !== session.projectId) {
      const resolved = named ? ` (${named.id})` : "";
      throw inputError(
        "--project",
        `Project ${quoteRef(explicit.projectRef)}${resolved} ${SESSION_CONFLICT}: ${bound}. ` +
          (project
            ? `Pass ${plainRef(project.slug)} or ${project.id}, or drop --session and pass the Project explicitly`
            : "Drop the Project, or drop --session and pass the Project explicitly"),
      );
    }
  }
  if (explicit.cwdProjectId !== undefined && explicit.cwdProjectId !== session.projectId) {
    throw inputError(
      "--cwd",
      `the Project of the current directory (${explicit.cwdProjectId}) ${SESSION_CONFLICT}: ${bound}`,
    );
  }
  return {
    context: Object.freeze({
      kind: "session",
      sessionId,
      workspaceId: session.workspaceId,
      ...(session.projectId === null ? {} : { projectId: session.projectId }),
    }),
    labels: {
      workspaceSlug: workspace.slug,
      ...(project ? { projectSlug: project.slug } : {}),
    },
  };
}

const SESSION_CONFLICT = "conflicts with the immutable Agent Session scope";

function sessionScopeLabel(
  sessionId: string,
  workspace: WorkspaceRef,
  project: ProjectRef | null,
  projectId: string | null,
): string {
  const scope = project
    ? `Workspace ${describeWorkspace(workspace)} and Project ${plainRef(project.slug)} (${project.id})`
    : projectId !== null
      ? `Workspace ${describeWorkspace(workspace)} and Project ${projectId}`
      : `Workspace ${describeWorkspace(workspace)} with no Project`;
  return `Session ${sessionId} is bound to ${scope}`;
}

/** The Project a reference names from inside a Session's Workspace. */
function sessionProjectCandidate(
  db: Database,
  ref: string,
  workspaceId: string,
): ProjectRef | undefined {
  const matches = findProjectRefs(db, ref);
  return matches.find((project) => project.id === ref) ??
    matches.find((project) => project.workspaceId === workspaceId) ??
    matches[0];
}

function requireWorkspace(db: Database, ref: string): WorkspaceRef {
  const workspace = findWorkspaceRef(db, ref);
  if (workspace) return workspace;
  throw inputError(
    "--workspace",
    `Workspace not found: ${quoteRef(ref)}. ${workspaceChoices(db)}`,
  );
}

/**
 * Exactly one Project for an id or slug, optionally inside an explicit
 * Workspace. Ambiguity and misses list the candidates instead of guessing.
 */
function resolveProject(
  db: Database,
  ref: string,
  workspace: WorkspaceRef | undefined,
): ProjectRef {
  const matches = findProjectRefs(db, ref);
  const exact = matches.find((project) => project.id === ref);
  if (exact) {
    if (workspace !== undefined && exact.workspaceId !== workspace.id) {
      throw inputError(
        "--workspace",
        `Project ${describeProject(exact)} is not in Workspace ${describeWorkspace(workspace)}. ` +
          `Example: --workspace ${exact.workspaceId}, or drop --workspace`,
      );
    }
    return exact;
  }
  const scoped = workspace === undefined
    ? matches
    : matches.filter((project) => project.workspaceId === workspace.id);
  if (scoped.length === 1) return scoped[0]!;
  if (scoped.length > 1) {
    throw inputError(
      "--project",
      `Project ${quoteRef(ref)} is ambiguous: it matches ${scoped.length} Projects: ` +
        `${describeChoices(scoped.map(describeProject))}. ` +
        `Pass the Project id (example: ${scoped[0]!.id}) or add --workspace <id|slug>`,
    );
  }
  if (workspace !== undefined && matches.length > 0) {
    throw inputError(
      "--workspace",
      `Project ${quoteRef(ref)} is not in Workspace ${describeWorkspace(workspace)}; ` +
        `it exists as ${describeChoices(matches.map(describeProject))}. ` +
        `Example: --workspace ${matches[0]!.workspaceId}`,
    );
  }
  throw inputError(
    "--project",
    `Project not found: ${quoteRef(ref)}. ${projectChoices(db, workspace)}`,
  );
}

function workspaceChoices(db: Database): string {
  const workspaces = listWorkspaceRefs(db);
  if (workspaces.length === 0) return "No Workspace exists yet: run `ralphy workspace create <name>`";
  return `Workspaces (id or slug): ${describeChoices(
    workspaces.map(describeWorkspace),
    countWorkspaces(db),
  )}. Example: --workspace ${workspaces[0]!.id}`;
}

function projectChoices(db: Database, workspace: WorkspaceRef | undefined): string {
  const projects = listProjectRefs(db, workspace?.id);
  const where = workspace ? ` in Workspace ${plainRef(workspace.slug)}` : "";
  if (projects.length === 0) {
    return `No Project exists${where}: run \`ralphy project create <name>${
      workspace ? ` --workspace ${workspace.id}` : ""
    }\``;
  }
  return `Recent Projects${where} (id or slug): ${describeChoices(
    projects.map(describeProject),
    countProjects(db, workspace?.id),
  )}. List all with \`ralphy project list --workspace <id|slug>\``;
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

function inferOnlyWorkspace(db: Database): WorkspaceRef {
  const rows = listWorkspaceRefs(db, 2);
  if (rows.length === 0) throw inputError("--workspace", "no Workspace exists");
  if (rows.length > 1) {
    throw inputError(
      "--workspace",
      "more than one Workspace exists; pass an explicit Workspace or Agent Session. " +
        workspaceChoices(db),
    );
  }
  return rows[0]!;
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
