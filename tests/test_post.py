"""`ralphy post`: plan checks, dedupe, scheduling, approve/cancel/resolve, and the `run` state machine with a fake
browser and a scripted recipe (no Chrome, no network, no real account)."""

from __future__ import annotations

import datetime as dt
import os
import re

import pytest
from test_post_fakes import FakeRecipe, FakeSession, use_browser, use_recipe  # noqa: F401

from ralphy import files, model, paths
from ralphy.post import posts, profiles

CID = "ui-effects/001-type-charge"


def _account(run, targets=(("tiktok", "@ui.effects"),), status="ok") -> model.Account:
    if not (paths.home() / "ui-effects").exists():
        assert run("account", "new", "UI Effects").code == 0
    account = model.get_account("ui-effects")
    for name, handle in targets:
        profiles.ensure(account, name, handle)
        profiles.update(account, name, status=status)
    return model.get_account("ui-effects")


def _content(run, caption: str | None = "Type that charges up #ui") -> model.Content:
    assert run("content", "new", "ui-effects", "Type Charge").code == 0
    assert run("content", "save", CID).code == 0
    assert run("render", CID).code == 0  # the fake bunx writes render.mp4
    item = model.resolve_content(CID)
    if caption is not None:
        files.update_frontmatter(item.notes_path, {"caption": caption})
    return item


@pytest.fixture
def posting(run, fake_bunx, fake_ffprobe):
    account = _account(run)
    item = _content(run)
    return {"run": run, "account": account, "content": item, "probe": fake_ffprobe}


def _rows(account: model.Account) -> list[dict]:
    return files.read_csv(account.posts_path)


def _plan(run, *extra) -> dict:
    result = run("--json", "post", "plan", CID, "--to", "ui-effects:tiktok", *extra)
    assert result.code == 0, result.out + result.err
    return result.json


# ---------------------------------------------------------------- plan


def test_plan_appends_a_planned_row_with_every_column(posting):
    data = _plan(posting["run"])
    assert data["content"] == CID and data["rendered"] is False and "version" not in data
    assert data["probe"]["width"] == 1080 and data["probe"]["height"] == 1920 and data["probe"]["duration"] == 12.0
    (post,) = data["posts"]
    assert re.fullmatch(r"p_[0-9a-f]{8}", post["id"])
    rows = _rows(posting["account"])
    assert list(rows[0]) == list(model.POSTS_COLUMNS)
    assert rows[0] == {
        "id": post["id"], "content": CID, "platform": "tiktok", "handle": "@ui.effects", "status": "planned",
        "scheduled_at": "", "posted_at": "", "url": "", "render": "ui-effects/videos/001-type-charge/render.mp4",
        "caption": "Type that charges up #ui", "error": "",
    }
    assert (paths.home() / rows[0]["render"]).is_file()


def test_plan_renders_first_when_there_is_no_render(run, fake_bunx, fake_ffprobe):
    _account(run)
    run("content", "new", "ui-effects", "Type Charge")
    item = model.resolve_content(CID)
    assert not item.render_file.exists()
    data = _plan(run)
    assert data["rendered"] is True and item.render_file.read_bytes() == b"fake-mp4-bytes"
    assert data["posts"][0]["render"] == "ui-effects/videos/001-type-charge/render.mp4"
    (item.path / "index.html").unlink()
    item.render_file.unlink()
    broken = run("--json", "post", "plan", CID, "--to", "ui-effects:tiktok", "--again")
    assert broken.code == 1 and broken.json["error"]["code"] == "E_NO_COMPOSITION"


def test_plan_renders_again_when_the_render_is_stale(posting):
    item = posting["content"]
    item.render_file.write_bytes(b"an old render")
    os.utime(item.render_file, (1_000_000_000, 1_000_000_000))  # older than every file of the tree
    data = _plan(posting["run"])
    assert data["rendered"] is True and item.render_file.read_bytes() == b"fake-mp4-bytes"
    again = _plan(posting["run"], "--again")
    assert again["rendered"] is False  # fresh now: no second render


def test_plan_schedules_in_utc_and_refuses_a_time_without_a_zone(posting):
    data = _plan(posting["run"], "--at", "2030-01-02T18:00:00+03:00")
    assert data["posts"][0]["scheduled_at"] == "2030-01-02T15:00:00Z"
    naive = posting["run"]("--json", "post", "plan", CID, "--to", "ui-effects:tiktok", "--at", "2030-01-02T18:00:00")
    assert naive.json["error"]["code"] == "E_BAD_TIME" and "zone" in naive.json["error"]["message"]
    garbage = posting["run"]("--json", "post", "plan", CID, "--to", "ui-effects:tiktok", "--at", "tomorrow")
    assert garbage.json["error"]["code"] == "E_BAD_TIME"
    past = _plan(posting["run"], "--at", "2020-01-01T00:00:00Z")
    assert any("in the past" in w for w in past["warnings"])


def test_plan_checks_the_video_against_each_platform(posting):
    run, account = posting["run"], posting["account"]
    _account(run, targets=(("youtube", "@uieffects"),))
    posting["probe"](duration=200)
    result = run("--json", "post", "plan", CID, "--to", "ui-effects:tiktok,ui-effects:youtube")
    assert result.code == 1 and result.json["error"]["code"] == "E_POST_CHECK"
    assert "YouTube Shorts: the video is 200 s; the maximum is 180 s" in result.json["error"]["message"]
    assert _rows(account) == []  # nothing written when one target fails
    posting["probe"](width=1920, height=1080)
    landscape = run("--json", "post", "plan", CID, "--to", "ui-effects:youtube")
    assert "aspect" in landscape.json["error"]["message"]
    posting["probe"](width=1080, height=1350)
    four_five = _plan(run)
    assert any("not 9:16" in w for w in four_five["warnings"])


def test_plan_checks_the_caption_length_per_platform(posting):
    run = posting["run"]
    _account(run, targets=(("x", "@ui"), ("youtube", "@uieffects")))
    long = run("--json", "post", "plan", CID, "--to", "ui-effects:x", "--caption", "a" * 281)
    assert long.json["error"]["code"] == "E_POST_CHECK" and "281 characters" in long.json["error"]["message"]
    title = run("--json", "post", "plan", CID, "--to", "ui-effects:youtube", "--caption", "t" * 101)
    assert "title (first line) is 101" in title.json["error"]["message"]
    angle = run("--json", "post", "plan", CID, "--to", "ui-effects:youtube", "--caption", "a <b> c")
    assert "< or >" in angle.json["error"]["message"]
    ok = run("--json", "post", "plan", CID, "--to", "ui-effects:x", "--caption", "a" * 280)
    assert ok.code == 0 and any("no scripted upload" in w for w in ok.json["warnings"])


def test_plan_reads_the_caption_file_and_refuses_both_caption_flags(posting, tmp_path):
    caption = tmp_path / "caption.txt"
    caption.write_text("From a file\r\n#tag  \n\n", encoding="utf-8")
    data = _plan(posting["run"], "--caption-file", str(caption))
    assert data["posts"][0]["caption"] == "From a file\n#tag"
    both = posting["run"]("--json", "post", "plan", CID, "--to", "ui-effects:tiktok", "--caption", "x",
                          "--caption-file", str(caption))
    assert both.json["error"]["code"] == "E_USAGE"


def test_plan_target_errors(posting):
    run = posting["run"]
    cases = {
        "ui-effects:myspace": "E_PLATFORM_UNKNOWN",
        "ui-effects": "E_USAGE",
        "nobody:tiktok": "E_ACCOUNT_NOT_FOUND",
        "inbox:tiktok": "E_USAGE",
        "ui-effects:instagram": "E_POST_TARGET",
    }
    for target, code in cases.items():
        result = run("--json", "post", "plan", CID, "--to", target)
        assert result.code == 1 and result.json["error"]["code"] == code, target
    profiles.ensure(posting["account"], "instagram", None)
    no_handle = run("--json", "post", "plan", CID, "--to", "ui-effects:instagram")
    assert "has no handle" in no_handle.json["error"]["message"]
    run("account", "pause", "ui-effects", "tiktok")
    paused = run("--json", "post", "plan", CID, "--to", "ui-effects:tiktok")
    assert "paused" in paused.json["error"]["message"]


def test_plan_without_ffprobe_refuses(posting, monkeypatch, tmp_path):
    empty = tmp_path / "empty-bin"
    empty.mkdir()
    monkeypatch.setenv("PATH", str(empty))
    result = posting["run"]("--json", "post", "plan", CID, "--to", "ui-effects:tiktok")
    assert result.json["error"]["code"] == "E_DEP_MISSING" and "ffprobe" in result.json["error"]["message"]


def test_dedupe_blocks_active_rows_unless_again(posting):
    run, account = posting["run"], posting["account"]
    first = _plan(run)["posts"][0]["id"]
    second = _plan(run)  # only planned: a warning, not a block
    assert any("already has" in w and "planned" in w for w in second["warnings"])
    run("post", "cancel", second["posts"][0]["id"])
    assert run("post", "approve", first).code == 0
    blocked = run("--json", "post", "plan", CID, "--to", "ui-effects:tiktok")
    assert blocked.json["error"]["code"] == "E_POST_DUPLICATE" and first in blocked.json["error"]["message"]
    for status in ("uploading", "published", "unknown"):
        posts.transition(account, first, posts.ACTIVE + ("failed",), {"status": status})
        again = run("--json", "post", "plan", CID, "--to", "ui-effects:tiktok")
        assert again.json["error"]["code"] == "E_POST_DUPLICATE", status
    posts.transition(account, first, ("unknown",), {"status": "failed"})
    assert run("--json", "post", "plan", CID, "--to", "ui-effects:tiktok").code == 0  # failed does not block
    posts.transition(account, first, ("failed",), {"status": "published"})
    assert run("--json", "post", "plan", CID, "--to", "ui-effects:tiktok", "--again").code == 0


def test_dedupe_is_per_handle_and_the_row_lives_in_the_target_account(posting):
    run = posting["run"]
    assert run("account", "new", "Film Stories").code == 0
    other = model.get_account("film-stories")
    profiles.ensure(other, "tiktok", "@film.stories")
    _plan(run)
    data = run("--json", "post", "plan", CID, "--to", "film-stories:tiktok").json
    assert data["posts"][0]["account"] == "film-stories"
    assert _rows(other)[0]["content"] == CID
    assert any("session is unknown" in w for w in data["warnings"])


# ---------------------------------------------------------------- approve, cancel, resolve, list


def test_approve_one_many_and_all(posting):
    run, account = posting["run"], posting["account"]
    ids = [_plan(run)["posts"][0]["id"] for _ in range(3)]
    single = run("--json", "post", "approve", ids[0]).json
    assert [p["id"] for p in single["approved"]] == [ids[0]]
    again = run("--json", "post", "approve", ids[0], ids[1]).json
    assert again["already_approved"] == [ids[0]] and [p["id"] for p in again["approved"]] == [ids[1]]
    assert run("--json", "post", "approve", "--all").json["error"]["code"] == "E_USAGE"
    everything = run("--json", "post", "approve", "--all", "--account", "ui-effects").json
    assert [p["id"] for p in everything["approved"]] == [ids[2]]
    assert {r["status"] for r in _rows(account)} == {"approved"}
    posts.transition(account, ids[0], ("approved",), {"status": "published"})
    refused = run("--json", "post", "approve", ids[0], ids[1])
    assert refused.json["error"]["code"] == "E_POST_STATE"
    assert run("--json", "post", "approve", "p_00000000").json["error"]["code"] == "E_POST_NOT_FOUND"
    assert run("--json", "post", "approve", "nope").json["error"]["code"] == "E_USAGE"


def test_cancel_and_resolve(posting):
    run, account = posting["run"], posting["account"]
    pid = _plan(run)["posts"][0]["id"]
    assert run("--json", "post", "cancel", pid).json["post"]["status"] == "cancelled"
    assert run("--json", "post", "cancel", pid).json["error"]["code"] == "E_POST_STATE"
    pid = _plan(run)["posts"][0]["id"]
    assert run("--json", "post", "resolve", pid, "--failed").json["error"]["code"] == "E_POST_STATE"
    posts.transition(account, pid, ("planned",), {"status": "unknown"})
    wrong_host = run("--json", "post", "resolve", pid, "--url", "https://www.instagram.com/reel/x/")
    assert wrong_host.json["error"]["code"] == "E_BAD_URL"
    resolved = run("--json", "post", "resolve", pid, "--url", "https://www.tiktok.com/@ui.effects/video/1").json["post"]
    assert resolved["status"] == "published" and resolved["url"].endswith("/video/1") and resolved["posted_at"]
    pid = _plan(run, "--again")["posts"][0]["id"]
    posts.transition(account, pid, ("planned",), {"status": "unknown"})
    failed = run("--json", "post", "resolve", pid, "--failed").json["post"]
    assert failed["status"] == "failed" and "does not exist" in failed["error"]
    assert run("--json", "post", "resolve", pid).json["error"]["code"] == "E_USAGE"  # argparse: one is required


def test_list_filters(posting):
    run = posting["run"]
    first = _plan(run)["posts"][0]["id"]
    _plan(run)
    run("post", "approve", first)
    rows = run("--json", "post", "list").json["posts"]
    assert len(rows) == 2 and rows[0]["account"] == "ui-effects"
    approved = run("--json", "post", "list", "--account", "ui-effects", "--status", "approved").json["posts"]
    assert [r["id"] for r in approved] == [first]
    assert run("--json", "post", "list", "--status", "live").json["error"]["code"] == "E_USAGE"
    assert "planned" in run("post", "list").out


# ---------------------------------------------------------------- run


def _approved(run, *extra) -> str:
    pid = _plan(run, *extra)["posts"][0]["id"]
    assert run("post", "approve", pid).code == 0
    return pid


def _row(account, pid) -> dict:
    return next(r for r in _rows(account) if r["id"] == pid)


def test_run_needs_an_id_or_due_and_only_runs_approved_due_rows(posting, monkeypatch):
    run = posting["run"]
    use_browser(monkeypatch, FakeSession)
    use_recipe(monkeypatch, FakeRecipe())
    assert run("--json", "post", "run").json["error"]["code"] == "E_USAGE"
    planned = _plan(run)["posts"][0]["id"]
    refused = run("--json", "post", "run", planned)
    assert refused.json["error"]["code"] == "E_POST_STATE" and "approve" in refused.json["error"]["hint"]
    future = _approved(run, "--at", "2099-01-01T00:00:00Z", "--again")
    assert run("--json", "post", "run", future).json["error"]["code"] == "E_POST_NOT_DUE"
    nothing = run("--json", "post", "run", "--due").json
    assert nothing["results"] == [] and nothing["due"] == 0


def test_run_publishes_writing_unknown_before_the_click(posting, monkeypatch):
    run, account = posting["run"], posting["account"]
    fake = use_browser(monkeypatch, FakeSession)
    seen: list[str] = []
    recipe = use_recipe(monkeypatch, FakeRecipe(on_click=lambda: seen.append(_row(account, pid)["status"])))
    pid = _approved(run)
    data = run("--json", "post", "run", pid).json
    (result,) = data["results"]
    assert seen == ["unknown"]  # written before the irreversible click
    assert result["status"] == "published" and result["url"] == recipe.url
    row = _row(account, pid)
    assert row["status"] == "published" and row["url"] == recipe.url and row["posted_at"] and row["error"] == ""
    task = recipe.tasks[0]
    assert task.handle == "ui.effects" and task.caption == "Type that charges up #ui" and task.expected_user_id
    assert task.video == paths.cache_dir() / "post" / f"{pid}.mp4"  # a copy; render.mp4 may change meanwhile
    assert not task.video.exists()  # removed once the upload settled
    entry = profiles.find(model.get_account("ui-effects"), "tiktok")
    assert entry["status"] == "ok" and entry["checked_at"]
    assert fake.opened == [paths.profiles_dir() / "ui-effects-tiktok"]
    assert profiles.read_identity("ui-effects-tiktok")["user_id"] == "user-1"
    assert data["counts"] == {"published": 1}


def test_run_uploads_a_copy_a_re_render_cannot_change(posting, monkeypatch):
    run, account, item = posting["run"], posting["account"], posting["content"]
    use_browser(monkeypatch, FakeSession)
    seen: dict = {}

    def re_render_mid_upload() -> None:
        item.render_file.write_bytes(b"a newer render")  # another agent renders while the upload runs
        seen["uploaded"] = recipe.tasks[0].video.read_bytes()

    recipe = use_recipe(monkeypatch, FakeRecipe(on_click=re_render_mid_upload))
    pid = _approved(run)
    assert run("--json", "post", "run", pid).json["results"][0]["status"] == "published"
    assert seen["uploaded"] == b"fake-mp4-bytes"
    assert _row(account, pid)["render"] == "ui-effects/videos/001-type-charge/render.mp4"


def test_run_checks_the_copy_against_the_platform_again(posting, monkeypatch):
    run, account = posting["run"], posting["account"]
    use_browser(monkeypatch, FakeSession)
    use_recipe(monkeypatch, FakeRecipe())
    pid = _approved(run)
    posting["probe"](width=1920, height=1080, audio=True, duration=4000)  # re-rendered into what TikTok refuses
    result = run("--json", "post", "run", pid).json["results"][0]
    assert result["status"] == "failed" and "4000 s" in result["error"]
    assert _row(account, pid)["status"] == "failed"
    assert not (paths.cache_dir() / "post" / f"{pid}.mp4").exists()


def test_run_failure_before_the_click_is_failed_and_can_be_retried(posting, monkeypatch):
    run, account = posting["run"], posting["account"]
    use_browser(monkeypatch, FakeSession)
    recipe = use_recipe(monkeypatch, FakeRecipe(mode="fail_before"))
    pid = _approved(run)
    result = run("--json", "post", "run", pid).json["results"][0]
    assert result["status"] == "failed" and result["error"].startswith("attach-video: expected 1 element(s)")
    assert "evidence:" in result["error"] and os.path.exists(result["evidence"])
    assert _row(account, pid)["status"] == "failed"
    recipe.mode = "publish"
    assert run("--json", "post", "run", pid).json["results"][0]["status"] == "published"


def test_run_failure_after_the_click_stays_unknown_and_blocks_the_profile(posting, monkeypatch):
    run, account = posting["run"], posting["account"]
    use_browser(monkeypatch, FakeSession)
    recipe = use_recipe(monkeypatch, FakeRecipe(mode="fail_after"))
    pid = _approved(run)
    result = run("--json", "post", "run", pid).json["results"][0]
    assert result["status"] == "unknown"
    assert "wait-posted" in result["error"] and f"ralphy post resolve {pid}" in result["error"]
    assert run("--json", "post", "run", pid).json["error"]["code"] == "E_POST_STATE"  # never retried
    recipe.mode = "publish"
    other = _approved(run, "--again")
    blocked = run("--json", "post", "run", "--due").json["results"][0]
    assert blocked["id"] == other and "is unknown" in blocked["skipped"]
    assert _row(account, other)["status"] == "approved"
    run("post", "resolve", pid, "--failed")
    assert run("--json", "post", "run", "--due").json["results"][0]["status"] == "published"


def test_run_signed_out_is_needs_login_then_retries_after_login(posting, monkeypatch):
    run, account = posting["run"], posting["account"]
    use_browser(monkeypatch, FakeSession)
    recipe = use_recipe(monkeypatch, FakeRecipe(state="needs_login"))
    pid = _approved(run)
    result = run("--json", "post", "run", pid).json["results"][0]
    assert result["status"] == "needs_login" and "account login ui-effects tiktok" in result["error"]
    assert profiles.find(model.get_account("ui-effects"), "tiktok")["status"] == "needs_login"
    assert recipe.tasks == []
    recipe.state = "checkpoint"
    again = run("--json", "post", "run", pid).json["results"][0]
    assert again["status"] == "needs_login" and "checkpoint" in again["error"]
    recipe.state = "ok"
    assert run("--json", "post", "run", pid).json["results"][0]["status"] == "published"
    assert _row(account, pid)["status"] == "published"


def test_run_unreadable_session_and_another_user_never_post(posting, monkeypatch):
    run = posting["run"]
    use_browser(monkeypatch, FakeSession)
    recipe = use_recipe(monkeypatch, FakeRecipe(user_id=None))
    pid = _approved(run)
    unreadable = run("--json", "post", "run", pid).json["results"][0]
    assert unreadable["status"] == "failed" and "could not tell" in unreadable["error"]
    profiles.write_identity("ui-effects-tiktok", "user-1")
    recipe.user_id = "someone-else"
    other = run("--json", "post", "run", pid).json["results"][0]
    assert other["status"] == "needs_login" and "another user" in other["error"] and recipe.tasks == []


def test_run_due_picks_due_rows_and_stops_a_profile_after_a_browser_failure(posting, monkeypatch):
    run, account = posting["run"], posting["account"]
    use_browser(monkeypatch, FakeSession)
    recipe = use_recipe(monkeypatch, FakeRecipe(mode="fail_before"))
    past = _approved(run, "--at", "2020-01-01T00:00:00Z")
    now = _approved(run, "--again")
    future = _approved(run, "--again", "--at", "2099-01-01T00:00:00Z")
    _plan(run, "--again")  # planned, never runs
    data = run("--json", "post", "run", "--due").json
    assert data["due"] == 2 and [r["id"] for r in data["results"]] == [now, past]  # "on run" sorts first
    first, second = data["results"]
    assert first["status"] == "failed" and "ended failed" in second["skipped"]
    assert _row(account, second["id"])["status"] == "approved"
    assert _row(account, future)["status"] == "approved"
    recipe.mode = "publish"
    assert run("--json", "post", "run", "--due", "--account", "ui-effects").json["counts"] == {"published": 1}


def test_run_static_failures_and_skips(posting, monkeypatch):
    run, account = posting["run"], posting["account"]
    use_browser(monkeypatch, FakeSession)
    use_recipe(monkeypatch, FakeRecipe())
    pid = _approved(run)
    run("account", "pause", "ui-effects", "tiktok")
    paused = run("--json", "post", "run", pid).json["results"][0]
    assert "paused" in paused["skipped"] and _row(account, pid)["status"] == "approved"
    run("account", "resume", "ui-effects", "tiktok")
    with profiles.profile_lock("ui-effects-tiktok"):
        busy = run("--json", "post", "run", pid).json["results"][0]
    assert "in use" in busy["skipped"] and _row(account, pid)["status"] == "approved"
    posts.transition(account, pid, ("approved",), {"caption": "x" * 2201})
    too_long = run("--json", "post", "run", pid).json["results"][0]
    assert too_long["status"] == "failed" and "2201 characters" in too_long["error"]
    posts.transition(account, pid, ("failed",), {"caption": "ok", "render": "ui-effects/missing.mp4"})
    missing = run("--json", "post", "run", pid).json["results"][0]
    assert "is missing" in missing["error"]
    posts.transition(account, pid, ("failed",), {"handle": "@someone.else"})
    moved = run("--json", "post", "run", pid).json["results"][0]
    assert "planned for @someone.else" in moved["error"]


def test_run_recovers_rows_a_dead_run_left_uploading(posting, monkeypatch):
    run, account = posting["run"], posting["account"]
    use_browser(monkeypatch, FakeSession)
    use_recipe(monkeypatch, FakeRecipe())
    stale = _approved(run)
    posts.transition(account, stale, ("approved",), {"status": "uploading"})
    pid = _approved(run, "--again")
    result = run("--json", "post", "run", pid).json["results"][0]
    assert result["status"] == "published" and result["recovered"] == [stale]
    assert _row(account, stale)["status"] == "failed" and "before the final click" in _row(account, stale)["error"]


def test_run_recipe_without_a_click_or_url(posting, monkeypatch):
    run = posting["run"]
    use_browser(monkeypatch, FakeSession)
    recipe = use_recipe(monkeypatch, FakeRecipe(mode="no_submit"))
    pid = _approved(run)
    assert "without the final click" in run("--json", "post", "run", pid).json["results"][0]["error"]
    recipe.mode = "bad_url"
    result = run("--json", "post", "run", pid).json["results"][0]
    assert result["status"] == "unknown" and "no TikTok URL" in result["error"]


def test_run_x_has_no_scripted_upload_and_is_resolved_by_hand(posting, monkeypatch):
    run = posting["run"]
    _account(run, targets=(("x", "@ui"),))
    fake = use_browser(monkeypatch, FakeSession)
    xid = run("--json", "post", "plan", CID, "--to", "ui-effects:x").json["posts"][0]["id"]
    run("post", "approve", xid)
    result = run("--json", "post", "run", xid).json["results"][0]
    assert result["status"] == "failed" and "post resolve" in result["error"] and fake.opened == []
    done = run("--json", "post", "resolve", xid, "--url", "https://x.com/ui/status/123").json["post"]
    assert done["status"] == "published"


def test_run_without_chrome_leaves_the_row_approved(posting, monkeypatch):
    from ralphy.errors import RalphyError
    from ralphy.post import browser

    run, account = posting["run"], posting["account"]

    def no_chrome(_directory):
        raise RalphyError("E_DEP_MISSING", "Google Chrome is not installed", "Install Google Chrome.")

    monkeypatch.setattr(browser, "launch", no_chrome)
    pid = _approved(run)
    assert run("--json", "post", "run", pid).json["error"]["code"] == "E_DEP_MISSING"
    assert _row(account, pid)["status"] == "approved"
    halted = run("--json", "post", "run", "--due").json
    assert "Chrome" in halted["halted"] and _row(account, pid)["status"] == "approved"


def test_is_due_and_parse_at():
    now = dt.datetime(2026, 11, 17, 12, 0, tzinfo=dt.timezone.utc)
    assert posts.is_due({"scheduled_at": ""}, now)
    assert posts.is_due({"scheduled_at": "2026-11-17T12:00:00Z"}, now)
    assert not posts.is_due({"scheduled_at": "2026-11-17T12:00:01Z"}, now)
    assert not posts.is_due({"scheduled_at": "garbage"}, now)
    assert posts.parse_at("2026-11-17T15:00:00+03:00") == "2026-11-17T12:00:00Z"
    assert posts.parse_targets(["a:tiktok,b:YouTube", "a:tiktok"]) == [("a", "tiktok"), ("b", "youtube")]
