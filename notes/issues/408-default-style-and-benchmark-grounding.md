# Default every project into style and benchmark grounding

> **Status:** todo
> **Filed:** 2026-06-14
> **Folder:** issues
> **Severity:** high
> **Category:** research / art-direction / quality

## Context

Several postmortems show that register drift and weak reference grounding are the biggest quality killers. Site-grounding exists for brand URLs, researcher exists for reference sets, and evaluator deep-vision can score against a style sheet. But the default chat-to-render path still allows projects to start generating without an explicit style or benchmark lock.

## What

Make benchmark/style grounding a standard upstream artifact for every non-trivial project. The agent should either derive it from user-provided URLs/refs/templates/library examples or create a compact register lock from the brief and memory. Downstream prompts and eval should use that same artifact.

## Why it matters

High-quality content is reference-shaped. Without a style lock, agents pick generic model language and get generic outputs. Grounding should happen before prompt fan-out, not after a bad render.

## Scope / acceptance

- Define a project-local artifact such as `style-sheet.md` or `STYLE_LOCK.md` with: visual register, pacing, hook mechanics, caption/audio style, do-not-do list, benchmark refs, and model-specific implications.
- Intake/producer require the artifact before art-direction for multi-scene video, ad packs, carousels, posters, and remix work.
- If a URL/handle/reference is present, route through researcher/site-grounding and store the result in the project; if not, derive a lighter register lock from the matched template/guidelines/memory.
- Art-director prompt preparation must cite the style lock and fail if it is missing for covered project types.
- `ralphy eval video` auto-discovers project-local style lock for deep-vision evaluation, or the evaluator skill always passes it explicitly.
- Tests cover auto-discovery and a no-style-lock refusal for a covered project type.

## Notes

- Related: #014 done for brand site-grounding, #017 done for register axis, evaluator deep-vision already has the scoring side.
- This issue makes the grounding artifact mandatory in the default agent pipeline.
