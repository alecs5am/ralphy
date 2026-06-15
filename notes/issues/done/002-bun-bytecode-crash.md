# `bun build --compile --bytecode` produces a binary that crashes at startup

> **Status:** RESOLVED 2026-06-15 — fixed by the bun upgrade (1.2.22 → 1.3.14) + a release-time smoke gate.
> **Filed:** 2026-05-20
> **Folder:** issues
>
> **Resolution 2026-06-15 (bun 1.3.14):** the bytecode interop bug is GONE on 1.3.14.
> Built the current-platform binary WITH bytecode (`tsx scripts/build-binaries.ts --current`,
> bytecode on) — no "Failed to generate bytecode" warning, and the binary ran
> `--version` (→ `0.3.0`), `--help`, and `models list` all exit 0, no `function wrapper`
> crash. So the crash was a Bun bug fixed somewhere between 1.2.22 and 1.3.14, not a
> Ralphy module issue — the `201c38e` bisect (follow-up #1) is moot and was not run.
>
> Changes landed this session:
> - **Re-enabled bytecode** (follow-up #3): dropped `--no-bytecode` from `build:bin`
>   and `build:bin:current` in `package.json`.
> - **Added the release-time smoke test** (follow-up #4): `scripts/build-binaries.ts`
>   now takes `--smoke`, which execs the just-built current-platform binary's
>   `--version` after the build and exits non-zero if it crashes or prints no
>   semver — closing the "build reports success on a binary that doesn't run" gap
>   that let this regression sit on `main`. Both `build:bin*` scripts pass `--smoke`,
>   so it protects local AND CI builds. `release.yml` also carries an explicit
>   defense-in-depth `Smoke-test built binary` step. Pure verdict
>   (`evaluateSmokeResult`) is unit-tested in `tests/unit/build-binaries-smoke.test.ts`.
>
> Follow-ups #1 and #2 (bisect + upstream-file the broken module) are obsolete —
> there was no broken Ralphy module; the fix came from upstream Bun.

## Context

Cutting v0.2.0. Step 6 of the release skill (local current-platform build smoke test) failed: `dist/binaries/ralphy-darwin-arm64 --version` crashed at startup with:

```
TypeError: Expected CommonJS module to have a function wrapper.
If you weren't messing around with Bun's internals, this is a bug in Bun.
Bun v1.2.22 (macOS arm64)
```

The build itself emitted a non-fatal warning before this: `error: Failed to generate bytecode for ./index.js`. Despite the wording the build was reported successful and the binary was written. It just didn't run.

## Bisect

| Commit | Bytecode warning | Binary runs |
|---|---|---|
| `2aca623` (v0.1.0 — last good release) | yes | **yes** |
| `201c38e` (cli: implement 01-CLI v1.0 surface) | yes | **no** (crash above) |
| `5828c88` (distribution: category 09) | yes | no |
| `9547976` (docs+landing: category 07) | yes | no |
| `a50a699` (skills: lint:skills + Copilot adapter) | yes | no |
| `cd2db67` (prompts+templates: closes category 02) | yes | no |
| HEAD (`0371672`) | yes | no |

So the regression was introduced by **`201c38e`** — "cli: implement 01-CLI v1.0 surface — catalog, NDJSON, dry-run, clone, skill install, new". That single commit added ~8 new modules:

- `cli/lib/skill/installer.ts`
- `cli/lib/skill/scaffold.ts`
- `cli/lib/skill/wizard.ts`
- `cli/lib/stream/command.ts`
- `cli/lib/stream/ndjson.ts`
- `cli/lib/templater/loader.ts`
- `cli/lib/ui.ts`
- `cli/lib/update-check.ts`

One of them uses an import / re-export pattern Bun's bytecode pass can't function-wrap as CommonJS. The exact culprit was not isolated — narrowing it down requires reverting subsets of `201c38e` and rebuilding for each, which was out of scope for cutting the release.

## What changed (immediate mitigation)

`package.json`:

- `build:bin` → `tsx scripts/build-binaries.ts --no-bytecode`
- `build:bin:current` → `tsx scripts/build-binaries.ts --current --no-bytecode`

The CI `Release` workflow (`.github/workflows/release.yml`) calls `bun run build:bin`, so it inherits the flag. v0.2.0 binaries published from this point on are correct but ~50ms slower on cold start and slightly larger on disk than they would be with bytecode.

## Why

Bytecode is purely a startup-time optimization. Disabling it produces a fully working binary at the cost of:

- ~50ms slower cold start (negligible for a CLI that does network calls on most verbs)
- Marginally larger file (59 MB → 59 MB locally; unchanged in practice)
- A small ongoing CI build time penalty

The trade-off is acceptable for the release. Re-enabling bytecode is a follow-up, not a blocker.

## Follow-up work (not done yet)

1. **Bisect within `201c38e`** to find the specific module that breaks bytecode wrapping. Likely candidate: a module that mixes `import` of a CommonJS dep with re-export, or uses `require()` from inside an ESM file. The 8 modules listed above are the candidate set.
2. **Once isolated, refactor that module** so Bun can bytecode-wrap it. The Bun docs on `--bytecode` note that some interop edge cases still bork; an isolated repro would be filable upstream at <https://github.com/oven-sh/bun/issues>.
3. **Re-enable `--bytecode`** in `build:bin` / `build:bin:current` once the module is fixed.
4. **Add a release-time smoke test** that runs the just-built binary's `--version` and fails the workflow if it crashes. The current build script reports success on a binary that doesn't run — that gap let this regression sit on `main` from `201c38e` through v0.2.0 unnoticed.

## Notes

- The "Failed to generate bytecode" message has been on `main` since `201c38e` shipped. v0.1.0 also emitted it, but Bun fell back to a working non-bytecoded binary in that case. After `201c38e` Bun still produces a binary, but the binary itself is broken — the failure mode quietly worsened without changing the warning.
- This is exactly why step 6 of the release skill (local current-platform smoke test before tag-push) exists. It caught the issue. The release didn't ship broken binaries.
