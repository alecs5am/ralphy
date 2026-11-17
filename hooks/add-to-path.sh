#!/usr/bin/env bash
# SessionStart hook: put <root>/bin, ~/.local/bin (uv) and ~/.bun/bin (HyperFrames renders) on
# PATH for the session and warm the CLI environment in the background. Arg 1: root (default
# $CLAUDE_PLUGIN_ROOT, then $CLAUDE_PROJECT_DIR). Never fails the session.
root="${1:-${CLAUDE_PLUGIN_ROOT:-${CLAUDE_PROJECT_DIR:-}}}"
[ -n "$root" ] && command -v cygpath >/dev/null 2>&1 && root="$(cygpath -u "$root")"
[ -n "$root" ] && [ -x "$root/bin/ralphy" ] || exit 0
if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -qs "ralphy-path" "$CLAUDE_ENV_FILE"; then
  # shellcheck disable=SC2016  # $HOME and $PATH expand later, in the env file
  printf 'export PATH="%s/bin:$HOME/.local/bin:$HOME/.bun/bin:$PATH"  # ralphy-path\n' "$root" >> "$CLAUDE_ENV_FILE"
fi
# Warm uv and the project environment without blocking session start.
nohup "$root/bin/ralphy" --version >/dev/null 2>&1 &
exit 0
