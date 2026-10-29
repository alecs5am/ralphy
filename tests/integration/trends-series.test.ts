import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { writeIngestBatch } from "../../cli/lib/store/trends.js";
import { addNicheCandidates, upsertNiche, writeGateResults, type NicheDto } from "../../cli/lib/store/trend-niches.js";
import { appendVisualFormatLabels, readVisualFormatDocument, trendVideoRefs, visualFormatLabels } from "../../cli/lib/store/trend-formats.js";
import { DEFAULT_NICHE_SETTINGS } from "../../cli/lib/trends/niche.js";
import { buildNicheReport, renderNicheReportMarkdown } from "../../cli/lib/trends/niche-report.js";
import { buildSeriesReport, renderSeriesMarkdown } from "../../cli/lib/trends/series-report.js";
import { parseLabelWorksheet } from "../../cli/lib/trends/series.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 30, 12);

let tmp: TmpRoot;
let workspaceId: string;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-series");
  workspaceId = createWorkspace({ slug: "corpus", name: "Corpus" }).id;
});
afterEach(() => {
  closeDomainDb();
  tmp.cleanup();
});

/** One YouTube channel with a fresh 3-part series and one with a stale series, both in a kept main group. */
function seed(): NicheDto {
  const niche = upsertNiche({ workspaceId, slug: "fitness", topic: "fitness", languages: ["en"], platforms: ["youtube"], parentNiche: null, taxonomy: { subNiches: [], lexicon: {} } as never, settings: { ...DEFAULT_NICHE_SETTINGS }, seedSource: "file", now: NOW });
  const channel = (handle: string, partViews: number[], newestPostedAt: number | null) => ({
    creator: { platform: "youtube" as const, platformCreatorId: `UC${handle}`, handle: `@${handle}`, followerCount: 50_000, discoveredVia: "seed" },
    videos: [
      ...partViews.map((views, index) => ({
        creatorPlatformId: `UC${handle}`, platform: "youtube" as const, platformVideoId: `${handle}p${index + 1}`, url: `https://www.youtube.com/shorts/${handle}p${index + 1}`,
        title: `Weird gym machines part ${index + 1}`, postedAt: index === partViews.length - 1 ? newestPostedAt : null, discoveredVia: "listing", inListing: true,
        snapshot: { asOf: NOW, source: "youtube-listing", views, viewsPrecision: "rounded" as const },
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        creatorPlatformId: `UC${handle}`, platform: "youtube" as const, platformVideoId: `${handle}o${index}`, url: `https://www.youtube.com/shorts/${handle}o${index}`,
        title: `Leg day thoughts ${["alpha", "beta", "gamma", "delta", "eps", "zeta"][index]}`, postedAt: null, discoveredVia: "listing", inListing: true,
        snapshot: { asOf: NOW, source: "youtube-listing", views: 10_000, viewsPrecision: "rounded" as const },
      })),
    ],
  });
  const fresh = channel("freshgym", [40_000, 60_000, 50_000], NOW - 10 * DAY);
  const stale = channel("oldgym", [90_000, 80_000, 70_000], NOW - 400 * DAY);
  const batch = writeIngestBatch({ workspaceId, runId: null, now: NOW, creators: [fresh.creator, stale.creator], videos: [...fresh.videos, ...stale.videos] });
  addNicheCandidates({ nicheId: niche.id, runId: null, now: NOW, entries: batch.creatorIds.map((creatorId) => ({ creatorId, via: "seed", round: 0 })) });
  writeGateResults({
    nicheId: niche.id, nicheSlug: niche.slug, runId: null, now: NOW,
    results: batch.creatorIds.map((creatorId) => ({ creatorId, status: "kept" as const, reason: "on-topic", method: "rule" as const, language: "en", relevance: 0.9, sampled: 9, onTopic: 8, subNiche: null, subNicheConfidence: null, evidence: {} })),
  });
  return niche;
}

describe("trends series over the store", () => {
  test("detects both series, marks freshness, and joins vision-agent labels into format stats", () => {
    const niche = seed();
    // #590: the default lists fresh series only and counts the rest; --include-stale (freshOnly false) lists them with verdict skip.
    const fresh = buildSeriesReport({ niches: [niche], now: NOW });
    expect(fresh.series.map((row) => row.channel)).toEqual(["@freshgym"]);
    expect(fresh.coverage.excluded).toMatchObject({ stale: 1, freshnessUnknown: 0, listed: false });
    const report = buildSeriesReport({ niches: [niche], now: NOW, options: { freshOnly: false } });
    expect(report.coverage).toMatchObject({ channels: 2, channelsWithSeries: 2, series: 2, freshness: { fresh: 1, stale: 1, unknown: 0 } });
    const byChannel = Object.fromEntries(report.series.map((row) => [row.channel, row]));
    expect(byChannel["@freshgym"]).toMatchObject({ parts: 3, lift: 5, freshness: "fresh", ageDays: 10, stem: "weird gym machines", newestPart: { url: "https://www.youtube.com/shorts/freshgymp3", ageDays: 10 } });
    expect(byChannel["@oldgym"]).toMatchObject({ parts: 3, lift: 8, freshness: "stale", ageDays: 400 });
    // Scorecard of the reference part: the fresh series adapts on its own lift; the stale one is skipped by K2 even with the higher lift.
    expect(byChannel["@freshgym"]!.scorecard).toMatchObject({ verdict: "adapt", posted: { freshness: "hot", ageDays: 10 }, replication: { seriesLift: 5, seriesParts: 3, seriesPartsInWindow: 1 }, evidence: { quality: "ok", views: "rounded" }, transfer: "not-checked" });
    expect(byChannel["@freshgym"]!.referencePart).toMatchObject({ url: "https://www.youtube.com/shorts/freshgymp3", ageDays: 10 });
    expect(byChannel["@oldgym"]!.scorecard!.verdict).toBe("skip");
    expect(byChannel["@oldgym"]!.scorecard!.reasons[0]).toMatch(/^K2 fresh: posted .* 400 d > 90 d$/);
    expect(report.series.map((row) => row.verdict)).toEqual(["adapt", "skip"]);

    // Label both newest parts; only the fresh series counts in the format stats.
    const ids = report.series.map((row) => row.newestPart!.videoId);
    expect(trendVideoRefs({ workspaceId, videoIds: [...ids, "tvideo_missing"] }).size).toBe(2);
    const parsed = parseLabelWorksheet({ items: report.series.map((row) => ({ videoId: row.newestPart!.videoId, niche: "fitness", seriesKey: row.seriesKey, format: "on-location-try-it", confidence: 0.8 })) }, NOW);
    const first = appendVisualFormatLabels({ workspaceId, niche: "fitness", labels: parsed.labels, now: NOW });
    expect(first).toMatchObject({ written: true, added: 2, updated: 0, revisions: 1 });
    expect(appendVisualFormatLabels({ workspaceId, niche: "fitness", labels: parsed.labels, now: NOW + 1 })).toMatchObject({ written: false, unchanged: 2, revisions: 1 });
    const relabel = parseLabelWorksheet([{ videoId: ids[0], niche: "fitness", format: "text-over-action", confidence: 0.9 }], NOW + 2).labels;
    expect(appendVisualFormatLabels({ workspaceId, niche: "fitness", labels: relabel, now: NOW + 2 })).toMatchObject({ written: true, updated: 1, revisions: 2 });
    expect(readVisualFormatDocument({ workspaceId, niche: "fitness" })?.revisions).toBe(2);
    expect(visualFormatLabels({ workspaceId, niche: "fitness" }).get(ids[0]!)?.format).toBe("text-over-action");

    const labeled = buildSeriesReport({ niches: [niche], now: NOW });
    expect(labeled.series.every((row) => row.visualFormat?.method === "vision-agent")).toBe(true);
    expect(labeled.formats).toMatchObject({ labeledSeries: 1, labeledNotFresh: 1 });
    expect(labeled.formats.rows).toEqual([expect.objectContaining({ niche: "fitness", series: 1, channels: 1, medianLift: 5 })]);
    const markdown = renderSeriesMarkdown(labeled);
    expect(markdown).toContain("## Formats and series");
    expect(markdown).toContain("## Adapt scorecard");
    expect(markdown).toContain("Excluded from the list: 1 stale series");
    expect(markdown).toContain("Freshness unknown");
    expect(markdown).not.toContain("undefined");
  });

  test("the niche report carries a Formats and series section with fresh series only", () => {
    const niche = seed();
    const report = buildNicheReport({ niche, now: NOW });
    expect(report.formatsAndSeries).toMatchObject({ series: 2, channelsWithSeries: 2, freshness: { fresh: 1, stale: 1, unknown: 0 } });
    expect(report.formatsAndSeries.topSeries.map((row) => row.channel)).toEqual(["@freshgym"]);
    const markdown = renderNicheReportMarkdown(report);
    expect(markdown).toContain("## Formats and series");
    expect(markdown).toContain("### Fresh series by lift");
  });
});
