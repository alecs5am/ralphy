# Voice prompt cookbook

ElevenLabs (`eleven_multilingual_v2` by default) voice modes for UGC. Each mode tunes three voice settings + supplies a 3-sentence sample VO:

| Setting | Effect (range 0.0–1.0) |
|---|---|
| `stability` | Lower = more emotional variation per take; higher = monotone. |
| `similarity_boost` | Higher = closer to the source clone; lower = more interpretation. |
| `style` | Higher = more dramatic delivery; 0 = broadcast-flat. |

## Modes

| Mode | When to use | File |
|---|---|---|
| `deadpan-rant` | Hormozi-style monotone single-idea education / B2B opinion | [deadpan-rant.md](deadpan-rant.md) |
| `hype-hook` | DTC ad hook, energetic creator, 0-3s scroll-stop | [hype-hook.md](hype-hook.md) |
| `intimate-reveal` | Lifestyle storytime, confessional, 5-8s | [intimate-reveal.md](intimate-reveal.md) |
| `sarcastic-aside` | Meme commentary, deadpan punchline, eye-roll energy | [sarcastic-aside.md](sarcastic-aside.md) |
| `calm-narration` | Tutorial / how-to / documentary VO | [calm-narration.md](calm-narration.md) |

## Hard rules

- **Russian content?** Always ElevenLabs — Kling `--audio` slips accents on RU per [memory: feedback_kling_no_ru_audio].
- **English content?** Kling `--audio` is the cheaper option for single-character monologues; ElevenLabs wins for everything multi-character or RU/KR.
- **Voice cloning** beats library voices for any branded creator persona. Use `ralphy voice clone` once, then pin the voice id in the persona.
