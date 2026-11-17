# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Break a reference down: pull, cuts, beats, frames, transcript (and OCR), then a timecoded breakdown.md skeleton.

Takes a URL, a local video, or a refs/<slug>/ folder. Runs the sibling tools through uv and writes
into the reference folder: source.mp4, source.json, cuts.json, beats.json, transcript.json,
frames/sheet*.jpg (whole video), frames/shots*.jpg (first frame of every shot), optional ocr.json,
and breakdown.md: header facts, one table row per shot with in/out times, the cut's offset from
the nearest sound onset, and the words said in that shot, plus the sections the agent fills in by
reading the frames. An existing breakdown.md is never overwritten (breakdown.2.md is written).

Examples:
  uv run tools/breakdown.py https://www.tiktok.com/@user/video/123          # into ./refs/<slug>/
  uv run tools/breakdown.py refs/type-charge-original --ocr --language en
  uv run tools/breakdown.py ~/Downloads/clip.mp4 --refs ~/ralphy/ui-effects/refs --json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent


class ToolError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def tool(name: str, *args: str) -> dict:
    uv = shutil.which("uv")
    if not uv:
        raise ToolError("E_UV_MISSING", "uv is not installed", "curl -LsSf https://astral.sh/uv/install.sh | sh")
    env = {k: v for k, v in os.environ.items() if k != "VIRTUAL_ENV"}
    r = subprocess.run(
        [uv, "run", "--quiet", "--script", str(TOOLS / f"{name}.py"), *args, "--json"],
        capture_output=True,
        text=True,
        env=env,
    )
    line = next((ln for ln in reversed(r.stdout.strip().splitlines()) if ln.startswith("{")), "")
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        data = {
            "ok": False,
            "error": {"code": "E_TOOL", "message": f"{name} failed", "hint": (r.stderr or r.stdout).strip()[-400:]},
        }
    return data


def resolve(args) -> Path:
    src = args.source
    if re.match(r"^https?://", src):
        extra = ["--refs", args.refs] + (["--slug", args.slug] if args.slug else [])
        res = tool("pull", src, *extra)
        if not res.get("ok"):
            e = res["error"]
            raise ToolError(e["code"], e["message"], e.get("hint", ""))
        return Path(res["dir"])
    p = Path(src).expanduser()
    if p.is_dir():
        if not (p / "source.mp4").exists():
            raise ToolError("E_NOT_FOUND", f"{p} has no source.mp4", "pass the video file or a URL")
        return p
    if p.is_file() and p.stem == "source":
        return p.parent
    if p.is_file():
        extra = ["--refs", args.refs] + (["--slug", args.slug] if args.slug else [])
        res = tool("pull", str(p), *extra)
        if not res.get("ok"):
            e = res["error"]
            raise ToolError(e["code"], e["message"], e.get("hint", ""))
        return Path(res["dir"])
    raise ToolError("E_NOT_FOUND", f"no such file, folder or URL: {src}")


def has_audio(video: Path) -> bool:
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            str(video),
        ],
        capture_output=True,
        text=True,
    ).stdout
    return bool(out.strip())


def cell(text: str, limit: int = 90) -> str:
    text = re.sub(r"\s+", " ", text or "").replace("|", "/").strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def fmt_count(v) -> str:
    if v is None:
        return "?"
    v = float(v)
    for unit, div in (("M", 1e6), ("K", 1e3)):
        if v >= div:
            return f"{v / div:.1f}{unit}"
    return str(int(v))


def write_md(
    d: Path,
    meta: dict,
    cuts: dict | None,
    beats: dict | None,
    tr: dict | None,
    ocr: dict | None,
    loud: dict | None,
    sheets: list[str],
    shot_sheets: list[str],
) -> Path:
    rel = lambda p: os.path.relpath(p, d)  # noqa: E731
    title = meta.get("title") or d.name
    lines = [f"# Breakdown: {cell(title, 80)}", ""]
    src = meta.get("webpage_url") or meta.get("url") or meta.get("original_path") or "local file"
    lines.append(f"- Source: {src}")
    if meta.get("platform") and meta.get("platform") != "local":
        lines.append(
            f"- Creator: {meta.get('author') or '?'} (@{meta.get('author_id') or '?'}), "
            f"{fmt_count(meta.get('followers'))} followers; {meta.get('platform')}, "
            f"published {meta.get('published_at') or '?'}"
        )
        lines.append(
            f"- Stats at pull ({(meta.get('pulled_at') or '')[:10]}): views {fmt_count(meta.get('views'))}, "
            f"likes {fmt_count(meta.get('likes'))}, comments {fmt_count(meta.get('comments'))}, "
            f"shares {fmt_count(meta.get('shares'))}; multiplier vs the creator's median: (fill from trends)"
        )
    if meta.get("music"):
        lines.append(f"- Sound: {meta['music'].get('track', '?')} by {meta['music'].get('artist', '?')}")
    lines.append(
        f"- File: source.mp4, {meta.get('duration')} s, {meta.get('width')}x{meta.get('height')}, "
        f"{meta.get('fps')} fps, sha256 {str(meta.get('sha256', ''))[:12]}"
    )
    if cuts:
        s = cuts["stats"]
        lines.append(
            f"- Picture: {s['shots']} shots, median {s['median_shot']} s, longest {s['longest_shot']} s, "
            f"still {s['still_share']:.0%} (longest still {s['longest_still']} s), flashes {s['flashes']}"
        )
    if beats:
        line = f"- Audio: {beats['tempo']} BPM, {len(beats['beats'])} beats, {len(beats['onsets'])} onsets"
        if loud:
            line += f", {loud['lufs']} LUFS, true peak {loud['true_peak']} dBTP"
        lines.append(line)
        ca = beats.get("cut_alignment")
        if ca and ca["summary"]["cuts"]:
            s = ca["summary"]
            lines.append(
                f"- Cuts on sound: {s['within_1_frame']}/{s['cuts']} within 1 frame of an onset, "
                f"{s['within_2_frames']}/{s['cuts']} within 2; median |offset| {s['median_abs_offset_ms']} ms"
            )
    else:
        lines.append("- Audio: none")
    if tr:
        lines.append(
            f"- Speech: {len(tr['words'])} words, language {tr['language']} (whisper {tr['model']})"
            + (
                f"; check low-confidence words: {', '.join(w['w'] for w in tr['low_confidence'][:12])}"
                if tr.get("low_confidence")
                else ""
            )
        )
    arts = [rel(p) for p in sheets + shot_sheets]
    arts += [n for n in ("cuts.json", "beats.json", "transcript.json", "ocr.json") if (d / n).exists()]
    lines += [f"- Files: {', '.join(arts)}", ""]

    lines += [
        "## Shots",
        "",
        "Auto columns: in/out, length, cut offset from the nearest sound onset (+ = picture after sound), "
        "speech" + (", on-screen text (OCR)" if ocr else "") + ". Fill the rest from the frames.",
        "",
    ]
    head = (
        "| # | In | Out | Len | Cut vs sound | Said |"
        + (" Text (OCR) |" if ocr else "")
        + " On screen | Text look | Motion, camera, transition | Why it holds |"
    )
    lines += [head, "|" + "---|" * (head.count("|") - 1)]
    align = {round(r["cut"], 3): r for r in (beats or {}).get("cut_alignment", {}).get("cuts", [])}
    words = (tr or {}).get("words", [])
    for sh in (cuts or {}).get("shots", []):
        a, b = sh["start"], sh["end"]
        said = " ".join(w["w"] for w in words if a <= w["start"] < b)
        r = align.get(round(a, 3))
        off = f"{r['offset_ms']:+d} ms" if r and r.get("offset_ms") is not None else ("start" if a == 0 else "")
        row = f"| {sh['n']} | {a:.2f} | {b:.2f} | {sh['dur']:.2f} | {off} | {cell(said)} |"
        if ocr:
            txt = " / ".join(
                dict.fromkeys(s["text"] for s in ocr["spans"] if s["first_seen"] < b and s["last_seen"] >= a)
            )
            row += f" {cell(txt)} |"
        lines.append(row + "  |  |  |  |")
    lines += [
        "",
        "## Hook (first 2 s)",
        "",
        "- First frame:",
        "- First words or sound:",
        "- First motion:",
        "- Promise or question:",
        "",
        "## Sound",
        "",
        "- Voice, music, effects; what drives the cuts:",
        "- Reuse the original audio 1:1? (allowed; measure the offset with tools/compare.py after the render)",
        "- Hits that a cut or an accent must land on (beats.json onsets and arrivals):",
        "",
        "## Text on screen",
        "",
        "- Font family and weight, size in px, case, colour, position (safe zone), entry and exit motion, "
        "timing per word or line:",
        "",
        "## Look",
        "",
        "- Palette (sample real colours from the frames), grade, grain, framing, aspect handling:",
        "",
        "## Ending",
        "",
        "- Payoff, loop back to the start, call to action, or hard cut:",
        "",
        "## Creator-bound vs transferable",
        "",
        "- Bound to the creator (face, voice, fame, real footage):",
        "- Transferable (structure, timing, format):",
        "",
        "## Copy plan",
        "",
        "- KEEP: shot order, timing, framing, camera path, easing, density, sound accents",
        "- CHANGE (remake only): subject, text, offer, style lock",
        "- DO NOT ADD:",
        "",
    ]
    out = d / "breakdown.md"
    n = 2
    while out.exists():
        out = d / f"breakdown.{n}.md"
        n += 1
    out.write_text("\n".join(lines))
    return out


def run(args) -> dict:
    d = resolve(args)
    video = d / "source.mp4"
    meta = json.loads((d / "source.json").read_text()) if (d / "source.json").exists() else {}
    steps: dict[str, dict] = {}
    cuts = beats = tr = ocr = loud = None
    res = tool("cuts", str(video))
    steps["cuts"] = {"ok": res.get("ok"), **({"error": res["error"]} if not res.get("ok") else {})}
    if res.get("ok"):
        cuts = res
    audio = has_audio(video)
    if audio:
        res = tool("beats", str(video), *(["--cuts", str(d / "cuts.json")] if cuts else []))
        steps["beats"] = {"ok": res.get("ok"), **({"error": res["error"]} if not res.get("ok") else {})}
        beats = res if res.get("ok") else None
        res = tool("loudness", str(video))
        loud = res["files"][0] if res.get("ok") else None
    sheets, shot_sheets = [], []
    res = tool("frames", str(video))
    steps["frames"] = {"ok": res.get("ok"), **({"error": res["error"]} if not res.get("ok") else {})}
    if res.get("ok"):
        sheets = res["sheets"]
    if cuts and len(cuts["shots"]) > 1:
        at = ",".join(f"{s['start']:.3f}" for s in cuts["shots"])
        res = tool("frames", str(video), "--at", at, "--name", "shots")
        steps["shot_frames"] = {"ok": res.get("ok"), **({"error": res["error"]} if not res.get("ok") else {})}
        if res.get("ok"):
            shot_sheets = res["sheets"]
    if audio and not args.no_transcribe:
        extra = ["--model", args.model] + (["--language", args.language] if args.language else [])
        res = tool("transcribe", str(video), *extra)
        steps["transcribe"] = {"ok": res.get("ok"), **({"error": res["error"]} if not res.get("ok") else {})}
        tr = res if res.get("ok") else None
    if args.ocr:
        lang = args.ocr_lang or (
            args.language if args.language in ("en", "ru", "uk", "es", "fr", "de", "pt", "it") else "en"
        )
        res = tool("ocr", str(video), "--lang", lang)
        steps["ocr"] = {"ok": res.get("ok"), **({"error": res["error"]} if not res.get("ok") else {})}
        ocr = res if res.get("ok") else None
    md = write_md(d, meta, cuts, beats, tr, ocr, loud, sheets, shot_sheets)
    return {
        "dir": str(d),
        "breakdown": str(md),
        "sheets": sheets,
        "shot_sheets": shot_sheets,
        "steps": steps,
        "shots": len(cuts["shots"]) if cuts else None,
        "has_audio": audio,
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", help="URL, local video, or refs/<slug>/ folder")
    p.add_argument("--refs", default="refs", help="refs folder for pulled sources (default ./refs)")
    p.add_argument("--slug", help="folder name for a new pull")
    p.add_argument("--language", help="speech language for the transcript, e.g. en, ru")
    p.add_argument("--model", default="small", help="whisper model (default small)")
    p.add_argument("--no-transcribe", action="store_true", help="skip the transcript")
    p.add_argument("--ocr", action="store_true", help="also read on-screen text (slower)")
    p.add_argument("--ocr-lang", help="OCR script if it differs from --language")
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
        print(f"wrote {result['breakdown']} ({result['shots']} shots)")
        for k, v in result["steps"].items():
            print(f"  {k}: {'ok' if v['ok'] else 'failed: ' + v['error']['message']}")
        for s in result["sheets"] + result["shot_sheets"]:
            print(f"  sheet {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
