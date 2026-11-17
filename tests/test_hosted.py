"""`ralphy trends` and `ralphy lib` against a local HTTP host: shapes, caching, offline fallback."""

from __future__ import annotations

import hashlib
import json

import pytest

INDEX = {
    "updated_at": "2026-11-17T06:00:00Z",
    "niches": [
        {"slug": "ui-motion", "name": "UI motion", "videos": 3, "updated_at": "2026-11-17T06:00:00Z"},
        {"slug": "film-stories", "name": "Film stories", "videos": 1},
    ],
}
LATEST = {
    "niche": "ui-motion",
    "updated_at": "2026-11-17T06:00:00Z",
    "items": [
        {"url": "https://tiktok.com/@a/video/1", "platform": "tiktok", "title": "Type charge", "views": 1200000,
         "multiplier": 14.2},
        {"url": "https://youtube.com/shorts/2", "platform": "youtube", "title": "Glass card", "views": 90000},
        {"url": "https://tiktok.com/@b/video/3", "platform": "tiktok"},
    ],
}


@pytest.fixture
def trends_host(local_host, monkeypatch):
    local_host.write_json("trends/v1/index.json", INDEX)
    local_host.write_json("trends/v1/ui-motion/latest.json", LATEST)
    monkeypatch.setenv("RALPHY_TRENDS_URL", local_host.url("trends/v1"))
    return local_host


def test_trends_list_and_niche(run, trends_host):
    listing = run("--json", "trends", "--list").json
    assert [n["slug"] for n in listing["niches"]] == ["ui-motion", "film-stories"]
    assert listing["source"] == "network" and listing["stale"] is False and listing["updated_at"]
    niche = run("--json", "trends", "ui-motion", "--limit", "2").json
    assert niche["niche"] == "ui-motion" and niche["total"] == 3 and len(niche["items"]) == 2
    assert niche["items"][0]["multiplier"] == 14.2
    human = run("trends", "ui-motion")
    assert "Type charge" in human.out and "x14.2" in human.out


def test_trends_cache_ttl_and_offline_fallback(run, trends_host, ralphy_env):
    assert run("--json", "trends", "ui-motion").json["source"] == "network"
    assert (ralphy_env["cache"] / "trends" / "niches" / "ui-motion.json").is_file()
    cached = run("--json", "trends", "ui-motion").json
    assert cached["source"] == "cache" and cached["stale"] is False
    trends_host.stop()
    stale = run("--json", "trends", "ui-motion", "--refresh").json
    assert stale["ok"] is True and stale["source"] == "cache" and stale["stale"] is True
    assert stale["warnings"] and "cached copy" in stale["warnings"][0]
    assert stale["total"] == 3
    human = run("trends", "ui-motion", "--refresh")
    assert human.code == 0 and "warning:" in human.err


def test_trends_errors(run, trends_host):
    missing = run("--json", "trends", "nothing-here")
    assert missing.code == 1 and missing.json["error"]["code"] == "E_NICHE_NOT_FOUND"
    bad = run("--json", "trends", "../etc")
    assert bad.json["error"]["code"] == "E_USAGE"
    trends_host.stop()
    offline = run("--json", "trends", "--list")
    assert offline.code == 1 and offline.json["error"]["code"] == "E_TRENDS_UNREACHABLE"


def test_cache_is_keyed_by_url(run, trends_host, monkeypatch, local_host):
    run("trends", "--list")
    other = dict(INDEX, niches=[{"slug": "other"}])
    local_host.write_json("mirror/v1/index.json", other)
    monkeypatch.setenv("RALPHY_TRENDS_URL", local_host.url("mirror/v1"))
    assert [n["slug"] for n in run("--json", "trends", "--list").json["niches"]] == ["other"]


MOTION = b"export function typeCharge(tl, o) {}\n"


@pytest.fixture
def library_host(local_host, monkeypatch):
    (local_host.root / "library" / "v1" / "motion").mkdir(parents=True)
    (local_host.root / "library" / "v1" / "motion" / "type-charge.js").write_bytes(MOTION)
    (local_host.root / "library" / "v1" / "prompts").mkdir(parents=True)
    (local_host.root / "library" / "v1" / "prompts" / "glass.md").write_text("glass prompt\n")
    items = [
        {"id": "motion/type-charge", "kind": "motion", "name": "Type Charge", "category": "text",
         "summary": "Letters charge up and burst", "tags": ["kinetic-type", "burst"],
         "path": "motion/type-charge.js", "sha256": hashlib.sha256(MOTION).hexdigest(), "bytes": len(MOTION)},
        {"id": "prompt/glass", "kind": "prompt", "name": "Glass card", "summary": "Frosted glass UI card",
         "tags": ["glass", "ui"], "path": "prompts/glass.md"},
        {"id": "video/bad", "kind": "video", "name": "Bad checksum", "path": "prompts/glass.md", "sha256": "0" * 64},
        {"id": "video/evil", "kind": "video", "name": "Traversal", "path": "../../secret"},
    ]
    local_host.write_json("library/v1/index.json", {"updated_at": "2026-11-17T06:00:00Z", "items": items})
    monkeypatch.setenv("RALPHY_LIBRARY_URL", local_host.url("library/v1"))
    return local_host


def test_lib_search(run, library_host):
    by_tag = run("--json", "lib", "search", "burst").json
    assert [i["id"] for i in by_tag["items"]] == ["motion/type-charge"]
    by_words = run("--json", "lib", "search", "glass", "ui").json
    assert [i["id"] for i in by_words["items"]] == ["prompt/glass"]
    by_kind = run("--json", "lib", "search", "--kind", "motion").json
    assert [i["id"] for i in by_kind["items"]] == ["motion/type-charge"]
    assert run("--json", "lib", "search", "card", "--kind", "motion").json["items"] == []
    assert run("--json", "lib", "search", "a", "--limit", "1").json["total"] >= 2


def test_lib_get_downloads_verifies_and_copies(run, library_host, ralphy_env, tmp_path):
    data = run("--json", "lib", "get", "motion/type-charge", "--out", str(tmp_path / "work")).json
    cached = ralphy_env["cache"] / "library" / "files" / "motion" / "type-charge.js"
    assert data["files"][0]["path"] == str(cached) and data["files"][0]["source"] == "network"
    assert cached.read_bytes() == MOTION
    assert (tmp_path / "work" / "type-charge.js").read_bytes() == MOTION
    again = run("--json", "lib", "get", "motion/type-charge", "--out", str(tmp_path / "work")).json
    assert again["files"][0]["source"] == "cache"  # hash matched, no download
    (tmp_path / "work" / "type-charge.js").write_bytes(b"user edits")
    clash = run("--json", "lib", "get", "motion/type-charge", "--out", str(tmp_path / "work"))
    assert clash.code == 1 and clash.json["error"]["code"] == "E_EXISTS"
    assert (tmp_path / "work" / "type-charge.js").read_bytes() == b"user edits"


def test_lib_get_errors_and_offline(run, library_host):
    assert run("--json", "lib", "get", "nope").json["error"]["code"] == "E_LIB_NOT_FOUND"
    assert run("--json", "lib", "get", "video/bad").json["error"]["code"] == "E_CHECKSUM"
    assert run("--json", "lib", "get", "video/evil").json["error"]["code"] == "E_BAD_RESPONSE"
    assert run("lib", "get", "prompt/glass").code == 0
    library_host.stop()
    offline = run("--json", "lib", "get", "prompt/glass", "--refresh").json
    assert offline["ok"] is True and offline["stale"] is True
    assert any("cached" in w for w in offline["warnings"])
    assert run("--json", "lib", "get", "motion/type-charge").json["error"]["code"] == "E_LIBRARY_UNREACHABLE"


def test_index_cache_file_format(run, library_host, ralphy_env):
    run("lib", "search", "x")
    entry = json.loads((ralphy_env["cache"] / "library" / "index.json").read_text())
    assert set(entry) == {"url", "fetched", "fetched_at", "data"}
    assert entry["url"].endswith("/library/v1/index.json")
