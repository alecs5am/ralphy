import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { ralphDir } from "../paths.js";
import { applyMigrations } from "./schema.js";

let cached: { path: string; db: Database } | null = null;
const afterCommitFrames = new WeakMap<Database, Array<Array<() => void>>>();

export function domainDbPath(): string {
  return path.resolve(ralphDir(), "ralphy.db");
}

export function openDomainDb(): Database {
  const databasePath = domainDbPath();
  if (cached?.path === databasePath) return cached.db;
  closeDomainDb();

  const db = openDatabaseAt(databasePath);
  cached = { path: databasePath, db };
  return db;
}

/** Open an explicit data root without changing the ambient cached connection. */
export function openDomainDbAt(dataRoot: string): Database {
  return openDatabaseAt(path.resolve(dataRoot, "ralphy.db"));
}

function openDatabaseAt(databasePath: string): Database {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath, { create: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const journalMode = db
      .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
      .get()?.journal_mode;
    if (journalMode?.toLowerCase() !== "wal") db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    applyMigrations(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function closeDomainDb(): void {
  if (!cached) return;
  try {
    cached.db.close();
  } finally {
    cached = null;
  }
}

export function withImmediateTransaction<T>(fn: (db: Database) => T): T {
  const db = openDomainDb();
  const frames = afterCommitFrames.get(db) ?? [];
  const callbacks: Array<() => void> = [];
  frames.push(callbacks);
  afterCommitFrames.set(db, frames);
  let result: T;
  try {
    result = db.transaction(() => fn(db)).immediate();
  } catch (error) {
    frames.pop();
    if (frames.length === 0) afterCommitFrames.delete(db);
    throw error;
  }
  frames.pop();
  const parent = frames.at(-1);
  if (parent) parent.push(...callbacks);
  else {
    afterCommitFrames.delete(db);
    for (const callback of callbacks) {
      try {
        callback();
      } catch {
        // Durable state committed; startup cleanup retries post-commit housekeeping.
      }
    }
  }
  return result;
}

/** @internal Registers cleanup on the active domain transaction only. */
export function afterDomainCommit(db: Database, callback: () => void): void {
  const frame = afterCommitFrames.get(db)?.at(-1);
  if (!frame) throw new Error("No active domain transaction");
  frame.push(callback);
}
