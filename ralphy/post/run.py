"""`post run` and the browser side of `account login|check|open`.

`post run` takes `approved` rows whose `scheduled_at` is empty or past (and, named by id, `failed` or
`needs_login` rows, which stopped before the final click). For each row, under the profile lock:

1. static checks (platform entry, paused, handle, render file, caption): `failed` with the reason, or
   skipped and left `approved` when the profile is paused, busy or has an unresolved `unknown` post;
   the render is cloned to `RALPHY_CACHE_DIR/post/<post-id>.mp4` and checked again, and that copy is what
   uploads, so a re-render of `render.mp4` during the upload cannot change the file;
2. `uploading`; Chrome opens the profile at the platform home; the session check writes the platform's
   `status` and `checked_at` in account.md; signed out or a checkpoint -> `needs_login`;
3. the recipe uploads; right before the irreversible click it calls `on_submit`, which writes `unknown`;
4. the recipe's confirmation -> `published` with the post URL; any failure before the click -> `failed`
   with `<step>: <reason>`; any failure after it stays `unknown`.

A profile whose post ended in anything but `published` runs no more posts in the same batch: the same
step would fail the same way. Nothing here retries.
"""

from __future__ import annotations

import contextlib
import secrets
import time
from collections import Counter
from pathlib import Path

from .. import files, model, paths
from ..errors import RalphyError
from . import browser, checks, platforms, posts, profiles, recipes

LOGIN_TIMEOUT_MINUTES = 10.0


def _entry_summary(account: model.Account, entry: dict) -> dict:
    return {
        "account": account.slug,
        "platform": entry.get("platform"),
        "handle": entry.get("handle"),
        "profile": entry.get("profile"),
        "status": entry.get("status"),
        "checked_at": entry.get("checked_at"),
    }


def _bind(profile: str, session: recipes.Session, rebind: bool = False) -> tuple[str, str]:
    """Map a session to a platform status and a message, binding the profile on its first signed-in check."""
    if session.state in ("needs_login", "checkpoint"):
        detail = "a checkpoint or challenge is open; the owner clears it in the browser" \
            if session.state == "checkpoint" else "signed out"
        return "needs_login", detail
    if session.state != "ok":
        return "unknown", session.detail or "the session could not be read"
    bound = profiles.read_identity(profile).get("user_id")
    if bound and bound != session.user_id and not rebind:
        return "needs_login", (f"the profile is signed in as another user ({session.user_id}); it is bound to "
                               f"{bound}. Sign in as the account's own user, or pass --rebind to `account login` "
                               "if this is the right account")
    if bound != session.user_id:
        profiles.write_identity(profile, session.user_id)
    return "ok", "signed in"


def _set_status(account: model.Account, platform: str, status: str) -> None:
    current = profiles.find(account, platform) or {}
    changes = {"checked_at": files.utc_now()}
    if current.get("status") != "paused":
        changes["status"] = status
    profiles.update(account, platform, **changes)


# ---------------------------------------------------------------- account login, check, open


def login(account_ref: str, platform_name: str, handle: str | None = None,
          timeout_minutes: float = LOGIN_TIMEOUT_MINUTES, rebind: bool = False) -> dict:
    account = profiles.account_for(account_ref)
    platform = platforms.get(platform_name)
    entry, created, warnings = profiles.ensure(account, platform.name, handle)
    recipe = recipes.RECIPES[platform.name]
    profile = profiles.profile_name(account, entry)
    closed = timed_out = False
    with browser.open_profile(profile) as session:
        page = session.page()
        browser.goto(page, platform.home)
        state = recipes.safe_session(recipe, session.context, page)
        if state.state != "ok":
            browser.goto(page, platform.login_url)
        deadline = time.monotonic() + max(timeout_minutes, 0) * 60
        while state.state != "ok":
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                timed_out = True
                break
            if session.wait_closed(min(2.0, remaining)):
                closed = True
                break
            current = session.current_page()
            if current is None:
                closed = True
                break
            # Sign-in pages never show the signed-in marker; probe only once the platform has moved on.
            if recipe.is_login_page(current.url):
                continue
            state = recipes.safe_session(recipe, session.context, current)
        status, detail = _bind(profile, state, rebind)
    if status == "unknown":
        status = "needs_login"
    _set_status(account, platform.name, status)
    entry = profiles.find(account, platform.name) or entry
    return {
        **_entry_summary(account, entry),
        "created": created,
        "session": state.state,
        "signed_in": status == "ok",
        "detail": detail,
        "closed": closed,
        "timed_out": timed_out,
        "warnings": warnings,
    }


def _check_one(account: model.Account, entry: dict) -> dict:
    platform = platforms.get(str(entry.get("platform") or ""))
    recipe = recipes.RECIPES[platform.name]
    profile = profiles.profile_name(account, entry)
    with browser.open_profile(profile) as session:
        page = session.page()
        error = browser.goto(page, platform.home)
        state = recipes.Session("unknown", None, f"could not open {platform.home}: {error}") if error \
            else recipes.safe_session(recipe, session.context, page)
        status, detail = _bind(profile, state)
    _set_status(account, platform.name, status)
    return {**_entry_summary(account, profiles.find(account, platform.name) or entry), "session": state.state,
            "detail": detail}


def check(account_ref: str, platform_name: str | None = None) -> dict:
    account = profiles.account_for(account_ref)
    targets = [profiles.require(account, platform_name)] if platform_name else profiles.entries(account)
    if not targets:
        raise RalphyError("E_PLATFORM_NOT_FOUND", f"{account.slug} has no platforms in account.md",
                          f"Add one: `ralphy account login {account.slug} <platform> --handle @<handle>`.")
    results = []
    for entry in targets:
        if entry.get("status") == "paused":
            results.append({**_entry_summary(account, entry), "session": None, "detail": "paused; not checked"})
            continue
        try:
            results.append(_check_one(account, entry))
        except RalphyError as exc:
            if exc.code == "E_DEP_MISSING":
                raise
            results.append({**_entry_summary(account, entry), "session": None, "detail": exc.message,
                            "error": exc.code})
        except Exception as exc:  # noqa: BLE001 - one broken platform must not hide the others
            results.append({**_entry_summary(account, entry), "session": None, "detail": browser.first_line(exc),
                            "error": "E_BROWSER_FAILED"})
    return {"account": account.slug, "results": results}


def open_account(account_ref: str, platform_name: str, url: str | None = None) -> dict:
    account = profiles.account_for(account_ref)
    platform = platforms.get(platform_name)
    entry = profiles.require(account, platform.name)
    profile = profiles.profile_name(account, entry)
    target = url or platform.profile_url(entry.get("handle"))
    with browser.open_profile(profile) as session:
        error = browser.goto(session.page(), target)
        session.wait_closed(None)
    return {**_entry_summary(account, entry), "url": target, "closed": True, "error": error}


def set_paused(account_ref: str, platform_name: str, paused: bool) -> dict:
    account = profiles.account_for(account_ref)
    platform = platforms.get(platform_name)
    profiles.require(account, platform.name)
    entry = profiles.update(account, platform.name, status="paused" if paused else "unknown")
    return _entry_summary(account, entry)


# ---------------------------------------------------------------- post run


def upload_copy(post_id: str, render: Path) -> Path:
    """A fresh clone of `render` at `RALPHY_CACHE_DIR/post/<post-id>.mp4`: the stable file an upload reads."""
    folder = paths.cache_dir() / "post"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{post_id}.mp4"
    temp = folder / f".{post_id}.{secrets.token_hex(3)}.mp4"
    try:
        files.clone_file(render, temp, allow_hardlink=False)
        temp.replace(target)
    finally:
        with contextlib.suppress(OSError):
            temp.unlink()
    return target


def cover_copy(post_id: str, cover: Path | None) -> Path | None:
    """A clone of the video's cover next to the upload copy, so an edit during the upload cannot change it."""
    if cover is None:
        return None
    folder = paths.cache_dir() / "post"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{post_id}.cover{cover.suffix.lower()}"
    files.clone_file(cover, target, allow_hardlink=False)
    return target


def _base(account: model.Account, row: dict) -> dict:
    return {"id": row.get("id"), "account": account.slug, "platform": row.get("platform"),
            "handle": row.get("handle"), "content": row.get("content")}


def _recover_stale(account: model.Account, platform: str, current: str) -> list[str]:
    """Under the profile lock no other run uses this profile, so an `uploading` row of it belongs to a run
    that died; `unknown` is written before every final click, so that run never clicked."""
    recovered: list[str] = []

    def change(rows: list[dict]) -> None:
        for row in rows:
            if row.get("platform") == platform and row.get("status") == "uploading" and row.get("id") != current:
                row["status"] = "failed"
                row["error"] = (f"a previous run stopped before the final click; `ralphy post run {row['id']}` "
                                "retries it")
                recovered.append(row["id"])

    files.mutate_csv(account.posts_path, model.POSTS_COLUMNS, change)
    return recovered


def _upload(account: model.Account, row: dict, entry: dict, platform: platforms.Platform, recipe: recipes.Recipe,
            profile: str, session: browser.BrowserSession, video: Path, cover: Path | None = None) -> dict:
    post_id = row["id"]
    result = {**_base(account, row), "browser": True}
    recovered = _recover_stale(account, platform.name, post_id)
    if recovered:
        result["recovered"] = recovered
    posts.transition(account, post_id, ("approved", *posts.RETRYABLE), {"status": "uploading", "error": ""})
    submitted = False
    page = None
    task = None
    where = f"`ralphy account open {account.slug} {platform.name}`"

    def settle(status: str, error: str = "", **changes) -> dict:
        evidence = browser.capture(page, post_id, status) if page is not None else None
        if evidence and status != "published":
            error = f"{error} (evidence: {evidence})"
        expected = ("unknown",) if submitted else ("uploading",)
        posts.transition(account, post_id, expected, {"status": status, "error": error, **changes})
        result.update(status=status, error=error or None, evidence=evidence, **changes)
        if task is not None and task.notes:
            result["notes"] = list(task.notes)
        return result

    def on_submit() -> None:
        nonlocal submitted
        if submitted:
            raise recipes.StepError("submit", "the recipe tried to submit twice")
        posts.transition(account, post_id, ("uploading",),
                         {"status": "unknown", "error": "the final click was sent; the outcome is not confirmed yet"})
        submitted = True

    try:
        page = session.page()
        error = browser.goto(page, platform.home)
        if error:
            return settle("failed", f"open-home: {error}")
        state = recipes.safe_session(recipe, session.context, page)
        status, detail = _bind(profile, state)
        _set_status(account, platform.name, status)
        if status == "needs_login":
            return settle("needs_login", f"session: {detail}; the owner signs in with `ralphy account login "
                                         f"{account.slug} {platform.name}`")
        if status != "ok":
            return settle("failed", f"session: could not tell whether {entry.get('handle')} is signed in ({detail}); "
                                    f"look with {where}")
        task = recipes.UploadTask(
            handle=platforms.bare_handle(entry.get("handle")),
            video=video,
            caption=row.get("caption") or "",
            expected_user_id=state.user_id,
            on_submit=on_submit,
            cover=cover,
        )
        uploaded = recipe.upload(page, task)
        if not submitted:
            return settle("failed", "upload: the recipe returned without the final click")
        if not uploaded.url or not platform.owns_url(uploaded.url):
            return settle("unknown", f"confirm: the recipe returned no {platform.label} URL ({uploaded.url!r}); "
                                     f"check {platform.profile_url(entry.get('handle'))} with {where}")
        return settle("published", "", url=uploaded.url, posted_at=posts.stamp(posts.now_utc()))
    except KeyboardInterrupt:
        if submitted:
            settle("unknown", f"interrupted after the final click; check with {where}, then `ralphy post resolve "
                              f"{post_id} --url <url>` or `--failed`")
        else:
            settle("failed", "interrupted before the final click")
        raise
    except Exception as exc:  # noqa: BLE001 - every failure ends in a status, never a crash
        stage, message = (exc.stage, exc.message) if isinstance(exc, recipes.StepError) else \
            ("after-submit" if submitted else "upload", browser.first_line(exc))
        if submitted:
            return settle("unknown", f"{stage}: {message}. The post may exist: check "
                                     f"{platform.profile_url(entry.get('handle'))} with {where}, then `ralphy post "
                                     f"resolve {post_id} --url <url>` or `--failed`")
        return settle("failed", f"{stage}: {message}")


def run_one(account: model.Account, row: dict) -> dict:
    """Run one row; returns its result. Raises only for problems that stop every post (no Chrome, ...)."""
    post_id = row["id"]
    base = _base(account, row)

    def skip(reason: str) -> dict:
        return {**base, "status": row.get("status"), "skipped": reason}

    def fail(reason: str) -> dict:
        posts.transition(account, post_id, ("approved", *posts.RETRYABLE), {"status": "failed", "error": reason})
        return {**base, "status": "failed", "error": reason}

    try:
        platform = platforms.get(row.get("platform") or "")
    except RalphyError as exc:
        return fail(exc.message)
    account = model.get_account(account.slug)
    entry = profiles.find(account, platform.name)
    if entry is None:
        return fail(f"{account.slug} has no {platform.name} platform in account.md")
    if entry.get("status") == "paused":
        return skip(f"{account.slug}:{platform.name} is paused (`ralphy account resume {account.slug} "
                    f"{platform.name}`)")
    blocker = next((r for r in posts.read(account) if r.get("platform") == platform.name
                    and r.get("status") == "unknown" and r.get("id") != post_id), None)
    if blocker:
        return skip(f"{blocker['id']} on {account.slug}:{platform.name} is unknown; check it and settle it with "
                    f"`ralphy post resolve {blocker['id']} --url <url>` or `--failed` first")
    if not platforms.same_handle(entry.get("handle"), row.get("handle")):
        return fail(f"account.md now has {entry.get('handle')} for {platform.name}; the post was planned for "
                    f"{row.get('handle')}. Cancel it and plan again")
    render = paths.home() / (row.get("render") or "")
    if not row.get("render") or not render.is_file():
        return fail(f"the render {row.get('render') or '(none)'} is missing; plan the post again")
    caption_errors, _ = checks.check_caption(platform, row.get("caption") or "")
    if caption_errors:
        return fail("; ".join(caption_errors))
    if not platform.scripted_upload:
        return fail(f"{platform.label} has no scripted upload; post it by hand in `ralphy account open "
                    f"{account.slug} {platform.name}`, then `ralphy post resolve {post_id} --url <post-url>`")
    recipe = recipes.RECIPES[platform.name]
    profile = profiles.profile_name(account, entry)
    video = upload_copy(post_id, render)
    cover = None
    try:
        cover = cover_copy(post_id, model.cover_file(render.parent))
        try:
            media_errors, _ = checks.check_media(platform, checks.probe(video))
        except RalphyError as exc:
            if exc.code == "E_DEP_MISSING":
                raise
            media_errors = [exc.message]
        if media_errors:
            return fail("; ".join(media_errors) + "; render again and plan the post again")
        with browser.open_profile(profile) as session:
            return _upload(account, row, entry, platform, recipe, profile, session, video, cover)
    except RalphyError as exc:
        if exc.code == "E_PROFILE_BUSY":
            return skip(exc.message)
        raise
    finally:
        for leftover in (video, cover):
            if leftover is not None:
                with contextlib.suppress(OSError):
                    leftover.unlink()


def run(post_id: str | None = None, due: bool = False, account: str | None = None) -> dict:
    if bool(post_id) == bool(due):
        raise RalphyError("E_USAGE", "Name one post or pass --due", "ralphy post run <post-id> | --due [--account a]")
    now = posts.now_utc()
    if post_id:
        acct, row = posts.find(post_id)
        status = row.get("status") or ""
        if status not in ("approved", *posts.RETRYABLE):
            raise posts.StateError(row["id"], status, ("approved",))
        if status == "approved" and not posts.is_due(row, now):
            raise RalphyError("E_POST_NOT_DUE", f"{row['id']} is scheduled for {row.get('scheduled_at')}",
                              "`ralphy post run --due` posts it after that time. To post now, cancel it and plan it "
                              "again without --at.")
        return _summary([run_one(acct, row)], 1)
    pool = [profiles.account_for(account)] if account else posts.accounts()
    queue = [(a, r) for a in pool for r in posts.read(a) if r.get("status") == "approved" and posts.is_due(r, now)]
    queue.sort(key=lambda item: item[1].get("scheduled_at") or "")
    results: list[dict] = []
    stopped: dict[str, str] = {}
    halted = None
    for acct, row in queue:
        key = f"{acct.slug}:{row.get('platform')}"
        if halted:
            results.append({**_base(acct, row), "status": row.get("status"), "skipped": halted})
            continue
        if key in stopped:
            results.append({**_base(acct, row), "status": row.get("status"), "skipped": stopped[key]})
            continue
        try:
            result = run_one(acct, row)
        except RalphyError as exc:
            halted = f"{exc.message} ({exc.hint})" if exc.hint else exc.message
            results.append({**_base(acct, row), "status": row.get("status"), "skipped": halted})
            continue
        results.append(result)
        if result.get("browser") and result.get("status") != "published":
            stopped[key] = (f"{result['id']} on {key} ended {result['status']} in this run; not trying the same "
                            "profile again")
    return _summary(results, len(queue), halted)


def _summary(results: list[dict], due: int, halted: str | None = None) -> dict:
    counts = Counter(r["status"] for r in results if not r.get("skipped"))
    data = {"results": results, "due": due, "counts": dict(counts),
            "skipped": sum(1 for r in results if r.get("skipped"))}
    if halted:
        data["halted"] = halted
    return data
