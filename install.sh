#!/usr/bin/env sh
# ralphy installer — fetch the latest GitHub Release binary for this platform.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh
#
# Override defaults via env:
#   RALPHY_REPO=<user>/<repo>      override repo (default: alecs5am/ralphy)
#   RALPHY_VERSION=v1.2.3          install a specific tag (default: latest)
#   RALPHY_BIN_DIR=$HOME/.local/bin  install dir (default shown)

set -e

# --- config ------------------------------------------------------------------
REPO="${RALPHY_REPO:-alecs5am/ralphy}"
VERSION="${RALPHY_VERSION:-latest}"
BIN_DIR="${RALPHY_BIN_DIR:-$HOME/.local/bin}"
BIN_NAME="ralphy"

# --- detect OS / arch --------------------------------------------------------
case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  *) echo "✗ Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=x64 ;;
  *) echo "✗ Unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

EXT=""
if [ "$OS" = "windows" ]; then EXT=".exe"; fi
ASSET="ralphy-${OS}-${ARCH}${EXT}"

# --- resolve version ---------------------------------------------------------
if [ "$VERSION" = "latest" ]; then
  echo "→ Resolving latest release for ${REPO}…"
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | head -1 \
    | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
  if [ -z "$VERSION" ]; then
    echo "✗ Could not find a published release for ${REPO}." >&2
    echo "  If you're testing locally, run \`bun run build:bin -- --current\` and copy" >&2
    echo "  dist/binaries/${ASSET} into ${BIN_DIR}/${BIN_NAME} manually." >&2
    exit 1
  fi
fi

URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
echo "→ Downloading ralphy ${VERSION} (${OS}/${ARCH})…"
echo "  ${URL}"

# --- download ----------------------------------------------------------------
mkdir -p "$BIN_DIR"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

if ! curl -fsSL "$URL" -o "$TMP"; then
  echo "✗ Download failed. Check that the release asset exists at ${URL}" >&2
  exit 1
fi

# --- install -----------------------------------------------------------------
DEST="${BIN_DIR}/${BIN_NAME}${EXT}"
mv "$TMP" "$DEST"
chmod +x "$DEST"

echo ""
echo "✓ Installed ralphy ${VERSION} → ${DEST}"

# --- PATH check --------------------------------------------------------------
case ":$PATH:" in
  *":$BIN_DIR:"*)
    ;;
  *)
    echo ""
    echo "  Note: ${BIN_DIR} is not in your PATH. Add this to your shell config:"
    echo "    export PATH=\"${BIN_DIR}:\$PATH\""
    echo ""
    ;;
esac

# --- next step ---------------------------------------------------------------
echo ""
echo "Next:"
echo "  ralphy setup       # interactive setup wizard (API keys + profiles)"
echo "  ralphy status      # what's enabled"
echo ""
