# `--ref` path intake fragile: cwd-relative and NBSP-sensitive

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

`--ref`, `--first-frame`, `--audio` paths resolve against cwd, not the project directory, even when `--project <id>` is set. Separately, macOS screenshot paths contain U+202F (narrow no-break space) which looks normal but trips `ENOENT` despite `ls` finding the file. Both classes cost ~20 min of debug per project.

## What

- `free-air-vpn-stickerpack`: 4 parallel pre-spend failures from ENOENT on relative `--ref`.
- `noski-people-001`: 6 failed Kling gens due to bash cwd persistence.
- `choose-your-guide-001`: GAP-12 — `generate image` accepts `--prompt`, `ref analyze-video` accepts `--prompt-file`; flag inconsistency.
- `appstore-takeaminute-001`: ~20 min debug on U+202F NBSP in screenshot paths.

## Why it matters

Two distinct papercuts that both make ref intake unreliable. The NBSP one in particular is invisible to the eye and pops up on every project that touches `~/Downloads/Screenshot ...png`.

## Suggested fix

- New helper `cli/lib/path-resolution.ts`:
  - When `--project <id>` is set, try cwd-relative AND `workspace/projects/<id>/`-relative before failing.
  - Normalize U+202F / U+00A0 / zero-width variants to ASCII space at the intake boundary. Warn on normalization.
- Make `--prompt-file` accepted everywhere `--prompt` is accepted. Same for `--ref-file` / `--ref`.

## Sources

- `workspace/projects/free-air-vpn-stickerpack/postmortem/03-cli-issues.md` — #6
- `workspace/projects/noski-people-001/postmortem/03-cli-issues.md` — #5
- `workspace/projects/choose-your-guide-001/postmortem/03-cli-issues.md` — GAP-12
- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md` — NBSP paths
