# Task 4 report: bridge generation provenance

## Scope

- Added advertised read method `media.generation.show` with exact `{ context, target, after?, limit? }` parsing.
- Accepted only `artifact-revision` and `run-object` targets with 1..128-character IDs.
- Defaulted pagination to 20, accepted at most 100, and delegated to `getMediaGenerationDetail`.
- Kept the `media.select` CAS mutation and returned the refreshed public media card.
- Left `media.list`, schema/core major, protocol, dependencies, migrations, live state, and Desktop unchanged.

## TDD evidence

- RED: `bun test tests/integration/cli-bridge-domain-contract.test.ts -t "media.select returns"` failed because the handler returned `ArtifactDto` fields instead of the public card.
- RED: `bun test tests/integration/cli-bridge-domain-contract.test.ts -t "media generation"` failed because `media.generation.show` was absent from capabilities.
- GREEN: both focused tests passed after the bridge change.
- Focused boundary gate: `bun test tests/integration/cli-bridge-domain-contract.test.ts tests/unit/bridge-boundaries.test.ts` passed 25 tests / 195 assertions before the final default-pagination assertion was added; the focused generation test then passed 55 assertions.

## Final Core gate

- Safe preflight printed only PID/RSS/command. Highest RSS was OrbStack Helper at 1,058,384 KiB; the next process was a renderer at 745,504 KiB.
- `bun run lint`: PASS.
- `bun test tests/integration/`, first attempt: the process was killed with exit 137 after the captured suites passed; no assertion failure was reported before termination.
- Clean-window retry authorized after the environmental kill: preflight max RSS was 813,536 KiB and visible Bun executables were at most 33,760 KiB; `bun test tests/integration/` then PASSed 861 tests / 6,535 assertions with exit 0 in 247.75 seconds.
- `bun run build:bin:current`: PASS, including its `ralphy-darwin-arm64 --version` smoke check (`0.3.0`).
- `./dist/ralphy --version`: BLOCKED — the build script emits `dist/binaries/ralphy-darwin-arm64`; this checkout has no `dist/ralphy` path.
- `git diff --check`: PASS.

## Residual concern

The prescribed `./dist/ralphy --version` path is stale relative to the current build script. Its built binary smoke check passed at `0.3.0`. Final RSS after the successful integration retry was 776,464 KiB for the highest process.
