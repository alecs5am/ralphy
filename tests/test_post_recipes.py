"""The platform recipes driven against a scripted fake page: session detection, step names, the order of
`on_submit` and the final click, and what each recipe accepts as proof of a post. No browser, no network."""

from __future__ import annotations

import json
import time

import pytest
from test_post_fakes import FakeContext, FakePage

from ralphy.post import recipes


def _task(page_log, caption="Hello #ui", handle="ui.effects", user="user-1"):
    submitted = []

    def on_submit():
        submitted.append(len(page_log))  # how many page actions happened before the go

    task = recipes.UploadTask(handle=handle, video="/tmp/v.mp4", caption=caption, expected_user_id=user,
                              on_submit=on_submit)
    return task, submitted


def test_step_wraps_failures_with_the_stage_and_first_line():
    with pytest.raises(recipes.StepError) as caught:
        recipes.step("attach-video", lambda: (_ for _ in ()).throw(RuntimeError("no input\ncall log...")))
    assert caught.value.stage == "attach-video" and caught.value.message == "no input"
    inner = recipes.StepError("identity", "kept")
    with pytest.raises(recipes.StepError) as again:
        recipes.step("outer", lambda: (_ for _ in ()).throw(inner))
    assert again.value is inner


def test_sessions_from_cookies_urls_and_markers():
    tiktok, youtube, x, instagram = (recipes.RECIPES[n] for n in ("tiktok", "youtube", "x", "instagram"))
    page = FakePage(FakeContext(), "https://www.tiktok.com/")
    assert tiktok.session(page.context, page).state == "needs_login"
    page.context.cookie_values.update(sessionid="s", uid_tt="u1")
    assert tiktok.session(page.context, page) == recipes.Session("ok", "u1")
    page.url = "https://www.tiktok.com/challenge/verify"
    assert tiktok.session(page.context, page).state == "checkpoint"

    yt = FakePage(FakeContext({"SAPISID": "x"}), "https://studio.youtube.com/channel/UCabc_123/videos")
    assert youtube.session(yt.context, yt) == recipes.Session("ok", "UCabc_123")
    yt.url = "https://studio.youtube.com/"
    assert recipes.safe_session(youtube, yt.context, yt).state == "unknown"  # signed in, no channel id

    xp = FakePage(FakeContext({"auth_token": "t", "twid": "u%3D42"}), "https://x.com/home")
    assert x.session(xp.context, xp) == recipes.Session("ok", "42")

    ig = FakePage(FakeContext({"sessionid": "s", "ds_user_id": "99"}), "https://www.instagram.com/")
    assert instagram.session(ig.context, ig) == recipes.Session("ok", "99")
    ig.counts[recipes.IG_SIGNED_IN] = 0
    assert instagram.session(ig.context, ig).state == "needs_login"
    ig.missing.add(recipes.IG_OUTCOMES)  # no marker at all: an error, read as unknown, never as signed out
    unknown = recipes.safe_session(instagram, ig.context, ig)
    assert unknown.state == "unknown" and "timed out" in unknown.detail
    assert tiktok.is_login_page("https://www.tiktok.com/login/phone") and not tiktok.is_login_page(page.url)


def test_instagram_accepts_only_the_final_create_response_for_this_user_and_caption():
    ok = {"media": {"id": "1", "code": "C0DE", "user": {"pk": 99}, "caption": {"text": "Hello  #ui"}}}
    assert recipes.instagram_payload("for (;;);" + json.dumps(ok)) == ok
    assert recipes.instagram_created_media(ok, "99", "Hello #ui") == {"id": "1", "code": "C0DE"}
    for bad, reason in (
        ({**ok, "status": "fail"}, "create failed"),
        ({"payload": {"statusCode": 500}}, "create failed"),
        ({"media": {"id": "1"}}, "no media code"),
        ({"media": {**ok["media"], "user": {"pk": 1}}}, "another user"),
        ({"media": {**ok["media"], "caption": {"text": "other"}}}, "caption does not match"),
    ):
        with pytest.raises(ValueError, match=reason):
            recipes.instagram_created_media(bad, "99", "Hello #ui")


class FakeResponse:
    def __init__(self, body: dict, path="/api/v1/media/configure_to_clips/") -> None:
        self.url = f"https://www.instagram.com{path}"
        self.request = type("Request", (), {"method": "POST"})()
        self._body = body

    def text(self) -> str:
        return "for (;;);" + json.dumps(self._body)


def test_instagram_upload_submits_once_then_waits_for_the_media_response():
    page = FakePage(FakeContext({"sessionid": "s", "ds_user_id": "99"}), "https://www.instagram.com/")
    page.counts['a._a6hd[href="#"]'] = 4
    heading = '._ac76 [role="heading"]'
    steps = iter(["Crop", "Edit", "Create new reel"])
    current = {"text": next(steps)}
    page.texts[heading] = lambda: current["text"]
    caption = "Hello #ui"
    created = {"media": {"id": "1", "code": "REEL1", "user": {"pk": "99"}, "caption": {"text": caption}}}

    def primary_click():
        if current["text"] == "Create new reel":  # the share click: Instagram answers 202, then the media
            page.emit("response", FakeResponse({"statusCode": 202}))
            page.emit("response", FakeResponse(created))
        else:
            current["text"] = next(steps)

    page.click_effects[recipes.IG_PRIMARY_ACTION] = primary_click
    page.texts[recipes.IG_CAPTION] = ""
    # The crop step opens on 1:1 (a vertical frame overflows the square); Original shrinks it to the whole frame.
    preview = {"box": {"w": 719, "h": 1280}}
    page.evaluations[recipes.IG_PREVIEW] = lambda: preview["box"]
    page.click_effects[recipes.IG_CROP_ORIGINAL] = lambda: preview.update(box={"w": 404, "h": 719})
    sent = ("upload", recipes.IG_COVER_INPUT, "/tmp/cover.jpg")
    page.evaluations[recipes.IG_PICTURES] = lambda: ["url(frame)"] + (["url(blob:cover)"] if sent in page.log else [])
    task, submitted = _task(page.log, caption=caption, user="99")
    task.cover = "/tmp/cover.jpg"

    result = recipes.RECIPES["instagram"].upload(page, task)
    assert result == recipes.UploadResult("https://www.instagram.com/reel/REEL1/", "REEL1")
    clicks = [i for i, entry in enumerate(page.log) if entry == ("click", recipes.IG_PRIMARY_ACTION)]
    assert len(clicks) == 3 and submitted == [clicks[-1]]  # on_submit right before the share click
    original = page.log.index(("click", recipes.IG_CROP_ORIGINAL))
    assert original < clicks[0]  # Original is chosen on the crop step, before its Next
    assert clicks[0] < page.log.index(sent) < clicks[1]  # the cover goes in on the edit step
    assert ("fill", recipes.IG_CAPTION, caption) in page.log
    assert page.listeners["response"] == [] and task.notes == []


def test_instagram_fails_at_the_crop_step_when_original_does_not_show_the_whole_frame(monkeypatch):
    page = FakePage(FakeContext({"sessionid": "s", "ds_user_id": "99"}), "https://www.instagram.com/")
    page.counts['a._a6hd[href="#"]'] = 4
    page.evaluations[recipes.IG_PREVIEW] = {"w": 719, "h": 1280}  # stays on the 1:1 crop
    monkeypatch.setattr(recipes.time, "monotonic", iter(range(0, 10_000, 5)).__next__)
    task, submitted = _task(page.log, user="99")
    with pytest.raises(recipes.StepError) as caught:
        recipes.RECIPES["instagram"].upload(page, task)
    assert caught.value.stage == "crop-original" and "1:1" in caught.value.message and submitted == []


def test_instagram_upload_refuses_another_signed_in_user_before_anything():
    page = FakePage(FakeContext({"sessionid": "s", "ds_user_id": "7"}), "https://www.instagram.com/")
    task, submitted = _task(page.log, user="99")
    with pytest.raises(recipes.StepError) as caught:
        recipes.RECIPES["instagram"].upload(page, task)
    assert caught.value.stage == "identity" and submitted == []


def _tiktok_page(new_id: str | None):
    page = FakePage(FakeContext({"sessionid": "s", "uid_tt": "u1"}), "https://www.tiktok.com/")
    page.counts[recipes.TT_IFRAME] = 0
    old = {"href": "https://www.tiktok.com/@ui.effects/video/7000000000000000001?lang=en", "caption": "Old one"}
    state = {"posted": False}

    def tiles():
        if state["posted"] and new_id:
            return [{"href": f"https://www.tiktok.com/@ui.effects/video/{new_id}", "caption": "Hello #ui #fyp"}, old]
        return [old]

    page.evaluations['[data-e2e="user-post-item"]'] = tiles
    page.click_effects[recipes.TT_POST] = lambda: state.update(posted=True)
    return page


def test_tiktok_upload_confirms_one_new_video_with_this_caption():
    new_id = str((int(time.time()) << 32) + 5)
    page = _tiktok_page(new_id)
    task, submitted = _task(page.log, user="u1")
    result = recipes.RECIPES["tiktok"].upload(page, task)
    assert result == recipes.UploadResult(f"https://www.tiktok.com/@ui.effects/video/{new_id}", new_id)
    click = page.log.index(("click", recipes.TT_POST))
    assert submitted == [click]
    assert ("insert_text", "Hello #ui") in page.log and ("press", "ControlOrMeta+A") in page.log
    assert ("upload", 'input[type="file"]', "/tmp/v.mp4") in page.log


def test_tiktok_upload_disabled_post_button_fails_before_the_click(monkeypatch):
    page = _tiktok_page(None)
    page.attrs[(recipes.TT_POST, "disabled")] = ""
    clock = iter(range(0, 10_000, 100))
    monkeypatch.setattr(recipes.time, "monotonic", lambda: next(clock))
    task, submitted = _task(page.log, user="u1")
    with pytest.raises(recipes.StepError) as caught:
        recipes.RECIPES["tiktok"].upload(page, task)
    assert caught.value.stage == "wait-processed" and submitted == []


def test_tiktok_new_post_rules():
    now = time.time()
    fresh = str((int(now) << 32) + 1)
    stale = str(((int(now) - 3600) << 32) + 1)
    tile = recipes.PostTile
    posts = [tile(fresh, f"https://www.tiktok.com/@ui.effects/video/{fresh}", "Hello #ui"),
             tile(stale, f"https://www.tiktok.com/@ui.effects/video/{stale}", "Hello #ui"),
             tile("99", "https://www.tiktok.com/@someone/video/99", "Hello #ui")]
    assert recipes.tiktok_new_post(posts, None, "ui.effects", "Hello #ui", now).external_id == fresh
    with pytest.raises(RuntimeError, match="found 0"):
        recipes.tiktok_new_post(posts, {fresh}, "ui.effects", "Hello #ui", now)
    with pytest.raises(RuntimeError, match="found 0"):
        recipes.tiktok_new_post(posts, None, "ui.effects", "Another caption", now)
    twin_id = str(int(fresh) + 1)
    twin = posts + [tile(twin_id, f"https://www.tiktok.com/@ui.effects/video/{twin_id}", "Hello #ui")]
    with pytest.raises(RuntimeError, match="found 2"):
        recipes.tiktok_new_post(twin, None, "ui.effects", "Hello #ui", now)
    assert recipes.tiktok_id_time(fresh) == int(now) and recipes.tiktok_id_time("x") is None


def _youtube_page(confirmed_link: str):
    page = FakePage(FakeContext({"SAPISID": "x"}), "https://studio.youtube.com/channel/UC1/videos")
    # youtube.com/upload lands on the channel's Studio page; the bound check reads the channel id there.
    page.redirects["https://www.youtube.com/upload"] = "https://studio.youtube.com/channel/UC1/videos/upload?d=ud"
    page.texts[".progress-label"] = "Checks complete. No issues found."
    page.attrs[(recipes.YT_LINK, "href")] = "https://youtube.com/shorts/abcdef12345"
    page.texts["ytcp-video-share-dialog"] = "Video published"

    def done():
        page.attrs[(recipes.YT_LINK, "href")] = confirmed_link

    page.click_effects["#done-button"] = done
    return page


def test_youtube_upload_confirms_the_same_video_id_after_done():
    page = _youtube_page("https://youtu.be/abcdef12345")
    task, submitted = _task(page.log, caption="Title line\nDescription #shorts", user="UC1")
    result = recipes.RECIPES["youtube"].upload(page, task)
    assert result == recipes.UploadResult("https://www.youtube.com/shorts/abcdef12345", "abcdef12345")
    assert submitted == [page.log.index(("click", "#done-button"))]
    assert ("fill", "#title-textarea #textbox", "Title line") in page.log
    assert ("fill", "#description-textarea #textbox", "Description #shorts") in page.log


def test_youtube_upload_another_id_in_the_published_dialog_is_an_error_after_the_click():
    page = _youtube_page("https://youtu.be/zzzzzz99999")
    task, submitted = _task(page.log, caption="Title", user="UC1")
    with pytest.raises(recipes.StepError) as caught:
        recipes.RECIPES["youtube"].upload(page, task)
    assert caught.value.stage == "confirm-published" and len(submitted) == 1


def test_youtube_upload_without_its_own_link_stops_before_done():
    page = _youtube_page("https://youtu.be/abcdef12345")
    page.attrs[(recipes.YT_LINK, "href")] = None
    task, submitted = _task(page.log, caption="Title", user="UC1")
    with pytest.raises(recipes.StepError) as caught:
        recipes.RECIPES["youtube"].upload(page, task)
    assert caught.value.stage == "video-link" and submitted == [] and ("click", "#done-button") not in page.log


def test_youtube_processing_failure_and_x_has_no_upload():
    page = _youtube_page("https://youtu.be/abcdef12345")
    page.texts[".progress-label"] = "Processing abandoned"
    task, submitted = _task(page.log, caption="Title", user="UC1")
    with pytest.raises(recipes.StepError) as caught:
        recipes.RECIPES["youtube"].upload(page, task)
    assert caught.value.stage == "wait-processed" and submitted == []
    assert recipes.youtube_id("https://www.youtube.com/watch?v=abcdef12345&t=1") == "abcdef12345"
    assert not recipes.RECIPES["x"].scripted
    with pytest.raises(recipes.StepError, match="no scripted upload"):
        recipes.RECIPES["x"].upload(FakePage(), task)
