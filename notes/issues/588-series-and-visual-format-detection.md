# Series and visual format detection in the trend engine

> **Status:** todo
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** high
> **Category:** trend-watch / formats

## Context

The owner defined "format" (2026-10-30): how a video is made and presented (big on-screen text over a person doing something, podcast clip, structured talking head, several characters acted out), with the strongest signal being a numbered series of that format on one channel that beats the channel's other videos. A manual pass (`docs/research/series-formats-2026-10-30.md`) found 47 series at 1.5x+ their channel across five niches and read the formats from digests. The #576/#577 engine has no series concept and its format labels are caption-based.

## What

1. Series detection: group a channel's videos into series (part / episode / day / number markers in captions and in the first-frame title text), compute series lift vs the channel's other videos (median views, and multiplier where dated), and surface `series` as a signal type in `trends signals` and the niche report.
2. Visual format classification from frames: for series parts and Tier-1 signals, build `ralphy ref digest` sheets (free, stop on the first block) and label a fixed visual taxonomy: text-over-action, talking head (structured), podcast clip, split-screen reaction, illustrated explainer, product or test template, UI motion graphics, on-location try-it, in-character monologue, multi-character skit. Labels by the agent's own vision by default, stored with confidence; a provider path stays off by default.
3. Format-level stats: per niche, which visual formats run as series, how many channels, series lift, and the best example per format.

## Scope / acceptance

- `ralphy trends series --niche <n>` and a "Formats and series" section in `trends niche report`.
- The 8 series in the research doc are detected automatically with the same lift (within rounding).
- Tests for series grouping (markers, stems, minimum parts), lift math, and taxonomy validation.
