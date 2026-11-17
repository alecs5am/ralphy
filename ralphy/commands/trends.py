"""`ralphy trends --list` and `ralphy trends <niche> [--limit n]`: read the hosted trend base (RALPHY_TRENDS_URL).

Responses are cached for 6 hours under the cache dir; `--refresh` skips the cache. When the host is down a
cached copy is served with a warning.
"""

from __future__ import annotations

import re

from .. import hosted, paths
from ..errors import RalphyError
from . import Output

_NICHE = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")


def _cache_root():
    return paths.cache_dir() / "trends"


def _warnings(meta: dict) -> list[str]:
    return [meta["warning"]] if meta.get("warning") else []


def _number(value) -> str:
    if not isinstance(value, (int, float)):
        return "?"
    for unit, size in (("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if value >= size:
            return f"{value / size:.1f}{unit}"
    return str(int(value))


def run_list(args) -> Output:
    data, meta = hosted.fetch_json(f"{paths.trends_url()}/index.json", _cache_root() / "index.json",
                                   refresh=args.refresh, unreachable_code="E_TRENDS_UNREACHABLE")
    niches = [n for n in data.get("niches") or [] if isinstance(n, dict)]
    payload = {"updated_at": data.get("updated_at"), "niches": niches, **meta, "warnings": _warnings(meta)}
    lines = [f"{n.get('slug', '?'):<28} {n.get('videos', '?'):>5} videos  {n.get('name') or ''}" for n in niches]
    return Output(payload, "\n".join(lines) or "No niches in the trend base.")


def run_niche(args) -> Output:
    niche = args.niche.strip().lower()
    if not _NICHE.match(niche):
        raise RalphyError("E_USAGE", f"'{args.niche}' is not a niche slug", "List niches with `ralphy trends --list`.")
    not_found = RalphyError("E_NICHE_NOT_FOUND", f"The trend base has no niche '{niche}'",
                            "List niches with `ralphy trends --list`.")
    data, meta = hosted.fetch_json(
        f"{paths.trends_url()}/{niche}/latest.json",
        _cache_root() / "niches" / f"{niche}.json",
        refresh=args.refresh,
        unreachable_code="E_TRENDS_UNREACHABLE",
        not_found=not_found,
    )
    items = [i for i in data.get("items") or [] if isinstance(i, dict)]
    shown = items[: args.limit] if args.limit and args.limit > 0 else items
    payload = {
        "niche": data.get("niche") or niche,
        "updated_at": data.get("updated_at"),
        "total": len(items),
        "items": shown,
        **meta,
        "warnings": _warnings(meta),
    }
    lines = []
    for item in shown:
        multiplier = item.get("multiplier")
        mult = f"x{multiplier:.1f}" if isinstance(multiplier, (int, float)) else "x?"
        lines.append(f"{mult:>6} {_number(item.get('views')):>7}  {item.get('platform') or '?':<9} "
                     f"{(item.get('title') or '')[:60]}  {item.get('url') or ''}")
    return Output(payload, "\n".join(lines) or f"No items for {niche}.")


def run(args) -> Output:
    if args.list or not args.niche:
        return run_list(args)
    return run_niche(args)


def register(subparsers) -> None:
    parser = subparsers.add_parser("trends", help="read the hosted trend base", description=__doc__)
    parser.add_argument("--list", action="store_true", help="list the niches")
    parser.add_argument("niche", nargs="?", help="niche slug, e.g. ui-motion")
    parser.add_argument("--limit", type=int, default=20, help="items to show (default 20, 0 for all)")
    parser.add_argument("--refresh", action="store_true", help="skip the cache and fetch now")
    parser.set_defaults(handler=run)
