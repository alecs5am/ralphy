# Install shadcn/ui as the component base

> **Status:** done — 2026-06-04 (shadcn primitives dialog/popover/tabs/scroll-area/tooltip/aspect-ratio added manually on Tailwind v4 + React 19; CSS-var bridge in app/shadcn-tokens.css maps onto existing tokens, borders neutralized to transparent; next build green 166 pages)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** medium
> **Category:** landing / frontend / design-system

## Context

The library needs reusable, design-consistent components (#086). The user wants
shadcn/ui installed so our own components are built on top of its primitives
(dialog, popover, tabs, scroll-area, tooltip, etc) rather than hand-rolled each time.

## What

Set up shadcn/ui in `landing/` and adopt it as the base for the library's shared
components. shadcn is ADDITIVE — build our components on its primitives; do NOT
rip out the existing custom design tokens / `library2.css` register. The landing
runs **Tailwind v4** (`tailwindcss ^4.3.0`), so use the shadcn setup path for
Tailwind v4 (CSS-variables theme, no `tailwind.config.js` required).

## Why it matters

Accessible, battle-tested primitives (focus traps, keyboard nav, portals) for the
modals / popovers / carousels we're about to build, instead of re-deriving them
(the blueprint modal already hand-rolled scroll-lock + Esc + portal).

## Scope / acceptance

- `bunx shadcn@latest init` in `landing/` wired to the existing design tokens
  (map shadcn CSS vars onto the current `--bg`/`--ink`/accent tokens so components
  match the pure-black, single-accent, no-border register — memory rule).
- A `components/ui/` dir with the first primitives the batch needs (dialog,
  popover, tabs/scroll-area, tooltip, aspect-ratio) added via the CLI.
- Tailwind v4 + the existing `globals.css`/`library2.css` still build:
  `bunx next build` green. No visual regression on existing pages.
- Document the convention in a short `landing/components/ui/README` or a note: our
  components compose shadcn primitives + the library tokens.

## Notes

- Foundation for #088–#091 (Media, UnitCard, Carousel, AudioPlayer). Sequence FIRST.
- Verify the radix/cva deps shadcn pulls don't conflict with Tailwind v4 (use the
  v4-compatible shadcn release). Part of #086.
