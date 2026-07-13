// cli/lib/library/client.ts
//
// Read-only client for the PUBLIC content library. The library is ONE static
// JSON document (`library.json`) served from Bunny CDN — the Supabase Postgres /
// PostgREST backend was retired (June 2026). There is intentionally NO insert/
// update/publish path here (publishing lives in the companion ralphy-web repo,
// which edits the committed library.json and uploads it to Bunny).
//
// One fetch pulls the whole graph ({ formats, units, blocks, blueprints }); the
// read functions below filter it in memory. The document is already in the
// canonical camelCase entity shape (it is serialized from the same `types.ts`
// entities), so there is no row mapping — what we fetch is what we return.
//
// A small on-disk cache under libraryCacheDir() (10-min TTL, keyed by URL) fronts
// the network. The cache degrades gracefully: a miss / parse error / any fs error
// simply refetches and never crashes.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { libraryCacheDir } from "../paths.js";
import type {
  Block,
  BlockKind,
  Blueprint,
  Format,
  Unit,
} from "./types.js";

// ── Public library location (overridable via env) ────────────────────────────

/** Default public URL of the library JSON document (Bunny CDN pull-zone). */
const DEFAULT_LIBRARY_URL = "https://ralphy.b-cdn.net/library/library.json";

/** Resolve the library JSON URL. Override with RALPHY_LIBRARY_URL to point the
 *  CLI at another host (a staging Bunny zone, a `file://` path in tests, etc.). */
function libraryUrl(): string {
  return process.env.RALPHY_LIBRARY_URL || DEFAULT_LIBRARY_URL;
}

/** Cache TTL: 10 minutes. */
const CACHE_TTL_MS = 10 * 60 * 1000;

// ── The library document shape ────────────────────────────────────────────────

interface LibraryDoc {
  schemaVersion?: number;
  formats: Format[];
  units: Unit[];
  /** Flat block list; each block carries its `kind`. */
  blocks: Block[];
  blueprints: Blueprint[];
}

// ── On-disk cache (graceful) ──────────────────────────────────────────────────

function cacheFileFor(reqKey: string): string {
  const hash = createHash("sha1").update(reqKey).digest("hex").slice(0, 16);
  return path.join(libraryCacheDir(), `${hash}.json`);
}

/** Read a fresh (within TTL) cache entry, or null on miss / stale / any error. */
function readCache<T>(reqKey: string): T | null {
  try {
    const fp = cacheFileFor(reqKey);
    const raw = fs.readFileSync(fp, "utf8");
    const parsed = JSON.parse(raw) as { at: number; value: T };
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

/** Best-effort cache write. Never throws. */
function writeCache(reqKey: string, value: unknown): void {
  try {
    fs.mkdirSync(libraryCacheDir(), { recursive: true });
    fs.writeFileSync(cacheFileFor(reqKey), JSON.stringify({ at: Date.now(), value }), "utf8");
  } catch {
    /* cache is best-effort */
  }
}

// ── Fetch ──────────────────────────────────────────────────────────────────---

let docPromise: Promise<LibraryDoc> | null = null;

/** Fetch + parse the whole library document, memoized for the process and cached
 *  on disk for CACHE_TTL_MS. Supports `file://` URLs (used by tests) and http(s).
 *  Throws a clear Error on network / HTTP / parse failure (the command layer
 *  turns it into err(...)). */
async function loadDoc(): Promise<LibraryDoc> {
  if (docPromise) return docPromise;
  docPromise = (async () => {
    const url = libraryUrl();

    const cached = readCache<LibraryDoc>(url);
    if (cached) return cached;

    let text: string;
    if (url.startsWith("file://")) {
      try {
        text = fs.readFileSync(new URL(url), "utf8");
      } catch (e) {
        throw new Error(
          `library read failed (file): ${e instanceof Error ? e.message : String(e)} — URL ${url}`,
        );
      }
    } else {
      let res: Response;
      try {
        res = await fetch(url, { headers: { Accept: "application/json" } });
      } catch (e) {
        throw new Error(
          `library fetch failed (network): ${e instanceof Error ? e.message : String(e)} — URL ${url}`,
        );
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `library fetch failed: HTTP ${res.status} ${res.statusText} — ${url}${body ? ` — ${body.slice(0, 300)}` : ""}`,
        );
      }
      text = await res.text();
    }

    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      throw new Error(`library response was not JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!doc || typeof doc !== "object" || !Array.isArray((doc as LibraryDoc).units)) {
      throw new Error("library document is malformed (expected { formats, units, blocks, blueprints })");
    }
    const parsed = doc as LibraryDoc;
    writeCache(url, parsed);
    return parsed;
  })();
  return docPromise;
}

// ── Public read API ───────────────────────────────────────────────────────────

/** All units (optionally filtered by format). */
export async function getUnits(filter?: { format?: string }): Promise<Unit[]> {
  const { units } = await loadDoc();
  if (filter?.format) return units.filter((u) => u.format === filter.format);
  return units;
}

/** A single unit by id, or null if not found. */
export async function getUnit(id: string): Promise<Unit | null> {
  const { units } = await loadDoc();
  return units.find((u) => u.id === id) ?? null;
}

/** Blocks, optionally narrowed to one kind. */
export async function getBlocks(kind?: BlockKind): Promise<Block[]> {
  const { blocks } = await loadDoc();
  return kind ? blocks.filter((b) => b.kind === kind) : blocks;
}

/** A single block by (kind, id), or null if not found. */
export async function getBlock(kind: BlockKind, id: string): Promise<Block | null> {
  const { blocks } = await loadDoc();
  return blocks.find((b) => b.kind === kind && b.id === id) ?? null;
}

/** A single blueprint by its unitId, or null if not found. */
export async function getBlueprint(unitId: string): Promise<Blueprint | null> {
  const { blueprints } = await loadDoc();
  return blueprints.find((b) => b.unitId === unitId) ?? null;
}

/** All blueprints. */
export async function getBlueprints(): Promise<Blueprint[]> {
  const { blueprints } = await loadDoc();
  return blueprints;
}

/** The format taxonomy shipped in the library document. */
export async function getFormats(): Promise<Format[]> {
  const { formats } = await loadDoc();
  return formats;
}
