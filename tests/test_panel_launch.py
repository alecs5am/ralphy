"""`ralphy panel` in the background: start once, reuse, survive the command, stop; port search; stale state."""

from __future__ import annotations

import http.client
import json
import os
import re
import socket
import subprocess
import sys
import time

import pytest

from ralphy import files, model
from ralphy.panel import launch
from ralphy.panel.server import PanelServer

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _cli(*args: str, timeout: float = 30) -> subprocess.CompletedProcess:
    """The CLI as its own process, like an agent's shell command: it must return while the panel keeps serving."""
    return subprocess.run([sys.executable, "-m", "ralphy", *args], cwd=REPO, capture_output=True, text=True,
                          timeout=timeout, env=dict(os.environ))


def _request(url: str, method: str, path: str, headers: dict | None = None, body: bytes | None = None):
    host, port = url.removeprefix("http://").split(":")
    conn = http.client.HTTPConnection(host, int(port), timeout=5)
    try:
        conn.request(method, path, body=body, headers=headers or {})
        resp = conn.getresponse()
        return resp.status, resp.read()
    finally:
        conn.close()


@pytest.fixture
def home_with_a_post(ralphy_env):
    model.create_account("UI Effects")
    item, _ = model.create_content("ui-effects", "Type Charge")
    files.write_csv(ralphy_env["home"] / "ui-effects" / "posts.csv", model.POSTS_COLUMNS, [
        {"id": "p_aaaaaaaa", "content": item.id, "platform": "tiktok", "handle": "@ui", "status": "planned"},
    ])
    yield ralphy_env
    state = launch.read_state()
    if state and launch.alive(state["pid"]):  # never leave a server behind, even when an assert failed
        os.kill(state["pid"], 9)


def test_panel_starts_in_the_background_and_outlives_the_command(home_with_a_post, monkeypatch):
    first = _cli("--json", "panel", "--no-open", "--port", "0")
    assert first.returncode == 0, first.stdout + first.stderr
    data = json.loads(first.stdout)
    assert data["ok"] is True and data["started"] is True and data["url"].startswith("http://127.0.0.1:")
    assert data["home"] == str(home_with_a_post["home"])
    pid, url = data["pid"], data["url"]
    # the command has exited; the detached server keeps answering
    time.sleep(0.3)
    found = launch.health(url)
    assert found and found["pid"] == pid and found["home"] == str(home_with_a_post["home"])
    state = json.loads((home_with_a_post["cache"] / "panel" / "server.json").read_text())
    assert state["pid"] == pid and state["url"] == url and state["mode"] == "background"
    assert (home_with_a_post["cache"] / "panel" / "server.log").is_file()

    # a second call reuses it and opens the browser on the same URL
    opened: list[str] = []
    monkeypatch.setattr("webbrowser.open", lambda target: opened.append(target) or True)
    again = _cli("--json", "panel", "--no-open")
    assert json.loads(again.stdout) == {"ok": True, "url": url, "pid": pid, "started": False,
                                        "home": str(home_with_a_post["home"])}
    from ralphy import cli

    assert cli.main(["panel"]) == 0 and opened == [url]

    # the launch token reaches the page only; writes still need it and a matching Origin
    status, page = _request(url, "GET", "/")
    token = re.search(r'"token": "([^"]+)"', page.decode()).group(1)
    approve = "/api/posts/p_aaaaaaaa/approve"
    assert _request(url, "POST", approve, {"Content-Length": "0"})[0] == 403
    foreign = {"X-Ralphy-Token": token, "Origin": "http://evil.example", "Content-Length": "0"}
    assert _request(url, "POST", approve, foreign)[0] == 403
    assert _request(url, "POST", approve, {"X-Ralphy-Token": token, "Host": "evil.example"})[0] == 403
    assert _request(url, "POST", approve, {"X-Ralphy-Token": token, "Content-Length": "0"})[0] == 200
    assert files.read_csv(home_with_a_post["home"] / "ui-effects" / "posts.csv")[0]["status"] == "approved"

    stopped = _cli("--json", "panel", "stop")
    assert json.loads(stopped.stdout) == {"ok": True, "stopped": True, "pid": pid, "url": url}
    assert launch.health(url, timeout=0.5) is None
    assert not (home_with_a_post["cache"] / "panel" / "server.json").exists()
    assert json.loads(_cli("--json", "panel", "stop").stdout)["stopped"] is False


def test_a_server_behind_a_launcher_stub_is_found_by_its_launch_id(home_with_a_post, monkeypatch):
    """Some macOS Pythons start the real interpreter as another process: the server's pid is not the child's."""
    real_popen = subprocess.Popen

    def behind_a_shell(command, **kwargs):
        line = " ".join(f"'{part}'" for part in command)
        return real_popen(["/bin/sh", "-c", f"{line} & wait"], **kwargs)

    monkeypatch.setattr(launch.subprocess, "Popen", behind_a_shell)
    result = launch.ensure(0, open_browser=False)
    try:
        assert result["started"] is True
        found = launch.health(result["url"])
        assert found and found["pid"] == result["pid"]
        assert launch.read_state()["launch_id"]
    finally:
        os.kill(result["pid"], 9)


def test_a_busy_port_moves_to_the_next_free_one(ralphy_env):
    holder = socket.socket()
    holder.bind(("127.0.0.1", 0))
    holder.listen()
    busy = holder.getsockname()[1]
    try:
        server = PanelServer.bind(busy, home=ralphy_env["home"], tries=20)
        try:
            assert server.port != busy and busy < server.port < busy + 20
        finally:
            server.server_close()
        with pytest.raises(Exception) as caught:
            PanelServer.bind(busy, home=ralphy_env["home"], tries=1)
        assert getattr(caught.value, "code", None) == "E_PORT_IN_USE"
    finally:
        holder.close()


def test_a_stale_state_file_is_dropped(ralphy_env):
    dead = subprocess.Popen([sys.executable, "-c", "pass"])
    dead.wait()
    launch.write_state({"pid": dead.pid, "port": 1, "url": "http://127.0.0.1:1", "home": str(ralphy_env["home"])})
    assert launch.running() is None
    assert launch.read_state() is None
    launch.write_state({"pid": os.getpid(), "port": 1, "url": "http://127.0.0.1:1", "home": "x"})
    assert launch.running() is None  # alive, but nothing answers as that panel
    assert launch.stop() == {"stopped": False, "pid": None, "url": None}


def test_foreground_refuses_while_a_panel_runs(ralphy_env, monkeypatch, run):
    monkeypatch.setattr(launch, "running", lambda: {"pid": 1, "url": "http://127.0.0.1:4777"})
    result = run("--json", "panel", "--foreground", "--no-open")
    assert result.code == 1 and result.json["error"]["code"] == "E_PANEL_RUNNING"
