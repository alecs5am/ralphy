import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { exportWorkspacePackage, importWorkspacePackage } from "../../cli/lib/store/portable.js";
import { getNiche, loadNicheMembers } from "../../cli/lib/store/trend-niches.js";
import { listWatchlists } from "../../cli/lib/store/trends.js";
import { refresh, type TrendDeps } from "../../cli/lib/trends/ingest.js";
import { DAY_MS, HOUR_MS } from "../../cli/lib/trends/math.js";
import { nicheSettings, parseNicheSeedFile } from "../../cli/lib/trends/niche.js";
import { nicheInit, type NicheInitOptions } from "../../cli/lib/trends/niche-onboard.js";
import { buildNicheReport, renderNicheReportMarkdown } from "../../cli/lib/trends/niche-report.js";
import type { TiktokProfileOpener } from "../../cli/lib/trends/sources/tiktok.js";
import type { YtdlpRunner } from "../../cli/lib/trends/sources/ytdlp.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let tmp: TmpRoot;
let workspaceId: string;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-niche");
  workspaceId = createWorkspace({ slug: "corpus", name: "Corpus" }).id;
});
afterEach(() => {
  closeDomainDb();
  tmp.cleanup();
});

const SEEDS = parseNicheSeedFile({
  topic: "psychology",
  languages: ["en"],
  lexicon: { en: { core: ["psycholog*", "anxi*", "narcissis*", "therap*", "mental health"], support: ["brain", "habits"], negative: [] } },
  subNiches: [
    { slug: "anxiety", label: "Anxiety", terms: ["anxi*"] },
    { slug: "dark-psychology", label: "Dark psychology", terms: ["narcissis*"] },
  ],
  seeds: [
    { platform: "youtube", kind: "keyword", value: "anxiety tips" },
    { platform: "youtube", kind: "hashtag", value: "psychology" },
    { platform: "tiktok", kind: "hashtag", value: "psychologytok" },
  ],
});

const CALM = "MS4wLjABAAAAfixtureCalmMindSecUid0123456789abcdefghijk";
const HELPER = "MS4wLjABAAAAfixtureHelperMindSecUid0123456789abcdefgh";

type Channel = { id: string; handle: string; followers: number; title: (i: number) => string; description?: string; shorts?: boolean };
const CHANNELS: Record<string, Channel> = {
  UCpsychAAAAAAAAAAAAAAAAAAA: { id: "UCpsychAAAAAAAAAAAAAAAAAAA", handle: "@psychA", followers: 4_000, title: (i) => `Why anxiety spikes at night ${i} #anxietyrelief` },
  UCpsychBBBBBBBBBBBBBBBBBBB: { id: "UCpsychBBBBBBBBBBBBBBBBBBB", handle: "@psychB", followers: 250_000, title: (i) => `Narcissist sign number ${i}${i < 5 ? " #anxietyrelief" : ""}`, description: "Licensed therapist. Contact me at someone@example.com TikTok: @calm.mind" },
  UCtravelTTTTTTTTTTTTTTTTTT: { id: "UCtravelTTTTTTTTTTTTTTTTTT", handle: "@wanderer", followers: 80_000, title: (i) => `Day ${i} of my road trip across the coast` },
  UCnoshortsNNNNNNNNNNNNNNNN: { id: "UCnoshortsNNNNNNNNNNNNNNNN", handle: "@longform", followers: 1_000_000, title: () => "x", shorts: false },
  UCpsychCCCCCCCCCCCCCCCCCCC: { id: "UCpsychCCCCCCCCCCCCCCCCCCC", handle: "@psychC", followers: 30_000, title: (i) => `Psychology of habits part ${i}` },
};

const shortId = (channel: string, i: number) => `${channel.slice(2, 8)}${String(i).padStart(5, "0")}`.slice(0, 11).padEnd(11, "x");

function ytdlpFake(calls: string[], now: () => number): YtdlpRunner {
  return async (args) => {
    const target = args.at(-1)!;
    calls.push(target);
    const lines = (entries: object[]) => ({ code: 0, stdout: entries.map((entry) => JSON.stringify(entry)).join("\n"), stderr: "", ms: 1, timedOut: false });
    const seed = (id: string) => ({ id: `${id.slice(2, 13)}`.padEnd(11, "s"), channel_id: id, channel: CHANNELS[id]!.handle.slice(1), uploader_id: CHANNELS[id]!.handle });
    if (target.startsWith("ytsearch")) return lines([seed("UCpsychAAAAAAAAAAAAAAAAAAA"), seed("UCtravelTTTTTTTTTTTTTTTTTT"), seed("UCnoshortsNNNNNNNNNNNNNNNN")]);
    if (target.endsWith("/hashtag/psychology")) return lines([seed("UCpsychBBBBBBBBBBBBBBBBBBB")]);
    if (target.endsWith("/hashtag/anxietyrelief")) return lines([seed("UCpsychCCCCCCCCCCCCCCCCCCC")]);
    if (target.includes("/hashtag/")) return lines([]);
    const shorts = /youtube\.com\/(?:channel\/([^/]+)|(@[^/]+))\/shorts$/.exec(target);
    if (shorts) {
      const channel = Object.values(CHANNELS).find((entry) => entry.id === shorts[1] || entry.handle.toLowerCase() === shorts[2]?.toLowerCase());
      if (!channel) return { code: 1, stdout: "", stderr: "ERROR: [youtube:tab] 404 not found", ms: 1, timedOut: false };
      if (channel.shorts === false) return { code: 1, stdout: "", stderr: "ERROR: [youtube:tab] This channel does not have a shorts tab", ms: 1, timedOut: false };
      return lines([
        { _type: "playlist", id: channel.id, channel: channel.handle.slice(1), channel_id: channel.id, uploader_id: channel.handle, channel_follower_count: channel.followers, description: channel.description ?? null },
        ...Array.from({ length: 30 }, (_, i) => ({ id: shortId(channel.id, i), title: channel.title(i), view_count: i === 3 ? 900_000 : 20_000 + i * 100 })),
      ]);
    }
    if (target.startsWith("tiktokuser:")) {
      const secUid = target.slice("tiktokuser:".length);
      const prefix = secUid === CALM ? "781" : "782";
      const today = Math.floor(now() / DAY_MS);
      return lines(Array.from({ length: 40 }, (_, index) => {
        const day = today - index - 1;
        return {
          id: `${prefix}${String(day).padStart(8, "0")}`,
          uploader: secUid === CALM ? "calm.mind" : "helper.mind",
          channel_id: secUid,
          timestamp: Math.floor((day * DAY_MS + 12 * HOUR_MS) / 1000),
          duration: 35,
          view_count: index === 5 ? 600_000 : 2_000 + (day % 7) * 50,
          like_count: 100,
          comment_count: 5,
          repost_count: 2,
          save_count: 3,
          description: secUid === CALM ? `Therapist tip on anxiety ${index} #psychologytok stitch with @helper.mind` : `Psychology of habits ${index}`,
          track: "original sound",
        };
      }));
    }
    return { code: 1, stdout: "", stderr: `ERROR: unexpected ${target}`, ms: 1, timedOut: false };
  };
}

function profilesFake(resolved: string[]): TiktokProfileOpener {
  const profiles: Record<string, { secUid: string; followers: number; signature: string }> = {
    "calm.mind": { secUid: CALM, followers: 12_000, signature: "Therapist. Anxiety and boundaries." },
    "helper.mind": { secUid: HELPER, followers: 2_500, signature: "Psychology student" },
  };
  return async () => ({
    async resolve(handle) {
      resolved.push(handle);
      const profile = profiles[handle];
      if (!profile) return { outcome: { kind: "failed", reason: "creator", detail: "profile not found (statusCode 10221)" }, profile: null, ms: 1 };
      return {
        outcome: { kind: "ok" },
        profile: { secUid: profile.secUid, uniqueId: handle, nickname: handle, signature: profile.signature, followers: profile.followers, videoCount: 40, hearts: 1000, privateAccount: false, region: "US" },
        ms: 1,
      };
    },
    async close() {},
  });
}

function setup() {
  const clock = { now: Date.UTC(2026, 9, 28, 12) };
  const ytCalls: string[] = [];
  const resolved: string[] = [];
  const deps: TrendDeps = {
    ytdlp: ytdlpFake(ytCalls, () => clock.now),
    capture: async () => ({ bodies: [], pageBlock: null, region: null, ms: 1 }),
    tiktokProfiles: profilesFake(resolved),
    now: () => clock.now,
  };
  const options: NicheInitOptions = {
    workspaceId,
    seedFile: SEEDS,
    seedSource: "file",
    settings: nicheSettings({ targetCreators: 50, maxRounds: 4, timeBudgetMinutes: 45 }),
    perCreator: 60,
    concurrency: 1,
    searchDepth: 20,
    hashtagDepth: 20,
    budget: 200,
    profileBudget: 50,
    youtubeDateBudget: 0,
    guessHandles: true,
    expansionHashtags: 4,
    expansionHandles: 20,
    llmRelevance: false,
  };
  return { clock, deps, options, ytCalls, resolved };
}

const creatorRow = (handle: string) =>
  openDomainDb().query<{ niche: string | null; sub_niche: string | null; tier: string; last_list_error: string | null }, [string]>(
    "SELECT niche, sub_niche, tier, last_list_error FROM trend_creators WHERE handle = ?",
  ).get(handle);

describe("niche init", () => {
  test("persists the niche and its seed list on watchlists; a re-run adds nothing", async () => {
    const { deps, options } = setup();
    const first = await nicheInit(options, deps);
    const niche = getNiche({ workspaceId, ref: "psychology" })!;
    expect(niche).toMatchObject({ slug: "psychology", topic: "psychology", languages: ["en"], seedSource: "file" });
    expect(niche.taxonomy.subNiches.map((sub) => sub.slug)).toEqual(["anxiety", "dark-psychology"]);
    const seeds = listWatchlists({ workspaceId }).filter((row) => row.niche === "psychology");
    expect(seeds.map((row) => `${row.platform}:${row.kind}:${row.value}:${row.source}`)).toEqual(expect.arrayContaining([
      "youtube:keyword:anxiety tips:youtube-search",
      "youtube:hashtag:psychology:youtube-hashtag",
      "youtube:hashtag:anxietyrelief:youtube-hashtag",
      "tiktok:related:calm.mind:niche-tiktok-profile",
    ]));
    expect(first.skipped.some((line) => /tiktok hashtag psychologytok/.test(line))).toBe(true);
    const members = loadNicheMembers({ nicheId: niche.id }).length;
    const watchlists = listWatchlists({ workspaceId, includeInactive: true }).length;
    const second = await nicheInit(options, deps);
    expect(loadNicheMembers({ nicheId: niche.id }).length).toBe(members);
    expect(listWatchlists({ workspaceId, includeInactive: true }).length).toBe(watchlists);
    expect(second.rounds[0]!.candidatesAdded).toBe(0);
  });

  test("snowballs through bio links, mentions, and co-hashtags; the gate keeps on-topic creators only", async () => {
    const { deps, options, resolved } = setup();
    const summary = await nicheInit(options, deps);
    expect(summary.rounds.length).toBeGreaterThanOrEqual(3);
    expect(summary.rounds[0]!.gate).toMatchObject({ kept: 2 });
    // Round 1 found the TikTok handle named in a channel description and the co-hashtag channel.
    expect(resolved).toEqual(expect.arrayContaining(["calm.mind", "psycha", "psychb", "helper.mind"]));
    const kept = loadNicheMembers({ nicheId: summary.nicheId, statuses: ["kept"] }).map((member) => member.handle).sort();
    expect(kept).toEqual(["@psychA", "@psychB", "@psychC", "calm.mind", "helper.mind"]);
    expect(summary.stopReason).toMatch(/no-expansion-seeds|growth-below-5pct/);
    // Kept creators take the open niche; off-topic ones are never stamped and leave the refresh rotation.
    expect(creatorRow("@psychB")).toMatchObject({ niche: "psychology", sub_niche: "dark-psychology", tier: "active" });
    expect(creatorRow("@wanderer")).toMatchObject({ niche: null, tier: "excluded", last_list_error: "relevance gate: off-topic for every niche" });
    const dropped = loadNicheMembers({ nicheId: summary.nicheId, statuses: ["dropped"] });
    expect(dropped.map((member) => member.gateReason).sort()).toEqual(["no-listing", "off-topic"]);
    expect(summary.blocks).toBe(0);
    expect(summary.quotas.en!.map((row) => row.kept)).toEqual([2, 2, 1, 0]);
    expect(summary.members.groups.main).toBe(5);
  });

  test("refresh skips niche-only watchlists and never stamps an open niche at discovery", async () => {
    const { deps, options, clock } = setup();
    await nicheInit(options, deps);
    clock.now += 2 * DAY_MS;
    const result = await refresh({
      workspaceId, dueOnly: true, discover: true, platforms: ["youtube"], perCreator: 30, maxCreators: 10, maxNewCreators: 5,
      concurrency: 1, budget: 50, discoveryDepth: 5, paid: { enabled: false, dailyCapUsd: null },
    }, deps, { llm: false, llmLimit: 0, refit: false });
    expect(result.passes.some((pass) => pass.source === "niche-tiktok-profile")).toBe(false);
    expect(openDomainDb().query<{ n: number }, []>("SELECT COUNT(*) AS n FROM trend_creators WHERE niche = 'psychology' AND id NOT IN (SELECT creator_id FROM trend_niche_members WHERE status = 'kept')").get()!.n).toBe(0);
  });
});

describe("niche report", () => {
  test("has every section; groups below the minimum n say insufficient data", async () => {
    const { deps, options, clock } = setup();
    await nicheInit(options, deps);
    const niche = getNiche({ workspaceId, ref: "psychology" })!;
    const report = buildNicheReport({ niche, now: clock.now, options: { language: "en" } });
    expect(Object.keys(report)).toEqual([
      "kind", "niche", "scope", "generatedAt", "settings", "coverage", "whatToCopy", "topOutliers", "formats", "growth",
      "subNicheGaps", "entryFormats", "negativeGroup", "anomalies", "digests", "youtube", "notes",
    ]);
    expect(report.coverage.creators.kept).toBe(5);
    expect(report.coverage.keptByPlatformBand.youtube).toMatchObject({ lt10k: 1, "100k-1m": 1, "10k-100k": 1 });
    expect(report.formats.formats.every((row) => row.verdict === "insufficient data" || row.n >= 20)).toBe(true);
    expect(report.subNicheGaps.rows.every((row) => row.verdict === "insufficient data")).toBe(true);
    expect(report.growth.rows.map((row) => row.verdict)).toEqual(["insufficient data", "insufficient data"]);
    expect(report.youtube.lacks.length).toBeGreaterThan(0);
    expect(report.whatToCopy.items.every((item) => typeof item.components.sizeWeight === "number")).toBe(true);
    const markdown = renderNicheReportMarkdown(report);
    for (const heading of ["## Coverage", "## What to copy (copyability ranking)", "## Top outliers", "## Winning formats and hook types", "## Cadence and length of creators who grow", "## Sub-niche saturation vs demand", "## Entry formats for a new account", "## Negative control group", "## Digests for the top references", "## YouTube coverage"]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).not.toContain("someone@example.com");
  });

  test("workspace export/import carries the niche and its members", async () => {
    const { deps, options } = setup();
    await nicheInit(options, deps);
    const exported = await exportWorkspacePackage({ workspaceId });
    expect(exported.manifestSummary.entityCounts).toMatchObject({ trend_niche: 1 });
    const imported = await importWorkspacePackage({ packageObjectId: exported.packageObjectId, idempotencyKey: "niche-roundtrip", workspaceSlug: "corpus-copy", limit: 10 });
    const copy = getNiche({ workspaceId: imported.workspaceId, ref: "psychology" })!;
    expect(copy.id).not.toBe(getNiche({ workspaceId, ref: "psychology" })!.id);
    expect(loadNicheMembers({ nicheId: copy.id, statuses: ["kept"] }).length).toBe(5);
  });
});
