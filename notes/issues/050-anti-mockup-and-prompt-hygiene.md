# Prompt hygiene rules not codified (anti-mockup, markdown strip, background-job safety)

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** low
> **Category:** playbook

## Context

Three small prompt-hygiene rules that the agent re-discovers per project. Bundled because each is a one-liner playbook update.

## What

- **Anti-mockup directive.** `nano-banana` defaults to a tiny-phone-in-corner mockup composition unless forbidden inline. `appstore-takeaminute-001`: hero-v2/v4 came back with iPhone in corner; 8 regens saved once "CRITICAL: NO iPhone device frame" was added to every prompt.
- **Markdown strip.** Markdown punctuation (`**`, `_`, `~`) in quoted strings bakes literal asterisks into typography. `appstore-takeaminute-001`: `**EVERY DAY**` rendered with literal asterisks; $0.15 regen.
- **Background-job file hygiene.** `ralphy generate image --prompt-file` reads files lazily during a running daemon — deleting prompt files mid-run silently fails. `ralphy-carousel-001`: `rm prompts/slide-0?.txt` during a dark bg loop produced `--prompt arg missing` and dark 03-05 failed silently.

## Why it matters

Each rule is 2-3 lines in a playbook and saves ~$0.15-$1 + a regen cycle per occurrence.

## Suggested fix

- Add the verbatim "CRITICAL: NO iPhone device frame, NO phone mockup..." block to `docs/playbooks/art-director.md` (or a guideline at `guidelines/appstore-pack/`).
- Strip markdown punctuation from quoted strings at prompt-submit boundary in `cli/lib/providers/media.ts`; or warn when detected.
- `ralphy generate image --prompt-file` snapshots contents at submit time, OR warns if a referenced file is deleted before submit. Add rule to AGENTS.md background-jobs section: "Do not mutate or delete any file a running background job reads until it completes."

## Sources

- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md` — anti-mockup + markdown
- `workspace/projects/ralphy-carousel-001/postmortem/03-cli-issues.md` — #4
- `workspace/projects/ralphy-carousel-001/postmortem/05-workflow-fixes.md` — Finding B
