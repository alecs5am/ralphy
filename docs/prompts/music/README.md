# Music prompt cookbook

ElevenLabs Music modes for UGC. Each mode is a slot-fillable prompt skeleton with 5 worked examples.

## Hard rules

- **No named artists / producers / songs.** ElevenLabs blocks the request and returns a `prompt_suggestion` (see memory `feedback_elevenlabs_music_no_artist_names`).
- **Genre + tempo + instrumentation only.**
- **Music is overlaid in the editor stage** — never auto-baked by the video model. Kling needs an explicit "no background music" ban; ElevenLabs music goes in post.

## Modes

| Mode | When to use | File |
|---|---|---|
| `tension-build` | Cliffhanger / reveal setup, 3-6s build | [tension-build.md](tension-build.md) |
| `deadpan-bg` | Bed under deadpan-rant VO; barely-there texture | [deadpan-bg.md](deadpan-bg.md) |
| `drop-and-cut` | Punctuates a beat-drop transition, 1-2s sting | [drop-and-cut.md](drop-and-cut.md) |
| `lofi-narrative` | Storytime / podcast clip / "real talk" bed | [lofi-narrative.md](lofi-narrative.md) |
| `hyper-pop` | TikTok hyper-pop trend, sub-15s viral cut | [hyper-pop.md](hyper-pop.md) |

## Loudness budget

- **VO present:** music at −22 to −26 LUFS under the VO. Use `ralphy editor mix` to ducking-mix.
- **No VO:** music can sit at −16 to −18 LUFS.
