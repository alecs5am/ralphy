"""Account and Content on plain files under `RALPHY_HOME` (see docs/plans/2026-11-17-ralphy-v1.md).

An Account is a folder with `account.md`; `inbox/` has the same shape without it. Content lives in
`<account>/videos/<nnn>-<slug>/`: the working tree (`index.html` and the other composition files), its one
working render `render.mp4`, code snapshots in `versions/vN/`, append-only `media/`, and `notes.md`. Its id
is `<account>/<nnn>-<slug>`.
"""

from __future__ import annotations

import filecmp
import html
import os
import re
import shutil
import tempfile
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from . import files, paths
from .errors import RalphyError

INBOX = "inbox"
ACCOUNT_FILE = "account.md"
NOTES_FILE = "notes.md"
VIDEOS_DIR = "videos"
REFS_DIR = "refs"
POSTS_FILE = "posts.csv"
STATS_FILE = "stats.csv"
POSTS_COLUMNS = ("id", "content", "platform", "handle", "status", "scheduled_at", "posted_at", "url", "render",
                 "caption", "error")
STATS_COLUMNS = ("fetched_at", "platform", "handle", "url", "content", "views", "likes", "comments", "shares",
                 "saves")
STATS_NUMBERS = ("views", "likes", "comments", "shares", "saves")
POST_STATUSES = ("planned", "approved", "uploading", "published", "unknown", "failed", "needs_login", "cancelled")
RENDER_FILE = "render.mp4"
MEDIA_DIR = "media"
VERSIONS_DIR = "versions"
# A version is code only: no media/, no other versions, no notes.md (Content metadata, not composition code),
# no render.mp4, and no mp4 file at any depth (renders, stray clones, temp renders). Version previews fall back
# to the working tree for a missing mp4 and to media/ for media.
SNAPSHOT_EXCLUDE = (MEDIA_DIR, VERSIONS_DIR, NOTES_FILE, RENDER_FILE)
SNAPSHOT_SUFFIXES = (".mp4",)
RESERVED_ACCOUNT_SLUGS = (INBOX, VIDEOS_DIR, REFS_DIR)

_FOLDER = re.compile(r"^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)$")
_VERSION = re.compile(r"^v([1-9]\d*)$")
_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

# Russian, Ukrainian and Belarusian letters by code point, so the source stays ASCII (the repo lints Cyrillic).
_CYRILLIC = {
    0x0430: "a", 0x0431: "b", 0x0432: "v", 0x0433: "g", 0x0434: "d", 0x0435: "e", 0x0451: "e", 0x0436: "zh",
    0x0437: "z", 0x0438: "i", 0x0439: "y", 0x043A: "k", 0x043B: "l", 0x043C: "m", 0x043D: "n", 0x043E: "o",
    0x043F: "p", 0x0440: "r", 0x0441: "s", 0x0442: "t", 0x0443: "u", 0x0444: "f", 0x0445: "kh", 0x0446: "ts",
    0x0447: "ch", 0x0448: "sh", 0x0449: "shch", 0x044A: "", 0x044B: "y", 0x044C: "", 0x044D: "e", 0x044E: "yu",
    0x044F: "ya", 0x0454: "ye", 0x0456: "i", 0x0457: "yi", 0x0491: "g", 0x045E: "u",
}


def slugify(text: str, max_length: int = 60) -> str:
    """Lowercase kebab-case ASCII; Cyrillic is transliterated, accents are stripped. Never empty."""
    lowered = text.lower()
    out = []
    for char in lowered:
        code = ord(char)
        if code in _CYRILLIC:
            out.append(_CYRILLIC[code])
        else:
            out.append(char)
    ascii_text = unicodedata.normalize("NFKD", "".join(out)).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    if len(slug) > max_length:
        cut = slug[:max_length]
        slug = cut.rsplit("-", 1)[0] if "-" in cut and slug[max_length] != "-" else cut
        slug = slug.strip("-")
    return slug or "untitled"


def parse_version(value: str) -> str:
    """Accept `v2` or `2`; return `v2`."""
    text = str(value).strip().lower()
    if text.isdigit():
        text = f"v{text}"
    if not _VERSION.match(text):
        raise RalphyError("E_BAD_VERSION", f"'{value}' is not a version", "Versions look like v1, v2, v3.")
    return text


def version_number(name: str) -> int:
    return int(name[1:])


# ---------------------------------------------------------------- Account


@dataclass
class Account:
    slug: str
    path: Path
    meta: dict = field(default_factory=dict)
    body: str = ""

    @property
    def is_inbox(self) -> bool:
        return self.slug == INBOX

    @property
    def name(self) -> str:
        return str(self.meta.get("name") or self.slug)

    @property
    def videos_dir(self) -> Path:
        return self.path / VIDEOS_DIR

    @property
    def posts_path(self) -> Path:
        return self.path / POSTS_FILE

    @property
    def stats_path(self) -> Path:
        return self.path / STATS_FILE


def _load_account(path: Path) -> Account:
    meta, body = files.read_frontmatter(path / ACCOUNT_FILE)
    return Account(slug=path.name, path=path, meta=meta, body=body)


def list_accounts(home: Path | None = None) -> list[Account]:
    """Every folder in the home with an `account.md`, by slug. The inbox is not an Account."""
    root = home or paths.home()
    if not root.is_dir():
        return []
    found = []
    for entry in sorted(root.iterdir()):
        if entry.name.startswith(".") or entry.name == INBOX or not entry.is_dir():
            continue
        if (entry / ACCOUNT_FILE).is_file():
            found.append(_load_account(entry))
    return found


def inbox(home: Path | None = None) -> Account:
    root = home or paths.home()
    return Account(slug=INBOX, path=root / INBOX, meta={"name": "Inbox"}, body="")


def get_account(slug: str, home: Path | None = None) -> Account:
    """An Account by slug (or by its exact name); `inbox` returns the account-less folder."""
    root = home or paths.home()
    key = slug.strip().strip("/")
    if key == INBOX:
        return inbox(root)
    if (root / key / ACCOUNT_FILE).is_file() and "/" not in key and not key.startswith("."):
        return _load_account(root / key)
    candidates = [a for a in list_accounts(root) if a.slug == slugify(key) or a.name.lower() == key.lower()]
    if len(candidates) == 1:
        return candidates[0]
    raise RalphyError(
        "E_ACCOUNT_NOT_FOUND",
        f"No account '{slug}' in {root}",
        "List accounts with `ralphy account list`, or create one with `ralphy account new <name>`.",
    )


def account_template(name: str) -> str:
    return f"# {name}\n\n## Persona\n\n## Style\n\n## Rules\n"


def create_account(name: str, niche: str | None = None, schedule: str | None = None,
                   home: Path | None = None) -> Account:
    root = home or paths.home()
    if not name.strip():
        raise RalphyError("E_USAGE", "The account name is empty",
                          "Pass a name, e.g. `ralphy account new \"UI Effects\"`.")
    slug = slugify(name)
    if slug in RESERVED_ACCOUNT_SLUGS:
        raise RalphyError("E_ACCOUNT_RESERVED", f"'{slug}' is a reserved folder name", "Pick another account name.")
    path = root / slug
    if path.exists():
        raise RalphyError(
            "E_ACCOUNT_EXISTS",
            f"{path} already exists",
            f"Use the existing account (`ralphy account show {slug}`) or pick another name.",
        )
    root.mkdir(parents=True, exist_ok=True)
    meta = {
        "name": name.strip(),
        "niche": niche,
        "schedule": schedule,
        "platforms": [],
        "created_at": files.utc_now(),
    }
    staging = Path(tempfile.mkdtemp(prefix=f".{slug}.", dir=root))
    try:
        files.write_frontmatter(staging / ACCOUNT_FILE, meta, account_template(name.strip()))
        (staging / VIDEOS_DIR).mkdir()
        (staging / REFS_DIR).mkdir()
        os.chmod(staging, 0o777 & ~files.umask())
        os.rename(staging, path)
    except OSError as exc:
        if path.exists():
            raise RalphyError("E_ACCOUNT_EXISTS", f"{path} already exists", "Pick another name.") from exc
        raise
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
    return _load_account(path)


# ---------------------------------------------------------------- Content


@dataclass
class Content:
    account: str
    folder: str
    path: Path

    @property
    def id(self) -> str:
        return f"{self.account}/{self.folder}"

    @property
    def number(self) -> int:
        return int(self.folder.split("-", 1)[0])

    @property
    def slug(self) -> str:
        return self.folder.split("-", 1)[1]

    @property
    def account_path(self) -> Path:
        return self.path.parent.parent

    @property
    def notes_path(self) -> Path:
        return self.path / NOTES_FILE

    @property
    def versions_dir(self) -> Path:
        return self.path / VERSIONS_DIR

    @property
    def media_dir(self) -> Path:
        return self.path / MEDIA_DIR

    @property
    def render_file(self) -> Path:
        """The one working render of the working tree: `render.mp4`."""
        return self.path / RENDER_FILE

    def notes(self) -> tuple[dict, str]:
        if not self.notes_path.exists():
            return {}, ""
        return files.read_frontmatter(self.notes_path)

    def versions(self) -> list[str]:
        if not self.versions_dir.is_dir():
            return []
        names = [p.name for p in self.versions_dir.iterdir() if p.is_dir() and _VERSION.match(p.name)]
        return sorted(names, key=version_number)


def _account_folders(root: Path) -> list[tuple[str, Path]]:
    """`(slug, path)` for every Account plus the inbox when it exists."""
    found = [(a.slug, a.path) for a in list_accounts(root)]
    if (root / INBOX).is_dir():
        found.append((INBOX, root / INBOX))
    return found


def _content_in(account_slug: str, account_path: Path) -> list[Content]:
    videos = account_path / VIDEOS_DIR
    if not videos.is_dir():
        return []
    items = []
    for entry in videos.iterdir():
        if entry.is_dir() and _FOLDER.match(entry.name):
            items.append(Content(account=account_slug, folder=entry.name, path=entry))
    return sorted(items, key=lambda c: (c.number, c.folder))


def list_content(account: str | None = None, home: Path | None = None) -> list[Content]:
    root = home or paths.home()
    if account:
        acct = get_account(account, root)
        return _content_in(acct.slug, acct.path)
    items: list[Content] = []
    for slug, path in _account_folders(root):
        items.extend(_content_in(slug, path))
    return items


def _matches(content: Content, key: str) -> bool:
    return key in (content.folder, content.slug) or (key.isdigit() and int(key) == content.number)


def resolve_content(ref: str, home: Path | None = None) -> Content:
    """Resolve `<account>/<nnn>-<slug>`, `<account>/<slug>`, `<account>/<nnn>`, or a bare form unique in the home."""
    root = home or paths.home()
    key = ref.strip().strip("/")
    if key.startswith("videos/") or "/videos/" in key:
        key = key.replace("/videos/", "/").removeprefix("videos/")
    if not key:
        raise RalphyError("E_USAGE", "Empty content id", "Content ids look like ui-effects/001-type-charge.")
    if "/" in key:
        account_part, _, rest = key.partition("/")
        acct = get_account(account_part, root)
        pool = _content_in(acct.slug, acct.path)
        key_rest = rest
    else:
        pool = list_content(home=root)
        key_rest = key
    found = [c for c in pool if _matches(c, key_rest)]
    if len(found) == 1:
        return found[0]
    if not found:
        raise RalphyError(
            "E_CONTENT_NOT_FOUND",
            f"No content '{ref}' in {root}",
            "List content with `ralphy content list`; ids look like <account>/<nnn>-<slug>.",
        )
    raise RalphyError(
        "E_CONTENT_AMBIGUOUS",
        f"'{ref}' matches {len(found)} items: {', '.join(c.id for c in found)}",
        "Use the full id <account>/<nnn>-<slug>.",
    )


def next_number(videos_dir: Path) -> int:
    if not videos_dir.is_dir():
        return 1
    numbers = [int(m.group(1)) for m in (_FOLDER.match(p.name) for p in videos_dir.iterdir()) if m]
    return max(numbers, default=0) + 1


def normalize_ref(ref: str, account_path: Path) -> tuple[str, str | None]:
    """A ref as stored in notes.md: a URL as is, or a path relative to the account folder. Returns `(ref, warning)`."""
    text = ref.strip()
    if re.match(r"^[a-z][a-z0-9+.-]*://", text, re.I):
        return text, None
    candidate = Path(os.path.expanduser(text))
    if candidate.is_absolute():
        try:
            relative = candidate.resolve().relative_to(account_path.resolve())
        except ValueError:
            raise RalphyError(
                "E_REF_OUTSIDE",
                f"{candidate} is outside {account_path}",
                f"Pull or copy it into {account_path / REFS_DIR}/<ref-slug>/ first, then pass refs/<ref-slug>.",
            ) from None
        text = relative.as_posix()
    else:
        text = Path(text).as_posix().removeprefix("./")
        if ".." in Path(text).parts:
            raise RalphyError("E_REF_OUTSIDE", f"{ref} leaves the account folder",
                              "Refs live under the account folder.")
    warning = None if (account_path / text).exists() else f"ref {text} does not exist yet under {account_path}"
    return text, warning


def composition_skeleton(title: str) -> str:
    """A minimal valid HyperFrames 1080x1920 composition: one root, one clip, one paused timeline."""
    safe = html.escape(title)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>{safe}</title>
    <style>
      html,
      body {{
        margin: 0;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: #0b0f14;
        color: #ffffff;
        font-family: system-ui, sans-serif;
      }}
      #root {{
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }}
      .clip {{
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }}
      #title {{
        margin: 0;
        padding: 0 96px;
        font-size: 112px;
        line-height: 1.05;
        text-align: center;
      }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="3">
      <section id="title-card" class="clip" data-start="0" data-duration="3" data-track-index="0">
        <h1 id="title">{safe}</h1>
      </section>
    </div>
    <!-- Scripts stay at the end of <body>: the HyperFrames bundler expects them there. -->
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {{}};
      const tl = gsap.timeline({{ paused: true }});
      tl.fromTo("#title", {{ y: 48, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }}, 0.2);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""


def notes_template(title: str) -> str:
    return f"# {title}\n\n## Brief\n\n## Reference\n\n## Decisions\n"


def create_content(account: str, title: str, refs: list[str] | None = None,
                   home: Path | None = None) -> tuple[Content, list[str]]:
    """Create `videos/<nnn>-<slug>/` with notes.md, media/ and a skeleton index.html. Returns `(content, warnings)`."""
    root = home or paths.home()
    if not title.strip():
        raise RalphyError("E_USAGE", "The title is empty", "Pass a title, e.g. `ralphy content new inbox \"Hello\"`.")
    acct = get_account(account, root)
    acct.videos_dir.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    stored_refs = []
    for ref in refs or []:
        value, warning = normalize_ref(ref, acct.path)
        stored_refs.append(value)
        if warning:
            warnings.append(warning)
    slug = slugify(title)
    meta = {
        "title": title.strip(),
        "account": None if acct.is_inbox else acct.slug,
        "refs": stored_refs,
        "caption": "",
        "created_at": files.utc_now(),
    }
    with files.locked_dir(acct.videos_dir):
        number = next_number(acct.videos_dir)
        folder = f"{number:03d}-{slug}"
        staging = Path(tempfile.mkdtemp(prefix=f".{folder}.", dir=acct.videos_dir))
        try:
            files.write_frontmatter(staging / NOTES_FILE, meta, notes_template(title.strip()))
            (staging / MEDIA_DIR).mkdir()
            files.atomic_write_text(staging / "index.html", composition_skeleton(title.strip()))
            os.chmod(staging, 0o777 & ~files.umask())
            os.rename(staging, acct.videos_dir / folder)
        finally:
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)
    return Content(account=acct.slug, folder=folder, path=acct.videos_dir / folder), warnings


# ---------------------------------------------------------------- versions, restore, render state


def save_version(content: Content, note: str | None = None) -> dict:
    """Snapshot the working tree as the next `versions/vN`: code only (see `SNAPSHOT_EXCLUDE`, `SNAPSHOT_SUFFIXES`)."""
    content.versions_dir.mkdir(exist_ok=True)
    with files.locked_dir(content.versions_dir):
        existing = content.versions()
        version = f"v{(version_number(existing[-1]) if existing else 0) + 1}"
        staging = content.versions_dir / f".{version}.tmp-{os.getpid()}"
        try:
            stats = files.clone_tree(content.path, staging, exclude_top=SNAPSHOT_EXCLUDE,
                                     exclude_suffixes=SNAPSHOT_SUFFIXES, allow_hardlink=False)
            if note:
                files.atomic_write_text(staging / ".note", note.strip() + "\n")
            os.rename(staging, content.versions_dir / version)
        finally:
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)
    return {"version": version, "path": str(content.versions_dir / version), **stats}


def version_note(content: Content, version: str) -> str | None:
    try:
        text = (content.versions_dir / version / ".note").read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text or None


def require_version(content: Content, version: str) -> str:
    version = parse_version(version)
    if not (content.versions_dir / version).is_dir():
        have = ", ".join(content.versions()) or "none"
        raise RalphyError(
            "E_VERSION_NOT_FOUND",
            f"{content.id} has no {version} (versions: {have})",
            f"Save the working tree first with `ralphy content save {content.id}`.",
        )
    return version


def code_files(content: Content) -> dict[str, Path]:
    """The working tree's files a version would hold: relative POSIX path -> absolute path."""
    return files.tree_files(content.path, SNAPSHOT_EXCLUDE, SNAPSHOT_SUFFIXES)


def version_files(content: Content, version: str) -> dict[str, Path]:
    return files.tree_files(content.versions_dir / version, (".note",))


def _same_file(path: Path, other: Path) -> bool:
    if path.is_symlink() or other.is_symlink():
        return path.is_symlink() and other.is_symlink() and os.readlink(path) == os.readlink(other)
    return filecmp.cmp(path, other, shallow=False)


def working_tree_matches(content: Content, version: str) -> bool:
    """True when the working tree's code files are exactly the files of `versions/<version>`, byte for byte."""
    working = code_files(content)
    saved = version_files(content, version)
    if working.keys() != saved.keys():
        return False
    return all(_same_file(path, saved[rel]) for rel, path in working.items())


def _put(src: Path, dst: Path) -> None:
    """Make `dst` a copy (APFS clone where possible) of `src` in one `os.replace`, with the current time as mtime."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    temp = dst.with_name(f".{dst.name}.restore-{os.getpid()}")
    if temp.exists() or temp.is_symlink():
        temp.unlink()
    try:
        files.clone_file(src, temp, allow_hardlink=False)
        os.replace(temp, dst)
    finally:
        if temp.exists() or temp.is_symlink():
            temp.unlink()
    # A restored file is new to the working tree: its mtime must mark an older render.mp4 stale.
    os.utime(dst, follow_symlinks=False)


def restore_version(content: Content, version: str) -> dict:
    """Make the working tree's code files equal `versions/<version>`, after saving the current tree as a version.

    The save is skipped when the tree already equals the latest version (it is saved as that one). Files the
    snapshot lacks are removed from the working tree; they stay in the version saved first. `media/`,
    `render.mp4`, mp4 files and the other versions are never touched.
    """
    version = require_version(content, version)
    if working_tree_matches(content, version):
        return {"version": version, "before": version, "saved": False, "written": [], "removed": []}
    existing = content.versions()
    latest = existing[-1] if existing else None
    if latest and working_tree_matches(content, latest):
        before, saved = latest, False
    else:
        before, saved = save_version(content, note=f"before restore of {version}")["version"], True
    wanted = version_files(content, version)
    removed = []
    for rel, path in sorted(code_files(content).items(), reverse=True):
        if rel not in wanted:
            path.unlink()
            removed.append(rel)
            _prune_empty(path.parent, content.path)
    written = []
    for rel, src in sorted(wanted.items()):
        dst = content.path / rel
        if (dst.exists() or dst.is_symlink()) and not dst.is_dir() and _same_file(src, dst):
            continue
        if dst.is_dir() and not dst.is_symlink():
            raise RalphyError(
                "E_RESTORE_CONFLICT",
                f"{rel} is a folder in the working tree but a file in {version}",
                f"The tree before the restore is saved as {before}; move {dst} aside, then restore again.",
            )
        _put(src, dst)
        written.append(rel)
    return {"version": version, "before": before, "saved": saved, "written": written, "removed": sorted(removed)}


def _prune_empty(folder: Path, root: Path) -> None:
    """Remove `folder` and its parents up to (not including) `root` while they are empty."""
    while folder != root and root in folder.parents:
        try:
            folder.rmdir()
        except OSError:
            return
        folder = folder.parent


def _newer(root: Path, after_ns: int, top: bool = True) -> bool:
    """True when a working-tree file or subfolder under `root` was modified after `after_ns`."""
    try:
        entries = list(os.scandir(root))
    except OSError:
        return False
    for entry in entries:
        if entry.name.startswith(".") or (top and entry.name in (MEDIA_DIR, VERSIONS_DIR, NOTES_FILE, RENDER_FILE)):
            continue
        if _is_doc(entry):
            continue
        try:
            stat = entry.stat(follow_symlinks=False)
        except OSError:
            continue
        if stat.st_mtime_ns > after_ns:
            return True
        if entry.is_dir(follow_symlinks=False) and _newer(Path(entry.path), after_ns, top=False):
            return True
    return False


DOC_SUFFIXES = (".md", ".txt")
# The post cover: a still image next to the composition that platforms show as the video's cover.
COVER_NAMES = ("cover.jpg", "cover.jpeg", "cover.png")


def _is_doc(entry: os.DirEntry) -> bool:
    """Markdown and text files (briefs, prompts, licenses) and the post cover never change a render."""
    name = entry.name.lower()
    return (name.endswith(DOC_SUFFIXES) or name in COVER_NAMES) and entry.is_file(follow_symlinks=False)


def cover_file(folder: Path) -> Path | None:
    """The video's post cover (`cover.jpg`, `cover.jpeg` or `cover.png` in its folder), or None."""
    for name in COVER_NAMES:
        path = folder / name
        if path.is_file():
            return path
    return None


def working_tree_stamp(content: Content) -> int:
    """The newest mtime (ns) among the working tree's files and subfolders; 0 for an empty tree."""
    newest = 0
    stack = [(content.path, True)]
    while stack:
        folder, top = stack.pop()
        try:
            entries = list(os.scandir(folder))
        except OSError:
            continue
        for entry in entries:
            if entry.name.startswith(".") or (top and entry.name in (MEDIA_DIR, VERSIONS_DIR, NOTES_FILE,
                                                                     RENDER_FILE)):
                continue
            if _is_doc(entry):
                continue
            try:
                stat = entry.stat(follow_symlinks=False)
            except OSError:
                continue
            newest = max(newest, stat.st_mtime_ns)
            if entry.is_dir(follow_symlinks=False):
                stack.append((Path(entry.path), False))
    return newest


def render_state(content: Content) -> dict:
    """`render` (absolute path or None), `render_stale` and `rendered_at` of the working render.

    Stale: a working-tree file or subfolder (outside `media/` and `versions/`, `notes.md` aside, hidden names
    aside) is newer than `render.mp4`. `ralphy render` stamps `render.mp4` with the time it read the tree.
    """
    path = content.render_file
    try:
        stat = path.stat()
    except OSError:
        return {"render": None, "render_stale": False, "rendered_at": None}
    return {
        "render": str(path),
        "render_stale": _newer(content.path, stat.st_mtime_ns),
        "rendered_at": files.iso_time(stat.st_mtime),
    }


# ---------------------------------------------------------------- posts and stats


def _cell(value: str | None):
    return None if value in (None, "") else value


def _number(value: str | None):
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def post_row(row: dict, account: str) -> dict:
    out = {column: _cell(row.get(column)) for column in POSTS_COLUMNS}
    for extra, value in row.items():
        if extra not in out:
            out[extra] = _cell(value)
    out["account"] = account
    return out


def stats_row(row: dict, account: str) -> dict:
    out = {column: _cell(row.get(column)) for column in STATS_COLUMNS}
    for column in STATS_NUMBERS:
        out[column] = _number(row.get(column))
    out["account"] = account
    return out


def read_posts(account: Account) -> list[dict]:
    return [post_row(r, account.slug) for r in files.read_csv(account.posts_path)]


def read_stats(account: Account) -> list[dict]:
    return [stats_row(r, account.slug) for r in files.read_csv(account.stats_path)]


def latest_stats(rows: list[dict]) -> list[dict]:
    """The newest snapshot per post (keyed by url, else platform + handle + content), newest first."""
    latest: dict[tuple, dict] = {}
    for row in rows:
        key = (row.get("url"),) if row.get("url") else (row.get("platform"), row.get("handle"), row.get("content"))
        if key not in latest or (row.get("fetched_at") or "") >= (latest[key].get("fetched_at") or ""):
            latest[key] = row
    return sorted(latest.values(), key=lambda r: r.get("fetched_at") or "", reverse=True)


def all_accounts_with_inbox(home: Path | None = None) -> list[Account]:
    root = home or paths.home()
    found = list_accounts(root)
    if (root / INBOX).is_dir():
        found.append(inbox(root))
    return found
