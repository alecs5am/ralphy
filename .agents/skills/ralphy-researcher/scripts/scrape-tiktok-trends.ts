// Playwright TikTok trends scraper.
//
// Replacement for Apify clockworks/tiktok-scraper — same JSON output shape,
// no APIFY_TOKEN required. We use existing `playwright` dep (already in our
// package.json) + chromium without login. TikTok's hashtag pages are
// publicly indexable.
//
// Output schema (matches Apify) — sufficient for `scoreTikTok()`:
//   { webVideoUrl, text, playCount, diggCount, commentCount, shareCount,
//     authorMeta: { name, fans? }, musicMeta?: { song, artist },
//     hashtags: string[], createTimeISO? }
//
// Usage:
//   bunx tsx .agents/skills/ralph-researcher/scripts/scrape-tiktok-trends.ts \
//     --hashtags trending,fyp \
//     --limit 10 \
//     --out workspace/references/trends-2026-04-30/results.json
//
// Caveats:
// - TikTok rotates anti-bot tokens and rate-limits without login. Treat output
//   as best-effort. Add 1-2s delays between scrolls.
// - DOM selectors may break — extract from __UNIVERSAL_DATA_FOR_REHYDRATION__
//   <script> when possible (more stable than rendered DOM).
// - Run from a residential IP. CI / datacenter IPs frequently hit captchas.

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

type ApifyVideo = {
  webVideoUrl: string;
  text: string;
  playCount: number;
  diggCount: number;
  commentCount: number;
  shareCount: number;
  collectCount?: number;
  authorMeta: { name: string; fans?: number };
  musicMeta?: { song: string; artist: string };
  hashtags: string[];
  createTimeISO?: string;
};

function parseArgs(): { hashtags: string[]; limit: number; out: string } {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? undefined : args[idx + 1];
  };
  const hashtagsArg = get("--hashtags");
  if (!hashtagsArg) {
    console.error("Usage: --hashtags <comma-list> [--limit 10] [--out <path>]");
    process.exit(1);
  }
  const hashtags = hashtagsArg.split(",").map((h) => h.trim().replace(/^#/, ""));
  const limit = Number(get("--limit") ?? 10);
  const out = get("--out") ?? `workspace/references/trends-${new Date().toISOString().slice(0, 10)}/results.json`;
  return { hashtags, limit, out };
}

// Extract video objects from TikTok's hydration script when present.
// Falls back to DOM scraping if not found.
async function scrapeTag(hashtag: string, limit: number): Promise<ApifyVideo[]> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1800 },
  });
  const page = await ctx.newPage();
  const url = `https://www.tiktok.com/tag/${encodeURIComponent(hashtag)}`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Scroll down a few times to load more cards.
  for (let i = 0; i < Math.min(6, Math.ceil(limit / 5)); i++) {
    await page.evaluate(() => window.scrollBy(0, 1800));
    await page.waitForTimeout(1500);
  }

  // Try hydration script first.
  const hydratedJson: any = await page.evaluate(() => {
    const node =
      document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__") ||
      document.getElementById("SIGI_STATE");
    if (!node) return null;
    try {
      return JSON.parse(node.textContent || "");
    } catch {
      return null;
    }
  });

  let videos: ApifyVideo[] = [];

  if (hydratedJson) {
    // Walk the JSON looking for items with the standard TikTok video shape.
    const collected: any[] = [];
    const walk = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      if (obj.video && obj.author && (obj.stats || obj.statsV2)) {
        collected.push(obj);
        return;
      }
      for (const k of Object.keys(obj)) walk(obj[k]);
    };
    walk(hydratedJson);

    for (const item of collected.slice(0, limit)) {
      const stats = item.stats || item.statsV2 || {};
      const author = item.author || {};
      const music = item.music || {};
      const desc = item.desc || "";
      const hashtags = (desc.match(/#[\p{L}\d_]+/gu) || []).map((h: string) => h.slice(1));
      videos.push({
        webVideoUrl: `https://www.tiktok.com/@${author.uniqueId}/video/${item.id}`,
        text: desc,
        playCount: Number(stats.playCount ?? 0),
        diggCount: Number(stats.diggCount ?? 0),
        commentCount: Number(stats.commentCount ?? 0),
        shareCount: Number(stats.shareCount ?? 0),
        collectCount: Number(stats.collectCount ?? 0),
        authorMeta: {
          name: author.uniqueId || author.nickname || "unknown",
          fans: Number(author.followerCount ?? author.fans ?? 0) || undefined,
        },
        musicMeta: music.title
          ? { song: music.title, artist: music.authorName || "" }
          : undefined,
        hashtags,
        createTimeISO: item.createTime
          ? new Date(Number(item.createTime) * 1000).toISOString()
          : undefined,
      });
    }
  }

  // DOM fallback if hydration walk didn't find anything.
  if (videos.length === 0) {
    const fallback = await page.$$eval(
      'a[href*="/video/"]',
      (anchors, max) => {
        const seen = new Set<string>();
        const result: any[] = [];
        for (const a of anchors) {
          const href = (a as HTMLAnchorElement).href;
          if (!href.includes("/video/") || seen.has(href)) continue;
          seen.add(href);
          const text = a.textContent?.trim().slice(0, 200) || "";
          result.push({ webVideoUrl: href, text });
          if (result.length >= max) break;
        }
        return result;
      },
      limit
    );
    videos = fallback.map((v: any) => ({
      webVideoUrl: v.webVideoUrl,
      text: v.text,
      playCount: 0,
      diggCount: 0,
      commentCount: 0,
      shareCount: 0,
      authorMeta: { name: "" },
      hashtags: [],
    }));
  }

  await browser.close();
  return videos;
}

async function main() {
  const { hashtags, limit, out } = parseArgs();
  const all: ApifyVideo[] = [];
  for (const tag of hashtags) {
    console.log(`Scraping #${tag}...`);
    try {
      const items = await scrapeTag(tag, limit);
      console.log(`  → ${items.length} videos`);
      all.push(...items);
    } catch (e: any) {
      console.error(`  ! Failed for #${tag}: ${e?.message || e}`);
    }
  }

  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(all, null, 2));
  console.log(`\nSaved ${all.length} videos → ${out}`);
}

main().catch((e) => {
  console.error("Scraping failed:", e?.message || e);
  process.exit(1);
});
