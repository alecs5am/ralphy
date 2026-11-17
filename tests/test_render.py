"""`ralphy render` against a fake `bunx` and a fake `ffprobe` on PATH (no real HyperFrames, no browser)."""

from __future__ import annotations

import os
import shutil
import subprocess

import pytest

from ralphy import hyperframes, model, paths


def _make(run, title="Hello"):
    run("account", "new", "Test Account")
    run("content", "new", "test-account", title)
    item = model.resolve_content("test-account/001-hello")
    (item.media_dir / "clip.mp4").write_bytes(b"media")
    return item


def _age(path, seconds=60):
    """Move a file's mtime into the past, so a later edit is unambiguously newer."""
    stamp = path.stat().st_mtime - seconds
    os.utime(path, (stamp, stamp))


def test_render_writes_render_mp4_from_the_working_tree(run, ralphy_env, fake_bunx):
    item = _make(run)
    (item.path / "assets").mkdir()
    (item.path / "assets" / "bg.mp4").write_bytes(b"asset")
    result = run("--json", "render", "test-account/001-hello")
    assert result.code == 0, result.out + result.err
    data = result.json
    assert data["id"] == "test-account/001-hello" and data["path"] == str(item.render_file)
    assert data["bytes"] == len(b"fake-mp4-bytes") and data["replaced"] is False and data["runner"] == "bunx"
    assert data["duration"] == 12.0 and data["width"] == 1080 and data["height"] == 1920
    assert data["rendered_at"].endswith("Z")
    assert item.render_file.read_bytes() == b"fake-mp4-bytes"
    assert "fake progress 50%" in result.err and "fake progress 100%" in result.err  # progress goes to stderr
    assert item.versions() == []  # rendering never saves a version

    argv = fake_bunx.read_text().split()
    assert argv[0] == f"hyperframes@{paths.HYPERFRAMES_VERSION}" and argv[1] == "render" and argv[3] == "--output"
    tree = fake_bunx.with_name("bunx.log.tree").read_text().split()
    assert "./index.html" in tree and "./media/clip.mp4" in tree and "./assets/bg.mp4" in tree
    assert not any(name.startswith(("./versions", "./render.mp4", "./notes.md", "./.render")) for name in tree)
    assert list((ralphy_env["cache"] / "render").iterdir()) == []  # temp dir removed
    assert not list(item.path.glob(".render-*"))  # no temp file left next to render.mp4


def test_render_overwrites_render_mp4_and_nothing_else(run, fake_bunx):
    item = _make(run)
    assert run("render", "hello").code == 0
    run("content", "save", "hello", "-m", "first")
    item.render_file.write_bytes(b"an older render")
    again = run("--json", "render", "hello").json
    assert again["replaced"] is True
    assert item.render_file.read_bytes() == b"fake-mp4-bytes"
    assert item.versions() == ["v1"] and (item.media_dir / "clip.mp4").read_bytes() == b"media"
    assert not (item.path / "renders").exists()
    assert not (item.account_path / "001-hello.mp4").exists()  # no top-level clone any more


def test_a_render_ffprobe_cannot_read_keeps_the_previous_render(run, fake_bunx, fake_ffprobe):
    item = _make(run)
    item.render_file.write_bytes(b"the good render")
    fake_ffprobe(broken=True)
    result = run("--json", "render", "hello")
    assert result.code == 1
    assert result.json["error"]["code"] == "E_RENDER_FAILED" and "ffprobe" in result.json["error"]["message"]
    assert item.render_file.read_bytes() == b"the good render"
    assert not list(item.path.glob(".render-*"))
    fake_ffprobe(duration=0)
    assert run("--json", "render", "hello").json["error"]["code"] == "E_RENDER_FAILED"
    fake_ffprobe()
    assert run("render", "hello").code == 0 and item.render_file.read_bytes() == b"fake-mp4-bytes"


def test_render_failure_reports_and_cleans_up(run, ralphy_env, fake_bunx, monkeypatch):
    item = _make(run)
    monkeypatch.setenv("FAKE_BUNX_FAIL", "1")
    result = run("--json", "render", "hello")
    assert result.code == 1
    error = result.json["error"]
    assert error["code"] == "E_RENDER_FAILED"
    assert "exit code 7" in error["message"] and "Chrome did not start" in error["message"]
    assert not item.render_file.exists()
    assert list((ralphy_env["cache"] / "render").iterdir()) == []
    assert item.versions() == []


def test_render_requires_an_index_html(run, fake_bunx):
    item = _make(run)
    (item.path / "index.html").rename(item.path / "scene.html")
    result = run("--json", "render", "hello")
    assert result.code == 1 and result.json["error"]["code"] == "E_NO_COMPOSITION"


def test_the_version_flag_is_gone(run, fake_bunx):
    _make(run)
    result = run("--json", "render", "hello", "--version", "v1")
    assert result.code == 1 and result.json["error"]["code"] == "E_USAGE"


def test_render_stale_follows_the_working_tree(run, fake_bunx):
    item = _make(run)
    assert model.render_state(item) == {"render": None, "render_stale": False, "rendered_at": None}
    run("render", "hello")
    _age(item.render_file)
    for path in item.path.rglob("*"):
        if path != item.render_file:
            _age(path, 120)
    assert model.render_state(item)["render_stale"] is False
    (item.path / "notes.md").write_text("---\ntitle: Hello\n---\nnew notes\n")  # notes are not composition
    (item.media_dir / "take-2.wav").write_bytes(b"new take")  # media is append-only input
    assert model.render_state(item)["render_stale"] is False
    (item.path / "compositions").mkdir()
    (item.path / "compositions" / "scene.html").write_text("<div></div>")
    state = model.render_state(item)
    assert state["render_stale"] is True and state["render"] == str(item.render_file)
    run("render", "hello")
    assert model.render_state(item)["render_stale"] is False


def test_a_file_edited_while_rendering_marks_the_render_stale(run, fake_bunx, monkeypatch):
    item = _make(run)
    real = hyperframes._stream

    def edit_during_render(command, cwd):
        (item.path / "index.html").write_text("<!-- edited mid-render -->", encoding="utf-8")
        return real(command, cwd)

    monkeypatch.setattr(hyperframes, "_stream", edit_during_render)
    assert run("render", "hello").code == 0
    assert model.render_state(item)["render_stale"] is True


def test_ensure_render_renders_only_when_needed(run, fake_bunx):
    item = _make(run)
    assert hyperframes.ensure_render(item)["replaced"] is False
    _age(item.render_file, -5)  # the render is newer than every file
    assert hyperframes.ensure_render(item) is None
    (item.path / "index.html").write_text("<!-- changed -->", encoding="utf-8")
    os.utime(item.path / "index.html", ns=(item.render_file.stat().st_mtime_ns + 10**9,) * 2)
    assert hyperframes.ensure_render(item)["replaced"] is True


@pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="needs ffmpeg")
def test_check_render_reads_a_real_mp4(tmp_path):
    video = tmp_path / "real.mp4"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "color=c=blue:s=108x192:d=1", "-pix_fmt", "yuv420p", str(video)], check=True, timeout=60)
    info, warnings = hyperframes.check_render(video)
    assert info["width"] == 108 and info["height"] == 192 and 0.9 <= info["duration"] <= 1.1 and warnings == []
    (tmp_path / "bad.mp4").write_bytes(b"not a video")
    with pytest.raises(Exception) as excinfo:
        hyperframes.check_render(tmp_path / "bad.mp4")
    assert getattr(excinfo.value, "code", None) == "E_RENDER_FAILED"
