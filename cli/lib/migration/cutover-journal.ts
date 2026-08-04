import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CutoverState =
  | "prepared"
  | "source-moved"
  | "installed"
  | "rollback-new-moved"
  | "rolled-back";

export type CutoverIdentity = {
  device: string;
  inode: string;
  mode: number;
};

export type CutoverJournal = {
  version: 1;
  runId: string;
  verificationId: string;
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
  recoveryMode: number;
  createdAt: number;
  updatedAt: number;
};

const NEXT_STATE: Record<CutoverState, readonly CutoverState[]> = {
  prepared: ["source-moved", "rolled-back"],
  "source-moved": ["installed", "rolled-back"],
  installed: ["rollback-new-moved"],
  "rollback-new-moved": ["rolled-back"],
  "rolled-back": [],
};

export function cutoverJournalPath(sourcePath: string, runId: string): string {
  const source = safeSourcePath(sourcePath);
  return path.join(path.dirname(source), `.ralphy-migration-${safeId(runId)}.journal.json`);
}

export function createCutoverJournal(input: {
  runId: string;
  verificationId: string;
  sourcePath: string;
  stagePath: string;
  recoveryPath?: string;
  rollbackPath?: string;
}): CutoverJournal {
  const sourcePath = safeSourcePath(input.sourcePath);
  const stagePath = safeGenerationPath(input.stagePath, ".ralphy");
  if (sourcePath === stagePath) throw new Error("Cutover source and stage must be different roots");
  const parent = path.dirname(sourcePath);
  if (path.dirname(stagePath) === parent) throw new Error("Cutover stage must be outside the live source parent");
  const recoveryPath = input.recoveryPath ?? path.join(parent, `.ralphy-recovery-${safeId(input.runId)}`);
  const rollbackPath = input.rollbackPath ?? path.join(parent, `.ralphy-rollback-new-${safeId(input.runId)}`);
  if (path.dirname(path.resolve(recoveryPath)) !== parent || path.dirname(path.resolve(rollbackPath)) !== parent) {
    throw new Error("Cutover recovery generations must stay beside the source root");
  }
  assertNewGeneration(recoveryPath, `.ralphy-recovery-${safeId(input.runId)}`);
  assertNewGeneration(rollbackPath, `.ralphy-rollback-new-${safeId(input.runId)}`);
  const source = directoryIdentity(sourcePath);
  const stage = directoryIdentity(stagePath);
  const journal: CutoverJournal = {
    version: 1,
    runId: safeId(input.runId),
    verificationId: safeId(input.verificationId),
    nonce: randomUUID(),
    state: "prepared",
    transition: 0,
    sourcePath,
    stagePath,
    recoveryPath: path.resolve(recoveryPath),
    rollbackPath: path.resolve(rollbackPath),
    journalPath: cutoverJournalPath(sourcePath, input.runId),
    source,
    stage,
    recoveryMode: 0o700,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  writeJournal(journal, true);
  return journal;
}

export function readCutoverJournal(journalPath: string): CutoverJournal {
  const resolved = path.resolve(journalPath);
  const mode = fs.statSync(resolved).mode & 0o777;
  if (mode !== 0o600) throw new Error("Cutover journal must be mode 0600");
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8")) as Partial<CutoverJournal>;
  if (parsed.version !== 1 || typeof parsed.runId !== "string" || typeof parsed.state !== "string" || parsed.journalPath !== resolved) {
    throw new Error("Cutover journal is invalid");
  }
  if (!(parsed.state in NEXT_STATE) || typeof parsed.transition !== "number") throw new Error("Cutover journal state is invalid");
  return parsed as CutoverJournal;
}

export function executeCutover(journalOrPath: CutoverJournal | string): CutoverJournal {
  let journal = typeof journalOrPath === "string" ? readCutoverJournal(journalOrPath) : journalOrPath;
  if (journal.state === "installed" || journal.state === "rolled-back") return journal;
  if (journal.state === "prepared") {
    assertIdentity(journal.sourcePath, journal.source, "source");
    assertIdentity(journal.stagePath, journal.stage, "stage");
    assertAbsent(journal.recoveryPath);
    assertAbsent(journal.rollbackPath);
    fs.renameSync(journal.sourcePath, journal.recoveryPath);
    fs.chmodSync(journal.recoveryPath, journal.recoveryMode);
    syncDirectory(journal.recoveryPath);
    syncDirectory(path.dirname(journal.sourcePath));
    journal = transition(journal, "source-moved");
  }
  if (journal.state === "source-moved") {
    assertAbsent(journal.sourcePath);
    assertIdentity(journal.recoveryPath, journal.source, "recovery");
    assertIdentity(journal.stagePath, journal.stage, "stage");
    try {
      fs.renameSync(journal.stagePath, journal.sourcePath);
      syncDirectory(path.dirname(journal.sourcePath));
      journal = transition(journal, "installed");
    } catch (error) {
      try {
        assertAbsent(journal.sourcePath);
        fs.renameSync(journal.recoveryPath, journal.sourcePath);
        syncDirectory(path.dirname(journal.sourcePath));
        transition(journal, "rolled-back");
      } catch {
        // Keep source-moved on disk so explicit recovery can identify both generations.
      }
      throw error;
    }
  }
  return journal;
}

export function recoverCutover(journalOrPath: CutoverJournal | string): CutoverJournal {
  const journal = typeof journalOrPath === "string" ? readCutoverJournal(journalOrPath) : journalOrPath;
  if (journal.state === "prepared" || journal.state === "source-moved") return executeCutover(journal);
  if (journal.state === "rollback-new-moved") {
    assertAbsent(journal.sourcePath);
    assertIdentity(journal.recoveryPath, journal.source, "recovery");
    fs.renameSync(journal.recoveryPath, journal.sourcePath);
    syncDirectory(path.dirname(journal.sourcePath));
    return transition(journal, "rolled-back");
  }
  return journal;
}

export function rollbackCutover(journalOrPath: CutoverJournal | string): CutoverJournal {
  const journal = typeof journalOrPath === "string" ? readCutoverJournal(journalOrPath) : journalOrPath;
  if (journal.state === "rolled-back") return journal;
  if (journal.state === "prepared") {
    return transition(journal, "rolled-back");
  }
  if (journal.state === "source-moved") {
    assertAbsent(journal.sourcePath);
    assertIdentity(journal.recoveryPath, journal.source, "recovery");
    fs.renameSync(journal.recoveryPath, journal.sourcePath);
    syncDirectory(path.dirname(journal.sourcePath));
    return transition(journal, "rolled-back");
  }
  if (journal.state !== "installed") throw new Error(`Cannot roll back journal in ${journal.state} state`);
  assertIdentity(journal.sourcePath, journal.stage, "installed source");
  assertIdentity(journal.recoveryPath, journal.source, "recovery");
  assertAbsent(journal.rollbackPath);
  fs.renameSync(journal.sourcePath, journal.rollbackPath);
  syncDirectory(path.dirname(journal.sourcePath));
  let moved = journal;
  try {
    moved = transition(journal, "rollback-new-moved");
    fs.renameSync(moved.recoveryPath, moved.sourcePath);
    syncDirectory(path.dirname(moved.sourcePath));
    return transition(moved, "rolled-back");
  } catch (error) {
    try {
      assertAbsent(journal.sourcePath);
      fs.renameSync(journal.rollbackPath, journal.sourcePath);
      syncDirectory(path.dirname(journal.sourcePath));
    } catch {
      // Keep rollback-new-moved for explicit recovery; never copy or delete either generation.
    }
    throw error;
  }
}

function transition(journal: CutoverJournal, state: CutoverState): CutoverJournal {
  if (!NEXT_STATE[journal.state].includes(state)) throw new Error(`Invalid cutover transition ${journal.state} -> ${state}`);
  const next = { ...journal, state, transition: journal.transition + 1, updatedAt: Date.now() };
  writeJournal(next, false);
  return next;
}

function writeJournal(journal: CutoverJournal, create: boolean): void {
  fs.mkdirSync(path.dirname(journal.journalPath), { recursive: true, mode: 0o700 });
  const temp = `${journal.journalPath}.tmp-${randomUUID()}`;
  const fd = fs.openSync(temp, create ? "wx" : "w", 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(journal)}\n`, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, journal.journalPath);
  fs.chmodSync(journal.journalPath, 0o600);
  syncDirectory(path.dirname(journal.journalPath));
}

function directoryIdentity(value: string): CutoverIdentity {
  const stat = fs.lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Cutover root must be a real directory: ${value}`);
  return { device: String(stat.dev), inode: String(stat.ino), mode: stat.mode & 0o777 };
}

function assertIdentity(value: string, expected: CutoverIdentity, label: string): void {
  const actual = directoryIdentity(value);
  if (actual.device !== expected.device || actual.inode !== expected.inode) throw new Error(`Cutover ${label} identity mismatch`);
}

function assertAbsent(value: string): void {
  if (fs.existsSync(value)) throw new Error(`Cutover path already exists: ${value}`);
}

function safeSourcePath(value: string): string {
  const resolved = path.resolve(value);
  if (path.basename(resolved) !== ".ralphy" || resolved === path.parse(resolved).root || resolved === os.homedir()) {
    throw new Error("Cutover source must be an exact .ralphy directory outside protected roots");
  }
  return resolved;
}

function safeGenerationPath(value: string, basename: string): string {
  const resolved = path.resolve(value);
  if (path.basename(resolved) !== basename || resolved === path.parse(resolved).root) throw new Error(`Cutover generation must end in ${basename}`);
  return resolved;
}

function assertNewGeneration(value: string, basename: string): void {
  const resolved = safeGenerationPath(value, basename);
  assertAbsent(resolved);
}

function safeId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Migration identifier is unsafe");
  return value;
}

function syncDirectory(directory: string): void {
  const fd = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
