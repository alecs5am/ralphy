import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import { ralphDir } from "../paths.js";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { getProject } from "./scopes.js";
import { resolveQueryContext, type QueryContext } from "./scope-context.js";
import {
  createExclusiveRegularFileAt,
  openDirectoryAt,
  openExistingDirectoryAt,
  openRegularFileAt,
  openRootDirectory,
  readFileAt,
  renameExclusiveAt,
  unlinkAt,
} from "./posix-directory.js";
import { StoreConflictError, type ProjectSummaryDto } from "./types.js";

export type ProjectTransferDto = {
  id: string;
  projectId: string;
  destinationWorkspaceId: string;
  state: "planned" | "moving" | "failed" | "completed";
  objectCount: number;
  verifiedCount: number;
  createdAt: number;
  updatedAt: number;
  project: ProjectSummaryDto;
};

export type TransferProjectInput = {
  context: QueryContext;
  projectId: string;
  destinationWorkspaceId: string;
  expectedRowVersion: number;
  /** @internal Test-only crash/concurrency injection; production callers omit it. */
  testHooks?: TransferTestHooks;
};

export type TransferTestHooks = Partial<
  Record<
    | "afterJournalCreated"
    | "afterDestinationCopied"
    | "afterDestinationVerified"
    | "beforeMetadataCommit"
    | "afterMetadataCommit"
    | "beforeLockPublish"
    | "beforeDestinationDirectorySync",
    () => void
  >
>;

type TransferRow = {
  id: string;
  workspaceId: string;
  projectId: string;
  state: ProjectTransferDto["state"];
  sourceBucket: string;
  destinationBucket: string;
  createdAt: number;
  updatedAt: number;
};

type TransferEntryRow = {
  id: string;
  transferId: string;
  objectId: string;
  sourceKey: string;
  destinationKey: string;
  bytes: number;
  sha256: string;
  state: "planned" | "verified" | "cleaned";
};

type ProjectRow = {
  id: string;
  workspaceId: string;
  slug: string;
  rowVersion: number;
};

type ObjectRow = {
  id: string;
  workspaceId: string;
  projectId: string;
  bucket: string;
  key: string;
  bytes: number;
  sha256: string;
};

const LOCK_FILE = ".maintenance.lock";

export async function transferProject(
  input: TransferProjectInput,
): Promise<ProjectTransferDto> {
  authorizeProject(input.context, input.projectId);
  const transferId = `transfer_${randomUUID()}`;
  const lock = acquireMaintenanceLock(transferId, input.testHooks);
  try {
    createTransferJournal(transferId, input);
    await input.testHooks?.afterJournalCreated?.();
    return await executeTransfer(transferId, input.context, lock.rootFd, input.testHooks);
  } finally {
    releaseMaintenanceLock(lock);
  }
}

export async function resumeProjectTransfer(
  transferId: string,
  input: { context: QueryContext; testHooks?: TransferTestHooks },
): Promise<ProjectTransferDto> {
  const current = getTransfer(transferId);
  authorizeProject(input.context, current.projectId, current);
  const lock = acquireMaintenanceLock(transferId, input.testHooks);
  try {
    if (current.state === "completed") {
      cleanupSources(current, lock.rootFd);
      return transferDto(current);
    }
    return await executeTransfer(
      transferId,
      input.context,
      lock.rootFd,
      input.testHooks,
    );
  } finally {
    releaseMaintenanceLock(lock);
  }
}

/** @internal Default CLI context for an unqualified stable transfer ID. */
export function projectTransferContext(transferId: string): QueryContext {
  const transfer = getTransfer(transferId);
  return {
    workspaceId:
      transfer.state === "completed"
        ? transfer.workspaceId
        : workspaceIdFromBucket(transfer.sourceBucket, transfer.projectId),
    projectId: transfer.projectId,
  };
}

function createTransferJournal(
  transferId: string,
  input: TransferProjectInput,
): void {
  withImmediateTransaction((db) => {
    const project = db
      .query<ProjectRow, [string]>(
        `SELECT id, workspace_id AS workspaceId, slug,
                row_version AS rowVersion
         FROM projects WHERE id = ?`,
      )
      .get(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    if (project.rowVersion !== input.expectedRowVersion) {
      throw new StoreConflictError("Project row version conflict");
    }
    if (project.workspaceId === input.destinationWorkspaceId) {
      throw new StoreConflictError("Project already belongs to the destination Workspace");
    }
    if (
      !db
        .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
        .get(input.destinationWorkspaceId)
    ) {
      throw new Error(`Workspace not found: ${input.destinationWorkspaceId}`);
    }
    if (
      db
        .query<{ id: string }, [string]>(
          "SELECT id FROM agent_sessions WHERE project_id = ? AND ended_at IS NULL LIMIT 1",
        )
        .get(project.id)
    ) {
      throw new StoreConflictError("Project has an active Agent Session");
    }
    if (
      db
        .query<{ id: string }, [string]>(
          "SELECT id FROM runs WHERE project_id = ? AND state IN ('pending', 'running') LIMIT 1",
        )
        .get(project.id)
    ) {
      throw new StoreConflictError("Project has an active Run");
    }
    const collision = db
      .query<{ id: string }, [string, string, string]>(
        "SELECT id FROM projects WHERE workspace_id = ? AND slug = ? AND id <> ?",
      )
      .get(input.destinationWorkspaceId, project.slug, project.id);
    if (collision) throw new StoreConflictError("Project slug exists in destination Workspace");
    const existing = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM storage_transfers WHERE project_id = ? AND state <> 'completed' LIMIT 1",
      )
      .get(project.id);
    if (existing) throw new StoreConflictError("Project already has an unfinished transfer");

    const sourceBucket = projectBucket(project.workspaceId, project.id);
    const destinationBucket = projectBucket(input.destinationWorkspaceId, project.id);
    const objects = db
      .query<ObjectRow, [string]>(
        `SELECT id, workspace_id AS workspaceId, project_id AS projectId,
                bucket, key, bytes, sha256
         FROM objects WHERE project_id = ? ORDER BY id`,
      )
      .all(project.id);
    for (const object of objects) {
      if (
        object.workspaceId !== project.workspaceId ||
        object.bucket !== sourceBucket
      ) {
        throw new StoreConflictError("Project Object scope is inconsistent");
      }
    }

    const now = Date.now();
    db.prepare(
      `INSERT INTO storage_transfers
       (id, workspace_id, project_id, kind, state, source_bucket,
        destination_bucket, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'planned', ?, ?, ?, ?)`,
    ).run(
      transferId,
      input.destinationWorkspaceId,
      project.id,
      "project",
      sourceBucket,
      destinationBucket,
      now,
      now,
    );
    for (const object of objects) {
      db.prepare(
        `INSERT INTO storage_transfer_entries
         (id, transfer_id, object_id, source_key, destination_key, bytes,
          sha256, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?)`,
      ).run(
        `transfer_entry_${randomUUID()}`,
        transferId,
        object.id,
        object.key,
        object.key,
        object.bytes,
        object.sha256,
        now,
        now,
      );
    }
  });
}

async function executeTransfer(
  transferId: string,
  context: QueryContext,
  rootFd: number,
  hooks?: TransferTestHooks,
): Promise<ProjectTransferDto> {
  const transfer = getTransfer(transferId);
  if (transfer.state === "completed") {
    cleanupSources(transfer, rootFd);
    return transferDto(transfer);
  }
  authorizeProject(context, transfer.projectId, transfer);
  assertTransferCanContinue(transfer);
  setTransferState(transferId, "moving");
  try {
    for (const entry of getEntries(transferId)) {
      await copyAndVerifyEntry(transfer, entry, rootFd, hooks);
    }
    await hooks?.beforeMetadataCommit?.();
    completeTransfer(transferId, rootFd);
    await hooks?.afterMetadataCommit?.();
    cleanupSources(getTransfer(transferId), rootFd);
    return transferDto(getTransfer(transferId));
  } catch (error) {
    if (getTransfer(transferId).state !== "completed") {
      setTransferState(transferId, "failed");
    }
    throw error;
  }
}

function assertTransferCanContinue(transfer: TransferRow): void {
  const db = openDomainDb();
  assertNoActiveProjectWork(db, transfer.projectId);
}

function assertNoActiveProjectWork(
  db: ReturnType<typeof openDomainDb>,
  projectId: string,
): void {
  if (
    db
      .query<{ id: string }, [string]>(
        "SELECT id FROM agent_sessions WHERE project_id = ? AND ended_at IS NULL LIMIT 1",
      )
      .get(projectId)
  ) {
    throw new StoreConflictError("Project has an active Agent Session");
  }
  if (
    db
      .query<{ id: string }, [string]>(
        "SELECT id FROM runs WHERE project_id = ? AND state IN ('pending', 'running') LIMIT 1",
      )
      .get(projectId)
  ) {
    throw new StoreConflictError("Project has an active Run");
  }
}

async function copyAndVerifyEntry(
  transfer: TransferRow,
  entry: TransferEntryRow,
  rootFd: number,
  hooks?: TransferTestHooks,
): Promise<void> {
  verifyLocator(rootFd, transfer.sourceBucket, entry.sourceKey, entry);
  const copied = ensureDestinationCopy(rootFd, transfer, entry, hooks);
  if (copied) await hooks?.afterDestinationCopied?.();
  verifyLocator(rootFd, transfer.destinationBucket, entry.destinationKey, entry);
  setEntryState(entry.id, "verified", null);
  await hooks?.afterDestinationVerified?.();
}

function completeTransfer(transferId: string, rootFd: number): void {
  withImmediateTransaction((db) => {
    const transfer = getTransferRow(db, transferId);
    if (!transfer) throw new Error(`Storage transfer not found: ${transferId}`);
    const entries = getEntriesFromDb(db, transferId);
    const incomplete = entries.find(
      (entry) => entry.state !== "verified" && entry.state !== "cleaned",
    );
    if (incomplete) throw new StoreConflictError("Transfer has unverified entries");
    const project = db
      .query<ProjectRow, [string]>(
        `SELECT id, workspace_id AS workspaceId, slug,
                row_version AS rowVersion FROM projects WHERE id = ?`,
      )
      .get(transfer.projectId);
    if (!project) throw new Error(`Project not found: ${transfer.projectId}`);
    const sourceWorkspaceId = workspaceIdFromBucket(
      transfer.sourceBucket,
      transfer.projectId,
    );
    if (project.workspaceId !== sourceWorkspaceId) {
      throw new StoreConflictError("Project ownership changed during transfer");
    }
    assertNoActiveProjectWork(db, project.id);
    const collision = db
      .query<{ id: string }, [string, string, string]>(
        "SELECT id FROM projects WHERE workspace_id = ? AND slug = ? AND id <> ?",
      )
      .get(transfer.workspaceId, project.slug, project.id);
    if (collision) {
      throw new StoreConflictError("Project slug exists in destination Workspace");
    }
    const objectCoverage = db
      .query<{ objectCount: number; entryCount: number }, [string, string]>(
        `SELECT
           (SELECT COUNT(*) FROM objects WHERE project_id = ?) AS objectCount,
           (SELECT COUNT(*) FROM storage_transfer_entries WHERE transfer_id = ?) AS entryCount`,
      )
      .get(project.id, transferId)!;
    if (objectCoverage.objectCount !== objectCoverage.entryCount) {
      throw new StoreConflictError("Project Objects changed during transfer");
    }
    for (const entry of entries) {
      const object = db
        .query<ObjectRow, [string]>(
          `SELECT id, workspace_id AS workspaceId, project_id AS projectId,
                  bucket, key, bytes, sha256 FROM objects WHERE id = ?`,
        )
        .get(entry.objectId);
      if (
        !object ||
        object.workspaceId !== sourceWorkspaceId ||
        object.projectId !== project.id ||
        object.bucket !== transfer.sourceBucket ||
        object.key !== entry.sourceKey ||
        object.bytes !== entry.bytes ||
        object.sha256 !== entry.sha256
      ) {
        throw new StoreConflictError("Project Object changed during transfer");
      }
      verifyLocator(rootFd, transfer.sourceBucket, entry.sourceKey, entry);
      verifyLocator(
        rootFd,
        transfer.destinationBucket,
        entry.destinationKey,
        entry,
      );
    }
    const now = Date.now();
    const projectResult = db
      .prepare(
        `UPDATE projects SET workspace_id = ?, row_version = row_version + 1,
         updated_at = ? WHERE id = ? AND workspace_id = ? AND row_version = ?`,
      )
      .run(
        transfer.workspaceId,
        now,
        project.id,
        sourceWorkspaceId,
        project.rowVersion,
      );
    if (!projectResult.changes) throw new StoreConflictError();
    for (const entry of entries) {
      const objectResult = db
        .prepare(
          `UPDATE objects SET workspace_id = ?, bucket = ?, key = ?
           WHERE id = ? AND workspace_id = ? AND project_id = ? AND bucket = ?
             AND key = ? AND bytes = ? AND sha256 = ?`,
        )
        .run(
          transfer.workspaceId,
          transfer.destinationBucket,
          entry.destinationKey,
          entry.objectId,
          sourceWorkspaceId,
          project.id,
          transfer.sourceBucket,
          entry.sourceKey,
          entry.bytes,
          entry.sha256,
        );
      if (objectResult.changes !== 1) {
        throw new StoreConflictError("Project Object changed during transfer");
      }
    }
    db.prepare(
      "UPDATE storage_transfers SET state = 'completed', updated_at = ? WHERE id = ?",
    ).run(now, transferId);
    appendActivity(db, {
      workspaceId: transfer.workspaceId,
      projectId: project.id,
      entityType: "project",
      entityId: project.id,
      action: "project.transferred",
      payload: {
        fromWorkspaceId: sourceWorkspaceId,
        toWorkspaceId: transfer.workspaceId,
      },
      createdAt: now,
    });
  });
}

function getTransfer(id: string): TransferRow {
  const transfer = getTransferRow(openDomainDb(), id);
  if (!transfer) throw new Error(`Storage transfer not found: ${id}`);
  return transfer;
}

function getTransferRow(
  db: ReturnType<typeof openDomainDb>,
  id: string,
): TransferRow | null {
  return db
    .query<TransferRow, [string]>(
      `SELECT id, workspace_id AS workspaceId, project_id AS projectId,
              state, source_bucket AS sourceBucket,
              destination_bucket AS destinationBucket,
              created_at AS createdAt, updated_at AS updatedAt
       FROM storage_transfers WHERE id = ?`,
    )
    .get(id);
}

function getEntries(transferId: string): TransferEntryRow[] {
  return getEntriesFromDb(openDomainDb(), transferId);
}

function getEntriesFromDb(
  db: ReturnType<typeof openDomainDb>,
  transferId: string,
): TransferEntryRow[] {
  return db
    .query<TransferEntryRow, [string]>(
      `SELECT id, transfer_id AS transferId, object_id AS objectId,
              source_key AS sourceKey, destination_key AS destinationKey,
              bytes, sha256, state
       FROM storage_transfer_entries WHERE transfer_id = ? ORDER BY id`,
    )
    .all(transferId);
}

function transferDto(transfer: TransferRow): ProjectTransferDto {
  const entries = getEntries(transfer.id);
  return {
    id: transfer.id,
    projectId: transfer.projectId,
    destinationWorkspaceId: transfer.workspaceId,
    state: transfer.state,
    objectCount: entries.length,
    verifiedCount: entries.filter(
      (entry) => entry.state === "verified" || entry.state === "cleaned",
    ).length,
    createdAt: transfer.createdAt,
    updatedAt: transfer.updatedAt,
    project: getProject({
      workspaceId:
        transfer.state === "completed"
          ? transfer.workspaceId
          : workspaceIdFromBucket(transfer.sourceBucket, transfer.projectId),
      projectId: transfer.projectId,
    }),
  };
}

function setTransferState(
  transferId: string,
  state: ProjectTransferDto["state"],
): void {
  openDomainDb()
    .prepare("UPDATE storage_transfers SET state = ?, updated_at = ? WHERE id = ?")
    .run(state, Date.now(), transferId);
}

function setEntryState(
  entryId: string,
  state: TransferEntryRow["state"],
  error: string | null,
): void {
  openDomainDb()
    .prepare(
      "UPDATE storage_transfer_entries SET state = ?, error = ?, updated_at = ? WHERE id = ?",
    )
    .run(state, error, Date.now(), entryId);
}

function projectBucket(workspaceId: string, projectId: string): string {
  return `buckets/${workspaceId}/projects/${projectId}`;
}

function workspaceIdFromBucket(bucket: string, projectId: string): string {
  const match = /^buckets\/([^/]+)\/projects\/([^/]+)$/.exec(bucket);
  if (!match || match[2] !== projectId) {
    throw new Error("Storage transfer source bucket is invalid");
  }
  return match[1]!;
}

function authorizeProject(
  context: QueryContext,
  projectId: string,
  transfer?: TransferRow,
): void {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, context);
  const project = db
    .query<{ workspaceId: string }, [string]>(
      "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
    )
    .get(projectId);
  const expectedWorkspace = transfer
    ? transfer.state === "completed"
      ? transfer.workspaceId
      : workspaceIdFromBucket(transfer.sourceBucket, transfer.projectId)
    : project?.workspaceId;
  if (
    !project ||
    project.workspaceId !== expectedWorkspace ||
    scope.workspaceId !== project.workspaceId ||
    (scope.projectId !== null && scope.projectId !== projectId)
  ) {
    throw new StoreConflictError("Project is outside the transfer context");
  }
}

function ensureDestinationCopy(
  rootFd: number,
  transfer: TransferRow,
  entry: TransferEntryRow,
  hooks?: TransferTestHooks,
): boolean {
  const destination = openLocatorParent(
    rootFd,
    transfer.destinationBucket,
    entry.destinationKey,
    true,
    hooks,
  );
  try {
    const existing = openRegularFileAt(destination.fd, destination.name);
    if (existing !== null) {
      try {
        verifyFd(existing, entry);
      } finally {
        fs.closeSync(existing);
      }
      syncDirectory(destination.fd, hooks);
      return false;
    }
    const source = openLocatorFile(
      rootFd,
      transfer.sourceBucket,
      entry.sourceKey,
    );
    const output = createExclusiveRegularFileAt(
      destination.fd,
      destination.name,
      0o600,
    );
    if (output === null) {
      fs.closeSync(source);
      throw new StoreConflictError("Transfer destination already exists");
    }
    let complete = false;
    try {
      copyFd(source, output);
      fs.fsyncSync(output);
      syncDirectory(destination.fd, hooks);
      complete = true;
    } finally {
      fs.closeSync(source);
      fs.closeSync(output);
      if (!complete) unlinkAt(destination.fd, destination.name, false, true);
    }
    return true;
  } finally {
    destination.close();
  }
}

function copyFd(source: number, destination: number): void {
  const buffer = Buffer.allocUnsafe(64 * 1024);
  for (;;) {
    const count = fs.readSync(source, buffer, 0, buffer.length, null);
    if (count === 0) return;
    let offset = 0;
    while (offset < count) {
      offset += fs.writeSync(destination, buffer, offset, count - offset);
    }
  }
}

function verifyLocator(
  rootFd: number,
  bucket: string,
  key: string,
  expected: Pick<TransferEntryRow, "bytes" | "sha256">,
): void {
  const fd = openLocatorFile(rootFd, bucket, key);
  try {
    verifyFd(fd, expected);
  } finally {
    fs.closeSync(fd);
  }
}

function verifyFd(
  fd: number,
  expected: Pick<TransferEntryRow, "bytes" | "sha256">,
): void {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile() || stat.size !== expected.bytes) {
    throw new StoreConflictError("Storage transfer byte verification failed");
  }
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let bytes = 0;
  for (;;) {
    const count = fs.readSync(fd, buffer, 0, buffer.length, bytes);
    if (count === 0) break;
    hash.update(buffer.subarray(0, count));
    bytes += count;
  }
  if (bytes !== expected.bytes || hash.digest("hex") !== expected.sha256) {
    throw new StoreConflictError("Storage transfer hash verification failed");
  }
}

function openLocatorFile(rootFd: number, bucket: string, key: string): number {
  const parent = openLocatorParent(rootFd, bucket, key, false);
  try {
    const fd = openRegularFileAt(parent.fd, parent.name);
    if (fd === null) throw new StoreConflictError("Storage transfer file is missing");
    return fd;
  } finally {
    parent.close();
  }
}

function openLocatorParent(
  rootFd: number,
  bucket: string,
  key: string,
  create: boolean,
  hooks?: TransferTestHooks,
): { fd: number; name: string; close: () => void } {
  const parts = [...locatorParts(bucket), ...locatorParts(key)];
  const name = parts.pop();
  if (!name) throw new StoreConflictError("Storage transfer locator is invalid");
  let fd = rootFd;
  let owned = false;
  try {
    for (const part of parts) {
      const opened = create ? openDirectoryAt(fd, part, 0o700) : null;
      const next = opened?.fd ?? openExistingDirectoryAt(fd, part);
      if (next === null) {
        throw new StoreConflictError("Storage transfer directory is missing");
      }
      if (opened?.created) {
        try {
          syncDirectory(next, hooks);
          syncDirectory(fd, hooks);
        } catch (error) {
          fs.closeSync(next);
          throw error;
        }
      }
      if (owned) fs.closeSync(fd);
      fd = next;
      owned = true;
    }
    return {
      fd,
      name,
      close: () => {
        if (owned) fs.closeSync(fd);
      },
    };
  } catch (error) {
    if (owned) fs.closeSync(fd);
    if (error instanceof StoreConflictError) throw error;
    throw new StoreConflictError("Storage transfer path is unsafe");
  }
}

function syncDirectory(fd: number, hooks?: TransferTestHooks): void {
  hooks?.beforeDestinationDirectorySync?.();
  fs.fsyncSync(fd);
}

function locatorParts(value: string): string[] {
  if (
    !value ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new StoreConflictError("Storage transfer locator is invalid");
  }
  return value.split("/");
}

function cleanupSources(transfer: TransferRow, rootFd: number): void {
  if (transfer.state !== "completed") return;
  for (const entry of getEntries(transfer.id)) {
    if (entry.state === "cleaned") continue;
    try {
      const parent = openLocatorParent(
        rootFd,
        transfer.sourceBucket,
        entry.sourceKey,
        false,
      );
      try {
        const fd = openRegularFileAt(parent.fd, parent.name);
        if (fd !== null) {
          try {
            verifyFd(fd, entry);
          } finally {
            fs.closeSync(fd);
          }
          unlinkAt(parent.fd, parent.name, false);
        }
      } finally {
        parent.close();
      }
      setEntryState(entry.id, "cleaned", null);
    } catch {
      setEntryState(entry.id, "verified", "source_cleanup_pending");
    }
  }
}

type MaintenanceLock = { rootFd: number; nonce: string; dev: number; ino: number };

function acquireMaintenanceLock(
  transferId: string,
  hooks?: TransferTestHooks,
): MaintenanceLock {
  const rootFd = openRootDirectory(ralphDir());
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const nonce = randomUUID();
      const temporaryName = `.maintenance-lock-${randomUUID()}.tmp`;
      const fd = createExclusiveRegularFileAt(rootFd, temporaryName, 0o600);
      if (fd === null) continue;
      let published = false;
      let stat: fs.Stats;
      try {
        fs.writeFileSync(fd, JSON.stringify({ transferId, pid: process.pid, nonce }));
        fs.fsyncSync(fd);
        hooks?.beforeLockPublish?.();
        stat = fs.fstatSync(fd);
        if (!renameExclusiveAt(rootFd, temporaryName, rootFd, LOCK_FILE)) {
          if (attempt === 0 && recoverDeadLock(rootFd)) continue;
          throw new StoreConflictError("Storage maintenance is already active");
        }
        published = true;
        fs.fsyncSync(rootFd);
        return { rootFd, nonce, dev: stat.dev, ino: stat.ino };
      } catch (error) {
        if (published) removePublishedLock(rootFd, nonce, stat!);
        throw error;
      } finally {
        fs.closeSync(fd);
        if (!published) unlinkAt(rootFd, temporaryName, false, true);
      }
    }
    throw new StoreConflictError("Storage maintenance is already active");
  } catch (error) {
    fs.closeSync(rootFd);
    if (error instanceof StoreConflictError) throw error;
    throw new StoreConflictError("Storage maintenance lock is unsafe");
  }
}

function removePublishedLock(rootFd: number, nonce: string, stat: fs.Stats): void {
  try {
    const entry = readFileAt(rootFd, LOCK_FILE, 4096);
    if (!entry || entry.dev !== stat.dev || entry.ino !== stat.ino) return;
    const parsed = JSON.parse(entry.bytes.toString("utf8")) as { nonce?: unknown };
    if (parsed.nonce !== nonce) return;
    unlinkAt(rootFd, LOCK_FILE, false);
    fs.fsyncSync(rootFd);
  } catch {
    // Never remove a replaced lock while handling publication failure.
  }
}

function recoverDeadLock(rootFd: number): boolean {
  let entry;
  try {
    entry = readFileAt(rootFd, LOCK_FILE, 4096);
  } catch {
    return false;
  }
  const currentUid = process.getuid?.();
  if (
    !entry ||
    entry.mode !== 0o600 ||
    currentUid === undefined ||
    entry.uid !== currentUid
  ) {
    return false;
  }
  const body = entry.bytes.toString("utf8");
  const pid = lockPid(body);
  if (pid === null || processExists(pid)) return false;
  let fd: number | null = null;
  try {
    fd = openRegularFileAt(rootFd, LOCK_FILE);
    if (fd === null) return false;
    const stat = fs.fstatSync(fd);
    if (
      stat.dev !== entry.dev ||
      stat.ino !== entry.ino ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.uid !== currentUid
    ) {
      return false;
    }
  } catch {
    return false;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
  try {
    unlinkAt(rootFd, LOCK_FILE, false);
    return true;
  } catch {
    return false;
  }
}

function lockPid(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as { pid?: unknown };
    if (Number.isSafeInteger(parsed.pid) && Number(parsed.pid) > 0) {
      return Number(parsed.pid);
    }
  } catch {
    // A bounded PID prefix is sufficient to prove a truncated writer is dead.
  }
  const match = /"pid"\s*:\s*(\d{1,10})(?:\D|$)/.exec(body);
  if (!match) return null;
  const pid = Number(match[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

function releaseMaintenanceLock(lock: MaintenanceLock): void {
  try {
    const entry = readFileAt(lock.rootFd, LOCK_FILE, 4096);
    if (!entry || entry.dev !== lock.dev || entry.ino !== lock.ino) return;
    const parsed = JSON.parse(entry.bytes.toString("utf8")) as { nonce?: unknown };
    if (parsed.nonce === lock.nonce) unlinkAt(lock.rootFd, LOCK_FILE, false);
  } catch {
    // A replaced or malformed lock is never removed by best-effort release.
  } finally {
    fs.closeSync(lock.rootFd);
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
