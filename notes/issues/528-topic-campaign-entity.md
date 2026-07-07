# Topic campaign: keyword matrix across formats

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** strategy / orchestration / content-farm

## Context

The owner's campaign brief: occupy the topics "ralphy is a video studio for
AI agents" and "agent-made video earns money and views" with 30 SEO/GEO
articles + 30 YouTube videos + 30 keyword-targeted shorts. The Run control
plane (#480) binds one farm run's projects; the variant matrix (#456) varies
creative within a batch. Neither models a TOPIC CAMPAIGN: a keyword/topic
cluster mapped to a planned set of units across formats and channels, with
cross-linking between them and a coverage ledger ("which keywords are
occupied, which are still open").

## What

A workspace-scoped campaign entity: thesis statements + a keyword/topic
matrix (head terms, long-tails, question queries — seeded by a research pass,
user-editable) -> a planned unit inventory (per cell: format, angle, target
channel, priority) -> execution mapped onto runs/ticks (#503) and the
calendar (#504) -> a coverage report joining plan vs published vs analytics
(#507). Cross-linking is first-class: each produced unit knows its campaign
siblings (video description links the article, article embeds the video,
shorts point at the longform), resolved from publish-result URLs (#501/#527).

## Why it matters

"30+30+30 on two theses" is not 90 independent briefs — the value is the
mesh: interlinked coverage that compounds in search and LLM answers. Without
the entity, the mesh exists only in the owner's head and the cross-links
never happen headless.

## Scope / acceptance

- Campaign schema at `.ralphy/workspaces/<ws>/campaigns/<id>/campaign.json`:
  theses, keyword matrix, planned inventory (cells with format / angle /
  channel / status / linked unit id), cross-link policy.
- `ralphy campaign create|show|plan|status` — `plan` runs a bounded research
  + `generate-object` pass proposing the matrix + inventory from the theses
  (user approves before anything queues); `status` = coverage ledger (planned
  / produced / published / indexed-hint from analytics).
- Graph integration: a `campaign-next` selection source (like `trend-watch`
  but pulling the next unproduced cell) so ticks drain the plan; produced
  units stamp their cell.
- Cross-linking: publish steps receive sibling URLs when available
  (description/frontmatter injection); late links (article published after
  the video) create a pending-link entry surfaced in `campaign status` — v1
  applies them on the NEXT publish, no retroactive edits of live posts.
- Calendar fill: `campaign plan --schedule` proposes slot assignments across
  the 90 items honoring cadence (#525) and the per-format mix.
- Tests: schema, plan fixture (mocked LLM), cell lifecycle, next-cell
  selection, cross-link injection, coverage report math.

## Notes

- Sequence after #526/#527 (needs the article class) and #511; consumes #480
  runs, #504 calendar, #507 analytics.
- Keep it honest: coverage claims come from publish results + analytics,
  never from assumptions about indexing.
