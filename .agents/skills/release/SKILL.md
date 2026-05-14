---
name: release
description: Cut a new release of the `ralphy` CLI across all distribution channels in one shot — GitHub Release (binaries + checksums), Homebrew tap (`alecs5am/homebrew-tap`), and npm (`@alecs5am/ralphy`). Inspects commit history since the last tag, proposes a semver bump (major / minor / patch) by Conventional-Commits-ish rules, drafts a grouped changelog, bumps `package.json` / `cli/lib/version.ts` / `npm/package.json` in lockstep, lets CI build + publish the GitHub Release, then bumps the brew formula with the CI-built sha256s and runs `npm publish --access public`. USE WHEN the user types `/release`, says "cut a release", "publish a release", "сделай релиз", "залей релиз", "напиши release notes", "tag a new version", or after a meaningful chunk of CLI work landed on `main`. ALSO FIRE proactively after the user merges a non-trivial PR / lands a feature they explicitly call "ready to ship" / says "это финал" / "это последнее на сегодня". DO NOT FIRE for documentation-only or landing-only commits unless explicitly asked (those don't need a tagged release). HARD INVARIANTS — never push the tag or publish without showing the diff + draft changelog and getting confirmation first; never amend a published release / npm version / brew formula (cut a new one); never skip the `bun run build:bin` smoke-check or the brew + npm steps (a "release" that only updates GitHub leaves users on stale `brew upgrade` / `npm update`). The skill is **CLI-only**: it never touches the landing, `.agents/skills/`, docs, or any other auxiliary tree.
---

# Release skill — ralphy CLI across all channels

## When to fire

Hard triggers (always do it):
- User types `/release`
- "cut a release" / "publish a release" / "tag a new version"
- "сделай релиз" / "залей релиз" / "новый релиз"
- "release notes for the last week"
- "publish to brew/npm" — even if the binaries are already up

Proactive triggers (offer it, don't auto-execute):
- A meaningful CLI feature just landed on `main` and there are ≥5 commits since the last tag.
- User says "это финал" / "ready to ship" after a feature session.
- A new install instruction was just published and `brew upgrade` / `npm update` would resolve to the previous version.

## What I produce

Three live releases, all reachable from the same `vX.Y.Z` tag:

1. **GitHub Release** at `alecs5am/ralphy/releases/tag/vX.Y.Z` with 5 binaries
   (darwin-arm64/x64, linux-arm64/x64, windows-x64.exe) + `SHA256SUMS`,
   built and published by the `Release` GitHub Actions workflow on tag push.
2. **Homebrew tap** at `alecs5am/homebrew-tap` — `Formula/ralphy.rb` bumped
   to point at the new release with sha256-pinned URLs for each platform.
3. **npm registry** — `@alecs5am/ralphy@X.Y.Z` published with public access.
   The thin npm wrapper's `postinstall` hook downloads the matching binary
   from the GitHub Release the first time it runs.

All three reference the same `vX.Y.Z` tag and the same set of binaries — there is no version drift between channels.

## Hard scope: CLI only

This skill **never** touches:
- `landing/` — the Next.js landing is shipped independently (Vercel / Netlify).
- `docs/`, `README.md` — only `package.json` / `cli/lib/version.ts` / `npm/package.json` get edited for version-bump purposes.
- `.agents/skills/` — other skills are versioned with the repo, not with the binary.
- `src/videos/` — Remotion compositions ride along but aren't user-facing.

If the user asks to "release the landing" or "publish a docs update" — handback. Not this skill.

## End-to-end flow

Run the steps in order. After **step 4** you must stop and confirm before doing anything destructive. After step 6 the GitHub Release happens automatically via CI; steps 8 and 9 are local-only and require an authenticated `gh` (alecs5am) plus `npm login` session.

### 1 — Snapshot current state + credential preflight

```bash
# Credential preflight — both must succeed BEFORE any destructive step.
gh auth status --hostname github.com 2>&1 | head -5    # expect: account alecs5am, active
npm whoami                                              # expect: alecs5am

# Repo state
gh repo view alecs5am/ralphy --json defaultBranchRef,latestRelease | jq
git fetch origin --tags
git log --no-merges --pretty=format:"%h %s" $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~50")..HEAD
git diff --stat $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~50")..HEAD
git status --short
```

What you need: the previous tag, the working tree state, a rough sense of churn, plus confirmation that both `gh` and `npm` resolve to the `alecs5am` account.

**If working tree isn't clean: stop.** Tell the user, suggest committing or stashing.

**If `npm whoami` errors:** the bypass token in `~/.npmrc` is missing or revoked. Stop and ask the user to regenerate per the "Credentials" section at the bottom of this skill.

### 2 — Decide the version bump

Inspect commit subjects since the last tag and apply Conventional-Commits-ish logic:

| Pattern in commits | Bump |
|---|---|
| `BREAKING CHANGE:` body line OR `!:` in subject (e.g. `feat!:`) | **major** |
| At least one `feat:` / `feat(scope):` | **minor** |
| Only `fix:` / `chore:` / `docs:` / `refactor:` / `test:` / `style:` | **patch** |
| Pre-1.0.0 and there's a breaking change | **patch** (we're still in baseline shaping) |

Show the user the proposed bump in one line: *"5 feats + 8 fixes → minor → v0.1.0"*.

### 3 — Draft the changelog

Group commits into buckets, dropping noise (merge commits, version bumps, pure formatting):

```markdown
## Highlights
- 1-3 sentences of what users will actually feel different about.

## Features
- feat(scope): description (#PR)

## Fixes
- fix(scope): description (#PR)

## Internal / Chores
- chore: description
- refactor: description
```

Useful raw sources:
- `gh pr list --search "merged:>=YYYY-MM-DD" --json number,title,author` — PR titles are usually richer than raw commit subjects.
- `gh api repos/alecs5am/ralphy/compare/<prev-tag>...main --jq '.commits[].commit.message'` — pre-tag commits if the local clone doesn't have them.

### 4 — Show diff + draft, confirm

Print to the user:
- Proposed new version (e.g. `0.0.1 → 0.1.0`).
- The full draft changelog (markdown).
- The exact list of files that will change in the bump commit: `package.json`, `cli/lib/version.ts`, `npm/package.json`.

**Wait for explicit user confirmation** ("yes" / "go" / "погнали") before doing anything destructive.

### 5 — Bump version files + commit

Three files hold the version — keep them in sync so `ralphy --version`, the GitHub Release tag, the brew formula version, and the npm package version all agree.

```bash
NEW_VERSION="0.1.0"  # without the v prefix
jq --arg v "$NEW_VERSION" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
sd 'export const VERSION = "[^"]+"' "export const VERSION = \"${NEW_VERSION}\"" cli/lib/version.ts
jq --arg v "$NEW_VERSION" '.version = $v' npm/package.json > npm/package.json.tmp && mv npm/package.json.tmp npm/package.json

git add package.json cli/lib/version.ts npm/package.json
git commit -m "chore(release): v${NEW_VERSION}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### 6 — Local build smoke-test (current platform only)

Don't ship a tag the local box can't build:

```bash
bun run build:bin:current
dist/binaries/ralphy-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed -e 's/x86_64/x64/' -e 's/aarch64/arm64/') --version
```

The full cross-compile happens on CI; this is just a sanity check. If it fails, **stop** and fix before tagging.

### 7 — Tag + push (CI builds + publishes the GitHub Release)

```bash
NEW_TAG="v${NEW_VERSION}"
git tag -a "$NEW_TAG" -m "Release ${NEW_TAG}"
git push origin main
git push origin "$NEW_TAG"
```

The `Release` GitHub Actions workflow fires on tag push: cross-compiles all 5 binaries, generates `SHA256SUMS`, creates the GitHub Release with assets, and writes basic release notes. Watch it finish:

```bash
gh run watch -R alecs5am/ralphy --exit-status
```

If you want to replace the auto-generated notes with the changelog from step 3:

```bash
CHANGELOG_FILE=$(mktemp)
cat > "$CHANGELOG_FILE" <<'EOF'
<paste the full drafted changelog from step 3>
EOF
gh release edit "$NEW_TAG" --notes-file "$CHANGELOG_FILE"
rm -f "$CHANGELOG_FILE"
```

### 8 — Update the Homebrew tap

Wait until `gh run watch` exits cleanly — the brew step **depends** on the release's `SHA256SUMS` asset being present.

```bash
./scripts/release/update-brew-tap.sh "$NEW_VERSION"
```

That script (`scripts/release/update-brew-tap.sh`):
- Pulls `SHA256SUMS` from `https://github.com/alecs5am/ralphy/releases/download/${NEW_TAG}/SHA256SUMS`.
- Extracts per-platform hashes (darwin-arm64, darwin-x64, linux-arm64, linux-x64).
- Clones `alecs5am/homebrew-tap`, regenerates `Formula/ralphy.rb` with the new version + URLs + SHAs.
- Commits as `ralphy: bump to vX.Y.Z` and pushes to `main` of the tap.

Smoke-test the formula after:

```bash
brew update
brew upgrade ralphy   # or: brew install alecs5am/tap/ralphy
ralphy --version      # should match $NEW_VERSION
```

### 9 — Publish to npm

```bash
./scripts/release/publish-npm.sh "$NEW_VERSION"
```

That script (`scripts/release/publish-npm.sh`):
- Verifies `npm whoami` returns the `alecs5am` account.
- Probes auth + tarball with `npm pack --dry-run` (catches a bad token before bumping the version).
- Bumps `npm/package.json` to the new version (redundant safety — already done in step 5).
- Runs `npm publish --access public` from `npm/` — **non-interactive**. Auth comes from `~/.npmrc`, which holds a Granular Access Token with the "bypass 2FA" capability (rotated 2026-05-14). No OTP prompt.
- Verifies the registry now reports the new version.

If `npm publish` fails with `granular access token with bypass 2fa enabled is required`, the token in `~/.npmrc` has been revoked or regenerated without the bypass flag. Regenerate at https://www.npmjs.com/settings/alecs5am/tokens and tick **"Allow this token to bypass 2FA"** (the box is under Permissions, easy to miss). Then:

```bash
echo "//registry.npmjs.org/:_authToken=npm_NEW_TOKEN" > ~/.npmrc
chmod 600 ~/.npmrc
```

Smoke-test:

```bash
npm view @alecs5am/ralphy version   # should match $NEW_VERSION
```

### 10 — Verify all three install paths

Don't trust, verify:

```bash
# Direct from GH Release (what install.sh resolves to)
curl -fsSL "https://api.github.com/repos/alecs5am/ralphy/releases/latest" | jq -r '.tag_name'

# brew
brew info alecs5am/tap/ralphy | head -3

# npm
npm view @alecs5am/ralphy version
```

All three should print the new `vX.Y.Z` / `X.Y.Z`.

### 11 — Report

Print to the user a single-message summary with all three live URLs:

```
v0.1.0 published across all channels:
  • GitHub  → https://github.com/alecs5am/ralphy/releases/tag/v0.1.0
  • brew    → brew install alecs5am/tap/ralphy            (formula sha256-pinned)
  • npm     → npm install -g @alecs5am/ralphy@0.1.0       (binaries auto-fetched)
```

## Pitfalls to avoid

- **Don't `gh release create` manually.** CI does it on tag push. Manually creating the release would race with the workflow and produce duplicate assets.
- **Don't run `update-brew-tap.sh` before CI is done.** It pulls SHAs from the release's `SHA256SUMS` asset; if CI hasn't uploaded it yet, the script aborts with a friendly error. Run `gh run watch` between step 7 and step 8.
- **Don't bypass 2FA on npm.** `npm publish --otp=<code>` is fine if you can get the OTP into the script's stdin (e.g. via `read`), but `--ignore-scripts` style bypasses are not — they leave the package unpublishable without a manual `npm unpublish`.
- **Don't reuse a published version.** If `update-brew-tap.sh` fails halfway, **don't** delete + retag — bump to the next patch instead. Published versions on npm and brew are one-shot.
- **Don't commit `npm/vendor/`.** It's the postinstall download cache and is gitignored. Re-running `npm install` always re-fetches it.
- **Don't `bun run build:bin` (the full cross-compile) locally as part of the release.** CI does it; the local build is just the current-platform sanity check.
- **Don't bump major before 1.0.0.** Pre-1.0, breaking changes ride in `feat:` and get minor bumps. After 1.0.0, `feat!:` / `BREAKING CHANGE:` triggers major.

## When NOT to fire

- The user is mid-development on a feature branch (you'd be tagging unfinished work).
- The local current-platform build fails — fix the build first.
- There are no commits since the last tag (no-op release).
- The change is **only** in `landing/`, `docs/`, `.agents/skills/`, or a non-CLI directory — that's not what this skill ships.
- The user said "do not release" / "сначала проверим" earlier in the same conversation.
- `npm whoami` / `gh auth status` is not the right account.

## State sources

- Current version: `package.json` → `.version` (single source of truth, mirrored to `cli/lib/version.ts` and `npm/package.json`).
- Previous tag: `git describe --tags --abbrev=0`.
- Default branch: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
- Build script: `scripts/build-binaries.ts`.
- Brew tap repo: `alecs5am/homebrew-tap` (overrideable via `RALPHY_BREW_TAP`).
- npm package: `@alecs5am/ralphy`, lives in `npm/` of this repo.
- Helper scripts: `scripts/release/update-brew-tap.sh` and `scripts/release/publish-npm.sh`.
- Release workflow: `.github/workflows/release.yml` (fires on `push: tags: ['v*']`).

## Credentials (where they live)

The skill assumes these are persisted locally — it never asks for them mid-run:

- **GitHub** (gh CLI keyring) — `gh auth status` should show `alecs5am` as active.
  Used for: `git push`, `gh release edit`, `gh repo clone alecs5am/homebrew-tap`.
  Rotate via `gh auth login` if revoked.
- **npm** — `~/.npmrc` line `//registry.npmjs.org/:_authToken=npm_XXX`, chmod 600.
  Must be a Granular Access Token with "Allow this token to bypass 2FA" enabled, scoped to `@alecs5am/*` with read+write permission.
  Rotate at https://www.npmjs.com/settings/alecs5am/tokens.

`npm whoami` and `gh auth status --hostname github.com` are the two pre-flight checks. If either fails, **stop** and ask the user to refresh the relevant credential before proceeding.
