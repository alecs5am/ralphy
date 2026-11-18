"""Panel JSON API, trends through a fake host, the page, preview routes and posters."""

from __future__ import annotations

import os
import shutil
import subprocess

import pytest
from test_panel_support import CONTENT, start_panel

from ralphy.panel import data


@pytest.fixture
def panel(ralphy_env):
    yield from start_panel(ralphy_env)


def test_health(panel):
    reply = panel.get("/api/health")
    assert reply.status == 200
    body = reply.json
    assert body["ok"] is True
    assert body["home"] == str(panel.home)
    assert body["writes"] == ["post-approve", "post-cancel"]
    assert isinstance(body["pid"], int)


def test_accounts(panel):
    body = panel.get("/api/accounts").json
    assert body["ok"] is True
    by_slug = {a["slug"]: a for a in body["accounts"]}
    assert set(by_slug) == {"ui-effects", "brand-worlds"}
    ui = by_slug["ui-effects"]
    assert by_slug["brand-worlds"]["monogram"] == "BW"
    assert ui["color"] != by_slug["brand-worlds"]["color"]
    assert ui["color"].startswith("d")
    assert ui["counts"]["posts"] == {"planned": 1, "approved": 1, "published": 1}
    assert [p["id"] for p in ui["posts"]] == ["p_aaaaaaaa", "p_bbbbbbbb", "p_cccccccc"]
    assert by_slug["brand-worlds"]["posts"] == []
    assert body["inbox"] == {"videos": 1}


def test_posts_carry_their_numbers_and_an_account_owns_what_was_posted_to_it(panel):
    from ralphy import files, model

    url = "https://www.tiktok.com/@ui/video/7311"
    bw = model.get_account("brand-worlds")
    files.write_csv(bw.posts_path, model.POSTS_COLUMNS, [
        {"id": "p_dddddddd", "content": CONTENT, "platform": "tiktok", "handle": "@bw", "status": "published",
         "url": url, "posted_at": "2026-11-18T10:00:00Z"}])
    files.write_csv(bw.stats_path, model.STATS_COLUMNS, [
        {"fetched_at": "2026-11-18T11:00:00Z", "platform": "tiktok", "url": url, "views": 10, "likes": 1},
        {"fetched_at": "2026-11-18T12:00:00Z", "platform": "tiktok", "url": url, "views": 25, "likes": 2},
        {"fetched_at": "2026-11-18T12:00:00Z", "platform": "tiktok", "handle": "@bw",
         "url": "https://www.tiktok.com/@bw/video/1", "views": 900},  # a video Ralphy did not post
    ])
    accounts = {a["slug"]: a for a in panel.get("/api/accounts").json["accounts"]}
    brand = accounts["brand-worlds"]
    assert brand["posts"][0]["stats"]["views"] == 25 and brand["posts"][0]["stats"]["likes"] == 2
    assert brand["totals"]["views"] == 25 and brand["totals"]["posts"] == 1  # only Ralphy's posts count
    assert brand["videos"] == 1  # the video posted to it, though its folder is empty
    item = next(c for c in panel.get("/api/content").json["content"] if c["id"] == CONTENT)
    assert item["post_accounts"] == ["brand-worlds", "ui-effects"] and item["views"] == 25
    detail = panel.get(f"/api/content/{CONTENT}").json["content"]
    post = next(p for p in detail["posts"] if p["id"] == "p_dddddddd")
    assert [h["views"] for h in post["history"]] == [10, 25] and post["account"] == "brand-worlds"
    assert post["analytics"] is None  # not read yet

    files.append_jsonl(bw.analytics_path, [
        {"fetched_at": "2026-11-18T12:00:00Z", "platform": "tiktok", "url": url, "content": CONTENT,
         "duration_s": 10, "avg_watch_s": 3.5, "retention": [[0, 1.0], [1.0, 0.2]]},
        {"fetched_at": "2026-11-18T13:00:00Z", "platform": "tiktok", "url": url, "content": CONTENT,
         "duration_s": 10, "avg_watch_s": 4.0, "retention": [[0, 1.0], [1.0, 0.3]]}])
    detail = panel.get(f"/api/content/{CONTENT}").json["content"]
    post = next(p for p in detail["posts"] if p["id"] == "p_dddddddd")
    assert post["analytics"]["avg_watch_s"] == 4.0 and post["analytics"]["retention"][-1] == [1.0, 0.3]
    listed = {a["slug"]: a for a in panel.get("/api/accounts").json["accounts"]}["brand-worlds"]
    assert "analytics" not in listed["posts"][0]  # curves only travel with the one video's detail


def test_account_detail(panel):
    body = panel.get("/api/accounts/ui-effects").json
    assert body["ok"] is True
    assert body["account"]["name"] == "UI Effects"
    assert len(body["account"]["posts"]) == 3


def test_unknown_account_is_404(panel):
    reply = panel.get("/api/accounts/nope")
    assert reply.status == 404
    body = reply.json
    assert body["ok"] is False
    assert body["error"]["code"] == "E_ACCOUNT_NOT_FOUND"


def test_unknown_route_is_404(panel):
    reply = panel.get("/api/nothing")
    assert reply.status == 404
    assert reply.json["error"]["code"] == "E_NOT_FOUND"


def test_content_list(panel):
    items = {c["id"]: c for c in panel.get("/api/content").json["content"]}
    assert set(items) == {CONTENT, "inbox/001-loose-idea"}
    ready = items[CONTENT]
    assert ready["state"] == "ready" and ready["render_stale"] is False
    assert ready["render"] == str(panel.content.render_file) and ready["rendered_at"].endswith("Z")
    assert ready["media_url"].startswith(f"/files/{CONTENT.replace('/', '/videos/')}/render.mp4?t=")
    assert ready["drag_path"] == str(panel.content.render_file)
    assert ready["live_url"] == f"/preview/{CONTENT}/work/index.html"
    assert ready["versions"] == ["v1", "v2"] and ready["latest"] == "v2"
    assert ready["posts"] == {"planned": 2, "published": 1, "attention": 0}
    assert not {"selected", "renders", "mp4", "ahead", "shown"} & set(ready)
    work = items["inbox/001-loose-idea"]
    assert work["state"] == "work" and work["render"] is None
    assert work["poster"] is None and work["media_url"] is None
    assert work["live_url"] == "/preview/inbox/001-loose-idea/work/index.html"


def test_a_stale_render_is_work_and_says_so(panel):
    later = panel.content.render_file.stat().st_mtime_ns + 5 * 10**9
    page = panel.content.path / "index.html"
    os.utime(page, ns=(later, later))
    item = next(c for c in panel.get("/api/content").json["content"] if c["id"] == CONTENT)
    assert item["render_stale"] is True and item["state"] == "work" and item["media_url"]


def test_content_detail(panel):
    body = panel.get(f"/api/content/{CONTENT}").json
    assert body["ok"] is True
    item = body["content"]
    versions = {v["name"]: v for v in item["versions"]}
    assert set(versions) == {"v1", "v2"}
    assert versions["v1"]["preview_url"] == f"/preview/{CONTENT}/v1/index.html"
    assert versions["v2"]["preview_url"] == f"/preview/{CONTENT}/v2/index.html"
    assert set(versions["v1"]) == {"name", "path", "note", "saved_at", "preview_url"}
    assert item["render"] == str(panel.content.render_file) and item["render_stale"] is False
    assert item["media_url"].startswith("/files/") and "?t=" in item["media_url"]
    assert item["refs"][0]["url"] == "https://example.com/r"
    assert item["refs"][0]["author"] == "a"
    assert [p["id"] for p in item["posts"]] == ["p_aaaaaaaa", "p_bbbbbbbb", "p_cccccccc"]
    assert item["live_url"] == f"/preview/{CONTENT}/work/index.html"
    assert item["state"] == "ready"


def test_a_new_render_gets_a_new_url(panel):
    before = panel.get(f"/api/content/{CONTENT}").json["content"]["media_url"]
    panel.content.render_file.write_bytes(b"a newer render, other size")
    after = panel.get(f"/api/content/{CONTENT}").json["content"]["media_url"]
    assert after != before and after.split("?")[0] == before.split("?")[0]


def test_missing_content_is_404(panel):
    reply = panel.get("/api/content/ui-effects/999-nothing")
    assert reply.status == 404
    assert reply.json["error"]["code"] == "E_CONTENT_NOT_FOUND"


def test_page_embeds_the_token(panel):
    reply = panel.get("/")
    assert reply.status == 200
    assert reply.headers["content-type"].startswith("text/html")
    assert panel.token in reply.text
    assert "window.RALPHY" in reply.text


def test_vendored_player_is_served(panel):
    reply = panel.get("/static/vendor/hyperframes-player.global.js")
    assert reply.status == 200
    assert reply.headers["content-type"].startswith("text/javascript")
    assert len(reply.body) > 1000


def test_monogram_keeps_a_short_all_caps_first_word(panel):
    # The approved prototype shows "UI" for UI Effects: a short all-caps first word is the monogram as is.
    assert panel.get("/api/accounts").json["accounts"][1]["monogram"] == "UI"
    assert data.monogram("UI Effects") == "UI"
    assert data.monogram("ASCII Punk") == "AP"


def test_monogram_rules():
    assert data.monogram("TikTok") == "TI"
    assert data.monogram("") == "?"


# ---------------------------------------------------------------- trends


def test_trends_through_a_fake_host(panel, monkeypatch, local_host):
    index = {"updated_at": "2026-11-17", "niches": [{"slug": "demo", "name": "Demo", "videos": 2}]}
    latest = {"niche": "demo", "updated_at": "2026-11-17",
              "items": [{"title": "One", "views": 10}, {"title": "Two", "views": 20}]}
    local_host.write_json("trends/v1/index.json", index)
    local_host.write_json("trends/v1/demo/latest.json", latest)
    monkeypatch.setenv("RALPHY_TRENDS_URL", local_host.url("trends/v1"))
    listing = panel.get("/api/trends")
    assert listing.status == 200
    assert listing.json["ok"] is True
    assert listing.json["niches"] == index["niches"]
    niche = panel.get("/api/trends/demo")
    assert niche.status == 200
    assert niche.json["niche"] == "demo"
    assert [i["title"] for i in niche.json["items"]] == ["One", "Two"]
    assert niche.json["total"] == 2


def test_trends_unreachable_is_502(panel, monkeypatch):
    monkeypatch.setenv("RALPHY_TRENDS_URL", "http://127.0.0.1:1/trends/v1")
    reply = panel.get("/api/trends")
    assert reply.status == 502
    assert reply.json["error"]["code"] == "E_TRENDS_UNREACHABLE"


# ---------------------------------------------------------------- preview


def test_preview_version_injects_the_runtime(panel):
    reply = panel.get(f"/preview/{CONTENT}/v2/index.html")
    assert reply.status == 200
    assert "<h1>v2</h1>" in reply.text
    tag = '<script data-hyperframes-preview-runtime="1" src="/static/vendor/hyperframe.runtime.iife.js"></script>'
    assert tag in reply.text
    assert reply.text.index(tag) < reply.text.rindex("</body>")


def test_preview_root_defaults_to_index(panel):
    reply = panel.get(f"/preview/{CONTENT}/v1/")
    assert reply.status == 200
    assert "<h1>v1</h1>" in reply.text


def test_preview_work_serves_the_working_tree(panel):
    (panel.content.path / "index.html").write_text("<html><body>work tree</body></html>", encoding="utf-8")
    reply = panel.get(f"/preview/{CONTENT}/work/index.html")
    assert reply.status == 200
    assert "work tree" in reply.text
    assert "hyperframe.runtime.iife.js" in reply.text


def test_preview_media_falls_back_to_content_media(panel):
    reply = panel.get(f"/preview/{CONTENT}/v1/media/clip.txt")
    assert reply.status == 200
    assert reply.body == b"media-bytes"


def test_preview_work_hides_the_render_and_versions(panel):
    assert panel.get(f"/preview/{CONTENT}/work/render.mp4").status == 404
    assert panel.get(f"/preview/{CONTENT}/work/versions/v1/index.html").status == 404


def test_preview_version_mp4_falls_back_to_the_working_tree(panel):
    assert not (panel.content.versions_dir / "v2" / "assets").exists()
    reply = panel.get(f"/preview/{CONTENT}/v2/assets/loop.mp4")
    assert reply.status == 200 and reply.body == b"asset-video"
    assert panel.get(f"/preview/{CONTENT}/v2/render.mp4").status == 404
    assert panel.get(f"/preview/{CONTENT}/v9/assets/loop.mp4").status == 404


@pytest.mark.parametrize("tail", ["../../notes.md", "..%2f..%2fnotes.md", "%2e%2e/%2e%2e/notes.md"])
def test_preview_traversal_is_refused(panel, tail):
    reply = panel.get(f"/preview/{CONTENT}/v1/{tail}")
    assert reply.status in (403, 404)
    assert b"title:" not in reply.body


def test_preview_unknown_version_is_404(panel):
    assert panel.get(f"/preview/{CONTENT}/v9/index.html").status == 404


# ---------------------------------------------------------------- posters


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")
def test_poster_is_made_once(panel):
    video = panel.content.render_file
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x112:d=2",
         "-pix_fmt", "yuv420p", str(video)],
        check=True, timeout=60,
    )
    item = next(c for c in panel.get("/api/content").json["content"] if c["id"] == CONTENT)
    poster_url = item["poster"]
    assert poster_url.startswith("/poster/")
    reply = panel.get(poster_url)
    assert reply.status == 200
    assert reply.headers["content-type"] == "image/jpeg"
    assert reply.body[:2] == b"\xff\xd8"
    cache = panel.env["cache"] / "panel" / "posters"
    made = sorted(cache.glob("*.jpg"))
    assert len(made) == 1
    assert panel.get(poster_url).status == 200
    assert sorted(cache.glob("*.jpg")) == made


def test_poster_of_a_non_video_is_404(panel):
    reply = panel.get("/poster/ui-effects/account.md")
    assert reply.status == 404
    assert reply.json["error"]["code"] == "E_NOT_FOUND"
