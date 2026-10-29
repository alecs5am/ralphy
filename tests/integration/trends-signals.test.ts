import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { createProject } from "../../cli/lib/store/scopes.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { createUnitWithRevision } from "../../cli/lib/store/units.js";
import { readPredictionLedgerDocument } from "../../cli/lib/store/trend-signals.js";
import type { NicheDto } from "../../cli/lib/store/trend-niches.js";
import { importAnalytics } from "../../cli/lib/analytics/import.js";
import { readStoredLedger } from "../../cli/lib/analytics/ledger.js";
import { loadOutcomeReport, DEFAULT_REPORT_OPTIONS } from "../../cli/lib/analytics/report.js";
import { DEFAULT_NICHE_SETTINGS } from "../../cli/lib/trends/niche.js";
import { buildPrecision, linkPickToUnit, ownBaselineFor, readLedger, recordPicks, skipPick } from "../../cli/lib/trends/signal-engine.js";
import { scaleUpEstimate, type PredictionPick } from "../../cli/lib/trends/signals.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let tmp: TmpRoot;
let workspaceId: string;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-signals");
  workspaceId = createWorkspace({ slug: "corpus", name: "Corpus" }).id;
});
afterEach(() => {
  closeDomainDb();
  tmp.cleanup();
});

const NOW = Date.UTC(2026, 9, 29, 12);

function niche(): NicheDto {
  return {
    id: "tniche_00000000-0000-4000-8000-000000000577",
    workspaceId,
    slug: "psychology",
    topic: "psychology",
    languages: ["en"],
    platforms: ["tiktok", "youtube"],
    parentNiche: null,
    taxonomy: { subNiches: [], lexicon: {} },
    settings: { ...DEFAULT_NICHE_SETTINGS },
    seedSource: "file",
    lastRunId: null,
    createdAt: NOW,
    updatedAt: NOW,
  } as NicheDto;
}

function pick(id: string, over: Partial<PredictionPick> = {}): PredictionPick {
  return {
    pickId: `small-account-breakout:${id}`,
    signalType: "small-account-breakout",
    cause: null,
    wideningStep: "base",
    videoId: id,
    url: `https://www.tiktok.com/@fixture/video/${id}`,
    creator: "fixture",
    platform: "tiktok",
    detectedAt: new Date(NOW).toISOString(),
    evidence: { multiplier: 20, views: 200_000, followers: 8_000, format: null, hook: "question", creators: null },
    predicted: { own: null, spread: { axis: "hook", value: "question", creatorsAtPick: 2, withinDays: 14 } },
    why: null,
    classification: "unclassified",
    decision: "pending",
    outcome: null,
    ...over,
  };
}

describe("prediction ledger Document", () => {
  test("appends revisions per niche scope and merges hypotheses by url", () => {
    const first = recordPicks({ niche: niche(), options: { language: "en" }, picks: [pick("v1"), pick("v2")], now: NOW });
    expect(first).toMatchObject({ written: true, added: 2, picks: 2 });
    const unchanged = recordPicks({ niche: niche(), options: { language: "en" }, picks: [pick("v1")], now: NOW + 1 });
    expect(unchanged).toMatchObject({ written: false, added: 0 });
    const withWhy = recordPicks({
      niche: niche(),
      options: { language: "en" },
      picks: [pick("v3")],
      hypotheses: [{ url: "https://www.tiktok.com/@fixture/video/v1", why: "A question hook that names a common fear; the same creator's talking-head videos without it sit at their median.", classification: "transferable" }],
      now: NOW + 2,
    });
    expect(withWhy).toMatchObject({ written: true, added: 1, updated: 1, picks: 3, unmatchedHypotheses: 0 });
    const document = readPredictionLedgerDocument({ workspaceId, slug: "psychology-en" });
    expect(document?.revisions).toBe(2);
    const ledger = readLedger(niche(), { language: "en" }).body!;
    expect(ledger.picks.map((entry) => entry.videoId)).toEqual(["v1", "v2", "v3"]);
    expect(ledger.picks[0]).toMatchObject({ classification: "transferable", detectedAt: new Date(NOW).toISOString() });
    // Another scope is another Document.
    expect(readLedger(niche(), {}).body).toBeNull();
  });

  test("precision says insufficient data until picks resolve; the own baseline is empty without #558 outcomes", () => {
    const empty = buildPrecision({ niche: niche(), now: NOW, options: { language: "en" }, minN: 3 });
    expect(empty.rows.every((row) => row.verdict === "insufficient data")).toBe(true);
    recordPicks({ niche: niche(), options: { language: "en" }, picks: [pick("v1"), pick("v2"), pick("v3")], now: NOW });
    const pending = buildPrecision({ niche: niche(), now: NOW + 86_400_000, options: { language: "en" }, minN: 3 });
    expect(pending.rows.find((row) => row.signalType === "small-account-breakout")).toMatchObject({ picks: 3, resolved: 0, pendingSpreadChecks: 3, precision: null, verdict: "insufficient data" });
    expect(pending.notes.join(" ")).toContain("insufficient data");
    expect(ownBaselineFor({ workspaceId, platform: "tiktok", followers: null })).toMatchObject({ n: 0, medianViews: null });
  });
});

// ─── #577 follow-up: link picks to produced Units, precision join ───────────

const DAY = 86_400_000;

/** The DomainError a call throws: code plus the detail the CLI prints. */
function thrown(fn: () => unknown): { code: string; detail: string } {
  try {
    fn();
  } catch (error) {
    const domain = error as { code?: string; details?: { detail?: string } };
    return { code: domain.code ?? "?", detail: domain.details?.detail ?? String(error) };
  }
  throw new Error("expected a throw");
}

/** A Unit in the own account Workspace (not the corpus), with an optional #558 outcome. */
async function ownUnit(ownWorkspaceId: string, slug: string, outcome?: { views: number; postedAt: number }) {
  const project = createProject({ workspaceId: ownWorkspaceId, slug: `${slug}-project`, name: slug });
  const document = createDocument({ projectId: project.id, kind: "note", slug: "script", title: "Script" });
  const body = reviseDocument({ documentId: document.id, expectedHeadId: null, format: "markdown", body: `# ${slug}` });
  const revision = createUnitWithRevision({ projectId: project.id, slug, format: "video", items: [{ documentRevisionId: body.id, role: "body", position: 0 }] });
  if (outcome) {
    await importAnalytics({
      context: { workspaceId: ownWorkspaceId },
      ref: revision.unitId,
      platform: "tiktok",
      data: { views: outcome.views, capturedAt: new Date(outcome.postedAt + 3 * DAY).toISOString(), postedAt: new Date(outcome.postedAt).toISOString() },
      write: true,
      now: outcome.postedAt + 3 * DAY,
    });
  }
  return { unitId: revision.unitId, projectId: project.id };
}

describe("trends pick link / skip", () => {
  test("link appends a produced revision with the Unit and records reference_pick in the Unit's decision ledger", async () => {
    const own = createWorkspace({ slug: "own-account", name: "Own account" }).id;
    const unit = await ownUnit(own, "remake-v1");
    recordPicks({ niche: niche(), options: { language: "en" }, picks: [pick("v1"), pick("v2")], now: NOW });
    const linked = linkPickToUnit({ workspaceId, pickId: "small-account-breakout:v1", scope: { niche: "psychology", language: "en" }, unitRef: "remake-v1", unitContext: { workspaceId: own }, now: NOW + DAY });
    expect(linked).toMatchObject({
      kind: "trend-pick-link",
      written: true,
      ledger: { slug: "psychology-en", revisions: 2 },
      pick: { pickId: "small-account-breakout:v1", decision: "produced", unit: { unitId: unit.unitId, slug: "remake-v1", workspaceId: own } },
      unitDecisions: { written: true, reference_pick: "small-account-breakout:v1", reference_signal: "small-account-breakout" },
    });
    expect(readPredictionLedgerDocument({ workspaceId, slug: "psychology-en" })?.revisions).toBe(2);
    const body = readLedger(niche(), { language: "en" }).body!;
    expect(body.picks.map((entry) => entry.decision)).toEqual(["produced", "pending"]);
    expect(body.picks[0]!.detectedAt).toBe(new Date(NOW).toISOString());
    const decisions = readStoredLedger({ workspaceId: own, projectId: unit.projectId }, unit.unitId)!;
    expect(decisions.body!.manual).toMatchObject({ reference_pick: "small-account-breakout:v1", reference_signal: "small-account-breakout" });

    // Same Unit again: no new revisions anywhere. Re-recording the picks keeps the decision.
    const again = linkPickToUnit({ workspaceId, pickId: "small-account-breakout:v1", scope: {}, unitRef: unit.unitId, unitContext: { workspaceId: own }, now: NOW + 2 * DAY });
    expect(again).toMatchObject({ written: false, unitDecisions: { written: false } });
    recordPicks({ niche: niche(), options: { language: "en" }, picks: [pick("v1"), pick("v3")], now: NOW + 3 * DAY });
    expect(readLedger(niche(), { language: "en" }).body!.picks.find((entry) => entry.videoId === "v1")).toMatchObject({ decision: "produced", unit: { unitId: unit.unitId } });

    // The #558 report sees the reference as a decision dimension.
    await importAnalytics({ context: { workspaceId: own }, ref: unit.unitId, platform: "tiktok", data: { views: 900, capturedAt: "2026-10-30", postedAt: "2026-10-29" }, write: true });
    const report = loadOutcomeReport({ workspaceId: own }, DEFAULT_REPORT_OPTIONS, { workspaceId: own, projectId: null });
    expect(JSON.stringify(report)).toContain("reference_signal");
  });

  test("skip stores the reason; unknown keys, unknown Units, and conflicting decisions are refused without writing", async () => {
    const own = createWorkspace({ slug: "own-account", name: "Own account" }).id;
    await ownUnit(own, "remake-v1");
    recordPicks({ niche: niche(), options: { language: "en" }, picks: [pick("v1"), pick("v2")], now: NOW });
    const skipped = skipPick({ workspaceId, pickId: "small-account-breakout:v2", scope: { language: "en" }, reason: "  creator-bound:   a giveaway ", now: NOW + DAY });
    expect(skipped).toMatchObject({ kind: "trend-pick-skip", written: true, pick: { decision: "skipped", skip: { reason: "creator-bound: a giveaway" } }, spreadCheck: { axis: "hook", value: "question" } });

    expect(() => skipPick({ workspaceId, pickId: "breakout:v9", scope: {}, reason: "x", now: NOW })).toThrow(expect.objectContaining({ code: "E_INPUT_INVALID" }));
    const unknown = thrown(() => linkPickToUnit({ workspaceId, pickId: "breakout:v1", scope: {}, unitRef: "remake-v1", unitContext: { workspaceId: own }, now: NOW }));
    expect(unknown).toMatchObject({ code: "E_INPUT_INVALID" });
    expect(unknown.detail).toContain("did you mean small-account-breakout:v1");
    expect(() => linkPickToUnit({ workspaceId, pickId: "small-account-breakout:v1", scope: {}, unitRef: "no-such-unit", unitContext: { workspaceId: own }, now: NOW })).toThrow(expect.objectContaining({ code: "E_NOT_FOUND" }));
    // The Unit lives in the own Workspace, not the corpus.
    expect(() => linkPickToUnit({ workspaceId, pickId: "small-account-breakout:v1", scope: {}, unitRef: "remake-v1", now: NOW })).toThrow(expect.objectContaining({ code: "E_NOT_FOUND" }));
    expect(() => skipPick({ workspaceId, pickId: "small-account-breakout:v1", scope: { niche: "other" }, reason: "x", now: NOW })).toThrow(expect.objectContaining({ code: "E_INPUT_INVALID" }));
    expect(() => skipPick({ workspaceId, pickId: "small-account-breakout:v1", scope: {}, reason: "   ", now: NOW })).toThrow(expect.objectContaining({ code: "E_INPUT_INVALID" }));
    expect(readPredictionLedgerDocument({ workspaceId, slug: "psychology-en" })?.revisions).toBe(2);

    linkPickToUnit({ workspaceId, pickId: "small-account-breakout:v1", scope: {}, unitRef: "remake-v1", unitContext: { workspaceId: own }, now: NOW + DAY });
    expect(thrown(() => skipPick({ workspaceId, pickId: "small-account-breakout:v1", scope: {}, reason: "changed my mind", now: NOW + 2 * DAY })).detail).toContain("is produced as Unit");
    // The same key in two scopes needs a scope flag.
    recordPicks({ niche: niche(), options: {}, picks: [pick("v1")], now: NOW });
    expect(thrown(() => skipPick({ workspaceId, pickId: "small-account-breakout:v1", scope: {}, reason: "x", now: NOW })).detail).toContain("is in 2 ledgers (psychology-en, psychology)");
  });

  test("precision joins produced picks to #558 outcomes against the predicted band, with the minimum n", async () => {
    const own = createWorkspace({ slug: "own-account", name: "Own account" }).id;
    const base = NOW - 40 * DAY;
    // Three earlier own posts set the prior-window median (1000 views).
    for (const [index, views] of [800, 1_000, 1_200].entries()) await ownUnit(own, `earlier-${index}`, { views, postedAt: base + index * DAY });
    const hit = await ownUnit(own, "remake-hit", { views: 2_500, postedAt: base + 10 * DAY });
    const miss = await ownUnit(own, "remake-miss", { views: 1_100, postedAt: base + 11 * DAY });
    await ownUnit(own, "remake-pending");
    // Relative band from a 16x reference: [16^0.25, 16^0.5] = [2, 4] x our median.
    const relative = { own: scaleUpEstimate({ views: 200_000, followers: 8_000, multiplier: 16, own: null }), spread: null };
    const detected = new Date(base).toISOString();
    recordPicks({
      niche: niche(),
      options: { language: "en" },
      picks: [
        pick("v1", { detectedAt: detected, predicted: relative }),
        pick("v2", { detectedAt: detected, predicted: relative }),
        pick("v3", { detectedAt: detected, predicted: relative }),
        pick("v4", { detectedAt: detected }),
      ],
      now: base,
    });
    const link = (video: string, unitRef: string) => linkPickToUnit({ workspaceId, pickId: `small-account-breakout:${video}`, scope: {}, unitRef, unitContext: { workspaceId: own }, now: base + DAY });
    link("v1", hit.unitId);
    link("v2", miss.unitId);
    link("v3", "remake-pending");
    skipPick({ workspaceId, pickId: "small-account-breakout:v4", scope: {}, reason: "off-brand", now: base + DAY });

    const report = buildPrecision({ niche: niche(), now: NOW, options: { language: "en" }, minN: 3 });
    expect(report.produced).toEqual([
      expect.objectContaining({ pickId: "small-account-breakout:v1", status: "resolved", verdict: "hit", views: 2_500, band: { low: 2_000, high: 4_000 }, position: "within", basis: "relative-band" }),
      expect.objectContaining({ pickId: "small-account-breakout:v2", status: "resolved", verdict: "miss", position: "below" }),
      expect.objectContaining({ pickId: "small-account-breakout:v3", status: "awaiting-outcome", verdict: null }),
    ]);
    // The skipped pick's spread window has elapsed (no corpus here: no spread = miss): 3 resolved, 1 hit.
    expect(report.rows.find((row) => row.signalType === "small-account-breakout")).toMatchObject({
      picks: 4, produced: 3, skipped: 1, resolved: 3, producedWithOutcome: 2, awaitingOutcome: 1, pendingSpreadChecks: 0, precision: 0.333, verdict: "ok",
    });
    expect(report.ledger).toMatchObject({ produced: 3, skipped: 1 });
    expect(report.notes.join(" ")).toContain("1 produced pick(s) wait");
    // Minimum n: with 4 required the same picks are insufficient data.
    expect(buildPrecision({ niche: niche(), now: NOW, options: { language: "en" }, minN: 4 }).rows.find((row) => row.signalType === "small-account-breakout")).toMatchObject({ precision: null, verdict: "insufficient data" });
  });
});
