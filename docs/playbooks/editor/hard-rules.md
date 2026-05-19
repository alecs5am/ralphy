# Hard rules — FFmpeg / post-render discipline

Applies when using `cli/lib/ffmpeg-recipes.ts` (see `docs/ffmpeg-recipes.md`) — post-Remotion processing or pre-processing of user uploads.

1. **Subtitles last.** `burnSubtitles` runs after every other filter (tonemap, loudnorm). Otherwise the next filter resamples the letters → artifacts.

2. **Per-segment extract before concat.** Don't trim an already-concatenated file — extract segments via `extractSegment`, then `concatLossless`.

3. **30ms fades around cut boundaries.** A raw cut → click-pop in audio. Fade-in/out at least 1 frame at every cut.

4. **PTS-shifted overlays.** When overlaying a screenshot/text on top of a concatenated video — set a PTS offset so the overlay doesn't "drift" back to source timestamps.

5. **Output-timeline SRT offsets.** If you burn subtitles after concatenating multiple clips — recompute SRT timestamps relative to the RESULTING timeline, not the source.

6. **Word-boundary cuts only.** When cutting VO for viral moments — cut on word boundaries (whisper-1 word-level timestamps give honest boundaries). Never cut mid-word.

7. **30–200ms padding around speech.** `extractSegment` for VO clips — add 200–400ms padding before and after, otherwise consonants get lost.

8. **Word-level ASR only.** Captions come ONLY from `transcribe.ts`, which requests `timestamp_granularities[]=word`. Segment-level → ragged word-pop effect.

9. **Transcript caching.** Don't re-run `ralphy generate captions` if `captions.json` is fresher than the audio file. Every call = $0.006/audio-min + latency.

10. **MarginV=90 safe-zone.** With `burnSubtitles` the default `marginV: 90` is the TikTok bottom-UI safe zone. Don't go below 60.

11. **Strategy confirm before render.** If the pipeline is non-trivial (multi-segment, ducking, tonemap) — re-check the plan with the user in chat before launch. Renders are expensive in human-time.

12. **Output dir isolation.** Every ffmpeg-recipe writes to its own `dst` under `workspace/projects/<id>/render/` or `assets/`. **Never overwrite source files.**

13. **50ms afade in/out on every clip before concat.** `-c copy` AAC concat produces audible clicks at each clip boundary because DTS is non-monotonic across joins. Re-encode each clip with `afade=t=in:st=0:d=0.05,afade=t=out:st=<dur-0.05>:d=0.05 -c:a aac` before concat. Costs 5-10s of CPU per clip; saves the "звуковой баг неприятный" the user catches mid-render (noski rule #8).

14. **ffprobe every clip's real duration before any trim script.** Encoder overshoots `--duration N` by ~0.05s on Kling, ~1.0s on Seedance long-form, ~0.04s on Veo. Hardcoded 3000ms assumptions cut scene-15 + scene-24 speech mid-word on noski-people-001 (cost: 1 re-render cycle + user-flagged "девушка не успевает договорить"). Use `ralphy editor preflight <project>` to see real durations + delta-vs-music; built explicitly for this in Batch B (commit 00d52af).

15. **Trim is a first-class pipeline phase, not a render-time fix.** Tokyo-y2k-001's storyboard was 75s but raw concat hit 90.7s because every Kling / Seedance clip overshoots ~1s. Run `ralphy editor trim-analyze <project>` between art-director and editor — produces per-clip dead_head / dead_tail / best_subwindow JSON the editor consumes. Don't paper over overshoot with `-t` cuts at render time.

## Green-zone (text overlays)

- Universal Green Zone 1080×1920: X 60→960, Y 210→1480.
- Hook text: Y 280-340. Upper-mid: Y 360-440. Supporting: Y 1100. CTA: Y 1380.
- Hard fails: `y<210`, `y>1480`, `x>960`. Burned-in subtitles `marginV: 90` = Y 1830 — inside the universal zone.

See `docs/green-zone.md` + `src/lib/utils/green-zone.ts:isInGreenZone()` to validate.

## We don't write runtime ffmpeg scripts

Hard rule from AGENTS.md — no `workspace/projects/<id>/scripts/*.ts`. All ffmpeg operations go through `cli/lib/ffmpeg-recipes.ts` (created in Sprint 4.1) or via `ralphy render` flags. If the recipe you need doesn't exist — add it to `ffmpeg-recipes.ts`, don't write inline.
