"""The PreToolUse approval hook: which commands it asks about, the reason it shows, the shell wrapper (with and
without Python) and its registration in hooks/hooks.json and .claude/settings.json."""

from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from ralphy.post import hook

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "hooks" / "confirm-post.sh"

ASKS = {
    "ralphy post run p_1a2b3c4d": ("run", ["p_1a2b3c4d"]),
    "ralphy --json post approve --all --account ui-effects": ("approve", ["--all", "--account", "ui-effects"]),
    "ralphy post --json run --due": ("run", ["--due"]),
    "bin/ralphy post run --due": ("run", ["--due"]),
    "/Users/me/ralphy/bin/ralphy post approve p_1a2b3c4d --json": ("approve", ["p_1a2b3c4d", "--json"]),
    "uv run --project /x/ralphy python -m ralphy post run p_1a2b3c4d": ("run", ["p_1a2b3c4d"]),
    "python -m ralphy.cli post approve p_1a2b3c4d": ("approve", ["p_1a2b3c4d"]),
    "cd ~/ralphy && ralphy post run p_1a2b3c4d": ("run", ["p_1a2b3c4d"]),
    "ralphy post list; ralphy post run --due": ("run", ["--due"]),
    "RALPHY_HOME=/tmp/h ralphy post run p_1a2b3c4d": ("run", ["p_1a2b3c4d"]),
    "bash -c 'ralphy post run p_1a2b3c4d'": ("run", ["p_1a2b3c4d"]),
    'zsh -lc "ralphy post approve p_1a2b3c4d"': ("approve", ["p_1a2b3c4d"]),
    "eval ralphy post run --due": ("run", ["--due"]),
    "out=$(ralphy post run p_1a2b3c4d)": ("run", ["p_1a2b3c4d"]),
    "echo `ralphy post run p_1a2b3c4d`": ("run", ["p_1a2b3c4d"]),
    "ralphy post plan x --to a:tiktok\nralphy post approve p_1a2b3c4d": ("approve", ["p_1a2b3c4d"]),
    "ralphy post run p_1a2b3c4d 'unbalanced": ("run", ["p_1a2b3c4d", "'unbalanced"]),
}
SILENT = [
    "ralphy post plan ui-effects/001-x --to ui-effects:tiktok",
    "ralphy post list --status approved",
    "ralphy post cancel p_1a2b3c4d",
    "ralphy account login ui-effects tiktok",
    "echo 'ralphy post run p_1a2b3c4d'",
    'grep -rn "ralphy post approve" skills/',
    "git commit -m 'feat(post): ralphy post run'",
    "cd /Users/me/github/ralphy && ls",
    "uv run --project /x/ralphy python -m ralphy render ui-effects/001-x",
    "ralphy-post run p_1a2b3c4d",
    "uv run pytest tests/test_post_hook.py",
]


@pytest.mark.parametrize("command", list(ASKS))
def test_matching_commands(command):
    assert hook.invocations(command) == [ASKS[command]]


@pytest.mark.parametrize("command", SILENT)
def test_non_matching_commands(command):
    assert hook.invocations(command) == []


def _home(tmp_path) -> Path:
    home = tmp_path / "home"
    account = home / "ui-effects"
    account.mkdir(parents=True)
    (account / "account.md").write_text("---\nname: UI Effects\n---\n")
    columns = "id,content,platform,handle,status,scheduled_at,posted_at,url,render,caption,error\n"
    rows = [
        "p_00000001,ui-effects/001-type-charge,tiktok,@ui.effects,planned,,,,r.mp4,Type that charges,\n",
        "p_00000002,ui-effects/001-type-charge,youtube,@uieffects,approved,2020-01-01T00:00:00Z,,,r.mp4,Title,\n",
        "p_00000003,ui-effects/002-glow,tiktok,@ui.effects,approved,2099-01-01T00:00:00Z,,,r.mp4,Later,\n",
    ]
    (account / "posts.csv").write_text(columns + "".join(rows))
    return home


def test_describe_lists_what_will_be_posted_where(tmp_path):
    home = _home(tmp_path)
    one = hook.describe([("approve", ["p_00000001"])], home)
    assert "p_00000001: ui-effects/001-type-charge -> tiktok @ui.effects (account ui-effects)" in one
    assert 'caption: "Type that charges"' in one and "lets `ralphy post run` publish" in one
    due = hook.describe([("run", ["--due"])], home)
    assert "p_00000002" in due and "p_00000003" not in due and "publishes now" in due
    every = hook.describe([("approve", ["--all", "--account", "ui-effects"])], home)
    assert "p_00000001" in every and "p_00000002" not in every
    missing = hook.describe([("run", ["p_99999999"])], home)
    assert "no matching rows" in missing


def _main(payload) -> str:
    out = io.StringIO()
    stdin = io.StringIO(payload if isinstance(payload, str) else json.dumps(payload))
    assert hook.main(stdin, out) == 0
    return out.getvalue()


def test_main_prints_one_ask_decision_or_nothing(tmp_path, monkeypatch):
    monkeypatch.setenv("RALPHY_HOME", str(_home(tmp_path)))
    asked = json.loads(_main({"tool_name": "Bash", "tool_input": {"command": "ralphy post run p_00000002"}}))
    output = asked["hookSpecificOutput"]
    assert output["hookEventName"] == "PreToolUse" and output["permissionDecision"] == "ask"
    reason = output["permissionDecisionReason"]
    assert "p_00000002" in reason and "youtube @uieffects" in reason
    assert _main({"tool_name": "Bash", "tool_input": {"command": "ralphy post list"}}) == ""
    assert _main({"tool_name": "Write", "tool_input": {"command": "ralphy post run p_00000002"}}) == ""
    assert _main("not json") == ""
    assert _main({"tool_name": "Bash", "tool_input": {}}) == ""


def _script(stdin: dict, root: Path, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", str(SCRIPT), str(root)], input=json.dumps(stdin), capture_output=True,
                          text=True, timeout=30, env={**os.environ, **(env or {})})


def test_the_shell_wrapper_runs_the_python_hook(tmp_path):
    env = {"RALPHY_HOME": str(_home(tmp_path))}
    asked = _script({"tool_name": "Bash", "tool_input": {"command": "bin/ralphy post approve p_00000001"}}, REPO, env)
    assert asked.returncode == 0, asked.stderr
    decision = json.loads(asked.stdout)["hookSpecificOutput"]
    assert decision["permissionDecision"] == "ask" and "p_00000001" in decision["permissionDecisionReason"]
    quiet = _script({"tool_name": "Bash", "tool_input": {"command": "ralphy content list"}}, REPO, env)
    assert quiet.returncode == 0 and quiet.stdout == ""
    unrelated = _script({"tool_name": "Bash", "tool_input": {"command": "ls"}}, REPO, env)
    assert unrelated.returncode == 0 and unrelated.stdout == ""


def test_the_shell_wrapper_without_python_still_asks(tmp_path):
    if not shutil.which("grep"):
        pytest.skip("grep is not installed")
    bare_root = tmp_path / "no-python-root"  # no ralphy/post/hook.py there: the grep fallback runs
    bare_root.mkdir()
    asked = _script({"tool_name": "Bash", "tool_input": {"command": "ralphy --json post run --due"}}, bare_root)
    assert asked.returncode == 0
    assert json.loads(asked.stdout)["hookSpecificOutput"]["permissionDecision"] == "ask"
    quiet = _script({"tool_name": "Bash", "tool_input": {"command": "ralphy post plan x --to a:tiktok"}}, bare_root)
    assert quiet.returncode == 0 and quiet.stdout == ""


def test_hook_is_registered_for_the_plugin_and_the_repo():
    plugin = json.loads((REPO / "hooks" / "hooks.json").read_text())["hooks"]
    repo = json.loads((REPO / ".claude" / "settings.json").read_text())["hooks"]
    assert "add-to-path.sh" in plugin["SessionStart"][0]["hooks"][0]["command"]
    assert "add-to-path.sh" in repo["SessionStart"][0]["hooks"][0]["command"]
    for config, root in ((plugin, "${CLAUDE_PLUGIN_ROOT}"), (repo, "$CLAUDE_PROJECT_DIR")):
        (entry,) = config["PreToolUse"]
        assert entry["matcher"] == "Bash"
        command = entry["hooks"][0]["command"]
        assert f"{root}/hooks/confirm-post.sh" in command and entry["hooks"][0]["type"] == "command"
    assert os.access(SCRIPT, os.X_OK)
