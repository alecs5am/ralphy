# 416 - Add automatic trend and niche research bootstrap

Status: active

## Problem

Low-detail user prompts often need market context before generation. If the user says "make content for this product" or "make me a UGC ad for this niche", the agent should not jump straight into generic scriptwriting. It should understand the niche, competitors, current formats, visual language, platform conventions, and benchmark examples.

Ralphy has researcher and site-grounding pieces, but the production bootstrap is not yet opinionated enough. The agent still has too much room to skip research or ask the user to provide context the system could discover.

## Scope

- Define quick versus deep research modes:
  - quick: brand/product/site grounding plus 3-5 benchmark references;
  - deep: competitor scan, creator/format scan, ad-library or social trend scan where supported, and style/offer synthesis.
- Trigger research automatically when a prompt includes:
  - a product URL;
  - a brand URL;
  - a niche without enough creative detail;
  - a request for multiple Units or a content farm;
  - a creator/profile/reference URL;
  - a platform-specific performance goal.
- Reuse existing site-grounding and researcher flows where possible.
- Add product and brand extraction outputs that downstream modes can consume:
  - product facts;
  - brand assets;
  - audience;
  - proof points;
  - claims to avoid;
  - visual references;
  - platform fit.
- Write research outputs to stable project artifacts such as `research/report.md`, `sources.json`, and a structured style/benchmark lock.
- Feed research directly into content mode selection, production plan generation, guidelines, and council review.
- Respect the reference-required gate for named real entities, while allowing generic product/lifestyle work to proceed without unnecessary user-uploaded refs.

## Acceptance

- A vague product or niche prompt produces a research-backed production plan instead of a generic script.
- Agents can choose quick or deep research using documented triggers.
- Research artifacts are persisted and reused across later Unit stages.
- The production plan cites the research artifacts it depends on.
- Tests cover at least one product URL, one brand URL, one generic niche, and one creator/reference URL route.

## Links

- Related: #408 style and benchmark grounding.
- Related: #410 chat-native content farm mode.
- Related: #414 Unit production pipeline.
- Related: site-grounding discipline in `docs/playbooks/site-grounding.md`.
