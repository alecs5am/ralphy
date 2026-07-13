// Postiz connector (#501) — the `publish` / `x-post` backend: pushes a Unit's
// distribution pack to Postiz Cloud or a self-hosted instance, which owns the
// per-platform OAuth + post queueing.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `POSTIZ_API_KEY` /
// `POSTIZ_API_URL` / legacy `POSTIZ_BASE_URL` (AGENTS.md invariant #1,
// extended for #501 the same way firecrawl.ts was for #500). The agents-md
// invariants test allowlists exactly this file. A workspace may instead keep
// the same values in its gitignored credentials.json.
//
// Deliberately NOT registered in the provider registry (registry.ts BUNDLED):
// publishing is not a generation Capability. This module follows the
// firecrawl.ts connector shape (own env vars, narrow tolerant types, throws —
// never process.exit()s) so commands surface structured errors.
//
// HTTP is injectable (`fetchImpl`) so tests run with zero network.

import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TerminalProviderError } from "./shared.js";
import { workspaceDir } from "../paths.js";

const LABEL = "Postiz";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type PostizConfig = { apiRoot: string; key: string };

type WorkspaceCredentials = {
  connectors?: {
    postiz?: { apiKey?: string; apiUrl?: string };
  };
};

function workspaceConfig(workspace?: string): { key?: string; apiUrl?: string } {
  if (!workspace) return {};
  try {
    const credentials = JSON.parse(
      readFileSync(path.join(workspaceDir(workspace), "credentials.json"), "utf8"),
    ) as WorkspaceCredentials;
    return {
      key: credentials.connectors?.postiz?.apiKey,
      apiUrl: credentials.connectors?.postiz?.apiUrl,
    };
  } catch {
    return {};
  }
}

function publicApiRoot(raw: string, legacy = false): string {
  const base = raw.replace(/\/+$/, "");
  if (/\/public\/v1$/u.test(base)) return base;
  return legacy ? `${base}/api/public/v1` : `${base}/public/v1`;
}

/** True when an env override or the requested workspace carries a Postiz key. */
export function postizAvailable(workspace?: string): boolean {
  return Boolean(process.env.POSTIZ_API_KEY || workspaceConfig(workspace).key);
}

/** Resolve env overrides or workspace config, defaulting to Postiz Cloud. */
function requireConfig(workspace?: string): PostizConfig {
  const stored = workspaceConfig(workspace);
  const key = process.env.POSTIZ_API_KEY || stored.key;
  const apiUrl = process.env.POSTIZ_API_URL || stored.apiUrl;
  const legacyBase = process.env.POSTIZ_BASE_URL;
  if (!key) {
    throw new TerminalProviderError(
      `${LABEL}: no API key configured. Save connectors.postiz.apiKey in the workspace credentials.json or set POSTIZ_API_KEY.`,
    );
  }
  if (legacyBase) return { apiRoot: publicApiRoot(legacyBase, true), key };
  return {
    apiRoot: publicApiRoot(apiUrl || "https://api.postiz.com"),
    key,
  };
}

/** `<api-root>/<endpoint>` — Postiz Cloud or a full self-hosted Public API root. */
function apiUrl(apiRoot: string, endpoint: string): string {
  return `${apiRoot}/${endpoint}`;
}

async function request<T>(
  endpoint: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  workspace?: string,
): Promise<T> {
  const { apiRoot, key } = requireConfig(workspace);
  const headers: Record<string, string> = {
    // Postiz public API auth: the raw key in Authorization (no Bearer prefix).
    Authorization: key,
    ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
  };
  const url = apiUrl(apiRoot, endpoint);
  const resp = await fetchImpl(url, { ...init, headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const message = `postiz ${init.method ?? "GET"} ${url} ${resp.status}: ${text.slice(0, 300)}`;
    if (resp.status >= 400 && resp.status < 500) throw new TerminalProviderError(message);
    throw new Error(message);
  }
  return (await resp.json()) as T;
}

// ─── typed (narrow, tolerant) request / response shapes ──────────────────────

/** One connected social account. `identifier` is the platform slug ("youtube", "tiktok", "instagram", "x", ...). */
export type PostizIntegration = {
  id: string;
  name?: string;
  identifier?: string;
  disabled?: boolean;
  [k: string]: unknown;
};

/** Result of a media upload — referenced from a post's `value[].image`. */
export type PostizUploadResult = { id?: string; path?: string; [k: string]: unknown };

/** One content chunk of a post (multiple entries = a thread on X). */
export type PostizPostValue = {
  content: string;
  id?: string;
  image?: Array<{ id?: string; path?: string }>;
  [k: string]: unknown;
};

/** One per-integration post inside a create-post request. */
export type PostizPostEntry = {
  integration: { id: string };
  value: PostizPostValue[];
  settings?: Record<string, unknown>;
  [k: string]: unknown;
};

export type PostizCreatePostRequest = {
  type: "schedule" | "now" | "draft";
  /** ISO datetime — required for type "schedule". */
  date?: string;
  shortLink?: boolean;
  tags?: Array<Record<string, unknown>>;
  posts: PostizPostEntry[];
  [k: string]: unknown;
};

/** Tolerant create-post response row (Postiz returns the created post ids). */
export type PostizCreatedPost = { id?: string; postId?: string; [k: string]: unknown };

/**
 * One row of `GET /analytics/post/{postId}` (#507). VERIFIED against the
 * public-API docs (docs.postiz.com/public-api/analytics/post): the endpoint
 * returns an array of per-metric series — `label` (metric name, e.g. "Likes"),
 * `data` (daily `{ total, date }` entries, `total` arrives as a string), and
 * `percentageChange` over the requested lookback window.
 */
export type PostizAnalyticsRow = {
  label?: string;
  data?: Array<{ total?: string | number; date?: string }>;
  percentageChange?: number;
  [k: string]: unknown;
};

// ─── public API ──────────────────────────────────────────────────────────────

/** GET /integrations → the connected social accounts. */
export async function postizIntegrations(
  fetchImpl: FetchLike = fetch,
  workspace?: string,
): Promise<PostizIntegration[]> {
  const r = await request<PostizIntegration[] | { integrations?: PostizIntegration[] }>(
    "integrations",
    { method: "GET" },
    fetchImpl,
    workspace,
  );
  return Array.isArray(r) ? r : r.integrations ?? [];
}

/** POST /upload (multipart) → an uploaded-media ref for `value[].image`. */
export async function postizUpload(
  filePath: string,
  fetchImpl: FetchLike = fetch,
  workspace?: string,
): Promise<PostizUploadResult> {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes]), path.basename(filePath));
  return request<PostizUploadResult>("upload", { method: "POST", body: form }, fetchImpl, workspace);
}

/** POST /posts → create/schedule posts (one request may carry N integrations). */
export async function postizCreatePost(
  req: PostizCreatePostRequest,
  fetchImpl: FetchLike = fetch,
  workspace?: string,
): Promise<PostizCreatedPost[]> {
  const r = await request<PostizCreatedPost[] | PostizCreatedPost>(
    "posts",
    { method: "POST", body: JSON.stringify(req) },
    fetchImpl,
    workspace,
  );
  return Array.isArray(r) ? r : [r];
}

// ─── per-post analytics passthrough (#507) ───────────────────────────────────

/**
 * `GET /analytics/post/{postId}?date=<days>` → the per-metric series for one
 * published post. `date` is the lookback window in days (7 / 30 / 90 per the
 * docs). Throws like every other call here — `postizMetrics` below is the
 * degrading wrapper the pull layer consumes.
 */
export async function postizPostAnalytics(
  postId: string,
  days = 7,
  fetchImpl: FetchLike = fetch,
  workspace?: string,
): Promise<PostizAnalyticsRow[]> {
  const r = await request<PostizAnalyticsRow[] | { data?: PostizAnalyticsRow[] }>(
    `analytics/post/${encodeURIComponent(postId)}?date=${days}`,
    { method: "GET" },
    fetchImpl,
    workspace,
  );
  return Array.isArray(r) ? r : r.data ?? [];
}

/** The metric subset Postiz's labels map onto (retention is YouTube-OAuth-only). */
export type PostizMappedMetrics = {
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  ctr?: number;
};

/** Case-insensitive label → snapshot-metric field. Unknown labels are dropped. */
const LABEL_FIELDS: Array<{ re: RegExp; field: keyof PostizMappedMetrics }> = [
  { re: /^(views|video views|plays|impressions)$/i, field: "views" },
  { re: /^(likes|reactions|favorites)$/i, field: "likes" },
  { re: /^(shares|reposts|retweets)$/i, field: "shares" },
  { re: /^(comments|replies)$/i, field: "comments" },
  { re: /^(ctr|click-through rate)$/i, field: "ctr" },
];

/**
 * Map the label/series rows into snapshot metrics. Each metric takes the LAST
 * data point's `total` (the newest cumulative value in the lookback window);
 * unparsable totals and unrecognized labels are skipped, never fatal.
 */
export function mapPostizAnalyticsRows(rows: PostizAnalyticsRow[]): PostizMappedMetrics {
  const out: PostizMappedMetrics = {};
  for (const row of rows) {
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const field = LABEL_FIELDS.find((m) => m.re.test(label))?.field;
    if (!field || out[field] !== undefined) continue;
    const last = row.data?.[row.data.length - 1];
    const n = Number(last?.total);
    if (Number.isFinite(n)) out[field] = n;
  }
  return out;
}

export type PostizMetricsResult =
  | { ok: true; metrics: PostizMappedMetrics; raw: PostizAnalyticsRow[] }
  | { ok: false; note: string };

/**
 * Degrading per-post metrics read: the documented endpoint exists on current
 * Postiz, but an older self-hosted instance may predate it (404) and a
 * provider may report nothing for a post. Any failure → `{ ok: false, note }`
 * so the pull layer records a skipped row instead of aborting the batch.
 * Missing config still throws upstream of this (callers check
 * `postizAvailable()` first).
 */
export async function postizMetrics(
  postId: string,
  days = 7,
  fetchImpl: FetchLike = fetch,
  workspace?: string,
): Promise<PostizMetricsResult> {
  try {
    const raw = await postizPostAnalytics(postId, days, fetchImpl, workspace);
    return { ok: true, metrics: mapPostizAnalyticsRows(raw), raw };
  } catch (e) {
    return { ok: false, note: `postiz analytics unavailable for post ${postId}: ${(e as Error).message}` };
  }
}
