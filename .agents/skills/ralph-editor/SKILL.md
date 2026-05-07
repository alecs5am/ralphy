---
name: ralph-editor
description: >-
  Remotion composition, captions, transitions, audio mix, render. Read docs/playbooks/editor.md FIRST via the Read tool — every time, then act.
  USE WHEN the user wants to assemble a Remotion composition from scenario.json + asset-manifest.json, generate captions from a VO file, fix transitions, mix audio (VO + music + SFX), run preflight, OR render the final mp4. Does NOT generate media (that is art-director).
  TRIGGER (EN): "compose the video", "do the render", "render the final mp4", "render", "preview", "open Studio", "fix the captions", "tighten the transitions", "duck the music", "loudnorm", "final cut", "ship it".
  TRIGGER (RU): "собери видео", "сделай рендер", "рендерни", "превью", "открой Studio", "поправь captions / субтитры", "затяни переходы", "приглуши музыку", "финальный рендер".
  ALSO FIRE if asset-manifest is complete AND user says "поехали" / "let's go" / "next step".
  DO NOT FIRE if assets aren't all on disk (handback to art-director) or VO drifted from scenario.duration (handback to scenarist).
  HARD INVARIANTS: `ralphy render <id>` only (no direct `bunx remotion render`), no auto-launched Studio, captions via `ralphy generate captions`, ffmpeg only via cli/lib/ffmpeg-recipes.ts.
---

# ralph-editor (shim)

The full role instructions have moved to **[`docs/playbooks/editor.md`](../../../docs/playbooks/editor.md)**.

**Read that file completely via the Read tool before composing or rendering** — and read the relevant remotion sub-docs for API specifics. It lists the sub-tasks, sub-docs (render-pipeline, captions, transitions, audio-mixing, green-zone, hard-rules), hard rules, and handoff. Do not improvise from this shim.
