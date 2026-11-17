"""Panel `/files/` route: byte ranges, ETags, HEAD, path safety, Host check and method limits."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from test_panel_support import start_panel

from ralphy.panel import media

URL = "/files/ui-effects/videos/001-type-charge/render.mp4"


@pytest.fixture
def panel(ralphy_env):
    yield from start_panel(ralphy_env)


def test_full_get(panel):
    reply = panel.get(URL)
    assert reply.status == 200
    assert reply.headers["accept-ranges"] == "bytes"
    assert reply.headers["content-type"] == "video/mp4"
    assert reply.headers["content-length"] == str(len(panel.render_bytes))
    assert reply.body == panel.render_bytes


def test_range_slice(panel):
    reply = panel.get(URL, headers={"Range": "bytes=100-199"})
    size = len(panel.render_bytes)
    assert reply.status == 206
    assert reply.headers["content-range"] == f"bytes 100-199/{size}"
    assert reply.headers["content-length"] == "100"
    assert reply.body == panel.render_bytes[100:200]


def test_suffix_range(panel):
    reply = panel.get(URL, headers={"Range": "bytes=-10"})
    size = len(panel.render_bytes)
    assert reply.status == 206
    assert reply.headers["content-range"] == f"bytes {size - 10}-{size - 1}/{size}"
    assert reply.body == panel.render_bytes[-10:]


def test_open_ended_range(panel):
    size = len(panel.render_bytes)
    reply = panel.get(URL, headers={"Range": f"bytes={size - 5}-"})
    assert reply.status == 206
    assert reply.headers["content-range"] == f"bytes {size - 5}-{size - 1}/{size}"
    assert reply.body == panel.render_bytes[-5:]


def test_range_end_past_the_file_is_clamped(panel):
    size = len(panel.render_bytes)
    reply = panel.get(URL, headers={"Range": f"bytes={size - 3}-{size + 500}"})
    assert reply.status == 206
    assert reply.body == panel.render_bytes[-3:]


def test_unsatisfiable_range(panel):
    size = len(panel.render_bytes)
    reply = panel.get(URL, headers={"Range": f"bytes={size}-"})
    assert reply.status == 416
    assert reply.headers["content-range"] == f"bytes */{size}"


def test_head_has_headers_and_no_body(panel):
    reply = panel.request("HEAD", URL)
    assert reply.status == 200
    assert reply.headers["content-length"] == str(len(panel.render_bytes))
    assert reply.headers["accept-ranges"] == "bytes"
    assert reply.body == b""


def test_etag_gives_304(panel):
    first = panel.get(URL)
    tag = first.headers["etag"]
    assert tag
    again = panel.get(URL, headers={"If-None-Match": tag})
    assert again.status == 304
    assert again.body == b""
    stale = panel.get(URL, headers={"If-None-Match": '"other"'})
    assert stale.status == 200


def test_missing_file_is_404(panel):
    reply = panel.get("/files/ui-effects/nothing.mp4")
    assert reply.status == 404
    assert reply.json["error"]["code"] == "E_NOT_FOUND"


def test_traversal_is_forbidden(panel):
    for path in ("/files/%2e%2e/%2e%2e/etc/passwd", "/files/ui-effects/..%2f..%2fx"):
        reply = panel.get(path)
        assert reply.status == 403, path
        assert reply.json["error"]["code"] == "E_FORBIDDEN"


def test_symlink_out_of_home_is_forbidden(panel):
    secret = panel.env["root"] / "secret.txt"
    secret.write_text("top secret", encoding="utf-8")
    os.symlink(secret, panel.home / "ui-effects" / "link.txt")
    reply = panel.get("/files/ui-effects/link.txt")
    assert reply.status == 403
    assert b"top secret" not in reply.body


def test_symlink_inside_home_is_served(panel):
    os.symlink(panel.render, panel.home / "ui-effects" / "alias.mp4")
    reply = panel.get("/files/ui-effects/alias.mp4")
    assert reply.status == 200
    assert reply.body == panel.render_bytes


def test_hidden_files_are_forbidden(panel):
    (panel.home / "ui-effects" / ".lock").write_text("x", encoding="utf-8")
    assert panel.get("/files/ui-effects/.lock").status == 403


def test_wrong_host_is_forbidden(panel):
    for path in (URL, "/api/health", "/"):
        reply = panel.get(path, headers={"Host": "evil.example"})
        assert reply.status == 403, path
        assert reply.json["error"]["code"] == "E_FORBIDDEN"


def test_put_is_not_allowed(panel):
    reply = panel.request("PUT", URL, body={})
    assert reply.status == 405
    assert reply.headers["allow"] == "GET, HEAD, POST"


def test_content_types():
    from pathlib import Path

    assert media.content_type(Path("a.mp4")) == "video/mp4"
    assert media.content_type(Path("a.html")).startswith("text/html")
    assert media.content_type(Path("a.unknownext")) == "application/octet-stream"


def test_parse_range_units():
    assert media.parse_range(None, 10) is None
    assert media.parse_range("bytes=2-4", 10) == (2, 4)
    assert media.parse_range("bytes=-3", 10) == (7, 9)
    assert media.parse_range("bytes=8-", 10) == (8, 9)
    assert media.parse_range("bytes=10-", 10) is False
    assert media.parse_range("bytes=5-2", 10) is False
    assert media.parse_range("bytes=-0", 10) is False
    assert media.parse_range("bytes=0-0", 0) is False
    assert media.parse_range("garbage", 10) is None
    assert media.parse_range("bytes=0-1,4-5", 10) == (0, 1)


def test_the_viewer_keeps_one_live_composition_per_screen():
    """Version tiles and rows stay static: a live player per version loaded every version's media and a 43-version
    film edit crashed the tab. Only the stage plays compositions; the grid caps its live frames."""
    static = Path(__file__).resolve().parents[1] / "ralphy" / "panel" / "static" / "js"
    assert "data-live" not in (static / "viewer.js").read_text(encoding="utf-8")
    assert "LIVE_MAX = 3" in (static / "content.js").read_text(encoding="utf-8")
