"""Fakes shared by the posting tests: a scripted page/context/browser and a scripted recipe (ffprobe: conftest.py).

No test here; the other `test_post*.py` and `test_account_browser*.py` files import from this module. Nothing
in it starts a browser or touches the network.
"""

from __future__ import annotations

from pathlib import Path

from ralphy.post import browser, platforms, recipes

# ---------------------------------------------------------------- a scripted page


class FakeKeyboard:
    def __init__(self, page: FakePage) -> None:
        self.page = page

    def press(self, key: str) -> None:
        self.page.log.append(("press", key))

    def insert_text(self, text: str) -> None:
        self.page.log.append(("insert_text", text))


class FakeLocator:
    def __init__(self, page: FakePage, selector: str) -> None:
        self.page = page
        self.selector = selector

    @property
    def first(self) -> FakeLocator:
        return self

    def nth(self, _index: int) -> FakeLocator:
        return self

    def filter(self, **_kwargs) -> FakeLocator:
        return self

    def locator(self, selector: str) -> FakeLocator:
        return FakeLocator(self.page, selector)

    def count(self) -> int:
        value = self.page.counts.get(self.selector, 1)
        return value() if callable(value) else value

    def wait_for(self, state: str = "visible", timeout: float | None = None) -> None:
        if self.selector in self.page.missing:
            raise TimeoutError(f"waiting for {self.selector} timed out")

    def click(self, **_kwargs) -> None:
        self.page.log.append(("click", self.selector))
        effect = self.page.click_effects.get(self.selector)
        if effect:
            effect()

    def fill(self, text: str) -> None:
        self.page.log.append(("fill", self.selector, text))
        self.page.texts[self.selector] = text

    def inner_text(self, **_kwargs) -> str:
        value = self.page.texts.get(self.selector, "")
        return value() if callable(value) else value

    def get_attribute(self, name: str, **_kwargs):
        return self.page.attrs.get((self.selector, name))

    def set_input_files(self, path: str, **_kwargs) -> None:
        self.page.log.append(("upload", self.selector, path))

    def is_visible(self) -> bool:
        return self.page.visible.get(self.selector, True)

    def is_enabled(self) -> bool:
        return self.page.enabled.get(self.selector, True)

    def evaluate_all(self, _script: str):
        value = self.page.evaluations.get(self.selector, [])
        return value() if callable(value) else value


class FakePage:
    def __init__(self, context: FakeContext | None = None, url: str = "about:blank") -> None:
        self.context = context or FakeContext()
        self.url = url
        self.log: list[tuple] = []
        self.counts: dict = {}
        self.texts: dict = {}
        self.attrs: dict = {}
        self.visible: dict = {}
        self.enabled: dict = {}
        self.evaluations: dict = {}
        self.click_effects: dict = {}
        self.missing: set[str] = set()
        self.redirects: dict[str, str] = {}
        self.goto_errors: dict[str, str] = {}
        self.listeners: dict[str, list] = {}
        self.keyboard = FakeKeyboard(self)
        self.closed = False

    # navigation and timing
    def goto(self, url: str, **_kwargs) -> None:
        self.log.append(("goto", url))
        if url in self.goto_errors:
            raise RuntimeError(self.goto_errors[url])
        self.url = self.redirects.get(url, url)

    def wait_for_url(self, pattern, **_kwargs) -> None:
        self.log.append(("wait_for_url", getattr(pattern, "pattern", pattern)))

    def wait_for_timeout(self, _ms: float) -> None:
        pass

    def set_default_timeout(self, _ms: float) -> None:
        pass

    def is_closed(self) -> bool:
        return self.closed

    # locators
    def locator(self, selector: str) -> FakeLocator:
        return FakeLocator(self, selector)

    def get_by_role(self, role: str, **_kwargs) -> FakeLocator:
        return FakeLocator(self, f"role={role}")

    def frame_locator(self, _selector: str) -> FakePage:
        return self

    def add_locator_handler(self, *_args, **_kwargs) -> None:
        pass

    def remove_locator_handler(self, *_args) -> None:
        pass

    def evaluate(self, expression: str, _arg=None):
        """`page.evaluate`: scripted by the expression text in `evaluations`; a callable is called each time."""
        self.log.append(("evaluate", expression[:40]))
        value = self.evaluations.get(expression)
        return value() if callable(value) else value

    # events
    def on(self, event: str, handler) -> None:
        self.listeners.setdefault(event, []).append(handler)

    def remove_listener(self, event: str, handler) -> None:
        self.listeners.get(event, []).remove(handler)

    def emit(self, event: str, payload) -> None:
        for handler in list(self.listeners.get(event, [])):
            handler(payload)

    # evidence
    def content(self) -> str:
        return "<html>fake</html>"

    def screenshot(self, path: str, **_kwargs) -> None:
        Path(path).write_bytes(b"png")


class FakeContext:
    def __init__(self, cookies: dict[str, str] | None = None) -> None:
        self.cookie_values = dict(cookies or {})
        self.pages: list[FakePage] = []

    def cookies(self, _url: str | None = None) -> list[dict]:
        return [{"name": k, "value": v} for k, v in self.cookie_values.items()]


class FakeSession:
    """Stands in for `browser.BrowserSession`; `on_wait` runs on each `wait_closed` poll (e.g. the owner signs in)."""

    def __init__(self, page: FakePage | None = None, close_after: int | None = None, on_wait=None) -> None:
        self._page = page or FakePage()
        self.context = self._page.context
        self.context.pages = [self._page]
        self.closed = False
        self.waits = 0
        self.close_after = close_after
        self.on_wait = on_wait
        self.closed_by_us = False

    def page(self) -> FakePage:
        return self._page

    def current_page(self) -> FakePage | None:
        return None if self.closed else self._page

    def wait_closed(self, seconds) -> bool:
        self.waits += 1
        if self.on_wait:
            self.on_wait(self)
        if seconds is None or (self.close_after is not None and self.waits >= self.close_after):
            self.closed = True
        return self.closed

    def close(self) -> None:
        self.closed_by_us = True


class FakeBrowser:
    """Replaces `browser.launch`; records the profile dirs it was asked to open."""

    def __init__(self, make_session) -> None:
        self.make_session = make_session
        self.opened: list[Path] = []
        self.sessions: list[FakeSession] = []

    def __call__(self, directory: Path) -> FakeSession:
        self.opened.append(Path(directory))
        session = self.make_session()
        self.sessions.append(session)
        return session


def use_browser(monkeypatch, make_session) -> FakeBrowser:
    fake = FakeBrowser(make_session)
    monkeypatch.setattr(browser, "launch", fake)
    return fake


# ---------------------------------------------------------------- a scripted recipe


class FakeRecipe(recipes.Recipe):
    """`mode`: publish | fail_before | fail_after | no_submit | bad_url. Records the row status at the click."""

    def __init__(self, name: str = "tiktok", mode: str = "publish", state: str = "ok", user_id: str = "user-1",
                 url: str | None = None, on_click=None) -> None:
        self.name = name
        self.platform = platforms.PLATFORMS[name]
        self.mode = mode
        self.state = state
        self.user_id = user_id
        self.url = url or {
            "tiktok": "https://www.tiktok.com/@ui.effects/video/7311111111111111111",
            "instagram": "https://www.instagram.com/reel/ABC123/",
            "youtube": "https://www.youtube.com/shorts/abcdef12345",
            "x": "https://x.com/ui/status/1",
        }[name]
        self.on_click = on_click
        self.tasks: list[recipes.UploadTask] = []

    def session(self, context, page) -> recipes.Session:
        return recipes.Session(self.state, self.user_id if self.state == "ok" else None)

    def upload(self, page, task: recipes.UploadTask) -> recipes.UploadResult:
        self.tasks.append(task)
        if self.mode == "fail_before":
            raise recipes.StepError("attach-video", "expected 1 element(s), found 0")
        if self.mode == "no_submit":
            return recipes.UploadResult(self.url, None)
        task.on_submit()
        if self.on_click:
            self.on_click()
        if self.mode == "fail_after":
            raise recipes.StepError("wait-posted", "Timeout 300000ms exceeded")
        if self.mode == "bad_url":
            return recipes.UploadResult("https://example.com/nope", None)
        return recipes.UploadResult(self.url, "1")


def use_recipe(monkeypatch, recipe: FakeRecipe) -> FakeRecipe:
    monkeypatch.setitem(recipes.RECIPES, recipe.name, recipe)
    return recipe
