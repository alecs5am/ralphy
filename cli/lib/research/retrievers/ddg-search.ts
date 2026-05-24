// DuckDuckGo HTML search — keyless web discovery.
//
// DDG ships a lightweight HTML interface at https://html.duckduckgo.com/html/
// that returns server-rendered results without JS. Result anchors are
// wrapped through a redirect — we unwrap to recover the real target URL.
//
// This is the Stage 1 default retriever per
// roadmap/12-deep-research/PRD.md. Fallback chain (SearXNG, etc.) is tracked
// in roadmap/12-deep-research/OPEN-QUESTIONS.md Q-04.

const DEFAULT_BASE = "https://html.duckduckgo.com/html/";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.6 Safari/605.1.15";

export type SearchHit = {
  url: string;
  title: string;
  snippet?: string;
  rank: number;
};

const ANCHOR_RE = /<a\b([^>]*\bclass=("|')[^"']*\bresult__a\b[^"']*\2[^>]*)>([\s\S]*?)<\/a>/gi;

const RESULT_DIV_RE = /<div\b([^>]*\bclass=("|')([^"']*)\2[^>]*)>/gi;

// Walk forward looking at result-container divs in document order. For each
// container, record its class string. When we then scan anchors, we know
// which container a given anchor sits inside (by the last opened container
// before the anchor's offset) and can skip ads.
function containerClassAtOffset(html: string, offset: number): string | null {
  let lastClass: string | null = null;
  RESULT_DIV_RE.lastIndex = 0;
  for (const m of html.matchAll(RESULT_DIV_RE)) {
    if (m.index === undefined) continue;
    if (m.index > offset) break;
    const cls = m[3] ?? "";
    if (/\bresult\b/.test(cls)) lastClass = cls;
  }
  return lastClass;
}

function isAdContainer(cls: string | null): boolean {
  if (!cls) return false;
  return /\bresult--ad\b/.test(cls) || /\bresult__a--ad\b/.test(cls);
}

function extractAttr(tagAttrs: string, name: string): string | null {
  const re = new RegExp(`${name}=(\\"|')([^\\"']*)\\1`, "i");
  const m = tagAttrs.match(re);
  return m ? m[2] : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function unwrapDdg(href: string): string | null {
  if (!href) return null;
  // DDG's redirect anchor: //duckduckgo.com/l/?uddg=<encoded>
  if (/^(\/\/|https?:)\/\/?duckduckgo\.com\/l\//i.test(href) || /\/duckduckgo\.com\/l\//i.test(href)) {
    try {
      const abs = href.startsWith("//") ? `https:${href}` : href;
      const u = new URL(abs);
      const uddg = u.searchParams.get("uddg");
      if (uddg) return uddg;
    } catch {
      return null;
    }
  }
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return null;
}

function isUsable(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseDuckDuckGoHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  let rank = 0;
  for (const m of html.matchAll(ANCHOR_RE)) {
    const attrs = m[1];
    const inner = m[3];
    const href = extractAttr(attrs, "href");
    if (!href) continue;
    if (isAdContainer(containerClassAtOffset(html, m.index ?? 0))) continue;
    if (/\bresult__a--ad\b/.test(attrs)) continue;
    const url = unwrapDdg(href);
    if (!url || !isUsable(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    rank += 1;
    hits.push({ url, title: stripTags(inner), rank });
  }
  return hits;
}

export type SearchOptions = {
  baseUrl?: string;
  limit?: number;
  timeoutMs?: number;
  region?: string;
  /** Max retries on empty / blocked responses. Default 3. */
  retries?: number;
};

// Process-wide concurrency cap on DDG to avoid CAPTCHA / 403 rate-limits when
// multiple research jobs share a process or a single planner fans out wide.
// Empirically 2 concurrent works; >=3 starts seeing empty HTML responses.
const DDG_CONCURRENCY = 2;
let _inFlight = 0;
const _waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (_inFlight < DDG_CONCURRENCY) {
    _inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => _waiters.push(resolve));
  _inFlight += 1;
}

function releaseSlot(): void {
  _inFlight -= 1;
  const w = _waiters.shift();
  if (w) w();
}

function jitter(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * baseMs);
}

async function ddgFetchOnce(
  query: string,
  base: string,
  region: string | undefined,
  timeoutMs: number,
): Promise<SearchHit[] | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const form = new URLSearchParams({ q: query });
    if (region) form.set("kl", region);
    const resp = await fetch(`${base}?${form.toString()}`, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": DEFAULT_UA,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    if (/anomaly|captcha|too many requests|rate.?limit/i.test(html.slice(0, 4096))) {
      return null;
    }
    const hits = parseDuckDuckGoHtml(html);
    return hits;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function searchDuckDuckGo(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const base = opts.baseUrl ?? DEFAULT_BASE;
  const limit = opts.limit ?? 10;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 3;
  await acquireSlot();
  try {
    let attempt = 0;
    while (attempt <= retries) {
      // Jitter on every attempt — DDG fingerprints burst patterns.
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, jitter(750 * attempt)));
      } else {
        await new Promise((r) => setTimeout(r, jitter(150)));
      }
      const hits = await ddgFetchOnce(query, base, opts.region, timeoutMs);
      if (hits && hits.length > 0) return hits.slice(0, limit);
      attempt += 1;
    }
    return [];
  } finally {
    releaseSlot();
  }
}
