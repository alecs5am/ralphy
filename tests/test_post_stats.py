"""Stats parsers on payloads shaped like the platforms' own responses, and fetch with a scripted collector."""

from __future__ import annotations

import contextlib

from test_post_fakes import FakeContext, FakePage

from ralphy import files, model
from ralphy.post import browser, stats


def test_instagram_media_keeps_the_owner_reels_with_numbers():
    payload = {"data": {"xdt_api__v1__clips__user__connection_v2": {"edges": [
        {"node": {"media": {"code": "REEL1", "product_type": "clips", "play_count": 142, "like_count": 1,
                            "comment_count": 0, "reshare_count": 2, "user": {"pk": "99"}}}},
        {"node": {"media": {"code": "POST1", "product_type": "feed", "like_count": 7, "user": {"pk": "99"}}}},
        {"node": {"media": {"code": "OTHER", "like_count": 9, "user": {"pk": "5"}}}},  # a suggestion
        {"node": {"media": {"code": "NONUM", "user": {"pk": "99"}}}},
    ]}}}
    found = stats.instagram_media(payload, "99")
    assert [m["id"] for m in found] == ["REEL1", "POST1"]
    assert found[0] == {"id": "REEL1", "url": "https://www.instagram.com/reel/REEL1/", "views": 142, "likes": 1,
                        "comments": 0, "shares": 2, "saves": None}
    assert found[1]["url"] == "https://www.instagram.com/p/POST1/" and found[1]["views"] is None


def test_youtube_and_tiktok_payloads():
    yt = stats.youtube_videos({"videos": [
        {"videoId": "abc123XYZ", "shorts": {}, "publicMetrics": {"externalViewCount": "160", "likeCount": "3",
                                                                 "commentCount": "0"}},
        {"videoId": "long0001", "publicMetrics": {"viewCount": "5"}},
        {"videoId": "draft001", "draftStatus": "DRAFT_STATUS_PUBLIC", "publicMetrics": {}},
    ]})
    assert len(yt) == 2  # the draft is not a post
    assert yt[0]["url"] == "https://www.youtube.com/shorts/abc123XYZ" and yt[0]["views"] == 160
    assert yt[1]["url"] == "https://www.youtube.com/watch?v=long0001" and yt[1]["likes"] is None
    tt = stats.tiktok_items({"itemList": [
        {"id": "7311", "author": {"uniqueId": "me"}, "stats": {"playCount": 10, "diggCount": 2, "commentCount": 1,
                                                               "shareCount": 0, "collectCount": 3}},
        {"id": "7312", "author": {"uniqueId": "someone"}, "stats": {"playCount": 1}},
    ]}, "@me")
    assert tt == [{"id": "7311", "url": "https://www.tiktok.com/@me/video/7311", "views": 10, "likes": 2,
                   "comments": 1, "shares": 0, "saves": 3}]


def test_external_ids_from_post_urls():
    assert stats.external_id("instagram", "https://www.instagram.com/reel/Df23dcqBeTF/") == "Df23dcqBeTF"
    assert stats.external_id("youtube", "https://www.youtube.com/shorts/abc123XYZ") == "abc123XYZ"
    assert stats.external_id("tiktok", "https://www.tiktok.com/@me/video/7311") == "7311"
    assert stats.external_id("x", "https://x.com/me/status/1") is None


def test_fetch_appends_one_row_per_video_and_marks_our_posts(ralphy_env, monkeypatch):
    account = model.create_account("Me")
    files.write_csv(account.posts_path, model.POSTS_COLUMNS, [
        {"id": "p_1", "content": "me/001-a", "platform": "instagram", "handle": "@me", "status": "published",
         "url": "https://www.instagram.com/reel/REEL1/"}])

    entry = {"platform": "instagram", "handle": "@me", "profile": "me-instagram", "status": "ok"}
    monkeypatch.setattr(stats.profiles, "entries", lambda _a: [entry])
    monkeypatch.setattr(stats.profiles, "account_for", lambda _ref: account)

    page = FakePage(FakeContext({"sessionid": "s", "ds_user_id": "99"}), "https://www.instagram.com/")

    @contextlib.contextmanager
    def open_profile(_name):
        yield type("S", (), {"page": lambda self: page, "context": page.context})()

    monkeypatch.setattr(browser, "open_profile", open_profile)
    monkeypatch.setitem(stats.COLLECTORS, "instagram", lambda _p, _h, uid: [
        {"id": "REEL1", "url": "https://www.instagram.com/reel/REEL1/", "views": None, "likes": 1},
        {"id": "REEL1", "url": "https://www.instagram.com/reel/REEL1/", "views": 12, "likes": None},
        {"id": "OLD", "url": "https://www.instagram.com/reel/OLD/", "views": 40, "likes": 2},
    ])
    data = stats.fetch("me")
    rows = files.read_csv(account.stats_path)
    assert [r["url"] for r in rows] == ["https://www.instagram.com/reel/REEL1/", "https://www.instagram.com/reel/OLD/"]
    assert rows[0]["content"] == "me/001-a" and rows[0]["views"] == "12" and rows[0]["likes"] == "1"
    assert rows[1]["content"] == "" and data["results"][0]["ours"] == 1
    assert data["results"][0]["analytics"] == [] and "professional" in data["results"][0]["analytics_note"]
    stats.fetch("me")
    assert len(files.read_csv(account.stats_path)) == 4  # snapshots append, never rewrite
