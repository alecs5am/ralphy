// `cli/lib/research/retrievers/web-fetch.ts` — fetch an HTTP URL, strip HTML
// to readable text, return the contract shape every retriever speaks:
// { text, source_url, retrieved_at, score }.
//
// Unit-test focus is on the HTML stripper (pure, easy) plus a lightweight
// in-process Bun.serve check that the fetcher honors the contract on 200,
// 404, and unreachable hosts.

import { describe, test, expect } from "bun:test";
import {
  htmlToText,
  fetchPage,
  type FetchResult,
} from "../../cli/lib/research/retrievers/web-fetch.js";

describe("htmlToText — block boundaries", () => {
  test("paragraphs separated by newlines", () => {
    const html = "<p>One.</p><p>Two.</p>";
    expect(htmlToText(html)).toBe("One.\n\nTwo.");
  });

  test("br injects a newline", () => {
    expect(htmlToText("A<br>B")).toBe("A\nB");
  });

  test("list items become lines", () => {
    expect(htmlToText("<ul><li>A</li><li>B</li></ul>")).toContain("A");
    expect(htmlToText("<ul><li>A</li><li>B</li></ul>")).toContain("B");
  });

  test("headings get their own line", () => {
    const out = htmlToText("<h1>Title</h1><p>Body.</p>");
    expect(out).toContain("Title");
    expect(out).toContain("Body.");
    expect(out.indexOf("Title")).toBeLessThan(out.indexOf("Body."));
  });
});

describe("htmlToText — what to strip", () => {
  test("removes <script> body", () => {
    expect(htmlToText("Hi<script>alert(1)</script>there"))
      .toBe("Hithere");
  });

  test("removes <style> body", () => {
    expect(htmlToText("Hi<style>p{color:red}</style>there"))
      .toBe("Hithere");
  });

  test("removes <noscript> body", () => {
    expect(htmlToText("Hi<noscript>old browser</noscript>there"))
      .toBe("Hithere");
  });

  test("removes HTML comments", () => {
    expect(htmlToText("Hi<!-- secret -->there")).toBe("Hithere");
  });
});

describe("htmlToText — entities", () => {
  test("decodes named entities", () => {
    expect(htmlToText("a &amp; b &lt; c &gt; d &quot;e&quot;"))
      .toBe('a & b < c > d "e"');
  });

  test("decodes numeric entities", () => {
    expect(htmlToText("&#65;&#66;&#67;")).toBe("ABC");
  });

  test("decodes hex entities", () => {
    expect(htmlToText("&#x41;&#x42;")).toBe("AB");
  });

  test("decodes &nbsp; as a regular space", () => {
    expect(htmlToText("a&nbsp;b")).toBe("a b");
  });
});

describe("htmlToText — whitespace", () => {
  test("collapses runs of inline whitespace", () => {
    expect(htmlToText("<p>foo   bar</p>")).toBe("foo bar");
  });

  test("trims leading and trailing whitespace", () => {
    expect(htmlToText("  <p>hi</p>  ")).toBe("hi");
  });

  test("caps runs of blank lines to at most two newlines", () => {
    const out = htmlToText("<p>A</p><p></p><p></p><p>B</p>");
    expect(out.split(/\n+/).length).toBeLessThanOrEqual(3);
  });
});

describe("fetchPage — contract", () => {
  test("200 returns ok score + decoded text", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          "<html><body><h1>Title</h1><p>Hello, world.</p></body></html>",
          { headers: { "content-type": "text/html; charset=utf-8" } },
        ),
    });
    try {
      const url = `http://localhost:${server.port}/`;
      const r: FetchResult = await fetchPage(url);
      expect(r.score).toBe(1);
      expect(r.source_url).toBe(url);
      expect(r.text).toContain("Hello, world.");
      expect(r.text).toContain("Title");
      expect(typeof r.retrieved_at).toBe("string");
    } finally {
      server.stop(true);
    }
  });

  test("404 returns score 0 + status flagged", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("not found", { status: 404 }),
    });
    try {
      const url = `http://localhost:${server.port}/missing`;
      const r = await fetchPage(url);
      expect(r.score).toBe(0);
      expect(r.status).toBe("http_4xx");
    } finally {
      server.stop(true);
    }
  });

  test("network error returns score 0 + flag", async () => {
    // 0.0.0.0:1 reliably refuses on macOS + Linux.
    const r = await fetchPage("http://0.0.0.0:1/", { timeoutMs: 500 });
    expect(r.score).toBe(0);
    expect(["network_error", "timeout"]).toContain(r.status);
  });

  test("respects max length on body", async () => {
    const big = "x".repeat(200_000);
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(`<p>${big}</p>`),
    });
    try {
      const url = `http://localhost:${server.port}/`;
      const r = await fetchPage(url, { maxBytes: 50_000 });
      expect(r.text.length).toBeLessThanOrEqual(50_000);
    } finally {
      server.stop(true);
    }
  });
});
