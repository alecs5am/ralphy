# Series detection false positives from ratings, ranks and dates

> **Status:** open
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** high
> **Category:** trends / series detection

## Context

`cli/lib/trends/series.ts` (#588) reads part markers from captions. In the 2026-10-30 reference tables (`docs/research/references-psychology-en-2026-10-30.md`, `docs/research/formats-and-series-2026-10-30.md`) two fake series reached the cross-niche top 15:

- `@abhasa.mentalhealth` "habits that build": a `numbered-set` built from "10/10 Habits That Build an Unshakeable Mind" (a rating), "#1 Skill School Never Taught You" (a rank) and "(Part 2)" (a real marker), three unrelated videos.
- `@jayhoovy` "how to be": the same shape, from "How to be a 10/10 Founder".

Dates such as `10/28` and product names such as "Series 11" can also read as markers.

## What

- Ratings and stats are not parts: `N/10` and `N/100` fractions, `10/10`, and fractions inside phrases like "9/10 people".
- Dates are not parts: `M/D` and `D/M` shapes with a day above 12, and `M/D/Y`.
- `#1` used as a rank ("The #1 skill", "#1 mistake") is not an episode marker.
- A `numbered-set` needs one marker kind across its parts and at least `minParts` distinct part numbers; a mix of a fraction, a rank and one "Part 2" is not a series.
- "Series N" stays a marker only when the channel has several such parts.

## Scope / acceptance

- Unit tests with the real captions above plus counter-examples that must stay series ("Part 1/3", "Day 12 of 30", "Ep. 4", "#3" episode lists).
- Rerun `trends series --niche all` on a copy of the scratch corpus: both fake series are gone; report what else left or entered the top 15.
- Update the two reference documents with a dated correction note and corrected tables.
