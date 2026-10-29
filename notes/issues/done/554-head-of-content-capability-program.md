# Head-of-content capability program (lead issue for #555-#571)

> **Status:** done — 2026-10-30 (all children landed; open follow-ups #578, #586, #587 and the paid matrices of #566 and #568)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** program / ordering

## Context

The owner will acceptance-test the agent as a head of content: content plans built from top performers, execution (editing raw footage and AI video), measurable variant testing, continuously improving shared and project knowledge bases, non-slop scripts and dialogue, edit quality, post-publish metric and comment analysis, format creation and upkeep, autonomy. The brain-dump was triaged with the owner in chat and refined with their feedback; this issue is the map and the execution order.

## What

Coordinate issues #555-#571. Each is self-contained; this file only fixes the order and the guiding principles.

## Guiding principles (from the owner)

- **Free before paid.** If something can be done locally (ffmpeg, OpenCV, local models, the agent's own tokens), do it locally before reaching for a provider.
- **Measure, then keep.** Every knowledge base and gate has to justify itself against real outcomes (#558, #569), not against intuition.
- **Vertical first.** Layout and catalog work targets 9:16 until told otherwise.
- **Storyboard approval applies to AI production only.** Edits of raw footage do not need the paid-generation stop.

## Execution order

1. Low-risk, unblocks others: #562 (harness self-eval), #557 (reference digest + contact-sheet eval), #571 (retention review from the course).
2. Measurement loop: #558 (performance-linked eval), then #569 (gate usefulness audit) which consumes it.
3. Corpus: #555 (research) then #556 (build).
4. Craft libraries: #563 (transitions + motion catalog) then #564 (vertical layouts) and #565 (typography), #566 / #567 (camera).
5. Local VFX: #559 (tracking), #560 (CorridorKey + matting).
6. Generation expertise: #568 (needs paid test approval).
7. #561 (duplicate risk + genuine uniqueness), #570 (storyboard gallery).

## Scope / acceptance

- Every child issue lands in `done/` or `deprecated/` with a reason.
- A closing note here maps each acceptance-test area to the issues that cover it, with evidence (a command, a doc, a render).

## Closing note (2026-10-30)

All child issues #555-#571 are in `done/` (#566 and #568 with their paid test matrices planned and waiting for owner approval). Follow-ups filed during the program: #572-#577, #582-#591 (done), #578 (code done; validation waits for about 84 days of daily refresh), #586 and #587 (Instagram and YouTube sources, waiting for owner credentials). Dropped by the owner: #579-#581.

| Acceptance-test area | Covered by | Evidence |
|---|---|---|
| Content plan from top performers | #555, #556, #576, #577, #588, #590 | `ralphy trends niche init|report`, `trends signals`, `trends series`, references with the adapt scorecard (docs/research/references-psychology-en-2026-10-30.md) |
| Execution: editing raw footage and AI video | #557, #559, #560, #563-#567, #570, #572, #591 | `ref digest`, `track`, `matte`, the motion catalog (67 items), storyboard gate, store-root render |
| Variants and measurable testing | #561, #558, #421 | `unit originality`, `batch plan-variants`, tournament gate, decision ledger |
| Updating shared and project bases | #556, #558, #574, #577, #590 | corpus refresh by attention tier, ledger, prediction ledger, models registry |
| Scripts and dialogue that are not slop | #571 | retention review method and `eval retention-check` |
| Edit quality | #563-#567, #569, #583 | catalog, safe-zone lint, calibrated full-video gate |
| Metrics and comments analysis, iteration proposals | #558, #582 | `analytics import|report`, `analytics comments` |
| Formats: creating and maintaining | #588, #563-#567 | series and visual format detection, catalog templates |
| Autonomy and proactivity | #562, #573, #575 | session report, self-explaining errors, next-step hints |
