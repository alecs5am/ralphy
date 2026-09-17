import { Database } from "bun:sqlite";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { ingestObjectRow, getObjectRow, resolveObjectPath, ensureSafeStoreDirectory, hashSafeStoreFile, promoteStagedFile } from "./internal-objects.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { ralphDir } from "../paths.js";
import { startRun, finishRun } from "./runs.js";
import { applyMigrations } from "./schema.js";
import { verifyDomainStore } from "./verify.js";
import { hash, PORTABLE_TABLES, readPortableTables, normalizePortableTables, remapPortableTables, insertPortableTables, type PortableMapping } from "./internal-portable-data.js";
import { MAX_ARCHIVE_BYTES, createPortableArchive, readPortableArchive, stagePortableFiles, safeRelative } from "./internal-portable-files.js";
import type { JsonValue } from "./types.js";

export type PortableExportResult = {
  runId: string;
  packageObjectId: string;
  manifestSummary: { version: 2; workspaceId: string; entityCounts: Record<string, number>; fileCount: number };
};
export type PortablePage<T> = { items: T[]; nextCursor: string | null };
export type PortableImportResult = {
  workspaceId: string;
  entityMapPage: PortablePage<PortableMapping>;
  relinkPage: PortablePage<{ oldId: string; newId: string; platform: string; provider: string; handle: string | null }>;
};
type ImportInput = {
  packageObjectId: string;
  idempotencyKey: string;
  workspaceSlug?: string;
  workspaceName?: string;
  entityAfter?: string | null;
  relinkAfter?: string | null;
  limit?: number;
};
type ImportReceipt = { workspaceId: string; mapping: PortableMapping[]; relinks: PortableImportResult["relinkPage"]["items"] };

export async function exportWorkspacePackage(input: { workspaceId: string; projectId?: string | null }): Promise<PortableExportResult> {
  if (input.projectId != null) throw new Error("Portable transfer requires the entire workspace to preserve shared references and drafts. Omit projectId.");
  const db = openDomainDb();
  const tables = db.transaction(() => readPortableTables(db, input.workspaceId, input.projectId ?? null)).deferred();
  const run = startRun({ workspaceId: input.workspaceId, projectId: input.projectId ?? null, kind: "workspace.export", label: "Portable Workspace export", metadata: { version: 2 } });
  const root = path.resolve(ralphDir());
  const file = path.join(root, "exports", `${run.id}.workspace.tar`);
  try {
    await ensureSafeStoreDirectory(root, path.dirname(file));
    const manifest = await createPortableArchive(db, root, file, tables);
    const object = await ingestObjectRow({
      scope: { workspaceId: input.workspaceId }, sourcePath: file,
      originalName: `${run.id}.workspace.tar`, mime: "application/vnd.ralphy.workspace+tar", storageClass: "durable",
    });
    finishRun(run.id, { state: "succeeded" });
    const entityCounts = Object.fromEntries(PORTABLE_TABLES.map(({ name, type }) => [type, tables[name].length]));
    entityCounts.socialAccount = tables.social_accounts.length;
    return { runId: run.id, packageObjectId: object.id, manifestSummary: { version: 2, workspaceId: manifest.workspaceId, entityCounts, fileCount: manifest.files.length } };
  } catch (error) {
    finishRun(run.id, { state: "failed", error });
    throw error;
  } finally { await fs.rm(file, { force: true }); }
}

export async function importWorkspacePackage(input: ImportInput): Promise<PortableImportResult> {
  validateImportInput(input);
  const db = openDomainDb();
  const existing = importReceipt(db, input);
  if (existing) return resultPage(existing, input);
  const object = getObjectRow(db, input.packageObjectId);
  if (!object || object.storageClass !== "durable" || !object.mime.startsWith("application/vnd.ralphy.workspace")) throw new Error("Portable package Object not found");
  const root = path.resolve(ralphDir());
  const packagePath = resolveObjectPath(object);
  const checked = await hashSafeStoreFile(root, packagePath);
  if (checked.bytes !== object.bytes || checked.sha256 !== object.sha256) throw new Error("Portable package Object bytes are damaged");
  const archive = await readPortableArchive(packagePath);
  return importArchive(input, archive, object.workspaceId);
}

/** File import also works before the first workspace exists; paths never enter the domain store. */
export async function importWorkspaceArchiveFile(input: Omit<ImportInput, "packageObjectId"> & { filePath: string }): Promise<PortableImportResult> {
  validateImportInput(input);
  const source = await fs.open(path.resolve(input.filePath), constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const stat = await source.stat();
    if (!stat.isFile() || stat.size > MAX_ARCHIVE_BYTES) throw new Error("Choose a regular portable package of up to 1 GiB");
    bytes = await source.readFile();
    if (bytes.length !== stat.size) throw new Error("Portable package changed while it was being read");
  } finally { await source.close(); }
  const options = { ...input, packageObjectId: `file-sha256:${hash(bytes)}` };
  const existing = importReceipt(openDomainDb(), options);
  if (existing) return resultPage(existing, options);
  return importArchive(options, await readPortableArchive(bytes), null);
}

async function importArchive(input: ImportInput, archive: Awaited<ReturnType<typeof readPortableArchive>>, ownerWorkspaceId: string | null): Promise<PortableImportResult> {
  const db = openDomainDb();
  const root = path.resolve(ralphDir());
  const prepared = remapPortableTables(db, normalizePortableTables(archive.manifest.tables), input);
  await ensureSafeStoreDirectory(root, path.join(root, "tmp"));
  const stage = await fs.mkdtemp(path.join(root, "tmp", "portable-"));
  const run = startRun({ workspaceId: ownerWorkspaceId, kind: ownerWorkspaceId ? "workspace.import" : "migration", label: "Portable Workspace import", metadata: { version: 2, operation: "workspace.import", packageObjectId: input.packageObjectId, idempotencyKey: input.idempotencyKey } });
  const promoted: string[] = [];
  let committed = false;
  try {
    const paths = await stagePortableFiles({ stage, destination: root, ...archive, ...prepared });
    const stageDb = new Database(path.join(stage, "ralphy.db"), { create: true });
    try {
      stageDb.exec("PRAGMA foreign_keys = ON");
      applyMigrations(stageDb);
      stageDb.transaction(() => insertPortableTables(stageDb, prepared.tables)).immediate();
    } finally { stageDb.close(); }
    const report = verifyDomainStore({ dataRoot: stage, hashObjects: true });
    const issues = Object.entries(report).filter(([key, value]) => Array.isArray(value)
      && !["integrityCheck", "unreferencedObjects"].includes(key) && value.length > 0);
    if (report.integrityCheck.join() !== "ok" || issues.length) throw new Error(`Portable workspace failed verification: ${issues.map(([key]) => key).join(", ") || "database integrity"}`);
    for (const relative of paths) {
      const source = safeRelative(stage, relative), target = safeRelative(root, relative);
      const digest = await hashSafeStoreFile(stage, source);
      if (await promoteStagedFile(root, source, target, digest)) promoted.push(target);
    }
    const relinks = archive.manifest.tables.social_accounts.map((account) => ({
      oldId: String(account.id), newId: prepared.ids.get(String(account.id))!, platform: String(account.platform),
      provider: String(account.platform), handle: typeof account.username === "string" ? account.username : null,
    }));
    const receipt = { workspaceId: prepared.workspaceId, mapping: prepared.mapping, relinks };
    const result = withImmediateTransaction((db) => {
      const replay = importReceipt(db, input);
      if (replay) { finishRun(run.id, { state: "cancelled" }); return resultPage(replay, input); }
      insertPortableTables(db, prepared.tables);
      db.prepare("UPDATE runs SET metadata_json = ? WHERE id = ?").run(JSON.stringify({
        version: 2, operation: "workspace.import", packageObjectId: input.packageObjectId, idempotencyKey: input.idempotencyKey, ...receipt,
      } satisfies JsonValue), run.id);
      finishRun(run.id, { state: "succeeded" });
      return resultPage(receipt, input);
    });
    committed = result.workspaceId === prepared.workspaceId;
    return result;
  } catch (error) {
    finishRun(run.id, { state: "failed", error });
    throw error;
  } finally {
    if (!committed) for (const file of promoted) await fs.rm(file, { force: true });
    await fs.rm(stage, { recursive: true, force: true });
  }
}

function importReceipt(db: Database, input: ImportInput): ImportReceipt | null {
  const row = db.query<{ metadata: string }, [string, string]>(`SELECT metadata_json AS metadata FROM runs
    WHERE (kind = 'workspace.import' OR (kind = 'migration' AND json_extract(metadata_json, '$.operation') = 'workspace.import')) AND state = 'succeeded'
      AND json_extract(metadata_json, '$.idempotencyKey') = ? AND json_extract(metadata_json, '$.packageObjectId') = ?
    ORDER BY created_at DESC LIMIT 1`).get(input.idempotencyKey, input.packageObjectId);
  if (!row) return null;
  const value = JSON.parse(row.metadata) as ImportReceipt & { version?: number };
  if (value.version !== 2) throw new Error("This earlier import restored metadata only. Import a new complete package with a new idempotency key.");
  return value;
}
function validateImportInput(input: Omit<ImportInput, "packageObjectId">): void {
  if (!/^[!-~]{1,128}$/.test(input.idempotencyKey)) throw new Error("Portable idempotency key is invalid");
  page([], input.entityAfter, input.limit); page([], input.relinkAfter, input.limit);
}
function resultPage(receipt: ImportReceipt, input: ImportInput): PortableImportResult {
  return { workspaceId: receipt.workspaceId, entityMapPage: page(receipt.mapping, input.entityAfter, input.limit), relinkPage: page(receipt.relinks, input.relinkAfter, input.limit) };
}
function page<T>(items: T[], after: string | null | undefined, rawLimit: number | undefined): PortablePage<T> {
  const limit = rawLimit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (after != null && !/^(0|[1-9]\d*)$/.test(after))) throw new Error("Portable page cursor or limit is invalid");
  const start = after == null ? 0 : Number(after);
  if (!Number.isSafeInteger(start)) throw new Error("Portable page cursor is invalid");
  const selected = items.slice(start, start + limit);
  return { items: selected, nextCursor: start + selected.length < items.length ? String(start + selected.length) : null };
}
