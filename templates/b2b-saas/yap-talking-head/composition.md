# Composition — `yap-talking-head`

The Hormozi / Codie / Tornow YAP register. Single creator, single idea, single shot. 30–60s. No jump cuts.

## Aspect / frame

- **Aspect:** 9:16.
- **Resolution:** 1080×1920.
- **FPS:** 30.

## Scene track structure

YAP videos are typically ONE long take. The "scene" in scenario.json is a logical beat, not a video cut.

| Beat | Duration | Visual | VO | Captions |
|---|---|---|---|---|
| `scene-01` (hook) | 0–3s | medium close-up selfie, direct eye-contact | hook line (one crisp question or claim) | yes (large headline above the talking head) |
| `scene-02` (body) | 3–35s | same shot, energetic monologue | single-idea deep-dive | yes (animated word-by-word) |
| `scene-03` (cta) | 35–50s | same shot, lean-in or thumbs-up gesture | CTA / follow-up hook | yes |

## Layer stack (top → bottom)

1. **Caption overlay** — `KaraokeCaptions` (word-by-word fill, emoji every ~5s on emphasis words).
2. **Headline overlay** (scene-01) — Inter Black 96-128px, top of frame, holds 0–1s with a 6-frame fade-out.
3. **Video plane** — single Kling-v3-pro talking-head clip (no cuts), OR Veo-3.1 if budget allows for native lip-sync.
4. **Music bed** — `deadpan-bg` mode, very low (−24 to −26 LUFS), or no music at all (valid for the raw YAP register).

## Reference render

A reference render lives in the companion repo:

```bash
ralphy assets pull-pool examples/yap-talking-head/reference.mp4
```

## Notes

- **NO jump cuts.** The single-take energy IS the format — recutting breaks the deadpan register.
- The headline overlay frames the topic in 0–1s; if a viewer reads the headline and still scrolls, the format isn't a fit for that audience.
- VO pacing target ~2.5 words/sec. Slower reads as low-energy; faster reads as hype-hook (different mode entirely).
