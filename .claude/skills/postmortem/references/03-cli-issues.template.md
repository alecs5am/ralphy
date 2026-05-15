# `03-cli-issues.template.md` — ralphy CLI gaps & workarounds

The highest-leverage doc in the set. Every row is the seed of a GitHub issue against `ugc-cli` or a fix to a CLI command.

## Why this doc matters

The ralphy pipeline only works if the agent stays inside `ralphy <verb>`. Every time the agent reaches past it — raw `bunx tsx`, raw `ffmpeg`, raw `curl`, hand-written TS in `workspace/projects/<id>/scripts/` — that's a CLI gap. If the gap is not logged, it gets re-hit by the next agent on the next project, and the workaround drift grows. This file is the antidote.

## Template

```markdown
# ralphy CLI issues & workarounds — <project-id> session <YYYY-MM-DD>

What broke in `ralphy`, what didn't exist yet, and what raw tool the agent reached for instead. Every row is a candidate GitHub issue. **Keep this file granular** — don't summarize 5 gaps into 1 row.

## Summary

- **Total gaps logged:** <N>
- **Categorized:** <K> missing verbs · <L> existing verbs that crashed · <M> playbook gaps that sent the agent the wrong way
- **Hours spent on workarounds (est):** ~<H>h
- **Append-only violations caused by missing verbs:** <Y> (e.g. agent rm'd a file because no `ralphy ... --version` existed)

## Issue rows

For each gap, fill this exact structure:

### #1 — <one-line headline>

- **Category:** missing-verb | broken-verb | wrong-output | playbook-gap | append-only-risk
- **Triggered at:** [01-chat-history.md#turn-N]
- **What the agent wanted:** <1 sentence — what task did the agent need ralphy to do>
- **ralphy verb tried (if any):** `ralphy <command> ...` → <exact error or wrong output>
- **Workaround used:** ``` <exact raw command(s) the agent ran instead> ```
- **Why the workaround was wrong:** <which invariant did it violate — gen-log skipped? cost not tracked? manifest not updated? append-only broken?>
- **Suggested fix:** <new verb / flag to add, or existing verb to repair>
  - Touch file(s): `cli/commands/<x>.ts`, `cli/lib/<y>.ts`
  - Acceptance: <what command would have just worked>
- **Workaround time / cost:** ~<N> min, ~$<X> (if applicable)

### #2 — <next gap>

...

## Bug bucket — verbs that crashed mid-run

Separate table for `ralphy <verb>` calls that exited non-zero. Each row links to its issue above if also categorized there.

| Verb | Exit code | Error message (verbatim) | Turn | Issue # |
|---|---|---|---|---|
| `ralphy generate video ...` | 1 | `Error: no job.id in response` | 9 | #3 |
| `ralphy render foo-001` | 1 | `Cannot find module '/.../scenes.ts'` | 14 | #5 |
| ... | ... | ... | ... | ... |

## Workaround inventory — raw tools reached for

Quick scan: every line where the agent typed `bunx tsx`, `ffmpeg`, `curl`, `yt-dlp`, `python -c`, or hand-edited TS under `workspace/projects/<id>/scripts/`. Each line should also have a matching issue row above. If it doesn't, add the row.

| Raw tool | Turn | What it was doing | Should have been |
|---|---|---|---|
| `ffmpeg -i ... -vf scale=...` | 12 | thumbnail extraction for QA | `ralphy project thumbnail <id>` (doesn't exist yet — file as issue) |
| `bunx tsx scripts/check.ts` | 6 | one-off inspection of gen-log | `ralphy project log <id> --type generations --jq '...'` |
| `curl -X POST https://api.openrouter.ai/...` | 17 | re-tried a generation with custom params | `ralphy generate ... --raw-params <json>` (doesn't exist) |
| ... | ... | ... | ... |

## Suggested ralphy roadmap (extracted from issue rows)

Top-N CLI improvements, ranked by how often they'd be hit again:

1. **<verb name>**: <one-line description>. Issues: #<a>, #<b>. (frequency: high — hit ~<n>× in this session alone)
2. **<verb name>**: ... Issues: #<c>. (frequency: medium)
3. ...

---

*Written <YYYY-MM-DD>. To file these against the repo, run `gh issue create` per row above using the issue body verbatim.*
```

---

## Filling guidance

- **Don't merge gaps.** Two separate `bunx tsx` runs for two different reasons → two rows. Even if the suggested fix is the same verb, the trigger context is different and matters for the issue body.
- **Be specific about the workaround.** "I used ffmpeg" is useless. The full command, with paths and flags, is what makes the issue actionable.
- **Append-only-risk category is special.** Mark every workaround that deleted or overwrote a file as `append-only-risk`. Cross-reference into `01-chat-history.md`'s append-only audit and into `05-workflow-fixes.md`.
- **Workaround inventory table is the safety net.** Even if a workaround "felt fine", list it. Three "felt fine" workarounds is the signal that a verb is missing.

## What goes here vs. 05-workflow-fixes.md

- **03 = ralphy CLI source code & verbs.** "Add `ralphy project clean <id>` so the agent stops `rm`-ing files."
- **05 = playbook documentation.** "The art-director playbook said 'overwrite', should have said `.vN.ext`."

The same incident often produces a row in both — that's fine. Cross-link.

## Iteration N addendum

```markdown
---

## Iteration N — <YYYY-MM-DD>

### #<N.k> — <new gap headline>

<same issue structure as above, numbered with iteration prefix>

...
```

Existing rows are never edited (append-only). If a previous gap got fixed in the meantime, add a "Status update — iteration N: fixed in ralphy v<X>" note as a new section, not as an edit on the old row.
