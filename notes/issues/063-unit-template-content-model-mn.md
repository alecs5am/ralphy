# Unit ↔ Template content model: many-to-many with provenance vs applicable links

> **Status:** exploring (design-first, do not implement yet — user discussing with team)
> **Filed:** 2026-05-31
> **Folder:** issues
> **Severity:** high (foundational direction)
> **Category:** architecture / content-model

## Context

Design discussion 2026-05-31 (library review session). The current library frames
**templates** as the content unit (#052) and shows them in a format-organized grid
(#054), with per-template "examples" buried on the detail page. The user wants the
opposite primary surface — a Pinterest / higgsfield / artlist-style feed of concrete
content pieces — and a cleaner, scalable relationship between a content piece and the
recipes that can make it. Target scale: **tens of thousands** of pieces and templates,
plus user-uploaded content (#067).

## What

Introduce two first-class entities and a **many-to-many** relation between them.

- **Unit** — a single concrete content piece, any format (video / image / sticker /
  carousel-slide / fb-creative). This replaces the current "example / showcase output"
  concept; every produced artifact is a Unit. **Naming decided: `Unit`** (data-model
  name). Alternative `sparks` was considered and rejected for now. The user-facing UI
  label may differ (e.g. "Output" / "Result") — that is an open UI question, the model
  name stays `Unit`.
- **Template** — the reusable parametrized recipe (locked ingredients + variable
  slots) that batch-produces many Units for a content farm. Unchanged in spirit; see
  the "ingredients → template → units → farm" framing from the same discussion.
- **Unit ↔ Template is many-to-many**, via a join carrying **two distinct link kinds**
  (this distinction is the load-bearing part — do not collapse them):
  1. **provenance** (`produced-by`): which template actually rendered this Unit.
     Factual, ~1 per Unit, created automatically at generation time.
  2. **applicable** (`reproducible-via`): which templates *could* reproduce something
     like this Unit. A Unit legitimately matches several templates because a template
     is a *pattern / lens* — one video can embody a structural pattern (e.g. "choose
     the door"), a visual-style pattern (analog-horror), and an audio pattern (beep
     SFX) at once. **Many**, NOT auto-created — populated by curation or ML / embedding
     suggestion. A "grow-into" layer.

## Why it matters

- Units as first-class + addressable is what scales the library to tens of thousands
  and powers a Pinterest feed (#065) — the current static template taxonomy can't.
- Separating provenance from applicable is the whole reason M:N is worth it. If they
  are conflated: either it collapses to 1:N (then M:N is over-engineering), or the
  factual "what made this" gets diluted by fuzzy "what could make this." Keep both,
  but understand the primary link is provenance (1) and applicable is a curation/ML
  layer you invest in over time — don't build rich applicable UI before real
  multi-template Units exist.
- Resolves the copy-intent confusion the user raised: "remix this exact Unit" vs "use
  one of the N templates" become two clear, separable actions (detailed in #066).

## Scope / acceptance

Design / spec round only (no code until infra direction in #064 is chosen):

- Written model spec with entities + the join:
  - `Unit { id, format, media (blob ref), aspect, caption, tags[], slotValues?, createdAt }`
  - `Template { id, slug, name, format, recipe, locked[] (asset refs), slots[] }`
  - `unit_template { unitId, templateId, kind: "produced" | "applicable", confidence? }`
- Migration map: every current `showcase.json` output → a Unit, with a `produced`
  link to its template; current per-template galleries become "this template's Units".
- A short decision log: (a) naming `Unit` (sparks rejected, UI label open);
  (b) provenance-vs-applicable as two link kinds; (c) where applicable links come from
  (manual curation now, embedding-suggested later).
- Reconcile with #052 (template-as-unit), #054 (Pinterest grid over current static
  index), #064 (backend), #059 (which repo owns this).

## Notes

- **Sequence: foundational — before #065, #066, #067.** Pairs with #064 (infra).
- Related: #052, #054, #059, #056 (internal publish flow vs user uploads), #062.
- Open: do applicable links live per-Unit, or are they derived live from
  template/unit embeddings at query time? Cost vs freshness trade-off.
