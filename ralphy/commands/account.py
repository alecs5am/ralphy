"""`ralphy account new|list|show|login|check|open|pause|resume`: Accounts are folders with account.md.

Other modules add subcommands (`login`, `check`, `open`, `pause`, `resume`) by exposing
`register_account(subparsers)`, which this module calls for every verb module that has one;
see `ralphy.commands.extensions`.
"""

from __future__ import annotations

from collections import Counter

from .. import model
from . import Output, extensions


def account_summary(account: model.Account) -> dict:
    meta = account.meta
    return {
        "slug": account.slug,
        "name": account.name,
        "path": str(account.path),
        "niche": meta.get("niche"),
        "schedule": meta.get("schedule"),
        "platforms": meta.get("platforms") or [],
        "videos": len(model.list_content(account.slug, home=account.path.parent)),
        "created_at": meta.get("created_at"),
    }


def account_detail(account: model.Account) -> dict:
    content = model.list_content(account.slug, home=account.path.parent)
    posts = model.read_posts(account)
    stats = model.read_stats(account)
    rendered = sum(1 for item in content if item.render_file.is_file())
    refs_dir = account.path / model.REFS_DIR
    refs = sorted(p.name for p in refs_dir.iterdir() if p.is_dir()) if refs_dir.is_dir() else []
    return {
        "slug": account.slug,
        "name": account.name,
        "path": str(account.path),
        "meta": account.meta,
        "body": account.body,
        "counts": {
            "videos": len(content),
            "rendered": rendered,
            "refs": len(refs),
            "posts": dict(Counter(p.get("status") or "unknown" for p in posts)),
            "stats_rows": len(stats),
        },
        "videos": [item.id for item in content],
        "refs": refs,
        "latest_stats": model.latest_stats(stats),
    }


def run_new(args) -> Output:
    account = model.create_account(args.name, niche=args.niche, schedule=args.schedule)
    data = {"account": account_summary(account)}
    return Output(data, f"Created account {account.slug} at {account.path}")


def run_list(args) -> Output:
    accounts = [account_summary(a) for a in model.list_accounts()]
    if not accounts:
        text = "No accounts yet. Create one with `ralphy account new \"<name>\"`."
    else:
        width = max(len(a["slug"]) for a in accounts)
        text = "\n".join(
            f"{a['slug']:<{width}}  {a['videos']:>3} videos  {a['name']}"
            + (f"  ({', '.join(p.get('platform', '?') for p in a['platforms'])})" if a["platforms"] else "")
            for a in accounts
        )
    return Output({"accounts": accounts}, text)


def run_show(args) -> Output:
    account = model.get_account(args.account)
    detail = account_detail(account)
    counts = detail["counts"]
    lines = [f"{detail['name']} ({detail['slug']})", str(account.path)]
    for key in ("niche", "schedule"):
        if account.meta.get(key):
            lines.append(f"{key}: {account.meta[key]}")
    for platform in account.meta.get("platforms") or []:
        lines.append(f"platform: {platform.get('platform')} {platform.get('handle', '')} [{platform.get('status')}]")
    posts = ", ".join(f"{n} {s}" for s, n in sorted(counts["posts"].items())) or "none"
    lines.append(f"videos: {counts['videos']} ({counts['rendered']} rendered), refs: {counts['refs']}, posts: {posts}")
    for row in detail["latest_stats"][:5]:
        lines.append(f"  {row.get('platform')} {row.get('url') or row.get('content')}: {row.get('views')} views")
    return Output({"account": detail}, "\n".join(lines))


def register(subparsers) -> None:
    parser = subparsers.add_parser(
        "account", help="Accounts: new, list, show, login, check, open, pause, resume", description=__doc__
    )
    sub = parser.add_subparsers(dest="account_command", metavar="<command>")

    new = sub.add_parser("new", help="create an account folder with account.md")
    new.add_argument("name", help="display name, e.g. \"UI Effects\"; the folder is its kebab-case slug")
    new.add_argument("--niche", help="trend niche slug or free text")
    new.add_argument("--schedule", help="free text, e.g. \"daily 18:00 Europe/Moscow\"")
    new.set_defaults(handler=run_new)

    listing = sub.add_parser("list", help="list accounts")
    listing.set_defaults(handler=run_list)

    show = sub.add_parser("show", help="frontmatter, body, counts, posts by status, latest stats")
    show.add_argument("account", help="account slug")
    show.set_defaults(handler=run_show)

    for extend in extensions("account"):
        extend(sub)
