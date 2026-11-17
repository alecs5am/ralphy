# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10.1"]
# ///
"""Extract exact frames from a video and lay them out on labelled contact sheets.

Every tile is labelled with its frame number and time, so a sheet doubles as a timecode reference.
Default: about 40 evenly spaced frames over the whole video. Use --window for dense sampling
around a fast event (every frame by default) and --at for exact times, e.g. shot starts from cuts.json.

Outputs go to <video dir>/frames/ for source.mp4, else <video dir>/<stem>.frames/ (or --out):
keyframes t0003.500.jpg ... and <name>.jpg (or <name>-1.jpg, <name>-2.jpg ... for many tiles).

Examples:
  uv run tools/frames.py refs/x/source.mp4
  uv run tools/frames.py refs/x/source.mp4 --window 3.2:4.9 --name hook-cards
  uv run tools/frames.py render.mp4 --at 0,0.5,1.25,4 --json
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


class ToolError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def probe(path: Path) -> dict:
    if not path.is_file():
        raise ToolError("E_NOT_FOUND", f"no such file: {path}")
    try:
        out = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-count_packets",
                "-show_entries",
                "stream=width,height,avg_frame_rate,nb_read_packets:format=duration",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    except FileNotFoundError:
        raise ToolError("E_FFMPEG_MISSING", "ffprobe is not installed", "install ffmpeg") from None
    except subprocess.CalledProcessError as e:
        raise ToolError("E_PROBE", f"ffprobe failed on {path}", e.stderr.strip()[:300]) from e
    data = json.loads(out)
    if not data.get("streams"):
        raise ToolError("E_NO_VIDEO", f"{path} has no video stream")
    s = data["streams"][0]
    num, den = (s.get("avg_frame_rate") or "30/1").split("/")
    fps = int(num) / int(den) if int(den) else 30.0
    duration = float(data.get("format", {}).get("duration") or 0)
    frames = int(s.get("nb_read_packets") or round(duration * fps))
    return {"fps": fps, "frames": frames, "duration": duration, "width": s["width"], "height": s["height"]}


def parse_times(spec: str) -> list[float]:
    return [float(v) for v in spec.split(",") if v.strip()]


def default_out(video: Path) -> Path:
    return video.parent / ("frames" if video.stem == "source" else f"{video.stem}.frames")


def pick_frames(args, info: dict) -> list[int]:
    fps, last = info["fps"], max(info["frames"] - 1, 0)
    times: list[float] = []
    if args.at:
        times += parse_times(args.at)
    if args.window:
        parts = [float(v) for v in args.window.split(":")]
        if len(parts) < 2:
            raise ToolError("E_INPUT", "--window takes A:B or A:B:STEP (seconds)")
        a, b = parts[0], parts[1]
        step = parts[2] if len(parts) > 2 else 1 / fps
        t = a
        while t <= b + 1e-9:
            times.append(t)
            t += step
    if not times:
        every = args.every or max(math.ceil(info["duration"] / args.count / 0.25) * 0.25, 1 / fps)
        t = 0.0
        while t < info["duration"] - 1e-6:
            times.append(t)
            t += every
    return sorted({min(max(round(t * fps), 0), last) for t in times})


def extract(video: Path, frames: list[int], width: int, workdir: Path) -> list[Path]:
    expr = "+".join(f"eq(n\\,{n})" for n in frames)
    vf = f"select='{expr}',scale={width}:-2:flags=lanczos"
    cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(video),
        "-vf",
        vf,
        "-fps_mode",
        "passthrough",
        "-q:v",
        "2",
        str(workdir / "%06d.jpg"),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise ToolError("E_FFMPEG", "ffmpeg frame extraction failed", r.stderr.strip()[-400:])
    return sorted(workdir.glob("*.jpg"))


def font(size: int):
    from PIL import ImageFont

    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow without FreeType
        return ImageFont.load_default()


def make_sheets(
    tiles: list[tuple[int, float, Path]], out: Path, name: str, tile_w: int, cols: int, per_sheet: int
) -> list[Path]:
    from PIL import Image, ImageDraw

    sheets = []
    chunks = [tiles[i : i + per_sheet] for i in range(0, len(tiles), per_sheet)]
    f = font(max(12, tile_w // 16))
    for idx, chunk in enumerate(chunks, 1):
        ims = []
        for n, t, p in chunk:
            im = Image.open(p).convert("RGB")
            h = round(im.height * tile_w / im.width)
            ims.append((n, t, im.resize((tile_w, h), Image.LANCZOS)))
        c = min(cols, len(ims))
        rows = (len(ims) + c - 1) // c
        th = max(im.height for _, _, im in ims)
        lab = max(18, tile_w // 12)
        sheet = Image.new("RGB", (c * (tile_w + 4) + 4, rows * (th + lab + 4) + 4), "#1b1b1b")
        d = ImageDraw.Draw(sheet)
        for i, (n, t, im) in enumerate(ims):
            x, y = 4 + (i % c) * (tile_w + 4), 4 + (i // c) * (th + lab + 4)
            sheet.paste(im, (x, y + lab))
            d.text((x + 3, y + 2), f"{t:.2f}s  f{n}", fill="#ffe666", font=f)
        path = out / (f"{name}.jpg" if len(chunks) == 1 else f"{name}-{idx}.jpg")
        sheet.save(path, quality=88)
        sheets.append(path)
    return sheets


def run(args) -> dict:
    video = Path(args.video).expanduser()
    info = probe(video)
    frames = pick_frames(args, info)
    if not frames:
        raise ToolError("E_INPUT", "no frames selected")
    out = Path(args.out).expanduser() if args.out else default_out(video)
    out.mkdir(parents=True, exist_ok=True)
    fps = info["fps"]
    with tempfile.TemporaryDirectory(dir=out) as tmp:
        got = extract(video, frames, args.frame_width, Path(tmp))
        tiles = []
        for n, p in zip(frames, got, strict=False):
            t = n / fps
            dst = out / f"t{t:08.3f}.jpg"
            shutil.move(str(p), dst)
            tiles.append((n, t, dst))
    name = args.name or (
        "sheet" if not args.window else f"window-{args.window.split(':')[0]}-{args.window.split(':')[1]}"
    )
    sheets = make_sheets(tiles, out, name, args.tile_width, args.cols, args.per_sheet) if not args.no_sheet else []
    return {
        "video": str(video),
        "out": str(out),
        "fps": round(fps, 3),
        "duration": round(info["duration"], 3),
        "sheets": [str(s) for s in sheets],
        "frames": [{"t": round(t, 3), "frame": n, "file": str(p)} for n, t, p in tiles],
    }


def human(r: dict) -> str:
    lines = [f"{len(r['frames'])} frames from {r['video']} ({r['duration']} s, {r['fps']} fps) -> {r['out']}"]
    lines += [f"  sheet {s}" for s in r["sheets"]]
    return "\n".join(lines)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("video")
    p.add_argument("--every", type=float, help="seconds between frames (default: duration / --count)")
    p.add_argument("--count", type=int, default=40, help="frames for the default even sampling (default 40)")
    p.add_argument("--at", help="comma-separated times in seconds")
    p.add_argument("--window", help="A:B[:STEP] seconds; STEP defaults to one frame")
    p.add_argument("--frame-width", type=int, default=540, help="width of saved keyframes (default 540)")
    p.add_argument("--tile-width", type=int, default=240, help="tile width on the sheet (default 240)")
    p.add_argument("--cols", type=int, default=8, help="tiles per row (default 8)")
    p.add_argument("--per-sheet", type=int, default=48, help="tiles per sheet image (default 48)")
    p.add_argument("--name", help="sheet file name without extension (default: sheet)")
    p.add_argument("--no-sheet", action="store_true", help="save keyframes only")
    p.add_argument("--out", help="output folder")
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
    print(json.dumps({"ok": True, **result}) if args.json else human(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
