"""Per-platform browser recipes: how to tell a signed-in session, and how to upload one video.

Ported from the legacy TypeScript CLI (`cli/lib/uploads/platforms.ts`), which followed
dreammis/social-auto-upload (MIT). The recipes drive the platforms' own web UI and were never run against
a live account, so every step is named: a failure ends the run at that step with `StepError(stage, ...)`
and the caller records it. A recipe calls `task.on_submit()` exactly once, right before the irreversible
publish click; the caller writes `unknown` there, so anything after it never retries blindly.

Success is the platform's own evidence, never a toast:
- Instagram: the final `/api/v1/media/configure` response for the bound user with this caption.
- TikTok: the redirect to the content page, then exactly one new video with this caption on the bound
  profile, created after the click (TikTok video ids carry their creation time).
- YouTube: the upload dialog's own video link before Done, then the "Video published" dialog showing
  the same video id.
- X: no scripted upload; the owner posts by hand and records the URL with `post resolve`.
"""

from __future__ import annotations

import contextlib
import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse

from .browser import first_line
from .checks import normalize_caption, youtube_title
from .platforms import PLATFORMS, bare_handle

CHALLENGE = re.compile(r"/(challenge|checkpoint|suspended|accounts/disabled)\b", re.I)
LOGIN_PAGE = re.compile(r"login|signin|accounts\.google", re.I)


class StepError(Exception):
    def __init__(self, stage: str, message: str) -> None:
        super().__init__(message)
        self.stage = stage
        self.message = message


def step(stage: str, fn: Callable):
    """Run one named step; any failure becomes `StepError(stage, <first line>)`."""
    try:
        return fn()
    except StepError:
        raise
    except Exception as exc:  # noqa: BLE001 - every failure is reported at its step
        raise StepError(stage, first_line(exc)) from exc


@dataclass
class Session:
    state: str  # ok | needs_login | checkpoint | unknown
    user_id: str | None = None
    detail: str = ""


@dataclass
class UploadTask:
    handle: str  # bare, without `@`
    video: Path
    caption: str
    expected_user_id: str | None
    on_submit: Callable[[], None]


@dataclass
class UploadResult:
    url: str
    external_id: str | None = None


@dataclass
class PostTile:
    external_id: str
    url: str
    caption: str = ""
    views: str = ""


def collapse(text: str | None) -> str:
    return " ".join((text or "").split())


def cookie(context, url: str, name: str) -> str | None:
    try:
        found = context.cookies(url)
    except Exception:  # noqa: BLE001 - no cookies readable means no session
        return None
    for entry in found:
        if entry.get("name") == name and entry.get("value"):
            return entry["value"]
    return None


def pause(page, ms: int) -> None:
    """Wait while letting the page deliver its events (responses, dialogs)."""
    page.wait_for_timeout(ms)


def wait_count(page, locator, count: int, timeout_s: float = 30) -> None:
    deadline = time.monotonic() + timeout_s
    while True:
        actual = locator.count()
        if actual == count:
            return
        if time.monotonic() > deadline:
            raise RuntimeError(f"expected {count} element(s), found {actual}")
        pause(page, 250)


def wait_text_change(page, locator, previous: str, timeout_s: float = 60) -> None:
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            current = locator.inner_text()
        except Exception:  # noqa: BLE001 - a re-rendering heading reads as unchanged
            current = previous
        if current != previous:
            return
        if time.monotonic() > deadline:
            raise RuntimeError(f'the step did not advance past "{previous}"')
        pause(page, 250)


def dismiss_optional(guide, button) -> bool:
    """Close a known optional prompt if it shows up within a short window; absent is fine."""
    try:
        guide.wait_for(state="visible", timeout=1_500)
    except Exception:  # noqa: BLE001
        return False
    button.click()
    guide.wait_for(state="hidden")
    return True


def attribute(locator, name: str) -> str | None:
    """An attribute value; "" when it cannot be read (so a disabled check stays disabled)."""
    try:
        return locator.get_attribute(name, timeout=5_000)
    except Exception:  # noqa: BLE001
        return ""


class Recipe:
    name = ""

    def __init__(self) -> None:
        self.platform = PLATFORMS[self.name]

    @property
    def scripted(self) -> bool:
        return self.platform.scripted_upload

    def session(self, context, page) -> Session:
        raise NotImplementedError

    def upload(self, page, task: UploadTask) -> UploadResult:
        raise StepError("no-recipe", f"{self.platform.label} has no scripted upload")

    def is_login_page(self, url: str) -> bool:
        return bool(LOGIN_PAGE.search(url or ""))

    def require_bound(self, page, expected_user_id: str | None) -> None:
        def check() -> None:
            session = self.session(page.context, page)
            if session.state != "ok" or not expected_user_id or session.user_id != expected_user_id:
                raise RuntimeError(f"cannot confirm the bound account before publishing (session {session.state}, "
                                   f"user {session.user_id or 'unknown'})")

        step("identity", check)


# ---------------------------------------------------------------- Instagram

IG_HOME = "https://www.instagram.com/"
# The create dialog's media input accepts video/mp4; the cover input in the edit step accepts only images.
IG_MEDIA_INPUT = 'input[type="file"][accept*="video/mp4"]'
# `_ac76` is the wizard header shared by the crop, edit and caption steps; the primary action has no svg.
IG_PRIMARY_ACTION = '._ac76 [role="button"]:not(:has(svg))'
IG_CAPTION = '[contenteditable="true"][role="textbox"][data-lexical-editor="true"]'
IG_SIGNED_IN = 'a[href^="/direct/inbox/"]'
IG_OUTCOMES = ('a[href^="/direct/inbox/"], input[type="password"], a[href^="/accounts/login/"], '
               'a[href^="/accounts/emailsignup/"]')


def instagram_payload(body: str) -> dict:
    """Meta prefixes JSON with `for (;;);` against JSON hijacking."""
    text = body[len("for (;;);"):] if body.startswith("for (;;);") else body
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("the Instagram response is not a JSON object")
    return data


def instagram_created_media(payload: dict, owner_id: str, caption: str) -> dict:
    """Accept only the final create response for this user and this caption; 202 and a bare 200 are not
    success."""
    body = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
    status_code = body.get("statusCode")
    if payload.get("error") or (body.get("status") is not None and body.get("status") != "ok") or (
        "statusCode" in body and status_code != 200
    ):
        raise ValueError(f"Instagram create failed: {body.get('message') or status_code or body.get('status')}")
    media = body.get("media") or {}
    if not media.get("code") or not media.get("id"):
        raise ValueError("the Instagram create response has no media code")
    if str((media.get("user") or {}).get("pk")) != str(owner_id):
        raise ValueError("the Instagram create response belongs to another user")
    if collapse(normalize_caption((media.get("caption") or {}).get("text") or "")) != collapse(caption):
        raise ValueError("the Instagram create response caption does not match")
    return {"id": str(media["id"]), "code": str(media["code"])}


class Instagram(Recipe):
    name = "instagram"

    def session(self, context, page) -> Session:
        if CHALLENGE.search(page.url):
            return Session("checkpoint")
        # No session cookie is conclusive; with one, wait for an explicit signed-in or signed-out marker (a
        # timeout raises, which the caller reads as unknown, never as signed out).
        if not cookie(context, IG_HOME, "sessionid"):
            return Session("needs_login")
        page.locator(IG_OUTCOMES).first.wait_for(state="attached", timeout=60_000)
        if CHALLENGE.search(page.url):
            return Session("checkpoint")
        if not page.locator(IG_SIGNED_IN).count():
            return Session("needs_login")
        return Session("ok", cookie(context, IG_HOME, "ds_user_id"))

    def upload(self, page, task: UploadTask) -> UploadResult:
        step("open-home", lambda: page.goto(IG_HOME, wait_until="domcontentloaded", timeout=120_000))

        def identity() -> str:
            session = self.session(page.context, page)
            if session.state != "ok" or not session.user_id:
                raise RuntimeError(f"the session is {session.state}")
            if task.expected_user_id and session.user_id != task.expected_user_id:
                raise RuntimeError(f"signed in as user {session.user_id}; the profile is bound to "
                                   f"{task.expected_user_id}")
            return session.user_id

        user_id = step("identity", identity)
        step("open-create", lambda: self._open_create(page))
        step("attach-video", lambda: self._attach(page, task.video))
        step("crop-next", lambda: self._next(page))
        step("edit-next", lambda: self._next(page))
        step("caption", lambda: self._caption(page, task.caption))

        responses: list = []

        def on_response(response) -> None:
            with contextlib.suppress(Exception):
                if response.request.method == "POST" and urlparse(response.url).path.startswith(
                    "/api/v1/media/configure"
                ):
                    responses.append(response)

        page.on("response", on_response)  # listen before the click: a Reel answers 202 first, then the media
        try:
            action = page.get_by_role("dialog").locator(IG_PRIMARY_ACTION)

            def share_ready() -> None:
                wait_count(page, action, 1)
                if not action.is_enabled():
                    raise RuntimeError("Share is disabled")

            step("share", share_ready)
            task.on_submit()
            step("share-click", action.click)
            media = step("wait-created", lambda: self._wait_created(page, responses, user_id, task.caption))
        finally:
            with contextlib.suppress(Exception):
                page.remove_listener("response", on_response)
        return UploadResult(f"{IG_HOME}reel/{media['code']}/", media["code"])

    def _open_create(self, page) -> None:
        # The notifications prompt can appear late and cover the nav; dismiss it whenever it shows up.
        notifications = page.get_by_role("dialog").filter(
            has=page.locator('img[src^="/images/instagram/xig/ico/xxhdpi_launcher.png"]'))
        page.add_locator_handler(
            notifications, lambda: dismiss_optional(notifications, notifications.locator("._a9-z > button").nth(1)))
        try:
            # Four nav popups in order: notifications, create, settings, Meta.
            popups = page.locator('a._a6hd[href="#"]').filter(has=page.locator("[aria-selected]"))
            wait_count(page, popups, 4)
            popups.nth(1).click()
        finally:
            with contextlib.suppress(Exception):
                page.remove_locator_handler(notifications)

    def _attach(self, page, video: Path) -> None:
        dialog = page.get_by_role("dialog")
        wait_count(page, dialog, 1)
        media_input = dialog.locator(IG_MEDIA_INPUT)
        wait_count(page, media_input, 1)
        media_input.set_input_files(str(video))
        intro = page.get_by_role("dialog").filter(
            has=page.locator('img[src^="/images/instagram/clips/reels_nux_icon.png"]'))
        dismiss_optional(intro, intro.locator("._a9-z div > button"))
        wait_count(page, dialog.locator(IG_PRIMARY_ACTION), 1, 60)

    def _next(self, page) -> None:
        """Crop, then edit: each click must change the wizard heading."""
        dialog = page.get_by_role("dialog")
        heading = dialog.locator('._ac76 [role="heading"]')
        wait_count(page, heading, 1)
        previous = heading.inner_text()
        action = dialog.locator(IG_PRIMARY_ACTION)
        wait_count(page, action, 1)
        action.click()
        wait_text_change(page, heading, previous)

    def _caption(self, page, caption: str) -> None:
        editor = page.get_by_role("dialog").locator(IG_CAPTION)
        wait_count(page, editor, 1)
        if caption:
            editor.fill(caption)
            if collapse(editor.inner_text()) != collapse(caption):
                raise RuntimeError("the caption editor does not hold the caption")

    def _wait_created(self, page, responses: list, user_id: str, caption: str) -> dict:
        deadline = time.monotonic() + 180
        while True:
            while not responses:
                if time.monotonic() > deadline:
                    raise RuntimeError("submitted, but no final create response within 180 s")
                pause(page, 500)
            payload = instagram_payload(responses.pop(0).text())
            body = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
            if body.get("statusCode") == 202:
                continue
            return instagram_created_media(payload, user_id, caption)


# ---------------------------------------------------------------- TikTok
# Selectors and the upload-finished signal (the Post button loses `disabled`) follow social-auto-upload's
# tk_uploader; the studio page may render inside an iframe, so every locator goes through `root`.

TT_HOME = "https://www.tiktok.com/"
TT_UPLOAD = "https://www.tiktok.com/tiktokstudio/upload"
TT_IFRAME = 'iframe[data-tt="Upload_index_iframe"]'
TT_POST = 'button[data-e2e="post_video_button"], div.button-group > button:has-text("Post")'
TT_TILES = """items => items.map(item => ({
  href: item.querySelector('a[href*="/video/"]')?.href ?? "",
  views: item.querySelector('[data-e2e="video-views"]')?.innerText ?? "",
  caption: item.querySelector("img")?.getAttribute("alt") ?? "",
}))"""


def tiktok_id_time(external_id: str) -> int | None:
    """TikTok video ids carry their creation time (unix seconds) in the top 32 bits."""
    try:
        return int(external_id) >> 32
    except (TypeError, ValueError):
        return None


def tiktok_tiles(raw: list[dict]) -> list[PostTile]:
    tiles = []
    for item in raw:
        href = str(item.get("href") or "")
        match = re.search(r"/video/(\d+)", href)
        if match:
            tiles.append(PostTile(match.group(1), href.split("?")[0], str(item.get("caption") or ""),
                                  str(item.get("views") or "")))
    return tiles


def tiktok_new_post(posts: list[PostTile], previous: set[str] | None, handle: str, caption: str,
                    submitted_at: float) -> PostTile:
    """Exactly one video on @handle that was not there before the click, created after it (10 min slack),
    whose grid caption is this caption."""
    want = collapse(caption)
    found = []
    for post in posts:
        if previous is not None and post.external_id in previous:
            continue
        if not urlparse(post.url).path.lower().startswith(f"/@{bare_handle(handle).lower()}/video/"):
            continue
        created = tiktok_id_time(post.external_id)
        if created is not None and created < submitted_at - 600:
            continue
        seen = collapse(post.caption)
        if want and not (seen == want or seen.startswith(want)):
            continue
        found.append(post)
    if len(found) != 1:
        raise RuntimeError(f"cannot confirm one new video with the submitted caption on @{bare_handle(handle)} "
                           f"(found {len(found)})")
    return found[0]


class TikTok(Recipe):
    name = "tiktok"

    def session(self, context, page) -> Session:
        if CHALLENGE.search(page.url):
            return Session("checkpoint")
        if not cookie(context, TT_HOME, "sessionid"):
            return Session("needs_login")
        return Session("ok", cookie(context, TT_HOME, "uid_tt"))

    def recent_posts(self, page, handle: str) -> list[PostTile]:
        page.goto(self.platform.profile_url(handle), wait_until="domcontentloaded", timeout=60_000)
        page.locator('[data-e2e="user-post-item-list"]').first.wait_for(state="attached", timeout=20_000)
        return tiktok_tiles(page.locator('[data-e2e="user-post-item"]').evaluate_all(TT_TILES))

    def upload(self, page, task: UploadTask) -> UploadResult:
        self.require_bound(page, task.expected_user_id)
        try:
            previous: set[str] | None = {p.external_id for p in self.recent_posts(page, task.handle)}
        except Exception:  # noqa: BLE001 - an empty or changed profile grid; the id time check still holds
            previous = None

        def open_upload():
            page.goto(TT_UPLOAD, wait_until="domcontentloaded", timeout=120_000)
            if "/login" in page.url:
                raise StepError("identity", "the TikTok session is signed out")
            page.locator(f'{TT_IFRAME}, input[type="file"]').first.wait_for(state="attached", timeout=60_000)
            return page.frame_locator(TT_IFRAME) if page.locator(TT_IFRAME).count() else page

        root = step("open-upload", open_upload)
        step("attach-video",
             lambda: root.locator('input[type="file"]').first.set_input_files(str(task.video), timeout=60_000))

        def caption() -> None:
            editor = root.locator('div[contenteditable="true"]').first
            editor.click(timeout=60_000)
            # The editor is prefilled with the file name; replace it.
            page.keyboard.press("ControlOrMeta+A")
            page.keyboard.press("Delete")
            if task.caption:
                page.keyboard.insert_text(task.caption)

        step("caption", caption)
        post = root.locator(TT_POST).first
        step("wait-processed", lambda: self._wait_enabled(page, post))
        self.require_bound(page, task.expected_user_id)
        submitted_at = time.time()
        task.on_submit()
        step("post-click", post.click)
        step("wait-posted", lambda: page.wait_for_url(re.compile(r"tiktokstudio/content"), timeout=300_000))
        tile = step("find-post-url", lambda: self._find_new(page, task, previous, submitted_at))
        return UploadResult(tile.url, tile.external_id)

    def _wait_enabled(self, page, post) -> None:
        deadline = time.monotonic() + 600
        while attribute(post, "disabled") is not None or attribute(post, "aria-disabled") == "true":
            if time.monotonic() > deadline:
                raise RuntimeError("the video was not processed within 10 minutes")
            pause(page, 2_000)

    def _find_new(self, page, task: UploadTask, previous: set[str] | None, submitted_at: float) -> PostTile:
        deadline = time.monotonic() + 90  # a new video can take a while to show on the profile grid
        while True:
            try:
                return tiktok_new_post(self.recent_posts(page, task.handle), previous, task.handle, task.caption,
                                       submitted_at)
            except Exception:
                if time.monotonic() > deadline:
                    raise
            pause(page, 10_000)


# ---------------------------------------------------------------- YouTube
# Studio flow from social-auto-upload's youtube_uploader: fill() (not typing) so #hashtags do not open
# autocomplete, Next until the visibility radios, and wait for processing before Done.

YT_LINK = 'a[href*="youtu.be"], a[href*="/shorts/"], a[href*="watch?v="]'
YT_ID = re.compile(r"(?:youtu\.be/|shorts/|v=)([A-Za-z0-9_-]{6,})")


def youtube_id(url: str | None) -> str | None:
    match = YT_ID.search(url or "")
    return match.group(1) if match else None


class YouTube(Recipe):
    name = "youtube"

    def session(self, context, page) -> Session:
        if CHALLENGE.search(page.url):
            return Session("checkpoint")
        if not cookie(context, "https://www.youtube.com/", "SAPISID"):
            return Session("needs_login")
        match = re.search(r"/channel/([A-Za-z0-9_-]+)", page.url)
        return Session("ok", match.group(1) if match else None)

    def upload(self, page, task: UploadTask) -> UploadResult:
        self.require_bound(page, task.expected_user_id)
        step("open-upload", lambda: page.goto("https://www.youtube.com/upload", wait_until="domcontentloaded",
                                              timeout=120_000))
        step("attach-video",
             lambda: page.locator('input[type="file"]').first.set_input_files(str(task.video), timeout=60_000))
        title, description = youtube_title(task.caption)

        def details() -> None:
            page.locator("#title-textarea").wait_for(state="visible", timeout=120_000)
            page.locator("#title-textarea #textbox").fill(title[:100])
            if description:
                page.locator("#description-textarea #textbox").fill(description)

        step("title", details)
        step("not-for-kids",
             lambda: page.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]').click())

        def to_visibility() -> None:
            public = page.locator('tp-yt-paper-radio-button[name="PUBLIC"]')
            for _ in range(5):
                if public.is_visible():
                    break
                page.locator("#next-button").click()
                pause(page, 1_000)
            public.click()

        step("next-to-visibility", to_visibility)
        step("wait-processed", lambda: self._wait_processed(page))

        def video_link() -> str:
            link = page.locator(YT_LINK).first.get_attribute("href", timeout=10_000)
            if not youtube_id(link):
                raise RuntimeError("no video link on the upload dialog")
            return link

        link = step("video-link", video_link)  # before Done: without our own id there is nothing to confirm
        self.require_bound(page, task.expected_user_id)
        task.on_submit()
        step("done-click", lambda: page.locator("#done-button").click())

        def confirm() -> None:
            dialog = page.locator("ytcp-video-share-dialog")
            dialog.wait_for(state="visible", timeout=120_000)
            if not re.search(r"video published", dialog.inner_text(), re.I):
                raise RuntimeError('YouTube did not confirm "Video published"')
            confirmed = dialog.locator(YT_LINK).first.get_attribute("href")
            if youtube_id(confirmed) != youtube_id(link):
                raise RuntimeError("the published dialog shows another video's link")

        step("confirm-published", confirm)
        video = youtube_id(link)
        return UploadResult(f"https://www.youtube.com/shorts/{video}", video)

    def _wait_processed(self, page) -> None:
        deadline = time.monotonic() + 30 * 60
        while True:
            try:
                label = page.locator(".progress-label").first.inner_text(timeout=5_000).lower()
            except Exception:  # noqa: BLE001
                label = ""
            if re.search(r"abandoned|failed|error", label):
                raise RuntimeError(f"processing failed: {label}")
            if re.search(r"checks complete|processing complete|upload complete|finished processing", label):
                return
            if time.monotonic() > deadline:
                raise RuntimeError(f"the upload is still processing: {label or 'no progress label'}")
            pause(page, 5_000)


# ---------------------------------------------------------------- X: session only


class X(Recipe):
    name = "x"

    def session(self, context, page) -> Session:
        if CHALLENGE.search(page.url):
            return Session("checkpoint")
        if not cookie(context, "https://x.com/", "auth_token"):
            return Session("needs_login")
        twid = cookie(context, "https://x.com/", "twid")
        return Session("ok", unquote(twid).removeprefix("u=") if twid else None)


RECIPES: dict[str, Recipe] = {r.name: r for r in (Instagram(), TikTok(), YouTube(), X())}


def safe_session(recipe: Recipe, context, page) -> Session:
    """The session check that never raises: a failure is `unknown` with the reason in `detail`."""
    try:
        session = recipe.session(context, page)
    except Exception as exc:  # noqa: BLE001
        return Session("unknown", None, first_line(exc))
    if session.state == "ok" and not session.user_id:
        return Session("unknown", None, "signed in, but the platform user id is not readable on this page")
    return session
