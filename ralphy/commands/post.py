"""`ralphy post plan|approve|run|list|cancel|resolve|timer`: posts to the owner's own accounts, one row per post in
the target account's posts.csv.

Statuses: planned -> approved -> uploading -> published | unknown | failed | needs_login, or cancelled.
`plan` never posts. `approve` records the owner's go; `run` posts approved rows from each account's own
browser profile. `unknown` is written right before the irreversible click and is never retried: check the
profile, then `resolve --url` or `resolve --failed`.

Scheduled posts (`plan --at`) go out when something runs `post run --due` after their time: `post timer on`
installs a macOS LaunchAgent that does it every 10 minutes (`off`, `status`).

Approval: there is no `--yes` flag. In Claude Code the PreToolUse hook (hooks/confirm-post.sh) asks the
owner before every `post approve` and `post run`, showing what will be posted where; in other agents the
`ralphy-publish` skill's rule applies (no approve or run without the owner's go). A `-p` session cannot answer
the prompt, so the hook blocks posting there.
"""

from __future__ import annotations

from pathlib import Path

from ..errors import RalphyError
from ..post import posts
from . import Output


def _line(row: dict) -> str:
    when = row.get("scheduled_at") or "on run"
    text = (f"{row['id']}  {row.get('status') or '?':<11} {row.get('account')}:{row.get('platform')} "
            f"{row.get('handle') or ''}  {row.get('content')}  {when}")
    if row.get("url"):
        text += f"\n    {row['url']}"
    if row.get("error"):
        text += f"\n    {row['error']}"
    return text


def run_plan(args) -> Output:
    if args.caption is not None and args.caption_file is not None:
        raise RalphyError("E_USAGE", "Pass --caption or --caption-file, not both")
    caption = args.caption
    if args.caption_file is not None:
        try:
            caption = Path(args.caption_file).expanduser().read_text(encoding="utf-8")
        except OSError as exc:
            raise RalphyError("E_NOT_FOUND", f"Cannot read {args.caption_file}: {exc.strerror}") from None
    data = posts.plan(args.id, args.to, at=args.at, caption=caption, again=args.again)
    rendered = " (rendered first)" if data["rendered"] else ""
    lines = [f"Planned {len(data['posts'])} post(s) of {data['content']} ({data['render']}{rendered}):"]
    lines += [_line(row) for row in data["posts"]]
    if data.get("cover"):
        lines.append(f"Cover: {data['cover']}")
    lines += [f"Warning: {w}" for w in data.get("warnings") or []]
    ids = " ".join(row["id"] for row in data["posts"])
    lines.append(f"Nothing is posted yet. After the owner's go: ralphy post approve {ids}")
    return Output(data, "\n".join(lines))


def run_approve(args) -> Output:
    data = posts.approve(args.ids, all_planned=args.all, account=args.account)
    lines = [_line(row) for row in data["approved"]]
    lines += [f"{pid} was already approved" for pid in data["already_approved"]]
    if not lines:
        lines = ["Nothing to approve."]
    else:
        lines.append("Post with `ralphy post run <post-id>` or `ralphy post run --due`.")
    return Output(data, "\n".join(lines))


def run_run(args) -> Output:
    from ..post import run as runner

    data = runner.run(args.id, due=args.due, account=args.account)
    if not data["results"]:
        return Output(data, "Nothing approved is due.")
    lines = []
    for result in data["results"]:
        if result.get("skipped"):
            lines.append(f"{result['id']}  skipped     {result['account']}:{result['platform']}  {result['skipped']}")
            continue
        lines.append(f"{result['id']}  {result['status']:<11} {result['account']}:{result['platform']} "
                     f"{result.get('handle') or ''}  {result.get('url') or result.get('error') or ''}")
        lines += [f"    note: {note}" for note in result.get("notes") or []]
    if data.get("halted"):
        lines.append(f"Stopped: {data['halted']}")
    return Output(data, "\n".join(lines))


def run_list(args) -> Output:
    statuses = [s.strip() for s in (args.status or "").split(",") if s.strip()]
    rows = posts.list_posts(args.account, statuses)
    return Output({"posts": rows}, "\n".join(_line(r) for r in rows) or "No posts.")


def run_cancel(args) -> Output:
    data = posts.cancel(args.id)
    return Output(data, _line(data["post"]))


def run_resolve(args) -> Output:
    data = posts.resolve(args.id, url=args.url, failed=args.failed)
    return Output(data, _line(data["post"]))


def run_timer(args) -> Output:
    from ..post import timer

    if args.action == "on":
        data = timer.on(args.every)
    elif args.action == "off":
        data = timer.off()
    else:
        data = timer.status()
    if not data["installed"]:
        text = "The posting timer is off." + (" (removed)" if data.get("removed") else "")
    else:
        text = (f"The posting timer runs `post run --due` every {data.get('every_minutes')} min "
                f"({'loaded' if data['loaded'] else 'NOT loaded'}): {data.get('program')}")
        if not data.get("program_exists"):
            text += "\n    the launcher is missing; run `ralphy post timer on` again from the current install"
    if data.get("log_tail"):
        text += f"\nLog {data['log']}:\n" + "\n".join(f"    {line}" for line in data["log_tail"])
    return Output(data, text)


def register(subparsers) -> None:
    parser = subparsers.add_parser("post", help="plan, approve, run and settle posts", description=__doc__)
    sub = parser.add_subparsers(dest="post_command", metavar="<command>")

    plan = sub.add_parser("plan", help="add planned rows for render.mp4 (renders it first when missing or stale)")
    plan.add_argument("id", help="content id, e.g. ui-effects/001-type-charge")
    plan.add_argument("--to", action="append", required=True, metavar="ACCOUNT:PLATFORM[,...]",
                      help="targets, e.g. ui-effects:tiktok,ui-effects:youtube")
    plan.add_argument("--at", help="ISO date-time with a zone, e.g. 2026-11-18T18:00:00+03:00 (default: on run)")
    plan.add_argument("--caption", help="caption text (default: `caption` in notes.md)")
    plan.add_argument("--caption-file", help="read the caption from a file")
    plan.add_argument("--again", action="store_true", help="allow a repost of content already posted there")
    plan.set_defaults(handler=run_plan)

    approve = sub.add_parser("approve", help="record the owner's go: planned -> approved")
    approve.add_argument("ids", nargs="*", metavar="post-id")
    approve.add_argument("--all", action="store_true", help="every planned post of --account")
    approve.add_argument("--account", help="account slug (required with --all)")
    approve.set_defaults(handler=run_approve)

    run = sub.add_parser("run", help="post approved rows from each account's browser profile")
    run.add_argument("id", nargs="?", metavar="post-id", help="one post (approved, or failed/needs_login to retry)")
    run.add_argument("--due", action="store_true", help="every approved post whose time has come")
    run.add_argument("--account", help="with --due: only this account")
    run.set_defaults(handler=run_run)

    listing = sub.add_parser("list", help="posts across accounts")
    listing.add_argument("--account", help="account slug")
    listing.add_argument("--status", help="comma-separated statuses, e.g. planned,approved")
    listing.set_defaults(handler=run_list)

    cancel = sub.add_parser("cancel", help="planned, approved, failed or needs_login -> cancelled")
    cancel.add_argument("id", metavar="post-id")
    cancel.set_defaults(handler=run_cancel)

    resolve = sub.add_parser("resolve", help="settle a post after a manual check")
    resolve.add_argument("id", metavar="post-id")
    group = resolve.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="the post exists: its https URL (unknown, failed or needs_login -> published)")
    group.add_argument("--failed", action="store_true", help="the post does not exist (unknown -> failed)")
    resolve.set_defaults(handler=run_resolve)

    timer = sub.add_parser("timer", help="macOS: run `post run --due` on a schedule so planned times post")
    timer.add_argument("action", choices=("on", "off", "status"), nargs="?", default="status")
    timer.add_argument("--every", type=int, default=10, metavar="MINUTES", help="minutes between runs (default 10)")
    timer.set_defaults(handler=run_timer)
