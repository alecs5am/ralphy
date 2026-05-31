# Stale `ralph-`/`ralphy-` slug-prefix assertion in post-install user-journey test

> **Status:** open
> **Filed:** 2026-05-31
> **Folder:** issues

## Context

`tests/integration/cli-user-journey-post-install.test.ts:153` asserts that the
installed skill bundle at `.claude/skills/ralphy/` contains at least one entry
whose name starts with `ralph-` or `ralphy-`:

```ts
expect(skillEntries.some((e) => e.startsWith("ralph-") || e.startsWith("ralphy-"))).toBe(true);
```

This contradicts the current naming convention, documented in `AGENTS.md`
(invariant #10) and enforced by `lint:skills`:

> **Slugs carry no `ralphy-` prefix.** Audience is marked by the `namespace`
> frontmatter field (`user` default, `maintainer` for the two `dev-*` skills).

Since the prefix was dropped, no installed skill folder begins with `ralph-` /
`ralphy-`, so the spot-check fails. Confirmed failing on a clean `main`
checkout (HEAD `5bcf813`) with no local changes — it is **not** caused by any
recent skill addition; it is a stale assertion left over from the pre-rename
era.

## Impact

- Blocks both the `pre-commit` and `pre-push` husky hooks (`set -e` aborts on
  the first failing `bun test` step), forcing `--no-verify` on otherwise-clean
  commits.
- Will show as a red badge on `main` in `.github/workflows/test.yml`.

## Fix

Replace the prefix spot-check with one that matches the current bundle. Options,
cheapest first:

1. Assert a known-bundled slug exists by its real name (e.g. `core`,
   `researcher`, or whatever the `ralphy skill install` bundle actually copies)
   — read the bundle manifest in `cli/lib/skill/installer.ts` for the source of
   truth, do not hardcode a guess.
2. Or just assert `skillEntries.length > 0` and drop the prefix check entirely
   (the preceding assertion already covers non-empty).

Whichever, the assertion must stop encoding the dead `ralphy-` prefix
convention. After the fix, drop the `--no-verify` habit for this path.
