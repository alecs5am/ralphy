// Wikimedia Commons connector (#596): freely licensed images, SVG drawings
// (logos), video and audio through the keyless MediaWiki action API.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT `wikimedia.org` HOSTS
// (AGENTS.md invariant #1, the same file-scoped discipline as firecrawl.ts).
// The agents-md invariants test allowlists exactly this file.
//
// Search is `generator=search` over the File namespace (6) with a CirrusSearch
// `filetype:` keyword per kind; license and author come from `extmetadata`.
// Wikimedia requires a descriptive User-Agent, which every stock request sends
// (cli/lib/stock/types.ts). Not registered in the provider registry; HTTP is
// injectable (`fetchImpl`) so tests run with zero network.

import { buildAttribution, licenseFromShortName, licenseNotes } from "../stock/license.js";
import { StockSourceError, firstHref, htmlToText, stockGetJson } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockKind, StockSearchRequest } from "../stock/types.js";

const LABEL = "Wikimedia Commons";
const API_URL = "https://commons.wikimedia.org/w/api.php";
const PAGE_BASE = "https://commons.wikimedia.org/wiki/";
/** A standard Wikimedia thumbnail width: the render used for non-browser originals (TIFF, huge files). */
const RENDER_WIDTH = 1920;
const PREVIEW_WIDTH = 500;
/** Originals above this size are fetched as the RENDER_WIDTH render instead. */
const MAX_ORIGINAL_IMAGE_BYTES = 25 * 1024 * 1024;
const EXTMETADATA = [
  "LicenseShortName",
  "LicenseUrl",
  "License",
  "Artist",
  "Credit",
  "AttributionRequired",
  "NonFree",
  "Restrictions",
  "ObjectName",
  "ImageDescription",
  "Categories",
].join("|");
const STOP_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with", "logo"]);

const FILETYPE: Record<StockKind, string> = { image: "bitmap", video: "video", audio: "audio", logo: "drawing" };
/** Originals a browser (and so a HyperFrames render) shows as they are. */
const BROWSER_IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

type ExtValue = { value?: string | number | null };

export type CommonsInfo = {
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  url?: string;
  descriptionurl?: string;
  thumburl?: string;
  mime?: string;
  extmetadata?: Record<string, ExtValue | undefined>;
  derivatives?: Array<{ src?: string; type?: string; width?: number; height?: number; transcodekey?: string }>;
};

export type CommonsPage = {
  pageid?: number;
  ns?: number;
  title?: string;
  index?: number;
  missing?: boolean;
  imageinfo?: CommonsInfo[];
  videoinfo?: CommonsInfo[];
};

type CommonsResponse = { query?: { pages?: CommonsPage[] } };

/** `commons:File:Foo_bar.jpg` from a page title (`File:Foo bar.jpg`). */
export function commonsId(title: string): string {
  return `commons:${title.trim().replace(/ /g, "_")}`;
}

/** The page title a `commons:File:...` id names, or null. */
export function parseCommonsId(id: string): string | null {
  const m = /^commons:(File:.+)$/i.exec(id);
  if (!m) return null;
  const title = m[1]!.replace(/_/g, " ").trim();
  return /^File:[^|#<>[\]{}]+\.[A-Za-z0-9]+$/i.test(title) ? `File:${title.slice(5)}` : null;
}

function kindForMime(mime: string, requested: StockKind | null, info: CommonsInfo): StockKind | null {
  if (mime === "image/svg+xml") return requested === "logo" ? "logo" : "image";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  // Ogg containers report one MIME for both: a frame size means video.
  if (mime === "application/ogg") return (info.width ?? 0) > 0 ? "video" : "audio";
  return null;
}

function ext(info: CommonsInfo, key: string): string | null {
  const value = info.extmetadata?.[key]?.value;
  return value === undefined || value === null ? null : String(value);
}

/** The best browser-playable video file: an MP4 or VP9 WebM transcode at most 1080p, else the original. */
function pickVideo(info: CommonsInfo): { url: string; mime: string; width: number | null; height: number | null } | null {
  const derivatives = (info.derivatives ?? []).filter((d) => d.src && d.type);
  const score = (d: NonNullable<CommonsInfo["derivatives"]>[number]): number => {
    const type = d.type!.toLowerCase();
    const family = type.startsWith("video/mp4") ? 2 : type.startsWith("video/webm") && type.includes("vp9") ? 1 : 0;
    if (family === 0) return -1;
    const h = Math.min(d.width ?? 0, d.height ?? 0) || (d.height ?? 0);
    const fits = h > 0 && h <= 1080 ? 1 : 0;
    return family * 100_000 + fits * 10_000 + (fits ? h : 10_000 - Math.min(h, 9_999));
  };
  const best = derivatives.map((d) => ({ d, s: score(d) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0]?.d;
  if (best) {
    return {
      url: absolute(best.src!),
      mime: best.type!.split(";")[0]!.trim(),
      width: best.width ?? null,
      height: best.height ?? null,
    };
  }
  const mime = (info.mime ?? "").toLowerCase();
  if (info.url && (mime === "video/webm" || mime === "video/mp4")) {
    return { url: absolute(info.url), mime, width: info.width ?? null, height: info.height ?? null };
  }
  return null;
}

/** One Commons file page as a stock candidate; null when it cannot be used as `requested`. */
export function commonsCandidate(page: CommonsPage, requested: StockKind | null): StockCandidate | null {
  const info = page.videoinfo?.[0] ?? page.imageinfo?.[0];
  if (!page.title || !info?.url) return null;
  const mime = (info.mime ?? "").toLowerCase();
  const kind = kindForMime(mime, requested, info);
  if (!kind || (requested !== null && kind !== requested && !(requested === "logo" && kind === "image"))) return null;

  let mediaUrl = absolute(info.url);
  let mediaMime: string | null = mime || null;
  let width = positive(info.width);
  let height = positive(info.height);
  if (kind === "video") {
    const picked = pickVideo(info);
    if (!picked) return null;
    mediaUrl = picked.url;
    mediaMime = picked.mime;
    width = positive(picked.width) ?? width;
    height = positive(picked.height) ?? height;
  } else if (kind === "image" && (!BROWSER_IMAGES.has(mime) || (info.size ?? 0) > MAX_ORIGINAL_IMAGE_BYTES)) {
    // TIFF / XCF / huge originals: fetch the rendered thumbnail instead.
    if (!info.thumburl) return null;
    mediaUrl = absolute(info.thumburl);
    mediaMime = null;
    if (width && height && width > RENDER_WIDTH) {
      height = Math.round((height * RENDER_WIDTH) / width);
      width = RENDER_WIDTH;
    }
  }

  const license = licenseFromShortName(ext(info, "LicenseShortName"), ext(info, "LicenseUrl"));
  const notes = licenseNotes(license);
  const nonFree = /^true$/i.test(ext(info, "NonFree") ?? "");
  if (nonFree) {
    license.commercialOk = false;
    license.modificationOk = false;
    notes.push("Commons marks this file non-free (fair use only).");
  }
  if (/^true$/i.test(ext(info, "AttributionRequired") ?? "")) license.attributionRequired = true;
  const restrictions = (ext(info, "Restrictions") ?? "").toLowerCase();
  if (restrictions.includes("trademark")) notes.push("Trademarked: the license covers copyright only; use the mark to identify the brand, never to imply endorsement.");
  if (restrictions.includes("personality")) notes.push("Shows an identifiable person: personality rights can restrict commercial or endorsement use.");

  const fileName = page.title.replace(/^File:/i, "");
  const title = htmlToText(ext(info, "ObjectName")) ?? fileName.replace(/\.[A-Za-z0-9]+$/, "");
  const artistHtml = ext(info, "Artist");
  const author = truncate(htmlToText(artistHtml) ?? htmlToText(ext(info, "Credit")), 160);
  const pageUrl = info.descriptionurl ?? `${PAGE_BASE}${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
  return {
    id: commonsId(page.title),
    source: "commons",
    kind,
    title,
    pageUrl,
    mediaUrl,
    previewUrl: info.thumburl ? absolute(info.thumburl).replace(`/${RENDER_WIDTH}px-`, `/${PREVIEW_WIDTH}px-`) : null,
    mime: mediaMime,
    width,
    height,
    durationSec: positive(info.duration) === null ? null : Math.round(info.duration! * 10) / 10,
    author,
    authorUrl: firstHref(artistHtml),
    ...license,
    attribution: buildAttribution({ title, author, license: license.license, licenseUrl: license.licenseUrl, sourceLabel: LABEL, pageUrl }),
    notes,
    extra: { originalMime: mime || null, fileBytes: info.size ?? null },
  };
}

function infoParams(kind: StockKind | null): Record<string, string> {
  // `videoinfo` (TimedMediaHandler) is imageinfo plus transcode derivatives.
  if (kind === "video" || kind === null) {
    return { prop: "videoinfo", viprop: "url|size|mime|extmetadata|derivatives", viurlwidth: String(RENDER_WIDTH), viextmetadatafilter: EXTMETADATA };
  }
  return { prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: String(RENDER_WIDTH), iiextmetadatafilter: EXTMETADATA };
}

async function search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]> {
  const query = request.kind === "logo" && !/\blogo\b/i.test(request.query) ? `${request.query} logo` : request.query;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    uselang: "en",
    generator: "search",
    gsrsearch: `${query} filetype:${FILETYPE[request.kind]}`,
    gsrnamespace: "6",
    gsrlimit: String(Math.min(50, Math.max(1, request.limit * 3))),
    ...infoParams(request.kind),
  });
  const body = await stockGetJson<CommonsResponse>(LABEL, `${API_URL}?${params}`, fetchImpl, { signal: request.signal });
  // CirrusSearch also matches description and category text loosely
  // ("supercomputer data center" returns aurora photos), so re-rank by where
  // the query terms occur and drop pages that match only part of the query
  // outside their title.
  const terms = commonsQueryTerms(request.query);
  return [...(body.query?.pages ?? [])]
    .map((page) => ({ page, relevance: commonsRelevance(page, terms) }))
    .filter((x) => x.relevance.keep)
    .sort((a, b) => b.relevance.score - a.relevance.score || (a.page.index ?? 0) - (b.page.index ?? 0))
    .map((x) => commonsCandidate(x.page, request.kind))
    .filter((c): c is StockCandidate => c !== null);
}

/** The words of a query that relevance is judged on (no stop words, no "logo"). */
export function commonsQueryTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP_WORDS.has(t)))];
}

function hasTerm(text: string, term: string): boolean {
  // Word-start match: "center" matches "centers", "data" does not match "update".
  return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text);
}

/**
 * Where the query terms occur in a result: 3 per term in the file title or
 * object name, 1 per term only in the description or categories. A page is
 * kept when its title holds at least one term, or the other text holds all.
 */
export function commonsRelevance(page: CommonsPage, terms: string[]): { score: number; keep: boolean } {
  if (terms.length === 0) return { score: 0, keep: true };
  const info = page.videoinfo?.[0] ?? page.imageinfo?.[0];
  const titleText = `${page.title ?? ""} ${htmlToText(info ? ext(info, "ObjectName") : null) ?? ""}`.toLowerCase().replace(/_/g, " ");
  const otherText = info ? `${htmlToText(ext(info, "ImageDescription")) ?? ""} ${ext(info, "Categories") ?? ""}`.toLowerCase().replace(/[_|]/g, " ") : "";
  let titleHits = 0;
  let otherHits = 0;
  for (const term of terms) {
    if (hasTerm(titleText, term)) titleHits += 1;
    else if (hasTerm(otherText, term)) otherHits += 1;
  }
  return { score: titleHits * 3 + otherHits, keep: titleHits > 0 || otherHits === terms.length };
}

async function lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate> {
  const title = parseCommonsId(id);
  if (!title) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not a Commons id (commons:File:<name>.<ext>)`);
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", uselang: "en", titles: title, ...infoParams(null) });
  const body = await stockGetJson<CommonsResponse>(LABEL, `${API_URL}?${params}`, fetchImpl);
  const page = body.query?.pages?.[0];
  if (!page || page.missing) throw new StockSourceError(LABEL, 404, `${LABEL}: ${title} was not found`);
  const candidate = commonsCandidate(page, null);
  if (!candidate) throw new StockSourceError(LABEL, 0, `${LABEL}: ${title} is not a usable image, video or audio file`);
  return candidate;
}

export const commonsConnector: StockConnector = {
  id: "commons",
  label: LABEL,
  kinds: ["image", "video", "audio", "logo"],
  unavailableNote: () => null,
  search,
  lookup,
};

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Absolute, without the `utm_*` tracking parameters the API appends to file URLs. */
function absolute(url: string): string {
  const full = url.startsWith("//") ? `https:${url}` : url;
  try {
    const parsed = new URL(full);
    for (const key of [...parsed.searchParams.keys()]) if (key.startsWith("utm_")) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return full;
  }
}

function truncate(text: string | null, max: number): string | null {
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}
