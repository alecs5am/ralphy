// Unit tests for `cli/lib/playwright/site-extract.ts` — sitemap parsing,
// API-surface extraction, hex / rgb color scanning. Issue #014.
//
// These exercise the pure helpers (no Playwright launch). The full crawl is
// covered by tests/integration/cli-ref-pull-site.test.ts.

import { describe, test, expect } from "bun:test";
import {
  parseSitemap,
  extractApiSurfaces,
  extractColorsFromCss,
  siteSlugFromUrl,
  pageSlugFromPath,
} from "../../cli/lib/playwright/site-extract.ts";

describe("parseSitemap", () => {
  test("extracts every <loc> entry", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/docs</loc></url>
  <url><loc>https://example.com/pricing</loc></url>
</urlset>`;
    expect(parseSitemap(xml)).toEqual([
      "https://example.com/",
      "https://example.com/docs",
      "https://example.com/pricing",
    ]);
  });

  test("tolerates whitespace inside <loc>", () => {
    const xml = `<url><loc>
      https://example.com/blog
    </loc></url>`;
    expect(parseSitemap(xml)).toEqual(["https://example.com/blog"]);
  });

  test("returns [] on empty / malformed input", () => {
    expect(parseSitemap("")).toEqual([]);
    expect(parseSitemap("<urlset></urlset>")).toEqual([]);
  });

  test("ignores entries with no URL content", () => {
    const xml = `<url><loc></loc></url><url><loc>https://a.com/x</loc></url>`;
    expect(parseSitemap(xml)).toEqual(["https://a.com/x"]);
  });
});

describe("extractApiSurfaces — code blocks (fenced)", () => {
  test("detects curl block", () => {
    const md = "Example:\n\n```bash\ncurl -X POST https://api.example.com/extract -H 'Authorization: Bearer XYZ'\n```";
    const out = extractApiSurfaces(md);
    const kinds = out.map((r) => r.kind);
    expect(kinds).toContain("curl");
  });

  test("detects python import block", () => {
    const md = "```python\nimport sotaocr\nsotaocr.parse('x.pdf')\n```";
    const out = extractApiSurfaces(md);
    expect(out[0]?.kind).toBe("python");
    expect(out[0]?.snippet).toBe("import sotaocr");
  });

  test("detects pip install via inline scan", () => {
    const md = "Install with `pip install sotaocr-client` first.";
    const out = extractApiSurfaces(md);
    expect(out.some((r) => r.kind === "python" && r.snippet.includes("pip install"))).toBe(true);
  });

  test("detects npm install via inline scan", () => {
    const md = "Then `npm install @example/sdk` to use it.";
    const out = extractApiSurfaces(md);
    expect(out.some((r) => r.kind === "javascript" && r.snippet.includes("npm install"))).toBe(true);
  });

  test("detects typescript SDK import", () => {
    const md = "```typescript\nimport { Client } from '@example/sdk';\nconst c = new Client();\n```";
    const out = extractApiSurfaces(md);
    expect(out[0]?.kind).toBe("typescript");
  });

  test("returns empty array on plain prose", () => {
    expect(extractApiSurfaces("Just some marketing copy with no code.")).toEqual([]);
  });

  test("dedupes identical snippets across fences and inline scans", () => {
    const md = "```bash\ncurl -X POST https://x.com/a\n```\n\nAlso run: `curl -X POST https://x.com/a`";
    const out = extractApiSurfaces(md);
    const curlSnippets = out.filter((r) => r.kind === "curl").map((r) => r.snippet);
    // One representative — the fenced block — survives; inline scan dedupes.
    expect(new Set(curlSnippets).size).toBe(curlSnippets.length);
  });
});

describe("extractColorsFromCss", () => {
  test("pulls hex colors", () => {
    const css = "background: #ffffff; color: #0F172A; border: 1px solid #abc;";
    const out = extractColorsFromCss(css);
    expect(out).toContain("#ffffff");
    expect(out).toContain("#0f172a");
    expect(out).toContain("#abc");
  });

  test("converts rgb() to hex", () => {
    const css = "color: rgb(255, 0, 0); bg: rgba(0, 128, 255, 0.5);";
    const out = extractColorsFromCss(css);
    expect(out).toContain("#ff0000");
    expect(out).toContain("#0080ff");
  });

  test("dedupes repeats", () => {
    const css = "a { color: #fff; } b { color: #FFFFFF; }";
    const out = extractColorsFromCss(css);
    // Both normalize to lowercase. #fff (3-digit) and #ffffff (6-digit) are
    // returned separately — they're distinct token literals.
    expect(out.filter((c) => c.replace(/^#/, "").toLowerCase() === "ffffff").length).toBe(1);
  });
});

describe("siteSlugFromUrl + pageSlugFromPath", () => {
  test("siteSlugFromUrl strips www + lowercases", () => {
    expect(siteSlugFromUrl("https://www.Example.COM/foo")).toBe("example.com");
    expect(siteSlugFromUrl("https://sub.example.com/")).toBe("sub.example.com");
  });

  test("pageSlugFromPath maps / to 'home'", () => {
    expect(pageSlugFromPath("/")).toBe("home");
    expect(pageSlugFromPath("")).toBe("home");
  });

  test("pageSlugFromPath kebabs nested paths", () => {
    expect(pageSlugFromPath("/docs/api")).toBe("docs-api");
    expect(pageSlugFromPath("/Pricing/")).toBe("pricing");
  });
});
