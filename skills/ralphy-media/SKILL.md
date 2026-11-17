---
name: ralphy-media
description: >-
  The bundled media tools and when to use which: pull a video, contact sheets and exact frames,
  cuts and shots, beats and sound onsets, word timings, on-screen text, loudness, vocals and music
  split, background removal, and comparing a copy with its reference. Triggers: "download this
  video", "find the cuts", "is it on the beat", "transcribe", "read the text in the video", "how
  loud", "split vocals", "remove the background", "compare with the reference", "скачай видео",
  "найди склейки", "попадает в бит", "расшифруй", "громкость", "вырежи фон", "отдели голос",
  "сравни с референсом".
---

# ralphy-media

`ralphy tool <name> [args]` runs `tools/<name>.py` with its own dependencies through uv (in a
checkout: `uv run tools/<name>.py`). Every tool has `--help` and `--json`. The first run of a tool
installs its packages; models download on first use. Outputs land next to the input (`source.mp4` →
`cuts.json`; anything else → `<stem>.cuts.json`) or in `--out`.

ffmpeg, ffprobe, yt-dlp and HyperFrames are yours to use directly; the tools exist where a script
beats a one-liner.

## Which tool

| Need | Tool | Notes |
|---|---|---|
| A reference on disk with its metadata | `pull <url or file>` | into `./refs/<slug>/`; `--meta-only` for counts; `--cookies-from-browser` only with the owner's ok |
| Everything for a reference at once | `breakdown <url, file or refs/<slug>>` | pull, cuts, beats, frames, transcript, `--ocr`; writes `breakdown.md` |
| See the video | `frames <video>` | ~40 frames on a labelled sheet; `--window A:B` every frame; `--at t1,t2` exact |
| Shots and cut times | `cuts <video>` | frame-exact; flashes apart; still share = how static it is |
| Tempo, beats, onsets | `beats <video or audio>` | `--cuts cuts.json` gives each cut's offset from its sound |
| Words with timings | `transcribe <file> --language ru` | local whisper; `--model small` default, `medium` for Russian names |
| Text on screen over time | `ocr <video> --lang ru` | spans with first/last time, box, pixel height |
| Loudness | `loudness <files>` | `--match <ref>` for the reference's level; `--normalize` writes `.norm` copies |
| Vocals and music apart | `stems <file>` | Demucs; installs PyTorch on first run; `--four` for drums, bass, other |
| Cut a subject out | `matte <image or video>` | `--model u2net_human_seg` for people; `--key 00B140` for green screen |
| Copy vs reference | `compare <ref> <copy>` | pair sheets, cut matching, still share, audio lag and correlation |

## Chains

- Copying: `breakdown` → read sheets → `frames --window` around fast events → build →
  `compare ref render`.
- Reusing the reference's sound under a new voice: `stems refs/<slug>/source.mp4` → use `music.wav`.
- Fitting a voiceover: `transcribe` the take → cut on word boundaries → `compare` or `beats` the
  render.
- Generated sound effects: `loudness --target -20 --normalize` before mixing; the final mix
  `--match` the reference.

## Facts that cost a render

- Cutouts for HyperFrames: VP9 webm with alpha (`matte` writes it); Chrome plays it, and it is about
  100x smaller than ProRes.
- Joining AAC clips with `-c copy` clicked at the seams. Re-encode with 50 ms fades at each edge, or
  mix in one pass.
- Level sources against each other before mixing, then bring the final mix to the reference's
  loudness; do not push every track to the delivery target. Normalize in two passes (as
  `loudness --normalize` does): one pass left a sparse track 3 dB off.
- iPhone HDR footage looked flat or blown out after upload: tonemap to SDR (`zscale` + `tonemap=hable`)
  before using it.
- Measuring a render: its video stream starts at 0.021 s; the tools count from the first frame.
- Frames of the render are the evidence, not composition snapshots.

## Rules

- Media outputs never overwrite (`.2`, `.norm.2`, `stems-2/`); analysis files (json, sheets) are
  regenerated in place.
- Read the sheets yourself. A summary from another model misread a contact sheet once; verify claims
  about frames against the frames.
