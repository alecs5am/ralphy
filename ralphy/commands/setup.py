"""`ralphy setup [--home <path>]`: create the home, config and cache folders and a keys.env template; run doctor."""

from __future__ import annotations

import json
import os
from pathlib import Path

from .. import files, paths
from . import Output
from .doctor import format_report, report

KEYS_TEMPLATE = """# Ralphy API keys: one NAME=value per line. This file stays on this machine (mode 0600).
# Uncomment a line and paste the key after "=". Ralphy reports key names, never values.
# FAL_KEY=
# ELEVENLABS_API_KEY=
# OPENROUTER_API_KEY=
# YOUTUBE_API_KEY=
# APIFY_TOKEN=
"""


def _ensure_dir(path: Path, mode: int, created: list[str]) -> None:
    if not path.exists():
        path.mkdir(parents=True, mode=mode)
        created.append(str(path))
    if mode & 0o077 == 0:
        os.chmod(path, mode)


def run(args) -> Output:
    created: list[str] = []
    settings_written = None
    if args.home:
        home = Path(os.path.expanduser(args.home)).absolute()
        _ensure_dir(paths.config_dir(), 0o700, created)
        settings = paths.read_settings()
        settings["home"] = str(home)
        files.atomic_write_text(paths.settings_path(), json.dumps(settings, indent=2) + "\n", mode=0o600)
        settings_written = str(paths.settings_path())
    home = Path(os.path.expanduser(args.home)).absolute() if args.home else paths.home()
    _ensure_dir(home, 0o755, created)
    _ensure_dir(paths.config_dir(), 0o700, created)
    _ensure_dir(paths.profiles_dir(), 0o700, created)
    _ensure_dir(paths.cache_dir(), 0o700, created)
    keys = paths.keys_env_path()
    keys_created = False
    if not keys.exists():
        files.atomic_write_text(keys, KEYS_TEMPLATE, mode=0o600)
        keys_created = True
        created.append(str(keys))
    else:
        os.chmod(keys, 0o600)
    warnings = []
    if args.home and os.environ.get("RALPHY_HOME") and Path(os.environ["RALPHY_HOME"]).absolute() != home:
        warnings.append(f"RALPHY_HOME={os.environ['RALPHY_HOME']} is set and wins over the saved home {home}")
    doctor = report()
    data = {
        "home": str(home),
        "config_dir": str(paths.config_dir()),
        "cache_dir": str(paths.cache_dir()),
        "keys_env": {"path": str(keys), "created": keys_created},
        "settings": settings_written,
        "created": created,
        "doctor": doctor,
        "warnings": warnings + doctor["warnings"],
    }
    lines = [f"Home:   {home}", f"Config: {paths.config_dir()}", f"Cache:  {paths.cache_dir()}"]
    lines.append(f"Keys:   {keys} ({'template written' if keys_created else 'kept'})")
    if settings_written:
        lines.append(f"Saved home in {settings_written}")
    return Output(data, "\n".join(lines) + "\n\n" + format_report(doctor))


def register(subparsers) -> None:
    parser = subparsers.add_parser("setup", help="create folders and a keys.env template", description=__doc__)
    parser.add_argument("--home", help="use this folder as RALPHY_HOME from now on (saved in the config dir)")
    parser.set_defaults(handler=run)
