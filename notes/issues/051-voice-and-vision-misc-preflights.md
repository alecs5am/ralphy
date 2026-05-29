# Misc preflights: voice-exists, scribe language hint, vision language/region, size-flag

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** low
> **Category:** cli

## Context

Four small preflight / metadata gaps clustered into one issue because each is a 5-line fix.

## What

- **Voice-existence preflight.** `ralphy generate voiceover` submits to ElevenLabs without checking the voice ID exists in the user's library. `analog-horror-fridge-001`: community voice `w0qxkVp258FYdWJTCMrs` disappeared between sessions; loudnorm step then double-normed old files because regen failed silently.
- **Scribe language hint.** `ralphy generate captions` (ElevenLabs Scribe) misdetected English as `rus` on a clean source; no `--language en` hint, no low-confidence surfacing. `ralphy-vs-higgsfield-001`: "Pick a door" transcribed as "Pick up the".
- **Vision analyze language/region.** `ralphy ref analyze` vision JSON doesn't surface detected text-language / script / region. `flipper-hypermotion-001`: wrong "Japanese" framing on a Korean reference video.
- **`--size` silently ignored.** `--size 1290x2796` on `gemini-3-pro-image-preview` / `gpt-5.4-image-2` is silently ignored — model snaps to native 768×1376 without warning. `appstore-takeaminute-001`: users expected Apple App Store native resolution.

## Why it matters

Each gap fails silently in a different way. Voice → wrong VO loudness. Scribe → unusable captions. Vision → wrong project framing. Size → unexpected upscaler pass needed.

## Suggested fix

- Pre-flight `GET /v1/voices/<id>` in `cli/lib/providers/media.ts → generateVoiceover()` with fail-fast message: "voice not in library: <id>". Add `ralphy voice exists <id>` for explicit checks.
- Add `--language en|ru|...` hint to `ralphy generate captions`; surface low-confidence words in JSON output.
- Add `language_detected_in_text` / `script_detected` / `region_hints` fields to vision analyze JSON in `cli/lib/eval/refs.ts`.
- Warn at submit time when `--size` doesn't match endpoint's natural output. Add `--aspect 9:16` alias mapping to natural resolution.

## Sources

- `workspace/projects/analog-horror-fridge-001/POSTMORTEM.md` — voice existence
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/03-cli-issues.md` — #9 scribe language
- `workspace/projects/flipper-hypermotion-001/POSTMORTEM.md` — vision language detect
- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md` — size flag
