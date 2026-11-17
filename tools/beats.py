# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["librosa>=0.10.2", "numpy>=1.26"]
# ///
"""Beat grid, tempo, sound onsets and their arrival times; with --cuts, how far each cut sits from the sound.

Onset = where a sound starts. Arrival = where a swell reaches 90% of its rise; a cut that should land
"on" a riser lands on its arrival, not on its onset. Low onsets are kick-like hits under 200 Hz.
With --cuts (a cuts.json from tools/cuts.py) every cut gets the nearest onset and beat and the
offset in ms (positive = picture after sound), corrected for the video and audio stream starts.

Writes beats.json next to source.mp4 (else <stem>.beats.json, or --out).

Examples:
  uv run tools/beats.py refs/x/source.mp4 --cuts refs/x/cuts.json
  uv run tools/beats.py media/music.mp3 --json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import warnings
from pathlib import Path

SR = 22050
HOP = 128  # 5.8 ms


class ToolError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def streams(path: Path) -> dict:
    if not path.is_file():
        raise ToolError("E_NOT_FOUND", f"no such file: {path}")
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,start_time", "-of", "json", str(path)],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    except FileNotFoundError:
        raise ToolError("E_FFMPEG_MISSING", "ffprobe is not installed", "install ffmpeg") from None
    except subprocess.CalledProcessError as e:
        raise ToolError("E_PROBE", f"ffprobe failed on {path}", e.stderr.strip()[:300]) from e
    st = {}
    for s in json.loads(out).get("streams", []):
        st.setdefault(s["codec_type"], float(s.get("start_time") or 0))
    if "audio" not in st:
        raise ToolError("E_NO_AUDIO", f"{path} has no audio stream")
    return st


def load(path: Path):
    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True,
    ).stdout
    y = np.frombuffer(raw, dtype=np.float32)
    if len(y) < SR // 4:
        raise ToolError("E_DECODE", "decoded less than 0.25 s of audio")
    return y


def nearest(values, t):
    if not values:
        return None
    return min(values, key=lambda v: abs(v - t))


def run(args) -> dict:
    import librosa
    import numpy as np

    warnings.filterwarnings("ignore")
    src = Path(args.audio).expanduser()
    st = streams(src)
    y = load(src)
    dur = len(y) / SR
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    peak = float(env.max()) or 1.0
    on_frames = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP, delta=args.delta)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP)
    tempo = float(np.atleast_1d(tempo)[0])
    low_env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP, fmax=200, n_mels=8)
    low_peak = float(low_env.max()) or 1.0
    low_frames = librosa.onset.onset_detect(onset_envelope=low_env, sr=SR, hop_length=HOP, delta=args.delta)
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=HOP)[0]
    db = 20 * np.log10(rms + 1e-9)
    ft = lambda f: round(float(f) * HOP / SR, 3)  # noqa: E731
    win = int(0.4 * SR / HOP)
    onsets = []
    for f in on_frames:
        base = float(db[max(0, f - 4) : f + 1].min())
        seg = db[f : f + win]
        p = f + int(seg.argmax()) if len(seg) else f
        rise = float(db[p]) - base
        arrival = f
        if rise >= 3:
            arrival = next((k for k in range(f, p + 1) if db[k] >= base + 0.9 * rise), p)
        onsets.append(
            {"t": ft(f), "strength": round(float(env[f]) / peak, 2), "arrival": ft(arrival), "rise_db": round(rise, 1)}
        )
    if args.min_strength:
        onsets = [o for o in onsets if o["strength"] >= args.min_strength]
    beats = [ft(f) for f in beat_frames]
    low = [{"t": ft(f), "strength": round(float(low_env[f]) / low_peak, 2)} for f in low_frames]
    step = int(0.1 * SR)
    rms100 = [
        round(float(20 * np.log10(np.sqrt(np.mean(y[i : i + step] ** 2)) + 1e-9)), 1)
        for i in range(0, len(y) - step + 1, step)
    ]
    result = {
        "audio": str(src),
        "duration": round(dur, 3),
        "tempo": round(tempo, 1),
        "beats": beats,
        "onsets": onsets,
        "low_onsets": low,
        "rms_db_100ms": rms100,
    }
    if args.cuts:
        result["cut_alignment"] = align(Path(args.cuts).expanduser(), st, onsets, beats)
    out = (
        Path(args.out).expanduser()
        if args.out
        else src.parent / ("beats.json" if src.stem == "source" else f"{src.stem}.beats.json")
    )
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, indent=1) + "\n")
    os.replace(tmp, out)
    result["out"] = str(out)
    return result


def align(cuts_path: Path, st: dict, onsets: list, beats: list) -> dict:
    if not cuts_path.is_file():
        raise ToolError("E_NOT_FOUND", f"no such cuts file: {cuts_path}", "run tools/cuts.py first")
    cuts = json.loads(cuts_path.read_text())
    fps = cuts.get("fps") or 30
    # cut times are relative to the first video frame; move them onto the audio clock
    shift = st.get("video", 0.0) - st.get("audio", 0.0)
    ons = [o["t"] for o in onsets]
    rows = []
    for c in cuts.get("cuts", []):
        t = round(c["t"] + shift, 3)
        o = nearest(ons, t)
        b = nearest(beats, t)
        row = {
            "cut": c["t"],
            "onset": o,
            "offset_ms": round((t - o) * 1000) if o is not None else None,
            "beat": b,
            "beat_offset_ms": round((t - b) * 1000) if b is not None else None,
        }
        if o is not None:
            arr = next(x["arrival"] for x in onsets if x["t"] == o)
            if arr != o:
                row["arrival"] = arr
                row["arrival_offset_ms"] = round((t - arr) * 1000)
        rows.append(row)
    frame_ms = 1000 / fps
    offs = [abs(r["offset_ms"]) for r in rows if r["offset_ms"] is not None]
    summary = {
        "cuts": len(rows),
        "stream_shift_ms": round(shift * 1000, 1),
        "within_1_frame": sum(o <= frame_ms for o in offs),
        "within_2_frames": sum(o <= 2 * frame_ms for o in offs),
        "median_abs_offset_ms": round(sorted(offs)[len(offs) // 2]) if offs else None,
    }
    return {"summary": summary, "cuts": rows}


def human(r: dict) -> str:
    lines = [
        f"{r['duration']} s, tempo {r['tempo']} BPM, {len(r['beats'])} beats, {len(r['onsets'])} onsets, "
        f"{len(r['low_onsets'])} low hits",
        f"wrote {r['out']}",
    ]
    ca = r.get("cut_alignment")
    if ca:
        s = ca["summary"]
        lines.append(
            f"cuts on sound: {s['within_1_frame']}/{s['cuts']} within 1 frame, "
            f"{s['within_2_frames']}/{s['cuts']} within 2, median |offset| {s['median_abs_offset_ms']} ms"
        )
        for row in ca["cuts"]:
            extra = f", arrival {row['arrival_offset_ms']:+d} ms" if "arrival_offset_ms" in row else ""
            lines.append(
                f"  cut {row['cut']:7.3f}  onset {row['offset_ms']:+5d} ms  beat {row['beat_offset_ms']:+5d} ms{extra}"
            )
    return "\n".join(lines)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("audio", help="audio or video file")
    p.add_argument("--cuts", help="cuts.json to align against the sound")
    p.add_argument("--delta", type=float, default=0.07, help="onset peak threshold (default 0.07; lower finds more)")
    p.add_argument("--min-strength", type=float, default=0.0, help="drop onsets weaker than this (0-1)")
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
