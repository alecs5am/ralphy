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
7. **Source-clip duration overshoot.** `ffprobe` every video asset slot. `kwaivgi/kling-v3.0-pro` and `bytedance/seedance-2.0` BOTH return clips ~1s longer than the requested `--duration` (see [Source-clip duration overshoot](#source-clip-duration-overshoot-kling--seedance) below). If raw total > planned total by ≥(N × 1s) for N video clips, you have an unbudgeted trim debt — surface it before composing, not after.

Output: a compact chat checklist (`OK` / `MISSING <reason>` per scene).

## Source-clip duration overshoot (kling + seedance)

**The fact.** Both `kwaivgi/kling-v3.0-pro` and `bytedance/seedance-2.0` return clips ~1 second longer than the `--duration` you requested. This is silent: OpenRouter accepts the duration, bills against it, and hands back a longer file. The editor playbook used to assume art-director clips total the planned duration — they don't.

**Concrete numbers (tokyo-y2k-001 postmortem, workflow-fixes #3):**

| Storyboard `--duration` | Actual mp4 on disk |
|---|---|
| 5 s | 6.04 s |
| 4 s | 5.04 s |
| 9 s | 10.04 s |
| **Total: 18 s planned** | **Total: 21.12 s raw → 3.12 s of unbudgeted overshoot** |

Across the full tokyo-y2k-001 cut, planned 75s of clips landed as 90.7s of raw mp4 against a 75s music bed — an entire third clip's worth of trim debt the editor stage absorbed unplanned at turn 3.

**Why it matters.** Predictable surprise costs an extra trim iteration on every multi-clip project. Knowing the overshoot up front lets you choose one of two strategies before composing:

1. **(a) Pre-shorten at art-director stage.** Request `--duration` 1s shorter than the storyboard target on every kling / seedance call. Storyboard says 5s? Pass `--duration 4` to `ralphy generate video`. The returned clip will land at ~5.04s — i.e., the storyboard target. Net win: zero trim debt, zero extra cost (per-clip flat billing means a shorter `--duration` doesn't save money on these two models — see MODELS.md §"Pricing reality check"). Cleanest path when the storyboard is locked.
2. **(b) Budget a per-clip vision-trim pass.** Accept the overshoot, then run a vision pass to find the cleanest `trim_in_s` / `trim_out_s` per clip (drop dead-time, low-motion tails, identity drift in the last 0.5s, etc.) and trim with `ralphy video extract-segment`. Slower but it lets the model breathe — sometimes the "extra" 1s contains the best gesture beat, and a smart trim keeps it.

**The structural solution: `ralphy editor trim-analyze`.** Issue [034](../../../notes/issues/034-no-editor-preflight-and-trim-analyze.md) tracks the verb. When it lands, it will batch a `gemini analyze-video` pass over every clip and write `assets/analysis/summary.json` with `{slot, dead_time_s, hot_moments[], suggested_trim_in_s, suggested_trim_out_s}` per clip — i.e., it automates strategy (b). Until the verb exists, pick (a) by default and only fall back to (b) when the storyboard explicitly wants the trim discretion (e.g., gesture-heavy UGC where the model's exact gesture timing matters more than the storyboard's nominal duration).

**Cross-link.** The model-level fact is also in MODELS.md (rows for `kwaivgi/kling-v3.0-pro` and `bytedance/seedance-2.0`); this section is the playbook recipe.

## Per-clip captions variant

If scenes have separate VO files — transcribe each one separately. `ralphy generate captions` writes to `<project>/assets/captions/<slot>.json` by default — no manual `cp` needed. The composition wires them per-scene with a caption block.

## Post-render evaluator handback (always)

After `ralphy render <project>` finishes:

1. Run `ralphy editor preflight <project>` once more (verify post-render artifacts).
2. Run `ralphy project verify <project>` for manifest/disk sanity.
3. **Hand off to `/ralphy-evaluator` before declaring done.** The evaluator runs scene segmentation, audio loudness + dead-air check, caption density, and per-scene visual analysis — produces `eval.json` + `eval-report.md` sized for a downstream fixer agent. Skipping this gate is the highest-frequency "shipped a render that turned out to have issues" failure pattern across the 10 postmortems. See `.agents/skills/ralphy-evaluator/SKILL.md` for the full trigger list.
4. Only after the eval lands, ask the user "ready to ship?" — user's "yes" is the only thing that authorizes commit / push / share. Never auto-commit a rendered project (CLAUDE.md "Executing actions with care").
