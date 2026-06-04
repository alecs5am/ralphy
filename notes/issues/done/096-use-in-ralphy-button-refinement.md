# "Use in ralphy" — clean the button + a blue copy-command CTA

> **Status:** done — 2026-06-04 (UseInRalphyButton: blue "Use in Ralphy" that COPIES the reproduce command on click with a "Copied — paste in your terminal" flash, command in title tooltip; replaced the clunky UseModal on the standalone button and the CopyRow in the modal rail-foot — modal keeps the command as a visible reveal; next build green)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** low-medium
> **Category:** landing / frontend / UX

## Context

The "Use in ralphy" affordance (unit page + Blueprint modal) currently shows the
literal CLI command inside the button, and the copy flow is clunky. The user wants:
(1) the button itself NOT to visually carry the raw command, and (2) a blue
"Use in Ralphy" button that simply copies the command to the clipboard for pasting
into a terminal.

## What

- The visible button reads "Use in Ralphy" (blue, on-brand) — NOT the raw
  `ralphy blueprint use …` string baked into the label.
- Clicking copies the command (`ralphy blueprint use <unit-id> --project <id>`) to
  the clipboard with a "Copied — paste in your terminal" confirmation (toast /
  inline flash). Optionally still expose the full command in a small reveal /
  tooltip for users who want to see/edit it, but the primary action is copy.
- Apply consistently to BOTH the standalone unit-page button and the in-modal one.

## Why it matters

A button labelled with a long command is noisy; a clean blue "Use in Ralphy" that
copies-on-click is the expected one-click-to-terminal UX.

## Scope / acceptance

- Both Use-in-ralphy buttons (page + Blueprint modal) read "Use in Ralphy" (blue),
  copy the command on click with a confirmation, and no longer print the raw
  command as the button text.
- `bunx next build` green; no borders.

## Notes

- Touches `BlueprintModal` / `BlueprintCta`. Part of #086. May reuse the shadcn
  tooltip/toast (#087).
