import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { newDomainId } from "../store/ids.js";
import {
  getObjectRow,
  prepareObject,
  registerPreparedObject,
  type PreparedObject,
} from "../store/internal-objects.js";
import { normalizeRelativePath } from "./legacy.js";
import type { MigrationContext } from "./types.js";

export type StageSummary = {
  staged: number;
  bytes: number;
  issues: number;
  digest: string;
};

export type StageOptions = {
  copyMode?: "clone" | "copy";
  freeBytes?: number;
};

type Entry = {
  id: string;
  sourceLabel: string;
  sourcePath: string;
  sourceLocatorHash: string;
  entryKind: string;
  disposition: string;
  state: string;
  device: string;
  inode: string;
  mode: number;
  bytes: number;
  mtimeMs: number;
  sha256: string | null;
  targetPath: string | null;
  targetRefs: string | null;
  rawEvidenceObjectId: string | null;
};

type Scope = { workspaceId: string; projectId?: string };

export async function stageInventoryObjects(
  ctx: MigrationContext,
  options: StageOptions = {},
): Promise<StageSummary> {
  assertContext(ctx);
  const run = ctx.db.query<{ phase: string; sourceBytes: number }, [string]>(
    "SELECT phase, source_bytes AS sourceBytes FROM migration_runs WHERE id = ?",
  ).get(ctx.runId);
  if (!run || !new Set(["inventory", "import", "objects", "relations"]).has(run.phase)) {
    throw new Error("Migration Run is not ready for Object staging");
  }
  if (options.copyMode === "copy") assertCopySpace(ctx, run.sourceBytes, options.freeBytes);

  const rows = entries(ctx);
  const digests: string[] = [];
  let staged = 0;
  let bytes = 0;
  let issues = 0;

  for (const initial of rows) {
    if (isSecret(initial)) continue;
    if (initial.state === "verified" || initial.state === "imported" || initial.state === "excluded") continue;
    if (initial.entryKind === "directory") {
      terminalizeExcluded(ctx, initial, "system", null, EMPTY_SHA256);
      continue;
    }
    if (isSystem(initial)) {
      const source = sourceFile(ctx, initial);
      const before = sourceFacts(source, initial);
      const digest = await hashFile(source);
      assertSourceUnchanged(source, before);
      terminalizeExcluded(ctx, initial, "system", null, digest.sha256);
      continue;
    }
    if (initial.state === "issue" || initial.disposition === "issue") continue;
    if (initial.entryKind !== "file") continue;

    let row = initial;
    if (row.disposition === "cache" && isWorkingEvidence(row.sourcePath)) {
      updateDisposition(ctx, row.id, "run-object");
      row = { ...row, disposition: "run-object" };
    }
    if (row.disposition === "cache") {
      await stageCache(ctx, row, options.copyMode ?? "clone");
      continue;
    }
    if (row.disposition === "domain" && row.bytes === 0 && canonicalRefs(row.targetRefs).length > 0) {
      const refs = canonicalRefs(row.targetRefs);
      verifyTargetRefs(ctx, refs);
      const now = Date.now();
      ctx.db.prepare(
        `UPDATE migration_entries SET sha256 = ?, state = 'imported', terminal_at = ?, updated_at = ?
         WHERE id = ? AND state = 'inventoried'`,
      ).run(EMPTY_SHA256, now, now, row.id);
      continue;
    }
    if (row.bytes === 0) {
      issues += recordBlockingIssue(ctx, row, "MIGRATION_OBJECT_EMPTY");
      continue;
    }
    if (row.disposition === "domain" && row.targetPath) {
      const result = await stageControlEvidence(ctx, row, options.copyMode ?? "clone");
      staged += result.staged;
      bytes += result.bytes;
      digests.push(...result.digests);
      continue;
    }
    if (!new Set(["object", "run-object", "decoded-object"]).has(row.disposition)) continue;
    const result = await stageFileObject(ctx, row, options.copyMode ?? "clone");
    staged += result.staged;
    bytes += result.bytes;
    digests.push(result.digest);
  }

  const blockers = ctx.db.query<{ count: number }, [string]>(
    `SELECT COUNT(*) AS count FROM migration_issues
     WHERE migration_run_id = ? AND severity = 'block' AND resolved_at IS NULL`,
  ).get(ctx.runId)?.count ?? 0;
  if (blockers === 0) {
    ctx.db.prepare("UPDATE migration_runs SET phase = 'objects', updated_at = ? WHERE id = ?")
      .run(Date.now(), ctx.runId);
  }
  return {
    staged,
    bytes,
    issues,
    digest: createHash("sha256").update(digests.sort().join("\n"), "utf8").digest("hex"),
  };
}

async function stageFileObject(
  ctx: MigrationContext,
  row: Entry,
  copyMode: "clone" | "copy",
): Promise<{ staged: number; bytes: number; digest: string }> {
  const scope = scopeForEntry(ctx, row);
  const objectId = allocatedObjectId(row, "primary", ctx.runId);
  const originalName = path.posix.basename(row.sourcePath);
  const locator = objectLocator(scope, objectId, originalName);
  const refs = canonicalRefs(row.targetRefs, objectId);
  persistAllocation(ctx, row.id, locator, refs);
  const source = sourceFile(ctx, row);
  const before = sourceFacts(source, row);
  const prepared = await prepareOrResume(ctx, {
    row,
    scope,
    objectId,
    originalName,
    mime: mimeFor(originalName),
    storageClass: row.disposition === "run-object" ? runObjectStorage(row.sourcePath) : "durable",
    sourcePath: source,
    clonePolicy: copyMode === "clone" ? "require" : "allow-copy",
  });
  assertSourceUnchanged(source, before);
  const digest = await verifyPrepared(prepared, row.bytes, row.sha256);
  let finalRefs = refs;
  ctx.db.transaction(() => {
    registerOrValidate(ctx, prepared);
    const runRefs = row.disposition === "run-object"
      ? migrationRunObjectRefs(ctx, row, prepared)
      : [];
    finalRefs = canonicalRefs(JSON.stringify(refs), ...runRefs);
    ctx.db.prepare(
      `UPDATE migration_entries
       SET state = 'staged', target_path = ?, target_refs_json = ?, sha256 = ?, updated_at = ?
       WHERE id = ? AND state = 'inventoried'`,
    ).run(locator, JSON.stringify(finalRefs), digest.sha256, Date.now(), row.id);
  }).immediate();
  const verified = await hashFile(prepared.finalPath);
  if (verified.sha256 !== digest.sha256 || verified.bytes !== digest.bytes) {
    throw new Error("Staged Object changed before verification");
  }
  const now = Date.now();
  ctx.db.prepare(
    `UPDATE migration_entries SET state = 'verified', terminal_at = ?, updated_at = ?
     WHERE id = ? AND state = 'staged'`,
  ).run(now, now, row.id);
  return {
    staged: getObjectRow(ctx.db, objectId) ? 1 : 0,
    bytes: prepared.bytes,
    digest: `${objectId}\0${prepared.sha256}\0${prepared.bytes}`,
  };
}

async function stageControlEvidence(
  ctx: MigrationContext,
  row: Entry,
  copyMode: "clone" | "copy",
): Promise<{ staged: number; bytes: number; digests: string[] }> {
  const scope = scopeForEntry(ctx, row);
  const source = sourceFile(ctx, row);
  const before = sourceFacts(source, row);
  const raw = fs.readFileSync(source);
  const rawId = allocatedObjectId(row, "raw", ctx.runId);
  const rawName = `${path.posix.basename(row.sourcePath)}.raw`;
  const rawLocator = objectLocator(scope, rawId, rawName);
  const decoded = decodedDataUrls(raw).map((value, index) => ({
    ...value,
    id: allocatedObjectId(row, `data-url:${index}`, ctx.runId),
    name: `decoded-${index + 1}${extensionForMime(value.mime)}`,
  }));
  const diagnostics = malformedDiagnostics(ctx, row, raw);
  const refs = canonicalRefs(
    row.targetRefs,
    rawId,
    ...decoded.map((value) => value.id),
    ...diagnostics.map((value) => value.id),
  );
  persistAllocation(ctx, row.id, rawLocator, refs);

  const prepared: PreparedObject[] = [await prepareOrResume(ctx, {
    row,
    scope,
    objectId: rawId,
    originalName: rawName,
    mime: "application/octet-stream",
    storageClass: "diagnostic",
    sourcePath: source,
    clonePolicy: copyMode === "clone" ? "require" : "allow-copy",
  })];
  for (const value of decoded) {
    const decodedSource = path.join(ctx.storeRoot, "tmp", value.id, "decoded");
    fs.mkdirSync(path.dirname(decodedSource), { recursive: true, mode: 0o700 });
    fs.writeFileSync(decodedSource, value.bytes, { mode: 0o600 });
    prepared.push(await prepareOrResume(ctx, {
      row: { ...row, bytes: value.bytes.length, sha256: null },
      scope,
      objectId: value.id,
      originalName: value.name,
      mime: value.mime,
      storageClass: "durable",
      sourcePath: decodedSource,
      clonePolicy: copyMode === "clone" ? "require" : "allow-copy",
    }));
    fs.rmSync(path.dirname(decodedSource), { recursive: true, force: true });
  }
  for (const value of diagnostics) {
    const diagnosticSource = path.join(ctx.storeRoot, "tmp", value.id, "diagnostic");
    fs.mkdirSync(path.dirname(diagnosticSource), { recursive: true, mode: 0o700 });
    fs.writeFileSync(diagnosticSource, value.bytes, { mode: 0o600 });
    prepared.push(await prepareOrResume(ctx, {
      row: { ...row, bytes: value.bytes.length, sha256: value.sha256 },
      scope,
      objectId: value.id,
      originalName: `malformed-line-${value.lineNo}.raw`,
      mime: "application/octet-stream",
      storageClass: "diagnostic",
      sourcePath: diagnosticSource,
      clonePolicy: copyMode === "clone" ? "require" : "allow-copy",
    }));
    fs.rmSync(path.dirname(diagnosticSource), { recursive: true, force: true });
  }
  assertSourceUnchanged(source, before);
  for (const object of prepared) await verifyPrepared(object, object.bytes, object.sha256);
  verifyTargetRefs(ctx, refs.filter((id) => !id.startsWith("obj_")));
  const now = Date.now();
  let finalRefs = refs;
  ctx.db.transaction(() => {
    for (const object of prepared) registerOrValidate(ctx, object);
    const diagnosticRefs = diagnostics.flatMap((diagnostic) => {
      const object = prepared.find((candidate) => candidate.id === diagnostic.id)!;
      return migrationRunObjectRefs(ctx, row, object);
    });
    finalRefs = canonicalRefs(JSON.stringify(refs), ...diagnosticRefs);
    ctx.db.prepare(
      `UPDATE migration_entries
       SET raw_evidence_object_id = ?, target_path = ?, target_refs_json = ?,
           sha256 = ?, state = 'imported', terminal_at = ?, updated_at = ?
       WHERE id = ? AND state = 'inventoried'`,
    ).run(rawId, rawLocator, JSON.stringify(finalRefs), prepared[0]!.sha256, now, now, row.id);
  }).immediate();
  return {
    staged: prepared.length,
    bytes: prepared.reduce((sum, object) => sum + object.bytes, 0),
    digests: prepared.map((object) => `${object.id}\0${object.sha256}\0${object.bytes}`),
  };
}

async function prepareOrResume(ctx: MigrationContext, input: {
  row: Entry;
  scope: Scope;
  objectId: string;
  originalName: string;
  mime: string;
  storageClass: "durable" | "working" | "diagnostic";
  sourcePath: string;
  clonePolicy: "allow-copy" | "require";
}): Promise<PreparedObject> {
  const locator = objectLocator(input.scope, input.objectId, input.originalName);
  const finalPath = path.join(ctx.storeRoot, ...locator.split("/"));
  if (!fs.existsSync(finalPath)) {
    return prepareObject(ctx.db, ctx.storeRoot, {
      scope: input.scope,
      sourcePath: input.sourcePath,
      originalName: input.originalName,
      mime: input.mime,
      storageClass: input.storageClass,
      transfer: "copy",
      clonePolicy: input.clonePolicy,
      objectId: input.objectId,
    });
  }
  const facts = await hashFile(finalPath);
  const sourceFacts = await hashFile(input.sourcePath);
  if (facts.bytes !== sourceFacts.bytes || facts.sha256 !== sourceFacts.sha256) {
    throw new Error("Existing staged Object conflicts with its immutable source");
  }
  return {
    id: input.objectId,
    scope: input.scope,
    bucket: locator.slice(0, locator.lastIndexOf("/objects/")),
    key: locator.slice(locator.lastIndexOf("/objects/") + 1),
    finalPath,
    sha256: facts.sha256,
    bytes: facts.bytes,
    mime: input.mime,
    originalName: input.originalName,
    storageClass: input.storageClass,
  };
}

function registerOrValidate(ctx: MigrationContext, prepared: PreparedObject): void {
  const existing = getObjectRow(ctx.db, prepared.id);
  if (!existing) {
    registerPreparedObject(ctx.db, prepared);
    return;
  }
  if (
    existing.workspaceId !== prepared.scope.workspaceId
    || existing.projectId !== (prepared.scope.projectId ?? null)
    || existing.bucket !== prepared.bucket
    || existing.key !== prepared.key
    || existing.sha256 !== prepared.sha256
    || existing.bytes !== prepared.bytes
    || existing.mime !== prepared.mime
    || existing.storageClass !== prepared.storageClass
  ) throw new Error("Existing Object conflicts with its migration allocation");
}

function migrationRunObjectRefs(ctx: MigrationContext, row: Entry, prepared: PreparedObject): string[] {
  const runId = stableId("run", ctx.runId, `run-object:${prepared.scope.workspaceId}:${prepared.scope.projectId ?? "shared"}`);
  const runObjectId = stableId("robj", ctx.runId, `run-object:${row.id}`);
  const existingRun = ctx.db.query<{ id: string }, [string]>("SELECT id FROM runs WHERE id = ?").get(runId);
  if (!existingRun) {
    ctx.db.prepare(
      `INSERT INTO runs
       (id, workspace_id, project_id, kind, label, state, metadata_json, created_at)
       VALUES (?, ?, ?, 'migration', 'Legacy migration evidence', 'pending', ?, ?)`,
    ).run(
      runId,
      prepared.scope.workspaceId,
      prepared.scope.projectId ?? null,
      JSON.stringify({ migrationRunId: ctx.runId }),
      row.mtimeMs,
    );
    ctx.db.prepare("UPDATE runs SET state = 'running', started_at = ? WHERE id = ?")
      .run(row.mtimeMs, runId);
    ctx.db.prepare("UPDATE runs SET state = 'succeeded', ended_at = ? WHERE id = ?")
      .run(row.mtimeMs, runId);
  }
  const existing = ctx.db.query<{ objectId: string | null }, [string]>(
    "SELECT object_id AS objectId FROM run_objects WHERE id = ?",
  ).get(runObjectId);
  if (existing && existing.objectId !== prepared.id) throw new Error("Migration RunObject allocation conflicts");
  if (!existing) {
    ctx.db.prepare(
      `INSERT INTO run_objects
       (id, run_id, object_id, path, purpose, state, retention, bytes, sha256, mime, metadata_json, created_at)
       VALUES (?, ?, ?, ?, 'migration-evidence', 'promoted', ?, ?, ?, ?, ?, ?)`,
    ).run(
      runObjectId,
      runId,
      prepared.id,
      `${prepared.bucket}/${prepared.key}`,
      prepared.storageClass === "working" ? "working" : "diagnostic",
      prepared.bytes,
      prepared.sha256,
      prepared.mime,
      JSON.stringify({ migrationRunId: ctx.runId, sourceLocatorHash: row.sourceLocatorHash }),
      row.mtimeMs,
    );
  }
  return [runId, runObjectId];
}

function entries(ctx: MigrationContext): Entry[] {
  return ctx.db.query<Entry, [string]>(
    `SELECT entry.id, source.source_label AS sourceLabel,
            entry.source_path AS sourcePath, entry.source_locator_hash AS sourceLocatorHash,
            entry.entry_kind AS entryKind, entry.disposition, entry.state,
            entry.source_device AS device, entry.source_inode AS inode,
            entry.source_mode AS mode, entry.bytes, entry.mtime_ms AS mtimeMs,
            entry.sha256, entry.target_path AS targetPath,
            entry.target_refs_json AS targetRefs,
            entry.raw_evidence_object_id AS rawEvidenceObjectId
     FROM migration_entries entry
     JOIN migration_sources source ON source.id = entry.migration_source_id
     WHERE entry.migration_run_id = ? ORDER BY entry.migration_source_id, entry.source_path`,
  ).all(ctx.runId);
}

function assertContext(ctx: MigrationContext): void {
  if (path.resolve(ctx.db.filename) !== path.join(path.resolve(ctx.storeRoot), "ralphy.db")) {
    throw new Error("Migration database does not belong to its explicit store root");
  }
  const database = fs.lstatSync(ctx.db.filename);
  if (!database.isFile() || database.isSymbolicLink()) throw new Error("Migration database is unsafe");
}

function assertCopySpace(ctx: MigrationContext, sourceBytes: number, freeOverride?: number): void {
  const free = freeOverride ?? (() => {
    const stats = fs.statfsSync(ctx.storeRoot);
    return stats.bavail * stats.bsize;
  })();
  const reserve = Math.max(2 * 1024 ** 3, Math.ceil(sourceBytes * 0.1));
  if (free < sourceBytes + reserve) throw new Error("Migration copy mode has insufficient free space");
}

function scopeForEntry(ctx: MigrationContext, row: Entry): Scope {
  const currentProject = row.sourcePath.match(/^workspaces\/([^/]+)\/projects\/([^/]+)(?:\/|$)/u);
  const legacyProject = row.sourcePath.match(/^projects\/([^/]+)(?:\/|$)/u);
  const projectScope = currentProject
    ? { workspaceSlug: currentProject[1]!, projectSlug: currentProject[2]! }
    : legacyProject
      ? { workspaceSlug: "default", projectSlug: legacyProject[1]! }
      : null;
  if (projectScope) {
    const project = ctx.db.query<{ id: string; workspaceId: string }, [string, string, string]>(
      `SELECT project.id, project.workspace_id AS workspaceId
       FROM projects project JOIN workspaces workspace ON workspace.id = project.workspace_id
       WHERE json_extract(workspace.metadata_json, '$.migrationSourceLabel') = ?
         AND workspace.slug = ? AND project.slug = ?`,
    ).get(row.sourceLabel, projectScope.workspaceSlug, projectScope.projectSlug);
    if (project) return { workspaceId: project.workspaceId, projectId: project.id };
  }
  const workspaceSlug = row.sourcePath.match(/^workspaces\/([^/]+)(?:\/|$)/u)?.[1];
  const workspace = ctx.db.query<{ id: string }, [string, string | null, string | null]>(
    `SELECT id FROM workspaces
     WHERE json_extract(metadata_json, '$.migrationSourceLabel') = ?
       AND (? IS NULL OR slug = ?)
     ORDER BY id LIMIT 1`,
  ).get(row.sourceLabel, workspaceSlug ?? null, workspaceSlug ?? null);
  if (!workspace) throw new Error(`Migration Object scope is missing: ${row.sourceLocatorHash}`);
  return { workspaceId: workspace.id };
}

function sourceFile(ctx: MigrationContext, row: Entry): string {
  const source = ctx.sourceRoots.find((candidate) => candidate.id === row.sourceLabel);
  if (!source) throw new Error("Migration source identity is missing");
  const relative = normalizeRelativePath(row.sourcePath);
  const root = fs.realpathSync(source.path);
  const absolute = path.resolve(root, ...relative.split("/"));
  const canonical = fs.realpathSync(absolute);
  if (canonical !== root && !canonical.startsWith(`${root}${path.sep}`)) {
    throw new Error("Migration source path escapes its source root");
  }
  return canonical;
}

function sourceFacts(file: string, row: Entry) {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() || stat.isSymbolicLink()
    || String(stat.dev) !== row.device || String(stat.ino) !== row.inode
    || stat.mode !== row.mode || stat.size !== row.bytes
    || Math.trunc(stat.mtimeMs) !== row.mtimeMs
  ) throw new Error(`Migration source changed after inventory: ${row.sourceLocatorHash}`);
  return { device: stat.dev, inode: stat.ino, mode: stat.mode, bytes: stat.size, mtimeMs: stat.mtimeMs };
}

function assertSourceUnchanged(file: string, before: ReturnType<typeof sourceFacts>): void {
  const after = fs.lstatSync(file);
  if (
    !after.isFile() || after.isSymbolicLink()
    || after.dev !== before.device || after.ino !== before.inode
    || after.mode !== before.mode || after.size !== before.bytes
    || after.mtimeMs !== before.mtimeMs
  ) throw new Error("Migration source changed during Object staging");
}

async function verifyPrepared(prepared: PreparedObject, bytes: number, digest: string | null) {
  const actual = await hashFile(prepared.finalPath);
  if (actual.bytes !== bytes || actual.sha256 !== prepared.sha256 || (digest && digest !== actual.sha256)) {
    throw new Error("Migration Object digest does not match its inventory");
  }
  return actual;
}

async function hashFile(file: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function allocatedObjectId(row: Entry, role: string, runId: string): string {
  const refs = row.targetRefs ? JSON.parse(row.targetRefs) as string[] : [];
  if (role === "primary") {
    const existing = refs.find((value) => value.startsWith("obj_"));
    if (existing) return existing;
  }
  return stableId("obj", runId, `${row.id}:${role}`);
}

function stableId(prefix: "obj" | "run" | "robj", runId: string, key: string): string {
  const hex = createHash("sha256").update(`${runId}\0${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${prefix}_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function objectLocator(scope: Scope, id: string, originalName: string): string {
  const extension = /^\.[A-Za-z0-9]{1,16}$/u.test(path.posix.extname(originalName))
    ? path.posix.extname(originalName).toLowerCase()
    : "";
  const bucket = scope.projectId
    ? `buckets/${scope.workspaceId}/projects/${scope.projectId}`
    : `buckets/${scope.workspaceId}/shared`;
  return `${bucket}/objects/${id}${extension}`;
}

function canonicalRefs(value: string | null, ...added: string[]): string[] {
  const current = value ? JSON.parse(value) as string[] : [];
  return [...new Set([...current, ...added])].sort();
}

function persistAllocation(ctx: MigrationContext, entryId: string, targetPath: string, refs: readonly string[]): void {
  const current = ctx.db.query<{ targetPath: string | null; refs: string | null }, [string]>(
    "SELECT target_path AS targetPath, target_refs_json AS refs FROM migration_entries WHERE id = ?",
  ).get(entryId);
  if (!current) throw new Error("Migration entry disappeared");
  const serialized = JSON.stringify([...refs].sort());
  if (current.targetPath === targetPath && (current.refs ?? "[]") === serialized) return;
  const updated = ctx.db.prepare(
    `UPDATE migration_entries SET target_path = ?, target_refs_json = ?, updated_at = ?
     WHERE id = ? AND state = 'inventoried' RETURNING id`,
  ).get(targetPath, serialized, Date.now(), entryId) as { id: string } | null;
  if (!updated) throw new Error("Migration Object allocation could not be persisted");
}

function updateDisposition(ctx: MigrationContext, entryId: string, disposition: string): void {
  ctx.db.prepare(
    "UPDATE migration_entries SET disposition = ?, updated_at = ? WHERE id = ? AND state = 'inventoried'",
  ).run(disposition, Date.now(), entryId);
}

function terminalizeExcluded(
  ctx: MigrationContext,
  row: Entry,
  disposition: "cache" | "system",
  targetPath: string | null,
  sha256: string,
): void {
  if (row.state !== "inventoried") return;
  const now = Date.now();
  ctx.db.prepare(
    `UPDATE migration_entries SET disposition = ?, target_path = ?, sha256 = ?, state = 'excluded',
       terminal_at = ?, updated_at = ? WHERE id = ? AND state = 'inventoried'`,
  ).run(disposition, targetPath, sha256, now, now, row.id);
}

async function stageCache(ctx: MigrationContext, row: Entry, copyMode: "clone" | "copy"): Promise<void> {
  const source = sourceFile(ctx, row);
  const before = sourceFacts(source, row);
  const targetRel = `cache/migration/${row.sourceLocatorHash}/${path.posix.basename(row.sourcePath)}`;
  const target = path.join(ctx.storeRoot, ...targetRel.split("/"));
  const temporary = `${target}.staged`;
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(target)) {
    await fs.promises.copyFile(source, temporary, copyMode === "clone"
      ? fs.constants.COPYFILE_FICLONE_FORCE
      : fs.constants.COPYFILE_FICLONE);
    const handle = await fs.promises.open(temporary, "r");
    try { await handle.sync(); } finally { await handle.close(); }
    await fs.promises.rename(temporary, target);
  }
  const actual = await hashFile(target);
  if (actual.bytes !== row.bytes || (row.sha256 && row.sha256 !== actual.sha256)) {
    throw new Error("Migration cache digest mismatch");
  }
  assertSourceUnchanged(source, before);
  terminalizeExcluded(ctx, row, "cache", targetRel, actual.sha256);
}

function isSecret(row: Entry): boolean {
  return row.disposition === "secret-imported" || row.disposition === "secret-recovery-only";
}

function isSystem(row: Entry): boolean {
  return row.disposition === "system" || path.posix.basename(row.sourcePath).toLowerCase() === ".ds_store";
}

function isWorkingEvidence(sourcePath: string): boolean {
  return sourcePath.split("/").some((part) => new Set([".scratch", "scratch", "tmp", "tmp-scripts"]).has(part.toLowerCase()));
}

function runObjectStorage(sourcePath: string): "working" | "diagnostic" {
  return /(?:^|\/)(?:logs?|probes?)(?:\/|$)|\.(?:log|jsonl)$/iu.test(sourcePath) ? "diagnostic" : "working";
}

function mimeFor(name: string): string {
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".md": "text/markdown",
    ".txt": "text/plain",
  } as Record<string, string>)[path.posix.extname(name).toLowerCase()] ?? "application/octet-stream";
}

function decodedDataUrls(raw: Buffer): Array<{ mime: string; bytes: Buffer }> {
  const text = raw.toString("utf8");
  if (Buffer.from(text, "utf8").compare(raw) !== 0) return [];
  const values: Array<{ mime: string; bytes: Buffer }> = [];
  const pattern = /data:([a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+)?((?:;[a-z0-9!#$&^_.+-]+=[^;,\s]+)*)(;base64)?,([^\s"'<>]*)/giu;
  for (const match of text.matchAll(pattern)) {
    const mime = match[1]?.toLowerCase() ?? "text/plain";
    const bytes = match[3] ? Buffer.from(match[4]!, "base64") : Buffer.from(decodeURIComponent(match[4]!));
    if (bytes.length > 0) values.push({ mime, bytes });
  }
  return values;
}

function malformedDiagnostics(
  ctx: MigrationContext,
  row: Entry,
  raw: Buffer,
): Array<{ id: string; lineNo: number; bytes: Buffer; sha256: string }> {
  const sourceKey = createHash("sha256").update(row.sourceLabel).digest("hex").slice(0, 16);
  const issues = ctx.db.query<{ lineNo: number | null; detail: string }, [string]>(
    `SELECT line_no AS lineNo, detail_json AS detail FROM migration_issues
     WHERE migration_run_id = ? AND code = 'MIGRATION_MALFORMED_JSONL'
     ORDER BY line_no, id`,
  ).all(ctx.runId);
  const result: Array<{ id: string; lineNo: number; bytes: Buffer; sha256: string }> = [];
  for (const issue of issues) {
    const detail = JSON.parse(issue.detail) as Record<string, unknown>;
    if (detail.sourcePath !== row.sourcePath) continue;
    if (typeof detail.evidenceTargetPath === "string" && !detail.evidenceTargetPath.includes(`/diagnostics/${sourceKey}/`)) continue;
    const lineNo = issue.lineNo;
    const offset = detail.byteOffset;
    const length = detail.byteLength;
    if (
      !Number.isSafeInteger(lineNo) || Number(lineNo) <= 0
      || !Number.isSafeInteger(offset) || Number(offset) < 0
      || !Number.isSafeInteger(length) || Number(length) <= 0
      || Number(offset) + Number(length) > raw.length
    ) throw new Error("Malformed JSONL diagnostic range is invalid");
    const bytes = Buffer.from(raw.subarray(Number(offset), Number(offset) + Number(length)));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (detail.sha256 !== sha256) throw new Error("Malformed JSONL diagnostic digest is invalid");
    result.push({
      id: allocatedObjectId(row, `malformed-line:${lineNo}`, ctx.runId),
      lineNo: Number(lineNo),
      bytes,
      sha256,
    });
  }
  return result;
}

function extensionForMime(mime: string): string {
  return ({ "image/png": ".png", "image/jpeg": ".jpg", "text/plain": ".txt", "application/json": ".json" } as Record<string, string>)[mime] ?? ".bin";
}

function verifyTargetRefs(ctx: MigrationContext, refs: readonly string[]): void {
  const tables: Record<string, string> = {
    ws: "workspaces", prj: "projects", iter: "project_iterations", fb: "feedback_items",
    stage: "project_stages", doc: "documents", drev: "document_revisions",
    bind: "project_document_bindings", setting: "settings", memory: "memory_entries",
    mrev: "memory_revisions", campaign: "campaigns", calendar: "calendar_entries",
    run: "runs", robj: "run_objects",
  };
  for (const id of refs) {
    const table = tables[id.slice(0, id.indexOf("_"))];
    if (!table || !ctx.db.query<{ id: string }, [string]>(`SELECT id FROM ${table} WHERE id = ?`).get(id)) {
      throw new Error(`Migration target reference is unresolved: ${id}`);
    }
  }
}

function recordBlockingIssue(ctx: MigrationContext, row: Entry, code: string): number {
  const existing = ctx.db.query<{ id: string }, [string, string]>(
    "SELECT id FROM migration_issues WHERE migration_entry_id = ? AND code = ?",
  ).get(row.id, code);
  if (existing) return 0;
  const now = Date.now();
  ctx.db.transaction(() => {
    ctx.db.prepare(
      `UPDATE migration_entries SET disposition = 'issue', state = 'issue', error_code = ?,
       terminal_at = ?, updated_at = ? WHERE id = ? AND state = 'inventoried'`,
    ).run(code, now, now, row.id);
    ctx.db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, migration_entry_id, code, severity, detail_json, created_at)
       VALUES (?, ?, ?, ?, 'block', ?, ?)`,
    ).run(newDomainId("miss"), ctx.runId, row.id, code, JSON.stringify({ sourceLocatorHash: row.sourceLocatorHash }), now);
  }).immediate();
  return 1;
}

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
