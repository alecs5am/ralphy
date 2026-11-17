"""Checks a post must pass before a browser opens: the mp4 against the platform limits, the caption length.

Each check returns `(errors, warnings)`: an error refuses the plan (or fails the row on `run`), a warning is
shown and the post goes ahead.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from ..errors import RalphyError
from .platforms import Platform

NINE_SIXTEEN = 9 / 16


def normalize_caption(text: str | None) -> str:
    """Unix newlines, no trailing whitespace on lines or at the end."""
    lines = (text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return "\n".join(line.rstrip() for line in lines).strip()


def probe(path: Path) -> dict:
    """Duration, size and display width/height of an mp4 from `ffprobe`."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RalphyError("E_DEP_MISSING", "ffprobe is not installed; Ralphy checks every video before posting",
                          "Install ffmpeg (it ships ffprobe), e.g. `brew install ffmpeg`, then retry.")
    try:
        result = subprocess.run(
            [ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise RalphyError("E_MEDIA_INVALID", f"ffprobe could not read {path}: {exc}") from None
    if result.returncode != 0:
        tail = (result.stderr or "").strip().splitlines()[-3:]
        raise RalphyError("E_MEDIA_INVALID", f"ffprobe could not read {path}: {' '.join(tail) or 'no output'}",
                          "Render the version again; the file looks broken.")
    try:
        data = json.loads(result.stdout or "{}")
    except ValueError:
        raise RalphyError("E_MEDIA_INVALID", f"ffprobe printed no JSON for {path}") from None
    return parse_probe(data, path)


def parse_probe(data: dict, path: Path | None = None) -> dict:
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise RalphyError("E_MEDIA_INVALID", f"{path or 'the file'} has no video stream", "Render the version again.")
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    rotation = _rotation(video)
    if rotation in (90, 270):
        width, height = height, width
    duration = _float((data.get("format") or {}).get("duration")) or _float(video.get("duration"))
    size = _float((data.get("format") or {}).get("size"))
    if path is not None and Path(path).exists():
        size = Path(path).stat().st_size
    return {
        "duration": round(duration, 3) if duration is not None else None,
        "width": width,
        "height": height,
        "aspect": round(width / height, 4) if width and height else None,
        "bytes": int(size) if size is not None else None,
        "video_codec": video.get("codec_name"),
        "audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def _float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _rotation(stream: dict) -> int:
    values = [(stream.get("tags") or {}).get("rotate")]
    values += [entry.get("rotation") for entry in stream.get("side_data_list") or []]
    for value in values:
        number = _float(value)
        if number is not None:
            return int(abs(number)) % 360
    return 0


def check_media(platform: Platform, info: dict) -> tuple[list[str], list[str]]:
    limits = platform.limits
    errors: list[str] = []
    warnings: list[str] = []
    duration, aspect, size = info.get("duration"), info.get("aspect"), info.get("bytes")
    if duration is None:
        errors.append(f"{platform.label}: ffprobe reported no duration")
    elif duration < limits.min_duration:
        errors.append(f"{platform.label}: the video is {duration:g} s; the minimum is {limits.min_duration:g} s")
    elif duration > limits.max_duration:
        errors.append(f"{platform.label}: the video is {duration:g} s; the maximum is {limits.max_duration:g} s")
    if aspect is None:
        errors.append(f"{platform.label}: ffprobe reported no frame size")
    elif not limits.min_aspect <= aspect <= limits.max_aspect:
        errors.append(
            f"{platform.label}: the frame is {info['width']}x{info['height']} (aspect {aspect:.3f}); "
            f"allowed {limits.min_aspect:.3f} to {limits.max_aspect:.3f} (width / height)"
        )
    elif abs(aspect - NINE_SIXTEEN) > 0.01:
        warnings.append(f"{platform.label}: the frame is {info['width']}x{info['height']}, not 9:16")
    if size is not None and size > limits.max_bytes:
        errors.append(f"{platform.label}: the file is {size} bytes; the maximum is {limits.max_bytes}")
    return errors, warnings


def youtube_title(caption: str) -> tuple[str, str]:
    """YouTube's title is the first caption line; the rest is the description."""
    title, _, rest = normalize_caption(caption).partition("\n")
    return title.strip(), rest.strip()


def check_caption(platform: Platform, caption: str) -> tuple[list[str], list[str]]:
    text = normalize_caption(caption)
    errors: list[str] = []
    warnings: list[str] = []
    if platform.title_limit is not None:
        title, description = youtube_title(text)
        if not title:
            errors.append(f"{platform.label}: the first caption line is the title and it is empty")
        elif len(title) > platform.title_limit:
            errors.append(f"{platform.label}: the title (first line) is {len(title)} characters; "
                          f"the limit is {platform.title_limit}")
        if len(description) > platform.caption_limit:
            errors.append(f"{platform.label}: the description is {len(description)} characters; "
                          f"the limit is {platform.caption_limit}")
        if "<" in text or ">" in text:
            errors.append(f"{platform.label}: titles and descriptions cannot contain < or >")
        return errors, warnings
    if len(text) > platform.caption_limit:
        errors.append(f"{platform.label}: the caption is {len(text)} characters; the limit is {platform.caption_limit}")
    if not text:
        warnings.append(f"{platform.label}: the caption is empty")
    return errors, warnings
