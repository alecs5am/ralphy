"""Panel change detection: `watch.snapshot`, `watch.diff` and the `/api/events` Server-Sent Events stream."""

from __future__ import annotations

import http.client
import json
import os
import queue
import threading
import time

import pytest
from test_panel_support import CONTENT, pattern_bytes, start_panel

from ralphy import files, model
from ralphy.panel import watch


@pytest.fixture
def panel(ralphy_env):
    yield from start_panel(ralphy_env)


def test_snapshot_lists_accounts_and_content(panel):
    state = watch.snapshot(panel.home)
    assert state[("account", "ui-effects", "posts")] is not None
    assert state[("account", "brand-worlds", "posts")] is None
    assert state[("content", CONTENT, "notes")] is not None
    assert state[("content", CONTENT, "render")] is not None
    assert state[("content", CONTENT, "work")][0] > 0
    assert ("content", "inbox/001-loose-idea", "notes") in state
    assert ("library", "", "structure") in state


def test_snapshot_of_a_missing_home(tmp_path):
    assert list(watch.snapshot(tmp_path / "nope")) == [("library", "", "structure")]


def test_diff_names_what_changed(panel):
    before = watch.snapshot(panel.home)
    assert watch.diff(before, dict(before)) == []
    files.append_csv(panel.posts_path, model.POSTS_COLUMNS, {"id": "p_dddddddd", "status": "planned"})
    panel.content.render_file.write_bytes(b"x")
    events = watch.diff(before, watch.snapshot(panel.home))
    account = next(e for e in events if e["type"] == "account")
    content = next(e for e in events if e["type"] == "content")
    assert account == {"type": "account", "account": "ui-effects", "what": ["posts"]}
    assert content["id"] == CONTENT
    assert content["what"] == ["render"]


def test_diff_names_versions_and_work(panel):
    before = watch.snapshot(panel.home)
    model.save_version(panel.content, note="three")
    later = time.time_ns() + 10**9
    (panel.content.path / "assets" / "style.css").write_text("body{}", encoding="utf-8")
    os.utime(panel.content.path / "assets" / "style.css", ns=(later, later))
    events = watch.diff(before, watch.snapshot(panel.home))
    content = next(e for e in events if e["type"] == "content")
    assert content == {"type": "content", "id": CONTENT, "what": ["versions", "work"]}


def test_diff_reports_appearing_and_disappearing_keys():
    old = {("content", "a/001-x", "notes"): (1, 1, 1)}
    new = {("content", "a/002-y", "notes"): (2, 2, 2)}
    events = watch.diff(old, new)
    assert events == [
        {"type": "content", "id": "a/001-x", "what": ["notes"]},
        {"type": "content", "id": "a/002-y", "what": ["notes"]},
    ]


def test_diff_library_event():
    assert watch.diff({("library", "", "structure"): (1, 1, 1)}, {("library", "", "structure"): (2, 1, 1)}) == [
        {"type": "library"}
    ]


class Stream:
    """An open `/api/events` response read line by line in a thread."""

    def __init__(self, panel) -> None:
        self.conn = http.client.HTTPConnection("127.0.0.1", panel.server.port, timeout=10)
        self.conn.request("GET", "/api/events")
        self.resp = self.conn.getresponse()
        self.lines: queue.Queue[str] = queue.Queue()
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        try:
            while True:
                line = self.resp.fp.readline()
                if not line:
                    break
                self.lines.put(line.decode("utf-8").rstrip("\n"))
        except (OSError, ValueError):
            pass

    def wait_for(self, predicate, timeout: float = 5.0):
        """Return the first parsed `change` event matching `predicate`, or fail after `timeout`."""
        deadline = time.monotonic() + timeout
        seen = []
        while time.monotonic() < deadline:
            try:
                line = self.lines.get(timeout=0.2)
            except queue.Empty:
                continue
            if line.startswith("data: "):
                event = json.loads(line[6:])
                seen.append(event)
                if predicate(event):
                    return event
        raise AssertionError(f"no matching event within {timeout}s; saw {seen}")

    def wait_line(self, text: str, timeout: float = 5.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if self.lines.get(timeout=0.2) == text:
                    return
            except queue.Empty:
                continue
        raise AssertionError(f"never saw {text!r}")

    def close(self) -> None:
        self.conn.close()


def test_sse_streams_changes(panel):
    stream = Stream(panel)
    try:
        assert stream.resp.status == 200
        assert stream.resp.getheader("Content-Type").startswith("text/event-stream")
        stream.wait_line(": ready")
        files.append_csv(panel.posts_path, model.POSTS_COLUMNS,
                         {"id": "p_dddddddd", "content": CONTENT, "platform": "tiktok", "status": "planned"})
        account = stream.wait_for(lambda e: e.get("type") == "account")
        assert account["account"] == "ui-effects"
        assert "posts" in account["what"]
        panel.content.render_file.write_bytes(pattern_bytes(2, 4096))
        content = stream.wait_for(lambda e: e.get("type") == "content")
        assert content["id"] == CONTENT
        assert "render" in content["what"]
    finally:
        stream.close()


def test_sse_event_framing(panel):
    stream = Stream(panel)
    try:
        stream.wait_line(": ready")
        panel.server.watcher.publish([{"type": "library"}])
        stream.wait_line("event: change")
        stream.wait_line('data: {"type": "library"}')
    finally:
        stream.close()


def test_sse_head_does_not_stream(panel):
    reply = panel.request("HEAD", "/api/events")
    assert reply.status == 200
    assert reply.headers["content-type"] == "text/event-stream"
