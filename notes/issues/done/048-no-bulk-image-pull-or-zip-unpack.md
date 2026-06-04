# Missing verbs: `ref pull-bulk <urls>` and `assets unpack <zip>`

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** low
> **Category:** cli

## Context

Project onboarding routinely needs to (a) download N images from a list of URLs (brand assets, references) and (b) unpack a brand zip with wild folder structure into a normalized `<project>/brand/`. Both happen via raw `curl` loops and hand-renamed `cp`s.

## What

- `playdate-pixel-001`: workaround inventory — 15× raw `curl` to grab playdate gamecards.
- `twitch-fb-ads-001`: #4 — 6 manual rename `cp`s for Twitch brand zip with `__MACOSX/` clutter; one typo'd filename later broke HTML rendering.

## Why it matters

Onboarding tax that compounds across the team. No verb means inconsistent naming, hidden `__MACOSX` artifacts, no manifest entries.

## Suggested fix

- `ralphy ref pull <url-list> --kind reference-image --project <id>` — bulk download into `refs/`; deduplicate by sha256; auto-name by domain + basename.
- `ralphy assets unpack <zip> --project <id>` — auto-detect brand zip type, flatten to `<project>/brand/` with kebab names, drop `__MACOSX/`, print summary table.
- Touch `cli/commands/ref.ts` and `cli/commands/assets.ts`.

## Sources

- `workspace/projects/playdate-pixel-001/postmortem/03-cli-issues.md` — workaround inventory
- `workspace/projects/twitch-fb-ads-001/postmortem/03-cli-issues.md` — #4
