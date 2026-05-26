# `ralphy audio remove-silence` verb

> **Status:** idea
> **Filed:** 2026-05-25
> **Folder:** ideas

## Context

Filed during the design pass for the `ralphy-audio-explainer` skill (2026-05-25 chat). The skill needs to trim dead air from raw podcast audio before transcription — otherwise the resulting video has the pacing of a podcast cut, not of a montage.

ffmpeg has the primitive (`silenceremove`), and the codebase already has `cli/lib/ffmpeg-recipes.ts` with `loudnorm`, `sidechain`, `concat` recipes. The skill currently calls the ffmpeg recipe via an inline `bunx tsx` invocation as a workaround. A real CLI verb would clean that up and make the recipe reusable beyond this skill.

## What

Add a fifth recipe to the `ralphy audio` family:

```
ralphy audio remove-silence \
  --in <input.mp3> \
  --out <output.mp3> \
  [--threshold -40dB] \
  [--min-silence 0.6] \
  [--keep-padding 0.2] \
  [--write-cut-map <path.json>]
```

Behavior:
- Input: a single audio file (mp3 / wav / m4a / any ffmpeg-readable).
- Detects silences ≥ `--min-silence` seconds where the level is below `--threshold` dBFS.
- Removes the detected silences. Optionally keeps `--keep-padding` seconds at the head + tail of each kept segment so cuts don't sound abrupt.
- Output: the trimmed audio file.
- Optional: writes a `cut-map.json` of `[{ original_start, original_end, trimmed_start, trimmed_end }]` so downstream tools (e.g. a remapper for non-aligned word-level transcripts) can reanchor timestamps.

Implementation: thin wrapper around ffmpeg's `silenceremove` filter, exposing the three knobs above + the cut-map writer. Logs as a `generation` with `kind: "audio-recipe"` to `generations.jsonl`.

## Why

1. **The audio-to-longform pipeline needs it.** Without it, the rendered video reads as a raw podcast, not a montage. The skill workaround (inline tsx) is fragile.
2. **It's a primitive, not a workflow.** Belongs in `cli/lib/ffmpeg-recipes.ts` alongside `loudnorm` / `sidechain` / `concat`. The mental model in `docs/playbooks/editor.md` already includes it as a recipe family.
3. **Other workflows want it too.** Voiceover cleanup pre-`generate captions` (any flow), interview tightening (`interview-dialog` template), trim-on-import for user-supplied VO.

## Open questions

- Default `--threshold` value. -40 dBFS is conservative (preserves quiet speech); -30 dBFS is aggressive (catches more dead air, risks clipping soft consonants). The skill defaults to -40; the CLI should match.
- Should `--keep-padding` default to 0 (tightest cut) or 0.2s (more natural-sounding)? Likely 0.2.
- Cut-map JSON format: agree on shape before shipping so downstream tools don't churn.
- Tests: smoke via `bunx tsx cli/index.ts audio remove-silence --in fixtures/dead-air.mp3 --out /tmp/out.mp3` + ffprobe duration assertion. Integration test compares cut-map JSON against a known-good reference.

## Acceptance

- Verb shipped, lints pass (`lint:help-examples`, `lint:errors`).
- `docs-mintlify/reference/cli/audio.mdx` regenerated.
- `docs/cli-surface.generated.md` regenerated.
- `ralphy-audio-explainer` skill body updated to call the verb instead of the inline `bunx tsx` workaround.
- Smoke test + integration test in `tests/`.

## Promotion path

When the user approves: promote this note to `roadmap/todo/XX-YY-ZZ-ralphy-audio-remove-silence.md` with frontmatter `status: todo`, category `cli/audio`, then delete this file.
