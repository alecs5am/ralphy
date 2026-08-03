import { Database } from "bun:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DomainError } from "../errors/domain.js";
import {
  openDirectoryAt,
  openExistingDirectoryAt,
  openRootDirectory,
  readDirectoryAt,
  readFileAt,
  removeDirectoryContents,
  unlinkAt,
  writeFileAt,
  type DirectoryEntry,
} from "./posix-directory.js";

export type KeyProvider = {
  lookupKey(storeId: string): Promise<Buffer | null>;
  createKey(storeId: string): Promise<Buffer>;
};

type SecretPayload = {
  version: 1;
  entries: Record<string, string>;
  files: Record<string, string>;
};

type SecretEnvelope = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

type SecretStore = {
  set(ref: string, value: string): Promise<void>;
  read(ref: string): Promise<string | null>;
  has(ref: string): Promise<boolean>;
  delete(ref: string): Promise<void>;
  setSecretFile(ref: string, value: Uint8Array): Promise<void>;
  materializeSecretFile(ref: string, runId: string): Promise<string>;
  cleanup(runId?: string): void;
};

type MaterializationDirectories = {
  root: number;
  tmp: number;
  run: number;
  secrets: number;
  runName: string;
  createdTmp: boolean;
  createdRun: boolean;
  createdSecrets: boolean;
};

type FileChange = {
  name: string;
  previous: DirectoryEntry | null;
};

const ENVELOPE_NAME = "secrets.enc";
const MARKER_NAME = ".ralphy-secret-materialization.json";
const TERMINAL_RUN_STATES = new Set(["succeeded", "failed", "cancelled"]);
const REF_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const RUN_ID = /^run_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const mutationQueues = new Map<string, Promise<void>>();

export function createSecretStore(input: {
  dataRoot: string;
  keyProvider?: KeyProvider;
  /** @internal Fault-injection seam for filesystem rollback verification. */
  commitMaterialization?: (db: Database) => void;
  /** @internal Concurrency seam invoked only after materialization directories are pinned. */
  afterMaterializationDirectoryOpen?: () => void;
  /** @internal Concurrency seam invoked only after cleanup directories are pinned. */
  afterCleanupDirectoryOpen?: () => void;
}): SecretStore {
  const dataRoot = explicitDataRoot(input.dataRoot);
  const keyProvider = input.keyProvider ?? createMacKeyProvider();
  const commitMaterialization =
    input.commitMaterialization ?? ((db: Database) => db.exec("COMMIT"));
  cleanupMaterializations(dataRoot);

  return {
    async set(ref, value) {
      const checkedRef = checkedSecretRef(ref);
      if (typeof value !== "string") throw secretError();
      await mutate(dataRoot, keyProvider, (payload) => {
        payload.entries[checkedRef] = value;
        delete payload.files[checkedRef];
      });
    },
    async read(ref) {
      const checkedRef = checkedSecretRef(ref);
      const payload = await readPayload(dataRoot, keyProvider);
      return payload.entries[checkedRef] ?? null;
    },
    async has(ref) {
      const checkedRef = checkedSecretRef(ref);
      const payload = await readPayload(dataRoot, keyProvider);
      return checkedRef in payload.entries || checkedRef in payload.files;
    },
    async delete(ref) {
      const checkedRef = checkedSecretRef(ref);
      await mutate(dataRoot, keyProvider, (payload) => {
        delete payload.entries[checkedRef];
        delete payload.files[checkedRef];
      });
    },
    async setSecretFile(ref, value) {
      const checkedRef = checkedSecretRef(ref);
      if (!(value instanceof Uint8Array)) throw secretError();
      const encoded = Buffer.from(value).toString("base64");
      await mutate(dataRoot, keyProvider, (payload) => {
        payload.files[checkedRef] = encoded;
        delete payload.entries[checkedRef];
      });
    },
    async materializeSecretFile(ref, runId) {
      const checkedRef = checkedSecretRef(ref);
      const checkedRunId = checkedRunIdValue(runId);
      const payload = await readPayload(dataRoot, keyProvider);
      const encoded = payload.files[checkedRef];
      if (encoded === undefined) throw secretError();
      const storeId = readStoreId(dataRoot);
      const fileName = `${createHash("sha256").update(checkedRef).digest("hex")}.secret`;
      materializeForLiveRun(
        dataRoot,
        storeId,
        checkedRunId,
        fileName,
        Buffer.from(encoded, "base64"),
        commitMaterialization,
        input.afterMaterializationDirectoryOpen,
      );
      return path.posix.join("tmp", checkedRunId, "secrets", fileName);
    },
    cleanup(runId) {
      if (runId === undefined) cleanupMaterializations(dataRoot);
      else {
        cleanupRunSecretMaterialization(
          dataRoot,
          checkedRunIdValue(runId),
          input.afterCleanupDirectoryOpen,
        );
      }
    },
  };
}

/** @internal Called only after a Run transaction commits. */
export function cleanupRunSecretMaterialization(
  dataRootInput: string,
  runIdInput: string,
  afterDirectoryOpen?: () => void,
): void {
  const dataRoot = explicitDataRoot(dataRootInput);
  const runId = checkedRunIdValue(runIdInput);
  const storeId = readStoreId(dataRoot);
  const directories = ownedMaterializationDirectories(
    dataRoot,
    storeId,
    runId,
    afterDirectoryOpen,
  );
  if (directories === null) return;
  const state = readRunState(dataRoot, runId);
  try {
    if (state !== null && !TERMINAL_RUN_STATES.has(state)) return;
    removeDirectoryContents(directories.secrets);
    fs.closeSync(directories.secrets);
    directories.secrets = -1;
    unlinkAt(directories.run, "secrets", true);
  } catch {
    throw secretError();
  } finally {
    closeMaterializationDirectories(directories);
  }
}

function materializeForLiveRun(
  dataRoot: string,
  storeId: string,
  runId: string,
  fileName: string,
  value: Buffer,
  commitMaterialization: (db: Database) => void,
  afterDirectoryOpen?: () => void,
): void {
  const db = openLockDatabase(dataRoot);
  let committed = false;
  let directories: MaterializationDirectories | null = null;
  const changes: FileChange[] = [];
  let originalDirectoryMode: number | null = null;
  try {
    db.exec("BEGIN IMMEDIATE");
    const state = readRunStateFromDatabase(db, runId);
    if (state === null || TERMINAL_RUN_STATES.has(state)) throw secretError();
    directories = openMaterializationDirectories(dataRoot, runId);
    afterDirectoryOpen?.();
    originalDirectoryMode = fs.fstatSync(directories.secrets).mode & 0o777;
    fs.fchmodSync(directories.secrets, 0o700);
    changes.push(
      replaceFileForAttempt(
        directories.secrets,
        MARKER_NAME,
        JSON.stringify({ version: 1, storeId, runId }),
      ),
    );
    changes.push(replaceFileForAttempt(directories.secrets, fileName, value));
    commitMaterialization(db);
    committed = true;
  } catch (error) {
    let cleanupFailed = false;
    if (directories !== null) {
      try {
        rollbackMaterializationAttempt(directories, changes, originalDirectoryMode);
      } catch {
        cleanupFailed = true;
      }
    }
    if (!committed && db.inTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The safe DomainError below owns the boundary.
      }
    }
    if (cleanupFailed) throw secretError();
    if (error instanceof DomainError) throw error;
    throw secretError();
  } finally {
    if (directories !== null) closeMaterializationDirectories(directories);
    db.close();
  }
}

async function mutate(
  dataRoot: string,
  keyProvider: KeyProvider,
  change: (payload: SecretPayload) => void,
): Promise<void> {
  await serializeMutation(dataRoot, async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existedBeforeKeyLookup = fs.existsSync(envelopePath(dataRoot));
      const storeId = readStoreId(dataRoot);
      const key = await keyForState(keyProvider, storeId, existedBeforeKeyLookup);
      const db = openLockDatabase(dataRoot);
      let committed = false;
      try {
        db.exec("BEGIN IMMEDIATE");
        const existsAfterLock = fs.existsSync(envelopePath(dataRoot));
        if (!existedBeforeKeyLookup && existsAfterLock) {
          db.exec("ROLLBACK");
          continue;
        }
        const payload = existsAfterLock
          ? decryptEnvelope(fs.readFileSync(envelopePath(dataRoot)), key)
          : emptyPayload();
        change(payload);
        writeEnvelope(dataRoot, encryptPayload(payload, key));
        db.exec("COMMIT");
        committed = true;
        return;
      } catch (error) {
        if (!committed && db.inTransaction) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // The safe DomainError below owns the boundary.
          }
        }
        if (error instanceof DomainError) throw error;
        throw secretError();
      } finally {
        db.close();
      }
    }
    throw secretError();
  });
}

async function readPayload(
  dataRoot: string,
  keyProvider: KeyProvider,
): Promise<SecretPayload> {
  const file = envelopePath(dataRoot);
  if (!fs.existsSync(file)) return emptyPayload();
  try {
    const key = await keyForState(keyProvider, readStoreId(dataRoot), true);
    return decryptEnvelope(fs.readFileSync(file), key);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw secretError();
  }
}

async function keyForState(
  provider: KeyProvider,
  storeId: string,
  ciphertextExists: boolean,
): Promise<Buffer> {
  try {
    const existing = await provider.lookupKey(storeId);
    if (existing !== null) return checkedKey(existing);
    if (ciphertextExists) throw secretError();
    return checkedKey(await provider.createKey(storeId));
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw secretError();
  }
}

function encryptPayload(payload: SecretPayload, key: Buffer): SecretEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptEnvelope(bytes: Buffer, key: Buffer): SecretPayload {
  try {
    const envelope = JSON.parse(bytes.toString("utf8")) as unknown;
    if (!isEnvelope(envelope)) throw secretError();
    const iv = decodeBase64(envelope.iv, 12);
    const tag = decodeBase64(envelope.tag, 16);
    const ciphertext = decodeBase64(envelope.ciphertext);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return checkedPayload(JSON.parse(plaintext));
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw secretError();
  }
}

function writeEnvelope(dataRoot: string, envelope: SecretEnvelope): void {
  const target = envelopePath(dataRoot);
  const temporary = path.join(dataRoot, `.${ENVELOPE_NAME}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(envelope));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o600);
    const directory = fs.openSync(dataRoot, "r");
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } catch {
    if (fd !== null) fs.closeSync(fd);
    try {
      fs.unlinkSync(temporary);
    } catch {
      // The sibling temporary may already have been atomically renamed.
    }
    throw secretError();
  }
}

function openMaterializationDirectories(
  dataRoot: string,
  runId: string,
): MaterializationDirectories {
  const root = openRootDirectory(dataRoot);
  let tmp: { fd: number; created: boolean } | null = null;
  let run: { fd: number; created: boolean } | null = null;
  let secrets: { fd: number; created: boolean } | null = null;
  try {
    tmp = openDirectoryAt(root, "tmp", 0o700);
    run = openDirectoryAt(tmp.fd, runId, 0o700);
    secrets = openDirectoryAt(run.fd, "secrets", 0o700);
    return {
      root,
      tmp: tmp.fd,
      run: run.fd,
      secrets: secrets.fd,
      runName: runId,
      createdTmp: tmp.created,
      createdRun: run.created,
      createdSecrets: secrets.created,
    };
  } catch {
    if (secrets !== null) fs.closeSync(secrets.fd);
    if (run !== null) {
      if (secrets?.created) unlinkAt(run.fd, "secrets", true, true);
      fs.closeSync(run.fd);
    }
    if (tmp !== null) {
      if (run?.created) unlinkAt(tmp.fd, runId, true, true);
      fs.closeSync(tmp.fd);
    }
    if (tmp?.created) unlinkAt(root, "tmp", true, true);
    fs.closeSync(root);
    throw secretError();
  }
}

function replaceFileForAttempt(
  directory: number,
  name: string,
  value: string | Buffer,
): FileChange {
  const previous = readFileAt(directory, name);
  writeFileAt(directory, name, value, 0o600);
  return { name, previous };
}

function rollbackMaterializationAttempt(
  directories: MaterializationDirectories,
  changes: FileChange[],
  originalDirectoryMode: number | null,
): void {
  try {
    for (const change of changes.reverse()) {
      if (change.previous === null) unlinkAt(directories.secrets, change.name, false, true);
      else {
        writeFileAt(
          directories.secrets,
          change.name,
          change.previous.bytes,
          change.previous.mode,
        );
      }
    }
    if (originalDirectoryMode !== null) {
      fs.fchmodSync(directories.secrets, originalDirectoryMode);
    }
    if (directories.createdSecrets) {
      fs.closeSync(directories.secrets);
      directories.secrets = -1;
      unlinkAt(directories.run, "secrets", true);
    }
    if (directories.createdRun) {
      fs.closeSync(directories.run);
      directories.run = -1;
      unlinkAt(directories.tmp, directories.runName, true);
    }
    if (directories.createdTmp) {
      fs.closeSync(directories.tmp);
      directories.tmp = -1;
      unlinkAt(directories.root, "tmp", true);
    }
  } catch {
    throw secretError();
  }
}

function cleanupMaterializations(dataRoot: string): void {
  let root: number | null = null;
  let tmp: number | null = null;
  let candidates: string[];
  try {
    root = openRootDirectory(dataRoot);
    tmp = openExistingDirectoryAt(root, "tmp");
    if (tmp === null) return;
    candidates = readDirectoryAt(tmp);
  } catch {
    return;
  } finally {
    if (tmp !== null) fs.closeSync(tmp);
    if (root !== null) fs.closeSync(root);
  }
  for (const candidate of candidates) {
    if (!RUN_ID.test(candidate)) continue;
    cleanupRunSecretMaterialization(dataRoot, candidate);
  }
}

function ownedMaterializationDirectories(
  dataRoot: string,
  storeId: string,
  runId: string,
  afterDirectoryOpen?: () => void,
): MaterializationDirectories | null {
  let root: number | null = null;
  let tmp: number | null = null;
  let run: number | null = null;
  let secrets: number | null = null;
  let transferred = false;
  try {
    root = openRootDirectory(dataRoot);
    tmp = openExistingDirectoryAt(root, "tmp");
    if (tmp === null) return null;
    run = openExistingDirectoryAt(tmp, runId);
    if (run === null) return null;
    secrets = openExistingDirectoryAt(run, "secrets");
    if (secrets === null) return null;
    afterDirectoryOpen?.();
    const markerBytes = readFileAt(secrets, MARKER_NAME, 1_024)?.bytes;
    if (markerBytes === undefined) return null;
    const marker = JSON.parse(markerBytes.toString("utf8")) as unknown;
    if (!isRecord(marker) ||
      marker.version !== 1 ||
      marker.storeId !== storeId ||
      marker.runId !== runId ||
      Object.keys(marker).length !== 3) {
      return null;
    }
    const directories = {
      root,
      tmp,
      run,
      secrets,
      runName: runId,
      createdTmp: false,
      createdRun: false,
      createdSecrets: false,
    };
    transferred = true;
    return directories;
  } catch {
    return null;
  } finally {
    if (!transferred) {
      if (secrets !== null) fs.closeSync(secrets);
      if (run !== null) fs.closeSync(run);
      if (tmp !== null) fs.closeSync(tmp);
      if (root !== null) fs.closeSync(root);
    }
  }
}

function closeMaterializationDirectories(directories: MaterializationDirectories): void {
  for (const fd of [
    directories.secrets,
    directories.run,
    directories.tmp,
    directories.root,
  ]) {
    if (fd >= 0) fs.closeSync(fd);
  }
}

function readRunState(dataRoot: string, runId: string): string | null {
  let db: Database | null = null;
  try {
    db = new Database(databasePath(dataRoot), { readonly: true });
    return (
      db
        .query<{ state: string }, [string]>("SELECT state FROM runs WHERE id = ?")
        .get(runId)?.state ?? null
    );
  } catch {
    throw secretError();
  } finally {
    db?.close();
  }
}

function readRunStateFromDatabase(db: Database, runId: string): string | null {
  return (
    db
      .query<{ state: string }, [string]>("SELECT state FROM runs WHERE id = ?")
      .get(runId)?.state ?? null
  );
}

function readStoreId(dataRoot: string): string {
  let db: Database | null = null;
  try {
    db = new Database(databasePath(dataRoot), { readonly: true });
    const row = db
      .query<{ storeId: string }, []>(
        "SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1",
      )
      .get();
    if (!row?.storeId) throw secretError();
    return row.storeId;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw secretError();
  } finally {
    db?.close();
  }
}

function openLockDatabase(dataRoot: string): Database {
  try {
    const db = new Database(databasePath(dataRoot), { readwrite: true });
    db.exec("PRAGMA busy_timeout = 5000");
    return db;
  } catch {
    throw secretError();
  }
}

function checkedPayload(value: unknown): SecretPayload {
  if (!isRecord(value) || value.version !== 1) throw secretError();
  const entries = checkedStringRecord(value.entries, false);
  const files = checkedStringRecord(value.files, true);
  if (Object.keys(value).length !== 3) throw secretError();
  return { version: 1, entries, files };
}

function checkedStringRecord(value: unknown, base64Values: boolean): Record<string, string> {
  if (!isRecord(value)) throw secretError();
  const result = Object.create(null) as Record<string, string>;
  for (const [key, field] of Object.entries(value)) {
    checkedSecretRef(key);
    if (typeof field !== "string" || (base64Values && !isBase64(field))) {
      throw secretError();
    }
    result[key] = field;
  }
  return result;
}

function checkedSecretRef(value: string): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 512) {
    throw secretError();
  }
  const parts = value.split("/");
  if (
    parts.length < 2 ||
    parts[0] !== "provider" ||
    parts.some((part) => !REF_COMPONENT.test(part))
  ) {
    throw secretError();
  }
  return value;
}

function checkedRunIdValue(value: string): string {
  if (typeof value !== "string" || !RUN_ID.test(value)) throw secretError();
  return value;
}

function checkedKey(value: Buffer): Buffer {
  if (!Buffer.isBuffer(value) || value.length !== 32) throw secretError();
  return value;
}

function isEnvelope(value: unknown): value is SecretEnvelope {
  return (
    isRecord(value) &&
    Object.keys(value).length === 4 &&
    value.version === 1 &&
    typeof value.iv === "string" &&
    typeof value.tag === "string" &&
    typeof value.ciphertext === "string" &&
    isBase64(value.iv) &&
    isBase64(value.tag) &&
    isBase64(value.ciphertext)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeBase64(value: string, expectedLength?: number): Buffer {
  if (!isBase64(value)) throw secretError();
  const decoded = Buffer.from(value, "base64");
  if (expectedLength !== undefined && decoded.length !== expectedLength) {
    throw secretError();
  }
  return decoded;
}

function isBase64(value: string): boolean {
  return BASE64.test(value) && Buffer.from(value, "base64").toString("base64") === value;
}

function emptyPayload(): SecretPayload {
  return {
    version: 1,
    entries: Object.create(null) as Record<string, string>,
    files: Object.create(null) as Record<string, string>,
  };
}

async function serializeMutation<T>(
  dataRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = mutationQueues.get(dataRoot) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  mutationQueues.set(dataRoot, tail);
  try {
    return await result;
  } finally {
    if (mutationQueues.get(dataRoot) === tail) mutationQueues.delete(dataRoot);
  }
}

function explicitDataRoot(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  ) {
    throw secretError();
  }
  return path.resolve(value);
}

function databasePath(dataRoot: string): string {
  return path.join(dataRoot, "ralphy.db");
}

function envelopePath(dataRoot: string): string {
  return path.join(dataRoot, ENVELOPE_NAME);
}

function secretError(): DomainError {
  return new DomainError("E_SECRET_STORE");
}

function createMacKeyProvider(): KeyProvider {
  if (process.platform !== "darwin") {
    return {
      async lookupKey() {
        throw secretError();
      },
      async createKey() {
        throw secretError();
      },
    };
  }
  return {
    async lookupKey(storeId) {
      const child = Bun.spawn({
        cmd: [
          "/usr/bin/security",
          "find-generic-password",
          "-s",
          `ralphy-domain-store-key:${storeId}`,
          "-a",
          "ralphy",
          "-w",
        ],
        stdout: "pipe",
        stderr: "pipe",
      });
      const [status, stdout] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
      ]);
      if (status === 44) return null;
      if (status !== 0) throw secretError();
      return checkedKey(Buffer.from(stdout.trim(), "base64"));
    },
    async createKey(storeId) {
      const key = randomBytes(32);
      const child = Bun.spawn({
        cmd: [
          "/usr/bin/security",
          "add-generic-password",
          "-s",
          `ralphy-domain-store-key:${storeId}`,
          "-a",
          "ralphy",
          "-w",
        ],
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      child.stdin.write(key.toString("base64"));
      child.stdin.end();
      if ((await child.exited) === 0) return key;
      const existing = await this.lookupKey(storeId);
      if (existing !== null) return existing;
      throw secretError();
    },
  };
}
