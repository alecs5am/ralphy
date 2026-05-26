# Render pipeline

## Author-composition

**When:** asset-manifest is complete, composition is missing or needs edits.

### Decide composition target

Every project ships `workspace/projects/<id>/index.html` — a HyperFrames composition with `data-*` timing attributes and a paused GSAP timeline. See [`hyperframes.md`](../hyperframes.md) for the authoring rules.

### Wire assets

Reference assets from `workspace/projects/<id>/assets/` directly via relative paths in the HTML composition (`<img src="assets/scene-01.png">`, `<video src="assets/scene-02.mp4" data-start="0" data-volume="0">`, `<audio src="assets/vo.mp3" data-start="0">`).

### Implement transitions / captions

- Inter-scene transitions via registry blocks — `bunx hyperframes add <transition-slug> workspace/projects/<id>`.
- Captions from `captions.json` via a caption-style block from the registry (`bunx hyperframes add kinetic-slam` etc.) or hand-rolled GSAP keyframes.
- Dual audio (VO + music) — `<audio>` elements with `data-volume`, and an optional sidechain ducking pass post-render (see [`audio-mixing.md`](audio-mixing.md)).

## Preview

**We don't auto-launch preview.** If the user wants one:

> "Run `bunx hyperframes preview workspace/projects/<id>` foreground in a separate terminal."

## Final-render

**Always:**
1. Run `preflight` (see below). Don't skip.
2. Rendering — **via `ralphy render <id>`**, not direct invocation:
   ```bash
   ralphy render <id>
   # or in dev:
   bun run ralph -- render <id>
   ```
3. Chat: render path + duration + file size.

`ralphy render` encapsulates the HyperFrames render + log generation event with `provider: "local"`, `kind: "render"`, `cost_usd: 0`.

## Preflight checklist

Before rendering:

1. Every asset slot in `scenario.json` has a match in `asset-manifest.json` and the file exists.
2. VO durations match (or ±0.2s) the scenes' `durationHintSec`. Drift → handback to scenarist.
3. `captions.json` (Caption[]) exists for every VO track.
4. Music bed duration ≥ total composition duration, or there's a loop rule.
5. `index.html` resolves every asset reference and the GSAP timeline is registered on `window.__timelines`.
6. **Quality gate:** every slot has `score >= 7` in the manifest (or explicit bypass-consent).

Output: a compact chat checklist (`OK` / `MISSING <reason>` per scene).

## Per-clip captions variant

If scenes have separate VO files — transcribe each one separately. `ralphy generate captions` writes to `<project>/assets/captions/<slot>.json` by default — no manual `cp` needed. The composition wires them per-scene with a caption block.

## Post-render evaluator handback (always)

After `ralphy render <project>` finishes:

1. Run `ralphy editor preflight <project>` once more (verify post-render artifacts).
2. Run `ralphy project verify <project>` for manifest/disk sanity.
3. **Hand off to `/ralphy-evaluator` before declaring done.** The evaluator runs scene segmentation, audio loudness + dead-air check, caption density, and per-scene visual analysis — produces `eval.json` + `eval-report.md` sized for a downstream fixer agent. Skipping this gate is the highest-frequency "shipped a render that turned out to have issues" failure pattern across the 10 postmortems. See `.agents/skills/ralphy-evaluator/SKILL.md` for the full trigger list.
4. Only after the eval lands, ask the user "ready to ship?" — user's "yes" is the only thing that authorizes commit / push / share. Never auto-commit a rendered project (CLAUDE.md "Executing actions with care").
