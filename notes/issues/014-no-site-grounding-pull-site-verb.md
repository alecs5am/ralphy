# Missing verb: `ralphy ref pull-site <url>` (brand-DNA capture)

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

AGENTS.md invariant #15 requires a Playwright sub-agent crawl on any named brand URL before drafting brand-DNA — to surface real CSS palette, fonts, documented SDK surfaces, and copy. There is no CLI verb that wraps this: every project does it with raw `curl` + hand-rolled Playwright scripts + ad-hoc `dwebp` + screenshot.

## What

- `sotaocr-fb-001`: $1.20 + 12 min burned on a wrong-palette v1 batch precisely because site-grounding was skipped; 5/32 creatives hallucinated a Python SDK that doesn't exist (MEMORY: `feedback_verify_sdk_before_code_creative`).
- `odindoma-fb-ad-001`: 3 ad-hoc Playwright scripts in `/tmp`; agent hand-drew 22 SVG blob paths because `hyperframes capture` did not pull `mask-image:url(...)` from CSS.
- `twitch-fb-ads-001`: brand-zip handling reinvented per project (#4, #5).

## Why it matters

This is invariant #15. Without a CLI verb, the rule depends on the agent remembering — recurrence rate is high.

## Suggested fix

- New `cli/commands/ref.ts → pull-site <url>`:
  - Wraps Playwright fan-out (home, `/docs`, `/pricing`, `/features`, `/examples`, `/blog` — sitemap-driven).
  - Writes `refs/<slug>-hero.png`, `refs/<slug>-full.png` per page.
  - Writes `refs/<slug>-tokens.json` with computed CSS color palette, font stacks, CSS variables.
  - Optionally writes defuddled markdown of each page.
  - Enumerates documented API surfaces (curl vs Python vs TS vs GUI) into `refs/<slug>-apis.md` to prevent SDK hallucination.
- New `cli/commands/website.ts → extract` that pulls CSS rules (`mask-image:url(...)`, `transform-origin`, keyframes) into `capture/extracted/css-rules.json` — sub-feature.
- Update `.claude/skills/website-to-hyperframes/references/step-1-capture.md` with the recipe.

## Sources

- `workspace/projects/sotaocr-fb-001/postmortem/03-cli-issues.md` — #1
- `workspace/projects/sotaocr-fb-001/postmortem/05-workflow-fixes.md` — #2
- `workspace/projects/odindoma-fb-ad-001/postmortem/03-cli-issues.md` — #1, #2, #3, #4
- `workspace/projects/odindoma-fb-ad-001/postmortem/05-workflow-fixes.md` — Fix #2, Finding B
- `workspace/projects/twitch-fb-ads-001/postmortem/03-cli-issues.md` — #4, #5
- MEMORY: `feedback_site_grounding_before_brand_dna`, `feedback_verify_sdk_before_code_creative`
