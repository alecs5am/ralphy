# `ralphy blueprint` CLI — extract a reproduction recipe from a finished project

> **Status:** todo
> **Filed:** 2026-06-03
> **Folder:** issues

## Context

#074 defines the Blueprint entity. We need the verb that builds one from a finished
`workspace/projects/<id>/`, capturing the full reproduction payload that today lives
scattered across the (gitignored) project.

## What

`ralphy blueprint create <project> --unit <slug>` (+ `show`, `list`): assemble a
self-contained Blueprint for a unit by pulling, concretely:

- **prompts** — `prompts/**` + the per-stage jsonl (image/i2v/vo/sfx) verbatim.
- **scenario** — `scenario.json` / `STORYBOARD.md` + the scene jsonl (beats, durations, VO, fork labels).
- **composition** — copy `index.html`; parse it to record the `A[]`/`SEG[]` arrays and the
  HyperFrames **components / registry blocks / overlay functions** it references.
- **hard assets** — the actual master/ref/music files from `asset-manifest.json`.
- **model stack** — from `logs/generations.jsonl`: per-stage model id + key params + cost.
- **recipes** — the concrete bake/encode/overlay recipes (ffmpeg filtergraphs, CRF, etc).

Output: `units/<slug>/blueprint/` (blueprint.json manifest + copied payload), append-only
like #069 units. Degrade gracefully (scenario-less / HyperFrames-only) per #062.

## Why it matters

It is the capture step. Without it, Blueprints would be hand-authored — exactly the
re-derivation we are trying to kill.

## Scope / acceptance

- `ralphy blueprint create|show|list` registered (single top-level cmd; smoke test via `bunx tsx`).
- Produces a valid `blueprint.json` (schema #074) + copied payload for `choose-silenthill-001`.
- Parses `index.html` to enumerate components/registry blocks + the timing arrays.
- Append-only, auto-version on re-create (mirror #069 / the auto-version invariant).

## Notes

- Depends on #074. Feeds #077 (publish), #079 (reproduce), #080 (templater).
- Reuse the extraction-rules already in the templater skill references.
