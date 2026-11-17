"""The posting timer writes and loads a LaunchAgent; launchctl and the LaunchAgents folder are faked."""

from __future__ import annotations

import plistlib

import pytest

from ralphy.errors import RalphyError
from ralphy.post import timer


@pytest.fixture
def fake_launchd(ralphy_env, tmp_path, monkeypatch):
    calls: list[tuple] = []
    loaded = {"on": False}
    launcher = tmp_path / "plugin" / "bin" / "ralphy"
    launcher.parent.mkdir(parents=True)
    launcher.write_text("#!/bin/sh\n")

    def launchctl(*args):
        calls.append(args)
        if args[0] == "bootstrap":
            loaded["on"] = True
        elif args[0] == "bootout":
            loaded["on"] = False
        code = 0 if args[0] != "print" or loaded["on"] else 113
        return type("Done", (), {"returncode": code, "stderr": ""})()

    monkeypatch.setattr(timer.sys, "platform", "darwin")
    monkeypatch.setattr(timer, "agents_dir", lambda: tmp_path / "LaunchAgents")
    monkeypatch.setattr(timer, "launcher", lambda: launcher)
    monkeypatch.setattr(timer, "_launchctl", launchctl)
    return calls, launcher


def test_on_writes_a_job_that_runs_due_posts_from_this_home(fake_launchd):
    calls, launcher = fake_launchd
    data = timer.on(15)
    spec = plistlib.loads(timer.plist_path().read_bytes())
    assert spec["ProgramArguments"] == [str(launcher), "post", "run", "--due"]
    assert spec["StartInterval"] == 900
    assert spec["EnvironmentVariables"]["RALPHY_HOME"] == str(timer.paths.home())
    assert [c[0] for c in calls][:2] == ["bootout", "bootstrap"]  # reloads an older job first
    assert data["installed"] and data["loaded"] and data["every_minutes"] == 15 and data["program_exists"]


def test_off_unloads_and_removes_the_job(fake_launchd):
    timer.on()
    data = timer.off()
    assert data["removed"] and not data["installed"] and not data["loaded"]
    assert not timer.plist_path().exists()
    assert timer.off()["removed"] is False


def test_on_refuses_bad_intervals_and_other_systems(fake_launchd, monkeypatch):
    with pytest.raises(RalphyError, match="out of range"):
        timer.on(0)
    monkeypatch.setattr(timer.sys, "platform", "linux")
    with pytest.raises(RalphyError) as caught:
        timer.on(10)
    assert "*/10 * * * *" in caught.value.hint
