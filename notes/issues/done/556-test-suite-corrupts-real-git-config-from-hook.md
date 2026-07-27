# 556 — Running the suite from a git hook wrote into the developer's real git config

> **Status:** done — 2026-07-27
> **Filed:** 2026-07-27
> **Folder:** issues/done
> **Severity:** high
> **Category:** tests / tooling — data safety

## Context

Git exports `GIT_DIR` (and `GIT_INDEX_FILE`) to every hook it runs. Those
variables **override `cwd`** for repository discovery — passing `cwd` to a child
`git` process is not enough to point it at another repo.

`tests/unit/article-publish.test.ts` builds a fixture site repo with
`spawnSync("git", …, { cwd: repo })` and no env scrub, including:

```ts
g(["init", "-q"]);
g(["config", "user.email", "t@t.dev"]);
g(["config", "user.name", "T"]);
```

The `.husky/pre-commit` hook runs `bun test tests/unit/ …`. So on every
`git commit`, those calls ran against the **developer's real repository**, not
the tmp fixture. Observed 2026-07-27 on this machine after a pre-commit run:

- `core.bare = true` written into `.git/config` — every later `git status` in the
  worktree failed with `fatal: this operation must be run in a work tree`.
- `[user] name = T`, `email = t@t.dev` written into `.git/config`, silently
  overriding the repo's commit identity (`alecs5am
  <209291055+alecs5am@users.noreply.github.com>` in all prior commits). A commit
  made in that window would have been attributed to `T <t@t.dev>` and pushed to
  GitHub that way.
- The test's own two `github-pages` cases failed, since they were asserting
  against the wrong repo — which is how the leak surfaced.

Reproduced deterministically against a throwaway canary repo:

```bash
GIT_DIR=$C/.git GIT_INDEX_FILE=$C/.git/index bun test tests/unit/article-publish.test.ts
# → 2 fail, and $C/.git/config gains `bare` + `[user] T / t@t.dev`
```

## What

Strip the ambient git location vars (`GIT_DIR`, `GIT_WORK_TREE`,
`GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`,
`GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CONFIG`) from the child env at both git
spawn sites:

- `cli/lib/publish/article.ts` → `gitEnv()` in the `git()` helper. This is the
  **product-side** half of the bug: `ralphy article-publish --targets
  github-pages` invoked from any git hook, CI wrapper, or `git rebase --exec`
  would have committed the article into the wrong repository.
- `tests/unit/article-publish.test.ts` → a `gitIn(repo, args)` helper that every
  git call in the file now goes through.

## Why it matters

A test suite that writes into the developer's repo config — commit identity
included — is a data-safety bug, not a flake. The `core.bare` symptom is loud;
the silent `user.name` rewrite is the dangerous one, because it changes the
authorship of everything committed afterwards.

## Scope / acceptance

- [x] `GIT_DIR=<canary> GIT_INDEX_FILE=<canary> bun test tests/unit/article-publish.test.ts`
      → 17/17 pass and the canary's `.git/config` is byte-identical afterwards.
- [x] No other git spawn site in `cli/`, `tests/`, `scripts/`, `studio/`
      (grep for `spawnSync("git"` / `spawn("git"` — only these two files).
- [x] Repo repaired on this machine: `core.bare` unset, local identity restored
      to the value every prior commit used.

## Notes

Adjacent, not fixed here: `.husky/pre-commit` runs the full unit + integration
suite (~2.5 min) with no placeholder API keys, so it also fails on
`cli-user-journey-post-install.test.ts` in any checkout without a `.env`
(`.husky/pre-push` does set `OPENROUTER_API_KEY=test-placeholder`). Worth
aligning the two hooks' env, and worth considering a `--timeout`-friendly
narrower pre-commit scope. File separately if it bites again.
