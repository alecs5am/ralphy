import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { BRIDGE_PROTOCOL_VERSION } from "../bridge/protocol.js";
import { appendActivity } from "../store/activity.js";
import { openDomainDbAt } from "../store/db.js";
import { SCHEMA_VERSION } from "../store/schema.js";
import { verifyDomainStore } from "../store/verify.js";
import { VERSION } from "../version.js";
import {
  inspectMigrationProcessIdentityState,
  type MigrationProcessIdentity,
  type MigrationProcessIdentityInspection,
} from "./process-identity.js";
import { reclaimDeadMaintenanceLockForCutover } from "./inventory.js";

export type CutoverState =
  | "prepared"
  | "source-moved"
  | "recovery-durable"
  | "installed-moved"
  | "smoke-passed"
  | "installed"
  | "restore-failed"
  | "restore-new-moved"
  | "rollback-new-moved"
  | "rolled-back";

export type CutoverIdentity = {
  device: string;
  inode: string;
  mode: number;
};

type SecureFileIdentity = {
  device: string;
  inode: string;
  mode: number;
  uid: number;
  nlink: number;
  bytes: number;
};

type FrozenFileFact = {
  exists: boolean;
  bytes: number;
  mtimeMs: number;
  sha256: string | null;
};

type SourceIdentity = {
  kind: string;
  label: string;
  pathHash: string;
  device: string;
  inode: string;
  mode: number;
  inventoryDigest: string;
};

type VerificationRecordBinding = {
  path: string;
  directory: CutoverIdentity & { pathHash: string; uid: number };
  file: SecureFileIdentity;
  sha256: string;
};

type FreezeRecordBinding = {
  path: string;
  id: string;
  file: SecureFileIdentity;
  sha256: string;
  database: FrozenFileFact;
  wal: FrozenFileFact;
  shm: FrozenFileFact;
};

export type CutoverJournal = {
  id: string;
  version: 1;
  runId: string;
  verificationId: string;
  verificationNonce: string;
  freezeId: string;
  nonce: string;
  state: CutoverState;
  transition: number;
  sourcePath: string;
  stagePath: string;
  recoveryPath: string;
  rollbackPath: string;
  journalPath: string;
  source: CutoverIdentity;
  stage: CutoverIdentity;
  sourceIdentities: SourceIdentity[];
  verificationRecord: VerificationRecordBinding;
  freezeRecord: FreezeRecordBinding;
  storeId: string;
  databaseDigest: string;
  contentDigest: string;
  stageTreeDigest: string;
  inventoryDigests: Record<string, string>;
  coreVersion: string;
  schemaVersion: number;
  contractVersion: number;
  consumers: { farm: null };
  originalMode: number;
  recoveryMode: number;
  createdAt: number;
  updatedAt: number;
  cutoverAt?: number;
  cutoverActivityId?: number;
  installedDatabaseDigest?: string;
  installedContentDigest?: string;
};

type JournalBody = Omit<CutoverJournal, "id">;

type VerificationRecord = {
  id: string;
  runId: string;
  verifiedAt: number;
  nonce: string;
  sourceEntries: number;
  coveredEntries: number;
  sourceBytes: number;
  accountedBytes: number;
  blockers: unknown[];
  databaseDigest: string;
  contentDigest: string;
  inventoryDigests: Record<string, string>;
  coreVersion: string;
  schemaVersion: number;
  contractVersion: number;
  consumers: { farm: null };
  freezeId: string;
};

type FreezeRecord = {
  id: string;
  runId: string;
  frozenAt: number;
  database: FrozenFileFact;
  wal: FrozenFileFact;
  shm: FrozenFileFact;
  inventoryDigests: Record<string, string>;
  stagedRoot: { path: string; device: string; inode: string };
  contentDigest: string;
  consumers: { farm: null };
};

export type CutoverFaultPoint =
  | "journal-temp-create"
  | "journal-temp-write"
  | "journal-file-fsync"
  | "journal-rename"
  | "journal-parent-fsync"
  | "journal-publish-linked"
  | "source-rename"
  | "recovery-chmod"
  | "recovery-fsync"
  | "install-rename"
  | "restore-rename"
  | "restore-stage-fsync"
  | "installed-smoke"
  | "installed-moved"
  | "smoke-passed"
  | "cutover-lock-acquired"
  | "cutover-lock-before-release"
  | "lock-temp-create"
  | "lock-temp-write"
  | "lock-file-fsync"
  | "lock-publish"
  | "lock-parent-fsync"
  | "lock-publish-linked"
  | "reconcile-before-commit"
  | "reconcile-commit"
  | "reconcile-checkpoint"
  | "reconcile-reverify"
  | "reconcile-journal"
  | "rollback-first-rename"
  | "rollback-second-rename"
  | "rollback-new-moved"
  | "rollback-rolled-back"
  | "rollback-restore-rename";

const STATE_TRANSITIONS: Readonly<Record<CutoverState, readonly CutoverState[]>> = {
  prepared: ["source-moved", "rolled-back"],
  "source-moved": ["recovery-durable", "rolled-back"],
  "recovery-durable": ["installed-moved", "rolled-back"],
  "installed-moved": ["smoke-passed", "restore-failed", "restore-new-moved", "rollback-new-moved", "rolled-back"],
  "smoke-passed": ["installed", "restore-failed", "restore-new-moved", "rollback-new-moved", "rolled-back"],
  installed: ["rollback-new-moved", "rolled-back"],
  "restore-failed": ["restore-new-moved", "rolled-back"],
  "restore-new-moved": ["rolled-back"],
  "rollback-new-moved": ["rolled-back"],
  "rolled-back": [],
};

const PREPARED_KEYS = [
  "id", "version", "runId", "verificationId", "verificationNonce", "freezeId", "nonce",
  "state", "transition", "sourcePath", "stagePath", "recoveryPath", "rollbackPath", "journalPath",
  "source", "stage", "sourceIdentities", "verificationRecord", "freezeRecord", "storeId",
  "databaseDigest", "contentDigest", "stageTreeDigest", "inventoryDigests", "coreVersion",
  "schemaVersion", "contractVersion", "consumers", "originalMode", "recoveryMode", "createdAt", "updatedAt",
].sort();

let cutoverFaultForTesting: ((point: CutoverFaultPoint) => void) | null = null;
let journalReadFaultForTesting: (() => void) | null = null;
let fileReadObserverForTesting: ((bytes: number) => void) | null = null;
let processInspector = {
  currentPid: (): number => process.pid,
  inspect: (pid: number): MigrationProcessIdentityInspection => inspectMigrationProcessIdentityState(pid),
};

export function setCutoverJournalFaultForTesting(
  fault: ((point: CutoverFaultPoint) => void) | null,
): () => void {
  requireTestRuntime();
  const previous = cutoverFaultForTesting;
  cutoverFaultForTesting = fault;
  return () => { cutoverFaultForTesting = previous; };
}

export function setCutoverJournalReadFaultForTesting(fault: (() => void) | null): () => void {
  requireTestRuntime();
  const previous = journalReadFaultForTesting;
  journalReadFaultForTesting = fault;
  return () => { journalReadFaultForTesting = previous; };
}

export function setCutoverJournalFileReadObserverForTesting(
  observer: ((bytes: number) => void) | null,
): () => void {
  requireTestRuntime();
  const previous = fileReadObserverForTesting;
  fileReadObserverForTesting = observer;
  return () => { fileReadObserverForTesting = previous; };
}

export function setCutoverJournalProcessInspectorForTesting(input: {
  currentPid(): number;
  inspect(pid: number): MigrationProcessIdentityInspection;
}): () => void {
  requireTestRuntime();
  const previous = processInspector;
  processInspector = input;
  return () => { processInspector = previous; };
}

export function migrationCutoverPaths(sourcePath: string, runId: string): {
  stagePath: string;
  recoveryPath: string;
  rollbackPath: string;
  journalPath: string;
  authorizationPath: string;
  authorizationClaimPath: string;
  authorizationDonePath: string;
} {
  const source = safeSourcePath(sourcePath, false);
  const id = safeRunId(runId);
  const parent = path.dirname(source);
  const privateRoot = path.join(parent, ".ralphy-migration-private", id);
  return {
    stagePath: path.join(parent, ".ralphy-staging", id, ".ralphy"),
    recoveryPath: path.join(parent, `.ralphy-recovery-${id}`),
    rollbackPath: path.join(parent, `.ralphy-rollback-new-${id}`),
    journalPath: path.join(parent, `.ralphy-migration-${id}.journal.json`),
    authorizationPath: path.join(privateRoot, "desktop-authorization.json"),
    authorizationClaimPath: path.join(privateRoot, "desktop-authorization.claim.json"),
    authorizationDonePath: path.join(privateRoot, "desktop-authorization.done.json"),
  };
}

export function cutoverJournalPath(sourcePath: string, runId: string): string {
  return migrationCutoverPaths(sourcePath, runId).journalPath;
}

export function createCutoverJournal(input: {
  runId: string;
  sourcePath: string;
  verificationId: string;
  verificationDir: string;
}): CutoverJournal {
  return createVerifiedCutoverJournal(input);
}

export function createVerifiedCutoverJournal(input: {
  runId: string;
  sourcePath: string;
  verificationId: string;
  verificationDir: string;
}): CutoverJournal {
  assertExactInputKeys(input, ["runId", "sourcePath", "verificationId", "verificationDir"]);
  const runId = safeRunId(input.runId);
  const sourcePath = safeSourcePath(input.sourcePath, true);
  const paths = migrationCutoverPaths(sourcePath, runId);
  const stagePath = exactRealDirectory(paths.stagePath, "Cutover stage");
  const source = directoryIdentity(sourcePath);
  const stage = directoryIdentity(stagePath);
  if (source.device !== stage.device) throw new Error("Cutover generations must use the same device");
  for (const candidate of [paths.recoveryPath, paths.rollbackPath, paths.journalPath]) assertAbsent(candidate);

  const verificationDir = exactRealDirectory(input.verificationDir, "Migration verification directory");
  const verificationId = safeDigest(input.verificationId, "verification ID");
  const verificationPath = path.join(verificationDir, `migration-${runId}.verification-${verificationId}.json`);
  const verificationRead = readSecureCanonicalJson<VerificationRecord>(verificationPath, "Migration verification record");
  const verification = verificationRead.value;
  validateVerificationRecord(verification, runId, verificationId);
  const freezePath = path.join(verificationDir, `migration-${runId}.freeze.json`);
  const freezeRead = readSecureCanonicalJson<FreezeRecord>(freezePath, "Migration freeze record");
  const freeze = freezeRead.value;
  validateFreezeRecord(freeze, runId, verification.freezeId, stagePath, stage);
  if (verification.databaseDigest !== freeze.database.sha256) {
    throw new Error("Migration verification and freeze database digests differ");
  }
  if (canonical(verification.inventoryDigests) !== canonical(freeze.inventoryDigests)) {
    throw new Error("Migration verification and freeze inventory digests differ");
  }
  if (hashFile(path.join(stagePath, "ralphy.db")) !== verification.databaseDigest) {
    throw new Error("Cutover staged database does not match verification");
  }

  const metadata = readStagedMetadata(stagePath, runId, sourcePath);
  if (canonical(metadata.inventoryDigests) !== canonical(verification.inventoryDigests)) {
    throw new Error("Cutover inventory digests do not match the staged Run");
  }
  const tree = generationTree(stagePath);
  const now = Date.now();
  const verificationDirStat = directoryIdentityWithOwner(verificationDir);
  const body: JournalBody = {
    version: 1,
    runId,
    verificationId,
    verificationNonce: safeUuid(verification.nonce, "verification nonce"),
    freezeId: verification.freezeId,
    nonce: randomUUID(),
    state: "prepared",
    transition: 0,
    sourcePath,
    stagePath,
    recoveryPath: paths.recoveryPath,
    rollbackPath: paths.rollbackPath,
    journalPath: paths.journalPath,
    source,
    stage,
    sourceIdentities: metadata.sourceIdentities,
    verificationRecord: {
      path: verificationPath,
      directory: {
        pathHash: sha256(verificationDir),
        device: verificationDirStat.device,
        inode: verificationDirStat.inode,
        mode: verificationDirStat.mode,
        uid: verificationDirStat.uid,
      },
      file: verificationRead.identity,
      sha256: verificationRead.sha256,
    },
    freezeRecord: {
      path: freezePath,
      id: freeze.id,
      file: freezeRead.identity,
      sha256: freezeRead.sha256,
      database: freeze.database,
      wal: freeze.wal,
      shm: freeze.shm,
    },
    storeId: metadata.storeId,
    databaseDigest: verification.databaseDigest,
    contentDigest: verification.contentDigest,
    stageTreeDigest: tree.digest,
    inventoryDigests: verification.inventoryDigests,
    coreVersion: verification.coreVersion,
    schemaVersion: verification.schemaVersion,
    contractVersion: verification.contractVersion,
    consumers: { farm: null },
    originalMode: source.mode,
    recoveryMode: 0o700,
    createdAt: now,
    updatedAt: now,
  };
  const journal = sealJournal(body);
  writeJournal(journal, true);
  return journal;
}

export function readCutoverJournal(journalPath: string): CutoverJournal {
  const resolved = path.resolve(journalPath);
  const read = readSecureCanonicalJson<CutoverJournal>(resolved, "Cutover journal", journalReadFaultForTesting);
  const journal = read.value;
  validateJournalEnvelope(journal, resolved);
  return journal;
}

export function executeCutover(journalOrPath: CutoverJournal | string): CutoverJournal {
  return withJournalLock(journalOrPath, (initial) => executeLocked(initial));
}

export function recoverCutover(
  journalOrPath: CutoverJournal | string,
  assertPreparedReady?: () => void,
): CutoverJournal {
  return withJournalLock(journalOrPath, (journal) => {
    if (journal.state === "rolled-back" || journal.state === "installed") return journal;
    if (journal.state === "restore-failed" || journal.state === "restore-new-moved") {
      return finishSmokeRestoration(journal);
    }
    if (journal.state === "rollback-new-moved") return finishRollbackRestoration(journal);
    return executeLocked(journal);
  }, (journal) => {
    if (journal.state === "prepared") assertPreparedReady?.();
  });
}

export function rollbackCutover(journalOrPath: CutoverJournal | string): CutoverJournal {
  return withJournalLock(journalOrPath, (initial) => rollbackLocked(initial));
}

export function reconcileInstalledMigration(journalOrPath: CutoverJournal | string): CutoverJournal {
  return withJournalLock(journalOrPath, (journal) => {
    if (journal.state === "installed") return journal;
    if (journal.state !== "smoke-passed") throw new Error(`Cutover journal is not smoke-passed: ${journal.state}`);
    return reconcileLocked(journal);
  });
}

export function assertStartupJournalReady(sourcePath: string): void {
  if (typeof sourcePath !== "string" || !path.isAbsolute(sourcePath)) {
    throw new Error("Cutover source path must be absolute");
  }
  const lexicalSource = path.resolve(sourcePath);
  if (path.basename(lexicalSource) !== ".ralphy") throw new Error("Cutover source must be an exact .ralphy directory");
  const parent = path.dirname(lexicalSource);
  let names: string[];
  try { names = fs.readdirSync(parent); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const journals = names.filter((name) => /^\.ralphy-migration-mig_[A-Za-z0-9-]+\.journal\.json$/u.test(name));
  if (journals.length === 0) return;
  const source = safeSourcePath(lexicalSource, false);
  for (const name of journals) {
    const journal = readCutoverJournal(path.join(parent, name));
    if (journal.sourcePath !== source) continue;
    if (journal.state !== "installed" && journal.state !== "rolled-back") {
      throw new Error(`Migration cutover is interrupted in ${journal.state} state`);
    }
  }
}

function executeLocked(initial: CutoverJournal): CutoverJournal {
  let journal = readCutoverJournal(initial.journalPath);
  if (journal.nonce !== initial.nonce) throw new Error("Cutover journal changed before execution");
  if (journal.state === "installed" || journal.state === "rolled-back") return journal;
  if (journal.state === "restore-failed" || journal.state === "restore-new-moved") {
    return finishSmokeRestoration(journal);
  }
  if (journal.state === "rollback-new-moved") return finishRollbackRestoration(journal);

  if (journal.state === "prepared") {
    if (exists(journal.sourcePath)) {
      assertDirectoryIdentity(journal.sourcePath, journal.source, "source", true);
      assertDirectoryIdentity(journal.stagePath, journal.stage, "stage", true);
      assertAbsent(journal.recoveryPath);
      assertAbsent(journal.rollbackPath);
      cutoverFault("source-rename");
      renameExact(journal.sourcePath, journal.recoveryPath);
      fsyncDirectory(path.dirname(journal.sourcePath));
    } else {
      assertDirectoryIdentity(journal.recoveryPath, journal.source, "recovery", false);
      assertDirectoryIdentity(journal.stagePath, journal.stage, "stage", true);
    }
    journal = transition(journal, "source-moved");
  }

  if (journal.state === "source-moved") {
    assertAbsent(journal.sourcePath);
    assertDirectoryIdentity(journal.recoveryPath, journal.source, "recovery", false);
    assertDirectoryIdentity(journal.stagePath, journal.stage, "stage", true);
    cutoverFault("recovery-chmod");
    fs.chmodSync(journal.recoveryPath, journal.recoveryMode);
    cutoverFault("recovery-fsync");
    fsyncDirectory(journal.recoveryPath);
    fsyncDirectory(path.dirname(journal.sourcePath));
    journal = transition(journal, "recovery-durable");
  }

  if (journal.state === "recovery-durable") {
    assertAbsent(journal.sourcePath);
    assertDirectoryIdentity(journal.recoveryPath, journal.source, "recovery", false);
    assertMode(journal.recoveryPath, journal.recoveryMode, "recovery");
    assertDirectoryIdentity(journal.stagePath, journal.stage, "stage", true);
    cutoverFault("install-rename");
    renameExact(journal.stagePath, journal.sourcePath);
    fsyncDirectory(path.dirname(journal.sourcePath));
    journal = transition(journal, "installed-moved");
    cutoverFault("installed-moved");
  }

  if (journal.state === "installed-moved") {
    try {
      cutoverFault("installed-smoke");
      readOnlyInstalledSmoke(journal);
      journal = transition(journal, "smoke-passed", { cutoverAt: Date.now() });
    } catch (error) {
      return restoreAfterSmokeFailure(journal, error);
    }
    cutoverFault("smoke-passed");
  }

  if (journal.state === "smoke-passed") return reconcileLocked(journal);
  return journal;
}

function reconcileLocked(journal: CutoverJournal): CutoverJournal {
  assertDirectoryIdentity(journal.sourcePath, journal.stage, "installed source", true);
  const cutoverAt = journal.cutoverAt;
  if (!Number.isSafeInteger(cutoverAt) || cutoverAt! <= 0) throw new Error("Cutover timestamp is invalid");
  let activityId = 0;
  cutoverFault("reconcile-before-commit");
  const db = openDomainDbAt(journal.sourcePath);
  try {
    activityId = db.transaction(() => reconcileTransaction(db, journal, cutoverAt!)).immediate();
    cutoverFault("reconcile-commit");
    checkpoint(db);
  } finally {
    db.close();
  }
  cutoverFault("reconcile-checkpoint");
  assertReconciledStore(journal, activityId, cutoverAt!);
  const installed = generationTree(journal.sourcePath);
  cutoverFault("reconcile-reverify");
  const next = transition(journal, "installed", {
    cutoverActivityId: activityId,
    installedDatabaseDigest: installed.databaseDigest,
    installedContentDigest: installed.contentDigest,
  });
  cutoverFault("reconcile-journal");
  return next;
}

function reconcileTransaction(db: Database, journal: CutoverJournal, cutoverAt: number): number {
  const run = db.query<{ phase: string; cutoverAt: number | null; activityId: number | null }, [string]>(
    "SELECT phase, cutover_at AS cutoverAt, cutover_activity_id AS activityId FROM migration_runs WHERE id = ?",
  ).get(journal.runId);
  if (!run) throw new Error("Migration Run is missing during cutover reconciliation");
  if (run.phase === "cutover") {
    if (run.cutoverAt !== cutoverAt || !Number.isSafeInteger(run.activityId)) {
      throw new Error("Migration cutover reconciliation identity mismatch");
    }
    assertExactCutoverEvent(db, journal, run.activityId!, cutoverAt);
    return run.activityId!;
  }
  if (run.phase !== "ready" || run.cutoverAt !== null || run.activityId !== null) {
    throw new Error("Migration Run is not ready for cutover reconciliation");
  }
  const existing = cutoverEvents(db, journal.runId);
  if (existing.length !== 0) throw new Error("Migration cutover Activity already exists without Run binding");
  const activityId = appendActivity(db, {
    entityType: "migration_run",
    entityId: journal.runId,
    action: "cutover",
    payload: { journal: journal.nonce },
    createdAt: cutoverAt,
  });
  const updated = db.prepare(
    `UPDATE migration_runs SET phase = 'cutover', cutover_at = ?, cutover_activity_id = ?, updated_at = ?
     WHERE id = ? AND phase = 'ready' AND cutover_at IS NULL AND cutover_activity_id IS NULL`,
  ).run(cutoverAt, activityId, cutoverAt, journal.runId);
  if (updated.changes !== 1) throw new Error("Migration Run cutover reconciliation did not commit exactly once");
  assertExactCutoverEvent(db, journal, activityId, cutoverAt);
  return activityId;
}

function rollbackLocked(initial: CutoverJournal): CutoverJournal {
  let journal = readCutoverJournal(initial.journalPath);
  if (journal.nonce !== initial.nonce) throw new Error("Cutover journal changed before rollback");
  if (journal.state === "rolled-back") return journal;
  if (journal.state === "restore-failed" || journal.state === "restore-new-moved") {
    return finishSmokeRestoration(journal);
  }
  if (journal.state === "rollback-new-moved") return finishRollbackRestoration(journal);
  if (journal.state === "prepared") return transition(journal, "rolled-back");
  if (journal.state === "source-moved" || journal.state === "recovery-durable") {
    assertAbsent(journal.sourcePath);
    assertDirectoryIdentity(journal.recoveryPath, journal.source, "recovery", false);
    renameExact(journal.recoveryPath, journal.sourcePath);
    fs.chmodSync(journal.sourcePath, journal.originalMode);
    fsyncDirectory(journal.sourcePath);
    fsyncDirectory(path.dirname(journal.sourcePath));
    return transition(journal, "rolled-back");
  }
  if (!new Set<CutoverState>(["installed-moved", "smoke-passed", "installed"]).has(journal.state)) {
    throw new Error(`Cannot roll back cutover journal in ${journal.state} state`);
  }
  return rollbackInstalledGeneration(journal);
}

function rollbackInstalledGeneration(journal: CutoverJournal): CutoverJournal {
  if (exists(journal.rollbackPath) && !exists(journal.sourcePath)) {
    return finishRollbackRestoration(journal.state === "rollback-new-moved"
      ? journal
      : transition(journal, "rollback-new-moved"));
  }
  assertDirectoryIdentity(journal.sourcePath, journal.stage, "installed source", true);
  assertDirectoryIdentity(journal.recoveryPath, journal.source, "recovery", false);
  assertAbsent(journal.rollbackPath);
  cutoverFault("rollback-first-rename");
  renameExact(journal.sourcePath, journal.rollbackPath);
  fsyncDirectory(path.dirname(journal.sourcePath));
  try {
    cutoverFault("rollback-second-rename");
    renameExact(journal.recoveryPath, journal.sourcePath);
    fs.chmodSync(journal.sourcePath, journal.originalMode);
    fsyncDirectory(journal.sourcePath);
    fsyncDirectory(path.dirname(journal.sourcePath));
  } catch (error) {
    try {
      cutoverFault("rollback-restore-rename");
      assertAbsent(journal.sourcePath);
      renameExact(journal.rollbackPath, journal.sourcePath);
      fsyncDirectory(path.dirname(journal.sourcePath));
    } catch {
      const moved = transition(journal, "rollback-new-moved");
      throw errorWithCause("Rollback restoration failed; both generations were preserved", error, moved.state);
    }
    throw error;
  }
  let moved = transition(journal, "rollback-new-moved");
  cutoverFault("rollback-new-moved");
  moved = transition(moved, "rolled-back");
  cutoverFault("rollback-rolled-back");
  return moved;
}

function restoreAfterSmokeFailure(journal: CutoverJournal, smokeError: unknown): never {
  try {
    cutoverFault("restore-rename");
    assertAbsent(journal.stagePath);
    renameExact(journal.sourcePath, journal.stagePath);
    cutoverFault("restore-stage-fsync");
    fsyncDirectory(path.dirname(journal.stagePath));
  } catch (restoreError) {
    if (journal.state !== "restore-failed") transition(journal, "restore-failed");
    throw restoreError;
  }
  let moved = transition(journal, "restore-new-moved");
  try {
    moved = finishSmokeRestoration(moved);
  } catch (restoreError) {
    throw errorWithCause("Installed smoke failed and original restoration is incomplete", restoreError, moved.state);
  }
  throw errorWithCause("Installed smoke failed; original generation was restored", smokeError, moved.state);
}

function finishSmokeRestoration(initial: CutoverJournal): CutoverJournal {
  let journal = readCutoverJournal(initial.journalPath);
  if (journal.state === "restore-failed") {
    assertDirectoryIdentity(journal.sourcePath, journal.stage, "failed installed source", true);
    assertAbsent(journal.stagePath);
    renameExact(journal.sourcePath, journal.stagePath);
    fsyncDirectory(path.dirname(journal.stagePath));
    journal = transition(journal, "restore-new-moved");
  }
  if (journal.state !== "restore-new-moved") return journal;
  assertAbsent(journal.sourcePath);
  assertDirectoryIdentity(journal.stagePath, journal.stage, "restored stage", true);
  assertDirectoryIdentity(journal.recoveryPath, journal.source, "recovery", false);
  renameExact(journal.recoveryPath, journal.sourcePath);
  fs.chmodSync(journal.sourcePath, journal.originalMode);
  fsyncDirectory(journal.sourcePath);
  fsyncDirectory(path.dirname(journal.sourcePath));
  return transition(journal, "rolled-back");
}

function finishRollbackRestoration(initial: CutoverJournal): CutoverJournal {
  let journal = readCutoverJournal(initial.journalPath);
  if (journal.state !== "rollback-new-moved") throw new Error("Rollback restoration state is invalid");
  if (!exists(journal.sourcePath)) {
    assertDirectoryIdentity(journal.recoveryPath, journal.source, "recovery", false);
    renameExact(journal.recoveryPath, journal.sourcePath);
    fs.chmodSync(journal.sourcePath, journal.originalMode);
    fsyncDirectory(journal.sourcePath);
    fsyncDirectory(path.dirname(journal.sourcePath));
  }
  assertDirectoryIdentity(journal.sourcePath, journal.source, "restored source", false);
  assertDirectoryIdentity(journal.rollbackPath, journal.stage, "rollback generation", true);
  journal = transition(journal, "rolled-back");
  return journal;
}

function readOnlyInstalledSmoke(journal: CutoverJournal): void {
  assertDirectoryIdentity(journal.sourcePath, journal.stage, "installed source", true);
  const before = generationTree(journal.sourcePath);
  if (before.digest !== journal.stageTreeDigest || before.databaseDigest !== journal.databaseDigest) {
    throw new Error("Installed generation changed before smoke verification");
  }
  const databasePath = path.join(journal.sourcePath, "ralphy.db");
  const image = fs.readFileSync(databasePath);
  if (image.subarray(0, 16).toString("binary") !== "SQLite format 3\0") {
    throw new Error("Installed migration database is invalid");
  }
  if (image[18] === 2 && image[19] === 2) { image[18] = 1; image[19] = 1; }
  const db = Database.deserialize(image, { readonly: true });
  try {
    db.exec("PRAGMA query_only = ON");
    const run = db.query<{ phase: string; cutoverAt: number | null; activityId: number | null }, [string]>(
      "SELECT phase, cutover_at AS cutoverAt, cutover_activity_id AS activityId FROM migration_runs WHERE id = ?",
    ).get(journal.runId);
    const store = db.query<{ storeId: string }, []>("SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1").get();
    const schema = db.query<{ version: number | null }, []>("SELECT MAX(version) AS version FROM schema_migrations").get();
    const integrity = db.query<{ value: string }, []>("PRAGMA integrity_check").all();
    const foreignKeys = db.query("PRAGMA foreign_key_check").all();
    if (!run || run.phase !== "ready" || run.cutoverAt !== null || run.activityId !== null
      || store?.storeId !== journal.storeId || schema?.version !== journal.schemaVersion
      || integrity.length !== 1 || Object.values(integrity[0] ?? {})[0] !== "ok" || foreignKeys.length !== 0) {
      throw new Error("Installed migration database failed read-only smoke verification");
    }
  } finally { db.close(); }
  const report = verifyDomainStore({ dataRoot: journal.sourcePath, hashObjects: true });
  if (report.integrity !== "ok") throw new Error("Installed domain store failed read-only verification");
  const after = generationTree(journal.sourcePath);
  if (canonical(before) !== canonical(after)) throw new Error("Installed smoke mutated the frozen generation");
}

function assertReconciledStore(journal: CutoverJournal, activityId: number, cutoverAt: number): void {
  const report = verifyDomainStore({ dataRoot: journal.sourcePath, hashObjects: true });
  if (report.integrity !== "ok") throw new Error("Installed domain store failed post-cutover verification");
  const db = new Database(path.join(journal.sourcePath, "ralphy.db"), { readonly: true, strict: true });
  try {
    const run = db.query<{ phase: string; cutoverAt: number | null; activityId: number | null }, [string]>(
      "SELECT phase, cutover_at AS cutoverAt, cutover_activity_id AS activityId FROM migration_runs WHERE id = ?",
    ).get(journal.runId);
    if (!run || run.phase !== "cutover" || run.cutoverAt !== cutoverAt || run.activityId !== activityId) {
      throw new Error("Installed migration reconciliation is not exact");
    }
    assertExactCutoverEvent(db, journal, activityId, cutoverAt);
  } finally { db.close(); }
}

function cutoverEvents(db: Database, runId: string): Array<{ id: number; createdAt: number; payload: string }> {
  return db.query<{ id: number; createdAt: number; payload: string }, [string]>(
    `SELECT id, created_at AS createdAt, payload_json AS payload FROM activity_events
     WHERE entity_type = 'migration_run' AND entity_id = ? AND action = 'cutover' ORDER BY id`,
  ).all(runId);
}

function assertExactCutoverEvent(db: Database, journal: CutoverJournal, activityId: number, cutoverAt: number): void {
  const events = cutoverEvents(db, journal.runId);
  if (events.length !== 1 || events[0]!.id !== activityId || events[0]!.createdAt !== cutoverAt
    || events[0]!.payload !== JSON.stringify({ journal: journal.nonce })) {
    throw new Error("Migration cutover Activity binding is invalid");
  }
}

function readStagedMetadata(stagePath: string, runId: string, sourcePath: string): {
  storeId: string;
  inventoryDigests: Record<string, string>;
  sourceIdentities: SourceIdentity[];
} {
  const image = fs.readFileSync(path.join(stagePath, "ralphy.db"));
  if (image[18] === 2 && image[19] === 2) { image[18] = 1; image[19] = 1; }
  const db = Database.deserialize(image, { readonly: true });
  try {
    const run = db.query<{ phase: string; cutoverAt: number | null }, [string]>(
      "SELECT phase, cutover_at AS cutoverAt FROM migration_runs WHERE id = ?",
    ).get(runId);
    if (!run || run.phase !== "ready" || run.cutoverAt !== null) throw new Error("Cutover staged Run is not ready");
    const storeId = db.query<{ storeId: string }, []>("SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1").get()?.storeId;
    if (!storeId || !/^store_[A-Za-z0-9_-]{32}$/u.test(storeId)) throw new Error("Cutover store identity is invalid");
    const rows = db.query<{
      kind: string; label: string; pathHash: string; device: string; inode: string; mode: number; inventoryDigest: string | null;
    }, [string]>(
      `SELECT source_kind AS kind, source_label AS label, canonical_path_hash AS pathHash,
              source_device AS device, source_inode AS inode, source_mode AS mode,
              inventory_digest AS inventoryDigest
       FROM migration_sources WHERE migration_run_id = ? ORDER BY id`,
    ).all(runId);
    const sourceStat = fs.lstatSync(sourcePath);
    const sourceHash = sha256(sourcePath);
    const primary = rows.find((row) => row.kind === "ralphy" && row.pathHash === sourceHash);
    if (!primary || primary.device !== String(sourceStat.dev) || primary.inode !== String(sourceStat.ino)
      || primary.mode !== sourceStat.mode) throw new Error("Cutover mutating source identity is not inventoried");
    const inventoryDigests = Object.fromEntries(rows.map((row) => {
      if (!row.inventoryDigest || !isDigest(row.inventoryDigest)) throw new Error("Cutover source inventory digest is invalid");
      return [findSourceId(db, runId, row.label, row.pathHash), row.inventoryDigest];
    }));
    return {
      storeId,
      inventoryDigests,
      sourceIdentities: rows.filter((row) => row !== primary).map((row) => ({
        kind: row.kind,
        label: row.label,
        pathHash: row.pathHash,
        device: row.device,
        inode: row.inode,
        mode: row.mode,
        inventoryDigest: row.inventoryDigest!,
      })),
    };
  } finally { db.close(); }
}

function findSourceId(db: Database, runId: string, label: string, pathHash: string): string {
  const id = db.query<{ id: string }, [string, string, string]>(
    "SELECT id FROM migration_sources WHERE migration_run_id = ? AND source_label = ? AND canonical_path_hash = ?",
  ).get(runId, label, pathHash)?.id;
  if (!id) throw new Error("Cutover source identity is missing");
  return id;
}

function validateVerificationRecord(record: VerificationRecord, runId: string, verificationId: string): void {
  assertRecordDigest(record, verificationId, "Migration verification record");
  if (record.runId !== runId || !Number.isSafeInteger(record.verifiedAt) || record.verifiedAt <= 0
    || !safeUuid(record.nonce, "verification nonce") || !Array.isArray(record.blockers) || record.blockers.length !== 0
    || !isDigest(record.databaseDigest) || !isDigest(record.contentDigest)
    || record.coreVersion !== VERSION || record.schemaVersion !== SCHEMA_VERSION
    || record.contractVersion !== BRIDGE_PROTOCOL_VERSION || canonical(record.consumers) !== canonical({ farm: null })
    || !isDigest(record.freezeId) || !validDigestMap(record.inventoryDigests)) {
    throw new Error("Migration verification record is invalid for cutover");
  }
}

function validateFreezeRecord(
  record: FreezeRecord,
  runId: string,
  freezeId: string,
  stagePath: string,
  stage: CutoverIdentity,
): void {
  assertRecordDigest(record, freezeId, "Migration freeze record");
  if (record.runId !== runId || !Number.isSafeInteger(record.frozenAt) || record.frozenAt <= 0
    || record.stagedRoot?.path !== stagePath || record.stagedRoot.device !== stage.device
    || record.stagedRoot.inode !== stage.inode || canonical(record.consumers) !== canonical({ farm: null })
    || !validFrozenFact(record.database, true) || !validFrozenFact(record.wal, false)
    || !validFrozenFact(record.shm, false) || !isDigest(record.contentDigest)
    || !validDigestMap(record.inventoryDigests)) {
    throw new Error("Migration freeze record is invalid for cutover");
  }
}

function validateJournalEnvelope(journal: CutoverJournal, journalPath: string): void {
  if (!isPlainObject(journal)) throw new Error("Cutover journal is invalid");
  const keys = Object.keys(journal).sort();
  const terminalExtras = ["cutoverAt", "cutoverActivityId", "installedDatabaseDigest", "installedContentDigest"];
  const hasInstalledFacts = journal.cutoverActivityId !== undefined
    || journal.installedDatabaseDigest !== undefined || journal.installedContentDigest !== undefined;
  const expectedKeys = journal.state === "installed" || hasInstalledFacts
    ? [...PREPARED_KEYS, ...terminalExtras].sort()
    : journal.cutoverAt !== undefined
      ? [...PREPARED_KEYS, "cutoverAt"].sort()
      : PREPARED_KEYS;
  if (canonical(keys) !== canonical(expectedKeys)) throw new Error("Cutover journal keys are invalid");
  const { id, ...body } = journal;
  if (!isDigest(id) || id !== sha256(canonical(body))) throw new Error("Cutover journal digest is invalid");
  if (journal.version !== 1 || !/^mig_[A-Za-z0-9-]+$/u.test(journal.runId)
    || !isDigest(journal.verificationId) || !isDigest(journal.freezeId)
    || !isUuid(journal.verificationNonce) || !isUuid(journal.nonce)
    || !(journal.state in STATE_TRANSITIONS) || !Number.isSafeInteger(journal.transition) || journal.transition < 0
    || journal.journalPath !== journalPath || journal.coreVersion !== VERSION
    || journal.schemaVersion !== SCHEMA_VERSION || journal.contractVersion !== BRIDGE_PROTOCOL_VERSION
    || canonical(journal.consumers) !== canonical({ farm: null })
    || !isDigest(journal.databaseDigest) || !isDigest(journal.contentDigest) || !isDigest(journal.stageTreeDigest)
    || !validDigestMap(journal.inventoryDigests)
    || !Number.isSafeInteger(journal.createdAt) || !Number.isSafeInteger(journal.updatedAt)
    || journal.createdAt <= 0 || journal.updatedAt < journal.createdAt
    || !validIdentity(journal.source) || !validIdentity(journal.stage)
    || journal.originalMode !== journal.source.mode || journal.recoveryMode !== 0o700
    || !Array.isArray(journal.sourceIdentities) || !journal.sourceIdentities.every(validSourceIdentity)
    || !validVerificationBinding(journal.verificationRecord) || !validFreezeBinding(journal.freezeRecord)
    || journal.freezeRecord.id !== journal.freezeId || journal.freezeRecord.database.sha256 !== journal.databaseDigest) {
    throw new Error("Cutover journal envelope is invalid");
  }
  const derived = migrationCutoverPaths(journal.sourcePath, journal.runId);
  if (journal.stagePath !== derived.stagePath || journal.recoveryPath !== derived.recoveryPath
    || journal.rollbackPath !== derived.rollbackPath || journal.journalPath !== derived.journalPath) {
    throw new Error("Cutover journal paths are not derived");
  }
  if (journal.state === "installed" || hasInstalledFacts) {
    if (!Number.isSafeInteger(journal.cutoverAt) || !Number.isSafeInteger(journal.cutoverActivityId)
      || !isDigest(journal.installedDatabaseDigest) || !isDigest(journal.installedContentDigest)) {
      throw new Error("Installed cutover journal is incomplete");
    }
  }
  validateBoundEvidence(journal);
}

function validVerificationBinding(value: VerificationRecordBinding): boolean {
  return isPlainObject(value) && exactKeys(value, ["path", "directory", "file", "sha256"])
    && typeof value.path === "string" && path.isAbsolute(value.path)
    && isDigest(value.sha256) && validSecureFileIdentity(value.file)
    && isPlainObject(value.directory)
    && exactKeys(value.directory, ["pathHash", "device", "inode", "mode", "uid"])
    && isDigest(value.directory.pathHash) && validIdentity(value.directory)
    && Number.isSafeInteger(value.directory.uid) && value.directory.uid >= 0;
}

function validFreezeBinding(value: FreezeRecordBinding): boolean {
  return isPlainObject(value)
    && exactKeys(value, ["path", "id", "file", "sha256", "database", "wal", "shm"])
    && typeof value.path === "string" && path.isAbsolute(value.path)
    && isDigest(value.id) && isDigest(value.sha256)
    && validSecureFileIdentity(value.file) && validFrozenFact(value.database, true)
    && validFrozenFact(value.wal, false) && validFrozenFact(value.shm, false);
}

function validateBoundEvidence(journal: CutoverJournal): void {
  const verificationRead = readSecureCanonicalJson<VerificationRecord>(
    journal.verificationRecord.path,
    "Migration verification record",
  );
  if (!sameFileIdentity(verificationRead.identity, journal.verificationRecord.file)
    || verificationRead.sha256 !== journal.verificationRecord.sha256) {
    throw new Error("Cutover journal verification record binding changed");
  }
  validateVerificationRecord(verificationRead.value, journal.runId, journal.verificationId);
  if (verificationRead.value.nonce !== journal.verificationNonce
    || verificationRead.value.freezeId !== journal.freezeId
    || verificationRead.value.databaseDigest !== journal.databaseDigest
    || verificationRead.value.contentDigest !== journal.contentDigest
    || canonical(verificationRead.value.inventoryDigests) !== canonical(journal.inventoryDigests)) {
    throw new Error("Cutover journal verification facts changed");
  }
  const verificationDirectory = directoryIdentityWithOwner(path.dirname(journal.verificationRecord.path));
  if (sha256(path.dirname(journal.verificationRecord.path)) !== journal.verificationRecord.directory.pathHash
    || verificationDirectory.device !== journal.verificationRecord.directory.device
    || verificationDirectory.inode !== journal.verificationRecord.directory.inode
    || verificationDirectory.mode !== journal.verificationRecord.directory.mode
    || verificationDirectory.uid !== journal.verificationRecord.directory.uid) {
    throw new Error("Cutover journal verification directory binding changed");
  }

  const freezeRead = readSecureCanonicalJson<FreezeRecord>(journal.freezeRecord.path, "Migration freeze record");
  if (!sameFileIdentity(freezeRead.identity, journal.freezeRecord.file)
    || freezeRead.sha256 !== journal.freezeRecord.sha256) {
    throw new Error("Cutover journal freeze record binding changed");
  }
  validateFreezeRecord(freezeRead.value, journal.runId, journal.freezeId, journal.stagePath, journal.stage);
  if (canonical(freezeRead.value.database) !== canonical(journal.freezeRecord.database)
    || canonical(freezeRead.value.wal) !== canonical(journal.freezeRecord.wal)
    || canonical(freezeRead.value.shm) !== canonical(journal.freezeRecord.shm)) {
    throw new Error("Cutover journal frozen file facts changed");
  }

  const databaseRoot = findJournalDatabaseRoot(journal);
  const persisted = readPersistedBindings(databaseRoot, journal.runId, journal.sourcePath);
  if (persisted.storeId !== journal.storeId
    || canonical(persisted.inventoryDigests) !== canonical(journal.inventoryDigests)
    || canonical(persisted.sourceIdentities) !== canonical(journal.sourceIdentities)) {
    throw new Error("Cutover journal staged database bindings changed");
  }
  if (persisted.phase === "ready" && new Set<CutoverState>([
    "prepared", "source-moved", "recovery-durable", "installed-moved", "smoke-passed", "restore-failed", "restore-new-moved",
  ]).has(journal.state) && generationTree(databaseRoot).digest !== journal.stageTreeDigest) {
    throw new Error("Cutover journal frozen generation digest changed");
  }
}

function findJournalDatabaseRoot(journal: CutoverJournal): string {
  for (const candidate of [journal.stagePath, journal.sourcePath, journal.rollbackPath]) {
    if (!exists(candidate)) continue;
    const identity = directoryIdentity(candidate);
    if (identity.device === journal.stage.device && identity.inode === journal.stage.inode) return candidate;
  }
  throw new Error("Cutover journal staged generation is unavailable");
}

function readPersistedBindings(root: string, runId: string, sourcePath: string): {
  phase: string;
  storeId: string;
  inventoryDigests: Record<string, string>;
  sourceIdentities: SourceIdentity[];
} {
  const databasePath = path.join(root, "ralphy.db");
  const walPath = `${databasePath}-wal`;
  const walHasFrames = exists(walPath) && fs.statSync(walPath).size > 0;
  const image = walHasFrames ? null : fs.readFileSync(databasePath);
  if (image && image[18] === 2 && image[19] === 2) { image[18] = 1; image[19] = 1; }
  const db = walHasFrames
    ? new Database(databasePath, { readonly: true, strict: true })
    : Database.deserialize(image!, { readonly: true });
  try {
    const phase = db.query<{ phase: string }, [string]>("SELECT phase FROM migration_runs WHERE id = ?").get(runId)?.phase;
    const storeId = db.query<{ storeId: string }, []>("SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1").get()?.storeId;
    if (!phase || !storeId) throw new Error("Cutover staged database binding is missing");
    const rows = db.query<{
      id: string; kind: string; label: string; pathHash: string; device: string; inode: string; mode: number; inventoryDigest: string | null;
    }, [string]>(
      `SELECT id, source_kind AS kind, source_label AS label, canonical_path_hash AS pathHash,
              source_device AS device, source_inode AS inode, source_mode AS mode,
              inventory_digest AS inventoryDigest
       FROM migration_sources WHERE migration_run_id = ? ORDER BY id`,
    ).all(runId);
    const primaryHash = sha256(sourcePath);
    const primary = rows.find((row) => row.kind === "ralphy" && row.pathHash === primaryHash);
    if (!primary) throw new Error("Cutover primary source binding is missing");
    for (const row of rows) if (!row.inventoryDigest || !isDigest(row.inventoryDigest)) {
      throw new Error("Cutover inventory binding is invalid");
    }
    return {
      phase,
      storeId,
      inventoryDigests: Object.fromEntries(rows.map((row) => [row.id, row.inventoryDigest!])),
      sourceIdentities: rows.filter((row) => row !== primary).map((row) => ({
        kind: row.kind, label: row.label, pathHash: row.pathHash, device: row.device,
        inode: row.inode, mode: row.mode, inventoryDigest: row.inventoryDigest!,
      })),
    };
  } finally { db.close(); }
}

function transition(
  journal: CutoverJournal,
  state: CutoverState,
  additions: Partial<CutoverJournal> = {},
): CutoverJournal {
  if (!STATE_TRANSITIONS[journal.state].includes(state)) {
    throw new Error(`Invalid cutover transition ${journal.state} -> ${state}`);
  }
  const { id: _id, ...body } = journal;
  const next = sealJournal({
    ...body,
    ...additions,
    state,
    transition: journal.transition + 1,
    updatedAt: Math.max(Date.now(), journal.updatedAt),
  });
  writeJournal(next, false);
  return next;
}

function sealJournal(body: JournalBody): CutoverJournal {
  return { id: sha256(canonical(body)), ...body };
}

function writeJournal(journal: CutoverJournal, create: boolean): void {
  const parent = path.dirname(journal.journalPath);
  assertExactRealDirectory(parent, "Cutover journal parent");
  if (create) assertAbsent(journal.journalPath);
  else {
    const current = readCutoverJournal(journal.journalPath);
    if (current.runId !== journal.runId || current.nonce !== journal.nonce
      || current.transition + 1 !== journal.transition) throw new Error("Cutover journal changed before transition");
  }
  const temp = `${journal.journalPath}.tmp-${randomUUID()}`;
  let fd: number | null = null;
  try {
    cutoverFault("journal-temp-create");
    fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    const raw = `${canonical(journal)}\n`;
    cutoverFault("journal-temp-write");
    fs.writeFileSync(fd, raw, "utf8");
    cutoverFault("journal-file-fsync");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if ((fs.lstatSync(temp).mode & 0o777) !== 0o600) throw new Error("Cutover journal temp mode is invalid");
    cutoverFault("journal-rename");
    if (create) {
      fs.linkSync(temp, journal.journalPath);
      fsyncDirectory(parent);
      cutoverFault("journal-publish-linked");
      fs.unlinkSync(temp);
    } else {
      readCutoverJournal(journal.journalPath);
      fs.renameSync(temp, journal.journalPath);
    }
    cutoverFault("journal-parent-fsync");
    fsyncDirectory(parent);
  } catch (error) {
    if (fd !== null) fs.closeSync(fd);
    try {
      const stat = fs.lstatSync(temp);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === effectiveUid()) fs.unlinkSync(temp);
    } catch { /* No owned unpublished temp remains. */ }
    throw error;
  }
}

type JournalLock = {
  version: 1;
  kind: "cutover-journal-lock";
  runId: string;
  nonce: string;
  journalPath: string;
  journalDevice: string;
  journalInode: string;
  processIdentity: MigrationProcessIdentity;
  createdAt: number;
};

type OwnedJournalLock = { lock: JournalLock; identity: SecureFileIdentity; raw: string };

function withJournalLock<T>(
  journalOrPath: CutoverJournal | string,
  action: (journal: CutoverJournal) => T,
  beforeAction?: (journal: CutoverJournal) => void,
): T {
  const pathValue = typeof journalOrPath === "string" ? journalOrPath : journalOrPath.journalPath;
  const journal = readCutoverJournal(pathValue);
  const owned = acquireJournalLock(journal);
  try {
    cutoverFault("cutover-lock-acquired");
    const rebound = readCutoverJournal(pathValue);
    const reboundStat = fs.lstatSync(pathValue);
    if (rebound.nonce !== journal.nonce || rebound.id !== journal.id
      || String(reboundStat.dev) !== owned.lock.journalDevice || String(reboundStat.ino) !== owned.lock.journalInode) {
      throw new Error("Cutover journal changed after lock acquisition");
    }
    const normalized = normalizeLaggingJournal(rebound);
    assertFilesystemStateIsUnambiguous(normalized);
    beforeAction?.(normalized);
    return action(normalized);
  } finally {
    cutoverFault("cutover-lock-before-release");
    releaseJournalLock(owned);
  }
}

function acquireJournalLock(journal: CutoverJournal): OwnedJournalLock {
  const lockPath = path.join(path.dirname(journal.sourcePath), ".ralphy-migration.lock");
  const currentInspection = processInspector.inspect(processInspector.currentPid());
  if (currentInspection.status !== "present") throw new Error("Current cutover lock owner identity is unavailable");
  const journalStat = fs.lstatSync(journal.journalPath);
  const lock: JournalLock = {
    version: 1,
    kind: "cutover-journal-lock",
    runId: journal.runId,
    nonce: randomUUID(),
    journalPath: journal.journalPath,
    journalDevice: String(journalStat.dev),
    journalInode: String(journalStat.ino),
    processIdentity: currentInspection.identity,
    createdAt: Date.now(),
  };
  let existing: OwnedJournalLock | null = null;
  if (exists(lockPath)) {
    try {
      existing = readJournalLock(lockPath);
    } catch {
      reclaimDeadMaintenanceLockForCutover({ sourcePath: journal.sourcePath, runId: journal.runId });
    }
  } else if (hasMaintenanceLockTransition(lockPath)) {
    reclaimDeadMaintenanceLockForCutover({ sourcePath: journal.sourcePath, runId: journal.runId });
  }
  if (existing) {
    if (existing.lock.runId !== journal.runId || existing.lock.journalPath !== journal.journalPath) {
      throw new Error("Migration maintenance lock belongs to another operation");
    }
    const owner = processInspector.inspect(existing.lock.processIdentity.pid);
    if (owner.status === "unknown") throw new Error("Cutover journal lock owner is unknown");
    if (owner.status === "present" && sameProcessIdentity(owner.identity, existing.lock.processIdentity)) {
      throw new Error("Cutover journal lock is held by a live exact owner");
    }
    unlinkOwnedLock(existing, lockPath);
    fsyncDirectory(path.dirname(lockPath));
  }
  const raw = `${canonical(lock)}\n`;
  const tempPath = `${lockPath}.tmp-${randomUUID()}`;
  let fd: number | null = null;
  let published: OwnedJournalLock | null = null;
  try {
    cutoverFault("lock-temp-create");
    fd = fs.openSync(tempPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    cutoverFault("lock-temp-write");
    fs.writeFileSync(fd, raw, "utf8");
    cutoverFault("lock-file-fsync");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    cutoverFault("lock-publish");
    fs.linkSync(tempPath, lockPath);
    fsyncDirectory(path.dirname(lockPath));
    cutoverFault("lock-publish-linked");
    fs.unlinkSync(tempPath);
    published = readJournalLock(lockPath);
    if (published.raw !== raw) throw new Error("Cutover journal lock publication changed");
    cutoverFault("lock-parent-fsync");
    fsyncDirectory(path.dirname(lockPath));
    return published;
  } catch (error) {
    if (fd !== null) fs.closeSync(fd);
    try { fs.unlinkSync(tempPath); } catch { /* No unpublished temp remains. */ }
    if (published) {
      try { unlinkOwnedLock(published, lockPath); fsyncDirectory(path.dirname(lockPath)); }
      catch { /* Never delete a replacement lock. */ }
    }
    throw error;
  }
}

function hasMaintenanceLockTransition(lockPath: string): boolean {
  const parent = path.dirname(lockPath);
  const basename = path.basename(lockPath);
  return fs.readdirSync(parent).some((name) =>
    name === `${basename}.quarantine`
    || name.startsWith(`${basename}.quarantine.delete-`),
  );
}

function releaseJournalLock(owned: OwnedJournalLock): void {
  const current = processInspector.inspect(processInspector.currentPid());
  if (current.status !== "present" || !sameProcessIdentity(current.identity, owned.lock.processIdentity)) {
    throw new Error("Cutover journal lock is not owned by the current process");
  }
  unlinkOwnedLock(owned, path.join(path.dirname(owned.lock.journalPath), ".ralphy-migration.lock"));
  fsyncDirectory(path.dirname(owned.lock.journalPath));
}

function readJournalLock(lockPath: string): OwnedJournalLock {
  const read = readSecureCanonicalJson<JournalLock>(lockPath, "Cutover journal lock");
  const lock = read.value;
  if (!isPlainObject(lock) || !exactKeys(lock, [
    "version", "kind", "runId", "nonce", "journalPath", "journalDevice", "journalInode", "processIdentity", "createdAt",
  ]) || lock.version !== 1 || lock.kind !== "cutover-journal-lock" || !/^mig_[A-Za-z0-9-]+$/u.test(lock.runId)
    || !isUuid(lock.nonce) || path.resolve(lock.journalPath) !== lock.journalPath
    || !/^\d+$/u.test(lock.journalDevice) || !/^\d+$/u.test(lock.journalInode)
    || !validProcessIdentity(lock.processIdentity) || !Number.isSafeInteger(lock.createdAt) || lock.createdAt <= 0) {
    throw new Error("Cutover journal lock is invalid");
  }
  return { lock, identity: read.identity, raw: read.raw };
}

function unlinkOwnedLock(owned: OwnedJournalLock, lockPath: string): void {
  const current = readJournalLock(lockPath);
  if (current.raw !== owned.raw || !sameFileIdentity(current.identity, owned.identity)) {
    throw new Error("Cutover journal lock changed before owned release");
  }
  fs.unlinkSync(lockPath);
}

function assertFilesystemStateIsUnambiguous(journal: CutoverJournal): void {
  const present = [journal.sourcePath, journal.stagePath, journal.recoveryPath, journal.rollbackPath].filter(exists);
  if (present.length > 3) throw new Error("Cutover generations are ambiguous");
  if (journal.state === "prepared" && exists(journal.sourcePath)) {
    assertDirectoryIdentity(journal.sourcePath, journal.source, "source", true);
  }
  if (!new Set(["prepared", "rolled-back", "installed", "installed-moved", "smoke-passed", "restore-failed", "rollback-new-moved"]).has(journal.state)
    && exists(journal.sourcePath)) {
    throw new Error("Cutover live source unexpectedly exists for the journal state");
  }
}

function normalizeLaggingJournal(initial: CutoverJournal): CutoverJournal {
  let journal = initial;
  const source = existingIdentity(journal.sourcePath);
  const stage = existingIdentity(journal.stagePath);
  const recovery = existingIdentity(journal.recoveryPath);
  const rollback = existingIdentity(journal.rollbackPath);
  const isIdentity = (actual: CutoverIdentity | null, expected: CutoverIdentity): boolean =>
    actual?.device === expected.device && actual.inode === expected.inode;

  if (journal.state === "prepared" && source === null && isIdentity(stage, journal.stage)
    && isIdentity(recovery, journal.source) && rollback === null) {
    journal = transition(journal, "source-moved");
  }
  if (journal.state === "recovery-durable" && isIdentity(source, journal.stage)
    && stage === null && isIdentity(recovery, journal.source) && rollback === null) {
    journal = transition(journal, "installed-moved");
  }
  if (journal.state === "installed-moved" && source === null && isIdentity(stage, journal.stage)
    && isIdentity(recovery, journal.source) && rollback === null) {
    journal = transition(journal, "restore-new-moved");
  }
  if (journal.state === "restore-failed" && source === null && isIdentity(stage, journal.stage)
    && isIdentity(recovery, journal.source) && rollback === null) {
    journal = transition(journal, "restore-new-moved");
  }
  if (journal.state === "restore-new-moved" && isIdentity(source, journal.source)
    && isIdentity(stage, journal.stage) && recovery === null && rollback === null) {
    journal = transition(journal, "rolled-back");
  }
  if ((journal.state === "source-moved" || journal.state === "recovery-durable")
    && isIdentity(source, journal.source) && isIdentity(stage, journal.stage)
    && recovery === null && rollback === null) {
    journal = transition(journal, "rolled-back");
  }
  if (new Set<CutoverState>(["installed-moved", "smoke-passed", "installed"]).has(journal.state)
    && isIdentity(rollback, journal.stage)) {
    if ((source === null && isIdentity(recovery, journal.source))
      || (isIdentity(source, journal.source) && recovery === null)) {
      journal = transition(journal, "rollback-new-moved");
    }
  }
  return journal;
}

function existingIdentity(value: string): CutoverIdentity | null {
  return exists(value) ? directoryIdentity(value) : null;
}

function readSecureCanonicalJson<T>(
  filePath: string,
  label: string,
  afterRead?: (() => void) | null,
): { value: T; raw: string; identity: SecureFileIdentity; sha256: string } {
  const resolved = path.resolve(filePath);
  if (label === "Cutover journal" || label === "Cutover journal lock") {
    collapseExactPublicationPair(resolved, label);
  }
  let fd: number;
  try { fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch (error) { throw new Error(`${label} is unavailable or a symlink`, { cause: error }); }
  try {
    const before = secureFileIdentity(fs.fstatSync(fd), label);
    if (before.bytes <= 0 || before.bytes > 4 * 1024 * 1024) throw new Error(`${label} size is invalid`);
    const raw = fs.readFileSync(fd, "utf8");
    afterRead?.();
    const afterFd = secureFileIdentity(fs.fstatSync(fd), label);
    const afterPath = secureFileIdentity(fs.lstatSync(resolved), label);
    if (!sameFileIdentity(before, afterFd) || !sameFileIdentity(before, afterPath)) {
      throw new Error(`${label} changed during pinned read`);
    }
    let value: T;
    try { value = JSON.parse(raw) as T; }
    catch (error) { throw new Error(`${label} JSON is invalid`, { cause: error }); }
    if (raw !== `${canonical(value)}\n`) throw new Error(`${label} is not canonical JSON`);
    return { value, raw, identity: before, sha256: sha256(raw) };
  } finally { fs.closeSync(fd); }
}

function collapseExactPublicationPair(finalPath: string, label: string): void {
  let finalStat: fs.Stats;
  try { finalStat = fs.lstatSync(finalPath); }
  catch { return; }
  if (finalStat.nlink !== 2) return;
  if (!finalStat.isFile() || finalStat.isSymbolicLink() || finalStat.uid !== effectiveUid()
    || (finalStat.mode & 0o777) !== 0o600) throw new Error(`${label} linked publication identity is invalid`);
  const parent = path.dirname(finalPath);
  const prefix = `${path.basename(finalPath)}.tmp-`;
  const candidates = fs.readdirSync(parent).filter((name) => {
    if (!name.startsWith(prefix) || !isUuid(name.slice(prefix.length))) return false;
    try {
      const stat = fs.lstatSync(path.join(parent, name));
      return stat.isFile() && !stat.isSymbolicLink() && stat.uid === finalStat.uid
        && (stat.mode & 0o777) === 0o600 && stat.nlink === 2
        && String(stat.dev) === String(finalStat.dev) && String(stat.ino) === String(finalStat.ino);
    } catch { return false; }
  });
  if (candidates.length !== 1) throw new Error(`${label} linked publication pair is ambiguous`);
  const tempPath = path.join(parent, candidates[0]!);
  fs.unlinkSync(tempPath);
  fsyncDirectory(parent);
  const settled = fs.lstatSync(finalPath);
  if (settled.nlink !== 1 || String(settled.dev) !== String(finalStat.dev) || String(settled.ino) !== String(finalStat.ino)) {
    throw new Error(`${label} linked publication did not settle exactly`);
  }
}

function secureFileIdentity(stat: fs.Stats, label: string): SecureFileIdentity {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== effectiveUid()
    || (stat.mode & 0o777) !== 0o600) throw new Error(`${label} file identity, owner, link count, or mode is invalid`);
  return {
    device: String(stat.dev), inode: String(stat.ino), mode: stat.mode & 0o777,
    uid: stat.uid, nlink: stat.nlink, bytes: stat.size,
  };
}

function generationTree(root: string): { digest: string; contentDigest: string; databaseDigest: string; entries: unknown[] } {
  const entries: Array<Record<string, unknown>> = [];
  const visit = (directory: string): void => {
    const children = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolute = path.join(directory, child.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error("Cutover generation contains a symlink");
      if (stat.isDirectory()) {
        entries.push({ relative, kind: "directory", mode: stat.mode & 0o777 });
        visit(absolute);
      } else if (stat.isFile()) {
        const file = inspectStableRegularFile(absolute);
        entries.push({ relative, kind: "file", mode: file.mode, bytes: file.bytes, sha256: file.sha256 });
      } else throw new Error("Cutover generation contains an unsupported filesystem entry");
    }
  };
  visit(root);
  const database = entries.find((entry) => entry.relative === "ralphy.db" && entry.kind === "file");
  if (!database || typeof database.sha256 !== "string") throw new Error("Cutover generation database is missing");
  const contentEntries = entries
    .filter((entry) => entry.kind === "file")
    .map((entry) => ({ relative: entry.relative, bytes: entry.bytes, sha256: entry.sha256 }));
  return {
    digest: sha256(canonical(entries)),
    contentDigest: sha256(canonical(contentEntries)),
    databaseDigest: database.sha256,
    entries,
  };
}

function checkpoint(db: Database): void {
  const row = db.query<{ busy: number; log: number; checkpointed: number }, []>("PRAGMA wal_checkpoint(TRUNCATE)").get();
  if (!row || row.busy !== 0 || row.log !== 0 || row.checkpointed !== 0) {
    throw new Error("Cutover WAL checkpoint is incomplete");
  }
}

function directoryIdentity(value: string): CutoverIdentity {
  const stat = fs.lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Cutover root must be a real directory: ${value}`);
  return { device: String(stat.dev), inode: String(stat.ino), mode: stat.mode & 0o777 };
}

function directoryIdentityWithOwner(value: string): CutoverIdentity & { uid: number } {
  const identity = directoryIdentity(value);
  const stat = fs.lstatSync(value);
  if (stat.uid !== effectiveUid()) throw new Error("Migration directory owner is invalid");
  return { ...identity, uid: stat.uid };
}

function assertDirectoryIdentity(value: string, expected: CutoverIdentity, label: string, mode: boolean): void {
  const actual = directoryIdentity(value);
  if (actual.device !== expected.device || actual.inode !== expected.inode || (mode && actual.mode !== expected.mode)) {
    throw new Error(`Cutover ${label} identity mismatch`);
  }
}

function assertMode(value: string, mode: number, label: string): void {
  if ((fs.lstatSync(value).mode & 0o777) !== mode) throw new Error(`Cutover ${label} mode mismatch`);
}

function safeSourcePath(value: string, requireExisting: boolean): string {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error("Cutover source path must be absolute");
  const resolved = path.resolve(value);
  if (path.basename(resolved) !== ".ralphy" || resolved === path.parse(resolved).root || resolved === os.homedir()) {
    throw new Error("Cutover source must be an exact .ralphy directory outside protected roots");
  }
  assertExactRealDirectory(path.dirname(resolved), "Cutover source parent");
  if (requireExisting) {
    if (fs.realpathSync(resolved) !== resolved) throw new Error("Cutover source path is not exact");
    directoryIdentity(resolved);
  } else if (exists(resolved)) {
    if (fs.realpathSync(resolved) !== resolved) throw new Error("Cutover source path is not exact");
    directoryIdentity(resolved);
  }
  return resolved;
}

function exactRealDirectory(value: string, label: string): string {
  const resolved = path.resolve(value);
  if (fs.realpathSync(resolved) !== resolved) throw new Error(`${label} is not an exact real directory`);
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== effectiveUid()) {
    throw new Error(`${label} identity or owner is invalid`);
  }
  return resolved;
}

function assertExactRealDirectory(value: string, label: string): void {
  exactRealDirectory(value, label);
}

function renameExact(from: string, to: string): void {
  assertAbsent(to);
  const before = directoryIdentity(from);
  fs.renameSync(from, to);
  const after = directoryIdentity(to);
  if (before.device !== after.device || before.inode !== after.inode) throw new Error("Cutover rename identity changed");
}

function assertAbsent(value: string): void {
  if (exists(value)) throw new Error(`Cutover path already exists: ${value}`);
}

function exists(value: string): boolean {
  try { fs.lstatSync(value); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function safeRunId(value: string): string {
  if (!/^mig_[A-Za-z0-9-]+$/u.test(value)) throw new Error("Migration Run ID is unsafe");
  return value;
}

function safeDigest(value: string, label: string): string {
  if (!isDigest(value)) throw new Error(`Migration ${label} is invalid`);
  return value;
}

function safeUuid(value: string, label: string): string {
  if (!isUuid(value)) throw new Error(`Migration ${label} is invalid`);
  return value;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function validDigestMap(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.keys(value).length > 0 && Object.values(value).every(isDigest);
}

function validFrozenFact(value: unknown, required: boolean): value is FrozenFileFact {
  if (!isPlainObject(value) || !exactKeys(value, ["exists", "bytes", "mtimeMs", "sha256"])
    || typeof value.exists !== "boolean" || typeof value.bytes !== "number"
    || typeof value.mtimeMs !== "number" || !(value.sha256 === null || isDigest(value.sha256))) return false;
  return required ? value.exists && isDigest(value.sha256) : value.exists ? isDigest(value.sha256) : value.sha256 === null;
}

function validIdentity(value: unknown): value is CutoverIdentity {
  return isPlainObject(value) && /^\d+$/u.test(String(value.device)) && /^\d+$/u.test(String(value.inode))
    && Number.isSafeInteger(value.mode) && Number(value.mode) >= 0 && Number(value.mode) <= 0o7777;
}

function validSecureFileIdentity(value: unknown): value is SecureFileIdentity {
  return isPlainObject(value) && exactKeys(value, ["device", "inode", "mode", "uid", "nlink", "bytes"])
    && /^\d+$/u.test(String(value.device)) && /^\d+$/u.test(String(value.inode))
    && value.mode === 0o600 && Number.isSafeInteger(value.uid) && Number(value.uid) >= 0
    && value.nlink === 1 && Number.isSafeInteger(value.bytes) && Number(value.bytes) > 0;
}

function validSourceIdentity(value: unknown): value is SourceIdentity {
  return isPlainObject(value)
    && exactKeys(value, ["kind", "label", "pathHash", "device", "inode", "mode", "inventoryDigest"])
    && typeof value.kind === "string" && typeof value.label === "string"
    && isDigest(value.pathHash) && /^\d+$/u.test(String(value.device)) && /^\d+$/u.test(String(value.inode))
    && Number.isSafeInteger(value.mode) && Number(value.mode) >= 0 && isDigest(value.inventoryDigest);
}

function validProcessIdentity(value: unknown): value is MigrationProcessIdentity {
  if (!isPlainObject(value) || !exactKeys(value, ["pid", "parentPid", "uid", "startId", "executable"])
    || !Number.isSafeInteger(value.pid) || Number(value.pid) <= 0
    || !Number.isSafeInteger(value.parentPid) || Number(value.parentPid) < 0
    || !Number.isSafeInteger(value.uid) || Number(value.uid) < 0
    || typeof value.startId !== "string" || !isPlainObject(value.executable)
    || !exactKeys(value.executable, ["pathHash", "device", "inode", "mode", "uid", "nlink"])) return false;
  const executable = value.executable;
  return isDigest(executable.pathHash) && /^\d+$/u.test(String(executable.device)) && /^\d+$/u.test(String(executable.inode))
    && Number.isSafeInteger(executable.mode) && Number.isSafeInteger(executable.uid)
    && Number.isSafeInteger(executable.nlink) && Number(executable.nlink) >= 1;
}

function sameProcessIdentity(left: MigrationProcessIdentity, right: MigrationProcessIdentity): boolean {
  return canonical(left) === canonical(right);
}

function sameFileIdentity(left: SecureFileIdentity, right: SecureFileIdentity): boolean {
  return left.device === right.device && left.inode === right.inode && left.mode === right.mode
    && left.uid === right.uid && left.nlink === right.nlink && left.bytes === right.bytes;
}

function assertRecordDigest(record: Record<string, unknown>, expected: string, label: string): void {
  if (!isPlainObject(record) || record.id !== expected) throw new Error(`${label} ID is invalid`);
  const { id: _id, ...body } = record;
  if (sha256(canonical(body)) !== expected) throw new Error(`${label} digest is invalid`);
}

function assertExactInputKeys(input: object, keys: string[]): void {
  if (canonical(Object.keys(input).sort()) !== canonical([...keys].sort())) {
    throw new Error("Cutover caller-selected path or option field is forbidden");
  }
}

function hashFile(file: string): string {
  return inspectStableRegularFile(file).sha256;
}

function inspectStableRegularFile(file: string): { mode: number; bytes: number; sha256: string } {
  const beforePath = fs.lstatSync(file);
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) throw new Error("Cutover generation file is not regular");
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const beforeFd = fs.fstatSync(fd);
    assertStableFileSnapshot(beforePath, beforeFd);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytes = 0;
    while (true) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      fileReadObserverForTesting?.(read);
      hash.update(buffer.subarray(0, read));
      bytes += read;
    }
    const afterFd = fs.fstatSync(fd);
    const afterPath = fs.lstatSync(file);
    assertStableFileSnapshot(beforeFd, afterFd);
    assertStableFileSnapshot(beforeFd, afterPath);
    if (bytes !== beforeFd.size) throw new Error("Cutover generation file size changed while hashing");
    return { mode: beforeFd.mode & 0o777, bytes, sha256: hash.digest("hex") };
  } finally { fs.closeSync(fd); }
}

function assertStableFileSnapshot(expected: fs.Stats, actual: fs.Stats): void {
  if (!actual.isFile() || actual.isSymbolicLink()
    || String(actual.dev) !== String(expected.dev) || String(actual.ino) !== String(expected.ino)
    || actual.mode !== expected.mode || actual.uid !== expected.uid || actual.gid !== expected.gid
    || actual.nlink !== expected.nlink || actual.size !== expected.size
    || actual.mtimeMs !== expected.mtimeMs || actual.ctimeMs !== expected.ctimeMs) {
    throw new Error("Cutover generation file changed while hashing");
  }
}

function effectiveUid(): number {
  return typeof process.geteuid === "function" ? process.geteuid() : process.getuid?.() ?? 0;
}

function fsyncDirectory(directory: string): void {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function cutoverFault(point: CutoverFaultPoint): void {
  cutoverFaultForTesting?.(point);
}

function canonical(value: unknown): string { return JSON.stringify(value); }
function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return canonical(Object.keys(value).sort()) === canonical([...keys].sort());
}

function errorWithCause(message: string, cause: unknown, state: string): Error {
  const detail = cause instanceof Error ? `: ${cause.message}` : "";
  return new Error(`${message} (${state})${detail}`, { cause });
}

function requireTestRuntime(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Cutover fault injection requires the test runtime");
}
