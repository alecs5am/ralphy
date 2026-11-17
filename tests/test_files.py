"""Plain-file primitives: frontmatter, atomic writes, locked CSV, clones."""

from __future__ import annotations

import fcntl
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import pytest

from ralphy import files
from ralphy.errors import RalphyError


def test_frontmatter_round_trip_keeps_body_and_timestamps(tmp_path):
    path = tmp_path / "notes.md"
    body = "# Title\n\nSome *markdown* body.\n\n- a\n- b\n"
    meta = {"title": "Type Charge", "pinned": None, "refs": ["refs/x"], "created_at": "2026-11-17T12:00:00Z"}
    files.write_frontmatter(path, meta, body)
    text = path.read_text()
    assert "created_at: 2026-11-17T12:00:00Z\n" in text  # plain, as in the contract
    read_meta, read_body = files.read_frontmatter(path)
    assert read_meta == meta
    assert read_body == body


def test_frontmatter_reads_yaml_datetimes_as_iso_strings(tmp_path):
    path = tmp_path / "account.md"
    path.write_text("---\nname: X\ncreated_at: 2026-11-17T12:00:00Z\nday: 2026-11-17\n---\nbody\n")
    meta, body = files.read_frontmatter(path)
    assert meta == {"name": "X", "created_at": "2026-11-17T12:00:00Z", "day": "2026-11-17"}
    assert body == "body\n"


def test_file_without_frontmatter_is_all_body(tmp_path):
    path = tmp_path / "plain.md"
    path.write_text("just text\n")
    assert files.read_frontmatter(path) == ({}, "just text\n")


def test_update_frontmatter_keeps_comments_order_and_body(tmp_path):
    path = tmp_path / "notes.md"
    path.write_text(
        "---\ntitle: Type Charge\naccount: ui-effects   # null in inbox\npinned: null\n"
        "refs:\n  - refs/a\ncaption: \"\"\n---\n# Body stays\n"
    )
    meta = files.update_frontmatter(path, {"pinned": "v2"})
    text = path.read_text()
    assert meta["pinned"] == "v2"
    assert "account: ui-effects   # null in inbox\n" in text
    assert "pinned: v2\n" in text
    assert text.endswith("---\n# Body stays\n")
    assert text.index("title:") < text.index("pinned:") < text.index("refs:")


def test_update_frontmatter_falls_back_for_block_values(tmp_path):
    path = tmp_path / "notes.md"
    path.write_text("---\ntitle: X\nrefs:\n  - a\n---\nbody\n")
    files.update_frontmatter(path, {"refs": ["a", "b"], "pinned": "v1"})
    meta, body = files.read_frontmatter(path)
    assert meta == {"title": "X", "refs": ["a", "b"], "pinned": "v1"}
    assert body == "body\n"


def test_invalid_frontmatter_is_a_ralphy_error(tmp_path):
    path = tmp_path / "bad.md"
    path.write_text("---\nname: [unclosed\n---\n")
    with pytest.raises(RalphyError) as caught:
        files.read_frontmatter(path)
    assert caught.value.code == "E_FRONTMATTER"


def test_atomic_write_leaves_no_temp_files_and_keeps_mode(tmp_path):
    path = tmp_path / "keys.env"
    files.atomic_write_text(path, "A=1\n", mode=0o600)
    files.atomic_write_text(path, "A=2\n")
    assert path.read_text() == "A=2\n"
    assert path.stat().st_mode & 0o777 == 0o600
    assert sorted(p.name for p in tmp_path.iterdir()) == ["keys.env"]


def test_write_new_text_refuses_to_overwrite(tmp_path):
    path = tmp_path / "a.txt"
    files.write_new_text(path, "one")
    with pytest.raises(RalphyError) as caught:
        files.write_new_text(path, "two")
    assert caught.value.code == "E_EXISTS"
    assert path.read_text() == "one"


COLUMNS = ("id", "content", "status")


def test_csv_append_read_update(tmp_path):
    path = tmp_path / "posts.csv"
    assert files.read_csv(path) == []
    files.append_csv(path, COLUMNS, {"id": "p_1", "content": "a/001-x", "status": "planned"})
    files.append_csv(path, COLUMNS, {"id": "p_2", "content": "a/002-y, with comma", "status": "planned"})
    changed = files.update_csv(path, COLUMNS, lambda r: r["id"] == "p_2", {"status": "approved"})
    assert [r["id"] for r in changed] == ["p_2"]
    rows = files.read_csv(path)
    assert rows == [
        {"id": "p_1", "content": "a/001-x", "status": "planned"},
        {"id": "p_2", "content": "a/002-y, with comma", "status": "approved"},
    ]
    assert path.read_text().splitlines()[0] == "id,content,status"
    assert (tmp_path / "posts.csv.lock").exists()


def test_csv_keeps_unknown_columns(tmp_path):
    path = tmp_path / "posts.csv"
    path.write_text("id,content,status,extra\np_1,a/001-x,planned,keep-me\n")
    files.append_csv(path, COLUMNS, {"id": "p_2", "content": "a/002-y", "status": "planned"})
    rows = files.read_csv(path)
    assert rows[0]["extra"] == "keep-me"
    assert rows[1]["extra"] == ""
    assert path.read_text().splitlines()[0] == "id,content,status,extra"


def test_csv_lock_is_exclusive(tmp_path):
    path = tmp_path / "posts.csv"
    with files.locked(path):
        fd = os.open(f"{path}.lock", os.O_RDWR)
        try:
            with pytest.raises(BlockingIOError):
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        finally:
            os.close(fd)
    fd = os.open(f"{path}.lock", os.O_RDWR)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


def _append_many(args) -> int:
    path, worker, count = args
    for i in range(count):
        files.append_csv(path, COLUMNS, {"id": f"p_{worker}_{i}", "content": "a/001-x", "status": "planned"})
    return count


def test_concurrent_appends_lose_no_rows(tmp_path):
    path = str(tmp_path / "posts.csv")
    with ProcessPoolExecutor(max_workers=4) as pool:
        total = sum(pool.map(_append_many, [(path, w, 15) for w in range(4)]))
    rows = files.read_csv(tmp_path / "posts.csv")
    assert len(rows) == total == 60
    assert len({r["id"] for r in rows}) == 60


def _inode(path) -> int:
    return os.stat(path).st_ino


def test_clone_file_native_or_fallback(tmp_path):
    src = tmp_path / "a.bin"
    src.write_bytes(b"x" * 1000)
    method = files.clone_file(src, tmp_path / "b.bin")
    assert (tmp_path / "b.bin").read_bytes() == src.read_bytes()
    assert _inode(tmp_path / "b.bin") != _inode(src)
    assert method in ("clone", "copy")
    if sys.platform == "darwin":
        assert method == "clone"  # the test temp dir is on APFS


def test_clone_file_hardlink_then_copy_fallbacks(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "_native_clone", lambda src, dst: False)
    src = tmp_path / "a.bin"
    src.write_bytes(b"render")
    assert files.clone_file(src, tmp_path / "linked.bin", allow_hardlink=True) == "hardlink"
    assert _inode(tmp_path / "linked.bin") == _inode(src)
    assert files.clone_file(src, tmp_path / "copied.bin") == "copy"
    assert _inode(tmp_path / "copied.bin") != _inode(src)

    def no_link(*args, **kwargs):
        raise OSError(1, "Operation not permitted")

    monkeypatch.setattr(os, "link", no_link)
    assert files.clone_file(src, tmp_path / "copied2.bin", allow_hardlink=True) == "copy"
    assert (tmp_path / "copied2.bin").read_bytes() == b"render"


def test_clone_never_overwrites(tmp_path):
    src = tmp_path / "a"
    dst = tmp_path / "b"
    src.write_text("new")
    dst.write_text("old")
    with pytest.raises(RalphyError) as caught:
        files.clone_file(src, dst)
    assert caught.value.code == "E_EXISTS"
    assert dst.read_text() == "old"


def _make_tree(root):
    (root / "media").mkdir(parents=True)
    (root / "media" / "big.mp4").write_bytes(b"m")
    (root / "assets" / "fonts").mkdir(parents=True)
    (root / "assets" / "fonts" / "a.woff2").write_bytes(b"f")
    (root / "assets" / ".DS_Store").write_bytes(b"junk")
    (root / "index.html").write_text("<html></html>")
    (root / ".DS_Store").write_bytes(b"junk")
    (root / "link.html").symlink_to("index.html")


@pytest.mark.parametrize("native", [True, False])
def test_clone_tree_excludes_and_counts(tmp_path, monkeypatch, native):
    if not native:
        monkeypatch.setattr(files, "_native_clone", lambda src, dst: False)
    src = tmp_path / "src"
    _make_tree(src)
    stats = files.clone_tree(src, tmp_path / "dst", exclude_top=("media",))
    dst = tmp_path / "dst"
    found = sorted(p.relative_to(dst).as_posix() for p in dst.rglob("*") if not p.is_dir() or p.is_symlink())
    assert found == ["assets/fonts/a.woff2", "index.html", "link.html"]
    assert (dst / "link.html").is_symlink()
    assert stats["files"] == 3
    if not native:
        assert set(stats["methods"]) == {"copy"}


def test_place_new_never_replaces(tmp_path):
    src = tmp_path / "out.mp4"
    src.write_bytes(b"one")
    files.place_new(src, tmp_path / "v1.mp4")
    assert (tmp_path / "v1.mp4").read_bytes() == b"one"
    other = tmp_path / "other.mp4"
    other.write_bytes(b"three")
    with pytest.raises(FileExistsError):
        files.place_new(other, tmp_path / "v1.mp4")
