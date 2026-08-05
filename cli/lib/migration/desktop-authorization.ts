import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openDomainDbAt } from "../store/db.js";
import type { MigrationLock } from "./types.js";
import {
  inspectMigrationProcessIdentityState,
  type MigrationProcessIdentity,
  type MigrationProcessIdentityInspection,
} from "./process-identity.js";
import { ensureMigrationPrivateDirectory, migrationPrivatePaths } from "./private-paths.js";

type FileIdentity = {
  device: string;
  inode: string;
  mode: number;
  uid: number;
  nlink: number;
};

type SourceBinding = {
  rootPathHash: string;
  relativePathHash: string;
  encryptedPathHash: string;
  root: FileIdentity;
  file: FileIdentity & { bytes: number; mtimeMs: number };
};

type StageBinding = {
  pathHash: string;
  storeId: string;
  root: Omit<FileIdentity, "nlink">;
};

type AuthorizationRecord = {
  version: 1;
  state: "authorized";
  runId: string;
  nonce: string;
  createdAt: number;
  lockNonce: string;
  lockPreviousNonce: string | null;
  lockCreatedAt: number;
  sourcePathHash: string;
  sourceDevice: string;
  sourceInode: string;
  controller: MigrationProcessIdentity;
  helper: MigrationProcessIdentity;
  stagedRoot: string;
  staged: StageBinding;
  sourceEntryId: string;
  ref: string;
  provider: string;
  kind: "text" | "file";
  encryptedSource: SourceBinding;
  authorizationFile: FileIdentity;
};

type ClaimRecord = {
  version: 1;
  state: "claimed";
  runId: string;
  nonce: string;
  claimNonce: string;
  authorizationFile: FileIdentity;
  bridge: MigrationProcessIdentity;
  claimFile: FileIdentity;
};

type DoneRecord = {
  version: 1;
  state: "done";
  runId: string;
  nonce: string;
  claimNonce: string;
  sourceEntryId: string;
  ref: string;
  doneFile: FileIdentity;
};

type ProcessInspector = {
  currentPid(): number;
  inspect(pid: number): MigrationProcessIdentityInspection;
};

const productionInspector: ProcessInspector = {
  currentPid: () => process.pid,
  inspect: inspectMigrationProcessIdentityState,
};
let processInspector = productionInspector;
type DesktopAuthorizationFaultPoint =
  | "record-temp-create"
  | "record-write"
  | "record-file-fsync"
  | "record-publish"
  | "record-parent-fsync";
let authorizationFault: ((point: DesktopAuthorizationFaultPoint) => void) | null = null;

export function desktopAuthorizationPaths(sourcePath: string, runId: string): {
  authorizationPath: string;
  claimPath: string;
  donePath: string;
} {
  const source = exactRealDirectory(sourcePath, "Migration source");
  const privatePaths = migrationPrivatePaths(source, runId);
  return {
    authorizationPath: privatePaths.authorizationPath,
    claimPath: privatePaths.authorizationClaimPath,
    donePath: privatePaths.authorizationDonePath,
  };
}

export function inspectProcessIdentity(pid: number): MigrationProcessIdentityInspection {
  return inspectMigrationProcessIdentityState(pid);
}

export function setDesktopAuthorizationProcessInspectorForTesting(input: ProcessInspector): () => void {
  const previous = processInspector;
  processInspector = input;
  return () => { processInspector = previous; };
}

export function setDesktopAuthorizationFaultForTesting(
  fault: ((point: DesktopAuthorizationFaultPoint) => void) | null,
): () => void {
  const previous = authorizationFault;
  authorizationFault = fault;
  return () => { authorizationFault = previous; };
}

export function writeDesktopHandoffAuthorization(input: {
  sourcePath: string;
  runId: string;
  lock: MigrationLock;
  stagedRoot: string;
  encryptedSourcePath: string;
  sourceEntryId: string;
  ref: string;
  helperProcess: { readonly pid: number };
}): { path: string; claimPath: string; donePath: string; nonce: string } {
  const paths = desktopAuthorizationPaths(input.sourcePath, input.runId);
  ensureMigrationPrivateDirectory(input.sourcePath, input.runId);
  assertPrivateParent(paths.authorizationPath);
  const controller = requirePresent(processInspector.inspect(processInspector.currentPid()), "controller");
  if (!sameIdentity(controller, input.lock.processIdentity)) {
    throw new Error("Desktop authorization controller does not own the migration lock");
  }
  assertExactLock(input.sourcePath, input.runId, input.lock, controller);
  const helper = requirePresent(processInspector.inspect(input.helperProcess.pid), "helper");
  if (helper.parentPid !== controller.pid || helper.uid !== controller.uid) {
    throw new Error("Desktop authorization helper process ancestry is invalid");
  }
  const staged = readStageBinding(input.stagedRoot);
  const entry = readSourceBinding({
    stagedRoot: input.stagedRoot,
    runId: input.runId,
    encryptedSourcePath: input.encryptedSourcePath,
    sourceEntryId: input.sourceEntryId,
    ref: input.ref,
  });
  reclaimPriorAuthorization(paths, input.lock, controller);
  const nonce = randomUUID();
  const record = writeOwnedJson(paths.authorizationPath, (authorizationFile): AuthorizationRecord => ({
    version: 1,
    state: "authorized",
    runId: input.runId,
    nonce,
    createdAt: Date.now(),
    lockNonce: input.lock.nonce,
    lockPreviousNonce: input.lock.previousNonce,
    lockCreatedAt: input.lock.createdAt,
    sourcePathHash: sha256(exactRealDirectory(input.sourcePath, "Migration source")),
    sourceDevice: input.lock.sourceDevice,
    sourceInode: input.lock.sourceInode,
    controller,
    helper,
    stagedRoot: exactRealDirectory(input.stagedRoot, "Desktop staged store"),
    staged,
    sourceEntryId: input.sourceEntryId,
    ref: input.ref,
    provider: entry.provider,
    kind: entry.kind,
    encryptedSource: entry.binding,
    authorizationFile,
  }));
  validateAuthorization(record);
  return {
    path: paths.authorizationPath,
    claimPath: paths.claimPath,
    donePath: paths.donePath,
    nonce,
  };
}

export async function claimDesktopHandoffAuthorization(input: {
  sourcePath: string;
  runId: string;
  nonce: string;
  stagedRoot: string;
  encryptedSourcePath: string;
  sourceEntryId: string;
  ref: string;
  kind: "text" | "file";
}): Promise<{ claimNonce: string }> {
  const paths = desktopAuthorizationPaths(input.sourcePath, input.runId);
  assertPrivateParent(paths.authorizationPath);
  if (fs.existsSync(paths.donePath)) throw new Error("Desktop authorization is already done");
  const authorization = readAuthorization(paths.authorizationPath);
  if (authorization.runId !== input.runId || authorization.nonce !== input.nonce
    || authorization.sourceEntryId !== input.sourceEntryId || authorization.ref !== input.ref
    || authorization.kind !== input.kind) {
    throw new Error("Desktop authorization request binding is invalid");
  }
  const staged = readStageBinding(input.stagedRoot);
  if (!sameJson(staged, authorization.staged)) throw new Error("Desktop authorization staged store binding changed");
  const source = readSourceBinding({
    stagedRoot: input.stagedRoot,
    runId: input.runId,
    encryptedSourcePath: input.encryptedSourcePath,
    sourceEntryId: input.sourceEntryId,
    ref: input.ref,
  });
  if (source.provider !== authorization.provider || source.kind !== authorization.kind
    || !sameJson(source.binding, authorization.encryptedSource)) {
    throw new Error("Desktop authorization encrypted source binding changed");
  }
  const controller = requirePresent(processInspector.inspect(authorization.controller.pid), "controller");
  const helper = requirePresent(processInspector.inspect(authorization.helper.pid), "helper");
  const bridge = requirePresent(processInspector.inspect(processInspector.currentPid()), "bridge");
  if (!sameIdentity(controller, authorization.controller)
    || !sameIdentity(helper, authorization.helper)
    || helper.parentPid !== controller.pid
    || bridge.parentPid !== helper.pid
    || bridge.uid !== controller.uid) {
    throw new Error("Desktop authorization process identity or ancestry changed");
  }
  assertExactLock(input.sourcePath, input.runId, lockFromAuthorization(
    paths.authorizationPath,
    input.sourcePath,
    authorization,
  ), controller);
  assertCurrentFile(paths.authorizationPath, authorization.authorizationFile, "authorization");
  const claimNonce = randomUUID();
  writeOwnedJson(paths.claimPath, (claimFile): ClaimRecord => ({
    version: 1,
    state: "claimed",
    runId: input.runId,
    nonce: input.nonce,
    claimNonce,
    authorizationFile: authorization.authorizationFile,
    bridge,
    claimFile,
  }));
  assertCurrentFile(paths.authorizationPath, authorization.authorizationFile, "authorization");
  return { claimNonce };
}

export function completeDesktopHandoffAuthorization(input: {
  sourcePath: string;
  runId: string;
  nonce: string;
  claimNonce: string;
}): void {
  const paths = desktopAuthorizationPaths(input.sourcePath, input.runId);
  assertPrivateParent(paths.authorizationPath);
  if (fs.existsSync(paths.donePath)) throw new Error("Desktop authorization is already done");
  const authorization = readAuthorization(paths.authorizationPath);
  const claim = readClaim(paths.claimPath);
  if (authorization.runId !== input.runId || authorization.nonce !== input.nonce
    || claim.runId !== input.runId || claim.nonce !== input.nonce
    || claim.claimNonce !== input.claimNonce
    || !sameJson(claim.authorizationFile, authorization.authorizationFile)) {
    throw new Error("Desktop authorization claim binding is invalid");
  }
  const bridge = requirePresent(processInspector.inspect(processInspector.currentPid()), "bridge");
  if (!sameIdentity(bridge, claim.bridge)) throw new Error("Desktop authorization bridge identity changed");
  assertCurrentFile(paths.authorizationPath, authorization.authorizationFile, "authorization");
  assertCurrentFile(paths.claimPath, claim.claimFile, "claim");
  assertCompletedLedger(authorization);
  writeOwnedJson(paths.donePath, (doneFile): DoneRecord => ({
    version: 1,
    state: "done",
    runId: input.runId,
    nonce: input.nonce,
    claimNonce: input.claimNonce,
    sourceEntryId: authorization.sourceEntryId,
    ref: authorization.ref,
    doneFile,
  }));
}

export async function runDesktopSecretHandoff(input: {
  sourcePath: string;
  runId: string;
  lock: MigrationLock;
  stagedRoot: string;
  encryptedSourcePath: string;
  sourceEntryId: string;
  ref: string;
  kind: "text" | "file";
  desktopExecutable: string;
  timeoutMs: number;
  afterExecutableValidationForTesting?(): void;
  beforeSpawnForTesting?(command: readonly string[]): void;
  afterSpawnForTesting?(pid: number): void;
  afterRequestBytesReleasedForTesting?(bytes: Uint8Array): void;
}): Promise<{ completed: true }> {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new Error("Desktop helper timeout is invalid");
  }
  const helperArg = "--migration-secret-handoff";
  const executable = readExecutable(input.desktopExecutable);
  input.afterExecutableValidationForTesting?.();
  if (!sameJson(readExecutable(input.desktopExecutable), executable)) {
    throw new Error("Desktop executable was replaced before spawn");
  }
  const command = [input.desktopExecutable, helperArg];
  input.beforeSpawnForTesting?.(command);
  const child = Bun.spawn({
    cmd: command,
    env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  const exitTask = child.exited;
  const stdoutTask = hasAnyOutput(child.stdout);
  const stderrTask = hasAnyOutput(child.stderr);
  let requestBytes: Uint8Array | null = null;
  try {
    input.afterSpawnForTesting?.(child.pid);
    const helper = requirePresent(processInspector.inspect(child.pid), "helper");
    if (helper.parentPid !== input.lock.processIdentity.pid
      || !sameJson(helper.executable, executable)) {
      terminateHelper(child.pid, child.kill.bind(child));
      throw new Error("Desktop helper observed executable identity is invalid");
    }
    const authorization = writeDesktopHandoffAuthorization({
      sourcePath: input.sourcePath,
      runId: input.runId,
      lock: input.lock,
      stagedRoot: input.stagedRoot,
      encryptedSourcePath: input.encryptedSourcePath,
      sourceEntryId: input.sourceEntryId,
      ref: input.ref,
      helperProcess: { pid: child.pid },
    });
    // Exact one-line stdin contract. It contains only authorization metadata;
    // decrypted values and encrypted source paths are never controller argv/stdin.
    const request: DesktopSecretHandoffRequest = {
      v: 1,
      authorizationNonce: authorization.nonce,
      runId: input.runId,
      stagedRoot: input.stagedRoot,
      sourceEntryId: input.sourceEntryId,
      ref: input.ref,
      kind: input.kind,
    };
    requestBytes = Buffer.from(`${JSON.stringify(request)}\n`, "utf8");
    child.stdin.write(requestBytes);
    child.stdin.end();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      terminateHelper(child.pid, child.kill.bind(child));
    }, input.timeoutMs);
    const [exitCode, stdout, stderr] = await Promise.all([
      exitTask, stdoutTask, stderrTask,
    ]).finally(() => clearTimeout(timer));
    if (timedOut) throw new Error("Desktop helper timeout");
    if (stdout || stderr) throw new Error("Desktop helper emitted output");
    if (exitCode !== 0) throw new Error("Desktop helper exit was nonzero or signaled");
    const done = readDone(authorization.donePath);
    if (done.runId !== input.runId || done.nonce !== authorization.nonce
      || done.sourceEntryId !== input.sourceEntryId || done.ref !== input.ref) {
      throw new Error("Desktop authorization done record is invalid");
    }
    const authorizationRecord = readAuthorization(authorization.path);
    assertCompletedLedger(authorizationRecord);
    return { completed: true };
  } finally {
    if (requestBytes) {
      requestBytes.fill(0);
      input.afterRequestBytesReleasedForTesting?.(requestBytes);
    }
    terminateHelper(child.pid, child.kill.bind(child));
    await Promise.allSettled([exitTask, stdoutTask, stderrTask]);
    await waitForProcessGroupExit(child.pid);
  }
}

export type DesktopSecretHandoffRequest = {
  v: 1;
  authorizationNonce: string;
  runId: string;
  stagedRoot: string;
  sourceEntryId: string;
  ref: string;
  kind: "text" | "file";
};

function terminateHelper(pid: number, fallback: (signal?: NodeJS.Signals | number) => void): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try { fallback("SIGKILL"); } catch { /* Process already exited. */ }
  }
}

async function waitForProcessGroupExit(processGroupId: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (true) {
    try {
      process.kill(-processGroupId, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    }
    if (Date.now() >= deadline) throw new Error("Desktop helper process group did not exit");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

async function hasAnyOutput(stream: ReadableStream<Uint8Array>): Promise<boolean> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return false;
      if (result.value.byteLength > 0) return true;
    }
  } catch {
    return true;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function readSourceBinding(input: {
  stagedRoot: string;
  runId: string;
  encryptedSourcePath: string;
  sourceEntryId: string;
  ref: string;
}): { binding: SourceBinding; provider: string; kind: "text" | "file" } {
  const db = openDomainDbAt(input.stagedRoot);
  try {
    const row = db.query<{
      sourcePath: string;
      sourceLocatorHash: string;
      sourceDevice: string;
      sourceInode: string;
      sourceMode: number;
      bytes: number;
      mtimeMs: number;
      refs: string | null;
      sourceKind: string;
      disposition: string;
      state: string;
      rootPathHash: string;
      rootDevice: string;
      rootInode: string;
      rootMode: number;
    }, [string, string]>(
      `SELECT entry.source_path AS sourcePath, entry.source_locator_hash AS sourceLocatorHash,
              entry.source_device AS sourceDevice, entry.source_inode AS sourceInode,
              entry.source_mode AS sourceMode, entry.bytes, entry.mtime_ms AS mtimeMs,
              entry.target_refs_json AS refs, entry.source_kind AS sourceKind,
              entry.disposition, entry.state,
              source.canonical_path_hash AS rootPathHash,
              source.source_device AS rootDevice, source.source_inode AS rootInode,
              source.source_mode AS rootMode
       FROM migration_entries entry JOIN migration_sources source
         ON source.id = entry.migration_source_id
       WHERE entry.migration_run_id = ? AND entry.id = ?`,
    ).get(input.runId, input.sourceEntryId);
    if (!row || row.sourceKind !== "desktop" || row.disposition !== "secret-recovery-only"
      || row.state !== "inventoried" || row.refs !== JSON.stringify([input.ref])) {
      throw new Error("Desktop authorization source entry binding is invalid");
    }
    const plan = db.query<{ detail: string }, [string, string]>(
      `SELECT detail_json AS detail FROM migration_issues
       WHERE migration_run_id = ? AND code = 'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED'
         AND json_extract(detail_json, '$.sourceEntryId') = ?`,
    ).all(input.runId, input.sourceEntryId);
    if (plan.length !== 1) throw new Error("Desktop authorization secret plan is missing or ambiguous");
    const detail = JSON.parse(plan[0]!.detail) as { kind?: unknown; refs?: unknown };
    if ((detail.kind !== "text" && detail.kind !== "file")
      || JSON.stringify(detail.refs) !== JSON.stringify([input.ref])) {
      throw new Error("Desktop authorization secret plan binding is invalid");
    }
    const candidate = exactRealFile(input.encryptedSourcePath, "Desktop encrypted source");
    const relative = row.sourcePath.split("/");
    if (relative.some((part) => !part || part === "." || part === "..")) {
      throw new Error("Desktop authorization source relative path is invalid");
    }
    let rootPath = candidate;
    for (const _part of relative) rootPath = path.dirname(rootPath);
    const expected = path.join(rootPath, ...relative);
    if (expected !== candidate) throw new Error("Desktop authorization source path binding is invalid");
    const sourceRoot = exactRealDirectory(rootPath, "Desktop source root");
    const rootStat = fs.lstatSync(sourceRoot);
    const fileStat = fs.lstatSync(candidate);
    if (sha256(sourceRoot) !== row.rootPathHash
      || String(rootStat.dev) !== row.rootDevice || String(rootStat.ino) !== row.rootInode
      || rootStat.mode !== row.rootMode
      || String(fileStat.dev) !== row.sourceDevice || String(fileStat.ino) !== row.sourceInode
      || fileStat.mode !== row.sourceMode || fileStat.size !== row.bytes
      || Math.trunc(fileStat.mtimeMs) !== row.mtimeMs) {
      throw new Error("Desktop authorization source identity changed");
    }
    return {
      provider: providerFromRef(input.ref),
      kind: detail.kind,
      binding: {
        rootPathHash: row.rootPathHash,
        relativePathHash: row.sourceLocatorHash,
        encryptedPathHash: sha256(candidate),
        root: fileIdentity(rootStat),
        file: { ...fileIdentity(fileStat), bytes: fileStat.size, mtimeMs: Math.trunc(fileStat.mtimeMs) },
      },
    };
  } finally {
    db.close();
  }
}

function readStageBinding(stagedRoot: string): StageBinding {
  const root = exactRealDirectory(stagedRoot, "Desktop staged store");
  const stat = fs.lstatSync(root);
  const db = openDomainDbAt(root);
  try {
    const metadata = db.query<{ storeId: string }, []>(
      "SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1",
    ).get();
    if (!metadata) throw new Error("Desktop staged store identity is missing");
    return {
      pathHash: sha256(root),
      storeId: metadata.storeId,
      root: {
        device: String(stat.dev), inode: String(stat.ino), mode: stat.mode, uid: stat.uid,
      },
    };
  } finally {
    db.close();
  }
}

function assertCompletedLedger(authorization: AuthorizationRecord): void {
  const dbRoot = exactRealDirectory(authorization.stagedRoot, "Desktop staged store");
  if (!sameJson(readStageBinding(dbRoot), authorization.staged)) {
    throw new Error("Desktop authorization staged store binding changed");
  }
  const db = openDomainDbAt(dbRoot);
  try {
    const row = db.query<{ disposition: string; state: string; refs: string | null }, [string, string]>(
      `SELECT disposition, state, target_refs_json AS refs FROM migration_entries
       WHERE migration_run_id = ? AND id = ?`,
    ).get(authorization.runId, authorization.sourceEntryId);
    if (!row || row.disposition !== "secret-imported" || row.state !== "excluded"
      || row.refs !== JSON.stringify([authorization.ref])) {
      throw new Error("Desktop authorization ledger entry is not complete");
    }
  } finally {
    db.close();
  }
}

function readAuthorization(file: string): AuthorizationRecord {
  const record = readOwnedJson<AuthorizationRecord>(file, (value) => value.authorizationFile, "authorization");
  validateAuthorization(record);
  return record;
}

function readClaim(file: string): ClaimRecord {
  const record = readOwnedJson<ClaimRecord>(file, (value) => value.claimFile, "claim");
  if (!sameJson(Object.keys(record).sort(), [
    "authorizationFile", "bridge", "claimFile", "claimNonce", "nonce", "runId", "state", "version",
  ]) || record.version !== 1 || record.state !== "claimed") {
    throw new Error("Desktop claim envelope is invalid");
  }
  return record;
}

function readDone(file: string): DoneRecord {
  const record = readOwnedJson<DoneRecord>(file, (value) => value.doneFile, "done");
  if (!sameJson(Object.keys(record).sort(), [
    "claimNonce", "doneFile", "nonce", "ref", "runId", "sourceEntryId", "state", "version",
  ]) || record.version !== 1 || record.state !== "done") {
    throw new Error("Desktop done envelope is invalid");
  }
  return record;
}

function validateAuthorization(record: AuthorizationRecord): void {
  const keys = Object.keys(record).sort();
  const expectedKeys = [
    "authorizationFile", "controller", "createdAt", "encryptedSource", "helper", "kind", "lockCreatedAt",
    "lockNonce", "lockPreviousNonce", "nonce", "provider", "ref", "runId", "sourceDevice",
    "sourceEntryId", "sourceInode", "sourcePathHash", "staged", "stagedRoot", "state", "version",
  ].sort();
  if (!sameJson(keys, expectedKeys)
    || record.version !== 1 || record.state !== "authorized"
    || !record.runId || !record.nonce || !record.lockNonce || !Number.isSafeInteger(record.createdAt)
    || !record.sourceEntryId || !record.ref || providerFromRef(record.ref) !== record.provider
    || !path.isAbsolute(record.stagedRoot) || sha256(record.stagedRoot) !== record.staged.pathHash
    || (record.kind !== "text" && record.kind !== "file")) {
    throw new Error("Desktop authorization envelope is invalid");
  }
}

function lockFromAuthorization(
  authorizationPath: string,
  sourcePath: string,
  record: AuthorizationRecord,
): MigrationLock {
  return {
    path: path.join(path.dirname(sourcePath), ".ralphy-migration.lock"),
    runId: record.runId,
    nonce: record.lockNonce,
    previousNonce: record.lockPreviousNonce,
    sourcePath,
    sourceDevice: record.sourceDevice,
    sourceInode: record.sourceInode,
    processIdentity: record.controller,
    createdAt: record.lockCreatedAt,
  };
}

function assertExactLock(
  sourcePath: string,
  runId: string,
  expected: MigrationLock,
  controller: MigrationProcessIdentity,
): void {
  const source = exactRealDirectory(sourcePath, "Migration source");
  const sourceStat = fs.lstatSync(source);
  const lockPath = path.join(path.dirname(source), ".ralphy-migration.lock");
  if (expected.path !== lockPath || expected.runId !== runId || expected.sourcePath !== source
    || expected.sourceDevice !== String(sourceStat.dev) || expected.sourceInode !== String(sourceStat.ino)
    || !sameIdentity(expected.processIdentity, controller)) {
    throw new Error("Desktop authorization migration lock binding is invalid");
  }
  const disk = readOwnedJson<MigrationLock>(lockPath, () => undefined, "migration lock");
  if (!sameJson(disk, expected)) throw new Error("Desktop authorization migration lock was replaced");
}

function reclaimPriorAuthorization(
  paths: ReturnType<typeof desktopAuthorizationPaths>,
  lock: MigrationLock,
  controller: MigrationProcessIdentity,
): void {
  if (!fs.existsSync(paths.authorizationPath)) return;
  const existing = readAuthorization(paths.authorizationPath);
  const records: Array<{ file: string; identity: FileIdentity }> = [];
  let claim: ClaimRecord | null = null;
  if (fs.existsSync(paths.claimPath)) {
    claim = readClaim(paths.claimPath);
    if (claim.runId !== existing.runId || claim.nonce !== existing.nonce
      || !sameJson(claim.authorizationFile, existing.authorizationFile)) {
      throw new Error("Desktop authorization prior claim binding is invalid");
    }
    records.push({ file: paths.claimPath, identity: claim.claimFile });
  }
  const hasDone = fs.existsSync(paths.donePath);
  let done: DoneRecord | null = null;
  if (hasDone) {
    if (!claim) throw new Error("Desktop authorization prior done record has no claim");
    done = readDone(paths.donePath);
    if (done.runId !== existing.runId || done.nonce !== existing.nonce
      || done.claimNonce !== claim.claimNonce || done.sourceEntryId !== existing.sourceEntryId
      || done.ref !== existing.ref) {
      throw new Error("Desktop authorization prior done binding is invalid");
    }
    assertCompletedLedger(existing);
    records.unshift({ file: paths.donePath, identity: done.doneFile });
  }
  if (existing.runId !== lock.runId || existing.sourcePathHash !== sha256(lock.sourcePath)
    || existing.sourceDevice !== lock.sourceDevice || existing.sourceInode !== lock.sourceInode) {
    throw new Error("Desktop authorization prior source or Run binding is invalid");
  }
  const controllerGoneOrCurrent = sameIdentity(existing.controller, controller)
    || exactProcessIsGone(existing.controller, processInspector.inspect(existing.controller.pid));
  const descendantsGone = exactProcessIsGone(existing.helper, processInspector.inspect(existing.helper.pid))
    && (!claim || exactProcessIsGone(claim.bridge, processInspector.inspect(claim.bridge.pid)));
  if (!controllerGoneOrCurrent || !descendantsGone) {
    throw new Error("Desktop authorization is still owned or process state is unknown");
  }
  records.push({ file: paths.authorizationPath, identity: existing.authorizationFile });
  for (const record of records) assertCurrentFile(record.file, record.identity, "prior authorization");
  for (const record of records) unlinkExactFile(record.file, record.identity);
}

function exactProcessIsGone(
  expected: MigrationProcessIdentity,
  inspection: MigrationProcessIdentityInspection,
): boolean {
  if (inspection.status === "absent") return true;
  if (inspection.status !== "present") return false;
  return !sameIdentity(inspection.identity, expected);
}

function unlinkExactFile(file: string, expected: FileIdentity): void {
  const tombstone = path.join(path.dirname(file), `.${path.basename(file)}.reclaim-${randomUUID()}`);
  fs.renameSync(file, tombstone);
  const moved = fs.lstatSync(tombstone);
  if (!sameJson(fileIdentity(moved), expected)) {
    if (!fs.existsSync(file)) fs.renameSync(tombstone, file);
    fsyncDirectory(path.dirname(file));
    throw new Error("Desktop authorization record was replaced before reclaim");
  }
  fs.unlinkSync(tombstone);
  fsyncDirectory(path.dirname(file));
}

function writeOwnedJson<T>(file: string, build: (identity: FileIdentity) => T): T {
  recoverRecordTemp(file);
  const temporary = `${file}.tmp`;
  let fd: number | null = null;
  let published = false;
  try {
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    authorizationFault?.("record-temp-create");
    fs.fchmodSync(fd, 0o600);
    const identity = fileIdentity(fs.fstatSync(fd));
    const value = build(identity);
    fs.writeFileSync(fd, `${JSON.stringify(value)}\n`, "utf8");
    authorizationFault?.("record-write");
    fs.fsyncSync(fd);
    authorizationFault?.("record-file-fsync");
    fs.closeSync(fd);
    fd = null;
    fs.linkSync(temporary, file);
    published = true;
    authorizationFault?.("record-publish");
    fs.unlinkSync(temporary);
    fsyncDirectory(path.dirname(file));
    authorizationFault?.("record-parent-fsync");
    assertCurrentFile(file, identity, "record");
    return value;
  } catch (error) {
    if (published) {
      try { recoverRecordTemp(file); } catch { /* Preserve the publication failure. */ }
    } else {
      try {
        if (fs.existsSync(temporary)) unlinkExactFile(temporary, fileIdentity(fs.lstatSync(temporary)));
      } catch { /* Preserve the creation failure. */ }
    }
    throw new Error("Desktop authorization record creation failed", { cause: error });
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

function readOwnedJson<T>(
  file: string,
  identityOf: (value: T) => FileIdentity | undefined,
  label: string,
): T {
  recoverRecordTemp(file);
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(fd);
    assertOwnedRegular(before, label);
    const raw = fs.readFileSync(fd, "utf8");
    const value = JSON.parse(raw) as T;
    if (`${JSON.stringify(value)}\n` !== raw) throw new Error(`${label} JSON is not canonical`);
    const after = fs.fstatSync(fd);
    if (!sameJson(fileIdentity(before), fileIdentity(after))) throw new Error(`${label} changed while reading`);
    const expected = identityOf(value);
    if (expected && !sameJson(fileIdentity(before), expected)) throw new Error(`${label} file identity was replaced`);
    const current = fs.lstatSync(file);
    if (!sameJson(fileIdentity(current), fileIdentity(before))) throw new Error(`${label} path identity was replaced`);
    return value;
  } catch (error) {
    throw new Error(`Desktop ${label} authorization record is invalid`, { cause: error });
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

function recoverRecordTemp(file: string): void {
  const temporary = `${file}.tmp`;
  if (!fs.existsSync(temporary)) return;
  const tempStat = fs.lstatSync(temporary);
  if (!tempStat.isFile() || tempStat.isSymbolicLink() || (tempStat.mode & 0o777) !== 0o600
    || tempStat.uid !== effectiveUid() || ![1, 2].includes(tempStat.nlink)) {
    throw new Error("Desktop authorization temporary record is unsafe");
  }
  if (!fs.existsSync(file)) {
    if (tempStat.nlink !== 1) throw new Error("Desktop authorization unpublished record link count is invalid");
    unlinkExactFile(temporary, fileIdentity(tempStat));
    return;
  }
  const finalStat = fs.lstatSync(file);
  if (tempStat.nlink !== 2 || finalStat.nlink !== 2
    || tempStat.dev !== finalStat.dev || tempStat.ino !== finalStat.ino) {
    throw new Error("Desktop authorization partial publication identity is invalid");
  }
  unlinkExactFile(temporary, fileIdentity(tempStat));
}

function fsyncDirectory(directory: string): void {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function assertCurrentFile(file: string, expected: FileIdentity, label: string): void {
  const stat = fs.lstatSync(file);
  assertOwnedRegular(stat, label);
  if (!sameJson(fileIdentity(stat), expected)) throw new Error(`Desktop ${label} file identity was replaced`);
}

function assertOwnedRegular(stat: fs.Stats, label: string): void {
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
    || stat.uid !== effectiveUid() || stat.nlink !== 1) {
    throw new Error(`Desktop ${label} mode, owner, or link count is invalid`);
  }
}

function assertPrivateParent(file: string): void {
  const parent = exactRealDirectory(path.dirname(file), "Desktop authorization parent");
  const stat = fs.lstatSync(parent);
  if ((stat.mode & 0o777) !== 0o700 || stat.uid !== effectiveUid()) {
    throw new Error("Desktop authorization parent mode or owner is invalid");
  }
}

function readExecutable(file: string): MigrationProcessIdentity["executable"] {
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== file) {
    throw new Error("Desktop executable cannot be a symlink");
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== effectiveUid() || stat.nlink !== 1
    || (stat.mode & 0o111) === 0 || (stat.mode & 0o022) !== 0) {
    throw new Error("Desktop executable identity or mode is invalid");
  }
  return {
    pathHash: sha256(file),
    device: String(stat.dev),
    inode: String(stat.ino),
    mode: stat.mode & 0o7777,
    uid: stat.uid,
    nlink: stat.nlink,
  };
}

function exactRealDirectory(value: string, label: string): string {
  if (!path.isAbsolute(value) || fs.realpathSync(value) !== value) throw new Error(`${label} has a symlink ancestor`);
  const stat = fs.lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  return value;
}

function exactRealFile(value: string, label: string): string {
  if (!path.isAbsolute(value) || fs.realpathSync(value) !== value) throw new Error(`${label} has a symlink ancestor`);
  const stat = fs.lstatSync(value);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== effectiveUid() || stat.nlink !== 1
    || (stat.mode & 0o777) !== 0o600) {
    throw new Error(`${label} mode, owner, or link count is invalid`);
  }
  return value;
}

function fileIdentity(stat: fs.Stats): FileIdentity {
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    mode: stat.mode,
    uid: stat.uid,
    nlink: stat.nlink,
  };
}

function requirePresent(inspection: MigrationProcessIdentityInspection, label: string): MigrationProcessIdentity {
  if (inspection.status !== "present") {
    throw new Error(`Desktop authorization ${label} process identity is ${inspection.status}`);
  }
  return inspection.identity;
}

function providerFromRef(ref: string): string {
  const match = ref.match(/^provider\/([a-z][a-z0-9-]*)\/workspace\/[A-Za-z0-9._:-]+\/(?:workspace|account)\/[A-Za-z0-9._:-]+$/u);
  if (!match) throw new Error("Desktop authorization Provider ref is invalid");
  return match[1]!;
}

function sameIdentity(left: MigrationProcessIdentity, right: MigrationProcessIdentity): boolean {
  return sameJson(left, right);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function effectiveUid(): number {
  return typeof process.geteuid === "function" ? process.geteuid() : process.getuid?.() ?? 0;
}
