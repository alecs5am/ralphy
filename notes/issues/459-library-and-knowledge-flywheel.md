# Library and knowledge flywheel

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** strategic
> **Category:** library / knowledge

## Context

The ideal Ralphy should get better with every project. Today lessons and reusable
assets are spread across issues, postmortems, memory, guidelines, templates,
Units, and library entities. The system needs a deliberate route from production
output back into reusable production input.

## What

Build the knowledge flywheel: successful Units become templates, styles,
recipes, assets, benchmarks, and seed examples; failures become guideline
updates, model warnings, mode rules, or CLI issues; user-local templates can
graduate to the public library; community uploads can expand the ecosystem
after validation.

## Why it matters

The content factory compounds only if production output becomes reusable input.
Otherwise every agent starts from scratch and every postmortem lesson decays.

## Scope / acceptance

1. **Route map.** Document where each kind of lesson belongs:
   memory, guideline, MODELS.md, template, Unit, benchmark, skill, mode rule,
   CLI issue, or dropped.
2. **Promotion workflow.** Define how a finished project becomes a local Unit,
   a workspace template, a public library entity, and/or a benchmark.
3. **Failure workflow.** Connect #425 so repeated failures propose updates to
   the right surface with provenance and negative scope.
4. **Library seed pass.** Use #447 to create examples for key modes and feed
   #419 benchmark sets.
5. **Library QA.** Use #448 to make library entries safe as agent execution
   inputs, not just gallery cards.
6. **Community path.** Keep #067 as the future untrusted-upload path, but design
   the validation surfaces so first-party and community entities can share them.
7. **Review gates.** No auto-learning into public guidance without maintainer or
   user review.

## Dependencies and linked work

- Memory distillation: #113.
- Guideline coverage: #417.
- Unit provenance: #420.
- Failure lessons router: #425.
- Seed Units: #447.
- Library QA: #448.
- Community uploads: #067.

## Notes

- Keep the route explicit: memory for durable preferences/failure rules,
  guidelines for prompt craft, templates for repeatable structure, Units for
  finished examples, and library entities for reusable public building blocks.
