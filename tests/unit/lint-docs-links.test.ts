// Unit tests for the docs-links lint script (07.09.01).
//
// The lint walks .md / .mdx files, extracts every link, and verifies:
//   • Internal links resolve to existing files
//   • External links return 2xx within a 30s timeout (skipped via allowlist)
//
// We test the extractor + classifier deterministically. The network probe
// path is exercised via injection.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractLinks,
  classifyLink,
  resolveInternal,
  type LinkRef,
} from "../../scripts/lint-docs-links.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lint-links-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("extractLinks", () => {
  test("pulls markdown link syntax [text](url)", () => {
    const src = "see [the docs](https://ralphy.dev/docs) and [intro](/intro)";
    const links = extractLinks("README.md", src);
    expect(links.length).toBe(2);
    expect(links[0]!.url).toBe("https://ralphy.dev/docs");
    expect(links[1]!.url).toBe("/intro");
  });

  test("pulls anchor + relative file links", () => {
    const src = "see [CLI](./docs/CLI.md) and [section](#install)";
    const links = extractLinks("README.md", src);
    expect(links.map((l) => l.url)).toEqual(["./docs/CLI.md", "#install"]);
  });

  test("ignores image-only references", () => {
    const src = "![alt](banner.png) text [real](url.md)";
    const links = extractLinks("README.md", src);
    expect(links.map((l) => l.url)).toEqual(["url.md"]);
  });

  test("records line numbers", () => {
    const src = "line 1\nline 2 [x](y.md)\nline 3";
    const links = extractLinks("a.md", src);
    expect(links[0]!.line).toBe(2);
  });
});

describe("classifyLink", () => {
  test("https → external", () => {
    expect(classifyLink({ file: "a.md", line: 1, url: "https://x.com" }).kind).toBe("external");
  });

  test("http → external", () => {
    expect(classifyLink({ file: "a.md", line: 1, url: "http://x.com" }).kind).toBe("external");
  });

  test("#anchor → anchor (skipped)", () => {
    expect(classifyLink({ file: "a.md", line: 1, url: "#foo" }).kind).toBe("anchor");
  });

  test("relative path → internal", () => {
    expect(classifyLink({ file: "a.md", line: 1, url: "./b.md" }).kind).toBe("internal");
  });

  test("mailto / tel → skipped", () => {
    expect(classifyLink({ file: "a.md", line: 1, url: "mailto:x@y" }).kind).toBe("skipped");
    expect(classifyLink({ file: "a.md", line: 1, url: "tel:+1" }).kind).toBe("skipped");
  });
});

describe("resolveInternal", () => {
  test("resolves a file that exists relative to the source", () => {
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs", "target.md"), "");
    const ref: LinkRef = { file: path.join(tmp, "README.md"), line: 1, url: "./docs/target.md" };
    expect(resolveInternal(ref, tmp).ok).toBe(true);
  });

  test("returns ok:false for missing file", () => {
    const ref: LinkRef = { file: path.join(tmp, "README.md"), line: 1, url: "./nope.md" };
    expect(resolveInternal(ref, tmp).ok).toBe(false);
  });

  test("strips #anchor before resolving", () => {
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs", "x.md"), "");
    const ref: LinkRef = { file: path.join(tmp, "README.md"), line: 1, url: "./docs/x.md#section" };
    expect(resolveInternal(ref, tmp).ok).toBe(true);
  });

  test("absolute-from-repo-root paths starting with /", () => {
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs", "abs.md"), "");
    const ref: LinkRef = { file: path.join(tmp, "anywhere", "README.md"), line: 1, url: "/docs/abs.md" };
    expect(resolveInternal(ref, tmp).ok).toBe(true);
  });
});
