"""Plugin packaging: manifests, hooks, skills, links and the uv launcher."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tomllib
from pathlib import Path

import pytest

from ralphy import __version__

REPO = Path(__file__).resolve().parent.parent
VERSION = "0.7.0"


def _json(path: str) -> dict:
    return json.loads((REPO / path).read_text(encoding="utf-8"))


def test_versions_agree():
    pyproject = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))
    assert pyproject["project"]["version"] == VERSION
    assert _json(".claude-plugin/plugin.json")["version"] == VERSION
    assert _json(".codex-plugin/plugin.json")["version"] == VERSION
    assert __version__ == VERSION


def test_cli_prints_the_version(capsys):
    from ralphy import cli

    assert cli.main(["--version"]) == 0
    assert capsys.readouterr().out.strip() == f"ralphy {VERSION}"


def test_manifests_name_the_plugin():
    assert _json(".claude-plugin/plugin.json")["name"] == "ralphy"
    assert _json(".codex-plugin/plugin.json")["name"] == "ralphy"
    marketplace = _json(".claude-plugin/marketplace.json")
    assert [p["name"] for p in marketplace["plugins"]] == ["ralphy"]
    assert _json(".agents/plugins/marketplace.json")["plugins"][0]["name"] == "ralphy"


def _hook_commands(path: str) -> list[str]:
    commands = []
    for entries in _json(path)["hooks"].values():
        for entry in entries:
            commands += [hook["command"] for hook in entry["hooks"] if hook.get("type") == "command"]
    return commands


@pytest.mark.parametrize("path", ["hooks/hooks.json", ".claude/settings.json"])
def test_hook_scripts_exist(path):
    commands = _hook_commands(path)
    assert commands
    for command in commands:
        expanded = re.sub(r"\$\{?(CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR)\}?", str(REPO), command)
        scripts = re.findall(r'(\S+/hooks/[\w.-]+)', expanded.replace('"', " "))
        assert scripts, command
        for script in scripts:
            file = Path(script)
            assert file.is_file(), f"{command}: {script} is missing"
            through_bash = command.startswith("bash ")
            assert through_bash or os.access(file, os.X_OK), f"{command}: not run through bash and not executable"


def test_launcher_is_executable():
    assert os.access(REPO / "bin" / "ralphy", os.X_OK)


@pytest.mark.parametrize("link", [".agents/skills", ".claude/skills"])
def test_skill_dirs_are_symlinks_to_skills(link):
    path = REPO / link
    assert path.is_symlink()
    assert path.resolve() == (REPO / "skills").resolve()


def _skills() -> list[Path]:
    return sorted(p for p in (REPO / "skills").iterdir() if p.is_dir())


def test_at_most_ten_skills():
    assert 1 <= len(_skills()) <= 10


def test_skills_carry_the_ralphy_prefix():
    names = [p.name for p in _skills()]
    assert "ralphy" in names  # the entry skill is the prefix itself
    assert [n for n in names if n != "ralphy" and not n.startswith("ralphy-")] == []


def _frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"---\n(.*?)\n---\n", text, re.S)
    assert match, "no frontmatter"
    keys: dict[str, str] = {}
    current = None
    for line in match.group(1).splitlines():
        top = re.match(r"([A-Za-z_-]+):\s*(.*)$", line)
        if top and not line.startswith(" "):
            current = top.group(1)
            assert current not in keys, f"duplicate key {current}"
            keys[current] = top.group(2).strip()
        elif current and line.strip():
            keys[current] += " " + line.strip()
    return keys


@pytest.mark.parametrize("skill", _skills(), ids=lambda p: p.name)
def test_skill_frontmatter(skill):
    fm = _frontmatter((skill / "SKILL.md").read_text(encoding="utf-8"))
    assert set(fm) == {"name", "description"}
    assert fm["name"] == skill.name
    assert fm["description"].strip(">-| ")


LINK = re.compile(r"(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")


def _markdown_files() -> list[Path]:
    files = sorted((REPO / "skills").rglob("*.md"))
    return files + [REPO / name for name in ("README.md", "AGENTS.md", "CLAUDE.md")]


def _relative_links(text: str) -> list[str]:
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", "", text)
    links = []
    for target in LINK.findall(text) + re.findall(r"!\[[^\]]*\]\(([^)\s]+)\)", text):
        if re.match(r"([a-z][a-z0-9+.-]*:|#|//)", target, re.I):
            continue
        links.append(target.split("#", 1)[0])
    return [link for link in links if link]


@pytest.mark.parametrize("file", _markdown_files(), ids=lambda p: str(p.relative_to(REPO)))
def test_markdown_links_resolve(file):
    for link in _relative_links(file.read_text(encoding="utf-8")):
        target = (REPO / link.lstrip("/")) if link.startswith("/") else (file.parent / link)
        assert target.exists(), f"{file.relative_to(REPO)}: broken link {link}"


@pytest.mark.skipif(shutil.which("uv") is None, reason="uv is not on PATH")
def test_launcher_runs_through_a_symlink(tmp_path):
    link = tmp_path / "bin" / "ralphy"
    link.parent.mkdir()
    link.symlink_to(REPO / "bin" / "ralphy")
    env = {
        **os.environ,
        "RALPHY_HOME": str(tmp_path / "home"),
        "RALPHY_CONFIG_DIR": str(tmp_path / "config"),
        "RALPHY_CACHE_DIR": str(tmp_path / "cache"),
        "RALPHY_NO_AUTO_INSTALL": "1",
    }
    result = subprocess.run(
        [str(link), "--version"], cwd=tmp_path, env=env, capture_output=True, text=True, timeout=180
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == f"ralphy {VERSION}"
