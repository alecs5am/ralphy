# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["demucs>=4.0.1", "torch>=2.1", "numpy>=1.26"]
# ///
"""Split a soundtrack into vocals and music (or drums, bass, other, vocals) with Demucs, locally.

Use it to reuse a reference's music under a new voice, or its voice over new music. The first run
installs PyTorch (several hundred MB) and downloads the model (htdemucs, about 80 MB); a 60 s clip takes
roughly 30-90 s on a laptop CPU, faster with --device mps on Apple Silicon. Outputs are 44.1 kHz
WAV files in <dir>/stems/ for source.mp4 (else <dir>/<stem>.stems/, or --out). Existing stems
are never overwritten; a rerun writes a numbered folder.

Examples:
  uv run tools/stems.py refs/x/source.mp4
  uv run tools/stems.py refs/x/source.mp4 --four --device mps
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

SR = 44100


class ToolError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def load(path: Path):
    import numpy as np

    if not path.is_file():
        raise ToolError("E_NOT_FOUND", f"no such file: {path}")
    try:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
            capture_output=True,
            check=True,
        ).stdout
    except FileNotFoundError:
        raise ToolError("E_FFMPEG_MISSING", "ffmpeg is not installed", "install ffmpeg") from None
    except subprocess.CalledProcessError as e:
        raise ToolError("E_DECODE", f"ffmpeg could not decode {path}", e.stderr.decode()[-300:]) from e
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()
    if x.shape[1] < SR // 2:
        raise ToolError("E_NO_AUDIO", f"{path} has no usable audio")
    return x


def save(wav, path: Path) -> None:
    import numpy as np

    data = np.ascontiguousarray(wav.T.astype(np.float32)).tobytes()
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "pcm_s16le", str(path)],
        input=data,
        check=True,
    )


def out_dir(src: Path, given: str | None) -> Path:
    base = (
        Path(given).expanduser() if given else src.parent / ("stems" if src.stem == "source" else f"{src.stem}.stems")
    )
    if not base.exists():
        return base
    n = 2
    while (cand := base.with_name(f"{base.name}-{n}")).exists():
        n += 1
    return cand


def run(args) -> dict:
    src = Path(args.audio).expanduser()
    x = load(src)
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    device = args.device
    if device == "auto":
        device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    model = get_model(args.model)
    model.eval()
    wav = torch.from_numpy(x)
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        sources = apply_model(
            model, ((wav - mean) / std)[None], device=device, split=True, overlap=0.25, progress=False
        )[0]
    sources = sources * std + mean
    names = list(model.sources)
    out = out_dir(src, args.out)
    out.mkdir(parents=True)
    files = {}
    if args.four:
        for name, s in zip(names, sources, strict=False):
            save(s.cpu().numpy(), out / f"{name}.wav")
            files[name] = str(out / f"{name}.wav")
    else:
        vi = names.index("vocals")
        vocals = sources[vi]
        rest = sum(s for i, s in enumerate(sources) if i != vi)
        save(vocals.cpu().numpy(), out / "vocals.wav")
        save(rest.cpu().numpy(), out / "music.wav")
        files = {"vocals": str(out / "vocals.wav"), "music": str(out / "music.wav")}
    return {
        "audio": str(src),
        "model": args.model,
        "device": device,
        "out": str(out),
        "stems": files,
        "duration": round(x.shape[1] / SR, 3),
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("audio", help="audio or video file")
    p.add_argument("--four", action="store_true", help="write drums, bass, other, vocals instead of vocals + music")
    p.add_argument("--model", default="htdemucs", help="htdemucs (default), htdemucs_ft (slower, cleaner), mdx_extra")
    p.add_argument("--device", default="auto", help="auto (default), cpu, mps, cuda")
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
    if args.json:
        print(json.dumps({"ok": True, **result}))
    else:
        print(f"{result['duration']} s split with {result['model']} on {result['device']} -> {result['out']}")
        for k, v in result["stems"].items():
            print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
