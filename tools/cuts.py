# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=1.26"]
# ///
"""Find hard cuts, shots, flashes and still frames in a video, frame-exact.

A cut is a frame whose difference from the previous frame spikes far above the local median.
A cut here is any hard picture change: a shot change, a jump zoom or a graphic slam; read the
frames to tell them apart. A spike that returns to the previous picture within two frames is a
flash (lightning, strobe, white pop), not a cut. Still share is the share of frame pairs where no
part of the picture moves; a slow whole-frame zoom counts as still. A copy with a much higher still
share than its reference reads as static.

Writes cuts.json next to source.mp4 (else <stem>.cuts.json, or --out).

Examples:
  uv run tools/cuts.py refs/x/source.mp4
  uv run tools/cuts.py render.mp4 --json
  uv run tools/cuts.py refs/x/source.mp4 --ratio 2.5 --min-diff 8   # more sensitive
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

W = 64  # analysis width in px; small frames average out compression noise


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
                "-show_entries",
                "stream=width,height,avg_frame_rate,start_time:format=duration",
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
    return {
        "fps": int(num) / int(den) if int(den) else 30.0,
        "width": s["width"],
        "height": s["height"],
        "start_time": float(s.get("start_time") or 0),
        "duration": float(data["format"].get("duration") or 0),
    }


def frame_times(path: Path) -> list[float]:
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "packet=pts_time",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
    ).stdout
    ts = sorted(float(v) for v in out.split() if v and v != "N/A")
    return ts


def decode(path: Path, info: dict):
    import numpy as np

    h = max(2, round(info["height"] * W / info["width"] / 2) * 2)
    cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(path),
        "-vf",
        f"scale={W}:{h}:flags=area",
        "-fps_mode",
        "passthrough",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
    ]
    raw = subprocess.run(cmd, capture_output=True).stdout
    n = len(raw) // (W * h * 3)
    if n < 2:
        raise ToolError("E_DECODE", "could not decode at least two frames")
    return np.frombuffer(raw[: n * W * h * 3], dtype=np.uint8).reshape(n, h, W, 3).astype(np.int16)


def analyse(frames, ratio: float, min_diff: float, still: float, min_frames: int, window: int):
    import numpy as np

    n, h, w, _ = frames.shape
    diff = np.abs(frames[1:] - frames[:-1]).mean(axis=3)
    d = np.zeros(n)
    d[1:] = diff.mean(axis=(1, 2))
    # stillness: the most-changed 8x8 block; a small moving element keeps a frame pair from being still,
    # a slow whole-frame zoom does not
    hb, wb = h // 8, w // 8
    blocks = np.zeros(n)
    blocks[1:] = (
        diff[:, : hb * 8, : wb * 8].reshape(n - 1, hb, 8, wb, 8).mean(axis=(2, 4)).reshape(n - 1, -1).max(axis=1)
    )

    def mad(i, j):
        return float(np.abs(frames[i] - frames[j]).mean())

    cuts, flashes = [], []
    last = -min_frames
    for i in range(1, n):
        lo, hi = max(1, i - window), min(n, i + window + 1)
        neigh = np.concatenate([d[lo:i], d[i + 1 : hi]])
        base = float(np.median(neigh)) if len(neigh) else 0.0
        if d[i] < min_diff or d[i] < ratio * max(base, 0.5):
            continue
        if i + 1 < n and d[i + 1] > d[i]:
            continue  # the peak is on the next frame
        returns = [k for k in (i + 1, i + 2) if k < n and mad(k, i - 1) < 0.35 * d[i]]
        if returns:
            flashes.append({"frame": i, "score": round(float(d[i]), 2), "frames": returns[0] - i})
            continue
        if i - last < min_frames:
            if cuts and d[i] > cuts[-1]["score"]:
                cuts[-1] = {"frame": i, "score": round(float(d[i]), 2), "base": round(base, 2)}
                last = i
            continue
        cuts.append({"frame": i, "score": round(float(d[i]), 2), "base": round(base, 2)})
        last = i
    return d, blocks, cuts, flashes


def run(args) -> dict:
    import numpy as np

    video = Path(args.video).expanduser()
    info = probe(video)
    frames = decode(video, info)
    n = len(frames)
    ts = frame_times(video)
    if len(ts) == n:
        t0 = ts[0]
        times = [t - t0 for t in ts]
    else:
        times = [i / info["fps"] for i in range(n)]
    end = times[-1] + 1 / info["fps"]
    d, blocks, cuts, flashes = analyse(frames, args.ratio, args.min_diff, args.still, args.min_frames, args.window)
    for c in cuts + flashes:
        c["t"] = round(times[c["frame"]], 3)
    starts = [0] + [c["frame"] for c in cuts]
    shots = []
    for k, s in enumerate(starts):
        e = starts[k + 1] if k + 1 < len(starts) else n
        seg = d[s + 1 : e]
        shots.append(
            {
                "n": k + 1,
                "start": round(times[s], 3),
                "end": round(times[e] if e < n else end, 3),
                "frames": e - s,
                "dur": round((times[e] if e < n else end) - times[s], 3),
                "motion": round(float(seg.mean()), 2) if len(seg) else 0.0,
                "still_share": round(float((blocks[s + 1 : e] < args.still).mean()), 3) if len(seg) else 1.0,
            }
        )
    durs = [s["dur"] for s in shots]
    still_mask = blocks[1:] < args.still
    longest, run_len = 0, 0
    for v in still_mask:
        run_len = run_len + 1 if v else 0
        longest = max(longest, run_len)
    stats = {
        "shots": len(shots),
        "median_shot": round(float(np.median(durs)), 3),
        "longest_shot": round(max(durs), 3),
        "still_share": round(float(still_mask.mean()), 3),
        "longest_still": round(longest / info["fps"], 3),
        "mean_motion": round(float(d[1:].mean()), 2),
        "flashes": len(flashes),
    }
    result = {
        "video": str(video),
        "fps": round(info["fps"], 3),
        "frames": n,
        "duration": round(end, 3),
        "start_time": round(info["start_time"], 3),
        "cuts": cuts,
        "flashes": flashes,
        "shots": shots,
        "stats": stats,
        "params": {"ratio": args.ratio, "min_diff": args.min_diff, "still": args.still, "min_frames": args.min_frames},
    }
    if args.out:
        out = Path(args.out).expanduser()
    else:
        out = video.parent / ("cuts.json" if video.stem == "source" else f"{video.stem}.cuts.json")
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, indent=1) + "\n")
    os.replace(tmp, out)
    result["out"] = str(out)
    return result


def human(r: dict) -> str:
    s = r["stats"]
    lines = [
        f"{s['shots']} shots in {r['duration']} s ({r['fps']} fps): median {s['median_shot']} s, "
        f"longest {s['longest_shot']} s, still {s['still_share'] * 100:.0f}% (longest still {s['longest_still']} s), "
        f"flashes {s['flashes']}",
        f"wrote {r['out']}",
    ]
    for sh in r["shots"]:
        lines.append(f"  {sh['n']:>3}  {sh['start']:7.3f}-{sh['end']:7.3f}  {sh['dur']:6.3f} s  motion {sh['motion']}")
    return "\n".join(lines)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("video")
    p.add_argument("--ratio", type=float, default=3.0, help="spike must exceed this x the local median (default 3)")
    p.add_argument(
        "--min-diff",
        type=float,
        default=10.0,
        help="minimum mean pixel difference, 0-255 scale, for a cut (default 10)",
    )
    p.add_argument("--min-frames", type=int, default=2, help="shortest shot in frames (default 2)")
    p.add_argument("--window", type=int, default=15, help="frames each side for the local median (default 15)")
    p.add_argument(
        "--still",
        type=float,
        default=1.5,
        help="a frame pair is still when no 8x8 block changes more than this (default 1.5)",
    )
    p.add_argument("--out", help="output JSON path")
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
