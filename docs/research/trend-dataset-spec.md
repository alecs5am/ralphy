# Trend dataset spec (datasheet), v1

Owner-approved design for the trend corpus that feeds #576 (niche reports), #577 (signal engine) and #578 (method validation). Decided with the owner on 2026-10-28. The corpus mechanics (tables, sources, outlier score) live in #556 and `docs/research/trend-corpus.md`; this file says WHAT goes in and why.

## Questions the dataset must answer

| Consumer | Requirement |
|---|---|
| #576 niche report, copyability | In-niche creators across size bands; honest per-creator medians |
| #577 signals | Videos observed from their first hours, not found already mature |
| #578 method validation | Positives AND negatives; time-based splits; no look-ahead |
| "Why it worked" | Hit vs same-creator normal videos, with transcripts and contact sheets |

Selecting on the outcome is the main trap: analysing only winners shows what winners have, not what separates them from flops.

## Niches (5)

| Niche | Languages | Why |
|---|---|---|
| Psychology | EN + RU | Owner's target; the language pair measures cross-language lag |
| AI tools / tech tips | EN | Fast trends, short half-life; free sample already exists |
| Personal finance | EN | Talking head, evergreen, high ad value |
| A visual, low-speech niche (food or fitness; pick by seed yield) | EN | Checks that methods do not depend on transcripts |
| Investing and venture capital (a16z-style: VC, startups and founders, AI and tech theses, company breakdowns, markets, macro) | EN | Added 2026-10-30 on owner request: content demand for this theme in the library; distinct from personal finance basics |

## Creators: 300-500 per niche

- **Relevance gate:** at least 60% of the last 30 videos on-topic.
- **Size quotas:** roughly equal across `<10k`, `10k-100k`, `100k-1M`, `1M+`, with small bands over-sampled when seeds allow.
- **Activity:** posted in the last 14 days to count as active; inactive creators are stored but excluded from active analyses.
- **Daily follower snapshot** for every watched creator (followers at post time, follow conversion, post-hit halo).
- **Negative control group (owner rule): 15-20% of creators per niche (about 60-80), size-matched to the rest.** Active, frequent posters (at least 6 posts in 30 days) in the niche that stay persistently below their cohort median multiplier for 60 days, with flat follower growth and no breakout or near-miss in the window. Defined by metrics, never by taste. Purpose: the reference for what not to do, and the contrast set for "same topic, same frequency, why does it not work". Creators in this group whose engagement per view is high but reach is low are flagged `packaging-weak` (near-miss candidates), not merged with the rest.
- **Anomaly accounts** (suspected bought engagement, repost / theft accounts, compilation pages) are flagged and kept out of both the main and the negative group.

## Videos: all of them, in two cohorts that never mix

1. **Backfill:** every video from the last 90 days per creator (about 30-60 each). Used for baselines, format distributions and within-creator contrast. Never used for early-breakout prediction (first seen already mature).
2. **Prospective:** every new video of a watched creator from first sighting, with checkpoints at 6 h, 24 h, 2, 3, 7, 14 and 28 days. The only cohort used for early prediction.

Metadata and metric snapshots are collected for 100% of videos (one creator listing per request).

## Enrichment tiers

| Tier | Which videos | What | Volume per niche |
|---|---|---|---|
| 0 | All | Metadata, metric snapshots, caption, hashtags, sound, duration, language | ~15-25k backfill + ~2k new per week |
| 1 positives | Breakout, near-miss, early momentum | Download, transcript (YouTube subtitles or local Whisper), `ralphy ref digest`, format / hook / structure labels, comment sample | ~3-5% |
| 1 matched controls | 2-3 normal videos of the same creator close in time, per positive | Same as positives | 2-3x positives |
| 1 negative group | Recent videos of negative-control creators | Same as positives | ~5 per creator |
| 1 random | ~5% of all videos, stratified by size band and format | Same as positives | unbiased prevalence |
| 2 gold | 150-200 Tier-1 videos | Careful labels by the agent from high-resolution sheets; the owner reviews 50 | label-accuracy measurement |

Label accuracy below about 80% on the gold set makes format conclusions unreliable; fix the classifier before drawing them.

## Quality filters

- Reposts and duplicates across accounts by perceptual frame hash; excluded from baselines.
- Labels for ads / sponsored, pinned, collab / duet / stitch.
- Engagement-ratio anomaly flag (possible bought views).
- Deleted videos kept with a deletion mark.
- Metric precision stored (`exact` or `rounded`).
- Baselines leave-one-out.
- Exact snapshot timestamp and video age at each snapshot.
- Language and region per video; English niches seeded with English seeds (Explore is geo-localized by IP).

## Splits and versioning

Time-based only: weeks 1-4 tune, weeks 5-6 held out. The dataset is frozen into a named version before #578 judges anything.

## Size and timeline

About 3% of videos break out. Roughly 300 prospective breakouts per niche are needed to compare format effects with within-creator controls. 400 creators x ~5 posts per week gives ~2k new videos and ~60 breakouts per week, so 4-6 weeks of refresh. Per niche: ~20k backfill, ~10k prospective, ~1.5-2.5k Tier-1, 200 gold.

## Sources

Core: yt-dlp (TikTok creator listings logged out, YouTube flat listings and subtitles), Playwright Explore / sound capture, YouTube Data API free quota (key pending), Instagram decision pending (Apify or Business Discovery). A different scraper is added only if a core path stops working. No proxies, cookies, CAPTCHA solving or request-signature forging.
