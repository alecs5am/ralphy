"""`ralphy stats fetch|show`: read the account's numbers and analytics, and show how a video was watched.

`fetch <account> [--platform p] [--all] [--numbers-only]` opens each signed-in platform in the account's own
browser profile (a Chrome window opens and closes) and reads the data the platform's pages load:
- views, likes, comments, shares and, where shown, saves for every video: one snapshot row per video appended
  to `stats.csv` (`content` is set for the videos that are posts in `posts.csv`);
- for the account's posts (every video with `--all`), the analytics from the platform's studio: the retention
  curve, average view, finished or stayed-to-watch share, traffic sources. Appended to `analytics.jsonl`.
  YouTube and TikTok have it; Instagram only for professional accounts.

`show <account | content-id>` prints the newest analytics: the retention at 1, 3 and 5 seconds, the average
view, the finish, and the seconds where most viewers left. That is the input for the next version of a video.
The panel reads the same files.
"""

from __future__ import annotations

from . import Output


def _number(value) -> str:
    return "-" if value is None or value == "" else f"{value:,}" if isinstance(value, int) else str(value)


def run_fetch(args) -> Output:
    from ..post import analytics, stats

    data = stats.fetch(args.account, args.platform, deep=not args.numbers_only, every=args.all)
    lines = []
    for result in data["results"]:
        head = f"{data['account']}:{result['platform']} {result.get('handle') or ''}"
        if result.get("skipped") or result.get("error"):
            lines.append(f"{head}  {result.get('skipped') or result.get('error')}")
            continue
        deep = {row["url"]: row for row in result.get("analytics") or []}
        lines.append(f"{head}  {result['videos']} video(s), {result['ours']} posted by Ralphy"
                     + (f", analytics for {len(deep)}" if deep else ""))
        for row in result["rows"]:
            mark = row["content"] or "-"
            lines.append(f"    {_number(row['views']):>9} views {_number(row['likes']):>7} likes "
                         f"{_number(row['comments']):>5} comments  {mark}  {row['url']}")
            if row["url"] in deep:
                lines.append(f"              {analytics.summary_line(deep[row['url']])}")
        if result.get("analytics_note"):
            lines.append(f"    analytics: {result['analytics_note']}")
        for error in result.get("analytics_errors") or []:
            lines.append(f"    analytics failed: {error}")
    lines.append(f"Appended to {data['stats']}")
    if any(r.get("analytics") for r in data["results"]):
        lines.append(f"Appended to {data['analytics']}")
    return Output(data, "\n".join(lines))


def run_show(args) -> Output:
    from ..post import analytics

    data = analytics.report(args.ref)
    if not data["videos"]:
        hint = (f"`ralphy stats fetch {args.ref.split('/')[0]}` reads them" if "/" not in args.ref
                else "`ralphy stats fetch <account>` reads them for the account's posts")
        return Output(data, f"No analytics for {args.ref} yet; {hint}.")
    lines = []
    for video in data["videos"]:
        name = video.get("content") or video.get("url")
        views = f"{video['views']:,} views" if video.get("views") is not None else ""
        lines.append(f"{name}  {video['platform']} {video.get('handle') or ''}  {views}  ({video.get('fetched_at')})")
        lines.append(f"    {analytics.summary_line(video)}")
        if video.get("drops"):
            lines.append("    most viewers left at " + ", ".join(
                f"{d['at_s']}-{d['at_s'] + 1}s (-{d['lost'] * 100:.0f} pts)" for d in video["drops"]))
        if video.get("traffic"):
            top = sorted(video["traffic"].items(), key=lambda kv: -kv[1])[:3]
            lines.append("    traffic " + " · ".join(f"{k} {v * 100:.0f}%" for k, v in top if v > 0))
        if data["scope"] == "content" and video.get("url"):
            lines.append(f"    {video['url']}")
    return Output(data, "\n".join(lines))


def register(subparsers) -> None:
    parser = subparsers.add_parser("stats", help="read numbers and retention from the account's platforms",
                                   description=__doc__)
    sub = parser.add_subparsers(dest="stats_command", metavar="<command>")
    fetch = sub.add_parser("fetch", help="append numbers to stats.csv and analytics to analytics.jsonl")
    fetch.add_argument("account", help="account slug")
    fetch.add_argument("--platform", help="only this platform")
    fetch.add_argument("--all", action="store_true", help="analytics for every video, not only Ralphy's posts")
    fetch.add_argument("--numbers-only", action="store_true", help="skip the analytics pages")
    fetch.set_defaults(handler=run_fetch)
    show = sub.add_parser("show", help="how a video (or every video of an account) was watched")
    show.add_argument("ref", help="content id (<account>/<nnn>-<slug>) or account slug")
    show.set_defaults(handler=run_show)
