# Trend signal engine: watch the best, explain why, predict and check

> **Status:** todo (sequence after #556 and #576)
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
