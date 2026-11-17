"""The CLI surface: JSON shapes, the error shape, --json placement, setup, doctor, the account extension hook."""

from __future__ import annotations

import json
import types

import ralphy.commands as commands
from ralphy import __version__, files, model, paths
from ralphy.cli import build_parser


def test_version_and_bare_json(run):
    result = run("--version")
    assert result.code == 0 and result.out.strip() == f"ralphy {__version__}"
    bare = run("--json").json
    assert bare["ok"] is True and bare["version"] == __version__
    assert {"setup", "doctor", "account", "content", "render", "tool", "trends", "lib"} <= set(bare["verbs"])


def test_json_flag_before_and_after_the_verb(run):
    run("account", "new", "UI Effects")
    before = run("--json", "account", "list")
    after = run("account", "list", "--json")
    assert before.code == after.code == 0
    assert before.json == after.json
    assert before.json["accounts"][0]["slug"] == "ui-effects"


def test_error_shape_and_exit_code(run):
    result = run("--json", "content", "show", "missing")
    assert result.code == 1
    payload = result.json
    assert payload["ok"] is False
    assert set(payload["error"]) == {"code", "message", "hint"}
    assert payload["error"]["code"] == "E_CONTENT_NOT_FOUND"


def test_usage_errors_use_the_error_shape(run):
    result = run("content", "frobnicate", "--json")
    assert result.code == 1
    assert result.json["error"]["code"] == "E_USAGE"
    human = run("content", "frobnicate")
    assert human.code == 1 and human.out == "" and "error:" in human.err and "hint:" in human.err
    missing_sub = run("--json", "account")
    assert missing_sub.code == 1 and missing_sub.json["error"]["code"] == "E_USAGE"


def test_human_output_is_short_text(run):
    result = run("account", "new", "UI Effects")
    assert result.code == 0
    assert result.out.startswith("Created account ui-effects")


def test_setup_creates_folders_modes_and_keeps_keys(run, ralphy_env):
    result = run("--json", "setup")
    assert result.code == 0
    data = result.json
    assert data["ok"] is True
    for name in ("home", "config", "cache"):
        assert ralphy_env[name].is_dir()
    assert ralphy_env["config"].stat().st_mode & 0o777 == 0o700
    keys = ralphy_env["config"] / "keys.env"
    assert keys.stat().st_mode & 0o777 == 0o600
    template = keys.read_text()
    for name in paths.KNOWN_KEYS:
        assert f"# {name}=" in template
    assert data["keys_env"]["created"] is True
    assert (ralphy_env["config"] / "profiles").stat().st_mode & 0o777 == 0o700
    assert "tools" in data["doctor"]

    keys.write_text("FAL_KEY=sk-secret-value\n")
    again = run("--json", "setup").json
    assert again["keys_env"]["created"] is False
    assert keys.read_text() == "FAL_KEY=sk-secret-value\n"


def test_setup_home_is_saved_for_later_runs(run, ralphy_env, monkeypatch, tmp_path):
    monkeypatch.delenv("RALPHY_HOME")
    chosen = tmp_path / "Videos" / "ralphy"
    data = run("--json", "setup", "--home", str(chosen)).json
    assert data["home"] == str(chosen) and chosen.is_dir()
    settings = json.loads((ralphy_env["config"] / "settings.json").read_text())
    assert settings == {"home": str(chosen)}
    assert paths.home() == chosen and paths.home_source() == "settings"
    run("account", "new", "Later")
    assert (chosen / "later" / "account.md").is_file()


def test_doctor_reports_key_names_never_values(run, ralphy_env, monkeypatch):
    ralphy_env["config"].mkdir(parents=True)
    (ralphy_env["config"] / "keys.env").write_text("# comment\nFAL_KEY=sk-very-secret\nAPIFY_TOKEN=\nCUSTOM_KEY='x'\n")
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-secret")
    result = run("--json", "doctor")
    assert result.code == 0
    assert "sk-very-secret" not in result.out and "or-secret" not in result.out
    keys = result.json["keys"]
    assert keys["present"] == ["CUSTOM_KEY", "FAL_KEY", "OPENROUTER_API_KEY"]
    assert keys["sources"]["OPENROUTER_API_KEY"] == "env"
    assert "APIFY_TOKEN" in keys["missing"]
    names = {t["name"] for t in result.json["tools"]}
    assert {"uv", "python", "bun", "node", "ffmpeg", "ffprobe", "yt-dlp", "chrome"} <= names
    assert run("doctor").code == 0


def test_doctor_exits_zero_with_tools_missing(run, monkeypatch, tmp_path):
    monkeypatch.setenv("PATH", str(tmp_path / "empty-bin"))
    result = run("--json", "doctor")
    assert result.code == 0
    data = result.json
    assert data["ready"] is False
    assert "ffmpeg" in data["missing"]["required"]


def test_keys_env_reaches_subprocess_env(ralphy_env):
    ralphy_env["config"].mkdir(parents=True)
    (ralphy_env["config"] / "keys.env").write_text("export FAL_KEY=\"abc\"\nELEVENLABS_API_KEY=el\n")
    env = paths.subprocess_env()
    assert env["FAL_KEY"] == "abc" and env["ELEVENLABS_API_KEY"] == "el"
    assert env["RALPHY_HOME"] == str(ralphy_env["home"])


def test_account_show_shape(run, ralphy_env):
    run("account", "new", "UI Effects", "--niche", "ui motion")
    run("content", "new", "ui-effects", "Type Charge")
    home = ralphy_env["home"]
    files.write_csv(home / "ui-effects" / "posts.csv", model.POSTS_COLUMNS, [
        {"id": "p_00000001", "content": "ui-effects/001-type-charge", "platform": "tiktok", "status": "published"},
        {"id": "p_00000002", "content": "ui-effects/001-type-charge", "platform": "youtube", "status": "planned"},
    ])
    files.write_csv(home / "ui-effects" / "stats.csv", model.STATS_COLUMNS, [
        {"fetched_at": "2026-11-17T12:00:00Z", "platform": "tiktok", "url": "https://t/1",
         "content": "ui-effects/001-type-charge", "views": "42"},
    ])
    account = run("--json", "account", "show", "ui-effects").json["account"]
    assert set(account) == {"slug", "name", "path", "meta", "body", "counts", "videos", "refs", "latest_stats"}
    assert account["meta"]["niche"] == "ui motion"
    assert account["counts"] == {"videos": 1, "rendered": 0, "refs": 0, "posts": {"published": 1, "planned": 1},
                                 "stats_rows": 1}
    assert account["videos"] == ["ui-effects/001-type-charge"]
    assert account["latest_stats"][0]["views"] == 42 and account["latest_stats"][0]["likes"] is None


def test_content_list_and_show_shapes(run, ralphy_env):
    run("account", "new", "UI Effects")
    run("account", "new", "Film Stories")
    run("content", "new", "ui-effects", "Type Charge", "--ref", "https://example.com/a")
    run("content", "new", "inbox", "Idea")
    run("content", "save", "type-charge", "-m", "first")
    home = ralphy_env["home"]
    files.write_csv(home / "film-stories" / "posts.csv", model.POSTS_COLUMNS, [
        {"id": "p_0000000a", "content": "ui-effects/001-type-charge", "platform": "x", "status": "planned"},
    ])
    listing = run("--json", "content", "list").json
    assert [c["id"] for c in listing["content"]] == ["ui-effects/001-type-charge", "inbox/001-idea"]
    first = listing["content"][0]
    assert set(first) == {"id", "account", "number", "slug", "title", "path", "render", "render_stale",
                          "rendered_at", "versions", "created_at"}
    assert first["versions"] == ["v1"] and first["number"] == 1
    assert first["render"] is None and first["render_stale"] is False and first["rendered_at"] is None
    only = run("--json", "content", "list", "--account", "inbox").json["content"]
    assert [c["id"] for c in only] == ["inbox/001-idea"]

    shown = run("--json", "content", "show", "ui-effects/001-type-charge").json["content"]
    assert set(shown) == {"id", "account", "number", "slug", "title", "path", "meta", "body", "render",
                          "render_stale", "rendered_at", "versions", "media", "posts", "latest_stats"}
    assert shown["meta"]["refs"] == ["https://example.com/a"]
    assert shown["versions"][0]["name"] == "v1" and shown["versions"][0]["note"] == "first"
    assert set(shown["versions"][0]) == {"name", "path", "note", "saved_at"}
    assert shown["posts"][0]["account"] == "film-stories" and shown["posts"][0]["id"] == "p_0000000a"

    path = run("content", "path", "type-charge")
    assert path.out.strip() == str(home / "ui-effects" / "videos" / "001-type-charge")


def test_restore_through_the_cli_and_select_is_gone(run):
    run("content", "new", "inbox", "Idea")
    item = model.resolve_content("idea")
    run("content", "save", "idea", "-m", "first")
    (item.path / "index.html").write_text("<!-- second -->", encoding="utf-8")
    result = run("--json", "content", "restore", "idea", "v1")
    assert result.code == 0, result.out + result.err
    data = result.json
    assert data["id"] == "inbox/001-idea" and data["version"] == "v1" and data["before"] == "v2"
    assert data["saved"] is True and data["written"] == ["index.html"] and data["render"] is None
    assert "<!-- second -->" not in (item.path / "index.html").read_text()
    text = run("content", "restore", "idea", "v1")
    assert text.code == 0 and "already equals v1" in text.out
    missing = run("--json", "content", "restore", "idea", "v9")
    assert missing.code == 1 and missing.json["error"]["code"] == "E_VERSION_NOT_FOUND"
    gone = run("--json", "content", "select", "idea", "v1")
    assert gone.code == 1 and gone.json["error"]["code"] == "E_USAGE"


def test_notes_with_unknown_keys_still_read(run):
    run("content", "new", "inbox", "Idea")
    item = model.resolve_content("idea")
    files.update_frontmatter(item.notes_path, {"selected": "v2", "mood": "calm"})  # keys of an older layout
    shown = run("--json", "content", "show", "idea").json["content"]
    assert shown["title"] == "Idea" and "selected" not in shown and shown["render"] is None


def test_account_subcommands_can_be_added_by_another_module(monkeypatch):
    seen = {}

    def register_account(sub):
        login = sub.add_parser("login")
        login.add_argument("account")
        login.add_argument("platform")
        login.set_defaults(handler=lambda args: seen.setdefault("args", (args.account, args.platform)) and {})

    fake = types.ModuleType("ralphy.commands.account_browser")
    fake.register_account = register_account
    real = tuple(m for m in commands.modules() if m.__name__ != fake.__name__)  # the fake replaces the real one
    monkeypatch.setattr(commands, "modules", lambda: (*real, fake))
    args = build_parser().parse_args(["account", "login", "ui-effects", "tiktok", "--json"])
    assert args.account == "ui-effects" and args.platform == "tiktok" and args.json is True
    args.handler(args)
    assert seen["args"] == ("ui-effects", "tiktok")
