// Internet Archive connector (#596): public domain and openly licensed film
// (b-roll, newsreels, Prelinger industrial films) through the keyless
// advancedsearch and metadata APIs.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO HIT `archive.org` HOSTS
// (AGENTS.md invariant #1, the same file-scoped discipline as firecrawl.ts).
// The agents-md invariants test allowlists exactly this file.
//
// Only `mediatype:movies` items whose `licenseurl` is public domain or a
// Creative Commons license that allows commercial use AND modification are
// ever returned, whatever `--license` says: items without a license URL are
// "all rights reserved" by default. The server query excludes NC / ND
// (wildcards must not contain "/", the search backend rejects them), and the
// parsed license filters again. Each kept item costs one metadata request to
// pick its MP4 derivative. HTTP is injectable (`fetchImpl`).

import { allowsCommercialEdit, buildAttribution, licenseFromUrl, licenseNotes } from "../stock/license.js";
import { StockSourceError, stockGetJson } from "../stock/http.js";
import type { FetchLike, StockCandidate, StockConnector, StockSearchRequest } from "../stock/types.js";

const LABEL = "Internet Archive";
const SEARCH_URL = "https://archive.org/advancedsearch.php";
const METADATA_BASE = "https://archive.org/metadata";
const DOWNLOAD_BASE = "https://archive.org/download";
const DETAILS_BASE = "https://archive.org/details";
const THUMB_BASE = "https://archive.org/services/img";
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
/** Larger MP4 files are passed over when a smaller one exists. */
const MAX_PICK_BYTES = 500 * 1024 * 1024;
const METADATA_CONCURRENCY = 4;

export type ArchiveDoc = {
  identifier?: string;
  title?: string | string[];
  creator?: string | string[];
  licenseurl?: string | string[];
  year?: string | number;
};

export type ArchiveFile = {
  name?: string;
  source?: string;
  format?: string;
  size?: string | number;
  length?: string | number;
  width?: string | number;
  height?: string | number;
};

type SearchResponse = { response?: { numFound?: number; docs?: ArchiveDoc[] } };
type FilesResponse = { result?: ArchiveFile[] };
type MetadataResponse = { metadata?: ArchiveDoc; files?: ArchiveFile[]; is_dark?: boolean };

export function parseArchiveId(id: string): string | null {
  const m = /^archive:(.+)$/.exec(id);
  return m && IDENTIFIER.test(m[1]!) ? m[1]! : null;
}

/** Lucene-safe user terms: special characters become spaces. */
export function archiveQuery(query: string): string {
  const terms = query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ").replace(/\s+/g, " ").trim();
  return `(${terms || "*"}) AND mediatype:(movies) AND (licenseurl:*publicdomain* OR licenseurl:*creativecommons.org*) AND NOT licenseurl:*nc* AND NOT licenseurl:*nd*`;
}

/** The MP4 to download: the largest at most 1080 lines and under the size cap, else the smallest. */
export function pickArchiveMp4(files: ArchiveFile[]): ArchiveFile | null {
  const mp4 = files.filter((f) => typeof f.name === "string" && /\.mp4$/i.test(f.name));
  if (mp4.length === 0) return null;
  const lines = (f: ArchiveFile) => {
    const w = num(f.width);
    const h = num(f.height);
    return w && h ? Math.min(w, h) : h ?? 0;
  };
  const size = (f: ArchiveFile) => num(f.size) ?? 0;
  const affordable = mp4.filter((f) => size(f) <= MAX_PICK_BYTES);
  const pool = affordable.length > 0 ? affordable : mp4;
  const fitting = pool.filter((f) => lines(f) > 0 && lines(f) <= 1080);
  if (fitting.length > 0) return fitting.sort((a, b) => lines(b) - lines(a) || size(b) - size(a))[0]!;
  return pool.sort((a, b) => (lines(a) || Number.MAX_SAFE_INTEGER) - (lines(b) || Number.MAX_SAFE_INTEGER) || size(a) - size(b))[0]!;
}

/** One licensed archive item with its picked MP4 as a stock candidate; null when unusable. */
export function archiveCandidate(doc: ArchiveDoc, files: ArchiveFile[]): StockCandidate | null {
  const identifier = doc.identifier;
  if (!identifier || !IDENTIFIER.test(identifier)) return null;
  const license = licenseFromUrl(first(doc.licenseurl));
  if (!license || !allowsCommercialEdit(license)) return null;
  const file = pickArchiveMp4(files);
  if (!file?.name) return null;
  const title = first(doc.title)?.trim() || identifier;
  const author = first(doc.creator)?.trim() || null;
  const pageUrl = `${DETAILS_BASE}/${identifier}`;
  return {
    id: `archive:${identifier}`,
    source: "archive",
    kind: "video",
    title,
    pageUrl,
    mediaUrl: `${DOWNLOAD_BASE}/${identifier}/${file.name.split("/").map(encodeURIComponent).join("/")}`,
    previewUrl: `${THUMB_BASE}/${identifier}`,
    mime: "video/mp4",
    width: num(file.width),
    height: num(file.height),
    durationSec: duration(file.length),
    author,
    authorUrl: null,
    ...license,
    attribution: buildAttribution({ title, author, license: license.license, licenseUrl: license.licenseUrl, sourceLabel: LABEL, pageUrl }),
    notes: licenseNotes(license),
    extra: { file: file.name, fileBytes: num(file.size), year: doc.year === undefined ? null : String(doc.year) },
  };
}

async function filesOf(identifier: string, fetchImpl: FetchLike, signal?: AbortSignal): Promise<ArchiveFile[]> {
  const body = await stockGetJson<FilesResponse>(LABEL, `${METADATA_BASE}/${identifier}/files`, fetchImpl, { signal });
  return Array.isArray(body.result) ? body.result : [];
}

async function search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]> {
  const params = new URLSearchParams({ q: archiveQuery(request.query), rows: String(Math.min(100, Math.max(5, request.limit * 3))), output: "json" });
  for (const field of ["identifier", "title", "creator", "licenseurl", "year"]) params.append("fl[]", field);
  const body = await stockGetJson<SearchResponse>(LABEL, `${SEARCH_URL}?${params}`, fetchImpl, { signal: request.signal });
  const licensed = (body.response?.docs ?? []).filter((doc) => {
    const license = licenseFromUrl(first(doc.licenseurl));
    return Boolean(doc.identifier && IDENTIFIER.test(doc.identifier) && license && allowsCommercialEdit(license));
  });
  // One metadata request per kept item; stop once enough candidates resolved.
  const out: StockCandidate[] = [];
  // No new metadata requests once the search deadline has aborted.
  for (let i = 0; i < licensed.length && out.length < request.limit && !request.signal?.aborted; i += METADATA_CONCURRENCY) {
    const batch = licensed.slice(i, i + METADATA_CONCURRENCY);
    const resolved = await Promise.all(batch.map(async (doc) => {
      try {
        return archiveCandidate(doc, await filesOf(doc.identifier!, fetchImpl, request.signal));
      } catch (error) {
        if (error instanceof StockSourceError && error.status === 429) throw error;
        return null;
      }
    }));
    for (const candidate of resolved) if (candidate && out.length < request.limit) out.push(candidate);
  }
  return out;
}

async function lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate> {
  const identifier = parseArchiveId(id);
  if (!identifier) throw new StockSourceError(LABEL, 0, `${LABEL}: '${id}' is not an archive id (archive:<identifier>)`);
  const body = await stockGetJson<MetadataResponse>(LABEL, `${METADATA_BASE}/${identifier}`, fetchImpl);
  if (!body.metadata || body.is_dark) throw new StockSourceError(LABEL, 404, `${LABEL}: ${identifier} was not found`);
  const doc = { ...body.metadata, identifier };
  const license = licenseFromUrl(first(doc.licenseurl));
  if (!license || !allowsCommercialEdit(license)) {
    throw new StockSourceError(LABEL, 0, `${LABEL}: ${identifier} has no public domain or commercial-use Creative Commons license (${first(doc.licenseurl) ?? "no licenseurl"})`);
  }
  const candidate = archiveCandidate(doc, body.files ?? []);
  if (!candidate) throw new StockSourceError(LABEL, 0, `${LABEL}: ${identifier} has no MP4 file`);
  return candidate;
}

export const archiveConnector: StockConnector = {
  id: "archive",
  label: LABEL,
  kinds: ["video"],
  unavailableNote: () => null,
  search,
  lookup,
};

function first(value: string | string[] | undefined | null): string | null {
  if (Array.isArray(value)) return value.find((v) => typeof v === "string" && v.trim()) ?? null;
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: string | number | undefined | null): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `123.4`, `01:02:03` or `02:03.5` as seconds. */
function duration(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text) * 10) / 10 || null;
  const parts = text.split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p))) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? Math.round(seconds * 10) / 10 : null;
}
