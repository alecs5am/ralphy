---
name: postmortem
description: Distil the conversation we just had into a structured 6-file postmortem set under `workspace/projects/<id>/postmortem/` for the active ralphy project. Splits the record into chronological chat history, lessons learned, ralphy-CLI bug list (with the raw `bunx` / `ffmpeg` / `curl` workarounds the agent had to reach for), model-and-cost rollup, and workflow / playbook fixes. Use this skill whenever the user types `/postmortem`, asks for a "retro" / "lessons learned" / "что мы узнали" / "распиши уроки", or says things like "напиши best practices", "разбор полётов", "запиши что не работало" after a non-trivial multi-iteration ralphy session. Also use proactively at the end of any ralphy session that had ≥2 user-driven course corrections (re-rolls, model swaps, scope pivots) or ≥1 CLI gap the agent worked around with raw tooling — the iteration history fades from chat memory, and a checked-in `postmortem/` set is the only durable record. Don't skip this even if the project shipped successfully — successful projects with painful iteration history are the most valuable to document.
---

# Postmortem skill — ralphy pipeline

## Why multi-doc

A single `POSTMORTEM.md` mixes four very different audiences:

- **Future-me on the next similar project** wants *lessons + model picks + prompt patterns* (02-lessons.md, 04-models-and-cost.md).
- **The user reviewing what we actually did** wants a *chronological replay* of their asks and the agent's steps (01-chat-history.md).
- **A CLI maintainer** wants a clean list of *ralphy verbs that failed or didn't exist, plus the raw workaround used* (03-cli-issues.md). This is the highest-leverage doc — it's what turns the session into a CLI roadmap.
- **The playbook author** wants meta-level *where did the workflow break, what doc was wrong / missing* (05-workflow-fixes.md).

When you stuff all four into one file, the CLI-issues list gets buried in a 500-line rules document and never makes it into a PR. The split is so each doc can be skimmed by the right reader.

## When to fire

Hard triggers (always do it):
- User types `/postmortem`
- "напиши постмортем", "разбор полётов", "распиши уроки", "что мы узнали"
- "write a postmortem", "retro this", "what did we learn"

Proactive triggers (offer to do it, don't auto-execute):
- Session has had ≥2 user corrections ("не нравится", "2/10", "переделай") AND a project ID was active
- ≥1 instance of the agent reaching past ralphy (raw `bunx tsx` against a TS file, raw `ffmpeg`, raw `curl` against a provider) — that's a CLI gap and the session must document it before it's lost
- User says "ну в общем это всё" / "проект готов" after a long iteration session
- After a `ralphy render` succeeds at the end of a multi-iteration session

## What I produce

A directory at `workspace/projects/<id>/postmortem/` with **6 files**:

```
workspace/projects/<id>/postmortem/
├── 00-INDEX.md            map + 3-bullet TL;DR linking to the 5 substantive docs
├── 01-chat-history.md     chronological: user prompt → agent steps → outcome
├── 02-lessons.md          rules learned the hard way (TL;DR, pipeline-from-scratch, pitfalls, prompt patterns)
├── 03-cli-issues.md       ralphy verbs that failed or didn't exist + raw workaround used + suggested fix
├── 04-models-and-cost.md  $ rollup by phase + which model won which task + discovered model breakage
└── 05-workflow-fixes.md   meta: where the playbook misled us, what to add to AGENTS.md / docs/playbooks/
```

Each file has its own template under [`references/`](references/). Read the template for the doc you're about to write — don't paraphrase the structure from memory.

| File | Template |
|---|---|
| 00-INDEX.md | [`references/00-INDEX.template.md`](references/00-INDEX.template.md) |
| 01-chat-history.md | [`references/01-chat-history.template.md`](references/01-chat-history.template.md) |
| 02-lessons.md | [`references/02-lessons.template.md`](references/02-lessons.template.md) |
| 03-cli-issues.md | [`references/03-cli-issues.template.md`](references/03-cli-issues.template.md) |
| 04-models-and-cost.md | [`references/04-models-and-cost.template.md`](references/04-models-and-cost.template.md) |
| 05-workflow-fixes.md | [`references/05-workflow-fixes.template.md`](references/05-workflow-fixes.template.md) |

## Source material to read (in order)

Don't write from memory — pull from the actual session artifacts. Different docs need different sources:

1. **Conversation context** (drives 01-chat-history.md, 02-lessons.md, 05-workflow-fixes.md) — scroll back through the recent message history in this chat. Capture:
   - Every user turn that drove a phase change (scenario lock, asset gen, render, regen, postmortem). One row per user turn in 01.
   - User-feedback moments ("не нравится", "плохо", "2/10", "переделай", "слишком статично", "не похоже") and what the agent did in response.
   - Model swaps you made (started with X → switched to Y after Z failed).
   - **Every time the agent reached past ralphy** — raw `bunx tsx`, raw `ffmpeg`, raw `curl`, raw `yt-dlp`, hand-written TS in `workspace/projects/<id>/scripts/`. Each instance is a row in 03-cli-issues.md.
   - Failed CLI runs (exit code 1, content moderation refusals, "no job.id", "File is not in a valid base64 format"). Each is a row in 03.
   - Successful pivots (split scene into micro-shots, stripped C2PA, switched vendor).
   - Cost spikes (multiple retries on same slot).
   - **Append-only violations** — any moment the agent deleted, overwrote, or rewrote an artifact under `workspace/projects/<id>/` instead of versioning. Each is a row in 05.

2. **`workspace/projects/<id>/logs/generations.jsonl`** (drives 04-models-and-cost.md) — the structured truth of every model call.
   Run: `jq -c 'select(.kind != null) | {kind, slot, ep: .endpoint, status, cost: (.cost_usd // .costUsd // 0), err: .error}' workspace/projects/<id>/logs/generations.jsonl`
   - Sum cost by `kind` (image / video / music / voiceover / captions) → total $ per phase
   - Count `status == "error"` entries → sunk-cost retries
   - Group by `endpoint` → which model won which task (success count + total $)

3. **`workspace/projects/<id>/logs/user-prompts.jsonl`** (drives 01-chat-history.md) — chronological user prompts as the CLI saw them. Cross-reference with the in-chat turns.

4. **`workspace/projects/<id>/STORYBOARD.md`** if it exists — the locked plan vs what shipped (drives 02-lessons.md).

5. **`src/videos/<id>/scenes.ts`** — final composition (scene count, durations, startFrom values, MUSIC_FILE pick) (drives 02-lessons.md "Composition tricks").

6. **`workspace/projects/<id>/asset-manifest.json` or `assets/` dir listing** — what actually ended up in the render. **Pay attention to `.v2.`, `.v3.` files** — they are evidence of regen iterations and feed the cost-vs-minimum estimate.

7. **`git log --oneline -20`** — commits made during the session reveal phase boundaries.

## Path logic

```
1. Detect active ralphy project:
   - Last `--project <id>` flag in recent bash calls, OR
   - cwd is workspace/projects/<id>/, OR
   - User explicitly named a project in the conversation

2. Target directory:
   - workspace/projects/<id>/postmortem/

3. If the dir exists already (previous session ran the skill):
   - For each of the 6 files, APPEND an "Iteration N addendum" section (numbered).
   - Never delete or rewrite existing addendum sections (append-only invariant).
   - Update 00-INDEX.md to reflect the new iteration count in its TL;DR.

4. If the dir doesn't exist:
   - Create it.
   - Write all 6 files from their templates.
   - Date the bottom of each with today's date.

5. Legacy `POSTMORTEM.md` (single-file) at the project root:
   - Leave it untouched. It's the v1 record; the new postmortem/ dir is the v2 record.
   - In 00-INDEX.md, link to it under "Legacy single-file postmortem" so future-me knows where to find the old write-up.

6. If no ralphy project detectable:
   - Ask the user where to save (offer postmortem/ at repo root as a fallback for non-project work), OR
   - Print all 6 docs to chat as markdown blocks and let them save manually.
```

## Quality bar (per doc)

The set is good if a reader hitting it cold can, in 10 minutes:
- **01** — replay the session turn by turn without watching the chat log.
- **02** — name the 3-5 rules that would have saved the most time.
- **03** — file a GitHub issue for each CLI gap, copy-pasting the row verbatim.
- **04** — pick default models for the next similar project, knowing what $ each implies.
- **05** — open a PR against `docs/playbooks/` or `AGENTS.md` fixing the doc that misled us.

The set is bad if any single doc reads like a generic listicle. Every row in every doc must trace to a specific moment in this session.

## Tone

Match the user's working register: this user works in Russian + English bilingually, uses terse direct feedback, doesn't want fluff. Write the docs in English (technical record), but Russian section titles or quoted user feedback are fine when they appear verbatim in the chat.

Per-file length calibration (sweet spot):
- 00-INDEX.md: 30-60 lines
- 01-chat-history.md: depends on session size — ~1 row per user turn, no upper cap
- 02-lessons.md: 200-400 lines
- 03-cli-issues.md: 100-250 lines (every row is actionable)
- 04-models-and-cost.md: 80-150 lines
- 05-workflow-fixes.md: 100-200 lines

## Append-only invariant (applies to this skill too)

The postmortem skill MUST follow the same append-only rule as the rest of ralphy:

- **Never overwrite an existing postmortem file.** Always append a new `## Iteration N addendum` section at the end of each file.
- **Never delete an old `POSTMORTEM.md` single-file** in projects that pre-date the multi-doc layout. Link to it from 00-INDEX.md instead.
- **Never re-flow / reorganize an earlier iteration's content** — fixing a stale claim is one thing, but the historical record stays.
- Even if the user says "перепиши постмортем" — interpret that as "add a fresh addendum at the top of 00-INDEX.md and the relevant docs" unless they explicitly say "удали старое и напиши заново".

## Example calls to mental-prototype before writing

Before opening Write tool, mentally walk through each doc:

- **01-chat-history.md** — "Can I list the user's turns in order? Did I miss a regen request?"
- **02-lessons.md** — "What 3 moments in this session cost the user the most time / money?"
- **03-cli-issues.md** — "How many times did I type `bunx tsx`, `ffmpeg`, or `curl` against a provider? Each one is a row."
- **04-models-and-cost.md** — "Did I run `jq` over generations.jsonl, or am I guessing at $?"
- **05-workflow-fixes.md** — "What playbook section, if it had said X, would have prevented the worst iteration?"

If you can't answer all five with specifics from this session, you don't have enough material yet — read more of the conversation / gen-log before writing.

## What NOT to do

- Don't invent costs you didn't see in the gen-log. If you can't compute $ exactly, write "~$X" and note the basis.
- Don't write rules you can't tie to a specific moment ("always use refs" — too generic; "always pull canonical product PNGs in step 1 because I generated wrong-color shots before user dropped reference screenshots" — useful).
- Don't quote AGENTS.md / playbooks back at the user — they wrote those. Postmortem captures the layer *between* the playbook and the project — what the playbook didn't yet cover.
- Don't run `bunx tsc` / heavy tooling. This is a synthesis task, not a code-fix task.
- Don't `rm` or `mv` anything in `workspace/projects/<id>/` — see append-only invariant above and the project-wide invariant in AGENTS.md.
- Don't squash 03-cli-issues.md down to "summary" — every gap row is the seed of a GitHub issue. Keep them granular even if the doc gets long.

## Final step

After writing all 6 files, give the user this summary in chat:

1. **Where it's saved**: `workspace/projects/<id>/postmortem/` (list the 6 filenames).
2. **N rules captured**: brief one-line list of the headline rules from 02-lessons.md.
3. **$ accounted**: total spend + avoidable-vs-genuine breakdown (from 04).
4. **CLI gaps to file**: count + one-line list of suggested new ralphy verbs (from 03).
5. **Playbook fixes proposed**: count + one-line list of which playbook docs need editing (from 05).
6. **Next-time win**: the single biggest "if I knew this at the start I'd have saved $X" insight.

Ask if they want any section expanded or any rule re-phrased. Don't auto-iterate — let them drive.
