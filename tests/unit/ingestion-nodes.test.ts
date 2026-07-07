// Ingestion nodes + trend-watch delta (#500) — zero-network unit tests.
//
// HTTP is injected through the ExecutorContext.fetchImpl seam; provider keys
// are set/unset on process.env per test (the connectors read them inside
// their own sanctioned files). Feeds run offline from fixture files.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getExecutor,
  registeredExecutorTypes,
  NodeExecutionError,
  type ExecutorContext,
} from "../../cli/lib/workflow/executors/index.js";
import {
  normalizeFirecrawl,
  normalizeApifyItems,
  normalizeRss,
  type SourceItem,
} from "../../cli/lib/schemas/source-item.js";
import { parseFeed } from "../../cli/lib/ingestion/rss.js";
import {
  readCursor,
  seenPath,
  cursorPath,
  parseWindow,
  itemHash,
  loadSeen,
  appendSeen,
  filterFresh,
} from "../../cli/lib/ingestion/store.js";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

const FIXTURES = path.resolve(__dirname, "..", "fixtures", "ingestion");
const NOW = "2026-07-05T00:00:00.000Z";

let dir: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-"));
  for (const k of ["FIRECRAWL_API_KEY", "APIFY_TOKEN"]) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function makeCtx(over: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    workspace: "test",
    workspaceDir: dir,
    artifactsDir: path.join(dir, "artifacts"),
    inputs: {},
    log: async () => {},
    reportCost: () => {},
    ...over,
  };
}

function makeNode(type: WorkflowNodeType, params: Record<string, unknown>, id = "n1"): WorkflowNode {
  return { id, type, in: {}, params, retry: { max: 0, backoff: "exponential" }, on_fail: "halt", cache: "none", emit: true };
}

function run(node: WorkflowNode, ctx: ExecutorContext) {
  const exec = getExecutor(node.type);
  if (!exec) throw new Error(`no executor for ${node.type}`);
  return exec(node, ctx);
}

/** Route fetches by URL substring → JSON body. Throws on an unrouted URL. */
function mockFetch(routes: Array<[string, unknown]>): typeof fetch {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const hit = routes.find(([frag]) => url.includes(frag));
    if (!hit) throw new Error(`unrouted fetch in test: ${url}`);
    return new Response(JSON.stringify(hit[1]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  (f as unknown as { calls: string[] }).calls = calls;
  return f;
}

const readFixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf8");
const readJsonFixture = (name: string) => JSON.parse(readFixture(name));

describe("executor registry (#500)", () => {
  test("the five ingestion/dedup node types are registered; http is registered too (#520)", () => {
    const types = registeredExecutorTypes();
    for (const t of ["web-scrape", "actor", "rss", "trend-watch", "dedup"]) {
      expect(types).toContain(t as WorkflowNodeType);
    }
    // #520 gave the generic `http` node its allowlisted executor.
    expect(types).toContain("http" as WorkflowNodeType);
  });
});

describe("rss parser + normalizer", () => {
  test("parses RSS 2.0: title/link/pubDate/description, CDATA + entities decoded", () => {
    const items = parseFeed(readFixture("rss2.xml"));
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: "GPU prices drop & supply recovers",
      link: "https://example.com/blog/gpu-prices",
      ts: "2026-07-01T09:30:00.000Z",
      text: "Wholesale GPU prices fell 18% quarter-over-quarter.",
    });
    expect(items[1].text).toBe('The 7B release tops the "hard" eval suite.');
  });

  test("parses Atom: link href (rel=alternate preferred), published/updated, summary/content", () => {
    const items = parseFeed(readFixture("atom.xml"));
    expect(items).toHaveLength(2);
    expect(items[0].link).toBe("https://example.org/2026/07/json-view");
    expect(items[0].ts).toBe("2026-07-03T10:15:00.000Z");
    expect(items[0].text).toBe("The stable channel now pretty-prints JSON responses.");
    expect(items[1].link).toBe("https://example.org/2026/07/cron-triggers");
    expect(items[1].ts).toBe("2026-07-04T08:00:00.000Z"); // updated fallback
  });

  test("normalizeRss stamps backend + feed provenance and falls back ts → now", () => {
    const out = normalizeRss([{ title: "t", link: "https://a", text: "" }], { feed: "f.xml" }, NOW);
    expect(out[0].source).toEqual({ backend: "rss", feed: "f.xml" });
    expect(out[0].ts).toBe(NOW);
  });
});

describe("firecrawl normalizer", () => {
  test("search rows normalize; a row without url is dropped", () => {
    const payload = readJsonFixture("firecrawl-search.json").data.web;
    const items = normalizeFirecrawl(payload, { query: "ai video" }, NOW);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      url: "https://news.example.com/ai-video-tools",
      title: "Five AI video tools compared",
      text: "A hands-on comparison of the current AI video generators.",
      ts: NOW,
      source: { backend: "firecrawl", query: "ai video" },
    });
  });

  test("scrape document normalizes from metadata (sourceURL, title, publishedTime)", () => {
    const doc = readJsonFixture("firecrawl-scrape.json").data;
    const items = normalizeFirecrawl(doc, {}, NOW);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://example.com/launch-notes");
    expect(items[0].title).toBe("Launch notes");
    expect(items[0].ts).toBe("2026-06-30T08:00:00.000Z");
    expect(items[0].text).toContain("Launch notes");
  });
});

describe("apify normalizer", () => {
  test("maps common actor field spellings incl engagement; url-less rows dropped", () => {
    const items = normalizeApifyItems(readJsonFixture("apify-items.json"), { actor: "u/tw" }, NOW);
    expect(items).toHaveLength(2);
    expect(items[0].url).toBe("https://x.example.com/user/status/123");
    expect(items[0].title).toBe("Shipping day: the agent farm renders its first batch.");
    expect(items[0].engagement).toEqual({ views: 15400, likes: 320, shares: 41, comments: 12 });
    expect(items[1].url).toBe("https://video.example.com/@creator/video/999");
    expect(items[1].engagement).toEqual({ views: 98000, likes: 8700, shares: 450, comments: 210 });
    expect(items[1].source).toEqual({ backend: "apify", actor: "u/tw" });
  });
});

describe("rss executor (native, keyless, offline)", () => {
  test("reads fixture feed files, emits normalized source-item[], writes the artifact", async () => {
    const ctx = makeCtx();
    const node = makeNode("rss", { feeds: [path.join(FIXTURES, "rss2.xml")] });
    const res = await run(node, ctx);
    const items = res.output as SourceItem[];
    expect(items).toHaveLength(2);
    expect(items[0].source).toEqual({ backend: "rss", feed: path.join(FIXTURES, "rss2.xml") });
    expect(JSON.parse(fs.readFileSync(res.artifactPath!, "utf8"))).toHaveLength(2);
  });

  test("params.since filters older items (stateless cutoff)", async () => {
    const node = makeNode("rss", {
      feeds: [path.join(FIXTURES, "rss2.xml")],
      since: "2026-07-02T00:00:00.000Z",
    });
    const res = await run(node, makeCtx());
    expect((res.output as SourceItem[]).map((i) => i.url)).toEqual([
      "https://example.com/blog/open-weights",
    ]);
  });

  test("missing feeds param is a structured error", async () => {
    const err = await run(makeNode("rss", {}), makeCtx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("params-invalid");
  });
});

describe("web-scrape executor (firecrawl)", () => {
  test("missing FIRECRAWL_API_KEY is a structured provider-key-missing error, not a crash", async () => {
    const err = await run(makeNode("web-scrape", { query: "x" }), makeCtx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("provider-key-missing");
    expect((err as NodeExecutionError).message).toContain("FIRECRAWL_API_KEY");
  });

  test("mode search: hits /v2/search through the fetch seam and normalizes", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const f = mockFetch([["api.firecrawl.dev/v2/search", readJsonFixture("firecrawl-search.json")]]);
    const res = await run(
      makeNode("web-scrape", { mode: "search", query: "ai video" }),
      makeCtx({ fetchImpl: f }),
    );
    const items = res.output as SourceItem[];
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.source.backend === "firecrawl")).toBe(true);
    expect((f as unknown as { calls: string[] }).calls[0]).toContain("https://api.firecrawl.dev/v2/search");
  });

  test("mode scrape: one document per url", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const f = mockFetch([["api.firecrawl.dev/v2/scrape", readJsonFixture("firecrawl-scrape.json")]]);
    const res = await run(
      makeNode("web-scrape", { mode: "scrape", urls: ["https://example.com/launch-notes"] }),
      makeCtx({ fetchImpl: f }),
    );
    expect((res.output as SourceItem[])[0].url).toBe("https://example.com/launch-notes");
  });
});

describe("actor executor (apify)", () => {
  test("missing APIFY_TOKEN is a structured provider-key-missing error", async () => {
    const err = await run(makeNode("actor", { actor_id: "u/scraper" }), makeCtx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("provider-key-missing");
    expect((err as NodeExecutionError).message).toContain("APIFY_TOKEN");
  });

  test("runs the actor, polls to SUCCEEDED, fetches dataset items, normalizes", async () => {
    process.env.APIFY_TOKEN = "test-token";
    const f = mockFetch([
      ["/v2/acts/u~scraper/runs", { data: { id: "run1", status: "RUNNING" } }],
      ["/v2/actor-runs/run1", { data: { id: "run1", status: "SUCCEEDED", defaultDatasetId: "ds1" } }],
      ["/v2/datasets/ds1/items", readJsonFixture("apify-items.json")],
    ]);
    const res = await run(
      makeNode("actor", { actor_id: "u/scraper", input: { q: "x" }, poll_interval_ms: 0 }),
      makeCtx({ fetchImpl: f }),
    );
    const items = res.output as SourceItem[];
    expect(items).toHaveLength(2);
    expect(items[0].source).toEqual({ backend: "apify", actor: "u/scraper" });
  });
});

describe("seen-store + dedup window", () => {
  test("parseWindow: 14d / 12h / 30m; garbage throws", () => {
    expect(parseWindow("14d")).toBe(14 * 864e5);
    expect(parseWindow("12h")).toBe(12 * 36e5);
    expect(parseWindow("30m")).toBe(30 * 6e4);
    expect(() => parseWindow("fortnight")).toThrow(/invalid dedup window/);
  });

  test("seen.jsonl is append-only; entries outside the window stop counting as dups", () => {
    const item: SourceItem = { url: "https://a/1", title: "T", text: "", ts: NOW, source: { backend: "rss" } };
    appendSeen(dir, [item], "2026-06-01T00:00:00.000Z");
    const now = Date.parse("2026-07-01T00:00:00.000Z");
    const inWindow = loadSeen(dir, parseWindow("60d"), now);
    expect(filterFresh([item], inWindow)).toHaveLength(0); // still a dup
    const expired = loadSeen(dir, parseWindow("7d"), now);
    expect(filterFresh([item], expired)).toHaveLength(1); // window passed → fresh again
    expect(fs.readFileSync(seenPath(dir), "utf8").trim().split("\n")).toHaveLength(1);
  });

  test("itemHash is content-based: normalized url+title match regardless of case/whitespace", () => {
    const a = { url: "https://A.com/x ", title: " Hello " };
    const b = { url: "https://a.com/x", title: "hello" };
    expect(itemHash(a)).toBe(itemHash(b));
  });
});

describe("dedup executor", () => {
  const items = (): SourceItem[] => [
    { url: "https://a/1", title: "One", text: "", ts: NOW, source: { backend: "rss" } },
    { url: "https://a/2", title: "Two", text: "", ts: NOW, source: { backend: "rss" } },
  ];

  test("same items across two ticks are emitted once (persistent seen-store)", async () => {
    const node = makeNode("dedup", {});
    const first = await run(node, makeCtx({ inputs: { items: items() } }));
    expect(first.output as SourceItem[]).toHaveLength(2);
    const second = await run(node, makeCtx({ inputs: { items: items() } }));
    expect(second.output as SourceItem[]).toHaveLength(0);
    expect(second.artifactPath).toBeUndefined(); // empty delta writes nothing
  });

  test("malformed in-port payload is a structured error", async () => {
    const err = await run(makeNode("dedup", {}), makeCtx({ inputs: { items: [{ nope: 1 }] } })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("input-invalid");
  });
});

describe("trend-watch executor (composite delta)", () => {
  const feedPath = () => path.join(dir, "feed.xml");
  const node = () =>
    makeNode("trend-watch", {
      topics: [{ id: "gpu", feeds: [feedPath()] }],
      schedule: "0 * * * *", // stored only — the #503 runner fires ticks
      dedup_window: "14d",
    });

  test("tick 1 emits all items, advances the cursor, appends to seen.jsonl; tick 2 (unchanged feed) is an empty no-op delta", async () => {
    fs.copyFileSync(path.join(FIXTURES, "rss2.xml"), feedPath());
    const ctx = makeCtx();

    const tick1 = await run(node(), ctx);
    expect(tick1.output as SourceItem[]).toHaveLength(2);
    expect(tick1.artifactPath).toBeDefined();
    expect(readCursor(dir).gpu).toBe("2026-07-02T14:00:00.000Z"); // max item ts
    const seenLines = fs.readFileSync(seenPath(dir), "utf8").trim().split("\n");
    expect(seenLines).toHaveLength(2);

    const tick2 = await run(node(), ctx);
    expect(tick2.output).toEqual([]);
    expect(tick2.artifactPath).toBeUndefined(); // no artifact on empty delta
    // no store writes on an empty delta:
    expect(fs.readFileSync(seenPath(dir), "utf8").trim().split("\n")).toHaveLength(2);
    expect(readCursor(dir).gpu).toBe("2026-07-02T14:00:00.000Z");
  });

  test("a newer item appearing in the feed is the ONLY thing the next tick emits (cursor + dedup compose)", async () => {
    fs.copyFileSync(path.join(FIXTURES, "rss2.xml"), feedPath());
    const ctx = makeCtx();
    await run(node(), ctx);

    const withNew = readFixture("rss2.xml").replace(
      "</channel>",
      `<item>
        <title>Breaking: new item</title>
        <link>https://example.com/blog/breaking</link>
        <pubDate>Fri, 03 Jul 2026 10:00:00 GMT</pubDate>
        <description>Fresh since the last tick.</description>
      </item></channel>`,
    );
    fs.writeFileSync(feedPath(), withNew);

    const tick = await run(node(), ctx);
    const items = tick.output as SourceItem[];
    expect(items.map((i) => i.url)).toEqual(["https://example.com/blog/breaking"]);
    expect(readCursor(dir).gpu).toBe("2026-07-03T10:00:00.000Z");
    expect(fs.readFileSync(seenPath(dir), "utf8").trim().split("\n")).toHaveLength(3);
  });

  test("a topic with a query but no FIRECRAWL_API_KEY errors structurally", async () => {
    const n = makeNode("trend-watch", { topics: [{ id: "t", query: "ai" }] });
    const err = await run(n, makeCtx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("provider-key-missing");
  });

  test("cursor.json path is workspace-scoped under ingestion/", () => {
    expect(cursorPath(dir)).toBe(path.join(dir, "ingestion", "cursor.json"));
    expect(seenPath(dir)).toBe(path.join(dir, "ingestion", "seen.jsonl"));
  });
});
