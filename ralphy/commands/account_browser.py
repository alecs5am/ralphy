"""`ralphy account login|check|open|pause|resume`: the browser profiles of an Account's platforms.

Each platform of an Account has its own Chrome profile in RALPHY_CONFIG_DIR/profiles/<account>-<platform>/.
The owner signs in by hand in `login`; Ralphy never types a password, code or captcha. `login`, `check` and
`open` write the platform's `status` (ok | needs_login | unknown) and `checked_at` in account.md.
"""

from __future__ import annotations

from ..post import platforms
from . import Output


def _entry_line(entry: dict) -> str:
    text = f"{entry['account']}:{entry['platform']} {entry.get('handle') or '(no handle)'}  [{entry.get('status')}]"
    if entry.get("detail"):
        text += f"  {entry['detail']}"
    return text


def run_login(args) -> Output:
    from ..post import run

    data = run.login(args.account, args.platform, handle=args.handle, timeout_minutes=args.timeout,
                     rebind=args.rebind)
    if data["signed_in"]:
        text = f"Signed in: {_entry_line(data)}"
    elif data["timed_out"]:
        text = f"Not signed in after {args.timeout:g} min: {_entry_line(data)}"
    else:
        text = f"Window closed before sign-in finished: {_entry_line(data)}"
    return Output(data, text)


def run_check(args) -> Output:
    from ..post import run

    data = run.check(args.account, args.platform)
    return Output(data, "\n".join(_entry_line(r) for r in data["results"]))


def run_open(args) -> Output:
    from ..post import run

    data = run.open_account(args.account, args.platform, url=args.url)
    return Output(data, f"Closed {data['profile']} ({data['url']})" + (f": {data['error']}" if data["error"] else ""))


def run_pause(args) -> Output:
    from ..post import run

    data = run.set_paused(args.account, args.platform, True)
    return Output(data, _entry_line(data))


def run_resume(args) -> Output:
    from ..post import run

    data = run.set_paused(args.account, args.platform, False)
    return Output(data, _entry_line(data) + f"\nCheck the session: ralphy account check {data['account']} "
                                            f"{data['platform']}")


def register_account(sub) -> None:
    names = ", ".join(platforms.NAMES)

    login = sub.add_parser("login", help="open the platform's profile; the owner signs in by hand")
    login.add_argument("account", help="account slug")
    login.add_argument("platform", help=names)
    login.add_argument("--handle", help="the account's handle on the platform, e.g. @ui.effects")
    login.add_argument("--timeout", type=float, default=10.0, help="minutes to wait for the sign-in (default 10)")
    login.add_argument("--rebind", action="store_true",
                       help="accept a different platform user than the one this profile was first signed in as")
    login.set_defaults(handler=run_login)

    check = sub.add_parser("check", help="re-check the sessions of an account's platforms")
    check.add_argument("account", help="account slug")
    check.add_argument("platform", nargs="?", help=f"one platform ({names}); default: all")
    check.set_defaults(handler=run_check)

    opened = sub.add_parser("open", help="open a platform's profile for manual work; returns when it is closed")
    opened.add_argument("account", help="account slug")
    opened.add_argument("platform", help=names)
    opened.add_argument("--url", help="page to open (default: the account's profile page)")
    opened.set_defaults(handler=run_open)

    for verb, text in (("pause", "exclude a platform from plan and run"), ("resume", "include a paused platform")):
        parser = sub.add_parser(verb, help=text)
        parser.add_argument("account", help="account slug")
        parser.add_argument("platform", help=names)
        parser.set_defaults(handler=run_pause if verb == "pause" else run_resume)
