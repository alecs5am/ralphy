#!/usr/bin/env bash
# Bump npm/package.json to a new version and publish to npmjs.
#
# Auth model:
#   ~/.npmrc holds a Granular Access Token with the "bypass 2FA" capability
#   for the @alecs5am scope. This makes publishes non-interactive (no OTP
#   prompt), so the script runs end-to-end inside the /release skill.
#
#   Rotate the token at https://www.npmjs.com/settings/alecs5am/tokens.
#   When you generate a replacement, tick "Allow this token to bypass 2FA"
#   (the field lives under Permissions; easy to miss).
#
# Usage:
#   ./scripts/release/publish-npm.sh <new-version>
#   e.g. ./scripts/release/publish-npm.sh 0.0.2

set -euo pipefail

NEW_VERSION="${1:-}"
if [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 <new-version>  (without the v prefix, e.g. 0.0.2)" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NPM_DIR="$REPO_ROOT/npm"

# --- 1. Sanity check --------------------------------------------------------
if ! npm whoami >/dev/null 2>&1; then
  echo "✗ Not logged in to npm. Persist a bypass-2FA token:" >&2
  echo "    https://www.npmjs.com/settings/alecs5am/tokens → Generate Granular Access Token" >&2
  echo "    echo '//registry.npmjs.org/:_authToken=npm_XXX' >> ~/.npmrc && chmod 600 ~/.npmrc" >&2
  exit 1
fi
ACCOUNT=$(npm whoami)
echo "→ npm account: ${ACCOUNT}"

# Quick capability probe — packing is harmless but exercises the registry
# auth. If the token is missing bypass 2FA, the publish step below fails
# with a clear 403 message that points users at the regen path.
echo "→ Verifying tarball builds + auth is live"
( cd "$NPM_DIR" && npm pack --dry-run > /dev/null )

# --- 2. Bump npm/package.json ----------------------------------------------
echo "→ Bumping npm/package.json to ${NEW_VERSION}"
jq --arg v "$NEW_VERSION" '.version = $v' "$NPM_DIR/package.json" \
  > "$NPM_DIR/package.json.tmp"
mv "$NPM_DIR/package.json.tmp" "$NPM_DIR/package.json"

# --- 3. Publish (non-interactive, token-backed) ----------------------------
echo "→ Publishing @alecs5am/ralphy@${NEW_VERSION}"
cd "$NPM_DIR"
# `--access public` mirrors publishConfig.access in package.json. Keeping
# the flag explicit makes failures easier to grep in CI logs.
if ! npm publish --access public; then
  echo "" >&2
  echo "✗ npm publish failed." >&2
  echo "  If the error mentions 'bypass 2FA', your ~/.npmrc token doesn't" >&2
  echo "  have the bypass-2FA capability. Regenerate at:" >&2
  echo "    https://www.npmjs.com/settings/alecs5am/tokens" >&2
  echo "  with the 'Allow this token to bypass 2FA' checkbox ticked." >&2
  exit 1
fi

# --- 4. Smoke check the registry --------------------------------------------
echo "→ Verifying registry…"
sleep 3   # give npm a moment to propagate
LATEST=$(npm view "@alecs5am/ralphy" version 2>/dev/null || echo "?")
echo "  npm registry now reports: @alecs5am/ralphy@${LATEST}"
if [ "$LATEST" = "$NEW_VERSION" ]; then
  echo "✓ npm publish succeeded"
else
  echo "  (mismatch — check https://www.npmjs.com/package/@alecs5am/ralphy)"
fi
