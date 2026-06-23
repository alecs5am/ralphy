# Open-world mode compiler and provisional modes

> **Status:** done — 2026-06-23 (compileMode known|ambiguous|unknown + closest-format fallback + ProvisionalMode schema + builder + fixtures + doc)
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** high
> **Category:** mode-compiler / research / product

## Context

#418 tracks the production mode compiler. The user added a critical constraint:
Ralphy must handle content categories it does not know yet. A fixed content-mode
taxonomy cannot become a ceiling.

## What

Add an open-world path to the mode compiler. Known content goes through the
registered content-mode route. Unknown content goes through structured discovery:
infer the closest media format, research the niche, create a provisional mode
profile, ask only high-leverage questions, run with stricter checkpoints, and
save learnings for possible mode promotion.

## Why it matters

The ideal Ralphy should produce any media content, not only preinstalled modes.
Unknown content should degrade into disciplined discovery, not generic prompting,
silent under-routing, or refusal.

## Scope / acceptance

1. **Unknown detection.** Extend the compiler/classifier to emit `known`,
   `ambiguous`, or `unknown` mode status with confidence and reasons.
2. **Closest format fallback.** For unknown content, choose the closest media
   format (`video`, `image`, `carousel`, `motion-design`, `audio`, etc.) without
   claiming a supported content mode.
3. **Research-first behavior.** Unknown content triggers quick/deep research
   before prompts are drafted unless the user explicitly supplies enough refs.
4. **Provisional profile.** Write `provisional-mode.json` or equivalent with:
   inferred audience, format, assumptions, required refs, risks, suggested
   model stack, quality gates, and checkpoint cadence.
5. **Stricter checkpoints.** Require user approval after provisional profile and
   before paid generation. Unknown modes should not silently run large batches.
6. **Promotion path.** After a successful project, produce a promotion proposal:
   keep provisional, map to an existing mode, or create a new supported mode.
7. **Fixtures.** Add test fixtures for at least five unfamiliar content asks,
   including one that should map to a known mode after research and one that
   should remain provisional.

## Dependencies and linked work

- Mode compiler: #418.
- Low-tech prompt benchmark: #430.
- Plan grader: #432.
- Mode smoke suite: #446.
- Research/reference intelligence: #455.

## Notes

- A provisional mode is allowed to produce content. It is not allowed to pretend
  it has the same support level as a tested mode.
