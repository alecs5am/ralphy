# Keying and local matting (#560 checkpoint)

This note picks the local stack behind `ralphy matte key` (green or blue screen) and `ralphy matte subject` (footage without a chroma screen, for text behind a subject). The rule for this feature is free before paid: both verbs run on this machine with zero model-provider calls. It also records why CorridorKey 2.0, the keyer the owner pointed at, is not the engine.

Measured on 2026-10-30 on an Apple M4 Pro (14 cores, 48 GB, no NVIDIA GPU), ffmpeg 9.0.1, Python 3.12.13, ONNX Runtime 1.23.2. Some timings ran while another benchmark used the CPU; treat them as order-of-magnitude.

## CorridorKey 2.0: does not run here

[CorridorKey 2.0](https://github.com/nikopueringer/CorridorKey2.0) (commit `485f5e9`, 2026-10-15) is a learned green and blue screen keyer from Corridor Digital. It predicts an alpha and an unmixed foreground per frame, with an optional first-frame or per-frame hint matte.

- **Hardware: CUDA only.** `infer.py` stops with "CorridorKey v2 runtime requires a CUDA GPU." when `torch.cuda.is_available()` is false, and `corridorkey/runtime.py` hard-codes `.cuda()`, `torch.cuda.mem_get_info()` and `torch.autocast("cuda", dtype=torch.bfloat16)`. The README asks for an NVIDIA RTX 30-series or newer with at least 4 GB of VRAM (6 GB for 4K). There is no MPS or CPU path. It cannot run on this Mac, so speed and edge quality were not measured.
- **Install:** a venv, `torch==2.9.1` and `torchvision==0.24.1` from the CUDA 12.8 wheel index, `requirements.txt` (transformers, timm, a git-pinned utils3d), then `scripts/download_weights.py`, which pulls about 5 GB: the CorridorKey weights from Hugging Face plus three frozen feature extractors (NVIDIA C-RADIOv4-SO400M, Microsoft MoGe-2 ViT-B, Google DeepMind's Recurrent Video MAE).
- **Licence:** the "Corridor Key Licence" v2.0 is CC BY-NC-SA 4.0 with added terms. Outputs are yours and may be used commercially. You may not repackage, redistribute or sell the tool or its weights, or offer it as a paid API or inference service; derivatives must be free, under the same licence, and keep the CorridorKey name; a commercial software package that wants to incorporate it needs a written agreement with Corridor Digital; organisations above US $20M revenue need a paid seat per user. The three feature extractors carry their own licences (NVIDIA Open Model License, MIT, Apache-2.0 code with CC BY 4.0 weights).
- **What that means for Ralphy:** even on a CUDA machine, Ralphy should not download or wrap CorridorKey itself (section 2d covers exactly that), and porting it to MPS would be a derivative under the same terms. The supported path is: the user runs CorridorKey on their own CUDA machine, and Ralphy composites the result (an RGBA or alpha + foreground export). Wiring `ralphy matte key --engine corridorkey` stays out until Corridor Digital agrees in writing.

## Green screen: colour-difference key in ffmpeg

Chosen default: **a colour-difference keyer with despill, built from plain ffmpeg filters** (`cli/lib/matte/chroma.ts`). It needs nothing beyond ffmpeg.

```
d     = G - max(R, B)                         (B - max(R, G) for a blue screen)
alpha = clip((high - d) / (high - low), 0, 1)
G'    = min(G, max(R, B))                     despill "max" (default); "avg" uses (R + B) / 2
```

`low` and `high` default to 10% and 90% of the screen strength, the median `d` over the frame border of one sample frame (`--sample-at`). A border that is not mostly screen (coverage below 35%) or a weak screen (strength below 24) is refused with a pointer to `matte subject`. Every op is an 8-bit plane filter, so keying runs at about 90 fps on 1080x1920; the end-to-end verb (key plus VP9-alpha encode) took 3.7 s for 4 s of 1080x1920.

### Bench

There is no green-screen footage with a known matte on this machine, so three ground-truth clips were built from real footage: the subject's RGB and its RVM matte (as ground truth), composited over an unevenly lit chroma green (#04b140 times a vertical and horizontal falloff, 0.67x to 1.04x, with grain), with 30% green spill near the edges, 5% global spill, real motion blur on the `fast` clip, and an H.264 4:2:0 encode at CRF 16. Each keyer's alpha is compared with the ground truth. Edge MAE counts only pixels near an edge; "wrong" is the share of pixels on the wrong side of 50%; excess green is the mean `max(0, G - max(R, B))` left on fully opaque subject pixels (0 = no visible spill).

| Keyer | presenter alpha / edge MAE | selfie alpha / edge MAE | fast alpha / edge MAE | wrong % (worst) | excess green (worst) |
|---|---|---|---|---|---|
| **colour difference, 10% / 90%, despill max (default)** | **0.95 / 19.5** | **2.21 / 28.5** | **3.03 / 30.3** | 0.16 | **0.0** |
| colour difference, 15% / 95% | 1.57 / 16.8 | 2.22 / 23.1 | 3.09 / 23.8 | 0.16 | 0.0 |
| colour difference, 25% / 70% | 0.98 / 27.1 | 2.52 / 36.0 | 3.51 / 39.6 | 0.17 | 0.0 |
| ffmpeg `chromakey` (similarity 0.12, blend 0.08) + `despill` | 10.99 / 53.1 | 29.55 / 90.8 | 20.64 / 82.6 | 1.05 | 0.0 |
| ffmpeg `chromakey`, no despill | same | same | same | 1.05 | 3.97 |
| ffmpeg `colorkey` (0.3, 0.1), the analog-horror icon rule | 45.1 / 107.2 | 91.5 / 118.1 | 69.6 / 128.2 | 34.1 | 3.9 |

MAE is in 0..255 units. Clips: `presenter` 1080x1920 studio talking head, `selfie` 1080x1350 phone selfie with curly hair and glasses, `fast` 1920x1080 camcorder footage with whip motion and blur. 15% / 95% has better edges but leaves dim screen corners partly opaque (presenter alpha MAE 1.57), so the default sits at 10% / 90%. The ffmpeg keyers were set once, not tuned per clip; they key on distance from one colour, so an uneven screen and spill hurt them by design. `hsvkey` was tried with guessed parameters and failed outright; it is left out of the table.

Sample frames (frame 15; source on green, ground truth, colour difference, `chromakey` + `despill`, `colorkey`, each over magenta):

- `.ralphy/cache/matte-560/samples/key-presenter-f15.jpg`
- `.ralphy/cache/matte-560/samples/key-selfie-f15.jpg`
- `.ralphy/cache/matte-560/samples/key-fast-f15.jpg`
- A generated character on chroma green, keyed by the verb: `.ralphy/cache/matte-560/samples/key-still-hair.png` (PNG over a gradient) and `key-video-hair.png` (VP9 alpha over grey)

## No green screen: local subject matting

| Model (run) | Licence | 1080x1920 speed (CPU) | per second of 30 fps footage | flicker presenter / selfie / fast | partial-alpha share | agreement with BiRefNet (IoU) |
|---|---|---|---|---|---|---|
| **RVM MobileNetV3, auto scale 0.27 (default)** | GPL-3.0 | **22.4 fps** | **1.3 s** | 0.0009 / 0.0115 / 0.0294 | 1.6% / 4.3% / 7.4% | 0.99 / 0.98 / 0.94 |
| RVM MobileNetV3, scale 0.5 | GPL-3.0 | 7.7 fps | 3.9 s | 0.0010 / 0.0120 / 0.0286 | 1.9% / 4.8% / 7.6% | 0.99 / 0.98 / 0.90 |
| BiRefNet lite (Swin-T, 1024 px) | MIT | 0.31 fps | about 100 s | 0.0008 / 0.0121 / 0.0317 | 0.8% / 1.8% / 1.5% | 1.00 (reference) |
| u2net_human_seg via `hyperframes remove-background` (CoreML) | Apache-2.0 | 7.6 fps | about 3.6 s with encode | 0.0013 / 0.0228 / 0.0328 | 4.3% / 4.5% / 3.8% | 0.77 / 0.97 / 0.91 |

Flicker is the mean absolute alpha change between consecutive frames over the first 30 frames (lower is steadier; real motion raises it on `fast` for every model). Partial alpha is the share of pixels between 5% and 95% (soft hair and blur edges). Agreement is overlap with BiRefNet, not accuracy.

What the frames show (`.ralphy/cache/matte-560/samples/subject-<clip>-f15.jpg`: source, RVM, RVM 0.5, BiRefNet, u2net over magenta; `subject-presenter-alpha-f15.png`: RVM, BiRefNet and u2net mattes):

- **RVM** gives the softest, most natural hair and motion-blur edges and is the steadiest on people, at 20 fps on CPU. It treats see-through glass as partly transparent (the selfie's lens over the car window). It is a human matting model: a product or an animal alone will not matte well.
- **BiRefNet** gives the crispest, most solid silhouettes and works on any salient object, but at about 3 s per frame it is a stills and short-clip tool, and it can cut thin parts (the top of the selfie's glasses frame). Its hard edges look cut out on motion blur.
- **u2net** (the existing hyperframes path) is fast with CoreML but coarse (320 px input), flickers the most, and on the presenter clip it kept the burned-in flag stickers as "subject" (the 0.77 overlap).
- **CoreML** did not help: RVM ran at 11.9 fps with CoreML against 23 fps on CPU, and BiRefNet hung in CoreML model compilation for over 3 minutes at 0% CPU. The verbs default to CPU; `--device coreml` exists.

Defaults: `matte subject` uses RVM; `--model birefnet` for non-human subjects and stills. u2net stays available through `hyperframes remove-background` and is not wrapped.

## Output format

**VP9-alpha WebM by default; ProRes 4444 `.mov` with `--format mov`; a PNG for a still in.** HyperFrames' renderer re-extracts every video with ffmpeg and switches to PNG frames for alpha-capable codecs (vp9, vp8, prores), decoding VP9 with libvpx so the alpha plane survives, so both formats composite in `ralphy render`. Only WebM also plays in the browser preview (Chromium has no ProRes decoder), and it is about 100x smaller: 4 s of 1080x1920 was 1.5 to 3 MB as WebM against 208 MB as ProRes 4444. `.mov` is for handing a matte to Resolve, Premiere or Final Cut. VP9 runs with `-auto-alt-ref 0` (libvpx drops alpha with alt-ref frames) and `-cpu-used 2` (2.3x faster than the default 0 for 15% more bytes). The subject path attaches the matte to the source in YUV (`alphamerge`) with no RGB round trip, so the cutout matches its own source exactly when composited over it.

## Dependency approach

Same pattern as #559. `ralphy matte setup` creates `${RALPHY_HOME:-~/.ralphy}/tools/matting/py3.12-onnxruntime1.23.2-numpy2.5.4/` with uv: Python 3.12, ten exact pins (ONNX Runtime, NumPy, Pillow and their dependencies, wheels only), the RVM model (15 MB) from its upstream GitHub release with a SHA-256 check, a probe, and `stack.json`. `--models rvm,birefnet` adds BiRefNet lite (224 MB). About 150 MB on disk without BiRefNet (135 MB venv plus 15 MB model); 8 s with a warm uv cache. Frames move through ffmpeg raw pipes, so the venv needs no OpenCV. `ralphy doctor` reports `deps.matting` and a `matting` block (models present, next command), info only, never a blocker. `RALPHY_MATTE_PYTHON` brings your own interpreter.

RVM is GPL-3.0. Ralphy downloads it from upstream at setup time on the user's machine and runs it in a separate process; it must not be bundled into a distributed binary or app.

## Failure modes

- **Green keyer:** a green prop, wall or shirt keys out with the screen (the `fast` clip's green wall would key). Uneven light beyond the 10% / 90% ramp leaves dim corners semi-opaque or eats bright subject edges; set `--low` / `--high` by hand. Very heavy spill on a light subject: `--despill avg`. 4:2:0 sources leave a faint 1 px coloured edge on hard outlines; `--choke 1` or a 4:4:4 source fixes it. The despill also neutralises genuinely green parts of the subject.
- **Generated characters:** a gradient or vignette "green" background, a green cast on the skin, or green clothes break the key; see the art-director recipe.
- **Subject matting:** RVM is for people; for a product or an animal use BiRefNet. All models flicker more under fast motion and blur. BiRefNet and u2net segment every salient thing, including on-screen graphics burned into the source. Nothing here inpaints: removing a person and showing what was behind them needs a clean plate (not in scope).
- **Text behind subject:** the cutout must start with the same `data-start` and `data-media-start` as its source video, or the layers drift by a frame (see the editor recipe).

## Reproduce

```bash
ralphy matte setup                                   # RVM; add --models rvm,birefnet for BiRefNet
ralphy matte key clips/greenscreen.mp4               # -> clips/greenscreen.matte-key.webm
ralphy matte key character-green.png                 # -> character-green.matte-key.png
ralphy matte subject clips/presenter.mp4 --quality best
ralphy matte subject product.mp4 --model birefnet --format mov
```

Bench scripts and raw results live in `.ralphy/cache/matte-560/` (`scratch/bench.sh`, `scratch/keybench.ts`, `scratch/sweep.ts`, `scratch/keyeval.py`, `scratch/matteval.py`, `keybench/metrics.json`, `bench/matte-metrics.json`). The demo render (text behind a moving presenter, then a generated character keyed off green over a new background) is `.ralphy/cache/matte-560/demo-root/.ralphy/workspaces/default/projects/matte-layering-demo/render/final.mp4`; contact sheet `samples/demo-render-sheet.jpg`.
