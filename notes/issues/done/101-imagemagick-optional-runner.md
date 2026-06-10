# ImageMagick optional runner + doctor wiring

> **Status:** done — 2026-06-10
> **Filed:** 2026-06-08
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

The image post-processing layer (`cli/lib/image/cutout.ts`, surfaced as `ralphy image cutout|fit|crunch`) runs entirely on **ffmpeg** + **headless Chromium (Playwright)**. ImageMagick is used nowhere at runtime, yet several of those recipes are awkward ffmpeg/Chromium workarounds for things ImageMagick does in one native call — issue #049 already described the missing utility verbs as "1-liner ffmpeg/imagemagick recipes", and #021's anchor resize/convert is a plain `convert` job.

Adopting ImageMagick is worth it for stills, but it must NOT become a hard prereq: it has no clean static-binary npm package (unlike ffmpeg-static), and idea-001 is actively trying to *reduce* host-install friction. So it lands as an **optional dependency with graceful fallback** — used when present, with the existing ffmpeg/Chromium paths kept as the fallback.

This issue is the foundation the other ImageMagick issues (#102, #103) build on; land it first.

## What

Add a thin ImageMagick runner mirroring the existing ffmpeg runner in `cli/lib/image/cutout.ts`:

- `cli/lib/image/magick.ts` exporting:
  - `magickBinary(): string | null` — resolves the binary: `RALPHY_MAGICK_PATH` env override → IM7 `magick` on PATH → IM6 `convert` on PATH → `null`. Cache the probe.
  - `hasMagick(): boolean` — cheap truthy wrapper callers branch on for graceful fallback.
  - `ensureMagick(): string` — returns the binary or throws a clear "ImageMagick not found (optional) — `brew install imagemagick`" error, for call sites with no fallback.
  - `runMagick(args, meta)` — spawns the binary, logs to `workspace/projects/<id>/logs/generations.jsonl` via `logGeneration` with `provider: "imagemagick"`, `cost_usd: 0`, optional `projectId`/`note`, exactly like the existing `runFfmpeg` helper.
- Wire `ralphy doctor`: add `imagemagick` to `report.deps`, probe via the existing `bin()` helper, but report it **info-level (never a blocker)** — e.g. `✓ imagemagick (7.1.x)` or `· imagemagick not found (optional — enables faster still ops)`. Do NOT push to `report.blockers`.

## Why it matters

- Unblocks the clear ImageMagick wins (#102 alpha-trim, #103 convert) behind one shared, logged, project-aware runner instead of each verb re-deriving spawn + gen-log plumbing.
- Optional posture keeps the single-prereq install story idea-001 wants — no creator is forced into a second `brew install`.
- Gen-log parity: ImageMagick ops show up in `generations.jsonl` with provider/latency/cost like ffmpeg and playwright ops do today, so postmortems see the full lineage.

## Notes

- IM7 ships `magick`; IM6 ships `convert` (and `magick` may be absent). Probe both; prefer `magick`. When invoking the legacy `convert`, the arg order is `convert <in> <ops> <out>` — keep the runner agnostic by passing full arg arrays from callers.
- Mirror the `provider` taxonomy already in `cutout.ts`: `"ffmpeg"`, `"playwright"` → add `"imagemagick"`.
- Cross-links: idea-001 (dependency posture / bundling), #037 (created `cutout.ts`), #049 (the utility-verb cluster), #021 (convert/resize precedent).

## Scope / acceptance

- New file `cli/lib/image/magick.ts` with `magickBinary` / `hasMagick` / `ensureMagick` / `runMagick`, honoring `RALPHY_MAGICK_PATH`.
- `cli/commands/doctor.ts`: `imagemagick` added to `report.deps`, probed info-level, never a blocker; pretty + JSON output both include it.
- Unit test in `tests/unit/`: `magickBinary` returns `null` when absent (no throw), `ensureMagick` throws the optional-dep message, `hasMagick` is `false` — all without ImageMagick installed (stub the probe). `runMagick` writes a `provider: "imagemagick"` gen-log line on success.
- `bun test` green; `bun run lint:errors` + `bun run lint:agents-md` clean; no Cyrillic.
- Sequence: foundational — land before #102 and #103.
