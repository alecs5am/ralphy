"""Analytics: how a video was watched, read from each platform's own studio pages, for iterating on videos.

`ralphy stats fetch` reads the grid numbers of every video (see `stats.py`) and then, for the account's posts
(or every video with `--all`), opens the video's analytics page in the same browser profile and keeps what the
page loads:

- YouTube: Studio's retention explorer (`/video/<id>/analytics/hub_engagement/explore`), whose `yta_web/join`
  response carries the retention curve (100 points over the video's length, relative to views, so a Short
  that loops starts above 100%), average view duration and percentage, and the Shorts "stayed to watch" share
  (viewers who did not swipe away).
- TikTok: TikTok Studio's video page (`/tiktokstudio/analytics/<id>`), whose `aweme/v2/data/insight`
  responses carry the per-second retention curve, average watch time, total watch time, the share that
  finished, traffic sources, search terms and new followers.
- Instagram: per-reel insights exist only for professional accounts; a personal account has none on the web.

One fetch appends one object per video to the account's `analytics.jsonl` (never rewritten). Fields, all
optional: `duration_s`, `views`, `avg_watch_s`, `avg_watched` (0..1 of the length), `finished` (0..1 of views),
`stayed` (0..1 of Shorts feed viewers), `watch_time_s`, `new_followers`, `retention` (`[[position 0..1 of the
length, share of viewers]]`), `traffic` and `search_terms` (`{name: share}`). Unknown is left out, never 0.
"""

from __future__ import annotations

import contextlib
import urllib.parse
from collections.abc import Callable

from .. import files, model
from ..errors import RalphyError
from . import browser, profiles

WAIT_S = 30  # a studio page can take this long to ask for its numbers

YT_EXPLORE = ("https://studio.youtube.com/video/{id}/analytics/hub_engagement/explore?explore_type=AUDIENCE_RETENTION"
              "&entity_type=VIDEO&entity_id={id}&videoId={id}&time_period=lifetime")
TT_ANALYTICS = "https://www.tiktok.com/tiktokstudio/analytics/{id}"

FIELDS = ("duration_s", "views", "avg_watch_s", "avg_watched", "finished", "stayed", "watch_time_s",
          "new_followers", "retention", "traffic", "search_terms")


def _num(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # NaN is unknown


def _clean(record: dict) -> dict | None:
    out = {k: v for k, v in record.items() if v not in (None, [], {})}
    return out if set(out) - {"duration_s"} else None


# ---------------------------------------------------------------- YouTube Studio (yta_web/join)


def _yt_tables(payloads: list) -> dict[str, dict]:
    tables: dict[str, dict] = {}
    for body in payloads:
        for result in (body or {}).get("results") or []:
            table = (result.get("value") or {}).get("resultTable")
            if result.get("key") and isinstance(table, dict):
                tables[result["key"]] = table
    return tables


def _yt_column(table: dict | None, metric: str) -> list[float | None]:
    """A metric's values; the ones Studio marks undefined (too little data) are None."""
    for column in (table or {}).get("metricColumns") or []:
        if (column.get("metric") or {}).get("type") != metric:
            continue
        undefined = set(column.get("undefinedValueIndices") or [])
        for kind in ("percentages", "milliseconds", "counts", "ratios", "values"):
            values = (column.get(kind) or {}).get("values")
            if values is not None:
                return [None if i in undefined else _num(v) for i, v in enumerate(values)]
    return []


def youtube_analytics(payloads: list, duration_s: float | None = None) -> dict | None:
    tables = _yt_tables(payloads)
    curve = tables.get("0__CHART_ALL_AUDIENCE_QUERY_KEY")
    values = _yt_column(curve, "AUDIENCE_WATCH_RELATIVE")
    offsets = []
    for column in (curve or {}).get("dimensionColumns") or []:
        if (column.get("dimension") or {}).get("type") == "AUDIENCE_INDEX":
            offsets = (column.get("offsets") or {}).get("values") or []
    if len(offsets) != len(values):
        offsets = list(range(len(values)))
    retention = [[round(i / 100, 4), round(v / 100, 4)] for i, v in zip(offsets, values, strict=True) if v is not None]

    kpi = tables.get("0__KPI_METRICS_QUERY_KEY")

    def first(metric: str) -> float | None:
        found = _yt_column(kpi, metric)
        return found[0] if found else None

    watch_ms, watched, stayed, views = (first("AVERAGE_WATCH_TIME"), first("AVERAGE_WATCH_PERCENTAGE"),
                                        first("SHORTS_FEED_IMPRESSIONS_VTR"), first("EXTERNAL_VIEWS"))
    return _clean({
        "duration_s": duration_s,
        "views": int(views) if views is not None else None,
        "avg_watch_s": round(watch_ms / 1000, 2) if watch_ms is not None else None,
        "avg_watched": round(watched / 100, 4) if watched is not None else None,
        "stayed": round(stayed / 100, 4) if stayed is not None else None,
        "retention": retention,
    })


def collect_youtube(page, video: dict) -> dict | None:
    # A same-tab goto between Studio pages can bounce back to the list, so each video gets its own tab.
    tab = page.context.new_page()
    bodies, stop = browser.listen(tab, lambda r: r.request.method == "POST" and "yta_web/join" in r.url)
    try:
        tab.goto(YT_EXPLORE.format(id=video["id"]), wait_until="domcontentloaded", timeout=90_000)
        browser.settle(tab, bodies, WAIT_S)
    finally:
        stop()
        with contextlib.suppress(Exception):
            tab.close()
    return youtube_analytics(bodies, video.get("duration_s"))


# ---------------------------------------------------------------- TikTok Studio (aweme/v2/data/insight)


def _tt(node):
    """TikTok wraps a value as `{status, value}`, sometimes inside `{is_after_7d, value: ...}`; a status other
    than 0 means no data."""
    while isinstance(node, dict) and "value" in node and ("status" in node or "is_after_7d" in node):
        if node.get("status") not in (None, 0):
            return None
        node = node["value"]
    if isinstance(node, dict) and node.get("status") not in (None, 0):
        return None
    return node


def _shares(node) -> dict[str, float]:
    out = {}
    for item in _tt(node) or []:
        if isinstance(item, dict) and item.get("key") and _num(item.get("value")) is not None:
            out[str(item["key"])] = round(_num(item["value"]), 4)
    return out


def tiktok_analytics(payloads: list) -> dict | None:
    body: dict = {}
    for payload in payloads:
        body.update({k: v for k, v in (payload or {}).items() if v is not None})
    info = body.get("video_info") if isinstance(body.get("video_info"), dict) else {}
    duration_ms = _num(((info.get("video") or {}).get("duration")))
    points = []
    for point in ((_tt(body.get("video_retention_rate_realtime")) or {}).get("list") or []):
        at, share = _num(point.get("timestamp")), _num(point.get("value"))
        if at is not None and share is not None:
            points.append((at, share))
    if points and not duration_ms:
        duration_ms = max(at for at, _ in points) + 1000
    retention = [[round(min(at / duration_ms, 1), 4), round(share, 4)] for at, share in points] if points else []
    duration_s = round(duration_ms / 1000, 2) if duration_ms else None
    avg = _num(_tt(body.get("video_per_duration_realtime")))
    views = _num(_tt(body.get("realtime_total_video_views")))
    if views is None:
        views = _num((info.get("statistics") or {}).get("play_count"))
    followers = _num(_tt(body.get("video_new_followers")))
    if followers is None:
        followers = _num(_tt(body.get("realtime_new_followers")))
    total = _num(_tt(body.get("video_total_duration_realtime")))
    finished = _num(_tt(body.get("video_finish_rate_realtime")))
    if not views:  # with no views TikTok reports its averages as 0: that is unknown, not a fact
        avg, total, finished = (None if not v else v for v in (avg, total, finished))
    return _clean({
        "duration_s": duration_s,
        "views": int(views) if views is not None else None,
        "avg_watch_s": round(avg, 2) if avg is not None else None,
        "avg_watched": round(min(avg / duration_s, 1), 4) if avg is not None and duration_s else None,
        "finished": round(finished, 4) if finished is not None else None,
        "watch_time_s": int(total) if total is not None else None,
        "new_followers": int(followers) if followers is not None else None,
        "retention": retention,
        "traffic": _shares(body.get("video_traffic_source_percent_realtime")),
        "search_terms": _shares(body.get("item_search_terms")),
    })


def collect_tiktok(page, video: dict) -> dict | None:
    vid = str(video["id"])
    bodies, stop = browser.listen(page, lambda r: "/aweme/v2/data/insight/" in r.url
                                  and vid in urllib.parse.unquote(r.url))
    try:
        page.goto(TT_ANALYTICS.format(id=vid), wait_until="domcontentloaded", timeout=60_000)
        browser.settle(page, bodies, WAIT_S)
    finally:
        stop()
    return tiktok_analytics(bodies)


COLLECTORS: dict[str, Callable[[object, dict], dict | None]] = {
    "youtube": collect_youtube, "tiktok": collect_tiktok,
}
NOT_READ = {"instagram": "Instagram shows reel insights only to professional accounts",
            "x": "X analytics are not read yet"}


# ---------------------------------------------------------------- reading: curve math and the report


def at(record: dict, seconds: float) -> float | None:
    """The share of viewers still watching at `seconds`, interpolated on the curve."""
    curve, duration = record.get("retention") or [], _num(record.get("duration_s"))
    if not curve or not duration:
        return None
    x = seconds / duration
    if x <= curve[0][0]:
        return curve[0][1]
    for (x0, y0), (x1, y1) in zip(curve, curve[1:], strict=False):
        if x0 <= x <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return None  # past the end of the curve


def drops(record: dict, count: int = 3) -> list[dict]:
    """The largest one-second losses: `[{at_s, lost}]` where `lost` is the share of viewers gone in that second."""
    duration = _num(record.get("duration_s"))
    if not record.get("retention") or not duration:
        return []
    steps = []
    second = 0
    while second + 1 <= duration:
        a, b = at(record, second), at(record, second + 1)
        if a is not None and b is not None:
            steps.append({"at_s": second, "lost": round(a - b, 4)})
        second += 1
    steps.sort(key=lambda s: -s["lost"])
    return [s for s in steps[:count] if s["lost"] > 0]


def _pct(value) -> str:
    return "-" if value is None else f"{value * 100:.0f}%"


def _secs(value) -> str:
    return "-" if value is None else f"{value:.1f}s"


def summary_line(record: dict) -> str:
    """One line for a person or an agent: the hook, the average view and the finish."""
    parts = []
    if record.get("retention") and record.get("duration_s"):
        marks = [s for s in (1, 3, 5) if s < record["duration_s"]]
        parts.append("retention " + " · ".join(f"{s}s {_pct(at(record, s))}" for s in marks)
                     + f" · end {_pct(record['retention'][-1][1])}")
    if record.get("avg_watch_s") is not None:
        length = f" of {record['duration_s']:.0f}s" if record.get("duration_s") else ""
        share = f" ({_pct(record['avg_watched'])})" if record.get("avg_watched") is not None else ""
        parts.append(f"avg view {_secs(record['avg_watch_s'])}{length}{share}")
    if record.get("stayed") is not None:
        parts.append(f"stayed {_pct(record['stayed'])}")
    if record.get("finished") is not None:
        parts.append(f"finished {_pct(record['finished'])}")
    return " · ".join(parts) or "no analytics yet (too few views)"


def newest(rows: list[dict]) -> list[dict]:
    """The newest record per video (platform and post URL)."""
    by_video: dict[tuple[str, str], dict] = {}
    for row in sorted(rows, key=lambda r: r.get("fetched_at") or ""):
        key = (str(row.get("platform") or ""), str(row.get("url") or ""))
        by_video[key] = row
    return list(by_video.values())


def report(ref: str) -> dict:
    """The newest analytics of one video (`<account>/<nnn>-<slug>`, across every account it was posted to) or
    of every video of one account (its slug)."""
    if "/" in ref:
        rows = [r for acct in model.all_accounts_with_inbox() for r in model.read_analytics(acct)
                if r.get("content") == ref]
        scope = "content"
    else:
        rows = model.read_analytics(profiles.account_for(ref))
        scope = "account"
    videos = []
    for row in newest(rows):
        videos.append({**row, "hook_3s": at(row, 3), "drops": drops(row)})
    videos.sort(key=lambda r: (r.get("content") or "~", r.get("platform") or ""))
    return {"ref": ref, "scope": scope, "videos": videos}


def deep_rows(account: model.Account, platform: str, handle: str, page, videos: list[dict],
              posted: dict[tuple[str, str], str], every: bool, stamp: str) -> tuple[list[dict], list[str]]:
    """Read the analytics of the chosen videos on an open, signed-in page; returns the rows and the errors."""
    collect = COLLECTORS.get(platform)
    if collect is None:
        return [], []
    rows, errors = [], []
    for video in videos:
        content = posted.get((platform, video["id"]), "")
        if not (every or content):
            continue
        try:
            record = collect(page, video)
        except RalphyError:
            raise
        except Exception as exc:  # noqa: BLE001 - one video's page failing must not lose the others
            errors.append(f"{video['url']}: {browser.first_line(exc)}")
            continue
        if record:
            rows.append({"fetched_at": stamp, "platform": platform, "handle": handle, "url": video["url"],
                         "content": content, **record})
    if rows:
        files.append_jsonl(account.analytics_path, rows)
    return rows, errors

