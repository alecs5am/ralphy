import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ralphDir } from "../paths.js";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import type { ObjectIngestInput, ObjectScope } from "./objects.js";
import type {
  JsonValue,
  ObjectStorageClass,
} from "./types.js";
import type {
  ObjectRow,
} from "./internal-types.js";

export type PreparedObject = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  bucket: string;
  key: string;
  sha256: string;
  mime: string;
  bytes: number;
  storageClass: ObjectStorageClass;
  originalName: string;
  metadata: JsonValue | null;
  createdAt: number;
  sourcePath: string;
  sourceRealPath: string;
  sourceDevice: number;
  sourceInode: number;
  finalPath: string;
  transfer: "copy" | "move";
};

type ObjectDbRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  backend: "local";
  bucket: string;
  key: string;
  sha256: string;
  mime: string;
  bytes: number;
  storage_class: ObjectStorageClass;
  original_name: string | null;
  metadata_json: string | null;
  created_at: number;
};

const OBJECT_COLUMNS =
  "id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes, storage_class, original_name, metadata_json, created_at";
const STORAGE_CLASSES = new Set<ObjectStorageClass>([
  "durable",
  "working",
  "diagnostic",
]);
const PREPARED_OBJECTS = new WeakSet<PreparedObject>();
const BINARY_KEYS = new Set([
  "base64",
  "b64",
  "binary",
  "blob",
  "bytes",
  "dataurl",
  "filedata",
  "imagedata",
]);
const DATA_URL =
  /data:(?:[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+)?(?:;[a-z0-9!#$&^_.+-]+=[^;,\s]+)*(?:;base64)?,[^\s"'<>]*/i;

export async function prepareObject(
  input: ObjectIngestInput & { transfer: "copy" | "move" },
): Promise<PreparedObject> {
  const scope = resolveScope(openDomainDb(), input.scope);
  const sourcePath = checkedSourcePath(input.sourcePath);
  const originalName = checkedOriginalName(input.originalName);
  const mime = checkedMime(input.mime);
  const storageClass = checkedStorageClass(input.storageClass);
  if (input.transfer !== "copy" && input.transfer !== "move") {
    throw new Error("Object transfer must be copy or move");
  }
  const metadata = checkedMetadata(input.metadata);
  const sourceRealPath = await fs.promises.realpath(sourcePath);
  const sourceStat = await fs.promises.lstat(sourcePath);
  if (!sourceStat.isFile())
    throw new Error("Object source must be a regular file");
  if (sourceStat.size <= 0) throw new Error("Object source must not be empty");
  await fs.promises.access(sourcePath, fs.constants.R_OK);

  const root = path.resolve(ralphDir());
  const bucketsRoot = await canonicalPath(path.join(root, "buckets"));
  if (isWithin(bucketsRoot, sourceRealPath)) {
    throw new Error(
      "Object source must not already be inside immutable buckets",
    );
  }

  const id = newDomainId("obj");
  const extension = safeExtension(originalName);
  const bucket = scope.projectId
    ? `buckets/${scope.workspaceId}/projects/${scope.projectId}`
    : `buckets/${scope.workspaceId}/shared`;
  const key = `objects/${id}${extension}`;
  const finalPath = resolveLocator(root, bucket, key);
  const stageDir = path.join(root, "tmp", id);
  const stagedPath = path.join(stageDir, `${id}${extension}`);
  let promoted = false;

  try {
    await assertNoSymlinkAncestors(root, stageDir);
    await fs.promises.mkdir(stageDir, { recursive: true });
    await assertNoSymlinkAncestors(root, stageDir);
    await fs.promises.copyFile(
      sourcePath,
      stagedPath,
      fs.constants.COPYFILE_FICLONE,
    );
    const { bytes, sha256 } = await hashFile(stagedPath);
    if (bytes <= 0) throw new Error("Object source must not be empty");
    await syncFile(stagedPath);
    await assertNoSymlinkAncestors(root, path.dirname(finalPath));
    await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
    await assertNoSymlinkAncestors(root, path.dirname(finalPath));
    await fs.promises.rename(stagedPath, finalPath);
    promoted = true;
    await syncFile(finalPath);
    await fs.promises.rm(stageDir, { recursive: true, force: true });
    const prepared: PreparedObject = {
      id,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      bucket,
      key,
      sha256,
      mime,
      bytes,
      storageClass,
      originalName,
      metadata,
      createdAt: Date.now(),
      sourcePath,
      sourceRealPath,
      sourceDevice: sourceStat.dev,
      sourceInode: sourceStat.ino,
      finalPath,
      transfer: input.transfer,
    };
    PREPARED_OBJECTS.add(prepared);
    return prepared;
  } catch (error) {
    if (!promoted) {
      await fs.promises.rm(stageDir, { recursive: true, force: true });
    }
    throw error;
  }
}

export function registerPreparedObject(
  db: Database,
  prepared: PreparedObject,
): ObjectRow {
  assertPreparedObject(db, prepared);
  db.prepare(
    `INSERT INTO objects
     (id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes, storage_class, original_name, metadata_json, created_at)
     VALUES (?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    prepared.id,
    prepared.workspaceId,
    prepared.projectId,
    prepared.bucket,
    prepared.key,
    prepared.sha256,
    prepared.mime,
    prepared.bytes,
    prepared.storageClass,
    prepared.originalName,
    serializeJson(prepared.metadata),
    prepared.createdAt,
  );
  const row = getObjectRow(db, prepared.id);
  if (!row) throw new Error(`Object was not registered: ${prepared.id}`);
  return row;
}

export async function ingestObjectRow(
  input: ObjectIngestInput & { transfer?: "copy" | "move" },
): Promise<ObjectRow> {
  const prepared = await prepareObject({
    ...input,
    transfer: input.transfer ?? "copy",
  });
  const object = withImmediateTransaction((db) => {
    const registered = registerPreparedObject(db, prepared);
    appendActivity(db, {
      workspaceId: registered.workspaceId,
      projectId: registered.projectId,
      entityType: "object",
      entityId: registered.id,
      action: "object.registered",
      payload: {
        bytes: registered.bytes,
        mime: registered.mime,
        storageClass: registered.storageClass,
      },
      createdAt: registered.createdAt,
    });
    return registered;
  });
  if (prepared.transfer === "move") {
    await removePreparedMoveSource(prepared);
  }
  return object;
}

export function resolveObjectPath(row: ObjectRow): string {
  resolveScope(openDomainDb(), {
    workspaceId: row.workspaceId,
    ...(row.projectId ? { projectId: row.projectId } : {}),
  });
  const resolved = resolveObjectLocator(row);
  const root = path.resolve(ralphDir());
  assertNoSymlinkAncestorsSync(root, path.dirname(resolved));
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Object bytes are missing: ${row.id}`);
    }
    throw error;
  }
  if (!stat.isFile())
    throw new Error(`Object bytes are not a regular file: ${row.id}`);
  if (stat.size <= 0) throw new Error(`Object bytes are empty: ${row.id}`);
  if (stat.size !== row.bytes)
    throw new Error(`Object byte count does not match: ${row.id}`);
  const canonicalRoot = fs.realpathSync(root);
  const canonicalResolved = fs.realpathSync(resolved);
  if (!isWithin(canonicalRoot, canonicalResolved)) {
    throw new Error("Object locator escapes .ralphy");
  }
  return resolved;
}

export function resolveObjectLocator(row: ObjectRow): string {
  if (row.backend !== "local") throw new Error("Object backend must be local");
  const expectedBucket = row.projectId
    ? `buckets/${row.workspaceId}/projects/${row.projectId}`
    : `buckets/${row.workspaceId}/shared`;
  if (row.bucket !== expectedBucket)
    throw new Error("Object bucket is invalid");
  const expectedKey = `objects/${row.id}${safeExtension(row.originalName ?? row.id)}`;
  if (row.key !== expectedKey) throw new Error("Object key is invalid");
  const root = path.resolve(ralphDir());
  return resolveLocator(root, row.bucket, row.key);
}

function resolveScope(
  db: Database,
  scope: ObjectScope,
): { workspaceId: string; projectId: string | null } {
  if (!scope.workspaceId)
    throw new Error("Object scope requires a workspaceId");
  const workspace = db
    .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
    .get(scope.workspaceId);
  if (!workspace) throw new Error(`Workspace not found: ${scope.workspaceId}`);
  if (!scope.projectId) return { workspaceId: workspace.id, projectId: null };
  const project = db
    .query<
      { workspaceId: string },
      [string]
    >("SELECT workspace_id AS workspaceId FROM projects WHERE id = ?")
    .get(scope.projectId);
  if (!project) throw new Error(`Project not found: ${scope.projectId}`);
  if (project.workspaceId !== workspace.id) {
    throw new Error("Project does not belong to the Object Workspace");
  }
  return { workspaceId: workspace.id, projectId: scope.projectId };
}

function checkedSourcePath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (
    !value ||
    /^data:/i.test(value) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("Object sourcePath must be a local file path");
  }
  return path.resolve(value);
}

function checkedOriginalName(value: string): string {
  if (!value.trim() || value === "." || value === ".." || /[\\/]/.test(value)) {
    throw new Error("Object originalName must be a non-empty basename");
  }
  return value;
}

function checkedMime(value: string): string {
  const mime = value.trim();
  if (!mime) throw new Error("Object MIME must not be empty");
  return mime;
}

function checkedStorageClass(value: ObjectStorageClass): ObjectStorageClass {
  if (!STORAGE_CLASSES.has(value)) {
    throw new Error(
      "Object storageClass must be durable, working, or diagnostic",
    );
  }
  return value;
}

function checkedMetadata(
  value: JsonValue | null | undefined,
): JsonValue | null {
  if (value === undefined || value === null) return null;
  return checkedJson(value, false, new Set<object>(), "Object metadata");
}

function safeExtension(originalName: string): string {
  const extension = path.extname(originalName);
  return /^\.[A-Za-z0-9]{1,16}$/.test(extension) ? extension.toLowerCase() : "";
}

function resolveLocator(root: string, bucket: string, key: string): string {
  assertRelativeLocator(bucket, "bucket");
  assertRelativeLocator(key, "key");
  const resolved = path.resolve(root, ...bucket.split("/"), ...key.split("/"));
  if (!isWithin(root, resolved))
    throw new Error("Object locator escapes .ralphy");
  return resolved;
}

function assertRelativeLocator(value: string, label: string): void {
  const normalized = value.replaceAll("\\", "/");
  if (
    !value ||
    value !== normalized ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    /^data:/i.test(value) ||
    normalized
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Object ${label} locator is invalid`);
  }
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function hashFile(
  filePath: string,
): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function syncFile(filePath: string): Promise<void> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function assertPreparedObject(db: Database, prepared: PreparedObject): void {
  if (!PREPARED_OBJECTS.has(prepared)) {
    throw new Error("Prepared Object must come from prepareObject");
  }
  const scope = resolveScope(db, {
    workspaceId: prepared.workspaceId,
    ...(prepared.projectId ? { projectId: prepared.projectId } : {}),
  });
  const expectedBucket = scope.projectId
    ? `buckets/${scope.workspaceId}/projects/${scope.projectId}`
    : `buckets/${scope.workspaceId}/shared`;
  const expectedKey = `objects/${prepared.id}${safeExtension(prepared.originalName)}`;
  if (prepared.bucket !== expectedBucket || prepared.key !== expectedKey) {
    throw new Error("Prepared Object locator is invalid");
  }
  if (!/^obj_[0-9a-f-]{36}$/i.test(prepared.id)) {
    throw new Error("Prepared Object ID is invalid");
  }
  if (!/^[0-9a-f]{64}$/i.test(prepared.sha256)) {
    throw new Error("Prepared Object SHA-256 is invalid");
  }
  if (!Number.isSafeInteger(prepared.bytes) || prepared.bytes <= 0) {
    throw new Error("Prepared Object byte count is invalid");
  }
  checkedMime(prepared.mime);
  checkedStorageClass(prepared.storageClass);
  checkedOriginalName(prepared.originalName);
  checkedMetadata(prepared.metadata);
  const expectedPath = resolveLocator(
    path.resolve(ralphDir()),
    prepared.bucket,
    prepared.key,
  );
  if (prepared.finalPath !== expectedPath)
    throw new Error("Prepared Object final path is invalid");
}

async function canonicalPath(candidate: string): Promise<string> {
  try {
    return await fs.promises.realpath(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
    throw error;
  }
}

async function assertNoSymlinkAncestors(
  root: string,
  target: string,
): Promise<void> {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Object path escapes .ralphy");
  }
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if ((await fs.promises.lstat(current)).isSymbolicLink()) {
        throw new Error("Object path must not contain symlink ancestors");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

function assertNoSymlinkAncestorsSync(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Object path escapes .ralphy");
  }
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new Error("Object path must not contain symlink ancestors");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

async function removePreparedMoveSource(
  prepared: PreparedObject,
): Promise<void> {
  const claimDir = await fs.promises.mkdtemp(
    path.join(path.dirname(prepared.sourceRealPath), ".ralphy-move-"),
  );
  const claimedPath = path.join(claimDir, path.basename(prepared.sourceRealPath));
  let claimed = false;
  try {
    await fs.promises.rename(prepared.sourceRealPath, claimedPath);
    claimed = true;
    const stat = await fs.promises.lstat(claimedPath);
    const facts = stat.isFile() ? await hashFile(claimedPath) : null;
    if (
      !facts ||
      stat.dev !== prepared.sourceDevice ||
      stat.ino !== prepared.sourceInode ||
      facts.bytes !== prepared.bytes ||
      facts.sha256 !== prepared.sha256
    ) {
      throw new Error("Object move source changed after preparation");
    }
    await fs.promises.unlink(claimedPath);
    claimed = false;
  } catch (error) {
    if (claimed) await restoreClaimedSource(claimedPath, prepared.sourceRealPath);
    throw error;
  } finally {
    try {
      await fs.promises.rmdir(claimDir);
    } catch {
      // A preserved claim or concurrent entry keeps the private directory.
    }
  }
}

async function restoreClaimedSource(
  claimedPath: string,
  sourcePath: string,
): Promise<void> {
  try {
    await fs.promises.link(claimedPath, sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
    throw error;
  }
  await fs.promises.unlink(claimedPath);
}

function checkedJson(
  value: unknown,
  binaryContext: boolean,
  seen: Set<object>,
  label: string,
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error(`${label} contains a non-finite number`);
    return value;
  }
  if (typeof value === "string") {
    if (DATA_URL.test(value))
      throw new Error(`${label} must not contain a data URL`);
    if (binaryContext && isStrictBase64(value)) {
      throw new Error(`${label} contains base64 beneath a binary key`);
    }
    return value;
  }
  if (typeof value !== "object") throw new Error(`${label} must be JSON`);
  if (seen.has(value)) throw new Error(`${label} must not contain cycles`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => checkedJson(item, binaryContext, seen, label));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-JSON object`);
    }
    const result = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(value)) {
      if (DATA_URL.test(key))
        throw new Error(`${label} must not contain a data URL`);
      result[key] = checkedJson(
        (value as Record<string, unknown>)[key],
        binaryContext || BINARY_KEYS.has(key.toLowerCase()),
        seen,
        label,
      );
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function isStrictBase64(value: string): boolean {
  return (
    value.length >= 4 &&
    value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    ) &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}

export function getObjectRow(db: Database, id: string): ObjectRow | null {
  const row = db
    .query<
      ObjectDbRow,
      [string]
    >(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?`)
    .get(id);
  return row ? toObjectRow(row) : null;
}

function toObjectRow(row: ObjectDbRow): ObjectRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    backend: row.backend,
    bucket: row.bucket,
    key: row.key,
    sha256: row.sha256,
    mime: row.mime,
    bytes: row.bytes,
    storageClass: row.storage_class,
    originalName: row.original_name,
    metadata:
      row.metadata_json === null
        ? null
        : (JSON.parse(row.metadata_json) as JsonValue),
    createdAt: row.created_at,
  };
}

function serializeJson(value: JsonValue | null): string | null {
  return value === null ? null : JSON.stringify(value);
}
