"""Stats: read each signed-in platform's own numbers for the account's videos and append them to `stats.csv`.

Each platform is read from its account's browser profile, from the data the platform's own pages load:
- Instagram: the profile and Reels grids' graphql responses (`play_count`, `like_count`, `comment_count`,
  `reshare_count`; saves are only in the owner's insights and stay empty).
- YouTube: Studio's `list_creator_videos` for the channel's Shorts and videos (`publicMetrics`: views,
  likes, comments).
- TikTok: the profile grid's `item_list` responses (`stats`: plays, likes, comments, shares, saves).

One run appends one row per video found (a snapshot with `fetched_at`); `content` is filled when the URL is
one of the account's posts in `posts.csv`. Rows are never rewritten, so the history of a post is its rows.
"""

from __future__ import annotations

import contextlib
import json
import re
import time
from collections.abc import Callable
from urllib.parse import urlparse

from .. import files, model
from ..errors import RalphyError
from . import browser, platforms, profiles, recipes

WAIT_S = 20  # how long a page may take to deliver its first data response


# ---------------------------------------------------------------- parsers (pure: tested without a browser)


def _int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _walk(node, keep: Callable[[dict], bool], out: list[dict]) -> None:
    if isinstance(node, dict):
        if keep(node):
            out.append(node)
        for value in node.values():
            _walk(value, keep, out)
    elif isinstance(node, list):
        for value in node:
            _walk(value, keep, out)


def instagram_media(payload, owner_id: str | None = None) -> list[dict]:
    """Media with numbers in one graphql payload; another user's media (suggestions) is dropped."""
    found: list[dict] = []
    _walk(payload, lambda d: bool(d.get("code")) and any(
        k in d for k in ("play_count", "like_count", "comment_count", "view_count")), found)
    out = []
    for media in found:
        owner = media.get("user") or media.get("owner") or {}
        pk = str(owner.get("pk") or owner.get("id") or "")
        if owner_id and pk and pk != str(owner_id):
            continue
        kind = "reel" if media.get("product_type") == "clips" else "p"
        out.append({
            "id": str(media["code"]),
            "url": f"https://www.instagram.com/{kind}/{media['code']}/",
            "views": _int(media.get("play_count") or media.get("ig_play_count") or media.get("view_count")),
            "likes": _int(media.get("like_count")),
            "comments": _int(media.get("comment_count")),
            "shares": _int(media.get("reshare_count")),
            "saves": _int(media.get("save_count")),
        })
    return out


def youtube_videos(payload) -> list[dict]:
    out = []
    for video in (payload or {}).get("videos") or []:
        vid = video.get("videoId")
        if not vid:
            continue
        metrics = video.get("publicMetrics") or video.get("metrics") or {}
        short = video.get("shorts") is not None or video.get("contentType") == "CREATOR_CONTENT_TYPE_SHORTS"
        out.append({
            "id": vid,
            "url": f"https://www.youtube.com/shorts/{vid}" if short else f"https://www.youtube.com/watch?v={vid}",
            "views": _int(metrics.get("externalViewCount") or metrics.get("viewCount")),
            "likes": _int(metrics.get("likeCount")),
            "comments": _int(metrics.get("commentCount")),
            "shares": None,
            "saves": None,
        })
    return out


def tiktok_items(payload, handle: str) -> list[dict]:
    out = []
    for item in (payload or {}).get("itemList") or []:
        vid = str(item.get("id") or "")
        author = (item.get("author") or {}).get("uniqueId") or platforms.bare_handle(handle)
        if not vid or not platforms.same_handle(author, handle):
            continue
        stats = item.get("statsV2") or item.get("stats") or {}
        out.append({
            "id": vid,
            "url": f"https://www.tiktok.com/@{author}/video/{vid}",
            "views": _int(stats.get("playCount")),
            "likes": _int(stats.get("diggCount")),
            "comments": _int(stats.get("commentCount")),
            "shares": _int(stats.get("shareCount")),
            "saves": _int(stats.get("collectCount")),
        })
    return out


def external_id(platform: str, url: str | None) -> str | None:
    """The platform's own id in a post URL: the Instagram code, the YouTube video id, the TikTok video id."""
    path = urlparse(url or "").path
    if platform == "instagram":
        match = re.search(r"/(?:reel|reels|p)/([A-Za-z0-9_-]+)", path)
        return match.group(1) if match else None
    if platform == "youtube":
        return recipes.youtube_id(url)
    if platform == "tiktok":
        match = re.search(r"/video/(\d+)", path)
        return match.group(1) if match else None
    return None


# ---------------------------------------------------------------- collectors (drive the profile's own pages)


def _listen(page, want: Callable[[object], bool]) -> tuple[list, Callable[[], None]]:
    bodies: list = []

    def on_response(response) -> None:
        with contextlib.suppress(Exception):
            if want(response):
                bodies.append(json.loads(response.text()))

    page.on("response", on_response)
    return bodies, lambda: page.remove_listener("response", on_response)


def _settle(page, bodies: list, quiet_ms: int = 3_000) -> None:
    """Wait for the first data response (up to WAIT_S), then until no new one arrives for `quiet_ms`."""
    deadline = time.monotonic() + WAIT_S
    while not bodies and time.monotonic() < deadline:
        page.wait_for_timeout(500)
    seen = -1
    while seen != len(bodies):
        seen = len(bodies)
        page.wait_for_timeout(quiet_ms)


def collect_instagram(page, handle: str, user_id: str | None) -> list[dict]:
    bare = platforms.bare_handle(handle)
    bodies, stop = _listen(page, lambda r: r.request.method == "POST" and "graphql" in r.url)
    try:
        for tab in ("reels/", ""):
            page.goto(f"https://www.instagram.com/{bare}/{tab}", wait_until="domcontentloaded", timeout=60_000)
            _settle(page, bodies)
    finally:
        stop()
    return [m for body in bodies for m in instagram_media(body, user_id)]


def collect_youtube(page, handle: str, user_id: str | None) -> list[dict]:
    if not user_id:
        raise RuntimeError("the YouTube channel id is unknown; run `ralphy account check` first")
    bodies, stop = _listen(page, lambda r: "list_creator_videos" in r.url)
    try:
        for tab in ("short", "upload"):
            page.goto(f"https://studio.youtube.com/channel/{user_id}/videos/{tab}", wait_until="domcontentloaded",
                      timeout=90_000)
            _settle(page, bodies)
    finally:
        stop()
    return [v for body in bodies for v in youtube_videos(body)]


def collect_tiktok(page, handle: str, user_id: str | None) -> list[dict]:
    bodies, stop = _listen(page, lambda r: "/api/post/item_list" in r.url)
    try:
        page.goto(platforms.PLATFORMS["tiktok"].profile_url(handle), wait_until="domcontentloaded", timeout=60_000)
        _settle(page, bodies)
    finally:
        stop()
    return [i for body in bodies for i in tiktok_items(body, handle)]


COLLECTORS: dict[str, Callable[[object, str, str | None], list[dict]]] = {
    "instagram": collect_instagram, "youtube": collect_youtube, "tiktok": collect_tiktok,
}


# ---------------------------------------------------------------- fetch


def _dedupe(found: list[dict]) -> list[dict]:
    """One entry per video; a later response for the same video wins (it is the fresher number)."""
    by_id: dict[str, dict] = {}
    for entry in found:
        merged = {**by_id.get(entry["id"], {}), **{k: v for k, v in entry.items() if v is not None}}
        by_id[entry["id"]] = merged
    return list(by_id.values())


def _fetch_one(account: model.Account, entry: dict, posted: dict[tuple[str, str], str]) -> dict:
    platform = platforms.get(str(entry.get("platform") or ""))
    summary = {"platform": platform.name, "handle": entry.get("handle")}
    if platform.name not in COLLECTORS:
        return {**summary, "skipped": f"{platform.label} stats are not read yet"}
    if not entry.get("handle"):
        return {**summary, "skipped": f"no handle (`ralphy account login {account.slug} {platform.name} "
                                      "--handle @<handle>`)"}
    recipe = recipes.RECIPES[platform.name]
    profile = profiles.profile_name(account, entry)
    with browser.open_profile(profile) as session:
        page = session.page()
        error = browser.goto(page, platform.home)
        state = recipes.Session("unknown", None, error) if error else \
            recipes.safe_session(recipe, session.context, page)
        if state.state != "ok":
            return {**summary, "skipped": f"session {state.state}: {state.detail or 'sign in again'}"}
        found = _dedupe(COLLECTORS[platform.name](page, entry["handle"], state.user_id))
    stamp = files.utc_now()
    rows = [{
        "fetched_at": stamp, "platform": platform.name, "handle": entry["handle"], "url": video["url"],
        "content": posted.get((platform.name, video["id"]), ""),
        **{column: video.get(column) for column in model.STATS_NUMBERS},
    } for video in found]
    if rows:
        files.mutate_csv(account.stats_path, model.STATS_COLUMNS, lambda existing: existing + rows)
    return {**summary, "videos": len(rows), "ours": sum(1 for r in rows if r["content"]), "rows": rows}


def fetch(account_ref: str, platform_name: str | None = None) -> dict:
    account = profiles.account_for(account_ref)
    targets = [profiles.require(account, platform_name)] if platform_name else profiles.entries(account)
    if not targets:
        raise RalphyError("E_PLATFORM_NOT_FOUND", f"{account.slug} has no platforms in account.md",
                          f"Add one: `ralphy account login {account.slug} <platform> --handle @<handle>`.")
    posted = {}
    for row in model.read_posts(account):
        found = external_id(row.get("platform") or "", row.get("url"))
        if found and row.get("content"):
            posted[(row["platform"], found)] = row["content"]
    results = []
    for entry in targets:
        if entry.get("status") == "paused":
            results.append({"platform": entry.get("platform"), "handle": entry.get("handle"), "skipped": "paused"})
            continue
        try:
            results.append(_fetch_one(account, entry, posted))
        except RalphyError as exc:
            if exc.code == "E_DEP_MISSING":
                raise
            results.append({"platform": entry.get("platform"), "handle": entry.get("handle"), "error": exc.message})
        except Exception as exc:  # noqa: BLE001 - one broken platform must not hide the others
            results.append({"platform": entry.get("platform"), "handle": entry.get("handle"),
                            "error": browser.first_line(exc)})
    return {"account": account.slug, "stats": str(account.stats_path), "results": results}
