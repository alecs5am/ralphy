# `01-chat-history.template.md` — chronological session replay

The faithful record of what the user asked, what the agent did, and what came out the other end. Not a summary — a **replay**.

## Why this doc exists

- The chat scrollback dies with the session. This file is the only durable copy.
- The user wants to verify "did the agent actually do what I asked, in the order I asked it" — without re-reading 200 messages.
- 02-lessons.md and 05-workflow-fixes.md cite **specific turns** from this doc as evidence. If 01 is missing or fabricated, those docs are unfalsifiable.

## Template

```markdown
# Chat history — <project-id>

Chronological replay of the <YYYY-MM-DD> session. One row per user turn (or per coherent agent phase between turns). No editorializing in this doc — interpretation lives in `02-lessons.md`.

## Session metadata

- **Start:** <ISO timestamp from first user message, if recoverable>
- **End:** <ISO timestamp from last user message>
- **Project ID:** `<project-id>`
- **Active playbooks consulted:** <list from "Read playbook X" steps>
- **Models used in session:** <comma-separated endpoint slugs from generations.jsonl>

## Turns

### Turn 1 — <YYYY-MM-DD HH:MM, if known> — <one-line theme>

**User:**
> <verbatim user message, or close paraphrase if too long; quote the operative ask>

**Agent steps:**
1. <step — what was read, what was decided>
2. <step — what CLI verb was run, with the command>
3. <step — what was the outcome (success / failure / partial)>

**Artifacts touched:**
- `workspace/projects/<id>/<path>` (created / appended / new version `vN`)
- ...

**Outcome:** <one line: success / blocked / pivoted to turn N+1>

---

### Turn 2 — <one-line theme>

...

---

<repeat for every turn>

## Append-only check (end of session)

A self-audit: list every artifact under `workspace/projects/<id>/` and confirm it was either created fresh or versioned (`.vN.ext`), never overwritten or deleted without explicit user consent.

| Path | Created at turn | Status | Notes |
|---|---|---|---|
| `assets/images/scene-01.png` | 4 | original, kept | — |
| `assets/images/scene-01.v2.png` | 7 | regen, append | user asked "не нравится 01" |
| `assets/videos/scene-03.mp4` | 5 | DELETED | ⚠️ violation — agent overwrote on regen; flag in 03-cli-issues.md |

If any row shows DELETED / OVERWRITTEN without a user-typed delete command in the matching turn — that's an append-only violation. Cross-reference into `05-workflow-fixes.md`.
```

---

## Filling guidance

- **One row per user turn is the rule of thumb.** If the user fired off 3 commands in one message, that's still one turn — list the agent's response as 3 steps under it.
- **Quote the user verbatim when the wording mattered** ("плохо, переделай", "слишком статично" — these become evidence in 02-lessons.md). Paraphrasing is fine for "ок, погнали" / housekeeping turns.
- **Cite exact CLI commands** in agent steps. "ran `ralphy generate image --project foo --slot scene-01 --model openai/gpt-5.4-image-2`" — not "generated an image".
- **Don't editorialize** ("the user was being unreasonable" — never; "the agent made a mistake" — only if it factually did, e.g. ran the wrong model). Interpretation lives in 02-lessons.md and 05-workflow-fixes.md.
- **Append-only check** is critical — it's the only place a violation gets logged. Make this table even if everything is fine ("clean session, no violations").

## How to recover timestamps

If chat doesn't carry visible timestamps, infer turn order from:
1. `workspace/projects/<id>/logs/user-prompts.jsonl` (has `ts` per turn)
2. `workspace/projects/<id>/logs/generations.jsonl` (has `ts` per call, brackets turn boundaries)
3. `git log --oneline -20` (commit times = phase boundaries)

If none of these is available, drop the timestamp and just number the turns.

## Iteration N addendum

When the project gets another session and you run `/postmortem` again:

```markdown
---

## Iteration N — <YYYY-MM-DD> — <one-line theme of this iteration>

### Turn N.1 — <theme>

<same row format as above, but turn numbers prefixed with iteration: "N.1", "N.2", ...>

...

### Append-only check (end of iteration N)

<same table format as above, scoped to artifacts touched in this iteration>
```

Never re-flow earlier iterations' turns. Each iteration is its own appended block.
