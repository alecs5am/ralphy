# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["rembg[cpu]>=2.0.60", "pillow>=10.1", "numpy>=1.26"]
# ///
"""Remove the background from an image or video: a segmentation model (rembg) or a colour key.

Model mode cuts the subject out with rembg. Models: isnet-general-use (default), u2net_human_seg
(people), birefnet-general (products, fine edges; slow, 900 MB), u2netp (tiny, fast drafts).
Weights download once to ~/.rembg/models. Key mode (--key 00B140) removes a flat colour backdrop with
ffmpeg, no model: generate green-screen assets on flat #00B140 and key them here.

Images become <name>.matte.png; videos become <name>.matte.webm (VP9 with alpha, plays in Chrome
and HyperFrames). --mask also writes the alpha as <name>.mask.png / .mask.mp4. Outputs go next to
the input (or --out folder) and never overwrite: a rerun writes .matte.2.png and so on.

Examples:
  uv run tools/matte.py media/hero.png
  uv run tools/matte.py media/painting-03.jpg --model u2net_human_seg --mask
  uv run tools/matte.py media/actor-green.mp4 --key 00B140
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


class ToolError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def unique(path: Path) -> Path:
    if not path.exists():
        return path
    stem, suf = path.name[: -len(path.suffix)], path.suffix
    n = 2
    while (cand := path.with_name(f"{stem}.{n}{suf}")).exists():
        n += 1
    return cand


def probe(path: Path) -> dict:
    try:
        out = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height,avg_frame_rate",
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
    s = json.loads(out)["streams"][0]
    return {"width": s["width"], "height": s["height"], "fps": s.get("avg_frame_rate") or "30/1"}


def key_filter(args) -> str:
    color = args.key.lstrip("#")
    return (
        f"colorkey=0x{color}:{args.similarity}:{args.blend},despill=type=green"
        if args.despill
        else f"colorkey=0x{color}:{args.similarity}:{args.blend}"
    )


def ffmpeg(cmd: list[str]) -> None:
    r = subprocess.run(["ffmpeg", "-v", "error", "-y"] + cmd, capture_output=True, text=True)
    if r.returncode:
        raise ToolError("E_FFMPEG", "ffmpeg failed", r.stderr.strip()[-400:])


def key_mode(src: Path, out: Path, is_image: bool, args) -> dict:
    vf = key_filter(args)
    res = {}
    if is_image:
        dst = unique(out / f"{src.stem}.matte.png")
        ffmpeg(["-i", str(src), "-vf", f"{vf},format=rgba", str(dst)])
    else:
        dst = unique(out / f"{src.stem}.matte.webm")
        ffmpeg(
            [
                "-i",
                str(src),
                "-vf",
                f"{vf},format=yuva420p",
                "-c:v",
                "libvpx-vp9",
                "-b:v",
                "0",
                "-crf",
                "28",
                "-auto-alt-ref",
                "0",
                "-an",
                str(dst),
            ]
        )
    res["matte"] = str(dst)
    if args.mask:
        m = unique(out / f"{src.stem}.mask.{'png' if is_image else 'mp4'}")
        extra = [] if is_image else ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18"]
        ffmpeg(["-i", str(src), "-vf", f"{vf},format=rgba,alphaextract"] + extra + [str(m)])
        res["mask"] = str(m)
    return res


def model_mode(src: Path, out: Path, is_image: bool, args) -> dict:
    import numpy as np
    from PIL import Image
    from rembg import new_session, remove

    session = new_session(args.model)
    res = {}
    if is_image:
        im = Image.open(src).convert("RGB")
        mask = remove(im, session=session, only_mask=True, post_process_mask=True)
        rgba = im.copy()
        rgba.putalpha(mask.convert("L"))
        dst = unique(out / f"{src.stem}.matte.png")
        rgba.save(dst)
        res["matte"] = str(dst)
        if args.mask:
            m = unique(out / f"{src.stem}.mask.png")
            mask.convert("L").save(m)
            res["mask"] = str(m)
        return res
    info = probe(src)
    w, h = info["width"], info["height"]
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", str(src), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE
    )
    dst = unique(out / f"{src.stem}.matte.webm")
    enc = subprocess.Popen(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-s",
            f"{w}x{h}",
            "-r",
            info["fps"],
            "-i",
            "-",
            "-c:v",
            "libvpx-vp9",
            "-pix_fmt",
            "yuva420p",
            "-b:v",
            "0",
            "-crf",
            "28",
            "-auto-alt-ref",
            "0",
            str(dst),
        ],
        stdin=subprocess.PIPE,
    )
    menc = None
    if args.mask:
        mpath = unique(out / f"{src.stem}.mask.mp4")
        menc = subprocess.Popen(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "gray",
                "-s",
                f"{w}x{h}",
                "-r",
                info["fps"],
                "-i",
                "-",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "18",
                str(mpath),
            ],
            stdin=subprocess.PIPE,
        )
        res["mask"] = str(mpath)
    frames = 0
    size = w * h * 3
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        rgb = np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3)
        mask = np.asarray(
            remove(Image.fromarray(rgb), session=session, only_mask=True, post_process_mask=True).convert("L")
        )
        enc.stdin.write(np.dstack([rgb, mask]).tobytes())
        if menc:
            menc.stdin.write(mask.tobytes())
        frames += 1
    dec.wait()
    for p in (enc, menc):
        if p:
            p.stdin.close()
            p.wait()
    if enc.returncode or frames == 0:
        raise ToolError("E_FFMPEG", "encoding the matte failed")
    res.update({"matte": str(dst), "frames": frames})
    return res


def run(args) -> dict:
    src = Path(args.input).expanduser()
    if not src.is_file():
        raise ToolError("E_NOT_FOUND", f"no such file: {src}")
    out = Path(args.out).expanduser() if args.out else src.parent
    out.mkdir(parents=True, exist_ok=True)
    is_image = src.suffix.lower() in IMAGE_EXTS
    res = key_mode(src, out, is_image, args) if args.key else model_mode(src, out, is_image, args)
    return {"input": str(src), "mode": "key" if args.key else "model", "model": None if args.key else args.model, **res}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", help="image or video")
    p.add_argument(
        "--model",
        default="isnet-general-use",
        help="isnet-general-use (default), u2net_human_seg, birefnet-general, u2netp, u2net",
    )
    p.add_argument("--key", metavar="HEX", help="colour-key this backdrop colour instead, e.g. 00B140")
    p.add_argument("--similarity", type=float, default=0.15, help="key: colour distance to remove (default 0.15)")
    p.add_argument("--blend", type=float, default=0.08, help="key: soft edge width (default 0.08)")
    p.add_argument("--despill", action="store_true", help="key: remove green spill on edges")
    p.add_argument("--mask", action="store_true", help="also write the alpha mask")
    p.add_argument("--out", help="output folder (default: next to the input)")
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
    if args.json:
        print(json.dumps({"ok": True, **result}))
    else:
        print(
            f"{result['mode']} matte -> {result['matte']}" + (f" (mask {result['mask']})" if "mask" in result else "")
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
