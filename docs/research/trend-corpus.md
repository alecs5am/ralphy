# Trend corpus at 100k+ short videos: research and design

**Issue #555. Feeds #556 (build), #557 (digest per video), #558 (cohort baselines).**
Research date: 2026-10-28. Every price, limit, and policy below was read on that date
from the cited page; vendor marketing claims are marked as claims. Measured numbers
come from free, logged-out runs on one residential connection (raw data under the
gitignored `.ralphy/cache/trend-sample/`).

## Summary and recommendation

A 100k-video corpus is cheap if it is built **creator-first**: find creators through
popularity-biased discovery surfaces, then list each creator's recent videos. One
creator listing returns every recent video with its metrics, so the daily refresh
scales with the number of creators, not with the number of videos. Discovery
surfaces are only a seed source. The YouTube sample shows why: videos found on
hashtag pages had a median of 7.1x their own creator's median views, so a "top in
niche" list built from discovery alone is mostly survivors.

Recommendation:

1. **TikTok: own yt-dlp creator listing (`tiktokuser:<secUid>`), logged out.** It is
   free, returns views, likes, comments, shares, saves, post time, and duration for
   the latest N videos, and ran at about 39 videos/s with zero blocks (9,591 videos
   from 179 creators in 244 s). Seed creators from the logged-out Explore category
   feed and sound pages. Use a paid Apify actor only for keyword/hashtag seed
   discovery, because TikTok hashtag pages return empty bodies logged out and search
   shows a CAPTCHA.
2. **YouTube Shorts: own flat browse listing for discovery and baselines, plus the
   YouTube Data API for exact stats and dates.** Hashtag pages and channel Shorts
   tabs listed 1,853 + 8,064 videos in under 2.5 minutes with views within about 1%
   of exact. The per-video watch-page path hit "Sign in to confirm you're not a bot"
   after 229 videos, so it cannot be the bulk path. `videos.list` costs 1 quota unit
   per call of up to 50 ids, so 100k videos need about 2,000 units and the free
   daily quota is 10,000. This needs a new registered connector (`YOUTUBE_API_KEY`,
   invariant #1) and must follow the 30-day refresh rule for stored statistics.
3. **Instagram Reels: Apify only, on a curated creator list, refreshed at age
   checkpoints instead of daily.** Logged out, Instagram shows 12 reels per profile
   with rounded view counts, and yt-dlp per-reel metadata returns no view count.
   `apify/instagram-reel-scraper` costs $2.30 per 1,000 reels on the Starter plan.
   Instagram is the main cost driver; topicfinder.ai, the reference competitor, is
   Instagram-only and also buys its data (HikerAPI and Apify).
4. **Outlier = creator-relative, age-normalized, robust.** Project each snapshot to
   a 28-day value with a per-platform maturity curve (TikTok bootstrap prior: Weibull,
   tau 54 h, k 1.15, fit from the measured sample), take the log, and compare it with
   the leave-one-out median of the creator's last 30 same-format videos, shrunk toward
   the cohort median for creators with few videos. Show the multiplier (competitor
   parity) and rank by a robust z composite across views, shares, saves, and comments.
5. **Store it in the domain store, scoped to one corpus Workspace**: `trend_creators`,
   `trend_videos`, an append-only checkpointed `trend_metric_snapshots`
   (WITHOUT ROWID), `trend_cohort_labels`, baselines, watchlists, and a digest link to
   #557 Documents. Cohort labels are deterministic for length, size, language, and
   audio; LLM-classified through `callLLM()` for niche, format, and hook.

**Cost:** 100k initial is about **$37** (Instagram 15k reels on Apify; TikTok and
YouTube free), or about $240 if everything goes through Apify. Daily refresh plus 30
new creators per day is about **$170-$230 per month** at Apify Starter prices: ~$155
for Instagram checkpoints and backfill, $0-$60 for optional TikTok keyword seeds, and
~$15 of LLM labeling. TikTok + YouTube alone is $15-$75 per month. Details in
[Cost model](#cost-model-100k-initial--daily-refresh).

## Competitor teardown

| Tool | Platforms | How it discovers | Outlier definition | What the user sees | Price (monthly) | Corpus claims |
|---|---|---|---|---|---|---|
| **topicfinder.ai** | Instagram only (its Terms describe Instagram profile outlier analysis) | Creator-tracked: public Instagram profiles, reels, and view counts fetched through HikerAPI and Apify; transcripts via AssemblyAI; scripts via Claude (Terms and privacy policy) | Not published; the Discover feed is ranked by a multiplier | Niche inferred from the user's own handle; Discover feed of outlier reels with transcripts and save; topic, hook, and outline generator in the user's voice | Waitlist, no public pricing | 224,000+ videos, 12,000+ creators tracked, 125 niches (homepage counters) |
| **Eden** (eden.so) | YouTube, TikTok, Instagram, X, LinkedIn, Substack, Threads | Handle search (indexed on demand in 1-2 min), plain-language topic search, similar-creator recommendations, co-saved creators | Median of the creator's last 30 posts of the same kind, or all posts from the last 7 days if that is more; views for video platforms, likes elsewhere; Reels and feed posts have separate baselines; young posts are projected; per-follower when follower history is known; separate Top N% rank needs 20+ posts | Cards with views, likes, shares, date, multiplier color bands (under 1x, 1-3, 3-5, 5-10, 10-50, 50+); sort by outlier, likes, views, shares, recent | $0-$199 across four offers (structured data); credits for post search | Not stated; example profile caches 1.4K posts |
| **1of10** | YouTube (Shorts coverage not stated) | Outlier search across niches, competitor tracking, thumbnail search, trending formats | Views relative to the channel's typical views; search finds videos beating the channel average by 10x or more | Outlier search, thumbnail search, trending formats, competitor tracking, AI ideas/titles/thumbnails | Free; Basic $19; Pro $89; Ultra about $417 (annual); research tools use no credits | Not stated |
| **Sandcastles** | Instagram, TikTok, YouTube Shorts | User-built feed of competitor channels, plus niche browsing | Not published; markets top-1% outliers per niche | Outlier feed, hook templates, transcripts, script writing, folders | Pro $49 (100 credits); Visionary $99 (6-hour refresh); Titan $499 (1-hour refresh, API) | Claims millions of videos analyzed daily |
| **Virlo** | TikTok, YouTube Shorts, Instagram Reels | Daily indexing, custom niches (scheduled scraping of a vertical), cross-platform keyword search | Not published; shows multipliers (examples 65x-763x); says outliers are not follower-based | Niche trend lists rebuilt daily, outliers, hashtag rankings, hooks, scripts, API and MCP | Starter $34, Pro $139, Teams from $499 (billed yearly) | Claims 2.1M+ hooks, 500K+ tags |
| **Algrow** (algrow.online, added 2026-10-28) | YouTube only (separate Shorts and long-form tools) | Channel search for Shorts and long-form, viral-video search with filters (views, age, competition), search by thumbnail, similar channels, terminated-channel database; every tracked channel re-fetched at least daily | Not published (sells "outlier data" through its API) | Niche finder, viral search, transcripts, tags, channel trends; also TTS, voice clone, image and video generation | Starter $25 (165 credits), Professional $45 (300), Ultimate $80 (535); $1 3-day trial; credit top-ups from $4.99 per 150; API on all plans (full API from Professional); MCP server `https://mcp.algrow.online/mcp` on all plans with 19 tools (`search_shorts_channels`, `search_viral_videos`, `search_by_thumbnail`, `scrape_youtube`, `read_transcript`, ...) | 312,847 channels and 18.7M videos (homepage counter, labeled a simulation) |
| **Exolyt** | TikTok only | Tracked accounts, hashtags, and sounds; social listening; influencer database | Not published | Account, hashtag, and sound analytics; listening projects | Free tier; Essentials and Advanced shown in local currency (about $400 and $950 per a third-party listing); updates 1x/2x/6x per day by tier | Not stated |

Also seen but not torn down: Pentos (TikTok sounds, songs, accounts, hashtags),
Shortimize (tracks chosen accounts for creator programs), Kalodata (TikTok Shop),
Viewstats (YouTube; Business from $249). The Vellum comparison that lists them is
published by the Virlo vendor and ranks it first.

What to copy:

- **Every serious tool is creator-relative.** "Multiplier vs the creator's typical
  number" is the shared user-facing unit; Eden documents the most precise version
  (median of the last 30 same-format posts, age projection, per-follower option).
  Ralphy's multiplier should be defined the same way so users can compare.
- **Corpora are creator-curated, not firehoses.** topicfinder.ai's own counters imply
  about 19 videos per tracked creator (224k / 12k). Sandcastles and Exolyt are
  tracked-account products. Discovery feeds the creator list; the creator list feeds
  the corpus.
- **Refresh cadence is the paid differentiator** (Sandcastles 6 h vs 1 h; Exolyt
  1x/2x/6x per day). Daily is the baseline; intraday is only for the newest videos of
  watched creators.
- **Transcripts and scripts are the product surface**, which maps to #557 digests and
  the content-plan consumers of #556.

## Discovery methods per platform

### TikTok

| Method | Logged-out result (measured 2026-10-28) | Metrics exposed |
|---|---|---|
| Hashtag page `/tag/<t>` (Playwright, existing `ref scrape-trends`) | **Blocked softly**: `api/challenge/item_list` returns HTTP 200 with an empty body; the page shows an error. The existing verb saved 0 videos. Its hydration-walk no longer matches the page (data now loads through XHR). | none |
| yt-dlp `tiktok:tag` | Broken: extractor marked broken, "No working app info" | none |
| Keyword search `/search/video?q=` | **CAPTCHA** (slider puzzle). Stopped. | none |
| Explore category feed `/explore` chips (All, Technology, Education, ...) | Works: 243 unique videos (200 in the Technology category) in 82 s from 35 XHR pages of 8. **Geo-localized to the client IP** (sample was mostly Korean and Vietnamese, 54 English). 19 of 243 were ads. | views, likes, comments, shares, saves, post time, duration, author follower count, author video count, music id/title/original, language, AIGC label |
| Sound page `/music/<slug>-<id>` | Works: `api/music/item_list` returns videos using the sound | same as Explore |
| Creator listing, yt-dlp `tiktokuser:<secUid>` | Works: 179 of 181 creators, 9,591 videos, 244 s, 0 blocks. Two creators failed with "Unable to extract secondary user ID". Plain `@handle` URLs fail the same way; the `secUid` from Explore avoids it. | views, likes, comments, reposts (shares), saves, timestamp, duration, track, description |
| Single video, yt-dlp | Works: 1.4 s per video | views, likes, comments, reposts, saves, timestamp, duration, track |
| Related-accounts graph | Not tested (requires the logged-in "suggested accounts" surface). Practical substitute: creators co-occurring on the same sound, hashtag, or Explore page. | n/a |
| TikTok Research API | Not eligible: commercial users are excluded; 1,000 requests and 100,000 records per day; 100 records per request; 30-day date window per query; statistics can lag up to 10 days | view, like, comment, share, favorites counts, create time, duration, hashtags, music id, region, voice-to-text |
| Apify `clockworks/tiktok-scraper` | Not run (paid). Inputs: hashtags, search queries, profiles, post URLs | playCount, diggCount, shareCount, collectCount, commentCount, createTime, author fans, duration |

### YouTube Shorts

| Method | Logged-out result (measured) | Metrics exposed |
|---|---|---|
| Hashtag Shorts page `/hashtag/<t>/shorts` (yt-dlp flat) | Works: 10 tags, 2,472 listed, 1,853 unique, 55 s. Depth saturates (one tag gave 864 max; two tags only 36). | id, rounded views only |
| Channel Shorts tab `/channel/<id>/shorts` (yt-dlp flat) | Works: 160 channels, 8,064 videos, 89 s, 0 blocks; newest first | id, title, rounded views (median error 0.9%, p90 4.2% vs exact), channel follower count; **no post date, no likes** |
| Keyword search `ytsearchN:` (existing `ytSearch`) | Works but returns mostly long-form (first probe hit was 489 s) | id, title, views, duration, channel |
| Single video watch page (yt-dlp `--dump-json`) | Works for 229 videos (1.76 s median, 4 in parallel), then **"Sign in to confirm you're not a bot"** on the player endpoint; still blocked 10 minutes later, cleared by 17 minutes. Flat browse kept working during the block. Stopped per the no-bypass rule. | exact views, likes (90%), comments (76%), channel followers, upload timestamp, duration, tags, language (75%), auto-caption availability (75%) |
| Channel RSS feed `feeds/videos.xml` | **404** for every channel tested | n/a |
| YouTube Data API v3 | Not run (needs a key). `videos.list` 1 unit per call, comma-separated ids (up to 50); `channels.list` and `playlistItems.list` 1 unit; `search.list` has its own bucket of 100 calls per day; default 10,000 units per day | exact views, likes, comments, publish time, duration; channel subscriber count |
| Apify `streamers/youtube-shorts-scraper` | Not run (paid) | per actor docs |

### Instagram Reels

| Method | Logged-out result (measured) | Metrics exposed |
|---|---|---|
| Profile reels tab (Playwright) | 12 reels render with rounded view counts, then a login wall; GraphQL replies "Unauthorized logged out query" | rounded views only |
| Single reel, yt-dlp | Works (2.9 s) | likes, comments, timestamp; **views null, duration null** |
| yt-dlp profile `/reels/` and `instagram:tag` | Unsupported URL / "Unable to extract data" | none |
| Existing `listProfileVideos` via gallery-dl | Not tested: it defaults to `--cookies-from-browser chrome`, which uses the owner's logged-in session. Do not use cookies for corpus ingest (account risk, and it removes the logged-out position discussed under ToS). | n/a |
| Graph API hashtag search | 30 unique hashtags per 7 days; `recent_media` covers only the last 24 h; returns likes, comments, timestamp, media type, **no views**; needs a Facebook app, a Page, and Public Content Access | likes, comments, timestamp |
| Graph API Business Discovery | Other **professional** accounts by username: followers, media count, and per-media like, comment, and view counts (paid + organic). Rate limits are per business-use-case and were not checked. Needs a Meta app and an Instagram professional account. Candidate cost reducer for #556, not measured. | followers, likes, comments, views |
| Apify `apify/instagram-reel-scraper` | Not run (paid). Inputs: usernames, profile URLs, reel URLs | play and view counts, likes, comments, timestamp, duration, caption, music; shares cost extra |
| HikerAPI (used by topicfinder.ai) | Not run. $1.00 per 1,000 requests, $0.60 at volume; one request can return a page of a profile's reels (page size not verified) | per vendor docs |

## Method matrix

Cost is USD per 1,000 videos with metrics. Apify tiers follow the plan discount
(Free plan, Starter = Bronze, Scale = Silver, Business = Gold), read from the public
actor metadata (`api.apify.com/v2/acts/<actor>`). Apify plans: Free $0 ($5 usage),
Starter $19, Scale $199, Business $999, each including the same amount of usage.
"Own" methods have no marginal cost but spend the shared residential IP budget.

| Method | Platform | Metrics | Cost / 1k | Throughput (measured unless noted) | ToS risk | Verdict |
|---|---|---|---|---|---|---|
| yt-dlp creator listing (`tiktokuser:`) | TikTok | views, likes, comments, shares, saves, time, duration | $0 | ~39 videos/s, 25 s per 1k, 0 blocks in 9,591 | High on paper (TikTok Terms 3.4 ban automated extraction, including for visitors without an account); low volume, logged out | **Primary TikTok path** |
| Playwright Explore category feed | TikTok | full stats + author followers | $0 | ~2.4 videos/s; 200 per category session | Same as above | **Creator seeding** (geo-localized) |
| Playwright sound page | TikTok | full stats | $0 | not timed (one probe) | Same as above | Creator seeding by trending sound |
| Playwright hashtag page (`ref scrape-trends`) | TikTok | none (empty body) | n/a | 0 videos | Same as above | **Broken; replace or retire** |
| Playwright search | TikTok | none (CAPTCHA) | n/a | stopped | Same, plus CAPTCHA | Do not use |
| Apify `clockworks/tiktok-scraper` | TikTok | full stats, author fans | $3.70 / $3.00 / $2.30 / $1.70 | not measured | Vendor runs the scraping; ToS exposure remains | Keyword and hashtag seed discovery |
| Apify `clockworks/tiktok-hashtag-scraper`, `-profile-scraper`, `-video-scraper`, `free-tiktok-scraper` | TikTok | full stats | $3.00 / $2.00 / $1.50 / $1.00 | not measured | as above | Cheaper single-purpose seeds |
| TikTok Research API | TikTok | full stats | $0 | 100k records per day | None, but **not eligible** (commercial) | Not available |
| yt-dlp flat hashtag Shorts page | YouTube | rounded views | $0 | ~33 unique/s, 30 s per 1k | YouTube Terms ban automated access outside robots.txt search engines and written permission | **Discovery** |
| yt-dlp flat channel Shorts tab | YouTube | rounded views, title, followers | $0 | ~90 videos/s, 11 s per 1k, 0 blocks | as above | **Baselines and new-video detection** |
| yt-dlp per-video watch page | YouTube | exact stats, date, tags, captions | $0 | 2 videos/s, **bot wall after 229** | as above, and it trips bot defense | Spot use only (digest, #557) |
| YouTube Data API `videos.list` | YouTube | exact views, likes, comments, date, duration | $0 within quota (1 unit per 50 ids; 500k videos/day ceiling) | not measured | Allowed, but stored statistics must be refreshed or deleted within 30 days; derived scores must be labeled as Ralphy's own | **Exact stats and dates** |
| Apify `streamers/youtube-shorts-scraper` | YouTube | per actor | $4.00 / $3.00 / $2.60 / $2.40 | not measured | Vendor scraping | Fallback without an API key |
| Playwright profile reels tab | Instagram | rounded views (12 per profile) | $0 | not timed | Logged-out public data; Meta v. Bright Data (N.D. Cal. 2024) found Meta's terms did not bar logged-out scraping of public data, a fact-specific ruling | New-reel detection only |
| yt-dlp single reel | Instagram | likes, comments, date (no views) | $0 | 2.9 s per reel | as above | Supplement only |
| Apify `apify/instagram-reel-scraper` | Instagram | plays, views, likes, comments, date, duration | $2.60 / $2.30 / $1.40 / $1.00, plus $0.001 per run; shares add-on $7.00 / $6.00 / $5.00 / $4.00 | not measured | Vendor scraping | **Primary Instagram path** |
| Apify `apify/instagram-scraper` / `-hashtag-scraper` | Instagram | posts / hashtag media | $2.70-$1.50 / $2.60-$1.90 | not measured | as above | Hashtag seed discovery |
| HikerAPI | Instagram | per vendor | $1.00 per 1k requests ($0.60 volume) | not measured | Unofficial API | Evaluate if Instagram volume grows |
| Graph API Business Discovery | Instagram | followers, likes, comments, views | $0 | rate limits not checked | Allowed | Evaluate in #556 (setup cost) |
| Bright Data scraper API / datasets | all three | full | from $0.75 (vendor page) to $1.50 (third-party reports) per 1k records | not measured | Vendor scraping | Not needed at 100k |

Transcripts are a separate, lazy cost: Apify transcript add-ons are $0.027-$0.048 per
minute of audio; YouTube auto-captions come free with the watch-page call (75% of the
sample had them); #557 owns this choice.

## Cost model: 100k initial + daily refresh

### Assumptions

| Parameter | Value | Basis |
|---|---|---|
| Platform mix | TikTok 50k, YouTube Shorts 35k, Instagram Reels 15k | proposal; tune per niche |
| Videos per creator at backfill | TikTok 60, YouTube 60, Instagram 12 | listing depth used in the sample; Instagram matches a 12-reel page |
| Creators | TikTok ~830, YouTube ~580, Instagram ~1,250 (~2,660 total) | derived |
| Posting cadence | TikTok 6.2 per week (measured median); YouTube 4 per week; Instagram 3 per week | YouTube and Instagram assumed |
| New videos per day | TikTok ~735, YouTube ~330, Instagram ~535 (~1,600 total) | derived |
| Videos younger than 14 days at any time | TikTok ~10.3k, YouTube ~4.6k, Instagram ~7.5k (~22k) | cadence x 14 days |
| New creators per day | 30 (10 per platform), backfilled at the depths above | proposal |
| Apify tier | Starter (Bronze) unless stated | |

### Initial 100k (cheapest viable mix)

| Slice | Method | Cost | Wall time (2 workers) |
|---|---|---|---|
| TikTok 50k | Explore and sound seeding + `tiktokuser:` listing; plus ~1,000 Apify hashtag/search seed results for English niche seeds at $2.00-$3.00 per 1k | ~$2-$3 | ~19 min listing (830 x 2.76 s / 2) + seeding |
| YouTube 35k | Hashtag pages + channel tabs (free); Data API for exact stats and dates (35k / 50 = 700 units) | $0 | ~6 min listing; API calls in seconds |
| Instagram 15k | Apify reel scraper by profile, 12 per profile | 15k x $2.30 = ~$34.50 | not measured |
| **Total** | | **~$37** | under 1 hour plus Apify run time |

Without a YouTube API key, YouTube 35k through Apify adds 35k x $3.00 = $105
(total ~$142). All-Apify at Starter: TikTok 50k x $2.00 + YouTube $105 + Instagram
$34.50 = **~$240**; at Scale (Silver): $75 + $91 + $21 = ~$187.

### Daily refresh

The refresh unit is a **creator listing**: one call returns all of a creator's
in-window videos with current metrics, which also detects new uploads.

| Slice | Daily work | Cost per day |
|---|---|---|
| TikTok | Re-list ~830 active creators (latest 30); backfill 10 new creators | $0 (~12-15 min wall) |
| TikTok seeds | ~1,000 Apify hashtag/search results for niche seeds (optional; Explore and sounds are free) | $0-$2 |
| YouTube | Re-list ~580 channel Shorts tabs (new-video detection, rounded views); Data API for ~4,600 in-window videos (~92 units) and new videos; monthly re-fetch of all stored API statistics for the 30-day rule (~700 units per month) | $0 |
| Instagram, option A | Daily profile re-scrape, 14 reels x 1,250 profiles = 17,500 results | ~$40 (~$1,200 per month): too expensive |
| Instagram, option B | Checkpoint refresh by reel URL at ages 1, 3, 7, 14 days (535 x 4 = 2,140) + new-reel detection by Apify profile scrape with limit 2 (2,500) | ~$10.70 Starter / ~$6.50 Scale |
| Instagram, option C (recommended) | Same checkpoints by URL (2,140) + new-reel detection through the free logged-out reels tab | ~$4.90 Starter / ~$3.00 Scale |
| New creators | 10 Instagram profiles x 12 reels | ~$0.28 |
| LLM cohort labels | ~1,600 new videos x ~500 input and ~60 output tokens with `google/gemini-2.5-flash` via `callLLM()` (assumed $0.30 / $2.50 per million tokens; verify on OpenRouter) | ~$0.50 |

**Monthly steady state** (Apify spend is the larger of the plan fee and usage; each
plan includes its own fee as usage):

| Mix | Per day | Per month |
|---|---|---|
| Instagram option C at Starter prices + new Instagram creators | ~$5.20 | ~$155 |
| + optional TikTok keyword seeds (1,000 results/day) | +$2.00 | +$60 |
| + LLM labeling | +$0.50 | +$15 |
| **Recommended total** | **~$5.70-$7.70** | **~$170-$230** |
| Instagram option B instead of C | ~$10.90 Starter, or the $199 Scale plan (usage ~$6.70/day at Silver prices) | ~$199-$330 |
| TikTok + YouTube only (no Instagram) | $0.50-$2.50 | ~$15-$75 |

Labeling the initial 100k costs ~$30 once. Option C depends on the logged-out reels
tab staying usable at 1,250 profiles per day, which was not measured; option B is the
fallback. The $199 Scale plan becomes cheaper than Starter once Starter-priced usage
passes ~$200 per month (Silver prices for the Instagram reel actor are ~40% lower).

**Growth:** at ~1,600 new videos per day the corpus grows ~48k per month without new
creators, so 100k becomes ~150k after one month and 300k+ after six.

**Storage:** checkpointed snapshots cap history at ~8 rows per video (see the
schema). 100k videos are ~0.8M snapshot rows; a year of growth is ~5M rows, on the
order of 1 GB of SQLite with indexes. No media is stored by default.

## Outlier formula

Notation: `v` a video, `c` its creator, `p` its platform, `f` its format key
(`tiktok-video`, `yt-short`, `ig-reel`; carousels and photo posts are separate keys),
`m` a metric in {views, likes, comments, shares, saves}, `a` the snapshot age in hours
(`as_of - posted_at`), `y_m(v, a)` the observed value.

**1. Maturity curve.** `M_p(a)` is the expected share of the 28-day value reached at
age `a`, modeled as a Weibull CDF:

```
M_p(a) = 1 - exp(-(a / tau_p) ^ k_p)
```

Bootstrap priors: TikTok `tau = 54 h, k = 1.15`, fit through two points of the
measured cross-section (videos in the 0-1 day bucket, median age 11.8 h, had a median
of 0.16x their creator's mature median; the 1-2 day bucket, median age 40.2 h, had
0.51x; 2-4 days ~1.1x). This gives `M(24 h) = 0.33`, `M(72 h) = 0.75`,
`M(7 d) = 0.97`. YouTube Shorts and Reels: `tau = 96 h, k = 1.0` as an
**assumption** until refit. Refit monthly from longitudinal snapshots (videos with a
snapshot at age `a` and one at 28 days), per platform and later per size band.

**2. Projection and log.** For snapshots at least 6 h old:

```
yhat_m(v) = y_m(v, a) / max(M_p(a), 0.10)
x_m(v)    = ln(1 + yhat_m(v))
provisional(v) = a < 72 h
```

**3. Creator baseline (rolling, leave-one-out).** `W(v)` is the K = 30 most recent
videos of `c` with format `f` posted before `v` (for the newest video, the previous
30), each at its latest projected value:

```
B_m(v) = median{ x_m(u) : u in W(v) }
S_m(v) = max(1.4826 * median{ |x_m(u) - B_m(v)| : u in W(v) }, 0.25)
n(v)   = |W(v)|
```

The 0.25 floor on the robust scale stops very consistent creators from producing
huge z values. Fewer than 8 members marks the baseline `thin`.

**4. Shrinkage toward the cohort.** With `C_m` the median `x_m` of the video's cohort
(platform x niche x size band x length band, last 90 days) and `n0 = 5`:

```
Bstar_m = (n * B_m + n0 * C_m) / (n + n0)
```

**5. Per-metric scores.**

```
X_m = exp(x_m(v) - Bstar_m)            multiplier, shown as "8.4x"
Z_m = (x_m(v) - Bstar_m) / S_m         robust z
```

**6. Engagement quality** (independent of reach): for `r` in {likes, comments,
shares, saves}, `q_r = ln((1 + y_r) / (1 + y_views))` minus the median of the same
quantity over `W(v)`. Positive means more interactions per view than this creator
usually gets.

**7. Composite score** (renormalize weights over metrics the source exposed):

| Platform | Weights on Z |
|---|---|
| TikTok | views 0.55, shares 0.20, saves 0.15, comments 0.10 |
| YouTube Shorts | views 0.75, likes 0.15, comments 0.10 |
| Instagram Reels | views 0.60, likes 0.20, comments 0.20 (shares only with the paid add-on) |

```
O(v) = sum_m w_p,m * Z_m
```

Labels: `breakout` when `X_views >= 10`; `outlier` when `X_views >= 5` and
`Z_views >= 2`; `strong` when `X_views >= 3`; all three require a non-thin baseline
and a non-provisional age. Display bands match Eden's (under 1x, 1-3, 3-5, 5-10,
10-50, 50+). Recalibrate thresholds so that about 5% of mature videos per platform
are `outlier`: in the TikTok sample, raw views versus the median of 30 neighbors
(no age correction) gave 24% of videos at 3x or more and 10% at 10x or more, so these
distributions are heavy-tailed.

**8. Momentum ("rising now")** between consecutive snapshots at ages `a1 < a2`:

```
g = ln((1 + y(a2)) / (1 + y(a1))) - ln(M_p(a2) / M_p(a1))
rising = g > 0.3 and a2 < 7 d
```

**9. Same-age mode.** Once a creator has at least 8 window members with snapshots that
bracket age `a`, replace the projection with exact same-age comparison: `B_m` becomes
the median of each member's log-interpolated value at age `a`. This removes the
curve's error for that creator. Store which mode produced each score.

**10. Follower-normalized variant** (for fast-growing creators, as Eden does): when
`trend_creator_snapshots` has a follower count near the post time, also report
`views / followers_at_post` against the same quantity over `W(v)`.

**Never score against the discovery sample.** Hashtag- and Explore-discovered videos
are survivors: the YouTube hashtag sample had a median multiplier of 7.1x and 45% at
10x or more against creator tabs. Baselines must come from creator listings.

## Cohort taxonomy

A cohort key is `platform x niche x format x length_band x size_band` (hook type and
language as optional filters). Labels carry a `taxonomy_version` so a relabel never
overwrites history.

| Axis | Labels | Method |
|---|---|---|
| platform | `tiktok`, `youtube`, `instagram` | deterministic |
| length band | `le7s`, `8-15s`, `16-30s`, `31-60s`, `61-90s`, `91-180s`, `gt180s` | deterministic from duration (sample medians: YouTube 19 s, TikTok 31 s; 77% of TikTok at 60 s or less) |
| creator size band | `seed` (under 1k), `nano` (1k-10k), `micro` (10k-100k), `mid` (100k-500k), `macro` (500k-1M), `mega` (1M+) | deterministic from the follower count at snapshot time |
| language | ISO 639-1 | deterministic from TikTok `textLanguage` or YouTube `language` (75% coverage); LLM fallback on title and description |
| region | ISO 3166 | deterministic when the platform exposes it; else the discovery locale |
| audio | `original`, `licensed`, plus `sound_id` and a `trending_sound` flag (sound used by 20+ corpus videos in 7 days) | deterministic |
| flags | `is_ad`, `aigc_label` | deterministic (TikTok fields) |
| niche (two levels) | top level: `ai-tools`, `tech-tips`, `coding`, `productivity`, `personal-finance`, `investing`, `business`, `marketing`, `fitness`, `food`, `beauty`, `fashion`, `gaming`, `education`, `real-estate`, `travel`, `family`, `comedy`, `self-improvement`, `health`, `pets`, `diy-home`, `auto`, `sports`, `music`, `news-commentary`, `other`. Example sub-niches under `ai-tools`: `ai-video`, `ai-image`, `chatbots`, `ai-coding`, `automation`, `ai-money`, `ai-news` | creator level first: seed provenance (watchlist niche) or one `callLLM()` call on bio + 10 recent titles; video level only when the caption clearly diverges (LLM); hashtag map as a deterministic fallback |
| format | `talking-head`, `voiceover-broll`, `screen-recording`, `text-on-screen`, `green-screen`, `skit`, `listicle`, `product-demo`, `pov`, `before-after`, `podcast-clip`, `animation`, `ai-visuals`, `meme-edit`, `review-unboxing` | LLM; cheap first pass on caption and title, confirmed from the #557 contact sheet only for videos that reach `strong` or better |
| hook type | the seven structures in `docs/virality-rubric.md` Part 4 (`when-trigger`, `pov`, `nobody-tells-you`, `wish-known-earlier`, `everyone-thinks-but`, `shock-number`, `here-is-why`) plus `question`, `numbered-list`, `bold-claim`, `visual-demo-first`, `story-open`, `challenge` | rule-based pre-label on the title (for example a leading number gives `numbered-list`; `POV:` gives `pov`), then LLM on the first ~3 s of transcript + on-screen text from the digest |

LLM labels go through `callLLM()` with batched prompts (20-50 videos per call), a
closed label set in the prompt, and `confidence`; labels below 0.6 stay `unknown`.

## Storage schema sketch

Conventions from `cli/lib/store/schema.ts`: TEXT primary keys with a registered
prefix (`DOMAIN_ID_PREFIXES` in `cli/lib/store/ids.ts`), INTEGER epoch-millisecond
timestamps, `json_valid` checks on `*_json` columns, `row_version` on mutable rows,
and a new numbered migration (the current `SCHEMA_VERSION` is 10). Every read and
write carries explicit Workspace scope, so the corpus lives in one Workspace (for
example a `trend-corpus` Workspace) and consumers pass `--workspace`. The existing
`metric_snapshots` table belongs to Publications, hence the `trend_` prefix.

```sql
-- New id prefixes: tcreator, tvideo, twatch
CREATE TABLE trend_watchlists (
  id TEXT PRIMARY KEY,                               -- twatch_<uuid>
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube', 'instagram')),
  kind TEXT NOT NULL CHECK (kind IN (
    'hashtag', 'keyword', 'sound', 'explore-category', 'creator', 'related'
  )),
  value TEXT NOT NULL,
  niche TEXT,                                        -- seeds the creator niche label
  cadence_hours INTEGER NOT NULL DEFAULT 24,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  cursor_json TEXT CHECK (cursor_json IS NULL OR json_valid(cursor_json)),
  last_run_id TEXT REFERENCES runs(id) ON DELETE RESTRICT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, platform, kind, value)
);

CREATE TABLE trend_creators (
  id TEXT PRIMARY KEY,                               -- tcreator_<uuid>
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube', 'instagram')),
  platform_creator_id TEXT NOT NULL,                 -- TikTok secUid, YouTube channel id, IG user id
  handle TEXT,
  display_name TEXT,
  follower_count INTEGER,                            -- latest; history in trend_creator_snapshots
  size_band TEXT,
  niche TEXT,
  sub_niche TEXT,
  tier TEXT NOT NULL DEFAULT 'active' CHECK (tier IN ('active', 'inactive', 'dormant', 'excluded')),
  discovered_via TEXT NOT NULL,                      -- 'explore:technology', 'hashtag:aitools', 'sound:<id>', 'manual'
  watchlist_id TEXT REFERENCES trend_watchlists(id) ON DELETE RESTRICT,
  last_listed_at INTEGER,
  next_list_at INTEGER,
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, platform, platform_creator_id)
);

CREATE TABLE trend_creator_snapshots (               -- append-only
  creator_id TEXT NOT NULL REFERENCES trend_creators(id) ON DELETE RESTRICT,
  as_of INTEGER NOT NULL,
  source TEXT NOT NULL,
  follower_count INTEGER,
  video_count INTEGER,
  total_likes INTEGER,
  run_id TEXT REFERENCES runs(id) ON DELETE RESTRICT,
  PRIMARY KEY (creator_id, as_of, source)
) WITHOUT ROWID;

CREATE TABLE trend_videos (
  id TEXT PRIMARY KEY,                               -- tvideo_<uuid>
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube', 'instagram')),
  platform_video_id TEXT NOT NULL,
  creator_id TEXT NOT NULL REFERENCES trend_creators(id) ON DELETE RESTRICT,
  format_key TEXT NOT NULL,                          -- tiktok-video | yt-short | ig-reel | ...
  url TEXT NOT NULL,
  posted_at INTEGER,                                 -- NULL until a dated source confirms it
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  title TEXT,                                        -- truncated by code point, max 2,000
  description TEXT,
  hashtags_json TEXT CHECK (hashtags_json IS NULL OR json_valid(hashtags_json)),
  sound_id TEXT,
  sound_title TEXT,
  sound_original INTEGER CHECK (sound_original IS NULL OR sound_original IN (0, 1)),
  language TEXT,
  is_ad INTEGER CHECK (is_ad IS NULL OR is_ad IN (0, 1)),
  discovered_via TEXT NOT NULL,
  discovered_at INTEGER NOT NULL,
  -- denormalized latest values for ranking queries
  latest_as_of INTEGER,
  latest_views INTEGER, latest_likes INTEGER, latest_comments INTEGER,
  latest_shares INTEGER, latest_saves INTEGER,
  cohort_key TEXT,                                   -- platform|niche|format|length|size
  outlier_multiplier REAL,
  outlier_z REAL,
  outlier_score REAL,
  outlier_label TEXT CHECK (outlier_label IS NULL OR outlier_label IN (
    'breakout', 'outlier', 'strong', 'normal', 'under'
  )),
  outlier_mode TEXT CHECK (outlier_mode IS NULL OR outlier_mode IN ('projected', 'same-age')),
  outlier_flags_json TEXT CHECK (outlier_flags_json IS NULL OR json_valid(outlier_flags_json)),  -- thin, provisional, rising
  outlier_computed_at INTEGER,
  next_snapshot_at INTEGER,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, platform, platform_video_id)
);
CREATE INDEX trend_videos_creator_posted ON trend_videos (creator_id, posted_at DESC);
CREATE INDEX trend_videos_rank ON trend_videos (workspace_id, cohort_key, posted_at, outlier_score DESC);
CREATE INDEX trend_videos_due ON trend_videos (next_snapshot_at);

CREATE TABLE trend_metric_snapshots (                -- append-only, one row per checkpoint bucket
  video_id TEXT NOT NULL REFERENCES trend_videos(id) ON DELETE RESTRICT,
  checkpoint TEXT NOT NULL CHECK (checkpoint IN (
    'h0-6', 'h6-24', 'd1-2', 'd2-3', 'd3-7', 'd7-14', 'd14-28', 'd28', 'monthly'
  )),
  source TEXT NOT NULL,                              -- ytdlp-tiktok-user, ytdlp-yt-flat, youtube-data-api, apify-instagram-reel, ...
  as_of INTEGER NOT NULL,
  age_ms INTEGER,
  views INTEGER, likes INTEGER, comments INTEGER, shares INTEGER, saves INTEGER,
  views_precision TEXT NOT NULL DEFAULT 'exact' CHECK (views_precision IN ('exact', 'rounded')),
  run_id TEXT REFERENCES runs(id) ON DELETE RESTRICT,
  PRIMARY KEY (video_id, checkpoint, source, as_of)
) WITHOUT ROWID;

CREATE TABLE trend_baselines (                       -- recomputable cache
  creator_id TEXT NOT NULL REFERENCES trend_creators(id) ON DELETE RESTRICT,
  format_key TEXT NOT NULL,
  metric TEXT NOT NULL,
  window_k INTEGER NOT NULL,
  median_log REAL NOT NULL,
  mad_log REAL NOT NULL,
  n INTEGER NOT NULL,
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (creator_id, format_key, metric)
) WITHOUT ROWID;

CREATE TABLE trend_cohort_baselines (                -- recomputable cache
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  cohort_key TEXT NOT NULL,
  metric TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  median_log REAL NOT NULL,
  mad_log REAL NOT NULL,
  n INTEGER NOT NULL,
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, cohort_key, metric, window_days)
) WITHOUT ROWID;

CREATE TABLE trend_cohort_labels (                   -- append-only per taxonomy version
  video_id TEXT NOT NULL REFERENCES trend_videos(id) ON DELETE RESTRICT,
  axis TEXT NOT NULL CHECK (axis IN (
    'niche', 'sub_niche', 'format', 'hook', 'length_band', 'size_band', 'language', 'region', 'audio'
  )),
  taxonomy_version INTEGER NOT NULL,
  label TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('rule', 'llm', 'seed', 'manual')),
  model TEXT,
  confidence REAL,
  run_id TEXT REFERENCES runs(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (video_id, axis, taxonomy_version)
) WITHOUT ROWID;

CREATE TABLE trend_video_digests (                   -- link to #557 output
  video_id TEXT NOT NULL REFERENCES trend_videos(id) ON DELETE RESTRICT,
  digest_version INTEGER NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,     -- kind 'research'
  document_revision_id TEXT NOT NULL REFERENCES document_revisions(id) ON DELETE RESTRICT,
  params_json TEXT CHECK (params_json IS NULL OR json_valid(params_json)),   -- cadence, sheet layout
  created_at INTEGER NOT NULL,
  PRIMARY KEY (video_id, digest_version)
) WITHOUT ROWID;
```

Provenance: every ingest, refresh, label, and score pass is a `runs` row (`kind`
`trend.discover`, `trend.list`, `trend.snapshot`, `trend.label`, `trend.score`), and
snapshot and label rows point at it. Snapshot tables are not addressable entities, so
they use composite keys instead of UUIDs (about 45 bytes saved per row at millions of
rows).

What is kept per video vs fetched lazily:

| Kept at ingest | Kept as history | Lazy (on demand) | Not stored |
|---|---|---|---|
| ids, URL, creator, post time, duration, dimensions, title, description (code-point-safe truncation), hashtags, sound, language, ad flag, discovery provenance, latest metrics, outlier fields, cohort labels | checkpointed metric snapshots, creator follower snapshots | transcript, frames, contact sheet, digest (#557; only for `strong` or better, or on request), media file (downloaded for the digest, not retained by default) | comments text, follower lists, full raw platform JSON |

Snapshot write rule: per refresh, insert a row only when the video enters a new
checkpoint bucket (first sample in the bucket wins; `INSERT OR IGNORE` on the key) and
always update the `latest_*` columns on `trend_videos`. Ingest upserts on
`(workspace_id, platform, platform_video_id)`, so re-runs are idempotent.

Portability: snapshot history cannot be re-scraped after the fact, so
`workspace.export` must include all `trend_*` tables except the two baseline caches.
The YouTube 30-day storage rule applies only to statistics sourced from the Data API
(see risks).

## Refresh cadence

| Job | Cadence | Unit of work | Notes |
|---|---|---|---|
| Seed discovery | per watchlist `cadence_hours` (default 24 h) | one hashtag, sound, Explore category, or Apify query | new creators enter at tier `active`; capped at N per day (default 30) |
| Creator listing, `active` (posted in last 14 days) | daily | one listing of the latest 30 (TikTok, YouTube) | covers every in-window video; detects new uploads |
| Creator listing, hot | every 6 h | creators on a watchlist with a video younger than 72 h | fills the `h0-6` / `h6-24` / `d1-2` checkpoints that drive momentum |
| Creator listing, `inactive` (no post in 14-60 days) | weekly | one listing | |
| Creator listing, `dormant` (no post in 60+ days) | monthly | one listing | |
| Exact stats (YouTube Data API) | with each YouTube listing for in-window videos; monthly for all stored API statistics | `videos.list`, 50 ids per call | 30-day refresh-or-delete rule |
| Instagram checkpoints | at ages 1, 3, 7, 14 days per reel | Apify reel scraper by URL | new reels detected from the profile tab |
| Late checkpoints | at 28 days, then monthly for `breakout` videos only | creator listing or URL refresh | captures long-tail resurfacing |
| Baselines and scores | after each creator's refresh (incremental) | per creator | cohort baselines nightly |
| Maturity-curve refit | monthly | per platform | needs videos with snapshots at both `a` and 28 days |
| LLM labels | daily batch for new videos; relabel on taxonomy version bump | 20-50 videos per call | |

Budget guard: a per-platform request budget per window (for example YouTube watch-page
calls at most 150 per 15 minutes) and a circuit breaker that stops a method on the
first bot-check, CAPTCHA, or empty-body response and records it. Never rotate proxies,
reuse browser cookies, or solve CAPTCHAs to keep a method alive.

## Measured sample results

Niche: "AI tools / tech tips". Free methods only, no login, no cookies, no paid runs,
no provider keys. Machine: owner's Mac on a residential connection (TikTok localized
results to the IP's country). Cost: $0. Raw data:
`.ralphy/cache/trend-sample/{youtube,tiktok,instagram,probe}/`, summary in
`.ralphy/cache/trend-sample/summary.json`.

### YouTube Shorts

| Step | Count | Wall time | Notes |
|---|---|---|---|
| Discovery: 10 hashtag Shorts pages (`aitools`, `aitips`, `chatgpt`, `techtips`, `aitool`, `claudecode`, `chatgpttips`, `productivityhacks`, `techhacks`, `artificialintelligence`), 300 per tag | 2,472 listed, **1,853 unique** (25% overlap) | 55 s | ids + rounded views only; two tags returned only 36 |
| Full per-video metadata, 4 in parallel | **229 ok**, 7 bot-checked, then stopped | 110 s | 1.76 s median per video; block lasted 10-17 min |
| Creator baselines: Shorts tab of all 160 channels from the enriched set, 60 each | **8,064 videos**, 160 of 160 channels | 89 s | 1.2 s median per channel; 0 blocks during the watch-page block |

Field coverage on the 229 enriched videos: views, timestamp, duration, and tags 100%;
channel followers 99.6%; likes 90%; comments 76%; language 75%; auto-captions 75%.
All were 60 s or shorter (median 19 s); median age 21 days; median views 53.8k (p90
4.0M); median like rate 0.65%; median channel 5.1k followers. Flat-listing views
matched exact counts within 0.9% median (p90 4.2%). Hashtag-discovered videos had a
median multiplier of **7.1x** against their creator's last 30 (145 of 222 at 3x or
more, 100 at 10x or more): the survivorship bias described above.

### TikTok

| Step | Count | Wall time | Notes |
|---|---|---|---|
| Existing verb `ref scrape-trends --hashtags aitools --limit 30` | **0 videos** | 11 s | `challenge/item_list` returns an empty body logged out |
| Explore, Technology category, 40 scrolls | 243 unique (200 Technology, 19 ads) | 82 s | languages: ko 73, vi 57, en 54; author follower count on every item |
| Creator listing (`tiktokuser:<secUid>`) for the 181 Technology authors, 60 each, 2 in parallel | **9,591 videos** from 179 creators; 2 failures | 244 s | 2.76 s median per creator; 0 blocks |
| Keyword search page | 0 | n/a | CAPTCHA slider; stopped |
| Sound page | works (1 probe) | n/a | `music/item_list` returned the sound's videos |

Field coverage on the 9,591 videos: views, likes, comments, shares, saves, timestamp,
track 100%; duration 99.9%. Median views 8.5k (p90 382k); median duration 31 s; 40%
were 14 days old or younger; median like rate 1.65%, share rate 0.11%, save rate
0.18%; median creator cadence 6.2 posts per week. Author size bands (Explore
authors): seed 29, nano 60, micro 72, mid 30, macro 17, mega 16.

Empirical maturity (video views divided by the creator's median over posts at least
28 days old, 110 creators with 8+ such posts):

| Age | 0-1 d | 1-2 d | 2-4 d | 4-7 d | 7-14 d | 14-28 d | 28-56 d | 56 d+ |
|---|---|---|---|---|---|---|---|---|
| n | 75 | 69 | 153 | 307 | 551 | 961 | 1,639 | 2,414 |
| median ratio | 0.16 | 0.51 | 1.13 | 1.15 | 0.80 | 0.87 | 0.98 | 1.01 |

TikTok views reach the creator's typical level within 2-4 days; the 2-7 day bump is
cross-sectional (recent posts that are doing well are still being pushed), which is
why the curve must be refit from longitudinal snapshots.

### Instagram

| Probe | Result |
|---|---|
| yt-dlp profile `/reels/` | Unsupported URL |
| yt-dlp `explore/tags/aitools` | "Unable to extract data" |
| Playwright profile reels tab | 12 reels with rounded views, then login wall; GraphQL "Unauthorized logged out query" |
| yt-dlp single reel | likes 164,318, comments 5,905, timestamp; views null; duration null (2.9 s) |

### Other probes

- YouTube channel RSS (`feeds/videos.xml?channel_id=`): 404 for all 3 channels tried.
- yt-dlp `ytsearch20:"ai tools shorts"`: 20 results in 1.4 s, mostly long-form.
- yt-dlp TikTok `@handle` listing: fails with "Unable to extract secondary user ID";
  the `secUid` form works.

### Build notes from the sample

- Truncating descriptions with `String.prototype.slice` split surrogate pairs and
  produced JSON that `jq` rejects; truncate by code point.
- `listProfileVideos()` defaults to `--cookies-from-browser chrome`; corpus ingest
  must pass no cookies.
- `ref scrape-trends` runs a script through `bunx tsx` and its hashtag path is dead;
  #556 should replace it with Explore/sound seeding plus creator listing.

## Build run (#556)

First end-to-end run of `ralphy trends` on 2026-10-28, niche "AI tools / tech tips",
free logged-out sources only (no cookies, no provider keys, no paid calls; cost $0),
same residential connection as the sample, into a scratch data root
(`.ralphy/cache/trend-corpus-run/`, gitignored) holding one corpus Workspace.
Two listing workers, 60 videos per creator at ingest, 30 per creator at refresh.

| Step (verb) | Wall | Result |
|---|---|---|
| `trends ingest --source tiktok-explore --seed Technology --niche tech-tips` (first pass) | 147 s | Explore session 68 s, but only 63 items: the scroll loop did not reach the feed's end (fixed: scroll the document end too). 59 creators, 57 listed in 78 s, 3,120 videos |
| same command, after the scroll fix | 270 s | Explore session 68 s: 200 items, 181 authors (142 new). 143 of 144 creators listed in 201 s: 7,595 videos, 1.4 s per creator, 38 videos/s |
| `trends ingest --source youtube-hashtag` (7 AI tags, `--niche ai-tools`) | 84 s | Hashtag pages 33 s: 100 channel seeds (90 new), 678 Shorts ids without a channel. 70 of 90 channels have a Shorts tab; 3,055 videos in 50 s (0.56 s per channel, 61 videos/s) |
| `trends ingest --source youtube-hashtag` (techtips, techhacks, `--niche tech-tips`) | 16 s | 4 channel seeds; 127 videos |
| `trends ingest --source youtube-search` (3 queries) | 59 s | 96 channel seeds (86 new); 60 with Shorts; 2,596 videos in 47 s |
| `trends refresh --due` right after | 1.8 s | No creator due; nothing listed (one never-listed creator retried, which led to the backoff fix) |
| `trends refresh --platform tiktok youtube --per-creator 30 --no-discover` (every creator, about an hour after ingest) | 252 s | 199 of 200 TikTok creators in 186 s (0.93 s per creator) and 133 YouTube channels in 66 s (0.49 s per channel): 8,899 videos seen, 22 new uploads detected, 65 new snapshot rows (videos that crossed a checkpoint bucket), 8,834 skipped as already in their bucket |

**Corpus after ingest:** 16,507 videos from 381 creators (TikTok 10,729 videos / 201
creators; YouTube 5,778 / 180 seeded, 133 with a Shorts tab). 16,707 metric
snapshot rows, 59,686 cohort labels (rules and seed niche only; the LLM pass was
off). Ingest wall time 575 s (9.6 minutes) in total. **Blocks hit: 0** (no bot
check, CAPTCHA, login wall, or empty-body streak on any source). Listing failures:
1 TikTok creator ("Unable to extract secondary user ID", excluded after retries)
and 47 YouTube channels without a Shorts tab (excluded on first sight). The store
file was 48 MB. Scoring all 16.5k videos took 0.6 s; rule labels 0.2 s.

**Scores.** 10,576 of 10,729 TikTok videos scored (the rest are younger than 6 h
or discovery-only). Of the 7,987 with a non-thin, non-provisional baseline, 23%
reached 3x their creator's shrunk baseline and 10% reached 10x, the same
heavy tail as the uncorrected sample (24% and 10%). Labels on mature videos (7
days or older): breakout 9.5%, outlier 2.0%, strong 10.7%, normal 52%, under 25%.
The formula's thresholds therefore over-label `breakout`; the recalibration step
(about 5% `outlier` per platform) is still open. YouTube videos stay **unscored**:
channel Shorts tabs carry no post time, so without the YouTube Data API connector
(`YOUTUBE_API_KEY`, not configured here) every YouTube row is `undated` with
rounded views. Explore localized to the IP's country again (creator region KR;
of the 209 videos with a language field, ko 75, vi 58, en 40).

**Export.** `workspace.export` of the corpus Workspace (16,529 videos after the refresh, 16,772 snapshots, 59,785 labels, 506 creator snapshots) took 0.65 s and produced a 51.5 MB package; `workspace.import` into a fresh data root took 5.7 s including the staging verification and restored every `trend_*` row except the two baseline caches. The package manifest is JSON capped at 64 MiB, so at this density (about 3.1 KB per video) export stops with an explicit size error at roughly 21k videos; a 100k corpus needs a streamed table format in the portable package (follow-up).

### Projection to 100k+ from the measured rates

| Slice | Work | Measured rate | Projected wall (2 workers, 1 IP) | Cost |
|---|---|---|---|---|
| TikTok 50k | ~940 creators at the measured 53 videos per 60-video listing; discovery from ~6-10 Explore or sound sessions (one session gave 181 authors, 22% overlap with the previous one) | 1.4 s per creator, 68 s per Explore session | ~22 min listing + ~7-11 min discovery | $0 |
| YouTube 35k | ~800 Shorts channels at the measured 44 videos per channel; ~1,100 seeds (70-78% have Shorts) from ~40 hashtag/search queries (14 channels per hashtag page, 32 per query) | 0.56 s per channel, 3.5-4.7 s per query | ~10 min listing + ~3 min discovery | $0; dates and exact stats need the free Data API quota (35k / 50 = 700 units) |
| Instagram 15k | Apify reel actor by profile (not run) | n/a | Apify run time | ~$34.50 at Starter (the #555 model) |
| **Initial 100k** | | | **~45 minutes of free listing** plus Apify | **~$37 with Instagram, $0 without** |
| Daily refresh at 100k | re-list ~940 TikTok + ~800 YouTube creators (latest 30) | 0.93 s per TikTok creator, 0.49 s per YouTube channel | ~21 min per day (~15 min TikTok + ~6.5 min YouTube), in line with the #555 estimate of 12-15 min for TikTok | $0 free path; ~$170-$230 per month with Instagram checkpoints and optional TikTok seeds, $15-$75 without (the #555 model, unchanged: no paid source was exercised) |

The measured free-path rates match the #555 sample (TikTok 38-40 videos/s vs 39;
YouTube channel tabs 55-61 videos/s vs ~90, slower because the build lists
newest-first with a 150 ms pause per request), so the #555 cost model stands.
What the run changes: YouTube needs the Data API connector to be scored at all,
TikTok English coverage still needs non-geo-localized seeds (paid keyword seeds or
manual watchlists), and outlier thresholds need recalibration on this
distribution.

## Open risks

- **Terms of service.** TikTok's terms ban automated extraction for everyone,
  including visitors without an account; YouTube's terms ban automated access outside
  robots.txt search engines and written permission. The Meta v. Bright Data ruling
  (N.D. Cal., January 2024) helps only for logged-out scraping of public Meta data and
  is fact-specific. Keep everything logged out, low-rate, single-user, for internal
  analysis; never republish others' media; prefer official APIs where they exist.
- **YouTube Data API policy.** Statistics stored from the API must be refreshed or
  deleted within 30 days, and new derived scores must not be presented as YouTube
  data. Label outlier scores as Ralphy's own, re-fetch monthly, and check the
  policy's new derived-metrics rules (effective 2026-06-01) before shipping.
- **Bot defense.** The YouTube watch page walled after 229 calls in under two
  minutes; TikTok hashtag and search surfaces are already closed logged out. The
  open paths (flat browse, `tiktokuser:` listings, Explore XHR) can close without
  notice; each source needs a circuit breaker and an Apify fallback with a cost cap.
- **Geo bias.** TikTok Explore follows the client IP's country. English niches need
  English seeds (Apify hashtag/search, cross-platform creators found on YouTube, or
  manual watchlists), and the corpus must record region per creator.
- **Survivorship bias.** Discovery surfaces over-represent winners (7.1x median in
  the YouTube sample). Baselines must come from creator listings, and "top in niche"
  must be ranked by the creator-relative score, not by raw views.
- **Maturity curve accuracy.** The TikTok prior comes from a cross-section; YouTube
  and Instagram priors are assumptions. Until refit, scores for videos under 72 h
  stay `provisional`.
- **Rounded views.** Flat listings round to 2-3 significant figures (median error
  0.9%). Fine for baselines; mark `views_precision = rounded` and prefer exact sources
  for the scored video.
- **Instagram cost and access.** Instagram is the only platform without a free bulk
  path; option C relies on a logged-out tab that was measured on one profile only.
  Business Discovery (official) needs a Meta app and was not evaluated.
- **yt-dlp extractor churn.** TikTok and Instagram extractors break regularly (the
  tag extractor is already marked broken). Pin a tested yt-dlp version per release
  and add a daily smoke check per source.
- **Scope of the corpus Workspace.** Domain Documents require a Workspace, so the
  corpus lives in one Workspace and other Workspaces read it by explicit scope. If
  several Workspaces need private corpora, the same tables work per Workspace at the
  cost of duplicate scraping.

## Sources

- topicfinder.ai: [home](https://topicfinder.ai/), [terms](https://topicfinder.ai/terms), [privacy](https://topicfinder.ai/privacy)
- Eden: [outlier multiplier](https://eden.so/help/discover/outlier-multiplier/), [creators and lists](https://eden.so/features/creators/)
- [1of10 pricing](https://1of10.com/pricing)
- [Sandcastles](https://www.sandcastles.ai)
- [Virlo TikTok](https://virlo.ai/tiktok)
- [Exolyt pricing](https://exolyt.com/pricing)
- [Vellum: short-form video intelligence tools](https://www.vellum.ai/blog/best-short-form-video-intelligence-tools) (vendor-affiliated)
- [Viewstats pricing](https://www.viewstats.com/pricing)
- Apify: [pricing](https://apify.com/pricing), [clockworks/tiktok-scraper](https://apify.com/clockworks/tiktok-scraper), [apify/instagram-reel-scraper](https://apify.com/apify/instagram-reel-scraper); per-tier event prices from the public actor metadata at `https://api.apify.com/v2/acts/<owner>~<actor>`
- [HikerAPI pricing](https://hikerapi.com/pricing)
- Bright Data: [TikTok data extractor](https://brightdata.com/solutions/data-extraction/tiktok); third-party price report: [socialcrawl.dev](https://www.socialcrawl.dev/blog/best-tiktok-data-apis-2026)
- TikTok Research API: [FAQ](https://developers.tiktok.com/doc/research-api-faq), [query videos](https://developers.tiktok.com/doc/research-api-specs-query-videos)
- YouTube Data API: [quota costs](https://developers.google.com/youtube/v3/determine_quota_cost), [videos.list](https://developers.google.com/youtube/v3/docs/videos/list), [developer policies](https://developers.google.com/youtube/terms/developer-policies)
- Instagram Platform: [hashtag search](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search), [hashtag recent media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media), [business discovery](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)
- Terms: [TikTok terms of service](https://www.tiktok.com/legal/page/us/terms-of-service/en), [YouTube terms of service](https://www.youtube.com/static?template=terms)
- Meta v. Bright Data: [TechCrunch, 2024-01-24](https://techcrunch.com/2024/01/24/court-rules-in-favor-of-a-web-scraper-bright-data-which-meta-had-used-and-then-sued), [MediaPost on the dismissal](https://www.mediapost.com/publications/article/393996/meta-abandons-lawsuit-against-bright-data-over-scr.html)
