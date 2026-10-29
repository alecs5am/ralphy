# Local tracking, object replacement and track-attached motion (no providers)

> **Status:** done — 2026-10-30 (checkpoint: `ralphy track point|planar|face|setup|helper`, KLT / hybrid planar / MediaPipe face in a pinned local venv, RalphyTrack.follow and cornerPin for HyperFrames, two demo renders; open: re-acquire after occlusion, backward tracking, segmentation mattes, hand and pose)
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

## Checkpoint 2026-10-30

Landed (uncommitted at the time of writing):

- Stack chosen on 5 real clips plus 2 synthetic ground-truth clips; comparison in `docs/research/local-tracking.md`. Defaults: point = KLT, planar = hybrid (KLT chain re-anchored by SIFT), face = MediaPipe BlazeFace. ffmpeg `vidstabdetect` is not in the Homebrew ffmpeg build, so camera motion moves to #567.
- Dependency: a pinned Python 3.12 venv (OpenCV 5.0.0.93 contrib, MediaPipe 1.2.0, 20 exact pins) managed with uv under `${RALPHY_HOME:-~/.ralphy}/tools/tracking/<stack-id>/`. `ralphy track setup` installs it and verifies the face model SHA-256; `ralphy doctor` reports `deps.tracking` plus a `tracking` block with the next command (optional, never a blocker). `RALPHY_TRACK_PYTHON` brings your own interpreter.
- Verbs: `ralphy track point|planar|face <video> --at <t> [--box x,y,w,h | --quad ...] [--to <t>] [--method ...] [--out <json>] [--js]`, writing `ralphy.track/v1` JSON keyframes with confidence and a lost flag; append-only (`.v2.json`, ...). `ralphy track helper` installs the HyperFrames runtime.
- HyperFrames helper `cli/lib/track/ralphy-track.js`: `RalphyTrack.follow` (point / face) and `RalphyTrack.cornerPin` (matrix3d from a four-point homography), deterministic under seek. Demo renders for point follow and corner-pin screen replacement under `.ralphy/cache/tracking-559/`.
- Free-before-paid rule added to the art-director and editor skills.
- Tests: `tests/unit/track-schema.test.ts`, `tests/unit/track-hf-runtime.test.ts`, `tests/unit/track-zero-provider.test.ts`, `tests/integration/cli-track.test.ts` (ground truth within 2 px; live cases skip without the engine).

Folded in: the bounding-box half of `notes/ideas/004-localize-objects-vision-bbox.md`. Local boxes now come from `--box` seeds and MediaPipe faces, and every keyframe carries a box or four corners.

Remaining:

- Re-acquisition after occlusion and backward tracking from `--at` (tracking is forward only).
- Open-vocabulary local boxes ("find <object>"): bench Grounding DINO Tiny, Florence-2, OWLv2, plus SAM 2 for masks (idea 004 phase 2) as a seed source for `--box`.
- Local segmentation mattes so a corner-pinned insert can sit behind an occluding hand.
- Hand and pose tracks (MediaPipe) and track smoothing presets.
- Regenerate `docs/cli-surface.generated.md` for the new `track` verbs (`bun run cli:surface:build`).
