// `cli/lib/research/retrievers/ddg-search.ts` — own-engine web search via
// DuckDuckGo's HTML endpoint. No API key, no Tavily / Serper / Exa.
//
// Endpoint: https://html.duckduckgo.com/html/?q=<query>
// Result links are wrapped in DDG's redirect, e.g.
//   <a class="result__a" href="//duckduckgo.com/l/?uddg=<encoded>&rut=...">
// We unwrap the `uddg` param to recover the real URL.

import { describe, test, expect } from "bun:test";
import {
  parseDuckDuckGoHtml,
  searchDuckDuckGo,
  type SearchHit,
} from "../../cli/lib/research/retrievers/ddg-search.js";

const SAMPLE = `
<html><body>
  <div class="results">
    <div class="result results_links">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.anthropic.com%2Fengineering%2Fmulti-agent-research-system&rut=a">Multi-Agent Research</a>
      <a class="result__snippet">How Anthropic built ...</a>
    </div>
    <div class="result results_links">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fopenai.com%2Findex%2Fintroducing-deep-research%2F&rut=b">Introducing Deep Research</a>
      <a class="result__snippet">OpenAI's o3 deep research ...</a>
    </div>
    <div class="result results_links">
      <a class="result__a" href="https://example.com/direct">Direct link</a>
      <a class="result__snippet">No DDG wrapper</a>
    </div>
    <div class="result--ad">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example%2Fbuy">Sponsored</a>
    </div>
  </div>
</body></html>
`;

describe("parseDuckDuckGoHtml", () => {
  test("extracts wrapped URLs from result__a anchors", () => {
    const hits = parseDuckDuckGoHtml(SAMPLE);
    const urls = hits.map((h) => h.url);
    expect(urls).toContain("https://www.anthropic.com/engineering/multi-agent-research-system");
    expect(urls).toContain("https://openai.com/index/introducing-deep-research/");
  });

  test("also handles non-wrapped direct links", () => {
    const hits = parseDuckDuckGoHtml(SAMPLE);
    expect(hits.some((h) => h.url === "https://example.com/direct")).toBe(true);
  });

  test("returns hits in document order with no duplicates", () => {
    const hits = parseDuckDuckGoHtml(SAMPLE);
    expect(hits.map((h) => h.url)).toEqual([
      "https://www.anthropic.com/engineering/multi-agent-research-system",
      "https://openai.com/index/introducing-deep-research/",
      "https://example.com/direct",
    ]);
  });

  test("captures the anchor text as title", () => {
    const hits = parseDuckDuckGoHtml(SAMPLE);
    expect(hits[0].title).toBe("Multi-Agent Research");
  });

  test("empty HTML → empty list", () => {
    expect(parseDuckDuckGoHtml("<html></html>")).toEqual([]);
  });

  test("ignores anchors that don't resolve to http(s) after unwrap", () => {
    const html = `
      <a class="result__a" href="//duckduckgo.com/l/?uddg=javascript%3Aalert(1)">Bad</a>
      <a class="result__a" href="//duckduckgo.com/l/?uddg=mailto%3Aa%40b.com">Mail</a>
    `;
    expect(parseDuckDuckGoHtml(html)).toEqual([]);
  });
});

describe("searchDuckDuckGo (integration via mock server)", () => {
  test("returns parsed hits for a happy-path response", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        const u = new URL(req.url);
        if (u.searchParams.get("q") !== "test query") {
          return new Response("bad query", { status: 400 });
        }
        return new Response(SAMPLE, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    });
    try {
      const hits: SearchHit[] = await searchDuckDuckGo("test query", {
        baseUrl: `http://localhost:${server.port}/html/`,
        limit: 3,
      });
      expect(hits.length).toBeGreaterThanOrEqual(2);
      expect(hits.length).toBeLessThanOrEqual(3);
      expect(hits[0].url.startsWith("https://")).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test("returns [] on non-200", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("blocked", { status: 403 }),
    });
    try {
      const hits = await searchDuckDuckGo("anything", {
        baseUrl: `http://localhost:${server.port}/html/`,
        retries: 0,
      });
      expect(hits).toEqual([]);
    } finally {
      server.stop(true);
    }
  });
});
