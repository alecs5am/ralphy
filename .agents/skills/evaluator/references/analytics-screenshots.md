# Reading platform analytics screenshots (#558)

The owner sends post analytics as screenshots. You read them with your own vision (free), fill one JSON payload per post and platform, preview it, and write it only after the owner confirms the numbers. `--extract` pre-fills the payload with one paid vision call; use it only when the owner asks or you cannot read the image.

## The flow

```bash
# 1. Read the screenshot(s), write metrics.json (keys below), then preview. Nothing is written.
ralphy analytics import <unit-id-or-slug> --workspace <ws> --platform tiktok \
  --data metrics.json --screenshot overview.png --screenshot engagement.png --dry-run

# 2. Show the owner the parsed numbers, the approximations, and the warnings. On "yes":
ralphy analytics import <unit-id-or-slug> --workspace <ws> --platform tiktok \
  --data metrics.json --screenshot overview.png --screenshot engagement.png --yes

# 3. Check the decision ledger the import pinned; add what the artifacts do not record.
ralphy unit decisions <unit> --workspace <ws> --set hook_type=question --set transitions=whip-pan,glitch

# 4. Judge the work by outcomes.
ralphy analytics report --workspace <ws>
```

The unit argument takes a Unit ID, a Unit slug, or a Project with exactly one Unit. Re-running with the same numbers replays instead of duplicating. A later screenshot of the same post (new numbers) appends a new snapshot; the report uses the newest one. Screenshots are copied into the store as provenance; the source files are left alone.

## Payload keys

| Key | Meaning | Accepted forms |
|---|---|---|
| `views` | Plays / views | `12345`, `"12,345"`, `"12.3K"` |
| `reach` | Accounts reached (not views) | count |
| `likes`, `comments`, `shares`, `saves`, `follows` | Engagement counts | count |
| `avgWatchTimeSec` | Average watch time per view | `9.2`, `"9.2s"`, `"0:09"` |
| `totalWatchTimeSec` | Total watch / play time | `"12h:34m:56s"`, `"41.2h"`, `"3:20:00"` |
| `avgWatchPct` | Average percentage viewed (may exceed 100 on looping Shorts) | `"38%"`, `38` |
| `completionPct` | Share of views that reached the end | `"31.5%"`, `31.5` |
| `retention` | Retention curve points | `[{"t": "0:03", "pct": "72%"}]` |
| `videoDurationSec` | Length of the posted video | seconds or `"0:24"` |
| `capturedAt` | When the screenshot was taken | ISO datetime or `YYYY-MM-DD` |
| `postedAt` | When the post went live | ISO datetime or `YYYY-MM-DD` |
| `url`, `postId`, `notes` | Optional provenance | text |

Screen-label aliases are folded for you (`saved`, `watched_full_video`, `avg_watch_time_s`, `post_date`, `new_followers`, ...). Unknown keys are rejected, so a typo never silently drops a number.

```json
{
  "views": "12.3K", "likes": "1,204", "comments": 88, "shares": 312, "saves": 940, "follows": 41,
  "avgWatchTimeSec": "9.2s", "completionPct": "31.5%", "videoDurationSec": "0:24",
  "retention": [{ "t": 0, "pct": 100 }, { "t": 3, "pct": 71 }, { "t": 24, "pct": 29 }],
  "capturedAt": "2026-10-27T12:00:00Z", "postedAt": "2026-10-20"
}
```

## Per platform

**TikTok Studio** (post analytics, Overview / Engagement / Viewers tabs)
- Video views → `views`; Total play time → `totalWatchTimeSec` (printed like `12h:34m:56s`); Average watch time → `avgWatchTimeSec` (printed like `9.2s`); Watched full video → `completionPct`; New followers → `follows`.
- Likes, comments, shares, and saves (favorites) sit under the engagement section → their own keys.
- The retention graph gives `retention` points; read two to five points, not every pixel.
- The mobile app abbreviates (`12.3K`); the web Studio usually prints exact counts. Prefer the exact figure when both are available.

**Instagram Insights** (Reel insights)
- Views → `views`; Accounts reached → `reach`. Reach counts accounts, views count plays: never swap them.
- Interactions is a SUM of likes, comments, shares, and saves. Do not put it into `likes`; read the four lines under it.
- Watch time (total) → `totalWatchTimeSec`; Average watch time → `avgWatchTimeSec`; Follows → `follows`.
- Older screenshots say Plays instead of Views; treat Plays as `views` and note it in `notes`.

**YouTube Studio** (Shorts and long-form)
- Views → `views`. Shorts can also show Engaged views; import Views and put Engaged views in `notes`.
- Watch time is printed in HOURS: pass `"41.2h"` to `totalWatchTimeSec`, never the bare number.
- Average view duration is `m:ss` (`"0:23"` is 23 seconds) → `avgWatchTimeSec`; Average percentage viewed → `avgWatchPct` (above 100% is valid for looping Shorts).
- Subscribers gained → `follows`. Saves are not shown: leave `saves` out.

## Traps

- **Abbreviations.** Copy `12.3K` / `1.2M` as strings. The parser expands them and flags the field as approximate (the platform rounded); do not expand them by hand.
- **Thousands separators.** `1,234` and `1.234` both read as 1234 for counts. A count like `12.5` is rejected: the suffix was probably dropped.
- **Percent vs seconds.** A `%` value never goes into a `...Sec` field, and `0:09` is nine seconds, not nine minutes.
- **Ratios.** Percent fields are 0-100. `0.45` is accepted but flagged as a likely ratio; write `45` if the screen says 45%.
- **Missing is not zero.** Leave a field out when the screen does not show it. A zero means the platform printed 0.
- **Post age.** Metrics grow with age. Record `capturedAt` and `postedAt`; capture posts at a similar age (for example +7 days) so the report compares like with like. Without `postedAt` the rolling baseline orders the post by capture time.
- **One post, several screenshots.** Merge every screen of the same post into one payload and pass all screenshots with repeated `--screenshot`.
- **Personal data.** Screenshots stay in the local store. Never commit them to the repository; test fixtures are synthetic.

## Reading the report

- **Hit rate**: share of posts beating the median of the previous posts on the same platform (window 20, at least 3 prior). Early posts show `awaitingBaseline`, not misses. `--hit-threshold <n>` uses an absolute target instead; `--metric` switches the target (views, avg-watch-pct, completion, engagement-rate, save-rate, share-rate).
- **Decision table**: each decision value with `n`, median outcome, lift against the platform baseline, and a verdict. Below `--min-n` (default 3) the row says `insufficient data`: report the sample size, never a claim.
- **Baselines** are per platform; platforms are never pooled. Cohort baselines (#556) appear once a trend corpus provides them.
