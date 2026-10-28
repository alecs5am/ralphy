# Storyboard review gallery before paid AI generation

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** feature / desktop + playbook

## Context

For AI production, the owner wants to see the storyboard in a convenient gallery and approve it before expensive generations start. Preferred: inside the desktop app (or the agent's own tooling); fallback: a templated HTML page. Edits of raw footage do not need this step.

## What

- A storyboard gallery in the desktop app: per scene the frame (cheap still or sketch), VO line, duration, camera note, chosen model and estimated cost; approve, reject or comment per scene; approve-all.
- A fallback `ralphy storyboard html <project>` that writes a self-contained HTML gallery from the same data.
- Playbook rule in `docs/playbooks/agent-production-contract.md`: in AI production, paid video and image generation for scenes waits for storyboard approval; the approval is logged to `user-prompts.jsonl`.

## Scope / acceptance

- Read `apps/desktop/AGENTS.md` first; desktop changes pass `bun run check:desktop`.
- Approval state stored in the project, readable by the CLI (`ralphy project status <id> --contract` shows it).
- Generation verbs warn and stop for unapproved scenes in AI-production projects unless the user overrides.

## Notes

- Uses the contact-sheet code from #557 for the HTML fallback.
