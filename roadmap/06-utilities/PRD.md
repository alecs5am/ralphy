# 06 — Utilities — PRD

## Problem

The pipeline depends on a set of local, non-API operations: ffmpeg recipes (loudnorm, sidechain duck, concat, extract-segment, burn-subs, tonemap-hdr, smart-crop), frame extraction, captions, palette ops, audio probes. They live under `ralphy audio` / `ralphy video` and a few scattered places. Three problems:

1. **Discoverability.** A new contributor or AI agent doesn't know what recipes exist without grepping `cli/commands/audio.ts` and `cli/commands/video.ts`. There's a `docs/ffmpeg-recipes.md` but it's incomplete and drifts from the code.
2. **Naming inconsistency.** Some recipes take `--input` / `--output`; others take positional args. Some accept a project context (`--project <id>`); others don't. `AGENTS.md` invariant #2 says "all ffmpeg must route through `ralphy`" but the surface is irregular enough that agents reach for raw `ffmpeg` to avoid the friction.
3. **Captioning is API-only.** `ralphy project transcribe` calls whisper-1 via OpenRouter — works, costs ~$0.08 per 30s clip. For batch / repeat runs, a local whisper.cpp option would drop cost to zero and improve privacy. Today: no path to local.
4. **No local-model bench.** As local models improve (whisper.cpp, llama.cpp for tiny prompt-edit tasks, llama-3 for offline scene-direction), there's no slot for them. We need the architecture before we need the models.

This category owns "everything Ralphy can do without spending API credits".

## Users

| User | Need |
|---|---|
| **Editor playbook** (agent) | A predictable, documented recipe library — no raw ffmpeg fallback. |
| **Power user** | Same — plus the ability to swap captioning to local for cost / privacy. |
| **Researcher playbook** (agent) | Frame extraction, video probing, audio probing — all callable in one verb. |
| **Maintainer** | Recipes are version-pinned ffmpeg invocations, not "whatever's on PATH". |

## User stories

1. As an **editor agent**, I want to add scene-04 to the timeline via `ralphy video concat`. The verb's `--help` shows me the exact flag for transitions, audio handling, and output codec.
2. As an **art-director agent**, I want frame 0 of a video reference via `ralphy video frame <input> --at 0`. No ffmpeg knowledge required.
3. As a **power user**, I want `ralphy project transcribe <id>` to use a local whisper.cpp model when I set `RALPHY_LOCAL_WHISPER=1` — silently, no caveat.
4. As a **maintainer**, I want every recipe to be a tested function in `cli/lib/recipes/`, not an inline `child_process.exec`. Refactors stay safe.
5. As an **agent**, I want one verb (`ralphy video probe <path>`) to return duration, resolution, fps, codec, audio stream count — no need to invoke ffprobe directly.
6. As a **future user**, I want `ralphy bench local` to tell me which local models are installed and how they compare to the API options on speed and quality.
7. As a **smart-crop user**, I want `ralphy video smart-crop --aspect 9:16` to use face/saliency tracking, not a static center crop.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| Recipes in `cli/lib/recipes/` with tests | 100% of the verb surface | Test coverage report |
| Raw `ffmpeg` invocations in `cli/` outside `recipes/` | 0 | rg check in CI |
| `ralphy audio --help` and `ralphy video --help` list every recipe with one example each | Yes | Help grep |
| Local whisper.cpp captioning path works on macOS + Linux | Yes (opt-in) | Smoke test |
| Captioning cost when local enabled | $0 / 1000 clips | Telemetry vs API mode |
| Smart-crop output passes green-zone check on TOP-5 templates | 5/5 | Render-test |

## Non-goals

- **Replacing API-based gen with local models.** Local stays opt-in for narrow tasks (captioning, palette extraction). Image / video gen remains API-only.
- **A pluggable codec abstraction.** ffmpeg is the engine. Don't add a HandBrake / x264 / NVENC selector matrix.
- **GPU acceleration framework.** macOS gets VideoToolbox via ffmpeg defaults; Linux gets whatever ffmpeg detects. No custom CUDA path for v1.0.
- **Rendering itself.** That belongs to Remotion — see [`docs/playbooks/remotion.md`](../../docs/playbooks/remotion.md). This category owns post-render and pre-render utilities, not the render itself.
- **Image gen / inpainting locally.** Image gen is API-only.

## v1.0 cut

**Must ship:**

- `06.01` — ffmpeg recipe library: every verb documented + tested
- `06.02` — Smart-crop with face/saliency tracking
- `06.03` — Captions: cloud (whisper-1) default, local (whisper.cpp) opt-in
- `06.04` — Video / audio probe verbs

**Post-launch:**

- `06.05` — Local model bench
- `06.06` — Image utilities (palette extraction, format conversion)
- `06.07` — Local prompt-edit assist (tiny llama for VO line trims)
