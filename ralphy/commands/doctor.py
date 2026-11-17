"""`ralphy doctor`: tools, folders and key names (never values). Always exits 0; `ready` says if renders can run."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from .. import __version__, paths
from . import Output

CHROME_MAC = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
CHROME_LINUX = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")

# name, required, purpose, version argv (after the executable)
TOOLS = (
    ("uv", True, "runs Ralphy and its tools", ["--version"]),
    ("bun", False, "runs HyperFrames (installed on the first render when neither Bun nor Node exists)", ["--version"]),
    ("node", False, "fallback runner for HyperFrames (npx)", ["--version"]),
    ("ffmpeg", True, "encodes renders; media tools", ["-version"]),
    ("ffprobe", True, "reads render duration; media tools", ["-version"]),
    ("yt-dlp", False, "pulls references (`ralphy tool pull`)", ["--version"]),
)


def _version(executable: str, argv: list[str]) -> str | None:
    try:
        result = subprocess.run([executable, *argv], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return None
    text = (result.stdout or result.stderr).strip().splitlines()
    return text[0].strip() if text else None


def _chrome() -> dict:
    path: str | None = None
    if sys.platform == "darwin":
        user_app = Path.home() / CHROME_MAC.relative_to("/")
        for candidate in (CHROME_MAC, user_app):
            if candidate.exists():
                path = str(candidate)
                break
    else:
        for name in CHROME_LINUX:
            found = shutil.which(name)
            if found:
                path = found
                break
    version = _version(path, ["--version"]) if path and sys.platform != "darwin" else None
    if path and sys.platform == "darwin":
        version = _mac_bundle_version(Path(path).parents[1] / "Info.plist")
    return {
        "name": "chrome",
        "found": path is not None,
        "path": path,
        "version": version,
        "required": False,
        "purpose": "signs in and posts to your accounts (posting)",
    }


def _mac_bundle_version(info_plist: Path) -> str | None:
    import plistlib

    try:
        with open(info_plist, "rb") as handle:
            return plistlib.load(handle).get("CFBundleShortVersionString")
    except (OSError, ValueError):
        return None


def check_tools() -> list[dict]:
    tools = [
        {
            "name": "python",
            "found": True,
            "path": sys.executable,
            "version": ".".join(str(p) for p in sys.version_info[:3]),
            "required": True,
            "purpose": "runs Ralphy (3.11 or newer)",
            "ok": sys.version_info >= (3, 11),
        }
    ]
    for name, required, purpose, argv in TOOLS:
        path = shutil.which(name)
        if path is None and name == "bun":
            local = Path.home() / ".bun" / "bin" / "bun"
            path = str(local) if local.exists() else None
        tools.append(
            {
                "name": name,
                "found": path is not None,
                "path": path,
                "version": _version(path, argv) if path else None,
                "required": required,
                "purpose": purpose,
            }
        )
    tools.append(_chrome())
    return tools


def _mode(path: Path) -> str | None:
    try:
        return oct(path.stat().st_mode & 0o777)
    except OSError:
        return None


def check_folders() -> list[dict]:
    rows = []
    for name, path in (
        ("home", paths.home()),
        ("config", paths.config_dir()),
        ("cache", paths.cache_dir()),
        ("keys.env", paths.keys_env_path()),
        ("profiles", paths.profiles_dir()),
    ):
        rows.append({"name": name, "path": str(path), "exists": path.exists(), "mode": _mode(path)})
    return rows


def check_keys() -> dict:
    from_file = paths.read_keys_env()
    names = sorted(set(paths.KNOWN_KEYS) | set(from_file))
    present = [n for n in names if os.environ.get(n) or from_file.get(n)]
    return {
        "present": present,
        "missing": [n for n in paths.KNOWN_KEYS if n not in present],
        "sources": {n: ("env" if os.environ.get(n) else "keys.env") for n in present},
        "keys_env": str(paths.keys_env_path()),
    }


def report() -> dict:
    tools = check_tools()
    folders = check_folders()
    keys = check_keys()
    runner = any(t["found"] for t in tools if t["name"] in ("bun", "node"))
    missing_required = [t["name"] for t in tools if t["required"] and (not t["found"] or t.get("ok") is False)]
    missing_optional = [t["name"] for t in tools if not t["required"] and not t["found"]]
    folders_ready = all(f["exists"] for f in folders if f["name"] in ("home", "config", "cache"))
    warnings = []
    keys_mode = next(f["mode"] for f in folders if f["name"] == "keys.env")
    if keys_mode and keys_mode != "0o600":
        warnings.append(f"{paths.keys_env_path()} has mode {keys_mode}; run `chmod 600` on it (or `ralphy setup`)")
    if not runner:
        warnings.append("neither Bun nor Node is installed; the first render installs Bun")
    return {
        "version": __version__,
        "hyperframes": paths.HYPERFRAMES_VERSION,
        "plugin_root": str(paths.plugin_root()),
        "home_source": paths.home_source(),
        "tools": tools,
        "folders": folders,
        "keys": keys,
        "missing": {"required": missing_required, "optional": missing_optional},
        "ready": not missing_required and folders_ready,
        "warnings": warnings,
    }


def format_report(data: dict) -> str:
    lines = [f"ralphy {data['version']} (HyperFrames {data['hyperframes']})", "", "Tools:"]
    for tool in data["tools"]:
        mark = "ok " if tool["found"] and tool.get("ok", True) else ("-- " if not tool["required"] else "!! ")
        detail = tool["version"] or tool["path"] or ("missing" if not tool["found"] else "")
        need = "" if tool["found"] else (" (required)" if tool["required"] else " (optional)")
        lines.append(f"  {mark}{tool['name']:<8} {detail}{need}")
    lines += ["", "Folders:"]
    for folder in data["folders"]:
        state = "ok " if folder["exists"] else "-- "
        lines.append(f"  {state}{folder['name']:<9} {folder['path']}")
    keys = data["keys"]
    lines += ["", f"Keys present: {', '.join(keys['present']) or 'none'}"]
    if keys["missing"]:
        lines.append(f"Keys missing: {', '.join(keys['missing'])} (add them to {keys['keys_env']})")
    lines += ["", "Ready." if data["ready"] else "Not ready: run `ralphy setup` and install the required tools."]
    return "\n".join(lines)


def run(args) -> Output:
    data = report()
    return Output(data, format_report(data))


def register(subparsers) -> None:
    parser = subparsers.add_parser("doctor", help="check tools, folders and keys", description=__doc__)
    parser.set_defaults(handler=run)
