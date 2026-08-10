# Task 3 Report: Exact media generation read model

## Scope

- Added `MediaGenerationTarget`, `GenerationAttemptDetailDto`, and `MediaGenerationDetailDto` without changing `RunAttemptDto`.
- Added `getMediaGenerationDetail` as one scoped SQLite read transaction.
- Resolves Artifact Revision producers through `run_results` and RunObject producers through their direct Run.
- Returns bounded `p1` attempt pages with input exposed only through `readGenerationInput`.
- Aggregates known cost across every attempt independently from the requested page.
- Added exact-target, ambiguity, status, cost, pagination, privacy, and validation integration coverage.

## TDD evidence

RED command:

```text
bun test tests/integration/domain-run-queries.test.ts -t "media generation"
```

RED result: exit 1, `0 pass`, `1 fail`, `1 error`.

```text
SyntaxError: Export named 'getMediaGenerationDetail' not found in module '.../cli/lib/store/runs.ts'.
```

GREEN command:

```text
bun test tests/integration/domain-run-queries.test.ts -t "media generation"
```

GREEN result: exit 0, `6 pass`, `0 fail`.

## Final verification

```text
bunx tsc --noEmit
bun test tests/integration/domain-run-queries.test.ts tests/integration/domain-query-surfaces.test.ts
git diff --check -- cli/lib/store/types.ts cli/lib/store/runs.ts tests/integration/domain-run-queries.test.ts tests/integration/domain-query-surfaces.test.ts
```

Result: exit 0; `39 pass`, `0 fail`, `378 expect()` calls; diff check clean.

## Concerns

None. The full Core gate remains Task 4's responsibility as specified.
