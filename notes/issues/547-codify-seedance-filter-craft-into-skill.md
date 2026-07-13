# Codify the seedance safety/privacy filter field guide into the seedance-prompts skill

> **Status:** todo
> **Filed:** 2026-07-13
> **Folder:** issues
> **Severity:** medium
> **Category:** craft-as-data / skills

## Context

A `/dev-issues` pass over all `ralphy memory` tiers found the seedance-2.0
content-filter lore scattered across global + three workspaces
(`silent-hill`, `free-air-vpn`, `trafalgar`). It has now been consolidated
into ONE canonical global memory entry `seedance-safety-privacy-filter-guide`
(and the purely-general workspace copies retired). The headless DATA path
already exists (`cli/lib/providers/reroute-rules.ts`, shipped in #514), but the
**agent-in-the-loop craft** is still thin: `.agents/skills/seedance-prompts/SKILL.md`
mentions only the one photoreal-human → kling case and nothing else the memory
now captures.

## What

Add a "Clearing the safety / privacy filter" section to
`.agents/skills/seedance-prompts/SKILL.md`, sourced verbatim-in-substance from
`seedance-safety-privacy-filter-guide`. It must distinguish the TWO guards and
give the fix for each:

- **Input-image PRIVACY scan** (`InputImageSensitiveContentDetected`) keys on
  overall-frame **photo-likeness**, not face anatomy — bake grain/dither/murk
  into anchors; render bg crowds as faceless dark low-poly silhouettes; pure
  t2v is not scanned; photoreal humans → FAL reference-to-video; historical
  engraving cut-outs pass.
- **Output SAFETY scan** (`E_INTERNAL 'output may contain sensitive
  information'`) keys on **destruction lexicon** (explosion/shatter/blast/
  breach) — reword as soft dissolve / flow-through / opens-into-passage; light
  comedic impacts (squash/bonk/crumble) pass.
- Note that submit-test is free (probe before a batch), and that kling-v3.0-pro
  is the no-filter fallback.

Also: audit the matching rules in `cli/lib/providers/reroute-rules.ts` and set
their `source` field to cite `seedance-safety-privacy-filter-guide` (the #514
schema already has a `source` field for exactly this).

## Why it matters

The skill is the routing-discoverable, permanent home for this craft; memory
churns and is not guaranteed loaded for a seedance task. Keeping the skill and
the reroute-rules data pointing at the same canonical memory slug means one
source of truth for the most expensive-to-learn filter behavior in the stack.

## Scope / acceptance

- New section in `.agents/skills/seedance-prompts/SKILL.md` covering both
  guards + the four privacy sub-cases + the destruction reword, with the
  DOES-NOT-apply carve-outs (kling has no filter; comedic impacts pass;
  object/landscape refs pass).
- `reroute-rules.ts` seedance rules carry `source: "seedance-safety-privacy-filter-guide"`.
- Cross-link done #514 (data path) and MODELS.md seedance row.
- Skill still passes the skills lint / normalize-skills check.

## Notes

- Related: done #514 (filter-aware rerouting data), done #045 (negative-scope
  discipline), done #026 (MODELS.md failure-modes).
- Sequence after nothing; independent of #548/#549/#550.
