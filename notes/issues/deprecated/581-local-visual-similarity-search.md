# Local visual similarity search (thumbnails and first frames)

> **Status:** dropped (owner, 2026-10-28: not agreed scope; the working yt-dlp path is enough, hook types are covered by #576 and #577 reports)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** low
> **Category:** feature / trend-watch

## Context

Algrow sells search by thumbnail and "find the channel from a screenshot". We can do it free with a local open CLIP-style model over thumbnails and #557 first-frame tiles.

## What

- Embed thumbnails and first-frame tiles of Tier-1 videos locally (no provider).
- `ralphy trends similar <image|video-id>`: nearest videos with metrics and outlier labels; also used by #577 to group visually similar formats across creators.

## Scope / acceptance

- Model choice and speed on this machine documented; index stored under the data root; tests with a tiny fixture index.
- Zero provider calls.
