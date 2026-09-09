# VO sync — scribe-first

**Read this when:** the cut has aligned-to-VO captions, the final timeline is gated by spoken phrases, or you are about to write any Remotion / HyperFrames timing constant against a VO track.

AGENTS.md invariant #16. Don't guess word boundaries from clip durations and `adelay` stacks — the `choose-your-guide-001` postmortem burned 11 edit iterations on that path before falling back to this one.

## The rule

Stitch the VO **first**, scribe the stitched track, then drive every downstream consumer — scene cuts, caption SRT, music duck-points — from the same word-level `startMs`. One source of truth, one $0.003 scribe call.

## Recipe

```bash
# 1. Trim each VO clip to pure speech — reverse-areverse so silenceremove only
#    kills leading + trailing silence, NOT inter-word pauses.
ralphy audio loudnorm --in vo-01-raw.mp3 --out vo-01-norm.mp3   # optional first pass
ffmpeg -i vo-01-norm.mp3 -af \
  "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.1,\
areverse,\
silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.1,\
areverse" \
  vo-01-clean.mp3
# (Repeat per clip. Default silenceremove without the reverse-areverse idiom
#  eats inter-word pauses too — clip collapses to a phoneme blob.)

# 2. Stitch with deliberate silence gaps via the ffmpeg concat demuxer.
#    Generate the silence assets once (0.5s = normal gap, 4-5s = title-card hold).
ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 0.5 -q:a 9 silence-0.5s.mp3
cat > concat-list.txt <<'EOF'
file 'vo-01-clean.mp3'
file 'silence-0.5s.mp3'
file 'vo-02-clean.mp3'
file 'silence-0.5s.mp3'
file 'vo-03-clean.mp3'
EOF
ffmpeg -f concat -safe 0 -i concat-list.txt -c copy vo-track.mp3

# 3. Scribe the stitched track. Word-level timestamps are the default.
ralphy ref transcribe <slug> --language en
# → .ralphy/references/<slug>/transcript.json with word-level startMs / endMs.

# 4. Read transcript.json. Drive scene-cut boundaries AND caption SRT from the
#    SAME word timestamps. Snap every timing constant in index.html / Remotion
#    composition props to a real word startMs — never to a guessed offset.
```

## Why every step matters

- **Reverse-areverse, not bare `silenceremove`.** Default `silenceremove` strips every pause ≥ threshold, including the ones between words. Clips collapse to phoneme blobs and the scribe loses prosody. The reverse-areverse idiom touches only leading + trailing silence.
- **Concat demuxer, not `amix` or `-filter_complex concat`.** `-c copy` keeps the source encoding intact; the scribe sees the same audio the final cut will. Filter-graph concat re-encodes and shifts spectral content enough that the scribe word boundaries drift a few frames.
- **Strategic gaps, not zero-gap stitch.** Insert silence intentionally where you want breathing room — before a title-card hold, between hook and reveal. The scribe will report the gap as the natural `endMs[i] → startMs[i+1]` delta, which is also exactly where you cut video.
- **Scribe AFTER stitch, not per clip.** Per-clip scribe + manual addition compounds error and re-introduces the guess-the-gap failure mode. One scribe of the final track = one truth.

## What this prevents

- VO that drifts ahead of or behind captions by 0.5–1.5s and re-iterates per scene.
- Video cuts that land mid-word ("conson—") because the editor estimated 0.8s where the actual word ended at 0.91s.
- Music duck-points written against clip indices instead of word indices, so the music dips between phrases instead of under them.

## Append-only on VO files

When iterating on VO post-FX (radio filter, compression, fade-out tail), **version each variant** — `vo-01-radio.mp3`, `vo-01-radio-soft.mp3`, `vo-01-radio-tight.mp3`. Never re-encode into the same filename; AGENTS.md invariant #14 says don't overwrite agent-produced artifacts, and A/B comparison breaks the moment you do. The `choose-your-guide-001` v9 → v10 → v11 thrash was exactly this defect.

## Brand-name spell fixes

ElevenLabs Scribe mis-hears proper nouns. Apply a `s/RALFY/RALPHY/`, `s/HIGGS FIELD/HIGGSFIELD/`, `s/.DEVE/.DEV/`, `s/.DIV/.DEV/` post-process before emitting the caption SRT. Keep the corrections table in `.ralphy/workspaces/<ws>/projects/<id>/captions-fixups.json` so iterations re-apply it.

## Follow-up

`ralphy ref transcribe` currently requires a reference slug — to scribe an arbitrary mp3, you have to fake a slug under `.ralphy/references/<slug>/source.mp3` (the `choose-your-guide-001` GAP-2 workaround). Tracked as a CLI gap; a future `ralphy ref transcribe --file <path>` (or a top-level `ralphy audio transcribe`) will accept arbitrary inputs. Don't add the verb here — file the request, keep using the slug workaround in the meantime.
