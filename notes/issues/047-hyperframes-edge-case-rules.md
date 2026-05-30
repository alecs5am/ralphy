# HyperFrames edge-case rules need to be hard rules, not lint warnings

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** render-engine

## Resolution

Implemented `cli/lib/render/hyperframes-lint.ts` — author-time lint that runs
inside `ralphy render <id>` **before** the upstream `bunx hyperframes render`
shellout. The lint catches both edge cases:

- `media_missing_id` / `media_missing_data_start` / `media_attrs_on_wrapper` —
  blocking errors. Render exits non-zero with a pointer back to this issue.
- `many_short_same_track_video` — warning with concat-fix suggestion. Fires
  when `> 4` `<video>` elements share a `data-track-index` AND each has
  `data-duration < 3` seconds. Override: `data-allow-short-stack="true"` on
  any of the affected `<video>` tags.

Documentation:

- `.agents/skills/hyperframes/SKILL.md` — new "HARD RULES for timed media"
  section + cross-reference from the "Never do" list.
- `docs/playbooks/hyperframes.md` — rows #8 and #9 in the "Hard kills" table.

Tests: `tests/unit/hyperframes-lint.test.ts` (13 cases) and
`tests/integration/render-hyperframes-lint.test.ts` (4 cases — error blocks,
warning passes through to stderr, override suppresses warning).

Upstream `hyperframes` lint was not modified — the rules live in our pre-
render gate so the contract is enforced without forking the upstream package.

## Context

Two recurring HyperFrames defects only surface at render time, after silent freeze:
1. Many short same-track `<video>` clips back-to-back mis-render — only the first plays.
2. `<video>` element needs `id` + `data-start` on the element itself, not on a wrapper div. Lint flags `media_missing_id` / `media_missing_data_start` only at render.

## What

- `ralphy-vs-higgsfield-001`: lessons rule 6 + workflow-fixes #2 — 6×2s clips on `data-track-index=0` rendered only the first; others frozen/blank.
- `ralphy-vs-higgsfield-001`: workflow-fixes #3 — common `<video>` wrapper pattern from `ugc-ad-test` silently freezes; rule discovered only via render-time lint output.

## Why it matters

Silent-render-time freeze is the worst failure class — no error, no log row, just a wrong-looking mp4 that the QA gate (if it ran) might not catch.

## Suggested fix

- Fix in HyperFrames runtime: handle many-short-same-track video correctly. If unfixable, document the rule prominently.
- Promote lint checks to author-time:
  - `media_missing_id` / `media_missing_data_start` → block lint pass.
  - "many short same-track video clips" pattern → warning with concat-fix suggestion.
- Document as HARD rules in `.agents/skills/hyperframes/SKILL.md`:
  - "Timed media carries `id` + `data-start` on the element itself, never on a wrapper."
  - "For a montage of N short clips on one track, concat them into a single video; runtime cannot reliably switch between many short same-track video clips during capture."

## Sources

- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/02-lessons.md` — rule 6
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/05-workflow-fixes.md` — #2, #3
