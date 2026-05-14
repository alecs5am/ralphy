---
name: release
description: Cut a new GitHub Release for `ralphy`. Inspects commit history since the last tag, proposes a semver bump (major / minor / patch), drafts changelog notes grouped by type (feat / fix / docs / chore), bumps `package.json` version, builds platform binaries via `bun run build:bin`, creates the git tag, runs `gh release create` with the changelog + uploads the binaries + SHA256SUMS, and reports the live release URL. USE WHEN the user types `/release`, says "cut a release", "publish a release", "сделай релиз", "залей релиз", "напиши release notes", "tag a new version", or after a meaningful chunk of work landed on `main` that should be tagged. ALSO FIRE proactively after the user merges a non-trivial PR / lands a feature they explicitly call "ready to ship" / says "это финал" / "это последнее на сегодня". DO NOT FIRE for documentation-only commits unless explicitly asked (those don't need a tagged release). HARD INVARIANTS — never push the tag or upload assets without showing the diff + the draft changelog and getting confirmation first; never amend a published release (cut a new one); never skip the `bun run build:bin` step (`install.sh` 404s without uploaded binaries).
---

# Release skill — ralphy GitHub Releases

## When to fire

Hard triggers (always do it):
- User types `/release`
- "cut a release" / "publish a release" / "tag a new version"
- "сделай релиз" / "залей релиз" / "новый релиз"
- "release notes for the last week"

Proactive triggers (offer it, don't auto-execute):
- A meaningful feature just landed on `main` and there are ≥5 commits since the last tag
- User says "это финал" / "ready to ship" / "ну всё, по этому хватит" after a feature session
- A new install instruction was just published and the install.sh would 404 today
  (the script needs an actual release with uploaded binaries)

## What I produce

A live GitHub Release on `alecs5am/ralphy`:

1. New git tag (e.g. `v1.1.0`) pushed to `origin`
2. `package.json` `version` bumped to match
3. A commit `chore(release): vX.Y.Z` on `main` (or current default branch)
4. Five platform binaries uploaded as release assets:
   - `ralphy-darwin-arm64`
   - `ralphy-darwin-x64`
   - `ralphy-linux-x64`
   - `ralphy-linux-arm64`
   - `ralphy-windows-x64.exe`
5. `SHA256SUMS` file uploaded alongside
6. Release notes grouped by **Highlights / Features / Fixes / Chores / Internal**

The release fixes the `install.sh` → 404 problem (the installer reads `releases/latest` to resolve the version).

## End-to-end flow

The whole sequence below is one skill execution. Run the steps in order; after step 4 **stop and confirm with the user** before pushing anything.

### 1 — Snapshot current state

```bash
gh repo view alecs5am/ralphy --json defaultBranchRef,latestRelease | jq
git fetch origin --tags
git log --no-merges --pretty=format:"%h %s" $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~50")..HEAD
git diff --stat $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~50")..HEAD
```

You're looking for: the previous tag (`v1.0.0` if absent → "first release"), the working tree status, and a rough sense of churn.

If working tree isn't clean: **stop**. Tell the user, suggest committing or stashing first.

### 2 — Decide the version bump

Inspect commit messages since the last tag and apply Conventional-Commits-ish logic:

| Pattern in commits | Bump |
|---|---|
| `BREAKING CHANGE:` body line OR `!:` in subject (e.g. `feat!:`) | **major** |
| At least one `feat:` or `feat(scope):` | **minor** |
| Only `fix:` / `chore:` / `docs:` / `refactor:` / `test:` | **patch** |
| First release ever (no tags) | **v1.0.0** as the explicit baseline |

If the project's current version (`package.json`) is `1.0.0` and there are no tags yet, treat the first release as `v1.0.0` exactly (no bump) — the published baseline.

Show the user the proposed bump with a one-line justification: *"5 feats + 8 fixes → minor → v1.1.0"*.

### 3 — Draft the changelog

Group commits into buckets, dropping noise (merge commits, version bumps, `.DS_Store`-only changes):

```
## Highlights
- 1-3 sentences of what a user would actually feel different about

## Features
- feat(scope): description (#PR)

## Fixes
- fix(scope): description (#PR)

## Docs
- docs: description

## Chores / Internal
- chore: description
- refactor: description
```

Use `gh pr list --search "merged:>=YYYY-MM-DD" --json number,title,author` to pull PR titles since the previous release date when available — they're usually richer than raw commit subjects.

Use `gh api repos/alecs5am/ralphy/compare/<prev-tag>...main --jq '.commits[].commit.message'` if pre-tag commits aren't visible locally.

### 4 — Show diff + draft, confirm

Print to the user:
- Proposed new version
- The full draft changelog (markdown)
- The list of files that will change (`package.json` only, in this commit)

**Wait for explicit user confirmation** ("yes" / "go" / "погнали") before doing anything destructive.

### 5 — Bump version files + commit

Two files hold the version — keep them in sync so `ralphy --version` matches
the release tag:

```bash
NEW_VERSION="1.1.0"  # without the v prefix in package.json
jq --arg v "$NEW_VERSION" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json

# cli/lib/version.ts exports a hardcoded constant — bump it too.
sd 'export const VERSION = "[^"]+"' "export const VERSION = \"${NEW_VERSION}\"" cli/lib/version.ts

git add package.json cli/lib/version.ts
git commit -m "chore(release): v${NEW_VERSION}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### 6 — Build binaries

```bash
bun run build:bin
ls -la dist/binaries/
cat dist/binaries/SHA256SUMS
```

This produces five binaries + `SHA256SUMS`. Each ~80-120 MB. If the build fails on any target, **stop** and report — better to fix the build than to ship a partial release.

### 7 — Tag, push, create release

```bash
NEW_TAG="v${NEW_VERSION}"
git tag -a "$NEW_TAG" -m "Release ${NEW_TAG}"
git push origin main
git push origin "$NEW_TAG"

# Save the changelog to a temp file (avoids HEREDOC quoting issues with gh)
CHANGELOG_FILE=$(mktemp)
cat > "$CHANGELOG_FILE" <<'EOF'
<paste the drafted changelog from step 3 here verbatim>
EOF

gh release create "$NEW_TAG" \
  --title "${NEW_TAG}" \
  --notes-file "$CHANGELOG_FILE" \
  dist/binaries/ralphy-darwin-arm64 \
  dist/binaries/ralphy-darwin-x64 \
  dist/binaries/ralphy-linux-x64 \
  dist/binaries/ralphy-linux-arm64 \
  dist/binaries/ralphy-windows-x64.exe \
  dist/binaries/SHA256SUMS

rm -f "$CHANGELOG_FILE"
```

### 8 — Verify install path works

The whole point of cutting the release is making `install.sh` work for end users. Smoke-test it:

```bash
curl -fsSL "https://api.github.com/repos/alecs5am/ralphy/releases/latest" | jq '.tag_name, (.assets | length)'
# Expected: "vX.Y.Z" and at least 6 (5 binaries + SHA256SUMS)

# Download the binary for the current platform (no install — just verify the URL resolves)
ASSET="ralphy-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed -e 's/x86_64/x64/' -e 's/aarch64/arm64/')"
curl -fsSL -o /tmp/ralphy-test "https://github.com/alecs5am/ralphy/releases/latest/download/${ASSET}"
chmod +x /tmp/ralphy-test
/tmp/ralphy-test --version
```

If `--version` outputs the new version, you're done.

### 9 — Report

Print to the user:
- Live URL: `gh release view "$NEW_TAG" --json url --jq .url`
- Asset count + total size
- One-liner: *"v1.1.0 published, 5 binaries + checksums, install.sh now resolves."*

## Pitfalls to avoid

- **Don't `gh release create` before pushing the tag.** `gh` will silently create the tag from `HEAD` and you'll end up with the tag pointing somewhere unexpected if you weren't on the right commit.
- **Don't reuse a published version.** If you bumped to `v1.1.0` and the build fails, **don't** delete + re-create — bump to `v1.1.1` instead. Published versions are forever (people have already curl'd the SHA).
- **Don't skip SHA256SUMS.** `install.sh` doesn't verify yet, but it should soon; future-proof.
- **Don't push tags without notes.** A tag without a release page is invisible to most users.
- **Don't bundle release notes that say "fixed bugs".** If the bucket is empty say "no fixes this cycle" — vagueness is worse than honesty.
- **Don't bump major before v1.x.x.** Pre-1.0, the convention is patch-level breaking changes are fine, breaking → minor. We're already at 1.0.0 so this doesn't apply, but worth knowing if we ever 0.x.

## When NOT to fire

- The user is mid-development on a feature branch (you'd be tagging unfinished work).
- The `dist/binaries/` build has failed in the last 30 min and hasn't been re-verified.
- There are no commits since the last tag (no-op release).
- The user said "do not release" or "сначала проверим" in the same conversation.

## State sources

- Current version: `package.json` → `.version`
- Previous tag: `git describe --tags --abbrev=0`
- Default branch: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`
- Build output: `dist/binaries/`
- Build command: `bun run build:bin` (defined in `package.json`)
- Build script source: `scripts/build-binaries.ts`
- Installer: `install.sh` at the repo root — its `RALPHY_REPO` default is `alecs5am/ralphy`
