# AI Vegetables POV — vibe reference

**Genre:** surrealist POV short — an anthropomorphic vegetable performs a mundane human action.
**Length:** 12-18s (default 15).
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.

> This template is a **vibe anchor**, not a fill-in-the-blank. `/ralph-scenarist` writes a fresh scenario for every project using this file + `reference-example.md` as vibe sources.

## Why this format works

A viral pattern that peaked in 2025-2026 and has stayed evergreen: anthropomorphic vegetables doing what people do. It works because:

1. **Visual shock in the first 2 seconds.** The brain doesn't expect to see a cucumber running for the bus. That mismatch grabs attention before the algorithm has time to scroll past.
2. **Universally legible setup.** Everyone has been on a subway, in a queue, at the gym, late for something. No cultural translation needed.
3. **POV trigger.** "POV: you're a cucumber and you missed your bus" lets the viewer project themselves onto the vegetable. Identification + absurdity = share.
4. **Short-form sweet spot.** The format doesn't stretch; 15s closes the gestalt cleanly. Don't push past 18s — the joke decays.

## Vibe anchors

- **Photorealistic vegetable, not cartoon.** Real cucumber skin texture, glossy highlights, believable shading. No Pixar stylization. The realism is what makes the absurdity land.
- **Slight anthropomorphic proportions.** Limbs sprout organically from the body (think a Mr. Bean-as-vegetable mental model). No cartoon attachments, no googly eyes. Tiny dot eyes if you need any face at all — most scenes don't.
- **Real-world setting.** Actual locations (subway, kitchen, office, sidewalk), not fantasy worlds. The mundane environment carries the joke.
- **Deadpan tone.** No "isn't this funny?" energy in the VO. The situation is funny on its own; let the visual do the work.

## Variation axes (what changes between videos)

| Axis | Options |
|---|---|
| Vegetable | cucumber, tomato, carrot, potato, eggplant, pepper, onion, broccoli |
| Setting | subway, kitchen, office, gym, dating spot, traffic jam, queue, hospital |
| Human action | running for transport, working, dating, exercising, going to the doctor, waiting in line |
| Emotional tone | deadpan, frustrated, ecstatic, melancholic, panicked |
| VO language | default English; Russian deadpan also works very strongly for this format |

## Narrative arc (shape, not prescription)

```
0-2s    → Hook. Visual shock cold open. Vegetable in an unexpected situation.
2-7s    → Setup. What's happening, what the vegetable is feeling (POV).
7-13s   → Escalation. The situation develops or worsens.
13-15s  → Punchline / outro. Comedic finish or a "POV: you're a <vegetable>" closer.
```

## Required user inputs (minimum to launch)

1. **Vegetable** — which one. (If the user doesn't specify: pick from cucumber, tomato, or carrot at random.)
2. **Brief** — the situation in 1-2 lines. Example: "the cucumber missed his bus."
3. **Tone** — deadpan / dramatic / panicky. (Default: deadpan.)
4. **VO language** — optional; default English. The POV format is language-agnostic visually.

Everything else derives from these inputs through `/ralph-scenarist`.

## When NOT to use

- Brand promo with required logo placement — a vegetable can't carry a logo naturally.
- Serious narrative format > 20s — the joke overstays its welcome.
- Educational / how-to content — this format is built for comedy, not instruction.
- A scene that requires dialogue between two characters — one vegetable is enough.

## Cost ballpark per video

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 3-4 × `gemini-3-pro-image-preview` @ $0.15 | $0.45 - $0.60 |
| Video clips | 3-4 × `kling-v3.0-pro` × 5s @ $0.14/s | ~$2.80 |
| Voiceover | 3-4 ElevenLabs calls (subscription) | $0 |
| Music | 1 × ElevenLabs Music (subscription) | $0 |
| Captions | whisper-1 on 15s audio | ~$0.001 |
| Render | local | $0 |
| **Total** | | **~$3-4** |

Cheaper than `soviet-nostalgic` (~$10-14) because the clips are shorter, there's no dual-music split, and no archival post-processing.

## Read also

- `fragments.md` — reusable prompt seeds for vegetables and settings.
- `model-stack.md` — order of operations and what to avoid.
- `composition.md` — Remotion skeleton.
- `reference-example.md` — placeholder; fills in after the first real run.
