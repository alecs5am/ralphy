#!/usr/bin/env bash
# Bump alecs5am/homebrew-tap to point at a new ralphy release.
#
# Pulls SHA256SUMS from the published GitHub Release, regenerates
# Formula/ralphy.rb with the new version + sha256-pinned URLs, commits
# and pushes to the tap repo.
#
# Usage:
#   ./scripts/release/update-brew-tap.sh <new-version>
#   e.g. ./scripts/release/update-brew-tap.sh 0.0.2

set -euo pipefail

NEW_VERSION="${1:-}"
if [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 <new-version>  (without the v prefix, e.g. 0.0.2)" >&2
  exit 1
fi

TAP_REPO="${RALPHY_BREW_TAP:-alecs5am/homebrew-tap}"
REPO="${RALPHY_REPO:-alecs5am/ralphy}"
TAG="v${NEW_VERSION}"

# --- 1. Pull SHA256SUMS from the published release --------------------------
SHA_URL="https://github.com/${REPO}/releases/download/${TAG}/SHA256SUMS"
echo "→ Fetching ${SHA_URL}"
TMP_SHAS=$(mktemp)
trap 'rm -f "$TMP_SHAS"' EXIT
if ! curl -fsSL "$SHA_URL" -o "$TMP_SHAS"; then
  echo "✗ SHA256SUMS not found at $SHA_URL — has the CI build finished?" >&2
  echo "  Watch with: gh run watch -R ${REPO} --exit-status" >&2
  exit 1
fi

extract_sha() {
  awk -v name="$1" '$2 == name { print $1 }' "$TMP_SHAS" | head -1
}

DARWIN_ARM_SHA=$(extract_sha "ralphy-darwin-arm64")
DARWIN_X64_SHA=$(extract_sha "ralphy-darwin-x64")
LINUX_ARM_SHA=$(extract_sha "ralphy-linux-arm64")
LINUX_X64_SHA=$(extract_sha "ralphy-linux-x64")

for var in DARWIN_ARM_SHA DARWIN_X64_SHA LINUX_ARM_SHA LINUX_X64_SHA; do
  if [ -z "${!var}" ]; then
    echo "✗ Could not extract $var from SHA256SUMS" >&2
    cat "$TMP_SHAS" >&2
    exit 1
  fi
done

echo "  darwin-arm64: $DARWIN_ARM_SHA"
echo "  darwin-x64:   $DARWIN_X64_SHA"
echo "  linux-arm64:  $LINUX_ARM_SHA"
echo "  linux-x64:    $LINUX_X64_SHA"

# --- 2. Clone the tap & rewrite Formula/ralphy.rb ---------------------------
WORK=$(mktemp -d)
trap 'rm -rf "$WORK" "$TMP_SHAS"' EXIT
echo "→ Cloning ${TAP_REPO} into ${WORK}"
gh repo clone "$TAP_REPO" "$WORK" -- --quiet

cat > "$WORK/Formula/ralphy.rb" <<EOF
class Ralphy < Formula
  desc "Open-source UGC video factory CLI — one prompt to finished mp4"
  homepage "https://github.com/${REPO}"
  version "${NEW_VERSION}"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/${REPO}/releases/download/${TAG}/ralphy-darwin-arm64"
      sha256 "${DARWIN_ARM_SHA}"

      def install
        bin.install "ralphy-darwin-arm64" => "ralphy"
      end
    end
    on_intel do
      url "https://github.com/${REPO}/releases/download/${TAG}/ralphy-darwin-x64"
      sha256 "${DARWIN_X64_SHA}"

      def install
        bin.install "ralphy-darwin-x64" => "ralphy"
      end
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/${REPO}/releases/download/${TAG}/ralphy-linux-arm64"
      sha256 "${LINUX_ARM_SHA}"

      def install
        bin.install "ralphy-linux-arm64" => "ralphy"
      end
    end
    on_intel do
      url "https://github.com/${REPO}/releases/download/${TAG}/ralphy-linux-x64"
      sha256 "${LINUX_X64_SHA}"

      def install
        bin.install "ralphy-linux-x64" => "ralphy"
      end
    end
  end

  test do
    assert_match "${NEW_VERSION}", shell_output("#{bin}/ralphy --version")
  end
end
EOF

# --- 3. Commit + push -------------------------------------------------------
cd "$WORK"
if git diff --quiet Formula/ralphy.rb; then
  echo "  Formula already at v${NEW_VERSION} — nothing to do."
  exit 0
fi

git add Formula/ralphy.rb
git commit -m "ralphy: bump to ${TAG}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main

echo ""
echo "✓ Updated ${TAP_REPO} → ralphy ${TAG}"
echo "  brew update && brew upgrade ralphy"
