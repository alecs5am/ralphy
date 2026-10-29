import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { assertSafeStorePath, getObjectRow, hashSafeStoreFile, resolveObjectPath, writeExclusiveStoreTemp } from "./internal-objects.js";
import { hash, PORTABLE_TABLES, redactPortableValue, STREAMED_TABLES, type PortableRecord, type PortableTables } from "./internal-portable-data.js";
import { MAX_ARCHIVE_BYTES, MAX_CHUNK_BYTES, MAX_MANIFEST_BYTES, PortableArchiveReader, type PortableArchiveWriter, type PortableRowChunk } from "./internal-portable-archive.js";
import { SCHEMA_VERSION } from "./schema.js";

export { MAX_ARCHIVE_BYTES } from "./internal-portable-archive.js";
export type PortableFile = { entry: string; kind: "object" | "run" | "job_artifact" | "job_log" | "desktop" | "composition_checkout"; id: string; path: string; bytes: number; sha256: string };
/** Version 2 packages (before #584) carry every table inline in the manifest. */
export type PortableManifestV2 = { version: 2; schemaVersion: number; workspaceId: string; tables: PortableTables; files: PortableFile[] };
/** Version 3 packages (#584) carry rows in hashed NDJSON chunks listed by `rows`. */
export type PortableManifestV3 = { version: 3; schemaVersion: number; workspaceId: string; rows: PortableRowChunk[]; files: PortableFile[] };
export type PortableManifest = PortableManifestV2 | PortableManifestV3;
export type PortableArchive = { manifest: PortableManifest; reader: PortableArchiveReader };
export const PORTABLE_PACKAGE_VERSION = 3;
const ROOT_MARKER = "ralphy-portable-root:";

/**
 * Completes a version 3 package whose streamed-table chunks the caller already
 * wrote: files are copied block by block with their digests checked, then the
 * in-memory tables (mutated by the file pass) and the manifest are written.
 */
export async function createPortableArchive(db: Database, root: string, writer: PortableArchiveWriter, tables: PortableTables): Promise<PortableManifestV3> {
  const workspaceId = String(tables.workspaces[0].id);
  const manifest: PortableManifestV3 = { version: 3, schemaVersion: SCHEMA_VERSION, workspaceId, rows: writer.rows, files: [] };
  const sourceRoots = [...new Set([await fs.realpath(root), root])].sort((a, b) => b.length - a.length);
  let fileBytes = 0;
  const add = async (kind: PortableFile["kind"], id: string, relative: string, json = false) => {
    const source = safeRelative(root, relative);
    await assertSafeStorePath(root, source);
    const checked = await hashSafeStoreFile(root, source);
    const entry = `files/${manifest.files.length}`;
    if (checked.bytes + fileBytes > MAX_ARCHIVE_BYTES) throw new Error("Portable packages currently support up to 1 GiB of workspace data");
    const handle = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
    let digest = checked;
    try {
      await assertSafeStorePath(root, source);
      if (json) {
        const payload = await handle.readFile();
        if (payload.length !== checked.bytes || hash(payload) !== checked.sha256) throw new Error("Workspace file changed during export; retry when writes finish");
        const raw = payload.toString("utf8");
        if (!Buffer.from(raw).equals(payload)) throw new Error("Workspace draft JSON must be valid UTF-8");
        // Invalid saved drafts must not quietly disappear from an export.
        const portable = Buffer.from(sourceRoots.reduce((text, sourceRoot) => text.replaceAll(sourceRoot, ROOT_MARKER), JSON.stringify(redactPortableValue(JSON.parse(raw)))));
        writer.entry(entry, portable);
        digest = { bytes: portable.length, sha256: hash(portable) };
      } else if (await writer.file(entry, handle, checked.bytes) !== checked.sha256) throw new Error("Workspace file changed during export; retry when writes finish");
    } finally { await handle.close(); }
    fileBytes += digest.bytes;
    manifest.files.push({ entry, kind, id, path: relative, ...digest });
  };
  for (const row of tables.objects) {
    const object = getObjectRow(db, String(row.id));
    if (!object) throw new Error("An exported Object disappeared");
    const relative = path.relative(root, resolveObjectPath(object)).split(path.sep).join("/");
    await add("object", String(row.id), relative);
    const file = manifest.files.at(-1)!;
    if (file.bytes !== row.bytes || file.sha256 !== row.sha256) throw new Error(`Object bytes changed or are damaged: ${row.id}`);
  }
  for (const row of tables.run_objects) {
    if (row.object_id !== null) continue;
    const relative = String(row.path);
    const info = await fs.lstat(safeRelative(root, relative)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
    if (!info) {
      if (row.state === "forensic" || row.state === "diagnostic") throw new Error("A diagnostic file is missing from this workspace");
      continue;
    }
    await add("run", String(row.id), relative);
    const file = manifest.files.at(-1)!;
    row.bytes = file.bytes; row.sha256 = file.sha256;
  }
  for (const [table, column, kind] of [["job_artifacts", "path", "job_artifact"], ["jobs", "log_path", "job_log"]] as const) {
    for (const row of tables[table]) {
      if (!row[column] || (table === "job_artifacts" && row.object_id !== null)) continue;
      const stored = String(row[column]);
      const relative = path.isAbsolute(stored) ? path.relative(root, stored).split(path.sep).join("/") : stored;
      const source = safeRelative(root, relative);
      const exists = await fs.lstat(source).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
      if (!exists) continue; // Pruned working files remain recorded as history.
      await add(kind, String(row.id), relative);
      if (table === "job_artifacts") { row.bytes = manifest.files.at(-1)!.bytes; row.sha256 = manifest.files.at(-1)!.sha256; }
    }
  }
  async function tree(relative: string, kind: "desktop" | "composition_checkout" = "desktop", id = relative): Promise<void> {
    const target = safeRelative(root, relative);
    await assertSafeStorePath(root, target);
    const info = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error("Workspace exports cannot include symbolic links");
    if (info.isDirectory()) {
      for (const name of await fs.readdir(target)) {
        if (name === ".write-lock") throw new Error("A workspace draft is being written. Retry the export when it finishes.");
        if (name.startsWith(".") || name === "node_modules") continue;
        await tree(`${relative}/${name}`, kind, kind === "desktop" ? `${relative}/${name}` : id);
      }
    } else if (info.isFile()) await add(kind, id, relative, kind === "desktop" && relative.endsWith(".json"));
    else throw new Error("Workspace exports accept only regular files");
  }
  for (const revision of tables.composition_revisions) await tree(`tmp/${revision.id}/checkout`, "composition_checkout", String(revision.id));
  await tree(`media-library/canvases/${workspaceId}`);
  await tree(`media-library/video-workspaces/${workspaceId}`);
  await tree(`media-library/agent-chats/${hash(JSON.stringify(workspaceId))}.json`);
  for (const { name } of PORTABLE_TABLES) if (!STREAMED_TABLES.has(name)) writer.writeRows(name, tables[name]);
  // Uncompressed tar keeps entry sizes inspectable before any content is read.
  writer.finish(JSON.stringify(manifest));
  return manifest;
}

/** Indexes a package on disk and validates its manifest; row chunks are read and verified only when consumed. */
export async function readPortableArchive(source: string): Promise<PortableArchive> {
  const reader = PortableArchiveReader.open(source);
  try {
    const manifestSize = reader.size("manifest.json");
    if (manifestSize === null || manifestSize > MAX_MANIFEST_BYTES) throw new Error("Portable manifest is missing or too large");
    const manifest = JSON.parse(reader.read("manifest.json").toString("utf8")) as PortableManifest;
    if (!manifest || (manifest.version !== 2 && manifest.version !== 3) || manifest.schemaVersion !== SCHEMA_VERSION || typeof manifest.workspaceId !== "string"
      || !/^ws_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(manifest.workspaceId) || !Array.isArray(manifest.files)
      || (manifest.version === 2 ? !manifest.tables || typeof manifest.tables !== "object" : !Array.isArray(manifest.rows))) throw new Error("Portable manifest version or schema is unsupported");
    const allowed = new Set(PORTABLE_TABLES.map(({ name }) => name));
    const seen = new Set<string>();
    if (manifest.version === 2) {
      if (Object.keys(manifest.tables).some((name) => !allowed.has(name))) throw new Error("Portable manifest contains unknown data tables");
      for (const { name } of PORTABLE_TABLES) {
        const rows = manifest.tables[name];
        if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)
          || Object.values(row).some((value) => value !== null && typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))))) throw new Error(`Invalid portable ${name} records`);
      }
      if (manifest.tables.workspaces.length !== 1 || manifest.tables.workspaces[0].id !== manifest.workspaceId) throw new Error("Portable package must contain exactly one workspace");
    } else {
      for (const chunk of manifest.rows) {
        if (!chunk || typeof chunk.entry !== "string" || !/^rows\/\d+$/.test(chunk.entry) || seen.has(chunk.entry)) throw new Error("Invalid portable row manifest");
        if (typeof chunk.table !== "string" || !allowed.has(chunk.table)) throw new Error("Portable manifest contains unknown data tables");
        if (!Number.isSafeInteger(chunk.rows) || chunk.rows < 1 || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 1 || chunk.bytes > MAX_CHUNK_BYTES
          || typeof chunk.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(chunk.sha256) || reader.size(chunk.entry) !== chunk.bytes) throw new Error(`Invalid portable ${chunk.table} row chunk`);
        seen.add(chunk.entry);
      }
    }
    let bytes = manifestSize;
    for (const item of manifest.files) {
      if (!item || !/^files\/\d+$/.test(item.entry) || seen.has(item.entry) || !["object", "run", "job_artifact", "job_log", "desktop", "composition_checkout"].includes(item.kind)
        || typeof item.id !== "string" || typeof item.path !== "string" || !Number.isSafeInteger(item.bytes) || item.bytes < 0
        || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error("Invalid portable file manifest");
      safeRelative("/portable", item.path);
      const size = reader.size(item.entry);
      if (size !== item.bytes) throw new Error(`Portable file size does not match its manifest (${item.entry}: ${size ?? "missing"} / ${item.bytes})`);
      bytes += item.bytes;
      if (bytes > MAX_ARCHIVE_BYTES) throw new Error("Portable contents exceed the size limit");
      seen.add(item.entry);
    }
    if (reader.entries.size !== seen.size + 1 || [...reader.entries.keys()].some((name) => name !== "manifest.json" && !seen.has(name))) throw new Error("Portable package contains unexpected files");
    return { manifest, reader };
  } catch (error) {
    reader.close();
    throw error;
  }
}

/** Yields a table's rows one verified chunk at a time (a version 2 table is one inline batch). */
export function* portableRowBatches(archive: PortableArchive, table: string): Generator<PortableRecord[]> {
  const { manifest } = archive;
  if (manifest.version === 2) {
    if (manifest.tables[table]?.length) yield manifest.tables[table];
    return;
  }
  for (const chunk of manifest.rows) if (chunk.table === table) yield archive.reader.readRows(chunk);
}

/** Loads the in-memory (non-streamed) tables, or every table when `includeStreamed` is set. */
export function loadPortableTables(archive: PortableArchive, includeStreamed = false): PortableTables {
  const tables: PortableTables = {};
  for (const { name } of PORTABLE_TABLES) {
    if (!includeStreamed && STREAMED_TABLES.has(name)) continue;
    const rows: PortableRecord[] = [];
    for (const batch of portableRowBatches(archive, name)) for (const row of batch) rows.push(row);
    tables[name] = rows;
  }
  if (tables.workspaces.length !== 1 || tables.workspaces[0].id !== archive.manifest.workspaceId) throw new Error("Portable package must contain exactly one workspace");
  return tables;
}

export async function stagePortableFiles(input: {
  stage: string; destination: string; archive: PortableArchive;
  tables: PortableTables; ids: Map<string, string>; workspaceId: string; remapText(text: string): string;
}): Promise<string[]> {
  const paths: string[] = [];
  const copied = new Set<string>();
  const checkouts = new Set<string>();
  const { manifest } = input.archive;
  for (const file of manifest.files) {
    const content: Uint8Array = input.archive.reader.read(file.entry);
    if (hash(content) !== file.sha256) throw new Error("Portable file checksum does not match its manifest");
    let relative: string;
    let output = content;
    if (file.kind === "object") {
      const row = input.tables.objects.find((row) => row.id === input.ids.get(file.id));
      if (!row || row.bytes !== file.bytes || row.sha256 !== file.sha256) throw new Error("Portable Object does not match its bytes");
      relative = `${row.bucket}/${row.key}`;
    } else if (file.kind === "run") {
      const row = input.tables.run_objects.find((row) => row.id === input.ids.get(file.id));
      if (!row || row.object_id !== null || row.bytes !== file.bytes || row.sha256 !== file.sha256) throw new Error("Portable Run file does not match its bytes");
      relative = `portable-runs/${input.workspaceId}/${row.id}/file`;
      row.path = relative;
    } else if (file.kind === "job_artifact" || file.kind === "job_log") {
      const table = file.kind === "job_artifact" ? "job_artifacts" : "jobs";
      const row = input.tables[table].find((row) => String(row.id) === input.ids.get(`${table}:${file.id}`));
      if (!row || (file.kind === "job_artifact" && (row.object_id !== null || row.bytes !== file.bytes || row.sha256 !== file.sha256))) throw new Error("Portable Job file does not match its bytes");
      relative = `portable-runs/${input.workspaceId}/${file.kind}-${row.id}/file`;
      row[file.kind === "job_artifact" ? "path" : "log_path"] = relative;
    } else if (file.kind === "composition_checkout") {
      const revisionId = input.ids.get(file.id);
      if (!revisionId || !input.tables.composition_revisions.some((row) => row.id === revisionId) || !file.path.startsWith(`tmp/${file.id}/checkout/`)) throw new Error("Portable composition checkout is outside its revision");
      relative = `tmp/${revisionId}/checkout/${file.path.slice(`tmp/${file.id}/checkout/`.length)}`;
      checkouts.add(revisionId);
    } else {
      const oldWorkspace = manifest.workspaceId;
      const oldChat = `media-library/agent-chats/${hash(JSON.stringify(oldWorkspace))}.json`;
      if (file.path === oldChat) relative = `media-library/agent-chats/${hash(JSON.stringify(input.workspaceId))}.json`;
      else if (file.path.startsWith(`media-library/canvases/${oldWorkspace}/`) || file.path.startsWith(`media-library/video-workspaces/${oldWorkspace}/`)) relative = input.remapText(file.path);
      else throw new Error("Portable desktop file is outside its workspace");
      if (file.path.endsWith(".json")) {
        const raw = input.remapText(new TextDecoder().decode(content)).replaceAll(ROOT_MARKER, input.destination);
        const value = JSON.parse(raw);
        if (file.path === oldChat && Array.isArray(value.chats)) {
          const chatIds = new Map<string, string>();
          for (const chat of value.chats) {
            if (!chat || typeof chat.id !== "string" || !chat.id || chatIds.has(chat.id)) throw new Error("Portable chat identities are invalid");
            const id = `chat-${randomUUID()}`;
            chatIds.set(chat.id, id);
            chat.id = id;
            chat.sessionId = null;
            chat.busy = false;
            chat.streamingAssistantId = null;
            chat.permissionMode = "plan";
          }
          value.activeChatId = chatIds.get(value.activeChatId) ?? value.chats[0]?.id ?? null;
        }
        output = new TextEncoder().encode(JSON.stringify(value));
      }
    }
    const target = safeRelative(input.stage, relative);
    if (copied.has(relative)) throw new Error("Portable files contain duplicate destinations");
    copied.add(relative);
    await writeExclusiveStoreTemp(input.stage, target, output);
    paths.push(relative);
  }
  for (const object of input.tables.objects) if (!copied.has(`${object.bucket}/${object.key}`)) throw new Error("Portable package is missing Object bytes");
  // Sealed source Objects are portable even when their disposable checkout was pruned
  // or the archive predates checkout export. Live checkout files take precedence.
  for (const file of input.tables.composition_revision_files) {
    const revisionId = String(file.composition_revision_id);
    if (checkouts.has(revisionId) || !input.tables.composition_revisions.some((revision) => revision.id === revisionId && revision.state === "sealed")) continue;
    const object = input.tables.objects.find((row) => row.id === file.object_id);
    if (!object) throw new Error("Portable composition source Object is missing");
    const relative = `tmp/${revisionId}/checkout/${file.logical_path}`;
    if (copied.has(relative)) throw new Error("Portable composition sources contain duplicate destinations");
    await writeExclusiveStoreTemp(input.stage, safeRelative(input.stage, relative), await fs.readFile(safeRelative(input.stage, `${object.bucket}/${object.key}`)));
    copied.add(relative); paths.push(relative);
  }
  return paths;
}

export function safeRelative(root: string, relative: string): string {
  if (!relative || relative.includes("\\") || relative.includes("\0") || relative.startsWith("/") || /^[a-z]:/i.test(relative)
    || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid portable file path");
  return path.join(root, ...relative.split("/"));
}
