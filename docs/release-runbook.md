# Release runbook

Operational reference for the maintainer running `/release`. The skill at
[`.agents/skills/release/SKILL.md`](../.agents/skills/release/SKILL.md) drives the
happy path; this doc covers what to do **when something goes wrong**.

> **Channel order is canonical:** GitHub Release → Homebrew tap → npm. Each later
> channel depends on the GitHub artifacts the prior step uploaded. The order is
> baked into [`.github/workflows/release.yml`](../.github/workflows/release.yml)
> and the `/release` skill's verification loop.

## The 3 publish channels

| Channel | Surface | Owned by | Verified by |
|---|---|---|---|
| **GitHub Release** | `dist/binaries/ralphy-*` + `SHA256SUMS` | `release.yml` workflow | `install.sh` clean-machine smoke (09.01.01) |
| **Homebrew tap** | `alecs5am/homebrew-tap/Formula/ralphy.rb` | tap-bump workflow (separate repo) | `brew install` smoke (09.06.03) |
| **npm** | `@alecs5am/ralphy` scoped package | `npm publish` from `/release` skill | `npm i -g` smoke (09.06.04) |

All three reference the same `vX.Y.Z` tag and the same set of binaries — there is no
version drift between channels (per [`09-D-05`](../roadmap/09-distribution-and-release/OPEN-QUESTIONS.md#decision-log)).

## Happy path

```text
/release  →  status         → confirm clean tree, on main
          →  diff           → review commits since last release
          →  semver propose → patch / minor / major
          →  changelog      → grouped by Conventional Commits prefix
          →  bump           → package.json + cli/lib/version.ts + npm/package.json
          →  docs-sync      → docs-mintlify/ refreshed if CLI changed
          →  tag + push     → kicks release.yml
          →  CI watch       → wait for the workflow to finish
          →  brew bump      → CI from the tap repo PRs the new version + sha256
          →  npm publish    → run from the maintainer machine with org token
          →  last-commit    → scripts/release/last-release-commit gets the new HEAD
```

Only manual step: the diff approval before tag push.

## What "All-channels-or-none" actually means (09.02.04)

The acceptance criterion is **not** a transactional 3-way publish — that's not possible
across heterogeneous registries. Instead:

1. **Cut the GitHub Release first.** Until that succeeds (binaries uploaded, SHA256SUMS
   present), neither brew nor npm can move forward. If GH fails, nothing else has happened.
2. **Brew + npm fail independently.** If the GH release succeeded but brew tap bump fails
   or npm publish errors, the `/release` skill **reports which channel succeeded and which
   failed** in its final summary.
3. **Recovery is manual.** Use the runbook below.

## Recovery: one channel failed mid-publish

### GitHub Release uploaded but brew tap bump failed

Most likely cause: tap PR couldn't auto-merge (sha256 mismatch, formula syntax error).

```bash
# 1. Inspect the tap PR
gh pr list --repo alecs5am/homebrew-tap
gh pr view <PR#> --repo alecs5am/homebrew-tap --comments

# 2. Pull the SHA256SUMS from the just-cut release
gh release view <tag> --json assets --jq '.assets[] | select(.name=="SHA256SUMS")'

# 3. Manually update the formula sha256 + version, push to the tap PR branch
git clone https://github.com/alecs5am/homebrew-tap
# … edit Formula/ralphy.rb … commit … push …

# 4. Re-run brew install smoke locally
brew uninstall ralphy 2>/dev/null || true
brew tap alecs5am/tap
brew install alecs5am/tap/ralphy
ralphy --version
```

### GitHub Release uploaded but npm publish failed

Most likely cause: stale npm token, version already published, network error.

```bash
# 1. Verify the version is not already on npm
npm view @alecs5am/ralphy versions --json | jq -r '.[-3:]'

# 2. Re-run npm publish from the bumped npm/ directory
cd npm/
npm publish --access public

# 3. Smoke
npm install -g @alecs5am/ralphy@<version>
ralphy --version
```

### Everything succeeded but a smoke test caught a runtime bug

Don't try to amend the release. [09.04.03](../roadmap/09-distribution-and-release/SPEC.md)
makes this an invariant: `E_RELEASE_IMMUTABLE`. Instead:

1. **Mark the release as broken on GitHub** — edit the Release body, prepend
   `⚠️ KNOWN BROKEN — see <issue link> for details. Use vX.Y.Z-1 or wait for the next cut.`
2. **Open a tracking issue** with the failure mode + reproducer.
3. **Cut a new patch release** with the fix. The broken version stays installable for
   audit but the README + Mintlify install snippets always point at `latest`, so new
   users naturally land on the fixed version.

> **Why no `delist` automation in v1.0:** A `ralphy release delist <version>` verb is
> in the post-launch backlog (`01.11.x`). v1.0 ships the manual procedure above because
> deleting GitHub Releases / unpublishing npm versions is destructive and rare, and an
> automated path would have to handle subtle cases (npm unpublish window, brew tap PR
> reversal) that we don't have well-understood enough to script.

## Channel-specific gotchas

### Homebrew

- The tap repo is **`alecs5am/homebrew-tap`**, separate from this one.
- The tap-bump workflow lives in that repo, triggered by a GitHub Release in this one.
- Formula auto-merge requires `brew test` to pass — if it fails the PR sits open.
- `brew install alecs5am/tap/ralphy` works **3-5 minutes after the PR merge** (formula
  visibility takes a moment to propagate through brew's CDN). The smoke workflow sleeps
  5 minutes before testing for this reason.

### npm

- The wrapper is **`npm/`** in this repo; its `version` field must match `package.json` /
  `cli/lib/version.ts` exactly.
- The postinstall script downloads the matching binary from the just-cut GitHub Release.
  If GH Release isn't done uploading when `npm publish` runs, the postinstall fails for
  the first ~30 seconds of downloads — `/release` skill orders the steps so this doesn't
  happen in practice.
- npm token must have **2FA-bypass** scope for CI publishes — see
  [`09.04.04`](../roadmap/09-distribution-and-release/SPEC.md) credential preflight.

### install.sh / install.ps1

- Both scripts resolve `latest` via the GitHub Releases API. If GH is having an outage,
  installs fail with a clear error pointing at the URL it tried to fetch.
- macOS Gatekeeper: `install.sh` strips `com.apple.quarantine` via `xattr -d`. Verified
  by the install-smoke workflow (09.01.01).
- Windows SmartScreen: `install.ps1` strips MOTW via `Unblock-File`. Verified by the
  install-smoke workflow (09.01.02).

## Pre-release: dry-run a release locally

Before `/release` cuts a real tag:

```bash
bun test                            # full suite must pass
bun run lint:errors                 # catalog drift
bun run lint:help-examples          # landing ↔ --help parity
bun run cli:surface:check           # cli-surface.md fresh
bun run docs:cli:check              # Mintlify CLI ref fresh
bun run lint:docs-links:fast        # internal links resolve
bun run build:bin                   # all platforms build
ls -lh dist/binaries/               # binaries are reasonable size (~60-80MB each)
```

The `/release` skill runs all these as part of its pre-flight. If any fails, the skill
refuses to proceed.

## After publish

Within 24h of a release:

1. Check the install-smoke workflow finished green on all 4 channels.
2. Spot-check the README and Mintlify quickstart — version numbers, install commands.
3. Verify the GitHub Release page renders the changelog correctly.
4. If this was a milestone release (v0.2, v0.3, …) per
   [`09-D-03`](../roadmap/09-distribution-and-release/OPEN-QUESTIONS.md#decision-log),
   update [`roadmap/README.md`](../roadmap/README.md) "Milestone path" section to mark
   the milestone shipped.

## Related

- [`09-D-01`](../roadmap/09-distribution-and-release/OPEN-QUESTIONS.md#decision-log) —
  why we don't pay for an Apple Developer ID.
- [`09-D-02`](../roadmap/09-distribution-and-release/OPEN-QUESTIONS.md#decision-log) —
  PS1 is the only Windows install channel.
- [`09-D-03`](../roadmap/09-distribution-and-release/OPEN-QUESTIONS.md#decision-log) —
  staged v0.X milestones.
- [`09-D-04`](../roadmap/09-distribution-and-release/OPEN-QUESTIONS.md#decision-log) —
  doctor update check.
- [`09-D-05`](../roadmap/09-distribution-and-release/OPEN-QUESTIONS.md#decision-log) —
  single release channel (no beta track).
