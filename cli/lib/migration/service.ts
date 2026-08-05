import path from "node:path";
import fs from "node:fs";
import { Database } from "bun:sqlite";
import { openDomainDbAt } from "../store/db.js";
import { newDomainId } from "../store/ids.js";
import {
  acquireMaintenanceLock,
  assertMigrationMaintenanceLock,
  assertOwnedMaintenanceLock,
  assertMigrationQuiescent,
  auditMigration,
  createMigrationSourceRoot,
  inventoryLegacySource,
  readMigrationStatus,
  releaseMaintenanceLock,
} from "./inventory.js";
import {
  importDesktopStateAndSecrets,
  importExecutionAndOperations,
  importProductionAndDelivery,
  importScopesAndDocuments,
} from "./import.js";
import { stageInventoryObjects } from "./staging.js";
import { freezeMigration, verifyMigration } from "./verify.js";
import { runDesktopSecretHandoff } from "./desktop-authorization.js";
import { ensureMigrationPrivateDirectory, migrationPrivatePaths } from "./private-paths.js";
import {
  assertStartupJournalReady,
  createVerifiedCutoverJournal,
  executeCutover,
  migrationCutoverPaths,
  readCutoverJournal,
  recoverCutover as recoverCutoverJournal,
  rollbackCutover as rollbackCutoverJournal,
} from "./cutover-journal.js";
import type {
  MigrationAudit,
  MigrationContext,
  MigrationLock,
  MigrationPhase,
  MigrationSourceRoot,
  MigrationStatus,
} from "./types.js";

export type StartMigrationInput = {
  sourceRoots: readonly { id?: string; kind: MigrationSourceRoot["kind"]; path: string }[];
  /** Caller-selected stores are rejected; retained only to fail old callers safely. */
  storeRoot?: string;
  copyMode?: "clone" | "copy";
};

export type StartMigrationResult = {
  runId: string;
  storeRoot: string;
  lock: MigrationLock;
  cloneSupport: "supported" | "copy-mode";
  audit: MigrationAudit;
  status: MigrationStatus;
};

export function startMigration(input: StartMigrationInput): StartMigrationResult {
  if (input.storeRoot !== undefined) throw new Error("Migration store target is derived from the exact source and Run ID");
  assertMigrationRootsStartupReady(input.sourceRoots);
  const roots = migrationRoots(input.sourceRoots);
  const source = primarySource(roots);
  assertNarrowSource(source.path);
  const audit = auditMigration({ sourceRoots: roots });
  const blocker = audit.blockers.find((issue) => issue.severity === "block");
  if (blocker) throw new Error(`Migration audit is blocked: ${blocker.code}`);
  const runId = newDomainId("mig");
  const paths = migrationPaths(source.path, runId);
  assertMigrationPathsAvailable(paths);
  const lock = acquireMaintenanceLock({ sourcePath: source.path, runId });
  let createdStage = false;
  let createdManifest = false;
  let createdPrivateRoot = false;
  try {
    const startGate = (): void => {
      assertOwnedMaintenanceLock(lock);
      assertMigrationQuiescent(roots.map((root) => root.path));
    };
    startGate();
    fs.mkdirSync(paths.runRoot, { recursive: true, mode: 0o700 });
    createdStage = true;
    ensureMigrationPrivateDirectory(source.path, runId);
    createdPrivateRoot = true;
    startGate();
    writeSourceManifest(paths.sourceManifestPath, runId, roots);
    createdManifest = true;
    startGate();
    if (fs.lstatSync(paths.runRoot).dev !== fs.lstatSync(source.path).dev) {
      throw new Error("Migration stage and source must use the same device");
    }
    const cloneSupport = probeCloneSupport(paths.runRoot, input.copyMode ?? "clone", audit);
    const now = Date.now();
    const db = openDomainDbAt(paths.storeRoot);
    try {
      db.prepare(
        `INSERT INTO migration_runs
         (id, stage_root_rel, recovery_root_rel, phase, created_at, updated_at)
         VALUES (?, ?, ?, 'audited', ?, ?)`,
      ).run(runId, paths.stageRootRel, paths.recoveryRootRel, now, now);
      const status = readMigrationStatus(db, runId);
      if (!status) throw new Error("Migration Run was not created");
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      assertOwnedMaintenanceLock(lock);
      assertMigrationQuiescent([...roots.map((root) => root.path), paths.storeRoot]);
      return { runId, storeRoot: paths.storeRoot, lock, cloneSupport, audit, status };
    } finally {
      db.close();
    }
  } catch (error) {
    if (createdStage) fs.rmSync(paths.runRoot, { recursive: true, force: true });
    if (createdManifest) fs.rmSync(paths.sourceManifestPath, { force: true });
    if (createdPrivateRoot) fs.rmSync(paths.privateRoot, { recursive: true, force: true });
    releaseMaintenanceLock(lock);
    throw error;
  }
}

export async function resumeMigration(input: {
  runId: string;
  storeRoot?: string;
  sourceRoots: readonly { id?: string; kind: MigrationSourceRoot["kind"]; path: string }[];
  lock?: MigrationLock;
  /** Exact packaged Desktop helper executable; required while safeStorage handoffs are pending. */
  desktopExecutable?: string;
  desktopHandoffTimeoutMs?: number;
  /** @internal Deterministic Desktop controller seam. */
  desktopHandoffRunnerForTesting?: typeof runDesktopSecretHandoff;
  /** @internal Deterministic orchestration seam. */
  afterStepForTesting?: (step: string) => void;
  /** @internal Deterministic pre-gate seam. */
  beforeStepForTesting?: (step: string) => void;
  /** @internal Pinned-manifest replacement-race seam. */
  afterSourceManifestOpenForTesting?: () => void;
}): Promise<{ status: MigrationStatus; inventory: Awaited<ReturnType<typeof inventoryLegacySource>> | null }> {
  assertMigrationRootsStartupReady(input.sourceRoots);
  const requestedRoots = migrationRoots(input.sourceRoots);
  const source = primarySource(requestedRoots);
  const expectedStoreRoot = migrationPaths(source.path, input.runId).storeRoot;
  if (input.storeRoot !== undefined && path.resolve(input.storeRoot) !== expectedStoreRoot) {
    throw new Error("Migration store target does not match the derived Run stage");
  }
  const roots = readSourceManifest(
    migrationPaths(source.path, input.runId).sourceManifestPath,
    input.runId,
    input.afterSourceManifestOpenForTesting,
  );
  assertRequestedRoots(requestedRoots, roots);
  const initialLocation = stageLocationIdentity(expectedStoreRoot);
  const needsWalRecovery = stagedWalHasBytes(expectedStoreRoot);
  const fastValidated = needsWalRecovery
    ? null
    : readValidatedRun(source.path, input.runId, expectedStoreRoot);
  if (fastValidated && !["audited", "inventory", "import", "objects", "relations"].includes(fastValidated.phase)) {
    throw new Error("Migration Run is frozen or terminal and cannot be resumed");
  }
  const lock = input.lock ?? acquireMaintenanceLock({
      sourcePath: source.path,
      runId: input.runId,
      reclaim: "resume",
    });
  let db: Database | null = null;
  let verifiedLockOwnership = false;
  try {
    assertOwnedMaintenanceLock(lock);
    verifiedLockOwnership = true;
    assertMigrationQuiescent([...roots.map((root) => root.path), expectedStoreRoot]);
    assertStageLocationIdentity(expectedStoreRoot, initialLocation);
    const sqliteFiles = sqliteFileLocationIdentity(expectedStoreRoot);
    const walAware = fastValidated
      ?? readWalAwareValidatedRun(source.path, input.runId, expectedStoreRoot, roots);
    if (needsWalRecovery) assertPreservedSqliteFiles(expectedStoreRoot, sqliteFiles);
    if (!["audited", "inventory", "import", "objects", "relations"].includes(walAware.phase)) {
      throw new Error("Migration Run is frozen or terminal and cannot be resumed");
    }
    assertRequestedRoots(roots, readSourceManifest(
      migrationPaths(source.path, input.runId).sourceManifestPath,
      input.runId,
    ));
    assertOwnedMaintenanceLock(lock);
    assertStageLocationIdentity(expectedStoreRoot, initialLocation);
    assertMigrationQuiescent([...roots.map((root) => root.path), expectedStoreRoot]);
    if (needsWalRecovery) checkpointCrashedStage(expectedStoreRoot);
    assertOwnedMaintenanceLock(lock);
    assertStageLocationIdentity(expectedStoreRoot, initialLocation);
    assertMigrationQuiescent([...roots.map((root) => root.path), expectedStoreRoot]);
    const pinnedStage = stageIdentity(expectedStoreRoot);
    const validated = readValidatedRun(source.path, input.runId, expectedStoreRoot);
    if (validated.phase !== walAware.phase) throw new Error("Migration Run phase changed during crash recovery");
    assertStageIdentity(expectedStoreRoot, pinnedStage);
    assertOwnedMaintenanceLock(lock);
    db = openDomainDbAt(expectedStoreRoot);
    const row = db.query<{ phase: MigrationPhase; stageRootRel: string | null }, [string]>(
      "SELECT phase, stage_root_rel AS stageRootRel FROM migration_runs WHERE id = ?",
    ).get(input.runId);
    if (!row) throw new Error("Migration Run not found");
    if (row.stageRootRel !== migrationPaths(source.path, input.runId).stageRootRel) {
      throw new Error("Migration Run stage does not match its derived store");
    }
    if (!["audited", "inventory", "import", "objects", "relations"].includes(row.phase)) {
      throw new Error("Migration Run is frozen or terminal and cannot be resumed");
    }
    const context: MigrationContext = { db, storeRoot: expectedStoreRoot, sourceRoots: roots, runId: input.runId };
    const manifestPath = migrationPaths(source.path, input.runId).sourceManifestPath;
    const gate = (location?: ReturnType<typeof stageLocationIdentity>): void => {
      if (location) assertStageLocationIdentity(expectedStoreRoot, location);
      assertOwnedMaintenanceLock(lock);
      assertMigrationMaintenanceLock(context);
      assertRequestedRoots(roots, readSourceManifest(manifestPath, input.runId));
      validateManifestIfInventoried(db!, input.runId, roots);
    };
    const runStep = async (name: string, action: () => unknown | Promise<unknown>, report = true): Promise<unknown> => {
      if (report) input.beforeStepForTesting?.(name);
      const location = stageLocationIdentity(expectedStoreRoot);
      gate(location);
      assertMigrationQuiescent([...roots.map((root) => root.path), expectedStoreRoot]);
      try {
        const result = await action();
        if (report) input.afterStepForTesting?.(name);
        return result;
      } finally {
        gate(location);
        db!.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        gate(location);
        assertMigrationQuiescent([...roots.map((root) => root.path), expectedStoreRoot]);
      }
    };
    const beganBeforeScopes = row.phase === "audited" || row.phase === "inventory";
    const beganBeforeObjects = beganBeforeScopes || row.phase === "import";
    const beganBeforeRelations = beganBeforeObjects || row.phase === "objects";
    const inventory = beganBeforeScopes
      ? await runStep("inventory", () => inventoryLegacySource(context)) as Awaited<ReturnType<typeof inventoryLegacySource>>
      : null;
    validateManifestAgainstStore(db, input.runId, roots);
    if (beganBeforeScopes) await runStep("scopes", () => importScopesAndDocuments(context));
    if (beganBeforeObjects) await runStep("stage-initial", () => stageInventoryObjects(context));
    if (beganBeforeRelations) {
      await runStep("jobs", () => importExecutionAndOperations(context));
      await runStep("stage-after-jobs", () => stageInventoryObjects(context));
      await runStep("production", () => importProductionAndDelivery(context));
    }
    await runStep("desktop", () => importDesktopStateAndSecrets(context));
    await runStep("desktop-handoffs", async () => {
      const pending = pendingDesktopHandoffs(db!, input.runId, roots);
      if (pending.length > 0 && !input.desktopHandoffRunnerForTesting && !input.desktopExecutable) {
        throw new Error("Desktop safeStorage handoff requires an explicit Desktop helper executable");
      }
      const runner = input.desktopHandoffRunnerForTesting ?? runDesktopSecretHandoff;
      for (const handoff of pending) {
        gate();
        assertMigrationQuiescent([...roots.map((root) => root.path), expectedStoreRoot]);
        await runner({
          sourcePath: source.path,
          runId: input.runId,
          lock,
          stagedRoot: expectedStoreRoot,
          encryptedSourcePath: handoff.encryptedSourcePath,
          sourceEntryId: handoff.sourceEntryId,
          ref: handoff.ref,
          kind: handoff.kind,
          desktopExecutable: input.desktopExecutable ?? "",
          timeoutMs: input.desktopHandoffTimeoutMs ?? 30_000,
        });
        gate();
        assertMigrationQuiescent([...roots.map((root) => root.path), expectedStoreRoot]);
        assertDesktopHandoffCompleted(db!, input.runId, handoff);
      }
      if (pendingDesktopHandoffs(db!, input.runId, roots).length !== 0) {
        throw new Error("Desktop safeStorage handoff ledger remains incomplete");
      }
    });
    await runStep("stage-final", () => stageInventoryObjects(context));
    const status = readMigrationStatus(db, input.runId);
    if (!status) throw new Error("Migration Run status is unavailable");
    return { status, inventory };
  } finally {
    try {
      db?.close();
    } finally {
      if (verifiedLockOwnership) releaseMaintenanceLock(lock);
    }
  }
}

export function migrationStatus(input: {
  runId: string;
  sourcePath: string;
  storeRoot?: string;
}): MigrationStatus {
  assertStartupJournalReady(path.resolve(input.sourcePath));
  const source = createMigrationSourceRoot({ id: "ralphy", kind: "ralphy", path: input.sourcePath });
  if (path.basename(source.path) !== ".ralphy") throw new Error("Migration status requires the exact .ralphy source");
  const expectedStoreRoot = migrationPaths(source.path, input.runId).storeRoot;
  if (input.storeRoot !== undefined && path.resolve(input.storeRoot) !== expectedStoreRoot) {
    throw new Error("Migration status store does not match the derived Run stage");
  }
  const roots = readSourceManifest(migrationPaths(source.path, input.runId).sourceManifestPath, input.runId);
  return withValidatedRun(source.path, input.runId, expectedStoreRoot, (db) => {
    validateManifestAgainstStore(db, input.runId, roots);
    const status = readMigrationStatus(db, input.runId);
    if (!status) throw new Error("Migration Run status is unavailable");
    return status;
  });
}

type PendingDesktopHandoff = {
  sourceEntryId: string;
  encryptedSourcePath: string;
  ref: string;
  kind: "text" | "file";
};

function pendingDesktopHandoffs(
  db: Database,
  runId: string,
  roots: readonly MigrationSourceRoot[],
): PendingDesktopHandoff[] {
  const rows = db.query<{
    sourceEntryId: string;
    sourceLabel: string;
    sourcePath: string;
    refs: string | null;
    detail: string;
  }, [string]>(
    `SELECT entry.id AS sourceEntryId, source.source_label AS sourceLabel,
            entry.source_path AS sourcePath, entry.target_refs_json AS refs,
            plan.detail_json AS detail
     FROM migration_entries entry
     JOIN migration_sources source ON source.id = entry.migration_source_id
     JOIN migration_issues plan ON plan.migration_run_id = entry.migration_run_id
       AND plan.code = 'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED'
       AND json_extract(plan.detail_json, '$.sourceEntryId') = entry.id
     WHERE entry.migration_run_id = ? AND entry.source_kind = 'desktop'
       AND entry.disposition = 'secret-recovery-only' AND entry.state = 'inventoried'
       AND EXISTS (
         SELECT 1 FROM migration_issues required
         WHERE required.migration_run_id = entry.migration_run_id
           AND required.code = 'MIGRATION_DESKTOP_SECRET_HANDOFF_REQUIRED'
           AND required.resolved_at IS NULL
           AND json_extract(required.detail_json, '$.sourceEntryId') = entry.id
       )
     ORDER BY entry.id`,
  ).all(runId);
  const rootsById = new Map(roots.map((root) => [root.id, root]));
  const seen = new Set<string>();
  return rows.map((row) => {
    if (seen.has(row.sourceEntryId)) throw new Error("Desktop safeStorage handoff plan is ambiguous");
    seen.add(row.sourceEntryId);
    const root = rootsById.get(row.sourceLabel);
    if (!root || root.kind !== "desktop") throw new Error("Desktop safeStorage source identity is missing");
    const detail = JSON.parse(row.detail) as { sourceEntryId?: unknown; kind?: unknown; refs?: unknown };
    if (detail.sourceEntryId !== row.sourceEntryId
      || (detail.kind !== "text" && detail.kind !== "file")
      || JSON.stringify(detail.refs) !== row.refs) {
      throw new Error("Desktop safeStorage handoff plan binding is invalid");
    }
    const refs = JSON.parse(row.refs ?? "null") as unknown;
    if (!Array.isArray(refs) || refs.length !== 1 || typeof refs[0] !== "string") {
      throw new Error("Desktop safeStorage handoff ref is invalid");
    }
    const encryptedSourcePath = path.resolve(root.path, row.sourcePath);
    if (!encryptedSourcePath.startsWith(`${root.path}${path.sep}`)) {
      throw new Error("Desktop safeStorage source path escapes its root");
    }
    return {
      sourceEntryId: row.sourceEntryId,
      encryptedSourcePath,
      ref: refs[0],
      kind: detail.kind,
    };
  });
}

function assertDesktopHandoffCompleted(
  db: Database,
  runId: string,
  handoff: PendingDesktopHandoff,
): void {
  const row = db.query<{ disposition: string; state: string; refs: string | null }, [string, string]>(
    `SELECT disposition, state, target_refs_json AS refs FROM migration_entries
     WHERE migration_run_id = ? AND id = ?`,
  ).get(runId, handoff.sourceEntryId);
  if (!row || row.disposition !== "secret-imported" || row.state !== "excluded"
    || row.refs !== JSON.stringify([handoff.ref])) {
    throw new Error("Desktop safeStorage handoff did not complete its exact ledger entry");
  }
}

export async function verifyOrFreezeMigration(input: {
  runId: string;
  sourcePath: string;
  verificationDir: string;
}) {
  assertStartupJournalReady(path.resolve(input.sourcePath));
  const source = createMigrationSourceRoot({ id: "ralphy", kind: "ralphy", path: input.sourcePath });
  const paths = migrationPaths(source.path, input.runId);
  const roots = readSourceManifest(paths.sourceManifestPath, input.runId);
  const pinnedStage = stageIdentity(paths.storeRoot);
  const phase = withValidatedRun(source.path, input.runId, paths.storeRoot, (db, run) => {
    validateManifestAgainstStore(db, input.runId, roots);
    return run.phase;
  });
  const lock = acquireMaintenanceLock({ sourcePath: source.path, runId: input.runId, reclaim: "resume" });
  const verifyGate = (): void => {
    assertOwnedMaintenanceLock(lock);
    withValidatedRun(source.path, input.runId, paths.storeRoot, (db) => {
      validateManifestAgainstStore(db, input.runId, roots);
      assertMigrationMaintenanceLock({ db, storeRoot: paths.storeRoot, sourceRoots: roots, runId: input.runId });
    });
    assertRequestedRoots(roots, readSourceManifest(paths.sourceManifestPath, input.runId));
    assertOwnedMaintenanceLock(lock);
    assertMigrationQuiescent([...roots.map((root) => root.path), paths.storeRoot]);
  };
  try {
    verifyGate();
    assertStageIdentity(paths.storeRoot, pinnedStage);
    if (phase === "relations") {
      const db = openDomainDbAt(paths.storeRoot);
      try {
        await freezeMigration({ db, storeRoot: paths.storeRoot, sourceRoots: roots, runId: input.runId }, {
          verificationDir: input.verificationDir,
        });
      } catch (error) {
        try { db.close(); } catch { /* freeze closes on success only */ }
        throw error;
      }
    } else if (phase !== "ready") {
      throw new Error("Migration is not ready to verify");
    }
    verifyGate();
    const result = verifyMigration({ storeRoot: paths.storeRoot, runId: input.runId, verificationDir: input.verificationDir });
    verifyGate();
    return result;
  } finally {
    try {
      verifyGate();
    } finally {
      releaseMaintenanceLock(lock);
    }
  }
}

export function cutoverMigration(input: {
  runId: string;
  verificationId: string;
  verificationDir: string;
  sourcePath: string;
  /** @internal Hard-exit seam after durable prepared-journal publication. */
  afterJournalPublishedForTesting?: () => void;
}) {
  const sourcePath = path.resolve(input.sourcePath);
  assertStartupJournalReady(sourcePath);
  const source = createMigrationSourceRoot({ id: "ralphy", kind: "ralphy", path: sourcePath });
  if (path.basename(source.path) !== ".ralphy") throw new Error("Migration cutover requires the exact .ralphy source");
  const paths = migrationPaths(source.path, input.runId);
  const roots = readSourceManifest(paths.sourceManifestPath, input.runId);
  const lock = acquireMaintenanceLock({ sourcePath: source.path, runId: input.runId, reclaim: "resume" });
  let journal: ReturnType<typeof createVerifiedCutoverJournal>;
  try {
    const gate = (): void => {
      assertOwnedMaintenanceLock(lock);
      assertMigrationQuiescent([...roots.map((root) => root.path), paths.storeRoot]);
      withValidatedRun(source.path, input.runId, paths.storeRoot, (db, run) => {
        validateManifestAgainstStore(db, input.runId, roots);
        assertMigrationMaintenanceLock({ db, storeRoot: paths.storeRoot, sourceRoots: roots, runId: input.runId });
        if (run.phase !== "ready") throw new Error("Migration Run is not ready for cutover");
      });
    };
    gate();
    journal = createVerifiedCutoverJournal({
      runId: input.runId,
      sourcePath: source.path,
      verificationId: input.verificationId,
      verificationDir: input.verificationDir,
    });
    input.afterJournalPublishedForTesting?.();
    gate();
  } finally {
    releaseMaintenanceLock(lock);
  }
  return executeCutover(journal);
}

export function recoverCutover(input: { sourcePath: string; runId: string }) {
  const journalPath = derivedJournalPath(input.sourcePath, input.runId);
  const sourcePath = path.resolve(input.sourcePath);
  return recoverCutoverJournal(journalPath, () => {
    const paths = migrationPaths(sourcePath, input.runId);
    const roots = readSourceManifest(paths.sourceManifestPath, input.runId);
    assertMigrationQuiescent([...roots.map((root) => root.path), paths.storeRoot]);
  });
}

export function rollbackCutover(input: { sourcePath: string; runId: string }) {
  const journalPath = derivedJournalPath(input.sourcePath, input.runId);
  return rollbackCutoverJournal(journalPath);
}

function derivedJournalPath(sourcePath: string, runId: string): string {
  const source = path.resolve(sourcePath);
  const journalPath = migrationCutoverPaths(source, runId).journalPath;
  const journal = readCutoverJournal(journalPath);
  if (journal.runId !== runId || journal.sourcePath !== source || journal.journalPath !== journalPath) {
    throw new Error("Cutover journal does not match the derived source and Run ID");
  }
  return journalPath;
}

function assertMigrationRootsStartupReady(
  roots: readonly { kind: MigrationSourceRoot["kind"]; path: string }[],
): void {
  const source = roots.find((root) => root.kind === "ralphy");
  if (source) assertStartupJournalReady(path.resolve(source.path));
}

function safeRelative(value: string): string {
  if (path.isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("Migration stage/recovery locator must be relative POSIX text");
  }
  return value;
}

function migrationRoots(
  inputs: readonly { id?: string; kind: MigrationSourceRoot["kind"]; path: string }[],
): MigrationSourceRoot[] {
  if (inputs.length === 0) throw new Error("Migration requires at least one source root");
  const roots = inputs.map((root) => createMigrationSourceRoot({
    id: root.id ?? root.kind,
    kind: root.kind,
    path: root.path,
  }));
  if (new Set(roots.map((root) => root.id)).size !== roots.length) {
    throw new Error("Migration source labels must be unique");
  }
  for (let index = 0; index < roots.length; index += 1) {
    for (let other = index + 1; other < roots.length; other += 1) {
      const left = roots[index]!;
      const right = roots[other]!;
      if (
        (left.device === right.device && left.inode === right.inode)
        || left.path.startsWith(`${right.path}${path.sep}`)
        || right.path.startsWith(`${left.path}${path.sep}`)
      ) throw new Error("Migration source roots overlap");
    }
  }
  return roots;
}

function primarySource(roots: readonly MigrationSourceRoot[]): MigrationSourceRoot {
  const sources = roots.filter((root) => root.kind === "ralphy" && path.basename(root.path) === ".ralphy");
  if (sources.length !== 1) {
    throw new Error("Migration requires one exact .ralphy source");
  }
  return sources[0]!;
}

function assertNarrowSource(source: string): void {
  const resolved = path.resolve(source);
  const home = process.env.HOME ? path.resolve(process.env.HOME) : null;
  if (resolved === path.parse(resolved).root || resolved === home || resolved === process.cwd()) {
    throw new Error("Migration source target is too broad");
  }
  const marker = path.join(resolved, ".git");
  if (fs.existsSync(marker)) throw new Error("Migration source target cannot be a repository root");
}

function migrationPaths(source: string, runId: string) {
  if (!/^mig_[A-Za-z0-9-]+$/.test(runId)) throw new Error("Migration Run ID is unsafe");
  const parent = path.dirname(source);
  const runRoot = path.join(parent, ".ralphy-staging", runId);
  const privatePaths = migrationPrivatePaths(source, runId);
  return {
    runRoot,
    storeRoot: path.join(runRoot, ".ralphy"),
    recoveryRoot: path.join(parent, `.ralphy-recovery-${runId}`),
    rollbackRoot: path.join(parent, `.ralphy-rollback-new-${runId}`),
    journalPath: path.join(parent, `.ralphy-migration-${runId}.journal.json`),
    privateRoot: privatePaths.root,
    sourceManifestPath: privatePaths.sourceManifestPath,
    stageRootRel: safeRelative(`.ralphy-staging/${runId}/.ralphy`),
    recoveryRootRel: safeRelative(`.ralphy-recovery-${runId}`),
  };
}

function readValidatedRun(
  sourcePath: string,
  runId: string,
  storeRoot: string,
): { phase: MigrationPhase } {
  return withValidatedRun(sourcePath, runId, storeRoot, (_db, run) => ({ phase: run.phase }));
}

function readWalAwareValidatedRun(
  sourcePath: string,
  runId: string,
  storeRoot: string,
  roots: readonly MigrationSourceRoot[],
): { phase: MigrationPhase } {
  const paths = migrationPaths(sourcePath, runId);
  if (path.resolve(storeRoot) !== paths.storeRoot) throw new Error("Migration store does not match the derived Run stage");
  const databasePath = path.join(storeRoot, "ralphy.db");
  assertExistingDatabase(databasePath);
  const db = new Database(databasePath, { readonly: true, strict: true });
  try {
    db.exec("PRAGMA query_only = ON");
    const run = db.query<{ phase: MigrationPhase; stageRootRel: string | null }, [string]>(
      "SELECT phase, stage_root_rel AS stageRootRel FROM migration_runs WHERE id = ?",
    ).get(runId);
    if (!run) throw new Error("Migration Run not found");
    if (run.stageRootRel !== paths.stageRootRel) throw new Error("Migration Run stage does not match its derived store");
    validateManifestIfInventoried(db, runId, roots);
    return { phase: run.phase };
  } finally {
    db.close(false);
  }
}

type SqliteFileLocation = {
  device: string;
  inode: string;
  mode: number;
  uid: number;
  nlink: number;
};

type SqliteFilesLocation = {
  database: SqliteFileLocation;
  wal: SqliteFileLocation | null;
  shm: SqliteFileLocation | null;
};

function sqliteFileLocationIdentity(storeRoot: string): SqliteFilesLocation {
  const databasePath = path.join(storeRoot, "ralphy.db");
  assertExistingAncestorsAreReal(databasePath);
  const database = safeSqliteFileLocation(databasePath, null);
  return {
    database,
    wal: safeOptionalSqliteFileLocation(`${databasePath}-wal`, database.device),
    shm: safeOptionalSqliteFileLocation(`${databasePath}-shm`, database.device),
  };
}

function safeOptionalSqliteFileLocation(candidate: string, device: string): SqliteFileLocation | null {
  try {
    return safeSqliteFileLocation(candidate, device);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function stagedWalHasBytes(storeRoot: string): boolean {
  const files = sqliteFileLocationIdentity(storeRoot);
  if (!files.wal) return false;
  return fs.lstatSync(path.join(storeRoot, "ralphy.db-wal")).size > 0;
}

function safeSqliteFileLocation(candidate: string, expectedDevice: string | null): SqliteFileLocation {
  assertExistingAncestorsAreReal(candidate);
  const stat = fs.lstatSync(candidate);
  const uid = typeof process.geteuid === "function" ? process.geteuid() : stat.uid;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== uid
    || (stat.mode & 0o022) !== 0 || (expectedDevice !== null && String(stat.dev) !== expectedDevice)) {
    throw new Error("Migration staged SQLite file identity is unsafe");
  }
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    mode: stat.mode,
    uid: stat.uid,
    nlink: stat.nlink,
  };
}

function assertPreservedSqliteFiles(storeRoot: string, expected: SqliteFilesLocation): void {
  const actual = sqliteFileLocationIdentity(storeRoot);
  for (const key of ["database", "wal", "shm"] as const) {
    if (expected[key] !== null && JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
      throw new Error("Migration staged SQLite file was replaced during recovery");
    }
  }
}

function checkpointCrashedStage(storeRoot: string): void {
  const databasePath = path.join(storeRoot, "ralphy.db");
  assertExistingDatabase(databasePath);
  const before = sqliteFileLocationIdentity(storeRoot);
  const db = new Database(databasePath, { strict: true });
  try {
    assertPreservedSqliteFiles(storeRoot, before);
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    assertPreservedSqliteFiles(storeRoot, before);
  } finally {
    db.close(false);
  }
  sqliteFileLocationIdentity(storeRoot);
}

function withValidatedRun<T>(
  sourcePath: string,
  runId: string,
  storeRoot: string,
  action: (db: Database, run: { phase: MigrationPhase; stageRootRel: string | null }) => T,
): T {
  const paths = migrationPaths(sourcePath, runId);
  if (path.resolve(storeRoot) !== paths.storeRoot) throw new Error("Migration store does not match the derived Run stage");
  const databasePath = path.join(paths.storeRoot, "ralphy.db");
  assertExistingDatabase(databasePath);
  const walPath = `${databasePath}-wal`;
  if (fs.existsSync(walPath) && fs.lstatSync(walPath).size > 0) {
    throw new Error("Migration Run database has an unmaterialized WAL");
  }
  const image = fs.readFileSync(databasePath);
  if (image.subarray(0, 16).toString("binary") === "SQLite format 3\0" && image[18] === 2 && image[19] === 2) {
    image[18] = 1;
    image[19] = 1;
  }
  const db = Database.deserialize(image, { readonly: true });
  try {
    db.exec("PRAGMA query_only = ON");
    const run = db.query<{ phase: MigrationPhase; stageRootRel: string | null }, [string]>(
      "SELECT phase, stage_root_rel AS stageRootRel FROM migration_runs WHERE id = ?",
    ).get(runId);
    if (!run) throw new Error("Migration Run not found");
    if (run.stageRootRel !== paths.stageRootRel) throw new Error("Migration Run stage does not match its derived store");
    return action(db, run);
  } finally {
    db.close();
  }
}

function assertExistingDatabase(databasePath: string): void {
  assertExistingAncestorsAreReal(databasePath);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(databasePath);
  } catch {
    throw new Error("Migration Run database does not exist");
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Migration Run database must be an existing regular file");
  }
}

function assertMigrationPathsAvailable(paths: ReturnType<typeof migrationPaths>): void {
  for (const candidate of [paths.runRoot, paths.recoveryRoot, paths.rollbackRoot, paths.journalPath, paths.privateRoot]) {
    assertExistingAncestorsAreReal(candidate);
    if (fs.existsSync(candidate)) throw new Error("Migration stage, recovery, rollback, or journal state already exists");
  }
}

type SourceManifest = {
  version: 1;
  runId: string;
  sources: Array<{
    id: string;
    kind: MigrationSourceRoot["kind"];
    canonicalPath: string;
    device: string;
    inode: string;
    mode: number;
    uid: number;
    nlink: number;
  }>;
};

function writeSourceManifest(file: string, runId: string, roots: readonly MigrationSourceRoot[]): void {
  const manifest: SourceManifest = {
    version: 1,
    runId,
    sources: roots.map((root) => {
      const stat = fs.lstatSync(root.path);
      return {
        id: root.id,
        kind: root.kind,
        canonicalPath: root.path,
        device: String(stat.dev),
        inode: String(stat.ino),
        mode: stat.mode,
        uid: stat.uid,
        nlink: stat.nlink,
      };
    }),
  };
  const parent = path.dirname(file);
  const parentBefore = directoryFacts(parent);
  const temp = `${file}.tmp-${newDomainId("mig")}`;
  let fd: number | null = null;
  let linked = false;
  let owned: { device: bigint; inode: bigint } | null = null;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    const opened = fs.fstatSync(fd, { bigint: true });
    owned = { device: opened.dev, inode: opened.ino };
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(manifest)}\n`, "utf8");
    fs.fsyncSync(fd);
    const stat = fs.fstatSync(fd, { bigint: true });
    const uid = typeof process.geteuid === "function" ? BigInt(process.geteuid()) : stat.uid;
    if (!stat.isFile() || Number(stat.mode & 0o777n) !== 0o600 || stat.uid !== uid || stat.nlink !== 1n
      || stat.dev !== owned.device || stat.ino !== owned.inode) {
      throw new Error("Migration source manifest temporary identity is unsafe");
    }
    fs.closeSync(fd);
    fd = null;
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* preserve original manifest error */ }
    }
    if (owned) {
      try { unlinkOwnedRegularFile(temp, owned); } catch { /* preserve original manifest error */ }
    }
    throw error;
  }
  try {
    fs.linkSync(temp, file);
    linked = true;
    unlinkOwnedRegularFile(temp, owned);
    syncParent(parent);
    const final = fs.lstatSync(file, { bigint: true });
    const uid = typeof process.geteuid === "function" ? BigInt(process.geteuid()) : final.uid;
    if (!final.isFile() || final.isSymbolicLink() || Number(final.mode & 0o777n) !== 0o600
      || final.uid !== uid || final.nlink !== 1n || final.dev !== owned.device || final.ino !== owned.inode) {
      throw new Error("Migration source manifest identity is unsafe");
    }
    assertDirectoryFacts(parent, parentBefore);
  } catch (error) {
    if (owned) {
      try { unlinkOwnedRegularFile(temp, owned); } catch { /* remove only the exact temp inode */ }
      if (linked) try { unlinkOwnedRegularFile(file, owned); } catch { /* remove only the exact sidecar inode */ }
    }
    throw error;
  }
}

function unlinkOwnedRegularFile(candidate: string, expected: { device: bigint; inode: bigint }): void {
  let before: fs.BigIntStats;
  try {
    before = fs.lstatSync(candidate, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink() || before.dev !== expected.device || before.ino !== expected.inode) {
    throw new Error("Migration source manifest cleanup identity changed");
  }
  const tombstone = `${candidate}.delete-${newDomainId("mig")}`;
  fs.renameSync(candidate, tombstone);
  try {
    const moved = fs.lstatSync(tombstone, { bigint: true });
    if (!moved.isFile() || moved.isSymbolicLink() || moved.dev !== expected.device || moved.ino !== expected.inode) {
      throw new Error("Migration source manifest cleanup identity changed");
    }
    fs.unlinkSync(tombstone);
  } catch (error) {
    if (fs.existsSync(tombstone)) {
      try {
        fs.linkSync(tombstone, candidate);
        fs.unlinkSync(tombstone);
      } catch { /* preserve both paths rather than overwrite either one */ }
    }
    throw error;
  }
}

function readSourceManifest(file: string, runId: string, afterOpen?: () => void): MigrationSourceRoot[] {
  assertExistingAncestorsAreReal(file);
  const parent = path.dirname(file);
  const parentBefore = directoryFacts(parent);
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || Number(before.mode & 0o777n) !== 0o600 || before.nlink !== 1n) {
    throw new Error("Migration source manifest must be a private regular file");
  }
  const uid = typeof process.geteuid === "function" ? BigInt(process.geteuid()) : before.uid;
  if (before.uid !== uid) throw new Error("Migration source manifest owner mismatch");
  const fd = fs.openSync(file, "r");
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!sameFileFacts(opened, before)) throw new Error("Migration source manifest identity changed");
    afterOpen?.();
    const parsed = JSON.parse(fs.readFileSync(fd, "utf8")) as Partial<SourceManifest>;
    const after = fs.lstatSync(file, { bigint: true });
    if (!sameFileFacts(after, opened)) throw new Error("Migration source manifest was replaced");
    assertDirectoryFacts(parent, parentBefore);
    if (parsed.version !== 1 || parsed.runId !== runId || !Array.isArray(parsed.sources) || parsed.sources.length === 0) {
      throw new Error("Migration source manifest is invalid");
    }
    if (Object.keys(parsed).sort().join(",") !== "runId,sources,version"
      || parsed.sources.some((entry) => !entry || typeof entry !== "object"
        || Object.keys(entry).sort().join(",") !== "canonicalPath,device,id,inode,kind,mode,nlink,uid"
        || typeof entry.id !== "string" || typeof entry.canonicalPath !== "string"
        || typeof entry.device !== "string" || !/^\d+$/u.test(entry.device)
        || typeof entry.inode !== "string" || !/^\d+$/u.test(entry.inode)
        || !Number.isSafeInteger(entry.mode) || !Number.isSafeInteger(entry.uid) || !Number.isSafeInteger(entry.nlink)
        || !new Set(["ralphy", "legacy-workspace", "desktop"]).has(entry.kind!))) {
      throw new Error("Migration source manifest shape is invalid");
    }
    const roots = migrationRoots(parsed.sources.map((source) => ({
      id: source.id,
      kind: source.kind!,
      path: source.canonicalPath!,
    })));
    for (const [index, root] of roots.entries()) {
      const pinned = parsed.sources[index]!;
      const stat = fs.lstatSync(root.path);
      if (String(stat.dev) !== pinned.device || String(stat.ino) !== pinned.inode
        || stat.mode !== pinned.mode || stat.uid !== pinned.uid || stat.nlink !== pinned.nlink) {
        throw new Error("Migration source manifest identity changed");
      }
    }
    return roots;
  } finally {
    fs.closeSync(fd);
  }
}

type StageIdentity = { root: ReturnType<typeof fileIdentity>; database: ReturnType<typeof fileIdentity> };

function stageIdentity(storeRoot: string): StageIdentity {
  assertExistingAncestorsAreReal(path.join(storeRoot, "ralphy.db"));
  return { root: fileIdentity(storeRoot, "directory"), database: fileIdentity(path.join(storeRoot, "ralphy.db"), "file") };
}

function assertStageIdentity(storeRoot: string, expected: StageIdentity): void {
  const actual = stageIdentity(storeRoot);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Migration staged store identity changed before writable open");
}

function fileIdentity(candidate: string, kind: "file" | "directory") {
  const stat = fs.lstatSync(candidate, { bigint: true });
  if (stat.isSymbolicLink() || (kind === "file" ? !stat.isFile() : !stat.isDirectory())) {
    throw new Error("Migration staged path identity is unsafe");
  }
  return {
    device: String(stat.dev), inode: String(stat.ino), mode: Number(stat.mode), uid: String(stat.uid), nlink: String(stat.nlink),
    ...(kind === "file" ? {
      size: String(stat.size),
      mtimeNs: String(stat.mtimeNs),
      sha256: Bun.SHA256.hash(fs.readFileSync(candidate), "hex"),
    } : {}),
  };
}

function stageLocationIdentity(storeRoot: string) {
  assertExistingAncestorsAreReal(path.join(storeRoot, "ralphy.db"));
  const location = (candidate: string, kind: "file" | "directory") => {
    const identity = fileIdentity(candidate, kind);
    return {
      device: identity.device,
      inode: identity.inode,
      mode: identity.mode,
      uid: identity.uid,
      ...(kind === "file" ? { nlink: identity.nlink } : {}),
    };
  };
  return {
    root: location(storeRoot, "directory"),
    database: location(path.join(storeRoot, "ralphy.db"), "file"),
  };
}

function assertStageLocationIdentity(storeRoot: string, expected: ReturnType<typeof stageLocationIdentity>): void {
  assertExistingAncestorsAreReal(path.join(storeRoot, "ralphy.db"));
  const actual = stageLocationIdentity(storeRoot);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Migration staged store was replaced during a phase");
  }
}

function directoryFacts(directory: string) {
  const { device, inode, mode, uid } = fileIdentity(directory, "directory");
  return { device, inode, mode, uid };
}

function assertDirectoryFacts(directory: string, expected: ReturnType<typeof directoryFacts>): void {
  if (JSON.stringify(directoryFacts(directory)) !== JSON.stringify(expected)) {
    throw new Error("Migration source manifest parent identity changed");
  }
}

function sameFileFacts(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.uid === right.uid && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs;
}

function syncParent(parent: string): void {
  const fd = fs.openSync(parent, "r");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function assertRequestedRoots(requested: readonly MigrationSourceRoot[], pinned: readonly MigrationSourceRoot[]): void {
  const facts = (roots: readonly MigrationSourceRoot[]) => roots.map((root) => ({
    id: root.id, kind: root.kind, path: root.path, device: String(root.device), inode: String(root.inode),
  }));
  if (JSON.stringify(facts(requested)) !== JSON.stringify(facts(pinned))) {
    throw new Error("Migration sources do not exactly match the pinned source manifest");
  }
}

function validateManifestAgainstStore(db: Database, runId: string, roots: readonly MigrationSourceRoot[]): void {
  const rows = db.query<{
    id: string; kind: MigrationSourceRoot["kind"]; label: string; pathHash: string;
    device: string; inode: string; mode: number;
  }, [string]>(
    `SELECT id, source_kind AS kind, source_label AS label, canonical_path_hash AS pathHash,
            source_device AS device, source_inode AS inode, source_mode AS mode
     FROM migration_sources WHERE migration_run_id = ? ORDER BY created_at, id`,
  ).all(runId);
  if (rows.length !== roots.length) throw new Error("Migration source manifest count mismatch");
  for (const root of roots) {
    const row = rows.find((candidate) => candidate.label === root.id);
    if (!row) throw new Error("Migration source manifest label mismatch");
    assertExistingAncestorsAreReal(root.path);
    const stat = fs.lstatSync(root.path);
    if (stat.isSymbolicLink() || !stat.isDirectory()
      || row.kind !== root.kind || row.label !== root.id
      || row.pathHash !== Bun.SHA256.hash(root.path, "hex")
      || row.device !== String(stat.dev) || row.inode !== String(stat.ino)
      || row.mode !== stat.mode) {
      throw new Error("Migration source manifest identity mismatch");
    }
  }
}

function validateManifestIfInventoried(
  db: Database,
  runId: string,
  roots: readonly MigrationSourceRoot[],
): void {
  const count = db.query<{ count: number }, [string]>(
    "SELECT COUNT(*) AS count FROM migration_sources WHERE migration_run_id = ?",
  ).get(runId)?.count ?? 0;
  if (count > 0) validateManifestAgainstStore(db, runId, roots);
}

function assertExistingAncestorsAreReal(candidate: string): void {
  let current = path.parse(candidate).root;
  for (const part of candidate.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Migration path or ancestor cannot be a symlink");
  }
}

function probeCloneSupport(
  runRoot: string,
  mode: "clone" | "copy",
  audit: MigrationAudit,
): "supported" | "copy-mode" {
  if (mode === "copy") {
    if (audit.freeBytes < audit.requiredCopyBytes) throw new Error("Migration copy mode has insufficient free space");
    return "copy-mode";
  }
  const source = path.join(runRoot, ".clone-probe-source");
  const target = path.join(runRoot, ".clone-probe-target");
  try {
    fs.writeFileSync(source, "ralphy-clone-probe", { mode: 0o600 });
    fs.copyFileSync(source, target, fs.constants.COPYFILE_FICLONE_FORCE);
    return "supported";
  } catch {
    throw new Error("Migration requires COPYFILE_FICLONE_FORCE support");
  } finally {
    fs.rmSync(source, { force: true });
    fs.rmSync(target, { force: true });
  }
}
