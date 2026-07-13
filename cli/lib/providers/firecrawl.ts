// Firecrawl connector (#500) — the web research backend for scrape, crawl,
// and search commands.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `FIRECRAWL_API_KEY` OR HIT
// `firecrawl.dev` HOSTS (AGENTS.md invariant #1, extended for #500 the same
// way fal.ts was for #402). The agents-md invariants test allowlists exactly
// this file; a FIRECRAWL_API_KEY read or firecrawl host anywhere else is a
// defect.
//
// Deliberately NOT registered in the provider registry (registry.ts BUNDLED):
// ingestion is not a generation Capability (text|image|video|voice|music|
// sfx|transcribe), and widening that union for a non-generation connector
// would ripple through resolveConnector / `ralphy provider list` for no
// benefit. This module follows the fal.ts connector shape (own envVar, typed
// request/response, no other hosts) and throws — never process.exit()s — so
// commands can surface a structured error.
//
// HTTP is injectable (`fetchImpl`) so tests run with zero network.

import { TerminalProviderError } from "./shared.js";

const LABEL = "Firecrawl";
const ENV_VAR = "FIRECRAWL_API_KEY";
const SIGNUP_URL = "https://www.firecrawl.dev";
const API_BASE = "https://api.firecrawl.dev/v2";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** True iff the connector's key is present. */
export function firecrawlAvailable(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

function requireKey(): void {
  if (!firecrawlAvailable()) {
    throw new TerminalProviderError(
      `${LABEL}: ${ENV_VAR} is not set. Get a key at ${SIGNUP_URL} and export it.`,
    );
  }
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY!}`,
    "Content-Type": "application/json",
  };
}

async function request<T>(url: string, init: RequestInit, fetchImpl: FetchLike): Promise<T> {
  requireKey();
  const resp = await fetchImpl(url, { ...init, headers: authHeaders() });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const message = `firecrawl ${init.method ?? "GET"} ${url} ${resp.status}: ${text.slice(0, 300)}`;
    if (resp.status >= 400 && resp.status < 500) throw new TerminalProviderError(message);
    throw new Error(message);
  }
  return (await resp.json()) as T;
}

// ─── typed responses ─────────────────────────────────────────────────────────

export type FirecrawlDocument = {
  markdown?: string;
  description?: string;
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
    url?: string;
    publishedTime?: string;
  };
};

export type FirecrawlSearchResult = { url?: string; title?: string; description?: string };

// ─── scrape / search / crawl ─────────────────────────────────────────────────

/** Scrape one URL → its document (markdown + metadata). */
export async function firecrawlScrape(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<FirecrawlDocument> {
  const r = await request<{ data?: FirecrawlDocument }>(
    `${API_BASE}/scrape`,
    { method: "POST", body: JSON.stringify({ url, formats: ["markdown"] }) },
    fetchImpl,
  );
  return r.data ?? {};
}

/** Web search → result rows ({url, title, description}). */
export async function firecrawlSearch(
  query: string,
  opts: { limit?: number } = {},
  fetchImpl: FetchLike = fetch,
): Promise<FirecrawlSearchResult[]> {
  const r = await request<{ data?: { web?: FirecrawlSearchResult[] } | FirecrawlSearchResult[] }>(
    `${API_BASE}/search`,
    { method: "POST", body: JSON.stringify({ query, limit: opts.limit ?? 10 }) },
    fetchImpl,
  );
  return Array.isArray(r.data) ? r.data : r.data?.web ?? [];
}

/** Crawl a site (async job: submit → poll → documents). */
export async function firecrawlCrawl(
  url: string,
  opts: { limit?: number; pollIntervalMs?: number; pollMaxAttempts?: number } = {},
  fetchImpl: FetchLike = fetch,
): Promise<FirecrawlDocument[]> {
  const submit = await request<{ id?: string; url?: string }>(
    `${API_BASE}/crawl`,
    { method: "POST", body: JSON.stringify({ url, limit: opts.limit ?? 10 }) },
    fetchImpl,
  );
  if (!submit.id) {
    throw new TerminalProviderError(
      `firecrawl crawl submit returned no job id. Raw: ${JSON.stringify(submit).slice(0, 200)}`,
    );
  }
  const statusUrl = submit.url ?? `${API_BASE}/crawl/${submit.id}`;
  const interval = opts.pollIntervalMs ?? 3_000;
  const max = opts.pollMaxAttempts ?? 100;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    const st = await request<{ status?: string; data?: FirecrawlDocument[] }>(
      statusUrl,
      { method: "GET" },
      fetchImpl,
    );
    if (st.status === "completed") return st.data ?? [];
    if (st.status === "failed" || st.status === "cancelled") {
      throw new TerminalProviderError(`firecrawl crawl ${st.status} for ${url}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`firecrawl crawl did not complete after ${max} polls (${interval}ms each)`);
}
