"""Notice changes under `RALPHY_HOME` by polling mtimes, and fan them out to Server-Sent Event listeners.

No file-system events library: every `interval` seconds the watcher stats a short list of files per
Account (`account.md`, `posts.csv`, `stats.csv`, the `videos/` folder) and per Content (`notes.md`,
`render.mp4`, `versions/`, and the newest mtime in the working tree). A difference becomes one event per
Account or Content, naming what changed, e.g. `{"type": "content", "id": "ui-effects/006-type-clock",
"what": ["render"]}`. `work` means the working tree changed: the live preview reloads and the render may be
stale now.
"""

from __future__ import annotations

import os
import queue
import threading
from pathlib import Path

from .. import model

_ACCOUNT_FILES = (("account", model.ACCOUNT_FILE), ("posts", model.POSTS_FILE), ("stats", model.STATS_FILE),
                  ("structure", model.VIDEOS_DIR))
_CONTENT_FILES = (("notes", model.NOTES_FILE), ("render", model.RENDER_FILE), ("versions", model.VERSIONS_DIR))


def _stamp(path: Path) -> tuple | None:
    try:
        stat = os.stat(path)
    except OSError:
        return None
    return (stat.st_mtime_ns, stat.st_size, stat.st_ino)


def snapshot(home: Path) -> dict[tuple, tuple | None]:
    """`(kind, key, what) -> stamp` for everything the panel shows."""
    state: dict[tuple, tuple | None] = {("library", "", "structure"): _stamp(home)}
    if not home.is_dir():
        return state
    folders = [(a.slug, a.path) for a in model.list_accounts(home)]
    if (home / model.INBOX).is_dir():
        folders.append((model.INBOX, home / model.INBOX))
    for slug, path in folders:
        for what, name in _ACCOUNT_FILES:
            state[("account", slug, what)] = _stamp(path / name)
        videos = path / model.VIDEOS_DIR
        try:
            entries = list(os.scandir(videos))
        except OSError:
            continue
        for entry in entries:
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            folder = Path(entry.path)
            cid = f"{slug}/{entry.name}"
            for what, name in _CONTENT_FILES:
                state[("content", cid, what)] = _stamp(folder / name)
            item = model.Content(account=slug, folder=entry.name, path=folder)
            state[("content", cid, "work")] = (model.working_tree_stamp(item),)
    return state


def diff(old: dict, new: dict) -> list[dict]:
    """Events for every Account or Content whose stamps changed, appeared or disappeared."""
    changed: dict[tuple[str, str], set[str]] = {}
    for key in old.keys() | new.keys():
        if old.get(key) != new.get(key):
            kind, ident, what = key
            changed.setdefault((kind, ident), set()).add(what)
    events = []
    for (kind, ident), whats in sorted(changed.items()):
        if kind == "library":
            events.append({"type": "library"})
        elif kind == "account":
            events.append({"type": "account", "account": ident, "what": sorted(whats)})
        else:
            events.append({"type": "content", "id": ident, "what": sorted(whats)})
    return events


class Watcher:
    """A polling thread and a set of subscriber queues. `subscribe()` returns a queue of event dicts; None ends it."""

    def __init__(self, home: Path, interval: float = 1.5) -> None:
        self.home = home
        self.interval = interval
        self.subscribers: set[queue.Queue] = set()
        self.lock = threading.Lock()
        self.stopped = threading.Event()
        self.thread: threading.Thread | None = None
        self.state: dict = {}

    def start(self) -> None:
        if self.thread:
            return
        self.state = snapshot(self.home)
        self.thread = threading.Thread(target=self._run, name="ralphy-panel-watch", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stopped.set()
        with self.lock:
            for subscriber in self.subscribers:
                subscriber.put(None)

    def subscribe(self) -> queue.Queue:
        subscriber: queue.Queue = queue.Queue()
        with self.lock:
            self.subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: queue.Queue) -> None:
        with self.lock:
            self.subscribers.discard(subscriber)

    def publish(self, events: list[dict]) -> None:
        if not events:
            return
        with self.lock:
            for subscriber in self.subscribers:
                for event in events:
                    subscriber.put(event)

    def poll(self) -> list[dict]:
        new = snapshot(self.home)
        events = diff(self.state, new)
        self.state = new
        return events

    def _run(self) -> None:
        while not self.stopped.wait(self.interval):
            try:
                events = self.poll()
            except Exception:  # noqa: BLE001 - a half-written folder must not end live updates
                continue
            self.publish(events)
