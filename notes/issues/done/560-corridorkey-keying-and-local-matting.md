# Green-screen keying with CorridorKey and local matting for text-behind-subject

> **Status:** done — 2026-10-30 (checkpoint: `ralphy matte setup|key|subject`; CorridorKey 2.0 needs a CUDA GPU and is CC BY-NC-SA, so green screen uses a local colour-difference key + despill and no-green-screen uses RVM (BiRefNet optional); VP9-alpha WebM; layering demo render)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** research + feature / vfx

## Context

Two owner asks share a technique: green-screen characters (generate or film on green, key, composite) and cutting a subject out of footage so text can sit behind it. The owner points at https://github.com/nikopueringer/CorridorKey2.0 for keying. Locally we already have u2net background removal via the `hyperframes-media` skill; it was never compared for video edge quality.

## What

1. Evaluate CorridorKey 2.0 on this machine class (Apple Silicon): install path, speed per second of 1080x1920 footage, edge quality on hair, motion blur and spill; license terms.
2. Compare against the local alternatives for non-green footage (u2net, a local video-matting model) for the text-behind-subject case.
3. Ship:
   - `ralphy matte key <video>` (green screen, CorridorKey) and `ralphy matte subject <video>` (no green screen) writing alpha video (ProRes 4444 or WebM VP9 alpha) into `artifacts/videos/`.
   - A HyperFrames layering recipe: background, text, keyed subject on top.
   - A green-screen character recipe: prompt rules to generate a character on flat chroma green (no green spill on the subject, even light), then key with CorridorKey.

## Scope / acceptance

- `docs/research/keying-and-matting.md` with the comparison table and sample frames.
- Both verbs work offline, append-only (new versions, never overwrite).
- A demo unit: text behind a moving subject, and a keyed generated character over a background.
- `ralphy doctor` reports whether the keyer is installed.

## Notes

- Free path only; no provider matting unless local quality fails and the owner agrees.
- Related: #559, `analog-horror-psa` chroma-key rules.

## Checkpoint 2026-10-30

Landed (uncommitted at the time of writing):

- CorridorKey 2.0 evaluated: its runtime refuses to start without CUDA (`infer.py` raises when `torch.cuda.is_available()` is false; `.cuda()` and CUDA bf16 autocast are hard-coded), so it cannot run on Apple Silicon and was not measured. Its licence (CC BY-NC-SA 4.0 plus terms) allows commercial use of outputs but needs a written agreement to incorporate it into commercial software, so Ralphy does not download or wrap it. Details: `docs/research/keying-and-matting.md`.
- `ralphy matte key <video|image>`: a colour-difference keyer with despill built from plain ffmpeg filters, thresholds scaled from the screen strength measured on the frame border. On three ground-truth green clips its edge error is 2 to 4x lower than ffmpeg `chromakey` + `despill` and it leaves no excess green on the subject.
- `ralphy matte subject <video|image>`: RVM MobileNetV3 by default (22 fps at 1080x1920 on CPU, steadiest on people), BiRefNet lite with `--model birefnet` (any object, about 3 s per frame); compared with the existing u2net path on three clips.
- `ralphy matte setup` installs a pinned uv venv (ONNX Runtime 1.23.2, NumPy, Pillow; ten exact pins) under `${RALPHY_HOME:-~/.ralphy}/tools/matting/<stack-id>/` and the SHA-256-checked models; `ralphy doctor` reports `deps.matting` and a `matting` block.
- Output: VP9-alpha WebM by default (plays in preview and renders; about 100x smaller than ProRes), `--format mov` for ProRes 4444, PNG for a still; append-only `.v2`, `.v3`.
- Recipes: `.agents/skills/editor/references/keying-and-matting.md` (three-layer text-behind-subject and keyed-character compositions) and `.agents/skills/art-director/references/green-screen-character.md` (prompt rules for flat chroma green without spill).
- Demo render (scratch root): `.ralphy/cache/matte-560/demo-root/.ralphy/workspaces/default/projects/matte-layering-demo/render/final.mp4`.
- Tests: `tests/unit/matte-chroma.test.ts`, `tests/unit/matte-encode.test.ts`, `tests/unit/matte-zero-provider.test.ts`, `tests/integration/cli-matte.test.ts`.

Open:

- A demo Unit in a real project (the checkpoint demo is a scratch render, not a Unit).
- A documented import path for CorridorKey exports made by the user on their own CUDA machine (alpha + foreground into a VP9-alpha WebM), pending Corridor Digital's position on integration.
- Register `matte` outputs as Artifact Revisions when `--project` is used (today they are plain files in `artifacts/videos/`).
- Clean plates (inpainting the subject out) and local uneven-screen correction (a per-pixel screen reference instead of one strength).
