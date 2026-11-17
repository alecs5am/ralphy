"""The panel's only writes: approve or cancel a post; token, Origin and Host checks; no select route."""

from __future__ import annotations

import http.client

import pytest
from test_panel_support import CONTENT, start_panel

from ralphy import files, model
from ralphy.errors import RalphyError
from ralphy.panel import actions

APPROVE = "/api/posts/p_aaaaaaaa/approve"


@pytest.fixture
def panel(ralphy_env):
    yield from start_panel(ralphy_env)


def _statuses(panel) -> dict[str, str]:
    return {row["id"]: row["status"] for row in panel.posts()}


def test_write_without_token_is_403(panel):
    reply = panel.post(APPROVE, token=False)
    assert reply.status == 403
    assert reply.json["error"]["code"] == "E_TOKEN"
    assert _statuses(panel)["p_aaaaaaaa"] == "planned"


def test_write_with_wrong_token_is_403(panel):
    reply = panel.post(APPROVE, token=False, headers={"X-Ralphy-Token": "nope"})
    assert reply.status == 403
    assert reply.json["error"]["code"] == "E_TOKEN"


def test_write_with_foreign_origin_is_403(panel):
    reply = panel.post(APPROVE, headers={"Origin": "http://evil.example"})
    assert reply.status == 403
    assert reply.json["error"]["code"] == "E_FORBIDDEN"
    assert _statuses(panel)["p_aaaaaaaa"] == "planned"


def test_write_with_own_origin_is_accepted(panel):
    reply = panel.post(APPROVE, headers={"Origin": f"http://127.0.0.1:{panel.server.port}"})
    assert reply.status == 200


def test_write_with_wrong_host_is_403(panel):
    reply = panel.post(APPROVE, headers={"Host": "evil.example"})
    assert reply.status == 403


def test_the_select_route_is_gone(panel):
    reply = panel.post(f"/api/content/{CONTENT}/select", {"version": "v1"})
    assert reply.status == 404
    assert not hasattr(actions, "select_version")


def test_non_json_body_is_ignored_by_routes_without_a_body(panel):
    conn = http.client.HTTPConnection("127.0.0.1", panel.server.port, timeout=5)
    conn.request("POST", APPROVE, body=b"not json", headers={"X-Ralphy-Token": panel.token})
    resp = conn.getresponse()
    assert resp.status == 200
    conn.close()


# ---------------------------------------------------------------- posts


def test_approve_planned_post(panel):
    before = panel.posts()
    reply = panel.post("/api/posts/p_aaaaaaaa/approve")
    assert reply.status == 200
    body = reply.json
    assert body["previous"] == "planned"
    assert body["post"]["status"] == "approved"
    assert body["post"]["account"] == "ui-effects"
    after = panel.posts()
    assert [r["id"] for r in after] == [r["id"] for r in before]
    assert _statuses(panel) == {"p_aaaaaaaa": "approved", "p_bbbbbbbb": "approved", "p_cccccccc": "published"}
    for old, new in zip(before[1:], after[1:], strict=True):
        assert old == new
    assert {k: v for k, v in after[0].items() if k != "status"} == {k: v for k, v in before[0].items()
                                                                    if k != "status"}
    header = (panel.posts_path.read_text(encoding="utf-8").splitlines()[0]).split(",")
    assert tuple(header) == model.POSTS_COLUMNS


def test_approve_published_post_is_409(panel):
    reply = panel.post("/api/posts/p_cccccccc/approve")
    assert reply.status == 409
    assert reply.json["error"]["code"] == "E_POST_STATE"
    assert _statuses(panel)["p_cccccccc"] == "published"


def test_approve_already_approved_is_409(panel):
    assert panel.post("/api/posts/p_bbbbbbbb/approve").json["error"]["code"] == "E_POST_STATE"


def test_cancel_approved_post(panel):
    reply = panel.post("/api/posts/p_bbbbbbbb/cancel")
    assert reply.status == 200
    assert reply.json["previous"] == "approved"
    assert _statuses(panel)["p_bbbbbbbb"] == "cancelled"


def test_cancel_planned_post(panel):
    assert panel.post("/api/posts/p_aaaaaaaa/cancel").status == 200
    assert _statuses(panel)["p_aaaaaaaa"] == "cancelled"


def test_cancel_published_post_is_409(panel):
    assert panel.post("/api/posts/p_cccccccc/cancel").status == 409


def test_unknown_post_is_404(panel):
    reply = panel.post("/api/posts/p_00000000/approve")
    assert reply.status == 404
    assert reply.json["error"]["code"] == "E_POST_NOT_FOUND"


def test_malformed_post_id_is_400(panel):
    reply = panel.post("/api/posts/p_zzzzzzzz/approve")
    assert reply.status == 400
    assert reply.json["error"]["code"] == "E_USAGE"


def test_post_action_needs_token(panel):
    assert panel.post("/api/posts/p_aaaaaaaa/approve", token=False).status == 403
    assert _statuses(panel)["p_aaaaaaaa"] == "planned"


def test_unknown_post_action_is_404(panel):
    assert panel.post("/api/posts/p_aaaaaaaa/delete").status == 404


def test_post_action_publishes_an_account_event(panel):
    subscriber = panel.server.watcher.subscribe()
    try:
        panel.post("/api/posts/p_aaaaaaaa/approve")
        assert subscriber.get(timeout=2) == {"type": "account", "account": "ui-effects", "what": ["posts"]}
    finally:
        panel.server.watcher.unsubscribe(subscriber)


# ---------------------------------------------------------------- direct calls


def test_change_post_direct(panel):
    result = actions.change_post(panel.home, "p_aaaaaaaa", "approve")
    assert result["previous"] == "planned"
    assert result["post"]["status"] == "approved"
    with pytest.raises(RalphyError) as excinfo:
        actions.change_post(panel.home, "p_aaaaaaaa", "approve")
    assert excinfo.value.code == "E_POST_STATE"
    with pytest.raises(RalphyError) as excinfo:
        actions.change_post(panel.home, "p_aaaaaaaa", "explode")
    assert excinfo.value.code == "E_USAGE"
    with pytest.raises(RalphyError) as excinfo:
        actions.change_post(panel.home, "p_00000000", "cancel")
    assert excinfo.value.code == "E_POST_NOT_FOUND"


def test_change_post_keeps_unknown_columns(panel):
    rows = files.read_csv(panel.posts_path)
    rows[0]["extra"] = "keep me"
    files.write_csv(panel.posts_path, [*model.POSTS_COLUMNS, "extra"], rows)
    actions.change_post(panel.home, "p_aaaaaaaa", "approve")
    assert files.read_csv(panel.posts_path)[0]["extra"] == "keep me"


def test_a_kept_alive_connection_survives_a_post_whose_body_the_route_ignores(panel):
    # approve and cancel take no body; an unread `{}` once prefixed the next request line on the same socket
    conn = http.client.HTTPConnection("127.0.0.1", panel.server.port, timeout=5)
    try:
        conn.request("POST", "/api/posts/p_aaaaaaaa/approve", body=b"{}",
                     headers={"X-Ralphy-Token": panel.token, "Content-Type": "application/json"})
        first = conn.getresponse()
        assert first.status == 200
        first.read()
        conn.request("GET", "/api/health")
        second = conn.getresponse()
        assert second.status == 200
        assert second.read().startswith(b'{"ok": true')
    finally:
        conn.close()
