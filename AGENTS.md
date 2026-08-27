# Agent guide

This repository owns the Electron desktop client. Use Bun, communicate with
Ralphy through its installed CLI contract, and never import source from a
sibling checkout.

## Validation

Run these before claiming a change is complete. The narrower ones are for
iterating; all of them have to pass before you stop.

```
bun run typecheck
bun run test
bun run build
bun run audit:arch
bun run audit:style
```

`bun run test` is vitest. Do **not** run `bun test` — Bun's own runner picks up
files vitest owns and reports dozens of failures that are not real.

`bun run audit:arch` is this document's structural half, as a check rather than
a suggestion: it enforces the layer order, the slice boundaries, the public
APIs, the import spelling, the file-size limit and the no-magic-value rule
below. It exits 1 on any finding. If a rule below is worth having, it is worth
having in that script; if you change the rules, change the script in the same
commit.

## Architecture: Feature-Sliced Design

`src/` holds layers and nothing else. A layer may import only from the layers
below it:

```
shared  ←  entities  ←  features  ←  widgets  ←  pages  ←  app
```

- **shared** — no domain knowledge. The IPC surface, the model types, the
  design-system primitives, the pure helpers.
- **entities** — one business object and how it is drawn: `media`, `project`,
  `unit`, `composition`.
- **features** — one thing the operator does: `agent-chat`, `media-review`.
- **widgets** — a composed region of the shell: the sidebar, the titlebar, the
  dynamic island.
- **pages** — one route: `project`, `calendar`, `settings`, `marketplace`.
- **app** — the shell itself, the routing, the styles, the entry point.

`entities`, `features`, `widgets` and `pages` are **sliced**: each direct child
is a slice, and each slice holds only these segments plus its public API.

```
src/pages/calendar/
  index.ts     ← the public API: what the rest of the app may reach
  ui/          ← components
  model/       ← state, stores, hooks
  lib/         ← pure functions
  api/         ← calls out
```

`app` and `shared` hold those segments directly, with no slice level.

### Import rules

- **A slice is reached through its `index.ts`, never inside it.**
  `@/pages/calendar` — yes. `@/pages/calendar/ui/CalendarScreen` — no.
- **Sibling slices never import each other.** Two slices that need the same
  thing means that thing belongs one layer down.
- **Crossing a slice boundary uses the `@/` alias; staying inside it uses a
  relative path.** The spelling is how a reader tells "this is ours" from "this
  is somebody else's" at a glance.
- **Never import from a sibling checkout.** `../ralphy/…` is not a dependency,
  it is a broken build on another machine.
- Outside `src/`, the renderer may read root `shared/`, `package.json`, and an
  `electron/<area>/types` module (the IPC contract itself). Anything else under
  `electron/` may be imported for its types only. A third exception is a signal
  that the helper belongs in root `shared/`.

## No large files

**400 lines is the limit, and it is enforced.** There is no exemption list and
none may be added — a file over the limit gets split, not a budget.

Split along the seams the file already has, and let each new file say what it
is:

- the vocabulary a surface repeats (class strings, labels, icon sizes) →
  its own `*-chrome` module, so a surface never arrives without the ink it
  pairs with;
- the shapes a module returns → a `*-types` module, re-exported by name from
  the module that returns them;
- each region of a screen (a grid, a panel, a dialog) → its own component file;
- a controller that owns several domains → one section per domain over a shared
  store, with the cross-domain needs passed in by name.

A route keeps what only it can own — the range, the selection, the filters, the
one writer — and hands its children what they draw. That is what makes a split
behaviour-neutral, and it is why switching a view must never refetch.

## Components, not hardcoded markup

- If the same markup appears twice, it is a component. Modals, windows, icon
  buttons, keycaps, state plates and empty states all live in `shared/ui` and
  are changed in one place.
- A component that has grown a second job gets split, not a second prop that
  switches between them.
- Put the shared thing one layer below both callers. A widget that two pages
  need is not a page's business.

## Design tokens, not magic values

**No literal length, duration or stacking value in a class string.** The audit
rejects both of these:

```
z-3                      → z-sticky, z-scrim, z-surface-content …
top-[13px]  w-[42rem]    → a token in src/app/styles/
duration-[120ms]         → duration-fast
```

- Stacking is a `--z-*` token. A bare `z-3` says nothing about what it stands
  over; `z-scrim-content` does.
- Lengths, radii, spacings and durations are declared once in
  `src/app/styles/tokens.css` and the per-area sheets under
  `src/app/styles/theme/`, and read back as normal utilities.
- Tailwind v4 does not generate every fractional utility. When one is missing,
  read the token with the length form — `outline-(length:--spacing-island-ring)`
  — rather than writing the number.
- A multi-part value (a grid template) is a plain `:root` custom property read
  back with `grid-cols-(--name)`, not a `@theme` key.
- Colour is a semantic pair, never a literal: a surface and the ink that stands
  on it are one decision.

`bun run audit:style` holds a ratchet baseline for arbitrary values that is
empty. A new one in a component fails the build.

## Tests that read source text

Several design-system contracts assert on source text — "the shell never writes
its own focus ring", "the app never mounts the workbench hidden". These are
contracts about a **layer**, not about a file. When code moves, rebase the
assertion onto the layer with `layerSource()` / `sliceSource()` from
`tests/source-layers.ts`. Never delete one to make a move green: a changed
ruler reads as a regression that never happened.

The same holds for the probes in `scripts/audit-media-scrim.mjs`, which name
the file each class list lives in and fail loudly when it moves. Repoint them.

## Commits

- Keep source, documentation and commit messages in English.
- Run `gitleaks protect --staged --redact` before every commit.
- Stage by explicit path.
