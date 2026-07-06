// Postiz connector (#501) — the `publish` / `x-post` backend: pushes a Unit's
// distribution pack to a self-hosted Postiz instance (open-source social
// scheduler) which owns the per-platform OAuth + post queueing.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `POSTIZ_API_KEY` /
// `POSTIZ_BASE_URL` (AGENTS.md invariant #1, extended for #501 the same way
// firecrawl.ts was for #500). The agents-md invariants test allowlists exactly
// this file. NOTE on the host guard: unlike fal/firecrawl/apify there is NO
// fixed-host regex to scan for — Postiz is self-hosted (D-05,
// docs/architecture/farm-node-graph.md), the base URL is user-supplied config,
// so the env-var allowlist is the enforceable half of the invariant.
//
// Deliberately NOT registered in the provider registry (registry.ts BUNDLED):
// publishing is not a generation Capability. This module follows the
// firecrawl.ts connector shape (own env vars, narrow tolerant types, throws —
// never process.exit()s) so the command / executor surface structured errors.
//
// HTTP is injectable (`fetchImpl`) so tests run with zero network.

import fs from "node:fs/promises";
import path from "node:path";
import { TerminalProviderError } from "./shared.js";

const LABEL = "Postiz";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** True iff BOTH the API key and the self-hosted base URL are configured. */
export function postizAvailable(): boolean {
  return Boolean(process.env.POSTIZ_API_KEY) && Boolean(process.env.POSTIZ_BASE_URL);
}

/**
 * Resolve config or throw with a clear message. The base URL is REQUIRED
 * (not defaulted): self-hosted Postiz has no canonical SaaS host, so there is
 * nothing sane to fall back to.
 */
function requireConfig(): { base: string; key: string } {
  const key = process.env.POSTIZ_API_KEY;
  const rawBase = process.env.POSTIZ_BASE_URL;
  if (!key || !rawBase) {
    throw new TerminalProviderError(
      `${LABEL}: POSTIZ_API_KEY and POSTIZ_BASE_URL must both be set. Postiz is self-hosted (no canonical SaaS host) — export POSTIZ_BASE_URL pointing at your instance (external, or the optional docker-compose bundle per D-05/#506) and POSTIZ_API_KEY from its settings page.`,
    );
  }
  return { base: rawBase.replace(/\/+$/, ""), key };
}

/** `<base>/api/public/v1/<endpoint>` — the Postiz public API surface. */
function apiUrl(base: string, endpoint: string): string {
  return `${base}/api/public/v1/${endpoint}`;
}

async function request<T>(endpoint: string, init: RequestInit, fetchImpl: FetchLike): Promise<T> {
  const { base, key } = requireConfig();
  const headers: Record<string, string> = {
    // Postiz public API auth: the raw key in Authorization (no Bearer prefix).
    Authorization: key,
    ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
  };
  const url = apiUrl(base, endpoint);
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
  posts: PostizPostEntry[];
  [k: string]: unknown;
};

/** Tolerant create-post response row (Postiz returns the created post ids). */
export type PostizCreatedPost = { id?: string; postId?: string; [k: string]: unknown };

// ─── public API ──────────────────────────────────────────────────────────────

/** GET /integrations → the connected social accounts. */
export async function postizIntegrations(fetchImpl: FetchLike = fetch): Promise<PostizIntegration[]> {
  const r = await request<PostizIntegration[] | { integrations?: PostizIntegration[] }>(
    "integrations",
    { method: "GET" },
    fetchImpl,
  );
  return Array.isArray(r) ? r : r.integrations ?? [];
}

/** POST /upload (multipart) → an uploaded-media ref for `value[].image`. */
export async function postizUpload(
  filePath: string,
  fetchImpl: FetchLike = fetch,
): Promise<PostizUploadResult> {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes]), path.basename(filePath));
  return request<PostizUploadResult>("upload", { method: "POST", body: form }, fetchImpl);
}

/** POST /posts → create/schedule posts (one request may carry N integrations). */
export async function postizCreatePost(
  req: PostizCreatePostRequest,
  fetchImpl: FetchLike = fetch,
): Promise<PostizCreatedPost[]> {
  const r = await request<PostizCreatedPost[] | PostizCreatedPost>(
    "posts",
    { method: "POST", body: JSON.stringify(req) },
    fetchImpl,
  );
  return Array.isArray(r) ? r : [r];
}
