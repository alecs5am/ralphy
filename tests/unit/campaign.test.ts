// Topic campaign (#528) — schema round-trip, the mocked-LLM plan pass, the
// cell lifecycle (planned → produced → published stamps), next-cell selection
// (drains unproduced, priority order, uniform #532 seam), cross-link injection
// (sibling URLs into description/frontmatter), pending-link on late publish,
// and the coverage-report math.
//
// tmp-root + env/cwd hygiene per #545: every test runs in a fresh mkdtemp root;
// setRoot points the paths singleton at it; the prior root is restored in
// afterEach so no test leaks cwd/root state into the next.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setRoot, root as currentRoot } from "../../cli/lib/paths.js";
import {
  parseCampaign,
  CampaignSchema,
  CAMPAIGN_CHANNELS,
} from "../../cli/lib/schemas/campaign.js";
import {
  createCampaign,
  readCampaign,
  commitPlan,
  stampCellProduced,
  markCellPublished,
  nextUnproducedCell,
  unproducedCells,
  appendPendingLink,
  clearPendingLinksFor,
  listCampaigns,
} from "../../cli/lib/campaign/store.js";
import { proposeCampaignPlan, parseProposal } from "../../cli/lib/campaign/plan.js";
import {
  resolvePublishedUrl,
  resolveSiblingLinks,
  buildDescriptionLinkBlock,
  buildFrontmatterLinkBlock,
  injectDescription,
} from "../../cli/lib/campaign/crosslink.js";
import { computeCoverage } from "../../cli/lib/campaign/report.js";
import type { CallLLMResult } from "../../cli/lib/providers/types.js";

let rootDir: string;
let wsDir: string;
let savedRoot: string;

beforeEach(() => {
  savedRoot = currentRoot();
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-"));
  setRoot(rootDir);
  wsDir = path.join(rootDir, ".ralphy", "workspaces", "default");
  fs.mkdirSync(path.join(wsDir, "campaigns"), { recursive: true });
});

afterEach(() => {
  setRoot(savedRoot);
  fs.rmSync(rootDir, { recursive: true, force: true });
});

const THESES = [
  { id: "studio", statement: "ralphy is a video studio for AI agents" },
  { id: "earns", statement: "agent-made video earns money and views" },
];

function seedCampaign(id = "agent-video") {
  return createCampaign(wsDir, {
    id,
    title: "Agent Video",
    theses: THESES,
    keywords: { head: ["ai video"], longTail: ["ai agent video studio"], questions: ["how do AI agents make video"] },
  });
}

// ─── schema round-trip ───────────────────────────────────────────────────────

describe("campaign schema", () => {
  test("round-trips a full campaign through parse", () => {
    const raw = {
      version: "1.0",
      id: "agent-video",
      title: "Agent Video",
      theses: THESES,
      keywords: { head: ["ai video"], longTail: ["ai agent video studio"], questions: ["q?"] },
      inventory: [
        {
          id: "cell-01",
          thesisId: "studio",
          format: "article",
          angle: "why agents need a studio",
          keyword: "ai video",
          channel: "github-pages",
          priority: 10,
          status: "planned",
        },
      ],
      crossLink: { enabled: true, linkFormats: ["*"], maxLinks: 5 },
      pendingLinks: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      planned: true,
    };
    const parsed = parseCampaign(raw);
    expect(parsed.id).toBe("agent-video");
    expect(parsed.inventory[0]!.format).toBe("article");
    expect(parsed.inventory[0]!.channel).toBe("github-pages");
    // Re-serialize + re-parse is stable.
    expect(parseCampaign(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  test("applies defaults for a minimal campaign", () => {
    const parsed = CampaignSchema.parse({ id: "x", theses: THESES });
    expect(parsed.planned).toBe(false);
    expect(parsed.crossLink.maxLinks).toBe(5);
    expect(parsed.keywords.head).toEqual([]);
  });

  test("rejects a non-kebab id and an out-of-taxonomy channel", () => {
    expect(() => CampaignSchema.parse({ id: "Bad ID", theses: THESES })).toThrow();
    expect(CAMPAIGN_CHANNELS).toContain("github-pages");
  });
});

// ─── plan pass (mocked LLM) ──────────────────────────────────────────────────

describe("campaign plan (mocked callLLM)", () => {
  const PLAN_JSON = {
    keywords: { head: ["ai video studio"], longTail: ["ai agent video generator"], questions: ["can AI agents edit video?"] },
    inventory: [
      { id: "cell-01", thesisId: "studio", format: "article", angle: "anchor essay", keyword: "ai video studio", channel: "github-pages", priority: 10 },
      { id: "cell-02", thesisId: "earns", format: "video", angle: "revenue demo", keyword: "ai agent video generator", channel: "youtube", priority: 5 },
      // dropped: unknown thesisId.
      { id: "cell-bad", thesisId: "ghost", format: "video", angle: "x", keyword: "y", channel: "x", priority: 1 },
    ],
  };
  const mockLLM = async (): Promise<CallLLMResult> => ({ text: JSON.stringify(PLAN_JSON) }) as CallLLMResult;

  test("proposes a validated matrix + inventory, dropping bad cells", async () => {
    const campaign = seedCampaign();
    const proposal = await proposeCampaignPlan({ campaign, llmImpl: mockLLM });
    expect(proposal.inventory.length).toBe(2); // cell-bad dropped
    expect(proposal.dropped).toBe(1);
    expect(proposal.keywords.head).toEqual(["ai video studio"]);
    expect(proposal.model).toBe("anthropic/claude-sonnet-4.6");
  });

  test("parseProposal drops duplicate cell ids", () => {
    const campaign = seedCampaign();
    const dupJson = JSON.stringify({
      keywords: { head: [], longTail: [], questions: [] },
      inventory: [
        { id: "c1", thesisId: "studio", format: "video", angle: "a", keyword: "k", channel: "youtube", priority: 1 },
        { id: "c1", thesisId: "earns", format: "article", angle: "b", keyword: "k", channel: "devto", priority: 2 },
      ],
    });
    const proposal = parseProposal(dupJson, campaign, "m");
    expect(proposal.inventory.length).toBe(1);
    expect(proposal.dropped).toBe(1);
  });

  test("commit is required — plan does not write until commitPlan", async () => {
    const campaign = seedCampaign();
    const proposal = await proposeCampaignPlan({ campaign, llmImpl: mockLLM });
    // Nothing committed yet.
    expect(readCampaign(wsDir, "agent-video")!.planned).toBe(false);
    expect(readCampaign(wsDir, "agent-video")!.inventory.length).toBe(0);
    // Commit writes it.
    const committed = commitPlan(wsDir, "agent-video", { keywords: proposal.keywords, inventory: proposal.inventory });
    expect(committed.planned).toBe(true);
    expect(committed.inventory.length).toBe(2);
    // Re-commit without force refuses (idempotency guard).
    expect(() => commitPlan(wsDir, "agent-video", { keywords: proposal.keywords, inventory: proposal.inventory })).toThrow(/already planned/);
    // With force it replaces.
    expect(() => commitPlan(wsDir, "agent-video", { keywords: proposal.keywords, inventory: proposal.inventory }, { force: true })).not.toThrow();
  });

  test("throws on non-JSON model output", async () => {
    const campaign = seedCampaign();
    await expect(proposeCampaignPlan({ campaign, llmImpl: async () => ({ text: "not json" }) as CallLLMResult })).rejects.toThrow(/valid JSON/);
  });

  test("commit stamps a batch-variance profile on every cell (#529)", async () => {
    const campaign = seedCampaign();
    const proposal = await proposeCampaignPlan({ campaign, llmImpl: mockLLM });
    const committed = commitPlan(wsDir, "agent-video", { keywords: proposal.keywords, inventory: proposal.inventory });
    for (const cell of committed.inventory) {
      expect(cell.variance).toBeDefined();
      expect(cell.variance!.format).toBe(cell.format);
      expect(typeof cell.variance!.hookType).toBe("string");
      expect(cell.variance!.sectionOrder.length).toBeGreaterThan(0);
      expect(cell.variance!.targetLength).toBeGreaterThan(0);
    }
  });
});

// ─── cell lifecycle ──────────────────────────────────────────────────────────

describe("cell lifecycle", () => {
  const cells = [
    { id: "cell-01", thesisId: "studio", format: "article" as const, angle: "a", keyword: "ai video", channel: "github-pages" as const, priority: 10, status: "planned" as const },
    { id: "cell-02", thesisId: "earns", format: "video" as const, angle: "b", keyword: "ai video", channel: "youtube" as const, priority: 5, status: "planned" as const },
  ];

  function planned() {
    seedCampaign();
    return commitPlan(wsDir, "agent-video", { keywords: { head: ["ai video"], longTail: [], questions: [] }, inventory: cells });
  }

  test("planned → produced stamps linkedUnitId + producedAt", () => {
    planned();
    const after = stampCellProduced(wsDir, "agent-video", "cell-01", "agent-video-001/hero");
    const cell = after.inventory.find((c) => c.id === "cell-01")!;
    expect(cell.status).toBe("produced");
    expect(cell.linkedUnitId).toBe("agent-video-001/hero");
    expect(typeof cell.producedAt).toBe("string");
  });

  test("produced → published stamp", () => {
    planned();
    stampCellProduced(wsDir, "agent-video", "cell-01", "agent-video-001/hero");
    const after = markCellPublished(wsDir, "agent-video", "cell-01");
    expect(after.inventory.find((c) => c.id === "cell-01")!.status).toBe("published");
  });

  test("publishing a still-planned cell is rejected", () => {
    planned();
    expect(() => markCellPublished(wsDir, "agent-video", "cell-02")).toThrow(/still planned/);
  });
});

// ─── next-cell selection ─────────────────────────────────────────────────────

describe("next-cell selection", () => {
  const cells = [
    { id: "low", thesisId: "studio", format: "video" as const, angle: "a", keyword: "k", channel: "youtube" as const, priority: 1, status: "planned" as const },
    { id: "high", thesisId: "studio", format: "article" as const, angle: "b", keyword: "k", channel: "github-pages" as const, priority: 9, status: "planned" as const },
    { id: "mid", thesisId: "earns", format: "video" as const, angle: "c", keyword: "k", channel: "tiktok" as const, priority: 5, status: "planned" as const },
  ];

  function planned() {
    seedCampaign();
    return commitPlan(wsDir, "agent-video", { keywords: { head: ["k"], longTail: [], questions: [] }, inventory: cells });
  }

  test("drains by priority DESC then plan order (the uniform #532 baseline)", () => {
    const c = planned();
    expect(nextUnproducedCell(c)!.id).toBe("high");
    expect(unproducedCells(c).map((x) => x.id)).toEqual(["high", "mid", "low"]);
  });

  test("skips produced cells", () => {
    planned();
    const c = stampCellProduced(wsDir, "agent-video", "high", "p/u");
    expect(nextUnproducedCell(c)!.id).toBe("mid");
    expect(unproducedCells(c).map((x) => x.id)).toEqual(["mid", "low"]);
  });

  test("exhausted plan → null / empty", () => {
    let c = planned();
    for (const id of ["high", "mid", "low"]) c = stampCellProduced(wsDir, "agent-video", id, `p/${id}`);
    expect(nextUnproducedCell(c)).toBeNull();
    expect(unproducedCells(c)).toEqual([]);
  });
});

// ─── cross-linking ───────────────────────────────────────────────────────────

/** Write a minimal published unit under the project's units/<slug>/. */
function writeUnit(projectId: string, slug: string, publishUrl: string | null, opts: { views?: number } = {}) {
  const unitDir = path.join(wsDir, "projects", projectId, "units", slug);
  fs.mkdirSync(unitDir, { recursive: true });
  const manifest: Record<string, unknown> = {
    slug,
    format: "video",
    media: ["a.mp4"],
    created: "2026-07-06T00:00:00.000Z",
    publish: publishUrl
      ? [{ target: "github-pages", integrationId: null, postId: "p1", url: publishUrl, status: "published", scheduleAt: null, at: "2026-07-06T00:00:00.000Z", backend: "postiz" }]
      : [],
  };
  fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify(manifest, null, 2));
  if (opts.views !== undefined) {
    fs.writeFileSync(
      path.join(unitDir, "analytics.jsonl"),
      JSON.stringify({ at: "2026-07-07T00:00:00.000Z", unitSlug: slug, target: "youtube", postId: "p1", source: "youtube-analytics", metrics: { views: opts.views } }) + "\n",
    );
  }
}

describe("cross-link injection", () => {
  test("resolvePublishedUrl prefers a record url, else postId", () => {
    expect(resolvePublishedUrl({ publish: [{ status: "published", url: "https://x/1", postId: "p1" }] } as never)).toBe("https://x/1");
    expect(resolvePublishedUrl({ publish: [{ status: "published", url: null, postId: "p1" }] } as never)).toBe("p1");
    expect(resolvePublishedUrl({ publish: [{ status: "failed", url: "https://x", postId: "p1" }] } as never)).toBeNull();
    expect(resolvePublishedUrl({ publish: [] } as never)).toBeNull();
  });

  test("resolves sibling URLs from published linked units + injects into description", async () => {
    seedCampaign();
    const cells = [
      { id: "the-video", thesisId: "studio", format: "video" as const, angle: "v", keyword: "k", channel: "youtube" as const, priority: 5, status: "produced" as const, linkedUnitId: "vid-001/hero" },
      { id: "the-article", thesisId: "studio", format: "article" as const, angle: "a", keyword: "k", channel: "github-pages" as const, priority: 9, status: "published" as const, linkedUnitId: "art-001/post" },
    ];
    const c = commitPlan(wsDir, "agent-video", { keywords: { head: ["k"], longTail: [], questions: [] }, inventory: cells });
    writeUnit("art-001", "post", "https://blog/post"); // the article is published
    writeUnit("vid-001", "hero", null); // the video is not published yet

    // From the video cell's POV, the article sibling has a URL.
    const links = await resolveSiblingLinks(c, c.inventory.find((x) => x.id === "the-video")!);
    expect(links.length).toBe(1);
    expect(links[0]!.url).toBe("https://blog/post");
    expect(links[0]!.format).toBe("article");

    const desc = injectDescription("Watch this demo.", links);
    expect(desc).toContain("Watch this demo.");
    expect(desc).toContain("Related in this series:");
    expect(desc).toContain("https://blog/post");

    // Frontmatter fragment for the article side.
    expect(buildFrontmatterLinkBlock(links)).toContain("related:");
    expect(buildFrontmatterLinkBlock(links)).toContain('"https://blog/post"');

    // From the article cell's POV, the (unpublished) video has NO URL → no link.
    const fromArticle = await resolveSiblingLinks(c, c.inventory.find((x) => x.id === "the-article")!);
    expect(fromArticle.length).toBe(0);
  });

  test("empty links produce empty blocks (no dangling header)", () => {
    expect(buildDescriptionLinkBlock([])).toBe("");
    expect(buildFrontmatterLinkBlock([])).toBe("");
    expect(injectDescription("body", [])).toBe("body");
  });

  test("linkFormats policy filters which siblings link", async () => {
    seedCampaign();
    const cells = [
      { id: "target", thesisId: "studio", format: "video" as const, angle: "v", keyword: "k", channel: "youtube" as const, priority: 5, status: "produced" as const, linkedUnitId: "vid/u" },
      { id: "art", thesisId: "studio", format: "article" as const, angle: "a", keyword: "k", channel: "github-pages" as const, priority: 9, status: "published" as const, linkedUnitId: "art/u" },
    ];
    // Policy: only link to `video` siblings — so the article sibling is excluded.
    fs.mkdirSync(path.join(wsDir, "campaigns", "agent-video"), { recursive: true });
    const c0 = readCampaign(wsDir, "agent-video")!;
    fs.writeFileSync(
      path.join(wsDir, "campaigns", "agent-video", "campaign.json"),
      JSON.stringify({ ...c0, crossLink: { enabled: true, linkFormats: ["video"], maxLinks: 5 } }, null, 2),
    );
    commitPlan(wsDir, "agent-video", { keywords: { head: ["k"], longTail: [], questions: [] }, inventory: cells });
    writeUnit("art", "u", "https://blog/x");
    const c = readCampaign(wsDir, "agent-video")!;
    const links = await resolveSiblingLinks(c, c.inventory.find((x) => x.id === "target")!);
    expect(links.length).toBe(0); // article excluded by policy
  });
});

// ─── pending-link on late publish ────────────────────────────────────────────

describe("pending links (late publish)", () => {
  test("append + clear a pending link for a target cell", () => {
    seedCampaign();
    let c = appendPendingLink(wsDir, "agent-video", { targetCellId: "cell-01", sourceCellId: "cell-02", url: "https://late/link" });
    expect(c.pendingLinks.length).toBe(1);
    expect(c.pendingLinks[0]!.targetCellId).toBe("cell-01");
    expect(typeof c.pendingLinks[0]!.recordedAt).toBe("string");
    c = clearPendingLinksFor(wsDir, "agent-video", "cell-01");
    expect(c.pendingLinks.length).toBe(0);
  });

  test("clear only affects the named target cell", () => {
    seedCampaign();
    appendPendingLink(wsDir, "agent-video", { targetCellId: "a", sourceCellId: "s", url: "u1" });
    appendPendingLink(wsDir, "agent-video", { targetCellId: "b", sourceCellId: "s", url: "u2" });
    const c = clearPendingLinksFor(wsDir, "agent-video", "a");
    expect(c.pendingLinks.map((l) => l.targetCellId)).toEqual(["b"]);
  });
});

// ─── coverage report math ────────────────────────────────────────────────────

describe("coverage report", () => {
  test("counts planned / produced / published / indexed-hint honestly", async () => {
    seedCampaign();
    const cells = [
      { id: "c1", thesisId: "studio", format: "article" as const, angle: "a", keyword: "ai video", channel: "github-pages" as const, priority: 9, status: "planned" as const },
      { id: "c2", thesisId: "studio", format: "video" as const, angle: "b", keyword: "ai video", channel: "youtube" as const, priority: 5, status: "produced" as const, linkedUnitId: "p/produced" },
      { id: "c3", thesisId: "earns", format: "video" as const, angle: "c", keyword: "ai agent video studio", channel: "tiktok" as const, priority: 3, status: "produced" as const, linkedUnitId: "p/published" },
    ];
    commitPlan(wsDir, "agent-video", {
      keywords: { head: ["ai video"], longTail: ["ai agent video studio"], questions: ["q?"] },
      inventory: cells,
    });
    writeUnit("p", "produced", null); // produced, not published
    writeUnit("p", "published", "https://x/pub", { views: 4200 }); // published + analytics views > 0

    const cov = await computeCoverage(readCampaign(wsDir, "agent-video")!);
    expect(cov.counts.planned).toBe(3);
    expect(cov.counts.produced).toBe(2);
    expect(cov.counts.published).toBe(1); // only p/published has a publish URL
    expect(cov.counts.indexedHint).toBe(1); // + analytics views > 0
    // keyword occupancy: head "ai video" used, long-tail used, question NOT.
    expect(cov.keywordOccupancy).toEqual({ head: 1, longTail: 1, questions: 0 });
    const pubRow = cov.rows.find((r) => r.cellId === "c3")!;
    expect(pubRow.publishedUrl).toBe("https://x/pub");
    expect(pubRow.indexedHint).toBe(true);
  });

  test("never claims coverage without a real publish record", async () => {
    seedCampaign();
    const cells = [
      { id: "c1", thesisId: "studio", format: "video" as const, angle: "a", keyword: "k", channel: "youtube" as const, priority: 1, status: "produced" as const, linkedUnitId: "p/u" },
    ];
    commitPlan(wsDir, "agent-video", { keywords: { head: ["k"], longTail: [], questions: [] }, inventory: cells });
    writeUnit("p", "u", null); // produced but never published, no analytics
    const cov = await computeCoverage(readCampaign(wsDir, "agent-video")!);
    expect(cov.counts.produced).toBe(1);
    expect(cov.counts.published).toBe(0);
    expect(cov.counts.indexedHint).toBe(0);
  });
});

// ─── store misc ──────────────────────────────────────────────────────────────

describe("campaign store", () => {
  test("create refuses a duplicate id; list enumerates", () => {
    seedCampaign();
    expect(() => seedCampaign()).toThrow(/already exists/);
    seedCampaign("second");
    expect(listCampaigns(wsDir).sort()).toEqual(["agent-video", "second"]);
  });
});
