# Validate trend-analysis methods on collected data: keep what works, drop the rest

> **Status:** todo (blocked on data: #556 corpus plus about 4-6 weeks of refresh snapshots)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** research / trend-watch / ranking

## Context

In chat the owner and the agent listed many methods borrowed from trading, quant finance and physics for trend-watching (#577 and beyond). On paper they all sound good. The owner's instruction: test them on the collected data and find out which really improve the analysis and which are over-engineering, so that the analysis leads to better content.

## What

A backtest harness plus a method-by-method trial against simple baselines.

1. **Point-in-time backtest harness.** Replay the append-only snapshot history: at time t a method sees only snapshots taken before t. Guards against look-ahead (no future metrics, no labels computed from later data), survivorship (baselines from creator listings only), and multiple testing (methods are tuned on a training period and judged once on a held-out later period).
2. **Prediction tasks with measurable targets** (all computable from the corpus, before we have our own posts):
   - early breakout: from the `h0-6` / `h6-24` / `d1-2` checkpoints, predict which videos end above the breakout threshold at 28 days (precision@k, recall, lead time in hours);
   - format spread: predict which formats or hook types will be adopted by more creators in the next 14 days;
   - small-account transferability: does a small-account breakout's format later work for larger creators in the niche;
   - near-miss repair: do creators who reshoot a near-miss topic with a different hook outperform (natural experiments in the corpus);
   - copyability ranking (#576): do top-ranked references' formats outperform when other creators use them afterwards.
3. **Baselines first.** Creator-relative multiplier from #556, raw views, and a views-per-follower ratio. Every method must beat the best simple baseline out of sample.
4. **Methods on trial** (each a small, separate experiment):
   - follower count at post time, follow conversion per 1k views, post-hit halo correction;
   - niche index normalization (beta) and regime / change-point detection;
   - Hawkes branching-ratio estimate from early checkpoints;
   - SIR-style format spread and R0;
   - extreme-value breakout thresholds per niche versus a fixed multiplier;
   - Kalman-filtered creator baseline versus rolling median;
   - lead-lag trendsetter detection;
   - novelty (KL divergence) and mutual-information feature selection;
   - within-creator fixed effects and difference-in-differences for format effects;
   - signal information coefficients and their monthly decay;
   - cross-platform and cross-language lag measurement;
   - the non-stationary linear bandit with a corpus prior, simulated on corpus data (a replay of "if we had posted what it picked").
5. **Verdicts.** For each method: lift over baseline with a confidence interval, compute and data cost, and a verdict: `adopt` (wire into #556 / #576 / #577 defaults), `situational` (keep behind a flag with a stated condition), or `drop`. Complexity must pay: a method adopts only if its out-of-sample lift beats the baseline by a margin set before the test (default 10% relative on the task metric) and its interval excludes zero.

## Why it matters

The analysis exists to make better content. Methods that do not improve predictions on real data waste tokens, request budget and attention, and add false confidence.

## Scope / acceptance

- `scripts/trend-backtest.ts` (or a `ralphy trends backtest` maintainer verb) runs every task point-in-time on a chosen period and prints the metric table.
- `docs/research/trend-methods-verdicts.md`: per method the task, baseline, lift with interval, cost, verdict and reason; plus what data was missing and when to re-test.
- Adopted methods wired into the engine defaults with tests; dropped methods removed from plans and noted in #577.
- A short "what this means for content" section: which signals the agent should trust when picking references and planning, in plain words.

## Notes

- Data contract: `docs/research/trend-dataset-spec.md` (backfill vs prospective cohorts, matched controls, negative control creators, gold set, time-based splits). Validation runs only on a frozen dataset version built to that spec.

- Blocked until #556 has run long enough to have 28-day outcomes for early checkpoints (about 4-6 weeks of refresh on at least one niche); start with the #576 psychology niche if it exists by then.
- Retention and completion exist only for our own posts (#558); methods that need them are deferred until enough own posts exist (minimum-n rule).
- Methods list comes from the chat discussion of 2026-10-28; add new candidates here rather than building them first.
