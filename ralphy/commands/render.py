"""`ralphy render <id>`: render the working tree to `render.mp4` with HyperFrames, replacing the previous render.

HyperFrames writes into a temporary folder; the result is checked with ffprobe and then replaces `render.mp4`
in one step, so a failed render leaves the previous one in place. Versions are code snapshots and are not
rendered; restore one with `ralphy content restore <id> vN` to render it. Progress goes to stderr.
"""

from __future__ import annotations

from .. import hyperframes, model
from . import Output


def _size(n: int) -> str:
    return f"{n / 1_000_000:.1f} MB" if n >= 100_000 else f"{n / 1000:.1f} KB"


def describe(result: dict) -> str:
    duration = f"{result['duration']:.2f} s" if result.get("duration") is not None else "duration unknown"
    return f"Rendered {result['id']}: {result['path']} ({duration}, {_size(result['bytes'])})"


def run(args) -> Output:
    content = model.resolve_content(args.id)
    result = hyperframes.render_content(content)
    return Output(result, describe(result))


def register(subparsers) -> None:
    parser = subparsers.add_parser("render", help="render the working tree to render.mp4", description=__doc__)
    parser.add_argument("id", help="content id, e.g. ui-effects/001-type-charge")
    parser.set_defaults(handler=run)
