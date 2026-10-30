// Microsoft Fluent UI Emoji connector (#597): 3D PNG and flat SVG emoji
// (MIT) from the GitHub repository at a PINNED commit, served by jsDelivr.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT the `microsoft/fluentui-emoji`
// repository on jsDelivr or the GitHub API (AGENTS.md invariant #1, the same
// file-scoped discipline as firecrawl.ts). The agents-md invariants test
// allowlists exactly this file, scoped to the repository path (jsDelivr and
// the GitHub API also serve unrelated packages and repositories).
//
// Search runs over a keyword index built from the repository's per-emoji
// `metadata.json` (CLDR name, keywords, group, codepoint). jsDelivr refuses a
// package listing for this repository (it is over the 50 MB listing limit),
// so the file list comes from ONE keyless GitHub git-trees request at the
// pinned commit; the `metadata.json` files themselves come from jsDelivr. The
// index is built once per pin (about 1,600 small files, roughly 20 s; the
// first search gets a longer deadline) and cached under
// `.ralphy/cache/stock/`. Emoji with skin tones use the `Default` tone.
// HTTP is injectable (`fetchImpl`).

import { hasStockCache, readStockCache, writeStockCache } from "../stock/cache.js";
import { buildAttribution, noticeLicense } from "../stock/license.js";
import { StockSourceError, stockGetJson } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockSearchRequest } from "../stock/types.js";

const LABEL = "Fluent UI Emoji";
/** Pinned: file names and the license are read at this commit, so ids stay stable. */
export const FLUENT_EMOJI_COMMIT = "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc";
const CDN_BASE = `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@${FLUENT_EMOJI_COMMIT}`;
const TREE_URL = `https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/${FLUENT_EMOJI_COMMIT}?recursive=1`;
const PAGE_BASE = `https://github.com/microsoft/fluentui-emoji/tree/${FLUENT_EMOJI_COMMIT}/assets/`;
const LICENSE_URL = `https://github.com/microsoft/fluentui-emoji/blob/${FLUENT_EMOJI_COMMIT}/LICENSE`;
export const FLUENT_INDEX_CACHE_KEY = `fluent-emoji-index-${FLUENT_EMOJI_COMMIT.slice(0, 12)}`;
const METADATA_CONCURRENCY = 16;
/** The first search builds the index; it gets this long instead of the per-source default. */
const COLD_START_TIMEOUT_MS = 120_000;
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;

export type FluentStyle = "3d" | "flat";

export type FluentEntry = {
  slug: string;
  /** The `assets/` folder name ("Cat face"). */
  folder: string;
  cldr: string;
  unicode: string | null;
  group: string | null;
  keywords: string[];
  /** Repository paths of the files this connector serves. */
  png3d: string | null;
  flatSvg: string | null;
};

type TreeEntry = { path?: string; type?: string };
type TreeResponse = { tree?: TreeEntry[]; truncated?: boolean };
type Metadata = { cldr?: string; unicode?: string; group?: string; keywords?: string[]; tts?: string };

let cachedIndex: FluentEntry[] | null = null;

/** @internal Tests reset the in-process index. */
export function clearFluentEmojiCache(): void {
  cachedIndex = null;
}

/** ASCII kebab-case of a folder name: "Pi\u00f1ata" -> "pinata", "O button (blood type)" -> "o-button-blood-type". */
export function fluentSlug(folder: string): string {
  return folder
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function encodePath(repoPath: string): string {
  return repoPath.split("/").map(encodeURIComponent).join("/");
}

/** The served files per emoji folder, from the git tree (skin-tone emoji: the `Default` tone). */
export function fluentFoldersFromTree(entries: readonly TreeEntry[]): Map<string, { metadata: string | null; png3d: string | null; flatSvg: string | null }> {
  const folders = new Map<string, { metadata: string | null; png3d: string | null; flatSvg: string | null }>();
  for (const entry of entries) {
    if (entry.type !== "blob" || typeof entry.path !== "string") continue;
    const parts = entry.path.split("/");
    if (parts[0] !== "assets" || parts.length < 3) continue;
    const folder = parts[1]!;
    const slot = folders.get(folder) ?? { metadata: null, png3d: null, flatSvg: null };
    const rest = parts.slice(2);
    if (rest.length === 1 && rest[0] === "metadata.json") slot.metadata = entry.path;
    const style = rest.length === 2 ? rest[0] : rest.length === 3 && rest[0] === "Default" ? rest[1] : null;
    const file = rest[rest.length - 1]!;
    if (style === "3D" && file.endsWith(".png")) slot.png3d = entry.path;
    if (style === "Flat" && file.endsWith(".svg")) slot.flatSvg = entry.path;
    folders.set(folder, slot);
  }
  return folders;
}

/** One index entry from a folder's files and its metadata.json (null metadata: names only). */
export function fluentEntry(folder: string, files: { png3d: string | null; flatSvg: string | null }, metadata: Metadata | null): Omit<FluentEntry, "slug"> {
  return {
    folder,
    cldr: (metadata?.cldr ?? metadata?.tts ?? folder).toLowerCase(),
    unicode: typeof metadata?.unicode === "string" ? metadata.unicode : null,
    group: typeof metadata?.group === "string" ? metadata.group : null,
    keywords: Array.isArray(metadata?.keywords) ? metadata!.keywords!.filter((k) => typeof k === "string").map((k) => k.toLowerCase()) : [],
    png3d: files.png3d,
    flatSvg: files.flatSvg,
  };
}

/** Build the keyword index: the git tree at the pin, then every metadata.json from jsDelivr. */
export async function buildFluentIndex(fetchImpl: FetchLike, signal?: AbortSignal): Promise<{ entries: FluentEntry[]; missingMetadata: number }> {
  const tree = await stockGetJson<TreeResponse>(LABEL, TREE_URL, fetchImpl, { timeoutMs: 60_000, signal, headers: { Accept: "application/vnd.github+json" } });
  if (tree.truncated) throw new StockSourceError(LABEL, 0, `${LABEL}: the repository file list came back truncated`);
  const folders = [...fluentFoldersFromTree(tree.tree ?? []).entries()].filter(([, f]) => f.metadata && (f.png3d || f.flatSvg));
  if (folders.length === 0) throw new StockSourceError(LABEL, 0, `${LABEL}: no emoji folders at ${FLUENT_EMOJI_COMMIT.slice(0, 12)}`);

  const metadata = new Map<string, Metadata | null>();
  let next = 0;
  const fetchOne = async (path: string): Promise<Metadata | null> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await stockGetJson<Metadata>(LABEL, `${CDN_BASE}/${encodePath(path)}`, fetchImpl, { timeoutMs: 20_000, signal });
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
    return null;
  };
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= folders.length) return;
      const [folder, files] = folders[i]!;
      metadata.set(folder, await fetchOne(files.metadata!));
    }
  };
  await Promise.all(Array.from({ length: Math.min(METADATA_CONCURRENCY, folders.length) }, worker));

  const used = new Set<string>();
  const entries: FluentEntry[] = [];
  let missingMetadata = 0;
  for (const [folder, files] of folders) {
    const meta = metadata.get(folder) ?? null;
    if (!meta) missingMetadata += 1;
    const entry = fluentEntry(folder, files, meta);
    let slug = fluentSlug(folder) || fluentSlug(entry.unicode ?? "") || "emoji";
    if (used.has(slug)) slug = `${slug}-${fluentSlug(entry.unicode ?? String(entries.length))}`;
    if (!SLUG.test(slug) || used.has(slug)) continue;
    used.add(slug);
    entries.push({ slug, ...entry });
  }
  return { entries, missingMetadata };
}

async function loadIndex(fetchImpl: FetchLike, signal?: AbortSignal): Promise<FluentEntry[]> {
  if (cachedIndex) return cachedIndex;
  const disk = readStockCache<FluentEntry[]>(FLUENT_INDEX_CACHE_KEY, null);
  if (disk && disk.length > 0) return (cachedIndex = disk);
  const { entries, missingMetadata } = await buildFluentIndex(fetchImpl, signal);
  // A partial index (some metadata.json failed) is used for this process but
  // not cached, so the next search tries the missing files again.
  if (missingMetadata === 0) writeStockCache(FLUENT_INDEX_CACHE_KEY, entries);
  return (cachedIndex = entries);
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * How well an emoji matches the query: the whole query as the CLDR name scores
 * 100, each query word in the name 20, in the keywords 10, in the group 1.
 * Zero unless a word is in the name or the keywords.
 */
export function scoreFluentEntry(entry: Pick<FluentEntry, "cldr" | "keywords" | "group">, query: string): number {
  const terms = [...new Set(words(query))];
  if (terms.length === 0) return 0;
  const name = new Set(words(entry.cldr));
  const keywords = new Set(entry.keywords.flatMap(words));
  const group = new Set(words(entry.group ?? ""));
  let score = entry.cldr === terms.join(" ") ? 100 : 0;
  let hits = 0;
  for (const term of terms) {
    if (name.has(term)) {
      score += 20;
      hits += 1;
    } else if (keywords.has(term)) {
      score += 10;
      hits += 1;
    } else if (group.has(term)) score += 1;
  }
  return hits > 0 ? score : 0;
}

export function fluentId(style: FluentStyle, slug: string): string {
  return `fluent-emoji:${style}:${slug}`;
}

export function parseFluentId(id: string): { style: FluentStyle; slug: string } | null {
  const m = /^fluent-emoji:(3d|flat):([a-z0-9][a-z0-9-]{0,99})$/.exec(id);
  return m ? { style: m[1] as FluentStyle, slug: m[2]! } : null;
}

/** One emoji in one style as a stock candidate; null when that style has no file. */
export function fluentCandidate(entry: FluentEntry, style: FluentStyle): StockCandidate | null {
  const file = style === "3d" ? entry.png3d : entry.flatSvg;
  if (!file) return null;
  const name = entry.cldr.charAt(0).toUpperCase() + entry.cldr.slice(1);
  const title = `${name} ${style === "3d" ? "3D" : "flat"} emoji`;
  const pageUrl = `${PAGE_BASE}${encodeURIComponent(entry.folder)}`;
  const license = noticeLicense("MIT", LICENSE_URL);
  const other: FluentStyle = style === "3d" ? "flat" : "3d";
  const notes = [
    "MIT: keep the notice \"Copyright (c) Microsoft Corporation\" with the asset; a credit line in the post copy covers a video.",
  ];
  if (style === "3d") notes.push("3D PNG, 256 x 256 with a transparent background: fine as a small sticker; for a large overlay use the flat SVG.");
  if ((style === "3d" ? entry.flatSvg : entry.png3d) !== null) notes.push(`Same emoji in the other style: ${fluentId(other, entry.slug)}.`);
  return {
    id: fluentId(style, entry.slug),
    source: "fluent-emoji",
    kind: "sticker",
    title,
    pageUrl,
    mediaUrl: `${CDN_BASE}/${encodePath(file)}`,
    previewUrl: `${CDN_BASE}/${encodePath(file)}`,
    mime: style === "3d" ? "image/png" : "image/svg+xml",
    width: style === "3d" ? 256 : null,
    height: style === "3d" ? 256 : null,
    durationSec: null,
    author: "Microsoft",
    authorUrl: "https://github.com/microsoft/fluentui-emoji",
    ...license,
    attribution: buildAttribution({ title: `${name} (Fluent Emoji)`, author: "Microsoft", license: "MIT License", licenseUrl: LICENSE_URL, sourceLabel: LABEL, pageUrl }),
    notes,
    extra: {
      style,
      unicode: entry.unicode,
      group: entry.group,
      commit: FLUENT_EMOJI_COMMIT,
      [`${other}Id`]: (style === "3d" ? entry.flatSvg : entry.png3d) ? fluentId(other, entry.slug) : null,
    },
  };
}

async function search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]> {
  if (request.kind !== "sticker") return [];
  const index = await loadIndex(fetchImpl, request.signal);
  return index
    .map((entry) => ({ entry, score: scoreFluentEntry(entry, request.query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.cldr.length - b.entry.cldr.length || a.entry.cldr.localeCompare(b.entry.cldr))
    .map((x) => fluentCandidate(x.entry, "3d") ?? fluentCandidate(x.entry, "flat"))
    .filter((c): c is StockCandidate => c !== null)
    .slice(0, request.limit);
}

async function lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate> {
  const parsed = parseFluentId(id);
  if (!parsed) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not a Fluent emoji id (fluent-emoji:<3d|flat>:<name>)`);
  const entry = (await loadIndex(fetchImpl)).find((e) => e.slug === parsed.slug);
  const candidate = entry ? fluentCandidate(entry, parsed.style) : null;
  if (!candidate) throw new StockSourceError(LABEL, 404, `${LABEL}: no ${parsed.style} emoji '${parsed.slug}' at ${FLUENT_EMOJI_COMMIT.slice(0, 12)}`);
  return candidate;
}

export const fluentEmojiConnector: StockConnector = {
  id: "fluent-emoji",
  label: LABEL,
  kinds: ["sticker"],
  idPattern: /^fluent-emoji:(?:3d|flat):[a-z0-9][a-z0-9-]{0,99}$/,
  idHint: "fluent-emoji:<3d|flat>:<name>",
  unavailableNote: () => null,
  coldStartTimeoutMs: () => (cachedIndex || hasStockCache(FLUENT_INDEX_CACHE_KEY, null) ? null : COLD_START_TIMEOUT_MS),
  search,
  lookup,
};
