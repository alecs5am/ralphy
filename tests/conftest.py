"""Shared fixtures for the Python core: temporary Ralphy folders, an in-process CLI runner, a local HTTP host."""

from __future__ import annotations

import functools
import http.server
import json
import os
import shutil
import socketserver
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

import pytest

from ralphy import cli

REPO = Path(__file__).resolve().parent.parent


@dataclass
class Result:
    code: int
    out: str
    err: str

    @property
    def json(self) -> dict:
        lines = [line for line in self.out.splitlines() if line.strip()]
        assert len(lines) == 1, f"expected exactly one JSON line on stdout, got: {self.out!r}"
        return json.loads(lines[0])


@pytest.fixture
def ralphy_env(tmp_path, monkeypatch):
    """Point RALPHY_HOME, RALPHY_CONFIG_DIR and RALPHY_CACHE_DIR at a temp dir and return those paths."""
    home = tmp_path / "home"
    config = tmp_path / "config"
    cache = tmp_path / "cache"
    monkeypatch.setenv("RALPHY_HOME", str(home))
    monkeypatch.setenv("RALPHY_CONFIG_DIR", str(config))
    monkeypatch.setenv("RALPHY_CACHE_DIR", str(cache))
    monkeypatch.delenv("RALPHY_TOOLS_DIR", raising=False)
    monkeypatch.delenv("RALPHY_TRENDS_URL", raising=False)
    monkeypatch.delenv("RALPHY_LIBRARY_URL", raising=False)
    for key in ("FAL_KEY", "ELEVENLABS_API_KEY", "OPENROUTER_API_KEY", "YOUTUBE_API_KEY", "APIFY_TOKEN"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.chdir(tmp_path)
    return {"root": tmp_path, "home": home, "config": config, "cache": cache}


@pytest.fixture
def run(ralphy_env, capfd):
    """Run the CLI in process: `run("content", "list", "--json")` -> Result(code, out, err)."""

    def invoke(*args: str) -> Result:
        capfd.readouterr()
        code = cli.main([str(a) for a in args])
        sys.stdout.flush()
        sys.stderr.flush()
        captured = capfd.readouterr()
        return Result(code, captured.out, captured.err)

    return invoke


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:  # noqa: D401 - silence request logs
        pass


class LocalHost:
    """A static HTTP server over a temp dir, started and stopped by the test."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.server: socketserver.TCPServer | None = None
        self.thread: threading.Thread | None = None
        self.port = 0

    def start(self) -> LocalHost:
        handler = functools.partial(_QuietHandler, directory=str(self.root))
        self.server = socketserver.TCPServer(("127.0.0.1", self.port), handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return self

    def stop(self) -> None:
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None

    def url(self, path: str = "") -> str:
        return f"http://127.0.0.1:{self.port}/{path}".rstrip("/")

    def write_json(self, rel: str, data) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
        return path


@pytest.fixture
def local_host(tmp_path):
    host = LocalHost(tmp_path / "www")
    host.root.mkdir()
    host.start()
    yield host
    host.stop()


FAKE_FFPROBE = """#!/bin/sh
# Stand-in for `ffprobe -print_format json -show_format -show_streams <file>`.
for last; do :; done
[ -f "$last" ] || { echo "$last: No such file or directory" >&2; exit 1; }
echo "$@" > "$FAKE_FFPROBE_JSON.argv"
cat "$FAKE_FFPROBE_JSON"
"""


def probe_json(width=1080, height=1920, duration=12.0, rotate=None, audio=True) -> dict:
    video = {"codec_type": "video", "codec_name": "h264", "width": width, "height": height}
    if rotate is not None:
        video["side_data_list"] = [{"rotation": rotate}]
    streams = [video] + ([{"codec_type": "audio", "codec_name": "aac"}] if audio else [])
    return {"streams": streams, "format": {"duration": str(duration), "size": "1000"}}


@pytest.fixture
def fake_ffprobe(tmp_path, monkeypatch):
    """Put a fake `ffprobe` first on PATH; returns `set(**probe_json kwargs)` to change what it reports.

    `set(broken=True)` makes it print nothing and fail, like ffprobe on a file that is not a video.
    """
    bin_dir = tmp_path / "fakeprobe"
    bin_dir.mkdir()
    script = bin_dir / "ffprobe"
    script.write_text(FAKE_FFPROBE)
    script.chmod(0o755)
    data = tmp_path / "ffprobe.json"
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}")
    monkeypatch.setenv("FAKE_FFPROBE_JSON", str(data))

    def set_probe(broken: bool = False, **kwargs) -> None:
        if broken:
            script.write_text("#!/bin/sh\necho 'Invalid data found when processing input' >&2\nexit 1\n")
            return
        script.write_text(FAKE_FFPROBE)
        data.write_text(json.dumps(probe_json(**kwargs)))

    set_probe()
    return set_probe


FAKE_BUNX = """#!/bin/sh
# Stand-in for `bunx hyperframes@<v> render <dir> --output <mp4>`; records what it saw.
echo "$@" > "$FAKE_BUNX_LOG"
(cd "$3" && find . -print | sort) > "$FAKE_BUNX_LOG.tree"
echo "fake progress 50%" >&2
if [ -n "$FAKE_BUNX_FAIL" ]; then
  echo "fake failure: Chrome did not start" >&2
  exit 7
fi
[ -f "$3/index.html" ] || exit 3
printf 'fake-mp4-bytes' > "$5"
echo "fake progress 100%"
"""


@pytest.fixture
def fake_bunx(tmp_path, monkeypatch, fake_ffprobe):
    """Put a fake `bunx` first on PATH (and the fake ffprobe that checks its output); returns its argv log path."""
    bin_dir = tmp_path / "fakebin"
    bin_dir.mkdir()
    script = bin_dir / "bunx"
    script.write_text(FAKE_BUNX)
    script.chmod(0o755)
    log = tmp_path / "bunx.log"
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}")
    monkeypatch.setenv("FAKE_BUNX_LOG", str(log))
    monkeypatch.delenv("FAKE_BUNX_FAIL", raising=False)
    return log


@pytest.fixture
def has_uv():
    if not shutil.which("uv"):
        pytest.skip("uv is not installed")
