# AI Avatar Talking-Head — vibe-style

**Genre:** fully AI-generated presenter delivers a script — hook → value → CTA — straight to camera in close-up.
**Length:** 45-90s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.

> **Reference policy.** Not gated by the reference-required rule (no real product, no real person — by default). BUT: persona stability across episodes is load-bearing. Generate the avatar keyframe ONCE per project and reuse it for every scene and every language render. If the brief mentions a real named person (CEO, celebrity, public figure), the reference-required gate (AGENTS.md hard rule #3) DOES fire and you refuse without a signed-consent reference. See `workspace/personas/ARCHETYPES.md` for the 8 baseline archetypes.

## Why this works

In 2026, AI avatars crossed the uncanny-valley threshold for short-form. Three reasons this format prints:

1. **Production cost collapses to near zero.** No talent fee, no studio, no shoot day. One scenarist + one art-director session ships an episode.
2. **Multilingual scaling is one prompt away.** ElevenLabs `eleven_multilingual_v2` covers 30+ languages with voice preserved. One script → one persona keyframe → N language VOs → N veo-3.1-fast renders. A 10-market export costs ~$8-15 instead of $20K of dubbing.
3. **Brand persona is consistent across episodes.** Real human creators have bad-hair days, get sick, ask for raises, leave. An AI avatar is the same shot composition, lighting, and voice forever. For brands publishing weekly, this is a moat — not a gimmick.

The proof point: one TikTok Shop affiliate earned ~$13K commission on a single AI-avatar video (AIimagetovideo.pro, 2026). The format is conversion-grade, not just novelty.

**The trap.** "AI = accelerator, not replacement" (research doc Key Finding #3). YouTube and TikTok actively deprioritize raw AI-slop with robotic voice. Stability beats novelty. A consistent persona, warm VO settings, and a real script (written by a human or `/ralph-scenarist`) is what crosses the line from slop to scalable creator.

## Vibe anchors

- **Realistic avatar in close-up.** Shoulders-up framing, eye contact with the camera. Avoid full-body — veo-3.1-fast lip-sync is best framed tight.
- **Natural lip-sync.** veo-3.1-fast (audio-conditioned generation) is the default. The avatar's mouth shapes follow the actual VO waveform, not a generic loop.
- **Warm, soft lighting.** Window light, key + fill, no studio gloss. Studio gloss reads as corporate-ad and kills the parasocial vibe.
- **Simple composition.** Solid wall, blurred bookshelf, single-color backdrop. Busy backgrounds amplify any avatar artifacts (hair edges, ear-line wobble).
- **Same persona across episodes.** ONE canonical keyframe per project. NEVER regen the avatar mid-series — even subtle drift breaks viewer trust.
- **One language per render, but one persona across languages.** A French version uses the SAME face as the English version — only the VO and lip-sync change.

## Variation axes

| Axis | Options |
|---|---|
| Avatar archetype | 8 archetypes from `workspace/personas/ARCHETYPES.md`: friendly-creator, expert-educator, news-anchor, gen-z-streetwear, corporate-presenter, indie-founder, lifestyle-coach, gamer-reviewer |
| Language | English / Russian / Spanish / Portuguese / Hindi / Arabic / Mandarin / Japanese / French / German (anywhere `eleven_multilingual_v2` supports) |
| Tone | informative / friendly-relatable / authoritative / hype-energetic |
| Use case | product review / educational explainer / news brief / e-commerce ad / pitch / personal essay |
| Background | solid color / minimal room / softly blurred environment / on-brand backdrop |
| B-roll discipline | talking-head only / 1-2 cutaways / cutaway-heavy hybrid |

## Narrative arc

```
0-3s    → Hook. Avatar opens with a strong claim, question, or pattern interrupt.
              VO-only beat — no B-roll. Eye contact, slight forward lean.
3-60s   → Main value. Script delivery. Optional B-roll cutaways at 15s and 35s
              (3-5s each, kling-v3.0-pro, persona audio carries through).
              The avatar carries 80%+ of screen time in this format.
60-90s  → CTA. Specific ask: "link in bio", "follow for part 2", "save this for later",
              or a softer "DM me <keyword>". Hold on the avatar; no flashy outro.
```

For 45s versions, compress: 0-2s hook, 2-40s value, 40-45s CTA.

## Required user inputs

1. **Script** — 45-90s of VO copy. Hook + value + CTA. If absent, route to `/ralph-scenarist` first.
2. **Avatar archetype OR reference image** — pick one of 8 archetypes, or supply a persona reference. For series / brand presenters, the reference is mandatory for stability.
3. **Language** — defaults to English. Multilingual export is one extra prompt per language.
4. **(Optional) Tone** — defaults to friendly-relatable.
5. **(Optional) Use case** — defaults to product-review.
6. **(Optional) Background** — defaults to softly blurred minimal room.

## Reference / persona stability gate

This template doesn't trigger the reference-required hard refuse (no real product, no real person, by default). It DOES require a stable persona keyframe across episodes:

> "I'll generate the avatar keyframe once and treat it as the project reference for every scene, every language, and every future episode in this series. If you want a specific look, drop a persona reference now — otherwise I'll pick from the 8 archetypes in `workspace/personas/ARCHETYPES.md`."

If the brief mentions a real named person (CEO, celebrity, public figure):

> "The brief names <person>. I won't generate a likeness without a signed-consent reference. Either supply documented consent + a reference image, or rephrase as a fictional persona ('our brand presenter', 'an industry analyst')."

## C2PA disclosure (mandatory in 2026)

- Set the C2PA AI-generated flag at upload time on TikTok, Reels, and Shorts. All three platforms surface this automatically when set.
- For e-commerce / paid ads, add a visible "AI-generated" overlay in the bottom-right (8-10pt, low opacity). This is a regulatory requirement in EU/UK and a trust signal everywhere else.
- The Remotion composition includes a `<DisclosureBadge />` slot — leave it on by default; the user can opt out for non-ad content with `--no-disclosure`.

## When NOT to use

- **Medical / health claims** — viewers expect a real human. Use the `doctor-authority` template (when shipped) or a real creator. AI avatars on medical content read as scammy and platforms throttle them.
- **Audiences that explicitly distrust AI** — older demographics on Facebook Reels, conservative B2B finance audiences. Test with a real creator first.
- **Emotional storytelling** — grief, personal trauma, vulnerability. The parasocial bond breaks instantly when the viewer realizes it's synthetic.
- **Live reaction / news from the field** — the format is canned-feeling by definition. Don't use for hot takes that need on-the-ground credibility.
- **Likeness of a real named person** — without signed consent, refuse. Always.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Persona keyframe | 1 × `gemini-3-pro-image-preview` @ $0.15 (one-time per project) | ~$0.15 |
| Talking-head video | veo-3.1-fast chained 8s clips, image-conditioned + audio: ~$0.25/clip × N clips (60s ≈ 8 clips → ~$2.00; 90s ≈ 12 clips → ~$3.00). RU/UA/non-EN langs need `--audio-mode silent` and ElevenLabs VO at compose time. | ~$2.00 |
| Optional B-roll | 1-2 × `kling-v3.0-pro` × 5s @ $0.14/s | $0.70 - $1.40 |
| VO | 1 ElevenLabs call per language (subscription) | $0 |
| Captions | 1 × whisper-1 per language | ~$0.001 |
| Music (optional) | 1 ElevenLabs Music call (subscription) | $0 |
| Render | local | $0 |
| **Total (single language, no B-roll, 60s)** | | **~$2.15** |
| **Total (single language, 2 cutaways, 60s)** | | **~$3.55** |
| **Total (10 languages, no B-roll, 60s each)** | | **~$20.15** (one keyframe amortized + 10 × $2.00) |

Multilingual scaling is the killer-app cost story — even at veo-3.1-fast pricing, 10 markets ≈ $20 is 100-1000× cheaper than human dubbing studios. Drop to `veo-3.1-lite` ($0.15/clip) for high-volume batches where lip-sync quality can step down.

## Read also

- `hooks.md` — 12 AI-avatar opens with lip-sync emphasis notes per hook.
- `prompt-cookbook.md` — avatar prompt design, model picks (veo-3.1-fast default / veo-3.1 premium / veo-3.1-lite budget), voice settings, multilingual export recipe, mistakes, 4 worked examples.
- `workspace/personas/ARCHETYPES.md` — 8 baseline archetypes (when present).
- `MODELS.md` — current pricing and model IDs (Claude's training is stale; always check).
