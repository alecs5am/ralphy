# Own-post comment analysis and iteration proposals

> **Status:** done — 2026-10-28 (`analytics comments import|report`, post-comments Document per Unit, deterministic classes + optional `--llm`, beat map joined to #558 retention, proposals with evidence, `analytics report` comment section; no schema change)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** feature / analytics

## Context

The owner's acceptance test includes "analysis of metrics and comments and iteration proposals after posting". #558 covers metrics from screenshots; comments on our own posts are not covered.

## What

- Import comments for a unit: pasted text, a screenshot read by the agent's own vision, or a free export (yt-dlp comments for YouTube).
- Classify: questions, requests for more ("part 2"), objections, confusion about a specific moment, praise, criticism of delivery, spam. Link timestamps mentioned in comments to the scenario beat and the #558 retention points.
- Iteration proposals: next video ideas from demand, fixes for the beats that confused viewers, hook or packaging changes, each tied to evidence (comment ids and counts).
- Store in the decision ledger context so #558 reports can join comment signals with outcomes.

## Scope / acceptance

- `ralphy analytics comments import <unit> ...` and `ralphy analytics comments report <unit>`; dry-run before write like #558.
- The report lists proposals with evidence; nothing is published or replied to.
- Tests on synthetic comment fixtures.

## Decisions (implementation)

- **Storage:** one JSON Document per Unit, kind `custom`, slug `post-comments-<unit-slug>`, body kind `ralphy.post-comments` v1, beside the #558 decision ledger. Each import appends one revision holding the merged set plus an import record; the same input replays (import key over the input, not over defaulted times). No migration.
- **Privacy:** author handles are hashed with the Workspace ID and never stored; the hash only counts distinct commenters.
- **Ids:** platform id when known (yt-dlp), else author hash + text, else text + occurrence index inside the payload (so two anonymous "part 2" comments stay distinct).
- **Labels:** agent labels > `--llm` labels > deterministic English rules (`cli/lib/analytics/comment-rules.ts`, rule ids recorded). `--llm` labels only what the rules left unlabeled, runs on `--yes` only, through `google/gemini-2.5-flash`. Reports recompute rule labels live, so rule fixes apply to stored comments.
- **yt-dlp:** single YouTube video URLs only, logged out; refused when the Unit's recorded YouTube Publication URL names another video, flagged "unverified" when none is recorded.
- **Proposals:** need `--min-n` (default 2) distinct commenters; smaller patterns are listed as signals. The `analytics report` comment section needs `--comments-min-n` (default 5) analyzed comments per unit and platform.
- **Not done:** no reply / pin / publish path (by design); no screenshot `--extract` vision pre-fill (the agent reads screenshots itself); rules are English-only.
