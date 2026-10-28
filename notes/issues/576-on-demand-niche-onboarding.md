# On-demand niche onboarding: topic -> creators -> niche report

> **Status:** todo (sequence after #556)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** feature / trend-watch

## Context

The owner's core use case: "I decided to grow in the psychology niche" -> collect the accounts for that topic and analyze them. #556 builds a creator-first corpus with watchlists, seeds and a fixed two-level niche taxonomy (`docs/research/trend-corpus.md`, "Cohort taxonomy"), but it has no flow that starts from an arbitrary topic, and "psychology" is not even a top-level niche there (it would fall under `self-improvement` or `health`).

## What

`ralphy trends niche init "<topic>" [--lang en,ru] [--platform tiktok,youtube,instagram] [--target-creators 200]`, then `ralphy trends niche report <niche>`.

1. **Seed expansion.** From the topic, propose keyword, hashtag and sound seeds per language (one `callLLM()` call or the agent itself), plus sub-niches. For psychology: relationships and attachment, ADHD and neurodivergence, trauma and healing, anxiety, dark psychology and persuasion, therapist-led education, pop-psychology facts, self-help and habits. The agent shows the seed list; it is saved on the watchlist.
2. **Creator discovery, snowballed.** Seeds -> candidate creators (free sources first: TikTok Explore and sound pages, YouTube hashtag Shorts pages and channel search, Instagram Business Discovery by username), then expand through related creators: featured channels, suggested accounts, co-hashtags, stitch and duet mentions. Stop at the target count or when a round adds under 5% new creators.
3. **Relevance gate per creator.** Classify the creator's last 30 videos (titles, captions, free auto-subtitles): keep creators with at least 60% on-topic videos, store niche, sub-niche and confidence. Off-topic creators found through a broad hashtag are dropped, not scored.
4. **Coverage by size band.** Fill quotas across `nano`, `micro`, `mid`, `macro`, `mega` so the report can answer "what works for a small account", not only for stars.
5. **Open taxonomy.** A niche created by `niche init` is a first-class niche with its own sub-niches, not forced into the fixed list; the fixed list stays as the cross-niche default.
6. **Niche report.** Top outliers overall and per sub-niche and size band; winning formats and hook types with n and lift; posting cadence and video length of the creators who grow; sub-niche saturation (creator count) versus demand (median multiplier), as a gap table; entry formats for a new account; links to #557 digests for the top 20 references. Written as a Document and printable.

7. **Copyability ranking (owner rule).** A breakout on a small account is a better reference than a hit from a large one: the small creator has no audience to carry the video, so the format did the work. The report's default "what to copy" list ranks by a copyability score, not by raw views:
   - **creator-relative multiplier** from #556 (the base signal; it already lifts small-account breakouts);
   - **reach beyond the audience**: views / followers at snapshot time; a video far above its creator's follower count was distributed by the algorithm;
   - **size discount**: weight falls as the creator's size band rises (`nano` and `micro` highest, `mega` lowest), because a large account's views are partly audience-driven;
   - **replication**: a format or hook type that broke out for 2 or more unrelated small creators ranks above a single outlier (format, not luck); a creator whose breakout repeats on the same format counts as stronger evidence;
   - **noise floor**: a minimum absolute views threshold (default 50k, tunable per niche) so a 3x jump from 300 views is not a reference.
   Every ranked item shows the components, so the agent can explain why it picked a reference.

## Why it matters

A content plan "based on top performers" starts from a niche the owner names, often outside our taxonomy. Without a relevance gate the corpus fills with whoever used the hashtag; without size quotas it only describes megastars.

## Scope / acceptance

- `niche init` on "psychology" (EN) reaches at least 150 relevant creators and 4,000 videos on free sources, with wall time and blocks recorded in `docs/research/trend-corpus.md`.
- Relevance gate precision checked by hand on 50 random kept and 20 dropped creators (target 90% / 80%).
- `niche report psychology` produces every section above; sections with too little data say so (minimum-n rule as in #558).
- The default "what to copy" list is ranked by the copyability score; a test shows a `micro` creator's 20x breakout with 500k views outranks a `mega` creator's 1.5x video with 5M views, and a 3x jump below the noise floor is excluded.
- Tests for seed persistence, snowball stop rule, relevance threshold, size-band quotas, report shape; `bun run lint`, `bun test`, `cli:surface:check` pass.

## Notes

- Dataset design (niches, creator quotas, negative control group, enrichment tiers, gold set, filters): `docs/research/trend-dataset-spec.md`. Onboarding follows it; the four approved niches are psychology (EN + RU), AI tools / tech tips, personal finance, and one visual niche.

- Sequence after #556 (uses its tables, sources, circuit breaker and outlier score) and #557 (digests).
- Instagram Business Discovery (free, needs a Meta app and a professional account) returns views, likes and comments for other professional accounts per the #555 research; evaluate it here as the free Instagram path.
