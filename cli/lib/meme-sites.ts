// Client for the greenscreenmemes.com / memesoundeffects.com sister sites —
// green-screen meme overlays and meme sound effects for compositions.
//
// Both sites run WordPress with a wide-open REST API (`/wp-json/wp/v2/`), and
// serve media as plain hotlinkable files from `media.<site>` (Cloudflare, no
// referer/auth gating; verified 2026-07-18). Discovery is LIVE (`?search=` +
// the hand-curated trending pages) and media downloads happen on demand into
// `.ralphy/cache/memes/<source>/`.
//
// Deliberately NOT rehosted into the ralphy-assets pool: the catalogs are
// ~6.5k videos + ~12k sounds (tens of GB), grow daily, and the
// greenscreenmemes ToS forbids redistributing originals ("may not reupload
// the video in its original form"). Treat every clip/sound as
// fair-use-meme-reference — rights clearance stays with the user, same as the
// existing trend-music pool.
//
// No provider keys involved — CDN-style asset delivery, same class as
// assets-repo.ts.

import fs from "node:fs/promises";
import path from "node:path";
import { workspace } from "./paths.js";

export type MemeSource = "greenscreen" | "sounds";

export type MemeHit = {
  source: MemeSource;
  slug: string;
  title: string;
  pageUrl: string;
  /** Direct media file URL (mp4/mov for greenscreen, mp3 for sounds). Null when not resolvable without a pull. */
  mediaUrl: string | null;
  durationSec?: number;
  width?: number;
  height?: number;
  date?: string;
};

export const MEME_SITES: Record<MemeSource, { base: string; mediaHost: string; mediaKind: "videos" | "sfx" }> = {
  greenscreen: { base: "https://greenscreenmemes.com", mediaHost: "media.greenscreenmemes.com", mediaKind: "videos" },
  sounds: { base: "https://memesoundeffects.com", mediaHost: "media.memesoundeffects.com", mediaKind: "sfx" },
};

export function memeCacheDir() {
  return path.join(workspace(), "cache", "memes");
}

// ---------- pure parsers (unit-tested, no network) ----------

/** Minimal HTML-entity decode for WP `title.rendered` / anchors. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

/** All direct media-file URLs on the given media host, in document order, deduped. */
export function extractMediaUrls(html: string, mediaHost: string): string[] {
  const host = mediaHost.replace(/\./g, "\\.");
  const rx = new RegExp(`https://${host}/[^"'\\s<>\\\\]+\\.(?:mp3|mp4|mov|webm|wav|m4a)`, "gi");
  return [...new Set(html.match(rx) ?? [])];
}

/**
 * Some older sound posts host the file on Google Drive instead (a
 * `useyourdrive` shortcode + a direct `uc?id=...&export=download` button).
 */
export function extractDriveUrl(html: string): string | null {
  const m = html.match(/https:\/\/drive\.google\.com\/uc\?id=[\w-]+(?:&(?:#038;|amp;)?export=download)?/i);
  return m ? m[0].replace(/&(?:#038;|amp;)/g, "&") : null;
}

type WpMediaAttachment = {
  mime_type?: string;
  source_url?: string;
  media_details?: { length?: number; width?: number; height?: number };
};

/**
 * Pick the playable attachment of the wanted kind from a `media?parent=<id>`
 * response. For video, the HD file is the base filename; the Patreon-tier 4K
 * variant carries a `-1` suffix — prefer HD (1080p is plenty for an overlay).
 */
export function pickAttachment(attachments: WpMediaAttachment[], kind: "video" | "audio"): WpMediaAttachment | null {
  const matches = attachments.filter((a) => a.mime_type?.startsWith(`${kind}/`) && a.source_url);
  if (matches.length === 0) return null;
  return matches.find((v) => !/-1\.[a-z0-9]+$/i.test(v.source_url!)) ?? matches[0];
}

/**
 * Parse a hand-curated trending/top page into hits. Titles are humanized from
 * the media filename.
 */
// ponytail: filename-derived titles, no per-anchor HTML pairing — the page markup
// is Elementor soup; upgrade to real title extraction if filenames prove too ugly.
export function parseTrendingPage(html: string, source: MemeSource): MemeHit[] {
  const site = MEME_SITES[source];
  return extractMediaUrls(html, site.mediaHost).map((mediaUrl) => {
    const base = path.basename(new URL(mediaUrl).pathname).replace(/\.[a-z0-9]+$/i, "");
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return {
      source,
      slug,
      title: base.replace(/[-_]+/g, " ").trim(),
      pageUrl: `${site.base}/`,
      mediaUrl,
    };
  });
}

// ---------- WP REST fetchers ----------

const UA = { "User-Agent": "ralphy-cli/1.0" };

async function wpJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

type WpPost = {
  id: number;
  slug: string;
  link: string;
  date?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
};

const POST_FIELDS = "_fields=id,slug,link,date,title,content";

async function postToHit(source: MemeSource, post: WpPost): Promise<MemeHit> {
  const site = MEME_SITES[source];
  const hit: MemeHit = {
    source,
    slug: post.slug,
    title: decodeEntities(post.title?.rendered ?? post.slug),
    pageUrl: post.link,
    mediaUrl: extractMediaUrls(post.content?.rendered ?? "", site.mediaHost)[0] ?? null,
    date: post.date,
  };
  // The file is not always in content (pre-2023 sound posts have EMPTY
  // content) — the authoritative record is the attachment, which also carries
  // duration/resolution for video. Content-derived URL is just the cheap path.
  if (source === "greenscreen" || !hit.mediaUrl) {
    try {
      const attachments = await wpJson<WpMediaAttachment[]>(
        `${site.base}/wp-json/wp/v2/media?parent=${post.id}&per_page=20&_fields=mime_type,source_url,media_details`,
      );
      const media = pickAttachment(attachments, source === "greenscreen" ? "video" : "audio");
      if (media) {
        hit.mediaUrl = media.source_url!;
        hit.durationSec = media.media_details?.length ?? hit.durationSec;
        hit.width = media.media_details?.width;
        hit.height = media.media_details?.height;
      }
    } catch {
      /* keep the content-derived URL (or null) */
    }
  }
  if (!hit.mediaUrl) hit.mediaUrl = extractDriveUrl(post.content?.rendered ?? "");
  return hit;
}

export async function searchMemes(source: MemeSource, query: string, limit: number): Promise<MemeHit[]> {
  const site = MEME_SITES[source];
  const posts = await wpJson<WpPost[]>(
    `${site.base}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=${limit}&${POST_FIELDS}`,
  );
  return Promise.all(posts.map((p) => postToHit(source, p)));
}

export async function resolveMemeBySlug(source: MemeSource, slug: string): Promise<MemeHit> {
  const site = MEME_SITES[source];
  const posts = await wpJson<WpPost[]>(
    `${site.base}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&${POST_FIELDS}`,
  );
  if (posts.length === 0) throw new Error(`No post with slug '${slug}' on ${site.base}`);
  return postToHit(source, posts[0]);
}

export async function trendingMemes(source: MemeSource, limit: number): Promise<MemeHit[]> {
  const site = MEME_SITES[source];
  const page = source === "sounds" ? "/trending-sounds/" : "/top-100/";
  const res = await fetch(`${site.base}${page}`, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${site.base}${page}`);
  return parseTrendingPage(await res.text(), source).slice(0, limit);
}

const MIME_EXT: Record<string, string> = { "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/mp4": ".m4a", "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };

/** Download a media file into the meme cache (idempotent by basename+size). */
export async function downloadMemeMedia(source: MemeSource, mediaUrl: string, filenameHint?: string): Promise<string> {
  const dir = path.join(memeCacheDir(), source);
  await fs.mkdir(dir, { recursive: true });

  const res = await fetch(mediaUrl, { headers: UA });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${mediaUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Drive-style URLs have no useful basename — fall back to hint + Content-Type ext.
  let basename = path.basename(new URL(mediaUrl).pathname);
  if (!/\.[a-z0-9]{2,4}$/i.test(basename)) {
    const ext = MIME_EXT[(res.headers.get("content-type") ?? "").split(";")[0]] ?? ".mp3";
    basename = `${filenameHint ?? "meme"}${ext}`;
  }
  const dest = path.join(dir, basename);

  try {
    const stat = await fs.stat(dest);
    if (stat.size === buf.length) return dest; // cached and same size — skip write
  } catch {
    /* not cached */
  }
  await fs.writeFile(dest, buf);
  return dest;
}

/** Map a pasted URL (page or direct media) to { source, slug?, mediaUrl? }. */
export function parseMemeRef(ref: string): { source: MemeSource; slug?: string; mediaUrl?: string } | null {
  const short = ref.match(/^(greenscreen|sounds)\/(.+)$/);
  if (short) return { source: short[1] as MemeSource, slug: short[2] };
  let url: URL;
  try {
    url = new URL(ref);
  } catch {
    return null;
  }
  for (const [source, site] of Object.entries(MEME_SITES) as Array<[MemeSource, (typeof MEME_SITES)[MemeSource]]>) {
    if (url.host === site.mediaHost) return { source, mediaUrl: ref };
    if (`https://${url.host}` === site.base) {
      const slug = url.pathname.replace(/^\/|\/$/g, "");
      if (slug) return { source, slug };
    }
  }
  return null;
}
