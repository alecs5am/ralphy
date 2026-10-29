"""Local subject matting engine for `ralphy matte subject` (issue #560).

Free before paid: this script runs a matting model on this machine with
ONNX Runtime. It has no network code. `ralphy matte setup` downloads the
pinned model files and verifies their SHA-256; this script only reads them.

Protocol: arguments in, one JSON line on stdout. On failure the JSON line is
{"error": {"kind": "input" | "dependency" | "crash", "message": ...}}.

Modes:
  probe    print engine versions and available execution providers
  subject  matte the subject of --video with --model and write a lossless
           grayscale alpha video (FFV1, gray8) to --out

Frames are decoded and encoded with the ffmpeg binary on PATH (raw pipes), so
the only Python dependencies are numpy, pillow and onnxruntime.
"""

import argparse
import json
import subprocess
import sys
import time


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def fail(kind, message, code=1):
    emit({"error": {"kind": kind, "message": message}})
    sys.exit(code)


try:
    import numpy as np
    import onnxruntime as ort
    from PIL import Image
except Exception as e:  # pragma: no cover - environment problem
    fail("dependency", f"matting engine imports failed: {e}")


def engine_info():
    return {
        "python": sys.version.split()[0],
        "numpy": np.__version__,
        "onnxruntime": ort.__version__,
        "pillow": Image.__version__,
        "providers": ort.get_available_providers(),
    }


def probe_video(path):
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration",
        "-of", "json", path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        fail("input", f"ffprobe could not read {path}: {r.stderr.strip()[-300:]}")
    data = json.loads(r.stdout)
    streams = data.get("streams") or []
    if not streams:
        fail("input", f"no video stream in {path}")
    s = streams[0]
    num, _, den = (s.get("r_frame_rate") or "30/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 30.0
    duration = data.get("format", {}).get("duration")
    nb = s.get("nb_frames")
    return {
        "width": int(s["width"]),
        "height": int(s["height"]),
        "fps": round(fps, 4),
        "frames": int(nb) if nb and str(nb).isdigit() else None,
        "duration": float(duration) if duration else None,
        "rate": s.get("r_frame_rate") or "30/1",
    }


def providers_for(device):
    avail = ort.get_available_providers()
    if device == "cpu":
        return ["CPUExecutionProvider"]
    if device == "coreml":
        if "CoreMLExecutionProvider" not in avail:
            fail("input", "CoreML execution provider is not available on this machine")
        return ["CoreMLExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


class RVM:
    """Robust Video Matting (recurrent): carries hidden state frame to frame."""

    def __init__(self, model_path, device, threads, downsample, w, h):
        opts = ort.SessionOptions()
        if threads:
            opts.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(model_path, sess_options=opts, providers=providers_for(device))
        self.ratio = downsample if downsample else min(512.0 / max(w, h), 1.0)
        self.rec = [np.zeros((1, 1, 1, 1), dtype=np.float32)] * 4
        self.dr = np.array([self.ratio], dtype=np.float32)

    def __call__(self, rgb):
        src = (rgb.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        fgr, pha, *rec = self.sess.run(None, {
            "src": src, "r1i": self.rec[0], "r2i": self.rec[1], "r3i": self.rec[2], "r4i": self.rec[3],
            "downsample_ratio": self.dr,
        })
        self.rec = rec
        return pha[0, 0]


class BiRefNet:
    """BiRefNet (per-frame dichotomous segmentation), 1024x1024 input."""

    MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def __init__(self, model_path, device, threads, size):
        opts = ort.SessionOptions()
        if threads:
            opts.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(model_path, sess_options=opts, providers=providers_for(device))
        self.input = self.sess.get_inputs()[0].name
        self.size = size

    def __call__(self, rgb):
        h, w = rgb.shape[:2]
        img = Image.fromarray(rgb).resize((self.size, self.size), Image.BILINEAR)
        x = (np.asarray(img, dtype=np.float32) / 255.0 - self.MEAN) / self.STD
        x = x.transpose(2, 0, 1)[None].astype(np.float32)
        logits = self.sess.run(None, {self.input: x})[0][0, 0]
        mask = 1.0 / (1.0 + np.exp(-logits))
        m = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)
        return np.asarray(m, dtype=np.float32) / 255.0


def run_subject(args):
    info = probe_video(args.video)
    w, h = info["width"], info["height"]
    if args.model == "rvm":
        model = RVM(args.model_path, args.device, args.threads, args.downsample, w, h)
    elif args.model == "birefnet":
        model = BiRefNet(args.model_path, args.device, args.threads, args.size)
    else:
        fail("input", f"unknown model {args.model}")

    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-nostdin", "-i", args.video, "-map", "0:v:0",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "gray",
         "-s", f"{w}x{h}", "-r", info["rate"], "-i", "-",
         "-c:v", "ffv1", "-pix_fmt", "gray", args.out],
        stdin=subprocess.PIPE,
    )
    frame_bytes = w * h * 3
    frames = 0
    coverage = 0.0
    partial = 0.0
    flicker = 0.0
    prev = None
    t0 = time.time()
    infer_s = 0.0
    try:
        while True:
            buf = dec.stdout.read(frame_bytes)
            if not buf or len(buf) < frame_bytes:
                break
            rgb = np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3)
            ti = time.time()
            a = np.clip(model(rgb), 0.0, 1.0)
            infer_s += time.time() - ti
            if args.threshold_low > 0 or args.threshold_high < 1:
                lo, hi = args.threshold_low, args.threshold_high
                a = np.clip((a - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
            a8 = (a * 255.0 + 0.5).astype(np.uint8)
            enc.stdin.write(a8.tobytes())
            frames += 1
            coverage += float(a.mean())
            partial += float(((a8 > 12) & (a8 < 243)).mean())
            if prev is not None:
                flicker += float(np.abs(a8.astype(np.int16) - prev).mean()) / 255.0
            prev = a8.astype(np.int16)
            if args.max_frames and frames >= args.max_frames:
                break
    finally:
        try:
            enc.stdin.close()
        except Exception:
            pass
        enc.wait()
        dec.stdout.close()
        dec.kill()
        dec.wait()
    if frames == 0:
        fail("input", f"decoded no frames from {args.video}")
    if enc.returncode != 0:
        fail("crash", f"alpha encode failed (ffmpeg exit {enc.returncode})")
    wall = time.time() - t0
    emit({
        "engine": engine_info(),
        "model": args.model,
        "source": info,
        "frames": frames,
        "wallSeconds": round(wall, 3),
        "inferSeconds": round(infer_s, 3),
        "fps": round(frames / wall, 3) if wall > 0 else None,
        "stats": {
            "meanCoverage": round(coverage / frames, 4),
            "partialAlpha": round(partial / frames, 4),
            "flicker": round(flicker / max(frames - 1, 1), 5),
        },
        "params": {
            "downsample": getattr(model, "ratio", None),
            "size": getattr(model, "size", None),
            "device": args.device,
        },
    })


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mode", required=True, choices=["probe", "subject"])
    p.add_argument("--video")
    p.add_argument("--out")
    p.add_argument("--model", choices=["rvm", "birefnet"], default="rvm")
    p.add_argument("--model-path")
    p.add_argument("--device", choices=["auto", "cpu", "coreml"], default="auto")
    p.add_argument("--threads", type=int, default=0)
    p.add_argument("--downsample", type=float, default=0.0)
    p.add_argument("--size", type=int, default=1024)
    p.add_argument("--threshold-low", type=float, default=0.0)
    p.add_argument("--threshold-high", type=float, default=1.0)
    p.add_argument("--max-frames", type=int, default=0)
    args = p.parse_args()
    if args.mode == "probe":
        emit({"engine": engine_info()})
        return
    if not args.video or not args.out or not args.model_path:
        fail("input", "--video, --out and --model-path are required")
    try:
        run_subject(args)
    except SystemExit:
        raise
    except BrokenPipeError as e:
        fail("crash", f"ffmpeg pipe closed early: {e}")
    except Exception as e:
        fail("crash", f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
