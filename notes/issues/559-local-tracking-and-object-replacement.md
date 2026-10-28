# Local tracking, object replacement and track-attached motion (no providers)

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** research + feature / vfx

## Context

The owner wants tracking, object replacement and motion attached to a track done as close to free as possible, the way After Effects gives tracking for free: local tools, the agent's own tokens, function calls, no model providers. Idea `notes/ideas/004-localize-objects-vision-bbox.md` covers the bbox half and should be folded in.

## What

1. Survey local options and pick by quality on test clips: OpenCV trackers (CSRT, KCF), sparse optical flow (KLT) for point tracks, planar tracking via feature matching + homography (corner pin), ffmpeg `vidstabdetect` for camera motion, MediaPipe for face / hand / pose tracks, local segmentation for region tracks.
2. Ship verbs that write track data as JSON keyframes:
   - `ralphy track point|planar|face <video> --at <t> --box x,y,w,h`
   - Output consumed by HyperFrames: an overlay follows a point, a sticker or screen replacement follows a corner pin.
3. Object replacement: planar-tracked insert (screen, sign, label) composited in HyperFrames; document where it breaks (occlusion, fast blur).
4. Add the free-before-paid rule to the art-director and editor skills: try the local path first, escalate to a provider only with a stated reason.

## Scope / acceptance

- `docs/research/local-tracking.md` with the comparison on at least 5 clips (static, handheld, fast motion, occlusion, face).
- Verbs and a HyperFrames helper that applies a track to an element; a demo render for point follow and corner-pin replacement.
- Zero provider calls in this path (asserted in tests).
- Dependency choice documented (Python OpenCV via a pinned venv vs. a WASM / native build), with install handled by `ralphy doctor`.

## Notes

- Sequence before #567 (track-follow camera) and alongside #560.
