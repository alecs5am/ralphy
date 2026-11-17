"""`ralphy content new|list|show|save|restore|path`: Content folders under <account>/videos/<nnn>-<slug>/.

A folder holds the working tree (`index.html` and its files), its one working render `render.mp4` (made by
`ralphy render`), code snapshots in `versions/vN/` (made by `save`, brought back by `restore`), append-only
`media/` and `notes.md`. Other modules add subcommands by exposing `register_content(subparsers)`; see
`ralphy.commands.extensions`.
"""

from __future__ import annotations

from .. import files, model
from . import Output, extensions


def content_summary(item: model.Content) -> dict:
    meta, _ = item.notes()
    return {
        "id": item.id,
        "account": item.account,
        "number": item.number,
        "slug": item.slug,
        "title": meta.get("title") or item.slug,
        "path": str(item.path),
        **model.render_state(item),
        "versions": item.versions(),
        "created_at": meta.get("created_at"),
    }


def posts_for(content_id: str) -> tuple[list[dict], list[dict]]:
    """Every posts.csv row and the latest stats.csv rows for `content_id`, across all accounts."""
    posts: list[dict] = []
    stats: list[dict] = []
    for account in model.all_accounts_with_inbox():
        posts.extend(row for row in model.read_posts(account) if row.get("content") == content_id)
        stats.extend(row for row in model.read_stats(account) if row.get("content") == content_id)
    return posts, model.latest_stats(stats)


def content_detail(item: model.Content) -> dict:
    meta, body = item.notes()
    versions = []
    for name in item.versions():
        path = item.versions_dir / name
        versions.append({
            "name": name,
            "path": str(path),
            "note": model.version_note(item, name),
            "saved_at": files.iso_time(path.stat().st_mtime),
        })
    posts, stats = posts_for(item.id)
    return {
        "id": item.id,
        "account": item.account,
        "number": item.number,
        "slug": item.slug,
        "title": meta.get("title") or item.slug,
        "path": str(item.path),
        "meta": meta,
        "body": body,
        **model.render_state(item),
        "versions": versions,
        "media": sorted(p.relative_to(item.media_dir).as_posix() for p in item.media_dir.rglob("*")
                        if p.is_file() and p.name != ".DS_Store") if item.media_dir.is_dir() else [],
        "posts": posts,
        "latest_stats": stats,
    }


def render_label(state: dict) -> str:
    if not state.get("render"):
        return "not rendered"
    return "stale render" if state.get("render_stale") else "rendered"


def run_new(args) -> Output:
    item, warnings = model.create_content(args.account, args.title, refs=args.ref)
    data = {"content": content_summary(item), "warnings": warnings}
    return Output(data, f"Created {item.id}\n{item.path}")


def run_list(args) -> Output:
    items = [content_summary(c) for c in model.list_content(args.account)]
    if not items:
        hint = "No content yet. Create some with `ralphy content new <account|inbox> \"<title>\"`."
        return Output({"content": []}, hint)
    width = max(len(i["id"]) for i in items)
    lines = []
    for i in items:
        count = len(i["versions"])
        state = f"{render_label(i)}, {count} version{'' if count == 1 else 's'}"
        lines.append(f"{i['id']:<{width}}  {state:<28} {i['title']}")
    return Output({"content": items}, "\n".join(lines))


def run_show(args) -> Output:
    item = model.resolve_content(args.id)
    detail = content_detail(item)
    lines = [f"{detail['title']} ({detail['id']})", detail["path"]]
    if detail["render"]:
        stale = " (older than the working tree; `ralphy render` refreshes it)" if detail["render_stale"] else ""
        lines.append(f"render: {detail['render']}, {detail['rendered_at']}{stale}")
    else:
        lines.append(f"render: none yet (`ralphy render {item.id}`)")
    for version in detail["versions"]:
        note = f" - {version['note']}" if version["note"] else ""
        lines.append(f"  {version['name']}{note}")
    for post in detail["posts"]:
        url = post.get("url") or ""
        lines.append(f"post {post['id']}: {post['account']} {post['platform']} {post['status']} {url}".rstrip())
    return Output({"content": detail}, "\n".join(lines))


def run_save(args) -> Output:
    item = model.resolve_content(args.id)
    result = model.save_version(item, note=args.message)
    data = {"id": item.id, **result}
    return Output(data, f"Saved {item.id} {result['version']} ({result['files']} files)\n{result['path']}")


def run_restore(args) -> Output:
    item = model.resolve_content(args.id)
    result = model.restore_version(item, args.version)
    data = {"id": item.id, **result, **model.render_state(item)}
    version, before = result["version"], result["before"]
    if not result["written"] and not result["removed"]:
        text = f"{item.id}: the working tree already equals {version}"
    else:
        kept = f"saved the previous tree as {before}" if result["saved"] else f"the previous tree is {before}"
        text = (f"Restored {item.id} {version} ({len(result['written'])} written, {len(result['removed'])} removed); "
                f"{kept}.\nRender it with `ralphy render {item.id}`.")
    return Output(data, text)


def run_path(args) -> Output:
    item = model.resolve_content(args.id)
    return Output({"id": item.id, "path": str(item.path)}, str(item.path))


def register(subparsers) -> None:
    parser = subparsers.add_parser("content", help="Content: new, list, show, save, restore, path",
                                   description=__doc__)
    sub = parser.add_subparsers(dest="content_command", metavar="<command>")

    new = sub.add_parser("new", help="create videos/<nnn>-<slug>/ with notes.md, media/ and index.html")
    new.add_argument("account", help="account slug, or inbox")
    new.add_argument("title", help="title; the folder slug is its kebab-case form")
    new.add_argument("--ref", action="append", default=[], help="reference path under the account folder, or URL")
    new.set_defaults(handler=run_new)

    listing = sub.add_parser("list", help="list content")
    listing.add_argument("--account", help="only this account (or inbox)")
    listing.set_defaults(handler=run_list)

    show = sub.add_parser("show", help="notes, render, versions, posts")
    show.add_argument("id", help="content id")
    show.set_defaults(handler=run_show)

    save = sub.add_parser("save", help="snapshot the working tree's code as the next version")
    save.add_argument("id", help="content id")
    save.add_argument("-m", "--message", help="a note for this version")
    save.set_defaults(handler=run_save)

    restore = sub.add_parser("restore", help="save the working tree, then make it equal a version",
                             description="Save the working tree as a new version (note `before restore of vN`), "
                                         "then write vN's files into it and remove code files vN does not have. "
                                         "media/, render.mp4 and the other versions are never touched.")
    restore.add_argument("id", help="content id")
    restore.add_argument("version", help="version, e.g. v2")
    restore.set_defaults(handler=run_restore)

    path = sub.add_parser("path", help="print the content folder")
    path.add_argument("id", help="content id")
    path.set_defaults(handler=run_path)

    for extend in extensions("content"):
        extend(sub)
