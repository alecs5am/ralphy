"""JSON the panel reads. Shapes extend `ralphy account show`, `content list` and `content show` with URLs.

Every path the page may hand to the agent stays absolute (`path`, `render`, `drag_path`); every file the page
loads gets a URL under `/files/`, `/poster/` or `/preview/`. The render (`render.mp4`) plays as a file; the
working tree (`live_url`) and every version (`preview_url`) play live in the HyperFrames player.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import quote

from .. import model
from ..commands.account import account_detail, account_summary
from ..commands.content import content_detail, content_summary
from ..post.analytics import FIELDS as ANALYTICS_FIELDS
from ..post.analytics import newest
from ..post.platforms import post_id
from .media import Probes, file_url, is_video, poster_url

COLORS = ("d1", "d2", "d3", "d4", "d5")
ACTIVE_POSTS = ("planned", "approved", "uploading")
ATTENTION_POSTS = ("unknown", "failed", "needs_login")


def monogram(name: str) -> str:
    words = [w for w in re.split(r"[\s_-]+", name.strip()) if w]
    if not words:
        return "?"
    first = words[0]
    if first.isupper() and len(first) <= 3:
        return first
    if len(words) == 1:
        return first[:2].upper()
    return (words[0][0] + words[1][0]).upper()


def account_faces(home: Path) -> dict[str, dict]:
    """Name, monogram and colour token per account slug (inbox included); colours follow the slug order."""
    faces = {}
    for index, account in enumerate(model.list_accounts(home)):
        faces[account.slug] = {"slug": account.slug, "name": account.name, "monogram": monogram(account.name),
                               "color": COLORS[index % len(COLORS)]}
    faces[model.INBOX] = {"slug": model.INBOX, "name": "Inbox", "monogram": "IN", "color": "df"}
    return faces


def _sum(rows: list[dict], column: str):
    values = [r.get(column) for r in rows if isinstance(r.get(column), (int, float))]
    return sum(values) if values else None


def _posts_sorted(posts: list[dict]) -> list[dict]:
    return sorted(posts, key=lambda p: (p.get("scheduled_at") or p.get("posted_at") or "", p.get("id") or ""))


# ---------------------------------------------------------------- stats on posts

HISTORY = 30  # snapshots kept per post for the trend line


def _stats_index(account: model.Account) -> dict[tuple[str, str], list[dict]]:
    """Snapshots per (platform, platform post id), oldest first, from the account's stats.csv."""
    index: dict[tuple[str, str], list[dict]] = {}
    for row in model.read_stats(account):
        key = post_id(row.get("platform") or "", row.get("url"))
        if key:
            index.setdefault((row["platform"], key), []).append(row)
    for rows in index.values():
        rows.sort(key=lambda r: r.get("fetched_at") or "")
    return index


def _analytics_index(account: model.Account) -> dict[tuple[str, str], dict]:
    """The newest analytics record per (platform, platform post id), from the account's analytics.jsonl."""
    index: dict[tuple[str, str], dict] = {}
    for row in newest(model.read_analytics(account)):
        key = post_id(str(row.get("platform") or ""), row.get("url"))
        if key:
            index[(str(row["platform"]), key)] = {k: row[k] for k in (*ANALYTICS_FIELDS, "fetched_at") if k in row}
    return index


def _with_stats(posts: list[dict], index: dict[tuple[str, str], list[dict]], history: bool = False,
                deep: dict[tuple[str, str], dict] | None = None) -> list[dict]:
    """Each published post gets `stats` (the newest snapshot's numbers and time) and, with `history`, the
    views over time; with `deep`, its newest `analytics` (retention, average view, finish)."""
    out = []
    for post in posts:
        key = post_id(post.get("platform") or "", post.get("url"))
        rows = index.get((post.get("platform"), key), []) if key else []
        post = dict(post)
        if deep is not None:
            post["analytics"] = deep.get((post.get("platform"), key)) if key else None
        if rows:
            newest = rows[-1]
            post["stats"] = {column: newest.get(column) for column in (*model.STATS_NUMBERS, "fetched_at")}
            if history:
                post["history"] = [{"at": r.get("fetched_at"), "views": r.get("views")} for r in rows[-HISTORY:]]
        else:
            post["stats"] = None
        out.append(post)
    return out


def _totals(posts: list[dict]) -> dict:
    measured = [p["stats"] for p in posts if p.get("status") == "published" and p.get("stats")]
    totals = {column: _sum(measured, column) for column in model.STATS_NUMBERS}
    totals["at"] = max((m.get("fetched_at") or "" for m in measured), default="") or None
    totals["posts"] = len(measured)
    return totals


# ---------------------------------------------------------------- accounts


def accounts(home: Path) -> dict:
    faces = account_faces(home)
    out = []
    for account in model.list_accounts(home):
        summary = account_summary(account)
        posts = _with_stats(model.read_posts(account), _stats_index(account))
        summary.update(faces[account.slug])
        statuses = Counter(p.get("status") or "unknown" for p in posts)
        own = {item.id for item in model.list_content(account.slug, home=home)}
        posted = {p.get("content") for p in posts if p.get("content") and p.get("status") != "cancelled"}
        summary.update({
            "counts": {"videos": summary["videos"], "posts": dict(statuses)},
            "videos": len(own | posted),  # its own videos and every video posted or planned to it
            "posts": _posts_sorted(posts),
            "totals": _totals(posts),  # the numbers of the posts Ralphy made, not of the whole profile
        })
        out.append(summary)
    inbox_count = len(model.list_content(model.INBOX, home=home)) if (home / model.INBOX).is_dir() else 0
    return {"home": str(home), "accounts": out, "inbox": {"videos": inbox_count}}


def account(home: Path, slug: str) -> dict:
    acct = model.get_account(slug, home)
    detail = account_detail(acct)
    detail.update(account_faces(home).get(acct.slug, {}))
    detail["posts"] = _posts_sorted(model.read_posts(acct))
    return {"account": detail}


# ---------------------------------------------------------------- content


def _render(item_data: dict) -> Path | None:
    return Path(item_data["render"]) if item_data.get("render") else None


def preview_base(item: model.Content) -> str:
    return f"/preview/{quote(item.account)}/{quote(item.folder)}"


def _live_url(item: model.Content) -> str | None:
    return f"{preview_base(item)}/work/index.html" if (item.path / "index.html").is_file() else None


def _post_counts(posts: list[dict]) -> dict:
    statuses = Counter(p.get("status") for p in posts)
    return {
        "planned": sum(statuses[s] for s in ACTIVE_POSTS),
        "published": statuses["published"],
        "attention": sum(statuses[s] for s in ATTENTION_POSTS),
    }


def _all_posts(home: Path, history: bool = False) -> dict[str, list[dict]]:
    """Every post with its stats, by content id; each row carries its `account`."""
    by_content: dict[str, list[dict]] = {}
    for acct in model.all_accounts_with_inbox(home):
        deep = _analytics_index(acct) if history else None
        for row in _with_stats(model.read_posts(acct), _stats_index(acct), history, deep):
            if row.get("content"):
                by_content.setdefault(row["content"], []).append(row)
    return by_content


def _summary(item: model.Content, data: dict, home: Path, posts: list[dict], probe: dict | None,
             faces: dict) -> dict:
    render = _render(data)
    versions = data["versions"]
    face = faces.get(item.account) or {}
    live = _live_url(item)
    data.update({
        "state": "ready" if render and not data["render_stale"] else "work",
        "latest": versions[-1] if versions else None,
        "live": live is not None,
        "live_url": live,
        "media_url": file_url(render, home, stamp=True),
        "poster": poster_url(render, home),
        "drag_path": str(render) if render else str(item.path),
        "duration": (probe or {}).get("duration"),
        "audio": (probe or {}).get("audio"),
        "posts": _post_counts(posts),
        "post_accounts": sorted({p["account"] for p in posts if p.get("account") and p.get("status") != "cancelled"}),
        "views": _sum([p["stats"] for p in posts if p.get("status") == "published" and p.get("stats")], "views"),
        "color": face.get("color"),
        "account_name": face.get("name"),
    })
    return data


def content_list(home: Path, probes: Probes) -> dict:
    items = model.list_content(home=home)
    faces = account_faces(home)
    posts = _all_posts(home)
    summaries = {item.id: content_summary(item) for item in items}
    renders = {item.id: _render(summaries[item.id]) for item in items if summaries[item.id]["render"]}
    probed = probes.many(list(renders.values()))
    out = [_summary(item, summaries[item.id], home, posts.get(item.id, []), probed.get(renders.get(item.id)), faces)
           for item in items]
    return {"home": str(home), "content": out}


def _ref(raw: str, acct_path: Path, home: Path) -> dict:
    if re.match(r"^[a-z][a-z0-9+.-]*://", raw, re.I):
        return {"ref": raw, "kind": "url", "url": raw, "title": None, "path": None, "exists": False}
    folder = (acct_path / raw).resolve()
    info: dict = {"ref": raw, "kind": "local", "path": str(folder), "exists": folder.exists(), "url": None,
                  "title": None, "author": None, "platform": None, "published_at": None, "metrics": None}
    source = folder / "source.json" if folder.is_dir() else None
    if source and source.is_file():
        try:
            meta = json.loads(source.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            meta = {}
        if isinstance(meta, dict):
            for key in ("url", "title", "author", "platform", "published_at", "metrics"):
                info[key] = meta.get(key)
    video = None
    if folder.is_dir():
        candidates = sorted(p for p in folder.iterdir() if p.is_file() and is_video(p))
        video = next((p for p in candidates if p.stem == "source"), candidates[0] if candidates else None)
    elif folder.is_file() and is_video(folder):
        video = folder
    info["video"] = str(video) if video else None
    info["media_url"] = file_url(video, home)
    info["poster"] = poster_url(video, home)
    info["drag_path"] = str(video or folder)
    return info


def content(home: Path, probes: Probes, account_slug: str, folder: str) -> dict:
    item = model.resolve_content(f"{account_slug}/{folder}", home)
    detail = content_detail(item)
    faces = account_faces(home)
    render = _render(detail)
    probe = probes.many([render]).get(render) if render else None
    base = preview_base(item)
    for version in detail["versions"]:
        version["preview_url"] = (f"{base}/{version['name']}/index.html"
                                  if (item.versions_dir / version["name"] / "index.html").is_file() else None)
    meta = detail["meta"]
    acct_path = item.account_path
    detail.update({
        "state": "ready" if render and not detail["render_stale"] else "work",
        "media_url": file_url(render, home, stamp=True),
        "poster": poster_url(render, home),
        "duration": (probe or {}).get("duration"),
        "audio": (probe or {}).get("audio"),
        "drag_path": str(render) if render else str(item.path),
        "live_url": _live_url(item),
        "refs": [_ref(str(r), acct_path, home) for r in (meta.get("refs") or []) if r],
        "posts": _posts_sorted(_all_posts(home, history=True).get(item.id, [])),
        "face": faces.get(item.account),
        "caption": meta.get("caption") or None,
    })
    detail.pop("media", None)
    return {"content": detail}
