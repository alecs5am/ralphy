// Screenshot analytics import (#558) — zero-network tests.
//
// Covers the human-number parsers (K/M suffixes, thousands separators,
// percent vs ratio, clock durations), payload validation (aliases, strict
// keys, plausibility warnings), and the store flow: dry-run writes nothing,
// --yes appends a Presentation revision + a manual Publication + one Metric
// Snapshot + the decision ledger, a repeat import replays instead of
// duplicating, and screenshots are copied as provenance Objects. The vision
// pre-fill runs through an injected LLM stub. Fixtures are synthetic English.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  MetricParseError,
  parseCount,
  parseCountDetailed,
  parseInstant,
  parsePercent,
  parsePercentDetailed,
  parseSeconds,
} from "../../cli/lib/analytics/metric-parse";
import { parseAnalyticsImport } from "../../cli/lib/schemas/analytics-import";
import {
  extractFromScreenshots,
  importAnalytics,
  readImportData,
  validateImportData,
} from "../../cli/lib/analytics/import";
import { DomainError } from "../../cli/lib/errors/domain";
import { closeDomainDb, domainDbPath, openDomainDb } from "../../cli/lib/store/db";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes";
import { createUnitWithRevision, getUnit, listMetricSnapshots } from "../../cli/lib/store/units";
import { listUnitOutcomeFacts } from "../../cli/lib/store/outcomes";
import { verifyDomainStore } from "../../cli/lib/store/verify";

const FIXTURE_PROJECT = path.resolve(import.meta.dir, "../fixtures/decision-ledger/project-a");
const CLI = path.resolve(import.meta.dir, "../../cli/index.ts");
// A valid 1x1 transparent PNG (synthetic, 67 bytes).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("metric parsers", () => {
  test("counts read platform abbreviations and thousands separators", () => {
    expect(parseCountDetailed("12.3K")).toEqual({ value: 12_300, approximate: true });
    expect(parseCountDetailed("1,2M")).toEqual({ value: 1_200_000, approximate: true });
    expect(parseCount("1.25m")).toBe(1_250_000);
    expect(parseCount("3B")).toBe(3_000_000_000);
    expect(parseCountDetailed("1,234")).toEqual({ value: 1234, approximate: false });
    expect(parseCount("1.234.567")).toBe(1_234_567);
    expect(parseCount("12 345")).toBe(12_345);
    expect(parseCount("12 345")).toBe(12_345);
    expect(parseCount(987)).toBe(987);
  });

  test("counts reject non-whole and unreadable values instead of guessing", () => {
    expect(() => parseCount("12.5")).toThrow(MetricParseError);
    expect(() => parseCount(12.5)).toThrow(/whole number/);
    expect(() => parseCount("1,23")).toThrow(MetricParseError);
    expect(() => parseCount("-5")).toThrow(MetricParseError);
    expect(() => parseCount("lots")).toThrow(MetricParseError);
    expect(() => parseCount("")).toThrow(MetricParseError);
  });

  test("percentages accept % strings and decimal commas; flag ratio-looking numbers", () => {
    expect(parsePercent("45.2%")).toBe(45.2);
    expect(parsePercent("45,2 %")).toBe(45.2);
    expect(parsePercent(62)).toBe(62);
    expect(parsePercentDetailed(0.45).looksLikeRatio).toBe(true);
    expect(parsePercentDetailed("0.45%").looksLikeRatio).toBe(false);
    expect(() => parsePercent("120%")).toThrow(/0 through 100/);
    expect(parsePercent("130%", 1000)).toBe(130);
  });

  test("durations read seconds, clock form, and unit tokens", () => {
    expect(parseSeconds(12.4)).toBe(12.4);
    expect(parseSeconds("12.4s")).toBe(12.4);
    expect(parseSeconds("0:12")).toBe(12);
    expect(parseSeconds("1:02:03")).toBe(3723);
    expect(parseSeconds("1m 5s")).toBe(65);
    expect(parseSeconds("12h:3m:4s")).toBe(43_384);
    expect(parseSeconds("3.5 min")).toBe(210);
    expect(() => parseSeconds("1:75")).toThrow(MetricParseError);
    expect(() => parseSeconds("12 parsecs")).toThrow(MetricParseError);
  });

  test("instants read dates, datetimes, and epoch ms", () => {
    expect(parseInstant("2026-10-20")).toBe(Date.UTC(2026, 9, 20));
    expect(parseInstant("2026-10-20T08:30:00Z")).toBe(Date.UTC(2026, 9, 20, 8, 30));
    expect(parseInstant(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(() => parseInstant("last tuesday")).toThrow(MetricParseError);
  });
});

describe("analytics import payload", () => {
  test("folds screen-label aliases and records approximations", () => {
    const parsed = parseAnalyticsImport({
      views: "12.3K",
      likes: "1,204",
      comments: 88,
      shares: "312",
      saved: "940",
      avg_watch_time_s: "0:09",
      watched_full_video: "31.5%",
      retention_points: [{ t: "0:00", pct: 100 }, { t: 3, pct: "72%" }],
      captured_at: "2026-10-27T12:00:00Z",
      post_date: "2026-10-20",
    });
    expect(parsed.data).toMatchObject({
      views: 12_300,
      likes: 1204,
      comments: 88,
      shares: 312,
      saves: 940,
      avgWatchTimeSec: 9,
      completionPct: 31.5,
      retention: [{ t: 0, pct: 100 }, { t: 3, pct: 72 }],
      capturedAt: Date.UTC(2026, 9, 27, 12),
      postedAt: Date.UTC(2026, 9, 20),
    });
    expect(parsed.approximations).toEqual([{ field: "views", reading: "12.3K" }]);
    expect(parsed.warnings).toEqual([]);
  });

  test("rejects unknown keys, empty payloads, and a post after its capture", () => {
    expect(() => parseAnalyticsImport({ views: 10, viewz: 12 })).toThrow();
    expect(() => parseAnalyticsImport({ url: "https://example.com/post/1" })).toThrow(/at least one metric/);
    expect(() =>
      parseAnalyticsImport({ views: 10, capturedAt: "2026-10-01", postedAt: "2026-10-02" })
    ).toThrow(/postedAt/);
    expect(() => parseAnalyticsImport({ views: 10, saves: 1, saved: 2 })).toThrow(/duplicates/);
  });

  test("plausibility warnings surface swapped fields and ratio-typed percents", () => {
    const parsed = parseAnalyticsImport({ views: 100, likes: 400, completionPct: 0.4, capturedAt: "2026-10-01" });
    expect(parsed.warnings.join("\n")).toContain("likes (400) exceeds views (100)");
    expect(parsed.warnings.join("\n")).toContain("completionPct 0.4 looks like a ratio");
  });

  test("validation errors map to E_VALIDATION_FAILED with every issue named", () => {
    try {
      validateImportData({ views: "12.5", likes: "many" }, "tiktok");
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("E_VALIDATION_FAILED");
      const detail = String((error as DomainError).details?.detail);
      expect(detail).toContain("views");
      expect(detail).toContain("likes");
    }
    expect(() => validateImportData({ views: 5, platform: "youtube" }, "tiktok")).toThrow(DomainError);
  });

  test("--data accepts inline JSON or a file path", () => {
    expect(readImportData('{"views": 5}')).toEqual({ views: 5 });
    expect(() => readImportData("{nope")).toThrow(DomainError);
  });
});

describe("analytics import into the domain store", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-analytics-import-558");
  });

  afterEach(() => {
    closeDomainDb();
    tmp.cleanup();
  });

  function seed() {
    const workspace = createWorkspace({ slug: "kettle-brand", name: "Kettle brand" });
    const project = createProject({ workspaceId: workspace.id, slug: "coffee-review-001", name: "Coffee review" });
    const document = createDocument({ projectId: project.id, kind: "note", slug: "script", title: "Script" });
    const body = reviseDocument({ documentId: document.id, expectedHeadId: null, format: "markdown", body: "# Kettle review" });
    const revision = createUnitWithRevision({
      projectId: project.id,
      slug: "coffee-hero",
      format: "video",
      items: [{ documentRevisionId: body.id, role: "body", position: 0 }],
    });
    return { workspaceId: workspace.id, projectId: project.id, unitId: revision.unitId, revisionId: revision.id };
  }

  const DATA = {
    views: "12.3K",
    likes: 1204,
    comments: 88,
    shares: 312,
    saves: 940,
    follows: 41,
    avgWatchTimeSec: "0:09",
    completionPct: "31.5%",
    videoDurationSec: 23.6,
    capturedAt: "2026-10-27T12:00:00Z",
    postedAt: "2026-10-20T18:00:00Z",
  };

  test("dry-run previews the numbers and planned writes without writing", async () => {
    const seeded = seed();
    const preview = await importAnalytics({
      context: { workspaceId: seeded.workspaceId },
      ref: "coffee-hero",
      platform: "tiktok",
      data: DATA,
      write: false,
    });
    expect(preview.written).toBe(false);
    expect(preview.unit.id).toBe(seeded.unitId);
    expect(preview.metrics.views).toBe(12_300);
    expect(preview.rates.saveRatePct).toBeCloseTo(7.6423, 3);
    expect(preview.plan).toEqual({
      presentation: { action: "create", baseRevisionId: seeded.revisionId },
      publication: { action: "record-manual", note: expect.stringContaining("as submitted (pass url") },
    });
    expect(preview.approximations).toEqual([{ field: "views", reading: "12.3K" }]);
    const context = { workspaceId: seeded.workspaceId, projectId: seeded.projectId };
    expect(getUnit({ context, unitId: seeded.unitId }).latestRevisionId).toBe(seeded.revisionId);
    expect(listUnitOutcomeFacts({ context: { workspaceId: seeded.workspaceId } })[0]!.observations).toEqual([]);
  });

  test("--yes writes presentation, manual publication, snapshot, screenshot copy, and ledger", async () => {
    const seeded = seed();
    const shot = path.join(tmp.dir, "tiktok-studio-overview.png");
    fs.writeFileSync(shot, TINY_PNG);
    const result = await importAnalytics({
      context: { workspaceId: seeded.workspaceId },
      ref: seeded.unitId,
      platform: "tiktok",
      data: DATA,
      screenshots: [shot],
      write: true,
      fromDir: FIXTURE_PROJECT,
    });
    expect(result.written).toBe(true);
    if (!("writes" in result)) throw new Error("expected writes");
    expect(result.replayed).toBe(false);
    expect(result.source).toBe("screenshot");
    expect(result.writes.publicationRecorded).toBe(true);
    expect(result.writes.createdUnitRevisionId).not.toBeNull();
    expect(result.writes.screenshotArtifactRevisions).toHaveLength(1);
    expect(result.writes.ledger?.written).toBe(true);
    expect(fs.existsSync(shot)).toBe(true);

    const publication = openDomainDb()
      .query<{ rail: string; state: string; published_at: number | null }, [string]>(
        "SELECT rail, state, published_at FROM publications WHERE id = ?",
      )
      .get(result.writes.publicationId)!;
    // No URL was given, so the owner-posted record is `submitted`, not `published`.
    expect(publication).toMatchObject({ rail: "manual", state: "submitted", published_at: null });

    const context = { workspaceId: seeded.workspaceId, projectId: seeded.projectId };
    const snapshots = listMetricSnapshots({ context, publicationId: result.writes.publicationId, limit: 10 }).items;
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      source: "screenshot",
      views: 12_300,
      likes: 1204,
      shares: 312,
      avgViewDurationSec: 9,
      asOf: Date.UTC(2026, 9, 27, 12),
    });

    const facts = listUnitOutcomeFacts({ context: { workspaceId: seeded.workspaceId } });
    expect(facts).toHaveLength(1);
    expect(facts[0]!.observations).toHaveLength(1);
    expect(facts[0]!.observations[0]!.platform).toBe("tiktok");
    expect(facts[0]!.observations[0]!.importFacts).toMatchObject({
      saves: 940,
      follows: 41,
      completionPct: 31.5,
      videoDurationSec: 23.6,
      postedAt: Date.UTC(2026, 9, 20, 18),
      approximateFields: ["views"],
      extractedBy: "agent",
      screenshotCount: 1,
    });
    const ledger = facts[0]!.ledger?.body as Record<string, unknown>;
    expect(ledger.unitId).toBe(seeded.unitId);
    expect((ledger.derived as Record<string, { value: unknown }>).content_mode?.value).toBe("ugc-review");

    // The whole chain (Run results, Publication lifecycle, Objects) verifies clean.
    const report = verifyDomainStore({ hashObjects: true });
    expect(report.integrity).toBe("ok");
    expect(report.brokenUnitChains).toEqual([]);
    expect(report.runObjectIssues).toEqual([]);
    expect(report.absolutePathRows).toEqual([]);
    expect(report.missingObjects).toEqual([]);
  });

  test("a repeated import replays; new numbers append a second snapshot on the same publication", async () => {
    const seeded = seed();
    const request = {
      context: { workspaceId: seeded.workspaceId },
      ref: "coffee-hero",
      platform: "tiktok" as const,
      data: { ...DATA, url: "https://www.tiktok.com/@kettlebrand/video/7300000000000000001" },
      write: true,
    };
    const first = await importAnalytics(request);
    const again = await importAnalytics(request);
    if (!("writes" in first) || !("writes" in again)) throw new Error("expected writes");
    expect(again.replayed).toBe(true);
    expect(again.plan.publication).toEqual({
      action: "reuse",
      publicationId: first.writes.publicationId,
      state: "published",
      rail: "manual",
    });
    expect(first.writes.publicationRecorded).toBe(true);
    expect(again.writes.snapshotIds).toEqual(first.writes.snapshotIds);

    const later = await importAnalytics({
      ...request,
      data: { ...request.data, views: "15.1K", capturedAt: "2026-10-28T12:00:00Z" },
    });
    if (!("writes" in later)) throw new Error("expected writes");
    expect(later.writes.publicationId).toBe(first.writes.publicationId);
    expect(later.writes.createdUnitRevisionId).toBeNull();
    const context = { workspaceId: seeded.workspaceId, projectId: seeded.projectId };
    expect(listMetricSnapshots({ context, publicationId: first.writes.publicationId, limit: 10 }).items).toHaveLength(2);
    const facts = listUnitOutcomeFacts({ context: { workspaceId: seeded.workspaceId } });
    expect(facts[0]!.observations[0]!.snapshot.views).toBe(15_100);
    expect(facts[0]!.observations[0]!.snapshotCount).toBe(2);
    expect(facts[0]!.observations[0]!.publicationState).toBe("published");
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("unknown and ambiguous unit references fail with catalog codes", async () => {
    const seeded = seed();
    const document = createDocument({ projectId: seeded.projectId, kind: "note", slug: "script-b", title: "Script B" });
    const body = reviseDocument({ documentId: document.id, expectedHeadId: null, format: "markdown", body: "# B" });
    createUnitWithRevision({
      projectId: seeded.projectId,
      slug: "coffee-b",
      format: "video",
      items: [{ documentRevisionId: body.id, role: "body", position: 0 }],
    });
    const base = { context: { workspaceId: seeded.workspaceId }, platform: "tiktok" as const, data: DATA, write: false };
    await expect(importAnalytics({ ...base, ref: "no-such-unit" })).rejects.toMatchObject({ code: "E_NOT_FOUND" });
    await expect(importAnalytics({ ...base, ref: "coffee-review-001" })).rejects.toMatchObject({ code: "E_INPUT_INVALID" });
  });

  test("--extract pre-fills the payload through an injected vision call", async () => {
    const shot = path.join(tmp.dir, "insights.png");
    fs.writeFileSync(shot, TINY_PNG);
    const seen: unknown[] = [];
    const extracted = await extractFromScreenshots({
      platform: "instagram",
      screenshots: [shot],
      llmImpl: async (opts) => {
        seen.push(opts);
        return {
          text: '```json\n{"views": "8.4K", "likes": "610", "saves": 120, "reach": null}\n```',
          raw: {},
          provider: "stub",
          model: opts.model ?? "stub",
          latencyMs: 1,
        };
      },
    });
    expect(extracted).toEqual({ views: "8.4K", likes: "610", saves: 120 });
    expect(seen).toHaveLength(1);
    const call = seen[0] as { model: string; jsonMode: boolean; messages: Array<{ content: Array<{ type: string }> }> };
    expect(call.model).toBe("google/gemini-2.5-flash");
    expect(call.jsonMode).toBe(true);
    expect(call.messages[0]!.content.map((part) => part.type)).toEqual(["text", "image_url"]);
    expect(validateImportData(extracted, "instagram").data.views).toBe(8400);
    await expect(extractFromScreenshots({ platform: "tiktok", screenshots: [] })).rejects.toBeInstanceOf(DomainError);
  });

  test("CLI smoke: import --dry-run, --yes, unit decisions --set, and report", () => {
    const seeded = seed();
    const dataRoot = path.dirname(domainDbPath());
    closeDomainDb();
    const run = (args: string[]) => {
      const result = spawnSync("bun", ["run", CLI, "--root", dataRoot, "--json", ...args], {
        cwd: tmp.dir,
        encoding: "utf8",
      });
      if (result.status !== 0) throw new Error(`ralphy ${args.join(" ")} failed: ${result.stderr}`);
      return JSON.parse(result.stdout) as Record<string, any>;
    };
    const data = JSON.stringify({ views: "4.2K", likes: 210, comments: 12, shares: 30, saves: 55, postedAt: "2026-10-20" });
    const base = ["analytics", "import", "coffee-hero", "--workspace", seeded.workspaceId, "--platform", "youtube", "--data", data];
    expect(run([...base, "--dry-run"]).written).toBe(false);
    const written = run([...base, "--yes"]);
    expect(written.written).toBe(true);
    expect(written.metrics.views).toBe(4200);

    const decisions = run(["unit", "decisions", "coffee-hero", "--workspace", seeded.workspaceId, "--set", "hook_type=question", "--set", "transitions=whip-pan,glitch"]);
    expect(decisions.written).toBe(true);
    expect(decisions.decisions).toMatchObject({ format: "video", hook_type: "question", transitions: ["glitch", "whip-pan"] });

    const report = run(["analytics", "report", "--workspace", seeded.workspaceId]);
    expect(report.kind).toBe("outcome-report");
    expect(report.coverage).toMatchObject({ units: 1, unitsWithOutcomes: 1, observations: 1, ledgers: { stored: 1 } });
    expect(report.decisions.find((row: { dimension: string }) => row.dimension === "hook_type")).toMatchObject({
      value: "question",
      n: 1,
      verdict: "insufficient data",
    });
  }, 60_000);
});
