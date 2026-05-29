# Missing small utility verbs: thumbnail, audio-stats, contact-sheet, music-variants, project-zip

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** low
> **Category:** cli

## Context

A cluster of small utility verbs are missing — each is a 1-liner ffmpeg/imagemagick recipe used dozens of times per project, all currently raw shell. Bundling into one issue because individually they're trivial; collectively they add up.

## What

- **`project thumbnail <id> --at <t>`** — single-frame extract for QA preview. `venom-bodywash-001`: 30 raw `ffmpeg -ss <t> -frames:v 1` invocations.
- **`project audio-stats <id>`** — VO loudness table (LUFS, peak, per-slot). `venom-bodywash-001`: 10 raw `ffmpeg -af volumedetect` invocations.
- **`project contact-sheet <id> --slots 'zine-*' --cols 5`** — hstack/grid montage. `ralphy-carousel-001`: 6 raw ffmpeg `hstack` invocations.
- **`render --music-variants`** — render N times with different music beds. `playdate-pixel-001`: 5 renders × 2 sessions, editing `MUSIC_FILE` const between renders.
- **`project zip <id> [--selected|--all]`** — handoff bundle. `appstore-takeaminute-001`: 32 PNGs + curated 8-PNG zips assembled by hand.
- **`project create --kind image-pack`** — scaffolds image-pack project shape (no `scenes/`, `scenario.json`). `appstore-takeaminute-001`: video-shaped scaffold misled the agent.
- **`brand extract <svg>`** — SVG layer structure report. `twitch-fb-ads-001`: agent missed white-interior polygon twice, shipped wrong logo in v1 and v2.

## Why it matters

Each one is a ~30s addition to the CLI. Together they account for hundreds of raw ffmpeg / curl invocations per quarter, all bypassing the manifest and logs.

## Suggested fix

- Add each verb to `cli/commands/project.ts`, `cli/commands/render.ts`, or `cli/commands/brand.ts` as appropriate.
- Recipes in `cli/lib/ffmpeg-recipes.ts`.
- All log a row to `generations.jsonl` (kind: `util.<verb>`).

## Sources

- `workspace/projects/venom-bodywash-001/postmortem/03-cli-issues.md` — workaround inventory
- `workspace/projects/ralphy-carousel-001/postmortem/03-cli-issues.md` — #2
- `workspace/projects/playdate-pixel-001/postmortem/03-cli-issues.md` — #6
- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md`
- `workspace/projects/twitch-fb-ads-001/postmortem/03-cli-issues.md` — #5
- `workspace/projects/twitch-fb-ads-001/postmortem/05-workflow-fixes.md` — #1, #6
