---
id: 01.01.02
status: todo
v1_0: no
category: 01-cli
topic: "01.01 Front-stage verbs"
title: "ralphy trend — niche / handle scanner"
---

# 01.01.02 — `ralphy trend` — niche / handle scanner

**v1.0:** no — deferred per [D-04](../01-cli/OPEN-QUESTIONS.md#decision-log); blocked on `01.11.03` (external analytics readers).

**Acceptance criteria:** (post-launch)
- `ralphy trend "@handle"` or `ralphy trend --niche "<text>"` returns top-N clips with `{ url, views, velocity, format, hook }` per clip.
- `--platforms tiktok,reels,shorts`, `--window 14d`, `--top 20`, `--save-refs` flags work.
- `--save-refs` runs `ref pull` + `ref blueprint` on each clip and registers them under a deterministic slug.
- Pretty output (TTY-default per `01.02.01`) shows a ranked table.
- Refuses gracefully when no auth / no API access — points the user at the right open question or stub.
- Velocity is a real signal (analytics-API-backed), not a yt-dlp single-fetch placeholder.

**Notes:** wraps `research scrape-trends`; needs niche/handle filtering added to the back-stage verb. v1.0 substitute: users can still hand the agent a URL list and let the researcher playbook break each down via `ref pull` + `ref analyze-video`.
