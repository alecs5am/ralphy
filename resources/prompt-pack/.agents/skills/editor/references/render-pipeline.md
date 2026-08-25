# Render pipeline

## Author-composition

**When:** asset-manifest is complete, composition is missing or needs edits.

### Decide composition target

Every project ships `.ralphy/workspaces/<ws>/projects/<id>/index.html` — a HyperFrames composition with `data-*` timing attributes and a paused GSAP timeline. See [`hyperframes.md`](../../hyperframes/references/playbook.md) for the authoring rules.

### Wire assets

Reference media from `<project>/artifacts/` directly via relative paths in the HTML composition (`<img src="artifacts/images/scene-01.png">`, `<video src="artifacts/videos/scene-02.mp4" data-start="0" data-volume="0">`, `<audio src="artifacts/voiceover/vo.mp3" data-start="0">`).

### Implement transitions / captions

- Inter-scene transitions via registry blocks — `bunx hyperframes add <transition-slug> .ralphy/workspaces/<ws>/projects/<id>`.
- Captions from `captions.json` via a caption-style block from the registry (`bunx hyperframes add kinetic-slam` etc.) or hand-rolled GSAP keyframes.
- Dual audio (VO + music) — `<audio>` elements with `data-volume`, and an optional sidechain ducking pass post-render (see [`audio-mixing.md`](./audio-mixing.md)).

## Preview

**We don't auto-launch preview.** If the user wants one:

> "Run `bunx hyperframes preview .ralphy/workspaces/<ws>/projects/<id>` foreground in a separate terminal."

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

**The structural solution: `ralphy editor trim-analyze`.** Issue [034](../../../../notes/issues/done/034-no-editor-preflight-and-trim-analyze.md) tracks the verb. When it lands, it will batch a `gemini analyze-video` pass over every clip and write `artifacts/analysis/summary.json` with `{slot, dead_time_s, hot_moments[], suggested_trim_in_s, suggested_trim_out_s}` per clip — i.e., it automates strategy (b). Until the verb exists, pick (a) by default and only fall back to (b) when the storyboard explicitly wants the trim discretion (e.g., gesture-heavy UGC where the model's exact gesture timing matters more than the storyboard's nominal duration).

**Cross-link.** The model-level fact is also in MODELS.md (rows for `kwaivgi/kling-v3.0-pro` and `bytedance/seedance-2.0`); this section is the playbook recipe.

## Legacy: Remotion `STATIC_ROOT` recipe (archived, for postmortem cross-reference)

> **Status — not the current engine.** The active render path is HyperFrames (commit `92ef823` removed the Remotion path). This section documents the `STATIC_ROOT` / `composition-props.json` convention that the *removed* Remotion code expected, so that postmortems referencing the failure mode (tokyo-y2k-001, analog-horror-fridge-001, glitter-cream-001) remain readable and so that anyone resurrecting a Remotion branch doesn't repeat the first-render 404 that burned ~30 min × 3 projects. **For new work, ignore this section — author `index.html` per [`hyperframes.md`](../../hyperframes/references/playbook.md) instead.**
>
> If you only care about HyperFrames, skip to [Per-clip captions variant](#per-clip-captions-variant).

### The convention (correct / new)

`ralphy render <id>` (under the Remotion path) materialized a symlink at `public/project-<id>` → `<project>/assets/`. Therefore every Remotion composition under `src/videos/<id>/index.tsx` had to use:

```ts
const STATIC_ROOT = "project-<id>";   // ← note the "project-" prefix
// asset paths DO NOT include "assets/" — the symlink already points at it
src={staticFile(`${STATIC_ROOT}/videos/${scene.videoFile}`)}
src={staticFile(`${STATIC_ROOT}/music/${MUSIC_FILE}`)}
src={staticFile(`${STATIC_ROOT}/images/${img}`)}
```

Verbatim from the corrected `src/videos/tokyo-y2k-001/index.tsx` (post-fix, pre-Remotion-removal — see `git show 92ef823^:src/videos/tokyo-y2k-001/index.tsx`):

```tsx
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { SCENES, MUSIC_FILE, FPS, DURATION_SEC, TOTAL_FRAMES } from "./scenes";

const STATIC_ROOT = "project-tokyo-y2k-001";

const VideoTrack: React.FC = () => (
  <>
    {SCENES.map((scene) => (
      <Sequence
        key={scene.id}
        from={scene.from}
        durationInFrames={scene.durationInFrames}
        name={`scene-${scene.id} — ${scene.label}`}
      >
        <OffthreadVideo
          src={staticFile(`${STATIC_ROOT}/videos/${scene.videoFile}`)}
          startFrom={Math.round(scene.startFromSec * FPS)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      </Sequence>
    ))}
  </>
);
```

### The anti-pattern (legacy / wrong)

Older `src/videos/*/index.tsx` files — `playdate-pixel-001`, `fruit-drama-*`, etc. — used a **bare-id** `STATIC_ROOT` with an extra `assets/` segment in the path:

```tsx
// WRONG — only worked because a hand-rolled public/<id> symlink existed
const STATIC_ROOT = "playdate-pixel-001";          // ← missing "project-" prefix
src={staticFile(`${STATIC_ROOT}/assets/videos/${scene.videoFile}`)}   // ← spurious "assets/"
```

This pattern only happened to render on legacy projects where someone had manually created a `public/<id>` → `<project>/` symlink long ago. For any *new* project under the Remotion path, the bare-id pattern produced 404s on every asset slot. `tokyo-y2k-001` hit exactly this — it copied `STATIC_ROOT = "tokyo-y2k-001"` from `playdate-pixel-001/index.tsx` and the first render 404'd every clip with `http://localhost:3002/public/tokyo-y2k-001/assets/videos/scene-00-video-shot.mp4`. Cross-ref: `.ralphy/workspaces/<ws>/projects/tokyo-y2k-001/postmortem/03-cli-issues.md` (#2) and `05-workflow-fixes.md` (#1).

**The contradictory state was never fixed at the code level** — the Remotion path was removed wholesale in `92ef823` before the legacy compositions could be migrated. If you ever resurrect Remotion, migrate every `src/videos/*/index.tsx` to the `project-<id>` convention in the same PR; **don't ship both conventions side-by-side**.

### `composition-props.json` is required, even when empty

Under the Remotion path, `ralphy render <id>` read `.ralphy/workspaces/<ws>/projects/<id>/composition-props.json` to forward props to the Remotion bundle. The guard fired even for prop-less compositions — `analog-horror-fridge-001` and `glitter-cream-001` both hit `composition-props.json not found …` on first render despite their `React.FC` having zero props.

Workaround for any project under the legacy path: stub a one-line file by hand,

```bash
echo '{"compositionId":"<CompositionName>"}' > .ralphy/workspaces/<ws>/projects/<id>/composition-props.json
```

— and re-run `ralphy render <id>`. The stub is a no-op; the file just has to exist.

Auto-generation from `src/Root.tsx` registration and a `--composition <id>` flag that skips the read entirely were on the wishlist (see `notes/issues/009-*` and `notes/issues/020-*`) but were never implemented — the Remotion removal in `92ef823` made the verb-level fix moot. **This is a docs-only entry**; no CLI change ships with it.

## Per-clip captions variant

If scenes have separate VO files — transcribe each one separately. `ralphy generate captions` writes to `<project>/artifacts/captions/<slot>.json` by default — no manual `cp` needed. The composition wires them per-scene with a caption block.

## Post-render evaluator handback (always)

After `ralphy render <project>` finishes:

1. Run `ralphy editor preflight <project>` once more (verify post-render artifacts).
2. Run `ralphy project verify <project>` for manifest/disk sanity.
3. **Hand off to `/evaluator` before declaring done.** Run `ralphy eval video <render>` with NO `--mode` — it defaults to the **native-video** final gate (full mp4 → gemini-3.1-pro-preview for temporal continuity, audio-picture alignment, pacing, caption sync, format fit), and upgrades to **deep-style** when the project carries a `STYLE_LOCK.md` / `BRIEF.md`. **Do not gate ship-readiness on a keyframe/structure pass (#411)** — keyframe slicing is a cheap mid-iteration diagnostic that misses exactly the temporal/audio/caption failures the postmortems shipped; its report carries `gate.shipReady: false` by construction. Skipping the native gate is the highest-frequency "shipped a render that turned out to have issues" failure pattern across the postmortems. See `.agents/skills/evaluator/SKILL.md` for the full trigger list.
4. Only after the eval lands AND `report.gate.shipReady` is true (a passing native-video / deep-style gate), ask the user "ready to ship?" — user's "yes" is the only thing that authorizes commit / push / share / forming a Unit. Never auto-commit a rendered project (CLAUDE.md "Executing actions with care").
