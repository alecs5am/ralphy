# Retention and structure review grounded in the Content Autopilot course

> **Status:** done — 2026-10-28 (eval retention-check facts verb + scenarist retention-review reference; rubric reconciled; trial in docs/research/retention-review-trial.md)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** eval / scenario craft

## Context

The owner wants a retention model (hook, attention resets, open loops, looping, CTA placement) grounded in the Content Autopilot course rather than generic rules. Material on the owner's machine, outside this repo: `~/Desktop/Content-Autopilot-Archive` (88 lessons, about 118 hours, timestamped transcripts in `01_transcripts/`, distilled notes in `02_distilled/`), and a Codex skill `~/.codex/skills/content-autopilot-review` (review method, criteria, guideline inventory with source anchors). That skill says fixed duration, cuts-per-second, obligatory captions and a CTA on every post are not universal rules in the course, so a rigid linter would contradict the source.

## What

- Port the review method into Ralphy as a skill reference used in two places: a pre-render scenario review (hook earns attention, one clear idea, development, payoff, next step fitting the content job) and a post-render editorial review alongside the evaluator.
- A light deterministic pre-check on `scenario.json` for facts only (hook length, gaps with no new information, CTA position), reported as context for the review, never as a hard fail.
- Rules written in our own words, each with a pointer to the local source anchor. Course transcripts and quotes are not committed to the repo (paid course material).

## Scope / acceptance

- `.agents/skills/scenarist/references/retention-review.md` and an evaluator hook that runs it.
- The pre-check verb with tests; the review reads the archive path from config and degrades gracefully when it is absent.
- A trial on 5 past projects with the review output saved, compared with the Codex skill's verdicts on the same inputs.

## Notes

- Feeds caption pacing defaults (#565). Cross-link `docs/virality-rubric.md`, which should be reconciled with the course where they disagree.
