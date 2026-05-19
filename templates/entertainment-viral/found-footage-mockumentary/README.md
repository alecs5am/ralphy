# found-footage-mockumentary

First-person handheld occult / cryptid mockumentary in the voidstomper / analog-horror lineage. 5-7 i2v clips over 30-45s, 9:16, English diegetic captions only (no VO), REC-dot + timecode HUD overlay, Hi8 register with a diegetic style-break to clean cinema for the Act-2 monster reveal.

## Vibe in one sentence

POV operator stumbles on a hooded cult, takes a photo, the cultists are now facing the camera without having moved, operator panics and retreats, something with too many feet follows, camera falls, the truth is revealed in clean cinema register, `SIGNAL LOST`.

## Files in this template

| File | Purpose |
|---|---|
| `TEMPLATE.md` | Top-level orientation — vibe, beat structure, slot table, anti-patterns. Start here. |
| `prompt-cookbook.md` | Per-stage prompts (image masters, per-clip first-frames, i2v clips, SFX, captions/HUD) with `{{slots}}`. The reproduction artifact. |
| `model-stack.md` | Image / video / SFX picks with cost ballpark and per-stage notes. seedance-2.0 IS THE DEFAULT — read this before kicking off video gens. |
| `hooks.md` | 6 cold-open patterns for the 0-2s window (camera-on flash, hand-wave, REC-dot blink-on, focus-pull, timecode glitch, mid-sentence caption). |
| `examples.md` | 2 worked variants showing different creature × environment × persona combos. |
| `template.json` | Machine-readable metadata for `ralphy template list / show / suggest / use`. |
| `assets/monster-*.png` | Sample creature reference PNGs from the source project. **Replace with your own creature refs before using** — the reference-required gate fires for the `{{subject_creature}}`. |

## Required inputs

| Slot | What it is |
|---|---|
| `{{target_language}}` | Language for the 3 diegetic captions and end card. No VO. |
| `{{subject_creature}}` | The Act-2 monster. **Reference-required** — user MUST supply 2-3 anatomy PNGs. |
| `{{cult_location_descriptor}}` | Where the discovery + reveal happen. Drives every master shot's environment block. |
| `{{handheld_persona}}` | The unseen operator's apparent identity. Drives the gloved-hand frame and on-screen camera device. |

## Cost ballpark

~$5-$10 per clean pass:

- 8-10 image gens × $0.15 = ~$1.20-$1.50
- 6 video clips × $0.70 (seedance-2.0 @ 5s) = ~$4.20
- 5 SFX tracks via ElevenLabs (free tier or low cost)
- Local Remotion render (free)

The source project (`occult-mockumentary-001`) actually burned ~$27.42 because it iterated through 6 render versions and tried kling before settling on seedance. A clean pass starting with seedance from clip 1 avoids that. See `model-stack.md` for the breakdown.

## Postmortem absent

This template was extracted from a finished render without a `/postmortem` pass against the source project. The `TEMPLATE.md` therefore lacks "Key rules" + "Workflow" sections that would normally come from `postmortem/02-lessons.md` and `postmortem/05-workflow-fixes.md`. The prompt-cookbook + model-stack + anti-patterns are structurally complete — the lived-experience section needs the next finished project to start filling in.

## How to use

```bash
ralphy template use found-footage-mockumentary \
  --project <new-id> \
  --brief "found-footage occult discovery in <your location>, <your creature>, English captions"
```

Then follow the prompt-cookbook top-to-bottom, fill the four slots, and run the pipeline. Replace the sample `assets/monster-*.png` references with your own creature anatomy PNGs before the creature-master image gen.

## See also

- [`docs/playbooks/art-director.md`](../../../docs/playbooks/art-director.md) — the generic asset-generation playbook
- [`docs/playbooks/editor.md`](../../../docs/playbooks/editor.md) — Remotion composition + caption / overlay specifics
- [`MODELS.md`](../../../MODELS.md) — current model catalog (Claude training is stale; check before every gen)
