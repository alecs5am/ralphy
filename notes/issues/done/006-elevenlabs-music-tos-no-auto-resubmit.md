# `generate music` doesn't auto-resubmit on ElevenLabs ToS rejection

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

ElevenLabs Music rejects prompts that name specific artists / producers / copyrighted tracks with `400 bad_prompt`, and crucially returns a `prompt_suggestion` field in the response body containing a sanitized rewrite that would succeed. The CLI surfaces only the raw error string today, forcing the agent to manually parse the response and rewrite the prompt.

## What

- `playdate-pixel-001`: 3 of 5 music prompts (Game Boy / Tetris / NES references) rejected; ~10 min per occurrence to hand-rewrite.
- `skater-spiderverse-001`: 2 of 4 rejected (ScHoolboy Q, Pop Smoke).
- `noski-people-001`: "Brian Eno"-style prompt blocked on first call; trivial generic retry succeeded.
- The memory entry `feedback_elevenlabs_music_no_artist_names` already exists but lives in user memory, not in code.

## Why it matters

Three projects per week hit this on the first music call. The provider literally hands the CLI a ready-to-resubmit replacement string and we throw it away.

## Suggested fix

- In `cli/lib/providers/media.ts → generateMusic()` error handler, parse `detail.data.prompt_suggestion`.
- Throw an `Error` with a structured `.promptSuggestion` field.
- Add `--auto-retry-on-tos-rejection` flag for one-shot resubmit using the provider-returned rewrite.
- Add a soft pre-submit linter (`cli/lib/music-prompt-lint.ts`) with a known artist-name regex set; emit a warning + suggested generic alternative before sending. Don't block.
- Document the constraint in MODELS.md ElevenLabs Music row under "Prompt content policy".

## Sources

- `workspace/projects/playdate-pixel-001/postmortem/03-cli-issues.md` — #4
- `workspace/projects/skater-spiderverse-001/postmortem/03-cli-issues.md` — #3, workflow-fixes #2, #5
- `workspace/projects/noski-people-001/postmortem/03-cli-issues.md` — #7
- MEMORY: `feedback_elevenlabs_music_no_artist_names`
