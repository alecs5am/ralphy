# Composition — `grwm`

Get-Ready-With-Me composition. Dual-layer (action + storytime VO) — visual is the routine, audio is the story.

## Aspect / frame

- **Aspect:** 9:16.
- **Resolution:** 1080×1920.
- **FPS:** 30.

## Scene track structure

Canonical 45–60s GRWM:

| Scene | Duration | Visual | VO | Captions |
|---|---|---|---|---|
| `scene-01` (hook) | 0–2s | quick teaser frame (close-up of one product / one step) | hook line | yes |
| `scene-02` (body) | 2–15s | montage of routine step 1 — apply / use / prep | storytime opener | yes |
| `scene-03` (body) | 15–30s | montage of routine step 2 — middle of the story | mid-story rising beat | yes |
| `scene-04` (body) | 30–45s | montage of routine step 3 — payoff visual | story climax | yes |
| `scene-05` (cta) | 45–55s | final look + product callout | CTA + drop callout | yes |

## Layer stack (top → bottom)

1. **Caption overlay** — `HormoziCaptions` (block-2-words for storytime cadence).
2. **Product lower-third** (scenes with explicit product mention) — small bottom-right card, brand color.
3. **Video plane** — generated i2v clips (selfie talking-head + macro product B-roll).
4. **Music bed** — `lofi-narrative` mode, −22 LUFS under VO.

## Reference render

A reference render lives in the companion repo:

```bash
ralphy assets pull-pool examples/grwm/reference.mp4
```

## Notes

- The visual is supplemental — the storytime carries retention. If the VO drifts, the visual won't save it.
- Product placement is non-negotiable but should never interrupt the story flow. The reveal is the product, not a sponsored callout.
