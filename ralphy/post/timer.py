"""The posting timer: a macOS LaunchAgent that runs `ralphy post run --due` every few minutes.

`ralphy post plan --at ...` and `post approve` only record a time and the owner's go; something has to run
`post run --due` after that time. `on` writes `~/Library/LaunchAgents/<LABEL>.plist` and loads it with
`launchctl bootstrap`; `off` unloads and removes it; `status` reads both. The job runs the `bin/ralphy`
launcher of the install that turned it on, with this process's PATH and Ralphy folders, so it posts from
the same home and profiles. launchd never starts the job while the previous run is still going, and a run
missed while the Mac slept starts on wake. On other systems `on` explains the cron line to add instead.
"""

from __future__ import annotations

import os
import plistlib
import subprocess
import sys
from pathlib import Path

from .. import paths
from ..errors import RalphyError

LABEL = "com.ralphy.post-due"
DEFAULT_MINUTES = 10


def agents_dir() -> Path:
    return Path.home() / "Library" / "LaunchAgents"


def plist_path() -> Path:
    return agents_dir() / f"{LABEL}.plist"


def log_path() -> Path:
    return paths.cache_dir() / "post" / "timer.log"


def launcher() -> Path:
    return paths.plugin_root() / "bin" / "ralphy"


def _domain() -> str:
    return f"gui/{os.getuid()}"


def _launchctl(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["launchctl", *args], capture_output=True, text=True, check=False)


def job(minutes: int) -> dict:
    """The LaunchAgent definition."""
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin:/usr/sbin:/sbin"),
        "RALPHY_HOME": str(paths.home()),
        "RALPHY_CONFIG_DIR": str(paths.config_dir()),
        "RALPHY_CACHE_DIR": str(paths.cache_dir()),
    }
    return {
        "Label": LABEL,
        "ProgramArguments": [str(launcher()), "post", "run", "--due"],
        "StartInterval": minutes * 60,
        "RunAtLoad": True,
        "ProcessType": "Interactive",  # posting drives a visible Chrome window
        "EnvironmentVariables": env,
        "StandardOutPath": str(log_path()),
        "StandardErrorPath": str(log_path()),
        "WorkingDirectory": str(paths.home()),
    }


def _cron_hint(minutes: int) -> str:
    return f"Add a cron line instead: */{minutes} * * * * {launcher()} post run --due >> {log_path()} 2>&1"


def on(minutes: int = DEFAULT_MINUTES) -> dict:
    if minutes < 1 or minutes > 24 * 60:
        raise RalphyError("E_USAGE", f"--every {minutes} is out of range", "Pass minutes between 1 and 1440.")
    if sys.platform != "darwin":
        raise RalphyError("E_USAGE", "The posting timer is a macOS LaunchAgent", _cron_hint(minutes))
    if not launcher().is_file():
        raise RalphyError("E_NOT_FOUND", f"No launcher at {launcher()}", "Run this from an installed Ralphy plugin.")
    log_path().parent.mkdir(parents=True, exist_ok=True)
    agents_dir().mkdir(parents=True, exist_ok=True)
    target = plist_path()
    temp = target.with_suffix(".plist.tmp")
    temp.write_bytes(plistlib.dumps(job(minutes)))
    temp.replace(target)
    _launchctl("bootout", f"{_domain()}/{LABEL}")  # reload a job that is already loaded; absent is fine
    loaded = _launchctl("bootstrap", _domain(), str(target))
    if loaded.returncode != 0:
        raise RalphyError("E_INTERNAL", f"launchctl could not load {target}: {(loaded.stderr or '').strip()}",
                          f"Check it with `launchctl print {_domain()}/{LABEL}`.")
    return status()


def off() -> dict:
    was = plist_path().is_file()
    if sys.platform == "darwin":
        _launchctl("bootout", f"{_domain()}/{LABEL}")
    if was:
        plist_path().unlink()
    return {**status(), "removed": was}


def status() -> dict:
    target = plist_path()
    data: dict = {"label": LABEL, "plist": str(target), "installed": target.is_file(), "log": str(log_path())}
    if data["installed"]:
        try:
            spec = plistlib.loads(target.read_bytes())
        except (OSError, plistlib.InvalidFileException, ValueError) as exc:
            data["error"] = f"unreadable plist: {exc}"
            spec = {}
        program = (spec.get("ProgramArguments") or [""])[0]
        data.update(program=program, program_exists=bool(program) and Path(program).is_file(),
                    every_minutes=int(spec.get("StartInterval") or 0) // 60,
                    home=(spec.get("EnvironmentVariables") or {}).get("RALPHY_HOME"))
    data["loaded"] = sys.platform == "darwin" and _launchctl("print", f"{_domain()}/{LABEL}").returncode == 0
    try:
        lines = log_path().read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        lines = []
    data["log_tail"] = lines[-5:]
    return data
