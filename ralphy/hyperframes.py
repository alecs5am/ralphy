"""Render the working tree of a Content with HyperFrames into its one working render, `render.mp4`.

The working tree (everything but `versions/`, `notes.md`, `render.mp4` and temp renders) is materialized into a
temporary directory under the cache dir (files cloned, `media/` cloned or hardlinked in), so the project
HyperFrames sees has one root `index.html` and nothing from `versions/`. The result moves to a hidden temp file
next to `render.mp4`, ffprobe checks that it is a video with a duration, and one `os.replace` makes it
`render.mp4`. `render.mp4` is the only file Ralphy overwrites. Its mtime is set to the moment the tree was read,
so a file edited during the render marks the render stale. Temporary files are removed on success and failure.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from . import files, model, paths
from .errors import RalphyError

PACKAGE = f"hyperframes@{paths.HYPERFRAMES_VERSION}"
_ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
BUN_INSTALL = "curl -fsSL https://bun.sh/install | bash"


def _local_bunx() -> Path:
    return Path.home() / ".bun" / "bin" / "bunx"


def install_bun() -> Path:
    if not shutil.which("curl") or not shutil.which("bash"):
        raise RalphyError("E_DEP_MISSING", "Rendering needs Bun or Node, and curl is not available to install Bun",
                          "Install Bun from https://bun.sh or Node.js 22+, then retry.")
    sys.stderr.write(f"ralphy: neither Bun nor Node found; installing Bun ({BUN_INSTALL})\n")
    result = subprocess.run(["bash", "-c", BUN_INSTALL], stdout=sys.stderr, stderr=sys.stderr)
    local = _local_bunx()
    if result.returncode != 0 or not local.exists():
        raise RalphyError("E_DEP_MISSING", "Installing Bun failed", "Install Bun from https://bun.sh, then retry.")
    return local


def runner() -> tuple[list[str], str]:
    """The argv prefix that runs the pinned HyperFrames CLI, and the runner's name."""
    bunx = shutil.which("bunx")
    if bunx:
        return [bunx, PACKAGE], "bunx"
    local = _local_bunx()
    if local.exists():
        return [str(local), PACKAGE], "bunx"
    npx = shutil.which("npx")
    if npx:
        return [npx, "-y", PACKAGE], "npx"
    return [str(install_bun()), PACKAGE], "bunx"


def check_render(path: Path) -> tuple[dict, list[str]]:
    """`(info, warnings)` for a fresh render: duration, width, height from ffprobe.

    Raises `E_RENDER_FAILED` when ffprobe cannot read a video stream with a duration. Without ffprobe the file
    is accepted with a warning (HyperFrames itself needs ffmpeg, which ships ffprobe).
    """
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {"duration": None, "width": None, "height": None}, ["ffprobe not found; the render was not checked"]
    hint = "Run `ralphy doctor`; then render again. The previous render.mp4 is unchanged."
    try:
        result = subprocess.run(
            [ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True, timeout=60,
        )
        data = json.loads(result.stdout or "{}") if result.returncode == 0 else None
    except (OSError, ValueError, subprocess.SubprocessError):
        data = None
    if not isinstance(data, dict):
        raise RalphyError("E_RENDER_FAILED", "HyperFrames wrote a file ffprobe cannot read", hint)
    video = next((s for s in data.get("streams") or [] if s.get("codec_type") == "video"), None)
    duration = None
    for source in (data.get("format") or {}, video or {}):
        try:
            duration = float(source.get("duration"))
            break
        except (TypeError, ValueError):
            continue
    if video is None or not duration or duration <= 0:
        raise RalphyError("E_RENDER_FAILED", "HyperFrames wrote a file without a video stream or a duration", hint)
    return {"duration": round(duration, 3), "width": video.get("width"), "height": video.get("height")}, []


def materialize(content: model.Content, project: Path) -> list[str]:
    """Clone the working tree plus `media/` into `project`. Returns warnings."""
    temps = [p.name for p in content.path.glob(".render-*")]
    files.clone_tree(content.path, project, exclude_top=(*model.SNAPSHOT_EXCLUDE, *temps), allow_hardlink=False)
    if content.media_dir.is_dir():
        files.clone_tree(content.media_dir, project / model.MEDIA_DIR, allow_hardlink=True)
    if not (project / "index.html").is_file():
        raise RalphyError("E_NO_COMPOSITION", f"{content.id} has no index.html",
                          f"A HyperFrames project needs index.html at its root: add it to {content.path}.")
    others = sorted(p.name for p in project.glob("*.html") if p.name != "index.html")
    if others:
        return [f"the working tree has more HTML files at its root ({', '.join(others)}); HyperFrames expects "
                "only index.html"]
    return []


def _stream(command: list[str], cwd: Path) -> tuple[int, str]:
    """Run `command`, copying its stdout and stderr to our stderr as they arrive. Returns (code, tail)."""
    try:
        process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   stdin=subprocess.DEVNULL, env=paths.subprocess_env())
    except OSError as exc:
        raise RalphyError("E_RENDER_FAILED", f"Could not start {command[0]}: {exc}",
                          "Run `ralphy doctor` to check Bun, Node and ffmpeg.") from exc
    tail = b""
    assert process.stdout is not None
    err = getattr(sys.stderr, "buffer", None)
    try:
        while chunk := os.read(process.stdout.fileno(), 65536):
            if err is not None:
                err.write(chunk)
                err.flush()
            else:
                sys.stderr.write(chunk.decode("utf-8", "replace"))
            tail = (tail + chunk)[-8192:]
    except BaseException:
        process.kill()
        process.wait()
        raise
    code = process.wait()
    return code, tail.decode("utf-8", "replace")


def render_content(content: model.Content) -> dict:
    """`ralphy render`: the working tree to `render.mp4`, replacing the previous render. Progress goes to stderr."""
    target = content.render_file
    jobs = paths.cache_dir() / "render"
    jobs.mkdir(parents=True, exist_ok=True)
    job = Path(tempfile.mkdtemp(prefix=f"{content.account}--{content.folder}-", dir=jobs))
    temp = content.path / f".render-{os.getpid()}-{secrets.token_hex(3)}.mp4"
    read_at = time.time_ns()
    try:
        project = job / "project"
        warnings = materialize(content, project)
        output = job / "out.mp4"
        prefix, name = runner()
        command = [*prefix, "render", str(project), "--output", str(output)]
        sys.stderr.write(f"ralphy: rendering {content.id} with {name} {PACKAGE}\n")
        code, tail = _stream(command, job)
        if code != 0 or not output.is_file():
            plain = _ANSI.sub("", tail).replace("\r", "\n")
            last = "\n".join([line.rstrip() for line in plain.splitlines() if line.strip()][-12:])
            hint = "Run `ralphy doctor`; HyperFrames needs ffmpeg and a browser download on the first render."
            if not shutil.which("ffmpeg"):
                hint = "Install ffmpeg (HyperFrames encodes with it), then retry."
            reason = f"exit code {code}" if code != 0 else "no output file"
            raise RalphyError("E_RENDER_FAILED", f"HyperFrames render failed ({reason}):\n{last}".rstrip(), hint)
        shutil.move(output, temp)
        info, more = check_render(temp)
        warnings.extend(more)
        replaced = target.exists()
        os.replace(temp, target)
        os.utime(target, ns=(read_at, read_at))
    finally:
        shutil.rmtree(job, ignore_errors=True)
        if temp.exists():
            temp.unlink()
    stat = target.stat()
    return {
        "id": content.id,
        "path": str(target),
        "bytes": stat.st_size,
        **info,
        "rendered_at": files.iso_time(stat.st_mtime),
        "replaced": replaced,
        "runner": name,
        "warnings": warnings,
    }


def ensure_render(content: model.Content) -> dict | None:
    """Render when `render.mp4` is missing or stale; returns the render result, or None when it was current."""
    state = model.render_state(content)
    if state["render"] and not state["render_stale"]:
        return None
    return render_content(content)
