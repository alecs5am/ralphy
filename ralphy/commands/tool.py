"""`ralphy tool --list` and `ralphy tool <name> [args...]`: run a bundled `tools/<name>.py` through `uv run`.

The tool's stdout, stderr and exit code pass through unchanged; keys.env is loaded into its environment.
`ralphy --json tool <name> ...` forwards `--json` to the tool. `RALPHY_TOOLS_DIR` overrides the tools dir.
"""

from __future__ import annotations

import ast
import re
import shutil
import subprocess
import sys

from .. import paths
from ..errors import RalphyError
from . import Output, Passthrough

_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def summary(path) -> str | None:
    try:
        doc = ast.get_docstring(ast.parse(path.read_text(encoding="utf-8")))
    except (OSError, SyntaxError, ValueError):
        return None
    return doc.strip().splitlines()[0].strip() if doc and doc.strip() else None


def list_tools() -> list[dict]:
    root = paths.tools_dir()
    if not root.is_dir():
        return []
    return [
        {"name": p.stem, "summary": summary(p), "path": str(p)}
        for p in sorted(root.glob("*.py"))
        if not p.name.startswith("_") and _NAME.match(p.stem)
    ]


def run(args):
    if args.list or not args.name:
        tools = list_tools()
        if not tools:
            text = f"No tools in {paths.tools_dir()}."
        else:
            width = max(len(t["name"]) for t in tools)
            text = "\n".join(f"{t['name']:<{width}}  {t['summary'] or ''}" for t in tools)
        return Output({"tools_dir": str(paths.tools_dir()), "tools": tools}, text)
    name = args.name
    path = paths.tools_dir() / f"{name}.py"
    if not _NAME.match(name) or not path.is_file():
        raise RalphyError("E_TOOL_NOT_FOUND", f"No tool '{name}' in {paths.tools_dir()}",
                          "List the tools with `ralphy tool --list`.")
    uv = shutil.which("uv")
    if not uv:
        raise RalphyError("E_DEP_MISSING", "uv is not installed",
                          "Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh")
    tool_args = list(args.args)
    if tool_args and tool_args[0] == "--":
        tool_args = tool_args[1:]
    if getattr(args, "json", False) and "--json" not in tool_args:
        tool_args.append("--json")
    sys.stdout.flush()
    sys.stderr.flush()
    try:
        result = subprocess.run([uv, "run", str(path), *tool_args], env=paths.subprocess_env())
    except KeyboardInterrupt:
        return Passthrough(130)
    return Passthrough(result.returncode)


def register(subparsers) -> None:
    parser = subparsers.add_parser("tool", help="list or run the bundled tools", description=__doc__)
    parser.add_argument("--list", action="store_true", help="list the tools with their one-line summaries")
    parser.add_argument("name", nargs="?", help="tool name, e.g. frames")
    parser.add_argument("args", nargs="...", help="arguments passed to the tool unchanged")
    parser.set_defaults(handler=run)
