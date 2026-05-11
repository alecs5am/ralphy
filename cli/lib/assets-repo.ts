// Client for the ralphy-assets companion repo (https://github.com/alecs5am/ralphy-assets).
//
// The companion repo holds heavy / optional content the main ugc-cli repo
// doesn't ship: required template assets (e.g. trend music) and complete
// example projects. This module fetches via plain HTTPS (raw.githubusercontent
// for small files, GitHub Releases for large bundles), verifies sha256, and
// caches per-workspace under workspace/.ralph/asset-cache/.
//
// No auth needed for public assets. No FAL_KEY / OPENROUTER_API_KEY here —
// this is just CDN-style asset delivery.

import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { assetCacheDir } from "./paths.js";

const DEFAULT_MANIFEST_URL = "https://raw.githubusercontent.com/alecs5am/ralphy-assets/main/manifest.json";
const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type RequiredEntry = {
  template: string;
  path: string;
  destSubdir: string;
  sizeBytes: number;
  sha256: string;
  description?: string;
  via: "raw" | "release";
  releaseTag?: string;
};

export type ExampleEntry = {
  template: string;
  manifest?: string;
  sizeBytes: number;
  sha256: string;
  tarball?: string;
  via: "raw" | "release";
  releaseTag?: string;
  description?: string;
};

// Pool: generic reusable assets grouped by KIND (not template). Kinds are open-ended
// slugs (e.g. "gameplay-loops", "italian-brainrot-characters", "trend-music",
// "stock-broll", and future additions like "sfx", "transitions", "fonts", "overlays").
// Adding a new kind requires only a new key in the manifest's `pool` map — no schema
// or CLI change. Each item under a kind is keyed by its own slug.
//
// `worksWith` is an open list of template slugs that benefit from this item. Empty
// or absent → usable across any template. The agent reads this to surface relevant
// pool items when building prompts.
export type PoolItem = {
  path: string;                  // path in the ralphy-assets repo (e.g. "pool/<kind>/<slug>.png")
  sizeBytes: number;
  sha256: string;
  description?: string;
  license?: string;              // overrides category-level license
  attribution?: string;
  sourceUrl?: string;
  worksWith?: string[];          // template slugs this item is built for
  tags?: string[];
  destSubdir?: string;           // override category default subdir when installing into a project
  destFilename?: string;         // override basename(path) when installing
  via: "raw" | "release";
  releaseTag?: string;
};

export type PoolCategory = {
  description: string;
  license?: string;              // default license for all items in this kind
  attributionRequired?: boolean;
  defaultDestSubdir?: string;    // default subdir under project/ when installing
  items: Record<string, PoolItem>;
};

export type Manifest = {
  version: number;               // 1 (legacy) or 2 (with `pool`)
  updated: string;
  baseUrl: string;
  releaseBaseUrl: string;
  required: Record<string, RequiredEntry>;
  pool: Record<string, PoolCategory>;   // empty object on v1 manifests
  examples: Record<string, ExampleEntry>;
};

const SUPPORTED_MANIFEST_VERSIONS = [1, 2];

export function manifestUrl(): string {
  return process.env.RALPHY_ASSETS_MANIFEST_URL || DEFAULT_MANIFEST_URL;
}

async function manifestCachePath(): Promise<string> {
  const dir = assetCacheDir();
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, "manifest.json");
}

export async function loadManifest(opts: { force?: boolean } = {}): Promise<Manifest> {
  const cachePath = await manifestCachePath();

  if (!opts.force) {
    try {
      const stat = await fs.stat(cachePath);
      if (Date.now() - stat.mtimeMs < MANIFEST_CACHE_TTL_MS) {
        return JSON.parse(await fs.readFile(cachePath, "utf-8"));
      }
    } catch { /* fall through to refetch */ }
  }

  const url = manifestUrl();
  const res = await fetch(url, { headers: { "User-Agent": "ralphy-cli/1.0" } });
  if (!res.ok) {
    // Fall back to the on-disk cache if it exists, even if stale.
    try {
      return JSON.parse(await fs.readFile(cachePath, "utf-8"));
    } catch {
      throw new Error(`Failed to fetch manifest from ${url}: HTTP ${res.status}`);
    }
  }
  const text = await res.text();
  const parsed = JSON.parse(text) as Manifest;
  if (!SUPPORTED_MANIFEST_VERSIONS.includes(parsed.version)) {
    throw new Error(`Unsupported manifest version ${parsed.version} (expected one of ${SUPPORTED_MANIFEST_VERSIONS.join(", ")})`);
  }
  // v1 manifests have no `pool` field — synthesize empty so consumers don't need version-guards.
  if (!parsed.pool) parsed.pool = {};
  if (!parsed.examples) parsed.examples = {};
  await fs.writeFile(cachePath, text);
  return parsed;
}

export function resolveDownloadUrl(manifest: Manifest, entry: RequiredEntry | ExampleEntry, fileRel?: string): string {
  if (entry.via === "release") {
    const tag = entry.releaseTag;
    if (!tag) throw new Error(`Manifest entry uses via=release but has no releaseTag`);
    const filename = path.basename(fileRel ?? ("path" in entry ? entry.path : entry.tarball ?? ""));
    return `${manifest.releaseBaseUrl}/${tag}/${filename}`;
  }
  const rel = fileRel ?? ("path" in entry ? entry.path : entry.tarball ?? "");
  return `${manifest.baseUrl}/${rel}`;
}

async function sha256OfFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export async function downloadVerified(
  url: string,
  destPath: string,
  expectedSha256: string,
  opts: { onProgress?: (bytes: number) => void } = {},
): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  const res = await fetch(url, { headers: { "User-Agent": "ralphy-cli/1.0" } });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  if (!res.body) throw new Error(`Download failed: empty body for ${url}`);

  const tmp = `${destPath}.partial`;
  const sink = createWriteStream(tmp);
  let bytes = 0;
  const stream = Readable.fromWeb(res.body as any);
  stream.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    opts.onProgress?.(bytes);
  });
  stream.pipe(sink);
  await finished(sink);

  const actual = await sha256OfFile(tmp);
  if (actual !== expectedSha256) {
    await fs.rm(tmp, { force: true });
    throw new Error(`sha256 mismatch for ${url}: expected ${expectedSha256}, got ${actual}`);
  }
  await fs.rename(tmp, destPath);
}

// Get the cached path for a required-entry key, downloading if missing or invalid.
export async function ensureRequired(manifest: Manifest, key: string): Promise<{ cachedPath: string; entry: RequiredEntry }> {
  const entry = manifest.required[key];
  if (!entry) throw new Error(`Required asset not in manifest: ${key}`);

  const cacheRel = path.join("required", entry.template, path.basename(entry.path));
  const cachedPath = path.join(assetCacheDir(), cacheRel);

  // If cached and matches sha256, skip download.
  try {
    await fs.access(cachedPath);
    const actual = await sha256OfFile(cachedPath);
    if (actual === entry.sha256) return { cachedPath, entry };
    // Otherwise fall through to re-download (corrupt or stale).
  } catch { /* not cached */ }

  const url = resolveDownloadUrl(manifest, entry);
  await downloadVerified(url, cachedPath, entry.sha256);
  return { cachedPath, entry };
}

// List required entries belonging to a given template.
export function requiredForTemplate(manifest: Manifest, templateSlug: string): Array<[string, RequiredEntry]> {
  return Object.entries(manifest.required).filter(([, e]) => e.template === templateSlug);
}

// Wipe the entire asset cache.
export async function wipeCache(): Promise<{ removed: string }> {
  const dir = assetCacheDir();
  await fs.rm(dir, { recursive: true, force: true });
  return { removed: dir };
}

// ---------- Pool helpers ----------
//
// The pool layer is the "generic asset library" — items grouped by kind, not
// by template. Each item is referenced as `<kind>/<slug>`. Items live in the
// assets repo at `pool/<kind>/<file>` and are cached locally under
// `<asset-cache>/pool/<kind>/<file>`.

// List all pool kinds present in the manifest (e.g. ["gameplay-loops",
// "italian-brainrot-characters", ...]). Open-ended — adding a kind in the
// manifest immediately makes it discoverable here, no code change required.
export function poolKinds(manifest: Manifest): string[] {
  return Object.keys(manifest.pool ?? {});
}

// Get a specific category, or null if the kind isn't present.
export function poolCategory(manifest: Manifest, kind: string): PoolCategory | null {
  return manifest.pool?.[kind] ?? null;
}

// List items in a kind. Returns [] if the kind doesn't exist.
export function poolItems(manifest: Manifest, kind: string): Array<[string, PoolItem]> {
  const cat = poolCategory(manifest, kind);
  if (!cat) return [];
  return Object.entries(cat.items ?? {});
}

// List pool items relevant to a template — items whose `worksWith` contains
// the template slug, OR items with no worksWith (universal).
export function poolForTemplate(manifest: Manifest, templateSlug: string): Array<{ kind: string; slug: string; item: PoolItem }> {
  const out: Array<{ kind: string; slug: string; item: PoolItem }> = [];
  for (const [kind, cat] of Object.entries(manifest.pool ?? {})) {
    for (const [slug, item] of Object.entries(cat.items ?? {})) {
      const matches = !item.worksWith || item.worksWith.length === 0 || item.worksWith.includes(templateSlug);
      if (matches) out.push({ kind, slug, item });
    }
  }
  return out;
}

// Download a single pool item if not cached / corrupt. Returns the cached
// local path and the resolved item entry.
export async function ensurePool(manifest: Manifest, kind: string, slug: string): Promise<{ cachedPath: string; item: PoolItem; category: PoolCategory }> {
  const category = poolCategory(manifest, kind);
  if (!category) throw new Error(`Pool kind not in manifest: ${kind}`);
  const item = category.items?.[slug];
  if (!item) throw new Error(`Pool item not in manifest: ${kind}/${slug}`);

  const cacheRel = path.join("pool", kind, path.basename(item.path));
  const cachedPath = path.join(assetCacheDir(), cacheRel);

  try {
    await fs.access(cachedPath);
    const actual = await sha256OfFile(cachedPath);
    if (actual === item.sha256) return { cachedPath, item, category };
  } catch { /* not cached or stale */ }

  const url = item.via === "release"
    ? resolveDownloadUrl(manifest, { ...item, template: kind } as unknown as RequiredEntry, item.path)
    : `${manifest.baseUrl}/${item.path}`;
  await downloadVerified(url, cachedPath, item.sha256);
  return { cachedPath, item, category };
}
