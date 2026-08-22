# Migrating the renderer onto Tailwind

The renderer styles itself two ways at once: 2447 utility uses in markup and 11 432 lines of
authored CSS across 37 stylesheets defining 1051 classes. Tailwind is imported in
`important` mode, so a utility always beats authored CSS on the same element. That is why
347 declarations were found that never rendered at all, and why a stylesheet could claim a
13px label while the screen drew 11.5px. The dual system is the defect; this document is the
target every migration step aims at.

## The target

**Component styling lives in markup as named utilities. CSS keeps only what a utility
cannot express.**

CSS legitimately keeps:

- `@theme` and the token block in `tokens.css` — the values themselves
- `@font-face`, `@keyframes`, and the `--animate-*` names that reach them
- global element resets in `reset.css`
- pseudo-element rules with no utility form: `::-webkit-scrollbar*`, `::selection`
- `@supports` feature gates that switch a whole surface

Everything else moves: layout, spacing, surfaces, ink, radius, control geometry, states,
and container queries.

## No hardcoded values, anywhere

An arbitrary value in markup is the same hardcode as a literal in a stylesheet. Both are
forbidden.

- Every value comes from a named theme key: `h-control-md`, `rounded-panel`, `type-ui`,
  `tracking-caps`, `text-ink`, `bg-surface-sunken`.
- Spacing uses the numeric scale, which is the 4px grid (`p-2` = 8px, `gap-3.5` = 14px).
- A value that is not on the grid and not already named gets a **role** key in
  `src/styles/tailwind.css`, never an arbitrary value:
  `--width-settings-nav: 240px`, not `w-[240px]`.
- Container-query breakpoints are `--container-*` keys: `@max-panel/header:` , not
  `@max-[760px]/header:`.
- Three exceptions, all because no scale is involved: arbitrary **properties**
  (`[-webkit-app-region:drag]`), arbitrary **selectors** (`[&_img]:size-full`), and **state
  variants** (`data-[state=open]:`, `aria-[current]:`, `has-[input]:`) — a state variant is
  the idiomatic way to express a state, so reach for it rather than branching in the
  component. Breakpoint variants are not exempt: a width is a scale and belongs to a
  `--container-*` key. Prefer a real utility over an arbitrary selector when one exists; a
  nested selector usually means the child should carry its own classes.

`scripts/tailwind-migration-baseline.json` is a ratchet: the audit fails if any family rises
above its baseline. When an area lands, lower the numbers it removed. Never raise one.

## What must stay true

Run all of these before claiming an area done:

```bash
bun run typecheck && bun run build && bun run audit:style:strict && bun run test
```

- **The geometry harnesses now link the shipped bundle** (`tests/style-sources.ts`,
  `builtStylesheetLink`), so they measure the authored CSS *and* the utility layer in their
  real cascade. Before this change they rendered without Tailwind and could not see a
  utility overriding a rule. If an assertion moves, decide which side is right and say so —
  do not retune the number to make the suite pass.
- Two `marketplace-geometry` tests fail on Electron stdout truncation. That predates this
  work; leave them.
- The design contract is unchanged: no borders, no shadows, no gradients; separation by
  surface change or air; controls and pills R999, panel R24, cell R14; monochrome plus
  `--instrument-alert` for alarm only.
- Contrast: authored colors live only in `src/instrument/palette.ts`. Ink on a **black**
  widget uses the `on-dark` family in both themes — the light-theme hover surface turns
  white and makes on-dark ink invisible. The ghost pair (`--instrument-ghost*`) is
  theme-invariant by design; do not remap it.

## Order of work

Areas are independent. One agent per area, one commit per area.

| Area | Stylesheets | Components |
|---|---|---|
| settings | `settings.css` + `settings/*` (1553) | `screens/SettingsScreen.tsx`, `screens/settings/*` |
| workbench: project | `workbench/06,07,08,13,14` | `screens/ProjectScreen.tsx`, `screens/project/*` |
| workbench: chrome | `workbench/02,03,04,10,11,12` | `instrument/*`, `components/ContextSidebar.tsx`, `components/UtilityPanels.tsx` |
| workbench: calendar & memory | `workbench/01,05` | `screens/CalendarScreen.tsx`, `screens/MemoryScreen.tsx` |
| workbench: documents & activity | `workbench/09,15,16` | `screens/project/ActivityTimeline.tsx`, `components/MarkdownView.tsx`, `components/WelcomeScreen.tsx` |
| workspace overview | `workspace-overview.css` + parts | `screens/WorkspaceScreen.tsx`, `screens/workspace/*` |
| shared library | `shared-library.css` + parts | `screens/SharedLibraryScreen.tsx`, `screens/shared-library/*` |
| marketplace | `marketplace.css` | `screens/MarketplaceScreen.tsx`, `screens/marketplace/*` |
| instrument shell | `instrument.css`, `work-surfaces.css` | `instrument/InstrumentShell.tsx`, `instrument/overlay-registry.tsx` |

## Method for one area

1. Read the stylesheet and the components together. For each rule, find the elements it
   styles and move the declarations onto them as utilities.
2. Delete the rule. A rule that is hard to move usually has no single owner — that is the
   finding, not an obstacle.
3. Where a value has no named key, add a role key to `tailwind.css` next to the scale it
   belongs to, with a one-line comment saying what the role is.
4. Structural guards are not decoration. `min-width: 0` / `min-height: 0` on a flex or grid
   child, `overflow` on a named scroll owner, and explicit control heights must survive the
   move — they are what let a child shrink below its content.
5. Keep every `data-*` and ARIA hook. State styling becomes a variant
   (`data-[state=open]:bg-surface-hover`), never a new class.
6. Run the four commands above. Report what moved, what could not, and why.

## What not to do

- Do not remove `@import "tailwindcss" important`. Measured: 512 rendering differences.
- Do not introduce a viewport breakpoint. The desk is not the window; a route's width is
  changed by the sidebar and the chat rail without the viewport moving. Use container
  queries against the content row.
- Do not invent data. A row with no contract says so; it does not draw a dead control.
- Do not batch two areas into one commit.
