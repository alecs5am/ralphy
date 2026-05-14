#!/usr/bin/env bash
# Bump npm/package.json to a new version and publish to npmjs.
#
# Requires:
#   - npm login session (`npm whoami` returns the account that owns the scope)
#   - 2FA — npm will prompt interactively for the OTP
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
  echo "✗ Not logged in to npm. Run: npm login" >&2
  exit 1
fi
ACCOUNT=$(npm whoami)
echo "→ npm account: ${ACCOUNT}"

# --- 2. Bump npm/package.json ----------------------------------------------
echo "→ Bumping npm/package.json to ${NEW_VERSION}"
jq --arg v "$NEW_VERSION" '.version = $v' "$NPM_DIR/package.json" \
  > "$NPM_DIR/package.json.tmp"
mv "$NPM_DIR/package.json.tmp" "$NPM_DIR/package.json"

# --- 3. Publish (interactive OTP) ------------------------------------------
echo "→ Publishing @alecs5am/ralphy@${NEW_VERSION} (you'll be prompted for OTP)"
cd "$NPM_DIR"
# `--access public` is also set via publishConfig in package.json, but the
# CLI flag is harmless and makes the intent obvious in the log.
npm publish --access public

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
