"""Shared setup for the panel tests: a temp Ralphy home, a running PanelServer and a tiny HTTP client.

Each panel test module wraps `start_panel` in its own `panel` fixture; this module holds no tests.
"""

from __future__ import annotations

import http.client
import json
import threading
from dataclasses import dataclass, field
from pathlib import Path

from ralphy import files, model
from ralphy.panel.server import PanelServer

CONTENT = "ui-effects/001-type-charge"
RENDER_SIZE = 300 * 1024


def pattern_bytes(seed: int, size: int = RENDER_SIZE) -> bytes:
    """Bytes where every offset differs from its neighbours, so a wrong slice cannot match by accident."""
    block = bytes((seed + i * 7) % 251 for i in range(1021))
    return (block * (size // len(block) + 1))[:size]


@dataclass
class Reply:
    status: int
    headers: dict[str, str]
    body: bytes

    @property
    def json(self) -> dict:
        return json.loads(self.body)

    @property
    def text(self) -> str:
        return self.body.decode("utf-8")


@dataclass
class Panel:
    server: PanelServer
    home: Path
    env: dict
    content: model.Content
    render: Path
    render_bytes: bytes
    inbox_content: model.Content
    posts_path: Path
    extra: dict = field(default_factory=dict)

    @property
    def token(self) -> str:
        return self.server.token

    def request(self, method: str, path: str, *, headers: dict | None = None, body=None) -> Reply:
        conn = http.client.HTTPConnection("127.0.0.1", self.server.port, timeout=5)
        try:
            payload = None
            send = dict(headers or {})
            if body is not None:
                payload = json.dumps(body).encode()
                send.setdefault("Content-Type", "application/json")
            conn.request(method, path, body=payload, headers=send)
            resp = conn.getresponse()
            data = resp.read() if method != "HEAD" else b""
            return Reply(resp.status, {k.lower(): v for k, v in resp.getheaders()}, data)
        finally:
            conn.close()

    def get(self, path: str, **kwargs) -> Reply:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, body: dict | None = None, *, token: bool = True, headers: dict | None = None) -> Reply:
        send = dict(headers or {})
        if token:
            send["X-Ralphy-Token"] = self.token
        return self.request("POST", path, headers=send, body=body if body is not None else {})

    def notes(self) -> dict:
        return files.read_frontmatter(self.content.notes_path)[0]

    def posts(self) -> list[dict]:
        return files.read_csv(self.posts_path)


def build_home(env: dict) -> tuple[Path, model.Content, Path, bytes, model.Content, Path]:
    home = env["home"]
    ui = model.create_account("UI Effects", home=home)
    model.create_account("Brand Worlds", home=home)
    content, _ = model.create_content("ui-effects", "Type Charge", home=home)
    assert content.id == CONTENT
    ref = ui.path / "refs" / "ref-one"
    ref.mkdir(parents=True, exist_ok=True)
    (ref / "source.json").write_text(json.dumps({"url": "https://example.com/r", "author": "a"}), encoding="utf-8")
    files.update_frontmatter(content.notes_path, {"refs": ["refs/ref-one"]})
    (content.path / "index.html").write_text("<html><body><h1>v1</h1></body></html>", encoding="utf-8")
    (content.media_dir / "clip.txt").write_text("media-bytes", encoding="utf-8")
    model.save_version(content)
    (content.path / "index.html").write_text("<html><body><h1>v2</h1></body></html>", encoding="utf-8")
    model.save_version(content)
    (content.path / "assets").mkdir()
    (content.path / "assets" / "loop.mp4").write_bytes(b"asset-video")  # versions hold no mp4: served from the tree
    render = content.render_file
    data = pattern_bytes(1)
    render.write_bytes(data)
    inbox_item, _ = model.create_content("inbox", "Loose Idea", home=home)
    posts_path = ui.posts_path
    rows = [
        {"id": f"p_{c * 8}", "content": CONTENT, "platform": "tiktok", "handle": "@ui", "status": status}
        for c, status in (("a", "planned"), ("b", "approved"), ("c", "published"))
    ]
    files.write_csv(posts_path, model.POSTS_COLUMNS, rows)
    return home, content, render, data, inbox_item, posts_path


def start_panel(ralphy_env):
    """Build the home, start a server on a free port, yield a `Panel`, then stop the server."""
    home, content, render, data, inbox_item, posts_path = build_home(ralphy_env)
    server = PanelServer(0, home=home, poll=0.2)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
    thread.start()
    try:
        yield Panel(server, home, ralphy_env, content, render, data, inbox_item, posts_path)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
