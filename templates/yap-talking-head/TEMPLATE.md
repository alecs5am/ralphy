# YAP Talking-Head — vibe reference

**Genre:** raw selfie-style monologue, ONE idea per video, headline overlay + animated word-by-word captions.
**Length:** 30-60s (default 45).
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920, single shot, **NO jump cuts**.

## Why this format works

Manychat's "Algorithm Fatigue: 2026 Report" is the central data point: as feeds saturate with AI-polished content, viewers reward videos that read as a real person talking. "YAP videos" — the report's term — pull 800K+ views with minimal processing because they invert every signal of the slop wave: no jump cuts, no glossy b-roll, no synthetic narration smoothness. Just a person, a headline, and one idea well-articulated.

Three load-bearing mechanics:

1. **The 0-1s headline gate.** A muted-scroll viewer reads the headline before they hear the voice. If the headline is sharp ("Why your savings strategy is wrong"), they unmute. If it isn't, they swipe. The headline is the single most important asset in this format — treat it as the hook.
2. **One idea, fully said.** YAP punishes multi-idea videos. The completion-rate curve is shaped by whether the viewer felt the idea landed; two half-said ideas always lose to one fully-said idea. If the brief contains multiple points, push the user to `listicle` instead.
3. **Word-by-word captions carry the muted scroll.** ~85% of feed consumption is muted in 2026. Hormozi/TikTok-style animated captions are not decoration — they are the primary read for most impressions. Caption design is editorial.

## Vibe anchors

- **Single shot, single setting, single take.** No b-roll. No jump cuts. The discipline is the format.
- **Selfie framing.** Medium close-up, eye-level, lens at face height or slightly above. Phone-grade look beats cinema-grade look here.
- **Soft, natural light.** Window light or ring-light-as-window. No moody cinema lighting — that signals production and breaks the raw read.
- **Lean-into-camera energy.** Subtle forward shift, eyes locked on lens, hands occasionally enter frame for emphasis.
- **Headline holds 0-1s only.** Then it fades. Captions take over.
- **Captions are loud.** Hormozi yellow-fill, TikTok white-with-black-stroke, or karaoke word-fill — pick one and commit. Center-low or center-high, never both.
- **Emoji at ~1 per 5s cadence.** On emphasis words only, not on every line. Too many emoji = TikTok-2022 read.

## Differentiation from `talking-head-rant`

If you are choosing between this template and `talking-head-rant`, use this matrix:

| Axis | `talking-head-rant` | `yap-talking-head` |
|---|---|---|
| Length | 15-22s | 30-60s |
| Tone | deadpan, complaint, vent | energetic, teaching, conviction |
| Hook device | screenshot overlay (Reddit / news / chat) | typographic headline overlay |
| Shape | "can you believe this" | "here's the thing you need to know" |
| Audience read | "this is relatable, send to friend" | "this is useful, save for later" |
| Caption role | optional, supportive | mandatory, primary read |

If the brief is "X is annoying / broken / dumb," go rant. If the brief is "here's how X actually works / why you're wrong about X / the truth about X," go YAP.

## Variation axes

| Axis | Options |
|---|---|
| Archetype | entrepreneur / educator / contrarian / coach |
| Niche | finance / business / fitness / productivity / mindset / marketing |
| Tone | energetic-Hormozi / calm-but-firm-coach / contrarian-pointed / warm-educator |
| Caption style | Hormozi yellow-fill / TikTok white-stroke / Karaoke word-fill / Minimal bottom |
| Headline shape | single-line punchy / two-line setup-payoff / question-mark provocation |
| VO language | any — but headline + captions must localize together |

`hooks.md` has 12 headline patterns with niche-fit notes. `prompt-cookbook.md` has the model-by-model prompt vocabulary, ElevenLabs settings, caption design, and 4 worked examples.

## Narrative arc

```
0-1s    → Headline overlay (top of frame, large weight). Character already on screen behind / under it.
1-3s    → Headline fades. Character delivers the opening line — must restate the headline in spoken form, slightly different words.
3-40s   → Body of the idea. ONE idea. Build it: claim → reason → example → reframe.
40-50s  → The "so what" — the concrete instruction or shift the viewer should take.
50-60s  → CTA / loop-back. Either "follow for more on <niche>" or a sentence that loops back to the headline (so the auto-replay reads as continuous).
```

The arc is shape, not prescription. A tight 35-second YAP can collapse 40-50s and 50-60s into a single 5-second "so do this" close.

## Required user inputs

1. **Headline** — the on-screen text for the 0-1s gate. 4-9 words. If the user doesn't have one, the scenarist generates 3 options from `hooks.md` patterns.
2. **The single idea** — 1-3 sentences describing what the video is about. Must be ONE idea; if the user gives two, push back.
3. **Archetype** (optional) — defaults to `educator` if niche is education, `entrepreneur` if business/finance, `coach` if fitness/productivity, `contrarian` if the headline is a "wrong" / "stop" / "truth about" pattern.
4. **Niche** (optional) — defaults from headline content.
5. **Persona reference** (optional) — if supplied, used for the keyframe; if not, archetype-generic face.
6. **VO language** (optional) — defaults to English.

## When NOT to use

- **Multiple ideas / list content.** Use `listicle` — it's built for enumerated points and YAP punishes them.
- **Production-polished brand work.** Use `ai-avatar` — YAP's raw read undermines a polished brand identity.
- **Product demo / reveal.** Use `before-after-product` — YAP can't carry a visual product moment.
- **Pure complaint / venting.** Use `talking-head-rant` — YAP's energetic teaching tone is wrong for a vent.
- **Long-form (>75s) education.** Use a YouTube long-form template; YAP's single-shot discipline breaks past ~75s.

## Cost ballpark per video

| Stage | Detail | Cost |
|---|---|---|
| Character keyframe | `gemini-3-pro-image-preview` | $0.15 |
| Talking-head video (premium, lip-sync) | `veo-3.1` × 45s | ~$22.50 |
| Talking-head video (budget) | `kling-v3.0-pro` × 45s (assembled from 5-10s segments) | ~$4.50 |
| VO | ElevenLabs eleven_multilingual_v2 (subscription) | $0 |
| Captions | ElevenLabs Scribe v1 | ~$0.005 |
| Headline render | Remotion local | $0 |
| Music (optional) | ElevenLabs Music (subscription) | $0 |
| **Total (premium)** | | **~$22.65** |
| **Total (budget)** | | **~$4.65** |

`veo-3.1` is the right call when lip-sync accuracy matters (a known persona, a quoted slogan). `kling-v3.0-pro` is fine for most YAP videos because the captions cover ~70% of the lip-read load — viewers track the captions, not the mouth. Default to kling for batches; reserve veo for one-shot premium.

## Read also

- `hooks.md` — 12 headline patterns with setup, niche fit, and headline-design notes.
- `prompt-cookbook.md` — talking-head prompt vocabulary, ElevenLabs settings, caption design, mistakes, 4 worked examples.
- `../talking-head-rant/TEMPLATE.md` — the sibling format; read both before choosing.
- `src/lib/components/captions/` — Hormozi / TikTok / Karaoke / Minimal caption components, ready to wire.
