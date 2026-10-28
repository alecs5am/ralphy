# Own-post comment analysis and iteration proposals

> **Status:** todo
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
