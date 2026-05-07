# POV First-Person — vibe style

**Genre:** human-POV. Viewer is projected into the scene from first person via a centered text overlay (`POV: you just…`). The creator plays the character on camera with reactive expressions; the scene develops and lands on a payoff.
**Length:** 8-25s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.

> **Not the same as `ai-vegetables`.** That template is POV-anthropomorphic (vegetables, fruits, objects). This one is **human-POV** — broader, character-driven, the bedrock format of the POV genre on TikTok.

## Why this works

Highest share-rate and save-rate format on the platform. Mechanism:

1. **Relatability triggers.** The text overlay names a specific micro-situation. The viewer either recognizes themselves or recognizes someone in their life — and forwards the video.
2. **Projection beats explanation.** "POV: you just…" lets the viewer step into the scene. No setup, no exposition, no "let me tell you about a time."
3. **Reactive performance carries the back half.** Once the POV line lands, the camera holds on the character's face. Micro-reactions do the work that a script would otherwise do.
4. **Payoff rewards the watch-through.** Punchline / emotional peak / cliffhanger gives the viewer something to react to — the comment-trigger that the algorithm rewards.

The combination of share-rate (relatability) + save-rate (recognizable life moment) + comment-rate (payoff reaction) is the algorithmic trifecta. POV format optimizes for all three.

## Vibe anchors

- **POV text overlay: centered, big, persistent.** Top-third or middle. Stays on screen for the full hook beat (≥ 2s). Don't shrink it, don't move it, don't fade it early — it's the whole hook.
- **In-character reaction, not narration.** The character lives the scenario; they don't describe it. Eyes-to-camera, micro-reactions (eyebrow raise, slow blink, breath in, head-tilt), occasional under-the-breath line.
- **Specific scenario, not generic mood.** "POV: you just sent the screenshot to the wrong group chat" beats "POV: you're stressed." Specificity is what makes the viewer recognize themselves.
- **Payoff lands hard.** Punchline (one line, deadpan), emotional peak (one breath, eye-contact, cut), or cliffhanger (cut at the worst possible moment). Don't trail off.
- **Real-feeling environment.** Bedroom, kitchen, car, office — fits the scenario. Selfie-style or face-cam framing. No studio lighting.

## Variation axes

| Axis | Options |
|---|---|
| Niche | comedy / dating / lifestyle / B2B-SaaS / retail / parenting / fitness |
| POV tense | `you-are-X` / `you-just-X` / `coming-home-to-X` / `it's-the-year-Y-and-X` / `your-X-is-Y` |
| Payoff style | punchline / emotional peak / cliffhanger / cut-to-black |
| Shot count | single-shot face-cam vs multi-cut (POV text + reaction + payoff cutaway) |
| Tone | deadpan / panicked / wistful / fed-up / sincere |
| VO presence | full VO / no VO + trending sound only / hybrid |

## Narrative arc

```
0-2s    → POV text hook. Centered, big. Character on camera, neutral / pre-reaction beat.
2-10s   → Scene develops. Reactive expressions stack — small reactions build to a bigger one.
                Optional: under-the-breath line, prop interaction, second character entering frame.
10-20s  → Payoff. Punchline (one line) / emotional peak (one breath + eye contact) /
                cliffhanger (cut at the worst possible moment).
```

For the short end of the range (8-12s), the scene-develop and payoff beats compress into one continuous shot. For the long end (18-25s), multi-cut is allowed: text + reaction + cutaway + payoff.

## Required user inputs

1. **POV scenario line** — the text overlay. One sentence, ≤ 12 words, starts with `POV:`. Specific.
2. **Character / persona** — who's on camera. Age range, vibe (deadpan office worker / panicked twenty-something / fed-up parent / wistful Gen-Z), niche.
3. **Payoff line or beat** — the punchline, the emotional moment, or the cliffhanger cut. Even one line is enough.
4. **(Optional) Tone** — deadpan (default for comedy / B2B) / panicked / wistful / fed-up / sincere.
5. **(Optional) Trending sound reference** — if a specific platform sound is part of the brief, link it. The researcher playbook can pull it.

## Reference rules

No reference required by default — POV characters are AI-generated personas. Two exceptions:

- **Named real creator** (Brittany Broski, Drew Afualo, etc.) → reference-required gate engages. Face reference must exist at `workspace/projects/<id>/assets/uploaded/`. Refuse otherwise.
- **Real brand in the scenario** (POV: you just opened a real-brand-name app) → product / logo reference required. Same gate.

## When NOT to use

- **Generic scenario.** "POV: you're tired" — too vague, no recognition. Use `talking-head-rant` or skip the format.
- **B2B-corporate audience that wants a polished pitch.** POV format reads as casual / chaotic. Use `yap-talking-head` or `before-after-product`.
- **Long explainer (> 25s).** The format loses tension past 25s. Use `tutorial-how-to` or split into a series.
- **Multi-character dialogue scenes.** POV is single-perspective. For multi-character bits, use `talking-character` or compose two POV videos as a duet.
- **Vegetable / object anthropomorphism.** That's `ai-vegetables`, not this.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 2-3 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.30 - $0.45 |
| Video clips | 1-3 × `kling-v3.0-pro` × 5-8s @ $0.14/s | $0.70 - $3.40 |
| VO | 1 ElevenLabs call (subscription) | $0 |
| Music | 0-1 ElevenLabs Music call (subscription) — often skipped in favor of trending sound | $0 |
| Captions | 1 × whisper-1 | ~$0.001 |
| Render | local | $0 |
| **Total** | | **~$1.00 - $3.85** |

Cheapest end of the pack — single-shot, single character, often no music.

## Read also

- `hooks.md` — 12 POV opener patterns (`POV: you just…`, `POV: it's the year…`, etc.) per niche, with stop-scroll mechanics.
- `prompt-cookbook.md` — character-animation prompt vocabulary, audio direction, caption rules, single-vs-multi-cut decision, common mistakes, 4 worked examples.
