"""`ralphy tool`: listing by docstring and pass-through runs through `uv run` with keys.env loaded."""

from __future__ import annotations

import pytest

ECHO_TOOL = '''# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Echo arguments and report which keys are set.

Second docstring line is not part of the summary.
"""

import json
import os
import sys

args = sys.argv[1:]
if "--json" in args:
    print(json.dumps({"args": [a for a in args if a != "--json"], "fal": bool(os.environ.get("FAL_KEY"))}))
else:
    print("args:", " ".join(args))
print("to stderr", file=sys.stderr)
sys.exit(int(os.environ.get("ECHO_EXIT", "0")))
'''


@pytest.fixture
def tools_dir(tmp_path, monkeypatch, ralphy_env):
    root = tmp_path / "tools"
    root.mkdir()
    (root / "echo.py").write_text(ECHO_TOOL)
    (root / "frames.py").write_text('"""Contact sheet and keyframes."""\n')
    (root / "_shared.py").write_text('"""Private helper, not a tool."""\n')
    monkeypatch.setenv("RALPHY_TOOLS_DIR", str(root))
    monkeypatch.setenv("UV_OFFLINE", "1")
    ralphy_env["config"].mkdir(parents=True)
    (ralphy_env["config"] / "keys.env").write_text("FAL_KEY=from-keys-env\n")
    return root


def test_tool_list(run, tools_dir):
    data = run("--json", "tool", "--list").json
    assert [t["name"] for t in data["tools"]] == ["echo", "frames"]
    assert data["tools"][0]["summary"] == "Echo arguments and report which keys are set."
    assert data["tools"][1]["summary"] == "Contact sheet and keyframes."
    human = run("tool", "--list")
    assert "echo" in human.out and "_shared" not in human.out


def test_tool_passthrough(run, tools_dir, has_uv, monkeypatch):
    result = run("tool", "echo", "a", "--flag", "b c")
    assert result.code == 0, result.err
    assert "args: a --flag b c" in result.out
    assert "to stderr" in result.err

    as_json = run("tool", "echo", "--json", "x")
    assert as_json.json == {"args": ["x"], "fal": True}
    forwarded = run("--json", "tool", "echo", "y")
    assert forwarded.json == {"args": ["y"], "fal": True}

    monkeypatch.setenv("ECHO_EXIT", "3")
    assert run("tool", "echo").code == 3


def test_unknown_tool(run, tools_dir):
    result = run("--json", "tool", "nope")
    assert result.code == 1 and result.json["error"]["code"] == "E_TOOL_NOT_FOUND"
    traversal = run("--json", "tool", "../evil")
    assert traversal.json["error"]["code"] == "E_TOOL_NOT_FOUND"
