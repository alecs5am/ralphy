# guidelines/ — prompt library

Each subfolder is a **guideline** — a set of rules for an LLM on _how to write
prompts_ for a model (or model family) to reliably produce a certain look,
register, or behaviour. A guideline is **not a concrete prompt**. It is the
codified knowledge that lets the next prompt for the next project hit the same
quality bar.

## Layout

```
guidelines/
  <slug>/
    guideline.json       — metadata (slug, name, kind, models, tags, tag, examples ref)
    guideline.md         — the LLM-facing body (the actual rules)
    examples.json        — list of example media + captions (manually curated)
```

`examples.json` references images and videos that live under
`landing/public/assets/guidelines/<slug>/` (web-optimized thumbnails, shipped
in the binary) and optionally `ralphy-assets/pool/guideline-examples/<slug>/`
(heavy originals, sha-pinned).

## Consumed by

- `ralphy guideline list / show <slug> / use <slug>` — CLI surface.
- `landing/app/library/` — public gallery + detail pages.
- `@guideline:<slug>` agent tag — when the agent sees this in chat it runs
  `ralphy guideline show <slug>` and pulls the body into context before
  writing prompts. See `AGENTS.md` routing.

## Authoring rules

- One guideline = one register or one model behaviour. Splitting along the
  model boundary (Gemini-image vs Kling-video vs ElevenLabs-music) is fine and
  encouraged.
- Body must be **LLM-actionable**, not human-decorative. Lead with the rules,
  end with a copy-pasteable token cluster (positive + negative) and an example
  prompt block.
- Cite the project that produced the evidence in `guideline.json.origin` so
  the next reader can trace any claim back to a real render.
