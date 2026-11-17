"""Claude Code PreToolUse hook: ask the owner before `ralphy post approve` or `ralphy post run` runs.

Reads the hook input JSON on stdin. When `tool_name` is `Bash` and the command runs `ralphy post approve`
or `ralphy post run` (as `ralphy`, `bin/ralphy`, `python -m ralphy`, inside `bash -c "..."` or `eval`), it
prints one PreToolUse decision, `ask`, whose reason lists what will be posted where (read from the
accounts' `posts.csv`); otherwise it prints nothing. It always exits 0, so a hook problem never blocks an
unrelated command. Format: https://code.claude.com/docs/en/hooks#pretooluse-decision-control

Standard library only, Python 3.9 syntax: `hooks/confirm-post.sh` may run it with any `python3`.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import os
import re
import shlex
import sys
from pathlib import Path

VERBS = ("approve", "run")
SEPARATORS = {";", "&&", "||", "|", "|&", "&", "(", ")", ";;"}
SHELLS = {"bash", "sh", "zsh", "dash", "ksh"}
POST_ID = re.compile(r"^p_[0-9a-f]{8}$")
FALLBACK = re.compile(
    r"(?:^|[\s;&|()`'\"/=])ralphy(?:\.cli)?(?:\s+-\S+)*\s+post(?:\s+-\S+)*\s+(approve|run)\b([^;&|\n]*)")
MAX_POSTS = 10
GENERIC = ("ralphy post {verb} publishes to the owner's own accounts. Allow it only if the owner said to post "
           "exactly these posts.")


# ---------------------------------------------------------------- matching


def _tokens(command: str) -> list[str] | None:
    text = re.sub(r"(?<!\\)\n", " ; ", command)
    lexer = shlex.shlex(text, posix=True, punctuation_chars=";&|()<>")
    lexer.whitespace_split = True
    lexer.commenters = ""
    try:
        return list(lexer)
    except ValueError:
        return None


def _is_ralphy(token: str) -> bool:
    text = token
    if "=" in text and not text.startswith("-"):
        text = text.split("=", 1)[1]
    text = text.lstrip("`$({\"'")
    return text.rsplit("/", 1)[-1] == "ralphy"


def _segment(tokens: list[str], start: int) -> list[str]:
    out = []
    for token in tokens[start:]:
        if token in SEPARATORS:
            break
        out.append(token.rstrip("`"))
    return out


def _post_verb(rest: list[str]) -> tuple[str, list[str]] | None:
    """`[--json] post [--json] approve|run <args>` -> (verb, args)."""
    index = 0
    while index < len(rest) and rest[index].startswith("-"):
        index += 1
    if index >= len(rest) or rest[index] != "post":
        return None
    index += 1
    while index < len(rest) and rest[index].startswith("-"):
        index += 1
    if index < len(rest) and rest[index] in VERBS:
        return rest[index], rest[index + 1:]
    return None


def invocations(command: str, depth: int = 0) -> list[tuple[str, list[str]]]:
    """Every `ralphy post approve|run` call in a shell command, as (verb, args)."""
    if not command or "ralphy" not in command or depth > 3:
        return []
    tokens = _tokens(command)
    if tokens is None:
        return [(m.group(1), m.group(2).split()) for m in FALLBACK.finditer(command)]
    found: list[tuple[str, list[str]]] = []
    for index, token in enumerate(tokens):
        base = token.rsplit("/", 1)[-1]
        if base in SHELLS:
            rest = _segment(tokens, index + 1)
            for position, arg in enumerate(rest[:-1]):
                if re.match(r"^-[a-z]*c[a-z]*$", arg):
                    found.extend(invocations(rest[position + 1], depth + 1))
                    break
        elif base == "eval":
            found.extend(invocations(" ".join(_segment(tokens, index + 1)), depth + 1))
        start = None
        if _is_ralphy(token):
            start = index + 1
        elif token == "-m" and index + 1 < len(tokens) and tokens[index + 1] == "ralphy.cli":
            start = index + 2
        if start is None:
            continue
        call = _post_verb(_segment(tokens, start))
        if call:
            found.append(call)
    unique: list[tuple[str, list[str]]] = []
    for call in found:  # `eval ralphy post run` is seen both inside eval and as a plain call
        if call not in unique:
            unique.append(call)
    return unique


# ---------------------------------------------------------------- describing


def _home() -> Path:
    root = Path(__file__).resolve().parents[2]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    try:
        from ralphy import paths

        return paths.home()
    except Exception:  # noqa: BLE001 - the same rule as ralphy.paths.home, without the package
        env = os.environ.get("RALPHY_HOME")
        if env:
            return Path(os.path.expandvars(os.path.expanduser(env)))
        return Path.home() / "ralphy"


def _rows(home: Path) -> list[tuple[str, dict]]:
    found = []
    if not home.is_dir():
        return found
    for folder in sorted(home.iterdir()):
        table = folder / "posts.csv"
        if not (folder / "account.md").is_file() or not table.is_file():
            continue
        try:
            with open(table, newline="", encoding="utf-8") as handle:
                found.extend((folder.name, row) for row in csv.DictReader(handle))
        except (OSError, csv.Error):
            continue
    return found


def _option(args: list[str], name: str) -> str | None:
    for index, arg in enumerate(args):
        if arg == name and index + 1 < len(args):
            return args[index + 1]
        if arg.startswith(name + "="):
            return arg.split("=", 1)[1]
    return None


def _due(row: dict, now: dt.datetime) -> bool:
    text = (row.get("scheduled_at") or "").strip()
    if not text:
        return True
    if text[-1] in "Zz":
        text = text[:-1] + "+00:00"
    try:
        when = dt.datetime.fromisoformat(text)
    except ValueError:
        return False
    return when.tzinfo is not None and when <= now


def _line(account: str, row: dict) -> str:
    caption = " ".join((row.get("caption") or "").split())
    if len(caption) > 80:
        caption = caption[:77] + "..."
    when = row.get("scheduled_at") or "now"
    return (f"- {row.get('id')}: {row.get('content')} -> {row.get('platform')} {row.get('handle') or ''} "
            f"(account {account}), {when}, status {row.get('status')}; caption: \"{caption}\"")


def describe(found: list[tuple[str, list[str]]], home: Path | None = None) -> str:
    rows = _rows(home or _home())
    now = dt.datetime.now(dt.timezone.utc)
    parts = []
    for verb, args in found:
        ids = {a.lower() for a in args if POST_ID.match(a.lower())}
        account = _option(args, "--account")
        if verb == "approve" and "--all" in args:
            picked = [(a, r) for a, r in rows if r.get("status") == "planned" and (not account or a == account)]
            scope = f"every planned post of {account or 'all accounts'}"
        elif verb == "run" and "--due" in args:
            picked = [(a, r) for a, r in rows
                      if r.get("status") == "approved" and _due(r, now) and (not account or a == account)]
            scope = f"every approved, due post of {account or 'all accounts'}"
        else:
            picked = [(a, r) for a, r in rows if r.get("id") in ids]
            scope = ", ".join(sorted(ids)) or "no post id given"
        head = ("ralphy post approve lets `ralphy post run` publish" if verb == "approve"
                else "ralphy post run publishes now") + f" ({scope}):"
        lines = [_line(a, r) for a, r in picked[:MAX_POSTS]]
        if len(picked) > MAX_POSTS:
            lines.append(f"- and {len(picked) - MAX_POSTS} more")
        if not lines:
            lines.append("- no matching rows in posts.csv; the command may fail")
        parts.append("\n".join([head, *lines]))
    parts.append("Allow only if the owner said to post exactly these.")
    return "\n".join(parts)


def decision(reason: str) -> dict:
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask",
                                   "permissionDecisionReason": reason}}


def main(stdin=None, stdout=None) -> int:
    source = stdin if stdin is not None else sys.stdin
    sink = stdout if stdout is not None else sys.stdout
    try:
        data = json.loads(source.read() or "null")
    except ValueError:
        return 0
    if not isinstance(data, dict) or data.get("tool_name") != "Bash":
        return 0
    command = (data.get("tool_input") or {}).get("command")
    if not isinstance(command, str):
        return 0
    found = invocations(command)
    if not found:
        return 0
    try:
        reason = describe(found)
    except Exception:  # noqa: BLE001 - asking with a generic reason beats not asking
        reason = GENERIC.format(verb="/".join(sorted({verb for verb, _ in found})))
    sink.write(json.dumps(decision(reason)) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
