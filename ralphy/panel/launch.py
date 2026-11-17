"""`ralphy panel` from any chat: find the running panel, or start one in the background, and stop it.

The server process records itself in `RALPHY_CACHE_DIR/panel/server.json` (`pid`, `port`, `url`, `home`,
`mode`) once it listens, and removes the file when it exits. A panel counts as running when that pid is alive
and its `/api/health` answers with the same pid. `ensure` reuses it, or starts `python -m ralphy panel
--foreground --detached` as a detached child (its own session, stdout and stderr in
`RALPHY_CACHE_DIR/panel/server.log`, no inherited pipes), so the server outlives the command that started it
and the agent's chat never waits on it.
"""

from __future__ import annotations

import contextlib
import json
import os
import secrets
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from .. import files, paths
from ..errors import RalphyError

LAUNCH_ENV = "RALPHY_PANEL_LAUNCH_ID"
START_TIMEOUT = 20.0  # cold Python starts on CI runners can take several seconds
STOP_TIMEOUT = 5.0


def panel_dir() -> Path:
    return paths.cache_dir() / "panel"


def state_path() -> Path:
    return panel_dir() / "server.json"


def log_path() -> Path:
    return panel_dir() / "server.log"


def read_state() -> dict | None:
    try:
        data = json.loads(state_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) and isinstance(data.get("pid"), int) and data.get("url") else None


def write_state(state: dict) -> None:
    panel_dir().mkdir(parents=True, exist_ok=True)
    files.atomic_write_text(state_path(), json.dumps(state, ensure_ascii=False) + "\n")


def clear_state(pid: int) -> None:
    """Remove the state file when it still names `pid` (a newer panel may have replaced it)."""
    state = read_state()
    if state and state.get("pid") == pid:
        with contextlib.suppress(OSError):
            state_path().unlink()


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def health(url: str, timeout: float = 1.5) -> dict | None:
    """The panel's `/api/health` JSON, or None. Proxies are bypassed: the panel is on 127.0.0.1."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f"{url}/api/health", timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) and data.get("ok") else None


def running() -> dict | None:
    """The state of a live panel that answers as itself, else None (a stale state file is removed)."""
    state = read_state()
    if not state:
        return None
    pid = state["pid"]
    if alive(pid):
        found = health(state["url"])
        if found and found.get("pid") == pid:
            return state
    clear_state(pid)
    return None


def _same_home(state: dict) -> bool:
    try:
        return Path(state.get("home") or "").resolve() == paths.home().resolve()
    except OSError:
        return False


def _open(url: str) -> bool:
    import webbrowser

    try:
        return bool(webbrowser.open(url))
    except Exception:  # noqa: BLE001 - no browser is not an error; the URL is printed
        return False


def _tail(path: Path, lines: int = 12) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return "\n".join(text.strip().splitlines()[-lines:])


def _spawn(port: int, launch_id: str) -> subprocess.Popen:
    panel_dir().mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.update({"RALPHY_HOME": str(paths.home()), "RALPHY_CONFIG_DIR": str(paths.config_dir()),
                "RALPHY_CACHE_DIR": str(paths.cache_dir()), "PYTHONUNBUFFERED": "1", LAUNCH_ENV: launch_id})
    command = [sys.executable, "-m", "ralphy", "panel", "--foreground", "--detached", "--no-open",
               "--port", str(port)]
    with open(log_path(), "ab") as log:
        log.write(f"\n--- {files.utc_now()} starting the panel for {paths.home()}\n".encode())
        log.flush()
        return subprocess.Popen(command, cwd=paths.plugin_root(), env=env, stdin=subprocess.DEVNULL, stdout=log,
                                stderr=subprocess.STDOUT, start_new_session=True, close_fds=True)


def _wait(child: subprocess.Popen, launch_id: str) -> dict:
    """The state the new server wrote, once its `/api/health` answers.

    The server is matched by `launch_id`, not by `child.pid`: on some macOS Pythons (framework builds, CI
    runners) the venv interpreter is a stub that starts the real one as another process.
    """
    deadline = time.monotonic() + START_TIMEOUT
    state = found = None
    while time.monotonic() < deadline:
        if child.poll() is not None:
            raise RalphyError("E_PANEL_START", f"The panel exited with code {child.returncode}:\n{_tail(log_path())}",
                              f"Read {log_path()}, or run `ralphy panel --foreground` to see the error.")
        state = read_state()
        if state and state.get("launch_id") == launch_id:
            found = health(state["url"], timeout=1.0)
            if found and found.get("pid") == state["pid"]:
                return state
        time.sleep(0.1)
    with contextlib.suppress(OSError):
        child.kill()
    if state and state.get("launch_id") == launch_id and alive(state["pid"]):
        with contextlib.suppress(OSError):
            os.kill(state["pid"], signal.SIGKILL)
    seen = f"\nstate: {json.dumps(state)}\nhealth: {json.dumps(found)}"
    raise RalphyError("E_PANEL_START",
                      f"The panel did not answer within {START_TIMEOUT:.0f} s:\n{_tail(log_path())}{seen}",
                      f"Read {log_path()}, or run `ralphy panel --foreground` to see the error.")


def ensure(port: int, open_browser: bool = True) -> dict:
    """The running panel for this home, or a new background one. Returns `url`, `pid`, `started`, `home`."""
    current = running()
    if current and not _same_home(current):
        if current.get("mode") != "background":
            raise RalphyError("E_PANEL_OTHER_HOME",
                              f"A panel for {current.get('home')} runs in a terminal at {current['url']}",
                              "Stop it there (Ctrl+C), then run `ralphy panel` again.")
        stop()
        current = None
    if current:
        started = False
    else:
        launch_id = secrets.token_hex(8)
        current = _wait(_spawn(port, launch_id), launch_id)
        started = True
    opened = _open(current["url"]) if open_browser else False
    return {"url": current["url"], "pid": current["pid"], "started": started, "home": current.get("home"),
            "opened": opened}


def _command_line(pid: int) -> str:
    try:
        result = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout.strip()


def stop() -> dict:
    """Stop the panel named in the state file. Only a process that answers as that panel (or whose command line
    is `ralphy panel`) gets SIGTERM, then SIGKILL after a grace period."""
    state = read_state()
    if not state:
        return {"stopped": False, "pid": None, "url": None}
    pid, url = state["pid"], state["url"]
    if not alive(pid):
        clear_state(pid)
        return {"stopped": False, "pid": pid, "url": url}
    found = health(url)
    ours = (found and found.get("pid") == pid) or ("ralphy" in _command_line(pid) and "panel" in _command_line(pid))
    if not ours:
        clear_state(pid)
        return {"stopped": False, "pid": pid, "url": url}
    os.kill(pid, signal.SIGTERM)
    deadline = time.monotonic() + STOP_TIMEOUT
    while alive(pid) and time.monotonic() < deadline:
        _reap(pid)
        time.sleep(0.05)
    if alive(pid):
        with contextlib.suppress(OSError):
            os.kill(pid, signal.SIGKILL)
        _reap(pid)
    clear_state(pid)
    return {"stopped": True, "pid": pid, "url": url}


def _reap(pid: int) -> None:
    """Collect our own exited child so it does not linger as a zombie that `alive` would still see."""
    with contextlib.suppress(ChildProcessError, OSError):
        os.waitpid(pid, os.WNOHANG)
