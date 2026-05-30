# De-prefix skills and narrow skill scope to technical operations

> **Status:** todo
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** high
> **Category:** skills / architecture

## Context

The `ralphy-` / `ralphy-dev-` prefixes on skill names are noise — they confuse
more than they namespace. And the experiment of encoding content niches as
skills (`ralphy-ugc-*`, `ralphy-poster`, `ralphy-analog-horror-psa`,
`ralphy-fb-creatives`, `ralphy-carousel`) did not pan out: those are *templates*,
not skills (see `052`). This reverses the model in note `008`.

## What

1. **Drop the `ralphy-` prefix** from all skill names (keep a clear convention
   for maintainer skills, e.g. a `dev:` grouping in metadata, not in the slug).
2. **Redefine "skill" = a technical / operational capability**, not content
   know-how. Skills that stay: website extraction (`website-to-hyperframes`),
   prompting guidelines (JSON prompting, photoreal, anti-slop — fold into the
   `guidelines` system), research, evaluator, install, postmortem, dev tooling
   (release, tasks), the HyperFrames engine skills.
3. **Migrate content-niche skills into templates** under `052`'s taxonomy:
   `ralphy-ugc-*`, `ralphy-poster`, `ralphy-carousel`, `ralphy-fb-creatives`,
   `ralphy-analog-horror-psa` → style templates. Preserve the real craft text.
4. Skills are **referenced in Ralphy's system prompt** (`AGENTS.md`) for
   technical use, not as the content-routing default.

## Scope / acceptance

- Rename `.agents/skills/*` dirs + `.claude/skills` symlinks; update every
  `name:`/`namespace:` in frontmatter.
- Update `lint:skills` (namespace regex) + run it green.
- Rewrite `AGENTS.md` routing table + invariant #10 + `docs/skills-vs-templates.md`
  to the new model (templates are the content unit; skills are technical).
- Update `landing/lib/skills-loader.ts` + `landing/app/skills/*` (category
  derivation was prefix-based — rework to metadata-based).
- Update `docs-mintlify` references to renamed skills.
- Mark note `008` superseded.

## Why it matters

The prefix and the skill-as-content model leak into routing, the skills page,
and the system prompt. One coordinated rename + scope cut removes the confusion.

## Notes

- Cross-cutting; touches `AGENTS.md` (collision with everything). Sequence right
  after `052`, before library work. Single coordinated change, never parallel.
