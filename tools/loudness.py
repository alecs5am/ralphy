# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Measure loudness (integrated LUFS, true peak, range) of audio or video files; optionally normalize.

Measures with ffmpeg's EBU R128 loudnorm analysis. --target sets a LUFS goal and reports the gain
each file needs; --match uses another file's loudness as the goal (copy the reference's level,
not a generic one). --normalize writes <name>.norm.<ext> next to each input with a two-pass
loudnorm; video streams are copied untouched. Inputs are never overwritten.

Examples:
  uv run tools/loudness.py refs/x/source.mp4 render.mp4
  uv run tools/loudness.py media/sfx/*.wav --target -20 --normalize
  uv run tools/loudness.py render.mp4 --match refs/x/source.mp4 --json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


class ToolError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def measure(path: Path, tp: float, lra: float, target: float) -> dict:
    if not path.is_file():
        raise ToolError("E_NOT_FOUND", f"no such file: {path}")
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        str(path),
        "-vn",
        "-af",
        f"loudnorm=I={target}:TP={tp}:LRA={lra}:print_format=json",
        "-f",
        "null",
        "-",
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        raise ToolError("E_FFMPEG_MISSING", "ffmpeg is not installed", "install ffmpeg") from None
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S)
    if r.returncode or not m:
        raise ToolError("E_MEASURE", f"could not measure {path}", "does the file have an audio stream?")
    d = json.loads(m.group(0))
    num = lambda k: None if d[k] in ("-inf", "inf") else float(d[k])  # noqa: E731
    return {
        "file": str(path),
        "lufs": num("input_i"),
        "true_peak": num("input_tp"),
        "lra": num("input_lra"),
        "threshold": num("input_thresh"),
        "offset": num("target_offset"),
    }


def unique(path: Path) -> Path:
    if not path.exists():
        return path
    n = 2
    while (cand := path.with_name(f"{path.stem}.{n}{path.suffix}")).exists():
        n += 1
    return cand


def normalize(src: Path, m: dict, target: float, tp: float, lra: float) -> str:
    out = unique(src.with_name(f"{src.stem}.norm{src.suffix}"))
    af = (
        f"loudnorm=I={target}:TP={tp}:LRA={lra}:measured_I={m['lufs']}:measured_TP={m['true_peak']}:"
        f"measured_LRA={m['lra']}:measured_thresh={m['threshold']}:offset={m['offset']}:linear=true"
    )
    has_video = (
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                str(src),
            ],
            capture_output=True,
            text=True,
        ).stdout.strip()
        != ""
    )
    cmd = ["ffmpeg", "-v", "error", "-i", str(src), "-af", af, "-ar", "48000"]
    if has_video and src.suffix.lower() in (".mp4", ".mov", ".m4v", ".mkv", ".webm"):
        cmd += ["-c:v", "copy", "-c:a", "aac" if src.suffix.lower() != ".webm" else "libopus", "-b:a", "192k"]
    elif src.suffix.lower() == ".mp3":
        cmd += ["-c:a", "libmp3lame", "-b:a", "192k"]
    elif src.suffix.lower() in (".m4a", ".aac"):
        cmd += ["-c:a", "aac", "-b:a", "192k"]
    r = subprocess.run(cmd + [str(out)], capture_output=True, text=True)
    if r.returncode:
        raise ToolError("E_NORMALIZE", f"normalizing {src} failed", r.stderr.strip()[-300:])
    return str(out)


def run(args) -> dict:
    goal = args.target
    match = None
    if args.match:
        match = measure(Path(args.match).expanduser(), args.tp, args.lra, -14)
        goal = match["lufs"]
        if goal is None:
            raise ToolError("E_MEASURE", f"{args.match} is silent; nothing to match")
    if args.normalize and goal is None:
        raise ToolError("E_INPUT", "--normalize needs --target or --match")
    files = []
    for f in args.files:
        m = measure(Path(f).expanduser(), args.tp, args.lra, goal if goal is not None else -14)
        if goal is not None and m["lufs"] is not None:
            m["gain_db"] = round(goal - m["lufs"], 2)
        if args.normalize:
            if m["lufs"] is None:
                m["normalized"] = None
            else:
                m["normalized"] = normalize(Path(f).expanduser(), m, goal, args.tp, args.lra)
        m.pop("offset", None)
        m.pop("threshold", None)
        files.append(m)
    if match:
        match.pop("offset", None)
        match.pop("threshold", None)
    return {"target": goal, "match": match, "files": files}


def human(r: dict) -> str:
    lines = []
    if r["match"]:
        lines.append(f"match {r['match']['file']}: {r['match']['lufs']} LUFS")
    for f in r["files"]:
        s = f"{f['lufs']} LUFS  TP {f['true_peak']} dBTP  LRA {f['lra']}  {f['file']}"
        if "gain_db" in f:
            s += f"  gain {f['gain_db']:+.2f} dB"
        if f.get("normalized"):
            s += f"  -> {f['normalized']}"
        lines.append(s)
    return "\n".join(lines)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("files", nargs="+", help="audio or video files")
    p.add_argument("--target", type=float, help="goal in LUFS, e.g. -14")
    p.add_argument("--match", help="use this file's integrated loudness as the goal")
    p.add_argument("--tp", type=float, default=-1.0, help="true-peak ceiling in dBTP (default -1)")
    p.add_argument("--lra", type=float, default=11.0, help="loudness range for normalizing (default 11)")
    p.add_argument("--normalize", action="store_true", help="write <name>.norm.<ext> at the goal")
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
