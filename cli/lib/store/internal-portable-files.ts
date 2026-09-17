import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { assertSafeStorePath, getObjectRow, hashSafeStoreFile, resolveObjectPath, writeExclusiveStoreTemp } from "./internal-objects.js";
import { hash, PORTABLE_TABLES, redactPortableValue, type PortableTables } from "./internal-portable-data.js";
import { SCHEMA_VERSION } from "./schema.js";

export type PortableFile = { entry: string; kind: "object" | "run" | "job_artifact" | "job_log" | "desktop" | "composition_checkout"; id: string; path: string; bytes: number; sha256: string };
export type PortableManifest = { version: 2; schemaVersion: number; workspaceId: string; tables: PortableTables; files: PortableFile[] };
const ROOT_MARKER = "ralphy-portable-root:";
export const MAX_ARCHIVE_BYTES = 1024 ** 3;
const MAX_MANIFEST_BYTES = 64 * 1024 ** 2;

export async function createPortableArchive(db: Database, root: string, output: string, tables: PortableTables): Promise<PortableManifest> {
  const workspaceId = String(tables.workspaces[0].id);
  const manifest: PortableManifest = { version: 2, schemaVersion: SCHEMA_VERSION, workspaceId, tables, files: [] };
  const entries: Record<string, Blob | string> = {};
  const sourceRoots = [...new Set([await fs.realpath(root), root])].sort((a, b) => b.length - a.length);
  const add = async (kind: PortableFile["kind"], id: string, relative: string, json = false) => {
    const source = safeRelative(root, relative);
    await assertSafeStorePath(root, source);
    const checked = await hashSafeStoreFile(root, source);
    const entry = `files/${manifest.files.length}`;
    if (checked.bytes + manifest.files.reduce((total, file) => total + file.bytes, 0) > MAX_ARCHIVE_BYTES) throw new Error("Portable packages currently support up to 1 GiB of workspace data");
    // Bun 1.3 treats file-backed Blobs as empty archive entries; materialize the bytes first.
    const handle = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
    let payload: Buffer;
    try { payload = await handle.readFile(); } finally { await handle.close(); }
    await assertSafeStorePath(root, source);
    if (payload.length !== checked.bytes || hash(payload) !== checked.sha256) throw new Error("Workspace file changed during export; retry when writes finish");
    let content: Blob = new Blob([new Uint8Array(payload)]);
    let digest = checked;
    if (json) {
      const raw = payload.toString("utf8");
      if (!Buffer.from(raw).equals(payload)) throw new Error("Workspace draft JSON must be valid UTF-8");
      // Invalid saved drafts must not quietly disappear from an export.
      const portable = sourceRoots.reduce((text, sourceRoot) => text.replaceAll(sourceRoot, ROOT_MARKER), JSON.stringify(redactPortableValue(JSON.parse(raw))));
      content = new Blob([portable]);
      digest = { bytes: content.size, sha256: hash(portable) };
    }
    entries[entry] = content;
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
  const raw = JSON.stringify(manifest);
  if (Buffer.byteLength(raw) > MAX_MANIFEST_BYTES || manifest.files.reduce((total, file) => total + file.bytes, Buffer.byteLength(raw)) > MAX_ARCHIVE_BYTES) throw new Error("This workspace exceeds the portable package size limit");
  entries["manifest.json"] = raw;
  // Uncompressed tar keeps file sizes inspectable before allocating decompressed content.
  await Bun.Archive.write(output, entries);
  await fs.chmod(output, 0o600);
  if ((await fs.stat(output)).size > MAX_ARCHIVE_BYTES) throw new Error("Portable packages currently support archives up to 1 GiB");
  return manifest;
}

export async function readPortableArchive(source: string | Uint8Array): Promise<{ manifest: PortableManifest; files: Map<string, File> }> {
  const file = typeof source === "string" ? Bun.file(source) : new Blob([new Uint8Array(source)]);
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("Portable package exceeds the size limit");
  const prefix = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (prefix[0] === 123 || prefix[0] === 91) throw new Error("Version 1 exports contain only incomplete metadata. Export the original workspace again with this version of Ralphy.");
  if (prefix[0] === 31 && prefix[1] === 139) throw new Error("Compressed portable packages are not supported");
  if (new TextDecoder().decode(prefix.slice(257, 262)) !== "ustar") throw new Error("Choose an uncompressed Ralphy workspace archive");
  const files = await new Bun.Archive(await file.arrayBuffer()).files();
  const manifestFile = files.get("manifest.json");
  if (!manifestFile || manifestFile.size > MAX_MANIFEST_BYTES) throw new Error("Portable manifest is missing or too large");
  const manifest = JSON.parse(await manifestFile.text()) as PortableManifest;
  if (!manifest || manifest.version !== 2 || manifest.schemaVersion !== SCHEMA_VERSION || typeof manifest.workspaceId !== "string"
    || !/^ws_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(manifest.workspaceId) || !manifest.tables || typeof manifest.tables !== "object" || !Array.isArray(manifest.files)) throw new Error("Portable manifest version or schema is unsupported");
  const allowed = new Set(PORTABLE_TABLES.map(({ name }) => name));
  if (Object.keys(manifest.tables).some((name) => !allowed.has(name))) throw new Error("Portable manifest contains unknown data tables");
  for (const { name } of PORTABLE_TABLES) {
    const rows = manifest.tables[name];
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)
      || Object.values(row).some((value) => value !== null && typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))))) throw new Error(`Invalid portable ${name} records`);
  }
  if (manifest.tables.workspaces.length !== 1 || manifest.tables.workspaces[0].id !== manifest.workspaceId) throw new Error("Portable package must contain exactly one workspace");
  const seen = new Set<string>();
  let bytes = manifestFile.size;
  for (const item of manifest.files) {
    if (!item || !/^files\/\d+$/.test(item.entry) || seen.has(item.entry) || !["object", "run", "job_artifact", "job_log", "desktop", "composition_checkout"].includes(item.kind)
      || typeof item.id !== "string" || typeof item.path !== "string" || !Number.isSafeInteger(item.bytes) || item.bytes < 0
      || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error("Invalid portable file manifest");
    safeRelative("/portable", item.path);
    const content = files.get(item.entry);
    if (!content || content.size !== item.bytes) throw new Error(`Portable file size does not match its manifest (${item.entry}: ${content?.size ?? "missing"} / ${item.bytes})`);
    bytes += item.bytes;
    if (bytes > MAX_ARCHIVE_BYTES) throw new Error("Portable contents exceed the size limit");
    seen.add(item.entry);
  }
  if (files.size !== seen.size + 1 || [...files.keys()].some((name) => name !== "manifest.json" && !seen.has(name))) throw new Error("Portable package contains unexpected files");
  return { manifest, files };
}

export async function stagePortableFiles(input: {
  stage: string; destination: string; manifest: PortableManifest; files: Map<string, File>;
  tables: PortableTables; ids: Map<string, string>; workspaceId: string; remapText(text: string): string;
}): Promise<string[]> {
  const paths: string[] = [];
  const copied = new Set<string>();
  const checkouts = new Set<string>();
  for (const file of input.manifest.files) {
    const content = new Uint8Array(await input.files.get(file.entry)!.arrayBuffer());
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
      const oldWorkspace = input.manifest.workspaceId;
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
