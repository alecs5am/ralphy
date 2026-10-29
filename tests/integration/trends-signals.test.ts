import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { readPredictionLedgerDocument } from "../../cli/lib/store/trend-signals.js";
import type { NicheDto } from "../../cli/lib/store/trend-niches.js";
import { DEFAULT_NICHE_SETTINGS } from "../../cli/lib/trends/niche.js";
import { buildPrecision, ownBaselineFor, readLedger, recordPicks } from "../../cli/lib/trends/signal-engine.js";
import type { PredictionPick } from "../../cli/lib/trends/signals.js";
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
