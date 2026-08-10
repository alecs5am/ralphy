# Task 2 Report — Persist projections for new generation attempts

## TDD evidence

- RED: `bun test tests/integration/cli-generation-domain.test.ts tests/integration/cli-generate-captions.test.ts` exited 1 with 16 passing and 2 failing tests. Both new assertions received `null` from `readGenerationInput()` because attempts persisted the legacy `{slot}` and `{slot,language,backend}` request shapes.
- GREEN: the same focused command exited 0 with 18 passing tests.

## Delivered

- `executeGeneratedArtifact` now requires and persists a `generationInput()` projection.
- Image (single and batch), video, voiceover, music, and SFX calls pass only approved text and parameter fields. Video references become counts and frame/image inputs become booleans; voice stores `voiceSpecified`, never a voice ID; music captures the original prompt before any provider retry rewrite.
- Captions persists only language and backend.
- Integration assertions read only `run_attempts.request_json` through `readGenerationInput()` and retain existing locator-free coverage.

## Validation

- `git diff --check` passed.
- The focused suite above passed. Task 4 owns the full Core gate.

## Concerns

None. No schema, dependency, migration, bridge, Desktop, or live `.ralphy` changes were made.
