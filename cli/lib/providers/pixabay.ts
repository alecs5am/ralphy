// Pixabay connector (#597): photos, illustrations, vectors and video under the
// Pixabay Content License (commercial use and editing allowed, attribution not
// required) through the Pixabay API.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT `pixabay.com` HOSTS
// (AGENTS.md invariant #1, the same file-scoped discipline as firecrawl.ts).
// `PIXABAY_API_KEY` is read only through cli/lib/providers/credentials.ts (the
// `pixabay` descriptor); the agents-md invariants test enforces both.
//
// Pixabay needs a free key, sent as the `key` query parameter the API
// documents. Without one, `ralphy stock search` skips this source with a note;
// `stock pull` of a `pixabay:` id fails with E_ENV_KEY_MISSING. The API terms
// require caching responses for 24 hours, so search and lookup answers are
// cached under `.ralphy/cache/stock/` (the cache key never holds the API key).
// `--kind sticker` asks for vector graphics (cut-out art). HTTP is injectable.

import { credentialConfigured, credentialValue } from "./credentials.js";
import { readStockCache, stockCacheKey, writeStockCache } from "../stock/cache.js";
import { StockSourceError, stockGetJson } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockKind, StockLicense, StockSearchRequest } from "../stock/types.js";

const LABEL = "Pixabay";
export const PIXABAY_ENV_VAR = "PIXABAY_API_KEY";
const SIGNUP_URL = "https://pixabay.com/api/docs/";
const API_BASE = "https://pixabay.com/api";
const LICENSE_URL = "https://pixabay.com/service/license-summary/";
/** The API terms: responses must be cached for 24 hours. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const PIXABAY_LICENSE: StockLicense = Object.freeze({
  license: "Pixabay Content License",
  licenseUrl: LICENSE_URL,
  commercialOk: true,
  modificationOk: true,
  attributionRequired: false,
  shareAlike: false,
});

const LICENSE_NOTE = "Pixabay Content License: free for commercial use and editing, no attribution required; do not sell or redistribute unaltered copies, and do not use identifiable people, brands or logos in a way that implies endorsement.";

export type PixabayImage = {
  id?: number;
  pageURL?: string;
  type?: string;
  tags?: string;
  previewURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  fullHDURL?: string;
  imageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  user?: string;
  user_id?: number;
};

export type PixabayVideoFile = { url?: string; width?: number; height?: number; size?: number; thumbnail?: string };

export type PixabayVideo = {
  id?: number;
  pageURL?: string;
  type?: string;
  tags?: string;
  duration?: number;
  videos?: Partial<Record<"large" | "medium" | "small" | "tiny", PixabayVideoFile>>;
  user?: string;
  user_id?: number;
};

type Hits<T> = { total?: number; totalHits?: number; hits?: T[] };

/** True iff the connector's key is present. */
export function pixabayAvailable(): boolean {
  return credentialConfigured("pixabay");
}

export function pixabayMissingKeyNote(): string {
  return `pixabay skipped: ${PIXABAY_ENV_VAR} is not set (free key at ${SIGNUP_URL}; store it with \`ralphy provider auth set pixabay --stdin\` or export it)`;
}

function apiKey(): string {
  const key = credentialValue("pixabay");
  if (!key) throw new StockSourceError(LABEL, 401, `${LABEL}: ${PIXABAY_ENV_VAR} is not set. Get a free key at ${SIGNUP_URL}.`);
  return key;
}

export function parsePixabayId(id: string): { type: "image" | "video"; id: string } | null {
  const m = /^pixabay:(image|video):(\d{1,15})$/.exec(id);
  return m ? { type: m[1] as "image" | "video", id: m[2]! } : null;
}

function userUrl(user: string | undefined, userId: number | undefined): string | null {
  return user && userId ? `https://pixabay.com/users/${encodeURIComponent(user)}-${userId}/` : null;
}

function titleFromTags(tags: string | undefined, fallback: string): string {
  const words = (tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 4);
  if (words.length === 0) return fallback;
  const text = words.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One image hit as a candidate; vectors are stickers (cut-out art), the rest images. */
export function pixabayImageCandidate(hit: PixabayImage, kind?: StockKind): StockCandidate | null {
  const mediaUrl = hit.imageURL ?? hit.fullHDURL ?? hit.largeImageURL;
  if (!hit.id || !hit.pageURL || !mediaUrl) return null;
  const type = (hit.type ?? "").toLowerCase();
  const resolvedKind: StockKind = kind ?? (type.startsWith("vector") ? "sticker" : "image");
  const author = hit.user?.trim() || null;
  const what = type.startsWith("vector") ? "Vector" : type === "illustration" ? "Illustration" : "Photo";
  // largeImageURL is at most 1280 px on the long side; the original size is imageWidth x imageHeight.
  const full = Boolean(hit.imageURL);
  const scale = !full && hit.imageWidth && hit.imageHeight ? Math.min(1, (hit.fullHDURL ? 1920 : 1280) / Math.max(hit.imageWidth, hit.imageHeight)) : 1;
  const notes = [LICENSE_NOTE];
  if (!full) notes.push(`The API serves this ${what.toLowerCase()} at most ${hit.fullHDURL ? 1920 : 1280} px on the long side; the original is on the Pixabay page.`);
  if (resolvedKind === "sticker") notes.push("Vector art: check the downloaded file for a transparent background before using it as a cut-out sticker.");
  return {
    id: `pixabay:image:${hit.id}`,
    source: "pixabay",
    kind: resolvedKind,
    title: titleFromTags(hit.tags, `Pixabay ${what.toLowerCase()} ${hit.id}`),
    pageUrl: hit.pageURL,
    mediaUrl,
    previewUrl: hit.webformatURL ?? hit.previewURL ?? null,
    mime: null,
    width: hit.imageWidth ? Math.round(hit.imageWidth * scale) : null,
    height: hit.imageHeight ? Math.round(hit.imageHeight * scale) : null,
    durationSec: null,
    author,
    authorUrl: userUrl(hit.user, hit.user_id),
    ...PIXABAY_LICENSE,
    attribution: author ? `${what} by ${author} on Pixabay: ${hit.pageURL}` : `${what} from Pixabay: ${hit.pageURL}`,
    notes,
    extra: { pixabayType: hit.type ?? null, tags: hit.tags ?? null },
  };
}

/** The video file to download: the largest at most 1080 lines, else the smallest available. */
export function pickPixabayFile(videos: PixabayVideo["videos"]): PixabayVideoFile | null {
  const files = Object.values(videos ?? {}).filter((f): f is PixabayVideoFile => Boolean(f?.url) && (f?.width ?? 0) > 0);
  if (files.length === 0) return null;
  const lines = (f: PixabayVideoFile) => Math.min(f.width ?? 0, f.height ?? 0);
  const fitting = files.filter((f) => lines(f) > 0 && lines(f) <= 1080);
  if (fitting.length > 0) return fitting.sort((a, b) => lines(b) - lines(a))[0]!;
  return files.sort((a, b) => lines(a) - lines(b))[0]!;
}

export function pixabayVideoCandidate(hit: PixabayVideo): StockCandidate | null {
  if (!hit.id || !hit.pageURL) return null;
  const file = pickPixabayFile(hit.videos);
  if (!file?.url) return null;
  const author = hit.user?.trim() || null;
  return {
    id: `pixabay:video:${hit.id}`,
    source: "pixabay",
    kind: "video",
    title: titleFromTags(hit.tags, `Pixabay video ${hit.id}`),
    pageUrl: hit.pageURL,
    mediaUrl: file.url,
    previewUrl: file.thumbnail ?? null,
    mime: "video/mp4",
    width: file.width ?? null,
    height: file.height ?? null,
    durationSec: hit.duration ?? null,
    author,
    authorUrl: userUrl(hit.user, hit.user_id),
    ...PIXABAY_LICENSE,
    attribution: author ? `Video by ${author} on Pixabay: ${hit.pageURL}` : `Video from Pixabay: ${hit.pageURL}`,
    notes: [LICENSE_NOTE],
    extra: { pixabayType: hit.type ?? null, tags: hit.tags ?? null, fileBytes: file.size ?? null },
  };
}

/** GET with the 24 h response cache the API terms require; the cache key leaves the key out. */
async function cachedGet<T>(endpoint: "" | "videos/", params: URLSearchParams, fetchImpl: FetchLike, signal?: AbortSignal): Promise<T> {
  const cacheKey = stockCacheKey("pixabay", [endpoint, params.toString()]);
  const cached = readStockCache<T>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;
  const withKey = new URLSearchParams(params);
  withKey.set("key", apiKey());
  const body = await stockGetJson<T>(LABEL, `${API_BASE}/${endpoint}?${withKey}`, fetchImpl, { signal });
  writeStockCache(cacheKey, body);
  return body;
}

async function search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]> {
  const params = new URLSearchParams({
    q: request.query.slice(0, 100),
    per_page: String(Math.min(200, Math.max(3, request.limit * 2))),
    safesearch: "true",
  });
  if (request.orientation !== "any") params.set("orientation", request.orientation);
  if (request.kind === "video") {
    const body = await cachedGet<Hits<PixabayVideo>>("videos/", params, fetchImpl, request.signal);
    return (body.hits ?? []).map(pixabayVideoCandidate).filter((c): c is StockCandidate => c !== null);
  }
  params.set("image_type", request.kind === "sticker" ? "vector" : "all");
  const body = await cachedGet<Hits<PixabayImage>>("", params, fetchImpl, request.signal);
  const kind: StockKind = request.kind === "sticker" ? "sticker" : "image";
  return (body.hits ?? []).map((hit) => pixabayImageCandidate(hit, kind)).filter((c): c is StockCandidate => c !== null);
}

async function lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate> {
  const parsed = parsePixabayId(id);
  if (!parsed) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not a Pixabay id (pixabay:image:<n> or pixabay:video:<n>)`);
  const params = new URLSearchParams({ id: parsed.id });
  const candidate = parsed.type === "video"
    ? pixabayVideoCandidate((await cachedGet<Hits<PixabayVideo>>("videos/", params, fetchImpl)).hits?.[0] ?? {})
    : pixabayImageCandidate((await cachedGet<Hits<PixabayImage>>("", params, fetchImpl)).hits?.[0] ?? {});
  if (!candidate) throw new StockSourceError(LABEL, 404, `${LABEL}: ${id} was not found or has no downloadable file`);
  return candidate;
}

export const pixabayConnector: StockConnector = {
  id: "pixabay",
  label: LABEL,
  kinds: ["image", "video", "sticker"],
  requiredKey: PIXABAY_ENV_VAR,
  idPattern: /^pixabay:(?:image|video):\d{1,15}$/,
  idHint: "pixabay:image:<n> or pixabay:video:<n>",
  unavailableNote: () => (pixabayAvailable() ? null : pixabayMissingKeyNote()),
  search,
  lookup,
};
