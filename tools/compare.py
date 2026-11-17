# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=1.26", "pillow>=10.1"]
# ///
"""Compare a copy against its reference (or a remake against the copy): frames side by side, cuts, motion, sound.

Writes paired frames at matching times (reference left, copy right) on labelled sheets, matches
every cut of A to the nearest cut of B and reports the offset in frames, compares shot length,
still share and motion, and cross-correlates the soundtracks in windows (lag in ms, correlation,
level difference). A lag near 0 with correlation near 1 means the original sound sits where it
should. --offset shifts B against A when the copy starts later on purpose.

Outputs go to <B dir>/compare-<B>-vs-<A>/ (or --out): pairs.jpg (pairs-1.jpg ...) and compare.json.

Examples:
  uv run tools/compare.py refs/x/source.mp4 videos/001-x/render.mp4
  uv run tools/compare.py copy.mp4 render.mp4 --labels copy,remake --every 0.25
  uv run tools/compare.py refs/x/source.mp4 render.mp4 --at 0.2,0.9,3.4 --json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True  # importing the sibling cuts.py must not leave __pycache__ in tools/
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cuts as cutlib  # noqa: E402

SR = 48000


class ToolError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def label_of(p: Path) -> str:
    return p.parent.name if p.stem == "source" else p.stem


def streams(p: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,start_time", "-of", "json", str(p)],
        capture_output=True,
        text=True,
    ).stdout
    st = {}
    for s in json.loads(out or "{}").get("streams", []):
        st.setdefault(s["codec_type"], float(s.get("start_time") or 0))
    return st


def grab(video: Path, fps: float, last: int, times: list[float], width: int, tmp: Path) -> dict[int, Path]:
    frames = sorted({min(max(round(t * fps), 0), last) for t in times})
    expr = "+".join(f"eq(n\\,{n})" for n in frames)
    tmp.mkdir()
    r = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(video),
            "-vf",
            f"select='{expr}',scale={width}:-2:flags=lanczos",
            "-fps_mode",
            "passthrough",
            "-q:v",
            "2",
            str(tmp / "%06d.jpg"),
        ],
        capture_output=True,
        text=True,
    )
    if r.returncode:
        raise ToolError("E_FFMPEG", f"frame extraction failed on {video}", r.stderr.strip()[-300:])
    return dict(zip(frames, sorted(tmp.glob("*.jpg")), strict=False))


def pair_sheets(rows, labels, out: Path, width: int, cols: int, per_sheet: int) -> list[str]:
    from PIL import Image, ImageDraw, ImageFont

    try:
        font = ImageFont.load_default(size=15)
    except TypeError:
        font = ImageFont.load_default()
    tiles = []
    for t, pa, pb in rows:
        a, b = Image.open(pa).convert("RGB"), Image.open(pb).convert("RGB")
        ha, hb = round(a.height * width / a.width), round(b.height * width / b.width)
        h = max(ha, hb)
        tile = Image.new("RGB", (2 * width + 6, h + 22), "#202020")
        tile.paste(a.resize((width, ha)), (0, 22))
        tile.paste(b.resize((width, hb)), (width + 6, 22))
        d = ImageDraw.Draw(tile)
        d.text((3, 3), f"{t:.2f}s {labels[0]}", fill="#ffe666", font=font)
        d.text((width + 9, 3), labels[1], fill="#9fe870", font=font)
        tiles.append(tile)
    paths = []
    chunks = [tiles[i : i + per_sheet] for i in range(0, len(tiles), per_sheet)]
    for k, chunk in enumerate(chunks, 1):
        c = min(cols, len(chunk))
        r = (len(chunk) + c - 1) // c
        tw, th = chunk[0].width, max(x.height for x in chunk)
        sheet = Image.new("RGB", (c * (tw + 8) + 8, r * (th + 8) + 8), "#101010")
        for i, x in enumerate(chunk):
            sheet.paste(x, (8 + (i % c) * (tw + 8), 8 + (i // c) * (th + 8)))
        p = out / ("pairs.jpg" if len(chunks) == 1 else f"pairs-{k}.jpg")
        sheet.save(p, quality=88)
        paths.append(str(p))
    return paths


def load_audio(p: Path):
    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(p), "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def audio_sync(a, b, windows, offset: float, maxlag_s: float = 0.25) -> list[dict]:
    import numpy as np

    res = []
    maxlag = int(maxlag_s * SR)
    for t0, t1 in windows:
        i0, i1 = int(t0 * SR), int(t1 * SR)
        j0 = i0 + int(offset * SR)
        A = a[i0:i1]
        lo = max(0, j0 - maxlag)
        seg = b[lo : j0 + (i1 - i0) + maxlag]
        if len(A) < SR // 4 or len(seg) < len(A):
            continue
        n = len(A) + len(seg)
        nfft = 1 << (n - 1).bit_length()
        c = np.fft.irfft(np.fft.rfft(seg, nfft) * np.conj(np.fft.rfft(A, nfft)), nfft)
        base = j0 - lo
        lags = np.arange(-min(maxlag, base), maxlag + 1)
        vals = np.array([c[(base + L) % nfft] for L in lags])
        k = int(np.argmax(vals))
        d = 0.0
        if 0 < k < len(vals) - 1:
            y0, y1, y2 = vals[k - 1], vals[k], vals[k + 1]
            den = y0 - 2 * y1 + y2
            d = 0.5 * (y0 - y2) / den if den else 0.0
        lag = (lags[k] + d) / SR
        B = b[j0 + lags[k] : j0 + lags[k] + len(A)]
        if len(B) < len(A):
            continue
        corr = float(np.dot(A, B) / (np.linalg.norm(A) * np.linalg.norm(B) + 1e-12))
        lvl = 20 * np.log10((np.sqrt(np.mean(B**2)) + 1e-12) / (np.sqrt(np.mean(A**2)) + 1e-12))
        res.append(
            {
                "window": [t0, t1],
                "lag_ms": round(lag * 1000, 2),
                "corr": round(corr, 4),
                "level_db": round(float(lvl), 2),
            }
        )
    return res


def cut_match(ca: list[dict], cb: list[dict], offset: float, fps: float, tol: float) -> dict:
    bt = [c["t"] - offset for c in cb]
    used, rows, missing = set(), [], []
    for c in ca:
        best = min(((abs(t - c["t"]), i) for i, t in enumerate(bt) if i not in used), default=None)
        if best and best[0] <= tol:
            used.add(best[1])
            rows.append({"a": c["t"], "b": cb[best[1]]["t"], "frames": round((bt[best[1]] - c["t"]) * fps)})
        else:
            missing.append(c["t"])
    extra = [cb[i]["t"] for i in range(len(cb)) if i not in used]
    exact = sum(1 for r in rows if r["frames"] == 0)
    return {
        "matched": rows,
        "missing_in_b": missing,
        "extra_in_b": extra,
        "summary": {
            "a_cuts": len(ca),
            "b_cuts": len(cb),
            "matched": len(rows),
            "same_frame": exact,
            "within_1_frame": sum(1 for r in rows if abs(r["frames"]) <= 1),
        },
    }


def run(args) -> dict:
    import numpy as np

    pa, pb = Path(args.a).expanduser(), Path(args.b).expanduser()
    ia, ib = cutlib.probe(pa), cutlib.probe(pb)  # raises on missing files
    labels = args.labels.split(",") if args.labels else [label_of(pa), label_of(pb)]
    out = Path(args.out).expanduser() if args.out else pb.parent / f"compare-{label_of(pb)}-vs-{label_of(pa)}"
    out.mkdir(parents=True, exist_ok=True)
    fa, fb = cutlib.decode(pa, ia), cutlib.decode(pb, ib)
    da, blk_a, cuts_a, _ = cutlib.analyse(fa, 3.0, 10.0, 1.5, 2, 15)
    db, blk_b, cuts_b, _ = cutlib.analyse(fb, 3.0, 10.0, 1.5, 2, 15)
    for c in cuts_a:
        c["t"] = round(c["frame"] / ia["fps"], 3)
    for c in cuts_b:
        c["t"] = round(c["frame"] / ib["fps"], 3)
    dur_a, dur_b = len(fa) / ia["fps"], len(fb) / ib["fps"]
    span = max(0.0, min(dur_a, dur_b - args.offset))
    if args.at:
        times = [float(v) for v in args.at.split(",") if v.strip()]
    else:
        times, t = [], 0.0
        while t < span - 1e-6:
            times.append(round(t, 3))
            t += args.every
    times = [t for t in times if t < dur_a and 0 <= t + args.offset < dur_b]
    if not times:
        raise ToolError("E_INPUT", "no common times to compare", "check --offset and --at")
    with tempfile.TemporaryDirectory(dir=out) as tmp:
        ga = grab(pa, ia["fps"], len(fa) - 1, times, args.width, Path(tmp) / "a")
        gb = grab(pb, ib["fps"], len(fb) - 1, [t + args.offset for t in times], args.width, Path(tmp) / "b")
        rows, diffs = [], []
        for t in times:
            na = min(max(round(t * ia["fps"]), 0), len(fa) - 1)
            nb = min(max(round((t + args.offset) * ib["fps"]), 0), len(fb) - 1)
            if na in ga and nb in gb:
                rows.append((t, ga[na], gb[nb]))
                x, y = fa[na], fb[nb]
                if x.shape == y.shape:
                    diffs.append((t, round(float(np.abs(x - y).mean()), 2)))
        sheets = pair_sheets(rows, labels, out, args.width, args.cols, args.per_sheet)

    def stats(d, blk, cuts, dur):
        starts = [0.0] + [c["t"] for c in cuts] + [dur]
        shots = [b - a for a, b in zip(starts, starts[1:], strict=False)]
        return {
            "duration": round(dur, 3),
            "shots": len(shots),
            "median_shot": round(float(np.median(shots)), 3),
            "still_share": round(float((blk[1:] < 1.5).mean()), 3),
            "mean_motion": round(float(d[1:].mean()), 2),
        }

    result = {
        "a": str(pa),
        "b": str(pb),
        "labels": labels,
        "offset": args.offset,
        "out": str(out),
        "sheets": sheets,
        "video": {"a": stats(da, blk_a, cuts_a, dur_a), "b": stats(db, blk_b, cuts_b, dur_b)},
        "cuts": cut_match(cuts_a, cuts_b, args.offset, ia["fps"], args.tolerance),
        "frame_diff": sorted(diffs, key=lambda x: -x[1])[:10] if diffs else [],
    }
    sa, sb = streams(pa), streams(pb)
    result["stream_start"] = {"a": sa, "b": sb}
    if "audio" in sa and "audio" in sb:
        aa, ab = load_audio(pa), load_audio(pb)
        common = min(len(aa) / SR, len(ab) / SR - args.offset)
        n = max(1, args.windows)
        w = min(2.0, common / n)
        windows = [(round(i * common / n, 2), round(i * common / n + w, 2)) for i in range(n)]
        sync = audio_sync(aa, ab, windows, args.offset)
        result["audio"] = {
            "windows": sync,
            "median_lag_ms": round(float(np.median([s["lag_ms"] for s in sync])), 2) if sync else None,
            "min_corr": min((s["corr"] for s in sync), default=None),
        }
    else:
        result["audio"] = None
    tmpf = out / "compare.json.tmp"
    tmpf.write_text(json.dumps(result, indent=1) + "\n")
    os.replace(tmpf, out / "compare.json")
    return result


def human(r: dict) -> str:
    va, vb = r["video"]["a"], r["video"]["b"]
    la, lb = r["labels"]
    lines = [
        f"{la}: {va['duration']} s, {va['shots']} shots (median {va['median_shot']} s), still {va['still_share']:.0%}, "
        f"motion {va['mean_motion']}",
        f"{lb}: {vb['duration']} s, {vb['shots']} shots (median {vb['median_shot']} s), still {vb['still_share']:.0%}, "
        f"motion {vb['mean_motion']}",
    ]
    cs = r["cuts"]["summary"]
    lines.append(
        f"cuts: {cs['matched']}/{cs['a_cuts']} of {la} matched in {lb}, {cs['same_frame']} on the same frame, "
        f"{cs['within_1_frame']} within 1 frame; missing {r['cuts']['missing_in_b']}, extra {r['cuts']['extra_in_b']}"
    )
    for m in r["cuts"]["matched"]:
        if m["frames"]:
            lines.append(f"  cut {m['a']:.3f} -> {m['b']:.3f} ({m['frames']:+d} frames)")
    if r["audio"]:
        lines.append(f"audio: median lag {r['audio']['median_lag_ms']} ms, min corr {r['audio']['min_corr']}")
        for s in r["audio"]["windows"]:
            lines.append(
                f"  {s['window'][0]:.1f}-{s['window'][1]:.1f} s  lag {s['lag_ms']:+.2f} ms  corr {s['corr']}  "
                f"level {s['level_db']:+.2f} dB"
            )
    if r["frame_diff"]:
        lines.append("largest frame differences: " + ", ".join(f"{t:.2f}s={d}" for t, d in r["frame_diff"][:5]))
    lines += [f"sheet {s}" for s in r["sheets"]]
    return "\n".join(lines)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("a", help="reference (or the earlier version)")
    p.add_argument("b", help="copy (or the newer version)")
    p.add_argument("--every", type=float, default=0.5, help="seconds between pairs (default 0.5)")
    p.add_argument("--at", help="comma-separated times (A clock) instead of --every")
    p.add_argument("--offset", type=float, default=0.0, help="B time = A time + offset (default 0)")
    p.add_argument("--labels", help="two labels, e.g. ref,copy")
    p.add_argument("--tolerance", type=float, default=0.3, help="max distance in s to match cuts (default 0.3)")
    p.add_argument("--windows", type=int, default=4, help="audio windows to correlate (default 4)")
    p.add_argument("--width", type=int, default=240, help="width of each frame in a pair (default 240)")
    p.add_argument("--cols", type=int, default=4, help="pairs per row (default 4)")
    p.add_argument("--per-sheet", type=int, default=24, help="pairs per sheet (default 24)")
    p.add_argument("--out", help="output folder")
    p.add_argument("--json", action="store_true", help="print one JSON object")
    args = p.parse_args(argv)
    try:
        result = run(args)
    except (ToolError, cutlib.ToolError) as e:
        if args.json:
            print(json.dumps({"ok": False, "error": {"code": e.code, "message": e.message, "hint": e.hint}}))
        else:
            print(f"error: {e.message}" + (f"\nhint: {e.hint}" if e.hint else ""), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, **result}) if args.json else human(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
