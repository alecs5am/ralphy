import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { newDomainId } from "../store/ids.js";
import {
  isLegacyControlName,
  legacyRegistryPaths,
  normalizeRelativePath,
} from "./legacy.js";
import type {
  MigrationAudit,
  MigrationAuditInput,
  MigrationContext,
  MigrationDisposition,
  MigrationEntryKind,
  MigrationIssue,
  MigrationLock,
  MigrationPhase,
  MigrationSourceKind,
  MigrationSourceRoot,
  MigrationStatus,
} from "./types.js";

const MAX_CONTROL_HASH_BYTES = 1_048_576;
const MEDIA_EXTENSIONS = new Set([
  ".aac", ".avi", ".gif", ".jpeg", ".jpg", ".m4a", ".mkv", ".mov",
  ".mp3", ".mp4", ".ogg", ".png", ".svg", ".wav", ".webm", ".webp", ".zip",
]);
export function sourceLocatorHash(sourceKind: MigrationSourceKind, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  return createHash("sha256").update(`${sourceKind}\0${normalized}`, "utf8").digest("hex");
}

export function auditMigration(input: MigrationAuditInput): MigrationAudit {
  const roots = canonicalRoots(input.sourceRoots);
  const blockers: MigrationIssue[] = [];
  let sourceEntries = 0;
  let sourceFiles = 0;
  let sourceBytes = 0;
  const physicalProjects = new Set<string>();
  const registryProjects = new Set<string>();
  let workspaces = 0;
  for (const root of roots) {
    const stat = lstatSafe(root.path, blockers, root.kind);
    if (!stat) continue;
    const counts = walkReadOnly(root.path, root.kind, blockers);
    sourceEntries += counts.entries;
    sourceFiles += counts.files;
    sourceBytes += counts.bytes;
    const layout = discoverProjects(root.path, root.kind, blockers);
    workspaces += layout.workspaces;
    for (const project of layout.physicalProjects) physicalProjects.add(project);
    for (const project of layout.registryProjects) registryProjects.add(project);
  }
  const statfs = (fs as unknown as { statfsSync?: (value: string) => { bavail: number; bsize: number } }).statfsSync;
  let freeBytes = 0;
  try {
    const stats = statfs?.(roots[0]?.path ?? process.cwd());
    freeBytes = stats ? Math.max(0, stats.bavail * stats.bsize) : 0;
  } catch {
    blockers.push(issue("MIGRATION_SPACE_UNKNOWN", "review", { detail: "filesystem free-space probe unavailable" }));
  }
  const physicalOnlyProjects = [...physicalProjects].filter((id) => !registryProjects.has(id)).sort();
  const registryOnlyProjects = [...registryProjects].filter((id) => !physicalProjects.has(id)).sort();
  return {
    sourceEntries,
    sourceFiles,
    sourceBytes,
    workspaces,
    physicalProjects: physicalProjects.size,
    registryProjects: registryProjects.size,
    physicalOnlyProjects,
    registryOnlyProjects,
    cloneSupport: "not-probed",
    freeBytes,
    blockers,
  };
}

export function inventoryLegacySource(ctx: MigrationContext): {
  sourceEntries: number;
  sourceFiles: number;
  sourceBytes: number;
  inventoryDigest: string;
} {
  const run = ctx.db.query<{ phase: MigrationPhase }, [string]>(
    "SELECT phase FROM migration_runs WHERE id = ?",
  ).get(ctx.runId);
  if (!run) throw new Error("Migration Run not found");
  if (run.phase !== "audited" && run.phase !== "inventory") throw new Error("Migration Run is not resumable for inventory");
  const rows: Array<{ locator: string; kind: string; bytes: number; mtime: number; sha: string | null }> = [];
  const now = Date.now();
  const txn = ctx.db.transaction(() => {
    for (const source of ctx.sourceRoots) {
      const stat = lstatRequired(source.path);
      const sourceId = newDomainId("mig");
      const canonicalHash = sha256(fs.realpathSync(source.path));
      ctx.db.prepare(
        `INSERT INTO migration_sources
         (id, migration_run_id, source_kind, source_label, canonical_path_hash,
          source_device, source_inode, source_mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(sourceId, ctx.runId, source.kind, source.id, canonicalHash, String(source.device), String(source.inode), stat.mode, now);
      walkInventory(ctx, source, sourceId, rows);
    }
    const digest = sha256(rows
      .sort((left, right) => left.locator.localeCompare(right.locator))
      .map((row) => `${row.locator}\0${row.kind}\0${row.bytes}\0${row.mtime}\0${row.sha ?? ""}`)
      .join("\n"));
    ctx.db.prepare(
      `UPDATE migration_runs
       SET phase = 'inventory', source_entry_count = ?, source_file_count = ?, source_bytes = ?,
           inventory_completed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(rows.length, rows.filter((row) => row.kind !== "directory").length, rows.reduce((total, row) => total + row.bytes, 0), now, now, ctx.runId);
    return digest;
  });
  const digest = txn.immediate();
  return {
    sourceEntries: rows.length,
    sourceFiles: rows.filter((row) => row.kind !== "directory").length,
    sourceBytes: rows.reduce((total, row) => total + row.bytes, 0),
    inventoryDigest: digest,
  };
}

export function acquireMaintenanceLock(input: {
  sourcePath: string;
  runId: string;
  nonce?: string;
}): MigrationLock {
  const sourcePath = canonicalSource(input.sourcePath);
  const sourceStat = lstatRequired(sourcePath);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error("Migration source must be a real directory");
  const lockPath = path.join(path.dirname(sourcePath), ".ralphy-migration.lock");
  const lock: MigrationLock = {
    path: lockPath,
    runId: input.runId,
    nonce: input.nonce ?? randomUUID(),
    sourcePath,
    sourceDevice: String(sourceStat.dev),
    sourceInode: String(sourceStat.ino),
    pid: process.pid,
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
    createdAt: Date.now(),
  };
  const fd = fs.openSync(lockPath, "wx", 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(lock)}\n`, { encoding: "utf8" });
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return lock;
}

export function releaseMaintenanceLock(lock: MigrationLock): void {
  const current = readLock(lock.path);
  if (!current || current.runId !== lock.runId || current.nonce !== lock.nonce) {
    throw new Error("Migration lock identity does not match");
  }
  fs.unlinkSync(lock.path);
}

export function readMigrationStatus(db: MigrationContext["db"], runId: string): MigrationStatus | null {
  const row = db.query<{
    phase: MigrationPhase;
    sourceEntryCount: number;
    sourceFileCount: number;
    sourceBytes: number;
    updatedAt: number;
  }, [string]>(
    `SELECT phase, source_entry_count AS sourceEntryCount, source_file_count AS sourceFileCount,
            source_bytes AS sourceBytes, updated_at AS updatedAt
     FROM migration_runs WHERE id = ?`,
  ).get(runId);
  if (!row) return null;
  const blockers = db.query<{ count: number }, [string]>(
    "SELECT COUNT(*) AS count FROM migration_issues WHERE migration_run_id = ? AND severity = 'block' AND resolved_at IS NULL",
  ).get(runId)?.count ?? 0;
  return { runId, phase: row.phase, sourceEntryCount: row.sourceEntryCount, sourceFileCount: row.sourceFileCount, sourceBytes: row.sourceBytes, blockingIssues: blockers, updatedAt: row.updatedAt };
}

export function createMigrationSourceRoot(input: {
  id: string;
  kind: MigrationSourceKind;
  path: string;
}): MigrationSourceRoot {
  const canonical = canonicalSource(input.path);
  const stat = lstatRequired(canonical);
  if (stat.isSymbolicLink()) throw new Error("Migration source cannot be a symlink");
  return { id: input.id, kind: input.kind, path: canonical, device: BigInt(stat.dev), inode: BigInt(stat.ino) };
}

function canonicalRoots(inputs: MigrationAuditInput["sourceRoots"]): MigrationSourceRoot[] {
  const roots = inputs.map((input) => createMigrationSourceRoot({ id: input.kind, ...input }));
  for (let index = 0; index < roots.length; index += 1) {
    for (let other = index + 1; other < roots.length; other += 1) {
      if (roots[index]!.path === roots[other]!.path || roots[index]!.path.startsWith(`${roots[other]!.path}${path.sep}`) || roots[other]!.path.startsWith(`${roots[index]!.path}${path.sep}`)) {
        throw new Error("Migration source roots overlap");
      }
    }
  }
  return roots;
}

function walkReadOnly(root: string, kind: MigrationSourceKind, blockers: MigrationIssue[]) {
  let entries = 0;
  let files = 0;
  let bytes = 0;
  const visit = (current: string) => {
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      blockers.push(issue("MIGRATION_SOURCE_UNREADABLE", "block", { kind }));
      return;
    }
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, child.name);
      const stat = lstatSafe(absolute, blockers, kind);
      if (!stat) continue;
      entries += 1;
      if (stat.isDirectory()) visit(absolute);
      else {
        files += 1;
        bytes += stat.isFile() ? stat.size : 0;
      }
    }
  };
  visit(root);
  return { entries, files, bytes };
}

function walkInventory(
  ctx: MigrationContext,
  source: MigrationSourceRoot,
  sourceId: string,
  rows: Array<{ locator: string; kind: string; bytes: number; mtime: number; sha: string | null }>,
): void {
  const visit = (absolute: string, relative: string) => {
    const stat = fs.lstatSync(absolute);
    const kind = entryKind(stat);
    const locator = sourceLocatorHash(source.kind, relative);
    const disposition = classifyDisposition(relative, kind);
    const state = disposition === "issue" ? "issue" : "inventoried";
    const bytes = stat.isFile() ? stat.size : 0;
    const sha = stat.isFile() && bytes <= MAX_CONTROL_HASH_BYTES && disposition !== "secret-recovery-only"
      ? sha256(fs.readFileSync(absolute))
      : null;
    const now = Date.now();
    const entryId = newDomainId("mentry");
    ctx.db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, sha256, state, error_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entryId, ctx.runId, sourceId, relative, locator, kind, source.kind,
      disposition, String(stat.dev), String(stat.ino), stat.mode, bytes, Math.max(0, Math.trunc(stat.mtimeMs)), sha,
      state, disposition === "issue" ? "MIGRATION_UNKNOWN_ENTRY" : null, now, now,
    );
    if (disposition === "issue") {
      ctx.db.prepare(
        `INSERT INTO migration_issues
         (id, migration_run_id, migration_entry_id, code, severity, detail_json, created_at)
         VALUES (?, ?, ?, 'MIGRATION_UNKNOWN_ENTRY', 'block', ?, ?)`,
      ).run(newDomainId("miss"), ctx.runId, entryId, JSON.stringify({ sourcePath: relative, entryKind: kind }), now);
    }
    rows.push({ locator, kind, bytes, mtime: Math.max(0, Math.trunc(stat.mtimeMs)), sha });
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(absolute, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
        visit(path.join(absolute, child.name), `${relative}/${child.name}`);
      }
    }
  };
  for (const child of fs.readdirSync(source.path, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    visit(path.join(source.path, child.name), child.name);
  }
}

function discoverProjects(root: string, kind: MigrationSourceKind, blockers: MigrationIssue[]) {
  const workspacesRoot = kind === "ralphy" && path.basename(root) === ".ralphy"
    ? path.join(root, "workspaces")
    : path.join(root, "projects");
  const physicalProjects = new Set<string>();
  let workspaces = 0;
  try {
    const workspaceEntries = fs.readdirSync(workspacesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    workspaces = kind === "ralphy" && path.basename(root) === ".ralphy" ? workspaceEntries.length : 1;
    for (const workspace of workspaceEntries) {
      const projectsRoot = kind === "ralphy" && path.basename(root) === ".ralphy"
        ? path.join(workspacesRoot, workspace.name, "projects")
        : workspacesRoot;
      for (const project of fs.readdirSync(projectsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
        physicalProjects.add(project.name);
      }
    }
  } catch {
    // A source without projects is a valid empty source.
  }
  const registryProjects = new Set<string>();
  for (const candidate of legacyRegistryPaths(root)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as Record<string, unknown>;
      const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
      for (const project of projects) {
        if (typeof project === "string") registryProjects.add(project);
        else if (project && typeof project === "object" && typeof (project as Record<string, unknown>).id === "string") registryProjects.add((project as Record<string, string>).id);
      }
    } catch {
      // Registry is optional; malformed registry is reported by semantic import.
    }
  }
  return { workspaces, physicalProjects, registryProjects };
}

function classifyDisposition(relative: string, kind: MigrationEntryKind): MigrationDisposition {
  if (kind !== "file") return kind === "directory" ? "system" : "issue";
  const basename = path.posix.basename(relative).toLowerCase();
  if (basename === ".ds_store") return "system";
  if (relative.split("/").some((part) => part === "secrets" || part.includes("cookie"))) return "secret-recovery-only";
  if (relative.split("/").some((part) => part === "cache" || part === "tmp")) return "cache";
  if (isLegacyControlName(basename) || [".json", ".jsonl", ".md", ".markdown", ".txt", ".yaml", ".yml"].some((suffix) => basename.endsWith(suffix))) return "domain";
  if (MEDIA_EXTENSIONS.has(path.posix.extname(basename))) return "object";
  return "issue";
}

function entryKind(stat: fs.Stats): MigrationEntryKind {
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isSocket()) return "socket";
  if (stat.isFIFO()) return "fifo";
  return "other";
}

function canonicalSource(value: string): string {
  if (!path.isAbsolute(value)) throw new Error("Migration source must be absolute");
  return fs.realpathSync(value);
}

function lstatRequired(value: string): fs.Stats {
  const stat = fs.lstatSync(value);
  if (stat.isSymbolicLink()) throw new Error("Migration source traversal encountered a symlink");
  return stat;
}

function lstatSafe(value: string, blockers: MigrationIssue[], kind: MigrationSourceKind): fs.Stats | null {
  try {
    const stat = fs.lstatSync(value);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      blockers.push(issue("MIGRATION_UNSAFE_ENTRY", "block", { kind, entryKind: entryKind(stat) }));
    }
    return stat;
  } catch {
    blockers.push(issue("MIGRATION_SOURCE_UNREADABLE", "block", { kind }));
    return null;
  }
}

function readLock(lockPath: string): MigrationLock | null {
  try {
    const stat = fs.lstatSync(lockPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const parsed = JSON.parse(fs.readFileSync(lockPath, "utf8")) as MigrationLock;
    return parsed && typeof parsed.runId === "string" && typeof parsed.nonce === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function issue(code: string, severity: MigrationIssue["severity"], detail: Record<string, unknown>): MigrationIssue {
  return { code, severity, detail };
}
