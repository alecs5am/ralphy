# Art-director self-review is a soft checklist, not a hard gate

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** playbook

## Context

`step-6-build.md` and `docs/playbooks/art-director.md` phrase the pre-render review as a checklist with verbs like "should snapshot key beats". In practice agents render first, snapshot after, and discover obvious anatomy / location / pivot bugs at v3 or v4 — when the cost is sunk.

## What

- `noski-people-001`: missed boy's torso through the back-cushion until user caught it; rule "snapshot before render" not enforced.
- `odindoma-fb-ad-001`: rendered v1-v5 without snapshotting; iteration time halved once the gate fired (workflow-fixes Fix #1, Finding A).
- `arena-rocker-001`: chat-history rule documents "snapshot before render" — but it's a chat-history rule, not a hard step in the playbook.

## Why it matters

Snapshot-before-render is the cheapest QA gate in the pipeline (~$0, ~10s). Skipping it produces $0.50-$3 of regen per missed bug, on top of user-feedback latency.

## Suggested fix

- Rewrite `docs/playbooks/art-director.md` self-review section and `step-6-build.md` as HARD gates:
  - "MUST snapshot every beat in STORYBOARD before render."
  - "MUST run the anatomy / location / pivot checklist (see sub-doc)."
  - Concrete checklist sub-doc with worked examples.
- Add `--require-snapshot-review` flag to `ralphy hyperframes render` once that namespace exists (see issue 028) — refuses to render if `compositions/snapshots/` is older than `index.html`.
- Cross-link from `editor.md` "what I read on start".

## Sources

- `workspace/projects/noski-people-001/postmortem/05-workflow-fixes.md` — #3 + Finding B
- `workspace/projects/odindoma-fb-ad-001/postmortem/05-workflow-fixes.md` — Fix #1, Finding A
- `workspace/projects/arena-rocker-001/postmortem/05-workflow-fixes.md` — Finding A
