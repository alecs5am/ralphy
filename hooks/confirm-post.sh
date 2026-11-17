#!/usr/bin/env bash
# PreToolUse hook (matcher Bash): ask the owner before `ralphy post approve` or
# `ralphy post run` runs. Reads the hook JSON on stdin; prints a PreToolUse
# "ask" decision listing what will be posted where, or nothing. Always exits 0.
# Arg 1: root (default $CLAUDE_PLUGIN_ROOT, then $CLAUDE_PROJECT_DIR, then this
# script's checkout). The logic lives in ralphy/post/hook.py (stdlib only).
# Format: https://code.claude.com/docs/en/hooks#pretooluse-decision-control
root="${1:-${CLAUDE_PLUGIN_ROOT:-${CLAUDE_PROJECT_DIR:-}}}"
[ -n "$root" ] || root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
input="$(cat)"
case "$input" in *ralphy*) ;; *) exit 0 ;; esac

if [ -f "$root/ralphy/post/hook.py" ]; then
  for py in "$root/.venv/bin/python" python3 python; do
    command -v "$py" >/dev/null 2>&1 || continue
    if printf '%s' "$input" | "$py" -I "$root/ralphy/post/hook.py"; then
      exit 0
    fi
    break
  done
fi

# No usable Python: a coarse match on the raw JSON, still asking rather than staying silent.
if printf '%s' "$input" | grep -Eq '"tool_name"[[:space:]]*:[[:space:]]*"Bash"' &&
  printf '%s' "$input" | grep -Eq 'ralphy(\.cli)?([[:space:]]+-[^[:space:]]+)*[[:space:]]+post([[:space:]]+-[^[:space:]]+)*[[:space:]]+(approve|run)'; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"ralphy post approve/run publishes to the owner'"'"'s own accounts. Allow it only if the owner said to post exactly these posts."}}'
fi
exit 0
