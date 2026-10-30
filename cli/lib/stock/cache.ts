// On-disk cache for stock source indexes and responses (#597).
//
// Some sources are cheapest when their index is fetched once (Fluent UI Emoji
// at a pinned commit, the Iconify collection list) and Pixabay's API terms
// require caching responses for 24 hours. Entries live under
// `.ralphy/cache/stock/` (CLI scratch, safe to wipe: a miss refetches) as one
// JSON file per key. Keys never carry an API key. A read that fails for any
// reason is a miss; a write that fails is ignored (the cache is an
// optimization, never a precondition).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { stockCacheDir } from "../paths.js";

let testDir: string | null | undefined;

/** @internal Test-only: point the cache at a temp dir, or `null` to disable it. `undefined` restores the default. */
export function setStockCacheDirForTesting(dir: string | null | undefined): void {
  testDir = dir;
}

function cacheDir(): string | null {
  if (testDir !== undefined) return testDir;
  try {
    return stockCacheDir();
  } catch {
    return null;
  }
}

/** A cache file name for an arbitrary key: readable prefix plus a short hash. */
export function stockCacheKey(prefix: string, parts: readonly string[]): string {
  const hash = createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24);
  return `${prefix}-${hash}`;
}

function fileFor(dir: string, key: string): string {
  if (!/^[a-z0-9][a-z0-9._-]{0,120}$/.test(key)) throw new Error(`invalid stock cache key: ${key}`);
  return path.join(dir, `${key}.json`);
}

/** The cached value for `key`, or null when missing, unreadable or older than `maxAgeMs` (null: never expires). */
export function readStockCache<T>(key: string, maxAgeMs: number | null): T | null {
  const dir = cacheDir();
  if (!dir) return null;
  try {
    const file = fileFor(dir, key);
    if (maxAgeMs !== null) {
      // mtime can sit a fraction of a millisecond (or a clock step) ahead of Date.now().
      const age = Date.now() - fs.statSync(file).mtimeMs;
      if (!(age <= maxAgeMs && age > -60_000)) return null;
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { value?: T };
    return parsed && typeof parsed === "object" && "value" in parsed ? (parsed.value as T) : null;
  } catch {
    return null;
  }
}

/** Store `value` under `key` (atomic: a temp file renamed into place). Failures are ignored. */
export function writeStockCache(key: string, value: unknown): void {
  const dir = cacheDir();
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = fileFor(dir, key);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ savedAt: new Date().toISOString(), value }));
    fs.renameSync(temp, file);
  } catch {
    /* the cache is an optimization */
  }
}

/** Whether a fresh entry exists for `key`. */
export function hasStockCache(key: string, maxAgeMs: number | null): boolean {
  return readStockCache<unknown>(key, maxAgeMs) !== null;
}
