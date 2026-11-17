@AGENTS.md

# Repository orientation

- `ralphy/`: the Python CLI (`uv run python -m ralphy`); one module per verb in `ralphy/commands/`.
- `tools/`: bundled media tools, one PEP 723 script each (`uv run tools/<name>.py --help`).
- `skills/`: the agent skills; `.agents/skills` and `.claude/skills` are symlinks to it.
- `.mcp.json`: the fal hosted MCP server (reads `FAL_KEY` from the environment).
- `tests/`: pytest; `tests/test_plugin.py` checks manifests, hooks, skills and links.
- `bin/ralphy` (uv launcher), `hooks/`, `.claude-plugin/`, `.codex-plugin/`: the plugin launcher and manifests.
- `docs/plans/2026-11-17-ralphy-v1.md`: the v1 build contract.

Checks: `uv run ruff check ralphy tools tests` and `uv run pytest`.
