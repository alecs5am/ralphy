# Cinematic Film-Style — vibe reference

**Genre:** dramatic cinema short — 2s hook → establish → action → climax → resolve.
**Length:** 8-15s (4s compact and 10s premium variants supported).
**Format:** 16:9 widescreen primary (1920x1080, 30fps); 9:16 vertical safe-zone variant for Reels/TikTok/Shorts.

> **Generic style.** This is a prompt cookbook, not a brand template. Pick a hook + lighting + camera move + grade combination, then write the rest from the user's brief. No reference required for the cinematic look itself — but if the brief names a real person or branded product, AGENTS.md hard rule #3 still applies for that entity.

## Why this works

The film-look short is the highest-density format on the feed. In 8-15 seconds it has to do what a feature film opens in 2 minutes:

1. **2-second hook is non-negotiable.** Mobile retention falls off a cliff at 2s. Black-to-light, silence-to-sound, or extreme-macro-to-wide are the three highest-converting opens.
2. **Deliberate camera language reads as production value.** A named move (dolly forward at 2 ft/s, 270° orbit, rack focus across two planes) immediately separates the clip from default i2v drift.
3. **Motivated lighting carries the mood without dialogue.** Chiaroscuro reads as danger. Golden hour reads as nostalgia. Volumetric reads as awe. The viewer doesn't need to be told.
4. **Synced sound design doubles every visual beat.** Silence before impact, music drop on a cut, reverb tail matching the room — these are free production value if you specify them.
5. **Color grade is the final 20%.** Teal-orange, bleach-bypass, or desaturated-with-accent each carry their own emotional vocabulary. A flat grade kills a perfectly composed shot.

## Vibe anchors

- **Hook in the first 2 seconds.** Every prompt opens with one of the 12 named hook techniques (see `hooks.md`). No exceptions.
- **One named camera move per shot.** "Camera dolly forward 3 feet at 2 ft/s" beats "camera moves forward" by an order of magnitude.
- **One motivated light source per shot.** The light has to come from somewhere visible or implied — window, lamp, fire, sun, neon. No flat ambient.
- **Cut on the downbeat.** If music is present, cuts land on percussive hits. Silence-to-sound transitions land on the visual reveal.
- **Letterbox if you can.** 2.39:1 crop bars or implicit 16:9 in a 9:16 frame both signal cinema instantly.

## Variation axes

| Axis | Options |
|---|---|
| Mood | noir / epic / intimate / dystopian / nostalgic / awe-struck |
| Palette | teal-orange / desaturated-with-accent / golden-warm / cool-blue / bleach-bypass / monochrome |
| Lighting | chiaroscuro / three-point / silhouette / golden-hour / volumetric / practical-neon / firelight / soft-overcast |
| Camera move | push-in / pull-back / crane / 270-orbit / whip-pan / handheld / lock-off / rack-focus / parallax |
| Hook technique | black-to-burst / extreme-macro / reverse-motion / silent-then-explosive / eyes-open / dutch-angle / scale-impossibility |
| Duration | 4s compact / 8s standard / 10s premium / 15s full arc |

Pick one option from each row. Most clips combine 2-3 hook techniques in the opening 2s ("black screen + sudden light burst + extreme close-up reveal" is a classic triple-stack).

## Narrative arc (15-second template)

```
0-2s     → Hook. Black-to-burst, extreme macro, silence-to-impact, eyes-snap-open. Sensory shock.
2-4.5s   → Establish. Wide shot, camera at 24-35mm equivalent, slow 2 ft/s dolly. Set location, lighting,
            time of day. Music intro layer enters at -4dB.
4.5-7s   → Introduce subject. Medium shot at 50mm. Dolly forward 2-3 feet at 2.5 ft/s.
            Depth of field f/2.8. Foley enters synced to subject motion.
7-10s    → Rising action. Camera accelerates to 3.5-4 ft/s. Music gains percussion. Tension stacks.
10-12.5s → Climax. Maximum intensity — fast move (5+ ft/s) OR locked-off freeze. Music peak. Light hits face.
12.5-15s → Resolution. Decelerate to 1-2 ft/s. Music tail. Final image holds 1.5s before cut/fade.
```

For 8-second clips: cut 2-4.5s establishing block down to 1.5s, drop the rising-action block, keep the rest.
For 4-second compact: hook → single sustained action → climax punctuation. No establish, no resolve.

## Required user inputs

1. **Subject** — what or who is in the frame. ("A detective", "a desert valley", "two hands across a table".) No reference required for generic subjects.
2. **Mood** — one of the 6 options above. Default: epic.
3. **(Optional) Length** — 4 / 8 / 10 / 15s. Default: 10s.
4. **(Optional) Hook technique** — pick from `hooks.md` or let the art-director choose.
5. **(Optional) Reference image** — one movie still pinning palette + lighting. Helpful, not required.
6. **(Optional) VO line** — sparse, one sentence at the climax, any language.

## When NOT to use

- **Product UGC ad.** Use `before-after-product` — cinema language reads as "luxury TV commercial" and tanks UGC conversion.
- **Talking-head rants / reactions.** Use `talking-head-rant` — cinematic framing on a face-cam kills the format.
- **Comedy / meme content.** The film-look telegraphs sincerity; comedy needs flat lighting and handheld looseness.
- **Pure documentary realism.** Specify "documentary handheld with locked grade" instead, or use a different template.
- **Length > 25s.** The 2-second hook discipline assumes scroll-feed. Longer pieces need a different scaffold.
- **Vertical-only platforms with high motion budget.** TikTok caps at 9:16; cinema language partially survives but lose the letterbox.

## Cost ballpark (10s clip, 2 shots)

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 3-4 x `gemini-3-pro-image-preview` @ $0.04-0.15 | ~$0.30 |
| Video clips | 2 x `kling-v3.0-pro` x 5s @ $0.14/s | ~$1.40 |
| VO (optional) | 1 ElevenLabs call (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Render | local | $0 |
| **Total** | | **~$1.70** |

Premium variant with `veo-3.1` instead of kling: ~$3-5. With `sora-2-pro` for one sustained 10s shot: ~$5-8.

## Read also

- `hooks.md` — the 12 named 2-second hook techniques with copy-paste phrasing.
- `prompt-cookbook.md` — master prompt scaffold, camera vocabulary, lighting setups, common mistakes, ready-to-run example prompts.
