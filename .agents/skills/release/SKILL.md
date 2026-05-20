---
name: release
description: Cut a new release of the `ralphy` CLI across all distribution channels in one shot — GitHub Release (binaries + checksums), Homebrew tap (`alecs5am/homebrew-tap`), and npm (`@alecs5am/ralphy`). Inspects commit history since the previous release (anchored by `scripts/release/last-release-commit`, falling back to the last tag), proposes a semver bump (major / minor / patch) by Conventional-Commits-ish rules, drafts a grouped changelog, bumps `package.json` / `cli/lib/version.ts` / `npm/package.json` in lockstep, refreshes `docs-mintlify/` so the published docs match the new CLI surface, lets CI build + publish the GitHub Release, then bumps the brew formula with the CI-built sha256s and runs `npm publish --access public`. Finally rewrites `scripts/release/last-release-commit` so the next release diff starts from a clean baseline. USE WHEN the user types `/release`, says "cut a release", "publish a release", "сделай релиз", "залей релиз", "напиши release notes", "tag a new version", or after a meaningful chunk of CLI work landed on `main`. ALSO FIRE proactively after the user merges a non-trivial PR / lands a feature they explicitly call "ready to ship" / says "это финал" / "это последнее на сегодня". DO NOT FIRE for documentation-only or landing-only commits unless explicitly asked (those don't need a tagged release). HARD INVARIANTS — never push the tag or publish without showing the diff + draft changelog and getting confirmation first; never amend a published release / npm version / brew formula (cut a new one); never skip the `bun run build:bin` smoke-check, the docs-mintlify sync, the brew + npm steps, or the `last-release-commit` bump (each missing step leaves a different distribution channel stale). The skill is **CLI + CLI-docs only**: it touches `docs-mintlify/` because those docs describe the binary it ships, but never the marketing `landing/`, `.agents/skills/`, or other auxiliary trees.
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

## Hard scope: CLI + CLI-docs

This skill **never** touches:
- `landing/` — the Next.js marketing landing is shipped independently (Vercel / Netlify).
- `docs/`, `README.md` — these are repo-internal playbook / orientation docs. Only `package.json` / `cli/lib/version.ts` / `npm/package.json` / `AGENTS.md` (the single version line) / `scripts/release/last-release-commit` / `docs-mintlify/**` get edited under this skill.
- `.agents/skills/` — other skills are versioned with the repo, not with the binary.
- `src/videos/` — Remotion compositions ride along but aren't user-facing.

**Two targeted exceptions** that go *inside* the version-bump commit (or the docs-sync commit right before it):

1. **`AGENTS.md`** carries a single line (`> **Current ralphy CLI: \`vX.Y.Z\`** ...`) that lives in the system prompt of every ralphy session. The `/release` skill bumps that line in lockstep with the four real version files so the agent always knows which binary the user *should* be on. Find/replace only — never restructure AGENTS.md otherwise.
2. **`docs-mintlify/**`** is the public docs site for the CLI (hosted at the Mintlify URL — see `docs-mintlify/docs.json` for the deploy config). It describes the same binary this skill ships, so it MUST be kept in sync. Each release walks the diff since the last release commit and updates any affected page under `docs-mintlify/cli/`, `docs-mintlify/reference/`, `docs-mintlify/authoring/`, plus `quickstart.mdx` / `introduction.mdx` / `concepts.mdx` if the surface they describe changed. New top-level commands → new `.mdx` page + entry in `docs.json`. See **step 3b** below.
3. **`scripts/release/last-release-commit`** stores the exact commit SHA the *previous* release shipped. Step 1 reads it to scope the diff; step 5 rewrites it with `HEAD` of the new release commit so the next `/release` invocation starts from a clean baseline.

If the user asks to "release the landing" — handback. Not this skill.

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

# Diff baseline — prefer the explicit pointer at scripts/release/last-release-commit
# (rewritten by the previous /release run), then fall back to the last tag, then
# to HEAD~50 if this is a freshly-cloned repo with no tags / no pointer.
BASELINE="$(cat scripts/release/last-release-commit 2>/dev/null | tr -d '[:space:]')"
if [ -z "$BASELINE" ] || ! git cat-file -e "$BASELINE^{commit}" 2>/dev/null; then
  BASELINE="$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~50)"
  echo "⚠️  scripts/release/last-release-commit missing or stale — falling back to ${BASELINE}"
fi
echo "Release diff baseline: ${BASELINE}"
git log --no-merges --pretty=format:"%h %s" "${BASELINE}..HEAD"
git diff --stat "${BASELINE}..HEAD"
git status --short
```

What you need:
- The diff baseline commit (from `scripts/release/last-release-commit`, the single source of truth for "what shipped last time"). **Keep `${BASELINE}` in a variable for the rest of the release** — steps 3, 4, and 4b all reuse it.
- The previous tag (for the GitHub Release notes section title).
- The working tree state.
- A rough sense of churn (commit count + files touched).
- Confirmation that both `gh` and `npm` resolve to the `alecs5am` account.

**If working tree isn't clean: stop.** Tell the user, suggest committing or stashing.

**If `scripts/release/last-release-commit` is missing entirely** (first time after this skill change rolled out): use the last tag as baseline for this release, but still rewrite the pointer in step 5 so subsequent runs are clean.

**If `npm whoami` errors:** the bypass token in `~/.npmrc` is missing or revoked. Stop and ask the user to regenerate per the "Credentials" section at the bottom of this skill.

### 2 — Decide the version bump

Inspect commit subjects since `${BASELINE}` and apply Conventional-Commits-ish logic:

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
- `git log --no-merges --pretty=format:"%h %s%n%b%n---" "${BASELINE}..HEAD"` — the canonical input. Read full bodies, not just subjects, so `BREAKING CHANGE:` footers don't slip past.
- `gh pr list --search "merged:>=YYYY-MM-DD" --json number,title,author` — PR titles are usually richer than raw commit subjects.
- `gh api repos/alecs5am/ralphy/compare/${BASELINE}...main --jq '.commits[].commit.message'` — handy if `${BASELINE}` is older than the local clone has fetched.

### 3b — Plan the `docs-mintlify/` sync

The Mintlify docs site is the public-facing reference for the binary this skill ships. Out-of-date docs published alongside a new binary are a release defect, not a follow-up task.

Walk the diff under three CLI-surface paths and identify any user-visible changes:

```bash
# What CLI surface changed since the last release?
git diff --stat "${BASELINE}..HEAD" -- cli/commands/ cli/lib/ scripts/install.sh
git log --no-merges --pretty=format:"%h %s" "${BASELINE}..HEAD" -- cli/commands/ cli/lib/ scripts/install.sh
```

For each user-visible change, decide which Mintlify page(s) need an update. The current layout (verify with `ls docs-mintlify/`):

| What changed in code | Page(s) to touch under `docs-mintlify/` |
|---|---|
| New top-level command (e.g. `ralphy foo`) added in `cli/commands/foo.ts` | New `cli/foo.mdx` + add to `docs.json` navigation; cross-link from `cli/overview.mdx` |
| New / renamed flag on existing command | The matching `cli/<verb>.mdx` page |
| Sub-command added to existing resource (e.g. `ralphy project log-prompt`) | The matching `cli/<resource>.mdx` page |
| New / removed model in `cli/lib/providers/` or `MODELS.md` | `reference/models.mdx` |
| New env var, install path, or `doctor` check | `quickstart.mdx` and/or `reference/troubleshooting.mdx` |
| Conceptual change (project layout, asset pool, template kinds, log format) | `concepts.mdx`, `introduction.mdx`, or the matching `authoring/*.mdx` |
| Pure refactor with no user-visible delta | Nothing — note "no docs delta" in the changelog and move on |

Rules for the doc edits:
- **Use `ralphy <cmd> --help` as ground truth** when wording a flag or sub-command description. Don't invent flags from memory.
- **Examples must use the new version.** Hard-coded `vX.Y.Z` strings inside `docs-mintlify/` (e.g. install snippets, `--version` output) get bumped in the same find/replace as `AGENTS.md` in step 5.
- **`docs.json`** holds the nav tree. New page → add an entry under the right group. Renamed page → rename the entry. Use `jq` or `sd` to keep the file valid JSON.
- **Smoke-check the build** if any structural change happened: `bunx mintlify dev docs-mintlify` (if Mintlify CLI is installed locally) or just `jq . docs-mintlify/docs.json` to confirm the nav file is still valid JSON. Don't ship a broken docs build.
- **`docs-mintlify/` lives in this repo and is deployed by Mintlify on push to `main`.** The version-bump commit is what triggers the docs redeploy — you don't `gh release` the docs separately.
- **Don't write the edits yet.** This step just produces the *plan* — a list of files + a one-liner per file describing what changes. The actual writes happen alongside the version bump in step 5, so they all land in one atomic commit. (Exception: if a docs edit is large or risky, stage it in the working tree now so the step-4 diff shows it — just don't commit until step 5.)

Output for step 4 review: either the list `[file → change]` pairs, or the literal string "no docs delta".

### 4 — Show diff + draft, confirm

Print to the user:
- Proposed new version (e.g. `0.0.1 → 0.1.0`).
- The full draft changelog (markdown).
- The diff baseline: `${BASELINE}` (so the user can sanity-check what "since last release" means).
- The exact list of files that will change in the bump commit: `package.json`, `cli/lib/version.ts`, `npm/package.json`, **`AGENTS.md`** (single line), plus whatever `docs-mintlify/**` pages came out of step 3b.
- A separate trailing commit will rewrite `scripts/release/last-release-commit` (step 5) — call this out so the user isn't surprised by two commits.

**Wait for explicit user confirmation** ("yes" / "go" / "погнали") before doing anything destructive.

### 5 — Bump version files + commit

Four files hold the version — keep them in sync so `ralphy --version`, the GitHub Release tag, the brew formula version, the npm package version, AND the AGENTS.md system-prompt line all agree. The version-bump commit also carries the `docs-mintlify/` edits from step 3b and the pointer rewrite so the next `/release` run has a clean baseline.

```bash
NEW_VERSION="0.1.0"  # without the v prefix
TODAY="$(date -u +%Y-%m-%d)"

# Core version files
jq --arg v "$NEW_VERSION" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
sd 'export const VERSION = "[^"]+"' "export const VERSION = \"${NEW_VERSION}\"" cli/lib/version.ts
jq --arg v "$NEW_VERSION" '.version = $v' npm/package.json > npm/package.json.tmp && mv npm/package.json.tmp npm/package.json

# AGENTS.md system-prompt line — the agent reads this on every session start
sd '> \*\*Current ralphy CLI: `v[^`]+`\*\* \(released [^)]+\)' \
   "> **Current ralphy CLI: \`v${NEW_VERSION}\`** (released ${TODAY})" AGENTS.md

# docs-mintlify: bump any hard-coded version strings (install snippets, --version
# example output, etc). This is a sweep — actual content edits already happened
# in step 3b and should already be staged in the working tree.
PREV_VERSION="$(git show "${BASELINE}:package.json" 2>/dev/null | jq -r .version)"
if [ -n "$PREV_VERSION" ] && [ "$PREV_VERSION" != "$NEW_VERSION" ]; then
  rg -l --fixed-strings "v${PREV_VERSION}" docs-mintlify/ 2>/dev/null \
    | xargs -r -I {} sd "v${PREV_VERSION}" "v${NEW_VERSION}" {}
  rg -l --fixed-strings "\"${PREV_VERSION}\"" docs-mintlify/ 2>/dev/null \
    | xargs -r -I {} sd "\"${PREV_VERSION}\"" "\"${NEW_VERSION}\"" {}
fi

git add package.json cli/lib/version.ts npm/package.json AGENTS.md docs-mintlify/
git commit -m "chore(release): v${NEW_VERSION}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

# Diff-baseline pointer for the NEXT release. Lands in a SECOND commit so the
# tag (created in step 7) points at the clean version-bump commit and the
# pointer reflects "everything on main as of right now".
git rev-parse HEAD > scripts/release/last-release-commit
git add scripts/release/last-release-commit
git commit -m "chore(release): bump diff baseline to v${NEW_VERSION} commit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Verification before tagging:** confirm all four version files agree, the pointer file matches the *parent* of HEAD (the release commit we'll tag), and `docs-mintlify/docs.json` is still valid JSON.

```bash
grep -E "0\.0\.|0\.1\.|1\.0\." package.json cli/lib/version.ts npm/package.json AGENTS.md | head -10
diff <(cat scripts/release/last-release-commit) <(git rev-parse HEAD~1)   # must be empty — points at the release commit
jq -e . docs-mintlify/docs.json >/dev/null && echo "docs.json OK"
```

### 6 — Local build smoke-test (current platform only)

Don't ship a tag the local box can't build:

```bash
bun run build:bin:current
dist/binaries/ralphy-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed -e 's/x86_64/x64/' -e 's/aarch64/arm64/') --version
```

The full cross-compile happens on CI; this is just a sanity check. If it fails, **stop** and fix before tagging.

### 7 — Tag + push (CI builds + publishes the GitHub Release)

The tag goes on the **release commit** (HEAD~1 — `chore(release): v${NEW_VERSION}`), **not** the pointer-bump commit (HEAD — `chore(release): bump diff baseline ...`). This keeps the tag attached to the actual version bump.

```bash
NEW_TAG="v${NEW_VERSION}"
git tag -a "$NEW_TAG" HEAD~1 -m "Release ${NEW_TAG}"
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
- **Don't skip the docs-mintlify sync (step 3b).** A release that ships a new CLI verb but leaves `docs-mintlify/` stale is a public docs defect — Mintlify auto-deploys on push to `main`, so out-of-date pages go live the moment you push the bump commit. If the diff is genuinely doc-irrelevant, say "no docs delta" in the changelog and move on; don't silently skip the check.
- **Don't forget to bump `scripts/release/last-release-commit`.** It's the diff baseline for the next release. If you forget, the next `/release` either falls back to the previous tag (works, but loses any post-tag commits the pointer was meant to capture) or — worse — re-includes the version-bump commit itself in the next changelog.
- **Don't tag the pointer-bump commit.** The tag belongs on the `chore(release): v${NEW_VERSION}` commit (`HEAD~1` after step 5), not on the trailing pointer commit. Tagging the wrong commit means `git describe` returns one short of the real release.

## When NOT to fire

- The user is mid-development on a feature branch (you'd be tagging unfinished work).
- The local current-platform build fails — fix the build first.
- There are no commits since the last tag (no-op release).
- The change is **only** in `landing/`, `docs/` (internal playbooks), `.agents/skills/`, or a non-CLI directory — that's not what this skill ships. Note: a docs-only change inside `docs-mintlify/` *also* doesn't need a tagged release — Mintlify auto-redeploys on any push to `main`. Just commit and push without invoking `/release`.
- The user said "do not release" / "сначала проверим" earlier in the same conversation.
- `npm whoami` / `gh auth status` is not the right account.

## State sources

- Current version: `package.json` → `.version` (single source of truth, mirrored to `cli/lib/version.ts` and `npm/package.json`).
- **Diff baseline (what shipped last time):** `scripts/release/last-release-commit` — a one-line file containing a single git SHA, rewritten by step 5 of every release. Falls back to `git describe --tags --abbrev=0` only if missing/stale.
- Previous tag (for release-notes header / GH compare URL): `git describe --tags --abbrev=0`.
- Default branch: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
- Build script: `scripts/build-binaries.ts`.
- Brew tap repo: `alecs5am/homebrew-tap` (overrideable via `RALPHY_BREW_TAP`).
- npm package: `@alecs5am/ralphy`, lives in `npm/` of this repo.
- Public docs site (CLI reference): `docs-mintlify/` — content + `docs.json` nav config. Auto-deployed by Mintlify on push to `main`.
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
