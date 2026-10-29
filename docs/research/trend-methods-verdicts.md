# Trend-analysis method verdicts (#578)

**Status (2026-10-30): code ready, no verdicts yet.** Every number below is PRELIMINARY. The corpus has 1.3 days of snapshot history, and no prospective video has reached its 28-day outcome, so no method can be judged on held-out data. This file records what exists, what the harness could compute today, and how much history each method needs before the re-test.

## How to run

The harness replays a frozen copy of the corpus, never the live database:

```sh
sqlite3 .ralphy/cache/trend-corpus-run/ralphy.db ".backup .ralphy/cache/backtest-578/corpus.db"
bun run scripts/trend-backtest.ts --db .ralphy/cache/backtest-578/corpus.db \
  --workspace ws_0e31c56b-bcb3-47bd-8b1c-377be28cec40 --json .ralphy/cache/backtest-578/results/strict.json
```

Useful flags: `--tasks`, `--methods` (methods on trial; the baselines always run), `--axis format|hook|sound|hashtag`, `--availability-only`, and `--synthetic` (seeded synthetic corpus). `--retime-backfill [--backdate-followers]` and `--no-purge` give exploratory looks; reports made with them are always marked PRELIMINARY. The loader refuses a database that has a non-empty WAL file next to it.

It is a maintainer script, not a `ralphy trends backtest` verb. It is a research tool for the owner, not an agent workflow; it reads a database copy outside the Workspace store contract; and it must never become a default path. Code: `cli/lib/trends/backtest/` (harness, accessor, tasks, scorers, synthetic generator), `cli/lib/trends/methods/` (one pure module per method), `cli/lib/store/trend-backtest-source.ts` (read-only loader), `scripts/trend-backtest.ts`.

## Pre-registered protocol

These rules were fixed in code before any real data could be judged:

- **Point in time.** A method sees the corpus only through a view at time t: videos discovered before t, snapshots with `asOf < t`, follower snapshots before t, and labels available before t (caption rules and seed labels from discovery, model and manual labels from their write time). A request for any later instant throws `LookAheadError`. The derived `latest_*` and `outlier_*` columns are never loaded. Targets come from a separate outcome oracle that methods never receive. Tests: `tests/unit/trends-backtest.test.ts` (a cheating scorer gets only past snapshots; future reads throw).
- **Frozen dataset version.** `tbd1-<16 hex>` is a sha256 over the sorted snapshot set, the follower snapshots, and the static video and creator fields that methods read. It is recorded with every result.
- **Split.** By decision time. The last third of the decision span is held out, matching weeks 5-6 of 6. The decision span is the data span minus the outcome horizon. **Purged** by default: a training decision whose outcome is observed at or after the held-out start is dropped. The purge costs one outcome horizon of training data.
- **Tuning.** A method's weight (KL novelty, follow conversion) is chosen on the training side only (maximum precision@k), then judged once on the held-out side.
- **Baselines.** Creator-relative multiplier (#556 formula), raw views, and views per follower (followers at post time from snapshots before the decision). The format-spread task also has a naive "recent adoption" count. Each lift is measured against the best baseline on the held-out side, which is the conservative choice.
- **Interval.** A paired cluster bootstrap that resamples creators (or content units), with 300 replicates by default and a 95% percentile interval for the relative lift.
- **Adoption rule.** `passes` only when the relative lift is at least the 10% margin AND the interval excludes zero. A preliminary run never passes (`insufficient-data`). Passing is necessary for `adopt`, not sufficient: cost and the owner's review decide.

## Data available (dataset `tbd1-b198553d66fc98e4`, strict)

| Item | Value |
|---|---|
| Videos | 243,343 (dated 16,346: TikTok 16,134, YouTube watch page 212). About 227k YouTube flat-listing videos have no post date and are excluded from every task. |
| Snapshots | 245,884. Videos with 1 snapshot: 240,805; with 2+: 2,538 (dated: 15,893 / 453) |
| History | 1.31 days (2026-10-28 08:17 to 2026-10-29 15:37 UTC), 2 snapshot days |
| Prospective cohort (first snapshot at age <= 48 h) | 888 videos; 16 with 2+ snapshots inside 48 h; **0 with a 28-day outcome** |
| Backfill videos with a 28-56 day snapshot | 2,657 |
| Creators | 8,747; 953 with 2+ follower snapshots, but 911 of them show zero change (snapshots 4.9 h apart on average; 790 counts rounded to the hundred) |
| Labels | format 5,027 videos (rule labels); hook 52,727; non-original sound id 27; hashtags 99,522 |
| Dated videos per niche | tech-tips 10,750 (205 creators), psychology 4,391 (1,035), personal-finance 216, fitness 75, unknown 914 |

## Which tasks are computable today

| Task | Strict run | PRELIMINARY re-timed backfill (`--retime-backfill --backdate-followers --period-start 2026-05-01`, dataset `tbd1-bd6303be53b2cc59`) |
|---|---|---|
| Early breakout (precision@10 per week, lead time) | not enough history: 878 prospective decisions, all unresolved | not computable: backfill has no early checkpoints |
| Format spread, next 14 days | not enough history: 0 decision times | runs on hashtags (111 units) and hooks (4 units); format labels give 1 unit, sound ids 0 |
| Small-account transferability | not enough history | not enough data: 0 qualifying breakout / control units held out |
| Copyability ranking check (#576) | not enough history | not enough data: train 1 / held-out 33 references (hashtag axis) |
| Near-miss repair | stub: needs natural-experiment data | stub |
| Breakout threshold calibration (GPD) | not enough history | runs: psychology and tech-tips |
| Creator baseline accuracy (Kalman / CUSUM / halo) | not enough history | runs: 1,613 held-out videos |
| Bandit replay | not enough history | hook axis only: 41 matched replay events, too few |

What re-timing does: each backfill snapshot taken at age 28 days or older is treated as if it was taken at exactly post + 28 days, and each video as discovered at its post time. The value still includes growth after day 28, so older videos are inflated. `--backdate-followers` treats the creator's earliest follower count as valid from the creator's first post, which leaks later growth into "followers at post time". These runs show that the code works on real rows. They are not evidence.

## Per method

"Today" is the strict status. "PRELIMINARY" is the re-timed backfill number (all `rule = insufficient-data` by construction). Minimum history assumes daily refresh of the prospective cohort and the strict purge.

| Method | Judged on | Baseline it must beat | Today | PRELIMINARY number | Minimum history |
|---|---|---|---|---|---|
| Hawkes branching ratio from early checkpoints | early breakout | best of the three (creator multiplier expected) | not enough history | outcome-free: n fitted on the 16 videos with 2+ early snapshots: median 0.42 (p25 0.22, p75 0.65) | 84 days; prospective videos with >= 2 snapshots inside 48 h |
| Niche index normalization (beta) | early breakout | same | not enough history | none | 98 days; >= 30 creators per niche posting weekly |
| CUSUM change-point regime baseline | early breakout; baseline accuracy | rolling median | not enough history | baseline MAE 1.194 vs 1.155 rolling median: lift -3.4% [-7.0%, -0.2%] | 84 days; creators with >= 12 videos |
| Kalman-filtered creator baseline | baseline accuracy; early breakout | rolling median | not enough history | MAE 1.180 vs 1.155: lift -2.2% [-6.1%, +1.2%] (q 0.037, r 1.29) | 42 days for baseline accuracy (>= 30 held-out 28-day outcomes); 84 for early breakout |
| Post-hit halo correction | baseline accuracy; early breakout | rolling median | not enough history | MAE 1.152 vs 1.155: lift +0.2% [-0.6%, +1.1%]; fitted h0 0.73, tau 18 days from 729 post-hit pairs | 56 days; >= 20 post-hit pairs |
| GPD peaks-over-threshold thresholds per niche | threshold calibration (held-out exceedance vs 2%) | fixed 10x and empirical p98 (current default) | not enough history | mean calibration error: GPD 0.006, p98 0.005, fixed 10x 0.057; lift vs p98 -13% [-78%, +34%]. Cuts: psychology GPD 28.8x / p98 29.7x; tech-tips 62.0x / 68.9x | 56 days; >= 200 training + 50 held-out mature videos per niche |
| SIR-style spread / R0 (renewal forecast) | format spread | recent adoption, raw views, multiplier, views per follower | not enough history | hashtags: precision@5 0.267 vs 0.489 recent adoption, lift -40% [-62%, +5%]; mean IC 0.09 vs 0.33 | 70 days; units with >= 3 adopters in 28 days |
| Lead-lag trendsetter detection | format spread | same | not enough history | hashtags: precision@5 0.333 vs 0.489, lift -30% [-57%, 0%]; mean IC 0.28 vs 0.33 | 70 days; creators adopting >= 3 units with >= 5 adopters each |
| KL novelty | early breakout | best of the three | not enough history | none | 84 days |
| Information coefficient with monthly decay | diagnostic over every early-breakout scorer | n/a | not enough history | none | 120 days; >= 3 months with >= 30 decisions each |
| Follow conversion per 1k views | early breakout | best of the three | not enough history | outcome-free: 36 creators with usable deltas, median 0.0 per 1k views (p75 0.69). The rounded follower counts and the sub-day intervals make it uninformative today. | 84 days; exact follower counts at least daily |
| Non-stationary linear Thompson bandit (replay) | bandit replay | uniform and best-training-arm policies | not enough history | not enough matched events (hook axis: 41) | 84 days; >= 100 training and held-out events |
| Small-account breakout formats transfer (question, not a method) | small-account transferability | small-account normal-video units | not enough history | none | 170 days (114 without the purge) |
| Copyability ranking (#576 default) | copyability check | raw views, multiplier, views per follower | not enough history | none | 170 days (114 without the purge) |

## Synthetic validation (known answers)

Each method recovers a planted value from seeded synthetic data (`tests/unit/trends-methods.test.ts`):

| Method | Planted | Recovered |
|---|---|---|
| Hawkes MLE on a binned series | n = 0.3 / 0.6 / 0.8 | 0.26 / 0.62 / 0.76 (4,000 bins each) |
| Hawkes from 6 / 24 / 48 h checkpoints | n = 0.3 / 0.7 | median 0.30 / 0.70; 28-day total within 0.3% / 1.5% |
| SIR renewal R0 | 2.0 | median 2.00 over 20 epidemics |
| GPD PWM fit | xi 0.25, sigma 0.8 | 0.246, 0.803 |
| GPD peaks-over-threshold p98 | 7.445 | 7.609 |
| Kalman MLE | q 0.02, r 0.3 | 0.018, 0.300; one-step MSE 0.59x the rolling median under drift |
| CUSUM | shift at index 120 | median delay 8, change point exact (median); 6 false alarms in 30,000 stationary points |
| Niche beta | 0.4 / 1.0 / 1.6 | 0.43 / 1.01 / 1.60 |
| Lead-lag | lag 3; 3 planted trendsetters | lag 3; the 3 trendsetters ranked first |
| KL novelty | closed-form KL; planted novel hashtags | exact; AUC > 0.9 |
| Monthly IC decay | IC 0.582 at month 0, half-life 2 months | 0.579, 1.98 months |
| Halo | h0 0.8, tau 5 days | 0.76, 5.75 days |
| Follow conversion | 1-4 per 1k views per creator | median relative error 3.5% (22 creators) |
| Thompson bandit replay | fixed-arm reward 0.5; the best arm (0.6) moves to another arm halfway | replay 0.509; after the move, discounted 0.57 vs stationary 0.35 |

End to end on the synthetic corpus (120 creators, 120 days), the creator-relative multiplier beats raw views at early breakout by a wide margin (precision@10 0.68 vs 0.15). The corpus plants creator-level variation, so this checks the plumbing, not the real world.

## What data is still needed

1. **Prospective refresh history:** at least 84 days of daily listings so that the 48-hour decisions of weeks 1-2 and weeks 7-8 have their 28-day outcomes with the purge (56 days without it). `hot` creators need the 6-hour refresh so that the `h0-6` / `h6-24` / `d1-2` checkpoints exist. Today only 16 videos have two early snapshots.
2. **YouTube post dates:** about 227k YouTube videos are undated; they need the YouTube Data API connector (#555) before they count.
3. **Exact, daily follower counts:** follower deltas are mostly zero today (rounded counts, snapshots hours apart).
4. **Content labels at volume:** format labels cover 5,027 videos and form 1 unit with 3+ adopters. Format spread, transfer, copyability, and the bandit need LLM format labels on the prospective cohort. Non-original sound ids exist on 27 videos only.
5. **Natural-experiment pairs for near-miss repair:** reshoots of a near-miss topic with a different hook, matched through #557 digests.

## When to re-test

Re-run the strict harness on a new frozen copy once `availability.prospectiveWithOutcome` reaches about 300 breakout-eligible videos per niche, about 84 days after the prospective refresh started. That is 2027-01-22 at the earliest if daily refresh holds from 2026-10-30. Judge each method once on that dataset version, record its id here, and only then assign `adopt`, `situational`, or `drop`.

## Not built in this pass

These candidates from the issue need their own data path first: mutual-information feature selection, within-creator fixed effects and difference-in-differences for format effects, and cross-platform and cross-language lag. `crossCorrelationLag` exists in the lead-lag module but is not wired to a task.

## What this means for content (for now)

Nothing new has earned trust yet. When picking references and planning, the agent keeps using what it uses today: the #556 creator-relative multiplier and the #576 percentile labels. It treats everything in the methods table as unvalidated. On the re-timed backfill, the methods that adjust the creator baseline (Kalman, CUSUM, halo) did not beat the plain rolling median. Simple recent-adoption counts did at least as well as the spread models. The verdicts will come from the held-out run.
