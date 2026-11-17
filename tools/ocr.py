# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["rapidocr>=3.4", "onnxruntime>=1.18", "pillow>=10.1"]
# ///
"""Read on-screen text from a video over time (local OCR, RapidOCR / PP-OCRv5).

Samples a frame every --every seconds (or at --at times), reads every text line, and merges a line
seen on consecutive samples into one span with its first and last time, box and pixel height. The
height is a font-size proxy for copying the text layer. Pick --lang for the script: en, ru (East
Slavic), cyrillic, latin (es, fr, de, pt, it ...), zh, ja, ko. Models (about 15 MB) download on first use.

Writes ocr.json next to source.mp4 (else <stem>.ocr.json, or --out).

Examples:
  uv run tools/ocr.py refs/x/source.mp4
  uv run tools/ocr.py refs/x/source.mp4 --lang ru --every 0.25
  uv run tools/ocr.py render.mp4 --at 0.5,3,11.5 --json
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

LANGS = {
    "en": "EN",
    "ru": "ESLAV",
    "uk": "ESLAV",
    "be": "ESLAV",
    "eslav": "ESLAV",
    "bg": "CYRILLIC",
    "sr": "CYRILLIC",
    "mk": "CYRILLIC",
    "kk": "CYRILLIC",
    "cyrillic": "CYRILLIC",
    "latin": "LATIN",
    "es": "LATIN",
    "fr": "LATIN",
    "de": "LATIN",
    "pt": "LATIN",
    "it": "LATIN",
    "nl": "LATIN",
    "pl": "LATIN",
    "tr": "LATIN",
    "id": "LATIN",
    "vi": "LATIN",
    "zh": "CH",
    "ja": "JAPAN",
    "ko": "KOREAN",
    "ar": "ARABIC",
    "hi": "DEVANAGARI",
    "th": "TH",
    "el": "EL",
}
READ_WIDTH = 720


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
                "stream=width,height,avg_frame_rate:format=duration",
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
    fps = int(num) / int(den) if int(den) and int(num) else None
    return {
        "fps": fps,
        "width": s["width"],
        "height": s["height"],
        "duration": float(data.get("format", {}).get("duration") or 0),
    }


def sample(video: Path, info: dict, times: list[float], tmp: Path) -> list[tuple[float, Path]]:
    if not info["fps"]:  # a still image
        out = tmp / "000000.png"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"scale={READ_WIDTH}:-2", str(out)], check=True
        )
        return [(0.0, out)]
    fps = info["fps"]
    frames = sorted({round(t * fps) for t in times})
    expr = "+".join(f"eq(n\\,{n})" for n in frames)
    r = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(video),
            "-vf",
            f"select='{expr}',scale={READ_WIDTH}:-2:flags=lanczos",
            "-fps_mode",
            "passthrough",
            "-q:v",
            "2",
            str(tmp / "%06d.png"),
        ],
        capture_output=True,
        text=True,
    )
    if r.returncode:
        raise ToolError("E_FFMPEG", "ffmpeg frame extraction failed", r.stderr.strip()[-300:])
    files = sorted(tmp.glob("*.png"))
    return [(n / fps, f) for n, f in zip(frames, files, strict=False)]


def norm(text: str) -> str:
    return re.sub(r"[\W_]+", "", text.lower())


def run(args) -> dict:
    from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR

    video = Path(args.video).expanduser()
    info = probe(video)
    lang = LANGS.get(args.lang.lower())
    if not lang:
        raise ToolError("E_INPUT", f"unknown --lang {args.lang}", "one of: " + ", ".join(sorted(LANGS)))
    engine = RapidOCR(
        params={
            "Rec.lang_type": getattr(LangRec, lang),
            "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.model_type": ModelType.MOBILE,
            "Global.log_level": "critical",
        }
    )
    if args.at:
        times = [float(v) for v in args.at.split(",") if v.strip()]
    else:
        times, t = [], 0.0
        while t < max(info["duration"], 0.001) - 1e-6:
            times.append(t)
            t += args.every
    scale = info["width"] / READ_WIDTH
    spans: list[dict] = []
    open_spans: list[dict] = []
    samples = []
    with tempfile.TemporaryDirectory() as tmp:
        for t, img in sample(video, info, times, Path(tmp)):
            res = engine(str(img))
            items = []
            for box, txt, score in zip(
                res.boxes if res.boxes is not None else [], res.txts or [], res.scores or [], strict=False
            ):
                if float(score) < args.min_score or not norm(txt):
                    continue
                xs, ys = [p[0] * scale for p in box], [p[1] * scale for p in box]
                x, y, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
                items.append(
                    {
                        "text": txt.strip(),
                        "score": round(float(score), 2),
                        "box": [round(x), round(y), round(w), round(h)],
                    }
                )
            samples.append({"t": round(t, 3), "lines": len(items)})
            still_open = []
            for it in items:
                key = norm(it["text"])
                match = next(
                    (s for s in open_spans if difflib.SequenceMatcher(None, s["_key"], key).ratio() >= 0.85), None
                )
                if match:
                    match["last_seen"] = round(t, 3)
                    match["_hits"] += 1
                    if it["score"] > match["score"]:
                        match.update(text=it["text"], score=it["score"], box=it["box"])
                    open_spans.remove(match)
                    still_open.append(match)
                else:
                    span = {
                        "text": it["text"],
                        "first_seen": round(t, 3),
                        "last_seen": round(t, 3),
                        "score": it["score"],
                        "box": it["box"],
                        "_key": key,
                        "_hits": 1,
                    }
                    spans.append(span)
                    still_open.append(span)
            open_spans = still_open
    W, H = info["width"], info["height"]
    for s in spans:
        x, y, w, h = s["box"]
        s["box_norm"] = [round(x / W, 3), round(y / H, 3), round(w / W, 3), round(h / H, 3)]
        s["height_px"] = h
        s["samples"] = s.pop("_hits")
        s.pop("_key")
    result = {
        "video": str(video),
        "lang": args.lang,
        "every": None if args.at else args.every,
        "width": W,
        "height": H,
        "spans": spans,
        "samples": samples,
    }
    out = (
        Path(args.out).expanduser()
        if args.out
        else video.parent / ("ocr.json" if video.stem == "source" else f"{video.stem}.ocr.json")
    )
    tmpf = out.with_suffix(".tmp")
    tmpf.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmpf, out)
    result["out"] = str(out)
    return result


def human(r: dict) -> str:
    lines = [f"{len(r['spans'])} text spans in {len(r['samples'])} samples, wrote {r['out']}"]
    for s in r["spans"]:
        x, y, w, h = s["box"]
        lines.append(f"  {s['first_seen']:6.2f}-{s['last_seen']:6.2f}  h{h:>4}px  at {x},{y}  {s['text']}")
    return "\n".join(lines)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("video", help="video or image file")
    p.add_argument("--lang", default="en", help="script of the text (default en; ru for Russian)")
    p.add_argument("--every", type=float, default=0.5, help="seconds between samples (default 0.5)")
    p.add_argument("--at", help="comma-separated times instead of --every")
    p.add_argument("--min-score", type=float, default=0.6, help="drop lines below this confidence (default 0.6)")
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
    print(json.dumps({"ok": True, **result}, ensure_ascii=False) if args.json else human(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
