# /// script
# requires-python = ">=3.11"
# dependencies = ["yt-dlp[default]>=2025.10.22"]
# ///
"""Download a reference video (URL or local file) into refs/<slug>/ with source.mp4 and source.json.

Run it from the account folder (or pass --out). A URL that was already pulled into the same folder
is reused, not downloaded again. Existing media is never overwritten: a different source with the
same slug gets <slug>-2.

Examples:
  uv run tools/pull.py https://www.tiktok.com/@user/video/123
  uv run tools/pull.py https://www.instagram.com/reel/ABC/ --cookies-from-browser chrome
  uv run tools/pull.py ~/Downloads/clip.mp4 --slug type-charge-original
  uv run tools/pull.py <url> --meta-only --json
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}
PLATFORMS = {"tiktok": "tiktok", "instagram": "instagram", "youtube": "youtube", "twitter": "x"}
# Cyrillic to Latin for slugs: U+0430-U+044F in alphabet order, then yo, ye, i, yi, ghe
_CYR_LATIN = "a b v g d e zh z i y k l m n o p r s t u f kh ts ch sh shch - y - e yu ya e ye i yi g".split()
_CYR_CODES = [*range(0x430, 0x450), 0x451, 0x454, 0x456, 0x457, 0x491]
CYR = {chr(c): t.strip("-") for c, t in zip(_CYR_CODES, _CYR_LATIN, strict=True)}


class ToolError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def slugify(text: str, limit: int = 60) -> str:
    text = "".join(CYR.get(ch, ch) for ch in text.lower())
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:limit].rstrip("-")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def probe(path: Path) -> dict:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    except FileNotFoundError:
        raise ToolError("E_FFMPEG_MISSING", "ffprobe is not installed", "install ffmpeg") from None
    except subprocess.CalledProcessError as e:
        raise ToolError("E_PROBE", f"ffprobe failed on {path}", e.stderr.strip()[:300]) from e
    data = json.loads(out)
    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    audio = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    fps = None
    if video and video.get("avg_frame_rate", "0/0") != "0/0":
        num, den = video["avg_frame_rate"].split("/")
        fps = round(int(num) / int(den), 3) if int(den) else None
    return {
        "duration": round(float(data.get("format", {}).get("duration", 0) or 0), 3),
        "width": video.get("width") if video else None,
        "height": video.get("height") if video else None,
        "fps": fps,
        "video_codec": video.get("codec_name") if video else None,
        "has_audio": audio is not None,
        "audio_codec": audio.get("codec_name") if audio else None,
    }


def clone(src: Path, dst: Path) -> None:
    """APFS clone on macOS, reflink on Linux when possible, else a plain copy."""
    if sys.platform == "darwin" and subprocess.run(["cp", "-c", str(src), str(dst)]).returncode == 0:
        return
    if (
        sys.platform.startswith("linux")
        and subprocess.run(["cp", "--reflink=auto", str(src), str(dst)]).returncode == 0
    ):
        return
    shutil.copy2(src, dst)


def pick_dir(base: Path, slug: str, url: str | None, sha: str | None) -> tuple[Path, bool]:
    """Return (folder, reused). Reuse a folder holding the same source; never overwrite another."""
    n = 1
    while True:
        cand = base / (slug if n == 1 else f"{slug}-{n}")
        meta = cand / "source.json"
        if not cand.exists():
            return cand, False
        if meta.exists():
            try:
                old = json.loads(meta.read_text())
            except json.JSONDecodeError:
                old = {}
            same = (url and url in (old.get("url"), old.get("webpage_url"))) or (sha and sha == old.get("sha256"))
            if same and (cand / "source.mp4").exists():
                return cand, True
            if same and url and not (cand / "source.mp4").exists():
                return cand, False  # a --meta-only pull; finish it
        n += 1


def iso_time(info: dict) -> str | None:
    ts = info.get("timestamp")
    if ts:
        return dt.datetime.fromtimestamp(ts, dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    d = info.get("upload_date")
    return f"{d[:4]}-{d[4:6]}-{d[6:8]}" if d and len(d) == 8 else None


class _Log:
    def debug(self, msg):
        pass

    def info(self, msg):
        pass

    def warning(self, msg):
        print(f"yt-dlp: {msg}", file=sys.stderr)

    def error(self, msg):
        print(f"yt-dlp: {msg}", file=sys.stderr)


def ydl_opts(args, outdir: Path | None) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": _Log(),
        "noplaylist": True,
        "js_runtimes": {name: {} for name in ("deno", "node", "bun") if shutil.which(name)} or None,
    }
    if args.cookies_from_browser:
        opts["cookiesfrombrowser"] = (args.cookies_from_browser,)
    if outdir is not None:
        opts.update(
            {
                "format": args.format,
                "merge_output_format": "mp4",
                "outtmpl": {"default": str(outdir / "source.%(ext)s")},
                "postprocessors": [{"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"}],
            }
        )
    return opts


def pull_url(args) -> dict:
    import yt_dlp

    try:
        with yt_dlp.YoutubeDL(ydl_opts(args, None)) as ydl:
            info = ydl.sanitize_info(ydl.extract_info(args.source, download=False))
    except yt_dlp.utils.DownloadError as e:
        raise ToolError(
            "E_PULL",
            f"yt-dlp could not read {args.source}: {e}",
            "private or login-walled post: retry with --cookies-from-browser <browser> "
            "(the owner's choice), or ask for the file and pull the local path",
        ) from e
    platform = PLATFORMS.get(str(info.get("extractor_key", "")).lower(), str(info.get("extractor_key", "")).lower())
    author = info.get("uploader_id") or info.get("channel_id") or info.get("uploader") or platform
    slug = args.slug or slugify(f"{author} {info.get('id', '')}") or "ref"
    base = Path(args.refs).expanduser()
    if args.out:
        outdir, reused = Path(args.out).expanduser(), (Path(args.out) / "source.mp4").exists()
    else:
        outdir, reused = pick_dir(base, slug, info.get("webpage_url") or args.source, None)
    meta = {
        "url": args.source,
        "webpage_url": info.get("webpage_url"),
        "platform": platform,
        "id": info.get("id"),
        "title": info.get("title"),
        "description": info.get("description"),
        "author": info.get("uploader") or info.get("channel"),
        "author_id": author,
        "author_url": info.get("uploader_url") or info.get("channel_url"),
        "followers": info.get("channel_follower_count"),
        "published_at": iso_time(info),
        "views": info.get("view_count"),
        "likes": info.get("like_count"),
        "comments": info.get("comment_count"),
        "shares": info.get("repost_count"),
        "tags": info.get("tags") or [],
        "music": {k: info.get(k) for k in ("track", "artist") if info.get(k)} or None,
        "duration": info.get("duration"),
    }
    outdir.mkdir(parents=True, exist_ok=True)
    video = outdir / "source.mp4"
    if not args.meta_only and not reused:
        if video.exists():
            raise ToolError(
                "E_EXISTS", f"{video} already exists for another source", "pass a different --out or --slug"
            )
        try:
            with yt_dlp.YoutubeDL(ydl_opts(args, outdir)) as ydl:
                ydl.download([args.source])
        except yt_dlp.utils.DownloadError as e:
            raise ToolError(
                "E_PULL",
                f"download failed: {e}",
                "update yt-dlp (uv cache clean yt-dlp), try --cookies-from-browser, or ask the user for the file",
            ) from e
        if not video.exists():
            got = [p for p in outdir.glob("source.*") if p.suffix in VIDEO_EXTS]
            if not got:
                raise ToolError("E_PULL", "yt-dlp finished but no video file was written")
            got[0].rename(video)
    return finish(outdir, meta, video, reused)


def pull_local(args) -> dict:
    src = Path(args.source).expanduser().resolve()
    if not src.is_file():
        raise ToolError("E_NOT_FOUND", f"no such file: {src}")
    sha = sha256(src)
    slug = args.slug or slugify(src.stem) or "ref"
    if args.out:
        outdir, reused = Path(args.out).expanduser(), False
    else:
        outdir, reused = pick_dir(Path(args.refs).expanduser(), slug, None, sha)
    outdir.mkdir(parents=True, exist_ok=True)
    video = outdir / "source.mp4"
    if not reused:
        if video.exists():
            raise ToolError("E_EXISTS", f"{video} already exists", "pass a different --out or --slug")
        if src.suffix.lower() == ".mp4":
            clone(src, video)
        else:
            r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), "-c", "copy", str(video)])
            if r.returncode:
                subprocess.run(
                    [
                        "ffmpeg",
                        "-v",
                        "error",
                        "-i",
                        str(src),
                        "-c:v",
                        "libx264",
                        "-crf",
                        "16",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "192k",
                        str(video),
                    ],
                    check=True,
                )
    meta = {"url": None, "webpage_url": None, "platform": "local", "original_path": str(src), "title": src.stem}
    return finish(outdir, meta, video, reused)


def finish(outdir: Path, meta: dict, video: Path, reused: bool) -> dict:
    meta_path = outdir / "source.json"
    if reused and meta_path.exists():
        old = json.loads(meta_path.read_text())
        old.update({k: v for k, v in meta.items() if v is not None})  # refresh counters
        meta = old
    if video.exists():
        meta.update(probe(video))
        meta["file"] = "source.mp4"
        meta["bytes"] = video.stat().st_size
        meta["sha256"] = meta.get("sha256") if reused and meta.get("sha256") else sha256(video)
    meta["pulled_at"] = dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    tmp = meta_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    os.replace(tmp, meta_path)
    return {
        "dir": str(outdir),
        "slug": outdir.name,
        "video": str(video) if video.exists() else None,
        "source_json": str(meta_path),
        "reused": reused,
        "meta": meta,
    }


def run(args) -> dict:
    if re.match(r"^https?://", args.source):
        return pull_url(args)
    return pull_local(args)


def human(r: dict) -> str:
    m = r["meta"]
    lines = [f"{'reused' if r['reused'] else 'pulled'} {r['dir']}"]
    if m.get("author") or m.get("platform"):
        lines.append(
            f"  {m.get('platform')} @{str(m.get('author_id') or m.get('author')).lstrip('@')} "
            f"published {m.get('published_at')} views {m.get('views')} likes {m.get('likes')}"
        )
    if r["video"]:
        lines.append(
            f"  {m.get('duration')} s {m.get('width')}x{m.get('height')} {m.get('fps')} fps "
            f"audio={'yes' if m.get('has_audio') else 'no'}"
        )
    return "\n".join(lines)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", help="video URL (TikTok, Instagram, YouTube, X, ...) or a local video file")
    p.add_argument("--refs", default="refs", help="refs folder to create <slug>/ in (default: ./refs)")
    p.add_argument("--out", help="exact output folder instead of <refs>/<slug>")
    p.add_argument("--slug", help="folder name (default: <author>-<id>, or the file name)")
    p.add_argument("--meta-only", action="store_true", help="write source.json only, no video download")
    p.add_argument(
        "--cookies-from-browser",
        metavar="BROWSER",
        help="read cookies from this browser (chrome, firefox, safari); only with the owner's ok",
    )
    p.add_argument(
        "--format",
        default="bv*[vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
        help="yt-dlp format selector (default prefers H.264 + AAC)",
    )
    p.add_argument("--json", action="store_true", help="print one JSON object")
    args = p.parse_args(argv)
    try:
        result = run(args)
    except ToolError as e:
        if args.json:
            print(json.dumps({"ok": False, "error": {"code": e.code, "message": e.message, "hint": e.hint}}))
        else:
            print(f"error: {e.message}" + (f"\nhint: {e.hint}" if e.hint else ""), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, **result}, ensure_ascii=False) if args.json else human(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
