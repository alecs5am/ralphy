"""`ralphy stats fetch <account> [--platform p]`: read the account's numbers from each signed-in platform.

Each platform is read from the account's own browser profile (a Chrome window opens and closes), from the
data the platform's pages load: views, likes, comments, shares and, where the platform shows them, saves.
One snapshot row per video is appended to the account's `stats.csv`; `content` is set for the videos that
are posts in `posts.csv`. The panel and `ralphy account show` read the newest row per video.
"""

from __future__ import annotations

from . import Output


def _number(value) -> str:
    return "-" if value is None or value == "" else f"{value:,}" if isinstance(value, int) else str(value)


def run_fetch(args) -> Output:
    from ..post import stats

    data = stats.fetch(args.account, args.platform)
    lines = []
    for result in data["results"]:
        head = f"{data['account']}:{result['platform']} {result.get('handle') or ''}"
        if result.get("skipped") or result.get("error"):
            lines.append(f"{head}  {result.get('skipped') or result.get('error')}")
            continue
        lines.append(f"{head}  {result['videos']} video(s), {result['ours']} posted by Ralphy")
        for row in result["rows"]:
            mark = row["content"] or "-"
            lines.append(f"    {_number(row['views']):>9} views {_number(row['likes']):>7} likes "
                         f"{_number(row['comments']):>5} comments  {mark}  {row['url']}")
    lines.append(f"Appended to {data['stats']}")
    return Output(data, "\n".join(lines))


def register(subparsers) -> None:
    parser = subparsers.add_parser("stats", help="read views, likes and comments from the account's platforms",
                                   description=__doc__)
    sub = parser.add_subparsers(dest="stats_command", metavar="<command>")
    fetch = sub.add_parser("fetch", help="append a snapshot per video to the account's stats.csv")
    fetch.add_argument("account", help="account slug")
    fetch.add_argument("--platform", help="only this platform")
    fetch.set_defaults(handler=run_fetch)
