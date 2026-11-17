"""`posts.csv` rows: plan, approve, cancel, resolve, list, and the status transitions `post run` makes.

Statuses: `planned` -> `approved` -> `uploading` -> `published` | `unknown` | `failed` | `needs_login`, or
`cancelled`. Every change is a compare-and-set under the table's lock (`transition`): it applies only when
the row is still in one of the expected statuses, so two commands never both move one row.

Dedupe: a row with the same content, platform and handle in `approved`, `uploading`, `published` or
`unknown` blocks a new one unless `--again`.
"""

from __future__ import annotations

import datetime as dt
import re
import secrets
from pathlib import Path

from .. import files, hyperframes, model, paths
from ..errors import RalphyError
from . import checks, platforms, profiles

ACTIVE = ("approved", "uploading", "published", "unknown")
RETRYABLE = ("failed", "needs_login")  # stopped before the final click; `post run <id>` may retry them
CANCELLABLE = ("planned", "approved", "failed", "needs_login")
_ID = re.compile(r"^p_[0-9a-f]{8}$")


class StateError(RalphyError):
    def __init__(self, post_id: str, status: str, expected: tuple[str, ...], hint: str | None = None) -> None:
        super().__init__("E_POST_STATE", f"{post_id} is {status or 'empty'}; expected {' or '.join(expected)}",
                         hint or state_hint(post_id, status))
        self.status = status


def state_hint(post_id: str, status: str) -> str:
    return {
        "planned": f"Approve it first, after the owner's go: `ralphy post approve {post_id}`.",
        "approved": f"It waits for `ralphy post run {post_id}` (or `--due`).",
        "uploading": "A run is uploading it now; wait, then `ralphy post list`.",
        "published": "It is already published.",
        "unknown": (f"Check the profile first (`ralphy account open ...`), then `ralphy post resolve {post_id} "
                    "--url <url>` or `--failed`."),
        "failed": f"Fix the cause in `error`, then `ralphy post run {post_id}` retries it.",
        "needs_login": f"Sign in with `ralphy account login ...`, then `ralphy post run {post_id}`.",
        "cancelled": "It was cancelled; plan it again.",
    }.get(status, "See `ralphy post list`.")


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def stamp(when: dt.datetime) -> str:
    return when.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(value: str | None) -> dt.datetime | None:
    text = (value or "").strip()
    if not text:
        return None
    if text[-1] in "Zz":
        text = text[:-1] + "+00:00"
    try:
        when = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    return when if when.tzinfo else None


def parse_at(value: str) -> str:
    """`--at` as a UTC timestamp; a time without a zone is refused rather than guessed."""
    hint = "Use ISO 8601 with a zone, e.g. 2026-11-18T18:00:00+03:00 or 2026-11-18T15:00:00Z."
    text = (value or "").strip()
    try:
        when = dt.datetime.fromisoformat(text[:-1] + "+00:00" if text[-1:] in ("Z", "z") else text)
    except ValueError:
        raise RalphyError("E_BAD_TIME", f"'{value}' is not an ISO date-time", hint) from None
    if when.tzinfo is None:
        raise RalphyError("E_BAD_TIME", f"'{value}' has no time zone", hint)
    return stamp(when)


def is_due(row: dict, now: dt.datetime) -> bool:
    if not (row.get("scheduled_at") or "").strip():
        return True
    when = parse_time(row.get("scheduled_at"))
    return when is not None and when <= now


# ---------------------------------------------------------------- reading


def accounts() -> list[model.Account]:
    return model.list_accounts()


def read(account: model.Account) -> list[dict]:
    return files.read_csv(account.posts_path)


def public(row: dict, account: model.Account) -> dict:
    return model.post_row(row, account.slug)


def find(post_id: str) -> tuple[model.Account, dict]:
    key = (post_id or "").strip().lower()
    if not _ID.match(key):
        raise RalphyError("E_USAGE", f"'{post_id}' is not a post id", "Post ids look like p_1a2b3c4d.")
    for account in accounts():
        for row in read(account):
            if row.get("id") == key:
                return account, row
    raise RalphyError("E_POST_NOT_FOUND", f"No post {key}", "List posts with `ralphy post list`.")


def list_posts(account: str | None = None, statuses: list[str] | None = None) -> list[dict]:
    pool = [profiles.account_for(account)] if account else accounts()
    wanted = set(statuses or [])
    unknown = wanted - set(model.POST_STATUSES)
    if unknown:
        raise RalphyError("E_USAGE", f"Unknown status {', '.join(sorted(unknown))}",
                          f"Statuses: {', '.join(model.POST_STATUSES)}.")
    rows = []
    for item in pool:
        rows.extend(public(r, item) for r in read(item) if not wanted or r.get("status") in wanted)
    return rows


def transition(account: model.Account, post_id: str, expected: tuple[str, ...], changes: dict) -> dict:
    """Apply `changes` to the row when its status is one of `expected`; raises `StateError` otherwise."""
    outcome: dict = {}

    def change(rows: list[dict]) -> None:
        for row in rows:
            if row.get("id") == post_id:
                outcome["status"] = row.get("status") or ""
                if outcome["status"] in expected:
                    row.update(changes)
                    outcome["row"] = dict(row)
                return

    files.mutate_csv(account.posts_path, model.POSTS_COLUMNS, change)
    if "row" in outcome:
        return outcome["row"]
    if "status" not in outcome:
        raise RalphyError("E_POST_NOT_FOUND", f"No post {post_id} in {account.posts_path}")
    raise StateError(post_id, outcome["status"], expected)


# ---------------------------------------------------------------- plan


def parse_targets(values: list[str]) -> list[tuple[str, str]]:
    targets: list[tuple[str, str]] = []
    for value in values or []:
        for part in value.split(","):
            part = part.strip()
            if not part:
                continue
            account, sep, platform = part.rpartition(":")
            if not sep or not account.strip() or not platform.strip():
                raise RalphyError("E_USAGE", f"'{part}' is not <account>:<platform>",
                                  "Example: --to ui-effects:tiktok,ui-effects:youtube")
            target = (account.strip(), platforms.get(platform).name)
            if target not in targets:
                targets.append(target)
    if not targets:
        raise RalphyError("E_USAGE", "No targets", "Pass --to <account>:<platform>[,<account>:<platform>...].")
    return targets


def _same_post(row: dict, content_id: str, platform: str, handle: str | None) -> bool:
    return (row.get("content") == content_id and row.get("platform") == platform
            and platforms.same_handle(row.get("handle"), handle))


def _new_id(taken: set[str]) -> str:
    while True:
        candidate = f"p_{secrets.token_hex(4)}"
        if candidate not in taken:
            taken.add(candidate)
            return candidate


def _relative(path: Path) -> str:
    try:
        return path.relative_to(paths.home()).as_posix()
    except ValueError:
        return str(path)


def resolve_targets(targets: list[tuple[str, str]]) -> tuple[list[tuple[model.Account, dict, platforms.Platform]],
                                                             list[str]]:
    resolved = []
    problems: list[str] = []
    warnings: list[str] = []
    for account_ref, name in targets:
        account = profiles.account_for(account_ref)
        platform = platforms.get(name)
        label = f"{account.slug}:{name}"
        entry = profiles.find(account, name)
        if entry is None:
            problems.append(f"{label} is not in account.md (`ralphy account login {account.slug} {name} "
                            "--handle @<handle>`)")
            continue
        status = entry.get("status")
        if status == "paused":
            problems.append(f"{label} is paused (`ralphy account resume {account.slug} {name}`)")
        if not entry.get("handle"):
            problems.append(f"{label} has no handle (`ralphy account login {account.slug} {name} --handle @<h>`)")
        if status == "needs_login":
            warnings.append(f"{label} is signed out; the owner signs in with `ralphy account login {account.slug} "
                            f"{name}` before `post run`")
        elif status not in ("ok", "paused"):
            warnings.append(f"{label} session is {status or 'unknown'}; check it with `ralphy account check "
                            f"{account.slug} {name}`")
        if not platform.scripted_upload:
            warnings.append(f"{platform.label} has no scripted upload: `post run` stops before posting; the owner "
                            f"posts by hand in `ralphy account open {account.slug} {name}`, then `ralphy post "
                            "resolve <id> --url <url>`")
        resolved.append((account, entry, platform))
    if problems:
        raise RalphyError("E_POST_TARGET", "; ".join(problems), "Fix the targets in account.md, then plan again.")
    return resolved, warnings


def plan(content_ref: str, to: list[str], at: str | None = None, caption: str | None = None,
         again: bool = False) -> dict:
    targets = parse_targets(to)
    scheduled = parse_at(at) if at else ""
    content = model.resolve_content(content_ref)
    meta, _ = content.notes()
    resolved, warnings = resolve_targets(targets)
    render = content.render_file
    # A missing or stale render.mp4 is rendered first: local and free, and the post must show the working tree.
    rendered = hyperframes.ensure_render(content)
    if rendered:
        warnings.extend(rendered.get("warnings") or [])
    info = checks.probe(render)
    text = checks.normalize_caption(caption if caption is not None else str(meta.get("caption") or ""))

    errors: list[str] = []
    for _account, _entry, platform in resolved:
        for found_errors, found_warnings in (checks.check_media(platform, info), checks.check_caption(platform, text)):
            errors.extend(msg for msg in found_errors if msg not in errors)
            warnings.extend(msg for msg in found_warnings if msg not in warnings)
    if errors:
        raise RalphyError("E_POST_CHECK", "; ".join(errors),
                          "Fix the video (edit the working tree, `ralphy render`) or the caption, then plan "
                          "again.")

    blocked: list[str] = []
    for account, entry, platform in resolved:
        for row in read(account):
            if not _same_post(row, content.id, platform.name, entry.get("handle")):
                continue
            if row.get("status") in ACTIVE:
                blocked.append(f"{account.slug}:{platform.name} {entry.get('handle')} already has {row['id']} "
                               f"({row['status']})")
            elif row.get("status") == "planned":
                warnings.append(f"{account.slug}:{platform.name} already has {row['id']} planned")
    if blocked and not again:
        raise RalphyError("E_POST_DUPLICATE", "; ".join(blocked),
                          "Pass --again only when the owner wants this video posted there a second time.")

    cover = model.cover_file(content.path)
    if cover is None:
        warnings.append(f"{content.id} has no cover.jpg; each platform picks a frame for the cover")
    if scheduled and parse_time(scheduled) <= now_utc():
        warnings.append(f"--at {scheduled} is in the past; the next `ralphy post run --due` posts it")
    taken = {r.get("id") for a in accounts() for r in read(a)}
    created: list[dict] = []
    for account, entry, platform in resolved:
        row = {
            "id": _new_id(taken),
            "content": content.id,
            "platform": platform.name,
            "handle": entry.get("handle"),
            "status": "planned",
            "scheduled_at": scheduled,
            "posted_at": "",
            "url": "",
            "render": _relative(render),
            "caption": text,
            "error": "",
        }

        def change(rows: list[dict], row=row, platform=platform, entry=entry, account=account) -> None:
            clash = next((r for r in rows if r.get("status") in ACTIVE
                          and _same_post(r, content.id, platform.name, entry.get("handle"))), None)
            if clash and not again:
                raise RalphyError("E_POST_DUPLICATE", f"{account.slug}:{platform.name} already has {clash['id']} "
                                  f"({clash['status']})", "Pass --again for a deliberate repost.")
            rows.append(row)

        files.mutate_csv(account.posts_path, model.POSTS_COLUMNS, change)
        created.append(public(row, account))
    return {
        "content": content.id,
        "render": _relative(render),
        "rendered": rendered is not None,
        "cover": _relative(cover) if cover else None,
        "probe": info,
        "posts": created,
        "warnings": warnings,
    }


# ---------------------------------------------------------------- approve, cancel, resolve


def approve(ids: list[str], all_planned: bool = False, account: str | None = None) -> dict:
    if all_planned:
        if not account:
            raise RalphyError("E_USAGE", "--all needs --account", "Example: ralphy post approve --all --account a")
        acct = profiles.account_for(account)
        targets = [(acct, r) for r in read(acct) if r.get("status") == "planned"]
    else:
        if not ids:
            raise RalphyError("E_USAGE", "Name the posts to approve", "ralphy post approve <post-id> [...]")
        targets = [find(pid) for pid in dict.fromkeys(ids)]
        for _acct, row in targets:
            if row.get("status") not in ("planned", "approved"):
                raise StateError(row["id"], row.get("status") or "", ("planned",))
    approved, already = [], []
    for acct, row in targets:
        if row.get("status") == "approved":
            already.append(row["id"])
            continue
        approved.append(public(transition(acct, row["id"], ("planned",), {"status": "approved", "error": ""}), acct))
    return {"approved": approved, "already_approved": already}


def cancel(post_id: str) -> dict:
    account, row = find(post_id)
    return {"post": public(transition(account, row["id"], CANCELLABLE, {"status": "cancelled"}), account)}


def resolve(post_id: str, url: str | None = None, failed: bool = False) -> dict:
    account, row = find(post_id)
    if bool(url) == bool(failed):
        raise RalphyError("E_USAGE", "Pass exactly one of --url or --failed",
                          "--url <post-url> when the post exists, --failed when it does not.")
    if failed:
        changes = {"status": "failed", "error": "checked by hand: the post does not exist"}
        return {"post": public(transition(account, row["id"], ("unknown",), changes), account)}
    platform = platforms.get(row.get("platform") or "")
    link = url.strip()
    if not link.startswith("https://") or not platform.owns_url(link):
        raise RalphyError("E_BAD_URL", f"'{url}' is not a {platform.label} post URL",
                          f"Pass the https link of the post on {', '.join(platform.hosts)}.")
    changes = {"status": "published", "url": link, "posted_at": stamp(now_utc()), "error": ""}
    return {"post": public(transition(account, row["id"], ("unknown", *RETRYABLE), changes), account)}
