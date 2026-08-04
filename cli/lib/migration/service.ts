import path from "node:path";
import fs from "node:fs";
import { closeDomainDb, openDomainDbAt } from "../store/db.js";
import { newDomainId } from "../store/ids.js";
import {
  acquireMaintenanceLock,
  assertMigrationQuiescent,
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
  try {
    assertMigrationQuiescent(roots.map((root) => root.path));
    fs.mkdirSync(paths.runRoot, { recursive: true, mode: 0o700 });
    createdStage = true;
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
      assertMigrationQuiescent([...roots.map((root) => root.path), paths.storeRoot]);
      return { runId, storeRoot: paths.storeRoot, lock, cloneSupport, audit, status };
    } finally {
      db.close();
    }
  } catch (error) {
    if (createdStage) fs.rmSync(paths.runRoot, { recursive: true, force: true });
    releaseMaintenanceLock(lock);
    throw error;
  }
}

export async function resumeMigration(input: {
  runId: string;
  storeRoot?: string;
  sourceRoots: readonly { id?: string; kind: MigrationSourceRoot["kind"]; path: string }[];
  lock?: MigrationLock;
}): Promise<{ status: MigrationStatus; inventory: Awaited<ReturnType<typeof inventoryLegacySource>> | null }> {
  const roots = migrationRoots(input.sourceRoots);
  const source = primarySource(roots);
  const expectedStoreRoot = migrationPaths(source.path, input.runId).storeRoot;
  if (input.storeRoot !== undefined && path.resolve(input.storeRoot) !== expectedStoreRoot) {
    throw new Error("Migration store target does not match the derived Run stage");
  }
  if (!input.lock) {
    acquireMaintenanceLock({
      sourcePath: source.path,
      runId: input.runId,
      reclaim: "resume",
    });
  }
  assertMigrationQuiescent([...roots.map((root) => root.path), expectedStoreRoot]);
  const db = openDomainDbAt(expectedStoreRoot);
  try {
    const row = db.query<{ phase: MigrationPhase }, [string]>(
      "SELECT phase FROM migration_runs WHERE id = ?",
    ).get(input.runId);
    if (!row) throw new Error("Migration Run not found");
    if (row.phase === "failed" || row.phase === "cutover" || row.phase === "rolled-back") throw new Error("Migration Run is terminal");
    const context: MigrationContext = { db, storeRoot: expectedStoreRoot, sourceRoots: roots, runId: input.runId };
    const inventory = row.phase === "audited" || row.phase === "inventory"
      ? await inventoryLegacySource(context)
      : null;
    assertMigrationQuiescent([...roots.map((root) => root.path), expectedStoreRoot]);
    const status = readMigrationStatus(db, input.runId);
    if (!status) throw new Error("Migration Run status is unavailable");
    return { status, inventory };
  } finally {
    db.close();
  }
}

export function migrationStatus(input: { runId: string; storeRoot: string }): MigrationStatus | null {
  const db = openDomainDbAt(input.storeRoot);
  try {
    return readMigrationStatus(db, input.runId);
  } finally {
    db.close();
  }
}

export function markMigrationPhase(input: { runId: string; storeRoot: string; phase: MigrationPhase; error?: { code: string; detail: string } }): void {
  const db = openDomainDbAt(input.storeRoot);
  try {
    const current = db.query<{ phase: MigrationPhase }, [string]>("SELECT phase FROM migration_runs WHERE id = ?").get(input.runId);
    if (!current) throw new Error("Migration Run not found");
    if (input.phase === "failed" && !input.error) throw new Error("Failed Migration Run requires a redacted error");
    db.prepare(
      `UPDATE migration_runs
       SET phase = ?, last_error_code = ?, last_error_detail = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.phase, input.error?.code ?? null, input.error?.detail ?? null, Date.now(), input.runId);
  } finally {
    db.close();
  }
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

function migrationRoots(
  inputs: readonly { id?: string; kind: MigrationSourceRoot["kind"]; path: string }[],
): MigrationSourceRoot[] {
  if (inputs.length === 0) throw new Error("Migration requires at least one source root");
  const roots = inputs.map((root) => createMigrationSourceRoot({
    id: root.id ?? root.kind,
    kind: root.kind,
    path: root.path,
  }));
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
  return {
    runRoot,
    storeRoot: path.join(runRoot, ".ralphy"),
    recoveryRoot: path.join(parent, ".ralphy-recovery", runId, ".ralphy"),
    rollbackRoot: path.join(parent, ".ralphy-rollback", runId, ".ralphy"),
    journalPath: path.join(parent, `.ralphy-migration-${runId}.journal.json`),
    stageRootRel: safeRelative(`.ralphy-staging/${runId}/.ralphy`),
    recoveryRootRel: safeRelative(`.ralphy-recovery/${runId}/.ralphy`),
  };
}

function assertMigrationPathsAvailable(paths: ReturnType<typeof migrationPaths>): void {
  for (const candidate of [paths.runRoot, paths.recoveryRoot, paths.rollbackRoot, paths.journalPath]) {
    assertExistingAncestorsAreReal(candidate);
    if (fs.existsSync(candidate)) throw new Error("Migration stage, recovery, rollback, or journal state already exists");
  }
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
