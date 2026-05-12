---
name: postmortem
description: Distil the conversation we just had into a structured POSTMORTEM.md for the active ralphy project — captures the rules learned the hard way, the model picks that worked vs. didn't, the prompt patterns that landed, the bugs to file, and the real $ spend with sunk-cost breakdown. Use this skill whenever the user types `/postmortem`, asks for a "retro" / "lessons learned" / "что мы узнали" / "распиши уроки", or says things like "напиши best practices", "разбор полётов", "запиши что не работало" after a non-trivial multi-iteration ralphy session. Also use proactively at the end of any ralphy session that had ≥2 user-driven course corrections (re-rolls, model swaps, scope pivots) — the iteration history fades from chat memory, and a checked-in POSTMORTEM.md is the only durable record. Don't skip this even if the project shipped successfully — successful projects with painful iteration history are the most valuable to document.
---

# Postmortem skill — ralphy pipeline

## When to fire

Hard triggers (always do it):
- User types `/postmortem`
- "напиши постмортем", "разбор полётов", "распиши уроки", "что мы узнали"
- "write a postmortem", "retro this", "what did we learn"

Proactive triggers (offer to do it, don't auto-execute):
- Session has had ≥2 user corrections ("не нравится", "2/10", "переделай") AND a project ID was active
- User says "ну в общем это всё" / "проект готов" after a long iteration session
- After a `ralphy render` succeeds at the end of a multi-iteration session

## What I produce

A structured markdown file at `workspace/projects/<id>/POSTMORTEM.md` (or appended as an `Iteration N addendum` if the file already exists). The file follows a fixed template (see [`references/template.md`](references/template.md)) covering:

1. **TL;DR — N rules** distilled from the actual iteration cost in this session
2. **Pipeline I would run from scratch** — corrected phase order, target ≤1.5× iterations
3. **Model picks** — which OpenRouter / ElevenLabs model won which task in *this* session
4. **Prompt patterns that worked** — verbatim prompts that produced winners
5. **Pitfalls hit** — table of {pitfall, $ cost, prevention rule}
6. **Open issues to file** — CLI bugs and playbook gaps surfaced in this session
7. **Composition tricks** — Remotion-side patterns (startFrom, music swap, etc.)
8. **$ accounting** — real spend by phase, sunk costs, vs disciplined-minimum estimate
9. **Final delivery files** — what got shipped, paths

The point of the doc is to make the *next* run of a similar project cost 30-50% less by encoding the painful learnings explicitly. Aim for a doc the user (or a fresh-eyes teammate) will actually re-read before the next project.

## Source material to read (in order)

Don't write from memory — pull from the actual session artifacts:

1. **Conversation context** — scroll back through the recent message history in this chat. Look specifically for:
   - User-feedback moments ("не нравится", "плохо", "2/10", "переделай", "слишком статично", "не похоже")
   - Model swaps you made (started with X → switched to Y after Z failed)
   - Failed CLI runs (exit code 1, content moderation refusals, "no job.id", "File is not in a valid base64 format")
   - Successful pivots (split scene into micro-shots, stripped C2PA, switched vendor)
   - Cost spikes (multiple retries on same slot)

2. **`workspace/projects/<id>/logs/generations.jsonl`** — the structured truth of every model call.
   Run: `jq -c 'select(.kind != null) | {kind, slot, ep: .endpoint, status, cost: (.cost_usd // .costUsd // 0), err: .error}' workspace/projects/<id>/logs/generations.jsonl`
   - Sum cost by `kind` (image / video / music / voiceover / captions) → total $ per phase
   - Count `status == "error"` entries → sunk-cost retries
   - Group by `endpoint` → which model won which task (success count + total $)

3. **`workspace/projects/<id>/STORYBOARD.md`** if it exists — the locked plan vs what shipped.

4. **`src/videos/<id>/scenes.ts`** — final composition (scene count, durations, startFrom values, MUSIC_FILE pick).

5. **`workspace/projects/<id>/asset-manifest.json` or `assets/` dir listing** — what actually ended up in the render.

6. **`git log --oneline -20`** — commits made during the session reveal phase boundaries.

## The output template

Read [`references/template.md`](references/template.md) for the full template with section-by-section guidance on how to fill each one. Key principle: **every rule, pitfall, and model pick must trace back to a real moment in this session**. Don't pad with generic best-practices the user didn't actually learn here — those belong in `docs/playbooks/`, not in the project's POSTMORTEM.

## Path logic

```
1. Detect active ralphy project:
   - Last `--project <id>` flag in recent bash calls, OR
   - cwd is workspace/projects/<id>/, OR
   - User explicitly named a project in the conversation

2. Target path:
   - workspace/projects/<id>/POSTMORTEM.md

3. If file exists:
   - Read existing file to find highest "Iteration N addendum" number
   - Append a new "Iteration N+1 addendum" section at the end (BEFORE the trailing "Written..." line)
   - Update the $-accounting section at the bottom to include the new spend

4. If file doesn't exist:
   - Write fresh from template
   - Date the bottom with today's date (`date +%Y-%m-%d`)

5. If no ralphy project detectable:
   - Ask the user where to save, OR
   - Print to chat as markdown and let them save manually
```

## Quality bar

The doc is good if a person who didn't sit through the session can read it in 5 minutes and:
- Understand the project's purpose and final result
- Know which 3-5 things would have saved the most time if known upfront
- Know which models to default to for similar work
- Have copy-pasteable prompt patterns for the most common scenes

The doc is bad if it reads like a generic best-practices listicle. Every rule should have evidence — "I burned $X on this specific failure" or "switched from model A to B after seeing Y" — that ties it to the actual session.

## Tone

Match the user's working register: this user works in Russian + English bilingually, uses terse direct feedback, doesn't want fluff. Write the doc in English (it's a technical record), but Russian section titles or quoted user feedback are fine when they appear verbatim in the chat.

Length: 300-600 lines is the sweet spot. The Flipper POSTMORTEM came in at ~500 — that's a good calibration point. Don't pad.

## Addendum-mode specifics

When appending an `Iteration N addendum`, the new section should:
- Be numbered relative to the existing rule count (if rules 1-10 exist, addendum rules start at 11)
- Have a one-line summary at the top: "Iteration N — <what changed>. Cost $X. Key insight: <Y>"
- Focus on what was *new* — don't restate earlier rules
- Update the bottom $-accounting block with cumulative totals + a line for this iteration's spend
- Re-list any *open issues* still unresolved after this iteration

## Example calls to mental-prototype before writing

Before opening Write tool, mentally walk through:
- "What 3 moments in this session cost the user the most time / money?"
- "What surprised me as the agent — what worked better/worse than I'd predict?"
- "If a fresh agent ran the same brief tomorrow, what 5 sentences would save it 50% of the iteration?"

If you can't answer all three with specifics from this session, you don't have enough material yet — read more of the conversation / gen-log before writing.

## What NOT to do

- Don't invent costs you didn't see in the gen-log. If you can't compute $ exactly, write "~$X" and note the basis.
- Don't write rules you can't tie to a specific moment ("always use refs" — too generic; "always pull canonical product PNGs in step 1 because I generated wrong-color shots before user dropped reference screenshots" — useful).
- Don't quote the AGENTS.md / playbooks back at the user — they wrote those. Postmortem captures the layer *between* the playbook and the project — what the playbook didn't yet cover.
- Don't write more than one addendum per session. If the session has already produced an addendum and the user asks for another one immediately, merge the new insights into the existing addendum instead of stacking.
- Don't run `bunx tsc` / heavy tooling. This is a synthesis task, not a code-fix task.

## Final step

After writing, give the user a 5-bullet summary in chat:
1. **Where it's saved**: full path
2. **N rules captured**: brief one-line list of headline rules
3. **$ accounted**: total spend + avoidable-vs-genuine breakdown
4. **Open issues filed**: count + one-line list
5. **Next-time win**: the single biggest "if I knew this at the start I'd have saved $X" insight

Ask if they want any section expanded or any rule re-phrased. Don't auto-iterate — let them drive.
