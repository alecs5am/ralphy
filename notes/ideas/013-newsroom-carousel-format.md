# Newsroom / newsjacking carousel format (port from Jason Lee's "carousel skill")

> **Status:** idea
> **Filed:** 2026-06-24
> **Folder:** ideas

## Context

User dropped a third-party Claude Code skill ("carousel skill" from Jason Lee's YouTube) to evaluate for integration. Source attached: [`source-skill.md`](013-newsroom-carousel-format/source-skill.md) + the editorial style ref [`slide-style.png`](013-newsroom-carousel-format/slide-style.png). It turns an AI-news X post into a fixed 4-slide IG carousel: a newspaper-masthead lifestyle **cover** (a recurring host reading a paper) + `THE UPDATE` / `WHY IT MATTERS` / `FOLLOW FOR MORE` slides, an optional animated cover, a local preview gallery, and an optional daily cron that monitors an X account.

## What

We already ship a generic, subject-agnostic [`/carousel`](../../.agents/skills/carousel/SKILL.md) skill (cover-first checkpoint, dual-ref cohesion, mascot-fit, JSON prompt schema). What this source adds that we *don't* encode is a **specific high-performing editorial template + a newsjacking research flow**. Port the ideas, not the implementation — its media stack violates our invariants. Mapping:

- **Editorial template** (masthead cover + UPDATE/MATTERS/FOLLOW structure, fixed style ref) → a new public-library **Template + Style** in `creator-lifestyle`, OR a craft overlay on `/carousel`. This is the real net-new value.
- **Source-post → research → copy** (screenshot the tweet, embed as a card, WebSearch context, then write copy) → a newsjacking branch on research-bootstrap (#19) + `ralphy ref pull`; the "embed the source-post screenshot as a slide card" pattern is new.
- **Recurring host** (`CHARACTER_MEDIA_ID`) → `ralphy persona` + super-original `--ref` master (already our pattern).
- **Optional cover video** → `ralphy generate video --model bytedance/seedance-2.0` (i2v on the cover still). Trivial.
- **Daily automation** ("carousels ready when you wake up") → scheduled/cron generation — the most novel direction, fits the "content farm on autopilot" positioning but is a bigger build.

## Why it matters

A named newsroom format closes a real gap: our carousel skill is style-machinery, not a ready-to-ship editorial format with proven engagement. Newsjacking + a recurring host persona + scheduled runs is exactly the "content farm" promise. Low marginal cost (~$0.20/slide on gpt-image, ~$1/carousel).

## Notes

- **Hard conflict — drop, don't port:** the source runs all media through **Higgsfield MCP** (`gpt_image_2`, `seedance_2_0`). AGENTS.md invariant #1 bans non-registered connectors for media — everything reroutes through `ralphy generate` (→ OpenRouter/fal). No `HIGGSFIELD_API_KEY`, no MCP media calls.
- **Already covered — don't duplicate:** the bespoke `index.html` preview gallery ≈ **Studio** (#107). Reuse Studio; at most add a "newsroom gallery" view.
- **Chrome MCP for the tweet screenshot** is capture (not media gen), so allowed, but prefer Playwright per site-grounding (#15) / `ralphy ref pull` where it can fetch the post.
- **Open questions:** (1) Template vs craft-overlay-on-`/carousel` — which is the right home? (2) Is scheduled/triggered generation in scope yet, or a separate issue (depends on the desktop/cron story)? (3) The masthead-newspaper cover needs baked typography → `gpt-5.4-image-2` (consistent with our carousel model pick).
- Promote to a `notes/issues/` item once we decide template-vs-overlay and whether automation is in or out of v1.
