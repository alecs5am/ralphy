# Farm end-to-end fixture (#523)

Source files for the committed farm bundle the `tests/integration/farm-e2e.test.ts`
simulator drives. These are the KNOW-HOW of a tiny trained workspace — the same
tree `ralphy workspace export` packs into a bundle zip:

- `pipeline.json` — the graph workflow: `schedule` → `trend-watch` → one LLM
  node (`generate-text`) → one media node (`t2i`) → `generate-object` judge →
  `gate` → `ralphy-unit` → `approval` → `calendar-slot` → `publish` →
  `analytics-pull`. Lints green (`ralphy workflow lint`).
- `evaluators.json` + `STYLE_LOCK.md` — the workspace quality bar (the bundle's
  export-readiness gate requires an evaluator set).
- `calendar.json` — one recurring publish slot (only slots are bundled; dated
  entries are per-workspace production state).
- `prompts/` — the slot-templated prompt files the graph nodes reference.

The test seeds a workspace from these files, exports it to a scratch zip, then
imports the zip into a temp `.ralphy` root — a real bundle round-trip — and
fires ticks through the REAL farm runner with mocked provider executors (zero
network). No media, no binary zip is committed: everything here is
English-only reviewable text.
