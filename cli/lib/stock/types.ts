// Shared shapes of the stock asset collector (#596).
//
// `ralphy stock search` asks free, licensed sources (one connector file per
// source under cli/lib/providers/) for candidates; `ralphy stock pull`
// re-resolves a candidate id at its source and registers the downloaded file
// as an Artifact revision. This module holds only the source-independent
// vocabulary: kinds, the candidate shape, the connector contract, and the one
// User-Agent every source request sends. No hosts live here (AGENTS.md
// invariant #1: each source host appears only in its own connector file).

import { VERSION } from "../version.js";

export const STOCK_KINDS = ["image", "video", "audio", "logo"] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const STOCK_SOURCES = ["openverse", "commons", "archive", "simple-icons", "pexels"] as const;
export type StockSourceId = (typeof STOCK_SOURCES)[number];

export const STOCK_ORIENTATIONS = ["vertical", "horizontal", "any"] as const;
export type StockOrientation = (typeof STOCK_ORIENTATIONS)[number];

/**
 * `commercial`: commercial use AND modification allowed (no NC, no ND).
 * `open`: the same without ShareAlike (public domain, CC0, CC BY and
 * equivalents), since BY-SA puts share-alike terms on a published video.
 * `any`: no filter; the flags still say what is allowed.
 */
export const STOCK_LICENSE_FILTERS = ["commercial", "open", "any"] as const;
export type StockLicenseFilter = (typeof STOCK_LICENSE_FILTERS)[number];

/** The one User-Agent every stock source request sends (Wikimedia requires a descriptive one). */
export const STOCK_USER_AGENT = `Ralphy/${VERSION} (+https://github.com/alecs5am/ralphy)`;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function isStockKind(value: unknown): value is StockKind {
  return typeof value === "string" && (STOCK_KINDS as readonly string[]).includes(value);
}

export function isStockSourceId(value: unknown): value is StockSourceId {
  return typeof value === "string" && (STOCK_SOURCES as readonly string[]).includes(value);
}

/** The license facts of one candidate, normalized across sources. */
export type StockLicense = {
  /** Short name: "CC BY 4.0", "CC0 1.0", "Public Domain Mark 1.0", "Pexels License", ... */
  license: string;
  licenseUrl: string | null;
  commercialOk: boolean;
  modificationOk: boolean;
  attributionRequired: boolean;
  /** CC BY-SA: an adaptation must carry the same license. */
  shareAlike: boolean;
};

/** One search result. `id` round-trips into `stock pull`. */
export type StockCandidate = StockLicense & {
  /** Stable, source-prefixed id: `commons:File:Foo.jpg`, `openverse:image:<uuid>`, ... */
  id: string;
  source: StockSourceId;
  kind: StockKind;
  title: string;
  /** The human page that documents the item and its license. */
  pageUrl: string;
  /** The file `stock pull` downloads. */
  mediaUrl: string;
  previewUrl: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  author: string | null;
  authorUrl: string | null;
  /** Ready to paste into a caption or description. */
  attribution: string;
  /** Caveats the license name does not carry (trademark, GFDL, ShareAlike). */
  notes: string[];
  /** Source-specific facts worth keeping (brand hex, audio category, upstream provider). */
  extra: Record<string, string | number | boolean | null>;
};

export type StockSearchRequest = {
  query: string;
  kind: StockKind;
  /** Upper bound of candidates this source should return. */
  limit: number;
  orientation: StockOrientation;
  /** The license filter; sources that can filter server-side ask for it, the search filters again. */
  license: StockLicenseFilter;
  /** Aborts every request of this search at the per-source deadline. */
  signal?: AbortSignal;
};

/** A downloaded file, still in memory. */
export type StockDownload = { bytes: Uint8Array; contentType: string | null };

/** The contract every stock source connector implements. */
export type StockConnector = {
  id: StockSourceId;
  /** Human name used in attributions and errors ("Wikimedia Commons"). */
  label: string;
  kinds: readonly StockKind[];
  /** The environment variable of the key this source needs, when it needs one. */
  requiredKey?: string;
  /** Null when usable; otherwise the one-line note printed when the source is skipped. */
  unavailableNote(): string | null;
  search(request: StockSearchRequest, fetchImpl: FetchLike): Promise<StockCandidate[]>;
  /** Re-resolve one candidate id (with its `<source>:` prefix) at the source. */
  lookup(id: string, fetchImpl: FetchLike): Promise<StockCandidate>;
  /** Fetch the media bytes; defaults to a plain download of `mediaUrl`. */
  download?(candidate: StockCandidate, fetchImpl: FetchLike, options: { maxBytes: number; timeoutMs: number }): Promise<StockDownload>;
};
