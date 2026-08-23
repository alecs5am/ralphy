# Styling the renderer

The renderer once styled itself two ways at once: utilities in markup and 13 445 lines of
authored CSS over 37 stylesheets. Tailwind is imported in `important` mode, so a utility
always beats authored CSS on the same element — which is why 347 declarations were found that
never rendered, and why a stylesheet could claim a 13px label while the screen drew 11.5px.

That dual system is gone. `src/styles` is 2173 lines, and every line of it is a token, a
reset, or something a utility provably cannot express. This document is now the standing
contract: the rules below are what keeps it that way, and the facts in **What eleven
migrations established** are the ones that cost measurement to learn.

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

## One property, one utility

Two utilities of the same property on one element are resolved by the order of the generated
stylesheet, not by the order of the class string. The author cannot see that order, so the
outcome is arbitrary.

This already shipped a defect: a shared `HEADER_ACTION` base carried `bg-instrument-raised
text-on-instrument-muted`, and the primary button appended `bg-surface text-ink`. Different
halves won — the light surface from the caller, the on-dark ink from the base — and the
screen's primary action rendered invisible ink on a light pill.

So:

- A shared base class carries **geometry and behaviour only**: layout, size, radius,
  transition, focus, disabled. Never a surface or an ink a caller might replace.
- Surface and ink are stated **as a pair**, by the caller, in one place. `bg-*` and `text-*`
  travel together because a half-override is what breaks.
- If two classes must both name a property, merge them into one string at the call site
  rather than layering base plus override.

The live check is the design audit: it forces `:hover`/`:focus-visible` and measures the ink
of every mark against the surface it actually lands on. Run it against your area in **both**
themes before you report; token equivalence on paper does not catch this.

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

## What eleven migrations established

Every item here was measured in the running renderer, and most of them contradicted what the
stylesheet said. They are listed because each one cost a wrong answer first.

**The cascade.** An `!important` declaration in an *unlayered* stylesheet **loses** to an
`!important` utility inside `@layer utilities` — important layer order is reversed. So a
`display: none`, a reduced-motion blanket, or a `border: 0` cancel written in a sheet cannot
override a utility on the element. Several such blankets had not applied for a long time.
Reduced motion belongs on the element: `motion-reduce:animate-none`.

**Two utilities, one property.** Which one wins is decided by the generated stylesheet's
order, not by your class string, and you cannot see that order. A shared base class must
carry geometry and behaviour only — never a surface or an ink a caller means to replace.
Surface and ink travel as a pair; a caller repainting half a pair is how a menu came to read
2.24:1, and its checked row 1.02:1. When a component genuinely needs two skins, give it a
`tone` prop: `ui/SelectMenu.tsx`, `MarkdownView.tsx` and `media/tone.ts` do.

**Descendant variants outrank elements.** A utility inside `[&_h3]:` is (0,1,1) and beats
every per-element `type-*` (0,1,0) beneath it. A blanket on a container silently overrides
each child's own choice. Four migrations lost real elements to this. Rendered Markdown is the
one place the blanket is unavoidable, because `marked` emits bare tags.

**`var()` substitutes where it is declared.** Not where it is read. A `calc()` or `min()` on
`:root` referring to a variable scoped to `.instrument-shell` is guaranteed-invalid and falls
back silently. Two menus overflowed their rail this way, and a drawer rendered 328.59px wide
against a declared 292px. Declare a derived value on the element whose scope holds its inputs.

**Portals leave the token scope.** An overlay portalled to `document.body` sits outside
`.app-mode-work`, where the legacy `--fg*` / `--selected*` / `--danger` tokens resolve to the
on-dark family. A light widget in a portal then paints on-dark ink at 1:1–3.5:1, and an alarm
turns near-white. Eleven overlays were fixed for this.

**Token pairs that collapse.** `--selected` and `--selected-ink` are the same value in the
dark theme — white on white. `bg-surface text-ink` is invisible in the dark theme; both are
#141414. `--control-focus` resolves to `--instrument-text-primary`, so a theme focus ring on a
black widget is black on black in the light theme — use `outline-focus-on-instrument`.
`--instrument-text-muted-decorative` is #6A6A66 on dark and #9A9A96 on light and clears 4.5:1
against nothing it was used on: it is for disabled ink and marks that carry no information,
never for copy. Fourteen settings labels were reading through it.

**Proving a rule dead.** Disable it by rewriting its `selectorText`, then diff every reachable
element's full computed style. Do **not** remove individual declarations: Chrome stores a
`var()` shorthand as a pending-substitution value and removal destroys it. Write state hooks
onto the subject *and its whole ancestor chain*. Three blind spots produced false verdicts: a
transitioned property returns its start value at t=0; a container or media condition never
fires at a single sweep width; and every row may render the negative value of the attribute
the rule selects, so `aria-selected="true"` looks unreachable when it is not.

**Verify by rendering, not by token equivalence.** Equivalence on paper missed every defect
listed above. The audit that catches them measures each mark against the surface it actually
lands on, with `:hover` and `:focus-visible` forced, in both themes, at three desk widths.
Two things it must know: Chrome returns `oklab()`/`oklch()` verbatim for anything authored in
those spaces or produced by `color-mix()`, so a parser reading only `rgb()` skips them
silently; and marks inside `[aria-hidden="true"]` are decorative by design — the project
identity glyph is the hue of its own plate on purpose.

**Fixtures are not coverage.** No document fixture contains a code block, a table, a rule or
an alert, so the whole block vocabulary of rendered Markdown renders in no route. The revision
chooser appears only for a multi-revision asset. The review consoles mount only in the right
rail. A route sweep that reports clean has not seen any of them.

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
