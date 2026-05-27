# Landing → Tailwind v4 migration guide

Status: **in progress.** Foundation landed; migrating component-by-component, deleting the matching `globals.css` blocks as each surface is verified.

## Setup (done)

- `tailwindcss` + `@tailwindcss/postcss` + `@tailwindcss/typography` installed (v4.3).
- `postcss.config.mjs` registers `@tailwindcss/postcss`.
- `app/globals.css` top imports **theme + utilities only — NO preflight** (so legacy hand-written CSS is untouched during the migration) and declares `@theme` mirroring the design tokens. Preflight gets added once `globals.css` is fully retired.

## Token → utility map

The `@theme` block emits utilities from the existing palette. Use these, never raw hex:

| Token | Utilities |
|---|---|
| `--color-bg` … `--color-bg-4` | `bg-bg`, `bg-bg-1`…`bg-bg-4`, `text-bg`, … |
| `--color-ink`, `-2`, `-3` | `text-ink`, `text-ink-2`, `text-ink-3`, `bg-ink`, … |
| `--color-mute`, `--color-mute-2` | `text-mute`, `text-mute-2` |
| `--color-vio`, `-2`, `-3`, `-ink` | `text-vio`, `bg-vio`, `text-vio-2`, … (the dusty-rose accent) |
| `--color-warn` | `text-warn`, `bg-warn` |
| `--color-line`, `-2`, `-3` | `border-line`, `bg-line-2`, … (hairline separators) |
| `--font-display` | `font-display` (uppercase headings) |
| `--font-sans` | `font-sans` (body) |
| `--font-mono` | `font-mono` (code/terminal) |
| `--font-pixel` | `font-pixel` |

For one-off values use arbitrary syntax: `text-[0.85rem]`, `rounded-[14px]`, `shadow-[inset_0_0_0_1px_var(--color-line)]`, `[grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]`. Reference a theme var inside arbitrary values as `var(--color-line)`.

## Hard rules

1. **No borders on cards/buttons/badges** (user rule). Separate with bg-tint steps + shadow + spacing. A 1px hairline *divider* between regions is fine (`bg-line`), a box border around a card is not.
2. **No emojis** in markup.
3. **English only** on disk.
4. **Don't run `bun run build` while `next dev` is running** — they share `.next` and the build corrupts the dev manifest (500s). Verify via dev + Playwright screenshots; run a one-off `bun run build` only after stopping dev.
5. **MDX / prose** (blog, library, skill docs): use the `prose` classes from `@tailwindcss/typography` with theme overrides, OR keep the scoped `.blog-body` CSS until a dedicated prose pass. Do not hand-convert every generated tag.
6. **Preserve framer-motion** props; only swap `className` strings to utilities.

## Workflow per surface

1. Convert the component/page `className`s to utilities (keep behavior, structure, refs, motion).
2. Verify with a Playwright screenshot against the running dev server (compare to the pre-migration look).
3. **Only then** delete that surface's now-dead rules from `globals.css`.
4. **Never edit `globals.css` from two agents at once** — CSS deletion is serialized through the owner (the human/orchestrator), not parallel agents. Agents migrate their component files and leave dead CSS for a final cleanup pass.

## Reference implementation

`components/SkillsListing.tsx` is fully migrated and verified — copy its conventions (conditional class helper, arbitrary values, `--accent` inline var for gradients, theme color utilities).

## Surface checklist

- [x] Foundation (postcss, @theme, imports)
- [x] `components/SkillsListing.tsx` (marketplace grid)
- [ ] `components/SkillDetailView.tsx`, `app/skills/[slug]/SkillFiles.tsx`, `components/SkillModal.tsx` (skill detail + modal)
- [ ] `app/skills/page.tsx`, `app/skills/[slug]/page.tsx`
- [ ] `components/Nav.tsx`, `components/Footer.tsx`, `app/layout.tsx`, dot-bg
- [ ] Home page + `components/sections/*` (Hero, Pipeline, Showcase, Stack, Community, Roadmap, Templates, StarCta, HowItWorks)
- [ ] `app/library/*` (+ LibraryListing, [slug])
- [ ] `app/templates/page.tsx`
- [ ] `app/blog/*` + `components/mdx/*` (prose pass via typography plugin)
- [ ] `app/ralphy/*`, `app/blog/models`
- [ ] Final: delete the rest of `globals.css` (keep @theme + @font-face + any irreducible base), add preflight, full-site screenshot QA.
