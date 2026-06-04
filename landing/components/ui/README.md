# UI primitives (shadcn/ui base)

These are the shadcn/ui primitives the library component batch (#088–#091, #096)
builds on. **Our own library components compose these primitives + the existing
Ralphy design tokens** (`--bg*` / `--ink*` / `--vio*`, fonts, `--line*`) defined
in [`app/globals.css`](../../app/globals.css). shadcn is ADDITIVE — it did not
replace the `@theme` block or the legacy register.

## How the theming works

shadcn primitives read a fixed set of CSS variable names
(`--background`, `--foreground`, `--popover`, `--primary`, `--border`,
`--ring`, `--radius`, …). We do **not** define those with shadcn's stock
colors. Instead they are **mapped onto our existing tokens** in
[`app/shadcn-tokens.css`](../../app/shadcn-tokens.css), imported in
[`app/layout.tsx`](../../app/layout.tsx) **after** `globals.css`:

```
--background → var(--bg)      (pure black)
--foreground → var(--ink)     (white)
--popover    → var(--bg-2)    (elevated tint for dialogs/popovers/tooltips)
--primary    → var(--vio)     (the single runtime accent — orange on the live site)
--ring       → var(--vio)
--border     → transparent    (see below)
--radius     → 0.875rem
```

The same file re-exposes these names to Tailwind v4 via `@theme inline`
(no `tailwind.config.js`), so `bg-popover`, `text-foreground`, `ring-ring`,
`rounded-lg`, etc. resolve.

## No 1px borders (repo hard rule)

We **never** draw a `border: 1px solid` hairline on cards / buttons / badges /
modals. The shadcn `--border` (and `--input` / `--sidebar-border`) token
resolves to **`transparent`**, so the `border` utility shadcn primitives apply
by default produces nothing visible. **Separation comes from elevated bg-tint
steps (`--bg-1..4`) + shadow + spacing**, not a line:

- Dialog / popover / tooltip content float on `--popover` (`--bg-2`) with a
  `shadow-*`, not a border.
- Tabs / scroll-area use bg-tint steps (`--muted`, `--accent`) for the active
  state and the scrollbar thumb.

If you add a new primitive via `bunx shadcn@latest add <name>`, audit it and
strip any visible-border styling (or rely on the transparent `--border` token)
before committing.

## Present primitives

`dialog`, `popover`, `tabs`, `scroll-area`, `tooltip`, `aspect-ratio`.

Helper: [`lib/utils.ts`](../../lib/utils.ts) exports `cn()`
(clsx + tailwind-merge).
