# 417 - Expand prompt guidelines into mode-level quality playbooks

Status: active

## Problem

Ralphy's guidelines are valuable, but coverage is uneven. Strong creative results require specific, model-aware guidance for each major content mode: what to ask for, what to avoid, which references are mandatory, what failure modes are common, and how quality is judged.

Without this layer, agents fall back to generic prompt craft. That is especially damaging for low-tech users because they never see the missing art direction, negative scope, or model-specific constraints.

## Scope

- Inventory existing guidelines, skills, memories, postmortems, and template notes against the content mode taxonomy from #412.
- For every supported content mode, define at least one mode-level quality playbook covering:
  - creative objective;
  - required inputs;
  - reference requirements;
  - prompt spine;
  - model recommendations;
  - style/visual constraints;
  - common failure modes;
  - evaluation criteria;
  - negative scope / when not to apply.
- Convert durable lessons from postmortems and memory into reusable guideline entries.
- Add guideline lookup to the production plan stage so agents load the right guidance before drafting prompts.
- Add coverage checks so a mode cannot be considered fully supported without at least one guideline or playbook.
- Keep guidelines scoped and explicit. Broad rules must include negative scope to avoid over-application.

## Acceptance

- Every supported content mode has a linked guideline or mode-level quality playbook.
- Production plans list which guidelines they used.
- Guideline docs include negative scope / non-applicability sections.
- Tests or lint checks fail when a supported mode has no guideline coverage.
- Existing user-facing skills no longer carry hidden craft knowledge that is unavailable to the mode router.

## Links

- Depends on: #412 content mode taxonomy.
- Related: #060 mine memories and postmortems into guidelines.
- Related: #413 mode skill backfill.
- Related: #414 Unit production pipeline.
