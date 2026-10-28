# Intake: remix path (explicit pointer only)

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Remix path (explicit pointer only)

Fires ONLY when the user points at one specific video and asks to reproduce it: `@template:<slug>`, "remix this one", "make the exact same video but replace X with Y", or names a template slug.

1. **Load the template** — `ralphy template use <slug> --project <id> --brief "<the swap>"`.
2. **Frame-study the source BEFORE drafting any prompt.** Pull the source video and slice it at 0.1-0.2s through every key beat (hook, reveal, reaction, CTA), then READ the frames to lock three things:
   - (a) realism register — still-photo / TV-commercial / illustration / CGI-specimen / X-ray / etc. (see issue 017 for the register axis);
   - (b) character eye / mouth / motion-design specifics — pupil size, lip aperture, head tilt, blink cadence;
   - (c) motion pacing — cut frequency, hold duration, intra-shot camera move.
   Canonical verbs: `ralphy ref pull <url-or-slug>` to fetch the source mp4, then `ralphy ref frames <slug> --fps 5-10` (or `--fps 10` ≈ every 0.1s) to drop the JPEGs under `.ralphy/references/<slug>/frames/`. For fast-cut commercials, `ralphy ref analyze-video <slug>` complements the visual read with precise shot-cut detection. Record the locked register as a `guideline:` in the project before generating. **Frame-study costs ~$0 + ~2 min; register mismatch costs $0.50-$3 per regen wave.** Origin: `ralphy-vs-higgsfield-001` — two biggest regen clusters (monster face, den realism) both traced to skipping this step on turn 1.
3. **Run intake only on the deltas the swap introduces** — e.g. if the swap names a real entity, the reference-required gate (invariant #3) may now fire; if it changes target language, re-confirm the audio pipeline. Everything the template already encodes is kept.
4. **Generate through the normal pipeline.** The output is a near-copy of the source video with the requested element swapped. HyperFrames composition edge-cases (multi-scene gating, snapshot quirks) are covered in issue 047.

Do not pre-stage `ralphy template use` for a generic brief that merely *resembles* a template. The pointer must be explicit.
