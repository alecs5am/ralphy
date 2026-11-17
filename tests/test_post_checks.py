"""Media and caption checks against the platform table, ffprobe parsing, handles and URLs."""

from __future__ import annotations

import pytest
from conftest import probe_json

from ralphy.errors import RalphyError
from ralphy.post import checks, platforms

TIKTOK, INSTAGRAM, YOUTUBE, X = (platforms.PLATFORMS[n] for n in ("tiktok", "instagram", "youtube", "x"))


def test_parse_probe_reads_size_duration_and_rotation():
    info = checks.parse_probe(probe_json(width=1920, height=1080, rotate=-90, duration=7.25))
    assert (info["width"], info["height"]) == (1080, 1920)  # rotated to its display size
    assert info["aspect"] == 0.5625 and info["duration"] == 7.25 and info["bytes"] == 1000 and info["audio"]
    with pytest.raises(RalphyError) as caught:
        checks.parse_probe({"streams": [{"codec_type": "audio"}], "format": {}})
    assert caught.value.code == "E_MEDIA_INVALID"


def test_check_media_limits():
    vertical = checks.parse_probe(probe_json(duration=30))
    for platform in (TIKTOK, INSTAGRAM, YOUTUBE, X):
        assert checks.check_media(platform, vertical) == ([], []), platform.name
    long = checks.parse_probe(probe_json(duration=181))
    assert checks.check_media(YOUTUBE, long)[0] and not checks.check_media(TIKTOK, long)[0]
    assert checks.check_media(X, checks.parse_probe(probe_json(duration=141)))[0]
    assert checks.check_media(INSTAGRAM, checks.parse_probe(probe_json(duration=2)))[0]
    square = checks.parse_probe(probe_json(width=1080, height=1080))
    errors, warnings = checks.check_media(YOUTUBE, square)
    assert errors == [] and "not 9:16" in warnings[0]
    wide = checks.parse_probe(probe_json(width=1920, height=1080))
    assert checks.check_media(YOUTUBE, wide)[0] and not checks.check_media(TIKTOK, wide)[0]
    huge = dict(vertical, bytes=X.limits.max_bytes + 1)
    assert "bytes" in checks.check_media(X, huge)[0][0]
    assert checks.check_media(TIKTOK, dict(vertical, duration=None, aspect=None))[0][0].endswith("no duration")


def test_check_caption_per_platform():
    assert checks.check_caption(TIKTOK, "a" * 2200) == ([], [])
    assert "2201 characters" in checks.check_caption(INSTAGRAM, "a" * 2201)[0][0]
    assert checks.check_caption(X, "a" * 281)[0]
    assert checks.check_caption(TIKTOK, "")[1] == ["TikTok: the caption is empty"]
    assert checks.check_caption(YOUTUBE, "Title\n" + "d" * 5000) == ([], [])
    assert "description" in checks.check_caption(YOUTUBE, "Title\n" + "d" * 5001)[0][0]
    assert "empty" in checks.check_caption(YOUTUBE, "")[0][0]
    assert "< or >" in checks.check_caption(YOUTUBE, "a -> b")[0][0]
    assert checks.youtube_title("  First line  \r\n\r\nrest  \n") == ("First line", "rest")
    assert checks.normalize_caption("a  \r\nb\t\n\n") == "a\nb"


def test_handles_and_urls():
    assert platforms.normalize_handle("ui.effects") == "@ui.effects"
    assert platforms.normalize_handle(" @ui_effects ") == "@ui_effects"
    assert platforms.normalize_handle("") is None
    with pytest.raises(RalphyError):
        platforms.normalize_handle("not a handle")
    assert platforms.same_handle("@UI.effects", "ui.effects")
    assert TIKTOK.profile_url("@ui.effects") == "https://www.tiktok.com/@ui.effects"
    assert INSTAGRAM.profile_url(None) == INSTAGRAM.home
    assert YOUTUBE.owns_url("https://youtu.be/abc") and YOUTUBE.owns_url("https://www.youtube.com/shorts/abc")
    assert not TIKTOK.owns_url("https://tiktok.com.evil.example/x") and TIKTOK.owns_url("https://m.tiktok.com/v/1")
    with pytest.raises(RalphyError) as caught:
        platforms.get("vine")
    assert caught.value.code == "E_PLATFORM_UNKNOWN"
