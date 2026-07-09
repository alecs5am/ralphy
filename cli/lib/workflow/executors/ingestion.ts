// Ingestion node executors (#500): web-scrape (firecrawl) / actor (apify) /
// rss (native, keyless) / trend-watch (the composite that emits only the
// delta since the last tick) — plus the `dedup` control-flow executor, which
// lives here because it shares the workspace seen-store.
//
// All emit the normalized source-item[] port payload (cli/lib/schemas/
// source-item.ts). HTTP is injectable via ctx.fetchImpl (zero-network tests);
// provider keys stay inside their connector files (invariant #1) — this
// module only asks the connector whether it is available.
//
// The generic `http` node type (once deferred here — see the #500 notes) is
// now registered from its own guarded executor (http.ts, #520): allowed_hosts
// required, provider hosts banned, $ENV header refs, timeout + size caps.

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  normalizeFirecrawl,
  normalizeApifyItems,
  normalizeRss,
  parseSourceItems,
  type SourceItem,
} from "../../schemas/source-item.js";
import { parseFeed } from "../../ingestion/rss.js";
import {
  readCursor,
  advanceCursor,
  parseWindow,
  loadSeen,
  appendSeen,
  filterFresh,
} from "../../ingestion/store.js";
import {
  firecrawlAvailable,
  firecrawlScrape,
  firecrawlSearch,
  firecrawlCrawl,
  type FetchLike,
} from "../../providers/firecrawl.js";
import { apifyAvailable, apifyRunActor } from "../../providers/apify.js";
import { writeNodeArtifact } from "./llm.js";
import { NodeExecutionError } from "./types.js";
import type { ExecutorContext, NodeExecutor } from "./types.js";
import type { WorkflowNode } from "../../schemas/workflow.js";

const fetchOf = (ctx: ExecutorContext): FetchLike => (ctx.fetchImpl ?? fetch) as FetchLike;

/**
 * Stamp the node-level freshness default (#542) onto emitted items so the TTL
 * travels downstream to the publish-time guard. Node `params.freshness_ttl` /
 * `params.content_class` fill in ONLY where the item did not already carry its
 * own — the item value always wins (backend-supplied shelf life is authoritative).
 */
function applyFreshnessDefaults(node: WorkflowNode, items: SourceItem[]): SourceItem[] {
  const p = node.params as { freshness_ttl?: unknown; content_class?: unknown };
  const nodeTtl = typeof p.freshness_ttl === "string" ? p.freshness_ttl : undefined;
  const nodeClass = typeof p.content_class === "string" ? p.content_class : undefined;
  if (!nodeTtl && !nodeClass) return items;
  return items.map((i) => ({
    ...i,
    ...(i.freshness_ttl === undefined && nodeTtl !== undefined ? { freshness_ttl: nodeTtl } : {}),
    ...(i.content_class === undefined && nodeClass !== undefined ? { content_class: nodeClass } : {}),
  }));
}

function requireBackendKey(node: WorkflowNode, backend: "firecrawl" | "apify", detail: string): void {
  const available = backend === "firecrawl" ? firecrawlAvailable() : apifyAvailable();
  if (available) return;
  const envVar = backend === "firecrawl" ? "FIRECRAWL_API_KEY" : "APIFY_TOKEN";
  throw new NodeExecutionError(
    "provider-key-missing",
    `node "${node.id}" (${node.type}) ${detail} needs the ${backend} connector — set ${envVar} and re-run`,
  );
}

/**
 * Persist the emitted items as `<node-id>.json` (append-only, .vN versioned).
 * An empty delta writes NOTHING — an empty tick must be a no-op on disk.
 */
async function writeItemsArtifact(
  ctx: ExecutorContext,
  node: WorkflowNode,
  items: SourceItem[],
): Promise<string | undefined> {
  if (items.length === 0) return undefined;
  return writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(items, null, 2));
}

/** Read a feed source: http(s) URL via the fetch seam, else a local file path. */
async function readFeed(feed: string, ctx: ExecutorContext): Promise<string> {
  if (/^https?:\/\//.test(feed)) {
    const resp = await fetchOf(ctx)(feed);
    if (!resp.ok) throw new Error(`rss feed fetch ${feed} ${resp.status}`);
    return resp.text();
  }
  for (const candidate of [feed, path.join(ctx.workspaceDir, feed)]) {
    if (existsSync(candidate)) return fs.readFile(candidate, "utf8");
  }
  throw new NodeExecutionError(
    "feed-not-found",
    `rss feed "${feed}" is neither an http(s) URL nor an existing file (checked cwd-relative and workspace-relative)`,
  );
}

// ─── web-scrape (firecrawl) ──────────────────────────────────────────────────

type WebScrapeParams = {
  mode?: "scrape" | "crawl" | "search";
  urls?: string[];
  url?: string;
  query?: string;
  limit?: number;
};

export const webScrapeExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as WebScrapeParams;
  requireBackendKey(node, "firecrawl", "");
  const mode = p.mode ?? (p.query ? "search" : "scrape");
  const f = fetchOf(ctx);
  let items: SourceItem[];

  if (mode === "search") {
    if (!p.query) {
      throw new NodeExecutionError("params-invalid", `web-scrape node "${node.id}" mode "search" requires params.query`);
    }
    items = normalizeFirecrawl(await firecrawlSearch(p.query, { limit: p.limit }, f), { query: p.query });
  } else if (mode === "crawl") {
    const url = p.url ?? p.urls?.[0];
    if (!url) {
      throw new NodeExecutionError("params-invalid", `web-scrape node "${node.id}" mode "crawl" requires params.url`);
    }
    items = normalizeFirecrawl(await firecrawlCrawl(url, { limit: p.limit }, f), { feed: url });
  } else if (mode === "scrape") {
    const urls = p.urls ?? (p.url ? [p.url] : []);
    if (urls.length === 0) {
      throw new NodeExecutionError("params-invalid", `web-scrape node "${node.id}" mode "scrape" requires params.urls`);
    }
    const docs = [];
    for (const u of urls) docs.push(await firecrawlScrape(u, f));
    items = normalizeFirecrawl(docs, {});
  } else {
    throw new NodeExecutionError("params-invalid", `web-scrape node "${node.id}" has unknown mode "${p.mode}" (scrape | crawl | search)`);
  }

  items = applyFreshnessDefaults(node, items);
  const artifactPath = await writeItemsArtifact(ctx, node, items);
  return { output: items, artifactPath };
};

// ─── actor (apify) ───────────────────────────────────────────────────────────

type ActorParams = {
  actor_id?: string;
  input?: unknown;
  poll_interval_ms?: number;
  poll_max_attempts?: number;
};

export const actorExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as ActorParams;
  if (typeof p.actor_id !== "string" || p.actor_id.length === 0) {
    throw new NodeExecutionError("params-invalid", `actor node "${node.id}" requires params.actor_id`);
  }
  requireBackendKey(node, "apify", `(actor ${p.actor_id})`);
  const raw = await apifyRunActor({
    actorId: p.actor_id,
    input: p.input,
    pollIntervalMs: p.poll_interval_ms,
    pollMaxAttempts: p.poll_max_attempts,
    fetchImpl: ctx.fetchImpl as FetchLike | undefined,
  });
  const items = applyFreshnessDefaults(node, normalizeApifyItems(raw, { actor: p.actor_id }));
  const artifactPath = await writeItemsArtifact(ctx, node, items);
  return { output: items, artifactPath };
};

// ─── rss (native, keyless) ───────────────────────────────────────────────────

type RssParams = {
  feeds?: string[];
  /** Optional stateless ISO cutoff — only items strictly newer pass. The
   *  STATEFUL per-workspace cursor belongs to trend-watch. */
  since?: string;
};

export const rssExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as RssParams;
  if (!Array.isArray(p.feeds) || p.feeds.length === 0) {
    throw new NodeExecutionError("params-invalid", `rss node "${node.id}" requires params.feeds (URLs or local file paths)`);
  }
  const items: SourceItem[] = [];
  for (const feed of p.feeds) {
    items.push(...normalizeRss(parseFeed(await readFeed(feed, ctx)), { feed }));
  }
  const since = p.since;
  const output = applyFreshnessDefaults(node, since ? items.filter((i) => i.ts > since) : items);
  const artifactPath = await writeItemsArtifact(ctx, node, output);
  return { output, artifactPath };
};

// ─── trend-watch (composite delta) ───────────────────────────────────────────

type TrendTopic = {
  id?: string;
  /** firecrawl search query. */
  query?: string;
  /** rss feeds (URLs or local file paths). */
  feeds?: string[];
  /** apify actor run. */
  actor?: { id: string; input?: unknown };
};

type TrendWatchParams = {
  topics?: TrendTopic[];
  /** Cron string — STORED only; the #503 runner fires the tick. */
  schedule?: string;
  dedup_window?: string;
};

export const trendWatchExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as TrendWatchParams;
  if (!Array.isArray(p.topics) || p.topics.length === 0) {
    throw new NodeExecutionError("params-invalid", `trend-watch node "${node.id}" requires params.topics`);
  }
  // params.schedule is stored, not executed — the scheduler (#503) owns firing.
  const windowMs = parseWindow(p.dedup_window ?? "14d");
  const f = fetchOf(ctx);
  const cursor = readCursor(ctx.workspaceDir);
  const fresh: SourceItem[] = [];

  for (const topic of p.topics) {
    if (typeof topic.id !== "string" || topic.id.length === 0) {
      throw new NodeExecutionError("params-invalid", `trend-watch node "${node.id}": every topic needs an id`);
    }
    const collected: SourceItem[] = [];
    for (const feed of topic.feeds ?? []) {
      collected.push(...normalizeRss(parseFeed(await readFeed(feed, ctx)), { feed }));
    }
    if (topic.query) {
      requireBackendKey(node, "firecrawl", `(topic "${topic.id}" query)`);
      collected.push(...normalizeFirecrawl(await firecrawlSearch(topic.query, {}, f), { query: topic.query }));
    }
    if (topic.actor) {
      requireBackendKey(node, "apify", `(topic "${topic.id}" actor)`);
      collected.push(
        ...normalizeApifyItems(
          await apifyRunActor({ actorId: topic.actor.id, input: topic.actor.input, fetchImpl: ctx.fetchImpl as FetchLike | undefined }),
          { actor: topic.actor.id },
        ),
      );
    }

    const since = cursor[topic.id];
    // ponytail: reload the seen set per topic instead of tracking in-memory
    // additions — the files are tiny; index them if a workspace ever watches
    // hundreds of topics per tick.
    const seen = loadSeen(ctx.workspaceDir, windowMs);
    const delta = filterFresh(
      since ? collected.filter((i) => i.ts > since) : collected,
      seen,
    );
    if (delta.length > 0) {
      appendSeen(ctx.workspaceDir, delta);
      advanceCursor(ctx.workspaceDir, topic.id, delta.map((i) => i.ts).sort().at(-1)!);
      fresh.push(...delta);
    }
  }

  // Empty delta → emit [] and touch NOTHING (no artifact, no store writes).
  const stamped = applyFreshnessDefaults(node, fresh);
  const artifactPath = await writeItemsArtifact(ctx, node, stamped);
  return { output: stamped, artifactPath };
};

// ─── dedup (control-flow; shares the seen-store) ─────────────────────────────

export const dedupExecutor: NodeExecutor = async (node, ctx) => {
  const raw = ctx.inputs.items;
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  let items: SourceItem[];
  try {
    items = parseSourceItems(value ?? []);
  } catch (e) {
    throw new NodeExecutionError(
      "input-invalid",
      `dedup node "${node.id}" expects source-item[] on in-port "items": ${(e as Error).message}`,
    );
  }
  const p = node.params as { dedup_window?: string };
  const windowMs = p.dedup_window ? parseWindow(p.dedup_window) : undefined;
  const seen = loadSeen(ctx.workspaceDir, windowMs);
  const fresh = filterFresh(items, seen);
  appendSeen(ctx.workspaceDir, fresh);
  const artifactPath = await writeItemsArtifact(ctx, node, fresh);
  return { output: fresh, artifactPath };
};
