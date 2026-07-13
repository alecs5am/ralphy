---
name: dev-release
namespace: maintainer
description: >-
  Cut a Ralphy CLI release across GitHub Releases, Homebrew, and npm. Use when
  the user asks to release, tag, publish, or prepare release notes for the CLI.
  Public documentation and the marketing site live in sibling repositories and
  are synchronized separately when their content is affected.
---

# Release the Ralphy CLI

This skill ships the agent-facing CLI in this repository. It never releases the
marketing site, public docs site, desktop app, or unattended farm runtime.

## Repositories

- CLI: current repository, `alecs5am/ralphy`.
- Public docs: sibling `../ralphy-docs`, `alecs5am/ralphy-docs`.
- Marketing and library: sibling `../ralphy-web`, `alecs5am/ralphy-web`.
- Desktop: sibling `../ralphy-desktop`, `alecs5am/ralphy-desktop`.
- Unattended automation: sibling `../ralphy-farm`, `alecs5am/ralphy-farm`.

Only the CLI repository receives the `vX.Y.Z` release tag. If a CLI change
affects public documentation, update and push `ralphy-docs` before tagging the
CLI. Web, desktop, and farm changes follow their own release processes.

## Release contract

One version must reach all three CLI channels:

1. GitHub Release with platform binaries and `SHA256SUMS`.
2. `alecs5am/homebrew-tap` formula.
3. `@alecs5am/ralphy` on npm.

Never amend or replace an existing release. Never publish only one channel.

## Procedure

1. Confirm the current branch is `main`, the worktree is clean, and `gh auth
   status` plus `npm whoami` identify the expected maintainer.
2. Read `scripts/release/last-release-commit`, the latest `v*` tag, and commits
   since that baseline. Propose the semver bump and grouped release notes.
3. Inspect the diff for public-doc impact. If needed, update `../ralphy-docs`,
   validate `docs.json`, commit, and push that repository separately.
4. Run the CLI verification suite:

   ```bash
   bun run lint
   bun test --timeout 45000 tests/unit tests/integration
   bun run build:bin:current
   gitleaks detect --source .
   ```

5. After explicit user approval, update these version sources in lockstep:

   - `package.json`
   - `cli/lib/version.ts`
   - `npm/package.json`
   - the current-version line in `AGENTS.md`

6. Commit `chore(release): vX.Y.Z`, tag that commit `vX.Y.Z`, and push the
   commit and tag. Do not create the GitHub Release manually; the release
   workflow owns binaries, checksums, and the release object.
7. Watch the GitHub Actions release workflow to success.
8. Run `scripts/release/update-brew-tap.sh vX.Y.Z` and
   `scripts/release/publish-npm.sh X.Y.Z`, then verify both registries resolve
   the new version.
9. Update `scripts/release/last-release-commit` in a separate trailing commit
   so the next release has an exact baseline.

## Stop conditions

Stop before tagging when tests fail, versions disagree, credentials are wrong,
there are no releasable commits, or the user has not approved the proposed
version. Documentation-only changes in `ralphy-docs` do not require a CLI tag.
