# 411 - Make native video validation the final quality engine

Status: active

## Problem

The current validation surface still treats frame sampling as the default inspection path in too many places. Keyframes are useful for cheap smoke checks, but they are a weak proxy for video quality: they miss temporal continuity, edit rhythm, caption sync, audio-to-picture alignment, and often encourage hallucinated reviewer claims because the model only sees isolated stills.

Ralphy already has native full-video analysis paths, but they are not the obvious final gate for unit production. `ralphy eval` can run deep video vision when a brief or style sheet is supplied, while the standard orchestrator still leans on scene frames and screenshots. That makes the final polish loop too agent-dependent.

Origin: user feedback on 2026-06-14 that agent-built-in video processing via screenshot slicing hallucinates heavily compared with Gemini-style native video understanding.

## Scope

- Make native full-MP4 validation a first-class engine in `ralphy eval`, not an optional sidecar that only appears when extra arguments are passed.
- Define explicit validation modes:
  - `structure`: deterministic metadata, ffprobe, scene durations, loudness, silence, caption density.
  - `keyframe`: cheap visual smoke check for obvious blank/garbled frames.
  - `native-video`: full video model pass for temporal continuity, audio-picture alignment, pacing, caption sync, and format fit.
  - `deep-style`: native-video plus style lock / brief / reference comparison.
- Use native-video as the default final gate before forming or publishing a Unit.
- Keep keyframe analysis as a cheap diagnostic layer, not the source of truth for final readiness.
- Fix project ID auto-detection for the current `.ralphy/workspaces/<ws>/projects/<id>/render/...` layout; the old `/workspace/projects/<id>/` regex is stale.
- Update the evaluator skill and relevant playbooks so agents know when to run cheap checks versus full-video validation.
- Persist a structured native-video report with actionable redo instructions that the repair loop can consume.
- Add tests for validation mode selection, project ID detection, and final-gate behavior.

## Acceptance

- `ralphy eval <video>` exposes an explicit native-video mode and documents when it is used.
- Running final/unit validation without an explicit mode uses native-video or deep-style when model credentials are available.
- Keyframe-only reports cannot mark a Unit as ship-ready unless the user explicitly requested a cheap smoke check.
- The native-video report includes scene-level issues, global issues, priority fixes, and a clear ship/block verdict.
- Evaluator docs no longer imply screenshot slicing is sufficient for polished Unit approval.
- Tests cover `.ralphy/workspaces/<ws>/projects/<id>/render/*.mp4` path detection.

## Links

- Related: #409 eval-to-repair loop.
- Related: #408 style and benchmark grounding.
- Related: #414 unit production pipeline.
