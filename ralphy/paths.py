"""Where Ralphy keeps things: the browsable home, the private config dir, the disposable cache, the plugin root.

Resolution order for the home folder: `RALPHY_HOME`, then `home` in `<config dir>/settings.json`
(written by `ralphy setup --home`), then `~/ralphy`. The config and cache dirs come from
`RALPHY_CONFIG_DIR` and `RALPHY_CACHE_DIR` with the defaults `~/.config/ralphy` and `~/.cache/ralphy`.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

HYPERFRAMES_VERSION = "0.6.31"
KNOWN_KEYS = ("FAL_KEY", "ELEVENLABS_API_KEY", "OPENROUTER_API_KEY", "YOUTUBE_API_KEY", "APIFY_TOKEN")
DEFAULT_TRENDS_URL = "https://ralphy-trends.web.app/trends/v1"
DEFAULT_LIBRARY_URL = "https://ralphy-library.web.app/library/v1"

_KEY_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")


def _expand(value: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(value))).absolute()


def config_dir() -> Path:
    return _expand(os.environ.get("RALPHY_CONFIG_DIR") or "~/.config/ralphy")


def cache_dir() -> Path:
    return _expand(os.environ.get("RALPHY_CACHE_DIR") or "~/.cache/ralphy")


def settings_path() -> Path:
    return config_dir() / "settings.json"


def read_settings() -> dict:
    try:
        data = json.loads(settings_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def home() -> Path:
    env = os.environ.get("RALPHY_HOME")
    if env:
        return _expand(env)
    configured = read_settings().get("home")
    if isinstance(configured, str) and configured.strip():
        return _expand(configured)
    return _expand("~/ralphy")


def home_source() -> str:
    """Which rule picked the home folder: `env`, `settings` or `default`."""
    if os.environ.get("RALPHY_HOME"):
        return "env"
    configured = read_settings().get("home")
    if isinstance(configured, str) and configured.strip():
        return "settings"
    return "default"


def plugin_root() -> Path:
    """The repository root that ships `ralphy/`, `skills/` and `tools/`."""
    return Path(__file__).resolve().parent.parent


def tools_dir() -> Path:
    env = os.environ.get("RALPHY_TOOLS_DIR")
    return _expand(env) if env else plugin_root() / "tools"


def keys_env_path() -> Path:
    return config_dir() / "keys.env"


def profiles_dir() -> Path:
    return config_dir() / "profiles"


def trends_url() -> str:
    return (os.environ.get("RALPHY_TRENDS_URL") or DEFAULT_TRENDS_URL).rstrip("/")


def library_url() -> str:
    return (os.environ.get("RALPHY_LIBRARY_URL") or DEFAULT_LIBRARY_URL).rstrip("/")


def parse_keys_env(text: str) -> dict[str, str]:
    """Parse `NAME=value` lines; `#` comments, blank lines and empty values are skipped."""
    keys: dict[str, str] = {}
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            continue
        match = _KEY_LINE.match(line)
        if not match:
            continue
        name, value = match.group(1), match.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        if value:
            keys[name] = value
    return keys


def read_keys_env() -> dict[str, str]:
    try:
        return parse_keys_env(keys_env_path().read_text(encoding="utf-8"))
    except OSError:
        return {}


def subprocess_env() -> dict[str, str]:
    """The environment for child processes: ours, plus `keys.env` names we do not already have, plus the folders."""
    env = dict(os.environ)
    for name, value in read_keys_env().items():
        env.setdefault(name, value)
    env["RALPHY_HOME"] = str(home())
    env["RALPHY_CONFIG_DIR"] = str(config_dir())
    env["RALPHY_CACHE_DIR"] = str(cache_dir())
    return env
