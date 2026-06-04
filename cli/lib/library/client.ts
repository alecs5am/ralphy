// cli/lib/library/client.ts
//
// Read-only PostgREST client for the PUBLIC content library. The CLI reads the
// library straight from Supabase PostgREST — no gateway (settled decision). All
// access is read-only: there is intentionally NO insert/update/publish path
// here (publishing lives in landing/scripts/publish-entity.ts).
//
// PostgREST returns snake_case columns; the pure mappers below convert them to
// the camelCase entities in ./types.ts and merge each row's `data` jsonb onto
// the entity. The mappers are pure (no fetch, no fs) so they unit-test in
// isolation (tests/unit/library-mapper.test.ts).
//
// A small on-disk cache under libraryCacheDir() (10-min TTL, keyed by request)
// fronts the network. The cache degrades gracefully: a miss / parse error / any
// fs error simply refetches and never crashes.

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

// ── Public PostgREST config (overridable via env) ────────────────────────────

/** Default public REST base URL of the library Supabase project. */
const DEFAULT_LIBRARY_URL = "https://nkwgcuhjdxwsqsestgnp.supabase.co/rest/v1";

/**
 * PUBLIC publishable key — the 2026 replacement for the Supabase anon key. It is
 * SAFE to embed in open source (like a Stripe *publishable* key): it grants only
 * the row-level-security-gated read access the public library already exposes on
 * the web. This is NOT a secret; a secret scanner flagging it is a false
 * positive. Override with RALPHY_LIBRARY_KEY if you point the CLI at another
 * project.
 */
const DEFAULT_LIBRARY_PUBLISHABLE_KEY =
  "sb_publishable_8W-oYf8xA-315Kr0Z-GhXQ_Gs6GRLU2"; // gitleaks:allow — public publishable key

function libraryUrl(): string {
  return (process.env.RALPHY_LIBRARY_URL || DEFAULT_LIBRARY_URL).replace(/\/+$/, "");
}

function libraryKey(): string {
  return process.env.RALPHY_LIBRARY_KEY || DEFAULT_LIBRARY_PUBLISHABLE_KEY;
}

/** Cache TTL: 10 minutes. */
const CACHE_TTL_MS = 10 * 60 * 1000;

// ── Static format list (no `formats` DB table — it is a fixed taxonomy) ───────
// Mirrors landing/lib/library-v2/catalog.ts FORMATS verbatim.
const FORMATS: Format[] = [
  { id: "video", label: "Video", glyph: "▶", aspect: "9 / 16", unit: "clip", blurb: "A finished moving-image deliverable — one composed clip." },
  { id: "carousel", label: "Carousel", glyph: "❯", aspect: "4 / 5", unit: "slides", blurb: "A multi-slide swipeable post; each slide is its own still." },
  { id: "sticker-pack", label: "Sticker pack", glyph: "✺", aspect: "1 / 1", unit: "stickers", blurb: "A die-cut set sharing one mascot or visual system — 32+ stills." },
  { id: "podcast-cuts", label: "Podcast cuts", glyph: "♬", aspect: "9 / 16", unit: "cuts", blurb: "A stack of vertical clips cut from one long conversation." },
  { id: "fb-creative", label: "FB creative", glyph: "❤", aspect: "1 / 1", unit: "creatives", blurb: "A Meta-ads test set — silent videos and static cards across angles." },
  { id: "motion-design", label: "Motion design", glyph: "✳", aspect: "16 / 9", unit: "clip", blurb: "Code- and animation-driven motion graphics, not camera footage." },
  { id: "poster", label: "Poster", glyph: "✦", aspect: "4 / 5", unit: "still", blurb: "A single high-impact key-art still — drop, flyer, hype graphic." },
  { id: "image", label: "Image", glyph: "◐", aspect: "1 / 1", unit: "still", blurb: "A single generated still that is the deliverable on its own." },
];

// ── Pure mappers (snake→camel + `data` merge) ─────────────────────────────────
//
// Exported for unit tests. They never throw on a well-formed row; unknown keys
// pass through unchanged.

type Row = Record<string, unknown>;

/** Map a `units` row to a Unit. */
export function mapUnit(row: Row): Unit {
  return {
    id: String(row.id ?? ""),
    format: row.format as Unit["format"],
    title: String(row.title ?? ""),
    blurb: String(row.blurb ?? ""),
    ...(row.date != null ? { date: String(row.date) } : {}),
    ...(Array.isArray(row.media) ? { media: row.media as Unit["media"] } : {}),
    mediaCount: Number(row.media_count ?? (Array.isArray(row.media) ? row.media.length : 0)),
    ...(row.hero != null ? { hero: Boolean(row.hero) } : {}),
    ...(row.created_at != null ? { createdAt: String(row.created_at) } : {}),
    ...(Array.isArray(row.tags) ? { tags: (row.tags as unknown[]).map(String) } : {}),
  };
}

/** Map a `blocks` row to a Block, merging the `data` jsonb onto the entity. */
export function mapBlock(row: Row): Block {
  const data = isPlainObject(row.data) ? (row.data as Row) : {};
  const block: Block = {
    kind: row.kind as BlockKind,
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    blurb: String(row.blurb ?? ""),
    ...(row.sub != null ? { sub: row.sub as Block["sub"] } : {}),
    ...(Array.isArray(row.refs) ? { refs: (row.refs as unknown[]).map(String) } : {}),
    ...(row.created_at != null ? { createdAt: String(row.created_at) } : {}),
    ...(row.recipe_kind != null ? { recipeKind: row.recipe_kind as Block["recipeKind"] } : {}),
    // Merge the enriched payload (body / artifact / params / demo / …) from data.
    ...data,
  };
  return block;
}

/** Map a `blueprints` row to a Blueprint, merging the `data` jsonb onto it. */
export function mapBlueprint(row: Row): Blueprint {
  const data = isPlainObject(row.data) ? (row.data as Row) : {};
  return {
    unitId: String(row.unit_id ?? row.unitId ?? ""),
    ...(row.created_at != null ? { createdAt: String(row.created_at) } : {}),
    ...data,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
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

// ── Fetch ──────────────────────────────────────────────────────────────────--

/** GET a PostgREST path (relative to the REST base), returning parsed rows.
 *  Throws a clear Error on network / HTTP failure (the command layer turns it
 *  into err(...)). Cached on disk for CACHE_TTL_MS, keyed by the full URL. */
async function getRows(pathAndQuery: string): Promise<Row[]> {
  const url = `${libraryUrl()}/${pathAndQuery}`;
  const cached = readCache<Row[]>(url);
  if (cached) return cached;

  const key = libraryKey();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
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
  let rows: unknown;
  try {
    rows = await res.json();
  } catch (e) {
    throw new Error(`library response was not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(rows)) {
    throw new Error(`library response was not an array (got ${typeof rows})`);
  }
  writeCache(url, rows);
  return rows as Row[];
}

function encodeFilter(filter?: Record<string, string>): string {
  if (!filter) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(filter)) {
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `&${parts.join("&")}` : "";
}

// ── Public read API ───────────────────────────────────────────────────────────

/** All units (optionally PostgREST-filtered, e.g. `{ format: "eq.video" }`). */
export async function getUnits(filter?: Record<string, string>): Promise<Unit[]> {
  const rows = await getRows(`units?select=*&order=created_at.desc${encodeFilter(filter)}`);
  return rows.map(mapUnit);
}

/** A single unit by id, or null if not found. */
export async function getUnit(id: string): Promise<Unit | null> {
  const rows = await getRows(`units?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows.length ? mapUnit(rows[0]!) : null;
}

/** Blocks, optionally narrowed to one kind. */
export async function getBlocks(kind?: BlockKind): Promise<Block[]> {
  const kindQ = kind ? `&kind=eq.${encodeURIComponent(kind)}` : "";
  const rows = await getRows(`blocks?select=*${kindQ}&order=id.asc`);
  return rows.map(mapBlock);
}

/** A single block by (kind, id), or null if not found. */
export async function getBlock(kind: BlockKind, id: string): Promise<Block | null> {
  const rows = await getRows(
    `blocks?select=*&kind=eq.${encodeURIComponent(kind)}&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows.length ? mapBlock(rows[0]!) : null;
}

/** A single blueprint by its unitId, or null if not found. */
export async function getBlueprint(unitId: string): Promise<Blueprint | null> {
  const rows = await getRows(
    `blueprints?select=*&unit_id=eq.${encodeURIComponent(unitId)}&limit=1`,
  );
  return rows.length ? mapBlueprint(rows[0]!) : null;
}

/** All blueprints. */
export async function getBlueprints(): Promise<Blueprint[]> {
  const rows = await getRows(`blueprints?select=*&order=unit_id.asc`);
  return rows.map(mapBlueprint);
}

/** The static format taxonomy (no DB table — a fixed list). */
export function getFormats(): Format[] {
  return FORMATS;
}
