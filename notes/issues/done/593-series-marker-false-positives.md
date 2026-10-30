# Series detection false positives from ratings, ranks and dates

> **Status:** done — 2026-10-30 (ranks are never markers; ratings, dates, rank-shaped `#N` and a bare "Series N" count only with channel context; a numbered set needs one marker kind and `minParts` distinct part numbers; both fake series and two more left the cross-niche top 15; the two 2026-10-30 reference documents carry a correction note and rerun tables)
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

## Resolution

Rules in `cli/lib/trends/series.ts` (pure, no I/O):

- A rank is never a marker: `#N` after a determiner, a possessive or a rank verb ("The #1 skill", "my #1 tip", "Netflix's #1 series", "Rank #1").
- Weak markers count only with channel context: a `#N` followed by a word ("#1 mistake", "#10 Daily Routines"), a bare "series N" (a stated total, "Series 1/30", stays a marker), a fraction over 10 or 100 ("10/10", "9/10 people", "Tip 5/100"), and a date shape (a month then a day above 12, "10/28", or a zero-padded total, "1/05"). A weak marker counts when the channel's markers of its kind (fractions: of its total) carry at least `minParts` distinct numbers, so episode lists ("#1".."#38"), "1/15".."14/15" and "(1/14)".."(14/14)" stay series. `M/D/Y` never matched and is now tested.
- A numbered set is the largest marker kind with at least `minParts` parts and `minParts` distinct part numbers (a video's kind is its first marker's); other-kind marked videos stay out of both the set and the baseline.

Rerun (`trends series --niche all --limit 60` on a copy of `.ralphy/cache/trend-corpus-run/`, Workspace `ws_0e31c56b-bcb3-47bd-8b1c-377be28cec40`): 289 series on 216 channels became 241 on 168; fresh 51 became 37; verdicts adapt 3 / test 10 / skip 38 became 2 / 7 / 28. No series was gained and no surviving row changed its verdict.

Cross-niche top 15 (verdict, then lift):

| Change | Series | Verdict | Captions |
| --- | --- | --- | --- |
| left | @HybridCalisthenics "this gym is", 7.54x, adapt | right | parts 1, 2, 2 of three topics ("this gym is playground themed - part 2", "What's the best way to learn an exercise? (part 1)", "Which Wild Pullup Bar is Best? Part 2"): two part numbers, sequels to hits rather than a numbered series |
| left | @jayhoovy "how to be", 1.97x, test | right | "How to be a 10/10 Founder" (a rating), "(Day 1 of 14)", "Lesson 6": three unrelated videos |
| left | @abhasa.mentalhealth "habits that build", 1.69x, test | right | "10/10 Habits That Build an Unshakeable Mind" (a rating), "The #1 Skill School Never Taught You" (a rank), "(Part 2)" |
| left | @sumitthenix9656 "how to plan", 1.65x, test | right | "EP. 2", "Calisthenics Level Up #1", "Day 1 vs Day 94 of Bulking": three marker kinds |
| entered | @livingandsavingwithmendy "of my", 1.37x, skip (was 16th) | right | "Day 1".."Day 5 of my #nospendmonth" |
| entered | @killer07200 "bulking at home", 1.34x, skip (was 18th) | right | "Bulking at home workout day 1".."day 22" |
| entered | @DrImranNoorani numbered set, 1.27x, skip (was 19th) | allowed by the rules, weak | "Autism Success Story pt.1 / Part 2" and "The Science of Play / Part 4": two franchises with one marker kind and 3 numbers |
| entered | @PenniesNotPerfection "micro projects to", 1.23x, skip (was 21st) | right | "Doing micro projects to improve our home / Part 1" to "part 3" |

Also left the fresh list: @Calliegualy (three "Day 1" reposts), @Chase-H-AI (three "The #1 ..." ranks), @GrittySoldier, @TechRJ, @JeffCampbellDPC, @MovewithDrMike, @makefirstmillion-j1, @digitalsamaritan, @carolinemiddelsdorf and @fitnessblender (fresh set replaced by an older one-kind set); @DatGirlFromOhio dropped its "Week 2" part (1.35x to 1.23x). Of the 8 manual-pass series in `docs/research/series-formats-2026-10-30.md`, naomikong (three "Pt 1"), HybridCalisthenics, HotshotTek ("Series 11" / "series 10" are Apple Watch generations) and JeffSu (two "#1" ranks) are retired; the acceptance test records why.

Limits left: three unrelated franchises with one marker kind and three numbers still form a numbered set (InvestYadnya "Ep 1 / Ep 5 / Ep 16", DrImranNoorani); listicle references such as "(#4 Is the Real Test)" read as `#N` when the channel has several; a channel reviewing three watch generations ("Series 9/10/11") would still read as a series; season shapes ("24/25") are not handled.
