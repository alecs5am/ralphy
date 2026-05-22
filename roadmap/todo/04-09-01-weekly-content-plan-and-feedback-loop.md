---
id: 04.09.01
status: todo
v1_0: no
category: 04-user-flow-and-autonomy
topic: "04.09 Weekly content plan and posting feedback loop"
title: "Weekly content plan + posting + engagement feedback loop"
---

# 04.09.01 — Weekly content plan + posting + engagement feedback loop

**v1.0:** no — post-launch feature; MVP scope locked 2026-05-22.

**Acceptance criteria (MVP — option A, manual loop):**
- `ralphy plan new "<brief>"` creates a `workspace/plans/<plan-id>/` with `plan.json`, `schedule.json`, child project symlinks, and an empty `post-results.jsonl`.
- `ralphy plan show <plan-id>` prints the weekly calendar with per-slot status.
- `ralphy plan generate <plan-id>` batch-renders unfilled slots via the existing `batch` infra (each slot becomes a `workspace/projects/<scene-id>/` so the append-only contract holds).
- `ralphy plan log <plan-id> --slot <id> --url <tiktok|reels|shorts URL>` records the published URL into `post-results.jsonl`.
- `ralphy plan measure <plan-id>` one-shot scrape across all logged URLs (Apify for TikTok + Instagram Reels, YouTube Data API for Shorts). Appends a scrape entry per URL — never replaces a prior reading.
- `ralphy plan report <plan-id>` weekly rollup: tier ladder (`viral` / `great` / `good` / `weak`) per post + variant ranking.
- New env keys surfaced in `ralphy setup` + `ralphy doctor`: `RALPHY_APIFY_TOKEN`, `YOUTUBE_API_KEY`.
- New error codes (append-only): `E_PLAN_NOT_FOUND`, `E_PLAN_SLOT_EMPTY`, `E_POST_URL_UNREACHABLE`, `E_SOCIAL_API_KEY_MISSING`.
- New template kind `content-plan` added to `cli/lib/schemas/template.ts` (`TemplateKind` enum extended). Schema adds `schedule: [{ day, time, platform, source_template_slug, hook_pattern }]` and `performance_targets: { views_min, engagement_min }`.

**Notes:**

## Context

The user wants Ralphy to (a) generate a week of social posts, (b) actually publish them on a schedule, and (c) measure whether each post worked, so the next week's plan can be data-driven. Framed as "Instagram weekly plan", but the RU market reality (where the user operates) is VK Clips + Telegram first, Reels via VPN second — see `## RU market summary` below.

This is the natural next step after `producer` (one-shot batches) — the producer ships videos; this proposal ships a *campaign* that runs for weeks.

## What

A new top-level entity, `plan`, that owns a multi-week posting calendar across one or more social channels. A `plan` is a parent of N child `project`s (one per scheduled post), plus a `post-results.jsonl` log per platform.

CLI surface (proposed):

```
ralphy plan new "<brief>" --weeks 1 --posts-per-week 7 \
  --platform instagram,vk-clips --from-template <slug>
ralphy plan show <plan-id>          # weekly calendar + status of each slot
ralphy plan generate <plan-id>      # batch-generate child projects for unfilled slots
ralphy plan log <plan-id> --slot mon-reel --url <published-url>
ralphy plan measure <plan-id>       # poll engagement for every posted slot
ralphy plan report <plan-id>        # weekly rollup + variant ranking
ralphy plan iterate <plan-id>       # propose next-week plan from current results
```

Persistence: `workspace/plans/<plan-id>/` with `plan.json`, `schedule.json`, `post-results.jsonl`, and child `projects/<scene-id>/` symlinks into the existing `workspace/projects/` tree (so the append-only contract holds — plans never overwrite project data).

New template kind: `content-plan`. Schema adds `schedule: [{ day, time, platform, source_template_slug, hook_pattern }]` and `performance_targets: { views_min, engagement_min }`.

## Why it matters

- **Closes the loop.** Ralphy today ships isolated mp4s. Without a feedback signal (did the post land?), the prompt cookbook can't improve from real data — only from author hunch.
- **Market positioning.** The RU "content-factory" tier (Raketa Digital 120–400k ₽/mo for 30–100 videos; Lomova 20–50k ₽/format) sells *agency-service*, not tooling. A CLI that produces *and* schedules *and* measures is uncontested.
- **Reusable across roles.** Producer (batches), evaluator (offline QA), and researcher (competitor scraping) already exist; the plan entity stitches them into a recurring routine instead of one-shot use.

## Architecture options (pick one to ship as MVP)

### A. Manual loop (cheapest, ~1 week)

Ralphy generates + renders. User downloads, posts manually (Insta app, VK web, TG channel). User runs `ralphy plan log` with the public URL. `ralphy plan measure` fetches engagement via a scraping provider (Apify Insta scraper / VK open API / TG public-channel API).

- ✅ No platform OAuth, no cloud runner, no compliance risk.
- ✅ Works for restricted-IP platforms (Insta from RF) — user is the proxy.
- ❌ User effort = 5 min/post × 7/week. Adoption friction.
- ❌ Public scraping misses owner-side metrics (impressions, retention curve).

### B. Scheduler bridge (semi-auto, ~2 weeks)

Ralphy uploads renders to a third-party scheduler (SMMplanner, Onlypult, Buffer, Later). Scheduler handles platform posting + native owner-side metrics. Ralphy polls scheduler API for posted-URL + engagement.

- ✅ Solves the RF-IP problem (schedulers run from outside RF).
- ✅ Owner-side engagement metrics included.
- ✅ Multi-platform from one upload (Insta + VK + TG + OK).
- ❌ Adds a paid dependency (SMMplanner from ~600 ₽/mo).
- ❌ One more API to maintain when schedulers change shape.

### C. Direct platform APIs (full-auto, ~4 weeks)

Per-platform OAuth + post via Instagram Graph API, VK API, TikTok Creator API, YouTube Data API. Requires hosted runner outside the user's machine for Insta (RF-IP block) and a Meta Business verified account.

- ✅ Fewest moving parts long-term.
- ✅ Owner-side metrics, no scraper rot.
- ❌ Multi-platform OAuth is a maintenance tax.
- ❌ Insta Business requirement excludes most SMB users.
- ❌ Cloud runner = hosting cost + secrets handling.

### D. VK-Clips + Telegram first (RU-market-fit overlay on A/B/C)

Default the plan to publish VK Clips + Telegram (both have permissive, RU-friendly, RU-IP-compatible APIs), and treat Instagram as an opt-in extra that requires either manual posting (option A) or a scheduler (option B). Aligns with where the audience actually is in the RF market (per the research below) and avoids the 15 April 2026 VPN-block hard problem entirely on the primary channel.

## Recommended path

Ship **A + D**: manual loop, VK + Telegram primary, Instagram opt-in manual. Keep the schema and CLI surface flexible enough to slot **B** (scheduler bridge) in later as a non-breaking upgrade. Defer **C** until at least one paid customer asks for it — the maintenance tax is real.

## MVP scope (locked 2026-05-22)

User decisions captured this session:

- **Primary platforms = TikTok + Instagram Reels + YouTube Shorts** (the global 9:16 short-form stack). VK Clips + Telegram drop out of the MVP — they were the RU-market overlay (option D) but the user is targeting the same audience the rest of the world targets. The render side is platform-agnostic (single 9:16 master per post); the publishing + measurement side is per-platform.
- **Architecture = option A (manual loop).** No scheduler bridge, no cloud runner, no OAuth in MVP. User publishes by hand; Ralphy generates, renders, logs the public URL, and scrapes.
- **Engagement source = public scrape.** Apify TikTok scraper + Apify Instagram scraper + YouTube Data API public endpoints (`videos.list?part=statistics`). No Business-account requirement. Misses retention curve — accepted trade-off.
- **Measure trigger = manual `ralphy plan measure`.** No daemon cron. User decides when to look. The daemon stays optional / future work.

Reframed MVP CLI surface:

```
ralphy plan new "<brief>" --weeks 1 --posts-per-week 7 --from-template <slug>
ralphy plan show <plan-id>
ralphy plan generate <plan-id>          # batch-render all unfilled slots
ralphy plan log <plan-id> --slot <id> --url <tiktok|reels|shorts URL>
ralphy plan measure <plan-id>           # one-shot scrape across all logged URLs
ralphy plan report <plan-id>            # weekly rollup + variant ranking
ralphy plan iterate <plan-id>           # propose next-week plan from measured data
```

Per-platform scraper adapter under `cli/lib/social/scrapers/{tiktok,instagram,youtube}.ts`. Each returns the normalized shape `{ url, fetched_at, views, likes, comments, shares?, duration_s? }`. URL-pattern routing decides which scraper to call. Apify token lives in `RALPHY_APIFY_TOKEN`; YouTube uses the existing OpenRouter pass-through? — **no, YouTube Data API needs its own key, `YOUTUBE_API_KEY`.** Add to `ralphy setup` + `ralphy doctor`.

`post-results.jsonl` schema (one line per scrape, append-only — never replaces a prior reading):

```json
{ "timestamp": "2026-05-22T12:00:00Z", "plan_id": "spring-001-plan",
  "slot": "mon-reel", "project_id": "spring-001",
  "platform": "tiktok", "url": "https://tiktok.com/...",
  "metrics": { "views": 1230, "likes": 84, "comments": 4, "shares": 1 },
  "scraper": "apify:tiktok-scraper@1.2" }
```

`scoreSocialPost(metrics, platform)` generalizes `scoreTikTok` from `cli/lib/score.ts` — keeps the same tier ladder (`viral` / `great` / `good` / `weak`) but uses platform-calibrated thresholds. Per-platform threshold table goes in `cli/lib/score-thresholds.ts`.

Deferred to v2 (explicitly out of MVP scope):

- Direct platform posting (option B/C).
- Daemon-driven cron polling (`ralphy plan watch`).
- Retention-curve / owner-side metrics.
- VK Clips + Telegram publishing — re-enter when user asks for RU-market expansion.
- Multi-week plans (`--weeks 4`); MVP is single-week only.
- Auto-iteration (`ralphy plan iterate`); MVP stops at `report`, human decides next week.

## Open questions

- Which platform is post-#1: VK Clips or Telegram or Instagram? Affects default template `schedule.platform`.
- Owner-side or public-scrape engagement? If user has a VK Business account + Insta Business, owner-side is strictly better; if not, scrape.
- Per-post variant count: 1 (deterministic) or 2–3 (A/B from the producer batch)?
- Where does the "watch whether it works" trigger fire — a cron-scheduled `plan measure`, or only when the user runs it? (Cron implies the daemon, which already exists — `cli/commands/daemon.ts`.)
- Should `plan` be a new top-level entity, or just a `batch` extension with a `schedule` field? Leaning new entity — batches are stateless N-shots; plans are stateful recurring routines.

## RU market summary (research input, 2026)

- **Where content actually gets posted in RF, 2026:** Telegram (#1 organic + paid), VK Clips (2.7B avg DAU views Q3 2025, +9% YoY), Reels via VPN (organic only, paid promo banned since 2022, VPN access shrinking after 15 April 2026 ban on VPN traffic to major RU platforms), YouTube Shorts (throttled), Yappy (Gazprom-Media TikTok clone, checkbox channel), TenChat (B2B). TikTok itself is frozen for new RF uploads.
- **Top players:** SETTERS (enterprise, ~150M RUB/yr, big-brand storytelling, no public pricing); Raketa Digital (full-cycle content factory, 120k / 220k / 400k RUB tiers for 30 / 60 / 100+ videos/mo); Polushko (marketplace UGC, CPV-bonus model, from 40k RUB base); Hooglink (Avito-paid); Kontent-czavod.ru (AI-assisted reels, 15–180 videos/mo tiers, no public pricing); Lomova Pro (per-format SaaS — Carousel 20k / SilentHook 25k / AI Avatar 30k / Vlog 40k / Creator 50k); UGC Market (creator marketplace); CogniScript (AI SMM SaaS).
- **Real per-creator contracts surfaced publicly:** 35k ₽ for 60 videos/mo (clothing brand), 40k ₽ for 40 videos/mo + view-bonus (homewares).
- **AI-UGC adoption:** Sber Kandinsky 5.0 (Nov 2025, RU-native text-to-video, no VPN); Yandex Shedevrum + YandexGPT 5. **No flagship public case** of a top-tier RU brand shipping AI-generated UGC at production scale yet — incumbents still use AI for scripting/dubbing only.
- **Weekly archetype (composite, SMB account):** Mon reel-myth-bust, Tue carousel-tutorial, Wed reel-quick-tip 15–30s, Thu static+stories sale, Fri reel BTS, Sat carousel FAQ, Sun reel-trending-audio. Ratio ≈ 3 reels : 2 carousels : 2 static/story. High-volume agencies push 5–7 reels/day across linked accounts.
- **Gaps Ralphy can attack:** (1) no CLI-native incumbent; (2) reference-locked identity at scale (Polushko's bonus model exists *because* AI factories drift between scenes — Ralphy's locked-ref discipline addresses this); (3) marketplace-card video (WB/Ozon, CPV ~0.09 ₽, highly templatable); (4) VK-Clips-first 1:1 positioning that no Western AI UGC tool optimizes for; (5) RU-language voice + lipsync (Kling fails on RU per repo memory, ElevenLabs RU post-mix is the path no incumbent packages); (6) cost transparency (gen-log + rollup) for procurement-conscious SMB buyers; (7) white-label B2B2C — agencies use Ralphy *behind* their client-facing brand.

Sources (key): raketadigital.com, sostav.ru, vc.ru, polushkoagency.ru, lomova.pro, setters.agency, vk.company press, meduza.io (April 2026 VPN block), habr.com (Roskomnadzor 469 blocks), 1ps.ru (SMM trends 2026), manifestagency.ru / adlook.me / cropmedia.ru (weekly-plan archetypes).

## Notes

- Reuse: `cli/lib/jobs/` (daemon + queue, supports `depends_on`), `cli/lib/score.ts` (`scoreTikTok` ratios — generalize to `scoreSocialPost` covering VK / Insta / TG), `cli/lib/gen-log.ts` (append-only JSONL pattern), `cli/commands/batch.ts` (variant generation), `cli/commands/eval*` (offline QA before publish).
- Build new: `scheduled_for` timestamp on `JobRow`; `cli/commands/plan.ts`; `cli/lib/social/` (scraper adapters first, posting adapters later); `templates/<category>/<slug>/` with `kind: content-plan`; extend `TemplateKind` enum in `cli/lib/schemas/template.ts`.
- Touch carefully: error catalog (`cli/lib/errors/catalog.ts`) — append, do not renumber. New codes likely needed: `E_PLAN_NOT_FOUND`, `E_PLAN_SLOT_EMPTY`, `E_POST_URL_UNREACHABLE`, `E_SOCIAL_API_KEY_MISSING`.
- Related decision waiting to be made: should the `plan` entity replace `batch` for N≥3, or co-exist? Co-exist is simpler — batch stays stateless one-shot, plan is the recurring wrapper.
