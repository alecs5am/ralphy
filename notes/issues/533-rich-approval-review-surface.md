# Rich approval review surface (one-action human gate)

> **Status:** partial (2026-07-08) — foundation landed (`cli/lib/review-card.ts`:
> `assembleReviewCard`/`assembleReviewTick` read-model — media proof + caption/
> title + targets + #525 sampled time + #427/#469 scorecard + cost, all
> read-only — and `applyReviewDecision` mapping approve→`recordRunApproval`,
> reject→append-only rejection record (media untouched, #14),
> request-change→`buildRepairPlan` enqueue, each emitting the #505/#532
> calibration sample; surfaced via `ralphy farm review <run>`). STILL OPEN — the
> remainder is the rendering surface: the #492 app-API endpoint + the #506
> dashboard card that renders this output, the mobile-legible layout, and the
> #518 notification deep-link target. Re-open the flat backlog until #492 lands.
> **Filed:** 2026-07-07
> **Folder:** issues
> **Severity:** high
> **Category:** studio / operations / trust-ladder

## Context

The L0/L1 human gate (#505 approval nodes, #482 approval inbox) parks runs for
approval, but the review surface is thin — the operator needs to actually SEE
what they are approving to make a fast, sound call. Weak review means either
rubber-stamping (defeats L0) or slow review (approval latency caps farm
throughput). The trust ladder's promotion signal (#505) is only as honest as
the human decisions feeding it, so those decisions must be well-informed.

## What

A rich review card in the dashboard (#506) for every parked publish: the
actual rendered video (playable) or article body (rendered markdown +
frontmatter) + thumbnail + final caption/title + all target platforms + the
sampled schedule time (#525) + the eval scorecard that cleared the gate + the
cost spent. Three one-click actions: approve (releases the publish),
reject (kills the unit, logs reason), request-change (routes into the repair
loop #519/#511 with the operator's note). Every decision is recorded as a
labeled calibration sample (choice + eval verdict) for #505/#532.

## Why it matters

This is the single surface that makes L0 LIVABLE (fast, confident review) and
makes the climb to L1/L2 TRUSTWORTHY (the agreement metric is built on
informed decisions, not blind clicks). Approval latency here is the farm's
throughput ceiling whenever a human is the gate.

## Scope / acceptance

- Review card via the app API (#492): media proof (video/image/article),
  metadata (targets, caption/title, sampled time, cost), and the gate
  scorecard — read from existing artifacts + journal, no new write path for
  media (Studio media-safety rule holds).
- Actions: approve / reject(reason) / request-change(note) — each maps to an
  existing state transition (release park, kill unit, enqueue repair); no new
  media mutation.
- Batch review: approve/reject a whole tick's units with per-item override,
  for high-volume days (composes with `batch review`).
- Every decision appends a calibration sample consumed by #505 (agreement) and
  #532 (selection); reject/request-change reasons use the #409 repair
  vocabulary where applicable.
- Mobile-legible layout (the operator approves from a phone) — the deep-link
  from the #518 notification lands here.
- Tests: card assembly from fixture units (video + article), each action's
  state transition, calibration-sample emission, batch path, empty/blocked
  states.

## Notes

- Sequence after #506, #505; feeds #532.
- Keep it read-mostly: the only writes are the decision + its calibration
  sample + the repair enqueue.
