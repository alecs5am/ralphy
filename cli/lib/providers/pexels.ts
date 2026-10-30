// Pexels connector (#596): stock photos and video under the Pexels License
// (commercial use allowed, attribution not required) through the Pexels API.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT `pexels.com` HOSTS
// (AGENTS.md invariant #1, the same file-scoped discipline as firecrawl.ts).
// `PEXELS_API_KEY` is read only through cli/lib/providers/credentials.ts (the
// `pexels` descriptor); the agents-md invariants test enforces both.
//
// Pexels needs a free key. Without one, `ralphy stock search` skips this
// source with a one-line note and never fails the whole search; `stock pull`
// of a `pexels:` id fails with E_ENV_KEY_MISSING. The photographer is recorded
// even though the license does not require credit. HTTP is injectable.

import { credentialConfigured, credentialValue } from "./credentials.js";
import { StockSourceError, stockGetJson } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockLicense, StockSearchRequest } from "../stock/types.js";

const LABEL = "Pexels";
export const PEXELS_ENV_VAR = "PEXELS_API_KEY";
const SIGNUP_URL = "https://www.pexels.com/api/";
const API_BASE = "https://api.pexels.com";
const LICENSE_URL = "https://www.pexels.com/license/";

const PEXELS_LICENSE: StockLicense = Object.freeze({
  license: "Pexels License",
  licenseUrl: LICENSE_URL,
  commercialOk: true,
  modificationOk: true,
  attributionRequired: false,
  shareAlike: false,
});

const LICENSE_NOTE = "Pexels License: free for commercial use and editing, credit appreciated but not required; do not sell unaltered copies or imply endorsement by people shown.";

export type PexelsPhoto = {
  id?: number;
  width?: number;
  height?: number;
  url?: string;
  alt?: string | null;
  photographer?: string | null;
  photographer_url?: string | null;
  src?: { original?: string; large2x?: string; large?: string; medium?: string; small?: string };
};

export type PexelsVideoFile = { id?: number; quality?: string | null; file_type?: string; width?: number | null; height?: number | null; link?: string };

export type PexelsVideo = {
  id?: number;
  width?: number;
  height?: number;
  duration?: number;
  url?: string;
  image?: string | null;
  user?: { name?: string | null; url?: string | null };
  video_files?: PexelsVideoFile[];
};

/** True iff the connector's key is present. */
export function pexelsAvailable(): boolean {
  return credentialConfigured("pexels");
}

export function pexelsMissingKeyNote(): string {
  return `pexels skipped: ${PEXELS_ENV_VAR} is not set (free key at ${SIGNUP_URL}; store it with \`ralphy provider auth set pexels --stdin\` or export it)`;
}

function authHeaders(): Record<string, string> {
  const key = credentialValue("pexels");
  if (!key) throw new StockSourceError(LABEL, 401, `${LABEL}: ${PEXELS_ENV_VAR} is not set. Get a free key at ${SIGNUP_URL}.`);
  return { Authorization: key };
}

export function parsePexelsId(id: string): { type: "photo" | "video"; id: string } | null {
  const m = /^pexels:(photo|video):(\d{1,15})$/.exec(id);
  return m ? { type: m[1] as "photo" | "video", id: m[2]! } : null;
}

/** A title from the page slug: `.../photo/stock-market-chart-1234/` -> "stock market chart". */
function titleFromPage(url: string | undefined, fallback: string): string {
  const m = /\/(?:photo|video)\/([a-z0-9-]+?)-\d+\/?$/i.exec(url ?? "");
  const words = m?.[1]?.replace(/-/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : fallback;
}

export function pexelsPhotoCandidate(photo: PexelsPhoto): StockCandidate | null {
  if (!photo.id || !photo.src?.original || !photo.url) return null;
  const title = photo.alt?.trim() || titleFromPage(photo.url, `Pexels photo ${photo.id}`);
  const author = photo.photographer?.trim() || null;
  return {
    id: `pexels:photo:${photo.id}`,
    source: "pexels",
    kind: "image",
    title,
    pageUrl: photo.url,
    mediaUrl: photo.src.original,
    previewUrl: photo.src.medium ?? photo.src.small ?? null,
    mime: null,
    width: photo.width ?? null,
    height: photo.height ?? null,
    durationSec: null,
    author,
    authorUrl: photo.photographer_url ?? null,
    ...PEXELS_LICENSE,
    attribution: author ? `Photo by ${author} on Pexels: ${photo.url}` : `Photo from Pexels: ${photo.url}`,
    notes: [LICENSE_NOTE],
    extra: {},
  };
}

/** The MP4 to download: the largest at most 1080 lines, else the smallest. */
export function pickPexelsFile(files: PexelsVideoFile[]): PexelsVideoFile | null {
  const mp4 = files.filter((f) => f.link && (f.file_type ?? "").toLowerCase() === "video/mp4");
  if (mp4.length === 0) return null;
  const lines = (f: PexelsVideoFile) => Math.min(f.width ?? 0, f.height ?? 0);
  const fitting = mp4.filter((f) => lines(f) > 0 && lines(f) <= 1080);
  if (fitting.length > 0) return fitting.sort((a, b) => lines(b) - lines(a))[0]!;
  return mp4.sort((a, b) => (lines(a) || Number.MAX_SAFE_INTEGER) - (lines(b) || Number.MAX_SAFE_INTEGER))[0]!;
}

export function pexelsVideoCandidate(video: PexelsVideo): StockCandidate | null {
  if (!video.id || !video.url) return null;
  const file = pickPexelsFile(video.video_files ?? []);
  if (!file?.link) return null;
  const title = titleFromPage(video.url, `Pexels video ${video.id}`);
  const author = video.user?.name?.trim() || null;
  return {
    id: `pexels:video:${video.id}`,
    source: "pexels",
    kind: "video",
    title,
    pageUrl: video.url,
    mediaUrl: file.link,
    previewUrl: video.image ?? null,
    mime: "video/mp4",
    width: file.width ?? video.width ?? null,
    height: file.height ?? video.height ?? null,
    durationSec: video.duration ?? null,
    author,
    authorUrl: video.user?.url ?? null,
    ...PEXELS_LICENSE,
    attribution: author ? `Video by ${author} on Pexels: ${video.url}` : `Video from Pexels: ${video.url}`,
    notes: [LICENSE_NOTE],
    extra: { quality: file.quality ?? null },
  };
}

async function search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]> {
  const params = new URLSearchParams({ query: request.query, per_page: String(Math.min(80, Math.max(1, request.limit * 2))) });
  if (request.orientation === "vertical") params.set("orientation", "portrait");
  if (request.orientation === "horizontal") params.set("orientation", "landscape");
  if (request.kind === "video") {
    const body = await stockGetJson<{ videos?: PexelsVideo[] }>(LABEL, `${API_BASE}/videos/search?${params}`, fetchImpl, { headers: authHeaders(), signal: request.signal });
    return (body.videos ?? []).map(pexelsVideoCandidate).filter((c): c is StockCandidate => c !== null);
  }
  const body = await stockGetJson<{ photos?: PexelsPhoto[] }>(LABEL, `${API_BASE}/v1/search?${params}`, fetchImpl, { headers: authHeaders(), signal: request.signal });
  return (body.photos ?? []).map(pexelsPhotoCandidate).filter((c): c is StockCandidate => c !== null);
}

async function lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate> {
  const parsed = parsePexelsId(id);
  if (!parsed) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not a Pexels id (pexels:photo:<n> or pexels:video:<n>)`);
  const candidate = parsed.type === "photo"
    ? pexelsPhotoCandidate(await stockGetJson<PexelsPhoto>(LABEL, `${API_BASE}/v1/photos/${parsed.id}`, fetchImpl, { headers: authHeaders() }))
    : pexelsVideoCandidate(await stockGetJson<PexelsVideo>(LABEL, `${API_BASE}/videos/videos/${parsed.id}`, fetchImpl, { headers: authHeaders() }));
  if (!candidate) throw new StockSourceError(LABEL, 0, `${LABEL}: ${id} has no downloadable file`);
  return candidate;
}

export const pexelsConnector: StockConnector = {
  id: "pexels",
  label: LABEL,
  kinds: ["image", "video"],
  requiredKey: PEXELS_ENV_VAR,
  unavailableNote: () => (pexelsAvailable() ? null : pexelsMissingKeyNote()),
  search,
  lookup,
};
