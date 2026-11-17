---
name: ralphy-trendwatch
description: >-
  Find references that already worked: read the hosted trend base or scout a custom niche, pick
  outliers (videos that beat their creator's own median), judge what transfers, and turn our own
  stats into the next fix. Triggers: "what's trending in <niche>", "find a reference", "find
  outliers", "scout this niche", "why did my video flop", "what to post next", "что в трендах",
  "что залетает в нише", "найди референс", "найди выбросы", "почему не залетело".
---

# ralphy-trendwatch

A reference is a fresh video that beat its creator's own median. Copying one (then reworking it)
is the core of Ralphy; without a reference with good numbers, nothing gets produced.

## Hosted base

```bash
ralphy trends --list                    # niches with video counts and freshness
ralphy trends <niche> --limit 20 --json # items: url, platform, author, title, published_at,
                                        # views, likes, comments, multiplier, format, hook, thumbnail
```

The base is cached; an unreachable host returns a clear error or the cached copy with its date.
Say how old the data is when you present picks.

## Picking a reference

- `multiplier` = views against the creator's own recent median. Rank by it, not by raw views.
- Fresh only: posted within 90 days. Undated rows are not references.
- Small-creator breakouts transfer better than a mega creator's hit. Several breakouts of one format
  by different creators beat one lucky video.
- Ask why it worked: hook, format, sound, or the creator (face, fame, voice). Creator-bound hits do
  not transfer.
- Drop photoreal AI people or pets and generic AI-cartoon looks before they reach the user; the
  owner rejects them ("we do not take realistic content").
- Look at how each candidate is made before proposing it: from the account folder,
  `ralphy tool pull <url>` then `ralphy tool frames refs/<slug>/source.mp4` and read the sheet.
  `ralphy tool pull <url> --meta-only` fetches the date and counts without the video.
- Present 3 to 5 picks: link, creator, age, views, multiplier, format, one line on why it works and
  what we would change. Let the user choose.

## Custom niche

When the niche is not in the base (`ralphy trends --list`), scout it yourself:

1. Ask for the topic, languages and platforms. Collect 10 to 30 creators and a few hashtags or
   search terms. Write them into the account's `account.md` under `## Niche` so the next session
   reuses them.
2. List each creator's recent videos with yt-dlp (`yt-dlp --flat-playlist -J <profile url>`), compute
   the creator's median views (last ~30 videos, leaving the candidate out), and the multiplier of each
   video. Keep the numbers in a scratch file under `~/.cache/ralphy/`.
3. Pull the top candidates with `ralphy tool pull <url> --meta-only` for dates and counts.

Platform facts (no login): `references/platforms.md`. Do not use the owner's browser cookies for
scraping without their explicit ok; a flagged account is the risk.

## Signals to fixes

After posting, or when a version feels weak:

1. Our numbers: the account's `stats.csv` (empty cell = unknown, not zero) and `posts.csv`.
2. The reference's numbers: its `refs/<slug>/source.json` and the trend row.
3. Compare per part, not overall: hook, pacing, length, text look, sound, ending, against the
   reference's `breakdown.md`.
4. Write each finding as observation, evidence (numbers, timecodes), the one change to try, into the
   next Content's `notes.md`.

Table of signals and fixes: `references/signals-to-fixes.md`.

## Do not

- Do not invent a script when a working reference exists.
- Do not present stale or undated videos as references.
- Do not claim a trend from fewer than three examples; say "insufficient data".
