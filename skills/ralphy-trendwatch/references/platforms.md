# Platform facts for scouting (no login)

Measured during the trend-corpus build (2026-10). Re-check when a method stops working.

- Outlier = views against the creator's own median (their recent ~30 videos of the same format,
  leave-one-out). Hashtag and search pages are survivors: videos found there had a median of 7.1x
  their own creator's median, so a "top of the hashtag" list overstates what is normal. Build from
  creators, not from one listing.
- TikTok: hashtag pages return an empty body and search shows a captcha without login. The explore
  feed works (geolocated by IP, about 8% ads). Creator lists through yt-dlp
  (`tiktokuser:<secUid>`) were fast (about 39 videos/s) with no blocks. Sound pages work.
- YouTube Shorts: flat channel lists (`yt-dlp --flat-playlist`) give rounded views (median error
  0.9%) and no dates or likes; fetch dates per video. The watch page starts asking "Sign in to
  confirm you're not a bot" after about 230 requests and recovers after about 17 minutes.
- Instagram: about 12 reels per profile with rounded views, then a login wall. yt-dlp on a single
  reel gives no view count. Private or login-walled reels need `--cookies-from-browser`, only with
  the owner's ok.
- yt-dlp errors: "Sign in" or 403 often means an old yt-dlp (see `ralphy-setup`); "n challenge solving
  failed" or "No supported JavaScript runtime" is not a block: the bundled pull enables bun, node or
  deno when installed.
