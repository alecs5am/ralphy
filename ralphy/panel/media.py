"""Files the panel serves: safe paths under the home, content types, byte ranges, posters and probes.

Every path a request names is resolved with symlinks followed and must stay inside `RALPHY_HOME` (or the
directory a route serves from); anything else is refused. Posters are one JPEG frame per video, made with
ffmpeg once and cached under `RALPHY_CACHE_DIR/panel/posters/`, keyed by the file's path, size and mtime.
Probes (duration, audio track) are cached the same way in `RALPHY_CACHE_DIR/panel/probe.json`.
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import threading
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from .. import files

TYPES = {
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".opus": "audio/ogg", ".flac": "audio/flac",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
    ".svg": "image/svg+xml", ".avif": "image/avif", ".ico": "image/x-icon",
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8",
    ".srt": "text/plain; charset=utf-8", ".vtt": "text/vtt; charset=utf-8",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
    ".wasm": "application/wasm", ".glsl": "text/plain; charset=utf-8",
}
VIDEO_SUFFIXES = (".mp4", ".m4v", ".mov", ".webm")
CHUNK = 256 * 1024
_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


def content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in TYPES:
        return TYPES[suffix]
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def safe_join(root: Path, relative: str) -> Path | None:
    """`root/relative` with symlinks resolved, or None when it leaves `root` or names a hidden part.

    `relative` is a URL path (already percent-decoded), so `..`, absolute forms, backslashes and NUL bytes are
    refused before touching the disk; the resolved path is then checked again, which catches symlinks that
    point outside.
    """
    if "\x00" in relative or "\\" in relative:
        return None
    parts = PurePosixPath(relative.lstrip("/")).parts
    if not parts or any(part in ("..", ".") or part.startswith(".") for part in parts):
        return None
    base = Path(os.path.realpath(root))
    target = Path(os.path.realpath(base.joinpath(*parts)))
    return target if within(target, base) else None


def home_relative(path: Path, home: Path) -> str | None:
    """`path` relative to the home as a URL-quoted POSIX string, or None when it is outside."""
    try:
        rel = Path(path).resolve().relative_to(Path(os.path.realpath(home)))
    except (ValueError, OSError):
        return None
    return quote(rel.as_posix())


def file_url(path: Path | None, home: Path, *, stamp: bool = False) -> str | None:
    """`/files/<path>`; `stamp` adds `?t=` from size and mtime, so a replaced file (render.mp4) gets a new URL."""
    if path is None:
        return None
    rel = home_relative(path, home)
    if not rel:
        return None
    if not stamp:
        return f"/files/{rel}"
    try:
        stat = Path(path).stat()
    except OSError:
        return f"/files/{rel}"
    return f"/files/{rel}?t={stat.st_mtime_ns % 10**12:x}{stat.st_size % 10**6:x}"


def poster_url(path: Path | None, home: Path) -> str | None:
    if path is None:
        return None
    rel = home_relative(path, home)
    if not rel:
        return None
    try:
        stat = Path(path).stat()
    except OSError:
        return None
    return f"/poster/{rel}?t={stat.st_mtime_ns % 10**9:x}{stat.st_size % 10**6:x}"


def etag(path: Path) -> str:
    stat = path.stat()
    return f'"{stat.st_size:x}-{stat.st_mtime_ns:x}"'


def parse_range(header: str | None, size: int) -> tuple[int, int] | None | bool:
    """`(start, end)` inclusive for one satisfiable range; None for no (or an ignored) header; False for 416."""
    if not header:
        return None
    header = header.strip()
    if "," in header:
        header = header.split(",", 1)[0].strip()
    match = _RANGE.match(header)
    if not match:
        return None
    first, last = match.groups()
    if first == "" and last == "":
        return None
    if first == "":
        length = int(last)
        if length == 0:
            return False
        start = max(0, size - length)
        end = size - 1
    else:
        start = int(first)
        end = int(last) if last else size - 1
        end = min(end, size - 1)
    if size == 0 or start >= size or start > end:
        return False
    return start, end


# ---------------------------------------------------------------- probes


def _ffprobe(path: Path) -> dict:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {"duration": None, "audio": None}
    try:
        result = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(path)],
            capture_output=True, text=True, timeout=30,
        )
        data = json.loads(result.stdout or "{}") if result.returncode == 0 else {}
    except (OSError, ValueError, subprocess.SubprocessError):
        data = {}
    try:
        duration = round(float(data.get("format", {}).get("duration")), 3)
    except (TypeError, ValueError):
        duration = None
    streams = data.get("streams")
    audio = any(s.get("codec_type") == "audio" for s in streams) if isinstance(streams, list) else None
    return {"duration": duration, "audio": audio}


class Probes:
    """Duration and audio flag per video file, cached by path, size and mtime."""

    def __init__(self, cache_root: Path) -> None:
        self.path = cache_root / "panel" / "probe.json"
        self.lock = threading.Lock()
        self.entries: dict[str, dict] = {}
        self.dirty = False
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                self.entries = data
        except (OSError, ValueError):
            pass

    @staticmethod
    def key(path: Path) -> str | None:
        try:
            stat = path.stat()
        except OSError:
            return None
        return f"{path}|{stat.st_size}|{stat.st_mtime_ns}"

    def cached(self, path: Path) -> dict | None:
        key = self.key(path)
        with self.lock:
            return self.entries.get(key) if key else None

    def get(self, path: Path) -> dict:
        key = self.key(path)
        if key is None:
            return {"duration": None, "audio": None}
        with self.lock:
            if key in self.entries:
                return self.entries[key]
        found = _ffprobe(path)
        with self.lock:
            self.entries[key] = found
            self.dirty = True
        return found

    def many(self, paths: list[Path]) -> dict[Path, dict]:
        """Probe several files, at most eight ffprobe processes at a time, then save the cache once."""
        out: dict[Path, dict] = {}
        missing = []
        for path in paths:
            hit = self.cached(path)
            if hit is not None:
                out[path] = hit
            else:
                missing.append(path)
        if missing:
            from concurrent.futures import ThreadPoolExecutor

            with ThreadPoolExecutor(max_workers=8) as pool:
                for path, found in zip(missing, pool.map(self.get, missing), strict=True):
                    out[path] = found
            self.save()
        return out

    def save(self) -> None:
        with self.lock:
            if not self.dirty:
                return
            live = {k: v for k, v in self.entries.items() if Path(k.split("|", 1)[0]).exists()}
            self.entries = live
            self.dirty = False
            payload = json.dumps(live, ensure_ascii=False)
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            files.atomic_write_text(self.path, payload)
        except OSError:
            pass


# ---------------------------------------------------------------- posters


class Posters:
    """One JPEG frame per video (at 1 s, or the first frame of a shorter clip), made once with ffmpeg."""

    WIDTH = 540

    def __init__(self, cache_root: Path) -> None:
        self.root = cache_root / "panel" / "posters"
        self.locks: dict[str, threading.Lock] = {}
        self.guard = threading.Lock()
        self.slots = threading.Semaphore(3)

    def target(self, video: Path) -> Path | None:
        try:
            stat = video.stat()
        except OSError:
            return None
        digest = hashlib.sha1(f"{video}|{stat.st_size}|{stat.st_mtime_ns}".encode()).hexdigest()[:24]
        return self.root / f"{digest}.jpg"

    def get(self, video: Path) -> Path | None:
        out = self.target(video)
        if out is None:
            return None
        if out.is_file() and out.stat().st_size > 0:
            return out
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            return None
        with self.guard:
            lock = self.locks.setdefault(out.name, threading.Lock())
        with lock:
            if out.is_file() and out.stat().st_size > 0:
                return out
            self.root.mkdir(parents=True, exist_ok=True)
            temp = out.with_name(f".{out.stem}.{os.getpid()}.{threading.get_ident()}.jpg")
            with self.slots:
                for seek in ("1", "0"):
                    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", seek, "-i", str(video),
                               "-frames:v", "1", "-vf", f"scale={self.WIDTH}:-2", "-q:v", "3", str(temp)]
                    try:
                        subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       stdin=subprocess.DEVNULL, timeout=60)
                    except (OSError, subprocess.SubprocessError):
                        break
                    if temp.is_file() and temp.stat().st_size > 0:
                        os.replace(temp, out)
                        return out
            if temp.exists():
                temp.unlink()
        return None


def is_video(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_SUFFIXES
