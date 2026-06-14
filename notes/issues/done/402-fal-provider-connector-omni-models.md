# Add a fal.ai provider connector + the omni / reference-to-video models

> **Status:** done — 2026-06-14 (connector + models + --ref-video + invariant #1 amendment landed with unit coverage; ONE paid live smoke still pending maintainer go-ahead — see the gated command in the commit/issue)
> **Filed:** 2026-06-12
> **Folder:** issues

## Context

Trafalgar collab session (2026-06-12, `trafalgar-aura-001`): on explicit user
instruction we ran fal.ai OFF-STACK (raw curl + the fal MCP, user-provided
`FAL_KEY`) because two capabilities don't exist on OpenRouter:

- **`bytedance/seedance-2.0/reference-to-video`** accepts a real-human-face
  reference VIDEO with **no privacy block** (unlike OR seedance image inputs,
  which 400 on `InputImageSensitiveContentDetected.PrivacyInformation`) and
  produces a true 1-in-1 restyle — it replicated the source reel's shot
  structure, camera moves and comedic timing into a game-style world.
  Validated on both scenes of the pilot; this is now the collab's primary
  pipeline (see workspace memory `fal-seedance-r2v-no-face-block`).
- **`fal-ai/kling-video/o3/pro/reference-to-video`** (Kling O3 omni) offers
  `@Element` character-consistency refs + `@Image` style refs (NO video input).

The off-stack run bypassed `generations.jsonl` and the cost rollup — the very
value invariant #2 exists to protect.

## What

Add a `fal` provider connector to the existing connector layer
(`cli/lib/providers/registry.ts`, shipped slice of idea
[[../ideas/005-pluggable-provider-spec.md]]) and register the two omni models,
so `ralphy generate video --provider fal ...` is the sanctioned path and every
call lands in the gen-log with cost.

Capabilities to wire:

1. **Connector** `cli/lib/providers/fal.ts` — env `FAL_KEY`, queue submit →
   poll → result (`https://queue.fal.run/...` status/response URLs), CDN
   upload flow (`rest.alpha.fal.ai/storage/upload/initiate` → PUT →
   `file_url`).
2. **New input kind: reference video.** `--ref-video <path>` (or extend
   `--ref` detection by extension) mapping to seedance `video_urls`.
   Enforce/auto-fix the constraint: video refs must be within
   640x640..834x1112, ≤3 files, combined 2-15s, ≤50MB — auto-downscale
   1080x1920 sources (e.g. to 624x1108) with a stderr note.
3. **Models registered + documented in MODELS.md:**
   - `fal:bytedance/seedance-2.0/reference-to-video` — $0.3034/s 720p,
     ×0.6 with video inputs (= $0.1814/s), $0.682/s 1080p; `@Video1`/`@Image1`
     prompt convention; `generate_audio` defaults TRUE upstream — ralphy
     default should be false (post-mix discipline).
   - `fal:fal-ai/kling-video/o3/pro/reference-to-video` — $0.112/s audio-off /
     $0.14/s audio-on; `elements` (`@Element1`) + `image_urls` (`@Image1`);
     NO video input; durations 3-15s; aspect 16:9 / 9:16 / 1:1.
4. **AGENTS.md invariant #1 amendment** — add `FAL_KEY` to the sanctioned key
   list (the invariant becomes "only registered connectors", per idea 005's
   framing), and update the agents-md invariants test accordingly.

## Why it matters

- The privacy-filter bypass for real-face reference video is a capability
  unlock the collab pipeline now depends on; today it requires hand-rolled
  curl that skips logging, cost rollup, auto-versioning and the quality gates.
- Restores invariant #2's guarantee (every model call in `generations.jsonl`).
- First real third-party connector exercises the pluggable-provider slice
  beyond its two bundled connectors.

## Notes

- Sequence: connector (1) before input-kind plumbing (2); MODELS.md (3) and
  AGENTS.md (4) land with the connector PR.
- Cross-ref: idea [[../ideas/005-pluggable-provider-spec.md]] (§2 bundled set
  already names fal), issue #401 (workspace-local refs — the downscaled
  ref-video copies should land under the project's `artifacts/refs/`).
- Pricing/constraints sourced from the fal llms.txt docs fetched 2026-06-12;
  re-verify at implementation time.

## Scope / acceptance

- `cli/lib/providers/fal.ts` implementing the `RalphyConnector` contract:
  `capabilities: ["video"]` (minimum), `generateVideo` covering both endpoints,
  health probe, cost computation per the pricing above.
- Registered in `cli/lib/providers/registry.ts`; `ralphy provider list` shows
  `fal` with its capability row when `FAL_KEY` is set.
- `ralphy generate video --provider fal --model bytedance/seedance-2.0/reference-to-video
  --ref-video <mp4> --ref <png> --prompt "..."` produces an mp4 under
  `<project>/artifacts/videos/`, auto-versioned, with a `generations.jsonl`
  entry carrying `cost_usd`.
- Video-ref constraint enforcement + auto-downscale covered by a unit test
  (reject >15s; downscale 1080x1920 → ≤834x1112).
- `tests/unit/agents-md-invariants.test.ts` updated for the FAL_KEY amendment
  and green; full `bun test` green; no Cyrillic on disk.
