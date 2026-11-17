"""`ralphy panel [--port 4777] [--no-open]`, `ralphy panel stop`, `ralphy panel --foreground`: the local panel.

`ralphy panel` returns at once and is safe to repeat: when a panel already runs it prints that URL and opens
it in the browser; otherwise it starts the server in the background (it keeps running after this command
exits), waits for it to answer, opens the browser and prints the URL. `--no-open` skips the browser. The port
is 4777, or the next free one when it is busy. `--json` prints `{"ok": true, "url", "pid", "started", "home"}`.
`ralphy panel stop` stops it. `--foreground` runs the server in this terminal until Ctrl+C (development); with
`--json` its first stdout line is `{"ok": true, "url", "port", "pid", "home"}`.

The server listens on 127.0.0.1 only, logs to `~/.cache/ralphy/panel/server.log` in the background, and
writes nothing but the approve and cancel clicks on planned posts.
"""

from __future__ import annotations

import argparse

from ..errors import RalphyError
from . import Output, Passthrough


def run(args) -> Output | Passthrough:
    from ..panel import launch

    if args.foreground:
        from ..panel.server import serve

        if not args.detached:
            current = launch.running()
            if current:
                raise RalphyError("E_PANEL_RUNNING", f"A panel already runs at {current['url']} (pid {current['pid']})",
                                  "Use it, or stop it with `ralphy panel stop` first.")
        return Passthrough(serve(args.port, open_browser=not args.no_open and not args.detached,
                                 as_json=bool(getattr(args, "json", False)),
                                 mode="background" if args.detached else "foreground"))
    data = launch.ensure(args.port, open_browser=not args.no_open)
    if data["started"]:
        text = (f"Ralphy panel: {data['url']}\nRunning in the background (pid {data['pid']}); "
                "`ralphy panel stop` stops it.")
    else:
        text = f"Ralphy panel: {data['url']} (already running, pid {data['pid']})"
    data.pop("opened", None)
    return Output(data, text)


def run_stop(args) -> Output:
    from ..panel import launch

    data = launch.stop()
    if data["stopped"]:
        text = f"Stopped the panel at {data['url']} (pid {data['pid']})."
    else:
        text = "No panel is running."
    return Output(data, text)


def register(subparsers) -> None:
    parser = subparsers.add_parser("panel", help="open the local panel (Content, Accounts); starts it when needed",
                                   description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=4777, help="port on 127.0.0.1 (default 4777, next free if busy)")
    parser.add_argument("--no-open", action="store_true", help="do not open the browser")
    parser.add_argument("--open", action="store_true", help=argparse.SUPPRESS)  # the default now; kept for old calls
    parser.add_argument("--foreground", action="store_true", help="run the server in this terminal until Ctrl+C")
    parser.add_argument("--detached", action="store_true", help=argparse.SUPPRESS)  # set for the background child
    parser.set_defaults(handler=run)
    sub = parser.add_subparsers(dest="panel_command", metavar="<command>")
    stop = sub.add_parser("stop", help="stop the background panel")
    stop.set_defaults(handler=run_stop)
