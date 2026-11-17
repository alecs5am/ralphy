"""The panel's HTTP server: stdlib `ThreadingHTTPServer` on 127.0.0.1, JSON reads, two writes, files, SSE.

Routes (GET and HEAD unless noted):

- `/` the page, `/static/<path>` its assets.
- `/api/health`, `/api/accounts`, `/api/accounts/<slug>`, `/api/content`, `/api/content/<account>/<folder>`,
  `/api/trends`, `/api/trends/<niche>`: JSON, `{"ok": true, ...}` or `{"ok": false, "error": {...}}`.
- `/api/events`: Server-Sent Events, one `change` event per Account or Content that changed on disk.
- `/files/<path>`: any file under `RALPHY_HOME`, with byte ranges.
- `/poster/<path>`: a JPEG frame of a video under `RALPHY_HOME`.
- `/preview/<account>/<folder>/<vN|work>/<path>`: a saved version (or the working tree) as static files for
  the HyperFrames player. A version has no `media/` and no mp4 files, so `media/` falls back to the Content's
  `media/` and a missing mp4 to the working tree's file; the root `index.html` gets the HyperFrames runtime.
- POST `/api/posts/<id>/approve|cancel`: the only writes.

Requests must name this server in `Host` (no DNS rebinding). Writes need the page's launch token in
`X-Ralphy-Token` and, when the browser sends one, a matching `Origin`. The token is made per server process
and reaches the page only inside the HTML the server renders.

`serve` runs the server until Ctrl+C or SIGTERM. While it runs, `RALPHY_CACHE_DIR/panel/server.json` names its
pid, port and URL, so `ralphy panel` finds it (see `launch.py`).
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import queue
import re
import secrets
import signal
import socket
import socketserver
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from .. import __version__, files, model, paths
from ..commands import trends as trends_cmd
from ..errors import RalphyError
from . import actions, data, launch
from .media import CHUNK, Posters, Probes, content_type, etag, is_video, parse_range, safe_join, within
from .watch import Watcher

STATIC = Path(__file__).resolve().parent / "static"
RUNTIME_URL = "/static/vendor/hyperframe.runtime.iife.js"
DEFAULT_PORT = 4777
PORT_TRIES = 20
MAX_BODY = 64 * 1024

_STATUS = {
    "E_USAGE": 400, "E_BAD_VERSION": 400, "E_BAD_REQUEST": 400, "E_FORBIDDEN": 403, "E_TOKEN": 403,
    "E_NOT_RENDERED": 409, "E_POST_STATE": 409, "E_EXISTS": 409,
    "E_TRENDS_UNREACHABLE": 502, "E_BAD_RESPONSE": 502,
}


def _status_for(code: str) -> int:
    if code in _STATUS:
        return _STATUS[code]
    if code.endswith("NOT_FOUND"):
        return 404
    return 500


class PanelServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    block_on_close = False

    def __init__(self, port: int = DEFAULT_PORT, *, home: Path | None = None, poll: float = 1.5) -> None:
        self.home = home or paths.home()
        self.token = secrets.token_urlsafe(24)
        self.probes = Probes(paths.cache_dir())
        self.posters = Posters(paths.cache_dir())
        self.watcher = Watcher(self.home, interval=poll)
        try:
            super().__init__(("127.0.0.1", port), Handler)
        except OSError as exc:
            raise RalphyError("E_PORT_IN_USE", f"Cannot listen on 127.0.0.1:{port}: {exc.strerror or exc}",
                              "Another panel may be running; pass `--port <n>` or stop the other one.") from None
        self.watcher.start()

    @classmethod
    def bind(cls, port: int = DEFAULT_PORT, *, home: Path | None = None, poll: float = 1.5,
             tries: int = PORT_TRIES) -> PanelServer:
        """A server on `port`, or on the next free port when it is busy (`port` 0: any free port)."""
        last: RalphyError | None = None
        for candidate in [0] if port == 0 else range(port, min(port + tries, 65536)):
            try:
                return cls(candidate, home=home, poll=poll)
            except RalphyError as exc:
                last = exc
        assert last is not None
        last.message = f"No free port in {port}-{port + tries - 1} on 127.0.0.1"
        raise last

    def server_bind(self) -> None:
        """Bind without `HTTPServer.server_bind`'s reverse DNS lookup (`socket.getfqdn`), which can hang on macOS."""
        socketserver.TCPServer.server_bind(self)
        host, port = self.server_address[:2]
        self.server_name = host
        self.server_port = port

    @property
    def port(self) -> int:
        return self.server_address[1]

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def hosts(self) -> set[str]:
        return {f"127.0.0.1:{self.port}", f"localhost:{self.port}"}

    def server_close(self) -> None:
        self.watcher.stop()
        super().server_close()

    def handle_error(self, request, client_address) -> None:
        """A browser closing a kept-alive or ranged connection is normal; report anything else."""
        error = sys.exc_info()[1]
        if isinstance(error, (ConnectionResetError, BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


class Handler(BaseHTTPRequestHandler):
    server: PanelServer
    protocol_version = "HTTP/1.1"
    server_version = f"ralphy-panel/{__version__}"

    GET_ROUTES = (
        (re.compile(r"^/$"), "page"),
        (re.compile(r"^/static/(?P<path>.+)$"), "static"),
        (re.compile(r"^/api/health$"), "health"),
        (re.compile(r"^/api/accounts$"), "accounts"),
        (re.compile(r"^/api/accounts/(?P<slug>[^/]+)$"), "account"),
        (re.compile(r"^/api/content$"), "content_list"),
        (re.compile(r"^/api/content/(?P<account>[^/]+)/(?P<folder>[^/]+)$"), "content"),
        (re.compile(r"^/api/trends$"), "trends"),
        (re.compile(r"^/api/trends/(?P<niche>[^/]+)$"), "trend_niche"),
        (re.compile(r"^/api/events$"), "events"),
        (re.compile(r"^/files/(?P<path>.+)$"), "file"),
        (re.compile(r"^/poster/(?P<path>.+)$"), "poster"),
        (re.compile(r"^/preview/(?P<account>[^/]+)/(?P<folder>[^/]+)/(?P<version>v[1-9]\d*|work)/(?P<path>.*)$"),
         "preview"),
    )
    POST_ROUTES = (
        (re.compile(r"^/api/posts/(?P<post>[^/]+)/(?P<action>approve|cancel)$"), "post_action"),
    )

    # ------------------------------------------------------------ plumbing

    def log_message(self, format, *args) -> None:  # noqa: A002 - the stdlib signature
        pass

    def _route(self, routes) -> tuple[str, dict] | None:
        path = unquote(urlsplit(self.path).path)
        for pattern, name in routes:
            match = pattern.match(path)
            if match:
                return name, match.groupdict()
        return None

    @property
    def query(self) -> dict[str, list[str]]:
        return parse_qs(urlsplit(self.path).query)

    def _host_ok(self) -> bool:
        return (self.headers.get("Host") or "").lower() in self.server.hosts()

    def _send(self, status: int, body: bytes, ctype: str, extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            with contextlib.suppress(BrokenPipeError, ConnectionResetError):
                self.wfile.write(body)

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8", {"Cache-Control": "no-store"})

    def _error(self, error: RalphyError) -> None:
        self._json({"ok": False, "error": error.to_dict()}, _status_for(error.code))

    def _not_found(self) -> None:
        self._error(RalphyError("E_NOT_FOUND", f"Nothing at {urlsplit(self.path).path}"))

    def _dispatch(self, routes) -> None:
        if not self._host_ok():
            self._error(RalphyError("E_FORBIDDEN", "Unexpected Host header", "Open the panel at 127.0.0.1."))
            return
        found = self._route(routes)
        if not found:
            self._not_found()
            return
        name, params = found
        try:
            getattr(self, f"route_{name}")(**params)
        except RalphyError as error:
            self._error(error)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:  # noqa: BLE001 - the page gets the error shape, the console a traceback
            traceback.print_exc(file=sys.stderr)
            self._error(RalphyError("E_INTERNAL", f"{type(exc).__name__}: {exc}"))

    def do_GET(self) -> None:  # noqa: N802 - the stdlib name
        self._dispatch(self.GET_ROUTES)

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch(self.GET_ROUTES)

    def do_POST(self) -> None:  # noqa: N802
        # Read the whole body first: on a kept-alive connection unread bytes would prefix the next request line.
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length > MAX_BODY:
            self.close_connection = True
            self._error(RalphyError("E_BAD_REQUEST", "The request body is too large"))
            return
        self._raw = self.rfile.read(length) if length > 0 else b""
        if not self._host_ok():
            self._error(RalphyError("E_FORBIDDEN", "Unexpected Host header"))
            return
        origin = self.headers.get("Origin")
        if origin and origin.lower() not in {f"http://{h}" for h in self.server.hosts()}:
            self._error(RalphyError("E_FORBIDDEN", "Writes are accepted from the panel page only"))
            return
        if not secrets.compare_digest(self.headers.get("X-Ralphy-Token") or "", self.server.token):
            self._error(RalphyError("E_TOKEN", "Missing or wrong panel token", "Reload the panel page."))
            return
        self._dispatch(self.POST_ROUTES)

    def _method_not_allowed(self) -> None:
        self._send(405, b"", "text/plain", {"Allow": "GET, HEAD, POST"})

    do_PUT = do_DELETE = do_PATCH = _method_not_allowed  # noqa: N815

    def _body(self) -> dict:
        raw = getattr(self, "_raw", b"")
        if not raw:
            return {}
        try:
            payload = json.loads(raw)
        except ValueError:
            raise RalphyError("E_BAD_REQUEST", "The request body is not JSON") from None
        if not isinstance(payload, dict):
            raise RalphyError("E_BAD_REQUEST", "The request body is not a JSON object")
        return payload

    def _file(self, path: Path, *, cache: str = "no-cache", ctype: str | None = None) -> None:
        """Send a file with ETag, `Accept-Ranges` and one byte range when asked."""
        try:
            size = path.stat().st_size
        except OSError:
            self._not_found()
            return
        tag = etag(path)
        ranged = parse_range(self.headers.get("Range"), size)
        headers = {"Accept-Ranges": "bytes", "ETag": tag, "Cache-Control": cache}
        if ranged is None and self.headers.get("If-None-Match") == tag:
            self.send_response(304)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if ranged is False:
            self._send(416, b"", "text/plain", {"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes"})
            return
        start, end = ranged if ranged else (0, size - 1)
        length = max(0, end - start + 1) if size else 0
        self.send_response(206 if ranged else 200)
        self.send_header("Content-Type", ctype or content_type(path))
        self.send_header("Content-Length", str(length))
        if ranged:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        for key, value in headers.items():
            self.send_header(key, value)
        self.end_headers()
        if self.command == "HEAD" or not length:
            return
        with open(path, "rb") as handle:
            handle.seek(start)
            remaining = length
            try:
                while remaining > 0:
                    chunk = handle.read(min(CHUNK, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True

    def _home_file(self, rel: str) -> Path:
        target = safe_join(self.server.home, rel)
        if target is None:
            raise RalphyError("E_FORBIDDEN", "That path is outside the Ralphy home")
        if not target.is_file():
            raise RalphyError("E_NOT_FOUND", f"No file at {rel}")
        return target

    # ------------------------------------------------------------ pages and JSON

    def route_page(self) -> None:
        html = (STATIC / "index.html").read_text(encoding="utf-8")
        boot = json.dumps({"token": self.server.token, "home": str(self.server.home), "version": __version__})
        boot = boot.replace("</", "<\\/")
        html = html.replace("<!--ralphy-boot-->", f"<script>window.RALPHY = {boot};</script>", 1)
        self._send(200, html.encode("utf-8"), "text/html; charset=utf-8",
                   {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})

    def route_static(self, path: str) -> None:
        target = safe_join(STATIC, path)
        if target is None or not target.is_file():
            self._not_found()
            return
        self._file(target, cache="no-cache")

    def route_health(self) -> None:
        self._json({"ok": True, "version": __version__, "home": str(self.server.home), "pid": os.getpid(),
                    "writes": ["post-approve", "post-cancel"]})

    def route_accounts(self) -> None:
        self._json({"ok": True, **data.accounts(self.server.home)})

    def route_account(self, slug: str) -> None:
        self._json({"ok": True, **data.account(self.server.home, slug)})

    def route_content_list(self) -> None:
        self._json({"ok": True, **data.content_list(self.server.home, self.server.probes)})

    def route_content(self, account: str, folder: str) -> None:
        self._json({"ok": True, **data.content(self.server.home, self.server.probes, account, folder)})

    def route_trends(self) -> None:
        refresh = self.query.get("refresh", ["0"])[0] == "1"
        output = trends_cmd.run_list(argparse.Namespace(refresh=refresh))
        self._json({"ok": True, **output.data})

    def route_trend_niche(self, niche: str) -> None:
        refresh = self.query.get("refresh", ["0"])[0] == "1"
        output = trends_cmd.run_niche(argparse.Namespace(niche=niche, limit=0, refresh=refresh))
        self._json({"ok": True, **output.data})

    # ------------------------------------------------------------ files

    def route_file(self, path: str) -> None:
        self._file(self._home_file(path))

    def route_poster(self, path: str) -> None:
        video = self._home_file(path)
        if not is_video(video):
            raise RalphyError("E_NOT_FOUND", f"{path} is not a video")
        poster = self.server.posters.get(video)
        if poster is None:
            raise RalphyError("E_NOT_FOUND", f"No poster for {path}", "Install ffmpeg to see posters.")
        self._file(poster, cache="max-age=86400", ctype="image/jpeg")

    def route_preview(self, account: str, folder: str, version: str, path: str) -> None:
        item = model.resolve_content(f"{account}/{folder}", self.server.home)
        if item.account != account or item.folder != folder:
            raise RalphyError("E_CONTENT_NOT_FOUND", f"No content {account}/{folder}")
        base = item.path if version == "work" else item.versions_dir / version
        rel = path or "index.html"
        top = rel.split("/", 1)[0]
        if version == "work" and top in (model.VERSIONS_DIR, model.RENDER_FILE):
            raise RalphyError("E_NOT_FOUND", "The working tree preview does not serve versions or the render")
        if version != "work" and not (item.versions_dir / version).is_dir():
            raise RalphyError("E_VERSION_NOT_FOUND", f"{item.id} has no {version}")
        target = safe_join(base, rel)
        if (target is None or not target.is_file()) and top == model.MEDIA_DIR:
            target = safe_join(item.media_dir, rel.removeprefix(f"{model.MEDIA_DIR}/"))
        elif (version != "work" and (target is None or not target.is_file()) and rel.lower().endswith(".mp4")
              and top != model.RENDER_FILE):
            target = safe_join(item.path, rel)  # versions hold no mp4: the working tree's file stands in
        if target is None:
            raise RalphyError("E_FORBIDDEN", "That path leaves the content folder")
        inside = all(within(target, Path(os.path.realpath(root))) for root in (item.path, self.server.home))
        if not target.is_file() or not inside:
            raise RalphyError("E_NOT_FOUND", f"No file {rel} in {item.id} {version}")
        if rel == "index.html":
            html = target.read_text(encoding="utf-8", errors="replace")
            if "hyperframe.runtime" not in html and "hyperframes-preview-runtime" not in html:
                tag = f'<script data-hyperframes-preview-runtime="1" src="{RUNTIME_URL}"></script>'
                at = html.lower().rfind("</body>")
                html = f"{html[:at]}{tag}\n{html[at:]}" if at >= 0 else f"{html}\n{tag}"
            self._send(200, html.encode("utf-8"), "text/html; charset=utf-8", {"Cache-Control": "no-store"})
            return
        self._file(target, cache="no-store")

    # ------------------------------------------------------------ live updates

    def route_events(self) -> None:
        if self.command == "HEAD":
            self._send(200, b"", "text/event-stream")
            return
        watcher = self.server.watcher
        subscriber = watcher.subscribe()
        self.close_connection = True
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(b"retry: 2000\n: ready\n\n")
            self.wfile.flush()
            while True:
                try:
                    event = subscriber.get(timeout=15)
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    continue
                if event is None:
                    break
                payload = json.dumps(event, ensure_ascii=False)
                self.wfile.write(f"event: change\ndata: {payload}\n\n".encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, socket.timeout, OSError):
            pass
        finally:
            watcher.unsubscribe(subscriber)

    # ------------------------------------------------------------ writes

    def route_post_action(self, post: str, action: str) -> None:
        result = actions.change_post(self.server.home, post, action)
        account = result["post"].get("account")
        self.server.watcher.publish([{"type": "account", "account": account, "what": ["posts"]}])
        self._json({"ok": True, **result})


def _stop_on_sigterm() -> None:
    """SIGTERM (`ralphy panel stop`) ends `serve_forever` like Ctrl+C, so the state file is removed."""
    def handler(_signum, _frame):
        raise KeyboardInterrupt

    with contextlib.suppress(ValueError):  # not the main thread (tests): keep the default
        signal.signal(signal.SIGTERM, handler)


def _stage_note(message: str) -> None:
    """One progress line in the background server's log, so a stuck start shows where it stopped."""
    sys.stderr.write(f"{files.utc_now()} {message}\n")
    sys.stderr.flush()


def serve(port: int = DEFAULT_PORT, *, open_browser: bool = False, as_json: bool = False,
          mode: str = "foreground") -> int:
    """Run the panel until Ctrl+C or SIGTERM. `mode` is `foreground` (a terminal) or `background` (detached)."""
    note = _stage_note if mode == "background" else (lambda message: None)
    note(f"pid {os.getpid()}: binding 127.0.0.1:{port}")
    server = PanelServer.bind(port)
    url = server.url
    note(f"pid {os.getpid()}: listening on {url}")
    state = {"pid": os.getpid(), "port": server.port, "url": url, "home": str(server.home), "version": __version__,
             "mode": mode, "started_at": files.utc_now()}
    if os.environ.get(launch.LAUNCH_ENV):  # set by `ralphy panel` for the background child it waits for
        state["launch_id"] = os.environ[launch.LAUNCH_ENV]
    launch.write_state(state)
    note(f"pid {os.getpid()}: wrote {launch.state_path()}")
    _stop_on_sigterm()
    if as_json:
        sys.stdout.write(json.dumps({"ok": True, "url": url, "port": server.port, "pid": os.getpid(),
                                     "home": str(server.home)}) + "\n")
    else:
        sys.stdout.write(f"Ralphy panel: {url}\n{server.home}\nCtrl+C stops it.\n")
    sys.stdout.flush()
    if open_browser:
        import webbrowser

        threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        launch.clear_state(os.getpid())
    return 0
