# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["faster-whisper>=1.1"]
# ///
"""Transcribe speech locally (faster-whisper) with word-level timings.

Free and offline after the first model download (tiny 75 MB, base 145 MB, small 480 MB,
medium 1.5 GB, large-v3 3 GB, cached by Hugging Face). Use it to read what a reference says and
when, and to cut a voiceover take on word boundaries. Pass --language when you know it: auto-detect
is unreliable on clips under ~10 s and on music. Never use the .en models on non-English audio.
Words with probability under 0.5 are listed in low_confidence: check them (names, numbers, stress).

Writes transcript.json next to source.mp4 (else <stem>.transcript.json, or --out); --srt also
writes a word-grouped .srt next to it.

Examples:
  uv run tools/transcribe.py refs/x/source.mp4 --language en
  uv run tools/transcribe.py media/vo-take-1.mp3 --language ru --model medium --srt
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


class ToolError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def srt_time(t: float) -> str:
    ms = round(t * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(words: list[dict], path: Path, per_line: int) -> None:
    lines, idx, i = [], 1, 0
    while i < len(words):
        chunk = words[i : i + per_line]
        lines += [
            str(idx),
            f"{srt_time(chunk[0]['start'])} --> {srt_time(chunk[-1]['end'])}",
            " ".join(w["w"] for w in chunk),
            "",
        ]
        idx += 1
        i += per_line
    path.write_text("\n".join(lines))


def run(args) -> dict:
    src = Path(args.audio).expanduser()
    if not src.is_file():
        raise ToolError("E_NOT_FOUND", f"no such file: {src}")
    if args.model.endswith(".en") and args.language not in (None, "en"):
        raise ToolError("E_INPUT", ".en models only transcribe English", "use the multilingual model name")
    # decode with ffmpeg: faster-whisper's own PyAV path breaks across PyAV releases
    try:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
            capture_output=True,
            check=True,
        ).stdout
    except FileNotFoundError:
        raise ToolError("E_FFMPEG_MISSING", "ffmpeg is not installed", "install ffmpeg") from None
    except subprocess.CalledProcessError as e:
        raise ToolError("E_DECODE", f"ffmpeg could not decode {src}", e.stderr.decode()[-300:]) from e
    import numpy as np

    audio = np.frombuffer(raw, dtype=np.float32)
    if len(audio) < 1600:
        raise ToolError("E_NO_AUDIO", f"{src} has no audio to transcribe")
    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device="cpu", compute_type=args.compute_type)
    try:
        segments, info = model.transcribe(
            audio,
            language=args.language,
            word_timestamps=True,
            vad_filter=not args.no_vad,
            beam_size=5,
            condition_on_previous_text=False,
        )
        segments = list(segments)
    except Exception as e:
        raise ToolError("E_TRANSCRIBE", f"transcription failed: {e}") from e
    words, segs = [], []
    for s in segments:
        segs.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()})
        for w in s.words or []:
            words.append(
                {"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "p": round(w.probability, 2)}
            )
    result = {
        "audio": str(src),
        "model": args.model,
        "language": info.language,
        "language_probability": round(info.language_probability, 2),
        "duration": round(info.duration, 3),
        "text": " ".join(s["text"] for s in segs).strip(),
        "words": words,
        "segments": segs,
        "low_confidence": [w for w in words if w["p"] < 0.5],
    }
    out = (
        Path(args.out).expanduser()
        if args.out
        else src.parent / ("transcript.json" if src.stem == "source" else f"{src.stem}.transcript.json")
    )
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, out)
    result["out"] = str(out)
    if args.srt and words:
        srt = out.with_suffix(".srt")
        write_srt(words, srt, args.words_per_line)
        result["srt"] = str(srt)
    return result


def human(r: dict) -> str:
    lines = [
        f"{r['language']} ({r['language_probability']}), {len(r['words'])} words, {r['duration']} s, "
        f"model {r['model']}",
        f"wrote {r['out']}",
    ]
    if not r["words"]:
        lines.append("no speech found")
    for s in r["segments"][:40]:
        lines.append(f"  {s['start']:7.2f}-{s['end']:7.2f}  {s['text']}")
    if r["low_confidence"]:
        lines.append("low confidence: " + ", ".join(f"{w['w']}@{w['start']}" for w in r["low_confidence"][:30]))
    return "\n".join(lines)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("audio", help="audio or video file")
    p.add_argument("--model", default="small", help="tiny | base | small | medium | large-v3 (default small)")
    p.add_argument("--language", help="ISO code such as en, ru, es (default: detect)")
    p.add_argument("--compute-type", default="int8", help="int8 (default), int8_float32, float32")
    p.add_argument("--no-vad", action="store_true", help="do not skip non-speech parts (slower, may hallucinate)")
    p.add_argument("--srt", action="store_true", help="also write an .srt")
    p.add_argument("--words-per-line", type=int, default=4, help="words per .srt cue (default 4)")
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
