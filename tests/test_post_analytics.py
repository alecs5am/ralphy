"""Analytics parsers on payloads shaped like YouTube Studio's and TikTok Studio's own responses, the curve math,
the append-only analytics.jsonl and `ralphy stats show`."""

from __future__ import annotations

import pytest

from ralphy import files, model
from ralphy.post import analytics


def _yt_metric(kind: str, metric: str, values: list, undefined: bool = False) -> dict:
    column = {"metric": {"type": metric}, kind: {"values": values}}
    if undefined:
        column["undefinedValueIndices"] = [0]
    return column


def _yt_payload(curve: list[float], undefined: bool = False) -> dict:
    return {"results": [
        {"key": "0__CHART_ALL_AUDIENCE_QUERY_KEY", "value": {"resultTable": {
            "dimensionColumns": [{"dimension": {"type": "AUDIENCE_INDEX"},
                                  "offsets": {"values": list(range(len(curve)))} if curve else {}}],
            "metricColumns": [{"metric": {"type": "AUDIENCE_WATCH_RELATIVE"},
                               "percentages": {"values": curve} if curve else {}}]}}},
        {"key": "0__KPI_METRICS_QUERY_KEY", "value": {"resultTable": {"metricColumns": [
            _yt_metric("percentages", "SHORTS_FEED_IMPRESSIONS_VTR", [0 if undefined else 21.52], undefined),
            _yt_metric("milliseconds", "AVERAGE_WATCH_TIME", [0 if undefined else 15201], undefined),
            _yt_metric("percentages", "AVERAGE_WATCH_PERCENTAGE", [0 if undefined else 47.5], undefined),
            _yt_metric("counts", "EXTERNAL_VIEWS", [0 if undefined else 408], undefined),
        ]}}},
    ]}


def test_youtube_retention_and_kpis_from_the_studio_explorer():
    found = analytics.youtube_analytics([{"results": []}, _yt_payload([121.88, 117.71, 80.0, 27.08])], 32)
    assert found["retention"] == [[0.0, 1.2188], [0.01, 1.1771], [0.02, 0.8], [0.03, 0.2708]]
    assert found["avg_watch_s"] == 15.2 and found["avg_watched"] == 0.475 and found["stayed"] == 0.2152
    assert found["views"] == 408 and found["duration_s"] == 32


def test_a_youtube_video_with_too_few_views_has_no_analytics():
    # Studio answers with zeros it marks undefined and an empty curve: that is unknown, not 0%.
    assert analytics.youtube_analytics([_yt_payload([], undefined=True)], 15) is None


def _tt_payload(views: int, avg: float, finished: float) -> dict:
    wrap = lambda value: {"is_after_7d": False, "value": {"status": 0, "value": value}}  # noqa: E731
    return {
        "status_code": 0,
        "video_info": {"aweme_id": "7311", "video": {"duration": 10_000}, "statistics": {"play_count": views}},
        "video_retention_rate_realtime": {"is_after_7d": False, "value": {"status": 0, "peak_value": 1000, "list": [
            {"timestamp": "0", "value": 1}, {"timestamp": "1000", "value": 0.6}, {"timestamp": "2000", "value": 0.5},
            {"timestamp": "10000", "value": 0.1}]}},
        "video_per_duration_realtime": wrap(avg),
        "video_finish_rate_realtime": wrap(finished),
        "video_total_duration_realtime": {"status": 0, "value": int(avg * views)},
        "realtime_total_video_views": wrap(views),
        "video_new_followers": {"status": 0, "value": 2},
        "video_traffic_source_percent_realtime": wrap([{"key": "For You", "value": 0.9},
                                                       {"key": "Search", "value": 0.1}]),
        "item_search_terms": {"status": 0, "value": [{"key": "snap app", "value": 1}]},
        "photo_retention_percent": {"status": 2, "value": None},
    }


def test_tiktok_insights_merge_into_one_record():
    found = analytics.tiktok_analytics([{"follower_num": {"status": 0, "value": 5}}, _tt_payload(100, 3.5, 0.08)])
    assert found["duration_s"] == 10 and found["views"] == 100
    assert found["retention"][:2] == [[0.0, 1.0], [0.1, 0.6]] and found["retention"][-1] == [1.0, 0.1]
    assert found["avg_watch_s"] == 3.5 and found["avg_watched"] == 0.35 and found["finished"] == 0.08
    assert found["watch_time_s"] == 350 and found["new_followers"] == 2
    assert found["traffic"] == {"For You": 0.9, "Search": 0.1} and found["search_terms"] == {"snap app": 1.0}


def test_tiktok_zero_averages_on_an_unviewed_video_are_unknown():
    found = analytics.tiktok_analytics([_tt_payload(0, 0, 0)])
    assert "avg_watch_s" not in found and "finished" not in found and "watch_time_s" not in found


def test_curve_math_and_the_one_line_summary():
    record = {"duration_s": 10, "retention": [[0, 1.0], [0.1, 0.6], [0.2, 0.5], [1.0, 0.1]],
              "avg_watch_s": 3.5, "avg_watched": 0.35, "finished": 0.08}
    assert analytics.at(record, 0) == 1.0 and analytics.at(record, 1) == pytest.approx(0.6)
    assert analytics.at(record, 6) == pytest.approx(0.3)
    assert analytics.drops(record, 2) == [{"at_s": 0, "lost": 0.4}, {"at_s": 1, "lost": 0.1}]
    assert analytics.summary_line(record) == ("retention 1s 60% · 3s 45% · 5s 35% · end 10% · avg view 3.5s of 10s "
                                              "(35%) · finished 8%")
    assert analytics.summary_line({}) == "no analytics yet (too few views)"


def test_deep_rows_reads_posts_only_unless_every_and_appends(ralphy_env, monkeypatch):
    account = model.create_account("Me")
    videos = [{"id": "7311", "url": "https://www.tiktok.com/@me/video/7311"},
              {"id": "7312", "url": "https://www.tiktok.com/@me/video/7312"}]
    read: list[str] = []

    def collect(_page, video):
        read.append(video["id"])
        if video["id"] == "7312":
            raise RuntimeError("Timeout 60000ms exceeded.\nCall log: ...")
        return {"duration_s": 10, "avg_watch_s": 3.5}

    monkeypatch.setitem(analytics.COLLECTORS, "tiktok", collect)
    posted = {("tiktok", "7311"): "me/001-a"}
    rows, errors = analytics.deep_rows(account, "tiktok", "@me", None, videos, posted, False, "2026-11-18T09:00:00Z")
    assert read == ["7311"] and rows[0]["content"] == "me/001-a" and errors == []
    rows, errors = analytics.deep_rows(account, "tiktok", "@me", None, videos, posted, True, "2026-11-18T10:00:00Z")
    assert len(rows) == 1 and errors == ["https://www.tiktok.com/@me/video/7312: Timeout 60000ms exceeded."]
    saved = model.read_analytics(account)
    assert [r["fetched_at"] for r in saved] == ["2026-11-18T09:00:00Z", "2026-11-18T10:00:00Z"]
    assert analytics.newest(saved)[0]["fetched_at"] == "2026-11-18T10:00:00Z"
    assert analytics.deep_rows(account, "instagram", "@me", None, videos, posted, True, "x") == ([], [])


def test_jsonl_skips_a_torn_line(tmp_path):
    path = tmp_path / "a.jsonl"
    files.append_jsonl(path, [{"a": 1}])
    with open(path, "a", encoding="utf-8") as handle:
        handle.write('{"a": 2')  # a write still in progress
    assert files.read_jsonl(path) == [{"a": 1}]
    assert files.read_jsonl(tmp_path / "missing.jsonl") == []


def test_stats_show_prints_retention_for_a_video_and_an_account(run, ralphy_env):
    account = model.create_account("Me")
    url = "https://www.youtube.com/shorts/abc123XYZ"
    files.append_jsonl(account.analytics_path, [
        {"fetched_at": "2026-11-18T09:00:00Z", "platform": "youtube", "handle": "@me", "url": url,
         "content": "me/001-a", "duration_s": 10, "views": 40, "stayed": 0.2,
         "retention": [[0, 1.0], [0.1, 0.6], [1.0, 0.3]]},
        {"fetched_at": "2026-11-18T12:00:00Z", "platform": "youtube", "handle": "@me", "url": url,
         "content": "me/001-a", "duration_s": 10, "views": 52, "stayed": 0.25,
         "retention": [[0, 1.0], [0.1, 0.7], [1.0, 0.3]]},
    ])
    result = run("stats", "show", "me/001-a")
    assert result.code == 0
    assert "52 views" in result.out and "stayed 25%" in result.out and "1s 70%" in result.out
    assert "most viewers left at 0-1s (-30 pts)" in result.out and url in result.out
    data = run("--json", "stats", "show", "me").json
    assert data["scope"] == "account" and len(data["videos"]) == 1 and data["videos"][0]["views"] == 52
    assert "No analytics for me/002-b yet" in run("stats", "show", "me/002-b").out
