// Minimal RSS 2.0 + Atom feed parser (#500) — the keyless `rss` ingestion
// backend. Dependency-free by design: Bun ships no XML parser and the repo
// carries no XML dependency, so this is a targeted extractor for the two feed
// dialects the node supports, NOT a general XML parser.
// ponytail: regex block extraction with a known ceiling (no namespaces, no
// nested <item> elements); add a real XML dependency if a feed in the wild
// breaks it.

import type { FeedItem } from "../schemas/source-item.js";

/** Strip CDATA wrappers and decode the standard + numeric XML entities. */
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Text content of the first `<tag>…</tag>` in a block, decoded. */
function tagText(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decode(m[1]) : undefined;
}

/** Atom `<link href="…">` — prefer rel="alternate", else the first link. */
function atomLink(block: string): string | undefined {
  const links = [...block.matchAll(/<link\b[^>]*\/?>(?:<\/link>)?/gi)].map((m) => m[0]);
  const pick = links.find((l) => /rel=["']alternate["']/i.test(l)) ?? links[0];
  const href = pick?.match(/href=["']([^"']+)["']/i);
  return href ? decode(href[1]) : undefined;
}

function isoOrUndefined(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Parse an RSS 2.0 or Atom feed into FeedItem[] (title / link / ts / text).
 * Dialect is detected from the root element; items lacking both a title and
 * a link are skipped.
 */
export function parseFeed(xml: string): FeedItem[] {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blockTag = isAtom ? "entry" : "item";
  const blocks = [
    ...xml.matchAll(new RegExp(`<${blockTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${blockTag}>`, "gi")),
  ].map((m) => m[1]);

  const items: FeedItem[] = [];
  for (const b of blocks) {
    const title = tagText(b, "title") ?? "";
    const link = isAtom
      ? atomLink(b) ?? tagText(b, "id") ?? ""
      : tagText(b, "link") ?? tagText(b, "guid") ?? "";
    if (!title && !link) continue;
    items.push({
      title,
      link,
      ts: isoOrUndefined(
        isAtom ? tagText(b, "published") ?? tagText(b, "updated") : tagText(b, "pubDate"),
      ),
      text: (isAtom ? tagText(b, "summary") ?? tagText(b, "content") : tagText(b, "description")) ?? "",
    });
  }
  return items;
}
