import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { newDomainId } from "../store/ids.js";
import type { MigrationContext } from "./types.js";
import { normalizeRelativePath } from "./inventory.js";

export type StageSummary = {
  staged: number;
  bytes: number;
  issues: number;
  digest: string;
};

export function stageInventoryObjects(ctx: MigrationContext): StageSummary {
  const run = ctx.db.query<{ stageRootRel: string | null; phase: string }, [string]>(
    "SELECT stage_root_rel AS stageRootRel, phase FROM migration_runs WHERE id = ?",
  ).get(ctx.runId);
  if (!run || !run.stageRootRel) throw new Error("Migration stage is unavailable");
  if (!new Set(["inventory", "import", "objects", "relations"]).has(run.phase)) throw new Error("Migration Run is not ready for Object staging");
  const rows = ctx.db.query<{
    id: string;
    sourceKind: "ralphy" | "legacy-workspace" | "desktop";
    sourceLabel: string;
    sourcePath: string;
    disposition: string;
    state: string;
    bytes: number;
    sha256: string | null;
  }, [string]>(
    `SELECT entry.id, entry.source_kind AS sourceKind, source.source_label AS sourceLabel,
            entry.source_path AS sourcePath, entry.disposition, entry.state,
            entry.bytes, entry.sha256
     FROM migration_entries entry
     JOIN migration_sources source ON source.id = entry.migration_source_id
     WHERE entry.migration_run_id = ? ORDER BY entry.id`,
  ).all(ctx.runId);
  const digests: string[] = [];
  let staged = 0;
  let bytes = 0;
  let issues = 0;
  for (const row of rows) {
    if (!new Set(["object", "run-object", "decoded-object"]).has(row.disposition)) continue;
    if (row.state === "verified") continue;
    if (row.state !== "inventoried" && row.state !== "staged") continue;
    const source = ctx.sourceRoots.find((candidate) => candidate.id === row.sourceLabel || candidate.kind === row.sourceKind);
    if (!source) {
      issues += 1;
      recordIssue(ctx, row.id, "MIGRATION_SOURCE_MISSING", { sourceKind: row.sourceKind });
      continue;
    }
    const input = safeSourceFile(source.path, row.sourcePath);
    const stat = fs.lstatSync(input);
    if (!stat.isFile()) {
      issues += 1;
      recordIssue(ctx, row.id, "MIGRATION_OBJECT_NOT_REGULAR", { entryKind: row.disposition });
      continue;
    }
    const targetRel = `${run.stageRootRel}/objects/${row.id}`;
    const target = safeRelativeRoot(ctx.storeRoot, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(target)) fs.copyFileSync(input, target, fs.constants.COPYFILE_EXCL);
    const actual = fs.statSync(target);
    const digest = hashFile(target);
    if (actual.size !== row.bytes || (row.sha256 !== null && row.sha256 !== digest)) {
      issues += 1;
      recordIssue(ctx, row.id, "MIGRATION_OBJECT_DIGEST_MISMATCH", { bytes: actual.size });
      continue;
    }
    const now = Date.now();
    ctx.db.prepare(
      `UPDATE migration_entries SET state = 'verified', target_path = ?, sha256 = ?, terminal_at = ?, updated_at = ?
       WHERE id = ? AND state IN ('inventoried', 'staged')`,
    ).run(targetRel, digest, now, now, row.id);
    staged += 1;
    bytes += actual.size;
    digests.push(`${row.id}\0${digest}\0${actual.size}`);
  }
  const digest = createHash("sha256").update(digests.sort().join("\n"), "utf8").digest("hex");
  ctx.db.prepare("UPDATE migration_runs SET phase = 'objects', updated_at = ? WHERE id = ?").run(Date.now(), ctx.runId);
  return { staged, bytes, issues, digest };
}

function recordIssue(ctx: MigrationContext, entryId: string, code: string, detail: Record<string, unknown>): void {
  ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, migration_entry_id, code, severity, detail_json, created_at)
     VALUES (?, ?, ?, ?, 'block', ?, ?)`,
  ).run(newDomainId("miss"), ctx.runId, entryId, code, JSON.stringify(detail), Date.now());
}

function safeSourceFile(root: string, relative: string): string {
  const normalized = normalizeRelativePath(relative);
  const absolute = path.resolve(root, ...normalized.split("/"));
  const canonicalRoot = fs.realpathSync(root);
  const canonical = fs.realpathSync(absolute);
  if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error("Migration source path escapes its source root");
  return canonical;
}

function safeRelativeRoot(root: string, relative: string): string {
  const normalized = normalizeRelativePath(relative);
  return path.resolve(root, ...normalized.split("/"));
}

function hashFile(value: string): string {
  return createHash("sha256").update(fs.readFileSync(value)).digest("hex");
}
