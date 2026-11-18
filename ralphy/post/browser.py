"""The browser behind posting: patchright on the installed Google Chrome, a persistent profile, headed.

This is the setup patchright recommends against automation detection: `channel="chrome"`, `headless=False`,
`no_viewport=True`, no custom user agent or headers, no stealth scripts. `locale="en-US"` keeps the
platform pages in English, which the recipes' text checks expect. There is no fallback to a bundled
Chromium: posting from a browser the platforms have never seen for this account is worse than stopping.

`open_profile(name)` holds the profile lock for as long as the window is open. Tests replace `launch`.
"""

from __future__ import annotations

import contextlib
import json
import time
from collections.abc import Callable, Iterator
from pathlib import Path

from .. import paths
from ..errors import RalphyError
from . import profiles

DEFAULT_TIMEOUT_MS = 30_000


def first_line(exc: BaseException) -> str:
    text = str(exc).strip() or type(exc).__name__
    return text.splitlines()[0][:500]


def is_timeout(exc: BaseException) -> bool:
    return type(exc).__name__ == "TimeoutError" or "Timeout" in type(exc).__name__


class BrowserSession:
    """One open persistent context. `closed` turns true when the owner closes the window or Chrome."""

    def __init__(self, context, playwright=None) -> None:
        self.context = context
        self._playwright = playwright
        self.closed = False
        with contextlib.suppress(Exception):
            context.on("close", self._on_close)

    def _on_close(self, *_args) -> None:
        self.closed = True

    def page(self):
        """The first tab (a new one when none is open), with the default step timeout."""
        pages = [p for p in self.context.pages if not p.is_closed()]
        page = pages[0] if pages else self.context.new_page()
        page.set_default_timeout(DEFAULT_TIMEOUT_MS)
        return page

    def current_page(self):
        """The newest open tab, or None when every window is closed."""
        if self.closed:
            return None
        try:
            pages = [p for p in self.context.pages if not p.is_closed()]
        except Exception:  # noqa: BLE001 - a dead browser has no pages
            self.closed = True
            return None
        return pages[-1] if pages else None

    def wait_closed(self, seconds: float | None) -> bool:
        """Wait up to `seconds` (None: no limit) for the owner to close the window. True when it is closed.

        On macOS closing the last window leaves Chrome running, so a context with no open tab counts as
        closed too.
        """
        deadline = None if seconds is None else time.monotonic() + seconds
        while True:
            if self.closed or self.current_page() is None:
                self.closed = True
                return True
            remaining = 0.5 if deadline is None else min(0.5, deadline - time.monotonic())
            if remaining <= 0:
                return False
            try:
                self.context.wait_for_event("close", timeout=remaining * 1000)
                self.closed = True
                return True
            except Exception as exc:  # noqa: BLE001 - a timeout is the normal case
                if not is_timeout(exc):
                    self.closed = True
                    return True

    def close(self) -> None:
        with contextlib.suppress(Exception):
            self.context.close()
        if self._playwright is not None:
            with contextlib.suppress(Exception):
                self._playwright.stop()
        self.closed = True


def _launch_error(exc: BaseException, directory: Path) -> RalphyError:
    message = first_line(exc)
    if any(s in str(exc) for s in ("ProcessSingleton", "SingletonLock", "already in use", "profile is in use")):
        return RalphyError("E_PROFILE_BUSY", f"Chrome already has the profile {directory.name} open",
                           "Close that Chrome window, then retry.")
    if any(s in str(exc) for s in ("distribution 'chrome' is not found", "Executable doesn't exist",
                                   "is not found at")):
        return RalphyError("E_DEP_MISSING", "Google Chrome is not installed",
                           "Install Google Chrome (https://www.google.com/chrome/); Ralphy posts from the real "
                           "Chrome, not a bundled Chromium.")
    return RalphyError("E_BROWSER_FAILED", f"Chrome did not start: {message}", "Run `ralphy doctor`.")


def launch(directory: Path) -> BrowserSession:
    try:
        from patchright.sync_api import sync_playwright
    except ImportError:
        raise RalphyError("E_DEP_MISSING", "patchright is not installed",
                          "Run `uv sync` in the Ralphy checkout (bin/ralphy does it on start).") from None
    playwright = sync_playwright().start()
    try:
        context = playwright.chromium.launch_persistent_context(
            str(directory), channel="chrome", headless=False, no_viewport=True, locale="en-US",
        )
    except Exception as exc:  # noqa: BLE001 - mapped to a clear error
        with contextlib.suppress(Exception):
            playwright.stop()
        raise _launch_error(exc, directory) from None
    return BrowserSession(context, playwright)


@contextlib.contextmanager
def open_profile(name: str) -> Iterator[BrowserSession]:
    """Lock the profile, start Chrome on it, and close both when the block ends."""
    with profiles.profile_lock(name):
        directory = profiles.ensure_profile_dir(name)
        session = launch(directory)
        try:
            yield session
        finally:
            session.close()


def goto(page, url: str, timeout_ms: int = 60_000) -> str | None:
    """Navigate; returns the error line instead of raising."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        return None
    except Exception as exc:  # noqa: BLE001 - the caller decides what a failed navigation means
        return first_line(exc)


def listen(page, want: Callable[[object], bool]) -> tuple[list, Callable[[], None]]:
    """Collect the JSON bodies of the page's responses that `want` picks; returns them and a stop function."""
    bodies: list = []

    def on_response(response) -> None:
        with contextlib.suppress(Exception):
            if want(response):
                bodies.append(json.loads(response.text()))

    page.on("response", on_response)
    return bodies, lambda: page.remove_listener("response", on_response)


def settle(page, bodies: list, wait_s: float = 20, quiet_ms: int = 3_000) -> None:
    """Wait for the first collected body (up to `wait_s`), then until none arrives for `quiet_ms`. Uses the
    page's own timer: a plain sleep would block the event loop that delivers the responses."""
    deadline = time.monotonic() + wait_s
    while not bodies and time.monotonic() < deadline:
        page.wait_for_timeout(500)
    seen = -1
    while seen != len(bodies):
        seen = len(bodies)
        page.wait_for_timeout(quiet_ms)


def capture(page, post_id: str, label: str) -> str | None:
    """Save the page's HTML and a full-page screenshot under the cache dir; returns the screenshot path (or
    the HTML path when no screenshot could be taken). Never raises."""
    try:
        directory = paths.cache_dir() / "post" / post_id
        directory.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%dT%H%M%S")
        html = directory / f"{label}-{stamp}.html"
        with contextlib.suppress(Exception):
            html.write_text(page.content(), encoding="utf-8")
        shot = directory / f"{label}-{stamp}.png"
        try:
            page.screenshot(path=str(shot), full_page=True)
            return str(shot)
        except Exception:  # noqa: BLE001
            return str(html) if html.exists() else None
    except Exception:  # noqa: BLE001
        return None
