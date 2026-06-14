# 413 - Backfill skills, templates, and tests for content modes

Status: active

## Problem

Some desired content modes already have partial coverage through existing skills and templates. Others are missing entirely or only exist as generic generation ability. Without an explicit backfill pass, Ralphy will expose impressive mode names but still fall back to weak generic prompts and agent taste.

The goal is not to copy another platform's skill list one-to-one. The goal is to turn the useful categories into Ralphy-native production routes that are tested, documented, and compatible with the CLI/provider invariants.

## Scope

- Audit current `.agents/skills`, public templates, workspace template behavior, guidelines, and playbooks against the mode list from #412.
- For every target mode, decide whether the right implementation unit is:
  - a public template;
  - a workspace template;
  - a skill overlay;
  - a prompt guideline;
  - a CLI verb or generator capability;
  - out of scope for the current release.
- Create a coverage matrix with owner, status, fixtures, and gaps.
- Backfill missing modes one at a time, starting with the highest leverage commercial workflows:
  - product-shot;
  - lifestyle-scene;
  - ad-creative-pack;
  - social-carousel;
  - ugc-review;
  - tutorial-ugc;
  - unboxing-ugc;
  - motion-design;
  - podcast-video;
  - personal-clipper.
- Add smoke fixtures for each shipped mode:
  - route selection;
  - production plan output;
  - required artifacts;
  - evaluation gate expectations.
- Run skill/template linting after every batch.
- Keep all provider access routed through Ralphy providers and CLI verbs.

## Acceptance

- There is a visible coverage matrix for all initial content modes.
- Every shipped mode has at least one routing fixture and one production-plan fixture.
- A mode is not marked supported unless it has guidelines, a default route, quality gates, and an output Unit shape.
- Existing skills are either attached to modes or explicitly classified as technical/maintainer-only.
- Docs warn agents not to expose unsupported mode names as promises.

## Links

- Depends on: #412 content mode taxonomy.
- Related: #058 content-niche skills templatization.
- Related: #060 memory mining into guidelines.
