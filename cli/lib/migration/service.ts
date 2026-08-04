import path from "node:path";
import fs from "node:fs";
import { closeDomainDb, openDomainDb } from "../store/db.js";
import { newDomainId } from "../store/ids.js";
import {
  acquireMaintenanceLock,
  auditMigration,
  createMigrationSourceRoot,
  inventoryLegacySource,
  readMigrationStatus,
  releaseMaintenanceLock,
} from "./inventory.js";
import type {
  MigrationAudit,
  MigrationContext,
  MigrationLock,
  MigrationPhase,
  MigrationSourceRoot,
  MigrationStatus,
} from "./types.js";
import {
  createCutoverJournal,
  executeCutover,
  readCutoverJournal,
  recoverCutover as recoverCutoverJournal,
  rollbackCutover as rollbackCutoverJournal,
} from "./cutover-journal.js";

export type StartMigrationInput = {
  storeRoot: string;
  sourceRoots: readonly { id?: string; kind: MigrationSourceRoot["kind"]; path: string }[];
  stageRootRel?: string;
  recoveryRootRel?: string;
};

export type StartMigrationResult = {
  runId: string;
  audit: MigrationAudit;
  status: MigrationStatus;
};

export function startMigration(input: StartMigrationInput): StartMigrationResult {
  const db = openDomainDb();
  const audit = auditMigration(input);
  const runId = newDomainId("mig");
  const now = Date.now();
  db.prepare(
    `INSERT INTO migration_runs
     (id, stage_root_rel, recovery_root_rel, phase, created_at, updated_at)
     VALUES (?, ?, ?, 'audited', ?, ?)`,
  ).run(runId, safeRelative(input.stageRootRel ?? `.ralphy-stage-${runId}`), safeRelative(input.recoveryRootRel ?? `.ralphy-recovery-${runId}`), now, now);
  const status = readMigrationStatus(db, runId);
  if (!status) throw new Error("Migration Run was not created");
  return { runId, audit, status };
}

export function resumeMigration(input: {
  runId: string;
  storeRoot: string;
  sourceRoots: readonly { id?: string; kind: MigrationSourceRoot["kind"]; path: string }[];
  lock?: MigrationLock;
}): { status: MigrationStatus; inventory: ReturnType<typeof inventoryLegacySource> | null } {
  const db = openDomainDb();
  const row = db.query<{ phase: MigrationPhase }, [string]>(
    "SELECT phase FROM migration_runs WHERE id = ?",
  ).get(input.runId);
  if (!row) throw new Error("Migration Run not found");
  if (row.phase === "failed" || row.phase === "cutover" || row.phase === "rolled-back") throw new Error("Migration Run is terminal");
  const roots = input.sourceRoots.map((root) => createMigrationSourceRoot({
    id: root.id ?? root.kind,
    kind: root.kind,
    path: root.path,
  }));
  const lock = input.lock ?? acquireMaintenanceLock({ sourcePath: roots[0]!.path, runId: input.runId });
  try {
    const context: MigrationContext = { db, storeRoot: path.resolve(input.storeRoot), sourceRoots: roots, runId: input.runId };
    const inventory = row.phase === "audited" || row.phase === "inventory" ? inventoryLegacySource(context) : null;
    const status = readMigrationStatus(db, input.runId);
    if (!status) throw new Error("Migration Run status is unavailable");
    return { status, inventory };
  } finally {
    if (!input.lock) releaseMaintenanceLock(lock);
  }
}

export function migrationStatus(runId: string): MigrationStatus | null {
  return readMigrationStatus(openDomainDb(), runId);
}

export function markMigrationPhase(runId: string, phase: MigrationPhase, error?: { code: string; detail: string }): void {
  const db = openDomainDb();
  const current = db.query<{ phase: MigrationPhase }, [string]>("SELECT phase FROM migration_runs WHERE id = ?").get(runId);
  if (!current) throw new Error("Migration Run not found");
  if (phase === "failed" && !error) throw new Error("Failed Migration Run requires a redacted error");
  db.prepare(
    `UPDATE migration_runs
     SET phase = ?, last_error_code = ?, last_error_detail = ?, updated_at = ?
     WHERE id = ?`,
  ).run(phase, error?.code ?? null, error?.detail ?? null, Date.now(), runId);
}

export function cutoverMigration(input: {
  runId: string;
  verificationId: string;
  verificationPath: string;
  sourcePath: string;
  stagePath: string;
  recoveryPath?: string;
  rollbackPath?: string;
}) {
  const verification = readVerification(input.verificationPath);
  if (verification.runId !== input.runId || verification.verificationId !== input.verificationId || verification.ok !== true) {
    throw new Error("Migration verification does not match the requested cutover");
  }
  closeDomainDb();
  const journal = createCutoverJournal(input);
  return executeCutover(journal);
}

export function recoverCutover(input: { journalPath: string; runId: string }) {
  const journal = readCutoverJournal(input.journalPath);
  if (journal.runId !== input.runId) throw new Error("Cutover journal Run ID does not match");
  return recoverCutoverJournal(journal);
}

export function rollbackCutover(input: { journalPath: string; runId: string }) {
  const journal = readCutoverJournal(input.journalPath);
  if (journal.runId !== input.runId) throw new Error("Cutover journal Run ID does not match");
  return rollbackCutoverJournal(journal);
}

function safeRelative(value: string): string {
  if (path.isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("Migration stage/recovery locator must be relative POSIX text");
  }
  return value;
}

function readVerification(file: string): { runId: string; verificationId: string; ok: boolean } {
  const resolved = path.resolve(file);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error("Migration verification record must be a mode-0600 regular file");
  const value = JSON.parse(fs.readFileSync(resolved, "utf8")) as Partial<{ runId: string; verificationId: string; ok: boolean }>;
  if (typeof value.runId !== "string" || typeof value.verificationId !== "string" || typeof value.ok !== "boolean") {
    throw new Error("Migration verification record is invalid");
  }
  return value as { runId: string; verificationId: string; ok: boolean };
}
