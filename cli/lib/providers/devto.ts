// dev.to (Forem) article connector (#527) — the article-publish backend for
// the `devto` target. Pushes an article unit's markdown body + frontmatter to
// dev.to's write API.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `DEVTO_API_KEY` (AGENTS.md
// invariant #1, extended the same way postiz.ts was for #501). The agents-md
// invariants test allowlists exactly this file for the key. dev.to's host is
// fixed (dev.to) — unlike self-hosted Postiz — so the host also lives only here.
//
// VERIFIED API (2026-07-09): POST https://dev.to/api/articles, header
// `api-key: <key>`, JSON body { article: { title, body_markdown, published
// (bool, DEFAULT false = draft), canonical_url, tags[], description,
// main_image } } → 201 with { id, url, ... }.
//
// Mirrors postiz.ts's connector shape: own env var, narrow tolerant types,
// injectable fetch (`fetchImpl`) for zero-network tests, throws (never
// process.exit) so the orchestrator surfaces structured errors.

import { TerminalProviderError } from "./shared.js";
import { credentialConfigured, credentialValue } from "./credentials.js";

const LABEL = "dev.to";
const HOST = "https://dev.to";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** True iff DEVTO_API_KEY is configured. */
export function devtoAvailable(): boolean {
  return credentialConfigured("devto");
}

function requireKey(): string {
  const key = credentialValue("devto");
  if (!key) {
    throw new TerminalProviderError(
      `${LABEL}: DEVTO_API_KEY must be set — create one at dev.to → Settings → Extensions → DEV Community API Keys.`,
    );
  }
  return key;
}

/** The `article` payload dev.to's POST /articles expects (nested under `article`). */
export type DevtoArticleInput = {
  title: string;
  body_markdown: string;
  /** false (default) = draft; true = live. */
  published: boolean;
  /** Canonical URL — the syndication home the copy points at (GEO hygiene). */
  canonical_url?: string;
  tags?: string[];
  description?: string;
  main_image?: string;
};

/** Tolerant create-article response (dev.to returns id + url + more). */
export type DevtoArticleResult = { id?: number | string; url?: string; [k: string]: unknown };

/** POST /articles → create an article (draft or published). */
export async function devtoPublish(
  article: DevtoArticleInput,
  fetchImpl: FetchLike = fetch,
): Promise<DevtoArticleResult> {
  const url = `${HOST}/api/articles`;
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: { "api-key": requireKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ article }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const message = `${LABEL} POST ${url} ${resp.status}: ${text.slice(0, 300)}`;
    if (resp.status >= 400 && resp.status < 500) throw new TerminalProviderError(message);
    throw new Error(message);
  }
  return (await resp.json()) as DevtoArticleResult;
}
