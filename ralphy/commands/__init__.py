"""Verb modules. Every module here is discovered by `ralphy.cli`; add a verb by adding a module.

A verb module exposes `register(subparsers)`: it adds its parser with `subparsers.add_parser(...)` and sets
`handler=<fn>` through `set_defaults`. A handler takes the parsed `argparse.Namespace` and returns a dict
(the JSON payload, `ok` is added for it), an `Output` (payload plus human text), or a `Passthrough` (the
child process already wrote its own output; carry its exit code). Failures raise `RalphyError`.

Extending another verb: a module may also expose `register_<verb>(verb_subparsers)`, e.g.
`register_account(subparsers)`; the `account` verb calls every such function it finds (see `extensions`),
so `account login|check|open` can live in `ralphy/commands/account_browser.py` without editing
`account.py`. A module with only `register_<verb>` and no `register` adds no top-level verb.

Import heavy dependencies (patchright, ...) inside handlers, not at module level: every module is imported
on every run. A module that fails to import is reported on stderr and skipped, so the other verbs work.
"""

from __future__ import annotations

import importlib
import pkgutil
import sys
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from types import ModuleType


@dataclass
class Output:
    """A handler result: `data` becomes the JSON payload, `text` is printed without `--json`."""

    data: dict
    text: str | None = None


@dataclass
class Passthrough:
    """A handler result for a child process that already wrote to stdout and stderr itself."""

    exit_code: int


@cache
def modules() -> tuple[ModuleType, ...]:
    found = []
    for info in sorted(pkgutil.iter_modules(__path__), key=lambda i: i.name):
        if info.name.startswith("_"):
            continue
        try:
            found.append(importlib.import_module(f"{__name__}.{info.name}"))
        except Exception as exc:  # noqa: BLE001 - one broken verb must not break the others
            sys.stderr.write(f"ralphy: skipped verb module {info.name}: {type(exc).__name__}: {exc}\n")
    return tuple(found)


def extensions(verb: str) -> list[Callable]:
    """Every `register_<verb>` function exposed by a verb module, in module-name order."""
    name = f"register_{verb.replace('-', '_')}"
    return [getattr(module, name) for module in modules() if callable(getattr(module, name, None))]
