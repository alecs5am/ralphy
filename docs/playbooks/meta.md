# Meta — start-of-session discipline

Rules about how to start a ralphy session, not what to do in any specific role. Read this once at session start; the other playbooks are role-specific and fire on-demand.

## Rule 1 — Re-read the closest sibling postmortem before the first ralphy call

Every finished project under `workspace/projects/<id>/` ships a postmortem (either a 6-file split under `postmortem/` or a legacy single `POSTMORTEM.md`). Those documents are the highest-density distillation of what's worked, what's failed, and what burned money on a similar brief.

**Concrete: when a new project request lands, before running `ralphy generate`, identify the closest sibling project and re-read its `02-lessons.md` / lessons section.** "Closest" = same template kind, same category (per `templates/CATEGORIES.md`), same aesthetic register. The 10 minutes you spend reading saves $5-20 of regen burn.

Examples of the closest-sibling pattern:
- New analog-horror PSA brief → re-read `workspace/projects/analog-horror-fridge-001/POSTMORTEM.md`
- New deadpan 2-hander → re-read `workspace/projects/noski-people-001/postmortem/02-lessons.md`
- New Tokyo / cinematic neon project → re-read `workspace/projects/tokyo-y2k-001/postmortem/02-lessons.md`
- New broadcast-realism trend → re-read `workspace/projects/kbo-broadcast-001/postmortem/02-lessons.md`

playdate-pixel-001 explicitly identified this as "the single highest-leverage 10 minutes" of the session — rules 5, 6, 7 from the flipper postmortem applied verbatim and would have saved 4 turns of relearning.

## Rule 2 — Always check `MODELS.md` before any model call

This is AGENTS invariant #6 surfaced here too because it's a meta-rule: Claude's training data is stale. Model availability, pricing, per-endpoint caps, prompt-char caps, and "tried-and-dropped" reasons all live in MODELS.md and update faster than training cuts. The bullet "Kling `--last-frame` returned 400 base64 for ~6 days" in MODELS.md is exactly the kind of thing the model would never know without reading the file.

Specifically, **before picking `--model`**, scan:
- The per-stage "Default narrative i2v" / "Default character image" / etc. table
- The "Discovered breakage" numbered list (now 9 items as of 2026-05-19)
- The "Tried-and-dropped" cross-reference table

## Rule 3 — Use `ralphy template suggest` before improvising

Hard CLAUDE.md invariant #10. Before drafting prompts for a "new" idea, run:

```bash
ralphy template suggest "<the user's brief in their words>"
```

If the top hit has `score ≥ 0.5`, **use the template** (`ralphy template use <slug>`) instead of improvising. Templates encode the postmortem-validated workflow for that vibe — see `templates/CATEGORIES.md` for the full slug roster and the per-template `TEMPLATE.md` for what each one is good at. 54 templates ship; chances are high that what the user asked for is already there.

## Rule 4 — Intake protocol before any paid generation

For new-project briefs, the [intake.md](intake.md) protocol fires BEFORE any other playbook. Don't skip it even when "the brief seems clear" — three of the ten postmortems' largest cost overruns trace to "the brief seemed clear so I just generated."

The protocol:
1. Capture intent via 3-5 clarifying questions (target language, aspect, brand, duration, hard "no"s).
2. Draft a plan in chat. Wait for user "go".
3. Generate one beat at a time → wait for user feedback → next beat.
4. Final eval gate via `/ralph-evaluator` before declaring done.

User override: "просто сгенери / just go" switches to batch mode for that project. Note it in memory; don't generalize.

## Rule 5 — Append-only is now enforced in CLI, not just documented

As of commit 753d2f7, `ralphy generate {image,video,music,voiceover,sfx}` auto-archives the existing slot file to `<slot>.v{N}.<ext>` on every regen. AGENTS invariant #13 is enforced at the file-system level, not just policy. Pass `--force-overwrite` only when the user explicitly asks for legacy destructive behavior.

This means "try once more, then redesign" (the regeneration rule) is now risk-free at the file-system level — the v1 stays on disk. Don't manual-cp; the CLI does it.

## Rule 6 — When the agent feels "I know how to do this, I'll skip the read"

That feeling is the bug this file exists to prevent. The postmortems show that the agent's confidence-without-reading was the highest-cost failure mode across 10 sessions. If you find yourself reaching for a tool / prompt / model without checking the playbook, **stop and read.** The cost of reading is ~10 seconds; the cost of being wrong is $1-50 + 30-90 min of user-flagged regen.

The five files to always have warm at session start:
- `AGENTS.md` (auto-loaded by CLAUDE.md)
- `MODELS.md` (always check before model call)
- `CLI.md` (verb / flag reference)
- The closest sibling postmortem (per rule 1)
- The matched playbook from AGENTS.md routing (read fully, then act)
