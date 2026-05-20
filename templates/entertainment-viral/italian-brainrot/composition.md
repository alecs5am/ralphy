# Composition — `italian-brainrot`

Single-character AI-meme with Italian-gibberish VO. 33-character canonical pool (see `characters.md`).

## Aspect / frame

- **Aspect:** 9:16.
- **Resolution:** 1080×1920.
- **FPS:** 30.

## Scene track structure

Canonical 8–15s brainrot cut:

| Scene | Duration | Visual | VO | Captions |
|---|---|---|---|---|
| `scene-01` (hook) | 0–2s | full-bleed character shot, exaggerated pose | character name (Italian gibberish) | yes (large character-name overlay) |
| `scene-02` (body) | 2–10s | character does the signature action | Italian-gibberish narration | yes (animated word-by-word) |
| `scene-03` (cta) | 10–12s | character holds a pose, screen-shake | tagline (e.g. "Tralalero Tralala") | yes (CTA-styled) |

## Layer stack (top → bottom)

1. **Caption overlay** — `KaraokeCaptions` (matches the gibberish rhythm).
2. **Character name overlay** (scene-01) — bold serif (Cormorant or similar), top of frame, holds 0–1s.
3. **Video plane** — Kling-v3-pro i2v from a single character keyframe.
4. **Music bed** — `hyper-pop` mode OR a brainrot-specific trend track from `ralphy-assets/italian-brainrot-music/`.

## Reference render

A reference render lives in the companion repo:

```bash
ralphy assets pull-pool examples/italian-brainrot/reference.mp4
```

## Character pool

The 33 canonical characters (Tralalero Tralala, Tung Sahur, Ballerina Cappuccina, …) live in the asset pool at `ralphy-assets/italian-brainrot-characters/`. Always pull the existing keyframe via:

```bash
ralphy assets pull-pool italian-brainrot-characters/<slug> --install <project>
```

Generating a brainrot character from text alone drifts within 2-3 frames; the curated keyframes lock identity.

## Notes

- The gibberish VO is part of the format — translating it into English defeats the meme.
- The full-bleed pose at scene-01 must be the character's signature posture; otherwise viewers can't pattern-match the character within the 1.5s pattern-match window.
