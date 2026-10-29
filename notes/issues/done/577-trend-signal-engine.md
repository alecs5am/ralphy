# Trend signal engine: watch the best, explain why, predict and check

> **Status:** done — 2026-10-29 (checkpoint: detectors, tiers, widening, scale-up formula, prediction ledger, `trends signals|precision`, within-creator contrasts for psychology EN, sponsored posts excluded; follow-up: `trends pick link|skip` link picks to produced Units and the Unit's #558 decision ledger, `trends precision` joins produced picks to #558 outcomes, `trends refresh --due` schedules by the computed attention tier. Waits for data: momentum, hot tier and precision need 2+ snapshots and outcomes)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** feature / trend-watch / ranking

## Context

Owner direction: with free-source limits we should watch the best content closely rather than everything, and the agent must separate WHY a video is good. In effect Ralphy runs its own ranking algorithm, like a platform's, so that we feed the platforms better content. The edge is catching signals other tools miss and interpreting them better. #556 gives the corpus and outlier score; #576 gives niche onboarding and copyability ranking; this issue is the attention and interpretation layer on top.

## What

1. **Attention budget (tiers).** Request budget goes where signal is: `hot` (a video under 72 h with rising momentum: refresh every 6 h), `watched` (qualifying creators: daily), `background` (weekly / monthly), `dropped`. A creator qualifies when it is alive and productive: posted in the last 14 days, at least N posts in 30 days (default 6), and at least one breakout or near-miss in the window. Tiers re-rank after every refresh.
2. **Signal types, each with its own detector and label:**
   - `breakout`: creator-relative multiplier above threshold (from #556).
   - `small-account-breakout`: a `nano` / `micro` creator jumping far above its own median and its follower count (1k-view creator, one video at 20k). Highest priority for #576 copyability.
   - `early-momentum`: views velocity in the `h0-6` / `h6-24` checkpoints far above the creator's usual curve; flags a breakout before it is obvious.
   - `near-miss`: strong but not breakout (default 2-4x), or momentum that stalled; split by cause using engagement ratios: high likes / saves / shares per view but low reach means content strong, packaging weak (hook, first frame, caption); high reach but low engagement means packaging strong, content weak. Each near-miss gets the concrete improvement hypothesis.
   - `emerging-format`: the same format, hook type or topic breaking out for 2+ unrelated creators within a short window; a trend before it peaks.
   - `demand-signal`: comments asking for more ("part 2", questions, "how"), counted from comment samples where available.
3. **Why it worked: within-creator contrast.** Compare the breakout with the same creator's median videos using #557 digests and transcripts. Same face, same audience, so the difference is topic, hook, structure, format, length, pacing, posting time, or sound. Output a short causal hypothesis with evidence, classified as `transferable` (format, hook, topic, structure) or `creator-bound` (personality, a personal event, a collab, a celebrity mention, a giveaway). Only transferable signals feed the content plan.
4. **Scale-up estimate.** For transferable signals, estimate what the idea could do on our account size: ratio of the video's reach to its creator's followers, applied to our baseline from #558, as a range with stated assumptions.
5. **Adaptive search widening.** When fewer than K qualifying references exist (default 20), widen in steps and record which step produced each item: lower the threshold to near-miss, extend the window, add adjacent sub-niches, other languages, other platforms.
6. **Prediction ledger.** Every pick stores its predicted outcome band. Two checks close the loop: picks we produce are compared with real results through #558; picks we skip are checked for whether the signal kept spreading (more creators, more breakouts). Report the engine's precision per signal type, and tune thresholds from it monthly.

## Why it matters

Competitors show multipliers. Our advantage: early momentum on small accounts, cross-creator replication, a causal "why" from digests and the course method, near-miss repair plans, and a feedback loop from our own produced results that no external tool has.

## Scope / acceptance

- `ralphy trends signals --niche <n> [--type ...]` lists signals with label, evidence, why-hypothesis, transferable flag and (for near-miss) the improvement hypothesis.
- Tier assignment and budget are visible in `ralphy trends status`; a test shows a dead or low-frequency creator never reaches `watched`.
- Within-creator contrast runs on the top 10 signals of a niche and writes its hypotheses to the niche report (#576).
- Adaptive widening triggers below K and records the widening step per item.
- Prediction ledger rows exist for every pick; `ralphy trends precision` reports per-signal precision once outcomes exist (minimum-n rule as in #558).
- Unit tests for each detector (fixtures for small-account breakout, early momentum, both near-miss causes, emerging format), the tier rules and the widening steps.

## Notes

- Sequence after #556 (corpus, snapshots, outlier score) and #576 (niche onboarding, copyability). Uses #557 digests and #571 retention review for the "why".
- Comment samples: free sources first (yt-dlp comment extraction for YouTube; TikTok comments only where logged-out access works); never bypass bot protection.

## Checkpoint (2026-10-29)

**Built.** Pure detectors, tiers, widening, scale-up and ledger math in `cli/lib/trends/signals.ts`; orchestration in `cli/lib/trends/signal-engine.ts`; store reads and the ledger Document in `cli/lib/store/trend-signals.ts` (no migration). Verbs: `ralphy trends signals --niche <n> [--lang] [--platform] [--sub-niche] [--type ...] [--since 30d] [--widen-since 90d] [--k 20] [--contrast N] [--record [--hypotheses f]] [--own-workspace] [--own-followers]` and `ralphy trends precision --niche <n> [--lang] [--min-n 3]`; `trends status` gains `attentionTiers`. Results for psychology EN: `docs/research/niche-report-psychology-en.md`, "Signals (#577)".

**Decisions.**

- Signals are judged only on scored, non-thin, non-provisional videos. `breakout` = the #556 percentile label `breakout` or `outlier`. `small-account-breakout` = seed / nano / micro, multiplier >= 10, views >= 10k, views >= 2x followers. `near-miss` = multiplier 2-4x, or 1-2x with an engagement lift >= 0.5; engagement lift = mean of the stored q for likes, shares, saves (at least two); +-0.3 splits `packaging-weak` / `content-weak` / `unclear`; only packaging-weak near-misses are transfer candidates. `early-momentum` = curve-adjusted growth between the first snapshot (taken within 24 h) and a later one (within 7 d), at least 0.5 above the creator's usual growth (median over its other two-snapshot videos when 3+ exist). `emerging-format` = one signal per format / hook label on its densest 14-day window with 2+ unrelated creators at 3x+ (handles normalized across platforms); lift vs the niche is evidence, not a gate. `demand-signal` is a stub reporting "not collected".
- Tiers are computed on read: `dropped` (excluded, or no post in 60+ days), `hot` (a video under 72 h with the `rising` flag or an early-momentum signal), `watched` (post in 14 days, 6+ posts in 30 days, a video at 2x+ non-thin in 30 days), else `background` (weekly; monthly when activity is unknown). Watch-page dates (one candidate per YouTube channel) do not count as cadence. Refresh scheduling by these tiers landed in the follow-up below.
- References for widening = transferable-candidate signals at or above the niche noise floor (50k). Steps: `base` (breakout, small-account, early momentum; `--since`), `near-miss-threshold`, `extend-window` (`--widen-since`), `adjacent-sub-niches` (only with `--sub-niche`), `other-languages`, `other-platforms` (only with a filter); a step that does not apply is recorded as such. `--contrast N` walks all steps to find N distinct creators.
- Scale-up: with an own follower count, [0.1, 0.5] x the reference's views per follower x our followers; with 3+ own #558 outcomes on the platform, [X^0.25, X^0.5] x our median views; otherwise "no own baseline yet" plus the relative band (regression to the mean is assumed because references are selected as extremes).
- Prediction ledger: JSON Document `trend-prediction-ledger-<niche>[-<lang>][-<platform>]`, kind `custom`, one revision per change. Picks = widened references, contrast picks, emerging formats; a recorded band, detection time and evidence are never rewritten, only `why` / `classification` may be filled. Precision per signal type: produced picks resolve through an `outcome` (#558), skipped picks with a label through a 14-day spread check; below 3 resolved picks "insufficient data".

**Runs (scratch corpus).** Psychology EN, last 30 days: breakout 17, small-account 6, near-miss 48 (29 / 12 / 7), emerging 1, early momentum 0 (no two-snapshot videos), demand not collected; widening stopped at `near-miss-threshold` with 26 references; ledger 3 revisions, 29 picks; precision insufficient data. Psychology RU (30 d): breakout 8, small-account 2, near-miss 23, widening reached K only at `other-languages`. AI tools EN: breakout 11, small-account 12, near-miss 38. Personal finance EN: 3 / 2 / 1, K not reached (7). Fitness EN: no signals (9 dated videos in 30 days).

**Blocked / not done.** Contact sheets and subtitles for the contrast set: the first TikTok video download (`yt-dlp`) got HTTP 403, so collection stopped; hypotheses rest on metadata and captions. Early momentum, stalled-momentum near-misses and `hot` need repeated snapshots. Linking picks to Units and tier-driven refresh: done in the follow-up below. Sponsored (`#ad`, paid partnership) videos are flagged `sponsored` and not judged. `docs/cli-surface.generated.md` not regenerated.

## Follow-up (2026-10-29): picks to Units, refresh by attention tier

**Built.**

- `ralphy trends pick link <pick-key> --unit <unit-id-or-slug> [--own-workspace <id>] [--niche <n>] [--lang <l>] [--platform <p>]` appends one prediction-ledger revision with `decision: produced` and the Unit reference (`unitId`, `slug`, `workspaceId`, `projectId`, `linkedAt`), then records `reference_pick=<key>` and `reference_signal=<signal type>` as manual entries in the Unit's #558 decision ledger through `recordManualDecisions()` (`cli/lib/analytics/ledger.ts`, the library form of `unit decisions --set`), so `analytics report` groups outcomes by reference type. The Unit is resolved in `--own-workspace` (default: the corpus Workspace).
- `ralphy trends pick skip <pick-key> --reason <text> [--niche] [--lang] [--platform]` appends a revision with `decision: skipped` and the reason; the output names the spread check and when it resolves.
- `trends signals` rows carry `pickKey` and `decision` once a video is in the ledger. Engine: `findPickLedger`, `linkPickToUnit`, `skipPick`, `producedPickOutcome` in `cli/lib/trends/signal-engine.ts`; pure `decidePick`, `predictedViewBand`, `judgeProducedPick` in `cli/lib/trends/signals.ts`; `listPredictionLedgerDocuments` in `cli/lib/store/trend-signals.ts`. No migration; Documents only.
- `trends refresh --due [--tier-source computed|stored]` (default `computed`): hot every 6 h, watched daily, background weekly, dropped never (`ATTENTION_REFRESH_HOURS`, `dueByAttentionTier`, `selectRefreshCreators`). The output gains `scheduling` (tier source, cadence, per platform and tier the creators considered / due / selected, and one row per listed creator with its tier, cadence and `selectedBy`); the listing run's metadata stores `tierSource` and `tierByCreator`. `--tier-source stored` keeps the #556 next listing time. `trends status` says which tier schedules refresh.

**Decisions.**

- Decision values are `pending | produced | skipped`. The prediction (band, evidence, detection time) is never touched by a decision. A produced pick stays linked to its Unit: linking it again to the same Unit is a no-op (no revision on either Document), to another Unit is refused, and skipping it is refused (its outcome is what precision checks). A skipped pick can still be produced later. Re-running `trends signals --record` keeps every decision.
- Pick lookup: the key is matched across the Workspace's ledgers, narrowed by `--niche` / `--lang` / `--platform`; a key in two ledgers asks for a scope flag; an unknown key is `E_INPUT_INVALID` with near matches (same video id) suggested; an unknown Unit is `E_NOT_FOUND` from `resolveUnitReference`.
- Precision join: a produced pick takes its Unit's newest #558 views on the pick's platform (else any platform with views). The band is the recorded absolute band when the pick had one (own follower count at pick time), else the recorded relative band times our own median views before the post (the #558 prior-window rule: up to 20 earlier own posts on that platform, this Unit excluded, at least 3). Hit = views at or above the low end; `position` reports below / within / above. Without an outcome or a baseline the pick is `awaiting-outcome` / `awaiting-baseline` and is never spread-checked. Skipped and still-pending picks keep the 14-day spread check. The minimum-n rule is unchanged (`--min-n`, default 3). Precision is computed on read; nothing is written back to the ledger.
- Refresh: the computed tier ignores the stored next listing time except as a failed-listing backoff (while `listing_failures > 0`); the most overdue creators (time since the last listing over the tier cadence) are listed first, capped by `--max-creators`. Never-listed creators keep their own `--max-new-creators` path. Without `--due` every non-excluded creator is listed and the tier is only recorded. A `dropped` creator (no post in 60+ days) is never re-listed by `--due`, so a revived account returns only through discovery or a run without `--due`.

**Tests.** `tests/unit/trends-signals.test.ts`: link / skip decisions and refusals, the band judge (relative and absolute), precision with produced, awaiting and skipped picks and the minimum n, cadence per computed tier with failure backoff, computed vs stored selection. `tests/integration/trends-signals.test.ts`: link appends a ledger revision and writes `reference_pick` / `reference_signal` to the Unit's decision ledger (the #558 report sees the dimension), idempotent repeat, skip with reason, unknown key / unknown Unit / wrong Workspace / wrong niche / empty reason / skip-after-produce / ambiguous key refused without writing, precision joined to fixture #558 outcomes (hit within band, miss below, one awaiting, one skipped). `tests/integration/trends-corpus.test.ts`: `refresh --due` lists nobody under the stored tier, both `watched` creators under the computed tier after 25 h with the tier per creator in the output and on the run, and nobody an hour later.

**Waits for data.**

- `early-momentum`, stalled-momentum near-misses and the `hot` tier need two or more dated snapshots per video; scheduled `refresh --due` runs accrue them (hot creators every 6 h once the first rising video appears).
- Precision needs produced Units with #558 outcomes (`analytics import`) and, for relative bands, at least 3 earlier own posts on the platform; spread checks resolve 14 days after detection (first on 2026-11-12). Until then every signal type reports "insufficient data".
- Threshold tuning from precision (monthly) waits for those resolved picks.
- Contact sheets and subtitles for the contrast set stay blocked by the TikTok download 403.
