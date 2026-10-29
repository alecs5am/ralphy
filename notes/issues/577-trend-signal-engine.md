# Trend signal engine: watch the best, explain why, predict and check

> **Status:** in progress — checkpoint landed 2026-10-29 (detectors, tiers, widening, scale-up formula, prediction ledger, `trends signals|precision`, 10 within-creator contrasts for psychology EN, sponsored posts excluded). Open: link picks to produced Units, schedule refresh by attention tier; momentum, hot tier and precision wait for 2+ snapshots and #558 outcomes
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
- Tiers are computed on read: `dropped` (excluded, or no post in 60+ days), `hot` (a video under 72 h with the `rising` flag or an early-momentum signal), `watched` (post in 14 days, 6+ posts in 30 days, a video at 2x+ non-thin in 30 days), else `background` (weekly; monthly when activity is unknown). Watch-page dates (one candidate per YouTube channel) do not count as cadence. Refresh scheduling still follows the stored #556 tiers.
- References for widening = transferable-candidate signals at or above the niche noise floor (50k). Steps: `base` (breakout, small-account, early momentum; `--since`), `near-miss-threshold`, `extend-window` (`--widen-since`), `adjacent-sub-niches` (only with `--sub-niche`), `other-languages`, `other-platforms` (only with a filter); a step that does not apply is recorded as such. `--contrast N` walks all steps to find N distinct creators.
- Scale-up: with an own follower count, [0.1, 0.5] x the reference's views per follower x our followers; with 3+ own #558 outcomes on the platform, [X^0.25, X^0.5] x our median views; otherwise "no own baseline yet" plus the relative band (regression to the mean is assumed because references are selected as extremes).
- Prediction ledger: JSON Document `trend-prediction-ledger-<niche>[-<lang>][-<platform>]`, kind `custom`, one revision per change. Picks = widened references, contrast picks, emerging formats; a recorded band, detection time and evidence are never rewritten, only `why` / `classification` may be filled. Precision per signal type: produced picks resolve through an `outcome` (#558), skipped picks with a label through a 14-day spread check; below 3 resolved picks "insufficient data".

**Runs (scratch corpus).** Psychology EN, last 30 days: breakout 17, small-account 6, near-miss 48 (29 / 12 / 7), emerging 1, early momentum 0 (no two-snapshot videos), demand not collected; widening stopped at `near-miss-threshold` with 26 references; ledger 3 revisions, 29 picks; precision insufficient data. Psychology RU (30 d): breakout 8, small-account 2, near-miss 23, widening reached K only at `other-languages`. AI tools EN: breakout 11, small-account 12, near-miss 38. Personal finance EN: 3 / 2 / 1, K not reached (7). Fitness EN: no signals (9 dated videos in 30 days).

**Blocked / not done.** Contact sheets and subtitles for the contrast set: the first TikTok video download (`yt-dlp`) got HTTP 403, so collection stopped; hypotheses rest on metadata and captions. Early momentum, stalled-momentum near-misses and `hot` need repeated snapshots. No verb links a pick to a produced Unit yet (`decision` / `outcome` stay `pending` / null). Tier-driven refresh budgets are not wired into `trends refresh`. Sponsored (`#ad`) videos reach the reference list; they need an exclusion rule. `docs/cli-surface.generated.md` not regenerated.
