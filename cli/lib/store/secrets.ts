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
}): SecretStore {
  const dataRoot = explicitDataRoot(input.dataRoot);
  const keyProvider = input.keyProvider ?? createMacKeyProvider();
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
      assertLiveRun(dataRoot, checkedRunId);
      const secretsDir = secretDirectory(dataRoot, checkedRunId);
      const fileName = `${createHash("sha256").update(checkedRef).digest("hex")}.secret`;
      const filePath = path.join(secretsDir, fileName);
      try {
        fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
        fs.chmodSync(secretsDir, 0o700);
        fs.writeFileSync(
          path.join(secretsDir, MARKER_NAME),
          JSON.stringify({ version: 1, storeId, runId: checkedRunId }),
          { mode: 0o600 },
        );
        fs.chmodSync(path.join(secretsDir, MARKER_NAME), 0o600);
        fs.writeFileSync(filePath, Buffer.from(encoded, "base64"), { mode: 0o600 });
        fs.chmodSync(filePath, 0o600);
      } catch {
        throw secretError();
      }
      return path.posix.join("tmp", checkedRunId, "secrets", fileName);
    },
    cleanup(runId) {
      if (runId === undefined) cleanupMaterializations(dataRoot);
      else cleanupRunSecretMaterialization(dataRoot, checkedRunIdValue(runId));
    },
  };
}

/** @internal Called only after a Run transaction commits. */
export function cleanupRunSecretMaterialization(
  dataRootInput: string,
  runIdInput: string,
): void {
  const dataRoot = explicitDataRoot(dataRootInput);
  const runId = checkedRunIdValue(runIdInput);
  const storeId = readStoreId(dataRoot);
  const secretsDir = secretDirectory(dataRoot, runId);
  if (!isOwnedMaterialization(secretsDir, storeId, runId)) return;
  const state = readRunState(dataRoot, runId);
  if (state !== null && !TERMINAL_RUN_STATES.has(state)) return;
  try {
    fs.rmSync(secretsDir, { recursive: true, force: true });
  } catch {
    throw secretError();
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

function cleanupMaterializations(dataRoot: string): void {
  const tmpRoot = path.join(dataRoot, "tmp");
  if (!fs.existsSync(tmpRoot)) return;
  const storeId = readStoreId(dataRoot);
  let candidates: fs.Dirent[];
  try {
    candidates = fs.readdirSync(tmpRoot, { withFileTypes: true });
  } catch {
    throw secretError();
  }
  for (const candidate of candidates) {
    if (!candidate.isDirectory() || !RUN_ID.test(candidate.name)) continue;
    const secretsDir = secretDirectory(dataRoot, candidate.name);
    if (!isOwnedMaterialization(secretsDir, storeId, candidate.name)) continue;
    const state = readRunState(dataRoot, candidate.name);
    if (state === null || TERMINAL_RUN_STATES.has(state)) {
      try {
        fs.rmSync(secretsDir, { recursive: true, force: true });
      } catch {
        throw secretError();
      }
    }
  }
}

function isOwnedMaterialization(
  secretsDir: string,
  storeId: string,
  runId: string,
): boolean {
  try {
    if (!fs.lstatSync(secretsDir).isDirectory()) return false;
    const markerPath = path.join(secretsDir, MARKER_NAME);
    const markerStat = fs.lstatSync(markerPath);
    if (!markerStat.isFile() || markerStat.size > 1_024) return false;
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as unknown;
    return (
      isRecord(marker) &&
      marker.version === 1 &&
      marker.storeId === storeId &&
      marker.runId === runId &&
      Object.keys(marker).length === 3
    );
  } catch {
    return false;
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

function assertLiveRun(dataRoot: string, runId: string): void {
  const state = readRunState(dataRoot, runId);
  if (state === null || TERMINAL_RUN_STATES.has(state)) throw secretError();
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
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
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

function secretDirectory(dataRoot: string, runId: string): string {
  return path.join(dataRoot, "tmp", runId, "secrets");
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
