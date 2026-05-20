# Composition — `pov-first-person`

How a `pov-first-person` project is laid out at render time. Read this when the editor agent assembles the Remotion composition from generated assets.

## Aspect / frame

- **Aspect:** 9:16 (TikTok / Reels / Shorts).
- **Resolution:** 1080×1920.
- **FPS:** 30.

## Scene track structure

A canonical 15-second POV looks like:

| Scene | Duration | Visual | VO | Captions |
|---|---|---|---|---|
| `scene-01` (hook) | 0.0–1.5s | full-bleed POV shot, low-mounted chest cam | `"POV: you just …"` | yes (large, centered) |
| `scene-02` (body) | 1.5–4.5s | continuing POV, environment scrolls past | story setup | yes |
| `scene-03` (body) | 4.5–9.0s | POV with hands entering frame (interaction beat) | revelation / payoff | yes |
| `scene-04` (body) | 9.0–13.0s | wider POV reveal | denouement | yes |
| `scene-05` (cta) | 13.0–15.0s | static POV with overlay text | CTA line | yes (CTA-styled) |

## Layer stack (top → bottom)

1. **Caption overlay** — `KaraokeCaptions` from `src/lib/components/captions/` (animated word-by-word).
2. **Hook headline** (scene-01 only) — Inter Black 96-128px, top-of-frame, 0-1s hold + 6-frame fade.
3. **Video plane** — generated i2v clips via Kling-v3-pro (selfie / POV variants).
4. **Music bed** — `lofi-narrative` mode from `docs/prompts/music/lofi-narrative.md`, ducked to −24 LUFS under VO.

## Reference render

A 1080p reference render of this template lives in the companion repo at `ralphy-assets`:

```bash
ralphy assets pull-pool examples/pov-first-person/reference.mp4
```

(See `docs/assets-catalog.md` for the live manifest. The reference render is regenerated whenever the template's `composition.md` changes meaningfully.)

## Notes

- The hook MUST be a true first-person beat — no third-person establishing shot. The "POV:" frame label loses power if the visual doesn't match.
- B-roll inserts break the immersion — keep it strictly POV the whole clip.
