// `cli/lib/research/url-extractor.ts` — pulls http(s) URLs out of model
// output (typically markdown). The verifier consumes the result.

import { describe, test, expect } from "bun:test";
import { extractUrls } from "../../cli/lib/research/url-extractor.js";

describe("extractUrls — basic shapes", () => {
  test("bare URL on its own line", () => {
    expect(extractUrls("See https://example.com/page for details.")).toEqual([
      "https://example.com/page",
    ]);
  });

  test("markdown link [text](url)", () => {
    expect(extractUrls("See [the paper](https://arxiv.org/abs/2604.03173).")).toEqual([
      "https://arxiv.org/abs/2604.03173",
    ]);
  });

  test("multiple URLs in one paragraph", () => {
    const md = "Compare [A](https://a.example/x) with B at https://b.example/y.";
    expect(extractUrls(md)).toEqual([
      "https://a.example/x",
      "https://b.example/y",
    ]);
  });

  test("URL inside parentheses without markdown link", () => {
    expect(extractUrls("Background (https://wiki.example/topic) is useful."))
      .toEqual(["https://wiki.example/topic"]);
  });

  test("URL followed by trailing punctuation", () => {
    expect(extractUrls("Check https://example.com/page, then continue."))
      .toEqual(["https://example.com/page"]);
    expect(extractUrls("Source: https://example.com/page.")).toEqual([
      "https://example.com/page",
    ]);
    expect(extractUrls("Source: https://example.com/page!")).toEqual([
      "https://example.com/page",
    ]);
  });

  test("URL inside angle brackets <https://...>", () => {
    expect(extractUrls("Mirror at <https://example.com/page> works.")).toEqual([
      "https://example.com/page",
    ]);
  });
});

describe("extractUrls — dedup + order", () => {
  test("preserves first-seen order", () => {
    const md = "First https://b.example/y then https://a.example/x.";
    expect(extractUrls(md)).toEqual([
      "https://b.example/y",
      "https://a.example/x",
    ]);
  });

  test("dedupes repeated URLs", () => {
    const md = "https://example.com/x and again https://example.com/x.";
    expect(extractUrls(md)).toEqual(["https://example.com/x"]);
  });

  test("dedupes by normalized URL (casing, utm, fragment)", () => {
    const md =
      "See https://Example.com/x and https://example.com/x?utm_source=tw and https://example.com/x#section";
    expect(extractUrls(md)).toEqual(["https://Example.com/x"]);
  });
});

describe("extractUrls — what to ignore", () => {
  test("ignores mailto + ftp + plain words", () => {
    const md = "Email me at mailto:a@b.com or via ftp://x.example/path.";
    expect(extractUrls(md)).toEqual([]);
  });

  test("ignores URLs inside fenced code blocks", () => {
    const md = [
      "Prose with https://real.example/x.",
      "```",
      "ignored https://fake.example/y",
      "```",
      "More prose at https://real.example/z.",
    ].join("\n");
    expect(extractUrls(md)).toEqual([
      "https://real.example/x",
      "https://real.example/z",
    ]);
  });

  test("ignores URLs inside inline code spans", () => {
    expect(
      extractUrls("Run `curl https://fake.example/api` then visit https://real.example/x."),
    ).toEqual(["https://real.example/x"]);
  });

  test("ignores malformed URLs", () => {
    const md = "https:// not real and http:/x and httpsx://y are junk.";
    expect(extractUrls(md)).toEqual([]);
  });
});

describe("extractUrls — long-form markdown", () => {
  test("citation footnote-style links", () => {
    const md = [
      "Per Anthropic's writeup[^1], multi-agent helps.",
      "",
      "[^1]: https://www.anthropic.com/engineering/multi-agent-research-system",
    ].join("\n");
    expect(extractUrls(md)).toEqual([
      "https://www.anthropic.com/engineering/multi-agent-research-system",
    ]);
  });

  test("realistic synthesis paragraph", () => {
    const md =
      "Rao et al. found that 3-13% of cited URLs are fabricated " +
      "([paper](https://arxiv.org/abs/2604.03173)); NVIDIA AI-Q " +
      "(https://github.com/NVIDIA-AI-Blueprints/aiq/tree/2.0.0) " +
      "addresses this with a five-level matcher. See also " +
      "https://www.anthropic.com/engineering/multi-agent-research-system.";
    const urls = extractUrls(md);
    expect(urls).toContain("https://arxiv.org/abs/2604.03173");
    expect(urls).toContain("https://github.com/NVIDIA-AI-Blueprints/aiq/tree/2.0.0");
    expect(urls).toContain("https://www.anthropic.com/engineering/multi-agent-research-system");
    expect(urls).toHaveLength(3);
  });
});
