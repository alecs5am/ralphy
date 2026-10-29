#!/usr/bin/env python3
"""Ralphy local tracking engine (issue #559).

Runs inside the pinned virtual environment that `ralphy track setup` creates.
It reads one video, tracks forward from a seed time, and prints one JSON
document on stdout. It never writes files and never opens a network
connection: every model it needs is a local file passed by path.

Modes and methods:
  point   csrt (default) | kcf | klt     -> center point + box per frame
  planar  hybrid (default) | klt | sift  -> four corners (corner pin) per frame
  face    mediapipe (default) | yunet    -> face box per frame
  probe                                  -> engine versions (used by doctor)

Coordinates in and out are source-video pixels. Internally frames are
downscaled to --proc-width for speed and mapped back on output.
"""

import argparse
import json
import platform
import sys


def emit(doc, code=0):
    sys.stdout.write(json.dumps(doc, separators=(",", ":")))
    sys.stdout.write("\n")
    sys.stdout.flush()
    sys.exit(code)


def fail(kind, message):
    emit({"error": {"kind": kind, "message": message}}, 2)


try:
    import cv2  # noqa: E402
    import numpy as np  # noqa: E402
except Exception as exc:  # pragma: no cover - environment guard
    fail("dependency", "OpenCV / NumPy import failed: %s" % exc)


def versions():
    out = {
        "python": platform.python_version(),
        "opencv": cv2.__version__,
        "numpy": np.__version__,
        "csrt": hasattr(cv2, "TrackerCSRT_create") or hasattr(cv2, "TrackerCSRT"),
        "kcf": hasattr(cv2, "TrackerKCF_create") or hasattr(cv2, "TrackerKCF"),
        "sift": hasattr(cv2, "SIFT_create"),
        "yunet": hasattr(cv2, "FaceDetectorYN"),
    }
    try:
        import mediapipe as mp  # noqa: F401

        out["mediapipe"] = getattr(mp, "__version__", "unknown")
    except Exception:
        out["mediapipe"] = None
    return out


def parse_floats(raw, n, name):
    try:
        vals = [float(v) for v in raw.split(",")]
    except ValueError:
        fail("input", "--%s must be %d comma-separated numbers" % (name, n))
    if len(vals) != n:
        fail("input", "--%s must be %d comma-separated numbers" % (name, n))
    return vals


class Reader:
    """Sequential frame reader with a fixed processing scale."""

    def __init__(self, path, proc_width):
        self.cap = cv2.VideoCapture(path)
        if not self.cap.isOpened():
            fail("input", "cannot open video: %s" % path)
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.fps = fps if fps and fps > 0 else 30.0
        self.frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if self.width <= 0 or self.height <= 0:
            fail("input", "video has no decodable frames: %s" % path)
        self.scale = 1.0
        if proc_width and proc_width > 0 and self.width > proc_width:
            self.scale = proc_width / float(self.width)
        self.pos = 0

    def source(self):
        return {
            "width": self.width,
            "height": self.height,
            "fps": round(self.fps, 6),
            "frames": self.frames,
            "duration": round(self.frames / self.fps, 6) if self.frames > 0 else None,
            "procScale": round(self.scale, 6),
        }

    def iterate(self, start, end):
        """Yield (index, bgr, gray) for frames start..end inclusive."""
        while self.pos < start:
            if not self.cap.grab():
                return
            self.pos += 1
        while end is None or self.pos <= end:
            ok, frame = self.cap.read()
            if not ok:
                return
            idx = self.pos
            self.pos += 1
            if self.scale != 1.0:
                frame = cv2.resize(
                    frame,
                    (int(round(self.width * self.scale)), int(round(self.height * self.scale))),
                    interpolation=cv2.INTER_AREA,
                )
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            yield idx, frame, gray


def clamp01(v):
    return max(0.0, min(1.0, float(v)))


def r3(v):
    return round(float(v), 3)


def ncc(template, gray, box):
    """Normalized cross-correlation of the seed patch against the current box."""
    x, y, w, h = [int(round(v)) for v in box]
    H, W = gray.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return 0.0
    patch = gray[y0:y1, x0:x1]
    patch = cv2.resize(patch, (template.shape[1], template.shape[0]), interpolation=cv2.INTER_AREA)
    score = cv2.matchTemplate(patch, template, cv2.TM_CCOEFF_NORMED)[0][0]
    if not np.isfinite(score):
        return 0.0
    return clamp01(score)


def crop(gray, box):
    x, y, w, h = [int(round(v)) for v in box]
    H, W = gray.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    return gray[y0:y1, x0:x1].copy()


def make_box_tracker(method):
    if method == "csrt":
        ctor = getattr(cv2, "TrackerCSRT_create", None) or cv2.TrackerCSRT.create
    elif method == "kcf":
        ctor = getattr(cv2, "TrackerKCF_create", None) or cv2.TrackerKCF.create
    else:
        fail("input", "unknown box tracker: %s" % method)
    return ctor()


def klt_step(prev_gray, gray, pts):
    """Forward-backward checked pyramidal Lucas-Kanade step."""
    if pts is None or len(pts) == 0:
        return None, None
    lk = dict(winSize=(21, 21), maxLevel=3,
              criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, pts, None, **lk)
    if nxt is None:
        return None, None
    back, st2, _ = cv2.calcOpticalFlowPyrLK(gray, prev_gray, nxt, None, **lk)
    fb = np.linalg.norm((pts - back).reshape(-1, 2), axis=1)
    good = (st.reshape(-1) == 1) & (st2.reshape(-1) == 1) & (fb < 1.0)
    return pts[good], nxt[good]


def detect_features(gray, mask, max_corners=200):
    pts = cv2.goodFeaturesToTrack(gray, maxCorners=max_corners, qualityLevel=0.01,
                                  minDistance=4, mask=mask, blockSize=5)
    if pts is None:
        return np.empty((0, 1, 2), dtype=np.float32)
    return pts.astype(np.float32)


def box_mask(shape, box):
    mask = np.zeros(shape[:2], dtype=np.uint8)
    x, y, w, h = [int(round(v)) for v in box]
    mask[max(0, y):max(0, y + h), max(0, x):max(0, x + w)] = 255
    return mask


def quad_mask(shape, quad):
    mask = np.zeros(shape[:2], dtype=np.uint8)
    cv2.fillConvexPoly(mask, np.round(quad).astype(np.int32), 255)
    return mask


# ---------------------------------------------------------------- point ----

def track_point(reader, method, start, end, box, min_conf):
    s = reader.scale
    sbox = [v * s for v in box]
    keys = []
    tracker = None
    template = None
    pts = None
    prev_gray = None
    init_count = 0
    cx, cy = sbox[0] + sbox[2] / 2.0, sbox[1] + sbox[3] / 2.0
    cur = list(sbox)
    for idx, frame, gray in reader.iterate(start, end):
        if prev_gray is None:
            if method in ("csrt", "kcf"):
                tracker = make_box_tracker(method)
                tracker.init(frame, tuple(int(round(v)) for v in sbox))
            template = crop(gray, sbox)
            if template.size == 0 or template.shape[0] < 4 or template.shape[1] < 4:
                fail("input", "--box is outside the frame or too small")
            if method == "klt":
                pts = detect_features(gray, box_mask(gray.shape, sbox))
                init_count = max(1, len(pts))
            conf, ok = 1.0, True
        elif method in ("csrt", "kcf"):
            ok, nb = tracker.update(frame)
            if ok:
                cur = [float(v) for v in nb]
                cx, cy = cur[0] + cur[2] / 2.0, cur[1] + cur[3] / 2.0
            conf = ncc(template, gray, cur) if ok else 0.0
        else:  # klt
            old, new = klt_step(prev_gray, gray, pts)
            if old is None or len(new) < 3:
                ok, conf = False, 0.0
                pts = detect_features(gray, box_mask(gray.shape, cur))
            else:
                d = np.median((new - old).reshape(-1, 2), axis=0)
                cx, cy = cx + float(d[0]), cy + float(d[1])
                cur = [cur[0] + float(d[0]), cur[1] + float(d[1]), cur[2], cur[3]]
                survival = len(new) / float(len(old))
                density = min(1.0, len(new) / max(8.0, init_count * 0.5))
                conf = clamp01(survival * density)
                ok = True
                pts = new.reshape(-1, 1, 2)
                if len(pts) < max(8, init_count * 0.3):
                    pts = detect_features(gray, box_mask(gray.shape, cur))
            conf = min(conf, ncc(template, gray, cur)) if ok else 0.0
        prev_gray = gray
        keys.append({
            "t": round(idx / reader.fps, 6),
            "frame": idx,
            "x": r3(cx / s),
            "y": r3(cy / s),
            "box": [r3(cur[0] / s), r3(cur[1] / s), r3(cur[2] / s), r3(cur[3] / s)],
            "confidence": round(conf, 4),
            "lost": (not ok) or conf < min_conf,
        })
    return keys


# --------------------------------------------------------------- planar ----

def sift_reference(gray, quad):
    sift = cv2.SIFT_create(nfeatures=1500)
    kp, des = sift.detectAndCompute(gray, quad_mask(gray.shape, quad))
    return sift, kp, des


def sift_locate(sift, ref_kp, ref_des, ref_quad, gray, roi_quad):
    if ref_des is None or len(ref_kp) < 8:
        return None, 0, 0.0
    H, W = gray.shape[:2]
    mask = None
    if roi_quad is not None:
        x, y, w, h = cv2.boundingRect(np.round(roi_quad).astype(np.int32))
        pad_x, pad_y = w * 0.6 + 16, h * 0.6 + 16
        mask = box_mask(gray.shape, [x - pad_x, y - pad_y, w + 2 * pad_x, h + 2 * pad_y])
    kp, des = sift.detectAndCompute(gray, mask)
    if des is None or len(kp) < 8:
        return None, 0, 0.0
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    pairs = matcher.knnMatch(ref_des, des, k=2)
    good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(good) < 8:
        return None, len(good), 0.0
    src = np.float32([ref_kp[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kp[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    Hm, inl = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
    if Hm is None or inl is None:
        return None, 0, 0.0
    n_in = int(inl.sum())
    quad = cv2.perspectiveTransform(ref_quad.reshape(-1, 1, 2), Hm).reshape(4, 2)
    if not np.all(np.isfinite(quad)) or abs(cv2.contourArea(quad.astype(np.float32))) < 16:
        return None, n_in, 0.0
    ratio = n_in / float(len(good))
    conf = clamp01(ratio * min(1.0, n_in / 25.0))
    return quad, n_in, conf


def quad_is_sane(quad, prev, frame_shape):
    if quad is None or not np.all(np.isfinite(quad)):
        return False
    area = abs(cv2.contourArea(quad.astype(np.float32)))
    parea = abs(cv2.contourArea(prev.astype(np.float32)))
    if area < 16 or parea <= 0 or area > parea * 3.0 or area < parea / 3.0:
        return False
    hull = cv2.convexHull(quad.astype(np.float32))
    return len(hull) == 4


def track_planar(reader, method, start, end, quad, min_conf):
    s = reader.scale
    ref_quad = np.float32(quad).reshape(4, 2) * s
    cur = ref_quad.copy()
    keys = []
    prev_gray = None
    pts = None
    init_count = 0
    sift = ref_kp = ref_des = None
    for idx, _frame, gray in reader.iterate(start, end):
        inliers = 0
        if prev_gray is None:
            if method in ("klt", "hybrid"):
                pts = detect_features(gray, quad_mask(gray.shape, cur), 300)
                init_count = max(1, len(pts))
            if method in ("sift", "hybrid"):
                sift, ref_kp, ref_des = sift_reference(gray, cur)
            if (pts is None or len(pts) < 8) and (ref_kp is None or len(ref_kp) < 8):
                fail("input", "seed region has too little texture to track (need >= 8 features)")
            conf, ok = 1.0, True
            inliers = len(pts) if pts is not None else len(ref_kp)
        else:
            ok, conf = False, 0.0
            if method in ("klt", "hybrid"):
                old, new = klt_step(prev_gray, gray, pts)
                if old is not None and len(new) >= 8:
                    Hs, inl = cv2.findHomography(old, new, cv2.RANSAC, 3.0)
                    if Hs is not None and inl is not None:
                        cand = cv2.perspectiveTransform(cur.reshape(-1, 1, 2), Hs).reshape(4, 2)
                        if quad_is_sane(cand, cur, gray.shape):
                            inliers = int(inl.sum())
                            ratio = inliers / float(len(old))
                            density = min(1.0, inliers / max(12.0, init_count * 0.4))
                            conf = clamp01(ratio * density)
                            cur, ok = cand, True
                            keep = inl.reshape(-1) == 1
                            pts = new[keep].reshape(-1, 1, 2)
                if pts is None or len(pts) < max(16, init_count * 0.4):
                    pts = detect_features(gray, quad_mask(gray.shape, cur), 300)
            if method == "sift" or (method == "hybrid" and (idx - start) % 5 == 0) or (method == "hybrid" and not ok):
                cand, n_in, sconf = sift_locate(sift, ref_kp, ref_des, ref_quad, gray, cur)
                if cand is not None and sconf >= 0.35 and (method == "sift" or quad_is_sane(cand, cur, gray.shape)):
                    cur, ok, conf, inliers = cand, True, max(conf, sconf), n_in
                    if method == "hybrid":
                        pts = detect_features(gray, quad_mask(gray.shape, cur), 300)
                elif method == "sift":
                    ok, conf = False, 0.0
        prev_gray = gray
        corners = [[r3(px / s), r3(py / s)] for px, py in cur]
        keys.append({
            "t": round(idx / reader.fps, 6),
            "frame": idx,
            "corners": corners,
            "x": r3(float(np.mean(cur[:, 0])) / s),
            "y": r3(float(np.mean(cur[:, 1])) / s),
            "confidence": round(conf, 4),
            "inliers": int(inliers),
            "lost": (not ok) or conf < min_conf,
        })
    return keys


# ----------------------------------------------------------------- face ----

def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    iw, ih = max(0.0, min(ax1, bx1) - max(ax0, bx0)), max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def make_face_detector(method, model, frame_w, frame_h):
    if not model:
        fail("input", "face tracking needs a local model file (run `ralphy track setup`)")
    if method == "yunet":
        det = cv2.FaceDetectorYN.create(model, "", (frame_w, frame_h), 0.6, 0.3, 50)

        def run(frame, _ts):
            _, faces = det.detect(frame)
            out = []
            if faces is not None:
                for f in faces:
                    out.append(([float(f[0]), float(f[1]), float(f[2]), float(f[3])], float(f[-1])))
            return out

        return run
    if method == "mediapipe":
        try:
            import mediapipe as mp
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision as mp_vision
        except Exception as exc:
            fail("dependency", "MediaPipe import failed: %s" % exc)
        opts = mp_vision.FaceDetectorOptions(
            base_options=mp_python.BaseOptions(model_asset_path=model),
            running_mode=mp_vision.RunningMode.VIDEO,
            min_detection_confidence=0.4,
        )
        det = mp_vision.FaceDetector.create_from_options(opts)

        def run(frame, ts):
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            res = det.detect_for_video(image, int(ts))
            out = []
            for d in res.detections or []:
                bb = d.bounding_box
                score = d.categories[0].score if d.categories else 0.0
                out.append(([float(bb.origin_x), float(bb.origin_y), float(bb.width), float(bb.height)], float(score)))
            return out

        return run
    fail("input", "unknown face method: %s" % method)


def track_face(reader, method, start, end, box, model, min_conf):
    s = reader.scale
    pw, ph = int(round(reader.width * s)), int(round(reader.height * s))
    detect = make_face_detector(method, model, pw, ph)
    keys = []
    prev = [v * s for v in box] if box else None
    for idx, frame, _gray in reader.iterate(start, end):
        dets = detect(frame, idx * 1000.0 / reader.fps)
        pick = None
        if dets:
            if prev is None:
                pick = max(dets, key=lambda d: d[0][2] * d[0][3])
            else:
                scored = [(iou(d[0], prev), d) for d in dets]
                best = max(scored, key=lambda p: p[0])
                if best[0] > 0.05:
                    pick = best[1]
                else:
                    pcx, pcy = prev[0] + prev[2] / 2.0, prev[1] + prev[3] / 2.0
                    near = min(dets, key=lambda d: (d[0][0] + d[0][2] / 2.0 - pcx) ** 2 + (d[0][1] + d[0][3] / 2.0 - pcy) ** 2)
                    dist = ((near[0][0] + near[0][2] / 2.0 - pcx) ** 2 + (near[0][1] + near[0][3] / 2.0 - pcy) ** 2) ** 0.5
                    if dist < max(prev[2], prev[3]) * 1.5:
                        pick = near
        if pick is None and prev is None and not keys:
            fail("input", "no face found at --at; pass --box near the face or pick another time")
        if pick is not None:
            prev, conf, ok = pick[0], clamp01(pick[1]), True
        else:
            conf, ok = 0.0, False
        b = prev
        keys.append({
            "t": round(idx / reader.fps, 6),
            "frame": idx,
            "x": r3((b[0] + b[2] / 2.0) / s),
            "y": r3((b[1] + b[3] / 2.0) / s),
            "box": [r3(b[0] / s), r3(b[1] / s), r3(b[2] / s), r3(b[3] / s)],
            "confidence": round(conf, 4),
            "lost": (not ok) or conf < min_conf,
        })
    return keys


# ----------------------------------------------------------------- main ----

DEFAULT_METHOD = {"point": "csrt", "planar": "hybrid", "face": "mediapipe"}
METHODS = {
    "point": ("csrt", "kcf", "klt"),
    "planar": ("hybrid", "klt", "sift"),
    "face": ("mediapipe", "yunet"),
}


def main():
    p = argparse.ArgumentParser(description="ralphy local tracking engine")
    p.add_argument("--mode", choices=["point", "planar", "face", "probe"], required=True)
    p.add_argument("--method")
    p.add_argument("--video")
    p.add_argument("--at", type=float, default=0.0)
    p.add_argument("--to", type=float)
    p.add_argument("--box")
    p.add_argument("--quad")
    p.add_argument("--proc-width", type=int, default=960)
    p.add_argument("--face-model")
    p.add_argument("--min-confidence", type=float, default=0.3)
    a = p.parse_args()

    if a.mode == "probe":
        emit({"engine": versions()})

    method = a.method or DEFAULT_METHOD[a.mode]
    if method not in METHODS[a.mode]:
        fail("input", "--method %s is not valid for %s (allowed: %s)" % (method, a.mode, ", ".join(METHODS[a.mode])))
    if not a.video:
        fail("input", "--video is required")

    reader = Reader(a.video, a.proc_width)
    start = max(0, int(round(a.at * reader.fps)))
    if reader.frames > 0 and start >= reader.frames:
        fail("input", "--at %.3f is past the end of the video" % a.at)
    end = None
    if a.to is not None:
        if a.to <= a.at:
            fail("input", "--to must be later than --at (backward tracking is not supported yet)")
        end = int(round(a.to * reader.fps))

    box = parse_floats(a.box, 4, "box") if a.box else None
    if box is not None and (box[2] <= 0 or box[3] <= 0):
        fail("input", "--box width and height must be positive")

    if a.mode == "point":
        if box is None:
            fail("input", "point tracking needs --box x,y,w,h around the feature")
        keys = track_point(reader, method, start, end, box, a.min_confidence)
    elif a.mode == "planar":
        if a.quad:
            q = parse_floats(a.quad, 8, "quad")
            quad = [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]]
        elif box is not None:
            quad = [[box[0], box[1]], [box[0] + box[2], box[1]],
                    [box[0] + box[2], box[1] + box[3]], [box[0], box[1] + box[3]]]
        else:
            fail("input", "planar tracking needs --box x,y,w,h or --quad x1,y1,...,x4,y4")
        keys = track_planar(reader, method, start, end, quad, a.min_confidence)
    else:
        keys = track_face(reader, method, start, end, box, a.face_model, a.min_confidence)

    if not keys:
        fail("input", "no frames decoded between --at and --to")
    emit({
        "engine": versions(),
        "method": method,
        "source": reader.source(),
        "keyframes": keys,
    })


if __name__ == "__main__":
    main()
