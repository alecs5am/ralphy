// Iconify connector (#597): SVG icons from 200+ open icon sets through the
// keyless public Iconify API (search, collections, SVG).
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT `iconify.design` HOSTS
// (AGENTS.md invariant #1, the same file-scoped discipline as firecrawl.ts).
// The agents-md invariants test allowlists exactly this file.
//
// Licenses differ per icon set, so the license of every candidate comes from
// the set's entry in the collections endpoint (SPDX id, title, URL; cached for
// a day) and is mapped by spdxLicense(): MIT / Apache / ISC / BSD and CC BY
// pass `--license commercial`, CC BY-SA passes it but fails `open`, GPL / OFL
// / unknown fail `commercial`. Sets tagged "Contains Animations" (line-md,
// svg-spinners, meteocons) carry animated SVG icons: `--kind animation` asks
// only those, with `iconify:animation:<set>:<name>` ids so a pull lands in
// `artifacts/animations/`. HTTP is injectable (`fetchImpl`).

import { readStockCache, writeStockCache } from "../stock/cache.js";
import { buildAttribution, licenseNotes, spdxLicense } from "../stock/license.js";
import { StockSourceError, stockGetJson } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockSearchRequest } from "../stock/types.js";

const LABEL = "Iconify";
const API_BASE = "https://api.iconify.design";
const SITE_BASE = "https://icon-sets.iconify.design";
const COLLECTIONS_CACHE_KEY = "iconify-collections";
const COLLECTIONS_TTL_MS = 24 * 60 * 60 * 1000;
const ANIMATED_TAG = "Contains Animations";
/** Animated sets known when this connector was written; the collection tags extend the list. */
export const KNOWN_ANIMATED_SETS = ["line-md", "svg-spinners", "meteocons"] as const;
/** The API refuses a search `limit` under 32. */
const MIN_SEARCH_LIMIT = 32;
const PREFIX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME = /^[a-z0-9][a-z0-9_-]*$/;

export type IconifyCollection = {
  name?: string;
  total?: number;
  author?: { name?: string; url?: string };
  license?: { title?: string; spdx?: string; url?: string };
  height?: number | number[];
  category?: string;
  tags?: string[];
  palette?: boolean;
  hidden?: boolean;
};

type Collections = Record<string, IconifyCollection>;
type SearchResponse = { icons?: string[]; total?: number; collections?: Collections };
type IconSetResponse = { prefix?: string; icons?: Record<string, unknown>; aliases?: Record<string, unknown>; not_found?: string[] };

let cachedCollections: Collections | null = null;

/** @internal Tests reset the in-process collection list. */
export function clearIconifyCache(): void {
  cachedCollections = null;
}

async function loadCollections(fetchImpl: FetchLike, signal?: AbortSignal): Promise<Collections> {
  if (cachedCollections) return cachedCollections;
  const disk = readStockCache<Collections>(COLLECTIONS_CACHE_KEY, COLLECTIONS_TTL_MS);
  if (disk && Object.keys(disk).length > 0) return (cachedCollections = disk);
  const body = await stockGetJson<Collections>(LABEL, `${API_BASE}/collections`, fetchImpl, { timeoutMs: 30_000, signal });
  if (!body || typeof body !== "object" || Object.keys(body).length === 0) throw new StockSourceError(LABEL, 0, `${LABEL}: the collections endpoint listed no icon sets`);
  writeStockCache(COLLECTIONS_CACHE_KEY, body);
  return (cachedCollections = body);
}

/** Icon sets whose icons are animated SVG: tagged "Contains Animations", plus the known list. */
export function animatedSets(collections: Collections): string[] {
  const tagged = Object.entries(collections)
    .filter(([, c]) => !c.hidden && (c.tags ?? []).includes(ANIMATED_TAG))
    .map(([prefix]) => prefix);
  const known = KNOWN_ANIMATED_SETS.filter((prefix) => prefix in collections);
  return [...new Set([...tagged, ...known])].sort();
}

function humanize(name: string): string {
  const text = name.replace(/[-_]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function iconifyId(prefix: string, name: string, animation: boolean): string {
  return `iconify:${animation ? "animation:" : ""}${prefix}:${name}`;
}

export function parseIconifyId(id: string): { prefix: string; name: string; animation: boolean } | null {
  const m = /^iconify:(?:(animation):)?([a-z0-9-]+):([a-z0-9_-]+)$/.exec(id);
  if (!m || !PREFIX.test(m[2]!) || !NAME.test(m[3]!)) return null;
  return { prefix: m[2]!, name: m[3]!, animation: m[1] === "animation" };
}

/** One icon as a stock candidate. `animation`: pulled as an animated SVG (only for animated sets). */
export function iconifyCandidate(prefix: string, name: string, collection: IconifyCollection | undefined, options: { animated: boolean; animation: boolean }): StockCandidate | null {
  if (!PREFIX.test(prefix) || !NAME.test(name)) return null;
  const setName = collection?.name?.trim() || prefix;
  const license = spdxLicense(collection?.license?.spdx, collection?.license?.title, collection?.license?.url);
  const title = `${humanize(name)} icon (${setName})`;
  const pageUrl = `${SITE_BASE}/${prefix}/${name}/`;
  const author = collection?.author?.name?.trim() || null;
  const height = typeof collection?.height === "number" ? collection.height : null;
  const notes = licenseNotes(license);
  if (collection?.palette === false) notes.push("Monotone icon drawn in currentColor: inline the SVG and set `color` in CSS (or edit its fill); as an <img> it renders black.");
  if (options.animated) notes.push("Animated SVG (SMIL / CSS): check it in a test render, since a render seeks time frame by frame.");
  if (!collection) notes.push(`${LABEL} listed no license for the set '${prefix}'; treat it as all rights reserved.`);
  return {
    id: iconifyId(prefix, name, options.animation),
    source: "iconify",
    kind: options.animation ? "animation" : "icon",
    title,
    pageUrl,
    mediaUrl: `${API_BASE}/${prefix}/${name}.svg?height=auto`,
    previewUrl: `${API_BASE}/${prefix}/${name}.svg`,
    mime: "image/svg+xml",
    width: height,
    height,
    durationSec: null,
    author,
    authorUrl: collection?.author?.url ?? null,
    ...license,
    attribution: buildAttribution({ title: `${name} icon from ${setName}`, author, license: license.license, licenseUrl: license.licenseUrl, sourceLabel: LABEL, pageUrl }),
    notes,
    extra: { prefix, name, set: setName, animated: options.animated, palette: collection?.palette ?? null, spdx: collection?.license?.spdx ?? null },
  };
}

async function search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]> {
  if (request.kind !== "icon" && request.kind !== "animation") return [];
  const collections = await loadCollections(fetchImpl, request.signal);
  const animated = new Set(animatedSets(collections));
  const params = new URLSearchParams({ query: request.query, limit: String(Math.min(999, Math.max(MIN_SEARCH_LIMIT, request.limit * 3))) });
  if (request.kind === "animation") {
    if (animated.size === 0) return [];
    params.set("prefixes", [...animated].join(","));
  }
  const body = await stockGetJson<SearchResponse>(LABEL, `${API_BASE}/search?${params}`, fetchImpl, { signal: request.signal });
  const out: StockCandidate[] = [];
  for (const full of body.icons ?? []) {
    const [prefix, name, ...rest] = full.split(":");
    if (!prefix || !name || rest.length > 0) continue;
    const collection = collections[prefix] ?? body.collections?.[prefix];
    const isAnimated = animated.has(prefix);
    if (request.kind === "animation" && !isAnimated) continue;
    const candidate = iconifyCandidate(prefix, name, collection, { animated: isAnimated, animation: request.kind === "animation" });
    if (candidate) out.push(candidate);
  }
  return out;
}

async function lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate> {
  const parsed = parseIconifyId(id);
  if (!parsed) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not an Iconify id (iconify:<set>:<name>, or iconify:animation:<set>:<name>)`);
  const collections = await loadCollections(fetchImpl);
  const collection = collections[parsed.prefix];
  if (!collection) throw new StockSourceError(LABEL, 404, `${LABEL}: no icon set '${parsed.prefix}'`);
  const isAnimated = animatedSets(collections).includes(parsed.prefix);
  if (parsed.animation && !isAnimated) throw new StockSourceError(LABEL, 0, `${LABEL}: the set '${parsed.prefix}' has no animated icons; pull iconify:${parsed.prefix}:${parsed.name} as an icon`);
  const set = await stockGetJson<IconSetResponse>(LABEL, `${API_BASE}/${parsed.prefix}.json?${new URLSearchParams({ icons: parsed.name })}`, fetchImpl);
  const known = Boolean(set.icons && parsed.name in set.icons) || Boolean(set.aliases && parsed.name in set.aliases);
  if (!known) throw new StockSourceError(LABEL, 404, `${LABEL}: no icon '${parsed.name}' in the set '${parsed.prefix}'`);
  const candidate = iconifyCandidate(parsed.prefix, parsed.name, collection, { animated: isAnimated, animation: parsed.animation });
  if (!candidate) throw new StockSourceError(LABEL, 0, `${LABEL}: ${id} is not a usable icon`);
  return candidate;
}

export const iconifyConnector: StockConnector = {
  id: "iconify",
  label: LABEL,
  kinds: ["icon", "animation"],
  idPattern: /^iconify:(?:animation:)?[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9][a-z0-9_-]*$/,
  idHint: "iconify:<set>:<name> or iconify:animation:<set>:<name>",
  unavailableNote: () => null,
  search,
  lookup,
};
