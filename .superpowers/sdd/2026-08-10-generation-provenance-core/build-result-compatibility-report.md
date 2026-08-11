# Build-result media provenance compatibility report

## Scope and root cause

- Kept the schema, writers, bridge contract, DTOs, and Desktop unchanged.
- Extended only the existing ArtifactRevision producer lookup.
- The reader previously recognized direct `RunResult(artifact_revision)` rows but not an admitted recovered `RunResult(build) -> succeeded same-Run Build -> exact BuildOutput` relationship.
- The fix is one compound SQL query. `UNION` deduplicates a Run represented by both routes, and the existing global `ORDER BY ... LIMIT 2` ambiguity bound remains before consumer visibility.
- Build traversal requires `build.run_id = result.run_id`, `build.state = 'succeeded'`, and the exact requested `build_outputs.artifact_revision_id`.
- A nonterminal Build cannot receive a Build RunResult through the store/schema contract. A failed Build with an exact output and admitted Build result is covered and remains `unknown/not-recorded`.

## TDD evidence

The first RED attempt exposed an invalid test-only backend value and was corrected before accepting the RED. The valid RED was:

```text
bun test tests/integration/domain-run-queries.test.ts -t "media generation"
```

Result: exit 1; `8 pass`, `3 fail`. The exact recovered and owner-consumer Build routes returned `unknown`, while a direct Run plus a distinct Build Run incorrectly returned the direct producer instead of `ambiguous`.

After the one-query implementation, the same command passed `11 tests`, `65 assertions`, and `0 failures`.

Load-bearing coverage includes:

- recovered provider/model/cost/safe-input detail without raw response, metadata, or path leakage;
- same-Run direct plus Build route deduplication;
- direct Run A plus Build Run B ambiguity;
- two distinct Build producer ambiguity;
- mismatched RunResult Run versus Build Run exclusion;
- failed Build exclusion;
- sole invisible consumer Build producer returning `unknown/not-recorded`;
- all pre-existing direct, RunObject, cursor, target authorization, privacy, and bridge cases.

## Verification

```text
bunx tsc --noEmit
bun test tests/integration/domain-run-queries.test.ts tests/integration/domain-query-surfaces.test.ts tests/integration/cli-bridge-domain-contract.test.ts tests/integration/cli-bridge.test.ts
bun run lint
bun test --timeout 45000 tests/unit/
bun test --timeout 45000 tests/integration/
bun run build:bin:current
```

Results:

- focused query/bridge gate: `75 pass`, `636 assertions`, `0 fail`;
- full lint: exit 0, including TypeScript, store boundary, no-legacy-state, no-Cyrillic, and CLI surface checks;
- full unit: `2,947 pass`, `13,798 assertions`, `0 fail` in 329.72 seconds;
- full integration: `878 pass`, `6,595 assertions`, `0 fail` in 262.77 seconds;
- current binary build and smoke: exit 0, `ralphy-darwin-arm64 --version` returned `0.3.0`;
- scoped diff check: exit 0.

No live domain database, migration transcript, schema, bridge method, Desktop source, package, install, or user media was changed.
