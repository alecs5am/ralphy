# Render pipeline

## Author-composition

**When:** asset-manifest is complete, composition is missing or needs edits.

### Decide composition target

- **Base `UGCVideo`** — for scenarios that match the generic data-driven layout. Just write/update `composition-props.json`.
- **Per-project composition** — `src/videos/<project-slug>/index.tsx`. Build by composing primitives from `src/lib/components/` (captions, text, overlays, layouts). Register in `src/Root.tsx` under the `Videos` folder with a `<Folder>` wrapper.

### Build composition-props.json

Resolve every slot from the manifest into a `staticFile()` key. Asset symlink:

```bash
ln -sfn ../../workspace/projects/<id>/assets public/project-<id>
```

### Implement transitions / captions

- `TransitionSeries` with `<Sequence>` per scene.
- Captions from `captions.json` via one of the 12 ready-made components in `src/lib/components/captions/`.
- Dual audio (VO + music) with `volume` ducking via `interpolate`. See `rules/audio-mixing.md`.

### Remotion version

**All packages on `4.0.441`, identically.** Drift → render fails cryptically.

## Preview

**We don't auto-launch Studio.** If the user wants a preview:

> "Run `bun run dev` foreground in a separate terminal — Studio opens at http://localhost:3000. Composition: `Videos/<project-slug>` or `UGCVideo` with props from `composition-props.json`."

Check that the `public/project-<id>` → `assets` symlink is active.

## Final-render

**Always:**
1. Run `preflight` (see below). Don't skip.
2. Symlink active.
3. Rendering — **via `ralphy render <id>`**, not direct invocation:
   ```bash
   ralphy render <id>
   # or in dev:
   bun run ralph -- render <id>
   ```
4. Cleanup the symlink after the render:
   ```bash
   rm public/project-<id>
   ```
5. Chat: render path + duration + file size.

`ralphy render` encapsulates `bunx remotion render` + symlink lifecycle + log generation event with `provider: "local"`, `kind: "render"`, `cost_usd: 0`.

## Preflight checklist

Before rendering:

1. Every asset slot in `scenario.json` has a match in `asset-manifest.json` and the file exists.
2. VO durations match (or ±0.2s) the scenes' `durationHintSec`. Drift → handback to scenarist.
3. `captions.json` (Caption[]) exists for every VO track.
4. Music bed duration ≥ total composition duration, or there's a loop rule.
5. `composition-props.json` resolves every `staticFile()` key.
6. **Quality gate:** every slot has `score >= 7` in the manifest (or explicit bypass-consent).

Output: a compact chat checklist (`OK` / `MISSING <reason>` per scene).

## Per-clip captions variant

If scenes have separate VO files — transcribe each one separately (`captions-01.json`, `captions-02.json`, ...) and concat them in the composition. See `src/videos/lyadov-podcast/` for a working pattern.
