import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
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
  const jobStatusCounts: Record<string, number> = {};
  const desktopCandidates = { reviews: 0, secrets: 0, settings: 0 };
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
    if (root.kind === "ralphy") mergeCounts(jobStatusCounts, readJobStatusCounts(root.path, blockers));
    if (root.kind === "desktop") countDesktopCandidates(root.path, desktopCandidates);
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
  const safetyBytes = Math.max(2 * 1024 ** 3, Math.ceil(sourceBytes * 0.1));
  const requiredCopyBytes = sourceBytes + safetyBytes;
  if (freeBytes < requiredCopyBytes) {
    blockers.push(issue("MIGRATION_COPY_SPACE_INSUFFICIENT", "review", {
      freeBytes,
      requiredCopyBytes,
    }));
  }
  const processScan = scanMigrationProcesses(roots.map((root) => root.path));
  const processes = processScan.status === "ok" ? processScan.processes : [];
  if (processScan.status === "unknown") {
    blockers.push(issue("MIGRATION_PROCESS_SCAN_UNKNOWN", "block", { reason: processScan.reason }));
  }
  for (const process of processes) {
    blockers.push(issue("MIGRATION_WRITER_ACTIVE", "block", process));
  }
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
    requiredCopyBytes,
    jobStatusCounts,
    desktopCandidates,
    processes,
    blockers,
  };
}

type InventoryResult = {
  sourceEntries: number;
  sourceFiles: number;
  sourceBytes: number;
  inventoryDigest: string;
};

type InventoryScanRow = {
  relative: string;
  locator: string;
  kind: MigrationEntryKind;
  disposition: MigrationDisposition;
  device: string;
  inode: string;
  mode: number;
  bytes: number;
  mtime: number;
  sha: string | null;
};

export async function inventoryLegacySource(ctx: MigrationContext): Promise<InventoryResult> {
  const run = ctx.db.query<{ phase: MigrationPhase }, [string]>(
    "SELECT phase FROM migration_runs WHERE id = ?",
  ).get(ctx.runId);
  if (!run) throw new Error("Migration Run not found");
  if (run.phase !== "audited" && run.phase !== "inventory") throw new Error("Migration Run is not resumable for inventory");
  const sources = validateContextRoots(ctx.sourceRoots);
  requireCurrentMaintenanceLock(sources, ctx.runId);
  const scans = await Promise.all(sources.map(async (source) => ({
    source,
    rows: await scanInventorySource(source),
  })));
  for (const { source } of scans) assertSourceIdentity(source);
  const existing = ctx.db.query<{
    id: string;
    sourceKind: MigrationSourceKind;
    sourceLabel: string;
    canonicalPathHash: string;
    sourceDevice: string;
    sourceInode: string;
    sourceMode: number;
    inventoryDigest: string | null;
  }, [string]>(
    `SELECT id, source_kind AS sourceKind, source_label AS sourceLabel,
            canonical_path_hash AS canonicalPathHash, source_device AS sourceDevice,
            source_inode AS sourceInode, source_mode AS sourceMode,
            inventory_digest AS inventoryDigest
     FROM migration_sources WHERE migration_run_id = ? ORDER BY id`,
  ).all(ctx.runId);
  if (existing.length > 0) return replayInventory(ctx, scans, existing);
  const now = Date.now();
  const txn = ctx.db.transaction(() => {
    const sourceDigests: Array<{ kind: MigrationSourceKind; canonicalHash: string; digest: string }> = [];
    for (const { source, rows } of scans) {
      const stat = fs.lstatSync(source.path);
      const sourceId = newDomainId("mig");
      const canonicalHash = sha256(fs.realpathSync(source.path));
      ctx.db.prepare(
        `INSERT INTO migration_sources
         (id, migration_run_id, source_kind, source_label, canonical_path_hash,
          source_device, source_inode, source_mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(sourceId, ctx.runId, source.kind, source.id, canonicalHash, String(source.device), String(source.inode), stat.mode, now);
      insertInventoryRows(ctx, source, sourceId, rows, now);
      const digest = inventoryRowsDigest(rows);
      ctx.db.prepare("UPDATE migration_sources SET inventory_digest = ? WHERE id = ?")
        .run(digest, sourceId);
      sourceDigests.push({ kind: source.kind, canonicalHash, digest });
    }
    const allRows = scans.flatMap((scan) => scan.rows);
    ctx.db.prepare(
      `UPDATE migration_runs
       SET phase = 'inventory', source_entry_count = ?, source_file_count = ?, source_bytes = ?,
           inventory_completed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(
      allRows.length,
      allRows.filter((row) => row.kind === "file").length,
      allRows.reduce((total, row) => total + row.bytes, 0),
      now,
      now,
      ctx.runId,
    );
    return overallInventoryDigest(sourceDigests);
  });
  const digest = txn.immediate();
  const rows = scans.flatMap((scan) => scan.rows);
  return {
    sourceEntries: rows.length,
    sourceFiles: rows.filter((row) => row.kind === "file").length,
    sourceBytes: rows.reduce((total, row) => total + row.bytes, 0),
    inventoryDigest: digest,
  };
}

export function acquireMaintenanceLock(input: {
  sourcePath: string;
  runId: string;
  nonce?: string;
  reclaim?: "resume" | "recover" | "rollback";
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
    processStartIdentity: processStartIdentity(process.pid),
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
    createdAt: Date.now(),
  };
  const guard = acquireLockMutationGuard(lockPath);
  try {
    const snapshot = readLockSnapshot(lockPath);
    if (!snapshot) {
      if (fs.existsSync(lockPath)) throw new Error("Migration maintenance lock is invalid");
      writeLockFile(lock);
      return lock;
    }
    const existing = snapshot.lock;
    if (
      !input.reclaim
      || existing.runId !== input.runId
      || existing.sourcePath !== sourcePath
      || existing.sourceDevice !== String(sourceStat.dev)
      || existing.sourceInode !== String(sourceStat.ino)
      || existing.uid !== (typeof process.getuid === "function" ? process.getuid() : 0)
      || !["absent", "different"].includes(lockOwnerState(existing))
    ) {
      throw new Error("Migration maintenance lock is already held");
    }
    const current = readLockSnapshot(lockPath);
    if (
      !current
      || current.device !== snapshot.device
      || current.inode !== snapshot.inode
      || !sameLockIdentity(current.lock, snapshot.lock)
    ) throw new Error("Migration maintenance lock changed during reclaim");
    fs.unlinkSync(lockPath);
    writeLockFile(lock);
    return lock;
  } finally {
    releaseLockMutationGuard(guard);
  }
}

export function releaseMaintenanceLock(lock: MigrationLock): void {
  const guard = acquireLockMutationGuard(lock.path);
  try {
    const current = readLock(lock.path);
    if (!current || !sameLockIdentity(current, lock)) {
      throw new Error("Migration lock identity does not match");
    }
    fs.unlinkSync(lock.path);
    fsyncDirectory(path.dirname(lock.path));
  } finally {
    releaseLockMutationGuard(guard);
  }
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
      const stat = lstatSafe(absolute, blockers, kind, true);
      if (!stat) continue;
      entries += 1;
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) {
        files += 1;
        bytes += stat.size;
      }
    }
  };
  visit(root);
  return { entries, files, bytes };
}

async function scanInventorySource(source: MigrationSourceRoot): Promise<InventoryScanRow[]> {
  const rows: InventoryScanRow[] = [];
  const visit = async (directory: string, parentRelative: string): Promise<void> => {
    const handle = await fs.promises.opendir(directory);
    const names: string[] = [];
    for await (const child of handle) names.push(child.name);
    names.sort((left, right) => left.localeCompare(right));
    for (const name of names) {
      const relative = normalizeRelativePath(parentRelative ? `${parentRelative}/${name}` : name);
      const absolute = path.resolve(source.path, ...relative.split("/"));
      if (absolute === source.path || !absolute.startsWith(`${source.path}${path.sep}`)) {
        throw new Error("Migration entry escaped its exact source root");
      }
      const stat = await fs.promises.lstat(absolute);
      const kind = entryKind(stat);
      const disposition = classifyDisposition(relative, kind);
      const bytes = stat.isFile() ? stat.size : 0;
      const sha = stat.isFile() && disposition === "domain" && bytes <= MAX_CONTROL_HASH_BYTES
        ? sha256(await fs.promises.readFile(absolute))
        : null;
      rows.push({
        relative,
        locator: sourceLocatorHash(source.kind, relative),
        kind,
        disposition,
        device: String(stat.dev),
        inode: String(stat.ino),
        mode: stat.mode,
        bytes,
        mtime: Math.max(0, Math.trunc(stat.mtimeMs)),
        sha,
      });
      if (stat.isDirectory()) await visit(absolute, relative);
    }
  };
  await visit(source.path, "");
  return rows;
}

function insertInventoryRows(
  ctx: MigrationContext,
  source: MigrationSourceRoot,
  sourceId: string,
  rows: readonly InventoryScanRow[],
  now: number,
): void {
  for (const row of rows) {
    const { relative, locator, kind, disposition, device, inode, mode, bytes, mtime, sha } = row;
    const state = disposition === "issue" ? "issue" : "inventoried";
    const entryId = newDomainId("mentry");
    ctx.db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, sha256, state, error_code, terminal_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entryId, ctx.runId, sourceId, relative, locator, kind, source.kind,
      disposition, device, inode, mode, bytes, mtime, sha,
      state, disposition === "issue" ? "MIGRATION_UNKNOWN_ENTRY" : null,
      disposition === "issue" ? now : null, now, now,
    );
    if (disposition === "issue") {
      ctx.db.prepare(
        `INSERT INTO migration_issues
         (id, migration_run_id, migration_entry_id, code, severity, detail_json, created_at)
         VALUES (?, ?, ?, 'MIGRATION_UNKNOWN_ENTRY', 'block', ?, ?)`,
      ).run(newDomainId("miss"), ctx.runId, entryId, JSON.stringify({ sourcePath: relative, entryKind: kind }), now);
    }
  }
}

function inventoryRowsDigest(rows: readonly InventoryScanRow[]): string {
  return sha256([...rows]
    .sort((left, right) => left.relative.localeCompare(right.relative))
    .map((row) => [
      row.locator, row.kind, row.disposition, row.device, row.inode,
      row.mode, row.bytes, row.mtime, row.sha ?? "",
    ].join("\0"))
    .join("\n"));
}

function overallInventoryDigest(sources: readonly { kind: MigrationSourceKind; canonicalHash: string; digest: string }[]): string {
  return sha256([...sources]
    .sort((left, right) => left.canonicalHash.localeCompare(right.canonicalHash) || left.kind.localeCompare(right.kind))
    .map((source) => `${source.kind}\0${source.canonicalHash}\0${source.digest}`)
    .join("\n"));
}

function replayInventory(
  ctx: MigrationContext,
  scans: readonly { source: MigrationSourceRoot; rows: InventoryScanRow[] }[],
  existing: readonly {
    id: string;
    sourceKind: MigrationSourceKind;
    sourceLabel: string;
    canonicalPathHash: string;
    sourceDevice: string;
    sourceInode: string;
    sourceMode: number;
    inventoryDigest: string | null;
  }[],
): InventoryResult {
  if (existing.length !== scans.length) throw new Error("Migration source bindings do not match the inventoried Run");
  const digests: Array<{ kind: MigrationSourceKind; canonicalHash: string; digest: string }> = [];
  for (const { source, rows } of scans) {
    const canonicalHash = sha256(source.path);
    const matched = existing.find((candidate) => (
      candidate.sourceKind === source.kind
      && candidate.sourceLabel === source.id
      && candidate.canonicalPathHash === canonicalHash
      && candidate.sourceDevice === String(source.device)
      && candidate.sourceInode === String(source.inode)
      && candidate.sourceMode === fs.lstatSync(source.path).mode
    ));
    if (!matched?.inventoryDigest) throw new Error("Migration source bindings do not match the inventoried Run");
    const digest = inventoryRowsDigest(rows);
    if (digest !== matched.inventoryDigest) throw new Error("Migration source changed after inventory");
    digests.push({ kind: source.kind, canonicalHash, digest });
  }
  const status = readMigrationStatus(ctx.db, ctx.runId);
  if (!status || status.phase !== "inventory") throw new Error("Migration inventory replay is incomplete");
  return {
    sourceEntries: status.sourceEntryCount,
    sourceFiles: status.sourceFileCount,
    sourceBytes: status.sourceBytes,
    inventoryDigest: overallInventoryDigest(digests),
  };
}

function validateContextRoots(roots: readonly MigrationSourceRoot[]): MigrationSourceRoot[] {
  if (roots.length === 0) throw new Error("Migration requires at least one source root");
  const validated = roots.map((source) => {
    assertSourceIdentity(source);
    return { ...source, path: fs.realpathSync(source.path) };
  });
  for (let index = 0; index < validated.length; index += 1) {
    for (let other = index + 1; other < validated.length; other += 1) {
      const left = validated[index]!;
      const right = validated[other]!;
      if (
        (left.device === right.device && left.inode === right.inode)
        || left.path.startsWith(`${right.path}${path.sep}`)
        || right.path.startsWith(`${left.path}${path.sep}`)
      ) throw new Error("Migration source roots overlap");
    }
  }
  return validated;
}

function assertSourceIdentity(source: MigrationSourceRoot): void {
  const stat = fs.lstatSync(source.path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Migration source must remain a real directory");
  if (stat.dev !== source.device || stat.ino !== source.inode || fs.realpathSync(source.path) !== source.path) {
    throw new Error("Migration source identity changed");
  }
}

function discoverProjects(root: string, kind: MigrationSourceKind, blockers: MigrationIssue[]) {
  const workspacesRoot = kind === "ralphy" && path.basename(root) === ".ralphy"
    ? path.join(root, "workspaces")
    : path.join(root, "projects");
  const physicalProjects = new Set<string>();
  let workspaces = 0;
  try {
    const isCurrentLayout = kind === "ralphy" && path.basename(root) === ".ralphy";
    const workspaceEntries = isCurrentLayout
      ? fs.readdirSync(workspacesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      : fs.existsSync(workspacesRoot) ? [{ name: "default" }] : [];
    workspaces = workspaceEntries.length;
    for (const workspace of workspaceEntries) {
      const projectsRoot = isCurrentLayout
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
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      blockers.push(issue("MIGRATION_REGISTRY_UNREADABLE", "block", {
        kind,
        registry: path.basename(candidate),
      }));
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      blockers.push(issue("MIGRATION_REGISTRY_UNREADABLE", "block", {
        kind,
        registry: path.basename(candidate),
      }));
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as unknown;
      if (!isRecord(parsed)) throw new Error("Registry root is invalid");
      if (!Object.prototype.hasOwnProperty.call(parsed, "projects")) continue;
      for (const projectId of registryProjectIds(parsed.projects)) registryProjects.add(projectId);
    } catch {
      blockers.push(issue("MIGRATION_REGISTRY_UNREADABLE", "block", {
        kind,
        registry: path.basename(candidate),
      }));
    }
  }
  return { workspaces, physicalProjects, registryProjects };
}

function registryProjectIds(projects: unknown): string[] {
  if (Array.isArray(projects)) {
    return projects.map((project) => {
      if (validRegistryProjectId(project)) return project;
      if (isRecord(project) && validRegistryProjectId(project.id)) return project.id;
      throw new Error("Registry project array entry has no valid ID");
    });
  }
  if (!isRecord(projects)) throw new Error("Registry projects must be an array or object map");
  return Object.entries(projects).map(([projectId, project]) => {
    if (!validRegistryProjectId(projectId)) throw new Error("Registry project map key is invalid");
    if (isRecord(project) && Object.prototype.hasOwnProperty.call(project, "id")) {
      if (!validRegistryProjectId(project.id) || project.id !== projectId) {
        throw new Error("Registry project map key conflicts with its embedded ID");
      }
    }
    return projectId;
  });
}

function validRegistryProjectId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJobStatusCounts(root: string, blockers: MigrationIssue[]): Record<string, number> {
  const file = path.join(root, "jobs.db");
  if (!fs.existsSync(file)) return {};
  const sources = [file, `${file}-wal`, `${file}-shm`].filter((candidate) => fs.existsSync(candidate));
  const before = Object.fromEntries(sources.map((candidate) => [candidate, fileFingerprint(candidate)]));
  let db: Database | null = null;
  try {
    const wal = `${file}-wal`;
    if (fs.existsSync(wal) && fs.lstatSync(wal).size > 0) {
      for (const source of sources) {
        if (fileFingerprint(source) !== before[source]) throw new Error("Legacy jobs source changed during audit");
      }
      blockers.push(issue("MIGRATION_JOBS_WAL_UNMATERIALIZED", "block", { database: "jobs" }));
      return {};
    }
    const image = fs.readFileSync(file);
    normalizeSerializedJournalMode(image);
    db = Database.deserialize(image, { readonly: true });
    db.exec("PRAGMA query_only = ON");
    const rows = db.query<{ status: string; count: number }, []>(
      "SELECT status, COUNT(*) AS count FROM jobs GROUP BY status ORDER BY status",
    ).all();
    for (const source of sources) {
      if (fileFingerprint(source) !== before[source]) throw new Error("Legacy jobs source changed during audit");
    }
    return Object.fromEntries(rows.map((row) => [row.status, row.count]));
  } catch {
    blockers.push(issue("MIGRATION_JOBS_UNREADABLE", "block", { database: "jobs" }));
    return {};
  } finally {
    db?.close();
  }
}

function fileFingerprint(file: string): string {
  const stat = fs.lstatSync(file);
  return `${stat.dev}\0${stat.ino}\0${stat.mode}\0${stat.size}\0${stat.mtimeMs}\0${sha256(fs.readFileSync(file))}`;
}

function normalizeSerializedJournalMode(image: Buffer): void {
  if (image.subarray(0, 16).toString("binary") !== "SQLite format 3\0") return;
  if (image[18] === 2 && image[19] === 2) {
    image[18] = 1;
    image[19] = 1;
  }
}

function countDesktopCandidates(
  root: string,
  counts: { reviews: number; secrets: number; settings: number },
): void {
  const visit = (directory: string, relative: string): void => {
    for (const child of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, child.name);
      const childRelative = relative ? `${relative}/${child.name}` : child.name;
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute, childRelative);
      else if (stat.isFile()) {
        const parts = childRelative.toLowerCase().split("/");
        const basename = parts.at(-1)!;
        if (parts.some((part) => part === "reviews" || part === "review")) counts.reviews += 1;
        if (parts.some((part) => part === "safestorage" || part === "secrets") || /credential|cookie|token/.test(basename)) counts.secrets += 1;
        if (/^(state|settings|preferences|config)\.(json|jsonl)$/.test(basename)) counts.settings += 1;
      }
    }
  };
  visit(root, "");
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
}

export type MigrationProcess = { category: string; pid: number; count: number };
export type MigrationProcessScan =
  | { status: "ok"; processes: MigrationProcess[] }
  | { status: "unknown"; processes: []; reason: string };
export type MigrationProcessTools = {
  psPath?: string;
  lsofPath?: string;
  maxBuffer?: number;
};
let testProcessTools: MigrationProcessTools | null = null;

export function setMigrationProcessToolsForTesting(tools: MigrationProcessTools): () => void {
  if (process.env.NODE_ENV !== "test") throw new Error("Migration process test tools require the test runtime");
  const previous = testProcessTools;
  testProcessTools = tools;
  return () => {
    testProcessTools = previous;
  };
}

export function scanMigrationProcesses(
  roots: readonly string[],
  tools: MigrationProcessTools = {},
): MigrationProcessScan {
  tools = Object.keys(tools).length === 0 && testProcessTools ? testProcessTools : tools;
  const canonicalRoots = roots.map((root) => fs.realpathSync(root));
  const found = new Map<string, MigrationProcess>();
  const record = (category: string, pid: number): void => {
    if (pid === process.pid) return;
    const key = `${category}:${pid}`;
    const current = found.get(key);
    if (current) current.count += 1;
    else found.set(key, { category, pid, count: 1 });
  };
  const psPath = trustedProcessTool(tools.psPath, "/bin/ps");
  const lsofPath = trustedProcessTool(tools.lsofPath, "/usr/sbin/lsof");
  if (!psPath || !lsofPath) {
    return { status: "unknown", processes: [], reason: "process inspection tool unavailable" };
  }
  const maxBuffer = tools.maxBuffer ?? 64 * 1024 ** 2;
  const processes = spawnSync(psPath, ["-axo", "pid=,comm=,args="], {
    encoding: "utf8",
    env: process.env,
    maxBuffer,
  });
  if (processes.error || processes.signal || processes.status !== 0) {
    return { status: "unknown", processes: [], reason: "process listing failed" };
  }
  let parsedProcesses = 0;
  for (const line of processes.stdout.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    parsedProcesses += 1;
    const pid = Number(match[1]);
    const command = `${match[2]} ${match[3]}`.toLowerCase();
    const targetsRoot = canonicalRoots.some((root) => command.includes(root.toLowerCase()));
    const category = /ralphy\.app|ralphy-desktop|electron[^\n]*ralphy/.test(command) ? "desktop"
      : /ralphy[^\n]*(daemon|worker)/.test(command) ? "watcher"
        : targetsRoot && /(^|\s)(watchexec|entr)(\s|$)|chokidar|--watch/.test(command) ? "watcher"
          : targetsRoot && /ffmpeg|hyperframes|remotion|ralphy[^\n]*(generate|render)/.test(command) ? "generation"
            : targetsRoot && /ralphy[^\n]*publish|postiz/.test(command) ? "publishing"
            : null;
    if (category) record(category, pid);
  }
  if (parsedProcesses === 0) {
    return { status: "unknown", processes: [], reason: "process listing was invalid" };
  }
  const openFiles = spawnSync(lsofPath, ["-n", "-P", "-F", "pcfn"], {
    encoding: "utf8",
    env: process.env,
    maxBuffer,
  });
  if (openFiles.error || openFiles.signal || openFiles.status !== 0) {
    return { status: "unknown", processes: [], reason: "open-file inspection failed" };
  }
  let pid = 0;
  let descriptor = "";
  let parsedOwners = 0;
  for (const line of openFiles.stdout.split("\n")) {
    if (line.startsWith("p") && /^p\d+$/.test(line)) {
      pid = Number(line.slice(1));
      parsedOwners += 1;
    } else if (line.startsWith("f")) descriptor = line.slice(1);
    else if (line.startsWith("n") && pid !== process.pid) {
      const target = line.slice(1);
      if (canonicalRoots.some((root) => target === root || target.startsWith(`${root}${path.sep}`))) {
        record(descriptor === "cwd" ? "source-cwd" : "source-open-file", pid);
      }
    }
  }
  if (parsedOwners === 0) {
    return { status: "unknown", processes: [], reason: "open-file inspection was invalid" };
  }
  return {
    status: "ok",
    processes: [...found.values()].sort((left, right) => left.category.localeCompare(right.category) || left.pid - right.pid),
  };
}

export function assertMigrationQuiescent(
  roots: readonly string[],
  tools: MigrationProcessTools = {},
): void {
  const scan = scanMigrationProcesses(roots, tools);
  if (scan.status === "unknown") {
    throw new Error(`Migration quiescence is unknown: ${scan.reason}`);
  }
  if (scan.processes.length > 0) {
    throw new Error(`Migration source is not quiescent: ${JSON.stringify(scan.processes)}`);
  }
}

function requireCurrentMaintenanceLock(sources: readonly MigrationSourceRoot[], runId: string): void {
  const source = sources.find((candidate) => candidate.kind === "ralphy") ?? sources[0]!;
  const lock = readLock(path.join(path.dirname(source.path), ".ralphy-migration.lock"));
  if (
    !lock
    || lock.runId !== runId
    || lock.sourcePath !== source.path
    || lock.sourceDevice !== String(source.device)
    || lock.sourceInode !== String(source.inode)
    || lock.pid !== process.pid
    || lock.processStartIdentity !== processStartIdentity(process.pid)
    || lock.uid !== (typeof process.getuid === "function" ? process.getuid() : 0)
  ) throw new Error("Migration requires its exact live maintenance lock");
}

function processStartIdentity(pid: number): string {
  const inspection = inspectProcessStart(pid);
  if (inspection.status !== "present") throw new Error("Migration process-start identity is unavailable");
  return inspection.identity;
}

export type ProcessStartInspection =
  | { status: "present"; identity: string }
  | { status: "absent" }
  | { status: "unknown"; reason: string };

export function inspectProcessStart(pid: number, requestedPsPath?: string): ProcessStartInspection {
  const alive = processPresence(pid);
  if (alive !== "present") return alive === "absent"
    ? { status: "absent" }
    : { status: "unknown", reason: "process presence is unknown" };
  const psPath = trustedProcessTool(requestedPsPath ?? testProcessTools?.psPath, "/bin/ps");
  if (!psPath) return { status: "unknown", reason: "process-start tool unavailable" };
  const result = spawnSync(psPath, ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
    env: process.env,
  });
  const value = !result.error && !result.signal && result.status === 0 ? result.stdout.trim() : "";
  if (value) return { status: "present", identity: value };
  if (processPresence(pid) === "absent") return { status: "absent" };
  return { status: "unknown", reason: "process-start inspection failed" };
}

function lockOwnerState(lock: MigrationLock): "same" | "different" | "absent" | "unknown" {
  const inspection = inspectProcessStart(lock.pid);
  if (inspection.status === "absent") return "absent";
  if (inspection.status === "unknown") return "unknown";
  return inspection.identity === lock.processStartIdentity ? "same" : "different";
}

function processPresence(pid: number): "present" | "absent" | "unknown" {
  if (!Number.isSafeInteger(pid) || pid <= 0) return "unknown";
  try {
    process.kill(pid, 0);
    return "present";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return "absent";
    if (code === "EPERM") return "present";
    return "unknown";
  }
}

function trustedProcessTool(requested: string | undefined, fallback: string): string | null {
  const candidate = requested ?? fallback;
  if (!path.isAbsolute(candidate)) return null;
  try {
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

function sameLockIdentity(left: MigrationLock, right: MigrationLock): boolean {
  return left.path === right.path
    && left.runId === right.runId
    && left.nonce === right.nonce
    && left.sourcePath === right.sourcePath
    && left.sourceDevice === right.sourceDevice
    && left.sourceInode === right.sourceInode
    && left.pid === right.pid
    && left.processStartIdentity === right.processStartIdentity
    && left.uid === right.uid
    && left.createdAt === right.createdAt;
}

function fsyncDirectory(directory: string): void {
  const fd = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function classifyDisposition(relative: string, kind: MigrationEntryKind): MigrationDisposition {
  if (kind !== "file") return kind === "directory" ? "system" : "issue";
  const basename = path.posix.basename(relative).toLowerCase();
  if (basename === ".ds_store") return "system";
  if (relative.split("/").some((part) => part === "secrets" || part.includes("cookie"))) return "secret-recovery-only";
  if (relative.split("/").some((part) => part === "cache" || part === "tmp")) return "cache";
  if (/^(?:workspaces\/[^/]+\/projects\/[^/]+|projects\/[^/]+)\/composition\/[^/]+\.html$/iu.test(relative)) {
    return "object";
  }
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
  const resolved = path.resolve(value);
  assertNoSymlinkComponents(resolved);
  const canonical = fs.realpathSync(resolved);
  if (canonical !== resolved) throw new Error("Migration source or ancestor cannot be a symlink");
  return canonical;
}

function lstatRequired(value: string): fs.Stats {
  const stat = fs.lstatSync(value);
  if (stat.isSymbolicLink()) throw new Error("Migration source traversal encountered a symlink");
  return stat;
}

function lstatSafe(
  value: string,
  blockers: MigrationIssue[],
  kind: MigrationSourceKind,
  coverageEntry = false,
): fs.Stats | null {
  try {
    const stat = fs.lstatSync(value);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      blockers.push(issue(
        coverageEntry ? "MIGRATION_COVERAGE_ENTRY" : "MIGRATION_UNSAFE_ENTRY",
        coverageEntry ? "review" : "block",
        { kind, entryKind: entryKind(stat) },
      ));
    }
    return stat;
  } catch {
    blockers.push(issue("MIGRATION_SOURCE_UNREADABLE", "block", { kind }));
    return null;
  }
}

type LockSnapshot = { lock: MigrationLock; device: string; inode: string };

function readLock(lockPath: string): MigrationLock | null {
  return readLockSnapshot(lockPath)?.lock ?? null;
}

function readLockSnapshot(lockPath: string): LockSnapshot | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(lockPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) return null;
    const parsed = JSON.parse(fs.readFileSync(fd, "utf8")) as MigrationLock;
    const lock = parsed
      && parsed.path === lockPath
      && typeof parsed.runId === "string"
      && typeof parsed.nonce === "string"
      && typeof parsed.sourcePath === "string"
      && typeof parsed.sourceDevice === "string"
      && typeof parsed.sourceInode === "string"
      && Number.isInteger(parsed.pid)
      && typeof parsed.processStartIdentity === "string"
      && parsed.processStartIdentity.length > 0
      && Number.isInteger(parsed.uid)
      && Number.isFinite(parsed.createdAt)
      ? parsed
      : null;
    return lock ? { lock, device: String(stat.dev), inode: String(stat.ino) } : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

type LockMutationGuard = { path: string; fd: number; device: string; inode: string };

function acquireLockMutationGuard(lockPath: string): LockMutationGuard {
  const guardPath = `${lockPath}.reclaim`;
  let fd: number;
  try {
    fd = fs.openSync(guardPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Migration maintenance lock reclaim guard is already held");
    }
    throw error;
  }
  try {
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, `${JSON.stringify({ pid: process.pid, nonce: randomUUID() })}\n`, "utf8");
    fs.fsyncSync(fd);
    const stat = fs.fstatSync(fd);
    fsyncDirectory(path.dirname(guardPath));
    return { path: guardPath, fd, device: String(stat.dev), inode: String(stat.ino) };
  } catch (error) {
    try {
      const opened = fs.fstatSync(fd);
      const current = fs.lstatSync(guardPath);
      if (
        current.isFile()
        && !current.isSymbolicLink()
        && current.dev === opened.dev
        && current.ino === opened.ino
      ) fs.unlinkSync(guardPath);
    } catch {
      // Preserve the original guard-creation failure; a leftover guard fails closed.
    } finally {
      fs.closeSync(fd);
    }
    throw error;
  }
}

function releaseLockMutationGuard(guard: LockMutationGuard): void {
  try {
    const stat = fs.lstatSync(guard.path);
    if (
      !stat.isFile()
      || stat.isSymbolicLink()
      || String(stat.dev) !== guard.device
      || String(stat.ino) !== guard.inode
    ) throw new Error("Migration maintenance lock reclaim guard identity changed");
    fs.unlinkSync(guard.path);
    fsyncDirectory(path.dirname(guard.path));
  } finally {
    fs.closeSync(guard.fd);
  }
}

function writeLockFile(lock: MigrationLock): void {
  const fd = fs.openSync(lock.path, "wx", 0o600);
  try {
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(lock)}\n`, { encoding: "utf8" });
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fsyncDirectory(path.dirname(lock.path));
}

function assertNoSymlinkComponents(value: string): void {
  const parsed = path.parse(value);
  let current = parsed.root;
  for (const part of value.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error("Migration source or ancestor cannot be a symlink");
    }
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function issue(code: string, severity: MigrationIssue["severity"], detail: Record<string, unknown>): MigrationIssue {
  return { code, severity, detail };
}
