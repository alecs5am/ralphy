# Local tracking comparison (#559 checkpoint)

This note picks the local stack behind `ralphy track point|planar|face` and the HyperFrames helper that applies a track to an element. The constraint is the owner's rule for this feature: free before paid. Tracking, corner-pin replacement, and track-attached motion run on this machine with OpenCV and MediaPipe, with zero model-provider calls. It also folds in the bounding-box half of `notes/ideas/004-localize-objects-vision-bbox.md` (see "Bounding boxes" below).

Measured on 2026-10-29 on an Apple Silicon Mac, OpenCV 5.0.0, MediaPipe 1.2.0, Python 3.12.13, frames downscaled to 960 px wide for tracking (`--proc-width 960`, outputs stay in source pixels).

## Test clips

Five short clips were copied (read-only) from existing references on this machine into `.ralphy/cache/tracking-559/clips/` and re-encoded to H.264 at their native size. Two synthetic clips with exact ground truth were added.

| Clip | Source (reference slug) | Size, length | What it stresses | Seed |
|---|---|---|---|---|
| static | `restaurant-call-codewords`, 0-5 s | 720x1280, 150 frames | Locked-off camera, slow body motion | point: wrist watch; planar: patterned curtain |
| handheld | `scary-maze-game-reaction`, 0-6 s | 1920x1080, 180 frames | Camcorder shake and drift, screen in shot | point: green bowl; planar: monitor screen quad |
| fast | `scary-maze-game-reaction`, 15-20 s | 1920x1080, 150 frames | Whip pans, heavy motion blur, subject jumps | point: head; planar: monitor that leaves frame |
| occlusion | `motion-ref-dreamchase-street`, 1.0-2.2 s | 644x480, 36 frames | Night, low texture, a car passes in front of the subject | point: standing figure |
| face | `adcrate-talking-head-news`, 0-6 s | 1080x1350, 180 frames | Selfie talking head, head turns, jump cuts | face: auto (largest face) |
| synthetic | ffmpeg `testsrc` patch over flat grey | 640x360, 60 frames | Known motion (100, 20) px/s | patch box |
| synthetic-blur | same, (200, 40) px/s plus a two-pass frame blend | 640x360, 58 frames | Mild motion blur | patch box |

## Methods compared

- **Point:** OpenCV CSRT and KCF (contrib box trackers), and sparse pyramidal Lucas-Kanade optical flow (KLT) on corner features inside the seed box, with a forward-backward check per feature and the median displacement as the motion.
- **Planar (corner pin):** KLT features inside the quad with a RANSAC homography per frame (`klt`), SIFT matching of every frame against the seed frame with a RANSAC homography (`sift`, no drift but slow), and `hybrid`: the KLT chain re-anchored to the seed frame by SIFT every 5 frames or whenever KLT fails.
- **Face:** MediaPipe Tasks face detector (BlazeFace short range, 230 KB model) versus OpenCV YuNet (`FaceDetectorYN`, 233 KB ONNX model), each associated frame to frame by IoU. OpenCV 5.0 wheels no longer ship Haar cascades, so there is no zero-download OpenCV face option.
- **Camera motion:** ffmpeg `vidstabdetect` is not compiled into the Homebrew ffmpeg on this machine (only `deshake` is), so it cannot be a default. Camera motion is left to #567, which can reuse the planar path (a homography over the whole frame).

## Metrics

- **fps:** frames processed per wall second at 960 px.
- **tracked:** share of frames not flagged lost (`confidence >= 0.3`).
- **fb px:** forward-backward error. Track from the seed to the last frame, then track the reversed clip from that estimate back to the seed frame and measure the distance to the seed (mean corner distance for planar). It needs no labels and catches drift, but a tracker that never moves scores 0, so read it with "tracked" and a visual check.
- **jitter:** median frame-to-frame acceleration of the tracked point (px). High jitter makes an attached overlay shimmer.
- **GT error:** mean and max distance to the exact position on the synthetic clips.

## Results

| Clip | Kind | Method | fps | tracked | mean conf | fb px |
|---|---|---|---|---|---|---|
| static | point | **klt** | 447 | 1.00 | 0.92 | **0.4** |
| static | point | csrt | 110 | 1.00 | 0.88 | 2.5 |
| static | point | kcf | 266 | 1.00 | 0.91 | 1.0 |
| static | planar | **hybrid** | 110 | 1.00 | 1.00 | 0.1 |
| static | planar | klt | 302 | 1.00 | 1.00 | 0.0 |
| static | planar | sift | 42 | 1.00 | 0.97 | 0.1 |
| handheld | point | **klt** | 591 | 1.00 | 0.98 | **0.2** |
| handheld | point | csrt | 128 | 1.00 | 0.70 | 17.9 |
| handheld | point | kcf | 406 | 1.00 | 0.97 | 2.8 |
| handheld | planar | **hybrid** | 195 | 1.00 | 1.00 | **2.5** |
| handheld | planar | klt | 540 | 1.00 | 1.00 | 4.2 |
| handheld | planar | sift | 67 | 1.00 | 0.92 | 3.2 |
| fast | point | klt | 327 | 0.32 | 0.23 | 481 |
| fast | point | csrt | 107 | 0.82 | 0.49 | 570 |
| fast | point | kcf | 379 | 0.10 | 0.05 | 383 |
| fast | planar | hybrid | 156 | 0.89 | 0.77 | 611 |
| fast | planar | klt | 340 | 0.89 | 0.77 | 560 |
| fast | planar | sift | 75 | 0.02 | 0.01 | 298 |
| occlusion | point | klt | 632 | 0.28 | 0.23 | 12.1 |
| occlusion | point | csrt | 157 | 0.89 | 0.66 | 147 |
| occlusion | point | kcf | 1197 | 0.17 | 0.14 | 7.1 |
| face | face | **mediapipe** | 46 | **1.00** | 0.91 | 3.6 |
| face | face | yunet | 65 | 0.97 | 0.81 | 0.7 |
| face | point | klt | 119 | 0.78 | 0.42 | 55.6 |
| face | point | csrt | 17 | 0.64 | 0.35 | 25.1 |
| face | point | kcf | 1.2 | 0.78 | 0.46 | 2.3 |

Jitter (median px): handheld point klt 0.67, csrt 2.0, kcf 2.0; static point klt 0.08, csrt 1.0, kcf 2.0; face mediapipe 7.8, yunet 27.9. CSRT and KCF report integer boxes, so they shimmer by about a pixel even on a still camera. YuNet lost the face for 5 frames during a head turn and then latched onto a much smaller false face (box width fell from about 550 to 87 px), which is where its jitter comes from.

Ground truth on the synthetic clips (mean / max px; about 1 px of the floor is ffmpeg's integer overlay placement):

| Clip | point klt | point csrt | point kcf | planar hybrid | planar klt | planar sift |
|---|---|---|---|---|---|---|
| synthetic | 0.99 / 1.49 | 1.31 / 2.13 | 2.76 / 3.40 | 1.02 / 1.54 | 1.00 / 1.49 | 1.02 / 1.52 |
| synthetic-blur | 1.31 / 2.34 | 1.17 / 2.24 | 6.06 / 6.80 | 0.79 / 1.30 | 1.09 / 1.52 | 0.59 / 1.06 |

## Decision

- **Point: KLT by default**, `--method csrt` for targets that rotate or deform (a person, an animal), `kcf` only for speed on small boxes (it is fixed-scale and very slow on large boxes: 1.2 fps on a 500 px face). KLT is the most accurate and the steadiest on textured targets, and it flags its own loss honestly. CSRT keeps reporting a confident box after it has jumped to the occluder (147 px off on the occlusion clip).
- **Planar: hybrid by default.** It had the lowest forward-backward error on the handheld screen (2.5 px over 6 s) and the SIFT re-anchor bounds drift on long shots. `klt` is about 3x faster for short shots; `sift` is drift-free but drops out under blur.
- **Face: MediaPipe by default.** It kept every frame of the face clip with a third of YuNet's jitter and no false locks. YuNet stays available (`--method yunet` with `RALPHY_TRACK_YUNET_MODEL=<onnx>`), which is a lighter option for a later OpenCV-only stack.

## Dependency approach

Chosen: **a pinned Python virtual environment that Ralphy manages with uv.**

- `ralphy track setup` creates `${RALPHY_HOME:-~/.ralphy}/tools/tracking/py3.12-opencv5.0.0.93-mediapipe1.2.0/` with Python 3.12 (uv downloads a managed interpreter if needed), installs the full transitive pin set (20 packages, wheels only), downloads the BlazeFace model from Google's MediaPipe model bucket and checks its SHA-256, runs a probe, and writes `stack.json`. About 350 MB on disk; 36 s with a warm uv cache. Re-running is a no-op; `--force` reinstalls.
- `ralphy doctor` reports `deps.tracking` and a `tracking` block (stack id, interpreter, face model present, uv present, and the exact next command). It only checks files, so doctor stays fast, and tracking is optional: never a blocker.
- The tracker script (`cli/lib/track/tracker.py`) is embedded in the CLI as text and written into the stack directory under a content hash, so the compiled binary needs no checkout.
- `RALPHY_TRACK_PYTHON=<interpreter>` uses an existing environment instead (any Python with `opencv-contrib-python`, plus `mediapipe` for faces).

Rejected for this checkpoint:

- **opencv.js (WASM) in Bun.** The stock build does not include the contrib tracking module (CSRT, KCF), has no video decoding (frames would be piped from ffmpeg as raw buffers), and a custom build would be a second toolchain to maintain.
- **MediaPipe Tasks for the web (WASM) inside the HyperFrames Chromium.** Attractive later because the renderer already runs Chromium, but it covers faces, hands, and pose only, not point or planar tracking.
- **Apple Vision framework.** Zero install on macOS and has object tracking, but it is macOS only and needs a Swift helper binary.
- **Native OpenCV built into the CLI.** We found no maintained Bun or Node binding we could pin for OpenCV 5 with the contrib modules; a pinned venv is cheaper and reproducible.

## Bounding boxes (folded from idea 004)

Idea 004 asked for a "pixel bounding box of an object" primitive and a local vision-model bench. This checkpoint covers the local part that tracking needs: the seed box comes from the user or agent (`--box x,y,w,h`), faces are found locally by MediaPipe, and every keyframe carries a box (or four corners) in source pixels. Open-vocabulary "find <object>" (Grounding DINO, Florence-2, OWLv2, SAM 2) is not part of this checkpoint; it stays listed as remaining work on #559 and would plug in as another way to produce the `--box` seed.

## Where it breaks

- **Fast motion and motion blur.** Every method fails on the whip pans in the fast clip (forward-backward error of 300 to 600 px). Worse, CSRT and the planar paths stay confident (0.5 to 0.9) while wrong, because a homography can fit the blurred background inside the quad. Treat `confidence` as fit quality, not proof; check `stats.firstLostAt` and look at the frames before using a track across a whip pan. Mild blur (the synthetic-blur clip) is fine.
- **Occlusion.** When a car crosses the subject, KLT and KCF flag the frames lost (good), but nothing re-acquires the target afterwards in this checkpoint. CSRT jumps to the occluder. Workaround: seed a second track after the occluder passes (`--at` later); the HyperFrames helper bridges lost frames by interpolating between good keys, or hides the element with `hideWhenLost: true`.
- **Low texture and night footage.** KLT needs corner features; a small dark figure gives a handful of points and loses them quickly. Use CSRT there, with a visual check.
- **Hard cuts.** A track does not survive a cut. Track each shot separately.
- **Planar regions with independent motion.** A screen whose content changes is fine (the surface is rigid), but a quad drawn over a hand or a person is not planar; corner-pin results will warp.
- **Inserts that should be occluded.** A corner-pinned layer always sits on top. If a hand passes in front of the replaced screen, the insert covers the hand. Fixing that needs a matte (local segmentation, future work) or a paid regeneration with a stated reason.
- **Variable frame rate sources.** Keyframe times are `frame / fps`. Re-encode VFR phone footage to a constant frame rate first.
- **Forward only.** Tracking runs forward from `--at`; the helper holds the first keyframe before the seed time. Backward tracking is remaining work.

## HyperFrames helper

`ralphy track helper --out <project>/ralphy-track.js` installs a plain browser script (`cli/lib/track/ralphy-track.js`). `RalphyTrack.follow(tl, el, track, opts)` pins an element to a point or face track; `RalphyTrack.cornerPin(tl, el, track, opts)` maps an element onto the planar quad with a CSS `matrix3d` built from the four-point homography. Each adds one linear tween on a proxy object to the composition timeline; its `onUpdate` writes a transform that is a pure function of the timeline time, so it is deterministic under HyperFrames' `totalTime(t, false)` seeks in any order. `mapping: { box, fit }` converts source pixels to composition pixels for `cover`, `contain`, and `fill`; `clipStart` / `mediaStart` map composition time to source time. `ralphy track ... --js` writes a `<stem>.js` loader that registers the track on `window.__tracks`, because timelines must be built synchronously.

Demo renders (scratch projects, rendered with `ralphy render`):

- Point follow (a tag pinned to the bowl on the handheld clip): `.ralphy/cache/tracking-559/demo-point-root/.ralphy/workspaces/default/projects/track-point-demo/render/final.mp4`
- Corner-pin screen replacement (the monitor on the handheld clip): `.ralphy/cache/tracking-559/demo-cornerpin-root/.ralphy/workspaces/default/projects/track-cornerpin-demo/render/final.mp4`

## Reproduce

```bash
ralphy track setup
ralphy track point  clips/handheld.mp4 --at 0 --box 820,470,140,100 --js
ralphy track planar clips/handheld.mp4 --at 0 --quad 468,268,812,264,804,720,476,740 --js
ralphy track face   clips/face.mp4 --at 0
ralphy track helper --out <project>/ralphy-track.js
```

The bench harness (`bench.py`, `jitter.py`, `gt.py`) and raw results (`bench-results.json`) are in `.ralphy/cache/tracking-559/`.
