# Keying and matting: layering recipe (#560)

Two local, $0 verbs produce straight-alpha video for HyperFrames. Neither calls a provider. Comparison and failure modes: [`docs/research/keying-and-matting.md`](../../../../docs/research/keying-and-matting.md).

| Footage | Verb | Engine |
|---|---|---|
| Shot or generated on chroma green / blue | `ralphy matte key <video\|image>` | ffmpeg colour-difference key + despill, nothing to install |
| Anything else (text behind a presenter) | `ralphy matte subject <video>` | RVM (people) or `--model birefnet` (any object), after `ralphy matte setup` |

Outputs land next to the source as `<stem>.matte-key.webm` / `<stem>.matte-subject.webm`, or in `<project>/artifacts/videos/` with `--project <id>` (a still in gives a PNG in `artifacts/images/`). They are never overwritten: a rerun writes `.v2`, `.v3`. Use `--quality best` for a cutout that sits over its own source.

## Text behind a moving subject

Three layers: the original video, the text, the matted subject on top.

```bash
ralphy matte subject presenter.mp4 --quality best --out <project>/presenter.subject.webm
```

```html
<!-- z1: the original footage -->
<video id="bg1" src="presenter.mp4" data-start="0" data-duration="4" data-media-start="0" data-track-index="0" muted playsinline></video>
<!-- z2: the text, positioned where the subject will cover part of it -->
<h1 id="behind" style="position:absolute; top:330px; z-index:2">SAY LESS</h1>
<!-- z3: the cutout, wrapped in an untimed div -->
<div id="cut1" style="position:absolute; inset:0; z-index:3">
  <video id="subject1" src="presenter.subject.webm" data-start="0" data-duration="4" data-media-start="0" data-track-index="1" muted playsinline></video>
</div>
```

Rules:

1. **Same `data-start` and `data-media-start` on the source and the cutout.** Starting the cutout later makes HyperFrames seek it separately and it lands a frame off the source.
2. **Every timed `<video>` needs an `id`** (`bunx hyperframes lint` reports `media_missing_id`; without it the renderer freezes the clip).
3. **Animate the wrapper, not the video.** HyperFrames forces `opacity: 1` on timed elements; fade or move `#cut1`.
4. **Place the text where the subject covers part of it but not all**: across the head or shoulders, so the read is "behind". Check a mid-shot frame before rendering.
5. The cutout is a copy of the source pixels, so it matches the background exactly (the subject path keeps the source YUV). Do not put it over a different take of the same person.

## Keyed character over a new background

```bash
ralphy matte key character-green.mp4 --quality best --out <project>/character.keyed.webm
ralphy matte key character-green.png                      # still in, PNG out
```

```html
<div id="backdrop" style="position:absolute; inset:0; background:radial-gradient(...)"></div>
<h1 id="title2" style="position:absolute; top:250px; z-index:2">KEYED LIVE</h1>
<div id="cut2" style="position:absolute; inset:0; z-index:3">
  <video id="character2" src="character.keyed.webm" data-start="4" data-duration="4" data-media-start="0" data-track-index="2" muted playsinline></video>
</div>
```

Tuning when the key is off (read the `screenStrength`, `low`, `high` the verb prints):

- Screen left in dim corners: lower `--high` (for example from 106 to 90).
- Subject edges eaten or semi-transparent: raise `--low`.
- Green fringe on hair: `--despill avg`; a hard 1 px line on outlines: `--choke 1`.
- "no green screen found": the frame border is not mostly screen; use `matte subject`, or force with `--low` and `--high`.

## Format

Keep the default VP9-alpha WebM for compositions: it plays in the preview and renders, and is about 100x smaller than ProRes. Use `--format mov` (ProRes 4444) only to hand a matte to an NLE.

Worked demo (both scenes in one composition): `.ralphy/cache/matte-560/demo-src/index.html`, rendered with `ralphy render` to `.ralphy/cache/matte-560/demo-root/.ralphy/workspaces/default/projects/matte-layering-demo/render/final.mp4`.
