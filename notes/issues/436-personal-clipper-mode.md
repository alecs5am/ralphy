# Personal clipper mode

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

The taxonomy includes `personal-clipper`, and the user cited competitor tools that cut long videos into clips. Ralphy has researcher, transcription, captions, and render primitives, but no clear mode route for "turn this long video/audio into short clips."

## What

Add a personal clipper mode that takes a source URL or file and produces candidate clips, captions, titles, and packaged short Units.

## Why it matters

Clip extraction is a high-frequency content-farm workflow. It also complements generation: not every Unit needs synthetic media.

## Scope / acceptance

- Add a mode playbook for source ingest, transcription, viral moment detection, clip selection, captions, render, eval, and distribution pack.
- Define source requirements and duration limits.
- Use existing `ralphy ref` and caption workflows instead of ad-hoc ffmpeg.
- Add fixtures for podcast, talking-head, and tutorial source clips.
- Integrate #423 distribution pack and #427 readiness scorecard.
- Include a "no good clips found" outcome rather than forcing weak clips.

## Notes

- Related: audio-explainer and researcher skills.
