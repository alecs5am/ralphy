"""`ralphy` entry point: an argparse root that discovers every verb in `ralphy/commands/`.

`--json` works before or after the verb. With it, stdout carries exactly one JSON object: the handler's
payload with `"ok": true`, or `{"ok": false, "error": {"code", "message", "hint"}}` with exit code 1.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import traceback
from pathlib import Path

from . import __version__
from .commands import Output, Passthrough, modules
from .errors import RalphyError


class RalphyParser(argparse.ArgumentParser):
    """Raises `E_USAGE` instead of exiting, and accepts `--json` on every parser level."""

    def __init__(self, *args, root: bool = False, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        if root:
            self.add_argument("--json", action="store_true", default=False, help="print one JSON object on stdout")
        else:
            self.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help=argparse.SUPPRESS)

    def error(self, message: str):  # type: ignore[override]
        raise RalphyError("E_USAGE", message, f"Run `{self.prog} --help` for usage.")


def build_parser() -> RalphyParser:
    parser = RalphyParser(
        prog="ralphy",
        description="Ralphy: Content and Accounts on plain files, HyperFrames renders, trends and the hosted library.",
        root=True,
    )
    parser.add_argument("--version", dest="show_version", action="store_true", help="print the version and exit")
    subparsers = parser.add_subparsers(dest="verb", metavar="<verb>")
    for module in modules():
        register = getattr(module, "register", None)
        if callable(register):
            register(subparsers)
    parser.set_defaults(verbs=sorted(subparsers.choices))
    return parser


def _default(value):
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if isinstance(value, (set, tuple)):
        return list(value)
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def print_json(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, default=_default) + "\n")
    sys.stdout.flush()


def _human(data: dict) -> str:
    from .files import dump_yaml

    shown = {k: v for k, v in data.items() if k not in ("ok", "warnings")}
    return dump_yaml(json.loads(json.dumps(shown, default=_default))).rstrip()


def _emit_error(error: RalphyError, as_json: bool) -> int:
    if as_json:
        print_json({"ok": False, "error": error.to_dict()})
    else:
        sys.stderr.write(f"error: {error.message}\n")
        if error.hint:
            sys.stderr.write(f"hint: {error.hint}\n")
    return 1


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in argv[: argv.index("--") if "--" in argv else len(argv)]
    try:
        parser = build_parser()
        args = parser.parse_args(argv)
        as_json = bool(getattr(args, "json", False))
        if args.show_version:
            if as_json:
                print_json({"ok": True, "version": __version__})
            else:
                print(f"ralphy {__version__}")
            return 0
        handler = getattr(args, "handler", None)
        if handler is None:
            if args.verb is None:
                if as_json:
                    print_json({"ok": True, "version": __version__, "verbs": args.verbs})
                else:
                    parser.print_help()
                return 0
            raise RalphyError("E_USAGE", f"`ralphy {args.verb}` needs a subcommand",
                              f"Run `ralphy {args.verb} --help`.")
        result = handler(args)
        if isinstance(result, Passthrough):
            return result.exit_code
        output = result if isinstance(result, Output) else Output(data=result or {})
        data = output.data
        if as_json:
            print_json({"ok": True, **data})
        else:
            for warning in data.get("warnings") or []:
                sys.stderr.write(f"warning: {warning}\n")
            text = output.text if output.text is not None else _human(data)
            if text:
                print(text)
        return 0
    except RalphyError as error:
        return _emit_error(error, as_json)
    except KeyboardInterrupt:
        return _emit_error(RalphyError("E_INTERRUPTED", "Interrupted"), as_json)
    except BrokenPipeError:
        return 0
    except Exception as exc:  # noqa: BLE001 - the last line of defence maps everything to the error shape
        if os.environ.get("RALPHY_DEBUG"):
            traceback.print_exc()
        return _emit_error(
            RalphyError("E_INTERNAL", f"{type(exc).__name__}: {exc}", "Rerun with RALPHY_DEBUG=1 for a traceback."),
            as_json,
        )


if __name__ == "__main__":
    sys.exit(main())
