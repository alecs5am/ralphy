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

export type Manifest = {
  version: number;
  updated: string;
  baseUrl: string;
  releaseBaseUrl: string;
  required: Record<string, RequiredEntry>;
  examples: Record<string, ExampleEntry>;
};

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
  // Validate before caching.
  const parsed = JSON.parse(text) as Manifest;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported manifest version ${parsed.version} (expected 1)`);
  }
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
