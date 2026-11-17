"""`ralphy account login|check|open|pause|resume` with a fake browser and the real recipe session checks;
platform writes to account.md keep the body and comments; profile folders, locks and identity binding."""

from __future__ import annotations

import stat

import pytest
from test_post_fakes import FakeContext, FakePage, FakeSession, use_browser

from ralphy import files, model, paths
from ralphy.errors import RalphyError
from ralphy.post import profiles

ACCOUNT_MD = """---
name: UI Effects
niche: ui motion            # a trend niche
schedule: daily 18:00 Europe/Moscow
platforms:
  - platform: youtube       # youtube | tiktok | instagram | x
    handle: "@uieffects"
    profile: ui-effects-youtube
    status: unknown
    checked_at: null
created_at: 2026-11-17T12:00:00Z
---
# UI Effects

## Style

Palette #111 and #f5f5f5. Keep this body exactly.
"""


@pytest.fixture
def account(run):
    assert run("account", "new", "UI Effects").code == 0
    path = paths.home() / "ui-effects" / "account.md"
    path.write_text(ACCOUNT_MD, encoding="utf-8")
    return model.get_account("ui-effects")


def _signs_in_after(polls: int, cookies: dict, home_url: str = "https://www.tiktok.com/foryou"):
    """A session whose owner finishes signing in after `polls` waits: the cookies appear, the URL moves on."""

    def make() -> FakeSession:
        page = FakePage(FakeContext())

        def on_wait(session: FakeSession) -> None:
            if session.waits >= polls:
                page.context.cookie_values.update(cookies)
                page.url = home_url

        return FakeSession(page, on_wait=on_wait)

    return make


def test_login_adds_the_platform_waits_for_sign_in_and_keeps_the_file(run, account, monkeypatch):
    fake = use_browser(monkeypatch, _signs_in_after(3, {"sessionid": "s", "uid_tt": "u-7"}))
    result = run("--json", "account", "login", "ui-effects", "tiktok", "--handle", "ui.effects")
    assert result.code == 0, result.out + result.err
    data = result.json
    assert data["signed_in"] is True and data["created"] is True and data["status"] == "ok"
    assert data["profile"] == "ui-effects-tiktok" and data["handle"] == "@ui.effects" and data["checked_at"]
    session = fake.sessions[0]
    assert ("goto", "https://www.tiktok.com/login") in session.page().log and session.waits == 3
    text = (paths.home() / "ui-effects" / "account.md").read_text(encoding="utf-8")
    assert text.endswith(ACCOUNT_MD.split("---\n", 2)[2])  # body untouched
    assert "niche: ui motion            # a trend niche\n" in text and "created_at: 2026-11-17T12:00:00Z\n" in text
    meta, _ = files.read_frontmatter(paths.home() / "ui-effects" / "account.md")
    assert [e["platform"] for e in meta["platforms"]] == ["youtube", "tiktok"]
    tiktok = meta["platforms"][1]
    assert tiktok == {"platform": "tiktok", "handle": "@ui.effects", "profile": "ui-effects-tiktok", "status": "ok",
                      "checked_at": tiktok["checked_at"]}
    directory = paths.profiles_dir() / "ui-effects-tiktok"
    assert fake.opened == [directory]
    assert stat.S_IMODE(directory.stat().st_mode) == 0o700
    assert stat.S_IMODE(paths.profiles_dir().stat().st_mode) == 0o700
    assert profiles.read_identity("ui-effects-tiktok")["user_id"] == "u-7"


def test_login_timeout_and_closed_window_are_needs_login(run, account, monkeypatch):
    use_browser(monkeypatch, _signs_in_after(10_000, {}))
    timed_out = run("--json", "account", "login", "ui-effects", "youtube", "--timeout", "0").json
    assert timed_out["timed_out"] is True and timed_out["status"] == "needs_login"
    use_browser(monkeypatch, lambda: FakeSession(FakePage(FakeContext()), close_after=2))
    closed = run("--json", "account", "login", "ui-effects", "youtube").json
    assert closed["closed"] is True and closed["signed_in"] is False and closed["created"] is False
    assert profiles.find(model.get_account("ui-effects"), "youtube")["status"] == "needs_login"
    assert "Window closed" in run("account", "login", "ui-effects", "youtube").out


def test_login_refuses_another_user_unless_rebind(run, account, monkeypatch):
    profiles.write_identity("ui-effects-tiktok", "u-1")
    use_browser(monkeypatch, _signs_in_after(1, {"sessionid": "s", "uid_tt": "u-2"}))
    other = run("--json", "account", "login", "ui-effects", "tiktok", "--handle", "@ui.effects").json
    assert other["signed_in"] is False and "another user" in other["detail"]
    rebound = run("--json", "account", "login", "ui-effects", "tiktok", "--rebind").json
    assert rebound["signed_in"] is True and profiles.read_identity("ui-effects-tiktok")["user_id"] == "u-2"


def test_login_changes_a_handle_with_a_warning_and_validates_input(run, account, monkeypatch):
    use_browser(monkeypatch, _signs_in_after(0, {"SAPISID": "x"}, "https://studio.youtube.com/channel/UC9"))
    data = run("--json", "account", "login", "ui-effects", "youtube", "--handle", "@ui.fx").json
    assert data["handle"] == "@ui.fx" and any("changed from @uieffects" in w for w in data["warnings"])
    assert data["signed_in"] is True
    assert run("--json", "account", "login", "inbox", "tiktok").json["error"]["code"] == "E_USAGE"
    assert run("--json", "account", "login", "ui-effects", "vine").json["error"]["code"] == "E_PLATFORM_UNKNOWN"
    assert run("--json", "account", "login", "ui-effects", "tiktok", "--handle", "a b").json["error"]["code"] == \
        "E_BAD_HANDLE"
    nohandle = run("--json", "account", "login", "ui-effects", "instagram", "--timeout", "0").json
    assert any("has no handle" in w for w in nohandle["warnings"])


def test_check_reports_every_platform_without_crashing(run, account, monkeypatch):
    acct = model.get_account("ui-effects")
    profiles.ensure(acct, "tiktok", "@ui.effects")
    profiles.ensure(acct, "x", "@ui")
    run("account", "pause", "ui-effects", "x")
    pages = {"youtube": FakePage(FakeContext({"SAPISID": "x"})), "tiktok": FakePage(FakeContext())}
    pages["youtube"].redirects["https://studio.youtube.com/"] = "https://studio.youtube.com/channel/UC1"
    pages["tiktok"].goto_errors["https://www.tiktok.com/"] = "net::ERR_INTERNET_DISCONNECTED"
    order = iter(["youtube", "tiktok"])
    use_browser(monkeypatch, lambda: FakeSession(pages[next(order)]))
    data = run("--json", "account", "check", "ui-effects").json
    results = {r["platform"]: r for r in data["results"]}
    assert results["youtube"]["status"] == "ok" and results["youtube"]["session"] == "ok"
    assert results["tiktok"]["status"] == "unknown" and "ERR_INTERNET_DISCONNECTED" in results["tiktok"]["detail"]
    assert results["x"]["status"] == "paused" and results["x"]["session"] is None
    meta = model.get_account("ui-effects").meta
    assert {e["platform"]: e["status"] for e in meta["platforms"]} == {"youtube": "ok", "tiktok": "unknown",
                                                                      "x": "paused"}
    with profiles.profile_lock("ui-effects-youtube"):
        busy = run("--json", "account", "check", "ui-effects", "youtube").json["results"][0]
    assert busy["error"] == "E_PROFILE_BUSY"
    assert run("--json", "account", "check", "ui-effects", "instagram").json["error"]["code"] == "E_PLATFORM_NOT_FOUND"


def test_open_waits_until_the_window_is_closed(run, account, monkeypatch):
    fake = use_browser(monkeypatch, FakeSession)
    data = run("--json", "account", "open", "ui-effects", "youtube").json
    assert data["closed"] is True and data["url"] == "https://www.youtube.com/@uieffects/shorts"
    assert fake.sessions[0].closed and fake.sessions[0].closed_by_us
    custom = run("--json", "account", "open", "ui-effects", "youtube", "--url", "https://studio.youtube.com/").json
    assert ("goto", "https://studio.youtube.com/") in fake.sessions[1].page().log and custom["error"] is None


def test_pause_and_resume(run, account):
    paused = run("--json", "account", "pause", "ui-effects", "youtube").json
    assert paused["status"] == "paused"
    resumed = run("--json", "account", "resume", "ui-effects", "youtube")
    assert resumed.json["status"] == "unknown" and "account check" in run("account", "resume", "ui-effects",
                                                                          "youtube").out
    assert run("--json", "account", "pause", "ui-effects", "tiktok").json["error"]["code"] == "E_PLATFORM_NOT_FOUND"
    shown = run("--json", "account", "show", "ui-effects").json["account"]["meta"]["platforms"]
    assert shown[0]["status"] == "unknown"


def test_platform_writes_fall_back_to_a_full_dump_and_keep_the_body(run):
    run("account", "new", "Odd")
    path = paths.home() / "odd" / "account.md"
    path.write_text("---\nname: Odd\nplatforms:\n# a comment at column 0 inside the block\n  - platform: x\n"
                    "    handle: '@o'\n---\nBody stays.\n", encoding="utf-8")
    account = model.get_account("odd")
    profiles.ensure(account, "tiktok", "@odd")
    meta, body = files.read_frontmatter(path)
    assert body == "Body stays.\n"
    assert [e["platform"] for e in meta["platforms"]] == ["x", "tiktok"] and meta["name"] == "Odd"
    bare = paths.home() / "odd" / "account.md"
    bare.write_text("---\nname: Odd\n---\nNo platforms key yet.\n", encoding="utf-8")
    profiles.ensure(model.get_account("odd"), "youtube", "@odd")
    text = bare.read_text(encoding="utf-8")
    assert text.startswith("---\nname: Odd\nplatforms:\n- platform: youtube\n")
    assert text.endswith("No platforms key yet.\n")


def test_profile_lock_is_exclusive_and_released():
    with profiles.profile_lock("ui-effects-tiktok") as lock:
        assert lock.read_text().strip().isdigit()
        with pytest.raises(RalphyError) as caught:
            with profiles.profile_lock("ui-effects-tiktok"):
                pass
        assert caught.value.code == "E_PROFILE_BUSY" and "in use by process" in caught.value.message
        with profiles.profile_lock("ui-effects-youtube"):  # another profile is independent
            pass
    with profiles.profile_lock("ui-effects-tiktok"):
        pass
    with pytest.raises(RalphyError):
        profiles.profile_dir("../escape")


@pytest.fixture(autouse=True)
def _env(ralphy_env):
    return ralphy_env


class _Context:
    """A context for the real `BrowserSession`: `pages` empties when the owner closes the last tab."""

    def __init__(self, pages) -> None:
        self.pages = pages
        self.handlers = {}
        self.waited = 0

    def on(self, event, handler) -> None:
        self.handlers[event] = handler

    def wait_for_event(self, event, timeout=None):
        self.waited += 1
        if self.waited >= 3:
            self.pages[0].closed = True  # the owner closes the window on the third poll
        raise TimeoutError("Timeout exceeded")

    def close(self) -> None:
        self.handlers["close"]()


def test_browser_session_waits_for_the_last_tab_and_maps_launch_errors(tmp_path):
    from ralphy.post import browser

    page = FakePage()
    session = browser.BrowserSession(_Context([page]))
    assert session.page() is page and session.current_page() is page
    assert session.wait_closed(None) is True and session.closed and session.current_page() is None
    other = browser.BrowserSession(_Context([FakePage()]))
    other.close()
    assert other.closed
    busy = browser._launch_error(RuntimeError("Failed to create a ProcessSingleton for your profile"), tmp_path)
    missing = browser._launch_error(RuntimeError("Chromium distribution 'chrome' is not found at /x"), tmp_path)
    other_error = browser._launch_error(RuntimeError("boom\ncall log"), tmp_path)
    assert (busy.code, missing.code, other_error.code) == ("E_PROFILE_BUSY", "E_DEP_MISSING", "E_BROWSER_FAILED")
    assert other_error.message == "Chrome did not start: boom"
    assert browser.goto(FakePage(), "https://example.invalid/") is None
    failing = FakePage()
    failing.goto_errors["https://example.invalid/"] = "net::ERR_NAME_NOT_RESOLVED\nmore"
    assert browser.goto(failing, "https://example.invalid/") == "net::ERR_NAME_NOT_RESOLVED"
    shot = browser.capture(FakePage(), "p_00000001", "failed")
    assert shot and shot.endswith(".png") and (paths.cache_dir() / "post" / "p_00000001").is_dir()
