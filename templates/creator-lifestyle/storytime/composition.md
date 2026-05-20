# Composition — `storytime`

The TikTok #1 retention pattern. Rising-tension narrative with pattern-interrupts that hold 60–180s of dwell.

## Aspect / frame

- **Aspect:** 9:16.
- **Resolution:** 1080×1920.
- **FPS:** 30.

## Scene track structure

Canonical 60s storytime:

| Scene | Duration | Visual | VO | Captions |
|---|---|---|---|---|
| `scene-01` (hook) | 0–3s | close-selfie, direct eye-contact, dramatic still | hook line + tension setup | yes (large headline) |
| `scene-02` (body) | 3–18s | selfie talking-head, slight zoom-in | rising-tension story beat 1 | yes |
| `scene-03` (body) | 18–35s | selfie or B-roll insert (pattern interrupt) | rising-tension story beat 2 | yes |
| `scene-04` (body) | 35–50s | selfie, "this is when it got worse" | climax beat | yes |
| `scene-05` (cta) | 50–60s | selfie, payoff + CTA | resolution + drop / link | yes |

## Layer stack (top → bottom)

1. **Caption overlay** — `HormoziCaptions` (block-2-words pacing matches the story rhythm).
2. **Hook headline** (scene-01) — Inter Black 96px, top of frame, holds 0–2s.
3. **Tension chyron** (scene-03 pattern-interrupt) — a one-word lower-third like "WAIT" or "BUT".
4. **Video plane** — Kling-v3-pro selfie talking-head + 1-2 B-roll inserts.
5. **Music bed** — `tension-build` mode for scenes 2-4, drops to silence for scene-05 reveal.

## Reference render

A reference render lives in the companion repo:

```bash
ralphy assets pull-pool examples/storytime/reference.mp4
```

## Notes

- Don't skip the pattern interrupt at scene-03 — that's where retention dips happen without one.
- The reveal in scene-05 MUST be specific. Vague closers leak the audience.
