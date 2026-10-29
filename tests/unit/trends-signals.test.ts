import { describe, expect, test } from "bun:test";
import { DAY_MS, HOUR_MS } from "../../cli/lib/trends/math.js";
import { pickControls } from "../../cli/lib/trends/signal-engine.js";
import {
  attentionTier,
  detectBreakouts,
  detectDemandSignals,
  detectEarlyMomentum,
  detectEmergingFormats,
  detectNearMisses,
  detectSmallAccountBreakouts,
  isSponsored,
  mergePicks,
  precisionReport,
  scaleUpEstimate,
  widenReferences,
  PREDICTION_LEDGER_BODY_KIND,
  type PredictionLedgerBody,
  type PredictionPick,
  type SignalVideo,
  type TierFacts,
} from "../../cli/lib/trends/signals.js";

const NOW = Date.UTC(2026, 9, 29, 12);

let seq = 0;
function video(over: Partial<SignalVideo> = {}): SignalVideo {
  seq += 1;
  return {
    videoId: `v${seq}`,
    creatorId: "c1",
    creatorKey: "c1",
    platform: "tiktok",
    postedAt: NOW - 10 * DAY_MS,
    ageHours: 240,
    views: 20_000,
    multiplier: 1,
    z: 0,
    label: "normal",
    flags: [],
    engagement: { likes: 0, comments: 0, shares: 0, saves: 0 },
    followers: 1_000,
    sizeBand: "nano",
    format: null,
    hook: null,
    snapshots: [],
    ...over,
  };
}

describe("small-account-breakout", () => {
  test("a nano creator's 20x video far above its follower count fires", () => {
    const signals = detectSmallAccountBreakouts([video({ multiplier: 20, views: 20_000, followers: 1_000, sizeBand: "nano" })]);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.type).toBe("small-account-breakout");
    expect(signals[0]!.evidence.viewsPerFollower).toBe(20);
  });

  test("large creators, small jumps, and reach inside the audience do not fire", () => {
    const signals = detectSmallAccountBreakouts([
      video({ multiplier: 20, views: 2_000_000, followers: 5_000_000, sizeBand: "mega" }),
      video({ multiplier: 5, views: 20_000, followers: 1_000, sizeBand: "nano" }),
      video({ multiplier: 20, views: 20_000, followers: 50_000, sizeBand: "micro" }),
      video({ multiplier: 30, views: 4_000, followers: 300, sizeBand: "seed" }),
      video({ multiplier: 20, views: 20_000, followers: 1_000, sizeBand: "nano", flags: ["thin"] }),
      video({ multiplier: 20, views: 20_000, followers: 1_000, sizeBand: "nano", ageHours: 30, flags: ["provisional"] }),
    ]);
    expect(signals).toHaveLength(0);
  });
});

describe("breakout", () => {
  test("re-surfaces the #556 breakout / outlier labels only", () => {
    const signals = detectBreakouts([video({ multiplier: 30, label: "breakout" }), video({ multiplier: 12, label: "outlier" }), video({ multiplier: 4, label: "strong" })]);
    expect(signals.map((signal) => signal.label)).toEqual(["breakout", "breakout (outlier label)"]);
  });
});

describe("early-momentum", () => {
  test("fast curve-adjusted growth from an h0-6 snapshot fires; flat growth does not", () => {
    const fast = video({ postedAt: NOW - 30 * HOUR_MS, ageHours: 30, snapshots: [{ ageHours: 4, views: 1_000 }, { ageHours: 30, views: 60_000 }] });
    const flat = video({ creatorId: "c2", creatorKey: "c2", postedAt: NOW - 30 * HOUR_MS, ageHours: 30, snapshots: [{ ageHours: 4, views: 1_000 }, { ageHours: 30, views: 3_000 }] });
    const single = video({ creatorId: "c3", creatorKey: "c3", snapshots: [{ ageHours: 240, views: 20_000 }] });
    const result = detectEarlyMomentum([fast, flat, single]);
    expect(result.withTwoSnapshots).toBe(2);
    expect(result.signals.map((signal) => signal.videoId)).toEqual([fast.videoId]);
    expect(Number(result.signals[0]!.evidence.momentum)).toBeGreaterThan(0.5);
  });

  test("a first snapshot after 24 h is not early", () => {
    const late = video({ snapshots: [{ ageHours: 48, views: 1_000 }, { ageHours: 100, views: 90_000 }] });
    expect(detectEarlyMomentum([late]).signals).toHaveLength(0);
  });
});

describe("near-miss", () => {
  test("splits by cause from engagement ratios", () => {
    const packaging = video({ multiplier: 3, engagement: { likes: 0.8, shares: 0.6, saves: 0.7 } });
    const content = video({ multiplier: 3, engagement: { likes: -0.6, shares: -0.5, saves: -0.7 } });
    const unclear = video({ multiplier: 3, engagement: { likes: 0.1, shares: -0.1, saves: 0 } });
    const engagementOnly = video({ multiplier: 1.5, engagement: { likes: 0.7, shares: 0.6, saves: 0.9 } });
    const ordinary = video({ multiplier: 1.5, engagement: { likes: 0.1, shares: 0.1, saves: 0.1 } });
    const breakout = video({ multiplier: 3.5, label: "outlier", engagement: { likes: 0.8, shares: 0.8, saves: 0.8 } });
    const signals = detectNearMisses([packaging, content, unclear, engagementOnly, ordinary, breakout]);
    const byVideo = new Map(signals.map((signal) => [signal.videoId, signal]));
    expect(byVideo.get(packaging.videoId)?.cause).toBe("packaging-weak");
    expect(byVideo.get(content.videoId)?.cause).toBe("content-weak");
    expect(byVideo.get(unclear.videoId)?.cause).toBe("unclear");
    expect(byVideo.get(engagementOnly.videoId)?.cause).toBe("packaging-weak");
    expect(byVideo.has(ordinary.videoId)).toBe(false);
    expect(byVideo.has(breakout.videoId)).toBe(false);
    expect(byVideo.get(packaging.videoId)?.improvement).toContain("rework the packaging");
    expect(byVideo.get(content.videoId)?.improvement).toContain("fix the body");
    expect(byVideo.get(content.videoId)?.transferCandidate).toBe(false);
  });
});

describe("emerging-format", () => {
  test("the same hook breaking out for 2 unrelated creators within 14 days fires", () => {
    const signals = detectEmergingFormats([
      video({ creatorId: "a", creatorKey: "a", hook: "pov", multiplier: 4, postedAt: NOW - 12 * DAY_MS }),
      video({ creatorId: "b", creatorKey: "b", hook: "pov", multiplier: 5, postedAt: NOW - 5 * DAY_MS }),
      video({ creatorId: "c", creatorKey: "c", hook: "pov", multiplier: 1, postedAt: NOW - 4 * DAY_MS }),
    ], NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.key).toBe("emerging-format:hook:pov");
    expect(signals[0]!.evidence.unrelatedCreators).toBe(2);
    expect(signals[0]!.evidence.active).toBe(true);
  });

  test("one creator, the same person on two platforms, or hits 30 days apart do not fire", () => {
    const signals = detectEmergingFormats([
      video({ creatorId: "a", creatorKey: "a", format: "listicle", multiplier: 4, postedAt: NOW - 10 * DAY_MS }),
      video({ creatorId: "a", creatorKey: "a", format: "listicle", multiplier: 6, postedAt: NOW - 9 * DAY_MS }),
      video({ creatorId: "a-yt", creatorKey: "a", platform: "youtube", format: "listicle", multiplier: 6, postedAt: NOW - 8 * DAY_MS }),
      video({ creatorId: "b", creatorKey: "b", hook: "question", multiplier: 4, postedAt: NOW - 60 * DAY_MS }),
      video({ creatorId: "c", creatorKey: "c", hook: "question", multiplier: 4, postedAt: NOW - 20 * DAY_MS }),
    ], NOW);
    expect(signals).toHaveLength(0);
  });
});

describe("demand-signal", () => {
  test("is a stub that reports not collected", () => {
    const result = detectDemandSignals(null);
    expect(result.status).toBe("not collected");
    expect(result.signals).toEqual([]);
  });
});

describe("attention tiers", () => {
  const facts = (over: Partial<TierFacts>): TierFacts => ({ creatorId: "c", lastPostedAt: NOW - DAY_MS, posts30: 12, signals30: 2, hotVideo: false, excluded: false, ...over });

  test("an alive, productive creator with a signal is watched", () => {
    expect(attentionTier(facts({}), NOW).tier).toBe("watched");
  });

  test("a dead or low-frequency creator never reaches watched", () => {
    for (const lastDays of [1, 5, 13, 15, 30, 59, 61, 120]) {
      for (const posts30 of [0, 1, 3, 5]) {
        for (const signals30 of [0, 1, 5]) {
          const tier = attentionTier(facts({ lastPostedAt: NOW - lastDays * DAY_MS, posts30, signals30 }), NOW).tier;
          expect(tier).not.toBe("watched");
        }
      }
    }
    for (const lastDays of [15, 30, 61, 365]) {
      expect(attentionTier(facts({ lastPostedAt: NOW - lastDays * DAY_MS, posts30: 20, signals30: 3 }), NOW).tier).not.toBe("watched");
    }
    expect(attentionTier(facts({ lastPostedAt: NOW - 90 * DAY_MS, posts30: 0, signals30: 0 }), NOW).tier).toBe("dropped");
    expect(attentionTier(facts({ posts30: 3 }), NOW).tier).toBe("background");
  });

  test("no signal keeps a frequent poster in background; hot, excluded, and undated", () => {
    expect(attentionTier(facts({ signals30: 0 }), NOW).tier).toBe("background");
    expect(attentionTier(facts({ hotVideo: true, lastPostedAt: NOW - 10 * HOUR_MS }), NOW).tier).toBe("hot");
    expect(attentionTier(facts({ excluded: true }), NOW).tier).toBe("dropped");
    expect(attentionTier(facts({ posts30: null, lastPostedAt: null }), NOW)).toMatchObject({ tier: "background", cadence: "monthly" });
  });
});

describe("adaptive widening", () => {
  test("widens step by step below K and records the step per item", () => {
    const result = widenReferences<string>([
      { step: "base", items: ["a"], note: "base" },
      { step: "near-miss-threshold", items: ["a", "b"], note: "near-miss" },
      { step: "extend-window", items: ["a", "b", "c", "d"], note: "90 days" },
      { step: "adjacent-sub-niches", items: null, note: "whole niche" },
      { step: "other-languages", items: ["a", "b", "c", "d", "e"], note: "ru" },
    ], (item) => item, 4);
    expect(result.items.map((entry) => [entry.item, entry.wideningStep])).toEqual([["a", "base"], ["b", "near-miss-threshold"], ["c", "extend-window"], ["d", "extend-window"]]);
    expect(result.steps.map((step) => step.status)).toEqual(["applied", "applied", "applied", "not needed", "not needed"]);
    expect(result.reachedK).toBe(true);
  });

  test("records a non-applicable step and reports when K is not reached", () => {
    const result = widenReferences<string>([
      { step: "base", items: [], note: "base" },
      { step: "adjacent-sub-niches", items: null, note: "whole niche already in scope" },
      { step: "other-platforms", items: ["x"], note: "all platforms" },
    ], (item) => item, 20);
    expect(result.steps.map((step) => [step.step, step.status])).toEqual([["base", "applied"], ["adjacent-sub-niches", "not applicable"], ["other-platforms", "applied"]]);
    expect(result.items[0]!.wideningStep).toBe("other-platforms");
    expect(result.reachedK).toBe(false);
  });
});

describe("scale-up estimate", () => {
  test("says no own baseline yet without #558 outcomes or a follower count, and keeps the relative band", () => {
    const estimate = scaleUpEstimate({ views: 500_000, followers: 50_000, multiplier: 16, own: { platform: "tiktok", n: 1, medianViews: null, followers: null, minN: 3 } });
    expect(estimate.status).toBe("no own baseline yet");
    expect(estimate.low).toBeNull();
    expect(estimate.relativeToOwnMedian).toEqual({ low: 2, high: 4 });
  });

  test("applies the multiplier to the own median or the reach per follower to own followers", () => {
    const median = scaleUpEstimate({ views: 500_000, followers: 50_000, multiplier: 16, own: { platform: "tiktok", n: 5, medianViews: 2_000, followers: null, minN: 3 } });
    expect(median).toMatchObject({ status: "ok", method: "own-median", low: 4_000, high: 8_000 });
    const reach = scaleUpEstimate({ views: 500_000, followers: 50_000, multiplier: 16, own: { platform: "tiktok", n: 0, medianViews: null, followers: 1_000, minN: 3 } });
    expect(reach).toMatchObject({ status: "ok", method: "reach-per-follower", low: 1_000, high: 5_000 });
  });
});

function pick(over: Partial<PredictionPick> = {}): PredictionPick {
  return {
    pickId: "breakout:v1",
    signalType: "breakout",
    cause: null,
    wideningStep: "base",
    videoId: "v1",
    url: "https://example.com/v1",
    creator: "a",
    platform: "tiktok",
    detectedAt: new Date(NOW).toISOString(),
    evidence: { multiplier: 20, views: 100_000, followers: 5_000, format: null, hook: "pov", creators: null },
    predicted: { own: null, spread: { axis: "hook", value: "pov", creatorsAtPick: 1, withinDays: 14 } },
    why: null,
    classification: "unclassified",
    decision: "pending",
    outcome: null,
    ...over,
  };
}

describe("prediction ledger", () => {
  test("appends new picks, never rewrites a recorded prediction, and fills hypotheses", () => {
    const first = mergePicks([], [pick()]);
    expect(first).toMatchObject({ added: 1, updated: 0 });
    const second = mergePicks(first.picks, [
      pick({ detectedAt: new Date(NOW + DAY_MS).toISOString(), evidence: { multiplier: 99, views: 1, followers: 1, format: null, hook: null, creators: null }, why: "Hook names the viewer's own situation", classification: "transferable" }),
      pick({ pickId: "near-miss:v2", signalType: "near-miss", videoId: "v2" }),
    ]);
    expect(second).toMatchObject({ added: 1, updated: 1 });
    expect(second.picks).toHaveLength(2);
    expect(second.picks[0]!.detectedAt).toBe(new Date(NOW).toISOString());
    expect(second.picks[0]!.evidence.multiplier).toBe(20);
    expect(second.picks[0]!.why).toBe("Hook names the viewer's own situation");
    expect(second.picks[0]!.classification).toBe("transferable");
    const third = mergePicks(second.picks, [pick()]);
    expect(third).toMatchObject({ added: 0, updated: 0 });
  });

  test("precision reports insufficient data until enough picks resolve", () => {
    const facts = { spreadCreatorsAfter: () => 1 };
    const empty = precisionReport(null, facts, NOW, 3);
    expect(empty.rows.every((row) => row.verdict === "insufficient data" && row.precision === null)).toBe(true);
    const ledger: PredictionLedgerBody = { kind: PREDICTION_LEDGER_BODY_KIND, version: 1, niche: "psychology", scope: { language: "en", platform: null }, picks: [pick(), pick({ pickId: "breakout:v2", videoId: "v2" })], updatedAt: new Date(NOW).toISOString() };
    const fresh = precisionReport(ledger, facts, NOW + DAY_MS, 3);
    expect(fresh.rows.find((row) => row.signalType === "breakout")).toMatchObject({ picks: 2, resolved: 0, pendingSpreadChecks: 2, verdict: "insufficient data" });
    const old = new Date(NOW - 20 * DAY_MS).toISOString();
    ledger.picks = [pick({ detectedAt: old }), pick({ pickId: "breakout:v2", detectedAt: old }), pick({ pickId: "breakout:v3", detectedAt: old }), pick({ pickId: "breakout:v4", outcome: { checkedAt: old, views: 10, ownMedianViews: 100, verdict: "miss" } })];
    const resolved = precisionReport(ledger, facts, NOW, 3).rows.find((row) => row.signalType === "breakout")!;
    expect(resolved).toMatchObject({ resolved: 4, producedWithOutcome: 1, verdict: "ok", precision: 0.75 });
  });
});

describe("within-creator contrast", () => {
  test("controls are the creator's videos nearest its median, preferring ones close in time", () => {
    const signal = video({ multiplier: 40, label: "breakout" });
    const near = video({ multiplier: 1.05, postedAt: signal.postedAt! - 2 * DAY_MS });
    const nearOld = video({ multiplier: 1.05, postedAt: signal.postedAt! - 80 * DAY_MS });
    const median = video({ multiplier: 0.95, postedAt: signal.postedAt! + DAY_MS });
    const far = video({ multiplier: 6 });
    const thin = video({ multiplier: 1, flags: ["thin"] });
    const controls = pickControls(signal, [signal, near, nearOld, median, far, thin]);
    expect(controls.map((entry) => entry.videoId)).toEqual([median.videoId, near.videoId, nearOld.videoId]);
  });
});

describe("sponsored posts (#577)", () => {
  test("recognizes ad markers in hashtags, titles and the platform flag", () => {
    expect(isSponsored({ hashtags: ["ad", "therapy"] })).toBe(true);
    expect(isSponsored({ title: "#ad Why my clients sleep better" })).toBe(true);
    expect(isSponsored({ title: "Paid partnership with a sleep app" })).toBe(true);
    expect(isSponsored({ isAd: true })).toBe(true);
    expect(isSponsored({ title: "How to add one habit", hashtags: ["adhd"] })).toBe(false);
  });

  test("a sponsored breakout is not a reference", () => {
    const paid = video({ multiplier: 60, label: "breakout", flags: ["sponsored"] });
    const organic = video({ multiplier: 60, label: "breakout" });
    expect(detectBreakouts([paid]).length).toBe(0);
    expect(detectBreakouts([organic]).length).toBe(1);
  });
});
