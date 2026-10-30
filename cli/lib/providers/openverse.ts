// Openverse connector (#596): CC-licensed and public domain images and audio
// (audio aggregates Freesound, Jamendo, ccMixter, Wikimedia) through the
// keyless Openverse API v1.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT `openverse.org` HOSTS
// (AGENTS.md invariant #1, the same file-scoped discipline as firecrawl.ts).
// The agents-md invariants test allowlists exactly this file.
//
// Not registered in the provider registry: stock search is not a generation
// Capability. Anonymous requests are rate limited (HTTP 429 maps to a clear
// StockSourceError with Retry-After); the anonymous page size cap is 20.
// HTTP is injectable (`fetchImpl`) so tests run with zero network.

import { buildAttribution, ccLicense, licenseNotes } from "../stock/license.js";
import { StockSourceError, stockGetJson } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockSearchRequest } from "../stock/types.js";

const LABEL = "Openverse";
const API_BASE = "https://api.openverse.org/v1";
const SITE_BASE = "https://openverse.org";
/** Openverse caps anonymous `page_size` at 20. */
const ANONYMOUS_PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MediaType = "image" | "audio";

export type OpenverseItem = {
  id?: string;
  title?: string | null;
  foreign_landing_url?: string | null;
  url?: string | null;
  creator?: string | null;
  creator_url?: string | null;
  license?: string | null;
  license_version?: string | null;
  license_url?: string | null;
  provider?: string | null;
  source?: string | null;
  category?: string | null;
  filetype?: string | null;
  width?: number | null;
  height?: number | null;
  /** Audio only, milliseconds. */
  duration?: number | null;
  thumbnail?: string | null;
  mature?: boolean | null;
};

type OpenverseSearchResponse = { result_count?: number; results?: OpenverseItem[] };

const ENDPOINT: Record<MediaType, string> = { image: "images", audio: "audio" };

const MIME_BY_FILETYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

/** Parse `openverse:image:<uuid>`, `openverse:audio:<uuid>`, or the short `openverse:<uuid>`. */
export function parseOpenverseId(id: string): { mediaType: MediaType | null; uuid: string } | null {
  const m = /^openverse:(?:(image|audio):)?([^:]+)$/.exec(id);
  if (!m || !UUID.test(m[2]!)) return null;
  return { mediaType: (m[1] as MediaType | undefined) ?? null, uuid: m[2]!.toLowerCase() };
}

/** One Openverse result as a stock candidate; null when it has no media URL. */
export function openverseCandidate(item: OpenverseItem, mediaType: MediaType): StockCandidate | null {
  if (!item.id || !UUID.test(item.id) || !item.url) return null;
  const license = ccLicense(item.license ?? "", item.license_version ?? null, item.license_url ?? null);
  const title = item.title?.trim() || "Untitled";
  const pageUrl = item.foreign_landing_url?.trim() || `${SITE_BASE}/${mediaType}/${item.id}`;
  const author = item.creator?.trim() || null;
  const upstream = providerName(item.provider ?? item.source ?? null);
  const filetype = (item.filetype ?? "").toLowerCase();
  return {
    id: `openverse:${mediaType}:${item.id.toLowerCase()}`,
    source: "openverse",
    kind: mediaType,
    title,
    pageUrl,
    mediaUrl: item.url,
    previewUrl: item.thumbnail ?? null,
    mime: MIME_BY_FILETYPE[filetype] ?? null,
    width: positive(item.width),
    height: positive(item.height),
    durationSec: positive(item.duration) === null ? null : Math.round(item.duration! / 100) / 10,
    author,
    authorUrl: item.creator_url?.trim() || null,
    ...license,
    attribution: buildAttribution({
      title,
      author,
      license: license.license,
      licenseUrl: license.licenseUrl,
      sourceLabel: upstream ? `${upstream} via Openverse` : "Openverse",
      pageUrl,
    }),
    notes: licenseNotes(license),
    extra: {
      upstream: item.provider ?? item.source ?? null,
      category: item.category ?? null,
      openversePage: `${SITE_BASE}/${mediaType}/${item.id.toLowerCase()}`,
    },
  };
}

async function search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]> {
  const mediaType: MediaType = request.kind === "audio" ? "audio" : "image";
  const params = new URLSearchParams({
    q: request.query,
    page_size: String(Math.min(ANONYMOUS_PAGE_SIZE, Math.max(1, request.limit * 2))),
    mature: "false",
  });
  if (request.license === "open") params.set("license", "by,cc0,pdm");
  else if (request.license === "commercial") params.set("license_type", "commercial,modification");
  if (mediaType === "image" && request.orientation === "vertical") params.set("aspect_ratio", "tall");
  if (mediaType === "image" && request.orientation === "horizontal") params.set("aspect_ratio", "wide");
  const body = await stockGetJson<OpenverseSearchResponse>(LABEL, `${API_BASE}/${ENDPOINT[mediaType]}/?${params}`, fetchImpl, { signal: request.signal });
  return (body.results ?? [])
    .filter((item) => item.mature !== true)
    .map((item) => openverseCandidate(item, mediaType))
    .filter((c): c is StockCandidate => c !== null);
}

async function lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate> {
  const parsed = parseOpenverseId(id);
  if (!parsed) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not an Openverse id (openverse:image:<uuid> or openverse:audio:<uuid>)`);
  const types: MediaType[] = parsed.mediaType ? [parsed.mediaType] : ["image", "audio"];
  let last: unknown = null;
  for (const mediaType of types) {
    try {
      const item = await stockGetJson<OpenverseItem>(LABEL, `${API_BASE}/${ENDPOINT[mediaType]}/${parsed.uuid}/`, fetchImpl);
      const candidate = openverseCandidate(item, mediaType);
      if (candidate) return candidate;
      throw new StockSourceError(LABEL, 0, `${LABEL}: ${id} has no media URL`);
    } catch (error) {
      last = error;
      if (!(error instanceof StockSourceError) || error.status !== 404) throw error;
    }
  }
  throw last instanceof StockSourceError ? last : new StockSourceError(LABEL, 404, `${LABEL}: ${id} was not found`);
}

export const openverseConnector: StockConnector = {
  id: "openverse",
  label: LABEL,
  kinds: ["image", "audio"],
  unavailableNote: () => null,
  search,
  lookup,
};

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

const PROVIDER_NAMES: Record<string, string> = {
  flickr: "Flickr",
  wikimedia: "Wikimedia Commons",
  wikimedia_audio: "Wikimedia Commons",
  freesound: "Freesound",
  jamendo: "Jamendo",
  ccmixter: "ccMixter",
  smithsonian: "Smithsonian",
  stocksnap: "StockSnap",
  rawpixel: "rawpixel",
  nappy: "nappy",
};

function providerName(provider: string | null): string | null {
  if (!provider) return null;
  return PROVIDER_NAMES[provider] ?? provider.replace(/_/g, " ");
}
