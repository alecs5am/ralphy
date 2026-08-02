import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { ralphDir } from "../paths.js";
import { applyMigrations } from "./schema.js";

let cached: { path: string; db: Database } | null = null;

export function domainDbPath(): string {
  return path.resolve(ralphDir(), "ralphy.db");
}

export function openDomainDb(): Database {
  const databasePath = domainDbPath();
  if (cached?.path === databasePath) return cached.db;
  closeDomainDb();

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
    cached = { path: databasePath, db };
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
  return db.transaction(() => fn(db)).immediate();
}
