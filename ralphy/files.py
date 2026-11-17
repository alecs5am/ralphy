"""Plain-file primitives: frontmatter markdown, atomic writes, locked CSV tables, and copy-free clones.

Every write is atomic (temp file in the same directory, then `os.replace`). CSV changes run under an
exclusive `fcntl.flock` on `<file>.lock` and rewrite the whole table atomically, so readers never see a
half-written row and need no lock. Clones never overwrite: the destination must not exist.
"""

from __future__ import annotations

import contextlib
import csv
import datetime as dt
import errno
import fcntl
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Callable, Iterable, Iterator
from pathlib import Path

import yaml

from .errors import RalphyError

_FRONTMATTER = re.compile(r"\A---[ \t]*\r?\n(.*?)^---[ \t]*(?:\r?\n|\Z)", re.S | re.M)
_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")


def utc_now() -> str:
    """The current time as `2026-11-17T12:00:00Z`."""
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_time(seconds: float) -> str:
    """A POSIX timestamp (e.g. an mtime) as `2026-11-17T12:00:00Z`."""
    return dt.datetime.fromtimestamp(seconds, dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- YAML


def _iso(value: dt.date | dt.datetime) -> str:
    if isinstance(value, dt.datetime):
        if value.tzinfo is not None:
            value = value.astimezone(dt.timezone.utc).replace(tzinfo=None)
        text = value.isoformat(timespec="seconds" if not value.microsecond else "microseconds")
        return text + "Z"
    return value.isoformat()


def normalize(value):
    """YAML turns unquoted timestamps into datetime objects; turn them back into ISO strings, recursively."""
    if isinstance(value, dt.date):
        return _iso(value)
    if isinstance(value, dict):
        return {str(k): normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize(v) for v in value]
    return value


class _Dumper(yaml.SafeDumper):
    pass


def _represent_str(dumper: yaml.SafeDumper, value: str):
    if _TIMESTAMP.match(value):
        # Plain `2026-11-17T12:00:00Z` as in the contract; `normalize` reads it back as the same string.
        return dumper.represent_scalar("tag:yaml.org,2002:timestamp", value)
    return dumper.represent_str(value)


_Dumper.add_representer(str, _represent_str)


def dump_yaml(data) -> str:
    return yaml.dump(data, Dumper=_Dumper, sort_keys=False, allow_unicode=True, default_flow_style=False, width=1000)


# ---------------------------------------------------------------- atomic writes


def atomic_write_bytes(path: Path, data: bytes, mode: int | None = None) -> None:
    path = Path(path)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        if mode is not None:
            os.chmod(tmp, mode)
        elif path.exists():
            os.chmod(tmp, path.stat().st_mode & 0o7777)
        else:
            os.chmod(tmp, 0o666 & ~umask())
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


def atomic_write_text(path: Path, text: str, mode: int | None = None) -> None:
    atomic_write_bytes(path, text.encode("utf-8"), mode)


def umask() -> int:
    current = os.umask(0)
    os.umask(current)
    return current


def write_new_text(path: Path, text: str, mode: int | None = None) -> None:
    """Write a file that must not exist yet; refuse rather than overwrite."""
    if Path(path).exists():
        raise RalphyError("E_EXISTS", f"{path} already exists", "Ralphy never overwrites files; pick a new name.")
    atomic_write_text(path, text, mode)


def place_new(src: Path, dst: Path) -> None:
    """Put a copy of `src` at `dst` atomically without ever replacing an existing `dst` (raises FileExistsError).

    A hardlink is tried first (same filesystem, no copy); otherwise the bytes go to a temp file next to
    `dst`, which is then linked into place. `src` is left as is; callers remove it when it is scratch.
    """
    src, dst = Path(src), Path(dst)
    try:
        os.link(src, dst)
        return
    except FileExistsError:
        raise
    except OSError as exc:
        if exc.errno not in (errno.EXDEV, errno.EPERM, errno.ENOTSUP, errno.EOPNOTSUPP, errno.EMLINK):
            raise
    fd, temp_name = tempfile.mkstemp(prefix=f".{dst.name}.", suffix=".tmp", dir=dst.parent)
    os.close(fd)
    temp = Path(temp_name)
    try:
        shutil.copyfile(src, temp)
        try:
            os.link(temp, dst)
        except FileExistsError:
            raise
        except OSError:
            if dst.exists():
                raise FileExistsError(errno.EEXIST, "File exists", str(dst)) from None
            os.rename(temp, dst)
    finally:
        with contextlib.suppress(OSError):
            temp.unlink()


# ---------------------------------------------------------------- frontmatter


def split_frontmatter(text: str) -> tuple[dict, str]:
    match = _FRONTMATTER.match(text)
    if not match:
        return {}, text
    try:
        meta = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError as exc:
        raise RalphyError(
            "E_FRONTMATTER", f"Invalid YAML frontmatter: {exc}", "Fix the YAML between the --- lines."
        ) from None
    if not isinstance(meta, dict):
        raise RalphyError("E_FRONTMATTER", "The frontmatter is not a YAML mapping", "Use `key: value` lines.")
    return normalize(meta), text[match.end() :]


def read_frontmatter(path: Path) -> tuple[dict, str]:
    """Return `(meta, body)`; a file without frontmatter has empty meta and its whole text as body."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        raise RalphyError("E_NOT_FOUND", f"{path} does not exist") from None
    try:
        return split_frontmatter(text)
    except RalphyError as exc:
        exc.message = f"{path}: {exc.message}"
        raise


def render_frontmatter(meta: dict, body: str) -> str:
    return f"---\n{dump_yaml(meta)}---\n{body}"


def write_frontmatter(path: Path, meta: dict, body: str) -> None:
    atomic_write_text(path, render_frontmatter(meta, body))


def update_frontmatter(path: Path, changes: dict) -> dict:
    """Set top-level keys, keeping the body, the other keys, their order and their comments.

    A key that already holds a one-line value is replaced in place; anything else falls back to a full
    re-dump of the frontmatter. Returns the new metadata.
    """
    path = Path(path)
    text = path.read_text(encoding="utf-8")
    meta, body = split_frontmatter(text)
    match = _FRONTMATTER.match(text)
    if not match:
        new_meta = {**meta, **changes}
        write_frontmatter(path, new_meta, body)
        return new_meta
    lines = match.group(1).splitlines(keepends=True)
    for key, value in changes.items():
        replacement = dump_yaml({key: value})
        if "\n" in replacement.rstrip("\n"):
            lines = None
            break
        index = _top_level_key_line(lines, key)
        if index is None:
            if lines and not lines[-1].endswith("\n"):
                lines[-1] += "\n"
            lines.append(replacement)
            continue
        following = index + 1
        if following < len(lines) and (lines[following][:1] in (" ", "\t", "-")):
            lines = None
            break
        lines[index] = replacement
    expected = normalize({**meta, **changes})
    if lines is not None:
        candidate = "---\n" + "".join(lines) + "---\n" + body
        try:
            reparsed, _ = split_frontmatter(candidate)
        except RalphyError:
            reparsed = None
        if reparsed == expected:
            atomic_write_text(path, candidate)
            return expected
    write_frontmatter(path, expected, body)
    return expected


def _top_level_key_line(lines: list[str], key: str) -> int | None:
    pattern = re.compile(rf"^{re.escape(key)}\s*:")
    for index, line in enumerate(lines):
        if pattern.match(line):
            return index
    return None


# ---------------------------------------------------------------- locks


@contextlib.contextmanager
def locked(path: Path) -> Iterator[None]:
    """Exclusive `flock` on `<path>.lock`, held for the duration of the block."""
    lock_path = Path(f"{path}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


@contextlib.contextmanager
def locked_dir(path: Path) -> Iterator[None]:
    """Exclusive `flock` on a directory itself, so allocating `nnn` or `vN` leaves no lock file behind."""
    fd = os.open(path, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


# ---------------------------------------------------------------- CSV


def read_csv(path: Path) -> list[dict[str, str]]:
    """All rows as dicts of strings; a missing file is an empty table. Missing cells read as ``""``."""
    try:
        with open(path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            return [{k: (v if v is not None else "") for k, v in row.items() if k is not None} for row in reader]
    except FileNotFoundError:
        return []


def _read_header(path: Path) -> list[str]:
    try:
        with open(path, newline="", encoding="utf-8") as handle:
            return next(csv.reader(handle), [])
    except FileNotFoundError:
        return []


def write_csv(path: Path, columns: Iterable[str], rows: Iterable[dict]) -> None:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(columns), extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: "" if v is None else v for k, v in row.items()})
    atomic_write_text(path, buffer.getvalue())


def mutate_csv(path: Path, columns: Iterable[str], change: Callable[[list[dict]], list[dict] | None]) -> list[dict]:
    """Read, change and atomically rewrite a table under its lock.

    `change` receives the rows and returns the new rows (or mutates in place and returns None). Columns in
    the file that the caller does not know about are kept, after the caller's columns.
    """
    path = Path(path)
    with locked(path):
        header = _read_header(path)
        known = list(columns)
        fieldnames = known + [c for c in header if c not in known]
        rows = read_csv(path)
        result = change(rows)
        if result is not None:
            rows = result
        write_csv(path, fieldnames, rows)
        return rows


def append_csv(path: Path, columns: Iterable[str], row: dict) -> dict:
    mutate_csv(path, columns, lambda rows: rows + [dict(row)])
    return row


def update_csv(path: Path, columns: Iterable[str], match: Callable[[dict], bool], changes: dict) -> list[dict]:
    """Apply `changes` to every row where `match(row)`; returns the changed rows."""
    changed: list[dict] = []

    def change(rows: list[dict]) -> None:
        for row in rows:
            if match(row):
                row.update(changes)
                changed.append(row)

    mutate_csv(path, columns, change)
    return changed


# ---------------------------------------------------------------- clones


def _native_clone(src: Path, dst: Path) -> bool:
    """APFS clone through `cp -c` (macOS). Works for files and, with -R, whole trees. False when unsupported."""
    if sys.platform != "darwin" or not shutil.which("cp"):
        return False
    recursive = ["-R", "-P"] if src.is_dir() and not src.is_symlink() else []
    command = ["cp", "-c", "-p", *recursive, str(src), str(dst)]
    result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode == 0:
        return True
    if dst.is_dir() and not dst.is_symlink():
        shutil.rmtree(dst, ignore_errors=True)
    elif dst.exists() or dst.is_symlink():
        with contextlib.suppress(OSError):
            dst.unlink()
    return False


def _hardlink(src: Path, dst: Path) -> bool:
    try:
        os.link(src, dst)
        return True
    except OSError:
        return False


def clone_file(src: Path, dst: Path, *, allow_hardlink: bool = False) -> str:
    """Clone one file without overwriting. Returns the method: `clone`, `hardlink` or `copy`.

    Hardlinks share the inode, so a later in-place edit of either name changes both. Use them only for
    files nobody edits in place (renders, media); snapshots of the working tree pass `allow_hardlink=False`
    and fall back to a real copy (which itself reflinks on Linux filesystems that support it).
    """
    src, dst = Path(src), Path(dst)
    if dst.exists() or dst.is_symlink():
        raise RalphyError("E_EXISTS", f"{dst} already exists", "Ralphy never overwrites files.")
    if src.is_symlink():
        os.symlink(os.readlink(src), dst)
        return "copy"
    if _native_clone(src, dst):
        return "clone"
    if allow_hardlink and _hardlink(src, dst):
        return "hardlink"
    shutil.copy2(src, dst)
    return "copy"


def clone_tree(
    src: Path,
    dst: Path,
    *,
    exclude_top: Iterable[str] = (),
    exclude_suffixes: Iterable[str] = (),
    allow_hardlink: bool = False,
) -> dict:
    """Clone a directory tree into `dst` (which must not exist), skipping top-level names in `exclude_top`
    and, at any depth, files whose suffix (lowercase, e.g. `.mp4`) is in `exclude_suffixes`.

    Returns `{"files": n, "methods": {"clone": n, ...}}`. `.DS_Store` files are never copied.
    """
    src, dst = Path(src), Path(dst)
    if dst.exists():
        raise RalphyError("E_EXISTS", f"{dst} already exists", "Ralphy never overwrites a snapshot.")
    excluded = set(exclude_top)
    suffixes = {s.lower() for s in exclude_suffixes}
    dst.mkdir(parents=True)
    methods: dict[str, int] = {}
    files = 0
    for entry in sorted(src.iterdir()):
        if entry.name in excluded or entry.name == ".DS_Store" or _skipped(entry, suffixes):
            continue
        target = dst / entry.name
        if entry.is_dir() and not entry.is_symlink():
            if _native_clone(entry, target):
                # The clone is our own fresh copy: drop what the snapshot must not hold.
                for path in sorted(target.rglob("*"), reverse=True):
                    if path.name == ".DS_Store" or _skipped(path, suffixes):
                        path.unlink()
                count = sum(1 for p in target.rglob("*") if p.is_file() or p.is_symlink())
                methods["clone"] = methods.get("clone", 0) + count
                files += count
                continue
            sub = _walk_copy(entry, target, allow_hardlink, suffixes)
            for method, count in sub.items():
                methods[method] = methods.get(method, 0) + count
                files += count
        else:
            method = clone_file(entry, target, allow_hardlink=allow_hardlink)
            methods[method] = methods.get(method, 0) + 1
            files += 1
    return {"files": files, "methods": methods}


def _skipped(path: Path, suffixes: set[str]) -> bool:
    """A file (not a folder) whose suffix is excluded."""
    return bool(suffixes) and path.suffix.lower() in suffixes and (path.is_symlink() or not path.is_dir())


def _walk_copy(src: Path, dst: Path, allow_hardlink: bool, suffixes: set[str] = frozenset()) -> dict[str, int]:
    methods: dict[str, int] = {}
    dst.mkdir()
    for entry in sorted(src.iterdir()):
        if entry.name == ".DS_Store" or _skipped(entry, suffixes):
            continue
        target = dst / entry.name
        if entry.is_dir() and not entry.is_symlink():
            for method, count in _walk_copy(entry, target, allow_hardlink, suffixes).items():
                methods[method] = methods.get(method, 0) + count
            continue
        if entry.is_symlink():
            os.symlink(os.readlink(entry), target)
            method = "copy"
        elif allow_hardlink and _hardlink(entry, target):
            method = "hardlink"
        else:
            shutil.copy2(entry, target)
            method = "copy"
        methods[method] = methods.get(method, 0) + 1
    return methods


def tree_files(root: Path, exclude_top: Iterable[str] = (), exclude_suffixes: Iterable[str] = (),
               *, hidden: bool = True) -> dict[str, Path]:
    """Relative POSIX path -> absolute path for every file under `root`, skipping excluded top-level names and
    files with an excluded suffix at any depth; `hidden=False` also skips every name starting with a dot."""
    root = Path(root)
    excluded = set(exclude_top)
    suffixes = {s.lower() for s in exclude_suffixes}
    found: dict[str, Path] = {}
    if not root.is_dir():
        return found
    for entry in root.iterdir():
        if entry.name in excluded or entry.name == ".DS_Store" or (not hidden and entry.name.startswith(".")):
            continue
        if entry.is_dir() and not entry.is_symlink():
            for path in entry.rglob("*"):
                if path.name == ".DS_Store" or (path.is_dir() and not path.is_symlink()) or _skipped(path, suffixes):
                    continue
                rel = path.relative_to(root)
                if not hidden and any(part.startswith(".") for part in rel.parts):
                    continue
                found[rel.as_posix()] = path
        elif not _skipped(entry, suffixes):
            found[entry.name] = entry
    return found
