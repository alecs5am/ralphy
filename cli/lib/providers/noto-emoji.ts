// Noto Animated Emoji connector (#597): Google's animated Noto emoji as Lottie
// JSON, 512 px animated WebP / GIF, and the static frame as SVG / PNG.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT the Noto Animated Emoji site
// (`googlefonts.github.io/noto-emoji-animation`) or its asset host
// (`fonts.gstatic.com/s/e/notoemoji`) (AGENTS.md invariant #1, the same
// file-scoped discipline as firecrawl.ts). The agents-md invariants test
// allowlists exactly this file.
//
// Search reads the index the project's own site loads (`data/api.json`: one
// entry per animated emoji with codepoint, tags, categories, popularity) and
// matches the query against tags and categories; the index is cached for a
// day. The asset URL pattern is the one the site's app builds
// (`<asset base>/<codepoint>/{lottie.json,512.webp,512.gif,emoji.svg}`;
// `512.png` is served beside them). License: the site's FAQ states that
// Animated Noto Emoji is licensed under CC BY 4.0. Keyless; HTTP is injectable.

import { readStockCache, writeStockCache } from "../stock/cache.js";
import { buildAttribution, ccLicense } from "../stock/license.js";
import { StockSourceError, stockGetJson } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockKind, StockSearchRequest } from "../stock/types.js";

const LABEL = "Noto Animated Emoji";
const SITE_URL = "https://googlefonts.github.io/noto-emoji-animation/";
const INDEX_URL = `${SITE_URL}data/api.json`;
const ASSET_BASE = "https://fonts.gstatic.com/s/e/notoemoji/latest";
const FAMILY = "Animated Emoji";
const INDEX_CACHE_KEY = "noto-emoji-index";
const INDEX_TTL_MS = 24 * 60 * 60 * 1000;
const CODEPOINT = /^[0-9a-f]{4,6}(?:_[0-9a-f]{4,6})*$/;

export const NOTO_FORMATS = {
  lottie: { file: "lottie.json", kind: "animation", mime: "application/json", size: 512 },
  webp: { file: "512.webp", kind: "animation", mime: "image/webp", size: 512 },
  gif: { file: "512.gif", kind: "animation", mime: "image/gif", size: 512 },
  svg: { file: "emoji.svg", kind: "sticker", mime: "image/svg+xml", size: null },
  png: { file: "512.png", kind: "sticker", mime: "image/png", size: 512 },
} as const;
export type NotoFormat = keyof typeof NOTO_FORMATS;

/** The format a search returns per kind; the others are listed as alternate ids. */
const PRIMARY_FORMAT: Partial<Record<StockKind, NotoFormat>> = { animation: "lottie", sticker: "svg" };

export type NotoIcon = {
  name?: string;
  codepoint?: string;
  popularity?: number;
  categories?: string[];
  tags?: string[];
};

type NotoIndex = { icons?: NotoIcon[] };

let cachedIcons: NotoIcon[] | null = null;

/** @internal Tests reset the in-process index. */
export function clearNotoEmojiCache(): void {
  cachedIcons = null;
}

async function loadIcons(fetchImpl: FetchLike, signal?: AbortSignal): Promise<NotoIcon[]> {
  if (cachedIcons) return cachedIcons;
  const disk = readStockCache<NotoIcon[]>(INDEX_CACHE_KEY, INDEX_TTL_MS);
  if (disk && disk.length > 0) return (cachedIcons = disk);
  const body = await stockGetJson<NotoIndex>(LABEL, INDEX_URL, fetchImpl, { timeoutMs: 30_000, signal });
  const icons = (body.icons ?? []).filter((icon) => typeof icon.codepoint === "string" && CODEPOINT.test(icon.codepoint));
  if (icons.length === 0) throw new StockSourceError(LABEL, 0, `${LABEL}: the index lists no emoji`);
  writeStockCache(INDEX_CACHE_KEY, icons);
  return (cachedIcons = icons);
}

/** `:smiley-cat:` -> `smiley cat`. */
function tagText(tag: string): string {
  return tag.replace(/^:|:$/g, "").replace(/[-_]+/g, " ").trim().toLowerCase();
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** A readable title from the first tag: `:smiley-cat:` -> "Smiley cat". */
export function notoTitle(icon: NotoIcon): string {
  const text = icon.tags?.[0] ? tagText(icon.tags[0]) : `emoji ${icon.codepoint ?? ""}`.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * How well an emoji matches the query: the whole query as a tag scores 100,
 * each query word found in a tag 20, in a category 3. Zero (no match) unless
 * at least one query word is in a tag, so a category alone never matches.
 */
export function scoreNotoIcon(icon: NotoIcon, query: string): number {
  const terms = [...new Set(words(query))];
  if (terms.length === 0) return 0;
  const tags = (icon.tags ?? []).map(tagText);
  const tagWords = new Set(tags.flatMap(words));
  const categoryWords = new Set((icon.categories ?? []).flatMap(words));
  const phrase = terms.join(" ");
  let score = tags.includes(phrase) ? 100 : 0;
  let tagHits = 0;
  for (const term of terms) {
    if (tagWords.has(term)) {
      tagHits += 1;
      score += 20;
    } else if (categoryWords.has(term)) score += 3;
  }
  return tagHits > 0 ? score : 0;
}

export function notoId(format: NotoFormat, codepoint: string): string {
  return `noto-emoji:${format}:${codepoint}`;
}

export function parseNotoId(id: string): { format: NotoFormat; codepoint: string } | null {
  const m = /^noto-emoji:([a-z]+):([0-9a-f_]+)$/.exec(id);
  if (!m || !(m[1]! in NOTO_FORMATS) || !CODEPOINT.test(m[2]!)) return null;
  return { format: m[1] as NotoFormat, codepoint: m[2]! };
}

/** One emoji in one format as a stock candidate. */
export function notoCandidate(icon: NotoIcon, format: NotoFormat): StockCandidate | null {
  const codepoint = icon.codepoint;
  if (!codepoint || !CODEPOINT.test(codepoint)) return null;
  const spec = NOTO_FORMATS[format];
  const name = icon.name ?? `emoji_u${codepoint}`;
  const base = notoTitle(icon);
  const title = spec.kind === "animation" ? `${base} animated emoji` : `${base} emoji`;
  const pageUrl = `${SITE_URL}?selected=${encodeURIComponent(`${FAMILY}:${name}`)}`;
  const license = ccLicense("by", "4.0");
  const alternates = (Object.keys(NOTO_FORMATS) as NotoFormat[]).filter((f) => f !== format);
  const notes = [
    "Animated Noto Emoji is licensed under CC BY 4.0 (the project's FAQ): credit Google and the license in the post copy.",
  ];
  if (format === "lottie") notes.push("Lottie JSON: play it with lottie-web in index.html (the lottie skill). For a plain <img>, pull the WebP or GIF id instead.");
  if (spec.kind === "sticker") notes.push("The static frame of the animated emoji, transparent background. The Noto Emoji artwork is also published under Apache 2.0 in googlefonts/noto-emoji.");
  notes.push(`Same emoji in other formats: ${alternates.map((f) => notoId(f, codepoint)).join(", ")}.`);
  return {
    id: notoId(format, codepoint),
    source: "noto-emoji",
    kind: spec.kind,
    title,
    pageUrl,
    mediaUrl: `${ASSET_BASE}/${codepoint}/${spec.file}`,
    previewUrl: `${ASSET_BASE}/${codepoint}/${spec.kind === "animation" ? "512.webp" : "emoji.svg"}`,
    mime: spec.mime,
    width: spec.size,
    height: spec.size,
    durationSec: null,
    author: "Google",
    authorUrl: SITE_URL,
    ...license,
    attribution: buildAttribution({ title: `${base} (Noto Animated Emoji)`, author: "Google", license: license.license, licenseUrl: license.licenseUrl, sourceLabel: LABEL, pageUrl }),
    notes,
    extra: {
      codepoint,
      format,
      category: icon.categories?.[0] ?? null,
      ...Object.fromEntries(alternates.map((f) => [`${f}Id`, notoId(f, codepoint)])),
    },
  };
}

async function search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]> {
  const format = PRIMARY_FORMAT[request.kind];
  if (!format) return [];
  const icons = await loadIcons(fetchImpl, request.signal);
  return icons
    .map((icon) => ({ icon, score: scoreNotoIcon(icon, request.query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.icon.popularity ?? 0) - (a.icon.popularity ?? 0))
    .slice(0, request.limit)
    .map((x) => notoCandidate(x.icon, format))
    .filter((c): c is StockCandidate => c !== null);
}

async function lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate> {
  const parsed = parseNotoId(id);
  if (!parsed) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not a Noto emoji id (noto-emoji:<lottie|webp|gif|svg|png>:<codepoint>)`);
  const icon = (await loadIcons(fetchImpl)).find((i) => i.codepoint === parsed.codepoint);
  const candidate = icon ? notoCandidate(icon, parsed.format) : null;
  if (!candidate) throw new StockSourceError(LABEL, 404, `${LABEL}: no animated emoji with codepoint ${parsed.codepoint}`);
  return candidate;
}

export const notoEmojiConnector: StockConnector = {
  id: "noto-emoji",
  label: LABEL,
  kinds: ["animation", "sticker"],
  idPattern: /^noto-emoji:(?:lottie|webp|gif|svg|png):[0-9a-f]{4,6}(?:_[0-9a-f]{4,6})*$/,
  idHint: "noto-emoji:<lottie|webp|gif|svg|png>:<codepoint>",
  unavailableNote: () => null,
  search,
  lookup,
};
