import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import type { MigrationContext } from "./types.js";

export type FreezeMigrationInput = {
  verificationDir: string;
  sourceInventoryDigest?: string;
};

export type FrozenMigration = {
  runId: string;
  sourceInventoryDigest: string;
  stageDigest: string;
  entryCount: number;
  verifiedAt: number;
  recordPath: string;
};

export type MigrationVerification = {
  runId: string;
  phase: string;
  verificationId: string;
  recordPath: string;
  sourceInventoryDigest: string;
  stageDigest: string;
  entryCount: number;
  verifiedEntries: number;
  missingEntries: string[];
  hashMismatches: string[];
  blockingIssues: number;
  ok: boolean;
};

export function freezeMigration(ctx: MigrationContext, input: FreezeMigrationInput): FrozenMigration {
  const row = ctx.db.query<{ phase: string }, [string]>("SELECT phase FROM migration_runs WHERE id = ?").get(ctx.runId);
  if (!row || !new Set(["objects", "relations", "verify"]).has(row.phase)) throw new Error("Migration is not ready to freeze");
  const blockingIssues = ctx.db.query<{ count: number }, [string]>(
    "SELECT COUNT(*) AS count FROM migration_issues WHERE migration_run_id = ? AND severity = 'block' AND resolved_at IS NULL",
  ).get(ctx.runId)?.count ?? 0;
  if (blockingIssues > 0) throw new Error("Migration has unresolved blocking issues");
  const stageDigest = stageDigestFor(ctx);
  const sourceInventoryDigest = input.sourceInventoryDigest ?? inventoryDigestFor(ctx);
  const entryCount = ctx.db.query<{ count: number }, [string]>("SELECT COUNT(*) AS count FROM migration_entries WHERE migration_run_id = ?").get(ctx.runId)?.count ?? 0;
  const verifiedAt = Date.now();
  const record: FrozenMigration = {
    runId: ctx.runId,
    sourceInventoryDigest,
    stageDigest,
    entryCount,
    verifiedAt,
    recordPath: path.join(input.verificationDir, `migration-${ctx.runId}.freeze.json`),
  };
  fs.mkdirSync(input.verificationDir, { recursive: true, mode: 0o700 });
  writePrivateJson(record.recordPath, record);
  ctx.db.prepare("UPDATE migration_runs SET phase = 'ready', frozen_at = ?, updated_at = ? WHERE id = ?").run(verifiedAt, verifiedAt, ctx.runId);
  return record;
}

export function verifyMigration(input: { storeRoot: string; runId: string; verificationDir: string }): MigrationVerification {
  void input;
  throw new Error("Migration verify is unavailable until the Task 7 activation gates are implemented");
}

function stageDigestFor(ctx: MigrationContext): string {
  const entries = ctx.db.query<{ id: string; targetPath: string; sha256: string }, [string]>(
    "SELECT id, target_path AS targetPath, sha256 FROM migration_entries WHERE migration_run_id = ? AND state = 'verified' ORDER BY id",
  ).all(ctx.runId);
  return createHash("sha256").update(entries.map((entry) => `${entry.id}\0${entry.targetPath}\0${entry.sha256}`).join("\n"), "utf8").digest("hex");
}

function inventoryDigestFor(ctx: MigrationContext): string {
  return inventoryDigestForDb(ctx.db, ctx.runId);
}

function inventoryDigestForDb(db: Database, runId: string): string {
  const rows = db.query<{ sourceLocatorHash: string; entryKind: string; bytes: number; mtimeMs: number; sha256: string | null }, [string]>(
    `SELECT source_locator_hash AS sourceLocatorHash, entry_kind AS entryKind, bytes, mtime_ms AS mtimeMs, sha256
     FROM migration_entries WHERE migration_run_id = ? ORDER BY source_locator_hash`,
  ).all(runId);
  return createHash("sha256").update(rows.map((row) => `${row.sourceLocatorHash}\0${row.entryKind}\0${row.bytes}\0${row.mtimeMs}\0${row.sha256 ?? ""}`).join("\n"), "utf8").digest("hex");
}

function writePrivateJson(file: string, value: unknown): void {
  const fd = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value)}\n`, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
