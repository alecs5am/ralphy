"""`ralphy lib search <query> [--kind]` and `ralphy lib get <id> [--out <dir>]`: the hosted library.

The base URL is RALPHY_LIBRARY_URL (default https://ralphy-library.web.app/library/v1).

Search matches every query word against id, name, category, summary and tags. `get` downloads the item's
file into the cache (verified against its sha256) and optionally copies it into `--out`; it never
overwrites a different file there.
"""

from __future__ import annotations

import filecmp
from pathlib import Path, PurePosixPath

from .. import files, hosted, paths
from ..errors import RalphyError
from . import Output

KINDS = ("motion", "video", "prompt")


def _cache_root() -> Path:
    return paths.cache_dir() / "library"


def load_index(refresh: bool = False) -> tuple[list[dict], dict]:
    data, meta = hosted.fetch_json(f"{paths.library_url()}/index.json", _cache_root() / "index.json",
                                   refresh=refresh, unreachable_code="E_LIBRARY_UNREACHABLE")
    items = [i for i in data.get("items") or [] if isinstance(i, dict) and i.get("id")]
    return items, {**meta, "updated_at": data.get("updated_at")}


def _tags(item: dict) -> list[str]:
    tags = item.get("tags") or []
    return [str(t).lower() for t in tags] if isinstance(tags, list) else [str(tags).lower()]


def score(item: dict, words: list[str]) -> int:
    """0 when any word is missing; otherwise higher for tag, id and name hits."""
    fields = {key: str(item.get(key) or "").lower() for key in ("id", "name", "category", "summary")}
    tags = _tags(item)
    total = 0
    for word in words:
        points = 0
        if word in tags:
            points += 6
        elif any(word in tag for tag in tags):
            points += 3
        if word in fields["id"] or word in fields["name"]:
            points += 4
        if word in fields["category"]:
            points += 2
        if word in fields["summary"]:
            points += 1
        if points == 0:
            return 0
        total += points
    return total


def search(items: list[dict], query: str, kind: str | None = None) -> list[dict]:
    words = [w for w in query.lower().split() if w]
    pool = [i for i in items if not kind or i.get("kind") == kind]
    if not words:
        return sorted(pool, key=lambda i: str(i.get("name") or i["id"]).lower())
    scored = [(score(i, words), i) for i in pool]
    return [i for s, i in sorted(scored, key=lambda pair: (-pair[0], str(pair[1].get("name") or pair[1]["id"]).lower()))
            if s > 0]


def _warnings(meta: dict) -> list[str]:
    return [meta["warning"]] if meta.get("warning") else []


def run_search(args) -> Output:
    items, meta = load_index(args.refresh)
    found = search(items, " ".join(args.query), args.kind)
    shown = found[: args.limit] if args.limit and args.limit > 0 else found
    payload = {"query": " ".join(args.query), "kind": args.kind, "total": len(found), "items": shown, **meta,
               "warnings": _warnings(meta)}
    lines = [f"{i['id']:<36} {i.get('kind') or '?':<7} {i.get('name') or ''}  {i.get('summary') or ''}"[:160]
             for i in shown]
    return Output(payload, "\n".join(lines) or "No matches.")


def _safe_relative(value: str) -> PurePosixPath:
    rel = PurePosixPath(str(value).lstrip("/"))
    if not value or rel.is_absolute() or ".." in rel.parts or str(value).startswith("/") or "://" in str(value):
        raise RalphyError("E_BAD_RESPONSE", f"The library path '{value}' is not a relative path")
    return rel


def run_get(args) -> Output:
    items, meta = load_index(args.refresh)
    item = next((i for i in items if i["id"] == args.id), None)
    if item is None:
        raise RalphyError("E_LIB_NOT_FOUND", f"The library has no item '{args.id}'",
                          "Find ids with `ralphy lib search <query>`.")
    entries = item.get("files") if isinstance(item.get("files"), list) and item.get("files") else [item.get("path")]
    if not entries or not entries[0]:
        raise RalphyError("E_BAD_RESPONSE", f"Library item '{args.id}' has no path")
    warnings = _warnings(meta)
    downloaded = []
    for entry in entries:
        rel = _safe_relative(entry if isinstance(entry, str) else entry.get("path", ""))
        if len(entries) == 1:
            expected = item.get("sha256")
        else:
            expected = entry.get("sha256") if isinstance(entry, dict) else None
        target = _cache_root() / "files" / Path(*rel.parts)
        url = f"{paths.library_url()}/{rel.as_posix()}"
        try:
            source = hosted.download(url, target, expected)
        except hosted.NotFound:
            raise RalphyError("E_LIB_NOT_FOUND", f"{url} is missing on the host", "The library may be mid-update.") \
                from None
        except hosted.Unreachable as exc:
            raise RalphyError("E_LIBRARY_UNREACHABLE", f"Cannot download {url}: {exc}",
                              "Check the network and retry; this file is not cached yet.") from None
        if source == "stale":
            warnings.append(f"host unreachable; using the cached {target}")
        record = {"path": str(target), "source": source, "bytes": target.stat().st_size}
        if args.out:
            out_dir = Path(args.out).expanduser().absolute()
            out_dir.mkdir(parents=True, exist_ok=True)
            copy = out_dir / rel.name
            if not copy.exists() or not filecmp.cmp(copy, target, shallow=False):
                try:
                    files.place_new(target, copy)
                except FileExistsError:
                    raise RalphyError("E_EXISTS", f"{copy} already exists with other content",
                                      "Ralphy never overwrites files; pick another --out folder.") from None
            record["out"] = str(copy)
        downloaded.append(record)
    payload = {"item": item, "files": downloaded, **meta, "warnings": warnings}
    text = "\n".join(f.get("out") or f["path"] for f in downloaded)
    return Output(payload, text)


def register(subparsers) -> None:
    parser = subparsers.add_parser("lib", help="search and fetch the hosted library", description=__doc__)
    sub = parser.add_subparsers(dest="lib_command", metavar="<command>")

    find = sub.add_parser("search", help="find components, video blocks and prompts")
    find.add_argument("query", nargs="*", help="words; every word must match")
    find.add_argument("--kind", choices=KINDS, help="only this kind")
    find.add_argument("--limit", type=int, default=20, help="items to show (default 20, 0 for all)")
    find.add_argument("--refresh", action="store_true", help="skip the cached index")
    find.set_defaults(handler=run_search)

    get = sub.add_parser("get", help="download an item into the cache and print its path")
    get.add_argument("id", help="item id from `ralphy lib search`")
    get.add_argument("--out", help="also copy the file into this folder")
    get.add_argument("--refresh", action="store_true", help="skip the cached index")
    get.set_defaults(handler=run_get)
