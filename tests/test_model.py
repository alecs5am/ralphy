"""Account and Content on files: slugs, numbering, id resolution, versions, restore, posts and stats."""

from __future__ import annotations

import os

import pytest

from ralphy import files, model
from ralphy.errors import RalphyError

PRIVET_MIR = "Привет, мир!"  # "Privet, mir!" in Cyrillic
SHCHUKA = "Щука и ёжик"  # "Shchuka i yozhik"


@pytest.mark.parametrize(
    ("title", "slug"),
    [
        ("Hello World!", "hello-world"),
        ("  Type   Charge -- v2 ", "type-charge-v2"),
        (PRIVET_MIR, "privet-mir"),
        (SHCHUKA, "shchuka-i-ezhik"),
        ("Café Déjà vu", "cafe-deja-vu"),
        ("!!!", "untitled"),
        ("", "untitled"),
    ],
)
def test_slugify(title, slug):
    assert model.slugify(title) == slug


def test_slugify_cuts_long_titles_at_a_word():
    slug = model.slugify("word " * 30)
    assert len(slug) <= 60
    assert not slug.endswith("-")
    assert slug.split("-") == ["word"] * len(slug.split("-"))


def test_account_new_writes_contract_frontmatter(ralphy_env):
    account = model.create_account("UI Effects", niche="ui motion", schedule="daily 18:00 Europe/Moscow")
    assert account.slug == "ui-effects"
    assert account.path == ralphy_env["home"] / "ui-effects"
    meta, body = files.read_frontmatter(account.path / "account.md")
    assert list(meta) == ["name", "niche", "schedule", "platforms", "created_at"]
    assert meta["name"] == "UI Effects"
    assert meta["platforms"] == []
    assert "## Style" in body
    assert (account.path / "videos").is_dir() and (account.path / "refs").is_dir()
    assert [a.slug for a in model.list_accounts()] == ["ui-effects"]


def test_account_new_refuses_duplicates_and_reserved_names(ralphy_env):
    model.create_account("UI Effects")
    with pytest.raises(RalphyError) as caught:
        model.create_account("ui effects")
    assert caught.value.code == "E_ACCOUNT_EXISTS"
    with pytest.raises(RalphyError) as caught:
        model.create_account("Inbox")
    assert caught.value.code == "E_ACCOUNT_RESERVED"


def test_inbox_is_not_an_account_but_holds_content(ralphy_env):
    item, _ = model.create_content("inbox", "Loose idea")
    assert item.id == "inbox/001-loose-idea"
    assert model.list_accounts() == []
    meta, _ = item.notes()
    assert meta["account"] is None
    assert [c.id for c in model.list_content()] == ["inbox/001-loose-idea"]


def test_content_new_layout_and_numbering(ralphy_env):
    model.create_account("UI Effects")
    first, _ = model.create_content("ui-effects", "Type Charge")
    second, _ = model.create_content("ui-effects", PRIVET_MIR)
    other, _ = model.create_content("inbox", "Type Charge")
    assert first.id == "ui-effects/001-type-charge"
    assert second.id == "ui-effects/002-privet-mir"
    assert other.id == "inbox/001-type-charge"
    assert sorted(p.name for p in first.path.iterdir()) == ["index.html", "media", "notes.md"]
    meta, body = first.notes()
    assert list(meta) == ["title", "account", "refs", "caption", "created_at"]
    assert meta["account"] == "ui-effects" and meta["caption"] == ""
    assert body.startswith("# Type Charge")
    second_meta, _ = second.notes()
    assert second_meta["title"] == PRIVET_MIR.strip()


def test_numbering_continues_after_the_highest(ralphy_env):
    model.create_account("A")
    (ralphy_env["home"] / "a" / "videos" / "007-old").mkdir(parents=True)
    item, _ = model.create_content("a", "Next")
    assert item.folder == "008-next"


def test_skeleton_is_a_hyperframes_portrait_composition(ralphy_env):
    item, _ = model.create_content("inbox", "<Hello & bye>")
    text = (item.path / "index.html").read_text()
    assert 'data-composition-id="main"' in text
    assert 'data-width="1080"' in text and 'data-height="1920"' in text
    assert 'window.__timelines["main"]' in text
    assert "window.__timelines = window.__timelines || {};" in text  # hyperframes@0.6.31 lint requires it
    assert "&lt;Hello &amp; bye&gt;" in text
    assert text.index("<script") > text.index("<body>")  # scripts at the end of body
    assert "width: 1080px" in text and "height: 1920px" in text


def test_refs_are_relative_to_the_account_folder(ralphy_env):
    account = model.create_account("A")
    (account.path / "refs" / "orig").mkdir()
    item, warnings = model.create_content(
        "a", "X", refs=["refs/orig", str(account.path / "refs" / "orig"), "https://example.com/v", "refs/later"]
    )
    meta, _ = item.notes()
    assert meta["refs"] == ["refs/orig", "refs/orig", "https://example.com/v", "refs/later"]
    assert warnings == [f"ref refs/later does not exist yet under {account.path}"]
    with pytest.raises(RalphyError) as caught:
        model.create_content("a", "Y", refs=["/tmp/elsewhere.mp4"])
    assert caught.value.code == "E_REF_OUTSIDE"


def test_resolve_content_forms(ralphy_env):
    model.create_account("UI Effects")
    model.create_account("Film Stories")
    model.create_content("ui-effects", "Type Charge")
    model.create_content("film-stories", "Type Charge")
    model.create_content("film-stories", "Night Walk")
    assert model.resolve_content("ui-effects/001-type-charge").id == "ui-effects/001-type-charge"
    assert model.resolve_content("ui-effects/type-charge").id == "ui-effects/001-type-charge"
    assert model.resolve_content("film-stories/2").id == "film-stories/002-night-walk"
    assert model.resolve_content("night-walk").id == "film-stories/002-night-walk"
    assert model.resolve_content("002-night-walk").id == "film-stories/002-night-walk"
    with pytest.raises(RalphyError) as caught:
        model.resolve_content("type-charge")
    assert caught.value.code == "E_CONTENT_AMBIGUOUS"
    assert "ui-effects/001-type-charge" in caught.value.message
    with pytest.raises(RalphyError) as caught:
        model.resolve_content("nothing")
    assert caught.value.code == "E_CONTENT_NOT_FOUND"
    with pytest.raises(RalphyError) as caught:
        model.resolve_content("nobody/001-x")
    assert caught.value.code == "E_ACCOUNT_NOT_FOUND"


def test_parse_version():
    assert model.parse_version("v3") == "v3"
    assert model.parse_version("3") == "v3"
    for bad in ("v0", "x1", "v1.2", ""):
        with pytest.raises(RalphyError):
            model.parse_version(bad)


def _content_with_media(name="Clip"):
    item, _ = model.create_content("inbox", name)
    (item.media_dir / "clip.mp4").write_bytes(b"media-bytes")
    (item.path / "assets").mkdir()
    (item.path / "assets" / "style.css").write_text("body{}")
    return item


def test_save_version_snapshots_the_working_tree_without_media(ralphy_env):
    item = _content_with_media()
    item.render_file.write_bytes(b"render")
    (item.path / "assets" / "loop.MP4").write_bytes(b"asset video")
    (item.path / "render").mkdir()
    (item.path / "render" / "final.mp4").write_bytes(b"an old render")
    (item.path / "render" / "notes.txt").write_text("kept")
    first = model.save_version(item, note="first cut")
    assert first["version"] == "v1"
    v1 = item.versions_dir / "v1"
    assert sorted(p.relative_to(v1).as_posix() for p in v1.rglob("*") if p.is_file()) == [
        ".note", "assets/style.css", "index.html", "render/notes.txt",
    ]  # code only: no media/, no render.mp4, no mp4 at any depth
    assert model.version_note(item, "v1") == "first cut"
    second = model.save_version(item)
    assert second["version"] == "v2"
    assert item.versions() == ["v1", "v2"]
    assert model.version_note(item, "v2") is None
    assert not list(item.versions_dir.glob(".*"))  # no staging left behind


@pytest.mark.parametrize("native", [True, False])
def test_snapshot_is_independent_of_later_edits(ralphy_env, monkeypatch, native):
    if not native:
        monkeypatch.setattr(files, "_native_clone", lambda src, dst: False)
    item = _content_with_media()
    result = model.save_version(item)
    snap = item.versions_dir / "v1" / "index.html"
    working = item.path / "index.html"
    assert os.stat(snap).st_ino != os.stat(working).st_ino  # never a hardlink of a file the agent edits in place
    original = snap.read_text()
    with open(working, "a", encoding="utf-8") as handle:  # in-place edit, like most editors
        handle.write("<!-- edited -->")
    assert snap.read_text() == original
    if not native:
        assert set(result["methods"]) == {"copy"}


def test_working_tree_matches(ralphy_env):
    item = _content_with_media()
    model.save_version(item)
    assert model.working_tree_matches(item, "v1")
    files.update_frontmatter(item.notes_path, {"caption": "new"})  # notes.md is not part of a version
    (item.media_dir / "more.mp4").write_bytes(b"m2")  # nor is media/
    item.render_file.write_bytes(b"render")  # nor the render
    assert model.working_tree_matches(item, "v1")
    (item.path / "index.html").write_text("changed")
    assert not model.working_tree_matches(item, "v1")


def test_restore_saves_the_tree_first_then_makes_it_equal_the_version(ralphy_env):
    item = _content_with_media()
    (item.path / "assets" / "bg.mp4").write_bytes(b"asset video")
    item.render_file.write_bytes(b"render")
    model.save_version(item, note="one")
    (item.path / "index.html").write_text("<!-- two -->")
    (item.path / "compositions").mkdir()
    (item.path / "compositions" / "scene.html").write_text("<div>new scene</div>")
    (item.path / "assets" / "style.css").unlink()
    result = model.restore_version(item, "v1")
    assert result["version"] == "v1" and result["before"] == "v2" and result["saved"] is True
    assert model.version_note(item, "v2") == "before restore of v1"
    assert sorted(result["written"]) == ["assets/style.css", "index.html"]
    assert result["removed"] == ["compositions/scene.html"]
    assert model.working_tree_matches(item, "v1")
    assert not (item.path / "compositions").exists()  # emptied folders go too
    # untouched: media, the render, mp4 files of the tree, and the version saved first
    assert (item.media_dir / "clip.mp4").read_bytes() == b"media-bytes"
    assert item.render_file.read_bytes() == b"render"
    assert (item.path / "assets" / "bg.mp4").read_bytes() == b"asset video"
    v2 = item.versions_dir / "v2"
    assert (v2 / "compositions" / "scene.html").read_text() == "<div>new scene</div>"
    assert (v2 / "index.html").read_text() == "<!-- two -->"
    # back again: the tree equals v1, which is not the latest, so it is saved as v3 first
    again = model.restore_version(item, "v2")
    assert again["before"] == "v3" and again["saved"] is True and model.working_tree_matches(item, "v2")


def test_restore_without_changes_saves_nothing(ralphy_env):
    item = _content_with_media()
    model.save_version(item)
    same = model.restore_version(item, "v1")
    assert same == {"version": "v1", "before": "v1", "saved": False, "written": [], "removed": []}
    model.save_version(item)
    (item.path / "index.html").write_text("<!-- edited -->")
    model.save_version(item)  # v3 holds the edit; the tree equals the latest version
    result = model.restore_version(item, "v1")
    assert result["saved"] is False and result["before"] == "v3" and result["written"] == ["index.html"]
    assert item.versions() == ["v1", "v2", "v3"]
    with pytest.raises(RalphyError) as caught:
        model.restore_version(item, "v9")
    assert caught.value.code == "E_VERSION_NOT_FOUND"


def test_restored_files_make_an_older_render_stale(ralphy_env):
    item = _content_with_media()
    model.save_version(item)
    (item.path / "index.html").write_text("<!-- two -->")
    item.render_file.write_bytes(b"render of two")
    past = item.render_file.stat().st_mtime - 30
    for path in [*item.path.rglob("*"), item.path]:
        if path != item.render_file:
            os.utime(path, (past - 30, past - 30))
    os.utime(item.render_file, (past, past))
    assert model.render_state(item)["render_stale"] is False
    model.restore_version(item, "v1")  # the restored index.html is older in v1, but new to the tree
    assert model.render_state(item)["render_stale"] is True


def test_doc_edits_do_not_make_the_render_stale(ralphy_env):
    item = _content_with_media()
    item.render_file.write_bytes(b"render")
    past = item.render_file.stat().st_mtime - 30
    for path in [*item.path.rglob("*"), item.path]:
        if path != item.render_file:
            os.utime(path, (past - 30, past - 30))
    os.utime(item.render_file, (past, past))
    (item.path / "BRIEF.md").write_text("brief")  # a new doc next to index.html
    (item.path / "LICENSES.txt").write_text("licenses")
    assert model.render_state(item)["render_stale"] is False
    (item.path / "index.html").write_text("<!-- edited -->")
    assert model.render_state(item)["render_stale"] is True


def _write_posts_and_stats(home):
    ui = home / "ui-effects"
    films = home / "film-stories"
    files.write_csv(ui / "posts.csv", model.POSTS_COLUMNS, [
        {"id": "p_00000001", "content": "ui-effects/001-type-charge", "platform": "tiktok", "handle": "@ui",
         "status": "published", "url": "https://t/1", "render": "ui-effects/videos/001-type-charge/render.mp4"},
        {"id": "p_00000002", "content": "ui-effects/001-type-charge", "platform": "youtube", "handle": "@ui",
         "status": "planned"},
        {"id": "p_00000003", "content": "ui-effects/002-other", "platform": "tiktok", "handle": "@ui",
         "status": "failed", "error": "boom"},
    ])
    files.write_csv(films / "posts.csv", model.POSTS_COLUMNS, [
        {"id": "p_00000004", "content": "ui-effects/001-type-charge", "platform": "instagram", "handle": "@films",
         "status": "approved"},
    ])
    files.write_csv(ui / "stats.csv", model.STATS_COLUMNS, [
        {"fetched_at": "2026-11-17T10:00:00Z", "platform": "tiktok", "handle": "@ui", "url": "https://t/1",
         "content": "ui-effects/001-type-charge", "views": "100", "likes": "5", "comments": "", "shares": "0"},
        {"fetched_at": "2026-11-17T12:00:00Z", "platform": "tiktok", "handle": "@ui", "url": "https://t/1",
         "content": "ui-effects/001-type-charge", "views": "250", "likes": "9", "comments": "1", "shares": ""},
    ])


def test_posts_and_stats_reading(ralphy_env):
    model.create_account("UI Effects")
    model.create_account("Film Stories")
    _write_posts_and_stats(ralphy_env["home"])
    ui = model.get_account("ui-effects")
    posts = model.read_posts(ui)
    assert [p["status"] for p in posts] == ["published", "planned", "failed"]
    assert posts[1]["url"] is None and posts[0]["account"] == "ui-effects"
    stats = model.read_stats(ui)
    assert stats[0]["views"] == 100 and stats[0]["comments"] is None and stats[0]["shares"] == 0
    latest = model.latest_stats(stats)
    assert len(latest) == 1 and latest[0]["views"] == 250 and latest[0]["shares"] is None
