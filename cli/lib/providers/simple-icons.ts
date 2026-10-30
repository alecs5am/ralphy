// Simple Icons connector (#596): single-color SVG brand logos with the brand
// hex, from the jsDelivr CDN at a PINNED package version.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT the `simple-icons` package on
// jsDelivr or `simpleicons.org` (AGENTS.md invariant #1, the same file-scoped
// discipline as firecrawl.ts). The agents-md invariants test allowlists
// exactly this file.
//
// Search reads the package's data JSON (title, hex, aliases, guidelines) and
// matches the query against title, slug and aliases; no network beyond the
// CDN. The icon data is CC0, but the logos themselves are trademarks of their
// owners, which the license field and notes say. `stock pull` writes the SVG
// with the brand hex as its fill. HTTP is injectable (`fetchImpl`).

import { buildAttribution } from "../stock/license.js";
import { StockSourceError, stockDownload, stockGetJson } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockDownload, StockSearchRequest } from "../stock/types.js";

const LABEL = "Simple Icons";
/** Pinned: a new release can rename or drop slugs, so ids stay stable per pin. */
export const SIMPLE_ICONS_VERSION = "16.30.0";
const CDN_BASE = `https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}`;
const DATA_URL = `${CDN_BASE}/data/simple-icons.json`;
const SITE_URL = "https://simpleicons.org/";
const CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const SLUG = /^[a-z0-9_]+$/;

export type SimpleIcon = {
  title?: string;
  hex?: string;
  source?: string;
  slug?: string;
  guidelines?: string;
  license?: { type?: string; url?: string };
  aliases?: { aka?: string[]; dup?: Array<{ title?: string }>; loc?: Record<string, string> };
};

let cachedData: SimpleIcon[] | null = null;

/** @internal Tests reset the in-process data cache. */
export function clearSimpleIconsCache(): void {
  cachedData = null;
}

// The package's own titleToSlug: replace a few characters, strip accents,
// then drop everything outside [a-z0-9].
const SLUG_REPLACEMENTS: Record<string, string> = {
  "+": "plus",
  ".": "dot",
  "&": "and",
  "\u0111": "d",
  "\u0127": "h",
  "\u0131": "i",
  "\u0138": "k",
  "\u0140": "l",
  "\u0142": "l",
  "\u00df": "ss",
  "\u0167": "t",
  "\u00f8": "o",
};

export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[+.&\u0111\u0127\u0131\u0138\u0140\u0142\u00df\u0167\u00f8]/g, (ch) => SLUG_REPLACEMENTS[ch] ?? "")
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");
}

function iconSlug(icon: SimpleIcon): string | null {
  const slug = icon.slug ?? (icon.title ? titleToSlug(icon.title) : "");
  return SLUG.test(slug) ? slug : null;
}

async function loadIcons(fetchImpl: FetchLike, signal?: AbortSignal): Promise<SimpleIcon[]> {
  if (cachedData) return cachedData;
  const body = await stockGetJson<SimpleIcon[] | { icons?: SimpleIcon[] }>(LABEL, DATA_URL, fetchImpl, { timeoutMs: 60_000, signal });
  const icons = Array.isArray(body) ? body : body.icons ?? [];
  if (icons.length === 0) throw new StockSourceError(LABEL, 0, `${LABEL}: the package data at ${SIMPLE_ICONS_VERSION} lists no icons`);
  cachedData = icons;
  return icons;
}

/** How well an icon matches the query; 0 means no match. */
export function scoreIcon(icon: SimpleIcon, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q || !icon.title) return 0;
  const qSlug = titleToSlug(q);
  const slug = iconSlug(icon) ?? "";
  const title = icon.title.toLowerCase();
  const aliases = [
    ...(icon.aliases?.aka ?? []),
    ...(icon.aliases?.dup ?? []).map((d) => d.title ?? ""),
    ...Object.values(icon.aliases?.loc ?? {}),
  ].map((a) => a.toLowerCase()).filter(Boolean);
  if (title === q || (qSlug && slug === qSlug)) return 100;
  if (aliases.includes(q) || (qSlug && aliases.some((a) => titleToSlug(a) === qSlug))) return 90;
  if (qSlug && slug.startsWith(qSlug)) return 70;
  if (title.startsWith(q)) return 60;
  if (title.split(/[^a-z0-9]+/).includes(q)) return 50;
  if (qSlug.length >= 3 && slug.includes(qSlug)) return 30;
  if (aliases.some((a) => a.includes(q))) return 20;
  return 0;
}

/** One icon as a stock candidate. */
export function simpleIconCandidate(icon: SimpleIcon): StockCandidate | null {
  const slug = iconSlug(icon);
  const hex = /^[0-9A-Fa-f]{6}$/.test(icon.hex ?? "") ? icon.hex!.toUpperCase() : null;
  if (!slug || !icon.title || !hex) return null;
  const title = icon.title;
  const pageUrl = `${SITE_URL}?q=${encodeURIComponent(slug)}`;
  const license = "CC0 1.0 (icon data); logo is a trademark of its owner";
  const notes = [
    `${title} is a trademark of its owner: CC0 covers the icon data only. Use the logo to identify the brand (editorial, nominative use); never imply endorsement or affiliation.`,
  ];
  if (icon.guidelines) notes.push(`Brand guidelines: ${icon.guidelines}`);
  if (icon.license?.type) notes.push(`The brand states its own license for this logo: ${icon.license.type}${icon.license.url ? ` (${icon.license.url})` : ""}.`);
  return {
    id: `simple-icons:${slug}`,
    source: "simple-icons",
    kind: "logo",
    title: `${title} logo`,
    pageUrl,
    mediaUrl: `${CDN_BASE}/icons/${slug}.svg`,
    previewUrl: `${CDN_BASE}/icons/${slug}.svg`,
    mime: "image/svg+xml",
    width: 24,
    height: 24,
    durationSec: null,
    author: title,
    authorUrl: icon.source ?? null,
    license,
    licenseUrl: CC0_URL,
    commercialOk: true,
    modificationOk: true,
    attributionRequired: false,
    shareAlike: false,
    attribution: buildAttribution({ title: `${title} logo`, author: null, license: "CC0 1.0 icon data; trademark of its owner", licenseUrl: CC0_URL, sourceLabel: LABEL, pageUrl }),
    notes,
    extra: { hex: `#${hex}`, packageVersion: SIMPLE_ICONS_VERSION, guidelines: icon.guidelines ?? null },
  };
}

async function search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]> {
  const icons = await loadIcons(fetchImpl, request.signal);
  return icons
    .map((icon) => ({ icon, score: scoreIcon(icon, request.query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.icon.title ?? "").localeCompare(b.icon.title ?? ""))
    .map((x) => simpleIconCandidate(x.icon))
    .filter((c): c is StockCandidate => c !== null)
    .slice(0, request.limit);
}

async function lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate> {
  const m = /^simple-icons:([a-z0-9_]+)$/.exec(id);
  if (!m) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not a Simple Icons id (simple-icons:<slug>)`);
  const icon = (await loadIcons(fetchImpl)).find((i) => iconSlug(i) === m[1]);
  const candidate = icon ? simpleIconCandidate(icon) : null;
  if (!candidate) throw new StockSourceError(LABEL, 404, `${LABEL}: no icon '${m[1]}' in simple-icons@${SIMPLE_ICONS_VERSION}`);
  return candidate;
}

/** Set the brand hex as the fill of the root `<svg>` (the package ships fill-less SVGs). */
export function withBrandFill(svg: string, hex: string): string {
  return svg.replace(/<svg\b([^>]*)>/i, (whole, attrs: string) =>
    /\sfill\s*=/.test(attrs) ? whole : `<svg${attrs} fill="${hex}">`);
}

async function download(candidate: StockCandidate, fetchImpl: FetchLike, options: { maxBytes: number; timeoutMs: number }): Promise<StockDownload> {
  const raw = await stockDownload(LABEL, candidate.mediaUrl, fetchImpl, options);
  const svg = new TextDecoder().decode(raw.bytes);
  if (!/<svg\b/i.test(svg)) throw new StockSourceError(LABEL, 0, `${LABEL}: ${candidate.id} did not download as SVG`);
  const hex = typeof candidate.extra.hex === "string" ? candidate.extra.hex : null;
  return { bytes: new TextEncoder().encode(hex ? withBrandFill(svg, hex) : svg), contentType: "image/svg+xml" };
}

export const simpleIconsConnector: StockConnector = {
  id: "simple-icons",
  label: LABEL,
  kinds: ["logo"],
  unavailableNote: () => null,
  search,
  lookup,
  download,
};
