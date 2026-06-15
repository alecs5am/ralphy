# CLI pretty-mode pipeline had zero test coverage

> **Status:** done — 2026-06-15 (all 5 structural follow-ups closed: scripts/lint-out-coverage.ts wired into CI — 37 structured emitters covered; per-verb pretty snapshot tests via tests/fixtures/verb-shapes.ts; null/undefined→— policy fixed in output.ts/ui.ts array branches + asserted; a real FORCE_COLOR+NO_COLOR ANSI leak found + fixed (disableColor() rebuilds the chalk palette); --pretty force-render covered. Only the raw-PTY auto-detect branch is the documented optional gap — node-pty deliberately not added.)
> **Filed:** 2026-05-20
> **Folder:** issues
>
> **Re-checked 2026-05-27:** the 3 printer-layer fixes are live in `cli/lib/output.ts`
> (`formatGenericCell` JSON.stringifies object cells, see line ~99-104), and all 3 test
> files exist (`tests/unit/output-pretty.test.ts`, `output-pretty-fuzz.test.ts`,
> `tests/integration/cli-pretty-smoke.test.ts`). Still NOT done: per-verb snapshot tests,
> `scripts/lint-out-coverage.ts`, force-pretty/PTY integration variant, null-policy audit,
> ANSI-in-pipe audit. See "What remains open" — promote those 5 to `11-testing` when ready.

## Context

A user ran `bun run ralphy skill install --agent claude` on the freshly-deployed CLI and saw:

```
$ bun cli/index.ts skill install --agent claude
  installed  [object Object]
```

The JSON-mode output for the same command was correct. The bug lived in `cli/lib/output.ts → printObject`, which pushed top-level array-of-object values straight into `uiKv`. `uiKv` calls `String(value)` on each cell, and `String([{...}])` is `[object Object]`.

The user's reaction: "It worries me that an `[object Object]` bug exists at this stage. It casts doubt on the quality of our CLI tests." They were right — this is a structural test gap, not a one-off bug.

## What

The pretty pipeline (`cli/lib/output.ts` + `cli/lib/ui.ts`) had zero CLI-level coverage before this incident:

1. **Every existing integration test in `tests/integration/cli-*.test.ts` spawns `bun cli/index.ts` without a TTY.** Without a TTY, `process.stdout.isTTY` is `false` and the CLI auto-selects JSON mode. Pretty mode was never exercised.
2. **The only pre-existing tests that even loaded `cli/lib/output.ts` were `quiet-mode.test.ts`** (which checks that `-q` suppresses `ok` lines) and `build-cli-docs.test.ts` (auto-gen, unrelated). Neither asserted on the structure of pretty output.
3. **`tests/integration/cli-skill.test.ts` covers `skill install` but only asserts `exitCode === 0` + file existence on disk.** It never read what the CLI printed. The bug was invisible to that test.

The broader bug class — `String(obj)` leaking `[object Object]` into a user-facing render — turned out to have **three** distinct call sites inside `output.ts`:

| Site | What | Fix commit |
|---|---|---|
| `printObject` top-level | array-of-objects pushed raw into `uiKv` | `c94960d` |
| `formatGenericCell` array branch | `v.map(String).join(', ')` on objects | follow-up |
| `printObject` deep-level | `v.join(", ")` on arrays containing objects | follow-up |

A fuzz test (200 random-shape iterations) was added after the first fix and immediately caught the second and third sites. Without fuzz coverage, the second and third sites would still be live today, waiting for the right shape to surface them.

## Why it matters

- **User trust.** The first thing the user did with the deployed CLI tripped this. A new user's first hands-on impression decides whether they keep using the tool.
- **Class of bug.** `String(obj)` rendering is one of N similar pretty-mode bugs (`undefined` cells, truncated tables, ANSI codes leaking into pipes, etc.). Without invariant tests on the rendered output, the next class of bug ships the same way.
- **Coverage debt compounds.** Every new `out({...})` call site landed without a corresponding render assertion. The codebase has ~120 `out()` call sites across `cli/commands/` — each is a possible regression front.

## Notes

### What landed in this session (mitigation, not closure)

1. **Three printer-layer bug fixes** in `cli/lib/output.ts`:
   - `printObject` (top + deep) now stringifies object array elements with `JSON.stringify`, not `String()`.
   - `formatGenericCell` array branch ditto.
   - Top-level array-of-objects gets a `(N items — see below)` hint + a real columnar table.

2. **`tests/unit/output-pretty.test.ts`** — 6 unit tests with the exact shapes that flow through real `out()` calls (skill.install, multi-item arrays, empty arrays, scalar arrays, nested objects, JSON-mode contract).

3. **`tests/unit/output-pretty-fuzz.test.ts`** — 14 tests total:
   - 12 named realistic shapes from each major verb (skill.install, skill.list, project.list, models.list, generate.dryRun, doctor, generate.queued, ref.check, assets.empty, tags scalar, deep-nested, nullish).
   - 200 iterations of random-shape fuzz + 50 iterations of top-level-array fuzz. Invariants: no `[object Object]`, no standalone `undefined`, no JSON-escape leakage.

4. **`tests/integration/cli-pretty-smoke.test.ts`** — 7 integration tests that spawn `bun cli/index.ts --pretty <verb>` for safe-to-invoke verbs (bare dashboard, `models list`, `template list`, `skill list`, `config list`, `prompts library lookup`, `ref check`). Same invariants as fuzz. The `skill install` regression front itself lives in the unit layer because the integration smoke would need a sandboxed `~/.claude` to be repeatable.

### What remains open

This issue is **partially mitigated**, not closed. A complete remediation needs:

1. **Per-verb pretty snapshot tests** for the 30+ verbs that emit visible output. Each verb gets one canonical shape recorded; future drift trips the snapshot. The current smoke test only checks invariants ("no `[object Object]`"), not "the table layout is still readable."

2. **A linter on `out()` call sites.** Every `out(...)` call in `cli/commands/` should have a matching unit test that runs that exact shape through `out()` in pretty mode. A new lint script (`scripts/lint-out-coverage.ts`) could grep call sites and cross-reference against test files.

3. **Force-pretty integration variant.** Either a `--force-tty` flag on the CLI for tests, or a `node-pty` harness that spawns the CLI under a real PTY. The current smoke uses `--pretty` which works but doesn't test the TTY auto-detection path itself.

4. **`undefined` and `null` rendering audit.** The fuzz test catches standalone `undefined` cells but not e.g. `"key": null` rendering as `"key": —` (which is fine) vs `"key": null` (which is a regression). Encode the policy in the styleguide section of `docs/developing-ralphy.md` and assert it.

5. **ANSI-in-pipe audit.** Pretty mode currently emits ANSI even when piped if `--pretty` is set explicitly. Verify against the styleguide ("`--pretty` should still respect `NO_COLOR`").

When promoting to SPEC: probably lands as `roadmap/11-testing/PRD.md` subsection "Pretty-mode invariants" with 4-5 task rows. Decision needed (`D-??`): do we keep the "auto-detect TTY" branch as the canonical path, or always require an explicit mode flag in CI / tests?

## Tracking

- Fix commit (printObject): `c94960d`
- Fix commit (formatGenericCell + deep printObject): pending
- Unit tests: `tests/unit/output-pretty.test.ts`, `tests/unit/output-pretty-fuzz.test.ts`
- Integration smoke: `tests/integration/cli-pretty-smoke.test.ts`
- Test count delta: 416 → 443 (+27)
