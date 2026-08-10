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

## Fix round 1

- RED: `bun test tests/unit/generation-input.test.ts` failed because `generationInput()` accepted `/private/fixture.png` as a `size` parameter. The root cause was the generic string/number/boolean parameter check.
- GREEN: `bun test tests/unit/generation-input.test.ts tests/integration/cli-generation-domain.test.ts tests/integration/cli-generate-captions.test.ts` passed with 26 tests.
- The shared constructor/parser now accepts only named value types and bounded string domains: dimension sizes, numeric aspect ratios, known resolutions, `ru|en|auto`, and the three transcription backends. Raw values outside those domains are rejected by the projection parser; generation callers omit an unusual unrecordable size/aspect/resolution/language/backend value so execution is not blocked.
- The integration suite queries each exact attempt request through `readGenerationInput()` for single and batch images, video references/frames/audio, voice settings and ID exclusion, music, SFX, and captions. Direct sentinels cover paths, output fields, data URIs, notes, provider failures, external IDs, and credentials.

## Fix round 2

- RED: the constructor/parser rejected `1024 X 1024`; unit coverage captured the existing connector-supported spelling before implementation.
- GREEN: the focused unit and integration command passed with 28 tests.
- Positive image dimensions now use the connector's case-insensitive `WxH` grammar and persist the compact canonical spelling. Unsupported executable raw values remain omitted from provenance rather than blocking generation.
