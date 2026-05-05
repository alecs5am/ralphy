# Reference example — `lyadov-podcast-001`

The original project that this template was extracted from. Ten ~1-minute business-interview shorts with Alexander Lyadov, dubbed from Russian to English. Read this to understand the concrete decisions; don't copy verbatim for new batches.

## What got shipped

- 10 episodes (`ep01_video.mp4` … `ep10_video.mp4`), each ~30–45 seconds.
- Each episode has its own karaoke caption file `src/videos/lyadov-podcast/captions-{01..10}.ts`, hand-generated from the ElevenLabs English transcript.
- One Remotion composition `LyadovEpisode` parametrized by `episode: string` — registered 10 times in `src/Root.tsx` under `Folder "LyadovPodcast"` with per-episode `defaultProps` and `durationInFrames`.
- English titles hand-translated from the Russian originals, e.g. `"«The biggest mistake founders make»"`.

## Input files (external to repo)

The raw inputs lived at `/Users/maximovchinnikov/Downloads/clean/` — not checked in:

```
clean/business_blog_02_shorts_clean_{01..10}_v001.mp4                  # raw RU speaker video
clean/output/business_blog_02_shorts_clean_{01..10}_v001_dubbed_audio.mp3  # ElevenLabs dub output
clean/output/business_blog_02_shorts_clean_{01..10}_v001_transcript.json   # ElevenLabs word-timestamp transcript
```

The setup script `src/videos/lyadov-podcast/setup-all.ts` walked `01..10`, extracted audio from each dubbed file, copied the source video, and converted the transcript per episode.

## Concrete style choices

- **Title banner:** `#FE2B02` red, slides down from `-120px` over 10 frames, fade in 0–6f, fade out last 12f, total 105 frames (~3.5s). Position: bottom-anchored with `paddingBottom: 534px`. Font: Inter 900, 56px, white with heavy drop shadow.
- **Karaoke captions:** 3 words per line, active word backgrounded with `#FE0100` rounded pill, white uppercased text, Inter 900, 62px. Position: `paddingBottom: 288px`. Display window: from the line's first-word start until the next line's first-word start (+ 6 frames tail for the final line).
- **Filler stripping:** `uh, um, huh, hmm, ah` filtered out at transcript-to-captions conversion step.
- **Video track:** `OffthreadVideo` with `volume={0}` — muted. The English `Audio` is the dubbed m4a at `volume={1}`. No original Russian audio anywhere in the output.

## English titles (as shipped, for reference vibe)

Every title is 2 lines, Oxford quotes (« »), each line 2–5 words. Matches the original Russian headline cadence.

| ep | EN title |
|---|---|
| 01 | «Why do investors invest in startups?» |
| 02 | «How to 10x your valuation?» |
| 03 | «The biggest mistake founders make» |
| 04 | «There's no point doing anything cheap in IT» |
| 05 | «The #1 skill of an entrepreneur» |
| 06 | «The biggest risk for an investor» |
| 07 | «Does money buy happiness?» |
| 08 | «The Segway founder died on a Segway» |
| 09 | «Can you make billions in any niche?» |
| 10 | «Successful startups are extremely rare» |

## What to copy, what to adjust per new batch

**Copy:**
- 3 words per line for karaoke (fits `maxWidth: "92%"` without wrap on most english captions).
- Filler-word strip list.
- Title banner slide+fade timing (feels right at 30fps).
- Uppercase karaoke words (reads stronger than mixed case on shorts).
- `OffthreadVideo volume={0}` + separate `Audio` for the dubbed track. Never rely on the dubbed file's embedded video track.

**Adjust from the reference short:**
- Title and karaoke colors — the Lyadov edit used `#FE2B02` / `#FE0100`; other brands won't.
- Title text position (`paddingBottom`) — different speakers frame shots differently. Read it off the edited RU reference before picking a number.
- Caption position — if the speaker's chin tends low, raise the caption; if shots are mostly torso-up, drop it.
- Font — Inter works for English Latin; if the target is non-Latin, switch families.
- Whether to include the title banner at all — some Russian originals don't use one.

## Known quirks

- The `OffthreadVideo` + `Audio` pair means the video clip's natural length may differ slightly from the dubbed audio length. The English dub is typically ±10% of the Russian source duration. Check both and use the longer for `durationInFrames`; the shorter media will end early (black frame or silence on the tail). Recompute per episode — don't assume.
- Caption display end-frame is set by the *next* group's start, not the current group's `endMs`. This keeps captions on-screen during short pauses between lines. The last group adds 6 frames of tail so it doesn't cut abruptly.
- Remotion preview audio can sound clicky between karaoke groups — the final render is clean.
- Google Fonts weight 800 is loaded but not actually used — Inter 900 is what's applied. Keep or trim based on bundle-size preference.
