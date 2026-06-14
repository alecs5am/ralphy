# Golden benchmark sets for content modes

> **Status:** issue
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

Postmortems keep showing that quality improves when the agent has concrete references: App Store packs need competitor screens, hyper-motion ads need source motion references, analog horror needs style frames, and carousels need the real brand surface. #408 made style locks mandatory, but it does not yet define curated benchmark sets per mode.

## What

Create golden benchmark sets for each supported content mode: examples of good, acceptable, and bad outputs, plus the features that make them pass or fail. Evaluation and council reviews should compare against those benchmarks instead of relying only on generic taste.

## Why it matters

Benchmarks reduce hallucinated critique and weak art direction. They also let agents explain why an output fails in terms of a concrete mode standard, not personal preference.

## Scope / acceptance

- Define a benchmark artifact shape with media refs, source links where allowed, mode, format, pass/fail labels, and evaluation notes.
- Attach benchmark requirements to content modes from #412.
- Extend style lock or production contract output to cite the selected benchmark set.
- Teach native-video eval and council review to reference benchmarks when scoring format fit.
- Add at least three pilot benchmark sets: app-store/image-pack, product UGC review, and analog-horror PSA.
- Include negative examples so agents learn what to avoid, not only what to imitate.

## Notes

- Builds on #408.
- Feeds #411, #415, #417, and #427.
