# benchmarks/ — golden benchmark sets (#419)

Each subfolder is a **benchmark set** — a curated gallery of good / acceptable /
bad examples for one **content mode** + **format**, with the concrete FEATURES
that make each example pass or fail. A set is the documented *mode standard* the
agent measures an output against, so eval + council critique is grounded in a
real bar instead of generic taste.

A benchmark set is **descriptive**: an example may cite a `sourceUrl` and may
point at a `mediaRef`, but authoring one does NOT download or generate paid
media. The load-bearing payload is the `features` list + `notes`.

**Negative examples (`label: "bad"`) are required** — agents learn what to
avoid, not only what to imitate.

## Layout

```
benchmarks/
  <slug>/
    benchmark.json   — the validated set (slug, name, mode, format, examples[])
    README.md        — optional human notes
```

Each example: `{ label: "good"|"acceptable"|"bad", sourceUrl?, mediaRef?,
features: string[], notes }`. Schema: `cli/lib/schemas/benchmark.ts`.

## Consumed by

- `ralphy benchmark list / show <slug>` — CLI load surface.
- Content modes (`cli/lib/content-modes.ts → ContentModeEntry.benchmarkSet`) —
  a mode points at its set; `benchmarkSetForMode()` resolves it.
- The `STYLE_LOCK.md` scaffold (#408) — cites the mode's set in its benchmark
  references section.
- The eval + council scoring context (light seam; deeper "score against
  benchmark features" work is #457 / #427).

## Authoring rules

- One set = one content mode (the closest registry mode when the niche has no
  exact mode — e.g. analog-horror PSA maps to `tv-ad`).
- Features must be concrete and mode-specific, drawn from real postmortems — not
  vague platitudes. A reader should be able to score an output against them.
- Always include at least one `good` and one `bad` example.
- English-only on disk.
