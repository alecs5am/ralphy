# Wire lint:no-cyrillic into CI + fix the literal-Cyrillic sites

> **Status:** issue
> **Filed:** 2026-06-16
> **Folder:** issues

## Context

`docs/developing-ralphy.md` mandates English-only-on-disk and says a `lint:no-cyrillic` script "should be wired into CI; if it's not yet, file a notes/issues/ entry." It is still NOT wired (`rg 'cyrillic' package.json` is empty). This is the `task_ff8b39b4` follow-up flagged in the prior handoff, re-confirmed across the #430–#451 run (every commit's Cyrillic gate was run by hand).

## What

Add a `lint:no-cyrillic` script that fails on any non-Latin script in tracked source/docs, wire it into `package.json` + `.github/workflows/test.yml`, and clean the two pre-existing sites it would flag so the gate can start green:

- `cli/commands/project.ts:~808` — a literal Cyrillic regex matching the macOS Russian screenshot filename (transliterated "Snimok ekrana"; the Russian for "Screenshot"). ASCII-escape the literal as `\uXXXX` so no raw Cyrillic remains on disk.
- `cli/commands/generate.ts:~279` — a regex character class spanning the Combining Diacritical Marks block (codepoints U+0300 through U+036F) used for accent-stripping in `suggestSlot`. Those marks are NOT Cyrillic, but PCRE2 `\p{Cyrillic}` matches their raw bytes. Fix: write the class with backslash-u escape sequences (the codepoints U+0300 and U+036F) instead of literal combining characters, or line-allowlist it in the lint.

## Why it matters

The English-only rule is currently enforced only by agent discipline (manual `rg '\p{Cyrillic}'` before each commit). A wired lint makes it a real CI gate and prevents the rule from silently rotting.

## Scope / acceptance

- `scripts/lint-no-cyrillic.ts` (export the check + a CLI tail), wired as `lint:no-cyrillic` in `package.json` and into CI alongside the other `lint:*`.
- Decide the scan scope: tracked text files, excluding `.git`, `node_modules`, lockfiles, and binary assets (`.webp`/`.png`/etc.).
- ASCII-escape the project.ts regex; handle the generate.ts combining-diacritics range (escape or line-allowlist).
- The lint passes green on the repo after the fixes.
- A unit test mirroring the other lint tests (synthetic Cyrillic string → flagged; clean string → ok).

## Notes

- Origin: prior handoff `task_ff8b39b4`; re-confirmed during the #430–#451 dev-loop (the only `\p{Cyrillic}` hits on disk are these two pre-existing lines).
