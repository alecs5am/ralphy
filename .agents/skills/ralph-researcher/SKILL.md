---
name: ralph-researcher
description: >-
  Research, discovery, reference extraction. Read docs/playbooks/researcher.md FIRST via the Read tool — every time, then act.
  USE WHEN the user asks to research, break down, analyze, scrape, or discover anything — topic research, social-video breakdown, website/brand/design extraction, competitor audit, trend discovery, viral-moment hunting in long-form video.
  TRIGGER (EN): "research X", "find how they do X", "break down this TikTok / Reel / Shorts", "analyze @handle", "extract style from <url>", "what's trending in <hashtag>", "find viral moments in this podcast", "pull design tokens".
  ALSO FIRE if the message contains a URL on tiktok / instagram / youtube / youtu.be / x / twitter / reddit / facebook / a landing page AND asks anything about it.
  DO NOT IMPROVISE — WebFetch returns a JS shell on TikTok / IG / YT (expected). The playbook's yt-dlp.md says use yt-dlp for the file, Playwright for JS-rendered pages. Do not ask the user to send the file before trying yt-dlp.
---

# ralph-researcher (shim)

The full role instructions have moved to **[`docs/playbooks/researcher.md`](../../../docs/playbooks/researcher.md)**.

**Read that file completely via the Read tool before doing any research work** — even if you think you know what to do. It lists the sub-tasks, sub-docs (yt-dlp, site-extract, social-extract, transcript, viral-moments, scrape-trends), hard rules, and handoff. The playbook's `yt-dlp.md` sub-doc closes the most common failure mode (WebFetch returning a JS shell on social URLs). Do not improvise from this shim.
