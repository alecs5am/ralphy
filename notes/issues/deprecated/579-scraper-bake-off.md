# Scraper bake-off: open-source candidates versus yt-dlp

> **Status:** dropped (owner, 2026-10-28: not agreed scope; the working yt-dlp path is enough, hook types are covered by #576 and #577 reports)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** research / trend-watch / sources

## Context

`docs/research/trend-dataset-spec.md` keeps yt-dlp as the core source. The owner asked for free GitHub scrapers that fit the spec; candidates found on 2026-10-28 (not yet tested): TikTok `omkarcloud/tiktok-scraper`, `yuki-shi/tiktuki`, `Q-Bukold/TikTok-Content-Scraper`, `toolzerhub/tiktok-scraper`, `clearfetch/tiktok-video-scraper` (check license; paid tier nearby); Instagram `ahmedrangel/instagram-media-scraper`, `seotanvirbd/Instagram-Reel-Scraper`; YouTube `scrapetube`, `tubescrape` (InnerTube). Excluded by policy: tools that need proxies, cookies, CAPTCHA solving or request-signature forging (e.g. `davidteather/TikTok-Api` in its default proxy setup).

## What

Run 2-3 candidates per platform against yt-dlp on the same 100 creators from one niche: field coverage (views, likes, comments, shares, saves, post time, duration, follower count), precision (exact vs rounded), requests before a block, wall time, failure modes, maintenance (last commit, open breakage issues), license. Adopt a candidate only where it adds a field or a path yt-dlp lacks (Instagram per-reel refresh is the likely winner); wire it as a #556 source behind the circuit breaker.

## Scope / acceptance

- `docs/research/scraper-bake-off.md` with the comparison table and verdicts.
- Adopted sources run headless with no login, cookies or proxies; tests on recorded fixtures.
- Candidates installed in an isolated, pinned environment; no code from them runs inside the CLI process without review.
