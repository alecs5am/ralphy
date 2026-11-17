"""The `platforms:` entries of `account.md`, the browser profile folders, their locks and bound identities.

An entry is `{platform, handle, profile, status, checked_at}` (docs/plans/2026-11-17-ralphy-v1.md). Writes
replace only the `platforms:` block of the frontmatter, so the body, the other keys and their comments
stay as they are; they run under the `account.md` lock and re-read the file first.

A profile is `RALPHY_CONFIG_DIR/profiles/<account>-<platform>/` (mode 0700), a Chrome user data dir.
Next to it, `<profile>.lock` is held (`flock`, non-blocking) by whichever command has the profile open,
so two runs never share one; the kernel drops it when the process dies. `<profile>.json` records the
platform user id the profile was first seen signed in as; a later session as another user never posts.
"""

from __future__ import annotations

import contextlib
import fcntl
import json
import os
import re
from collections.abc import Iterator
from pathlib import Path

from .. import files, model, paths
from ..errors import RalphyError
from . import platforms

STATUSES = ("ok", "needs_login", "unknown", "paused")
_PROFILE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_KEY = re.compile(r"^platforms\s*:")


# ---------------------------------------------------------------- account.md entries


def account_for(slug: str) -> model.Account:
    account = model.get_account(slug)
    if account.is_inbox:
        raise RalphyError("E_USAGE", "The inbox is not an Account and has no platforms",
                          "Create an account with `ralphy account new \"<name>\"`.")
    return account


def entries(account: model.Account) -> list[dict]:
    value = account.meta.get("platforms") or []
    return [dict(e) for e in value if isinstance(e, dict)] if isinstance(value, list) else []


def find(account: model.Account, platform: str) -> dict | None:
    name = platforms.get(platform).name
    return next((e for e in entries(account) if str(e.get("platform", "")).lower() == name), None)


def require(account: model.Account, platform: str) -> dict:
    entry = find(account, platform)
    if entry is None:
        raise RalphyError(
            "E_PLATFORM_NOT_FOUND",
            f"{account.slug} has no {platform} platform in account.md",
            f"Add it and sign in: `ralphy account login {account.slug} {platform} --handle @<handle>`.",
        )
    return entry


def profile_name(account: model.Account, entry: dict) -> str:
    name = str(entry.get("profile") or f"{account.slug}-{entry.get('platform')}")
    if not _PROFILE.match(name):
        raise RalphyError("E_BAD_PROFILE", f"Profile name '{name}' in {account.slug}/account.md is not kebab-case",
                          "Use `profile: <account>-<platform>`.")
    return name


def new_entry(account: model.Account, platform: str, handle: str | None) -> dict:
    return {
        "platform": platform,
        "handle": handle,
        "profile": f"{account.slug}-{platform}",
        "status": "unknown",
        "checked_at": None,
    }


def ensure(account: model.Account, platform: str, handle: str | None = None) -> tuple[dict, bool, list[str]]:
    """The entry for `platform`, added when missing; `--handle` fills or changes the handle. Returns
    `(entry, created, warnings)`."""
    name = platforms.get(platform).name
    handle = platforms.normalize_handle(handle)
    warnings: list[str] = []
    outcome: dict = {}

    def change(current: list[dict]) -> list[dict]:
        existing = next((e for e in current if str(e.get("platform", "")).lower() == name), None)
        if existing is None:
            entry = new_entry(account, name, handle)
            outcome.update(entry=entry, created=True)
            return [*current, entry]
        if handle and not platforms.same_handle(existing.get("handle"), handle):
            if existing.get("handle"):
                warnings.append(f"{name} handle changed from {existing['handle']} to {handle}; posts already "
                                "planned keep the old handle")
            existing["handle"] = handle
        outcome.update(entry=existing, created=False)
        return current

    mutate(account, change)
    if not outcome["entry"].get("handle"):
        warnings.append(f"{account.slug}:{name} has no handle; `post plan` needs one to verify the post "
                        f"(`ralphy account login {account.slug} {name} --handle @<handle>`)")
    return outcome["entry"], outcome["created"], warnings


def update(account: model.Account, platform: str, **changes) -> dict:
    """Set fields on one existing entry (e.g. `status`, `checked_at`); returns the entry."""
    name = platforms.get(platform).name
    if "status" in changes and changes["status"] not in STATUSES:
        raise ValueError(f"bad platform status {changes['status']}")
    found: dict = {}

    def change(current: list[dict]) -> list[dict]:
        for entry in current:
            if str(entry.get("platform", "")).lower() == name:
                entry.update(changes)
                found["entry"] = entry
        return current

    mutate(account, change)
    return found["entry"] if "entry" in found else require(account, platform)


def mutate(account: model.Account, change) -> list[dict]:
    """Read `platforms:` under the account.md lock, apply `change(entries) -> entries`, write it back."""
    path = account.path / model.ACCOUNT_FILE
    with files.locked(path):
        meta, _ = files.read_frontmatter(path)
        current = meta.get("platforms") or []
        current = [dict(e) for e in current if isinstance(e, dict)] if isinstance(current, list) else []
        result = change(current)
        write_platforms(path, result)
    account.meta = files.read_frontmatter(path)[0]
    return result


def write_platforms(path: Path, value: list[dict]) -> None:
    """Replace only the top-level `platforms:` block; fall back to a full frontmatter re-dump when the
    targeted edit does not read back as expected."""
    text = Path(path).read_text(encoding="utf-8")
    meta, body = files.split_frontmatter(text)
    expected = files.normalize({**meta, "platforms": value})
    candidate = _replace_block(text, files.dump_yaml({"platforms": value}))
    if candidate is not None:
        try:
            reparsed, rebody = files.split_frontmatter(candidate)
        except RalphyError:
            reparsed, rebody = None, None
        if reparsed == expected and rebody == body:
            files.atomic_write_text(path, candidate)
            return
    files.write_frontmatter(path, expected, body)


def _replace_block(text: str, block: str) -> str | None:
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return None
    end = next((i for i in range(1, len(lines)) if lines[i].rstrip() == "---"), None)
    if end is None:
        return None
    start = next((i for i in range(1, end) if _KEY.match(lines[i])), None)
    if start is None:
        if not lines[end - 1].endswith("\n"):
            lines[end - 1] += "\n"
        return "".join(lines[:end] + [block] + lines[end:])
    stop = start + 1
    last = start
    while stop < end:
        line = lines[stop]
        if line.strip() == "":
            stop += 1
            continue
        if line[:1] in (" ", "\t", "-"):
            last = stop
            stop += 1
            continue
        break
    return "".join(lines[:start] + [block] + lines[last + 1:])


# ---------------------------------------------------------------- profile folders and locks


def profile_dir(name: str) -> Path:
    if not _PROFILE.match(name):
        raise RalphyError("E_BAD_PROFILE", f"'{name}' is not a profile name", "Profiles are <account>-<platform>.")
    return paths.profiles_dir() / name


def ensure_profile_dir(name: str) -> Path:
    directory = profile_dir(name)
    root = directory.parent
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    directory.mkdir(exist_ok=True, mode=0o700)
    os.chmod(directory, 0o700)
    return directory


@contextlib.contextmanager
def profile_lock(name: str) -> Iterator[Path]:
    """Hold `profiles/<name>.lock` for the block; another holder raises `E_PROFILE_BUSY` at once."""
    lock_path = profile_dir(name).with_name(f"{name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            holder = os.pread(fd, 64, 0).decode("ascii", "replace").strip()
            raise RalphyError(
                "E_PROFILE_BUSY",
                f"The browser profile {name} is in use" + (f" by process {holder}" if holder else ""),
                "Close that browser window (or wait for the other ralphy command), then retry.",
            ) from None
        os.ftruncate(fd, 0)
        os.pwrite(fd, str(os.getpid()).encode("ascii"), 0)
        try:
            yield lock_path
        finally:
            os.ftruncate(fd, 0)
            fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


def identity_path(name: str) -> Path:
    return profile_dir(name).with_name(f"{name}.json")


def read_identity(name: str) -> dict:
    try:
        data = json.loads(identity_path(name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def write_identity(name: str, user_id: str) -> None:
    path = identity_path(name)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    files.atomic_write_text(path, json.dumps({"user_id": user_id, "bound_at": files.utc_now()}) + "\n", mode=0o600)
