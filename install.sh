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
#   RALPHY_NO_RC=1                 skip writing PATH to shell rc

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

# --- detect prior install ----------------------------------------------------
DEST="${BIN_DIR}/${BIN_NAME}${EXT}"
PREV_VERSION=""
if [ -x "$DEST" ]; then
  # `ralphy --version` exits 0 with "x.y.z" on success; tolerate older binaries
  # that only accept -V or fail outright.
  PREV_VERSION=$("$DEST" --version 2>/dev/null || "$DEST" -V 2>/dev/null || echo "")
  PREV_VERSION=$(echo "$PREV_VERSION" | head -1 | tr -d '[:space:]')
fi

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
mv "$TMP" "$DEST"
chmod +x "$DEST"

# macOS Gatekeeper tags every curl-downloaded binary with com.apple.quarantine,
# which makes the kernel refuse to run it ("cannot be opened because the
# developer cannot be verified"). Stripping the xattr is the canonical
# user-side workaround for unsigned indie binaries. No-op on non-macOS.
if [ "$OS" = "darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$DEST" >/dev/null 2>&1 || true
fi

# --- post-install verification ----------------------------------------------
NEW_VERSION=$("$DEST" --version 2>/dev/null | head -1 | tr -d '[:space:]' || echo "")
if [ -z "$NEW_VERSION" ]; then
  echo "✗ Binary installed but \`$DEST --version\` returned no output." >&2
  echo "  This usually means the binary is corrupted or your shell can't" >&2
  echo "  execute it. Try: file $DEST" >&2
  exit 1
fi

echo ""
if [ -n "$PREV_VERSION" ] && [ "$PREV_VERSION" != "$NEW_VERSION" ]; then
  echo "✓ Upgraded ralphy ${PREV_VERSION} → ${NEW_VERSION} (${DEST})"
elif [ -n "$PREV_VERSION" ]; then
  echo "✓ Reinstalled ralphy ${NEW_VERSION} (${DEST})"
else
  echo "✓ Installed ralphy ${NEW_VERSION} → ${DEST}"
fi

# --- shell rc PATH update ----------------------------------------------------
# If BIN_DIR isn't already in PATH, append the right line to the user's shell
# rc file so the next shell sees `ralphy`. Idempotent: we grep for BIN_DIR
# before appending, so re-runs don't duplicate the export.
PATH_ALREADY=0
case ":$PATH:" in
  *":$BIN_DIR:"*) PATH_ALREADY=1 ;;
esac

if [ "$PATH_ALREADY" = "0" ] && [ "${RALPHY_NO_RC:-}" != "1" ]; then
  USER_SHELL=$(basename "${SHELL:-}")
  RC_FILE=""
  PATH_LINE="export PATH=\"${BIN_DIR}:\$PATH\""
  case "$USER_SHELL" in
    zsh)
      RC_FILE="$HOME/.zshrc"
      ;;
    bash)
      # macOS bash users typically use .bash_profile; Linux .bashrc.
      if [ "$OS" = "darwin" ] && [ -f "$HOME/.bash_profile" ]; then
        RC_FILE="$HOME/.bash_profile"
      else
        RC_FILE="$HOME/.bashrc"
      fi
      ;;
    fish)
      RC_FILE="$HOME/.config/fish/config.fish"
      PATH_LINE="fish_add_path ${BIN_DIR}"
      ;;
    *)
      RC_FILE=""
      ;;
  esac

  if [ -n "$RC_FILE" ]; then
    mkdir -p "$(dirname "$RC_FILE")"
    [ -f "$RC_FILE" ] || touch "$RC_FILE"
    if ! grep -Fq "$BIN_DIR" "$RC_FILE" 2>/dev/null; then
      {
        echo ""
        echo "# Added by ralphy installer"
        echo "$PATH_LINE"
      } >> "$RC_FILE"
      echo "✓ Added ${BIN_DIR} to PATH in ${RC_FILE}"
      echo "  Reload your shell:  source ${RC_FILE}"
      echo "  Or open a new terminal window."
    else
      echo "  ${BIN_DIR} is already referenced in ${RC_FILE} but not yet on PATH."
      echo "  Reload your shell:  source ${RC_FILE}"
    fi
  else
    echo ""
    echo "  Note: ${BIN_DIR} is not in PATH and your shell (${USER_SHELL:-unknown})"
    echo "  isn't auto-configured. Add this to your shell config manually:"
    echo "    ${PATH_LINE}"
  fi
fi

# --- next step ---------------------------------------------------------------
echo ""
echo "Next:"
echo "  ralphy setup       # interactive setup wizard (API keys + profiles)"
echo "  ralphy status      # what's enabled"
echo "  ralphy help        # all commands"
echo ""
