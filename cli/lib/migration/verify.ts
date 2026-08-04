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
  const db = new Database(path.join(input.storeRoot, "ralphy.db"), { readonly: true });
  try {
    const run = db.query<{ phase: string }, [string]>("SELECT phase FROM migration_runs WHERE id = ?").get(input.runId);
    if (!run) throw new Error("Migration Run not found");
    const entries = db.query<{
      id: string;
      state: string;
      targetPath: string | null;
      sha256: string | null;
    }, [string]>(
      "SELECT id, state, target_path AS targetPath, sha256 FROM migration_entries WHERE migration_run_id = ? ORDER BY id",
    ).all(input.runId);
    const missingEntries: string[] = [];
    const hashMismatches: string[] = [];
    let verifiedEntries = 0;
    const digests: string[] = [];
    for (const entry of entries) {
      if (entry.state !== "verified" || !entry.targetPath) continue;
      verifiedEntries += 1;
      const target = safeTarget(input.storeRoot, entry.targetPath);
      if (!fs.existsSync(target)) {
        missingEntries.push(entry.id);
        continue;
      }
      const hash = createHash("sha256").update(fs.readFileSync(target)).digest("hex");
      if (entry.sha256 && hash !== entry.sha256) hashMismatches.push(entry.id);
      digests.push(`${entry.id}\0${hash}`);
    }
    const blockingIssues = db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE migration_run_id = ? AND severity = 'block' AND resolved_at IS NULL",
    ).get(input.runId)?.count ?? 0;
    const stageDigest = createHash("sha256").update(digests.sort().join("\n"), "utf8").digest("hex");
    const sourceInventoryDigest = inventoryDigestForDb(db, input.runId);
    const baseRecord = {
      runId: input.runId,
      phase: run.phase,
      sourceInventoryDigest,
      stageDigest,
      entryCount: entries.length,
      verifiedEntries,
      missingEntries,
      hashMismatches,
      blockingIssues,
      ok: missingEntries.length === 0 && hashMismatches.length === 0 && blockingIssues === 0,
    };
    const createdAt = Date.now();
    const verificationId = createHash("sha256").update(JSON.stringify({ ...baseRecord, createdAt }), "utf8").digest("hex").slice(0, 32);
    const recordPath = path.join(input.verificationDir, `migration-${input.runId}.verification-${verificationId}.json`);
    fs.mkdirSync(input.verificationDir, { recursive: true, mode: 0o700 });
    writePrivateJson(recordPath, { ...baseRecord, createdAt, verificationId });
    return { ...baseRecord, verificationId, recordPath };
  } finally {
    db.close();
  }
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

function safeTarget(root: string, targetRel: string): string {
  if (path.isAbsolute(targetRel) || targetRel.includes("\\") || targetRel.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error("Migration target locator is unsafe");
  return path.resolve(root, ...targetRel.split("/"));
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
