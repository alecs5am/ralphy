# Article publish connectors (GitHub Pages, dev.to, Medium)

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** publishing / connectors / text

## Context

The publish executor (#501) targets youtube|tiktok|instagram|x via Postiz.
Articles (#526) need different rails: a git-backed site (GitHub Pages /
static repo), dev-blog platforms with APIs (dev.to, Hashnode), and Medium —
whose official write API has been shut down for new integrations for years
(VERIFY current status at implementation; the likely honest answer is
"Medium = park-for-human with a ready-to-paste export").

## What

An `article-publish` node + verb extending the publish path with article
targets:

- `github-pages` (v1 anchor): commit the article (markdown + assets) into a
  configured repo/branch/path via the standard git credential chain; the repo
  layout is a param (Jekyll/Hugo/Astro-style content dir + frontmatter
  mapping).
- `devto` and `hashnode`: API connectors under the registered-connector
  discipline (API key env vars), draft-or-publish param, canonical_url set to
  the workspace's canonical site (GEO hygiene: one canonical, syndicated
  copies point at it).
- `medium`: implement only if a sanctioned API path exists at build time;
  otherwise a `park-for-human` export pack (formatted body + assets + steps)
  in the approval inbox.

## Why it matters

30 articles that never leave `.ralphy/` occupy nothing. GitHub Pages is the
zero-key anchor (own domain, durable, crawlable) and canonical-URL syndication
to dev.to/Hashnode multiplies surface without splitting SEO credit.

## Scope / acceptance

- Node/verb takes an `article` unit (#526) + target list; per-target result
  (URL, id, status) appended to unit provenance; per-target failure isolates
  (one bad target doesn't kill the rest).
- `github-pages`: configurable repo/branch/dir/frontmatter template;
  commit-only (never force-push, never delete); dry-run mode prints the file
  it would commit.
- `devto`/`hashnode` connectors: key via env var, draft default ON at trust
  L0, canonical_url mandatory when a canonical site is configured.
- Medium status verified and the outcome documented in the connector file
  header; export-pack fallback implemented regardless (it doubles as the
  generic "publish anywhere by hand" path).
- Calendar (#504) + cadence (#525) apply to article targets like any other
  platform; trust ladder (#505) gates auto-publish.
- Tests: mocked APIs (payload mapping, canonical URL, draft flag), git
  target against a fixture repo (tmp dir), partial-failure isolation,
  export-pack shape.

## Notes

- Sequence after #526 and #501; campaign cross-linking consumes the returned
  URLs (#528).
