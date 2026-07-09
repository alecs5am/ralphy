# Route the article/campaign/farm-ops surfaces into AGENTS.md + playbooks

> **Status:** todo
> **Filed:** 2026-07-09
> **Folder:** issues
> **Severity:** medium
> **Category:** routing / docs / agent-facing

## Context

The #526–#544 tranche (landed 2026-07-09) added several agent-facing surfaces
that are NOT reachable from the `AGENTS.md` routing contract — the file the
agent reads on every request. `rg -c "article-publish|campaign roi|ralphy
campaign|farm health|workspace backup" AGENTS.md` returns 0. Under-routing is
the exact defect `AGENTS.md` exists to prevent: a capability that ships but is
never surfaced to the router is effectively invisible, so the agent improvises
or says "not supported".

The `seo-article` content mode (#526) IS in the content-mode paragraph +
`cli/lib/content-modes.ts`, but the routing TABLE (the `| User intent |
Playbook |` rows) has no article-production row, and the new CLI verbs have no
route or playbook pointer at all.

## What

Add routing-table rows + playbook/doc pointers so the agent surfaces the new
surfaces from a plain-language request:

- **Article production** (#526) — an "write me an SEO/GEO article / blog post /
  Medium post" intent → the `seo-article` mode + the `article` unit route.
  (The mode exists; it needs a routing-table row analogous to the poster /
  carousel rows.)
- **Article publishing** (#527) — "publish this article to github pages /
  dev.to / hashnode / medium" → the `article-publish` verb + node, under the
  FORM/PUBLISH family (distinct from the Postiz `youtube|tiktok|instagram|x`
  publish path).
- **Topic campaign** (#528) + **cost/ROI** (#544) — "occupy these topics with N
  articles/videos/shorts", "plan a campaign", "what did this campaign cost /
  what's the ROI" → `ralphy campaign create|plan|status|roi` + `workspace roi`.
  This is a new orchestration surface with no route today.
- **Farm operability** — `ralphy farm health` (#539) and `ralphy workspace
  backup|restore` (#540) → a pointer from the farm/core playbook so the agent
  reaches for them on "is the farm alive / stalled", "back up the farm state",
  "restore / migrate the workspace".

## Why it matters

Chat is the interface; the router is how a plain-language ask binds to a
capability. Seven verbs and a content mode that only a maintainer reading the
source knows about do not serve the user. This is the cheap last-mile that
turns landed code into reachable product.

## Scope / acceptance

- `AGENTS.md` routing table gains rows for: article production (`seo-article`),
  article publishing (`article-publish`), and topic campaigns
  (`campaign`/`roi`). Each row names the playbook/skill/verb that executes it,
  in the existing row style.
- The farm/core playbook (`docs/playbooks/core.md` or the farm section it points
  at) gains a short pointer to `farm health`, `workspace backup`, `workspace
  restore` for the operability intents.
- The content-mode coverage stays honest: `seo-article` already has its
  `docs/playbooks/modes/seo-article.md`; link it from the new routing row.
- `bun run lint:agents-md` stays green (routing-table shape + no claude-isms).
- `bun run lint:docs-links:fast` green (any new links resolve).
- No behavior change — this is routing + docs coverage only.

## Notes

- Discovered closing the #526–#544 `/dev-loop` run (2026-07-09): the code
  landed with tests + `docs/` per-feature, but the always-on router contract
  was not updated in lockstep.
- Sequence: independent, low-risk, docs-only — can run any time. Good
  first-pick for a `/dev-loop` session.
- Cross-links #526 (mode), #527 (article-publish), #528 (campaign), #544 (roi),
  #539 (farm health), #540 (backup/restore).
- Keep promises gated on `isModeSupported` / the verb actually existing — do not
  route anything that is only partially built.
