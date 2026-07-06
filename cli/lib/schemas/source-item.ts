// Normalized ingestion item (#500) — the `source-item[]` port payload every
// D-category ingestion node emits (docs/architecture/farm-node-graph.md,
// "D. Ingestion / connector nodes"). Downstream nodes are source-agnostic:
// a workspace can swap an apify actor for an RSS feed without touching the
// graph, because every backend normalizes to this shape at the node boundary.
//
// One normalizer per backend lives here next to the schema (firecrawl /
// apify / rss). Normalizers are PURE (raw backend payload in → SourceItem[]
// out, `now` injectable for determinism) — the connectors own the HTTP, the
// executors own the wiring, this module owns the shape.

import { z } from "zod";

export const SOURCE_BACKENDS = ["firecrawl", "apify", "rss"] as const;
export type SourceBackend = (typeof SOURCE_BACKENDS)[number];

/** Engagement signals — whatever the backend exposes; all optional. */
export const EngagementSchema = z.object({
  views: z.number().optional(),
  likes: z.number().optional(),
  shares: z.number().optional(),
  comments: z.number().optional(),
});
export type Engagement = z.infer<typeof EngagementSchema>;

export const SourceItemSchema = z.object({
  url: z.string(),
  title: z.string(),
  /** Body text / summary / markdown — whatever the backend gives; may be empty. */
  text: z.string().default(""),
  /** ISO-8601 timestamp — publish time when the backend exposes one, else ingest time. */
  ts: z.string(),
  /** Provenance: which backend produced it, and from which feed / query / actor. */
  source: z.object({
    backend: z.enum(SOURCE_BACKENDS),
    feed: z.string().optional(),
    query: z.string().optional(),
    actor: z.string().optional(),
  }),
  engagement: EngagementSchema.optional(),
});
export type SourceItem = z.infer<typeof SourceItemSchema>;

/** Parse an unknown value into SourceItem[] (throws ZodError when malformed). */
export function parseSourceItems(raw: unknown): SourceItem[] {
  return z.array(SourceItemSchema).parse(raw);
}

// ─── Shared field-picking helpers ────────────────────────────────────────────

function pickString(rec: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function pickNumber(rec: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

/** Best-effort ISO conversion; unparseable / absent values fall back to `fallback`. */
function toIso(v: unknown, fallback: string): string {
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

// ─── firecrawl normalizer ────────────────────────────────────────────────────

/**
 * Map a firecrawl payload → SourceItem[]. Accepts the three shapes the
 * connector returns: a document (scrape), a document array (crawl), or a
 * search-result array (`{url,title,description}` rows). Rows without a URL
 * are dropped — a source item you cannot point back at is useless downstream.
 */
export function normalizeFirecrawl(
  payload: unknown,
  prov: { query?: string; feed?: string } = {},
  now: string = new Date().toISOString(),
): SourceItem[] {
  const rows: unknown[] = Array.isArray(payload) ? payload : [payload];
  const items: SourceItem[] = [];
  for (const raw of rows) {
    const rec = asRecord(raw);
    const meta = asRecord(rec.metadata);
    const url = pickString(rec, ["url"]) ?? pickString(meta, ["sourceURL", "url"]);
    if (!url) continue;
    items.push({
      url,
      title: pickString(rec, ["title"]) ?? pickString(meta, ["title"]) ?? url,
      text: pickString(rec, ["description", "markdown"]) ?? pickString(meta, ["description"]) ?? "",
      ts: toIso(meta.publishedTime ?? rec.publishedTime ?? rec.date, now),
      source: { backend: "firecrawl", ...prov },
    });
  }
  return items;
}

// ─── apify normalizer ────────────────────────────────────────────────────────

/**
 * Map apify dataset items → SourceItem[]. Actor outputs are actor-specific,
 * so this picks across the common field spellings (tweet / TikTok / generic
 * scraper actors). Rows without any URL-ish field are dropped.
 */
export function normalizeApifyItems(
  items: unknown[],
  prov: { actor?: string; query?: string } = {},
  now: string = new Date().toISOString(),
): SourceItem[] {
  const out: SourceItem[] = [];
  for (const raw of items) {
    const rec = asRecord(raw);
    const url = pickString(rec, ["url", "link", "webVideoUrl", "postUrl", "tweetUrl", "videoUrl"]);
    if (!url) continue;
    const text = pickString(rec, ["text", "fullText", "caption", "description", "content"]) ?? "";
    const engagement: Engagement = {
      views: pickNumber(rec, ["viewCount", "playCount", "views"]),
      likes: pickNumber(rec, ["likeCount", "diggCount", "favoriteCount", "likes"]),
      shares: pickNumber(rec, ["shareCount", "retweetCount", "shares"]),
      comments: pickNumber(rec, ["commentCount", "commentsCount", "replyCount", "comments"]),
    };
    const hasEngagement = Object.values(engagement).some((v) => v !== undefined);
    out.push({
      url,
      title: pickString(rec, ["title", "name"]) ?? text.slice(0, 80) ?? url,
      text,
      ts: toIso(rec.createdAt ?? rec.timestamp ?? rec.publishedAt ?? rec.date, now),
      source: { backend: "apify", ...prov },
      ...(hasEngagement ? { engagement } : {}),
    });
  }
  return out;
}

// ─── rss normalizer ──────────────────────────────────────────────────────────

/** The parsed-feed item shape `cli/lib/ingestion/rss.ts → parseFeed()` produces. */
export interface FeedItem {
  title: string;
  link: string;
  /** ISO-8601 when the feed carried a parseable date. */
  ts?: string;
  text: string;
}

/** Map parsed RSS/Atom feed items → SourceItem[]. Items without a link are dropped. */
export function normalizeRss(
  items: FeedItem[],
  prov: { feed?: string } = {},
  now: string = new Date().toISOString(),
): SourceItem[] {
  return items
    .filter((i) => i.link.length > 0)
    .map((i) => ({
      url: i.link,
      title: i.title || i.link,
      text: i.text,
      ts: i.ts ?? now,
      source: { backend: "rss" as const, ...prov },
    }));
}
