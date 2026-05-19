# analog-horror-psa

Fake government-issued emergency behavioral PSA in analog-horror style. Cold robo-female ElevenLabs VO over flat yellow 1970s-civil-defense pictograms on pure black. IF / DO-NOT / BUT / AND beat scaffold. No music, only SFX. Climax in blurred SMPTE color-bars + signal-lost 1kHz tone. Source: `workspace/projects/analog-horror-fridge-001/` ("Compliance Bulletin 9-D — Your Dog Is Not Your Dog").

**Kind:** vibe-style (composition is project-specific — consumer hand-authors Remotion or copies `src/videos/analog-horror-fridge-001/index.tsx`).
**Category:** entertainment-viral.
**Length:** 25-35s (source: 30s).
**Format:** 9:16, 30fps, 1080×1920.
**Clips:** 8-12 scenes × ~3s each (source: 10).
**Music:** OFF by default.

## How to use

```bash
ralphy template use analog-horror-psa \
  --project <new-project-id> \
  --brief "<your brief — what's the un-trusted entity?>"
```

This scaffolds `workspace/projects/<new-project-id>/`, copies the locked-ref icons + style anchors from `assets/`, and writes `TEMPLATE_ORIGIN.md` so the next agent reads the template's `TEMPLATE.md` and `prompt-cookbook.md` first.

Then fill the slots per `TEMPLATE.md` Required Inputs and run the pipeline (see TEMPLATE.md Workflow section).

## Cost ballpark

~$1.50 if rules 1-7 in `TEMPLATE.md` are followed (most importantly: ONE prototype icon before batching the 9 siblings, and sequential bash loop instead of `ralphy queue`). Source project cost $4.45 — $2.80 of that was avoidable style-prototype iteration before the user pinned the right reference.

## Files

| File | What's in it |
|---|---|
| `TEMPLATE.md` | Vibe + Key rules + Workflow + Required Inputs + Anti-patterns + Beat structure. Read this first. |
| `prompt-cookbook.md` | Per-stage prompts (image / VO / SFX / captions) with `{{slots}}`. Includes STYLE_BASE and NEGATIVE_BASE fragments. |
| `model-stack.md` | Model picks per stage (image / VO / SFX / music / render). Cost ballpark. What we tried and dropped. |
| `hooks.md` | 0-3s cold-open patterns. 4 proven patterns + 1 anti-pattern + a checklist. |
| `examples.md` | 2 filled-in variants (source instance verbatim + a re-brief on "your child"). |
| `template.json` | Machine-readable metadata + slot definitions + beat scaffold + global overlays + caption style spec. |
| `assets/` | 10 locked-ref pictogram icons from the source render. Use scene-02 (the v10 winner dog silhouette) as the `--ref` to lock the yellow-pictogram style on your own batch. |

## Quick-look slots

The 14 slots:

```
{{brand_name}}           — in-universe agency (optional, default "Compliance Bureau")
{{subject_warning}}      — entity being un-trusted (e.g. "your dog")
{{subject_warning_id}}   — short alphanumeric code in red hook card (e.g. "9-D")
{{bulletin_id}}          — spoken form (e.g. "nine D")
{{tell_1}}, {{tell_2}}, {{tell_3}}        — three IF tells
{{do_not_1}}, {{do_not_2}}, {{do_not_3}}  — three DO-NOT instructions
{{but_reveal}}           — dread payoff (e.g. "your dog died three years ago")
{{and_sting}}            — final sting (e.g. "tonight it stops pretending")
{{vo_voice_id}}          — ElevenLabs voice (default Alerter / fallback Ava)
{{target_language}}      — VO language (en, ru, ...)
{{target_audience}}      — distribution intent (optional)
```

## Hard rules (re-read before iterating — every rule below cost money in the source project)

1. Lock the icon style on ONE prototype before generating the other 9. Pass `--ref` from FIRST shot.
2. Sequential bash loop for image batches. NEVER `ralphy queue`.
3. Chroma-key icons to alpha via two-pass ffmpeg colorkey BEFORE Remotion composition.
4. ALL CAPS input to ElevenLabs for monotone PSA cadence. Verify voice exists before bulk gen.
5. Loudnorm AFTER all VOs are final, never during regen loop.
6. 4 climax growl variants LAYERED at staggered offsets. Single growl = chihuahua yipping.
7. Render at CRF 30 + `-tune grain` (`ralphy video optimize`), NOT default CRF 18.
