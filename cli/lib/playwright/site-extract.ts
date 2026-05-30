// Playwright-driven brand-site fan-out crawler. Issue #014.
//
// `ralphy ref pull-site <url> --project <id>` wraps this helper.
//
// Purpose: capture a brand's real CSS palette, fonts, copy, and documented
// API surfaces BEFORE any creative is drafted. Codifies AGENTS.md invariant
// #15 (Site-grounding) and prevents the two failure modes that motivated it:
//   - Brand DNA invented from memory (wrong-palette burn — sotaocr-fb-001).
//   - SDK hallucination (`import sotaocr` over a curl-only API — same proj).
//
// Heavy assets (screenshots) are PER-page; the structured digest
// (tokens.json + apis.md + per-page markdown) is what downstream prompts
// read. Numeric-suffix dedupe on collision (AGENTS invariant #14).

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

// ── Sitemap parser ─────────────────────────────────────────────────────────
//
// Extracts `<loc>...</loc>` URLs from an XML sitemap. We deliberately use a
// regex rather than a full XML parser — sitemaps are large, flat, and the
// extra dependency would be overkill. Handles sitemap-index files transitively
// (when an entry points at another `sitemap.xml`, callers may recurse).

export function parseSitemap(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1]?.trim();
    if (url) out.push(url);
  }
  return out;
}

// ── API-surface extractor ──────────────────────────────────────────────────
//
// Walks a markdown / HTML body, extracts the language tag + first line of
// every code block, and classifies each surface as `curl`, `python`,
// `typescript`, `bash`, `gui`, etc. Output drives `<slug>-apis.md` — the
// document the agent reads BEFORE rendering any code-on-screen creative.
//
// Detection patterns (in priority order):
//   1. ``` language hints (```bash, ```python, ```ts, …)
//   2. inline `curl`, `import`, `pip install`, `npm i`, `bun add` signatures
//   3. shell prompts (`$ curl`, `> npm`) — language inferred from first verb

export type DetectedApiSurface = {
  kind: "curl" | "python" | "typescript" | "javascript" | "bash" | "go" | "rust" | "graphql" | "rest" | "other";
  /** Verbatim first line of the matched block, trimmed. */
  snippet: string;
  /** Index in the source where the match started — for stable ordering. */
  index: number;
};

export function extractApiSurfaces(body: string): DetectedApiSurface[] {
  const found: DetectedApiSurface[] = [];

  // (1) Fenced code blocks — language hint + first non-empty line.
  const fenceRe = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;
  let fm: RegExpExecArray | null;
  while ((fm = fenceRe.exec(body)) !== null) {
    const lang = (fm[1] || "").toLowerCase();
    const block = fm[2] || "";
    const firstLine = block.split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "";
    if (!firstLine) continue;
    const kind = classifyFromLangAndLine(lang, firstLine);
    if (kind) found.push({ kind, snippet: firstLine.slice(0, 240), index: fm.index });
  }

  // (2) Inline signatures outside fenced blocks. Strip fences first so we
  //     don't double-count.
  const stripped = body.replace(/```[\s\S]*?```/g, "");
  const inlinePatterns: Array<[RegExp, DetectedApiSurface["kind"]]> = [
    // Permissive curl: any `curl` invocation that mentions an http(s) URL on the same line.
    [/\bcurl\b[^\n]*?https?:\/\/[^\s"']+/g, "curl"],
    // TS/ESM: `import x from '…';` / `import { x } from "…";`
    [/\bimport\b[^\n;]*?\bfrom\s+["'][^"']+["']/g, "typescript"],
    // Python: `from <mod> import <names>` — strict to avoid TS-ESM collision.
    // The module name MUST NOT be wrapped in quotes (rules out the `from "…"` ESM tail).
    [/\bfrom\s+[a-zA-Z_][\w.]*\s+import\s+[a-zA-Z_*][\w,\s*]*/g, "python"],
    [/\bpip\s+install\s+[a-zA-Z0-9_\-.]+/g, "python"],
    [/\bnpm\s+(?:i|install|add)\s+[@a-zA-Z0-9_\-/.]+/g, "javascript"],
    [/\bbun\s+(?:i|install|add)\s+[@a-zA-Z0-9_\-/.]+/g, "javascript"],
    [/\byarn\s+(?:add)\s+[@a-zA-Z0-9_\-/.]+/g, "javascript"],
    [/\bgo\s+get\s+[a-zA-Z0-9_\-./]+/g, "go"],
    [/\bcargo\s+add\s+[a-zA-Z0-9_\-]+/g, "rust"],
  ];
  for (const [re, kind] of inlinePatterns) {
    let im: RegExpExecArray | null;
    while ((im = re.exec(stripped)) !== null) {
      const snippet = im[0].trim();
      // Skip if a near-identical snippet is already captured from a fence.
      if (found.some((f) => f.snippet === snippet)) continue;
      found.push({ kind, snippet: snippet.slice(0, 240), index: im.index });
    }
  }

  // Stable order by source index.
  found.sort((a, b) => a.index - b.index);
  return found;
}

function classifyFromLangAndLine(lang: string, firstLine: string): DetectedApiSurface["kind"] | null {
  // (1) First-line `curl` always beats a `bash`/`sh` fence label — the content is
  //     what matters for "documented API surface" reporting.
  if (/^\s*curl\b/.test(firstLine)) return "curl";
  // (2) Explicit language hint on the fence wins for everything else.
  if (lang === "curl") return "curl";
  if (lang === "python" || lang === "py") return "python";
  if (lang === "ts" || lang === "tsx" || lang === "typescript") return "typescript";
  if (lang === "js" || lang === "jsx" || lang === "javascript" || lang === "node") return "javascript";
  if (lang === "bash" || lang === "sh" || lang === "shell" || lang === "zsh") return "bash";
  if (lang === "go") return "go";
  if (lang === "rust" || lang === "rs") return "rust";
  if (lang === "graphql" || lang === "gql") return "graphql";
  // (3) No / unknown language tag — infer from the first line.
  // Python `from X import Y` (mod name unquoted) vs TS `import X from "Y"` (quoted).
  if (/^\s*from\s+[a-zA-Z_][\w.]*\s+import\b/.test(firstLine)) return "python";
  if (/^\s*import\b[^\n;]*?\bfrom\s+["']/.test(firstLine)) return "typescript";
  if (/^\s*import\s+[a-zA-Z_]/.test(firstLine)) return "python"; // bare `import requests`
  if (/^\s*pip\s+install\b/.test(firstLine)) return "python";
  if (/^\s*(npm|bun|yarn)\b/.test(firstLine)) return "javascript";
  // Fall through — uncategorized code blocks are likely "other".
  if (lang) return "other";
  return null;
}

// ── Hex-color extractor (used by token reducer when running headless) ──────

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;

export function extractColorsFromCss(cssText: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = HEX_RE.exec(cssText)) !== null) {
    set.add(`#${m[1].toLowerCase()}`);
  }
  while ((m = RGB_RE.exec(cssText)) !== null) {
    const r = Number(m[1]),
      g = Number(m[2]),
      b = Number(m[3]);
    if ([r, g, b].every((n) => n >= 0 && n <= 255)) {
      const hex =
        "#" +
        [r, g, b]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      set.add(hex);
    }
  }
  return [...set];
}

// ── Filename / slug derivation ─────────────────────────────────────────────

export function siteSlugFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return u.hostname.replace(/^www\./, "").replace(/[^a-z0-9.-]/gi, "-").toLowerCase() || "site";
  } catch {
    return "site";
  }
}

export function pageSlugFromPath(pathname: string): string {
  const cleaned = pathname.replace(/\/+$/g, "").replace(/^\/+/g, "");
  if (!cleaned) return "home";
  return cleaned.replace(/[^a-z0-9._-]/gi, "-").toLowerCase().slice(0, 64) || "page";
}

// ── Numeric-suffix dedupe ──────────────────────────────────────────────────
// AGENTS invariant #14: never overwrite. Append `-2`, `-3`, … on collision.

export async function nonCollidingPath(target: string): Promise<string> {
  const ext = path.extname(target);
  const stem = target.slice(0, target.length - ext.length);
  let n = 1;
  let candidate = target;
  while (n < 1000) {
    try {
      await fs.access(candidate);
      n += 1;
      candidate = `${stem}-${n}${ext}`;
    } catch {
      return candidate;
    }
  }
  return candidate;
}

// ── Playwright availability probe ──────────────────────────────────────────
// `playwright` is in package.json, but the Chromium browser binary needs
// `bunx playwright install chromium`. We detect both. Failure → human-readable
// pointer to `ralphy doctor`.

export async function ensurePlaywright(): Promise<void> {
  let chromium: any;
  try {
    ({ chromium } = await import("playwright"));
  } catch (e: any) {
    throw new Error(
      `playwright module not installed (bun install). Run: bunx playwright install chromium  (or: ralphy doctor)`,
    );
  }
  // Probe browser binary by attempting a launch with a short timeout. We
  // can't easily detect the binary presence without launching, so we wrap
  // the typical error message.
  try {
    const browser = await chromium.launch({ timeout: 5_000 });
    await browser.close();
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("Executable doesn't exist") || msg.includes("playwright install")) {
      throw new Error(
        `Chromium binary missing. Run: bunx playwright install chromium  (or: ralphy doctor)`,
      );
    }
    throw e;
  }
}

// ── Site-extract orchestrator ──────────────────────────────────────────────

export type SiteExtractOptions = {
  url: string;
  /** Output dir (typically `<project>/refs`). */
  outDir: string;
  /** Filename slug (defaults: derived from URL host). */
  slug?: string;
  /**
   * Crawl depth — how many pages beyond the home page. Default 6 (matches
   * the AGENTS invariant #15 canonical fan-out).
   */
  depth?: number;
  /** Hard timeout per page in ms (default 20_000). */
  pageTimeoutMs?: number;
  /** Optional override list of extra paths to visit (instead of sitemap). */
  extraPaths?: string[];
};

export type ExtractedPage = {
  /** URL actually visited. */
  url: string;
  /** Filename slug for this page (e.g. "home", "docs", "pricing"). */
  slug: string;
  /** Absolute path to the full-page screenshot PNG. */
  screenshotPath: string;
  /** Absolute path to the page body markdown / raw-HTML dump. */
  bodyPath: string;
  /** Page title from `<title>`. */
  title: string;
  /** Detected API surfaces in this page's body. */
  apis: DetectedApiSurface[];
};

export type SiteExtractResult = {
  url: string;
  slug: string;
  pages: ExtractedPage[];
  /** Path to `<slug>-tokens.json`. */
  tokensPath: string;
  /** Path to `<slug>-apis.md`. */
  apisPath: string;
  /** Path to the hero screenshot (same as pages[0].screenshotPath for convenience). */
  heroPath: string;
};

// Canonical fan-out paths. Order matters — the first one that exists for a
// given site fulfills the "docs" / "pricing" slot.
const FANOUT_CANDIDATES = {
  docs: ["/docs", "/documentation", "/api", "/api-docs", "/developers"],
  pricing: ["/pricing", "/plans"],
  features: ["/features", "/product"],
  examples: ["/examples", "/showcase", "/customers", "/case-studies"],
  blog: ["/blog", "/changelog", "/news"],
};

/**
 * Run the full fan-out crawl. Throws on Playwright/browser failure with a
 * `ralphy doctor`-style pointer.
 */
export async function extractSite(opts: SiteExtractOptions): Promise<SiteExtractResult> {
  await ensurePlaywright();
  const { chromium } = await import("playwright");

  const baseUrl = new URL(opts.url);
  const slug = opts.slug ?? siteSlugFromUrl(opts.url);
  const outDir = opts.outDir;
  await fs.mkdir(outDir, { recursive: true });
  const pageTimeoutMs = opts.pageTimeoutMs ?? 20_000;

  const browser = await chromium.launch();
  const pages: ExtractedPage[] = [];
  const allColors = new Set<string>();
  const allFonts = new Set<string>();
  const allCssVars = new Map<string, string>();

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      userAgent: "ralphy-cli/site-extract (Playwright)",
    });

    // (1) Hit home page. Capture sitemap + nav links for fan-out.
    const homePath = baseUrl.pathname && baseUrl.pathname !== "/" ? baseUrl.pathname : "/";
    const homePage = await visitPage(ctx, baseUrl.toString(), {
      slug: "home",
      outDir,
      siteSlug: slug,
      pageTimeoutMs,
    });
    pages.push(homePage);
    accumulatePage(homePage, allColors, allFonts, allCssVars);

    // (2) Discover additional paths.
    let candidates: string[];
    if (opts.extraPaths && opts.extraPaths.length > 0) {
      candidates = opts.extraPaths;
    } else {
      candidates = await discoverPaths(ctx, baseUrl, homePage.bodyPath);
    }

    // (3) Visit each, respecting depth.
    const depth = opts.depth ?? 6;
    for (const p of candidates.slice(0, depth)) {
      const abs = new URL(p, baseUrl).toString();
      // Skip duplicates of home.
      if (abs === baseUrl.toString() || abs === `${baseUrl.origin}${homePath}`) continue;
      try {
        const pageSlug = pageSlugFromPath(new URL(abs).pathname);
        const ep = await visitPage(ctx, abs, {
          slug: pageSlug,
          outDir,
          siteSlug: slug,
          pageTimeoutMs,
        });
        pages.push(ep);
        accumulatePage(ep, allColors, allFonts, allCssVars);
      } catch {
        // Page failed — log+skip. The crawl continues so one 404 doesn't
        // tank the whole brand-DNA capture.
      }
    }
  } finally {
    await browser.close();
  }

  // (4) Write tokens.json (merged across all pages).
  const tokensPath = await nonCollidingPath(path.join(outDir, `${slug}-tokens.json`));
  await fs.writeFile(
    tokensPath,
    JSON.stringify(
      {
        site: opts.url,
        slug,
        pages: pages.map((p) => ({ slug: p.slug, url: p.url, title: p.title })),
        colors: [...allColors].sort(),
        fonts: [...allFonts].sort(),
        cssVariables: Object.fromEntries([...allCssVars.entries()].sort()),
      },
      null,
      2,
    ),
  );

  // (5) Write apis.md (deduped across all pages).
  const apisPath = await nonCollidingPath(path.join(outDir, `${slug}-apis.md`));
  const apisMd = renderApisMarkdown(opts.url, pages);
  await fs.writeFile(apisPath, apisMd);

  // (6) Hero PNG is the first page (home).
  const heroPath = pages[0]?.screenshotPath ?? "";

  return { url: opts.url, slug, pages, tokensPath, apisPath, heroPath };
}

type ExtractedPageWithRaw = ExtractedPage & {
  _colors?: string[];
  _fonts?: string[];
  _cssVars?: Map<string, string>;
};

function accumulatePage(
  ep: ExtractedPageWithRaw,
  colors: Set<string>,
  fonts: Set<string>,
  cssVars: Map<string, string>,
): void {
  for (const c of ep._colors ?? []) colors.add(c);
  for (const f of ep._fonts ?? []) fonts.add(f);
  for (const [k, v] of (ep._cssVars ?? new Map<string, string>())) cssVars.set(k, v);
}

type VisitPageOpts = {
  slug: string;
  outDir: string;
  siteSlug: string;
  pageTimeoutMs: number;
};

async function visitPage(ctx: any, url: string, opts: VisitPageOpts): Promise<ExtractedPageWithRaw> {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: opts.pageTimeoutMs });
    // Settle for late-CSS-painted shells (Next.js, Vercel deployments).
    try {
      await page.waitForLoadState("networkidle", { timeout: Math.min(8_000, opts.pageTimeoutMs) });
    } catch {
      /* networkidle may never fire on streaming endpoints — that's fine */
    }

    const title = await page.title();
    const html = (await page.content()) as string;

    // Compute CSS tokens via in-page eval. We pull:
    //   - body / :root computed colors + fonts
    //   - CSS custom properties (--*)
    //   - all <link rel="stylesheet"> hrefs (for the colour scan)
    const inPage: { vars: Record<string, string>; bodyFont: string; bodyColor: string; bodyBg: string; rootColors: string[] } = await page.evaluate(() => {
      const out: { vars: Record<string, string>; bodyFont: string; bodyColor: string; bodyBg: string; rootColors: string[] } = {
        vars: {},
        bodyFont: "",
        bodyColor: "",
        bodyBg: "",
        rootColors: [],
      };
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      // CSS custom-properties on :root.
      for (let i = 0; i < cs.length; i++) {
        const name = cs[i];
        if (name && name.startsWith("--")) {
          out.vars[name] = cs.getPropertyValue(name).trim();
        }
      }
      const body = document.body;
      if (body) {
        const bs = getComputedStyle(body);
        out.bodyFont = bs.fontFamily;
        out.bodyColor = bs.color;
        out.bodyBg = bs.backgroundColor;
      }
      return out;
    });

    const colors = new Set<string>();
    const fonts = new Set<string>();
    const cssVars = new Map<string, string>();

    // CSS vars + body-computed values.
    for (const [k, v] of Object.entries(inPage.vars)) {
      cssVars.set(k, v);
      for (const c of extractColorsFromCss(v)) colors.add(c);
    }
    for (const c of extractColorsFromCss(inPage.bodyColor)) colors.add(c);
    for (const c of extractColorsFromCss(inPage.bodyBg)) colors.add(c);
    if (inPage.bodyFont) {
      // Split "Inter, system-ui, sans-serif" → ["Inter", "system-ui", "sans-serif"].
      for (const f of inPage.bodyFont.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))) {
        if (f) fonts.add(f);
      }
    }

    // Also scan the raw HTML for inline hex / rgb tokens (catches Tailwind
    // arbitrary values, JIT inlines, and <style> bodies the eval missed).
    for (const c of extractColorsFromCss(html)) colors.add(c);

    // Screenshot + body dump.
    const shotPath = await nonCollidingPath(
      path.join(opts.outDir, `${opts.siteSlug}-${opts.slug}.png`),
    );
    await page.screenshot({ path: shotPath, fullPage: true });

    // Body dump: prefer plain text (visible body) if we can; fall back to raw HTML.
    const visibleText = await page
      .evaluate(() => {
        // Strip script + style content from the visible body dump.
        const clone = document.body?.cloneNode(true) as HTMLElement | null;
        if (!clone) return "";
        clone.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
        return (clone.innerText || "").trim();
      })
      .catch(() => "");

    const bodyPath = await nonCollidingPath(
      path.join(opts.outDir, `${opts.siteSlug}-${opts.slug}.md`),
    );
    const bodyMd = visibleText
      ? `# ${title}\n\n<!-- source: ${url} -->\n\n${visibleText}\n`
      : `<!-- source: ${url} -->\n\n${html}\n`;
    await fs.writeFile(bodyPath, bodyMd);

    const apis = extractApiSurfaces(bodyMd);

    return {
      url,
      slug: opts.slug,
      screenshotPath: shotPath,
      bodyPath,
      title,
      apis,
      _colors: [...colors],
      _fonts: [...fonts],
      _cssVars: cssVars,
    };
  } finally {
    await page.close();
  }
}

/**
 * Discover up to 6 useful paths beyond home — checks sitemap.xml first, then
 * falls back to scanning the home page's nav links.
 */
async function discoverPaths(ctx: any, base: URL, homeBodyPath: string): Promise<string[]> {
  const found = new Set<string>();

  // (a) Sitemap.
  try {
    const page = await ctx.newPage();
    await page.goto(new URL("/sitemap.xml", base).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 8_000,
    });
    const xml = await page.content();
    await page.close();
    const stripped = xml.replace(/<[^>]+>(.+?)<\/[^>]+>/g, "$1");
    for (const raw of parseSitemap(xml)) {
      try {
        const u = new URL(raw);
        if (u.origin === base.origin) found.add(u.pathname);
      } catch {
        /* skip malformed */
      }
    }
    // Variables intentionally referenced to silence unused warnings on edge paths.
    void stripped;
  } catch {
    /* sitemap absent / not parseable — fall through */
  }

  // (b) Nav links from home body. We re-read the dumped markdown to avoid
  //     a second goto; pull `<a href="...">` patterns out of the raw text.
  try {
    const md = await fs.readFile(homeBodyPath, "utf-8");
    const aRe = /href\s*=\s*["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = aRe.exec(md)) !== null) {
      const href = m[1];
      try {
        const abs = new URL(href, base);
        if (abs.origin === base.origin) found.add(abs.pathname);
      } catch {
        /* malformed href */
      }
    }
  } catch {
    /* no-op */
  }

  // (c) Always include canonical fan-out candidates so /docs is checked even
  //     when nav menus hide it (common on landing-only sites).
  for (const list of Object.values(FANOUT_CANDIDATES)) {
    for (const p of list) found.add(p);
  }

  // Rank: canonical buckets first, then alpha. Limits noise from sprawling
  // sitemaps.
  const ranked: string[] = [];
  for (const list of Object.values(FANOUT_CANDIDATES)) {
    for (const p of list) {
      if (found.has(p)) {
        ranked.push(p);
        found.delete(p);
      }
    }
  }
  // Then a handful of remaining short paths.
  const rest = [...found]
    .filter((p) => p && p.length < 60 && !/\.(png|jpg|svg|webp|css|js|json|xml)(\?|$)/i.test(p))
    .sort((a, b) => a.length - b.length)
    .slice(0, 12);
  return [...ranked, ...rest];
}

function renderApisMarkdown(url: string, pages: ExtractedPage[]): string {
  const lines: string[] = [];
  lines.push(`# Documented API surfaces — ${url}`);
  lines.push("");
  lines.push(
    "Extracted from page bodies via `ralphy ref pull-site`. Every code-on-screen creative MUST cite an entry from this list. **NEVER invent an SDK** that isn't documented here (see `feedback_verify_sdk_before_code_creative`).",
  );
  lines.push("");

  if (pages.every((p) => p.apis.length === 0)) {
    lines.push("> No code blocks or canonical install / curl signatures detected. Verify by hand before drafting any code creative.");
    lines.push("");
    return lines.join("\n");
  }

  const byKind = new Map<string, Array<{ snippet: string; page: string }>>();
  for (const page of pages) {
    for (const api of page.apis) {
      const arr = byKind.get(api.kind) ?? [];
      // Dedupe identical snippets.
      if (!arr.some((s) => s.snippet === api.snippet)) {
        arr.push({ snippet: api.snippet, page: page.url });
      }
      byKind.set(api.kind, arr);
    }
  }

  for (const [kind, list] of [...byKind.entries()].sort()) {
    lines.push(`## ${kind}`);
    lines.push("");
    for (const item of list.slice(0, 25)) {
      lines.push(`- \`${item.snippet}\``);
      lines.push(`  - source: ${item.page}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Probe whether the Chromium binary appears to be installed. Cheap — does
 * NOT actually launch a browser. Used by `ralphy doctor` and the CLI's
 * pre-flight error message.
 */
export function isChromiumLikelyInstalled(): boolean {
  // The most reliable check is `playwright --version` which exits 0 when
  // installed regardless of browser binary presence; the actual binary
  // presence is checked at launch time by `ensurePlaywright`.
  const r = spawnSync("bunx", ["--bun", "playwright", "--version"], { stdio: "ignore" });
  return r.status === 0;
}
